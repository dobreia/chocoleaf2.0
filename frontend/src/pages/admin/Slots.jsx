import { useEffect, useState } from "react";
import { usePageDraftState } from '../../components/usePageDraft';
import { api } from "../../api/courses";
import SessionList from '../../components/SessionList';
import { sessionsOf } from '../../components/courseSessions';
import CourseSlotEditor from '../../components/admin/CourseSlotEditor';
import { newCourseDraft } from '../../components/admin/courseSlotDraft';
import { Field, Notice } from "../../components/admin/UI";
import {
  money,
  localInput,
} from "../../components/admin/format";
export default function Slots() {
  const [items, setItems] = useState([]),
    [services, setServices] = useState([]),
    [edit, setEdit] = usePageDraftState('slots.edit', null),
    [error, setError] = useState(""),
    [q, setQ] = usePageDraftState('slots.filter', ""),
    [loading, setLoading] = useState(true);
  const load = () =>
    Promise.all([
      api("/admin/courses"),
      api("/admin/services"),
    ])
      .then(([a, b]) => {
        setItems(a);
        setServices(b);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  useEffect(() => {
    load();
  }, []);
  return (
    <>
      <div className="cl-title">
        <h1>Időpontok</h1>
        <button
          className="cl-primary"
          onClick={() => setEdit(newCourseDraft())}
        >
          + Új kurzusmeghirdetés
        </button>
      </div>
      <Notice error={error} />
      <p>
        Az időpontok budapesti idő szerint értendők. Egy meghirdetés összes alkalma
        közösen foglalható, közös csomagárral és férőhellyel.
      </p>
      <Field label="Szolgáltatás szűrése">
        <select value={q} onChange={(e) => setQ(e.target.value)}>
          <option value="">Összes</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
      </Field>
      {loading ? (
        <p>Betöltés…</p>
      ) : (
        <div className="cl-table">
          <table>
            <thead>
              <tr>
                <th>Szolgáltatás</th>
                <th>Kezdés / befejezés</th>
                <th>Kapacitás / ár</th>
                <th>Műveletek</th>
              </tr>
            </thead>
            <tbody>
              {items
                .filter((s) => !q || q === s.service_id)
                .map((s) => (
                  <tr key={s.id}>
                    <td>
                      {s.title}
                      <br />
                      {s.active ? "Aktív" : "Inaktív"}
                    </td>
                    <td>
                      <SessionList course={s}/>
                    </td>

                    <td>
                      {s.capacity} fő · {money(s.price)}
                    </td>
                    <td>
                      <button
                        onClick={() =>
                          setEdit({
                            ...s,
                            start_time: localInput(s.start_time),
                            end_time: localInput(s.end_time),
                            sessions: sessionsOf(s).map(session=>({...session,started:new Date(session.start_time)<=new Date(),start_time:localInput(session.start_time),end_time:localInput(session.end_time)})),
                          })
                        }
                      >
                        Szerkesztés
                      </button>
                      <button
                        onClick={async () => {
                          if (!window.confirm("Törlöd ezt a teljes meghirdetést az összes alkalmával együtt?"))
                            return;
                          try {
                            await api("/admin/courses/" + s.id, {
                              method: "DELETE",
                            });
                            load();
                          } catch (e) {
                            setError(e.message);
                          }
                        }}
                      >
                        Törlés
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          {!items.length && <p>Még nincs meghirdetett alkalom.</p>}
        </div>
      )}
      {edit && (
        <CourseSlotEditor edit={edit} setEdit={setEdit} services={services}
          onClose={() => setEdit(null)} onDone={() => { setEdit(null); load(); }} />
      )}
    </>
  );
}
