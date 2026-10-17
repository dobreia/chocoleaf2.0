const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
Object.assign(process.env, {
  NODE_ENV:'test', FRONTEND_URL:'http://localhost:5173',
  GOOGLE_CALENDAR_CLIENT_ID:'test-client', GOOGLE_CALENDAR_CLIENT_SECRET:'test-secret',
  CALENDAR_TOKEN_KEY:crypto.randomBytes(32).toString('hex'),
  GOOGLE_CALENDAR_REDIRECT_URI:'http://localhost:5173/api/calendar/google/callback',
});
let db,server,base,cookie,oauthCookie,state,service,course,second,booking,realTick;
const realFetch=global.fetch, calendars=new Map(),remote=new Map();
let revoked=false,quota=false,lostInsert=false,account='calendar@example.test',created=0;
const json=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json',...headers}});
global.fetch=async (url,options={})=>{
  const u=new URL(url);
  if(u.hostname==='localhost')return realFetch(url,options);
  if(u.hostname==='oauth2.googleapis.com'){
    if(revoked)return json({error:'invalid_grant'},400);
    return json({access_token:'test-access',refresh_token:'sensitive-refresh',scope:require('../src/calendar/google').SCOPES.join(' ')});
  }
  if(u.pathname==='/oauth2/v2/userinfo')return json({email:account,verified_email:true});
  assert.equal(u.hostname,'www.googleapis.com','unexpected outbound request');
  assert.equal(options.headers.Authorization,'Bearer test-access');
  const method=options.method||'GET',body=options.body&&JSON.parse(options.body);
  const p=u.pathname.replace('/calendar/v3','');
  if(p==='/users/me/calendarList')return json({items:[...calendars.values()]});
  if(p==='/calendars'&&method==='POST'){
    const c={...body,id:'owned-'+(++created)};calendars.set(c.id,c);return json(c);
  }
  const match=p.match(/^\/calendars\/([^/]+)(?:\/events(?:\/([^/]+))?)?$/);
  assert(match,p);const [,cal,id]=match;
  if(!calendars.has(cal))return json({error:{errors:[{reason:'notFound'}]}},404);
  if(!p.includes('/events'))return json(calendars.get(cal));
  if(quota){quota=false;return json({error:{errors:[{reason:'rateLimitExceeded'}]}},429,{'retry-after':'60'});}
  if(method==='DELETE'){remote.delete(id);return new Response(null,{status:204});}
  if(method==='PUT'){
    if(!remote.has(id))return json({},404);
    remote.set(id,{...body,id});return json(remote.get(id));
  }
  if(method==='POST'){
    if(remote.has(body.id))return json({},409);
    remote.set(body.id,body);
    if(lostInsert){lostInsert=false;throw new Error('connection lost after acceptance');}
    return json(body);
  }
  throw new Error('unexpected Google operation');
};
async function req(path,method='GET',body,auth=true){
  const r=await fetch(base+'/api'+path,{method,headers:{'Content-Type':'application/json',...(auth?{cookie}: {})},body:body&&JSON.stringify(body)});
  return {status:r.status,data:await r.json(),headers:r.headers};
}
async function begin(){const r=await req('/admin/calendar-sync/connect','POST',{});assert.equal(r.status,200);const url=new URL(r.data.url);state=url.searchParams.get('state');oauthCookie=r.headers.get('set-cookie').split(';')[0];return url;}
async function callback(browser=oauthCookie,extra=''){
  return fetch(base+'/api/calendar/google/callback?state='+state+'&code=test-code'+extra,{headers:{cookie:browser},redirect:'manual'});
}
async function retryDue(){await db.query('UPDATE calendar_connection SET next_attempt_at=now()');await db.query('UPDATE calendar_events SET next_attempt_at=now()');}
before(async()=>{
  db=await require('./database.cjs')();await require('../src/migrate')();
  const sync=require('../src/calendar/sync');realTick=sync.tick;sync.tick=async()=>{};
  const password=await require('../src/domain/auth').passwordHash('test-password-123');
  await db.query('INSERT INTO admins(email,password_hash) VALUES($1,$2)',['admin@example.test',password]);
  server=require('../src/index').listen(0);await new Promise(r=>server.on('listening',r));base='http://localhost:'+server.address().port;
  const login=await req('/auth/login','POST',{email:'admin@example.test',password:'test-password-123'},false);cookie=login.headers.get('set-cookie').split(';')[0];
  service=(await req('/admin/services','POST',{title:'Telefonos tesztkurzus',duration_minutes:60,price:1000,capacity:6})).data;
  const start=new Date(Date.now()+5*86400000);const end=new Date(+start+3600000);
  course=(await req('/admin/courses','POST',{service_id:service.id,start_time:start.toISOString(),end_time:end.toISOString(),capacity:6,price:1000,active:true})).data;
  second=(await req('/admin/courses','POST',{service_id:service.id,start_time:new Date(+start+86400000).toISOString(),end_time:new Date(+end+86400000).toISOString(),capacity:6,price:1000,active:true})).data;
});
after(async()=>{global.fetch=realFetch;await new Promise(r=>server.close(r));await db.end();});
test('calendar endpoints require admin and reject foreign origins',async()=>{
  assert.equal((await req('/admin/calendar-sync','GET',undefined,false)).status,401);
  const r=await fetch(base+'/api/admin/calendar-sync/connect',{method:'POST',headers:{cookie,Origin:'https://foreign.test'}});assert.equal(r.status,403);
});
test('missing deployment credentials give an honest unavailable state',async()=>{
  const key=process.env.CALENDAR_TOKEN_KEY;delete process.env.CALENDAR_TOKEN_KEY;
  assert.equal((await req('/admin/calendar-sync')).data.configured,false);
  assert.equal((await req('/admin/calendar-sync/connect','POST',{})).status,503);
  process.env.CALENDAR_TOKEN_KEY=key;
});
test('OAuth uses offline access, scoped permissions and PKCE with a browser-bound state',async()=>{
  const url=await begin();assert.equal(url.hostname,'accounts.google.com');assert.equal(url.searchParams.get('access_type'),'offline');assert.equal(url.searchParams.get('code_challenge_method'),'S256');
  assert(!url.searchParams.get('scope').split(' ').includes('https://www.googleapis.com/auth/calendar'));
  const r=await callback('');assert(r.headers.get('location').includes('expired'));assert.equal((await req('/admin/calendar-sync')).data.connected,false);
});
test('OAuth denial preserves current data and consumes the one-time state',async()=>{
  await begin();const r=await callback(oauthCookie,'&error=access_denied');assert(r.headers.get('location').includes('denied'));
  assert((await callback()).headers.get('location').includes('expired'));
});
test('OAuth success stores encrypted tokens, never exposing them in status',async()=>{
  await begin();const r=await callback();assert.equal(r.status,303);assert(r.headers.get('location').includes('connected'));
  const row=(await db.query('SELECT * FROM calendar_connection')).rows[0];assert(!row.refresh_token.includes('sensitive-refresh'));
  assert.equal(require('../src/calendar/google').decrypt(row.refresh_token),'sensitive-refresh');
  const status=(await req('/admin/calendar-sync')).data;assert(status.connected);assert(!JSON.stringify(status).includes('sensitive-refresh'));assert.equal(status.accountEmail,account);
  assert((await callback()).headers.get('location').includes('expired'));
});
test('initial sync creates one dedicated calendar and includes empty courses',async()=>{
  await realTick();assert.equal(created,1);assert.equal(remote.size,2);assert([...remote.values()].every(e=>e.summary.endsWith('0/6 fő')));
  const e=[...remote.values()][0];assert.equal(e.start.timeZone,'Europe/Budapest');assert(e.source.url.includes('course='));assert(!e.attendees);
});
test('seat totals and approved cancellation update the same event',async()=>{
  const r=await req('/admin/bookings','POST',{courseId:course.id,customerName:'Private Name',customerEmail:'private@example.test',seats:4});assert.equal(r.status,201,JSON.stringify(r.data));booking=r.data.booking;
  await realTick();assert.equal(remote.size,2);let e=[...remote.values()].find(e=>e.extendedProperties.private.chocoleafCourseId===course.id);assert(e.summary.endsWith('4/6 fő'));assert(!JSON.stringify(e).includes('Private Name'));const oldId=e.id;
  await db.query("UPDATE bookings SET status='cancelled' WHERE id=$1",[booking.id]);await realTick();e=remote.get(oldId);assert(e.summary.endsWith('0/6 fő'));
});
test('reschedule and capacity change rewrite dates and capacity without duplicate events',async()=>{
  await db.query("UPDATE courses SET start_time=start_time+interval '1 hour',end_time=end_time+interval '1 hour',capacity=8 WHERE id=$1",[course.id]);
  await realTick();assert.equal(remote.size,2);assert([...remote.values()].some(e=>e.summary.endsWith('0/8 fő')));
});
test('rate limit is persisted and retry resumes successfully',async()=>{
  await db.query("UPDATE courses SET title='Frissített kurzus' WHERE id=$1",[course.id]);quota=true;await realTick();
  const row=(await db.query('SELECT * FROM calendar_connection')).rows[0];assert(row.last_error);assert(new Date(row.next_attempt_at)>new Date());
  const failed=(await req('/admin/calendar-sync')).data;assert.equal(failed.failed,1);assert.equal(failed.pending,1);
  await retryDue();await realTick();assert.equal((await req('/admin/calendar-sync')).data.failed,0);
});
test('lost response after insertion is retried using the same persistent event id',async()=>{
  await db.query('DELETE FROM courses WHERE id=$1',[second.id]);await realTick();assert.equal(remote.size,1);
  await db.query("INSERT INTO courses(id,service_id,title,start_time,end_time,capacity,price,active) VALUES($1,$2,'Recovered',now()+interval '20 days',now()+interval '20 days 1 hour',6,1000,true)",[second.id,service.id]);
  lostInsert=true;await realTick();assert.equal(remote.size,2);
  await retryDue();delete require.cache[require.resolve('../src/calendar/sync')];await require('../src/calendar/sync').tick();assert.equal(remote.size,2);
});
test('calendar creation is recovered by marker after interrupted persistence',async()=>{
  await db.query('UPDATE calendar_connection SET calendar_id=NULL');await realTick();assert.equal(created,1);assert.equal(remote.size,2);
});
test('inactive and physically deleted courses remove their remote events',async()=>{
  await db.query('UPDATE courses SET active=false WHERE id=$1',[second.id]);await realTick();assert.equal(remote.size,1);
  await db.query('DELETE FROM courses WHERE id=$1',[second.id]);await realTick();assert.equal(remote.size,1);
});
test('revoked access pauses work and reconnect retains calendar identity',async()=>{
  revoked=true;await realTick();assert.equal((await req('/admin/calendar-sync')).data.needsAuth,true);
  revoked=false;await begin();await callback();await realTick();assert.equal(created,1);assert.equal((await req('/admin/calendar-sync')).data.needsAuth,false);
});
test('different Google account cannot silently replace an active connection',async()=>{
  account='other@example.test';await begin();const r=await callback();assert(r.headers.get('location').includes('different_account'));account='calendar@example.test';assert.equal((await req('/admin/calendar-sync')).data.accountEmail,account);
});
test('disconnect clears credentials and stops sending while keeping Google events',async()=>{
  const r=await req('/admin/calendar-sync/disconnect','POST',{});assert.equal(r.status,200);
  const row=(await db.query('SELECT * FROM calendar_connection')).rows[0];assert.equal(row.refresh_token,null);assert.equal(row.enabled,false);const count=remote.size;
  await realTick();assert.equal(remote.size,count);assert.equal((await req('/admin/calendar-sync/sync','POST',{})).status,409);
});
