const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
test('mail migration upgrades a legacy database with existing html/error columns and preserves queued letters on rerun',async()=>{
 const db=await require('./database.cjs')();
 try{
  // Build the prior schema while leaving this migration unapplied.
  await db.query('CREATE TABLE schema_migrations(name TEXT PRIMARY KEY,applied_at TIMESTAMPTZ DEFAULT now())');
  await db.query("INSERT INTO schema_migrations(name) VALUES('020-email-management.sql')");
  await require('../src/migrate')();
  await db.query('ALTER TABLE outbox ADD COLUMN html TEXT; ALTER TABLE outbox ADD COLUMN last_error TEXT');
  const old=(await db.query("INSERT INTO outbox(recipient,subject,body,html,last_error,attempts) VALUES('old@example.test','Legacy','Original text','<p>Original HTML</p>','Original error',7) RETURNING id")).rows[0];
  await db.query("DELETE FROM schema_migrations WHERE name='020-email-management.sql'");
  await require('../src/migrate')();
  const before=(await db.query('SELECT * FROM outbox WHERE id=$1',[old.id])).rows[0];
  assert.equal(before.html,'<p>Original HTML</p>');assert.equal(before.body,'Original text');assert.equal(before.last_error,'Original error');assert.equal(before.attempts,7);assert.equal(before.retry_stopped,false);assert.equal(before.sent_at,null);
  assert.equal((await db.query("SELECT 1 FROM schema_migrations WHERE name='020-email-management.sql'")).rowCount,1);
  assert.equal((await db.query("SELECT 1 FROM pg_indexes WHERE tablename='outbox' AND indexname='outbox_waiting'")).rowCount,1);
  await db.query(fs.readFileSync(path.join(__dirname,'../migrations/020-email-management.sql'),'utf8'));
  await require('../src/migrate')();
  assert.deepEqual((await db.query('SELECT * FROM outbox WHERE id=$1',[old.id])).rows[0],before);
 }finally{await db.end();}
});
