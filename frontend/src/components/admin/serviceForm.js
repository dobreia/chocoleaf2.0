export const serviceNumberFields=[
  {key:'session_count',label:'Alkalmak száma',min:1,max:100,step:1},
  {key:'duration_hours',label:'Alap időtartam (óra)',min:1/60,max:24,step:'any'},
  {key:'price',label:'Ár (Ft)',min:0,max:10000000,step:1},
  {key:'capacity',label:'Alap férőhely',min:1,max:100,step:1},
];
export function serviceFormValues(service){
  return {...service,session_count:String(service.session_count??1),price:String(service.price??0),capacity:String(service.capacity??6),
    duration_hours:service.duration_minutes===''?'':String(service.duration_minutes/60)};
}
export function servicePayload(form){
  const hours=form.duration_hours===undefined?(form.duration_minutes===''?'':form.duration_minutes/60):form.duration_hours;
  const values={...form,duration_hours:hours};
  const payload={...form};delete payload.duration_hours;
  for(const field of serviceNumberFields){
    const raw=values[field.key],value=Number(raw);
    if(raw==null||String(raw).trim()===''||typeof raw==='boolean'||!Number.isFinite(value)||value<field.min||value>field.max||
      (field.step===1&&!Number.isSafeInteger(value)))throw Error(`${field.label}: ${field.min===1/60?'legalább 1 perc, legfeljebb 24 óra':`${field.min}–${field.max} közötti egész szám`} szükséges.`);
    if(field.key==='duration_hours')payload.duration_minutes=Math.round(value*60);
    else payload[field.key]=value;
  }
  return payload;
}
