import { api } from "../api/courses";
import { startStripePayment } from '../api/payments';
import { useEffect, useMemo, useState } from "react";
import { usePageDraftState, usePageDraftRef, useClearPageDrafts } from '../components/usePageDraft';
import BillingFields from '../components/BillingFields';
import { emptyBilling } from '../components/billingData';
import { useNavigate } from "react-router-dom";

import "../styles/ExperiencePages.css";

const amountOptions = [19000, 39900, 29000, 185900];

function formatAmount(amount) {
  return new Intl.NumberFormat("hu-HU").format(amount);
}

export default function GiftCardPage() {
  const navigate = useNavigate();
  const requestKeyRef = usePageDraftRef('gift.requestKeyRef', null);
  const clearDrafts = useClearPageDrafts();
  const [provider, setProvider] = useState(null);
  const [stripeBilling, setStripeBilling] = usePageDraftState('gift.stripeBilling', emptyBilling);
  const [errorMessage, setErrorMessage] = useState("");
  useEffect(() => { api('/payments/config').then(x=>setProvider(x.provider)).catch(e=>setErrorMessage(e.message)); }, []);
  const [selectedAmount, setSelectedAmount] = usePageDraftState('gift.amount', null);
  const [quantity, setQuantity] = usePageDraftState('gift.quantity', 1);
  const [names, setNames] = usePageDraftState('gift.names', [""]);
  const [buyerType, setBuyerType] = usePageDraftState('gift.buyerType', "private");
  const [billingData, setBillingData] = usePageDraftState('gift.billing', {
    privateName: "",
    privateAddress: "",
    companyName: "",
    companyAddress: "",
    taxNumber: "",
  });
  const [email, setEmail] = usePageDraftState('gift.email', "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const buttonText = useMemo(
    () =>
      isSubmitting ? 'Rendelés mentése…' : provider === 'stripe' ? 'Megrendelés és bankkártyás fizetés' : 'Megrendelés és átutalási adatok',
    [isSubmitting, provider],
  );

  function updateQuantity(nextQuantity) {
    requestKeyRef.current = null;
    if(nextQuantity === "") {setQuantity(""); return;}
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

  function updateBillingField(field, value) {
    setBillingData((currentData) => ({
      ...currentData,
      [field]: value,
    }));
  }

  function getBillingPayload() {
    if (provider === 'stripe') return stripeBilling;
    if (provider !== 'stripe' && buyerType === "company") {
      return {
        buyerType,
        companyName: billingData.companyName.trim(),
        companyAddress: billingData.companyAddress.trim(),
        taxNumber: billingData.taxNumber.trim(),
      };
    }

    return {
      buyerType,
      privateName: billingData.privateName.trim(),
      privateAddress: billingData.privateAddress.trim(),
    };
  }

  async function startPayment() {
    if (isSubmitting) return;
    setErrorMessage("");
    const cleanNames = names.map((name) => name.trim());
    const billingPayload = getBillingPayload();

    if (!Number.isInteger(Number(quantity)) || Number(quantity)<1 || Number(quantity)>20) {setErrorMessage("Adj meg 1–20 közötti egész darabszámot.");return;}
    if (!selectedAmount) {
      setErrorMessage("Kérlek válassz összeget!");
      return;
    }

    if (provider !== 'stripe' && buyerType === "company") {
      if (
        !billingPayload.companyName ||
        !billingPayload.companyAddress ||
        !billingPayload.taxNumber
      ) {
        setErrorMessage("Kérlek add meg a céges számlázási adatokat!");
        return;
      }
    } else if (provider !== 'stripe' && (!billingPayload.privateName || !billingPayload.privateAddress)) {
      setErrorMessage("Kérlek add meg a magánszemély számlázási adatokat!");
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
          amount: selectedAmount,
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
      <header className="voucher-heading"><p className="experience-eyebrow">ChocoLeaf ajándékutalvány</p><h1>Ajándékozz közös alkotást.</h1><p>Csokoládé, kíváncsiság és egy új élmény. Válaszd ki az utalvány értékét, mi pedig névre szólóan készítjük el.</p></header>
      <form className="voucher-layout" onChange={()=>{requestKeyRef.current=null;}} onSubmit={e=>{e.preventDefault();startPayment();}}>
        <div className="voucher-steps">
          <section className="voucher-step"><p className="experience-eyebrow">01 · Az ajándék</p><h2>Milyen értékben ajándékoznál?</h2>
            <div className="voucher-amounts">{amountOptions.map(amount=><button type="button" key={amount} aria-pressed={selectedAmount===amount} className={selectedAmount===amount?'selected':''} onClick={()=>{requestKeyRef.current=null;setSelectedAmount(amount);}}>{formatAmount(amount)} Ft<span>névre szóló utalvány</span></button>)}</div>
            <label className="voucher-label" htmlFor="voucher-quantity">Utalványok száma</label><div className="voucher-quantity"><button type="button" aria-label="Egy utalvánnyal kevesebb" disabled={Number(quantity)<=1} onClick={()=>changeQuantity(-1)}>−</button><input id="voucher-quantity" type="number" required min="1" max="20" step="1" value={quantity} onChange={e=>updateQuantity(e.target.value)}/><button type="button" aria-label="Egy utalvánnyal több" disabled={Number(quantity)>=20} onClick={()=>changeQuantity(1)}>+</button></div>
          </section>
          <section className="voucher-step"><p className="experience-eyebrow">02 · A megajándékozott</p><h2>Kinek szól az élmény?</h2><p>Minden utalvány 1 fő részére szól. Az alábbi nevek szerepelnek majd rajtuk.</p>
            {names.map((name,index)=><label className="voucher-label" key={index}>{names.length>1?`${index+1}. utalvány – név`:'Az utalványon szereplő név'}<input required maxLength="100" value={name} onChange={e=>updateName(index,e.target.value)} autoComplete="off"/></label>)}
            <label className="voucher-label">Kézbesítési emailcím<input required type="email" maxLength="254" value={email} autoComplete="email" onChange={e=>setEmail(e.target.value)}/></label><p className="voucher-hint">Az összes elkészült utalványt erre az emailcímre küldjük. Megadhatod a saját címedet, ha személyesen szeretnéd átadni.</p>
          </section>
          <section className="voucher-step"><p className="experience-eyebrow">03 · Számlázás</p><h2>Kinek állítsuk ki a számlát?</h2>
            {provider === 'stripe' ? <BillingFields value={stripeBilling} onChange={setStripeBilling}/> : <>
            <div className="voucher-buyer">{[['private','Magánszemély'],['company','Cég']].map(([value,label])=><label key={value}><input type="radio" name="buyerType" value={value} checked={buyerType===value} onChange={()=>setBuyerType(value)}/>{label}</label>)}</div>
            {(buyerType==='company'?[['companyName','Cégnév'],['companyAddress','Székhely'],['taxNumber','Adószám']]:[['privateName','Számlázási név'],['privateAddress','Számlázási cím']]).map(([key,label])=><label key={key} className="voucher-label">{label}<input required maxLength="500" value={billingData[key]} onChange={e=>updateBillingField(key,e.target.value)}/></label>)}
            </>}
          </section>
        </div>
        <aside className="voucher-summary"><div className="voucher-summary-inner"><img className="voucher-photo" src="/assets/courses/alap.jpg" alt="Kézműves csokoládékészítő élmény"/><p className="experience-eyebrow">Az ajándékod</p><h2>Édes élmény, névre szólóan.</h2><div className="voucher-summary-row"><span>Utalvány értéke</span><strong>{selectedAmount?formatAmount(selectedAmount)+' Ft':'Válassz értéket'}</strong></div><div className="voucher-summary-row"><span>Mennyiség</span><strong>{quantity||'–'} db</strong></div><div className="voucher-total" aria-live="polite"><span>Fizetendő összesen</span><strong>{selectedAmount&&quantity?formatAmount(selectedAmount*Number(quantity))+' Ft':'–'}</strong></div>
          <p>Az utalvány a ChocoLeaf édességkészítő workshopjaira használható fel, a rajta szereplő értékben.</p><h3>Mi történik a rendelés után?</h3><ol><li>{provider === 'stripe' ? 'Bankkártyával fizetsz a Stripe biztonságos oldalán.' : 'Megkapod az átutaláshoz szükséges adatokat.'}</li><li>A fizetés beérkezését visszaigazoljuk.</li><li>A névre szóló PDF-utalványokat elküldjük a megadott emailcímre.</li>{provider === 'stripe' && <li>A számlát automatikusan elkészítjük és emailben elküldjük.</li>}</ol>
          {errorMessage&&<p role="alert" className="voucher-error">{errorMessage}</p>}<button className="experience-cta" type="submit" disabled={isSubmitting || !provider}>{buttonText}</button><small>Fizetési mód: {provider === 'stripe' ? 'bankkártya (Stripe)' : provider ? 'banki átutalás' : 'betöltés…'}.</small>
        </div></aside>
      </form>
    </div></section>
  );
}
