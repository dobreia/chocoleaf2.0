import { useEffect, useState } from 'react';
import { api } from '../../api/courses';
import { dateTime, money } from '../../components/admin/format';
import { Notice } from '../../components/admin/UI';
export default function Payments() {
  const [items,setItems]=useState([]),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const load=()=>api('/payments/admin/orders').then(setItems).catch(e=>setError(e.message));
  useEffect(()=>{load();},[]);
  return <><h1>Stripe-fizetések és számlák</h1><Notice error={error} message={message}/>
    <button onClick={load}>Frissítés</button>
    {!items.length && <p>Még nincs Stripe-fizetés.</p>}
    {items.map(x=><article className="cl-card" key={x.id}><h2>{x.description}</h2>
      <p>{x.email} · {money(x.amount)} · {dateTime(x.created_at)}</p>
      <p>Fizetés: {{pending:'Fizetésre vár',paid:'Fizetve',expired:'Lejárt'}[x.status]} · Számla: {{pending:'Kiállításra vár',created:'Kiállítva',sent:'Email küldésre ütemezve',skipped:'Helyi teszt – nincs számla'}[x.invoice_status]}</p>
      {x.invoice_url && <p><a href={x.invoice_url} target="_blank" rel="noreferrer">Számla megnyitása</a></p>}
      {x.last_error && <p role="alert">{x.last_error}</p>}
      {x.status !== 'expired' && <button disabled={busy} onClick={async()=>{
        setBusy(true);setError('');try {const r=await api(`/payments/admin/${x.id}/retry`,{method:'POST',body:{}});setMessage(r.message);await load();}catch(e){setError(e.message);}finally{setBusy(false);}
      }}>Feldolgozás újrapróbálása</button>}
    </article>)}</>;
}
