const express = require('express');
const crypto = require('node:crypto');
const pool = require('../db');
const { hash, token, fail } = require('../domain/rules');
const { requireAdmin, rateLimit } = require('../domain/auth');
const google = require('../calendar/google');
const { locked, tick } = require('../calendar/sync');
const { courses, eventPayload } = require('../calendar/events');
const admin = express.Router(), callback = express.Router();
const browserCookie = 'chocoleaf_calendar_oauth';
const cookies = req => Object.fromEntries((req.headers.cookie || '').split(';').map(s=>s.trim().split('=')));
const cookieOptions = () => ({ httpOnly:true, secure:process.env.NODE_ENV==='production', sameSite:'lax', path:'/api/calendar/google/callback', maxAge:600000 });
admin.use(requireAdmin);
admin.get('/', async (_req, res) => {
  const c = (await pool.query('SELECT * FROM calendar_connection WHERE id=1')).rows[0];
  const counts = (await pool.query(`SELECT COUNT(*) FILTER(WHERE synced_hash IS DISTINCT FROM desired_hash)::int AS pending,
    COUNT(*) FILTER(WHERE last_error IS NOT NULL)::int AS failed,
    COUNT(*) FILTER(WHERE synced_hash=desired_hash AND desired IS NOT NULL)::int AS synced,
    MIN(next_attempt_at) FILTER(WHERE last_error IS NOT NULL) AS retry_at FROM calendar_events`)).rows[0];
  const rows = await courses(pool);
  const preview = rows.filter(c=>c.active&&c.service_active&&new Date(c.end_time)>new Date()).slice(0,3).map(eventPayload);
  res.json({ configured:google.config().ready, connected:!!c.enabled, needsAuth:c.needs_auth,
    accountEmail:c.account_email, calendarName:'ChocoLeaf kurzusok',
    calendarUrl:c.calendar_id ? 'https://calendar.google.com/calendar/u/0/r?cid='+encodeURIComponent(c.calendar_id)+'&authuser='+encodeURIComponent(c.account_email || '') : null,
    lastScanAt:c.last_scan_at, lastSyncedAt:c.last_synced_at, error:c.last_error,
    stale:!!(c.enabled && Date.now()-new Date(c.last_scan_at || c.connected_at)>120000),
    retryAt:c.last_error ? c.next_attempt_at : counts.retry_at, ...counts, preview });
});
admin.post('/connect', rateLimit, async (req, res) => {
  const config = google.config();
  if (!config.ready) fail('A Google-naptárkapcsolat egyszeri szerverbeállítása még hiányzik.', 503);
  const state=token(), browser=token(), verifier=token();
  await locked(async db => {
    await db.query('DELETE FROM calendar_oauth_states');
    await db.query(`INSERT INTO calendar_oauth_states(hash,browser_hash,session_hash,verifier,expires_at)
      VALUES($1,$2,$3,$4,now()+interval '10 minutes')`, [hash(state),hash(browser),hash(cookies(req).chocoleaf_session || ''),google.encrypt(verifier)]);
  });
  res.cookie(browserCookie, browser, cookieOptions());
  const params = new URLSearchParams({ client_id:config.clientId, redirect_uri:config.redirect,
    response_type:'code', scope:google.SCOPES.join(' '), state, access_type:'offline', prompt:'consent select_account',
    code_challenge:crypto.createHash('sha256').update(verifier).digest('base64url'), code_challenge_method:'S256' });
  res.json({ url:'https://accounts.google.com/o/oauth2/v2/auth?'+params });
});
callback.get('/google/callback', rateLimit, async (req, res) => {
  res.set({ 'Cache-Control':'no-store', 'Referrer-Policy':'no-referrer' });
  let result = 'failed';
  try {
    if (!google.config().ready || typeof req.query.state !== 'string' || req.query.state.length>200) throw new Error('state');
    await locked(async db => {
      const state = (await db.query(`DELETE FROM calendar_oauth_states WHERE hash=$1 AND browser_hash=$2
        AND expires_at>now() AND EXISTS(SELECT 1 FROM sessions s WHERE s.hash=session_hash AND s.expires_at>now()) RETURNING *`,
      [hash(req.query.state),hash(cookies(req)[browserCookie] || '')])).rows[0];
      if (!state) { result='expired'; return; }
      if (req.query.error) { result='denied'; return; }
      if (typeof req.query.code !== 'string' || req.query.code.length>4096) throw new Error('code');
      const auth = await google.token({ code:req.query.code, grant_type:'authorization_code', redirect_uri:google.config().redirect,
        code_verifier:google.decrypt(state.verifier) });
      if (!auth.refresh_token || !auth.access_token || !google.SCOPES.every(s=>(auth.scope || '').split(' ').includes(s))) { result='permissions'; return; }
      const profile = await google.request('https://www.googleapis.com/oauth2/v2/userinfo', { headers:{ Authorization:'Bearer '+auth.access_token } });
      if (!profile.email || !profile.verified_email) throw new Error('identity');
      const old = (await db.query('SELECT * FROM calendar_connection WHERE id=1')).rows[0];
      if (old.enabled && old.account_email && old.account_email !== profile.email) { result='different_account'; return; }
      await db.query('BEGIN');
      try {
        if (old.account_email && old.account_email !== profile.email) {
          await db.query('DELETE FROM calendar_events');
          await db.query('UPDATE calendar_connection SET calendar_id=NULL,marker=gen_random_uuid(),last_synced_at=NULL WHERE id=1');
        }
        await db.query(`UPDATE calendar_connection SET enabled=true,needs_auth=false,account_email=$1,refresh_token=$2,
          last_error=NULL,attempts=0,next_attempt_at=now(),connected_at=now() WHERE id=1`, [profile.email,google.encrypt(auth.refresh_token)]);
        await db.query('UPDATE calendar_events SET synced_hash=NULL,next_attempt_at=now(),attempts=0,last_error=NULL');
        await db.query('COMMIT');
      } catch(e) { await db.query('ROLLBACK'); throw e; }
      result='connected';
    });
  } catch { /* OAuth secrets and provider response bodies must never enter logs or URLs. */ }
  res.clearCookie(browserCookie, { ...cookieOptions(), maxAge:undefined });
  res.redirect(303, google.config().origin + '/admin/calendar-sync?google=' + result);
  if(result==='connected') void tick().catch(()=>{});
});
admin.post('/sync', rateLimit, async (_req,res) => {
  await locked(async db => {
    const c=(await db.query('SELECT enabled,needs_auth FROM calendar_connection WHERE id=1')).rows[0];
    if(!c.enabled || c.needs_auth) fail('Először kapcsold össze a Google-naptárt.',409);
    await db.query('UPDATE calendar_connection SET next_attempt_at=now() WHERE id=1');
    await db.query('UPDATE calendar_events SET synced_hash=NULL,next_attempt_at=now(),attempts=0,last_error=NULL');
  });
  res.status(202).json({message:'A teljes naptár frissítését sorba állítottuk.'});
  void tick().catch(()=>{});
});
admin.post('/disconnect', async (_req,res) => {
  await locked(async db => {
    await db.query('UPDATE calendar_connection SET enabled=false,refresh_token=NULL,needs_auth=false,last_error=NULL WHERE id=1');
    await db.query('DELETE FROM calendar_oauth_states');
  });
  res.json({message:'A szinkronizálás leállt. A Google-naptárban a korábbi események megmaradtak, de már nem frissülnek.'});
});
module.exports = { admin, callback };
