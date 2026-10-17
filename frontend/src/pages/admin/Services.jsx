import { useEffect, useState } from "react";
import { api } from "../../api/courses";
import { Field, Modal, SaveForm, Notice } from "../../components/admin/UI";
import { money } from "../../components/admin/format";
import ImageUpload from "../../components/admin/ImageUpload";
import ImageAsset from "../../components/ImageAsset";
const empty = {
  title: "",
  description: "",
  long_description: "",
  category: "",
  duration_minutes: 60,
  price: 0,
  capacity: 6,
  active: true,
  image: "",
  image_detail: "",
};
export default function Services() {
  const [items, setItems] = useState([]),
    [uploading,setUploading]=useState(0),
    [edit, setEdit] = useState(null),
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
                {s.duration_minutes} perc · {money(s.price)} · {s.capacity} fő
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
              ["description", "Leírás"],
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
            <div className="cl-form-grid">
              <ImageUpload onBusyChange={n=>setUploading(x=>x+n)} label="Kártyakép" value={edit.image} onChange={v=>setEdit(x=>x&&({...x,image:v}))}/>
              <ImageUpload onBusyChange={n=>setUploading(x=>x+n)} label="Részletes kép" value={edit.image_detail} onChange={v=>setEdit(x=>x&&({...x,image_detail:v}))}/>
            </div>
            <Field label="Részletes leírás">
              <textarea
                rows="5"
                value={edit.long_description}
                onChange={(e) =>
                  setEdit({ ...edit, long_description: e.target.value })
                }
              />
            </Field>
            <div className="cl-form-grid">
              {[
                ["duration_minutes", "Időtartam (perc)", 1],
                ["price", "Ár (Ft)", 0],
                ["capacity", "Alap férőhely", 1],
              ].map(([k, l, min]) => (
                <Field
                  key={k}
                  required
                  label={l}
                  type="number"
                  min={min}
                  value={edit[k]}
                  onChange={(e) =>
                    setEdit({ ...edit, [k]: Number(e.target.value) })
                  }
                />
              ))}
            </div>
            <label className="cl-check">
              <input
                type="checkbox"
                checked={edit.active}
                onChange={(e) => setEdit({ ...edit, active: e.target.checked })}
              />
              Aktív szolgáltatás
            </label>
            <p>
              A meglévő alkalmak ára, időtartama és férőhelye külön
              szerkeszthető.
            </p>
          </SaveForm>
        </Modal>
      )}
    </>
  );
}
