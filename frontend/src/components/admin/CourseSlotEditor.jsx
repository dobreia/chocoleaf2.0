import { api } from "../../api/courses";
import { calculatedSessionEnd } from './sessionTiming.js';
import { Field, Modal, SaveForm } from './UI';
import { localInput, budapestISO } from './format';

export default function CourseSlotEditor({ edit, setEdit, services, onClose, onDone }) {
  const editSessions = edit ? edit.sessions || [{start_time:edit.start_time || '',end_time:edit.end_time || ''}] : [];
  const selectedService=services.find(service=>service.id===edit?.service_id);
  const endPreview=session=>{
    if(edit.id)return session.end_time;
    try {return localInput(calculatedSessionEnd(session.start_time,selectedService?.duration_minutes));}
    catch {return '';}
  };
  const updateSession = (index,key,value) => setEdit({...edit,sessions:editSessions.map((s,i)=>i===index?{...s,[key]:value}:s)});
  return (
    <Modal
      title={edit.id ? "Kurzusmeghirdetés szerkesztése" : "Új kurzusmeghirdetés"}
      onClose={onClose}
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
          onDone();
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
  );
}
