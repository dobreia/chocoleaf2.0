import { useState } from "react";
import { usePageDraftState } from '../usePageDraft';
import { api } from "../../api/courses";
import { Modal, SaveForm, Field } from "./UI";
import { labels, dateTime, money } from "./format";
export default function BookingEditor({ booking, slots, onDone, onClose }) {
  const [d, setD, resetDraft] = usePageDraftState(
    'bookingEditor.' + (booking?.id || 'new'),
    booking || {
      customer_name: "",
      customer_email: "",
      customer_phone: "",
      course_id: "",
      seats: 1,
      note: "",
      admin_note: "",
      status: "pending",
      payment_status: "pending",
    },
  );
  const [now]=useState(()=>Date.now());
  const stripe = booking?.payment_method === 'stripe';
  const pendingPayment = stripe && booking.payment_status === 'pending';
  const set = (k, v) => setD((x) => ({ ...x, [k]: v }));
  return (
    <Modal
      title={booking ? "Foglalás részletei" : "Új foglalás"}
      onClose={() => { resetDraft(); onClose(); }}
    >
      <SaveForm
        onSave={async () => {
          if (booking)
            await api("/admin/bookings/" + booking.id, {
              method: "PATCH",
              body: {
                ...d,
                ...(d.course_id !== booking.course_id ||
                d.seats !== booking.seats
                  ? { total_price: undefined }
                  : {}),
              },
            });
          else
            await api("/admin/bookings", {
              method: "POST",
              headers: { "Idempotency-Key": crypto.randomUUID() },
              body: {
                courseId: d.course_id,
                customerName: d.customer_name,
                customerEmail: d.customer_email,
                customerPhone: d.customer_phone,
                seats: Number(d.seats),
                note: d.note,
              },
            });
          resetDraft();
          onDone();
        }}
      >
        <div className="cl-form-grid">
          <Field
            label="Ügyfél neve"
            required
            maxLength={200}
            value={d.customer_name}
            onChange={(e) => set("customer_name", e.target.value)}
          />
          <Field
            label="Email"
            disabled={pendingPayment}
            required
            type="email"
            maxLength={254}
            value={d.customer_email}
            onChange={(e) => set("customer_email", e.target.value)}
          />
          <Field
            label="Telefon"
            type="tel"
            value={d.customer_phone || ""}
            onChange={(e) => set("customer_phone", e.target.value)}
          />
          <Field
            label="Létszám"
            disabled={stripe}
            required
            type="number"
            min="1"
            max="100"
            value={d.seats}
            onChange={(e) => set("seats", Number(e.target.value))}
          />
        </div>
        <Field label="Alkalom">
          <select
            required
            disabled={pendingPayment}
            value={d.course_id}
            onChange={(e) => set("course_id", e.target.value)}
          >
            <option value="">Válassz időpontot</option>
            {slots
              .filter((s) => s.id===d.course_id || (s.active && s.service_active!==false && new Date(s.start_time).getTime()>now))
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title} · {dateTime(s.start_time)} · {money(s.price)}/fő
                </option>
              ))}
          </select>
        </Field>
        {booking && (
          <div className="cl-form-grid">
            <Field label="Foglalás státusza">
              <select
                disabled={pendingPayment}
                value={d.status}
                onChange={(e) => set("status", e.target.value)}
              >
                {[
                  "pending",
                  "confirmed",
                  "completed",
                  "cancelled",
                  "no-show",
                ].map((x) => (
                  <option key={x} value={x}>
                    {labels[x]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Fizetés">
              <select
                disabled={stripe}
                value={d.payment_status}
                onChange={(e) => set("payment_status", e.target.value)}
              >
                {["pending", "paid", "refunded", "failed"].map((x) => (
                  <option key={x} value={x}>
                    {labels[x]}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Végösszeg (Ft)"
              disabled={stripe}
              type="number"
              min="0"
              required
              value={d.total_price}
              onChange={(e) => set("total_price", Number(e.target.value))}
            />
          </div>
        )}
        <Field label="Ügyfél megjegyzése">
          <textarea
            maxLength={2000}
            value={d.note || ""}
            onChange={(e) => set("note", e.target.value)}
          />
        </Field>
        {!booking && <p>Az itt rögzített foglalás manuális, átutalásos fizetéssel jön létre.</p>}
        {stripe && <p>A bankkártyás fizetés állapotát automatikusan frissítjük. A számla a Fizetések és számlák oldalon érhető el.</p>}
        {booking && (
          <>
            <Field label="Belső admin megjegyzés">
              <textarea
                maxLength={4000}
                value={d.admin_note || ""}
                onChange={(e) => set("admin_note", e.target.value)}
              />
            </Field>
            <p>
              Létrehozva: {dateTime(d.created_at)}
              <br />
              Módosítva: {dateTime(d.updated_at)}
            </p>
          </>
        )}
      </SaveForm>
      {booking && (
        <SaveForm
          label="Új kezelési link küldése emailben"
          onSave={async () => {
            await api("/admin/bookings/" + booking.id + "/send-link", {
              method: "POST",
            });
            resetDraft();
            onDone();
          }}
        >
          <p>Új link küldésekor a korábbi kezelési link érvényét veszti.</p>
        </SaveForm>
      )}
    </Modal>
  );
}
