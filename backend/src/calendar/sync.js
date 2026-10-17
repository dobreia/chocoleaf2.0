const crypto = require('node:crypto');
const pool = require('../db');
const google = require('./google');
const { reconcile } = require('./events');
const LOCK = 829106;
async function locked(fn, { skip = false } = {}) {
  const db = await pool.connect();
  let acquired = false;
  try {
    acquired = (await db.query('SELECT pg_try_advisory_lock($1) AS acquired', [LOCK])).rows[0].acquired;
    if (!acquired) {
      if (skip) return;
      const e = new Error('A naptár éppen frissül. Próbáld újra néhány másodperc múlva.'); e.status = 409; throw e;
    }
    return await fn(db);
  } finally {
    try { if (acquired) await db.query('SELECT pg_advisory_unlock($1)', [LOCK]); }
    finally { db.release(); }
  }
}
async function ensureCalendar(db, connection, access) {
  if (connection.calendar_id) {
    try { await google.api(access, '/calendars/' + encodeURIComponent(connection.calendar_id)); return connection.calendar_id; }
    catch (e) { if (![404,410].includes(e.statusCode)) throw e; }
  }
  // Recover a previous creation whose HTTP response or DB write was interrupted.
  const marker = 'ChocoLeaf sync: ' + connection.marker;
  let page, found;
  do {
    const params = new URLSearchParams({ minAccessRole:'owner', showHidden:'true', maxResults:'250', ...(page ? { pageToken: page } : {}) });
    const list = await google.api(access, '/users/me/calendarList?' + params);
    found = list.items?.find(c => c.description?.includes(marker));
    page = list.nextPageToken;
  } while (!found && page);
  if (!found) found = await google.api(access, '/calendars', 'POST', {
    summary:'ChocoLeaf kurzusok', timeZone:'Europe/Budapest',
    description: 'Automatikusan frissülő kurzusok és létszámok. Módosítás: ChocoLeaf admin.\n' + marker,
  });
  if (!found.id) throw new google.GoogleError(503, 'invalid_response');
  if (connection.calendar_id !== found.id) {
    // A deleted/replaced calendar needs every existing course sent again.
    await db.query('UPDATE calendar_events SET synced_hash=NULL,next_attempt_at=now(),attempts=0,last_error=NULL');
    await db.query('UPDATE calendar_connection SET calendar_id=$1 WHERE id=1', [found.id]);
  }
  return found.id;
}
async function writeEvent(db, access, calendarId, row) {
  const path = '/calendars/' + encodeURIComponent(calendarId) + '/events';
  const item = path + '/' + row.event_id;
  if (!row.desired) {
    try { await google.api(access, item, 'DELETE'); }
    catch (e) { if (![404,410].includes(e.statusCode)) throw e; }
    await db.query('DELETE FROM calendar_events WHERE course_id=$1', [row.course_id]);
    return;
  }
  // Stable IDs are committed before remote creation, so a retry cannot duplicate an event.
  try { await google.api(access, item, 'PUT', row.desired); }
  catch (e) {
    if (![404,410].includes(e.statusCode)) throw e;
    if (e.statusCode === 410) {
      row.event_id = crypto.randomUUID().replaceAll('-', '');
      await db.query('UPDATE calendar_events SET event_id=$2 WHERE course_id=$1', [row.course_id, row.event_id]);
    }
    try { await google.api(access, path, 'POST', { ...row.desired, id: row.event_id }); }
    catch (insertError) {
      if (insertError.statusCode !== 409) throw insertError;
      await google.api(access, path + '/' + row.event_id, 'PUT', row.desired);
    }
  }
  await db.query(`UPDATE calendar_events SET synced_hash=$2,synced_at=now(),attempts=0,last_error=NULL WHERE course_id=$1`, [row.course_id, row.desired_hash]);
}
function delay(attempts, e) {
  return Math.max(e.retryAfter || 0, Math.min(3600, 15 * 2 ** Math.min(attempts, 8)) + Math.floor(Math.random() * 10));
}
let running = false;
async function tick() {
  if (running || !google.config().ready) return;
  running = true;
  try {
    await locked(async db => {
      const connection = (await db.query('SELECT * FROM calendar_connection WHERE id=1')).rows[0];
      if (!connection?.enabled || connection.needs_auth || !connection.refresh_token) return;
      // Reconciliation reads current committed business data, including deletions and cancellations.
      // No in-memory-only jobs or missed mutation hooks: server restarts simply resume this table.
      await reconcile(db);
      if (new Date(connection.next_attempt_at) > new Date()) return;
      try {
        let refreshToken;
        try { refreshToken = google.decrypt(connection.refresh_token); }
        catch { throw new google.GoogleError(401, 'invalid_grant'); }
        const credentials = await google.token({ grant_type: 'refresh_token', refresh_token: refreshToken });
        if (!credentials.access_token) throw new google.GoogleError(401, 'invalid_grant');
        if (credentials.refresh_token) await db.query('UPDATE calendar_connection SET refresh_token=$1 WHERE id=1', [google.encrypt(credentials.refresh_token)]);
        const calendarId = await ensureCalendar(db, connection, credentials.access_token);
        const jobs = (await db.query(`SELECT * FROM calendar_events WHERE next_attempt_at<=now()
          AND (synced_hash IS DISTINCT FROM desired_hash OR synced_at<now()-interval '6 hours')
          ORDER BY (synced_hash IS DISTINCT FROM desired_hash) DESC, next_attempt_at, course_id LIMIT 30`)).rows;
        const started = Date.now();
        for (const row of jobs) {
          try { await writeEvent(db, credentials.access_token, calendarId, row); }
          catch (e) {
            const message = google.friendlyError(e), seconds = delay(row.attempts, e);
            await db.query(`UPDATE calendar_events SET attempts=attempts+1,last_error=$2,next_attempt_at=now()+($3*interval '1 second') WHERE course_id=$1`, [row.course_id, message, seconds]);
            if (google.authFailure(e) || [403,429,503].includes(e.statusCode)) throw e;
          }
          if (Date.now() - started > 20000) break;
        }
        const pending = (await db.query('SELECT COUNT(*)::int AS n FROM calendar_events WHERE synced_hash IS DISTINCT FROM desired_hash OR last_error IS NOT NULL')).rows[0].n;
        await db.query(`UPDATE calendar_connection SET attempts=0,last_error=NULL,next_attempt_at=now(),
          last_synced_at=CASE WHEN $1=0 THEN now() ELSE last_synced_at END WHERE id=1`, [pending]);
      } catch (e) {
        await db.query(`UPDATE calendar_connection SET attempts=attempts+1,last_error=$1,needs_auth=$2,
          next_attempt_at=now()+($3*interval '1 second') WHERE id=1`, [google.friendlyError(e), google.authFailure(e), delay(connection.attempts, e)]);
      }
    }, { skip: true });
  } finally { running = false; }
}
function start() {
  const run = () => tick().catch(() => console.error('Calendar sync: database or configuration error'));
  run();
  const timer = setInterval(run, 15000); timer.unref();
  return () => clearInterval(timer);
}
module.exports = { locked, tick, start, writeEvent };
