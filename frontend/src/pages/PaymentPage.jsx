import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../api/courses';
import { redirectToStripe } from '../api/payments';
import { money } from '../components/admin/format';
export default function PaymentPage() {
  const id = useLocation().hash.slice(1);
  const [order, setOrder] = useState(null), [error, setError] = useState(''), [busy,setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    const load = () => api('/payments/' + encodeURIComponent(id)).then(value => { if(live) {setOrder(value);setError('');} }).catch(e => {if(live)setError(e.message);});
    load();
    const timer = setInterval(load, 10000);
    return () => { live=false; clearInterval(timer); };
  }, [id]);
  async function pay() {
    setBusy(true); setError('');
    try {
      const result = await api(`/payments/${encodeURIComponent(id)}/checkout`, {method:'POST', body:{}});
      redirectToStripe(result.redirectUrl);
    } catch(e) {setError(e.message);setBusy(false);}
  }
  return <section className="experience-page"><div className="experience-shell">
    <h1>{order?.status === 'paid' ? 'Sikeres fizetés' : 'Bankkártyás fizetés'}</h1>
    {error && <p role="alert">{error}</p>}
    {!order && !error && <p>Fizetés állapotának betöltése…</p>}
    {order && <><p>Összeg: <strong>{money(order.amount)}</strong></p>
      {order.status === 'paid' ? <><p>A fizetésed megérkezett. A további tudnivalókat emailben küldjük.</p>
        {order.invoiceStatus === 'skipped' ? <p>Helyi tesztfizetés: számla nem készül.</p> : order.invoiceUrl ? <a href={order.invoiceUrl} target="_blank" rel="noreferrer">Számla megnyitása</a> : <p>A számlád készül, elkészültekor emailben is elküldjük.</p>}</> :
        order.status === 'expired' ? <p>A fizetési határidő lejárt. Kérjük, indíts új rendelést.</p> : <>
          <p>A Stripe biztonságos oldalán fizethetsz. Foglalás esetén a helyedet ideiglenesen tartjuk; a foglalás csak sikeres fizetés után jön létre. Ha már fizettél, várd meg a visszaigazolást; ez az oldal automatikusan frissül.</p>
          <button className="experience-cta" onClick={pay} disabled={busy}>{busy?'Átirányítás…':'Fizetés a Stripe oldalán'}</button>
        </>}
    </>}
    <p><Link to="/courses">Vissza a képzésekhez</Link> · <Link to="/giftcard">Ajándékutalvány</Link></p>
  </div></section>;
}
