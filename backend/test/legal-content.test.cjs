const {test}=require('node:test');
const assert=require('node:assert/strict');
test('legacy legal content imports complete text and safe current links once, preserving existing and later admin changes',async()=>{
 const db=await require('./database.cjs')();
 try{
  await db.query("CREATE TABLE content_pages(slug TEXT PRIMARY KEY,title TEXT NOT NULL,body TEXT NOT NULL DEFAULT '')");
  await db.query("INSERT INTO content_pages VALUES('imprint','Saját impresszum','Korábban véglegesített saját tartalom'),('privacy','Üres','   ')");
  const demo='BEMUTATÓ – TESZTTARTALOM\n\nEz az oldal a helyi ügyfélbemutató része. A végleges sütik az éles indulás előtt kerül feltöltésre.\n\nA bemutatóban Stripe-tesztfizetést használunk, tényleges terhelés és számlakiállítás nélkül. A tesztlevelek helyben tekinthetők meg.\n\nAz oldal szövege az adminfelület Oldaltartalmak menüpontjában szerkeszthető.';
  await db.query('INSERT INTO content_pages VALUES($1,$2,$3)',['cookies','Sütik',demo]);
  await require('../src/migrate')();
  let rows=(await db.query('SELECT * FROM content_pages ORDER BY slug')).rows;
  assert.equal(rows.length,4);assert.equal(rows.find(p=>p.slug==='imprint').body,'Korábban véglegesített saját tartalom');
  const privacy=rows.find(p=>p.slug==='privacy'),terms=rows.find(p=>p.slug==='terms'),cookies=rows.find(p=>p.slug==='cookies');
  assert.ok(privacy.body.includes('## 9. A tájékoztató frissítése'));assert.ok(privacy.body.includes('2025. október 1-jén'));
  assert.ok(terms.body.includes('### Ajándékutalvánnyal foglalt workshop'));assert.ok(terms.body.includes('72 órán belül az utalvány beváltottnak minősül'));assert.ok(terms.body.includes('2025. december 8.'));
  assert.ok(cookies.body.includes('| Név / Szolgáltató | Cél | Tárolás ideje |'));assert.ok(cookies.body.includes('### 3. Marketing sütik'));
  assert.ok(privacy.body.includes('(/legal/cookies)'));assert.ok(terms.body.includes('(/legal/privacy)'));
  for(const row of rows){assert.ok(!row.body.includes('<script'));assert.ok(!row.body.includes('pixel.barion.com'));assert.ok(!row.body.includes('cookie-policy.html'));}
  // A fresh import also includes the full imprint when there is no existing page.
  await db.query("DELETE FROM content_pages WHERE slug='imprint'");
  const sql=require('node:fs').readFileSync(require('node:path').join(__dirname,'../migrations/021-legacy-legal-content.sql'),'utf8');
  await db.query(sql);
  const imprint=(await db.query("SELECT * FROM content_pages WHERE slug='imprint'")).rows[0];assert.ok(imprint.body.includes('66578921-1-41'));assert.ok(imprint.body.includes('36239682'));assert.ok(imprint.body.includes('## Szerzői jog'));
  await db.query("UPDATE content_pages SET body='Admin által frissített szöveg' WHERE slug='terms'");
  await db.query(sql);await require('../src/migrate')();
  rows=(await db.query('SELECT * FROM content_pages')).rows;assert.equal(rows.length,4);assert.equal(rows.find(p=>p.slug==='terms').body,'Admin által frissített szöveg');
 }finally{await db.end();}
});
