const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
Object.assign(process.env,{NODE_ENV:'test',FRONTEND_URL:'http://localhost:5173',GOOGLE_CONTACTS_CLIENT_ID:'contacts-test-client',
  GOOGLE_CONTACTS_CLIENT_SECRET:'contacts-test-secret',CONTACTS_TOKEN_KEY:crypto.randomBytes(32).toString('hex'),
  GOOGLE_CONTACTS_REDIRECT_URI:'http://localhost:5173/api/contacts/google/callback',MAIL_FROM:'',MAIL_ADMIN:'',SMTP_HOST:'',MAIL_USER:''});
const google=require('../src/contacts/google');
const realFetch=global.fetch,people=new Map(),groups=new Map(),calls=[];
let db,server,base,cookie,oauthCookie,state,actualTick,services=[],courses=[],alice,bob,archived;
let account='owner@example.test',revoked=false,missingScope=false,quota=false,lostGroup=false,lostEmail='',lostBefore=false,hideEmail='',etagRace=false,created=0,groupCreated=0;
const json=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json',...headers}});
function contact(email,name,id){
  return {resourceName:id||'people/contact-'+(++created),etag:'1',names:[{givenName:name}],emailAddresses:[{value:email,metadata:{primary:true}}],
    metadata:{sources:[{type:'CONTACT',id:String(created),etag:'1'}]},memberships:[{contactGroupMembership:{contactGroupResourceName:'contactGroups/myContacts'}}]};
}
function page(items,url,key){const offset=Number(url.searchParams.get('pageToken')||0);return json({[key]:items.slice(offset,offset+2),...(offset+2<items.length?{nextPageToken:String(offset+2)}:{})});}
global.fetch=async(url,options={})=>{
  const u=new URL(url);if(u.hostname==='localhost')return realFetch(url,options);
  if(u.hostname==='oauth2.googleapis.com'){
    if(revoked)return json({error:'invalid_grant'},400);
    return json({access_token:'contacts-access',refresh_token:'contacts-refresh-secret',scope:missingScope?'https://www.googleapis.com/auth/userinfo.email':google.SCOPES.join(' ')});
  }
  if(u.pathname==='/oauth2/v2/userinfo')return json({email:account,verified_email:true});
  assert.equal(u.hostname,'people.googleapis.com','Unexpected external request');
  assert.equal(options.headers.Authorization,'Bearer contacts-access');
  const method=options.method||'GET',body=options.body&&JSON.parse(options.body),path=u.pathname.slice(3);
  calls.push({path,method,body});
  if(quota){quota=false;return json({error:{status:'RESOURCE_EXHAUSTED'}},429,{'retry-after':'60'});}
  if(path==='/contactGroups'&&method==='GET')return page([...groups.values()],u,'contactGroups');
  if(path==='/contactGroups'&&method==='POST'){
    if([...groups.values()].some(g=>g.name===body.contactGroup.name))return json({},409);
    const group={...body.contactGroup,etag:'group-etag',resourceName:'contactGroups/group-'+(++groupCreated),groupType:'USER_CONTACT_GROUP'};groups.set(group.resourceName,group);
    if(lostGroup){lostGroup=false;throw Error('Lost group response');}return json(group);
  }
  if(path.startsWith('/contactGroups/')&&method==='PUT'){
    const group=groups.get(path.slice(1));assert.ok(group);assert.equal(body.updateGroupFields,'name');assert.equal(body.contactGroup.etag,group.etag);
    group.name=body.contactGroup.name;return json(group);
  }
  if(path==='/people/me/connections')return page([...people.values()].filter(p=>!p.emailAddresses.some(e=>e.value===hideEmail)),u,'connections');
  if(path==='/people:createContact'){
    const email=body.emailAddresses[0].value;
    if(email===lostEmail&&lostBefore){lostEmail='';throw Error('Lost before acceptance');}
    const person={...contact(email,body.names[0].givenName),clientData:body.clientData};people.set(person.resourceName,person);
    if(email===lostEmail){lostEmail='';throw Error('Lost accepted response');}return json(person);
  }
  if(path.endsWith('/members:modify')){
    const id=path.slice(1,-15); // Drop leading slash and /members:modify.
    assert.ok(groups.has(id)||id==='contactGroups/myContacts',id);
    for(const resource of [...(body.resourceNamesToAdd||[]),...(body.resourceNamesToRemove||[])]){
      const person=people.get(resource);if(!person)return json({notFoundResourceNames:[resource]});
      if(body.resourceNamesToRemove?.includes(resource)&&person.memberships.length===1&&person.memberships[0].contactGroupMembership.contactGroupResourceName===id)return json({canNotRemoveLastContactGroupResourceNames:[resource]});
      person.memberships=person.memberships.filter(m=>m.contactGroupMembership.contactGroupResourceName!==id);
      if(body.resourceNamesToAdd?.includes(resource))person.memberships.push({contactGroupMembership:{contactGroupResourceName:id}});
    }
    return json({});
  }
  if(path.endsWith(':updateContact')){
    const id=path.slice(1,-14),person=people.get(id);assert.ok(person,id);
    assert.equal(u.searchParams.get('updatePersonFields'),'names');assert.ok(body.metadata.sources[0].etag);
    if(etagRace){etagRace=false;person.metadata.sources[0].etag='raced';return json({error:{errors:[{reason:'failedPrecondition'}]}},400);}
    assert.equal(body.metadata.sources[0].etag,person.metadata.sources[0].etag);
    person.names=body.names;person.metadata.sources[0].etag+='1';return json(person);
  }
  if(path.startsWith('/people/')&&method==='GET')return people.has(path.slice(1))?json(people.get(path.slice(1))):json({},404);
  throw Error('Unexpected People API operation: '+method+' '+path);
};
async function req(path,method='GET',body,auth=true){
  const r=await fetch(base+'/api'+path,{method,headers:{'Content-Type':'application/json',...(auth?{cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  return {status:r.status,data:await r.json(),headers:r.headers};
}
const status=async()=> (await req('/admin/contacts-sync')).data;
async function begin(){const r=await req('/admin/contacts-sync/connect','POST',{});assert.equal(r.status,200);const url=new URL(r.data.url);state=url.searchParams.get('state');oauthCookie=r.headers.get('set-cookie').split(';')[0];return url;}
const callback=async(browser=oauthCookie,extra='')=>fetch(base+'/api/contacts/google/callback?state='+state+'&code=contacts-code'+extra,{headers:{cookie:browser},redirect:'manual'});
async function due(audit=false){await db.query('UPDATE contacts_connection SET next_attempt_at=now()'+(audit?',audit_at=now()':''));await db.query('UPDATE contacts_people SET next_attempt_at=now()');}
async function run(audit=false){await due(audit);await actualTick();}
const find=email=>[...people.values()].find(p=>p.emailAddresses.some(e=>e.value===email));
const members=name=>{const group=[...groups.values()].find(g=>g.name===name);return [...people.values()].filter(p=>p.memberships.some(m=>m.contactGroupMembership.contactGroupResourceName===group?.resourceName)).map(p=>p.emailAddresses.find(e=>e.metadata?.primary)?.value||p.emailAddresses[0].value).sort();};
async function settings(courseIds=[],include=false,mode='courses'){
  const r=await req('/admin/contacts-sync/settings','PUT',{campaignMode:mode,includeCancelled:include,campaignCourses:courseIds});assert.equal(r.status,202,JSON.stringify(r.data));await run();
}
async function book(name,email,index=0){return(await req('/admin/bookings','POST',{courseId:courses[index].id,customerName:name,customerEmail:email,seats:1})).data.booking;}
before(async()=>{
  db=await require('./database.cjs')();await require('../src/migrate')();
  const sync=require('../src/contacts/sync');actualTick=sync.tick;sync.tick=async()=>{};
  await db.query('INSERT INTO admins(email,password_hash) VALUES($1,$2)',['contacts@example.test',await require('../src/domain/auth').passwordHash('Contacts-test-password!')]);
  server=require('../src/index').listen(0);await new Promise(resolve=>server.on('listening',resolve));base='http://localhost:'+server.address().port;
  cookie=(await req('/auth/login','POST',{email:'contacts@example.test',password:'Contacts-test-password!'},false)).headers.get('set-cookie').split(';')[0];
  for(const [index,category] of ['Bonbon','Táblás','Archív'].entries()){
    services.push((await req('/admin/services','POST',{title:'Contacts '+category,category,duration_minutes:60,session_count:index===0?2:1,price:1000,capacity:100})).data);
    const start=n=>new Date(Date.now()+(400+index*10+n)*86400000).toISOString();
    courses.push((await req('/admin/courses','POST',{service_id:services[index].id,sessions:Array.from({length:index===0?2:1},(_,n)=>({start_time:start(n)}))})).data);
  }
  alice=await book('Alice app','alice@example.test');await book('Alice app','alice@example.test',1);bob=await book('Bob','bob@example.test',1);
  const carol=await book('Carol','carol@example.test');await req('/admin/bookings/'+carol.id,'PATCH',{status:'cancelled'});
  archived=await book('Dana','dana@example.test',2);await req('/admin/bookings/'+archived.id,'PATCH',{status:'cancelled'});
  await req('/admin/bookings/'+archived.id,'DELETE');await req('/admin/courses/'+courses[2].id,'DELETE');await db.query('DELETE FROM services WHERE id=$1',[services[2].id]);
  await db.query("UPDATE bookings SET admin_note='internal-note-secret' WHERE id=$1",[alice.id]);
  const imported=contact('alice@example.test','Google Alice','people/imported');imported.phoneNumbers=[{value:'+361234567'}];people.set(imported.resourceName,imported);
  const unrelated=contact('private@example.test','Private Contact','people/private');people.set(unrelated.resourceName,unrelated);
});
after(async()=>{global.fetch=realFetch;if(server)await new Promise(resolve=>server.close(resolve));await db?.end();});

test('admin protection, origin checks and settings validation apply before any Google write',async()=>{
  for(const path of ['/admin/contacts-sync','/admin/contacts-sync/connect','/admin/contacts-sync/retry-create'])assert.equal((await req(path,path.endsWith('sync')?'GET':'POST',undefined,false)).status,401);
  assert.equal((await fetch(base+'/api/admin/contacts-sync/connect',{method:'POST',headers:{cookie,Origin:'https://foreign.test'}})).status,403);
  assert.equal((await req('/admin/contacts-sync/settings','PUT',{includeCancelled:false,campaignMode:'courses',campaignCourses:[]})).status,400);
  assert.equal((await req('/admin/contacts-sync/settings','PUT',{includeCancelled:'yes',campaignMode:'all',campaignCourses:[]})).status,400);
  assert.equal(calls.length,0);
  const key=process.env.CONTACTS_TOKEN_KEY,old=process.env.CALENDAR_TOKEN_KEY;delete process.env.CONTACTS_TOKEN_KEY;delete process.env.CALENDAR_TOKEN_KEY;
  assert.equal((await status()).configured,false);assert.equal((await req('/admin/contacts-sync/connect','POST',{})).status,503);
  process.env.CONTACTS_TOKEN_KEY=key;if(old)process.env.CALENDAR_TOKEN_KEY=old;
});
test('course preview uses service IDs and names, deduplicates multiple dates, and retains deleted courses',async()=>{
  await db.query('UPDATE services SET category=$2 WHERE id=$1',[services[1].id,services[0].category]);
  const one=await req('/admin/contacts-sync/preview','POST',{includeCancelled:false,campaignMode:'courses',campaignCourses:[services[0].id]});
  assert.deepEqual(one.data.people.map(p=>p.email),['alice@example.test']);
  const uppercase=await req('/admin/contacts-sync/preview','POST',{includeCancelled:false,campaignMode:'courses',campaignCourses:[services[0].id.toUpperCase()]});
  assert.deepEqual(uppercase.data,one.data);
  const preview=await req('/admin/contacts-sync/preview','POST',{includeCancelled:false,campaignMode:'courses',campaignCourses:[services[0].id,services[1].id]});
  assert.equal(preview.data.count,2);assert.deepEqual(preview.data.people.map(p=>p.email),['alice@example.test','bob@example.test']);
  const cancelled=await req('/admin/contacts-sync/preview','POST',{includeCancelled:true,campaignMode:'courses',campaignCourses:[services[2].id]});
  assert.deepEqual(cancelled.data.people.map(p=>p.email),['dana@example.test']);
  assert.equal((await db.query('SELECT category FROM customer_booking_archive WHERE booking_id=$1',[archived.id])).rows[0].category,'Archív');
  const options=(await status()).courses;
  assert.equal(options.find(c=>c.value===services[0].id).label,'Contacts Bonbon');
  assert.equal(options.find(c=>c.value===services[2].id).label,'Contacts Archív (archivált kurzus)');
  assert.ok(!options.some(c=>c.label==='Bonbon'||c.label==='Táblás'));
});
test('OAuth is browser/session bound, one-use, PKCE protected, encrypted and separate from Calendar',async()=>{
  const calendarBefore=(await db.query('SELECT * FROM calendar_connection')).rows;
  let url=await begin();assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.equal(url.searchParams.get('access_type'),'offline');
  assert.deepEqual(url.searchParams.get('scope').split(' '),google.SCOPES);
  assert.ok((await callback('')).headers.get('location').endsWith('expired'));
  assert.ok((await callback(oauthCookie,'&error=access_denied')).headers.get('location').endsWith('denied'));
  assert.ok((await callback()).headers.get('location').endsWith('expired'));
  await begin();missingScope=true;assert.ok((await callback()).headers.get('location').endsWith('permissions'));missingScope=false;
  await begin();assert.ok((await callback()).headers.get('location').endsWith('connected'));
  const connection=(await db.query('SELECT * FROM contacts_connection')).rows[0];
  assert.notEqual(connection.refresh_token,'contacts-refresh-secret');assert.equal(google.decrypt(connection.refresh_token),'contacts-refresh-secret');
  assert.ok(!JSON.stringify(await status()).includes('contacts-refresh-secret'));
  assert.deepEqual((await db.query('SELECT * FROM calendar_connection')).rows,calendarBefore);
});
test('lost label creation recovers, imported contacts match by email, personal data stays intact and writes are idempotent',async()=>{
  lostGroup=true;await run();assert.ok((await status()).error);assert.equal(groups.size,1);
  const personalBefore=structuredClone(people.get('people/private'));
  await run();const s=await status();assert.equal(s.pending,0,JSON.stringify(s));assert.equal(s.synced,2);assert.equal(created,1);
  assert.equal(find('alice@example.test').resourceName,'people/imported');assert.equal(find('alice@example.test').names[0].givenName,'Google Alice');
  assert.equal(find('alice@example.test').phoneNumbers[0].value,'+361234567');assert.deepEqual(people.get('people/private'),personalBefore);
  assert.deepEqual(members('ChocoLeaf – összes ügyfél'),['alice@example.test','bob@example.test']);
  assert.deepEqual(members('ChocoLeaf – kurzus: Contacts Bonbon'),['alice@example.test']);
  assert.deepEqual(members('ChocoLeaf – aktuális körlevél'),['alice@example.test','bob@example.test']);
  assert.ok(!JSON.stringify(calls.map(c=>c.body)).includes('internal-note-secret'));
  const count=calls.length;await run();assert.equal(calls.length,count);assert.equal(created,1);
});
test('saved course unions replace campaign membership and do not multiply addresses',async()=>{
  await settings([services[0].id]);assert.deepEqual(members('ChocoLeaf – aktuális körlevél'),['alice@example.test']);
  await settings([services[0].id,services[1].id]);assert.deepEqual(members('ChocoLeaf – aktuális körlevél'),['alice@example.test','bob@example.test']);
});
test('renaming a course updates its Google label while preserving selection, membership and the label resource ID',async()=>{
  const label=[...groups.values()].find(g=>g.name==='ChocoLeaf – kurzus: Contacts Bonbon'),id=label.resourceName;
  const before=groupCreated;
  await db.query("UPDATE services SET title='Átnevezett kurzus' WHERE id=$1",[services[0].id]);await run();
  assert.equal(groups.get(id).name,'ChocoLeaf – kurzus: Átnevezett kurzus');assert.equal(groupCreated,before);
  assert.deepEqual(members('ChocoLeaf – kurzus: Átnevezett kurzus'),['alice@example.test']);
  assert.deepEqual(members('ChocoLeaf – aktuális körlevél'),['alice@example.test','bob@example.test']);
  await db.query("UPDATE services SET title='Contacts Bonbon' WHERE id=$1",[services[0].id]);await run();
  assert.equal(groups.get(id).name,'ChocoLeaf – kurzus: Contacts Bonbon');
});
test('retired category labels are emptied, remain separate from personal labels and are not recreated when deleted',async()=>{
  const marker=(await db.query('SELECT marker FROM contacts_connection')).rows[0].marker;
  const group={resourceName:'contactGroups/old-category',name:'ChocoLeaf – kategória: Régi',clientData:[{key:'chocoleafGroup',value:marker+':category:old'}]};
  groups.set(group.resourceName,group);
  await db.query('INSERT INTO contacts_groups(key,name,resource_name,active,synced_name) VALUES($1,$2,$3,false,$2)',['category:old',group.name,group.resourceName]);
  find('alice@example.test').memberships.push({contactGroupMembership:{contactGroupResourceName:group.resourceName}});
  await run(true);assert.deepEqual(members(group.name),[]);assert.ok(groups.has(group.resourceName));
  groups.delete(group.resourceName);const before=groupCreated;await run(true);assert.equal(groupCreated,before);
});
test('new customer sync and name updates preserve other fields and recover from an etag race',async()=>{
  await book('Eve','eve@example.test');await run();assert.ok(find('eve@example.test'));assert.equal(created,2);
  const profile={original_email:'eve@example.test',email:'eve@example.test',name:'Eve Updated',phone:'+36300000000',note:'Never sync this note'};
  assert.equal((await req('/admin/customers','PUT',profile)).status,200);
  etagRace=true;await run();assert.equal((await status()).failed,1);
  await run();assert.equal(find('eve@example.test').names[0].givenName,'Eve Updated');assert.equal((await status()).failed,0);
  assert.ok(!JSON.stringify(find('eve@example.test')).includes('Never sync this note'));assert.ok(!find('eve@example.test').phoneNumbers);
});
test('cancellation removes managed labels without deleting contacts or unrelated memberships; cancelled archive inclusion is optional',async()=>{
  const person=find('bob@example.test');person.memberships.push({contactGroupMembership:{contactGroupResourceName:'contactGroups/friends'}});
  await req('/admin/bookings/'+bob.id,'PATCH',{status:'cancelled'});await run();
  assert.ok(find('bob@example.test'));assert.ok(!members('ChocoLeaf – összes ügyfél').includes('bob@example.test'));
  assert.ok(person.memberships.some(m=>m.contactGroupMembership.contactGroupResourceName==='contactGroups/friends'));
  await settings([],true,'all');assert.equal((await status()).campaignCount,5);
  assert.deepEqual(members('ChocoLeaf – kurzus: Contacts Archív'),['dana@example.test']);
});
test('duplicate contacts and non-primary email matches are surfaced instead of creating or modifying arbitrary contacts',async()=>{
  await book('Frank','frank@example.test');
  people.set('people/duplicate-a',contact('frank@example.test','Frank A','people/duplicate-a'));people.set('people/duplicate-b',contact('frank@example.test','Frank B','people/duplicate-b'));
  const count=created;await run();assert.ok((await status()).issues.find(i=>i.email==='frank@example.test').error.includes('Több'));
  assert.equal(created,count);people.delete('people/duplicate-b');await run();assert.equal((await status()).failed,0);
  await book('Greg','greg@example.test');const greg=contact('different@example.test','Greg personal','people/greg');greg.emailAddresses.push({value:'greg@example.test'});people.set(greg.resourceName,greg);
  await run();assert.ok((await status()).issues.find(i=>i.email==='greg@example.test').error.includes('alapértelmezett'));
  greg.emailAddresses[0].metadata.primary=false;greg.emailAddresses[1].metadata={primary:true};await run();assert.equal((await status()).failed,0);
});
test('an accepted contact with a lost response is recovered after delayed visibility and worker restart without duplicate creation',async()=>{
  await book('Helen','helen@example.test');lostEmail='helen@example.test';hideEmail=lostEmail;lostBefore=false;
  await run();const count=created;assert.ok(find('helen@example.test'));assert.ok((await status()).issues.find(i=>i.email==='helen@example.test').uncertainSince);
  await run();assert.equal(created,count);
  delete require.cache[require.resolve('../src/contacts/sync')];const restarted=require('../src/contacts/sync').tick;
  hideEmail='';await due();await restarted();assert.equal(created,count);assert.equal((await status()).failed,0);
});
test('a request that never reached Google stays uncertain until an explicit checked retry',async()=>{
  await book('Ian','ian@example.test');lostEmail='ian@example.test';lostBefore=true;await run();assert.ok(!find('ian@example.test'));
  await run();assert.ok(!find('ian@example.test'));
  assert.equal((await req('/admin/contacts-sync/retry-create','POST',{email:'ian@example.test'})).status,400);
  assert.equal((await req('/admin/contacts-sync/retry-create','POST',{email:'ian@example.test',confirm:true})).status,200);
  lostBefore=false;await run();assert.ok(find('ian@example.test'));assert.equal((await status()).failed,0);
});
test('quota backoff honors Retry-After and revoked credentials pause sync until reconnect',async()=>{
  await book('Jane','jane@example.test');quota=true;await run();let c=(await db.query('SELECT * FROM contacts_connection')).rows[0];
  assert.ok(c.last_error);assert.ok(new Date(c.next_attempt_at)>new Date(Date.now()+55000));
  const callsBefore=calls.length;await actualTick();assert.equal(calls.length,callsBefore);await run();assert.ok(find('jane@example.test'));
  revoked=true;await run(true);assert.equal((await status()).needsAuth,true);
  const count=created;revoked=false;await begin();assert.ok((await callback()).headers.get('location').endsWith('connected'));await run();assert.equal(created,count);assert.equal((await status()).needsAuth,false);
});
test('an existing unowned label is never taken over; deleted managed labels are recreated and repopulated',async()=>{
  await db.query("UPDATE services SET title='Ütköző' WHERE id=$1",[services[0].id]);
  groups.set('contactGroups/foreign',{resourceName:'contactGroups/foreign',name:'ChocoLeaf – kurzus: Ütköző',groupType:'USER_CONTACT_GROUP'});
  await run();assert.ok((await status()).error.includes('címke'));assert.ok(!groups.get('contactGroups/foreign').clientData);
  groups.get('contactGroups/foreign').name='Saját címke';await run();assert.equal((await status()).error,null);
  const all=[...groups.values()].find(g=>g.name==='ChocoLeaf – összes ügyfél');groups.delete(all.resourceName);
  for(const person of people.values())person.memberships=person.memberships.filter(m=>m.contactGroupMembership.contactGroupResourceName!==all.resourceName);
  await run(true);assert.equal((await status()).pending,0);assert.ok(members('ChocoLeaf – összes ügyfél').length>0);
});
test('deleted contact recreation that loses its request remains recoverable through explicit retry',async()=>{
  people.delete(find('eve@example.test').resourceName);lostEmail='eve@example.test';lostBefore=true;
  await run(true);const row=(await db.query("SELECT * FROM contacts_people WHERE email='eve@example.test'")).rows[0];
  assert.equal(row.resource_name,null);assert.ok(row.uncertain_since);
  assert.equal((await req('/admin/contacts-sync/retry-create','POST',{email:'eve@example.test',confirm:true})).status,200);
  lostBefore=false;await run();assert.ok(find('eve@example.test'));assert.equal((await status()).failed,0);
});
test('changed primary addresses are removed from mailing groups until corrected and last-membership removal keeps the contact',async()=>{
  const person=find('alice@example.test');
  person.emailAddresses=[{value:'wrong-recipient@example.test',metadata:{primary:true}},{value:'alice@example.test'}];
  await run(true);assert.ok((await status()).issues.some(i=>i.email==='alice@example.test'));
  assert.ok(!members('ChocoLeaf – összes ügyfél').includes('wrong-recipient@example.test'));
  person.emailAddresses=[{value:'alice@example.test',metadata:{primary:true}}];await run();assert.equal((await status()).failed,0);
  const eve=find('eve@example.test');eve.memberships=eve.memberships.filter(m=>m.contactGroupMembership.contactGroupResourceName!=='contactGroups/myContacts');
  await db.query("UPDATE bookings SET status='cancelled' WHERE customer_email='eve@example.test'");
  await settings([],false,'all');assert.ok(find('eve@example.test'));
  assert.deepEqual(eve.memberships,[{contactGroupMembership:{contactGroupResourceName:'contactGroups/myContacts'}}]);
});
test('changing desired data back to a previous value clears stale failed jobs',async()=>{
  const profile={original_email:'jane@example.test',email:'jane@example.test',name:'Jane Changed',phone:''};
  await req('/admin/customers','PUT',profile);etagRace=true;await run();assert.ok((await status()).issues.some(i=>i.email==='jane@example.test'));
  await req('/admin/customers','PUT',{...profile,name:'Jane'});await run();assert.equal((await status()).failed,0);
});
test('different account requires disconnect; disconnect clears credentials and prevents writes',async()=>{
  account='other@example.test';await begin();assert.ok((await callback()).headers.get('location').endsWith('different_account'));
  assert.equal((await status()).accountEmail,'owner@example.test');account='owner@example.test';
  assert.equal((await req('/admin/contacts-sync/disconnect','POST',{})).status,200);
  assert.equal((await db.query('SELECT refresh_token FROM contacts_connection')).rows[0].refresh_token,null);
  const count=calls.length;await run();assert.equal(calls.length,count);assert.equal((await req('/admin/contacts-sync/sync','POST',{})).status,409);
  const rows=(await db.query('SELECT * FROM contacts_people')).rows;await require('../src/migrate')();assert.deepEqual((await db.query('SELECT * FROM contacts_people')).rows,rows);
  account='other@example.test';await begin();assert.ok((await callback()).headers.get('location').endsWith('connected'));
  assert.equal((await db.query('SELECT count(*)::int AS n FROM contacts_people')).rows[0].n,0);
  assert.equal((await status()).accountEmail,account);
});
