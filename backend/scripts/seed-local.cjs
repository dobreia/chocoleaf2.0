// Only called by the isolated local launcher and the in-memory browser test fixture.
module.exports = async function seedLocal(db) {
  const services = (await db.query('SELECT * FROM services WHERE active AND price>=175 ORDER BY title')).rows;
  let offset=3;
  for (const service of services) {
    const existing=(await db.query('SELECT count(*)::int AS n FROM courses WHERE service_id=$1 AND active AND start_time>now()',[service.id])).rows[0].n;
    for(let i=existing;i<2;i++) {
      let saved=false;
      for(let attempts=0;attempts<90;attempts++) {
        const start=new Date();start.setDate(start.getDate()+offset++);start.setHours(10,0,0,0);
        try {
          await require('../src/domain/courses').save(null,{service_id:service.id,description:'Bemutató tesztidőpont',price:service.price,capacity:6,start_time:start.toISOString(),end_time:new Date(+start+service.duration_minutes*60000).toISOString()});
          saved=true;break;
        } catch(e) {if(e.status!==409)throw e;}
      }
      if(!saved)throw Error('Nem sikerült szabad bemutatóidőpontot találni.');
    }
  }
  for(const [slug,title] of [['imprint','Impresszum'],['privacy','Adatkezelési tájékoztató'],['terms','Rendelési feltételek'],['cookies','Sütik']]) {
    await db.query('INSERT INTO content_pages(slug,title,body) VALUES($1,$2,$3) ON CONFLICT(slug) DO NOTHING',
      [slug,title,`BEMUTATÓ – TESZTTARTALOM\n\nEz az oldal a helyi ügyfélbemutató része. A végleges ${title.toLocaleLowerCase('hu')} az éles indulás előtt kerül feltöltésre.\n\nA bemutatóban Stripe-tesztfizetést használunk, tényleges terhelés és számlakiállítás nélkül. A tesztlevelek helyben tekinthetők meg.\n\nAz oldal szövege az adminfelület Oldaltartalmak menüpontjában szerkeszthető.`]);
  }
};
