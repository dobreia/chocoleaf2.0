import {Modal} from './UI';
import {dateTime,labels} from './format';
import {occupancy} from './calendarModel';
import SessionList from '../SessionList';
export default function CourseEventDetails({event,onClose,onBooking}) {
 return <Modal title={event.title} onClose={onClose}>
  <p>{dateTime(event.start_time)} – {dateTime(event.end_time)}</p>
  {event.session_count>1 && <><p>{event.session_index}/{event.session_count}. alkalom · A foglalások a teljes kurzusra szólnak.</p><SessionList course={event}/></>}
  <div className="cl-course-capacity"><strong>{occupancy(event)}</strong><span>foglalt létszám</span>{event.capacity!=null&&<span>{Math.max(0,event.capacity-event.booked_seats)} szabad hely</span>}</div>
  <h3>Foglalások és résztvevők</h3>
  {!event.bookings.length?<p>Még nincs foglalás erre az alkalomra.</p>:event.bookings.map(b=><article className="cl-card" key={b.id}>
    <h4>{b.customer_name} · {b.seats} fő</h4><p>{b.customer_email}{b.customer_phone&&<> · {b.customer_phone}</>}</p>
    <p><span className={'cl-badge '+b.status}>{labels[b.status]}</span>{b.status==='cancelled'&&' · Nem foglal férőhelyet'}</p>
    {b.note&&<p>Ügyfél: {b.note}</p>}{b.admin_note&&<p>Belső megjegyzés: {b.admin_note}</p>}
    <button onClick={()=>onBooking(b)}>Foglalás megnyitása és kezelése</button>
  </article>)}
 </Modal>;
}
