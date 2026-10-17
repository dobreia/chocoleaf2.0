import { dateTime } from './admin/format';
import { sessionsOf, hours, sessionMinutes } from './courseSessions';

export default function SessionList({ course }) {
  const sessions=sessionsOf(course);
  return <ol className="cl-session-list">{sessions.map((s,i)=><li key={s.id || i}>
    {sessions.length>1 && <strong>{i+1}/{sessions.length}. alkalom</strong>}
    <span>{dateTime(s.start_time)} – {dateTime(s.end_time)} · {hours(sessionMinutes(s))}</span>
  </li>)}</ol>;
}
