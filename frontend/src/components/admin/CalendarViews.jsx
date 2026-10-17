import { labels, dayKey, money } from './format';
import { clock, groupBookings, monthSummary, courseEvents, occupancy, occupancyStyle } from './calendarModel';

const title = (day, full = false) =>
  new Date(day + 'T12:00:00Z').toLocaleDateString('hu-HU', {
    timeZone: 'UTC', month: full ? 'long' : 'short', day: 'numeric',
    weekday: full ? 'long' : 'short',
  });

function Status({ booking }) {
  return <span className={'cl-badge ' + booking.status}>{labels[booking.status]}</span>;
}

function DayView({ day, bookings, events, onOpen, onCourse }) {
  const hours = {};
  bookings.forEach(b => { (hours[clock(b.start_time).slice(0, 2)] ||= []).push(b); });
  const participants = bookings.filter(b => b.status !== 'cancelled')
    .reduce((n, b) => n + Number(b.seats), 0);
  return (
    <section className="cl-day-agenda" aria-label="Részletes napi időrend">
      <h2>{title(day, true)}</h2>
      <p>{bookings.length} foglalás · {participants} résztvevő a nem lemondott foglalásokban</p>
      <div className="cl-day-courses">{events.map(e=><button key={e.id} className="cl-capacity-event" style={occupancyStyle(e)} onClick={()=>onCourse(e)}><strong>{clock(e.start_time)} · {e.title}</strong><span>{occupancy(e)}</span></button>)}</div>
      {!bookings.length ? (
        <div className="cl-card">Erre a napra nincs foglalás.</div>
      ) : Object.entries(hours).sort(([a], [b]) => a.localeCompare(b)).map(([hour, list]) => (
        <section className="cl-agenda-hour" key={hour}>
          <h3>{hour}:00</h3>
          <div>
            {list.map(b => (
              <button key={b.id} className={'cl-event cl-day-event ' + b.status} style={occupancyStyle(events.find(e => e.id === b.course_id))} onClick={() => onOpen(b)}>
                <div className="cl-day-event-head">
                  <strong>{b.customer_name}</strong>
                  <Status booking={b} />
                </div>
                <span className="cl-event-time">
                  {clock(b.start_time)} – {clock(b.end_time)} ·{' '}
                  {Math.round((new Date(b.end_time) - new Date(b.start_time)) / 60000)} perc
                </span>
                <span>{b.course_title} · {b.seats} fő</span>
                <span>{b.customer_email}{b.customer_phone ? ' · ' + b.customer_phone : ''}</span>
                <span>{money(b.total_price)} · {labels[b.payment_status]}</span>
                {b.note && <span className="cl-note-preview">Ügyfél: {b.note}</span>}
                {b.admin_note && <span className="cl-note-preview">Belső megjegyzés: {b.admin_note}</span>}
                <small>Teljes adatlap megnyitása →</small>
              </button>
            ))}
          </div>
        </section>
      ))}
    </section>
  );
}

export default function CalendarViews({ view, date, days, items, slots = [], onOpen, onDay, onCourse = () => {} }) {
  const groups = groupBookings(items);
  const events = courseEvents(slots,items);
  if (view === 'day') {
    return <DayView day={date} bookings={groups[date] || []} events={events.filter(e=>dayKey(e.start_time)===date)} onCourse={onCourse} onOpen={onOpen} />;
  }
  return (
    <div className={'cl-calendar-scroll ' + view}>
      <div className={'cl-calendar ' + view} aria-label={view === 'week' ? 'Heti áttekintés' : 'Havi összesítés'}>
        {days.map(day => {
          const bookings = events.filter(e=>dayKey(e.start_time)===day);
          const summary = monthSummary(bookings);
          const visible = view === 'month' ? summary.visible : bookings;
          const className = 'cl-calendar-day ' + (day === dayKey(new Date()) ? 'today ' : '') +
            (day.slice(0, 7) !== date.slice(0, 7) ? 'outside-month' : '');
          return (
            <section className={className} key={day}>
              <h2>
                <button className="cl-day-link" onClick={() => onDay(day)} aria-label={title(day, true) + ' – napi nézet'}>
                  {title(day)}
                </button>
              </h2>
              <p className="cl-day-count">{bookings.length} alkalom</p>
              {visible.map(b => (
                <button className='cl-event cl-course-event' key={b.id} style={occupancyStyle(b)} onClick={() => onCourse(b)}
                  aria-label={`${clock(b.start_time)}, ${b.title}, ${occupancy(b)} – résztvevők`}>
                  <span className="cl-event-time">
                    {clock(b.start_time)}{view === 'week' && <> – {clock(b.end_time)}</>}
                  </span>
                  <strong>{b.title}</strong>
                  <span className="cl-occupancy">{occupancy(b)}</span>
                </button>
              ))}
              {view === 'month' && summary.more > 0 && (
                <button className="cl-more-events" onClick={() => onDay(day)}>
                  +{summary.more} további · napi nézet
                </button>
              )}
              {!bookings.length && <span className="cl-muted">Nincs alkalom</span>}
            </section>
          );
        })}
      </div>
    </div>
  );
}
