const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { invitation, LOCATION } = require('../src/lib/calendarInvite');
Object.assign(process.env, { NODE_ENV: 'test', MAIL_FROM: 'ChocoLeaf <calendar@example.test>',
  MAIL_ADMIN: 'admin@example.test', MAIL_USER: '', SMTP_HOST: '', FRONTEND_URL: 'http://localhost:5173' });
let db, courses, bookings, notifications, offset = 200;
const at = (day, hour = 9) => new Date(Date.now() + day * 86400000).toISOString().slice(0, 10) + `T${String(hour).padStart(2, '0')}:00:00Z`;

before(async () => {
  db = await require('./database.cjs')();
  await require('../src/migrate')();
  courses = require('../src/domain/courses');
  bookings = require('../src/domain/bookings');
  notifications = require('../src/domain/notifications');
});
after(async () => db?.end());

async function fixture(count = 2) {
  const day = offset;
  offset += 8;
  const service = await courses.serviceSave(null, { title: 'Csokoládé ' + randomUUID(), duration_minutes: 90,
    price: 19000, capacity: 6, session_count: count });
  const group = await courses.save(null, { service_id: service.id,
    sessions: Array.from({ length: count }, (_, i) => ({ start_time: at(day + i), end_time: at(day + i, i ? 12 : 11) })) });
  const result = await bookings.create({ courseId: group.id, customerName: 'Árvíztűrő Vendég',
    customerEmail: randomUUID() + '@example.test', seats: 2 }, randomUUID(), { manual: true });
  return { group, booking: result.booking, day };
}
const mails = async id => (await db.query("SELECT * FROM outbox WHERE calendar->>'uid' LIKE $1", [id + '.%'])).rows;
const states = async id => (await db.query('SELECT * FROM booking_calendar_events WHERE booking_id=$1', [id])).rows;
const sent = id => db.query("UPDATE outbox SET sent_at=now() WHERE calendar->>'uid' LIKE $1", [id + '.%']);
const unfold = ics => ics.replace(/\r\n[ \t]/g, '');

test('pending bookings get no invites; confirmation creates one private, numbered invitation per session', async () => {
  const { group, booking } = await fixture();
  assert.equal((await mails(booking.id)).length, 0);
  await bookings.update(booking.id, { status: 'confirmed' });
  const rows = await mails(booking.id);
  assert.equal(rows.length, 2);
  for (const [i, session] of group.sessions.entries()) {
    const row = rows.find(row => row.calendar.uid.includes(session.id));
    assert.equal(row.recipient, booking.customer_email);
    assert.equal(row.calendar.method, 'REQUEST');
    assert.equal(row.calendar.sequence, 0);
    const ics = unfold(row.calendar.content);
    assert.match(ics, /METHOD:REQUEST\r\n/);
    assert(ics.includes(`SUMMARY:${group.title} – ${i + 1}/2. alkalom\r\n`));
    assert(ics.includes(`DTSTART:${new Date(session.start_time).toISOString().replace(/[-:]/g, '').replace('.000', '')}`));
    assert.match(ics, /ORGANIZER;CN="ChocoLeaf":mailto:calendar@example.test/);
    assert.equal((ics.match(/ATTENDEE;/g) || []).length, 1);
    assert(ics.includes('mailto:' + booking.customer_email));
    assert.doesNotMatch(ics, /admin@example|BEGIN:VALARM|booking\/manage#|Belső megjegyzés/);
    assert.match(row.body, /fogadd el a meghívót/);
    assert.match(row.body, /nem módosítja a foglalásodat/);
    assert.equal(row.attachments.length, 0);
  }
  assert((await states(booking.id)).every(row => row.active));
  await require('../src/migrate')();
  assert.equal((await states(booking.id)).length, 2);
});

test('an unchanged save and a pending cancellation request do not send new invites or cancel events', async () => {
  const { booking } = await fixture();
  await bookings.update(booking.id, { status: 'confirmed' });
  await sent(booking.id);
  await bookings.update(booking.id, { admin_note: 'Only the admin sees this' });
  assert.equal((await mails(booking.id)).length, 2);
  const notice = (await db.query('SELECT body FROM outbox WHERE recipient=$1 AND calendar IS NULL', [booking.customer_email])).rows.find(row => row.body.includes('booking/manage#'));
  const token = notice.body.match(/booking\/manage#[\w-]+\.([a-f\d]{64})/)[1];
  const request = await bookings.request(booking.id, token, { kind: 'cancel' });
  assert.equal((await mails(booking.id)).length, 2);
  assert((await states(booking.id)).every(row => row.active));
  await bookings.resolve(request.id, 'approved');
  const cancelled = (await mails(booking.id)).filter(row => row.calendar.method === 'CANCEL');
  assert.equal(cancelled.length, 2);
  for (const row of cancelled) {
    assert.equal(row.calendar.sequence, 1);
    assert.match(unfold(row.calendar.content), /STATUS:CANCELLED/);
  }
  await bookings.update(booking.id, { status: 'cancelled' });
  assert.equal((await mails(booking.id)).filter(row => row.calendar.method === 'CANCEL').length, 2);
});

test('three sessions, including two on one day, remain separate and an unconfirmed cancellation has no calendar mail', async () => {
  const { group, booking, day } = await fixture(3);
  await courses.save(group.id, { sessions: group.sessions.map((session, i) => i === 1
    ? { ...session, start_time: at(day, 14), end_time: at(day, 17) } : session) });
  await bookings.update(booking.id, { status: 'confirmed' });
  const messages = await mails(booking.id);
  assert.equal(messages.length, 3);
  for (const index of [1, 2, 3]) assert(messages.some(row => row.subject.includes(`${index}/3. alkalom`)));
  assert.equal(new Set(messages.map(row => row.calendar.uid)).size, 3);
  const pending = await fixture(1);
  await bookings.update(pending.booking.id, { status: 'cancelled' });
  assert.equal((await mails(pending.booking.id)).length, 0);
});

test('moving one session updates only that event with its original UID and a higher sequence', async () => {
  const { group, booking, day } = await fixture();
  await bookings.update(booking.id, { status: 'confirmed' });
  const original = await mails(booking.id);
  await sent(booking.id);
  await courses.save(group.id, { sessions: group.sessions.map((s, i) => i ? { ...s, start_time: at(day + 2, 10), end_time: at(day + 2, 13) } : s) });
  const rows = await mails(booking.id);
  assert.equal(rows.length, 3);
  const updated = rows.find(row => row.calendar.sequence === 1);
  assert.equal(updated.calendar.uid, original.find(row => row.calendar.uid.includes(group.sessions[1].id)).calendar.uid);
  assert.equal(updated.calendar.method, 'REQUEST');
  assert.match(unfold(updated.calendar.content), /2\/2\. alkalom/);
  assert(unfold(updated.calendar.content).includes(at(day + 2, 10).replace(/[-:]/g, '')));
  await assert.rejects(courses.save(group.id, { sessions: group.sessions.map(s => ({ ...s, end_time: s.start_time })) }));
  assert.equal((await mails(booking.id)).length, 3, 'failed updates roll back the invitations too');
});

test('rescheduling to another course cancels the original dates and invites all replacement sessions', async () => {
  const { group, booking, day } = await fixture();
  await bookings.update(booking.id, { status: 'confirmed' });
  await sent(booking.id);
  const target = await courses.save(null, { service_id: group.service_id,
    sessions: [3, 4].map(i => ({ start_time: at(day + i), end_time: at(day + i, 11) })) });
  await bookings.update(booking.id, { course_id: target.id });
  const rows = await mails(booking.id);
  assert.equal(rows.filter(row => row.calendar.method === 'CANCEL').length, 2);
  assert.equal(rows.filter(row => row.calendar.method === 'REQUEST' && !row.sent_at).length, 2);
  const active = (await states(booking.id)).filter(row => row.active);
  assert.equal(active.length, 2);
  assert(active.every(row => target.sessions.some(s => row.uid.includes(s.id))));
});

test('changing the customer email cancels the old recipient and invites only the new recipient', async () => {
  const { booking } = await fixture();
  await bookings.update(booking.id, { status: 'confirmed' });
  await sent(booking.id);
  const email = randomUUID() + '@example.test';
  await bookings.update(booking.id, { customer_email: email });
  const rows = await mails(booking.id);
  assert.equal(rows.filter(row => row.calendar.method === 'CANCEL' && row.recipient === booking.customer_email).length, 2);
  const fresh = rows.filter(row => row.recipient === email);
  assert.equal(fresh.length, 2);
  assert(fresh.every(row => !unfold(row.calendar.content).includes(booking.customer_email)));
});

test('renaming a service updates its confirmed calendar events while preserving the organizer', async () => {
  const { group, booking } = await fixture();
  await bookings.update(booking.id, { status: 'confirmed' });
  const original = await states(booking.id);
  const service = (await db.query('SELECT * FROM services WHERE id=$1', [group.service_id])).rows[0];
  const oldFrom = process.env.MAIL_FROM;
  process.env.MAIL_FROM = 'Other <other@example.test>';
  try {
    await courses.serviceSave(service.id, { ...service, title: service.title + ' – új név' });
    const updated = await states(booking.id);
    assert.equal(updated.length, 2);
    for (const row of updated) {
      assert.equal(row.sequence, 1);
      assert.equal(row.payload.organizer, original.find(old => old.uid === row.uid).payload.organizer);
      assert.match(row.payload.title, /új név$/);
    }
  } finally { process.env.MAIL_FROM = oldFrom; }
});

test('unconfirmed status removes invitations, re-confirmation reuses identity and completion preserves history', async () => {
  const { booking } = await fixture(1);
  await bookings.update(booking.id, { status: 'confirmed' });
  const uid = (await states(booking.id))[0].uid;
  await bookings.update(booking.id, { status: 'pending' });
  assert.equal((await states(booking.id))[0].active, false);
  await bookings.update(booking.id, { status: 'confirmed' });
  const event = (await states(booking.id))[0];
  assert.equal(event.uid, uid);
  assert.equal(event.sequence, 2);
  assert(event.active);
  const { syncBookingCalendar } = require('../src/domain/bookingCalendar');
  const c = await db.connect();
  try {
    await c.query('BEGIN');
    await syncBookingCalendar(c, { ...booking, status: 'completed' }, {}, []);
    await c.query('COMMIT');
  } finally { c.release(); }
  assert.equal((await states(booking.id))[0].active, true);
});

test('iCalendar escapes text and parameter injection, folds UTF-8 safely, and represents DST instants in UTC', () => {
  const ics = invitation({ uid: 'safe@example.test', sequence: 3, method: 'REQUEST', now: '2026-10-18T10:00:00Z',
    payload: { bookingId: 'b', title: 'Árvíztűrő '.repeat(20) + ',;\\\nBEGIN:VALARM', name: 'Vendég"\r\nINJECTED:yes',
      email: 'guest@example.test', organizer: 'calendar@example.test', location: LOCATION, seats: 1, index: 1, count: 2,
      start: '2027-03-28T01:30:00+01:00', end: '2027-03-28T04:30:00+02:00' } });
  for (const line of ics.split('\r\n')) assert(Buffer.byteLength(line) <= 75);
  assert.equal(Buffer.from(ics).toString('utf8'), ics);
  const plain = unfold(ics);
  assert.match(plain, /DTSTART:20270328T003000Z/);
  assert.match(plain, /DTEND:20270328T023000Z/);
  assert.doesNotMatch(plain, /\r\n(?:BEGIN:VALARM|INJECTED:yes)/);
  assert.match(plain, /CN="Vendég\^'\^nINJECTED:yes"/);
  assert.match(plain, /\\,\\;\\\\\\nBEGIN:VALARM/);
});

test('SMTP delivers real calendar MIME; a failure preserves the event identity and retry sends it once', async () => {
  await db.query('DELETE FROM outbox');
  const { booking } = await fixture(1);
  await bookings.update(booking.id, { status: 'confirmed' });
  await db.query('DELETE FROM outbox WHERE calendar IS NULL');
  const initial = (await mails(booking.id))[0];
  const mailer = require('nodemailer'), original = mailer.createTransport;
  const smtp = await require('./smtp.cjs')();
  Object.assign(process.env, { SMTP_HOST: '127.0.0.1', SMTP_PORT: String(smtp.port), MAIL_PASS: '' });
  try {
    mailer.createTransport = () => ({ sendMail: async () => { throw Error('SMTP unavailable'); } });
    await notifications.deliver();
    let row = (await mails(booking.id))[0];
    assert.equal(row.sent_at, null);
    assert.equal(row.attempts, 1);
    assert.deepEqual(row.calendar, initial.calendar);
    mailer.createTransport = original;
    await db.query('UPDATE outbox SET next_attempt=now() WHERE id=$1', [row.id]);
    await notifications.deliver();
    row = (await mails(booking.id))[0];
    assert(row.sent_at);
    assert.equal(smtp.messages.length, 1);
    const mime = smtp.messages[0];
    assert.match(mime, /Content-Type: text\/calendar; charset=utf-8; method=REQUEST/i);
    assert.match(mime, /Content-Type: application\/ics/i);
    assert.match(mime, /From: ChocoLeaf <calendar@example.test>/);
    assert.doesNotMatch(mime, /application\/pdf|admin@example.test/);
    const attachment = mime.split(/^--[^\n]+\n/m).find(part => /Content-Type: application\/ics/i.test(part));
    assert.match(attachment, /Content-Transfer-Encoding: base64/i);
    assert.equal(Buffer.from(attachment.split('\n\n')[1].replace(/\s/g, ''), 'base64').toString('utf8'), initial.calendar.content);
    await notifications.deliver();
    assert.equal(smtp.messages.length, 1);
    await bookings.update(booking.id, { status: 'cancelled' });
    await db.query('DELETE FROM outbox WHERE calendar IS NULL');
    await notifications.deliver();
    assert.equal(smtp.messages.length, 2);
    assert.match(smtp.messages[1], /Content-Type: text\/calendar; charset=utf-8; method=CANCEL/i);
    const cancelled = (await mails(booking.id)).find(mail => mail.calendar.method === 'CANCEL');
    assert.equal(cancelled.calendar.uid, initial.calendar.uid);
    assert.equal(cancelled.calendar.sequence, 1);
    assert(cancelled.sent_at);
  } finally {
    mailer.createTransport = original;
    process.env.SMTP_HOST = '';
    await smtp.close();
  }
});
