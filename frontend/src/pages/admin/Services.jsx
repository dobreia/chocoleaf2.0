import { useEffect, useRef, useState } from "react";
import { usePageDraftState } from '../../components/usePageDraft';
import { api } from "../../api/courses";
import { Field, Modal, SaveForm, Notice } from "../../components/admin/UI";
import { money } from "../../components/admin/format";
import ImageUpload from "../../components/admin/ImageUpload";
import ImageAsset from "../../components/ImageAsset";
import {hours} from '../../components/courseSessions';
import {serviceNumberFields,serviceFormValues,servicePayload} from '../../components/admin/serviceForm';
const empty = {
  title: "",
  description: "",
  long_description: "",
  category: "",
  duration_minutes: 60,
  session_count: 1,
  price: 0,
  capacity: 6,
  active: true,
  image: "",
  image_detail: "",
};
export default function Services() {
  const [items, setItems] = useState([]),
    [uploading,setUploading]=useState(0),
    [saving,setSaving]=useState(false),
    [edit, setEdit] = usePageDraftState('services.edit', null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const editorSession=useRef(0);
  const [session,setSession]=useState(0);
  function openEditor(service){editorSession.current++;setSession(editorSession.current);setUploading(0);setEdit(serviceFormValues(service));}
  function closeEditor(event){
    if(saving){event?.preventDefault();return;}
    editorSession.current++;setUploading(0);setEdit(null);
  }
  const imageChange=(key,value)=>{if(editorSession.current===session)setEdit(current=>current&&({...current,[key]:value}));};
  const imageBusy=delta=>{if(editorSession.current===session)setUploading(current=>Math.max(0,current+delta));};
  const load = () =>
    api("/admin/services")
      .then(data=>{setItems(data);setError('');})
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  useEffect(() => {
    load();
  }, []);
  return (
    <>
      <div className="cl-title">
        <h1>Szolgáltatások</h1>
        <button className="cl-primary" onClick={() => openEditor(empty)}>
          + Új szolgáltatás
        </button>
      </div>
      <Notice error={error} />
      {loading ? (
        <p>Betöltés…</p>
      ) : (
        <div className="cl-service-grid">
          {items.map((s) => (
            <article className="cl-card cl-service-card" key={s.id}>
              <div className="cl-service-image-frame">
                {s.image ? <ImageAsset className="cl-service-image" src={s.image} alt={s.title} /> : <span>Nincs kép</span>}
              </div>
              <h2>{s.title}</h2>
              <p>{s.description}</p>
              <p className="cl-service-meta">
                {s.session_count || 1} alkalom · {hours(s.duration_minutes)} / alkalom · {money(s.price)} · {s.capacity} fő
              </p>
              <p>
                {s.active ? "Aktív" : "Inaktív"} · {s.category}
              </p>
              <button className="cl-service-edit" onClick={() => openEditor(s)}>Szerkesztés</button>
            </article>
          ))}
        </div>
      )}
      {edit && (
        <Modal
          className="cl-service-dialog"
          title={edit.id ? "Szolgáltatás szerkesztése" : "Új szolgáltatás"}
          onClose={closeEditor}
        >
          <SaveForm disabled={uploading>0}
            onSave={async () => {
              const payload=servicePayload(edit);
              setSaving(true);
              try{
                await api("/admin/services" + (edit.id ? "/" + edit.id : ""), {
                  method: edit.id ? "PUT" : "POST",body:payload,
                });
                if(editorSession.current===session){editorSession.current++;setEdit(null);}
                load();
              }finally{setSaving(false);}
            }}
          >
            {[
              ["title", "Név"],
              ["category", "Kategória"],
            ].map(([k, l]) => (
              <Field
                key={k}
                label={l}
                required={k === "title"}
                maxLength={k==='title'?200:100}
                value={edit[k] || ""}
                onChange={(e) => setEdit({ ...edit, [k]: e.target.value })}
              />
            ))}
            <Field label="Leírás">
              <textarea
                className="cl-service-description"
                rows={6}
                maxLength={4000}
                value={edit.description || ""}
                onChange={(e) =>
                  setEdit({ ...edit, description: e.target.value })
                }
              />
            </Field>
            <div className="cl-form-grid">
              <ImageUpload onBusyChange={imageBusy} label="Kártyakép" value={edit.image} onChange={value=>imageChange('image',value)}/>
              <ImageUpload onBusyChange={imageBusy} label="Részletes kép" value={edit.image_detail} onChange={value=>imageChange('image_detail',value)}/>
            </div>
            <Field label="Részletes leírás">
              <textarea
                className="cl-service-long-description"
                rows={12}
                maxLength={20000}
                value={edit.long_description || ""}
                onChange={(e) =>
                  setEdit({ ...edit, long_description: e.target.value })
                }
              />
            </Field>
            <div className="cl-form-grid">
              {serviceNumberFields.map(({key:k,label:l,min,max,step}) => (
                <Field
                  key={k}
                  required
                  label={l}
                  type="number"
                  min={min}
                  max={max}
                  step={step}
                  value={k==='duration_hours'?(edit.duration_hours??(edit.duration_minutes===''?'':edit.duration_minutes/60)):(edit[k]??'')}
                  onChange={(e) =>
                    setEdit({ ...edit, [k]: e.target.value })
                  }
                />
              ))}
            </div>
            <button type="button" disabled={Number(edit.session_count)>=100||(edit.session_count!==''&&(!Number.isInteger(Number(edit.session_count))||Number(edit.session_count)<1))} onClick={()=>setEdit({...edit,session_count:String(Math.min(100,(Number(edit.session_count)||1)+1))})}>+ Új alkalom hozzáadása</button>
            <label className="cl-check">
              <input
                type="checkbox"
                checked={edit.active}
                onChange={(e) => setEdit({ ...edit, active: e.target.checked })}
              />
              Aktív szolgáltatás
            </label>
            <p>
              Az alkalmak száma határozza meg, hány időpontot kell megadni egy új meghirdetésnél.
              Módosítása a már meghirdetett kurzusok alkalomszámát nem változtatja meg.
              Az ár a teljes kurzus ára / fő; az időtartam alkalmanként értendő.
            </p>
          </SaveForm>
        </Modal>
      )}
    </>
  );
}
