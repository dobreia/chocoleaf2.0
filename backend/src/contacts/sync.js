const pool=require('../db');
const google=require('./google');
const {digest,reconcile}=require('./model');
const {fail}=require('../domain/rules');
const LOCK=829109;
const marker=(connection,email)=>connection.marker+':'+digest(email);
const groupMarker=(connection,key)=>connection.marker+':'+key;
async function locked(fn,{skip=false}={}){
  const db=await pool.connect();let acquired=false;
  try{
    acquired=(await db.query('SELECT pg_try_advisory_lock($1) AS acquired',[LOCK])).rows[0].acquired;
    if(!acquired){if(skip)return;fail('A névjegyek éppen frissülnek. Próbáld újra néhány másodperc múlva.',409);}
    return await fn(db);
  }finally{try{if(acquired)await db.query('SELECT pg_advisory_unlock($1)',[LOCK]);}finally{db.release();}}
}
async function listAll(access,path,key){
  const result=[];let page;
  do{
    const data=await google.api(access,path+(page?'&pageToken='+encodeURIComponent(page):''));
    if(!Array.isArray(data[key]||[]))throw new google.GoogleError(503,'invalid_response');
    result.push(...(data[key]||[]));page=data.nextPageToken;
  }while(page);
  return result;
}
async function ensureGroups(db,connection,access){
  const remote=await listAll(access,'/contactGroups?pageSize=1000&groupFields=name,clientData,groupType','contactGroups');
  const groups=(await db.query('SELECT * FROM contacts_groups ORDER BY key')).rows;
  for(const group of groups){
    let found=remote.find(g=>g.clientData?.some(d=>d.key==='chocoleafGroup'&&d.value===groupMarker(connection,group.key)));
    if(!group.active){
      group.resource_name=found?.resourceName||null;
      await db.query('UPDATE contacts_groups SET resource_name=$2 WHERE key=$1',[group.key,group.resource_name]);
      continue;
    }
    if(!found){
      if(remote.some(g=>g.name===group.name))throw new google.GoogleError(409,'group_collision');
      found=await google.api(access,'/contactGroups','POST',{contactGroup:{name:group.name,
        clientData:[{key:'chocoleafGroup',value:groupMarker(connection,group.key)}]},readGroupFields:'name,clientData,groupType'});
      remote.push(found);
    }
    if(found.name!==group.name){
      if(remote.some(g=>g.resourceName!==found.resourceName&&g.name===group.name))throw new google.GoogleError(409,'group_collision');
      found=await google.api(access,'/'+found.resourceName,'PUT',{contactGroup:{resourceName:found.resourceName,etag:found.etag,name:group.name},updateGroupFields:'name',readGroupFields:'name,clientData,groupType'});
    }
    if(!/^contactGroups\/[a-zA-Z0-9_-]+$/.test(found.resourceName||''))throw new google.GoogleError(503,'invalid_response');
    group.resource_name=found.resourceName;
    await db.query('UPDATE contacts_groups SET resource_name=$2,synced_name=$3 WHERE key=$1',[group.key,group.resource_name,found.name]);
  }
  return groups.filter(g=>g.resource_name);
}
async function personById(access,id){
  try{return await google.api(access,'/'+id+'?personFields='+google.FIELDS+'&sources=READ_SOURCE_TYPE_CONTACT');}
  catch(e){if([404,410].includes(e.statusCode))return null;throw e;}
}
function checkPerson(person,email){
  if(!/^people\/[a-zA-Z0-9_-]+$/.test(person?.resourceName||''))throw new google.GoogleError(503,'invalid_response');
  const emails=person.emailAddresses||[];
  const primary=emails.find(e=>e.metadata?.primary)||emails[0];
  if(primary?.value?.trim().toLowerCase()!==email)throw new google.GoogleError(409,'primary');
}
async function syncMemberships(access,groups,person,wantedKeys){
  const memberships=new Set((person.memberships||[]).map(m=>m.contactGroupMembership?.contactGroupResourceName));
  const managed=new Set(groups.map(g=>g.resource_name));
  const modify=async(group,wanted)=>{
    const response=await google.api(access,'/'+group+'/members:modify','POST',{
      [wanted?'resourceNamesToAdd':'resourceNamesToRemove']:[person.resourceName]
    });
    if(response.notFoundResourceNames?.length||response.canNotRemoveLastContactGroupResourceNames?.length)throw new google.GoogleError(409,'membership');
  };
  // Keep the contact in My Contacts if removing its last application-owned label.
  if(!wantedKeys.length&&memberships.size&&[...memberships].every(id=>managed.has(id)))await modify('contactGroups/myContacts',true);
  // Add before removing so a contact never loses its last remaining membership.
  for(const wanted of [true,false])for(const group of groups){
    if(wantedKeys.includes(group.key)!==wanted||memberships.has(group.resource_name)===wanted)continue;
    await modify(group.resource_name,wanted);
  }
}
async function writePerson(db,connection,access,groups,row,directory){
  const ownMarker=marker(connection,row.email);
  let person=row.resource_name?await personById(access,row.resource_name):null;
  if(person?.metadata?.deleted)person=null;
  if(!person&&row.resource_name){await db.query('UPDATE contacts_people SET resource_name=NULL WHERE email=$1',[row.email]);row.resource_name=null;}
  if(!person&&row.desired){
    const owned=directory.filter(p=>p.clientData?.some(d=>d.key==='chocoleafCustomer'&&d.value===ownMarker));
    const matches=owned.length?owned:directory.filter(p=>p.emailAddresses?.some(e=>e.value?.trim().toLowerCase()===row.email));
    if(matches.length>1)throw new google.GoogleError(409,'duplicate');
    person=matches[0]||null;
    if(!person){
      if(row.uncertain_since)throw new google.GoogleError(503,'uncertain');
      // Commit the uncertain state BEFORE the external write. Even a process crash
      // after Google accepts the request must not cause a second blind creation.
      await db.query('UPDATE contacts_people SET uncertain_since=now() WHERE email=$1',[row.email]);
      try{
        person=await google.api(access,'/people:createContact?personFields='+google.FIELDS,'POST',{
          names:[{givenName:row.desired.name}],emailAddresses:[{value:row.email}],
          memberships:[{contactGroupMembership:{contactGroupResourceName:'contactGroups/myContacts'}}],
          clientData:[{key:'chocoleafCustomer',value:ownMarker}]
        });
        checkPerson(person,row.email);directory.push(person);
      }catch(e){
        if(e.statusCode>=400&&e.statusCode<500)await db.query('UPDATE contacts_people SET uncertain_since=NULL WHERE email=$1',[row.email]);
        else throw new google.GoogleError(e.statusCode||503,'uncertain',e.retryAfter);
        throw e;
      }
    }
  }
  if(person){
    try{checkPerson(person,row.email);}catch(e){
      if(e.reason==='primary')await syncMemberships(access,groups,person,[]);
      throw e;
    }
    await db.query('UPDATE contacts_people SET resource_name=$2,uncertain_since=NULL WHERE email=$1',[row.email,person.resourceName]);
    const owned=person.clientData?.some(d=>d.key==='chocoleafCustomer'&&d.value===ownMarker);
    if(row.desired&&owned&&person.names?.[0]?.givenName!==row.desired.name){
      person=await google.api(access,'/'+person.resourceName+':updateContact?updatePersonFields=names&personFields='+google.FIELDS,'PATCH',{
        resourceName:person.resourceName,etag:person.etag,metadata:person.metadata,names:[{givenName:row.desired.name}]
      });
    }
    await syncMemberships(access,groups,person,row.desired?.groups||[]);
  }
  await db.query(`UPDATE contacts_people SET synced_hash=$2,synced_at=now(),attempts=0,last_error=NULL,
    uncertain_since=NULL WHERE email=$1`,[row.email,row.desired_hash]);
}
const delay=(attempts,e)=>Math.max(e.retryAfter||0,Math.min(3600,30*2**Math.min(attempts,7)));
let running=false;
async function tick(){
  if(running||!google.config().ready)return;running=true;
  try{await locked(async db=>{
    const connection=(await db.query('SELECT * FROM contacts_connection WHERE id=1')).rows[0];
    if(!connection?.enabled||connection.needs_auth||!connection.refresh_token||new Date(connection.next_attempt_at)>new Date())return;
    try{
      await reconcile(db,connection);
      if(new Date(connection.audit_at)<=new Date()){
        await db.query('UPDATE contacts_people SET synced_hash=NULL,next_attempt_at=now()');
        await db.query("UPDATE contacts_connection SET audit_at=now()+interval '6 hours' WHERE id=1");
      }
      const jobs=(await db.query(`SELECT * FROM contacts_people WHERE next_attempt_at<=now()
        AND synced_hash IS DISTINCT FROM desired_hash ORDER BY attempts,next_attempt_at,email LIMIT 20`)).rows;
      const groupPending=(await db.query('SELECT count(*)::int AS n FROM contacts_groups WHERE active AND (resource_name IS NULL OR synced_name IS DISTINCT FROM name)')).rows[0].n;
      if(jobs.length||groupPending){
        let refresh;try{refresh=google.decrypt(connection.refresh_token);}catch{throw new google.GoogleError(401,'invalid_grant');}
        const credentials=await google.token({grant_type:'refresh_token',refresh_token:refresh});
        if(!credentials.access_token)throw new google.GoogleError(401,'invalid_grant');
        if(credentials.refresh_token)await db.query('UPDATE contacts_connection SET refresh_token=$1 WHERE id=1',[google.encrypt(credentials.refresh_token)]);
        const access=credentials.access_token,groups=await ensureGroups(db,connection,access);
        const directory=jobs.some(j=>j.desired)?
          (await listAll(access,'/people/me/connections?pageSize=1000&personFields='+google.FIELDS+'&sources=READ_SOURCE_TYPE_CONTACT','connections')).filter(p=>!p.metadata?.deleted):[];
        const started=Date.now();
        for(const row of jobs){
          try{await writePerson(db,connection,access,groups,row,directory);}
          catch(e){
            await db.query(`UPDATE contacts_people SET attempts=attempts+1,last_error=$2,next_attempt_at=now()+($3*interval '1 second') WHERE email=$1`,[row.email,google.friendlyError(e),delay(row.attempts,e)]);
            if(google.authFailure(e)||[403,429].includes(e.statusCode)||(e.statusCode>=500&&e.reason!=='uncertain'))throw e;
          }
          if(Date.now()-started>20000)break;
        }
      }
      const pending=(await db.query('SELECT count(*)::int AS n FROM contacts_people WHERE synced_hash IS DISTINCT FROM desired_hash')).rows[0].n;
      await db.query(`UPDATE contacts_connection SET attempts=0,last_error=NULL,next_attempt_at=now()+interval '1 minute',
        last_synced_at=CASE WHEN $1=0 THEN now() ELSE last_synced_at END WHERE id=1`,[pending]);
    }catch(e){
      await db.query(`UPDATE contacts_connection SET attempts=attempts+1,last_error=$1,needs_auth=$2,
        next_attempt_at=now()+($3*interval '1 second') WHERE id=1`,[google.friendlyError(e),google.authFailure(e),delay(connection.attempts,e)]);
    }
  },{skip:true});}finally{running=false;}
}
function start(){const run=()=>tick().catch(()=>console.error('Contacts sync: database or configuration error'));run();const timer=setInterval(run,15000);timer.unref();return()=>clearInterval(timer);}
module.exports={locked,tick,start,marker,writePerson};
