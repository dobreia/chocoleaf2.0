const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
let db,server,base,courses,bookings,offset=700;
before(async()=>{
  db=await require('./database.cjs')();await require('../src/migrate')();
  courses=require('../src/domain/courses');bookings=require('../src/domain/bookings');
  server=require('../src/index').listen(0);await new Promise(r=>server.on('listening',r));base='http://127.0.0.1:'+server.address().port;
});
after(async()=>{await new Promise(r=>server.close(r));await db.end();});
async function fixture(reserved){
  const service=await courses.serviceSave(null,{title:'External seats '+randomUUID(),duration_minutes:120,price:19000,capacity:6});
  const start=new Date(Date.now()+(offset++)*86400000).toISOString();
  const slot=await courses.save(null,{service_id:service.id,reserved_seats:reserved,sessions:[{start_time:start}]});return {service,slot};
}
async function available(service){return (await (await fetch(base+'/api/bookings/availability?courseId='+service.id)).json())[0];}
function reserve(slot,seats){return bookings.create({courseId:slot.id,customerName:'Test',customerEmail:randomUUID()+'@example.test',seats},undefined,{manual:true});}
test('external seats leave exactly four places, are preserved on edit, and cannot be oversold',async()=>{
  const {service,slot}=await fixture(2);assert.equal((await available(service)).available_spots,4);
  const b=await reserve(slot,3);assert.equal((await available(service)).available_spots,1);
  await assert.rejects(()=>reserve(slot,2),/Nincs elegendő/);
  const saved=await courses.save(slot.id,{price:19500});assert.equal(saved.reserved_seats,2);
  await assert.rejects(()=>courses.save(slot.id,{capacity:4}),/kapacitás/i);
  await bookings.update(b.booking.id,{status:'cancelled'});assert.equal((await available(service)).available_spots,4);
});
test('full external capacity remains visible with zero places and rejects bookings',async()=>{
  const {service,slot}=await fixture(6);const response=await available(service);
  assert.equal(response.id,slot.id);assert.equal(response.available_spots,0);assert.equal(response.is_available,false);
  await assert.rejects(()=>reserve(slot,1),/Nincs elegendő/);
  assert.equal((await db.query('SELECT count(*)::int n FROM bookings WHERE course_id=$1',[slot.id])).rows[0].n,0);
  const changed=await courses.save(slot.id,{capacity:4,reserved_seats:4});assert.equal(changed.capacity,4);
  for(const reserved_seats of [-1,7,1.5,''])await assert.rejects(()=>courses.save(slot.id,{reserved_seats}));
});
test('explicit local seed opt-out preserves the manually imported schedule on restart',async()=>{
  const before=(await db.query('SELECT * FROM courses ORDER BY id')).rows;
  const previous=process.env.LOCAL_SEED_COURSES;process.env.LOCAL_SEED_COURSES='false';
  try{await require('../scripts/seed-local.cjs')(db);}finally{if(previous===undefined)delete process.env.LOCAL_SEED_COURSES;else process.env.LOCAL_SEED_COURSES=previous;}
  assert.deepEqual((await db.query('SELECT * FROM courses ORDER BY id')).rows,before);
});
