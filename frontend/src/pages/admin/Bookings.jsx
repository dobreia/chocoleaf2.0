import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../api/courses";
import { Field, Notice } from "../../components/admin/UI";
import { labels, dateTime, money } from "../../components/admin/format";
import BookingEditor from "../../components/admin/BookingEditor";
export default function Bookings() {
  const [search] = useSearchParams();
  const [data, setData] = useState({ items: [], total: 0 }),
    [slots, setSlots] = useState([]),
    [services, setServices] = useState([]),
    [requests, setRequests] = useState([]),
    [filter, updateFilter] = useState({
      q: "",
      status: "",
      service: "",
      from: "",
      to: "",
      sort: "desc",
      page: 1,
    }),
    [edit, setEdit] = useState(undefined),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [loading, setLoading] = useState(true),
    [revision, setRevision] = useState(0),
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
  }, [search]);
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
  }, [revision]);
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
  }, [filter, revision, search]);
  const refresh = () => {
    setLoading(true);
    setRevision((x) => x + 1);
  };
  const action = async (fn) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await fn();
      refresh();
      setMessage("A módosítás mentve.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="cl-title">
        <h1>Foglalások</h1>
        <button className="cl-primary" onClick={() => setEdit(null)}>
          + Új foglalás
        </button>
      </div>
      <Notice error={error} message={message} />
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
                <th>Művelet</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((b) => (
                <tr key={b.id}>
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
                    {dateTime(b.start_time)}
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
                    <button onClick={() => setEdit(b)}>Megnyitás</button>
                    {b.status === "cancelled" && (
                      <button
                        disabled={busy}
                        onClick={() => {
                          if (
                            window.confirm(
                              "Végleg törlöd ezt a lemondott foglalást?",
                            )
                          )
                            action(() =>
                              api("/admin/bookings/" + b.id, {
                                method: "DELETE",
                              }),
                            );
                        }}
                      >
                        Törlés
                      </button>
                    )}
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
          onClose={() => setEdit(undefined)}
          onDone={() => {
            setEdit(undefined);
            refresh();
            setMessage("Foglalás mentve.");
          }}
        />
      )}
    </>
  );
}
