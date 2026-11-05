const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
Object.assign(process.env,{FRONTEND_URL:'http://localhost:5173',MAIL_FROM:'',MAIL_ADMIN:'',SMTP_HOST:'',MAIL_USER:''});
let db,server,base,catalog,courseDomain,offset=700;
async function service(title,session_count=1){return courseDomain.serviceSave(null,{title,duration_minutes:60,price:19000,capacity:3,session_count});}
async function advertise(s,price,active=true){
  const sessions=Array.from({length:s.session_count},()=>({start_time:new Date(Date.now()+(offset++)*86400000).toISOString()}));
  return courseDomain.save(null,{service_id:s.id,price,active,sessions});
}
async function amounts(details=false){const r=await fetch(base+'/api/giftcard/amounts'+(details?'?details=1':''));assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');return r.json();}
before(async()=>{
  db=await require('./database.cjs')();await require('../src/migrate')();courseDomain=require('../src/domain/courses');
  server=require('../src/index').listen(0,'127.0.0.1');await new Promise(resolve=>server.on('listening',resolve));base='http://127.0.0.1:'+server.address().port;
});
after(async()=>{if(server)await new Promise(resolve=>server.close(resolve));await db?.end();});
test('without advertised courses no template or hardcoded amounts are offered',async()=>{
  assert.deepEqual(await amounts(),[]);
});
test('only distinct valid future active advertisement prices are offered, including sold-out packages',async()=>{
  catalog=await service('Advertised package',2);
  const full=await advertise(catalog,16432);await advertise(catalog,12750);
  const other=await service('Other course');await advertise(other,12500);
  await advertise(other,1000);await advertise(other,1000000);await advertise(other,0);await advertise(other,999);await advertise(other,1000001);
  await advertise(other,28600,false);
  const hidden=await service('Inactive service');await advertise(hidden,34500);await courseDomain.serviceSave(hidden.id,{...hidden,active:false});
  const started=await advertise(catalog,45600);
  await db.query("UPDATE courses SET start_time=now()-interval '2 hours' WHERE id=$1",[started.id]);
  await db.query("UPDATE course_sessions SET start_time=now()-interval '2 hours',end_time=now()-interval '1 hour' WHERE id=$1",[started.sessions[0].id]);
  await require('../src/domain/bookings').create({courseId:full.id,customerName:'Full Package',customerEmail:'full@example.test',seats:3},randomUUID(),{manual:true});
  assert.deepEqual(await amounts(),[1000,12500,12750,16432,1000000]);
  await courseDomain.serviceSave(catalog.id,{...catalog,price:65000});
  assert.deepEqual(await amounts(),[1000,12500,12750,16432,1000000]);
});
test('creating, repricing and deleting advertisements updates the next response and preserves shared prices',async()=>{
  const s=await service('Changing course'),first=await advertise(s,77777);
  assert.ok((await amounts()).includes(77777));
  await courseDomain.save(first.id,{price:88888});assert.ok(!(await amounts()).includes(77777));assert.ok((await amounts()).includes(88888));
  const second=await advertise(s,88888);assert.equal((await amounts()).filter(value=>value===88888).length,1);
  await courseDomain.remove(first.id);assert.ok((await amounts()).includes(88888));
  await courseDomain.remove(second.id);assert.ok(!(await amounts()).includes(88888));
});
test('amount recommendations include unique current course names and actual multi-session package indicators',async()=>{
  await advertise(catalog,12500);const duplicate=await advertise(catalog,12500);
  let options=await amounts(true),option=options.find(option=>option.amount===12500);
  assert.equal(option.courses.length,2);
  assert.deepEqual(option.courses.map(c=>({title:c.title,multiSession:c.multiSession})),[
    {title:'Advertised package',multiSession:true},{title:'Other course',multiSession:false}
  ]);
  assert.equal(new Set(option.courses.map(c=>c.id)).size,2);
  assert.ok(!JSON.stringify(options).includes('Inactive service'));
  await courseDomain.serviceSave(catalog.id,{...catalog,title:'Renamed advertised package'});
  options=await amounts(true);option=options.find(option=>option.amount===12500);
  assert.ok(option.courses.some(c=>c.title==='Renamed advertised package'));
  assert.ok(!JSON.stringify(options).includes('"title":"Advertised package"'));
  await courseDomain.remove(duplicate.id);
  assert.equal((await amounts(true)).find(option=>option.amount===12500).courses.length,2);
});
