import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api/courses';
import { Modal, Notice } from '../../components/admin/UI';

const callbackMessages = {
  connected: 'A Google-fiók összekapcsolva. Az első eseményeket most küldjük át.',
  denied: 'Az összekapcsolást megszakítottad. A meglévő kapcsolat nem változott.',
  expired: 'Az összekapcsolási kérés lejárt. Indítsd újra az összekapcsolást erről az oldalról.',
  permissions: 'A szükséges Google-engedélyek nem érkeztek meg. Próbáld újra, és engedélyezd a felsorolt hozzáféréseket.',
  different_account: 'Másik Google-fiókot választottál. Fiókváltáshoz először válaszd le a jelenlegi kapcsolatot.',
  failed: 'Az összekapcsolás nem sikerült. Próbáld újra; a meglévő foglalások nem változtak.',
};
const timestamp = value => value ? new Date(value).toLocaleString('hu-HU', { dateStyle:'short', timeStyle:'short' }) : 'Még nem történt';
export default function CalendarSync() {
  const [params] = useSearchParams();
  const [data, setData] = useState(null), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false), [confirm, setConfirm] = useState(false), [revision, setRevision] = useState(0);
  useEffect(() => {
    let live = true;
    const load = async () => {
      try { const value = await api('/admin/calendar-sync'); if(live) { setData(value); setError(''); } }
      catch(e) { if(live) setError(e.message); }
    };
    load();
    const timer = setInterval(() => { if(!document.hidden) load(); }, 10000);
    return () => { live=false; clearInterval(timer); };
  }, [revision]);
  async function action(name) {
    if(busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await api('/admin/calendar-sync/'+name, { method:'POST' });
      if(result.url) { window.location.assign(result.url); return; }
      setMessage(result.message); setConfirm(false); setRevision(r=>r+1);
    } catch(e) { setError(e.message); }
    finally { setBusy(false); }
  }
  const result = params.get('google'), connected = data?.connected;
  const healthy = connected && !data.needsAuth && !data.error && !data.failed;
  const stale = connected && data.stale;
  const state = !connected ? 'Nincs összekapcsolva' : data.needsAuth ? 'Újra összekapcsolandó' : stale ? 'A háttérfrissítés késik' : !healthy ? 'Újrapróbálásra vár' : !data.calendarUrl || data.pending || !data.lastSyncedAt ? 'Frissítés folyamatban' : 'A naptár naprakész';
  return <>
    <div className="cl-title"><div><h1>Naptár a telefonodon</h1><p>Kurzusok és foglalt létszám a Google vagy az iPhone Naptár alkalmazásában.</p></div><Link to="/admin/calendar">Vissza a naptárhoz</Link></div>
    <Notice error={error || (result && result!=='connected' ? callbackMessages[result] : '')} message={message || (result==='connected' ? callbackMessages.connected : '')}/>
    {!data ? <p role="status">Kapcsolat ellenőrzése…</p> : <div className="cl-sync-layout">
      <div>
        <section className="cl-card cl-sync-card">
          <div className="cl-sync-heading"><h2>Google-naptár</h2><span className={'cl-badge '+(healthy&&!stale?'confirmed':'pending')}>{state}</span></div>
          <p>Egy külön <strong>ChocoLeaf kurzusok</strong> naptárt hozunk létre. Az új foglalások, lemondások és időpontváltozások automatikusan átkerülnek.</p>
          {data.accountEmail && <p className="cl-sync-account">{connected?'Kapcsolt fiók':'Legutóbbi fiók'}: <strong>{data.accountEmail}</strong></p>}
          {!data.configured && <div className="cl-sync-info">{data.demo ? 'Ez a demó a kapcsolódás felületét mutatja. Valódi Google-fiók csak az éles, szerverrel működő rendszerben kapcsolható össze.' : 'Az összekapcsolás még nem érhető el. Az üzemeltetőnek egyszer be kell állítania a Google-kapcsolatot; utána itt egy gombbal csatlakozhatsz.'}</div>}
          {data.error && <Notice error={data.error}/>}
          {data.failed>0 && <p role="status">{data.failed} esemény frissítését újrapróbáljuk. A foglalások az adminban továbbra is elérhetők.</p>}
          {stale && <Notice error="A háttérfolyamat egy ideje nem ellenőrizte az eseményeket. Indíts kézi frissítést; ha nem rendeződik, jelezd az üzemeltetőnek."/>}
          <div className="cl-sync-actions">
            {(!connected || data.needsAuth || data.error) && <button className="cl-primary" disabled={busy || !data.configured} onClick={()=>action('connect')}>{busy?'Kapcsolódás…':connected?'Google-kapcsolat megújítása':'Összekapcsolás Google-fiókkal'}</button>}
            {connected && <><button disabled={busy || data.needsAuth || !data.configured} onClick={()=>action('sync')}>{busy?'Kérés folyamatban…':'Frissítés most'}</button><button disabled={busy} onClick={()=>setConfirm(true)}>Leválasztás</button></>}
          </div>
          <p className="cl-muted">A jelszavadat a Google oldalán adod meg. A ChocoLeaf nem olvassa a személyes naptáraid eseményeit.</p>
          {connected && <>
            <dl className="cl-sync-stats"><div><dt>Átküldött események</dt><dd>{data.synced}</dd></div><div><dt>Várakozó változások</dt><dd>{data.pending}</dd></div><div><dt>Utolsó teljes frissítés</dt><dd>{timestamp(data.lastSyncedAt)}</dd></div><div><dt>Utolsó ellenőrzés</dt><dd>{timestamp(data.lastScanAt)}</dd></div></dl>
            {data.retryAt && !data.needsAuth && <p>Következő újrapróbálás leghamarabb: {timestamp(data.retryAt)}</p>}
            {data.calendarUrl && <a className="cl-sync-link" href={data.calendarUrl} target="_blank" rel="noreferrer">ChocoLeaf-naptár megnyitása a Google-ben ↗</a>}
          </>}
        </section>
        <section className="cl-card cl-sync-card"><h2>Így jelenik meg a telefonon</h2>
          {data.preview.length ? data.preview.map((event,i)=><article className="cl-sync-preview" key={i}><strong>{event.summary}</strong><span>{timestamp(event.start.dateTime)} – {new Date(event.end.dateTime).toLocaleTimeString('hu-HU',{hour:'2-digit',minute:'2-digit'})}</span><span>{event.description.split('\n')[1]}</span><Link to={new URL(event.source.url,window.location.origin).pathname+new URL(event.source.url,window.location.origin).search}>Résztvevők és foglalások az adminban →</Link></article>) : <p>Még nincs megjeleníthető jövőbeli alkalom. <Link to="/admin/courses">Időpont létrehozása</Link></p>}
          <p className="cl-muted">Az előnézet a jelenlegi foglalásokból készül. A nevek, telefonszámok és belső megjegyzések az adminban maradnak.</p>
        </section>
      </div>
      <aside>
        <section className="cl-card cl-sync-card"><h2>Egyszeri beállítás</h2><ol className="cl-sync-steps"><li>Kapcsold össze a használni kívánt Google-fiókot.</li><li>Engedélyezd a kért hozzáféréseket a Google oldalán.</li><li>A telefonodon jelenítsd meg a <strong>ChocoLeaf kurzusok</strong> naptárt.</li></ol>
          <details open><summary>iPhone Naptár</summary><p>Add hozzá ugyanazt a Google-fiókot az iPhone naptárfiókjaihoz, és engedélyezd a naptárszinkront. A Naptár alkalmazás naptárlistájában jelöld be a ChocoLeaf kurzusokat.</p><a href="https://support.google.com/calendar/answer/99358?hl=hu&co=GENIE.Platform%3DiOS" target="_blank" rel="noreferrer">iPhone-beállítási útmutató ↗</a></details>
          <details><summary>Google Calendar / Android</summary><p>Nyisd meg a Google Calendar alkalmazást a kapcsolt fiókkal. A naptárak listájában kapcsold be a ChocoLeaf kurzusokat; a naptár beállításainál a szinkronizálás is legyen bekapcsolva.</p></details>
        </section>
        <section className="cl-card cl-sync-card"><h2>Mit érdemes tudni?</h2><p>A szerver 15 másodpercenként ellenőrzi a változásokat. A telefonon való megjelenés az alkalmazás frissítésétől és az internetkapcsolattól is függ.</p><p>Az időpontokat és foglalásokat az adminban módosítsd. A telefonos naptár szerkesztése nem írja át a foglalásokat; a következő egyeztetés felülírhatja az ottani változtatást.</p><p>Egy kurzus egy esemény. A létszám az aktív foglalásokban szereplő főket összegzi, a lemondottakat kihagyja.</p></section>
      </aside>
    </div>}
    {confirm && <Modal title="Naptár leválasztása" onClose={()=>!busy&&setConfirm(false)}><p>Leálljon az automatikus frissítés? A Google-ben lévő események megmaradnak, de a létszámuk már nem frissül. A weboldal foglalásait ez nem érinti.</p><p>A Google-fiók biztonsági beállításainál a ChocoLeaf engedélyét külön is visszavonhatod.</p><div className="cl-sync-actions"><button disabled={busy} onClick={()=>setConfirm(false)}>Mégse</button><button className="cl-primary" disabled={busy} onClick={()=>action('disconnect')}>Leválasztás</button></div><Notice error={error}/></Modal>}
  </>;
}
