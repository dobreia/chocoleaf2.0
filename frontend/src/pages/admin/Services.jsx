import { useEffect, useState } from "react";
import { usePageDraftState } from '../../components/usePageDraft';
import { api } from "../../api/courses";
import { Field, Modal, SaveForm, Notice } from "../../components/admin/UI";
import { money } from "../../components/admin/format";
import ImageUpload from "../../components/admin/ImageUpload";
import ImageAsset from "../../components/ImageAsset";
import {hours} from '../../components/courseSessions';
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
    [edit, setEdit] = usePageDraftState('services.edit', null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const load = () =>
    api("/admin/services")
      .then(setItems)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  useEffect(() => {
    load();
  }, []);
  return (
    <>
      <div className="cl-title">
        <h1>Szolgáltatások</h1>
        <button className="cl-primary" onClick={() => setEdit({ ...empty })}>
          + Új szolgáltatás
        </button>
      </div>
      <Notice error={error} />
      {loading ? (
        <p>Betöltés…</p>
      ) : (
        <div className="cl-service-grid">
          {items.map((s) => (
            <article className="cl-card" key={s.id}>
              {s.image && (
                <ImageAsset className="cl-service-image" src={s.image} alt="" />
              )}
              <h2>{s.title}</h2>
              <p>{s.description}</p>
              <p>
                {s.session_count || 1} alkalom · {hours(s.duration_minutes)} / alkalom · {money(s.price)} · {s.capacity} fő
              </p>
              <p>
                {s.active ? "Aktív" : "Inaktív"} · {s.category}
              </p>
              <button onClick={() => setEdit(s)}>Szerkesztés</button>
            </article>
          ))}
        </div>
      )}
      {edit && (
        <Modal
          className="cl-service-dialog"
          title={edit.id ? "Szolgáltatás szerkesztése" : "Új szolgáltatás"}
          onClose={() => setEdit(null)}
        >
          <SaveForm disabled={uploading>0}
            onSave={async () => {
              await api("/admin/services" + (edit.id ? "/" + edit.id : ""), {
                method: edit.id ? "PUT" : "POST",
                body: edit,
              });
              setEdit(null);
              load();
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
                value={edit[k] || ""}
                onChange={(e) => setEdit({ ...edit, [k]: e.target.value })}
              />
            ))}
            <Field label="Leírás">
              <textarea
                className="cl-service-description"
                rows={6}
                value={edit.description || ""}
                onChange={(e) =>
                  setEdit({ ...edit, description: e.target.value })
                }
              />
            </Field>
            <div className="cl-form-grid">
              <ImageUpload onBusyChange={n=>setUploading(x=>x+n)} label="Kártyakép" value={edit.image} onChange={v=>setEdit(x=>x&&({...x,image:v}))}/>
              <ImageUpload onBusyChange={n=>setUploading(x=>x+n)} label="Részletes kép" value={edit.image_detail} onChange={v=>setEdit(x=>x&&({...x,image_detail:v}))}/>
            </div>
            <Field label="Részletes leírás">
              <textarea
                className="cl-service-long-description"
                rows={12}
                value={edit.long_description || ""}
                onChange={(e) =>
                  setEdit({ ...edit, long_description: e.target.value })
                }
              />
            </Field>
            <div className="cl-form-grid">
              {[
                ["session_count", "Alkalmak száma", 1],
                ["duration_minutes", "Alap időtartam (óra)", 1/60],
                ["price", "Ár (Ft)", 0],
                ["capacity", "Alap férőhely", 1],
              ].map(([k, l, min]) => (
                <Field
                  key={k}
                  required
                  label={l}
                  type="number"
                  min={min}
                  max={k==='session_count'?100:undefined}
                  step={k==='duration_minutes'?'any':1}
                  value={k==='duration_minutes'?edit[k]/60:k==='session_count'?(edit[k] ?? 1):edit[k]}
                  onChange={(e) =>
                    setEdit({ ...edit, [k]: k==='duration_minutes'?Math.round(Number(e.target.value)*60):Number(e.target.value) })
                  }
                />
              ))}
            </div>
            <button type="button" disabled={(edit.session_count || 1)>=100} onClick={()=>setEdit({...edit,session_count:(edit.session_count || 1)+1})}>+ Új alkalom hozzáadása</button>
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
