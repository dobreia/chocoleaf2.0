import { useEffect, useState } from "react";
import { api } from "../../api/courses";
import { Field, Notice } from "../../components/admin/UI";
import { dateTime, money } from "../../components/admin/format";
import {useSearchParams} from 'react-router-dom';
import {usePageDraftState} from '../../components/usePageDraft';
import GiftIssueForm from '../../components/admin/GiftIssueForm';
const voucherStates={issued:'Kiállított',paid:'Fizetett',redeemed:'Beváltott',deleted:'Törölt'};
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
  async function changeVoucher(v,status){
    const prompt=status==='deleted'
      ? `Törlöd a(z) ${v.code} sorszámú utalványt? Visszaállításig nem váltható be.`
      : status==='redeemed'
        ? `Személyesen beváltottként jelölöd a(z) ${v.code} utalványt? Ezután online nem használható fel.`
        : ['redeemed','deleted'].includes(v.management_status)
          ? `Módosítod a(z) ${v.code} utalvány állapotát erre: ${voucherStates[status]}? Az utalvány érvényes lejárat esetén újra felhasználható lesz.`
          : null;
    if(prompt&&!window.confirm(prompt))return;
    setBusy(true);setError('');setMessage('');
    try{
      const result=await api('/giftcard/admin/vouchers/'+encodeURIComponent(v.code),{
        method:'PATCH',body:{status,expectedStatus:v.management_status},
      });
      setMessage(result.message);
      await load();
    }catch(e){setError(e.message);}
    finally{setBusy(false);}
  }
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
          {x.vouchers?.map(v=>{
            const linked=['active','consumed'].includes(v.status);
            const deleted=v.management_status==='deleted';
            return <div className="cl-gift-voucher" key={v.code}>
              <p><strong>{v.code}</strong> · {v.name} · {money(v.amount)} · Lejárat: {String(v.valid_until).slice(0,10)}<br/>
                {{active:'Foglaláshoz felhasználva',consumed:'Beváltott, újra nem használható',redeemed:'Személyesen beváltva, újra nem használható',deleted:'Törölt utalvány – nem váltható be',available:new Date(v.valid_until).getTime()<new Date().setHours(0,0,0,0)?'Lejárt':'Felhasználható'}[v.status]}
                {v.changes_used>0?' · Az egyszeri módosítási lehetőség felhasználva':''}
              </p>
              <div className="cl-actions">
                <Field label="Státusz">
                  <select aria-label={`${v.code} státusza`} value={v.management_status} disabled={busy||linked}
                    onChange={e=>changeVoucher(v,e.target.value)}>
                    {Object.entries(voucherStates).filter(([state])=>state!=='deleted'||deleted).map(([state,label])=><option key={state} value={state}>{label}</option>)}
                  </select>
                </Field>
                {!deleted&&<button type="button" disabled={busy||linked} onClick={()=>changeVoucher(v,'deleted')}>Utalvány törlése</button>}
              </div>
              {linked&&<p className="cl-muted">Az állapotot az online foglalás kezeli. Módosítás a Foglalások oldalon lehetséges.</p>}
              {!!v.events?.length&&<details><summary>Módosítási előzmények ({v.events.length})</summary>
                <ul>{v.events.map(event=><li key={event.id}>{dateTime(event.created_at)} · {event.admin_email}: {voucherStates[event.previous_status]} → {voucherStates[event.status]}</li>)}</ul>
              </details>}
            </div>;
          })}
        </article>
      ))}
      {issuing&&<GiftIssueForm onClose={()=>setIssuing(false)} onIssued={result=>{
        setError('');setMessage(result.message);
        if(order)setQuery({});else load();
      }}/>}
    </>
  );
}
