const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
let db,seed,courses,services;

before(async()=>{
  db=await require('./database.cjs')();
  await require('../src/migrate')();
  await db.query('UPDATE services SET active=false');
  courses=require('../src/domain/courses');
  seed=require('../scripts/seed-local.cjs');
  services=[];
  for(const count of [1,2,3])services.push(await courses.serviceSave(null,{
    title:`Helyi ${count} alkalmas`,duration_minutes:90,price:20000,capacity:6,session_count:count,
  }));
});
after(async()=>{await db?.end();});

test('local startup seeds complete packages and restarts safely after changing a service session count',async()=>{
  await seed(db);
  for(const service of services){
    const rows=(await db.query('SELECT * FROM courses WHERE service_id=$1 ORDER BY start_time',[service.id])).rows;
    assert.equal(rows.length,2);
    for(const row of rows){
      const sessions=await require('../src/domain/courseSessions').getSessions(db,row.id);
      assert.equal(sessions.length,service.session_count);
      for(const session of sessions)assert.equal(new Date(session.end_time)-new Date(session.start_time),90*60000);
    }
  }
  const originals=(await db.query('SELECT id FROM courses ORDER BY id')).rows;
  await seed(db);
  assert.deepEqual((await db.query('SELECT id FROM courses ORDER BY id')).rows,originals);

  // Reproduce an existing local database: its service now requires two
  // sessions, but it has only one of its original single-session packages.
  const single=services[0];
  const original=(await db.query('SELECT * FROM courses WHERE service_id=$1 ORDER BY start_time',[single.id])).rows;
  const before=await require('../src/domain/courseSessions').getSessions(db,original[0].id);
  await courses.remove(original[1].id);
  await courses.serviceSave(single.id,{...single,session_count:2});
  await seed(db);
  assert.deepEqual(await require('../src/domain/courseSessions').getSessions(db,original[0].id),before);
  const added=(await db.query('SELECT id FROM courses WHERE service_id=$1 AND id<>$2',[single.id,original[0].id])).rows;
  assert.equal(added.length,1);
  assert.equal((await require('../src/domain/courseSessions').getSessions(db,added[0].id)).length,2);
  const saved=(await db.query('SELECT id FROM courses ORDER BY id')).rows;
  await seed(db);
  assert.deepEqual((await db.query('SELECT id FROM courses ORDER BY id')).rows,saved);
});
