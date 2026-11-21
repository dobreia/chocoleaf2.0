import {useEffect,useRef,useState} from 'react';
import {api} from '../../api/courses';
import {usePageDraftState,usePageDraftRef} from '../usePageDraft';
import {Field,Modal,SaveForm} from './UI';
import {money} from './format';

const empty=()=>({amount:'1000',email:'',names:['']});
export default function GiftIssueForm({onClose,onIssued}){
  const [draft,setDraft,resetDraft]=usePageDraftState('giftOrders.issue',empty);
  const requestKeyRef=usePageDraftRef('giftOrders.issueKey',null);
  const saving=useRef(false);
  const [presets,setPresets]=useState([]);
  useEffect(()=>{let live=true;api('/giftcard/amounts?details=1').then(values=>{if(live)setPresets(values);}).catch(()=>{});return()=>{live=false;};},[]);
  function update(next){requestKeyRef.current=null;setDraft(current=>({...current,...next}));}
  function close(event){
    if(saving.current){event?.preventDefault();return;}
    resetDraft();requestKeyRef.current=null;onClose();
  }
  async function issue(){
    const amount=Number(draft.amount);
    if(!Number.isSafeInteger(amount)||amount<1000||amount>1000000)throw Error('Az utalvány értéke 1 000 és 1 000 000 Ft közötti egész összeg legyen.');
    saving.current=true;
    try{
      requestKeyRef.current ||= crypto.randomUUID();
      const result=await api('/giftcard/admin/issue',{method:'POST',headers:{'Idempotency-Key':requestKeyRef.current},
        body:{amount,email:draft.email,names:draft.names,quantity:draft.names.length}});
      resetDraft();requestKeyRef.current=null;onIssued(result);onClose();
    }finally{saving.current=false;}
  }
  const amount=Number(draft.amount);
  return <Modal title="Ajándékutalvány kiállítása" className="cl-service-dialog" onClose={close}>
    <p>Fizetés nélküli adminisztrátori kiállítás. A PDF-utalványokat a megadott e-mail-címre küldjük. Érvényességük 3 hónap.</p>
    <SaveForm onSave={issue} label="Kiállítás és e-mail küldése">
      <Field label="Kézbesítési e-mail-cím" type="email" required maxLength={254} autoFocus value={draft.email} onChange={e=>update({email:e.target.value})}/>
      {presets.length>0&&<Field label="Meghirdetett kurzusárak">
        <select value={presets.some(p=>p.amount===amount)?String(amount):''} onChange={e=>{if(e.target.value)update({amount:e.target.value});}}>
          <option value="" disabled>Válassz kurzusárat, vagy írj be egyéni összeget</option>
          {presets.map(p=><option key={p.amount} value={p.amount}>{money(p.amount)} · {p.courses.map(c=>c.title).join(', ')}</option>)}
        </select>
      </Field>}
      <Field label="Utalvány értéke (Ft / db)" type="text" inputMode="numeric" pattern="[0-9]+" required maxLength={7} value={draft.amount}
        onChange={e=>{const value=e.target.value;if(/^\d{0,7}$/.test(value)&&Number(value)<=1000000)update({amount:value});}}
        onBlur={()=>{const normalized=String(Math.max(1000,Number(draft.amount)||1000));if(normalized!==draft.amount)update({amount:normalized});}}/>
      <div className="cl-gift-quantity" aria-label="Utalványok darabszáma">
        <button type="button" aria-label="Egy utalvánnyal kevesebb" disabled={draft.names.length<=1} onClick={()=>update({names:draft.names.slice(0,-1)})}>−</button>
        <span>{draft.names.length} db utalvány</span>
        <button type="button" aria-label="Egy utalvánnyal több" disabled={draft.names.length>=20} onClick={()=>update({names:[...draft.names,'']})}>+</button>
      </div>
      {draft.names.map((name,index)=><Field key={index} label={`${index+1}. utalvány – név`} required maxLength={100} value={name}
        onChange={e=>update({names:draft.names.map((value,i)=>i===index?e.target.value:value)})}/>)}
      <p><strong>Névérték összesen: {money(amount*draft.names.length)}</strong><br/>Fizetendő: 0 Ft.</p>
      <p className="cl-muted">A kiállított utalványok azonnal beválthatók, a vásárolt utalványokkal azonos feltételekkel.</p>
      <button type="button" onClick={close}>Mégse</button>
    </SaveForm>
  </Modal>;
}
