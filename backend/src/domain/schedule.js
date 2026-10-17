const { one } = require("./store");
const { fail, instant, uuid } = require("./rules");
const { getSessions } = require('./courseSessions');
async function allowed(c, slot) {
  if (slot.sessions?.length) {
    for (const session of slot.sessions) await allowed(c, {...session, id:slot.id});
    return;
  }
  // Only legacy global blackout periods remain relevant. Weekly hours and
  // employee-specific restrictions are intentionally not used.
  if (await one(c,
    "SELECT 1 FROM blocked_periods WHERE staff_id IS NULL AND start_time<$2 AND end_time>$1",
    [slot.start_time, slot.end_time]))
    fail("Az időpont tiltott időszakra esik.", 409);
  if (
    await one(
      c,
      `SELECT 1 FROM courses c JOIN course_session_times st ON st.course_id=c.id WHERE c.active AND c.id IS DISTINCT FROM $3::uuid AND st.start_time<$2 AND st.end_time>$1`,
      [slot.start_time, slot.end_time, slot.id || null],
    )
  )
    fail(
      "Ez az időpont ütközik egy másik aktív alkalommal.",
      409,
    );
}

async function checkSlot(c, slot, id = null) {
  const start = instant(slot.start_time),
    end = instant(slot.end_time);
  if (end <= start) fail("A befejezés legyen a kezdés után.");
  if (start <= new Date())
    fail("Múltbeli időpont nem hozható létre vagy helyezhető át.");
  await allowed(c, { ...slot, id });
}
async function checkBooking(c, courseId, seats, exclude = null, email = null) {
  uuid(courseId);
  const slot = await one(
    c,
    "SELECT c.*,s.active AS service_active FROM courses c JOIN services s ON s.id=c.service_id WHERE c.id=$1 FOR UPDATE OF c",
    [courseId],
  );
  if (!slot || !slot.active || !slot.service_active)
    fail("Az időpont vagy a szolgáltatás már nem aktív.", 409);
  if (new Date(slot.start_time) <= new Date())
    fail("Múltbeli időpontra nem lehet foglalni.", 409);
  slot.sessions = await getSessions(c, slot.id);
  await allowed(c, slot);
  const used = await one(
    c,
    "SELECT COALESCE(SUM(seats),0)::int AS n FROM bookings WHERE course_id=$1 AND status<>'cancelled' AND id IS DISTINCT FROM $2::uuid",
    [courseId, exclude],
  );
  const holds = await one(c, "SELECT COALESCE(SUM(seats),0)::int AS n FROM payment_orders WHERE course_id=$1 AND status='pending' AND booking_id IS NULL", [courseId]);
  if (used.n + holds.n + seats > slot.capacity)
    fail("Nincs elegendő szabad hely erre az időpontra.", 409);
  for (const session of slot.sessions) {
  if (
    email &&
    (await one(
      c,
      `SELECT 1 FROM bookings b JOIN course_session_times st ON st.course_id=b.course_id WHERE lower(b.customer_email)=lower($1) AND b.status<>'cancelled' AND b.id IS DISTINCT FROM $2::uuid AND st.start_time<$4 AND st.end_time>$3`,
      [email, exclude, session.start_time, session.end_time],
    ))
  )
    fail("Ezzel az email címmel már van foglalás az érintett időszakban.", 409);
  if (email && await one(c, `SELECT 1 FROM payment_orders p JOIN course_session_times st ON st.course_id=p.course_id
    WHERE lower(p.email)=lower($1) AND p.status='pending' AND p.booking_id IS NULL AND st.start_time<$3 AND st.end_time>$2`,
  [email,session.start_time,session.end_time])) fail('Ezzel az email címmel már folyamatban van egy fizetés erre az időszakra.',409);
  }
  return slot;
}
module.exports = { allowed, checkSlot, checkBooking };
