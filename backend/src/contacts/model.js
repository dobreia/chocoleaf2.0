const crypto=require('node:crypto');
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const courseKey=id=>'course:'+id;
const courseName=title=>'ChocoLeaf – kurzus: '+title;
const GROUP_NAMES={all:'ChocoLeaf – összes ügyfél',campaign:'ChocoLeaf – aktuális körlevél'};
async function audience(db,settings){
  const history=(await db.query(`SELECT customer_email,customer_name,updated_at,booking_id,status,
    COALESCE(service_id,course_id)::text AS course_key,course_title
    FROM customer_booking_history ORDER BY updated_at DESC,booking_id`)).rows;
  const catalog=new Map((await db.query('SELECT id,title FROM services')).rows.map(s=>[s.id,{value:s.id,title:s.title,archived:false}]));
  for(const h of history)if(!catalog.has(h.course_key))catalog.set(h.course_key,{value:h.course_key,title:h.course_title,archived:true});
  const courses=[...catalog.values()].sort((a,b)=>a.title.localeCompare(b.title,'hu')||a.value.localeCompare(b.value));
  const people=new Map();
  for(const h of history){
    if(!people.has(h.customer_email))people.set(h.customer_email,{name:h.customer_name,email:h.customer_email,courses:new Set()});
    const person=people.get(h.customer_email);
    if(settings.include_cancelled||h.status!=='cancelled')person.courses.add(h.course_key);
  }
  const rows=[];
  for(const person of people.values()){
    if(!person.courses.size)continue;
    const groups=['all',...Array.from(person.courses).sort().map(courseKey)];
    if(settings.campaign_mode==='all'||[...person.courses].some(c=>(settings.campaign_courses||[]).includes(c)))groups.push('campaign');
    rows.push({name:person.name,email:person.email,groups});
  }
  rows.sort((a,b)=>a.email.localeCompare(b.email));
  return {people:rows,courses:courses.map(c=>({...c,label:c.title+(c.archived?' (archivált kurzus)':''),count:rows.filter(p=>p.groups.includes(courseKey(c.value))).length})),
    campaignCount:rows.filter(p=>p.groups.includes('campaign')).length};
}
async function reconcile(db,settings){
  const snapshot=await audience(db,settings);
  const groupNames={...GROUP_NAMES,...Object.fromEntries(snapshot.courses.map(c=>[courseKey(c.value),courseName(c.title)]))};
  await db.query('UPDATE contacts_groups SET active=key=ANY($1::text[])',[Object.keys(groupNames)]);
  for(const [key,name] of Object.entries(groupNames))await db.query('INSERT INTO contacts_groups(key,name) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET name=EXCLUDED.name,active=true',[key,name]);
  for(const person of snapshot.people)await db.query(`INSERT INTO contacts_people(email,desired,desired_hash) VALUES($1,$2,$3)
    ON CONFLICT(email) DO UPDATE SET desired=EXCLUDED.desired,desired_hash=EXCLUDED.desired_hash,
    synced_hash=CASE WHEN contacts_people.desired_hash<>EXCLUDED.desired_hash THEN NULL ELSE contacts_people.synced_hash END,
    last_error=CASE WHEN contacts_people.desired_hash<>EXCLUDED.desired_hash THEN NULL ELSE contacts_people.last_error END,
    attempts=CASE WHEN contacts_people.desired_hash<>EXCLUDED.desired_hash THEN 0 ELSE contacts_people.attempts END,
    next_attempt_at=CASE WHEN contacts_people.desired_hash<>EXCLUDED.desired_hash THEN now() ELSE contacts_people.next_attempt_at END`,[person.email,person,digest(person)]);
  const emails=snapshot.people.map(p=>p.email);
  await db.query(`UPDATE contacts_people SET desired=NULL,desired_hash=$2,
    synced_hash=CASE WHEN desired IS NOT NULL THEN NULL ELSE synced_hash END,
    last_error=CASE WHEN desired IS NOT NULL THEN NULL ELSE last_error END,
    attempts=CASE WHEN desired IS NOT NULL THEN 0 ELSE attempts END,
    next_attempt_at=CASE WHEN desired IS NOT NULL THEN now() ELSE next_attempt_at END
    WHERE NOT(email=ANY($1::text[]))`,[emails,digest(null)]);
  await db.query('UPDATE contacts_connection SET last_scan_at=now() WHERE id=1');
  return snapshot;
}
module.exports={digest,courseKey,GROUP_NAMES,audience,reconcile};
