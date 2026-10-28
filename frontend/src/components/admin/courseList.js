import { sessionsOf } from '../courseSessions.js';
import { dayKey } from './format.js';

export function courseList(items, period, serviceId, now = new Date()) {
  const today = dayKey(now);
  const bounds = course => {
    const sessions = sessionsOf(course);
    return {
      start: Math.min(...sessions.map(session => +new Date(session.start_time))),
      end: Math.max(...sessions.map(session => +new Date(session.end_time || session.start_time))),
    };
  };
  return items
    .filter(course => !serviceId || course.service_id === serviceId)
    .map(course => ({ course, ...bounds(course) }))
    .filter(({ end }) => period === 'all' || (period === 'past' ? dayKey(end) < today : dayKey(end) >= today))
    .sort((a, b) => period === 'past' ? b.end - a.end : period === 'all' ? b.start - a.start : a.start - b.start)
    .map(({ course }) => course);
}
