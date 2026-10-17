const crypto = require('node:crypto');
const google = require('./google');
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function eventPayload(course) {
  const used = Number(course.booked_seats), capacity = Number(course.capacity);
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Budapest', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date(course.start_time));
  const url = google.config().origin + '/admin/calendar?' + new URLSearchParams({ date, course: course.id });
  return {
    summary: `${course.title} · ${used}/${capacity} fő`,
    description: `Foglalt helyek: ${used} / ${capacity} fő\nSzabad helyek: ${Math.max(0, capacity - used)} fő\n${used >= capacity ? 'BETELT' : used === 0 ? 'Még nincs foglalás' : 'Még foglalható'}\n\nRészletek és résztvevők (admin belépés szükséges):\n${url}\n\nA módosításokat a ChocoLeaf adminban végezd. Ez az esemény automatikusan frissül.`,
    start: { dateTime: new Date(course.start_time).toISOString(), timeZone: 'Europe/Budapest' },
    end: { dateTime: new Date(course.end_time).toISOString(), timeZone: 'Europe/Budapest' },
    status: 'confirmed', transparency: 'opaque', visibility: 'default',
    reminders: { useDefault: true },
    source: { title: 'ChocoLeaf admin', url },
    extendedProperties: { private: { chocoleafCourseId: course.id } },
  };
}
async function courses(db) {
  return (await db.query(`SELECT c.id, c.title, c.start_time, c.end_time, c.capacity, c.active,
    s.active AS service_active,
    COALESCE((SELECT SUM(b.seats) FROM bookings b WHERE b.course_id=c.id AND b.status<>'cancelled'),0)::int AS booked_seats
    FROM courses c JOIN services s ON s.id=c.service_id
    WHERE c.end_time >= now()-interval '30 days' OR EXISTS (SELECT 1 FROM calendar_events e WHERE e.course_id=c.id)
    ORDER BY c.start_time`)).rows;
}
async function reconcile(db) {
  const rows = await courses(db), seen = new Set();
  for (const c of rows) {
    seen.add(c.id);
    const payload = c.active && c.service_active ? eventPayload(c) : null;
    // Do not create tombstones for never-exported inactive courses.
    if (!payload && !(await db.query('SELECT 1 FROM calendar_events WHERE course_id=$1', [c.id])).rowCount) continue;
    await db.query(`INSERT INTO calendar_events(course_id,event_id,desired,desired_hash) VALUES($1,$2,$3,$4)
      ON CONFLICT(course_id) DO UPDATE SET desired=EXCLUDED.desired, desired_hash=EXCLUDED.desired_hash,
      attempts=CASE WHEN calendar_events.desired_hash<>EXCLUDED.desired_hash THEN 0 ELSE calendar_events.attempts END,
      next_attempt_at=CASE WHEN calendar_events.desired_hash<>EXCLUDED.desired_hash THEN now() ELSE calendar_events.next_attempt_at END,
      last_error=CASE WHEN calendar_events.desired_hash<>EXCLUDED.desired_hash THEN NULL ELSE calendar_events.last_error END`,
    [c.id, crypto.randomUUID().replaceAll('-', ''), payload, digest(payload)]);
  }
  const old = (await db.query('SELECT course_id FROM calendar_events')).rows;
  for (const e of old) if (!seen.has(e.course_id)) await db.query(
    `UPDATE calendar_events SET desired=NULL,desired_hash=$2,next_attempt_at=now() WHERE course_id=$1 AND desired IS NOT NULL`, [e.course_id, digest(null)]);
  await db.query('UPDATE calendar_connection SET last_scan_at=now() WHERE id=1');
}
module.exports = { digest, eventPayload, courses, reconcile };
