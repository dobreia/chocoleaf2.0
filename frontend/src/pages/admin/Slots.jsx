import { useEffect, useState } from "react";
import { usePageDraftState } from '../../components/usePageDraft';
import { api } from "../../api/courses";
import SessionList from '../../components/SessionList';
import { sessionsOf } from '../../components/courseSessions';
import { calculatedSessionEnd } from '../../components/admin/sessionTiming.js';
import { Field, Modal, SaveForm, Notice } from "../../components/admin/UI";
import {
  money,
  localInput,
  budapestISO,
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
  const editSessions = edit ? edit.sessions || [{start_time:edit.start_time || '',end_time:edit.end_time || ''}] : [];
  const selectedService=services.find(service=>service.id===edit?.service_id);
  const endPreview=session=>{
    if(edit.id)return session.end_time;
    try {return localInput(calculatedSessionEnd(session.start_time,selectedService?.duration_minutes));}
    catch {return '';}
  };
  const updateSession = (index,key,value) => setEdit({...edit,sessions:editSessions.map((s,i)=>i===index?{...s,[key]:value}:s)});
  return (
    <>
      <div className="cl-title">
        <h1>Időpontok</h1>
        <button
          className="cl-primary"
          onClick={() =>
            setEdit({
              service_id: "",
              start_time: "",
              end_time: "",
              sessions: [{start_time:'',end_time:''}],
              active: true,
              price: 0,
              capacity: 6,
            })
          }
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
        <Modal
          title={edit.id ? "Kurzusmeghirdetés szerkesztése" : "Új kurzusmeghirdetés"}
          onClose={() => setEdit(null)}
        >
          <SaveForm
            onSave={async () => {
              await api("/admin/courses" + (edit.id ? "/" + edit.id : ""), {
                method: edit.id ? "PUT" : "POST",
                body: {
                  ...edit,
                  sessions: editSessions.map(session=>edit.id
                    ? {...session,start_time:budapestISO(session.start_time),end_time:budapestISO(session.end_time)}
                    : {start_time:budapestISO(session.start_time)}),
                },
              });
              setEdit(null);
              load();
            }}
          >
            <Field label="Szolgáltatás">
              <select
                required
                disabled={Boolean(edit.sessions_locked)}
                value={edit.service_id}
                onChange={(e) => {
                  const s = services.find((x) => x.id === e.target.value);
                  setEdit({
                    ...edit,
                    service_id: e.target.value,
                    sessions: Array.from({length:s?.session_count || 1},(_,i)=>editSessions[i] || {start_time:'',end_time:''}),
                    price: s?.price || 0,
                    capacity: s?.capacity || 6,
                  });
                }}
              >
                <option value="">Válassz</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                    {!s.active ? " (inaktív)" : ""}
                  </option>
                ))}
              </select>
            </Field>
            <p>{editSessions.length} alkalom · A foglalás minden felsorolt alkalomra szól. Mentéskor időrendbe rendezzük őket.</p>
            <p>Az alkalmak számát a Szolgáltatások oldalon, a kurzusnál adhatod meg az új meghirdetésekhez. {edit.id ? 'Itt minden alkalom kezdését és befejezését állíthatod be.' : 'Csak a kezdést add meg: a befejezést a szolgáltatás alkalmankénti időtartamából automatikusan kiszámítjuk.'}</p>
            {edit.sessions_locked && <p className="cl-error" role="note">Az alkalmak száma és a kurzus nem módosítható, mert ehhez a meghirdetéshez már foglalás vagy megkezdett fizetés tartozik. A még el nem kezdődött alkalmak dátumai módosíthatók; a változásról értesítjük a résztvevőket.</p>}
            {editSessions.map((session,index)=><fieldset className="cl-session-editor" key={session.id || index}>
              <legend>{index+1}. alkalom</legend>
              <div className="cl-form-grid">{[
                ['start_time',index===0?'Kezdés (Budapest)':`${index+1}. alkalom kezdése (Budapest)`],
                ['end_time',index===0?'Befejezés (Budapest)':`${index+1}. alkalom befejezése (Budapest)`],
              ].map(([k,l])=>(
                <Field
                  key={k}
                  required
                  label={l}
                  type="datetime-local"
                  disabled={Boolean(session.started)}
                  readOnly={!edit.id && k==='end_time'}
                  value={k==='end_time'?endPreview(session):session[k]}
                  onChange={e=>updateSession(index,k,e.target.value)}
                />
              ))}</div>
            </fieldset>)}
            <div className="cl-form-grid">
              <Field
                required
                label="Ár / fő (Ft)"
                min="0"
                type="number"
                value={edit.price}
                onChange={(e) =>
                  setEdit({ ...edit, price: Number(e.target.value) })
                }
              />
              <Field
                required
                label="Férőhely"
                min="1"
                max="100"
                type="number"
                value={edit.capacity}
                onChange={(e) =>
                  setEdit({ ...edit, capacity: Number(e.target.value) })
                }
              />
            </div>

            <label className="cl-check">
              <input
                type="checkbox"
                checked={edit.active}
                onChange={(e) => setEdit({ ...edit, active: e.target.checked })}
              />
              Foglalható alkalom
            </label>
            <p>Az ár a teljes kurzus ára / fő. Az aktív állapot és a férőhely az összes alkalomra közös.</p>
          </SaveForm>
        </Modal>
      )}
    </>
  );
}
