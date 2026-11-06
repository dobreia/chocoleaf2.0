import {useEffect,useRef,useState} from 'react';
import {api} from '../api/courses';
import {money} from './admin/format';
import {usePageDraftState} from './usePageDraft';
export default function VoucherFields({courseId,seats,total,value,onChange,onBusyChange}){
  const [code,setCode]=usePageDraftState('booking.voucherCode','');
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const live=useRef(true);
  useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
  const discount=value.reduce((sum,v)=>sum+v.amount,0);
  async function add(){
    if(busy||!code.trim())return;
    setBusy(true);setError('');
    onBusyChange(1);
    try{
      const result=await api('/giftcard/check-vouchers',{method:'POST',body:{courseId,seats:Number(seats),codes:[...value.map(v=>v.code),code.trim()]}});
      if(live.current){onChange(result.items);setCode('');}
    }catch(e){if(live.current)setError(e.message);}
    finally{onBusyChange(-1);if(live.current)setBusy(false);}
  }
  return <fieldset className="booking-vouchers" disabled={busy}>
    <legend>Van ajándékutalványod?</legend>
    <label>Utalványszám
      <input value={code} maxLength={40} placeholder="GIFT-A7B2C9-01" autoCapitalize="characters" autoComplete="off"
        onChange={e=>setCode(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();add();}}}/>
    </label>
    <button type="button" disabled={!courseId||!code.trim()||busy} onClick={add}>{busy?'Ellenőrzés…':'Utalvány hozzáadása'}</button>
    {error&&<p role="alert">{error}</p>}
    {value.map(v=><div className="booking-voucher-item" key={v.code}>
      <span>{v.code} · {money(v.amount)}</span>
      <button type="button" aria-label={`${v.code} eltávolítása`} onClick={()=>{onChange(value.filter(item=>item.code!==v.code));setError('');}}>Eltávolítás</button>
    </div>)}
    {value.length>0&&<div aria-live="polite">
      <p>Foglalás teljes ára: {money(total)}<br/>Utalványok értéke: {money(discount)}<br/><strong>Fizetendő különbözet: {money(Math.max(0,total-discount))}</strong></p>
      {discount>total&&<p role="alert">A foglalás összege kisebb az utalványok értékénél. Módosítsd a választást; maradványegyenleget nem kezelünk.</p>}
      <p>Az utalványok teljes értékét felhasználjuk. A foglalás végleges mentésekor ismét ellenőrizzük az érvényességüket.</p>
      <p>Időpontmódosítás vagy lemondás legalább 72 órával az első alkalom előtt, utalványonként összesen egyszer lehetséges. 72 órán belül az utalvány beváltottnak minősül. Pénzbeli visszatérítés nem kérhető.</p>
    </div>}
  </fieldset>;
}
