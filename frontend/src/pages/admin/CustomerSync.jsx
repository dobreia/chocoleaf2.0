import {useEffect,useState} from 'react';
import {Link,useSearchParams} from 'react-router-dom';
import {api} from '../../api/courses';
import {usePageDraftState} from '../../components/usePageDraft';
import {Field,Modal,Notice,SaveForm} from '../../components/admin/UI';
import {dateTime} from '../../components/admin/format';
import '../../styles/AdminContacts.css';

const messages={connected:'A Google Névjegyek kapcsolata létrejött. Az első szinkron elindult.',denied:'Az összekapcsolást megszakítottad. A meglévő kapcsolat megmaradt.',
  expired:'Az összekapcsolási kérés lejárt. Indítsd újra innen.',permissions:'Nem kaptuk meg a szükséges engedélyeket. Kapcsold össze újra, és engedélyezd a névjegyek kezelését.',
  different_account:'Másik Google-fiókot választottál. Fiókváltás előtt válaszd le a jelenlegi kapcsolatot.',failed:'A Google-összekapcsolás nem sikerült. Ellenőrizd a szerverbeállításokat, majd próbáld újra.'};
const toForm=data=>({includeCancelled:data.includeCancelled,campaignMode:data.campaignMode,campaignCourses:data.campaignCourses});
export default function CustomerSync(){
  const [params]=useSearchParams();
  const [data,setData]=useState(null),[error,setError]=useState(''),[message,setMessage]=useState(''),[revision,setRevision]=useState(0),[busy,setBusy]=useState(false),[preview,setPreview]=useState(null);
  const [draft,setDraft]=usePageDraftState('contacts.courseSettings',null),[confirm,setConfirm]=usePageDraftState('contacts.confirm',null);
  useEffect(()=>{
    let live=true;
    const load=async()=>{try{const value=await api('/admin/contacts-sync');
      if(!Array.isArray(value.courses))throw Error('A kurzusnév szerinti választáshoz indítsd újra a helyi szervert, majd frissítsd ezt az oldalt.');
      if(live)setData(value);
    }catch(e){if(live)setError(e.message);}};
    load();const timer=setInterval(()=>{if(!document.hidden)load();},10000);
    return()=>{live=false;clearInterval(timer);};
  },[revision]);
  const form=draft||(data?toForm(data):null);
  const update=next=>{setDraft({...form,...next});setPreview(null);};
  async function action(path,body={}){
    if(busy)return;setBusy(true);setError('');setMessage('');
    try{
      const result=await api('/admin/contacts-sync/'+path,{method:'POST',body});
      if(result.url){window.location.assign(result.url);return;}
      setMessage(result.message);setConfirm(null);setRevision(value=>value+1);
    }catch(e){setError(e.message);}finally{setBusy(false);}
  }
  const callback=params.get('google');
  const state=!data?.connected?'Nincs összekapcsolva':data.needsAuth?'Újra összekapcsolandó':data.error||data.failed?'Figyelmet igényel':data.pending||!data.lastSyncedAt?'Frissítés folyamatban':'Naprakész';
  return <>
    <div className="cl-title"><h1>Körlevél és Google-névjegyek</h1><Link to="/admin/customers">Vissza az ügyfelekhez</Link></div>
    <Notice error={error||(callback&&callback!=='connected'?messages[callback]:'')} message={message||(callback==='connected'?messages.connected:'')}/>
    {!data?(!error&&<p role="status">Kapcsolat ellenőrzése…</p>):<>
      <section className="cl-card">
        <div className="cl-title"><h2>Google Névjegyek</h2><span className={'cl-badge '+(state==='Naprakész'?'confirmed':'pending')}>{state}</span></div>
        <p>Az ügyfelek neve és e-mail-címe kerül át a kiválasztott Google-fiókba, az összesített és kurzusonkénti ChocoLeaf-címkékkel. A szerver percenként ellenőrzi az új foglalásokat és a változásokat.</p>
        {data.accountEmail&&<p>Google-fiók: <strong>{data.accountEmail}</strong></p>}
        {!data.configured&&<p className="cl-contacts-info">Az összekapcsoláshoz egyszeri szerverbeállítás szükséges: Google People API, OAuth-kliens és titkosítási kulcs. A pontos útmutató: backend/GOOGLE-CONTACTS.hu.md.</p>}
        <Notice error={data.error}/>
        {data.stale&&<Notice error="A háttérfrissítés késik. Indíts kézi frissítést; ha nem rendeződik, ellenőrizni kell a szerver háttérfolyamatát."/>}
        <div className="cl-actions">
          <button className="cl-primary" disabled={busy||!data.configured} onClick={()=>action('connect')}>{data.connected?'Google-kapcsolat megújítása':'Összekapcsolás Google-fiókkal'}</button>
          {data.connected&&<><button disabled={busy||data.needsAuth||!data.configured} onClick={()=>action('sync')}>Frissítés most</button><button disabled={busy} onClick={()=>setConfirm({type:'disconnect'})}>Leválasztás</button></>}
          <a href={data.contactsUrl} target="_blank" rel="noreferrer">Google Névjegyek megnyitása ↗</a>
        </div>
        <dl className="cl-contacts-stats">
          <div><dt>Figyelembe vett ügyfelek</dt><dd>{data.total}</dd></div><div><dt>Szinkronizált névjegyek</dt><dd>{data.synced}</dd></div>
          <div><dt>Várakozó változások</dt><dd>{data.pending}</dd></div><div><dt>Hibás tételek</dt><dd>{data.failed}</dd></div>
          <div><dt>Utolsó ellenőrzés</dt><dd>{dateTime(data.lastScanAt)}</dd></div><div><dt>Utolsó teljes szinkron</dt><dd>{dateTime(data.lastSyncedAt)}</dd></div>
        </dl>
        {data.error&&!data.needsAuth&&<p>Következő újrapróbálás leghamarabb: {dateTime(data.retryAt)}</p>}
        <p className="cl-muted">Meglévő Google-névjegyet e-mail-cím alapján párosítunk, a személyes nevét és további adatait megőrizzük. A ChocoLeaf által létrehozott névjegyek nevét az adminból frissítjük. Belső megjegyzést és számlázási adatot nem küldünk át. Google-névjegyet nem törlünk.</p>
      </section>
      <section className="cl-card">
        <h2>Körlevél címzettjei</h2>
        <p>A választásból egyetlen <strong>ChocoLeaf – aktuális körlevél</strong> címke készül. Egy e-mail-cím egyszer szerepel benne akkor is, ha több kiválasztott kurzusra foglalt.</p>
        {data.needsSelection&&<Notice error="A korábbi kategóriaválasztás helyett most a konkrét kurzusokat kell kijelölni és elmenteni. Addig az aktuális körlevélcsoport üres."/>}
        <SaveForm label="Címzettcsoport mentése" onSave={async()=>{
          const result=await api('/admin/contacts-sync/settings',{method:'PUT',body:form});
          setData(value=>({...value,...form}));setDraft(null);setPreview(null);setMessage(result.message);setRevision(value=>value+1);
        }}>
          <Field label="Kinek szóljon a körlevél?"><select value={form.campaignMode} onChange={event=>update({campaignMode:event.target.value})}>
            <option value="all">Összes ügyfél</option><option value="courses">Kiválasztott kurzusok</option>
          </select></Field>
          <label className="cl-contacts-check"><input type="checkbox" checked={form.includeCancelled} onChange={event=>update({includeCancelled:event.target.checked})}/>Lemondott foglalások bevonása a címzettcsoportokba</label>
          <p className="cl-muted">Alapból a nem lemondott foglalások számítanak, a korábbi kurzusokat is beleértve. Ez a beállítás az összesített és a kurzusonkénti címkékre is vonatkozik.</p>
          {form.campaignMode==='courses'&&<fieldset className="cl-contacts-categories"><legend>Kurzusok</legend>
            <label className="cl-contacts-check"><input type="checkbox" checked={data.courses.length>0&&data.courses.every(c=>form.campaignCourses.includes(c.value))}
              onChange={event=>update({campaignCourses:event.target.checked?data.courses.map(c=>c.value):[]})}/>Összes kurzus kijelölése</label>
            {data.courses.map(course=><label className="cl-contacts-check" key={course.value}><input type="checkbox" checked={form.campaignCourses.includes(course.value)}
              onChange={event=>update({campaignCourses:event.target.checked?[...form.campaignCourses,course.value]:form.campaignCourses.filter(c=>c!==course.value)})}/>{course.label}</label>)}
            {!data.courses.length&&<p>Még nincs választható kurzus.</p>}
            {form.campaignCourses.filter(c=>!data.courses.some(course=>course.value===c)).map(c=><p key={c} className="cl-muted">Egy korábban kiválasztott kurzus már nem elérhető. Válaszd ki újra a címzetteket.</p>)}
          </fieldset>}
        </SaveForm>
        <button className="cl-contacts-preview-button" disabled={busy} onClick={async()=>{
          setBusy(true);setError('');try{setPreview(await api('/admin/contacts-sync/preview',{method:'POST',body:form}));}catch(e){setError(e.message);}finally{setBusy(false);}
        }}>Címzettek előnézete</button>
        {preview&&<section aria-label="Címzettek előnézete"><h3>{preview.count} egyedi címzett</h3><ul className="cl-contacts-preview">{preview.people.slice(0,100).map(p=><li key={p.email}>{p.name} · {p.email}</li>)}</ul>{preview.people.length>100&&<p>Az első 100 címzett látható.</p>}</section>}
        <p>Az elmentett csoportban jelenleg <strong>{data.campaignCount} egyedi címzett</strong> szerepel. Várd meg a „Naprakész” állapotot a Gmail-címzés előtt.</p>
      </section>
      <section className="cl-card"><h2>Levélírás Gmailben</h2>
        <ol><li>Nyisd meg a Gmailt ugyanazzal a Google-fiókkal.</li><li>Kattints a Levélírásra, a Címzett mezőbe add meg a saját címedet.</li><li>A Titkos másolat (Bcc) mezőhöz add hozzá a <strong>ChocoLeaf – aktuális körlevél</strong> csoportot.</li><li>Ellenőrizd a címzetteket, írd meg a levelet, majd küldd el.</li></ol>
        <p>Az összesített címke: <strong>ChocoLeaf – összes ügyfél</strong>. A kurzusonkénti címkék: <strong>ChocoLeaf – kurzus: kurzusnév</strong>. Több kurzushoz az adminban állítsd össze az aktuális körlevél csoportját.</p>
        <p className="cl-muted">A Gmail a csoportot a címzettek hozzáadásakor bontja ki. Egy már megnyitott levél címzettlistája nem frissül automatikusan; a csoport változása után add hozzá újra. A küldési korlátokat a Google-fiókod szabja meg.</p>
      </section>
      {data.issues.length>0&&<section className="cl-card"><h2>Figyelmet igénylő névjegyek</h2>{data.issues.map(issue=><article className="cl-contacts-issue" key={issue.email}><strong>{issue.email}</strong><p>{issue.error}</p><p>Következő ellenőrzés: {dateTime(issue.retryAt)}</p>
        {issue.uncertainSince&&<button disabled={busy} onClick={()=>setConfirm({type:'retry',email:issue.email})}>Nem jött létre a Google-ben – új létrehozás engedélyezése</button>}
      </article>)}{data.failed>data.issues.length&&<p>Az első {data.issues.length} hiba látható.</p>}</section>}
    </>}
    {confirm&&<Modal title={confirm.type==='disconnect'?'Google-névjegyek leválasztása':'Bizonytalan létrehozás ellenőrzése'} onClose={event=>{if(busy)event?.preventDefault();else setConfirm(null);}}>
      {confirm.type==='disconnect'?<p>Leálljon a névjegyek és címkék automatikus frissítése? A Google-ben lévő névjegyek és címkék megmaradnak.</p>:<p>Előbb keresd meg a <strong>{confirm.email}</strong> címet a Google Névjegyekben. Csak akkor engedélyezd az új létrehozást, ha nincs hozzá névjegy; különben másolat keletkezhet. Ha már létezik, válaszd a Mégse gombot és a Frissítés most lehetőséget.</p>}
      <div className="cl-actions"><button disabled={busy} onClick={()=>setConfirm(null)}>Mégse</button><button disabled={busy} className="cl-primary" onClick={()=>confirm.type==='disconnect'?action('disconnect'):action('retry-create',{email:confirm.email,confirm:true})}>{confirm.type==='disconnect'?'Leválasztás':'Ellenőriztem, nem létezik – újrapróbálás'}</button></div><Notice error={error}/>
    </Modal>}
  </>;
}
