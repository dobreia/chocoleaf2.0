const express=require('express');const pool=require('../db');const{one,transaction}=require('../domain/store');
const{fail,uuid}=require('../domain/rules');const courses=require('../domain/courses');
const slotResponse=require('../domain/slotResponse');
const admin=express.Router();
admin.get("/services", async (req, res) =>
  res.json((await pool.query("SELECT * FROM services ORDER BY title")).rows),
);
admin.post("/services", async (req, res) =>
  res.status(201).json(await courses.serviceSave(null, req.body)),
);
admin.put("/services/:id", async (req, res) =>
  res.json(await courses.serviceSave(req.params.id, req.body)),
);
admin.delete("/services/:id", async (req, res) =>
  res.json(
    await transaction(async (c) => {
      uuid(req.params.id);
      if (await one(c, `SELECT 1 FROM payment_orders p JOIN courses c ON c.id=p.course_id
        WHERE c.service_id=$1 AND p.status='pending' AND p.booking_id IS NULL`, [req.params.id]))
        fail('Folyamatban lévő fizetés alatt a szolgáltatás nem inaktiválható.',409);
      const s = await one(
        c,
        "UPDATE services SET active=false,updated_at=clock_timestamp() WHERE id=$1 RETURNING *",
        [req.params.id],
      );
      if (!s) fail("Nem található.", 404);
      return s;
    }),
  ),
);
admin.get("/courses", async (req, res) =>
  res.json(
    (
      await pool.query(
        "SELECT c.*,s.title,s.active AS service_active,COALESCE((SELECT SUM(seats) FROM bookings b WHERE b.course_id=c.id AND b.status<>'cancelled'),0)::int AS booked_seats FROM courses c JOIN services s ON s.id=c.service_id ORDER BY c.start_time",
      )
    ).rows.map(slotResponse),
  ),
);
admin.get("/courses/:id/slots", async (req, res) => {
  const s = await courses.resolveService(pool, req.params.id);
  if (!s) fail("Nem található.", 404);
  const rows = (
    await pool.query(
      "SELECT c.*,COALESCE((SELECT SUM(seats) FROM bookings b WHERE b.course_id=c.id AND b.status<>'cancelled'),0)::int AS booked_count FROM courses c WHERE service_id=$1 ORDER BY start_time",
      [s.id],
    )
  ).rows;
  res.json({
    course: s,
    slots: rows.map((x) => ({
      ...slotResponse(x),
      available_spots: x.capacity - x.booked_count,
    })),
  });
});
admin.post("/courses", async (req, res) =>
  res.status(201).json(slotResponse(await courses.save(null, req.body))),
);
admin.put("/courses/:id", async (req, res) =>
  res.json(slotResponse(await courses.save(req.params.id, req.body))),
);
admin.delete("/courses/:id", async (req, res) =>
  res.json(slotResponse(await courses.remove(req.params.id))),
);

module.exports = admin;
