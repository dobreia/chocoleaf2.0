import { api } from "../api/courses";
import { startStripePayment } from '../api/payments';
import { useEffect, useMemo, useRef, useState } from "react";
import { usePageDraftState, usePageDraftRef, useClearPageDrafts } from '../components/usePageDraft';
import BillingFields from '../components/BillingFields';
import { emptyBilling } from '../components/billingData';
import { useNavigate } from "react-router-dom";

import "../styles/ExperiencePages.css";

const minAmount = 1000, maxAmount = 1000000;

function formatAmount(amount) {
  return new Intl.NumberFormat("hu-HU").format(amount);
}

export default function GiftCardPage() {
  const navigate = useNavigate();
  const requestKeyRef = usePageDraftRef('gift.requestKeyRef', null);
  const clearDrafts = useClearPageDrafts();
  const [provider, setProvider] = useState(null);
  const [amountOptions, setAmountOptions] = useState([]);
  const [amountRecommendations, setAmountRecommendations] = useState([]);
  const [amountsLoading, setAmountsLoading] = useState(true);
  const [amountsError, setAmountsError] = useState('');
  const [stripeBilling, setStripeBilling] = usePageDraftState('gift.stripeBilling', emptyBilling);
  const [errorMessage, setErrorMessage] = useState("");
  useEffect(() => { api('/payments/config').then(x => setProvider(x.provider)).catch(e => setErrorMessage(e.message)); }, []);
  useEffect(() => {
    let live = true, pending = false;
    const load = async () => {
      if (pending) return;
      pending = true;
      try {
        const values = await api('/giftcard/amounts?details=1');
        if (!Array.isArray(values) || values.some(option => !Number.isSafeInteger(option.amount) || option.amount < minAmount || option.amount > maxAmount || !Array.isArray(option.courses))) throw Error('A kurzusárak nem tölthetők be.');
        if (live) { setAmountOptions(values.map(option => option.amount)); setAmountRecommendations(values); setAmountsError(''); }
      } catch {
        if (live) { setAmountOptions([]); setAmountRecommendations([]); setAmountsError('A kurzusárak most nem tölthetők be. Egyéni összeget továbbra is megadhatsz.'); }
      } finally { pending = false; if (live) setAmountsLoading(false); }
    };
    const refresh = () => { if (!document.hidden) load(); };
    load();
    const timer = setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { live = false; clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  const [selectedAmount, setSelectedAmount] = usePageDraftState('gift.amount', null);
  const [customAmount, setCustomAmount] = usePageDraftState('gift.customAmount', String(minAmount));
  const customInput = useRef(null);
  const isCustom = selectedAmount === 'custom';
  const candidateAmount = isCustom ? Number(customAmount) : selectedAmount;
  const amount = Number.isSafeInteger(candidateAmount) && candidateAmount >= minAmount && candidateAmount <= maxAmount && (isCustom || (!amountsLoading && !amountsError && amountOptions.includes(candidateAmount))) ? candidateAmount : null;
  const unavailableSelection = !!(!isCustom && selectedAmount && !amountsLoading && !amountOptions.includes(selectedAmount));
  useEffect(() => { if (isCustom) { customInput.current?.focus(); customInput.current?.select(); } }, [isCustom]);
  const [quantity, setQuantity] = usePageDraftState('gift.quantity', 1);
  const [names, setNames] = usePageDraftState('gift.names', [""]);
  const [email, setEmail] = usePageDraftState('gift.email', "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const buttonText = useMemo(
    () =>
      isSubmitting ? 'Rendelés mentése…' : provider === 'stripe' ? 'Megrendelés és bankkártyás fizetés' : 'Megrendelés és átutalási adatok',
    [isSubmitting, provider],
  );

  function normalizeCustomAmount() {
    const value = Number(customAmount);
    const normalized = Number.isSafeInteger(value) ? Math.min(maxAmount, Math.max(minAmount, value)) : minAmount;
    setCustomAmount(String(normalized));
  }

  function updateCustomAmount(value) {
    if (!/^\d{0,7}$/.test(value) || Number(value) > maxAmount) return;
    setCustomAmount(value);
  }

  function updateQuantity(nextQuantity) {
    requestKeyRef.current = null;
    if (nextQuantity === "") { setQuantity(""); return; }
    const normalizedQuantity = Math.min(
      20,
      Math.max(1, Math.floor(Number(nextQuantity) || 1)),
    );
    setQuantity(normalizedQuantity);
    setNames((currentNames) =>
      Array.from(
        { length: normalizedQuantity },
        (_, index) => currentNames[index] || "",
      ),
    );
  }

  function changeQuantity(delta) {
    updateQuantity(Number(quantity) + delta);
  }

  function updateName(index, value) {
    setNames((currentNames) =>
      currentNames.map((currentName, currentIndex) =>
        currentIndex === index ? value : currentName,
      ),
    );
  }

  async function startPayment() {
    if (isSubmitting) return;
    setErrorMessage("");
    const cleanNames = names.map((name) => name.trim());
    const billingPayload = stripeBilling;

    if (!Number.isInteger(Number(quantity)) || Number(quantity) < 1 || Number(quantity) > 20) { setErrorMessage("Adj meg 1–20 közötti egész darabszámot."); return; }
    if (!selectedAmount) {
      setErrorMessage("Kérlek válassz összeget!");
      return;
    }
    if (!isCustom && (amountsLoading || amountsError || !amountOptions.includes(selectedAmount))) {
      setErrorMessage('A kiválasztott kurzusár már nem érhető el. Válassz másik összeget vagy adj meg egyéni értéket.');
      return;
    }
    if (!amount) {
      setErrorMessage(`Adj meg ${formatAmount(minAmount)}–${formatAmount(maxAmount)} Ft közötti egész összeget utalványonként.`);
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setErrorMessage("Kérlek add meg az email címet!");
      return;
    }

    if (cleanNames.length !== quantity || cleanNames.some((name) => !name)) {
      setErrorMessage(
        "Kérlek add meg az összes ajándékutalványhoz tartozó nevet!",
      );
      return;
    }

    try {
      setIsSubmitting(true);
      requestKeyRef.current ||= crypto.randomUUID();

      const data = await api("/giftcard/start-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json", 'Idempotency-Key': requestKeyRef.current },
        body: {
          name: cleanNames[0],
          names: cleanNames,
          email: email.trim(),
          amount,
          quantity,
          billingData: billingPayload,
          paymentMethod: provider,
        },
      });

      if (data.paymentId) {
        await startStripePayment(data);
        clearDrafts();
        return;
      }
      if (data.redirectUrl) {
        clearDrafts();
        navigate(data.redirectUrl);
        return;
      }

      if (data.id) {
        clearDrafts();
        navigate(`/transfer?id=${encodeURIComponent(data.id)}`);
        return;
      }

      setErrorMessage("Hiba történt: hiányzó redirectUrl/id a válaszban.");
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="experience-page voucher-page"><div className="experience-shell">
      <header className="voucher-heading"><p className="experience-eyebrow">ChocoLeaf ajándékutalvány</p><h1>Ajándékozz közös alkotást!</h1><p>Csokoládé, kíváncsiság és egy új élmény. Válaszd ki az utalvány értékét, mi pedig névre szólóan készítjük el.</p></header>
      <form className="voucher-layout" onChange={() => { requestKeyRef.current = null; }} onSubmit={e => { e.preventDefault(); startPayment(); }}>
        <div className="voucher-steps">
          <section className="voucher-step"><p className="experience-eyebrow">01 · Az ajándék</p><h2>Milyen értékben ajándékoznál?</h2>
            <p className="voucher-hint">Az összegek az aktuálisan meghirdetett, még el nem kezdődött kurzusok teljes árai.</p>
            <p className="voucher-hint">A kurzusnevek az összeg kiválasztását segítik. Az utalvány értékösszegre szól, nincs a feltüntetett kurzushoz kötve.</p>
            {amountsLoading && <p role="status">Kurzusárak betöltése…</p>}
            {amountsError && <p role="status" className="voucher-error">{amountsError}</p>}
            {!amountsLoading && !amountsError && !amountOptions.length && <p>Jelenleg egyéni összeggel vásárolhatsz utalványt.</p>}
            {unavailableSelection && !amountsError && <p role="status" className="voucher-error">A korábban kiválasztott kurzusár már nem érhető el. Válassz másik összeget vagy add meg egyéni értékként.</p>}
            <div className="voucher-amounts">{amountRecommendations.map(option => <button type="button" key={option.amount} aria-pressed={selectedAmount === option.amount} className={selectedAmount === option.amount ? 'selected' : ''} onClick={() => { requestKeyRef.current = null; setSelectedAmount(option.amount); }}>{formatAmount(option.amount)} Ft
              <span>kurzusárhoz igazítva</span>
              {option.courses.map(course => <span className="voucher-course-suggestion" key={course.id}>{course.title}{course.multiSession && <small>teljes kurzus ára</small>}</span>)}
            </button>)}
              <button type="button" className={'voucher-custom-choice'+(isCustom?' selected':'')} aria-pressed={isCustom} aria-expanded={isCustom} aria-controls="voucher-custom-amount" onClick={() => { requestKeyRef.current = null; normalizeCustomAmount(); setSelectedAmount('custom'); }}>Egyéni összeg<span>te határozod meg az utalvány értékét</span></button>
            </div>
            {isCustom && <div id="voucher-custom-amount">
              <label className="voucher-label" htmlFor="voucher-custom-value">Egyéni összeg (Ft / utalvány)<input ref={customInput} id="voucher-custom-value" type="text" inputMode="numeric" pattern="[0-9]*" required value={customAmount} aria-describedby="voucher-custom-hint" onFocus={() => { if (!amount) normalizeCustomAmount(); }} onBlur={normalizeCustomAmount} onChange={event => updateCustomAmount(event.target.value)} /></label>
              <p className="voucher-hint" id="voucher-custom-hint">{formatAmount(minAmount)}–{formatAmount(maxAmount)} Ft közötti egész összeget adhatsz meg. A mező elhagyásakor az üres vagy túl alacsony értéket a minimumra állítjuk. Több utalványnál ez az érték mindegyikre külön vonatkozik.</p>
            </div>}
            <label className="voucher-label" htmlFor="voucher-quantity">Utalványok száma</label><div className="voucher-quantity"><button type="button" aria-label="Egy utalvánnyal kevesebb" disabled={Number(quantity) <= 1} onClick={() => changeQuantity(-1)}>−</button><input id="voucher-quantity" type="number" required min="1" max="20" step="1" value={quantity} onChange={e => updateQuantity(e.target.value)} /><button type="button" aria-label="Egy utalvánnyal több" disabled={Number(quantity) >= 20} onClick={() => changeQuantity(1)}>+</button></div>
          </section>
          <section className="voucher-step"><p className="experience-eyebrow">02 · A megajándékozott</p><h2>Kinek szól az élmény?</h2><p>Minden utalvány 1 fő részére szól. Az alábbi nevek szerepelnek majd rajtuk.</p>
            {names.map((name, index) => <label className="voucher-label" key={index}>{names.length > 1 ? `${index + 1}. utalvány – név` : 'Az utalványon szereplő név:'}<input required maxLength="100" value={name} onChange={e => updateName(index, e.target.value)} autoComplete="off" /></label>)}
            <label className="voucher-label">Kézbesítési email cím:<input required type="email" maxLength="254" value={email} autoComplete="email" onChange={e => setEmail(e.target.value)} /></label><p className="voucher-hint">Az összes elkészült utalványt erre az email címre küldjük. Megadhatod a saját címedet, ha személyesen szeretnéd átadni.</p>
          </section>
          <section className="voucher-step"><p className="experience-eyebrow">03 · Számlázás</p><h2>Kinek állítsuk ki a számlát?</h2>
            <BillingFields value={stripeBilling} onChange={setStripeBilling} />
          </section>
        </div>
        <aside className="voucher-summary"><div className="voucher-summary-inner"><img className="voucher-photo" src="/assets/courses/alap.jpg" alt="Kézműves csokoládékészítő élmény" /><p className="experience-eyebrow">Az ajándékod</p><h2>Édes élmény, névre szólóan.</h2><div className="voucher-summary-row"><span>Utalvány értéke</span><strong>{amount ? formatAmount(amount) + ' Ft' : isCustom ? 'Adj meg összeget' : 'Válassz értéket'}</strong></div><div className="voucher-summary-row"><span>Mennyiség</span><strong>{quantity || '–'} db</strong></div><div className="voucher-total" aria-live="polite"><span>Fizetendő összesen</span><strong>{amount && quantity ? formatAmount(amount * Number(quantity)) + ' Ft' : '–'}</strong></div>
          <p>Az utalvány a ChocoLeaf édességkészítő workshopjaira használható fel, a rajta szereplő értékben.</p><h3>Mi történik a rendelés után?</h3><ol><li>{provider === 'stripe' ? 'Bankkártyával fizetsz a Stripe biztonságos oldalán.' : 'Megkapod az átutaláshoz szükséges adatokat.'}</li><li>A fizetés beérkezését visszaigazoljuk.</li><li>A névre szóló PDF-utalványokat elküldjük a megadott email címre.</li>{provider === 'stripe' && <li>A számlát automatikusan elkészítjük és emailben elküldjük.</li>}</ol>
          {errorMessage && <p role="alert" className="voucher-error">{errorMessage}</p>}<button className="experience-cta" type="submit" disabled={isSubmitting || !provider || (!isCustom && (amountsLoading || !!amountsError || !!unavailableSelection))}>{buttonText}</button><small>Fizetési mód: {provider === 'stripe' ? 'bankkártya (Stripe)' : provider ? 'banki átutalás' : 'betöltés…'}.</small>
        </div></aside>
      </form>
    </div></section>
  );
}
