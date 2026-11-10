import { useEffect, useState, useCallback, lazy, Suspense } from "react";
import { usePageDraftState } from '../../components/usePageDraft';
import { api } from "../../api/courses";
import { Field, Modal, SaveForm, Notice } from "../../components/admin/UI";
import { dateTime } from "../../components/admin/format";
import { inquiryReplyUrl } from '../../components/admin/inquiryReply';
import { useOutletContext } from 'react-router-dom';
import {documentPlainText} from '../../components/contentDocument';
const RichTextEditor=lazy(()=>import('../../components/admin/RichTextEditor'));
export default function Records({ kind }) {
  const { refreshInquiryCount } = useOutletContext() || {};
  const [items, setItems] = useState([]),
    [edit, setEdit] = usePageDraftState('records.edit', null),
    [error, setError] = useState(""),
    [q, setQ] = usePageDraftState('records.search', ""),
    [loading, setLoading] = useState(true),
    [editorReady,setEditorReady]=useState(false),
    [saving,setSaving]=useState(false);
  const openEdit=value=>{setEditorReady(false);setEdit(value);};
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
  useEffect(() => {
    if (kind !== 'inquiries' || loading) return;
    const ids = items.filter(item => !item.read_at).map(item => item.id);
    if (!ids.length) return;
    let live = true;
    api('/admin/inquiries/read', {method:'POST',body:{ids}})
      .then(() => {
        if (!live) return;
        const read = new Set(ids);
        setItems(current => current.map(item => read.has(item.id) ? {...item,read_at:new Date().toISOString()} : item));
        refreshInquiryCount?.();
      })
      .catch(error => { if (live) setError(error.message); });
    return () => { live = false; };
  }, [kind, loading, items, refreshInquiryCount]);
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
                disabled={loading}
                onClick={() =>
                  openEdit(
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
              {kind === "content" && <p>{documentPlainText(x.body).slice(0, 180)}…</p>}
              {kind === "inquiries" ? (
                <div className="cl-actions">
                <a className="cl-inquiry-reply" href={inquiryReplyUrl(x)} target="_blank" rel="noopener noreferrer">Válasz Gmailben</a>
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
                </div>
              ) : (
                <button
                  onClick={() => openEdit({ ...x, original_email: x.email })}
                >
                  Szerkesztés
                </button>
              )}
            </article>
          ))
      )}
      {!loading && !items.length && <p>Még nincs bejegyzés.</p>}
      {edit && (
        <Modal title="Szerkesztés" className={kind==='content'?'cl-content-dialog':''} onClose={event=>{if(saving){event?.preventDefault();return;}setEdit(null);}}>
          <SaveForm
            disabled={kind==='content'&&!editorReady}
            onSave={async () => {
              if(kind==='content'){
                if(!documentPlainText(edit.body).trim())throw new Error('Írj szöveget az oldal tartalmába.');
                if(edit.body.length>50000||new TextEncoder().encode(JSON.stringify(edit)).length>60*1024)throw new Error('A dokumentum túl hosszú. Rövidítsd a szöveget vagy egyszerűsítsd a formázást.');
              }
              const path =
                kind === "customers"
                  ? "/admin/customers"
                  : "/admin/content/" + edit.slug;
              setSaving(true);
              try{
                await api(path, {method:"PUT",body:edit});
                setEdit(null);load();
              }finally{setSaving(false);}
            }}
          >
            {kind === "content" ? (
              <>
                <Field
                  label="Cím"
                  required
                  maxLength={200}
                  value={edit.title}
                  onChange={(e) => setEdit({ ...edit, title: e.target.value })}
                />
                <div className="cl-field"><span>Tartalom</span></div>
                <Suspense fallback={<p role="status">Szövegszerkesztő betöltése…</p>}>
                  <RichTextEditor key={edit.slug} value={edit.body} disabled={saving} onReady={setEditorReady}
                    onChange={body=>setEdit(current=>current?{...current,body}:current)}/>
                </Suspense>
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
