const pool = require("../db");
const { transaction, one } = require("./store");
const { fail, uuid, str, integer } = require("./rules");
const { checkSlot } = require("./schedule");
const { bookingNotice } = require("./notifications");
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
  };
}
function asset(v) {
  v = str(v || "", "Kép", 500, false);
  if (v && !v.startsWith("/assets/") && !/^\/api\/media\/[a-f0-9-]{36}\.webp$/.test(v))
    fail("Válassz feltöltött képet.");
  return v;
}
async function serviceSave(id, data) {
  const s = serviceData(data);
  return transaction(async (c) => {
    if (id) {
      uuid(id);
      if (!(await one(c, "SELECT 1 FROM services WHERE id=$1", [id])))
        fail("A szolgáltatás nem található.", 404);
      if (!s.active && await one(c, `SELECT 1 FROM payment_orders p JOIN courses c ON c.id=p.course_id
        WHERE c.service_id=$1 AND p.status='pending' AND p.booking_id IS NULL`, [id]))
        fail('Folyamatban lévő fizetés alatt a szolgáltatás nem inaktiválható.',409);
      await c.query(
        "UPDATE services SET title=$2,description=$3,long_description=$4,category=$5,duration_minutes=$6,price=$7,capacity=$8,active=$9,image=$10,image_detail=$11,updated_at=clock_timestamp() WHERE id=$1",
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
      "INSERT INTO services(title,description,long_description,category,duration_minutes,price,capacity,active,image,image_detail) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *",
      Object.values(s),
    );
  });
}
async function save(id, data) {
  return transaction(async (c) => {
    const old = id
      ? await one(c, "SELECT * FROM courses WHERE id=$1", [uuid(id)])
      : null;
    if (id && !old) fail("Az időpont nem található.", 404);
    let service = data.service_id
      ? await one(c, "SELECT * FROM services WHERE id=$1", [
          uuid(data.service_id),
        ])
      : old
        ? await one(c, "SELECT * FROM services WHERE id=$1", [old.service_id])
        : await one(c, "SELECT * FROM services WHERE title=$1", [
            str(data.title, "Név"),
          ]);
    if (!service) fail("Először hozd létre a szolgáltatást.");
    if (!service.active)
      fail(
        "Inaktív szolgáltatáshoz nem hozható létre vagy módosítható időpont.",
      );
    const d = { ...old, ...data };
    const holds = old ? await one(c, "SELECT COALESCE(SUM(seats),0)::int AS n FROM payment_orders WHERE course_id=$1 AND status='pending' AND booking_id IS NULL", [id]) : {n:0};
    if (holds.n && (d.active === false || service.id !== old.service_id ||
        new Date(d.start_time).getTime() !== new Date(old.start_time).getTime() ||
        new Date(d.end_time).getTime() !== new Date(old.end_time).getTime()))
      fail('Folyamatban lévő fizetés alatt az alkalom nem helyezhető át és nem inaktiválható.',409);
    const price = integer(d.price ?? service.price, "Ár"),
      capacity = integer(d.capacity ?? service.capacity, "Kapacitás", 1, 100),
      active = d.active !== false;
    const used = old
      ? await one(
          c,
          "SELECT COALESCE(SUM(seats),0)::int AS n FROM bookings WHERE course_id=$1 AND status<>'cancelled'",
          [id],
        )
      : { n: 0 };
    if (old && used.n > 0 && old.service_id !== service.id)
      fail(
        "Foglalásokkal rendelkező alkalom szolgáltatása nem cserélhető. A foglalásokat külön helyezd át.",
        409,
      );
    if (used.n + holds.n > capacity)
      fail(
        "A kapacitás nem lehet kisebb a már lefoglalt helyek számánál.",
        409,
      );
    if (active) await checkSlot(c, d, id);
    else if (
      !d.start_time ||
      !d.end_time ||
      !Number.isFinite(Date.parse(d.start_time)) ||
      new Date(d.end_time) <= new Date(d.start_time)
    )
      fail("Hibás időtartam.");
    const values = [
      service.id,
      service.title,
      data.description ?? service.description,
      d.start_time,
      d.end_time,
      price,
      capacity,
      active,
    ];
    const slot = id
      ? await one(
          c,
          "UPDATE courses SET service_id=$2,title=$3,description=$4,start_time=$5,end_time=$6,price=$7,capacity=$8,active=$9,updated_at=clock_timestamp() WHERE id=$1 RETURNING *",
          [id, ...values],
        )
      : await one(
          c,
          "INSERT INTO courses(service_id,title,description,start_time,end_time,price,capacity,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
          values,
        );
    if (
      old &&
      (new Date(old.start_time).getTime() !==
        new Date(slot.start_time).getTime() ||
        new Date(old.end_time).getTime() !== new Date(slot.end_time).getTime())
    ) {
      const conflicts = await one(
        c,
        `SELECT 1 FROM bookings mine JOIN bookings other ON lower(mine.customer_email)=lower(other.customer_email) AND mine.id<>other.id JOIN courses oc ON oc.id=other.course_id WHERE mine.course_id=$1 AND other.course_id<>$1 AND mine.status<>'cancelled' AND other.status<>'cancelled' AND oc.start_time<$3 AND oc.end_time>$2`,
        [id, slot.start_time, slot.end_time],
      );
      if (conflicts)
        fail("Az új időpont ütközik egy résztvevő másik foglalásával.", 409);
      for (const b of (
        await c.query(
          "SELECT * FROM bookings WHERE course_id=$1 AND status<>'cancelled'",
          [id],
        )
      ).rows) {
        await c.query(
          "UPDATE bookings SET updated_at=clock_timestamp(),manage_expires=$2::timestamptz+interval '30 days' WHERE id=$1",
          [b.id, slot.end_time],
        );
        await bookingNotice(c, b, slot, "A képzés időpontja megváltozott");
      }
    }
    return slot;
  });
}
async function remove(id) {
  return transaction(async (c) => {
    uuid(id);
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
