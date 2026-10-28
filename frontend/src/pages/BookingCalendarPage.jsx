import SeatCount from "../components/SeatCount";
import { startStripePayment } from '../api/payments';
import {validSeatCount} from "../components/seatRules";
import { dayKey, dateTime, money } from "../components/admin/format";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePageDraftState, usePageDraftRef, useClearPageDrafts } from '../components/usePageDraft';
import { Link, useParams, useSearchParams, useNavigate } from "react-router-dom";
import BillingFields from '../components/BillingFields';
import { emptyBilling } from '../components/billingData';
import SessionList from '../components/SessionList';
import { sessionsOf, durationSummary } from '../components/courseSessions';
import {
  createBooking,
  getCourseAvailability,
  getCourses,
  api,
} from "../api/courses";
import "../styles/BookingCalendarPage.css";

const monthFormatter = new Intl.DateTimeFormat("hu-HU", {
  year: "numeric",
  month: "long",
});
const dayTitleFormatter = new Intl.DateTimeFormat("hu-HU", {
  weekday: "long",
  month: "long",
  day: "numeric",
});
const timeFormatter = new Intl.DateTimeFormat("hu-HU", {
  timeZone: "Europe/Budapest",
  hour: "2-digit",
  minute: "2-digit",
});
const weekdayLabels = ["H", "K", "Sz", "Cs", "P", "Sz", "V"];

function getMonthStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function getDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getCalendarDays(monthDate) {
  const firstDay = getMonthStart(monthDate);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const gridStart = new Date(firstDay);
  gridStart.setDate(firstDay.getDate() - mondayOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return date;
  });
}

function groupSlotsByDay(slots) {
  return slots.reduce((days, slot) => {
    const key = dayKey(sessionsOf(slot)[0].start_time);
    if (!days[key]) days[key] = [];
    days[key].push({...slot,display_start_time:sessionsOf(slot)[0].start_time});
    return days;
  }, {});
}

function getPeriodLabel(date) {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Budapest",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(date),
  );
  if (hour < 12) return "Délelőtt";
  if (hour < 18) return "Délután";
  return "Este";
}

export default function BookingCalendarPage() {
  const navigate = useNavigate();
  const [provider,setProvider] = useState(null);
  const [billing,setBilling] = usePageDraftState('booking.billing', emptyBilling);
  const [billingNameEdited, setBillingNameEdited] = usePageDraftState('booking.billingNameEdited', false);
  const clearDrafts = useClearPageDrafts();
  const { id } = useParams();
  const [query] = useSearchParams();
  const preferredSlot = query.get("slot");
  const requestKeyRef = usePageDraftRef('booking.requestKeyRef', null);
  const [courses, setCourses] = useState([]);
  const [monthValue, setMonthValue] = usePageDraftState('booking.month', () => getMonthStart(/^\d{4}-\d{2}-\d{2}$/.test(query.get("date")||"") ? new Date(query.get("date")+"T12:00:00") : new Date()).getTime());
  const monthDate = useMemo(() => new Date(monthValue), [monthValue]);
  const monthRef = useRef(monthValue);
  useEffect(()=>{monthRef.current=monthValue;},[monthValue]);
  const [slots, setSlots] = useState([]);
  const [selectedDateKey, setSelectedDateKey] = usePageDraftState('booking.day', "");
  const [selectedSlotId, setSelectedSlotId] = usePageDraftState('booking.slot', "");
  const selectedSlotRef = useRef(selectedSlotId);
  useEffect(()=>{selectedSlotRef.current=selectedSlotId;},[selectedSlotId]);
  const [formData, setFormData] = usePageDraftState('booking.form', {
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    note: "",
    seats: "1",
  });
  const [status, setStatus] = useState({ type: "", message: "" });
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const resolvedBilling = {
    ...billing,
    privateName: billingNameEdited ? billing.privateName : formData.customerName,
  };

  const selectedCourse = useMemo(
    () =>
      courses.find((course) => String(course.id) === String(id) || course.slug === id),
    [courses, id],
  );
  const availableSlots = useMemo(
    () => slots.filter((slot) => slot.is_available),
    [slots],
  );
  const slotsByDay = useMemo(
    () => groupSlotsByDay(availableSlots),
    [availableSlots],
  );
  const calendarDays = useMemo(() => getCalendarDays(monthDate), [monthDate]);
  const visibleMonth = getDateKey(monthDate).slice(0,7);
  const selectedDate = selectedDateKey
    ? new Date(`${selectedDateKey}T12:00:00`)
    : null;
  const selectedDaySlots = selectedDateKey
    ? slotsByDay[selectedDateKey] || []
    : [];
  const selectedSlot = selectedDaySlots.find(
    (slot) => String(slot.id) === String(selectedSlotId),
  );
  const selectedSessions = selectedSlot ? sessionsOf(selectedSlot) : [];
  const relatedDays = selectedSessions.reduce((days,session,index)=>{
    const key=dayKey(session.start_time);
    (days[key] ||= []).push(index+1);
    return days;
  },{});

  useEffect(() => {
    api('/payments/config').then(x=>setProvider(x.provider)).catch(e=>setStatus({type:'error',message:e.message}));
    getCourses()
      .then(setCourses)
      .catch((error) => setStatus({ type: "error", message: error.message }));
  }, []);

  useEffect(() => {
    let live = true;

    // Load complete packages once: browsing their other months must preserve
    // the selected package, its first date, and the in-progress booking form.
    getCourseAvailability({ courseId: id })
      .then((items) => {
        if (!live) return;
        setSlots(items);
        const available=items.filter(slot=>slot.is_available);
        const starts=groupSlotsByDay(available);
        const preferred=available.find(slot=>slot.id===preferredSlot);
        const remembered=available.find(slot=>slot.id===selectedSlotRef.current);
        const month=getDateKey(new Date(monthRef.current)).slice(0,7);
        const firstDay=Object.keys(starts).sort().find(key=>key.startsWith(month)) || '';
        setSelectedDateKey(currentKey=>{
          const nextKey=remembered ? dayKey(sessionsOf(remembered)[0].start_time)
            : starts[currentKey] ? currentKey : preferred ? dayKey(sessionsOf(preferred)[0].start_time) : firstDay;
          const options=starts[nextKey] || [];
          // Persist automatic choices too, so a newly advertised package on
          // the same day cannot change an existing draft after refresh.
          setSelectedSlotId(current=>options.some(s=>s.id===current) ? current
            : options.some(s=>s.id===preferred?.id) ? preferred.id
            : options.length===1 ? options[0].id : '');
          return nextKey;
        });
      })
      .catch((error) => {
        if (live) setStatus({ type: "error", message: error.message });
      })
      .finally(() => {
        if (live) setIsLoading(false);
      });
    return () => {
      live = false;
    };
  }, [id, preferredSlot, setSelectedDateKey, setSelectedSlotId]);

  function moveMonth(delta) {
    const nextMonth=new Date(monthDate.getFullYear(),monthDate.getMonth()+delta,1);
    const prefix=getDateKey(nextMonth).slice(0,7);
    selectDay(Object.keys(slotsByDay).sort().find(key=>key.startsWith(prefix)) || '');
    setStatus({ type: "", message: "" });
    setMonthValue(nextMonth.getTime());
  }

  function selectDay(key) {
    requestKeyRef.current = null;
    setSelectedDateKey(key);
    const options=slotsByDay[key] || [];
    setSelectedSlotId(options.length===1 ? options[0].id : '');
  }

  function updateFormField(field, value) {
    requestKeyRef.current = null;
    setFormData((currentData) => ({
      ...currentData,
      [field]: value,
    }));
  }

  async function submitBooking(event) {
    event.preventDefault();

    if (isSubmitting) return;
    if (!selectedSlot) {
      setStatus({ type: "error", message: "Válassz egy szabad időpontot." });
      return;
    }

    try {
      setIsSubmitting(true);
      setStatus({ type: "", message: "" });

      const seats = Number(formData.seats);
      if (!validSeatCount(formData.seats,selectedSlot.available_spots))
        throw new Error("Adj meg egész létszámot 1 és a szabad férőhelyek száma között.");
      requestKeyRef.current ||= crypto.randomUUID();
      const result = await createBooking(
        {
          courseId: selectedSlot.id,
          ...formData,
          seats,
          paymentMethod: provider,
          billingData: resolvedBilling,
        },
        requestKeyRef.current,
      );
      if (result.paymentId) { await startStripePayment(result); clearDrafts(); return; }
      requestKeyRef.current = null;
      clearDrafts();
      if (result.redirectUrl) { navigate(result.redirectUrl); return; }

      setStatus({
        type: "success",
        message:
          "A foglalás mentve, visszaigazolása adminisztrátori jóváhagyásra vár. Az emailben kapott bizalmas linkkel kérhetsz módosítást vagy lemondást. Ezek az admin jóváhagyása után lépnek életbe.",
      });
      setSelectedSlotId("");
      setFormData({
        customerName: "",
        customerEmail: "",
        customerPhone: "",
        note: "",
    seats: "1",
      });

      try {
        const refreshedSlots = await getCourseAvailability({
          courseId: id,
        });
        setSlots(refreshedSlots);
      } catch {
        setSlots([]);
      }
    } catch (error) {
      setStatus({ type: "error", message: error.message });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="booking-calendar-page">
      <div className="booking-calendar-shell">
        <div className="booking-calendar-header">
          <div>
            <p className="booking-calendar-eyebrow">Időpontfoglalás</p>
            <h1>{selectedCourse?.title || "Képzés foglalása"}</h1>
          </div>
          <Link className="booking-calendar-backlink" to="/courses">
            Vissza a képzésekhez
          </Link>
        </div>

        <div className="booking-calendar-card">
          <section
            className="booking-calendar-month"
            aria-label="Naptár havi nézet"
          >
            <h2 className="booking-calendar-instruction">Válaszd ki a kurzus kezdőnapját!</h2>
            <p className="booking-calendar-help">{(selectedSlot ? selectedSessions.length : selectedCourse?.session_count)>1 ? `A kurzus ${selectedSlot ? selectedSessions.length : selectedCourse.session_count} alkalomból áll. Egy foglalás minden alkalomra érvényes.` : 'A kártyákon a kurzus összes időpontját megtalálod.'} Az időpontok budapesti idő szerint értendők.</p>
            <div className="booking-calendar-monthbar">
              <h2>{monthFormatter.format(monthDate)}</h2>
              <div className="booking-calendar-controls">
                <button
                  type="button"
                  onClick={() => moveMonth(-1)}
                  aria-label="Előző hónap"
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={() => moveMonth(1)}
                  aria-label="Következő hónap"
                >
                  ›
                </button>
              </div>
            </div>

            <div className="booking-calendar-weekdays">
              {weekdayLabels.map((label, index) => (
                <span key={`${label}-${index}`}>{label}</span>
              ))}
            </div>

            <div className="booking-calendar-grid">
              {calendarDays.map((date) => {
                const key = getDateKey(date);
                const isCurrentMonth = date.getMonth() === monthDate.getMonth();
                const isAvailable = Boolean(slotsByDay[key]?.length);
                const isSelected = selectedDateKey === key;
                const ordinals = selectedSessions.length>1 ? relatedDays[key] : null;

                return (
                  <button
                    className={[
                      "booking-calendar-day",
                      isCurrentMonth
                        ? "booking-calendar-day--current-month"
                        : "booking-calendar-day--outside-month",
                      isAvailable
                        ? "booking-calendar-day--available"
                        : "booking-calendar-day--disabled",
                      isSelected ? "booking-calendar-day--selected" : "",
                      ordinals ? "booking-calendar-day--package" : "",
                    ].join(" ")}
                    disabled={(!isAvailable && !ordinals) || isLoading}
                    aria-label={key}
                    aria-pressed={isSelected || Boolean(ordinals)}
                    title={ordinals ? `A kiválasztott kurzus ${ordinals.join('., ')}. alkalma${isAvailable ? '; ezen a napon kurzus is indul' : ''}` : isAvailable ? 'Választható kezdőnap' : undefined}
                    key={key}
                    type="button"
                    onClick={() => {
                      if (!isAvailable) return;
                      selectDay(key);
                    }}
                  >
                    {date.getDate()}
                    {ordinals && <span className="booking-calendar-day-index" aria-hidden="true">{ordinals.join(',')}</span>}
                  </button>
                );
              })}
            </div>
            <div className="booking-calendar-legend">
              <span><i className="booking-calendar-legend-start"/>Választható kezdőnap</span>
              {selectedSessions.length>1 && <span><i className="booking-calendar-legend-package"/>A kiválasztott kurzus alkalmai (sorszámmal)</span>}
            </div>
            {selectedSessions.length>1 && <div className="booking-calendar-linked-dates">
              <p>A kiválasztott kurzus {selectedSessions.length} alkalma egy foglaláshoz tartozik.</p>
              {selectedSessions.map((session,index)=>!dayKey(session.start_time).startsWith(visibleMonth) && <div key={session.id || index}>
                <span>{index+1}. alkalom · {dateTime(session.start_time)}</span>
                <button type="button" aria-label={`Mutasd a naptárban: ${dayKey(session.start_time)}`} onClick={()=>{
                  setSelectedDateKey(selectedDateKey);
                  setSelectedSlotId(selectedSlot.id);
                  setMonthValue(getMonthStart(new Date(dayKey(session.start_time)+'T12:00:00')).getTime());
                }}>Mutasd a naptárban →</button>
              </div>)}
            </div>}
          </section>

          <section className="booking-calendar-slots" aria-live="polite">
            {isLoading ? (
              <p className="booking-calendar-empty">Időpontok betöltése...</p>
            ) : selectedDate && selectedDaySlots.length > 0 ? (
              <>
                <h2>{dayTitleFormatter.format(selectedDate)}</h2>
                <p className="booking-calendar-period">
                  {selectedDaySlots.length>1 ? 'Válassz az ezen a napon induló kurzusok közül!' : getPeriodLabel(new Date(selectedDaySlots[0].display_start_time))}
                </p>

                <div className="booking-calendar-slot-list">
                  {selectedDaySlots.map((slot) => (
                    <button
                      className={`booking-calendar-slot ${String(selectedSlotId) === String(slot.id) ? "booking-calendar-slot--selected" : ""}`}
                      key={slot.id}
                      aria-pressed={String(selectedSlotId) === String(slot.id)}
                      type="button"
                      onClick={() => {
                        requestKeyRef.current = null;
                        setSelectedSlotId(slot.id);
                      }}
                    >
                      <strong>Kezdés: {timeFormatter.format(new Date(slot.display_start_time))}</strong>
                      <span>{durationSummary(slot)}</span>
                      <span className="booking-calendar-slot-dates">{sessionsOf(slot).map((session,index)=><span key={session.id || index}>
                        <b>{index+1}. alkalom</b> {dateTime(session.start_time)} – {dayKey(session.start_time)===dayKey(session.end_time) ? timeFormatter.format(new Date(session.end_time)) : dateTime(session.end_time)}
                      </span>)}</span>
                      <span className="booking-calendar-slot-price">{money(slot.price)} / fő · teljes kurzus</span>
                      <span>{slot.available_spots} szabad hely</span>
                      <span className="booking-calendar-slot-choice">{selectedSlotId===slot.id ? '✓ Kiválasztva' : 'Ezt a kurzust választom'}</span>
                    </button>
                  ))}
                </div>

                <form
                  className="booking-calendar-form"
                  onSubmit={submitBooking}
                >
                  <h3>Foglalási adatok</h3>
                  {selectedSlot && (
                    <div>
                      <strong>
                        {durationSummary(selectedSlot)} · {money(selectedSlot.price)} / fő · Összesen{" "}
                        {validSeatCount(formData.seats,selectedSlot.available_spots)?money(selectedSlot.price * Number(formData.seats)):"–"}
                      </strong>
                      <SessionList course={selectedSlot}/>
                      {sessionsOf(selectedSlot).length>1 && <p>A jelentkezés mind a(z) {sessionsOf(selectedSlot).length} alkalomra szól. A feltüntetett ár a teljes kurzus ára.</p>}
                      <p>Időpontok budapesti idő szerint.</p>
                    </div>
                  )}
                  <SeatCount value={formData.seats} available={selectedSlot?.available_spots || 1} onChange={value=>updateFormField("seats",value)}/>

                  <div className="booking-calendar-form-grid">
                    <label>
                      Név
                      <input
                        required
                        type="text"
                        value={formData.customerName}
                        onChange={(event) =>
                          updateFormField("customerName", event.target.value)
                        }
                      />
                    </label>
                    <label>
                      Email
                      <input
                        required
                        type="email"
                        value={formData.customerEmail}
                        onChange={(event) =>
                          updateFormField("customerEmail", event.target.value)
                        }
                      />
                    </label>
                    <label>
                      Telefonszám
                      <input
                        type="tel"
                        value={formData.customerPhone}
                        onChange={(event) =>
                          updateFormField("customerPhone", event.target.value)
                        }
                      />
                    </label>
                    <label>
                      Megjegyzés
                      <textarea
                        rows="3"
                        value={formData.note}
                        onChange={(event) =>
                          updateFormField("note", event.target.value)
                        }
                      />
                    </label>
                  </div>
                  {<BillingFields value={resolvedBilling} onChange={(value, field)=>{
                    requestKeyRef.current=null;
                    if (field === 'privateName') setBillingNameEdited(true);
                    setBilling(value);
                  }}/>}
                  <button
                    className="booking-calendar-submit"
                    disabled={isSubmitting || isLoading || !selectedSlot || !provider}
                    type="submit"
                  >
                    {isSubmitting
                      ? "Foglalás mentése..."
                      : provider === 'stripe' ? 'Foglalás és bankkártyás fizetés' : "Foglalás és átutalási adatok"}
                  </button>
                </form>
              </>
            ) : (
              <p className="booking-calendar-empty">
                Ebben a hónapban nem indul foglalható kurzus. Válassz másik hónapot!
              </p>
            )}

            {status.message && (
              <p
                role="status"
                className={`booking-calendar-status booking-calendar-status--${status.type}`}
              >
                {status.message}
              </p>
            )}
          </section>
        </div>
      </div>
    </section>
  );
}
