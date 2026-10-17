import { useEffect, useState, useCallback } from "react";
import { usePageDraftState } from '../components/usePageDraft';
import { api, getCourseAvailability } from "../api/courses";
import { Field, SaveForm, Notice } from "../components/admin/UI";
import { dateTime, labels, money } from "../components/admin/format";
import "../styles/AdminWorkspace.css";
import SessionList from '../components/SessionList';
import {sessionsOf,durationSummary} from '../components/courseSessions';
export default function ManageBooking() {
  const [link] = useState(() => {
    const [id, token] = window.location.hash.slice(1).split(".");
    return { id, token };
  });
  const [d, setD] = useState(null),
    [slots, setSlots] = useState([]),
    [kind, setKind, resetKind] = usePageDraftState('manage.kind', "reschedule"),
    [target, setTarget, resetTarget] = usePageDraftState('manage.target', ""),
    [note, setNote, resetNote] = usePageDraftState('manage.note', ""),
    [error, setError] = useState(() =>
      link.id && link.token
        ? ""
        : "Nyisd meg az emailben kapott teljes foglaláskezelő linket.",
    ),
    [message, setMessage] = useState("");
  const headers = { "X-Booking-Token": link.token || "" };
  const load = useCallback(
    () =>
      api("/bookings/" + link.id + "/manage", {
        headers: { "X-Booking-Token": link.token || "" },
      })
        .then(async (b) => {
          setD(b);
          setSlots(await getCourseAvailability({ courseId: b.service_id }));
        })
        .catch((e) => setError(e.message)),
    [link],
  );
  useEffect(() => {
    if (link.id && link.token) load();
  }, [link, load]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  const pending = d?.requests.some((r) => r.status === "pending");
  const can =
    d &&
    ["pending", "confirmed"].includes(d.status) &&
    new Date(d.start_time).getTime() - now >= d.cancellation_hours * 3600000;
  return (
    <section className="cl-admin">
      <div className="cl-content" style={{ maxWidth: 800 }}>
        <h1>Foglalásom kezelése</h1>
        <Notice error={error} message={message} />
        {d && (
          <>
            <article className="cl-card">
              <h2>{d.course_title}</h2>
              <p>
                {durationSummary(d)} · Budapesti idő szerint
              </p>
              <SessionList course={d}/>
              {sessionsOf(d).length>1 && <p>A lemondás és az átfoglalás minden alkalomra együtt vonatkozik.</p>}
              <p>
                {d.customer_name} · {d.seats} fő · {money(d.total_price)}
              </p>
              <p>Státusz: {labels[d.status]}</p>
            </article>
            {pending ? (
              <p className="cl-success">
                Kérelmed elbírálásra vár. Az eredeti foglalás a jóváhagyásig
                változatlanul érvényes.
              </p>
            ) : can ? (
              <section className="cl-card">
                <h2>Módosítás vagy lemondás</h2>
                <p>
                  A kérelmet az adminisztrátor hagyja jóvá. Az új időpont addig
                  nincs lefoglalva. Online kérelmet a kezdés előtt legalább{" "}
                  {d.cancellation_hours} órával küldhetsz, az első alkalom kezdetétől számítva.
                </p>
                <SaveForm
                  label="Kérelem elküldése"
                  onSave={async () => {
                    await api("/bookings/" + link.id + "/requests", {
                      method: "POST",
                      headers,
                      body: { kind, course_id: target, note },
                    });
                    setMessage(
                      "Kérelmedet elküldtük. Emailben értesítünk a döntésről.",
                    );
                    resetKind();
                    resetTarget();
                    resetNote();
                    load();
                  }}
                >
                  <Field label="Mit szeretnél?">
                    <select
                      value={kind}
                      onChange={(e) => setKind(e.target.value)}
                    >
                      <option value="reschedule">Másik időpontot kérek</option>
                      <option value="cancel">Lemondást kérek</option>
                    </select>
                  </Field>
                  {kind === "reschedule" && (
                    <Field label="Új időpont">
                      <select
                        required
                        value={target}
                        onChange={(e) => setTarget(e.target.value)}
                      >
                        <option value="">Válassz időpontot</option>
                        {slots
                          .filter(
                            (s) =>
                              s.id !== d.course_id &&
                              sessionsOf(s).length===sessionsOf(d).length &&
                              s.available_spots >= d.seats,
                          )
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {dateTime(s.start_time)} · {durationSummary(s)} · {money(s.price)}/fő
                            </option>
                          ))}
                      </select>
                    </Field>
                  )}
                  {kind==='reschedule' && target && <SessionList course={slots.find(s=>s.id===target)}/>}
                  <Field label="Megjegyzés">
                    <textarea
                      maxLength={2000}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                  </Field>
                </SaveForm>
              </section>
            ) : (
              <p>
                Ez a foglalás online már nem módosítható. Írj az{" "}
                <a href="mailto:info@chocoleaf.hu">info@chocoleaf.hu</a> címre.
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
