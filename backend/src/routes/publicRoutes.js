const express=require('express'); const pool=require('../db');
const{one,transaction}=require('../domain/store');const{fail,str,email,integer}=require('../domain/rules');
const booking=require('../domain/bookings');const courses=require('../domain/courses');
const{allowed}=require('../domain/schedule');const{queue}=require('../domain/notifications');const{rateLimit}=require('../domain/auth');
const publicRouter=express.Router();
publicRouter.get("/courses", async (req, res) =>
  res.json(await courses.publicServices()),
);
publicRouter.get("/courses/:id", async (req, res) => {
  const s = await courses.resolveService(pool, req.params.id);
  if (!s || !s.active) fail("A képzés nem található.", 404);
  res.json(s);
});
publicRouter.get("/bookings/availability", async (req, res) => {
  const { courseId, year, month } = req.query;
  const values = [];
  let filter = "";
  if (courseId) {
    const s = await courses.resolveService(pool, courseId);
    if (!s || !s.active) return res.json([]);
    values.push(s.id);
    filter += ` AND c.service_id=$${values.length}`;
  }
  if (year || month) {
    integer(year, "Év", 2020, 2100);
    integer(month, "Hónap", 1, 12);
    values.push(`${year}-${String(month).padStart(2, "0")}-01`);
    filter += ` AND c.start_time>=($${values.length}::date::timestamp AT TIME ZONE 'Europe/Budapest') AND c.start_time<(($${values.length}::date+interval '1 month') AT TIME ZONE 'Europe/Budapest')`;
  }
  const rows = (
    await pool.query(
      `SELECT c.*,(COALESCE((SELECT SUM(seats) FROM bookings b WHERE b.course_id=c.id AND b.status<>'cancelled'),0)
        + COALESCE((SELECT SUM(seats) FROM payment_orders p WHERE p.course_id=c.id AND p.status='pending' AND p.booking_id IS NULL),0))::int AS booked_count
        FROM courses c JOIN services s ON s.id=c.service_id WHERE c.active AND s.active AND c.start_time>now() ${filter} ORDER BY c.start_time LIMIT 1000`,
      values,
    )
  ).rows;
  const result = [];
  for (const s of rows) {
    try {
      await allowed(pool, s);
      result.push({
        ...require("../domain/slotResponse")(s),
        available_spots: Math.max(0, s.capacity - s.booked_count),
        is_available: s.capacity > s.booked_count,
      });
    } catch (e) {
      if (e.status !== 409) throw e;
    }
  }
  res.json(result);
});
publicRouter.post('/bookings', rateLimit, async (req, res) => {
  const result = await booking.create(req.body, req.get('Idempotency-Key'));
  // The committed draft and request key let a failed Stripe request be retried safely.
  if (result.paymentId) Object.assign(result, await require('../payments/orders').checkout(result.paymentId));
  res.status(201).json(result);
});
publicRouter.get("/bookings/:id/manage", rateLimit, async (req, res) => {
  res.set("Cache-Control", "no-store");
  const b = await booking.managed(
    pool,
    req.params.id,
    req.get("X-Booking-Token"),
  );
  const settings = await one(
    pool,
    "SELECT cancellation_hours FROM settings WHERE id=1",
  );
  res.json({
    ...booking.publicBooking(b),
    cancellation_hours: settings.cancellation_hours,
    requests: (
      await pool.query(
        "SELECT * FROM change_requests WHERE booking_id=$1 ORDER BY created_at DESC",
        [b.id],
      )
    ).rows,
  });
});
publicRouter.post("/bookings/:id/requests", rateLimit, async (req, res) =>
  res
    .status(201)
    .json(
      await booking.request(
        req.params.id,
        req.get("X-Booking-Token"),
        req.body,
      ),
    ),
);
publicRouter.post("/inquiries", rateLimit, async (req, res) => {
  const d = req.body;
  const values = [
    str(d.name, "Név"),
    email(d.email),
    str(d.phone || "", "Telefon", 40, false),
    str(d.subject, "Tárgy"),
    str(d.message, "Üzenet", 6000),
  ];
  await transaction(async (c) => {
    await c.query(
      "INSERT INTO inquiries(name,email,phone,subject,message) VALUES($1,$2,$3,$4,$5)",
      values,
    );
    await queue(
      c,
      process.env.MAIL_ADMIN || process.env.MAIL_FROM,
      "Új ChocoLeaf megkeresés",
      values.join("\n"),
    );
  });
  res.status(201).json({
    message:
      "Megkeresésed megérkezett. Hamarosan felvesszük veled a kapcsolatot.",
  });
});
publicRouter.get("/content/:slug", async (req, res) => {
  const p = await one(pool, "SELECT * FROM content_pages WHERE slug=$1", [
    req.params.slug,
  ]);
  if (!p)
    fail(
      "A tartalom jelenleg nem érhető el. Kérjük, keress minket az info@chocoleaf.hu címen.",
      404,
    );
  res.json(p);
});

module.exports = publicRouter;
