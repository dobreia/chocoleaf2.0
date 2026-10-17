export function sessionsOf(course) {
  return course?.sessions?.length ? course.sessions : course?.start_time ? [{id:course.id,start_time:course.start_time,end_time:course.end_time}] : [];
}
export function hours(minutes) {
  return new Intl.NumberFormat('hu-HU',{maximumFractionDigits:2}).format(minutes/60)+' óra';
}
export function sessionMinutes(session) {
  return Math.round((new Date(session.end_time)-new Date(session.start_time))/60000);
}
export function durationSummary(course) {
  const sessions=sessionsOf(course);
  const total=sessions.reduce((n,s)=>n+sessionMinutes(s),0);
  return sessions.length>1 ? `${sessions.length} alkalom · összesen ${hours(total)}` : hours(total);
}
