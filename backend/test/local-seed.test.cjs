const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
let db, services;
const seed=require('../scripts/seed-local.cjs');
before(async()=>{
  db=await require('./database.cjs')();
  await require('../src/migrate')();
  await db.query('UPDATE services SET active=false');
  services=[];
  for(const count of [1,2,3]){
    services.push(await require('../src/domain/courses').serviceSave(null,{
      title:'Local seed '+count,session_count:count,duration_minutes:90,price:1000,capacity:6,
    }));
  }
});
after(async()=>{await db?.end();});

test('local startup seeds the configured number of sessions and derives each end from the service duration',async()=>{
  await seed(db);
  for(const service of services){
    const courses=(await db.query('SELECT * FROM courses WHERE service_id=$1',[service.id])).rows;
    assert.equal(courses.length,2);
    for(const course of courses){
      const sessions=(await db.query('SELECT * FROM course_session_times WHERE course_id=$1 ORDER BY start_time',[course.id])).rows;
      assert.equal(sessions.length,service.session_count);
      assert.equal(course.price,service.price);
      for(const [index,session] of sessions.entries()){
        assert.equal(+new Date(session.end_time)-new Date(session.start_time),90*60000);
        if(index)assert.ok(new Date(session.start_time)>new Date(sessions[index-1].end_time));
      }
    }
  }
});

test('restarting local startup preserves existing advertisements, sessions and bookings after a template change',async()=>{
  const target=(await db.query('SELECT * FROM courses WHERE service_id=$1',[services[1].id])).rows[0];
  const booking=await require('../src/domain/bookings').create({courseId:target.id,customerName:'Local Guest',customerEmail:'local-seed@example.test',seats:1},undefined,{manual:true});
  await db.query('UPDATE services SET session_count=3 WHERE id=$1',[services[1].id]);
  const courses=(await db.query('SELECT * FROM courses ORDER BY id')).rows;
  const sessions=(await db.query('SELECT * FROM course_session_times ORDER BY id')).rows;
  const savedBooking=(await db.query('SELECT * FROM bookings WHERE id=$1',[booking.booking.id])).rows[0];
  await seed(db);
  assert.deepEqual((await db.query('SELECT * FROM courses ORDER BY id')).rows,courses);
  assert.deepEqual((await db.query('SELECT * FROM course_session_times ORDER BY id')).rows,sessions);
  assert.deepEqual((await db.query('SELECT * FROM bookings WHERE id=$1',[savedBooking.id])).rows[0],savedBooking);
});
