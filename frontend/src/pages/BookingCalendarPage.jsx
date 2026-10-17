import SeatCount from "../components/SeatCount";
import { startStripePayment } from '../api/payments';
import {validSeatCount} from "../components/seatRules";
import { dayKey, money } from "../components/admin/format";
import { useEffect, useMemo, useState } from "react";
import { usePageDraftState, usePageDraftRef, useClearPageDrafts } from '../components/usePageDraft';
import { Link, useParams, useSearchParams, useNavigate } from "react-router-dom";
import BillingFields from '../components/BillingFields';
import { emptyBilling } from '../components/billingData';
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
    const key = dayKey(slot.start_time);
    if (!days[key]) days[key] = [];
    days[key].push(slot);
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
  const [slots, setSlots] = useState([]);
  const [selectedDateKey, setSelectedDateKey] = usePageDraftState('booking.day', "");
  const [selectedSlotId, setSelectedSlotId] = usePageDraftState('booking.slot', "");
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
  const selectedDate = selectedDateKey
    ? new Date(`${selectedDateKey}T12:00:00`)
    : null;
  const selectedDaySlots = selectedDateKey
    ? slotsByDay[selectedDateKey] || []
    : [];
  const selectedSlot = selectedDaySlots.find(
    (slot) => String(slot.id) === String(selectedSlotId),
  );

  useEffect(() => {
    api('/payments/config').then(x=>setProvider(x.provider)).catch(e=>setStatus({type:'error',message:e.message}));
    getCourses()
      .then(setCourses)
      .catch((error) => setStatus({ type: "error", message: error.message }));
  }, []);

  useEffect(() => {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth() + 1;

    let live = true;

    getCourseAvailability({ courseId: id, year, month })
      .then((items) => {
        if (!live) return;
        setSlots(items);
        const firstAvailable = items.find((slot) => slot.id===preferredSlot && slot.is_available) || items.find((slot) => slot.is_available);
        const firstAvailableKey = firstAvailable
          ? dayKey(firstAvailable.start_time)
          : "";
        setSelectedDateKey((currentKey) =>
          currentKey &&
          items.some(
            (slot) =>
              dayKey(slot.start_time) === currentKey && slot.is_available,
          )
            ? currentKey
            : firstAvailableKey,
        );
        setSelectedSlotId(current => items.some(s=>s.id===current&&s.is_available) ? current : items.some(s=>s.id===preferredSlot&&s.is_available)?preferredSlot:"");
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
  }, [id, monthDate, preferredSlot, setSelectedDateKey, setSelectedSlotId]);

  function moveMonth(delta) {
    setIsLoading(true);
    setSlots([]);
    setSelectedSlotId("");
    setStatus({ type: "", message: "" });
    setMonthValue((currentDate) => {
      const nextDate = new Date(currentDate);
      nextDate.setMonth(currentDate.getMonth() + delta);
      return getMonthStart(nextDate).getTime();
    });
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
          billingData: provider === 'stripe' ? resolvedBilling : undefined,
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

      const year = monthDate.getFullYear();
      const month = monthDate.getMonth() + 1;
      try {
        const refreshedSlots = await getCourseAvailability({
          courseId: id,
          year,
          month,
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
                    ].join(" ")}
                    disabled={!isAvailable || isLoading}
                    aria-label={key}
                    aria-pressed={isSelected}
                    key={key}
                    type="button"
                    onClick={() => {
                      setSelectedDateKey(key);
                      setSelectedSlotId("");
                    }}
                  >
                    {date.getDate()}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="booking-calendar-slots" aria-live="polite">
            {isLoading ? (
              <p className="booking-calendar-empty">Időpontok betöltése...</p>
            ) : selectedDate && selectedDaySlots.length > 0 ? (
              <>
                <h2>{dayTitleFormatter.format(selectedDate)}</h2>
                <p className="booking-calendar-period">
                  {getPeriodLabel(new Date(selectedDaySlots[0].start_time))}
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
                      {timeFormatter.format(new Date(slot.start_time))}
                      <span>{slot.available_spots} hely</span>
                    </button>
                  ))}
                </div>

                <form
                  className="booking-calendar-form"
                  onSubmit={submitBooking}
                >
                  <h3>Foglalási adatok</h3>
                  {selectedSlot && (
                    <p>
                      <strong>
                        {Math.round(
                          (new Date(selectedSlot.end_time) -
                            new Date(selectedSlot.start_time)) /
                            60000,
                        )}{" "}
                        perc · {money(selectedSlot.price)} / fő · Összesen{" "}
                        {validSeatCount(formData.seats,selectedSlot.available_spots)?money(selectedSlot.price * Number(formData.seats)):"–"}
                      </strong>
                      <br />
                      Időpontok budapesti idő szerint.
                    </p>
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
                  {provider === 'stripe' && <BillingFields value={resolvedBilling} onChange={(value, field)=>{
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
                      : provider === 'stripe' ? 'Foglalás és bankkártyás fizetés' : "Foglalás elküldése"}
                  </button>
                </form>
              </>
            ) : (
              <p className="booking-calendar-empty">
                Ebben a hónapban nincs szabad időpont ehhez a képzéshez.
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
