import {useCallback,useEffect,useState} from 'react';
import {api} from '../../api/courses';
import {Field,Modal,Notice} from '../../components/admin/UI';
import {dateTime} from '../../components/admin/format';
function state(mail){return mail.sent_at?'Elküldve':mail.retry_stopped?'Küldés leállítva':mail.last_error||mail.attempts>0?'Újrapróbálásra vár':'Küldésre vár';}
export default function Mail(){
  const [status,setStatus]=useState('pending'),[page,setPage]=useState(1),[data,setData]=useState(null),[error,setError]=useState(''),[message,setMessage]=useState('');
  const [busy,setBusy]=useState(false),[preview,setPreview]=useState(null),[deleting,setDeleting]=useState(null);
  const load=useCallback(async()=>{
    const result=await api('/admin/mail?'+new URLSearchParams({status,page}));setData(result);
    if(page>1&&!result.items.length)setPage(Math.max(1,Math.ceil(result.total/result.limit)));
  },[status,page]);
  useEffect(()=>{let live=true;api('/admin/mail?'+new URLSearchParams({status,page})).then(result=>{if(live){setData(result);setError('');}}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[status,page]);
  async function action(fn){
    if(busy)return;setBusy(true);setError('');setMessage('');
    try{const result=await fn();setMessage(result?.message||'Frissítve.');setDeleting(null);await load();}
    catch(e){setError(e.message);}finally{setBusy(false);}
  }
  return <><div className="cl-title"><h1>Emailküldés</h1><button disabled={busy} onClick={()=>action(async()=>({message:'Frissítve.'}))}>Frissítés</button></div>
    <Notice error={error} message={message}/>
    <p>Itt követheted a rendszer automatikus leveleit. Az újrapróbálás küldésre ütemez; az elküldött levelek előzménye megmarad.</p>
    {data&&<><p>Várakozó: <strong>{data.counts.pending}</strong> · Sikertelen: <strong>{data.counts.failed}</strong> · Elküldött: <strong>{data.counts.sent}</strong></p>
      {!data.deliveryConfigured&&<Notice error="Az emailküldés nincs beállítva. A leveleket elmentjük, de az SMTP-beállítások megadásáig nem tudjuk kézbesíteni."/>}</>}
    <Field label="Levelek állapota"><select aria-label="Levelek állapota" value={status} disabled={busy} onChange={e=>{setStatus(e.target.value);setPage(1);setDeleting(null);}}>
      <option value="pending">Küldésre váró levelek</option><option value="failed">Sikertelen levelek</option><option value="sent">Elküldött levelek</option><option value="all">Összes levél</option>
    </select></Field>
    {!data?<p>Betöltés…</p>:<><div className="cl-mail-list">{data.items.map(mail=><article className="cl-card" key={mail.id}>
      <h2>{mail.subject}</h2><p>Címzett: {mail.recipient}</p><p><strong>{state(mail)}</strong> · Létrehozva: {dateTime(mail.created_at)} · Küldési kísérletek: {mail.attempts}</p>
      {mail.sent_at?<p>Elküldve: {dateTime(mail.sent_at)}</p>:<p>Utolsó próbálkozás: {mail.last_attempt_at?dateTime(mail.last_attempt_at):'–'}{!mail.retry_stopped&&<> · Következő próbálkozás: {dateTime(mail.next_attempt)}</>}</p>}
      {mail.last_error&&<p className="cl-error">{mail.last_error}</p>}
      {!mail.last_error&&mail.attempts>0&&!mail.sent_at&&<p className="cl-error">Korábbi sikertelen küldés; a régi próbálkozás részletes hibaoka nem áll rendelkezésre.</p>}
      {mail.attachment_count>0&&<p>{mail.attachment_count} PDF-csatolmány</p>}
      <div className="cl-mail-actions"><button disabled={busy} onClick={()=>action(async()=>{setPreview(await api('/admin/mail/'+mail.id));return {};} )}>Előnézet</button>
        {!mail.sent_at&&<><button disabled={busy} onClick={()=>action(()=>api(`/admin/mail/${mail.id}/retry`,{method:'POST',body:{}}))}>Újrapróbálás</button><button disabled={busy} onClick={()=>setDeleting(mail.id)}>Törlés</button></>}
      </div>
      {deleting===mail.id&&<div role="group" aria-label="Levél törlésének megerősítése"><p>Törlöd ezt az el nem küldött levelet? A foglalás vagy rendelés állapota ettől nem változik.</p>
        <button disabled={busy} onClick={()=>setDeleting(null)}>Mégse</button><button disabled={busy} onClick={()=>action(()=>api('/admin/mail/'+mail.id,{method:'DELETE'}))}>Levél végleges törlése</button></div>}
    </article>)}</div>{!data.items.length&&<p>Nincs a szűrésnek megfelelő levél.</p>}
      <div className="cl-pagination"><button disabled={busy||page===1} onClick={()=>setPage(page-1)}>Előző</button><span>{page}. oldal · {data.total} levél</span><button disabled={busy||page*data.limit>=data.total} onClick={()=>setPage(page+1)}>Következő</button></div></>}
    {preview&&<Modal title="Levél előnézete" onClose={()=>setPreview(null)} className="cl-mail-dialog">
      <p>{preview.recipient} · {preview.subject}</p>{preview.calendarError&&<Notice error={preview.calendarError}/>}
      <iframe sandbox="" referrerPolicy="no-referrer" title="Email megjelenése" srcDoc={preview.html}/>
      <details><summary>Egyszerű szöveges változat</summary><pre>{preview.body}</pre></details>
    </Modal>}
  </>;
}
