const crypto = require('node:crypto');
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.app.created',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
];
function config() {
  const origin = (process.env.FRONTEND_URL || '').split(',')[0];
  const redirect = process.env.GOOGLE_CALENDAR_REDIRECT_URI || origin + '/api/calendar/google/callback';
  const key = process.env.CALENDAR_TOKEN_KEY || '';
  let validURLs = false;
  try {
    validURLs = [new URL(origin), new URL(redirect)].every(u =>
      !u.username && !u.password && (u.protocol === 'https:' ||
        (process.env.NODE_ENV !== 'production' && u.protocol === 'http:' && u.hostname === 'localhost')));
  } catch { /* deployment configuration is incomplete */ }
  return { origin, redirect, clientId: process.env.GOOGLE_CALENDAR_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
    ready: !!(validURLs && /^[a-f0-9]{64}$/i.test(key) && process.env.GOOGLE_CALENDAR_CLIENT_ID && process.env.GOOGLE_CALENDAR_CLIENT_SECRET) };
}
function encrypt(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(process.env.CALENDAR_TOKEN_KEY, 'hex'), iv);
  cipher.setAAD(Buffer.from('chocoleaf-calendar-v1'));
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map(b => b.toString('base64url')).join('.');
}
function decrypt(value) {
  const [iv, tag, data] = value.split('.').map(s => Buffer.from(s, 'base64url'));
  const cipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(process.env.CALENDAR_TOKEN_KEY, 'hex'), iv);
  cipher.setAAD(Buffer.from('chocoleaf-calendar-v1')); cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(data), cipher.final()]).toString('utf8');
}
class GoogleError extends Error {
  constructor(status, reason, retryAfter = 0) { super('Google calendar request failed'); this.statusCode = status; this.reason = reason; this.retryAfter = retryAfter; }
}
async function request(url, options = {}) {
  let response;
  try { response = await fetch(url, { ...options, signal: AbortSignal.timeout(10000), redirect: 'error' }); }
  catch { throw new GoogleError(503, 'network'); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const header = response.headers.get('retry-after');
    const seconds = Number(header) || Math.max(0, (Date.parse(header) - Date.now()) / 1000) || 0;
    throw new GoogleError(response.status, data.error?.errors?.[0]?.reason || data.error?.status || data.error || 'request', Math.min(86400, seconds));
  }
  return data;
}
async function token(body) {
  const c = config();
  return request('https://oauth2.googleapis.com/token', { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, ...body }) });
}
const api = (access, path, method = 'GET', body) => request('https://www.googleapis.com/calendar/v3' + path, {
  method, headers: { Authorization: 'Bearer ' + access, 'Content-Type': 'application/json' },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
function authFailure(e) { return e.reason === 'invalid_grant' || e.statusCode === 401; }
function friendlyError(e) {
  if (authFailure(e)) return 'A Google-hozzáférés lejárt vagy visszavonták. Kapcsold össze újra a naptárt.';
  if (e.statusCode === 403 && !['rateLimitExceeded', 'userRateLimitExceeded'].includes(e.reason))
    return 'A Google nem engedélyezi a naptár elérését. Ellenőrizd az engedélyeket, vagy kapcsold össze újra.';
  return 'A Google-naptár most nem frissíthető. A foglalások megmaradtak, automatikusan újrapróbáljuk.';
}
module.exports = { SCOPES, config, encrypt, decrypt, request, token, api, GoogleError, authFailure, friendlyError };
