export default function SeatCount({value,onChange,available}) {
 return <label>Létszám<input type="number" inputMode="numeric" min="1" step="1" max={available} required value={value} onChange={e=>onChange(e.target.value)}/></label>;
}
