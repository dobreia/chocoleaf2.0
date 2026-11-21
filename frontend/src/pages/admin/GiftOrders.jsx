import { useEffect, useState } from "react";
import { api } from "../../api/courses";
import { Notice } from "../../components/admin/UI";
import { dateTime, money } from "../../components/admin/format";
import {useSearchParams} from 'react-router-dom';
import {usePageDraftState} from '../../components/usePageDraft';
import GiftIssueForm from '../../components/admin/GiftIssueForm';
export default function GiftOrders() {
  const [query,setQuery]=useSearchParams();
  const order=query.get('order');
  const [issuing,setIssuing]=usePageDraftState('giftOrders.issueOpen',false);
  const [items, setItems] = useState([]),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const load = () =>
    api("/giftcard/admin/orders"+(order?'?order='+encodeURIComponent(order):''))
      .then(setItems)
      .catch((e) => setError(e.message));
  useEffect(() => {
    let live=true;
    api('/giftcard/admin/orders'+(order?'?order='+encodeURIComponent(order):'')).then(data=>{if(live){setItems(data);setError('');}}).catch(e=>{if(live)setError(e.message);});
    return()=>{live=false;};
  }, [order]);
  return (
    <>
      <div className="cl-title">
        <h1>Ajándékutalványok</h1>
        <button type="button" className="cl-primary" disabled={busy} onClick={()=>{setError('');setMessage('');setIssuing(true);}}>+ Utalvány kiállítása</button>
      </div>
      <Notice error={error} message={message} />
      {order&&<p>Az emailből megnyitott rendelés. <button onClick={()=>setQuery({})}>Összes rendelés megtekintése</button></p>}
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
            {Object.values(x.data.meta.billingData||{}).filter(Boolean).join(" · ")}
          </p>
          {x.data.source==='admin' ? (
            <p><strong>Admin által kiállítva · fizetés nélkül</strong><br/>Kiállító: {x.data.issuedBy?.email}<br/>Kiállítva, e-mail küldési sorba helyezve: {dateTime(x.data.generatedAt)}</p>
          ) : x.data.generatedAt ? (
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
          {x.vouchers?.map(v=><p key={v.code}><strong>{v.code}</strong> · {v.name} · {money(v.amount)} · Lejárat: {String(v.valid_until).slice(0,10)}<br/>
            {{active:'Foglaláshoz felhasználva',consumed:'Beváltott, újra nem használható',available:new Date(v.valid_until).getTime()<new Date().setHours(0,0,0,0)?'Lejárt':'Felhasználható'}[v.status]}
            {v.changes_used>0?' · Az egyszeri módosítási lehetőség felhasználva':''}</p>)}
        </article>
      ))}
      {issuing&&<GiftIssueForm onClose={()=>setIssuing(false)} onIssued={result=>{
        setError('');setMessage(result.message);
        if(order)setQuery({});else load();
      }}/>}
    </>
  );
}
