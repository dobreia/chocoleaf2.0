import { useEffect, useState } from "react";
import { usePageDraftState, useDraftPage } from '../../components/usePageDraft';
import { draftKey, writeDraft } from '../../components/pageDraftStore';
import { useSearchParams } from "react-router-dom";
import { api } from "../../api/courses";
import { Field, Notice } from "../../components/admin/UI";
import { labels, dateTime, money } from "../../components/admin/format";
import BookingEditor from "../../components/admin/BookingEditor";
import SessionList from '../../components/SessionList';
export default function Bookings() {
  const [search] = useSearchParams();
  const draftPage = useDraftPage();
  const [data, setData] = useState({ items: [], total: 0 }),
    [slots, setSlots] = useState([]),
    [services, setServices] = useState([]),
    [requests, setRequests] = useState([]),
    [filter, updateFilter] = usePageDraftState('bookings.filter', {
      q: "",
      status: "",
      service: "",
      from: "",
      to: "",
      sort: "desc",
      page: 1,
    }),
    [edit, setEdit] = usePageDraftState('bookings.edit', undefined),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [confirmation, setConfirmation] = useState(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const setFilter = (value) => {
    setLoading(true);
    updateFilter(value);
  };
  useEffect(() => {
    const id = search.get("booking");
    if (id)
      api("/admin/bookings/" + id)
        .then(setEdit)
        .catch((e) => setError(e.message));
  }, [search, setEdit]);
  useEffect(() => {
    Promise.all([
      api("/admin/courses"),
      api("/admin/services"),
    ])
      .then(([a, b]) => {
        setSlots(a);
        setServices(b);
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    let live = true;
    const timer = setTimeout(
      () =>
        Promise.all([
          api("/admin/bookings?" + new URLSearchParams(filter)),
          api("/admin/requests"),
        ])
          .then(([a, b]) => {
            if (live) {
              setData(a);
              setRequests(b);
              setError("");
            }
          })
          .catch((e) => {
            if (live) setError(e.message);
          })
          .finally(() => {
            if (live) setLoading(false);
          }),
      200,
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [filter, search]);
  const refresh = async () => {
    const [bookings, pendingRequests, courses] = await Promise.all([
      api("/admin/bookings?" + new URLSearchParams(filter)),
      api("/admin/requests"),
      api("/admin/courses"),
    ]);
    setData(bookings);
    setRequests(pendingRequests);
    setSlots(courses);
  };
  const action = async (fn) => {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
      setConfirmation(null);
      await refresh();
      setMessage("A módosítás mentve.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const closeEditor = () => {
    if (edit?.id) writeDraft(draftKey(draftPage, 'bookingEditor.' + edit.id), undefined);
    setEdit(undefined);
  };
  const editorDone = async () => {
    closeEditor();
    await refresh();
    setMessage("Foglalás mentve.");
  };
  const changeBooking = (booking, changes) => action(() => api('/admin/bookings/' + booking.id, {
    method: 'PATCH', body: { ...changes, updated_at: booking.updated_at },
  }));
  return (
    <>
      <div className="cl-title">
        <h1>Foglalások</h1>
        <button className="cl-primary" onClick={() => { closeEditor(); setEdit(null); }}>
          + Új foglalás
        </button>
      </div>
      <div className="cl-bookings-feedback">
        <Notice error={error} message={message} />
      </div>
      {requests.length > 0 && (
        <section className="cl-card">
          <h2>Jóváhagyásra vár · {requests.length}</h2>
          {requests.map((r) => (
            <article className="cl-request" key={r.id}>
              <strong>
                {r.customer_name} –{" "}
                {r.kind === "cancel"
                  ? "Lemondási kérelem"
                  : "Átfoglalási kérelem"}
              </strong>
              <p>
                {r.title} · {dateTime(r.start_time)}
                {r.target_start_time && <> → {dateTime(r.target_start_time)}</>}
              </p>
              <p>{r.note}</p>
              <button
                disabled={busy}
                onClick={() =>
                  action(() =>
                    api("/admin/requests/" + r.id, {
                      method: "PATCH",
                      body: { status: "approved" },
                    }),
                  )
                }
              >
                Jóváhagyás
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  action(() =>
                    api("/admin/requests/" + r.id, {
                      method: "PATCH",
                      body: { status: "rejected" },
                    }),
                  )
                }
              >
                Elutasítás
              </button>
            </article>
          ))}
        </section>
      )}
      <div className="cl-filters">
        <Field
          label="Keresés"
          type="search"
          value={filter.q}
          onChange={(e) => setFilter({ ...filter, q: e.target.value, page: 1 })}
        />
        {[
          [
            "status",
            "Státusz",
            Object.entries(labels)
              .slice(0, 5)
              .map(([id, title]) => ({ id, title })),
          ],
          ["service", "Szolgáltatás", services],
        ].map(([k, l, items]) => (
          <Field key={k} label={l}>
            <select
              value={filter[k]}
              onChange={(e) =>
                setFilter({ ...filter, [k]: e.target.value, page: 1 })
              }
            >
              <option value="">Összes</option>
              {items.map((x) => (
                <option value={x.id} key={x.id}>
                  {x.title}
                </option>
              ))}
            </select>
          </Field>
        ))}
        {[
          ["from", "Ettől"],
          ["to", "Eddig"],
        ].map(([k, l]) => (
          <Field
            key={k}
            label={l}
            type="date"
            value={filter[k]}
            onChange={(e) =>
              setFilter({ ...filter, [k]: e.target.value, page: 1 })
            }
          />
        ))}
        <Field label="Rendezés">
          <select
            value={filter.sort}
            onChange={(e) => setFilter({ ...filter, sort: e.target.value })}
          >
            <option value="desc">Legkésőbbi elöl</option>
            <option value="asc">Legkorábbi elöl</option>
          </select>
        </Field>
        <button
          onClick={() =>
            setFilter({
              q: "",
              status: "",
              service: "",
              from: "",
              to: "",
              sort: "desc",
              page: 1,
            })
          }
        >
          Szűrők törlése
        </button>
      </div>
      {loading ? (
        <p>Betöltés…</p>
      ) : (
        <div className="cl-table">
          <table>
            <thead>
              <tr>
                <th>Ügyfél</th>
                <th>Képzés / időpont</th>
                <th>Összeg</th>
                <th>Státusz</th>
                <th>Műveletek</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((b) => (
                <tr key={b.id} data-booking-id={b.id}>
                  <td>
                    <strong>{b.customer_name}</strong>
                    <br />
                    {b.customer_email}
                    <br />
                    {b.seats} fő
                  </td>
                  <td>
                    {b.course_title}
                    <br />
                    <SessionList course={b}/>
                  </td>
                  <td>
                    {money(b.total_price)}
                    <br />
                    {labels[b.payment_status]}
                  </td>
                  <td>
                    <span className={"cl-badge " + b.status}>
                      {labels[b.status]}
                    </span>
                  </td>
                  <td>
                    <div className="cl-booking-row-actions" role="group" aria-label={`${b.customer_name} foglalásának műveletei`}>
                      <Field label="Foglalás állapota">
                        <select value={b.status} disabled={busy || (b.payment_method === 'stripe' && b.payment_status === 'pending')}
                          onChange={e => {
                            setConfirmation(null);
                            if (e.target.value === 'cancelled') setConfirmation({ id: b.id, kind: 'cancel' });
                            else changeBooking(b, { status: e.target.value });
                          }}>
                          {['pending', 'confirmed', 'completed', 'cancelled', 'no-show'].map(value =>
                            <option key={value} value={value}>{labels[value]}</option>)}
                        </select>
                      </Field>
                      <Field label="Fizetés állapota">
                        <select value={b.payment_status} disabled={busy || (b.payment_method === 'stripe' && b.payment_status !== 'paid')}
                          onChange={e => { setConfirmation(null); changeBooking(b, { payment_status: e.target.value }); }}>
                          {(b.payment_method === 'stripe'
                            ? [b.payment_status, ...(b.payment_status === 'paid' ? ['refunded'] : [])]
                            : ['pending', 'paid', 'refunded', 'failed']).map(value =>
                            <option key={value} value={value}>{labels[value]}</option>)}
                        </select>
                      </Field>
                      {b.status === 'cancelled' && b.payment_status !== 'paid' && <button className="cl-booking-danger" disabled={busy}
                        onClick={() => setConfirmation({ id: b.id, kind: 'delete' })}>Törlés</button>}
                    </div>
                    {b.payment_method === 'stripe' && b.payment_status === 'pending' && b.status === 'pending' &&
                      <p className="cl-booking-action-note">A fizetés lezárásáig nem bírálható el.</p>}
                    {b.status === 'cancelled' && b.payment_status === 'paid' &&
                      <p className="cl-booking-action-note">Fizetett foglalás csak visszatérítés után törölhető.</p>}
                    {confirmation?.id === b.id && <div className="cl-booking-confirm" role="group" aria-label="Művelet megerősítése">
                      <p>{confirmation.kind === 'delete'
                        ? 'Végleg törlöd ezt a lemondott foglalást? A művelet nem vonható vissza.'
                        : 'Lemondod ezt a foglalást? Az összes hozzá tartozó alkalmat lemondjuk, és értesítjük az ügyfelet.'}</p>
                      {confirmation.kind === 'cancel' && b.payment_status === 'paid' &&
                        <p>A lemondás önmagában nem indít pénzvisszatérítést.</p>}
                      <button disabled={busy} onClick={() => setConfirmation(null)}>Mégse</button>
                      <button className="cl-booking-danger" disabled={busy} onClick={() => confirmation.kind === 'cancel'
                        ? changeBooking(b, { status: 'cancelled' })
                        : action(async () => {
                          await api('/admin/bookings/' + b.id, { method: 'DELETE' });
                          if (edit?.id === b.id) closeEditor();
                        })}>
                        {confirmation.kind === 'delete' ? 'Végleges törlés' : 'Lemondás megerősítése'}
                      </button>
                    </div>}
                    <p className="cl-booking-action-note">A visszatérítés jelölése nem indít pénzvisszafizetést.</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.items.length && <p>Nincs a szűrésnek megfelelő foglalás.</p>}
        </div>
      )}
      <div className="cl-pagination">
        <button
          disabled={filter.page === 1 || loading}
          onClick={() => setFilter({ ...filter, page: filter.page - 1 })}
        >
          Előző
        </button>
        <span>
          {filter.page}. oldal · {data.total} foglalás
        </span>
        <button
          disabled={filter.page * 25 >= data.total || loading}
          onClick={() => setFilter({ ...filter, page: filter.page + 1 })}
        >
          Következő
        </button>
      </div>
      {edit !== undefined && (
        <BookingEditor
          booking={edit}
          slots={slots}
          onClose={closeEditor}
          onDone={editorDone}
        />
      )}
    </>
  );
}
