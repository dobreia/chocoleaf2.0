import {useState} from 'react';
import {api} from '../../api/courses';
import {Field,Modal,Notice} from './UI';
import {customerExportFields,customerExportFormats,exportFileName,customerExportBlob,withCustomerHistories,downloadCustomerExport} from './customerExportFile.js';

export default function CustomerExport({items,draft,setDraft,onClose,onSuccess}){
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const selected=draft.fields;
  const nativeSave=typeof window.showSaveFilePicker==='function';
  const change=next=>setDraft({...draft,...next});
  const save=async event=>{
    event.preventDefault();if(busy||!selected.length)return;
    setBusy(true);setError('');let writable;
    try{
      const filename=exportFileName(draft.format),format=customerExportFormats[draft.format];
      // The picker must open directly from the click, before loading data or Excel code.
      const handle=typeof window.showSaveFilePicker==='function'?await window.showSaveFilePicker({suggestedName:filename,
        types:[{description:format.label,accept:{[format.mime]:['.'+draft.format]}}]}):null;
      let customers=draft.scope==='all'?await api('/admin/customers?status=all'):items;
      if(!customers.length)throw Error('Nincs exportálható ügyfél.');
      if(selected.includes('history'))customers=await withCustomerHistories(customers,
        email=>api('/admin/customers/history?'+new URLSearchParams({email})));
      const blob=await customerExportBlob(customers,selected,draft.format);
      if(handle){writable=await handle.createWritable();await writable.write(blob);await writable.close();writable=null;}
      else downloadCustomerExport(blob,filename);
      onSuccess(handle?`${customers.length} ügyfél adatai mentve.`:`${customers.length} ügyfél exportjának letöltése elindult.`);
    }catch(error){
      if(writable)await writable.abort().catch(()=>{});
      if(error.name!=='AbortError')setError(error.message);
    }finally{setBusy(false);}
  };
  return <Modal title="Ügyfelek exportálása" onClose={event=>{if(busy)event?.preventDefault();else onClose();}} className="cl-customer-export">
    <form onSubmit={save} aria-busy={busy}>
      <Notice error={error}/>
      <fieldset disabled={busy}>
        <Field label="Formátum"><select value={draft.format} onChange={event=>change({format:event.target.value})}>
          {Object.entries(customerExportFormats).map(([id,format])=><option key={id} value={id}>{format.label}</option>)}
        </select></Field>
        <Field label="Exportálandó ügyfelek"><select value={draft.scope} onChange={event=>change({scope:event.target.value})}>
          <option value="filtered">Aktuálisan szűrt lista ({items.length} ügyfél)</option>
          <option value="all">Összes ügyfél (lemondott foglalásokkal is)</option>
        </select></Field>
        <p className="cl-muted">Minden ügyfél egyszer szerepel az exportban. A kurzusok és az előzmények az ügyfél összes foglalását tartalmazzák, a lemondottakat és a törölt foglalások megőrzött előzményeit is. A dátumok budapesti idő szerint jelennek meg.</p>
        <fieldset className="cl-export-fields">
          <legend>Exportálandó adatok</legend>
          <label className="cl-export-check"><input type="checkbox" checked={selected.length===customerExportFields.length}
            onChange={event=>change({fields:event.target.checked?customerExportFields.map(field=>field.id):[]})}/>Összes kijelölése</label>
          {customerExportFields.map(field=><label className="cl-export-check" key={field.id}>
            <input type="checkbox" checked={selected.includes(field.id)} onChange={event=>change({fields:event.target.checked?[...selected,field.id]:selected.filter(id=>id!==field.id)})}/>{field.label}
          </label>)}
        </fieldset>
        {!selected.length&&<p role="status">Válassz ki legalább egy adatmezőt.</p>}
        <p className="cl-muted">{nativeSave?'Mentéskor kiválaszthatod a fájl nevét és helyét a gépeden.':'A fájl a böngésző letöltési beállításai szerint mentődik. Ha mentési helyet szeretnél választani, kapcsold be a böngészőben a letöltések előtti rákérdezést.'}</p>
        <div className="cl-actions">
          <button type="button" onClick={onClose}>Mégse</button>
          <button type="submit" className="cl-primary" disabled={!selected.length||(draft.scope==='filtered'&&!items.length)}>{busy?'Exportálás…':'Exportálás és mentés'}</button>
        </div>
      </fieldset>
    </form>
  </Modal>;
}
