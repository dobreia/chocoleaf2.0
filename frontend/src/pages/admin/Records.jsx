import { useEffect, useState, useCallback } from "react";
import { usePageDraftState } from '../../components/usePageDraft';
import { api } from "../../api/courses";
import { Field, Modal, SaveForm, Notice } from "../../components/admin/UI";
import { dateTime } from "../../components/admin/format";
export default function Records({ kind }) {
  const [items, setItems] = useState([]),
    [edit, setEdit] = usePageDraftState('records.edit', null),
    [error, setError] = useState(""),
    [q, setQ] = usePageDraftState('records.search', ""),
    [loading, setLoading] = useState(true);
  const load = useCallback(
    () =>
      api("/admin/" + kind)
        .then(setItems)
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false)),
    [kind],
  );
  useEffect(() => {
    load();
  }, [load]);
  const titles = {
    customers: "Ügyfelek",
    inquiries: "Megkeresések",
    content: "Oldaltartalmak",
  };
  return (
    <>
      <div className="cl-title">
        <h1>{titles[kind]}</h1>

      </div>
      <Notice error={error} />
      {kind === "content" && (
        <>
          <p>
            A jogi oldalak szövegét az üzemeltető tölti fel. A rendszer nem
            publikál kitalált jogi tartalmat.
          </p>
          <div className="cl-actions">
            {[
              ["imprint", "Impresszum"],
              ["privacy", "Adatkezelési tájékoztató"],
              ["terms", "Rendelési feltételek"],
              ["cookies", "Sütik"],
            ].map(([slug, title]) => (
              <button
                key={slug}
                onClick={() =>
                  setEdit(
                    items.find((x) => x.slug === slug) || {
                      slug,
                      title,
                      body: "",
                    },
                  )
                }
              >
                {title} szerkesztése
              </button>
            ))}
          </div>
        </>
      )}
      <Field
        label="Keresés"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {loading ? (
        <p>Betöltés…</p>
      ) : (
        items
          .filter((x) =>
            JSON.stringify(x)
              .toLocaleLowerCase("hu")
              .includes(q.toLocaleLowerCase("hu")),
          )
          .map((x) => (
            <article className="cl-card" key={x.id || x.email || x.slug}>
              <h2>{x.name || x.title || x.subject}</h2>
              {kind === "customers" && (
                <>
                  <p>
                    {x.email} · {x.phone || "Nincs telefon"}
                  </p>
                  <p>
                    {x.bookings} foglalás · utolsó: {dateTime(x.last_booking)}
                  </p>
                </>
              )}
              {kind === "inquiries" && (
                <>
                  <p>
                    {x.name} · <a href={"mailto:" + x.email}>{x.email}</a> ·{" "}
                    {x.phone}
                  </p>
                  <p style={{ whiteSpace: "pre-wrap" }}>{x.message}</p>
                  <p>
                    {dateTime(x.created_at)} ·{" "}
                    {x.status === "new" ? "Új" : "Kezelve"}
                  </p>
                </>
              )}
              {kind === "content" && <p>{x.body.slice(0, 180)}…</p>}
              {kind === "inquiries" ? (
                <button
                  onClick={async () => {
                    try {
                      await api("/admin/inquiries/" + x.id, {
                        method: "PATCH",
                        body: {
                          status: x.status === "new" ? "handled" : "new",
                        },
                      });
                      load();
                    } catch (e) {
                      setError(e.message);
                    }
                  }}
                >
                  {x.status === "new" ? "Kezeltnek jelölés" : "Újra megnyitás"}
                </button>
              ) : (
                <button
                  onClick={() => setEdit({ ...x, original_email: x.email })}
                >
                  Szerkesztés
                </button>
              )}
            </article>
          ))
      )}
      {!loading && !items.length && <p>Még nincs bejegyzés.</p>}
      {edit && (
        <Modal title="Szerkesztés" onClose={() => setEdit(null)}>
          <SaveForm
            onSave={async () => {
              const path =
                kind === "customers"
                  ? "/admin/customers"
                  : "/admin/content/" + edit.slug;
              await api(path, {
                method: "PUT",
                body: edit,
              });
              setEdit(null);
              load();
            }}
          >
            {kind === "content" ? (
              <>
                <Field
                  label="Cím"
                  required
                  value={edit.title}
                  onChange={(e) => setEdit({ ...edit, title: e.target.value })}
                />
                <Field label="Tartalom (bekezdésekkel) ">
                  <textarea
                    rows="14"
                    required
                    value={edit.body}
                    onChange={(e) => setEdit({ ...edit, body: e.target.value })}
                  />
                </Field>
              </>
            ) : (
              <>
                <Field
                  label="Név"
                  required
                  value={edit.name}
                  onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                />
                  <>
                    <Field
                      label="Email (foglalásonként módosítható)"
                      readOnly
                      value={edit.email}
                    />
                    <Field
                      label="Telefon"
                      value={edit.phone || ""}
                      onChange={(e) =>
                        setEdit({ ...edit, phone: e.target.value })
                      }
                    />
                  </>

              </>
            )}
          </SaveForm>
        </Modal>
      )}
    </>
  );
}
