const express=require('express');const pool=require('../db');const{one,transaction}=require('../domain/store');
const{fail,uuid,str,integer}=require('../domain/rules');const booking=require('../domain/bookings');
const admin=express.Router();
admin.get("/bookings", async (req, res) => {
  const p = [],
    w = [], dates = [];
  for (const [field, col] of [
    ["status", "b.status"],
    ["service", "c.service_id"],
  ])
    if (req.query[field]) {
      p.push(req.query[field]);
      w.push(`${col}=$${p.length}`);
    }
  if (req.query.q) {
    p.push("%" + str(req.query.q, "Keresés", 200) + "%");
    w.push(
      `(b.customer_name ILIKE $${p.length} OR b.customer_email ILIKE $${p.length} OR c.title ILIKE $${p.length})`,
    );
  }
  if (req.query.from) {
    p.push(req.query.from);
    dates.push(
      `st.start_time>=($${p.length}::date::timestamp AT TIME ZONE 'Europe/Budapest')`,
    );
  }
  if (req.query.to) {
    p.push(req.query.to);
    dates.push(
      `st.start_time<(($${p.length}::date+1)::timestamp AT TIME ZONE 'Europe/Budapest')`,
    );
  }
  if (dates.length) w.push(`EXISTS(SELECT 1 FROM course_session_times st WHERE st.course_id=c.id AND ${dates.join(' AND ')})`);
  const where = w.length ? " WHERE " + w.join(" AND ") : "";
  const total = await one(
    pool,
    "SELECT COUNT(*)::int AS total FROM bookings b JOIN courses c ON c.id=b.course_id" +
      where,
    p,
  );
  const page = integer(req.query.page || 1, "Oldal", 1, 1000000),
    limit = integer(req.query.limit || 25, "Oldalméret", 1, 100);
  const order = req.query.sort === "asc" ? "ASC" : "DESC";
  const rows = (
    await pool.query(
      booking.select +
        where +
        ` ORDER BY c.start_time ${order},b.id LIMIT $${p.length + 1} OFFSET $${p.length + 2}`,
      [...p, limit, (page - 1) * limit],
    )
  ).rows.map(({ manage_hash, request_key, ...b }) => b);
  res.json({ items: rows, total: total.total, page, limit });
});
admin.get("/bookings/:id", async (req, res) => {
  const b = await one(pool, booking.select + " WHERE b.id=$1", [
    uuid(req.params.id),
  ]);
  if (!b) fail("A foglalás nem található.", 404);
  const { manage_hash, request_key, ...safe } = b;
  res.json(safe);
});
admin.post("/bookings", async (req, res) =>
  res
    .status(201)
    .json(await booking.create(req.body, req.get("Idempotency-Key"), { manual: true })),
);
admin.patch("/bookings/:id", async (req, res) =>
  res.json(
    booking.publicBooking(await booking.update(req.params.id, req.body)),
  ),
);
admin.delete("/bookings/:id", async (req, res) =>
  res.json(
    await transaction(async (c) => {
      const b = await one(c, "SELECT * FROM bookings WHERE id=$1 FOR UPDATE", [
        uuid(req.params.id),
      ]);
      if (!b) fail("Nem található.", 404);
      if (b.status !== "cancelled" || b.payment_status === "paid")
        fail(
          "Csak lemondott, nem fizetett vagy visszatérített foglalás törölhető.",
          409,
        );
      if (b.payment_status === 'refunded') {
        // Preserve the completed payment and invoice history independently of
        // the removed booking. Paid orders ignore repeated checkout webhooks.
        await c.query(`UPDATE payment_orders SET booking_id=NULL,
          course_id=COALESCE(course_id,$2), seats=COALESCE(seats,$3),
          booking_data=COALESCE(booking_data,$4::jsonb)
          WHERE booking_id=$1 AND status='paid'`,
        [b.id,b.course_id,b.seats,JSON.stringify({customer_name:b.customer_name,customer_phone:b.customer_phone,note:b.note})]);
      }
      await c.query("DELETE FROM bookings WHERE id=$1", [b.id]);
      return { ok: true };
    }),
  ),
);
admin.post("/bookings/:id/send-link", async (req, res) =>
  res.json(
    await transaction(async (c) => {
      const { token, hash } = require("../domain/rules");
      const b = await one(c, booking.select + " WHERE b.id=$1", [
        uuid(req.params.id),
      ]);
      if (!b) fail("A foglalás nem található.", 404);
      if (new Date(b.end_time) <= new Date())
        fail("Lejárt foglaláshoz nem küldhető új kezelési link.");
      const t = token();
      await c.query(
        "UPDATE bookings SET manage_hash=$2,manage_expires=$3::timestamptz+interval '30 days' WHERE id=$1",
        [b.id, hash(t), b.end_time],
      );
      await require("../domain/notifications").bookingNotice(
        c,
        b,
        { title: b.course_title, start_time: b.start_time },
        "Új foglaláskezelő linked",
        t,
      );
      return {
        message:
          "Az új kezelési link kézbesítésre vár. A korábbi link érvényét vesztette.",
      };
    }),
  ),
);
admin.get("/requests", async (req, res) =>
  res.json(
    (
      await pool.query(
        `SELECT r.*,b.customer_name,c.title,c.start_time,t.start_time AS target_start_time FROM change_requests r JOIN bookings b ON b.id=r.booking_id JOIN courses c ON c.id=b.course_id LEFT JOIN courses t ON t.id=r.target_course_id WHERE r.status='pending' ORDER BY r.created_at`,
      )
    ).rows,
  ),
);
admin.patch("/requests/:id", async (req, res) =>
  res.json(await booking.resolve(req.params.id, req.body.status)),
);

module.exports = admin;
