import { useEffect, useState } from "react";
import { api } from "../../api/courses";
import { Notice } from "../../components/admin/UI";
import { dateTime, money } from "../../components/admin/format";
export default function GiftOrders() {
  const [items, setItems] = useState([]),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const load = () =>
    api("/giftcard/admin/orders")
      .then(setItems)
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);
  return (
    <>
      <h1>Ajándékutalványok</h1>
      <Notice error={error} message={message} />
      {!items.length && <p>Nincs utalványrendelés.</p>}
      {items.map((x) => (
        <article className="cl-card" key={x.id}>
          <h2>{x.data.notice}</h2>
          <p>
            {x.data.meta.names.join(", ")} · {x.data.meta.email}
          </p>
          <p>
            {money(x.data.amount)} · {dateTime(x.created_at)}
          </p>
          <p>
            {Object.values(x.data.meta.billingData).filter(Boolean).join(" · ")}
          </p>
          {x.data.generatedAt ? (
            <p>Kiállítva, emailküldésre átadva: {dateTime(x.data.generatedAt)}</p>
          ) : x.data.meta.paymentMethod === 'stripe' ? (
            <p>{x.data.paidAt ? 'Fizetve, automatikus utalványküldés folyamatban.' : 'Stripe-fizetésre vár.'}</p>
          ) : (
            <button
              disabled={busy}
              onClick={async () => {
                if (
                  !window.confirm(
                    "Az átutalás megérkezett? A jóváhagyás elküldi az utalványokat.",
                  )
                )
                  return;
                setBusy(true);
                setError("");
                try {
                  const r = await api("/giftcard/admin/mark-paid", {
                    method: "POST",
                    body: { id: x.id },
                  });
                  setMessage(r.message);
                  load();
                } catch (e) {
                  setError(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Fizetés jóváhagyása és utalványküldés
            </button>
          )}
        </article>
      ))}
    </>
  );
}
