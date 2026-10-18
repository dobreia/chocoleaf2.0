const { createHash } = require('node:crypto');
const { invitation, eventTitle, organizer, LOCATION } = require('../lib/calendarInvite');

async function syncBookingCalendar(c, booking, slot, sessions) {
  // Serialize updates even when a notification comes from a change request.
  await c.query('SELECT id FROM bookings WHERE id=$1 FOR UPDATE', [booking.id]);
  const previous = (await c.query('SELECT * FROM booking_calendar_events WHERE booking_id=$1 FOR UPDATE', [booking.id])).rows;
  const oldById = new Map(previous.map(event => [event.uid, event]));
  // Completing a course keeps its events as history; it is not a cancellation.
  if (['completed', 'no-show'].includes(booking.status)) return;
  const desired = new Map();
  if (booking.status === 'confirmed') {
    for (const [i, session] of sessions.entries()) {
      const recipient = createHash('sha256').update(booking.customer_email.toLowerCase()).digest('hex').slice(0, 24);
      const uid = `${booking.id}.${session.id}.${recipient}@chocoleaf.hu`;
      desired.set(uid, {
        bookingId: booking.id, title: slot.title, name: booking.customer_name,
        email: booking.customer_email, organizer: oldById.get(uid)?.payload.organizer || organizer(), location: LOCATION,
        seats: booking.seats, index: i + 1, count: sessions.length,
        start: new Date(session.start_time).toISOString(), end: new Date(session.end_time).toISOString(),
      });
    }
  }
  for (const old of previous) {
    if (old.active && !desired.has(old.uid)) await save(old.uid, old.payload, old, 'CANCEL');
  }
  for (const [uid, payload] of desired) {
    const old = oldById.get(uid);
    if (old?.active && Object.keys(payload).every(key => payload[key] === old.payload[key])) continue;
    await save(uid, payload, old, 'REQUEST');
  }

  async function save(uid, payload, old, method) {
    const sequence = old ? old.sequence + 1 : 0;
    const calendar = { uid, sequence, method, filename: 'chocoleaf-alkalom.ics',
      content: invitation({ uid, sequence, payload, method }), from: `ChocoLeaf <${payload.organizer}>` };
    const date = value => new Date(value).toLocaleString('hu-HU', { timeZone: 'Europe/Budapest' });
    const action = method === 'CANCEL' ? 'Naptáresemény törlése' : old ? 'Naptáresemény frissítése' : 'Naptármeghívó';
    const body = `Kedves ${payload.name}!\n\n${action}: ${eventTitle(payload)}\n` +
      `${date(payload.start)} – ${date(payload.end)} (budapesti idő)\n${payload.location}\n\n` +
      (method === 'CANCEL' ? 'Ez az alkalom már nem tartozik az érvényes foglalásodhoz.\n' :
        'Ha az időpont még nem jelenik meg a naptáradban, fogadd el a meghívót.\n') +
      'A naptári elfogadás vagy elutasítás nem módosítja a foglalásodat. ' +
      'Módosítást vagy lemondást az eredeti visszaigazoló levél foglaláskezelő linkjén kérhetsz.\n\nChocoLeaf';
    // Never retry an obsolete invitation after a newer revision has been queued.
    await c.query("DELETE FROM outbox WHERE sent_at IS NULL AND calendar->>'uid'=$1", [uid]);
    await c.query('INSERT INTO outbox(recipient,subject,body,calendar) VALUES($1,$2,$3,$4)',
      [payload.email, `ChocoLeaf – ${action}: ${eventTitle(payload)}`, body, JSON.stringify(calendar)]);
    await c.query(`INSERT INTO booking_calendar_events(uid,booking_id,sequence,active,payload) VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(uid) DO UPDATE SET sequence=EXCLUDED.sequence,active=EXCLUDED.active,payload=EXCLUDED.payload,updated_at=clock_timestamp()`,
      [uid, booking.id, sequence, method !== 'CANCEL', JSON.stringify(payload)]);
  }
}

module.exports = { syncBookingCalendar };
