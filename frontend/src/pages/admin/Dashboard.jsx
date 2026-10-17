import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/courses";
import { Notice } from "../../components/admin/UI";
import { dateTime, labels } from "../../components/admin/format";
export default function Dashboard() {
  const [d, setD] = useState(null),
    [error, setError] = useState("");
  useEffect(() => {
    api("/admin/dashboard")
      .then(setD)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <>
      <h1>Áttekintés</h1>
      <Notice error={error} />
      {!d && !error ? (
        <p>Betöltés…</p>
      ) : (
        d && (
          <>
            <div className="cl-stats">
              {[
                ["Ma", d.today],
                ["Ezen a héten", d.week],
                ["Ebben a hónapban", d.month],
                ["Lemondva összesen", d.cancelled],
                ["Teljesítve összesen", d.completed],
                
              ].map(([l, v]) => (
                <article className="cl-card" key={l}>
                  <span>{l}</span>
                  <strong>{v}</strong>
                </article>
              ))}
            </div>
            {d.unsent > 0 && (
              <p role="status" className="cl-error">
                {d.unsent} email kézbesítésre vár. Ellenőrizd az emailküldés
                beállításait, ha ez tartósan fennáll.
              </p>
            )}
            <section className="cl-card">
              <h2>Következő foglalások</h2>
              {d.next.length ? (
                d.next.map((b) => (
                  <Link
                    className="cl-row"
                    key={b.id}
                    to={"/admin/bookings?booking=" + b.id}
                  >
                    <strong>{b.customer_name}</strong>
                    <span>{b.course_title}</span>
                    <span>{dateTime(b.start_time)}</span>
                    <span>{labels[b.status]}</span>
                  </Link>
                ))
              ) : (
                <p>Nincs közelgő foglalás.</p>
              )}
            </section>
            <section className="cl-card">
              <h2>Legnépszerűbb képzések</h2>
              {d.popular.length ? (
                d.popular.map((x) => (
                  <p key={x.title}>
                    {x.title} · <strong>{x.count} résztvevő</strong>
                  </p>
                ))
              ) : (
                <p>Még nincs foglalási adat.</p>
              )}
            </section>
          </>
        )
      )}
    </>
  );
}
