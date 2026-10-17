const { fail, instant, uuid } = require('./rules');
const { randomUUID } = require('node:crypto');

const sessionsSQL = alias => `(SELECT jsonb_agg(jsonb_build_object('id',st.id,'start_time',st.start_time,'end_time',st.end_time) ORDER BY st.start_time,st.id) FROM course_session_times st WHERE st.course_id=${alias}.id)`;
async function getSessions(c, id) {
  return (await c.query('SELECT id,start_time,end_time FROM course_session_times WHERE course_id=$1 ORDER BY start_time,id', [id])).rows;
}
async function attachSessions(c, rows) {
  if (!rows.length) return rows;
  const ids = rows.map(row => row.id);
  const sessions = (await c.query('SELECT id,course_id,start_time,end_time FROM course_session_times WHERE course_id=ANY($1::uuid[]) ORDER BY start_time,id', [ids])).rows;
  const locks = (await c.query(`SELECT c.id, c.session_count_locked OR EXISTS(SELECT 1 FROM bookings b WHERE b.course_id=c.id) OR EXISTS(SELECT 1 FROM payment_orders p WHERE p.course_id=c.id OR p.booking_id IN(SELECT b.id FROM bookings b WHERE b.course_id=c.id)) AS locked FROM courses c WHERE c.id=ANY($1::uuid[])`, [ids])).rows;
  return rows.map(row => ({ ...row, sessions:sessions.filter(s => s.course_id===row.id).map(({course_id,...s})=>s), sessions_locked:locks.find(x=>x.id===row.id)?.locked || false }));
}
function normalizeSessions(data, oldSessions, parentId, defaultDuration) {
  const input = data.sessions === undefined
    ? oldSessions.length > 1 ? oldSessions : [{ id:oldSessions[0]?.id, start_time:data.start_time ?? oldSessions[0]?.start_time, end_time:data.end_time ?? oldSessions[0]?.end_time }]
    : data.sessions;
  if (!Array.isArray(input) || !input.length || input.length > 100) fail('Adj meg 1–100 alkalmat.');
  const seen = new Set();
  const sessions = input.map((s,i) => {
    if (!s || typeof s!=='object' || Array.isArray(s)) fail('Hibás alkalomadat.');
    const id = s.id ? uuid(s.id) : oldSessions.length===0 && i===0 ? parentId : randomUUID();
    if (seen.has(id)) fail('Egy alkalom csak egyszer szerepelhet.');
    if (s.id && !oldSessions.some(old=>old.id===id)) fail('Ismeretlen alkalomazonosító.');
    seen.add(id);
    const start_time = instant(s.start_time instanceof Date ? s.start_time.toISOString() : s.start_time);
    const end_time = s.end_time===undefined && defaultDuration!==undefined
      ? new Date(+start_time+defaultDuration*60000)
      : instant(s.end_time instanceof Date ? s.end_time.toISOString() : s.end_time);
    if (end_time<=start_time) fail('Az alkalom befejezése legyen a kezdés után.');
    return {id,start_time,end_time};
  }).sort((a,b)=>a.start_time-b.start_time);
  for (let i=1;i<sessions.length;i++) if(sessions[i].start_time<sessions[i-1].end_time) fail('A kurzus alkalmai nem fedhetik egymást.',409);
  return sessions;
}
module.exports = { sessionsSQL, getSessions, attachSessions, normalizeSessions };
