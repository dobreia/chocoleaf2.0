import { useEffect, useState } from "react";
import { api } from "../../api/courses";
import { Field, Modal, SaveForm, Notice } from "../../components/admin/UI";
import {
  dateTime,
  money,
  localInput,
  budapestISO,
} from "../../components/admin/format";
export default function Slots() {
  const [items, setItems] = useState([]),
    [services, setServices] = useState([]),
    [edit, setEdit] = useState(null),
    [error, setError] = useState(""),
    [q, setQ] = useState(""),
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
          onClick={() =>
            setEdit({
              service_id: "",
              start_time: "",
              end_time: "",
              active: true,
              price: 0,
              capacity: 6,
            })
          }
        >
          + Új alkalom
        </button>
      </div>
      <Notice error={error} />
      <p>
        Az időpontok budapesti idő szerint értendők. Egy alkalom több résztvevőt
        fogadhat.
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
                      {dateTime(s.start_time)}
                      <br />
                      {dateTime(s.end_time)}
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
                          })
                        }
                      >
                        Szerkesztés
                      </button>
                      <button
                        onClick={async () => {
                          if (!window.confirm("Törlöd ezt az alkalmat?"))
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
          title={edit.id ? "Alkalom szerkesztése" : "Új alkalom"}
          onClose={() => setEdit(null)}
        >
          <SaveForm
            onSave={async () => {
              await api("/admin/courses" + (edit.id ? "/" + edit.id : ""), {
                method: edit.id ? "PUT" : "POST",
                body: {
                  ...edit,
                  start_time: budapestISO(edit.start_time),
                  end_time: budapestISO(edit.end_time),
                },
              });
              setEdit(null);
              load();
            }}
          >
            <Field label="Szolgáltatás">
              <select
                required
                value={edit.service_id}
                onChange={(e) => {
                  const s = services.find((x) => x.id === e.target.value);
                  setEdit({
                    ...edit,
                    service_id: e.target.value,
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
            <div className="cl-form-grid">
              {[
                ["start_time", "Kezdés (Budapest)"],
                ["end_time", "Befejezés (Budapest)"],
              ].map(([k, l]) => (
                <Field
                  key={k}
                  required
                  label={l}
                  type="datetime-local"
                  value={edit[k]}
                  onChange={(e) => setEdit({ ...edit, [k]: e.target.value })}
                />
              ))}
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
          </SaveForm>
        </Modal>
      )}
    </>
  );
}
