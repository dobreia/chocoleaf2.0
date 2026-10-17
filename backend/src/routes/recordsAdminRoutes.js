const express=require('express');const pool=require('../db');const{one,transaction}=require('../domain/store');
const{fail,uuid,str,email}=require('../domain/rules');const booking=require('../domain/bookings');
const admin=express.Router();
admin.get("/dashboard", async (req, res) => {
  const counts = await one(
    pool,
    `SELECT count(*) FILTER(WHERE (c.start_time AT TIME ZONE 'Europe/Budapest')::date=(now() AT TIME ZONE 'Europe/Budapest')::date AND b.status<>'cancelled')::int AS today,count(*) FILTER(WHERE date_trunc('week',c.start_time AT TIME ZONE 'Europe/Budapest')=date_trunc('week',now() AT TIME ZONE 'Europe/Budapest') AND b.status<>'cancelled')::int AS week,count(*) FILTER(WHERE date_trunc('month',c.start_time AT TIME ZONE 'Europe/Budapest')=date_trunc('month',now() AT TIME ZONE 'Europe/Budapest') AND b.status<>'cancelled')::int AS month,count(*) FILTER(WHERE b.status='cancelled')::int AS cancelled,count(*) FILTER(WHERE b.status='completed')::int AS completed FROM bookings b JOIN courses c ON c.id=b.course_id`,
  );
  res.json({
    ...counts,
    next: (
      await pool.query(
        booking.select +
          " WHERE c.start_time>now() AND b.status IN ('pending','confirmed') ORDER BY c.start_time LIMIT 8",
      )
    ).rows.map(booking.publicBooking),
    popular: (
      await pool.query(
        "SELECT c.title,COALESCE(SUM(b.seats),0)::int AS count FROM bookings b JOIN courses c ON c.id=b.course_id WHERE b.status<>'cancelled' GROUP BY c.title ORDER BY count DESC LIMIT 5",
      )
    ).rows,
    unsent: (
      await one(
        pool,
        "SELECT count(*)::int AS n FROM outbox WHERE sent_at IS NULL",
      )
    ).n,
  });
});
admin.get("/customers", async (req, res) =>
  res.json(
    (
      await pool.query(
        `SELECT lower(customer_email) AS email,(array_agg(customer_name ORDER BY updated_at DESC))[1] AS name,(array_agg(customer_phone ORDER BY updated_at DESC))[1] AS phone,count(*)::int AS bookings,MAX(created_at) AS last_booking FROM bookings GROUP BY lower(customer_email) ORDER BY last_booking DESC`,
      )
    ).rows,
  ),
);
admin.put("/customers", async (req, res) =>
  res.json(
    await transaction(async (c) => {
      const old = email(req.body.original_email),
        address = email(req.body.email),
        name = str(req.body.name, "Név"),
        phone = str(req.body.phone || "", "Telefon", 40, false);
      if (old !== address)
        fail(
          "Az email címet foglalásonként módosítsd: ilyenkor új kezelési linket küldünk.",
        );
      const r = await c.query(
        "UPDATE bookings SET customer_name=$2,customer_phone=$3,updated_at=clock_timestamp() WHERE lower(customer_email)=$1",
        [old, name, phone],
      );
      return { updated: r.rowCount };
    }),
  ),
);
admin.get("/inquiries", async (req, res) =>
  res.json(
    (
      await pool.query(
        "SELECT * FROM inquiries ORDER BY created_at DESC LIMIT 500",
      )
    ).rows,
  ),
);
admin.patch("/inquiries/:id", async (req, res) => {
  if (!["new", "handled"].includes(req.body.status)) fail("Hibás státusz.");
  res.json(
    await one(pool, "UPDATE inquiries SET status=$2 WHERE id=$1 RETURNING *", [
      uuid(req.params.id),
      req.body.status,
    ]),
  );
});
admin.get("/content", async (req, res) =>
  res.json(
    (await pool.query("SELECT * FROM content_pages ORDER BY slug")).rows,
  ),
);
admin.put("/content/:slug", async (req, res) => {
  if (!["imprint", "privacy", "terms", "cookies"].includes(req.params.slug))
    fail("Hibás oldal.");
  res.json(
    await one(
      pool,
      "INSERT INTO content_pages(slug,title,body) VALUES($1,$2,$3) ON CONFLICT(slug) DO UPDATE SET title=$2,body=$3 RETURNING *",
      [
        req.params.slug,
        str(req.body.title, "Cím"),
        str(req.body.body, "Tartalom", 50000),
      ],
    ),
  );
});

module.exports = admin;
