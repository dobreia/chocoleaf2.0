const pool = require("../db");
const { transaction, one } = require("./store");
const { fail, uuid, str, integer } = require("./rules");
const { checkSlot } = require("./schedule");
const { bookingNotice } = require("./notifications");
const { randomUUID } = require('node:crypto');
const { getSessions, normalizeSessions, attachSessions } = require('./courseSessions');
function serviceData(d) {
  return {
    title: str(d.title, "Név"),
    description: str(d.description || "", "Leírás", 4000, false),
    long_description: str(
      d.long_description || "",
      "Részletes leírás",
      20000,
      false,
    ),
    category: str(d.category || "", "Kategória", 100, false),
    duration_minutes: integer(d.duration_minutes, "Időtartam", 1, 1440),
    price: integer(d.price, "Ár"),
    capacity: integer(d.capacity === undefined ? 6 : d.capacity, "Kapacitás", 1, 100),
    active: d.active !== false,
    image: asset(d.image),
    image_detail: asset(d.image_detail),
    session_count: integer(d.session_count === undefined ? 1 : d.session_count, 'Alkalmak száma', 1, 100),
  };
}
function asset(v) {
  v = str(v || "", "Kép", 500, false);
  if (v && !v.startsWith("/assets/") && !/^\/api\/media\/[a-f0-9-]{36}\.webp$/.test(v))
    fail("Válassz feltöltött képet.");
  return v;
}
async function serviceSave(id, data) {
  return transaction(async (c) => {
    await c.query('SELECT pg_advisory_xact_lock(829108)');
    const previous = id ? await one(c, 'SELECT * FROM services WHERE id=$1', [uuid(id)]) : null;
    const s = serviceData({...data, session_count: data.session_count === undefined ? previous?.session_count ?? 1 : data.session_count});
    if (id) {
      uuid(id);
      if (!(await one(c, "SELECT 1 FROM services WHERE id=$1", [id])))
        fail("A szolgáltatás nem található.", 404);
      if (!s.active && await one(c, `SELECT 1 FROM payment_orders p JOIN courses c ON c.id=p.course_id
        WHERE c.service_id=$1 AND p.status='pending' AND p.booking_id IS NULL`, [id]))
        fail('Folyamatban lévő fizetés alatt a szolgáltatás nem inaktiválható.',409);
      await c.query(
        "UPDATE services SET title=$2,description=$3,long_description=$4,category=$5,duration_minutes=$6,price=$7,capacity=$8,active=$9,image=$10,image_detail=$11,session_count=$12,updated_at=clock_timestamp() WHERE id=$1",
        [id, ...Object.values(s)],
      );
      await c.query(
        "UPDATE courses SET title=$2,description=$3 WHERE service_id=$1",
        [id, s.title, s.description],
      );
      return one(c, "SELECT * FROM services WHERE id=$1", [id]);
    }
    return one(
      c,
      "INSERT INTO services(title,description,long_description,category,duration_minutes,price,capacity,active,image,image_detail,session_count) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *",
      Object.values(s),
    );
  });
}
async function save(id, data) {
  return transaction(async c => {
    // Serialize schedule changes, including overlapping new advertisements.
    await c.query('SELECT pg_advisory_xact_lock(829108)');
    const parentId = id ? uuid(id) : randomUUID();
    const old = id ? await one(c, 'SELECT * FROM courses WHERE id=$1 FOR UPDATE', [id]) : null;
    if (id && !old) fail('Az időpont nem található.',404);
    const service = data.service_id || old?.service_id
      ? await one(c, 'SELECT * FROM services WHERE id=$1', [uuid(data.service_id || old.service_id)])
      : await one(c, 'SELECT * FROM services WHERE title=$1', [str(data.title,'Név')]);
    if (!service?.active) fail('Először válassz aktív szolgáltatást.');
    const before = old ? await getSessions(c,id) : [];
    const sessions = normalizeSessions(data,before,parentId);
    if (before.some(s=>new Date(s.start_time)<=new Date() && !sessions.some(next=>next.id===s.id))) fail('Elkezdődött alkalom nem távolítható el.',409);
    const d = {...old,...data};
    const price = integer(d.price ?? service.price,'Ár');
    const capacity = integer(d.capacity ?? service.capacity,'Kapacitás',1,100);
    const active = d.active !== false;
    const used = old ? await one(c, "SELECT COALESCE(SUM(seats),0)::int AS n FROM bookings WHERE course_id=$1 AND status<>'cancelled'",[id]) : {n:0};
    const holds = old ? await one(c, "SELECT COALESCE(SUM(seats),0)::int AS n FROM payment_orders WHERE course_id=$1 AND status='pending' AND booking_id IS NULL",[id]) : {n:0};
    const locked = old && (old.session_count_locked || await one(c, `SELECT 1 WHERE EXISTS(SELECT 1 FROM bookings WHERE course_id=$1) OR EXISTS(SELECT 1 FROM payment_orders WHERE course_id=$1 OR booking_id IN(SELECT id FROM bookings WHERE course_id=$1))`,[id]));
    if (locked && (sessions.length!==before.length || sessions.some(s=>!before.some(b=>b.id===s.id))))
      fail('Foglalás vagy fizetés indítása után az alkalmak száma nem módosítható.',409);
    if (locked && service.id !== old.service_id)
      fail('Foglalás vagy fizetés indítása után a meghirdetés szolgáltatása nem cserélhető.',409);
    const expectedCount = old && old.service_id === service.id ? before.length : service.session_count;
    if (sessions.length !== expectedCount)
      fail(`Ehhez a kurzushoz ${expectedCount} alkalom időpontját kell megadni. Az alkalmak számát a szolgáltatásnál állíthatod be az új meghirdetésekhez.`);
    const changed = !old || sessions.length!==before.length || sessions.some(s=>{
      const b=before.find(b=>b.id===s.id);
      return !b || +new Date(b.start_time)!==+s.start_time || +new Date(b.end_time)!==+s.end_time;
    });
    if (holds.n && (changed || !active || service.id!==old.service_id))
      fail('Folyamatban lévő fizetés alatt az alkalmak nem módosíthatók vagy inaktiválhatók.',409);
    if (used.n && old.service_id!==service.id) fail('Foglalásokkal rendelkező kurzus szolgáltatása nem cserélhető.',409);
    if (used.n+holds.n>capacity) fail('A kapacitás nem lehet kisebb a lefoglalt helyek számánál.',409);
    for (const session of sessions) {
      const previous = before.find(s=>s.id===session.id);
      if (previous && new Date(previous.start_time)<=new Date()) {
        if (+new Date(previous.start_time)!==+session.start_time || +new Date(previous.end_time)!==+session.end_time)
          fail('A már elkezdődött alkalom időpontja nem módosítható.',409);
      } else if (active) {
        await checkSlot(c,{start_time:session.start_time.toISOString(),end_time:session.end_time.toISOString()},parentId);
      }
      if (old && changed) {
        const conflict = await one(c, `SELECT 1 FROM bookings mine JOIN bookings other ON lower(mine.customer_email)=lower(other.customer_email) AND mine.id<>other.id JOIN course_session_times st ON st.course_id=other.course_id WHERE mine.course_id=$1 AND other.course_id<>$1 AND mine.status<>'cancelled' AND other.status<>'cancelled' AND st.start_time<$3 AND st.end_time>$2`,[id,session.start_time,session.end_time]);
        if (conflict) fail('Az új időpont ütközik egy résztvevő másik foglalásával.',409);
        const pending = await one(c, `SELECT 1 FROM bookings mine JOIN payment_orders p ON lower(p.email)=lower(mine.customer_email) JOIN course_session_times st ON st.course_id=p.course_id WHERE mine.course_id=$1 AND mine.status<>'cancelled' AND p.status='pending' AND p.booking_id IS NULL AND p.course_id<>$1 AND st.start_time<$3 AND st.end_time>$2`,[id,session.start_time,session.end_time]);
        if (pending) fail('Az új időpont ütközik egy résztvevő folyamatban lévő fizetésével.',409);
      }
    }
    const values=[service.id,service.title,data.description ?? service.description,sessions[0].start_time,sessions.at(-1).end_time,price,capacity,active];
    const slot = old
      ? await one(c,'UPDATE courses SET service_id=$2,title=$3,description=$4,start_time=$5,end_time=$6,price=$7,capacity=$8,active=$9,updated_at=clock_timestamp() WHERE id=$1 RETURNING *',[id,...values])
      : await one(c,'INSERT INTO courses(id,service_id,title,description,start_time,end_time,price,capacity,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',[parentId,...values]);
    await c.query('DELETE FROM course_sessions WHERE course_id=$1',[parentId]);
    if (locked) await c.query('UPDATE courses SET session_count_locked=true WHERE id=$1',[parentId]);
    for (const session of sessions) await c.query('INSERT INTO course_sessions(id,course_id,start_time,end_time) VALUES($1,$2,$3,$4)',[session.id,parentId,session.start_time,session.end_time]);
    if (old && changed) {
      for (const b of (await c.query("UPDATE bookings SET updated_at=clock_timestamp(),manage_expires=$2::timestamptz+interval '30 days' WHERE course_id=$1 AND status<>'cancelled' RETURNING *",[id,slot.end_time])).rows)
        await bookingNotice(c,b,slot,'A kurzus időpontjai megváltoztak; a foglalás minden alkalomra érvényes');
    }
    return (await attachSessions(c,[slot]))[0];
  });
}
async function remove(id) {
  return transaction(async (c) => {
    uuid(id);
    if (await one(c,'SELECT 1 FROM payment_orders WHERE course_id=$1',[id])) fail('Fizetési előzménnyel rendelkező meghirdetés nem törölhető. Inaktiváld a kurzust.',409);
    if (await one(c, "SELECT 1 FROM bookings WHERE course_id=$1", [id]))
      fail(
        "A foglalásokkal rendelkező alkalom nem törölhető. Inaktiváld, vagy mondd le a foglalásokat.",
        409,
      );
    const row = await one(c, "DELETE FROM courses WHERE id=$1 RETURNING *", [
      id,
    ]);
    if (!row) fail("Az időpont nem található.", 404);
    return row;
  });
}
async function resolveService(c, id) {
  return one(
    c,
    "SELECT s.* FROM services s WHERE s.id::text=$1 OR s.slug=$1 OR s.id=(SELECT service_id FROM courses WHERE id::text=$1)",
    [id],
  );
}
async function publicServices() {
  return (
    await pool.query(
      'SELECT *,image AS "imageIndex",image_detail AS "imageDetail",price AS "priceHUF",duration_minutes/60.0 AS "durationHour",category AS level FROM services WHERE active ORDER BY price,title',
    )
  ).rows;
}
module.exports = { serviceSave, save, remove, resolveService, publicServices };
