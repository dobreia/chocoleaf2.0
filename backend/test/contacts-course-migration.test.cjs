const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
test('upgrading category audiences keeps Google credentials and mappings but requires explicit course selection',async()=>{
  const db=await require('./database.cjs')();
  try{
    await db.query('CREATE TABLE schema_migrations(name TEXT PRIMARY KEY,applied_at TIMESTAMPTZ DEFAULT now())');
    const dir=path.join(__dirname,'../migrations');
    for(const name of fs.readdirSync(dir).sort().filter(name=>name<'018-')){
      await db.query(fs.readFileSync(path.join(dir,name),'utf8'));
      await db.query('INSERT INTO schema_migrations(name) VALUES($1)',[name]);
    }
    await db.query(`UPDATE contacts_connection SET account_email='owner@example.test',enabled=true,
      refresh_token='encrypted-old-token',campaign_mode='categories',campaign_categories='["haladó"]' WHERE id=1`);
    await db.query(`INSERT INTO contacts_groups(key,name,resource_name) VALUES('category:old','Old label','contactGroups/old')`);
    await db.query(`INSERT INTO contacts_people(email,resource_name,desired,desired_hash,synced_hash)
      VALUES('customer@example.test','people/existing','{"name":"Customer","groups":["category:old","campaign"]}','old','old')`);
    const marker=(await db.query('SELECT marker FROM contacts_connection')).rows[0].marker;
    await require('../src/migrate')();
    const c=(await db.query('SELECT * FROM contacts_connection')).rows[0];
    assert.equal(c.account_email,'owner@example.test');assert.equal(c.refresh_token,'encrypted-old-token');assert.equal(c.enabled,true);
    assert.equal(c.marker,marker);assert.equal(c.campaign_mode,'courses');assert.deepEqual(c.campaign_courses,[]);
    const group=(await db.query('SELECT * FROM contacts_groups')).rows[0];assert.equal(group.active,false);assert.equal(group.resource_name,'contactGroups/old');
    const person=(await db.query('SELECT * FROM contacts_people')).rows[0];assert.equal(person.resource_name,'people/existing');assert.equal(person.synced_hash,null);
    await require('../src/migrate')();assert.deepEqual((await db.query('SELECT * FROM contacts_connection')).rows[0],c);
  }finally{await db.end();}
});
