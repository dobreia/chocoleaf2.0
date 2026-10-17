import { useEffect, useState } from "react";
import { usePageDraftState } from '../../components/usePageDraft';
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../../api/courses";
import BookingEditor from "../../components/admin/BookingEditor";
import { Notice, Field } from "../../components/admin/UI";
import { dayKey } from "../../components/admin/format";
import CalendarViews from "../../components/admin/CalendarViews";
import CourseEventDetails from "../../components/admin/CourseEventDetails";
import { courseEvents, calendarRange } from "../../components/admin/calendarModel";
export default function Calendar() {
  const [params] = useSearchParams();
  const linkedDate = params.get("date");
  const initialDate = /^\d{4}-\d{2}-\d{2}$/.test(linkedDate || "") && !Number.isNaN(Date.parse(linkedDate)) ? linkedDate : dayKey(new Date());
  const [view, updateView] = usePageDraftState('calendar.view', "month"),
    [date, updateDate] = usePageDraftState('calendar.date', initialDate),
    [items, setItems] = useState([]),
    [slots, setSlots] = useState([]),
    [courseId, setCourseId] = usePageDraftState('calendar.course', params.get('session') || params.get("course")),
    [edit, setEdit] = usePageDraftState('calendar.edit', undefined),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [revision, setRevision] = useState(0);
  const setDate = (v) => {
    if(v===date)return;
    setLoading(true);
    updateDate(v);
  };
  const setView = (v) => {
    if(v===view)return;
    setLoading(true);
    updateView(v);
  };
  const d = new Date(date + "T12:00:00Z");
  const { days, from, to } = calendarRange(date, view);
  useEffect(() => {
    let live = true;
    (async () => {
      const found = [];
      let page = 1,
        total = 1;
      while (found.length < total) {
        const r = await api(
          "/admin/bookings?" +
            new URLSearchParams({ from, to, limit: 100, page, sort: "asc" }),
        );
        if (!r.items.length) break;
        found.push(...r.items);
        total = r.total;
        page++;
      }
      const s = await api("/admin/courses");
      if (live) {
        setItems(found);
        setSlots(s);
        setError("");
      }
    })()
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [from, to, revision, view, date]);
  const events = courseEvents(slots,items);
  const course = events.find(e=>e.id===courseId) || events.find(e=>e.course_id===courseId);
  function move(n) {
    const next = new Date(d);
    if (view === "month") {
      next.setUTCDate(1);
      next.setUTCMonth(next.getUTCMonth() + n);
    } else next.setUTCDate(next.getUTCDate() + n * (view === "week" ? 7 : 1));
    setDate(next.toISOString().slice(0, 10));
  }
  return (
    <>
      <div className="cl-title">
        <div><h1>Naptár</h1><Link to="/admin/calendar-sync">Telefonos naptár összekapcsolása →</Link></div>
        <button className="cl-primary" onClick={() => setEdit(null)}>
          + Foglalás
        </button>
      </div>
      <Notice error={error} />
      <div className="cl-calendar-toolbar">
        <button aria-label="Előző időszak" onClick={() => move(-1)}>
          ‹
        </button>
        <button onClick={() => setDate(dayKey(new Date()))}>Ma</button>
        <button aria-label="Következő időszak" onClick={() => move(1)}>
          ›
        </button>
        <Field
          label="Dátum"
          type="date"
          value={date}
          onChange={(e) => {
            if (e.target.value) setDate(e.target.value);
          }}
        />
        <Field label="Nézet">
          <select value={view} onChange={(e) => setView(e.target.value)}>
            <option value="day">Nap</option>
            <option value="week">Hét</option>
            <option value="month">Hónap</option>
          </select>
        </Field>
      </div>
      <p>
        {from} – {to} · Budapesti idő
      </p>
      {loading ? (
        <p>Foglalások betöltése…</p>
      ) : (
        <CalendarViews view={view} date={date} days={days} items={items} slots={slots} onCourse={e=>setCourseId(e.id)}
          onOpen={setEdit} onDay={(day) => { setDate(day); setView("day"); }} />
      )}
      {course && edit === undefined && <CourseEventDetails event={course} onClose={()=>setCourseId(null)} onBooking={setEdit}/>}
      {edit !== undefined && (
        <BookingEditor
          booking={edit}
          slots={slots}
          onClose={() => setEdit(undefined)}
          onDone={() => {
            setEdit(undefined);
            setLoading(true);
            setRevision((x) => x + 1);
          }}
        />
      )}
    </>
  );
}
