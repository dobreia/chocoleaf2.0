export default function BillingFields({ value, onChange }) {
  const update = (key, next) => onChange({ ...value, [key]: next });
  return <fieldset className="billing-fields">
    <legend>Számlázási adatok</legend>
    <label>Vásárló típusa<select value={value.buyerType} onChange={e => update('buyerType', e.target.value)}>
      <option value="private">Magánszemély</option><option value="company">Cég</option>
    </select></label>
    {(value.buyerType === 'company' ? [['companyName', 'Cégnév'], ['taxNumber', 'Adószám (12345678-1-12)']] : [['privateName', 'Számlázási név']]).map(([key,label]) =>
      <label key={key}>{label}<input required maxLength={key === 'taxNumber' ? 13 : 200} value={value[key]} onChange={e => update(key,e.target.value)} /></label>)}
    <p>Magyarországi számlázási cím</p>
    <label>Irányítószám<input required inputMode="numeric" pattern="[0-9]{4}" maxLength="4" autoComplete="billing postal-code" value={value.postCode} onChange={e=>update('postCode',e.target.value)}/></label>
    <label>Település<input required maxLength="100" autoComplete="billing address-level2" value={value.city} onChange={e=>update('city',e.target.value)}/></label>
    <label>Utca, házszám<input required maxLength="200" autoComplete="billing street-address" value={value.street} onChange={e=>update('street',e.target.value)}/></label>
  </fieldset>;
}
