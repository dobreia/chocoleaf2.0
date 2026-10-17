import { dayKey } from './format';
export function calendarRange(date, view) {
  const start = new Date(date + 'T12:00:00Z');
  let count = 1;
  if (view === 'month') { start.setUTCDate(1); count = 42; }
  if (view !== 'day') {
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
    if (view === 'week') count = 7;
  }
  const days = Array.from({ length: count }, (_, i) => {
    const d = new Date(start); d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
  return { days, from: days[0], to: days.at(-1) };
}
export const clock = value => new Intl.DateTimeFormat('hu-HU', { timeZone: 'Europe/Budapest', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value));
export function groupBookings(items) {
  const groups = {};
  [...items].sort((a,b) => new Date(a.start_time)-new Date(b.start_time) || a.customer_name.localeCompare(b.customer_name,'hu')).forEach(b => {
    (groups[dayKey(b.start_time)] ||= []).push(b);
  });
  return groups;
}
export const monthSummary = bookings => ({ visible: bookings.slice(0,2), more: Math.max(0, bookings.length-2), total: bookings.length });

export function courseEvents(slots, bookings) {
  const byId = new Map(slots.map(s=>[s.id,{...s,bookings:[],booked_seats:0}]));
  for(const b of bookings) {
    if(!byId.has(b.course_id))byId.set(b.course_id,{id:b.course_id,title:b.course_title,start_time:b.start_time,end_time:b.end_time,capacity:b.capacity,active:true,bookings:[],booked_seats:0});
    const event=byId.get(b.course_id);event.bookings.push(b);
    if(b.status!=='cancelled')event.booked_seats+=Number(b.seats);
  }
  return [...byId.values()].filter(e=>e.active||e.bookings.length).sort((a,b)=>new Date(a.start_time)-new Date(b.start_time));
}
export const occupancy = event => event.capacity == null ? `${event.booked_seats} fő` : `${event.booked_seats} / ${event.capacity} fő`;

// Capacity tint is derived from held seats, never from booking count.
export function occupancyStyle(event) {
  const capacity = Number(event?.capacity);
  const seats = Math.max(0, Number(event?.booked_seats) || 0);
  const ratio = capacity > 0 ? Math.min(1, seats / capacity) : 0;
  const light = [253, 251, 252], full = [130, 83, 120];
  const rgb = light.map((value, i) => Math.round(value + (full[i] - value) * ratio));
  const linear = rgb.map(value => { const c = value / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; });
  const luminance = linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
  return {
    '--occupancy-bg': `rgb(${rgb.join(', ')})`,
    '--occupancy-ink': luminance > .19 ? '#110811' : '#ffffff',
    '--occupancy-border': ratio >= 1 ? '#714468' : '#cbb9c6',
  };
}
