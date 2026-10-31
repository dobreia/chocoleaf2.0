import {dateTime,dayKey,labels} from './format.js';

function historyText(history=[]){
  return history.map(booking=>[
    booking.course_title,
    `${labels[booking.status]||booking.status} · ${labels[booking.payment_status]||booking.payment_status} · ${booking.seats} fő`,
    ...(booking.sessions?.length?booking.sessions:[booking]).map((session,index,sessions)=>
      `${index+1}/${sessions.length}. alkalom: ${dateTime(session.start_time)} – ${dateTime(session.end_time)}`),
    `Foglalás: ${dateTime(booking.created_at)}`,
    ...(booking.archived_at?['Törölt foglalás · megőrzött kurzuselőzmény']:[])
  ].join('\n')).join('\n\n');
}
export const customerExportFields=[
  {id:'name',label:'Név',value:c=>c.name||''},
  {id:'email',label:'E-mail-cím',value:c=>c.email||''},
  {id:'phone',label:'Telefonszám',value:c=>c.phone||''},
  {id:'note',label:'Belső megjegyzés',value:c=>c.note||''},
  {id:'courses',label:'Foglalt kurzusok',value:c=>(c.courses||[]).join('\n')},
  {id:'bookings',label:'Foglalások száma',value:c=>c.bookings},
  {id:'last_booking',label:'Legutóbbi foglalás dátuma',value:c=>c.last_booking?dateTime(c.last_booking):''},
  {id:'history',label:'Részletes foglalási előzmények (minden alkalom, állapot)',value:c=>historyText(c.history)},
];
export const customerExportFormats={
  csv:{label:'CSV (.csv)',mime:'text/csv'},
  txt:{label:'Szöveges fájl (.txt)',mime:'text/plain'},
  xlsx:{label:'Excel (.xlsx)',mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'},
};
export function exportFileName(format,now=new Date()){
  return `chocoleaf-ugyfelek-${dayKey(now)}.${format}`;
}
export function customerExportRows(customers,selected){
  const fields=customerExportFields.filter(field=>selected.includes(field.id));
  if(!fields.length)throw Error('Válassz ki legalább egy adatmezőt.');
  return [fields.map(field=>field.label),...customers.map(customer=>fields.map(field=>field.value(customer)))];
}
// Treat spreadsheet-looking input as text, including phone numbers beginning with +.
function csvCell(value){
  let text=String(value??'');
  if(/^[\s\uFEFF]*[=+@-]/u.test(text)||/^[\t\r\n]/u.test(text))text="'"+text;
  return '"'+text.replaceAll('"','""')+'"';
}
export async function customerExportBlob(customers,selected,format){
  const rows=customerExportRows(customers,selected);
  if(format==='csv')return new Blob(['\uFEFF'+rows.map(row=>row.map(csvCell).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'});
  if(format==='txt')return new Blob([rows.slice(1).map(row=>row.map((value,index)=>`${rows[0][index]}: ${value??''}`).join('\r\n')).join('\r\n\r\n--------------------\r\n\r\n')],{type:'text/plain;charset=utf-8'});
  if(format!=='xlsx')throw Error('Ismeretlen exportformátum.');
  if(rows.some(row=>row.some(value=>String(value??'').length>32767)))throw Error('Egy mező túl hosszú az Excelhez. Válaszd a TXT vagy CSV formátumot.');
  const {default:writeExcelFile}=await import('write-excel-file/browser');
  return writeExcelFile(rows.map((row,index)=>row.map(value=>({
    type:typeof value==='number'?Number:String,value:value??'',
    ...(index===0?{fontWeight:'bold',backgroundColor:'#6c485c',color:'#ffffff'}:{}),wrap:true
  }))),{sheet:'Ügyfelek',columns:rows[0].map(()=>({width:30}))}).toBlob();
}
export async function withCustomerHistories(customers,loadHistory){
  const result=new Array(customers.length);let next=0;
  await Promise.all(Array.from({length:Math.min(4,customers.length)},async()=>{
    while(next<customers.length){const index=next++;result[index]={...customers[index],history:await loadHistory(customers[index].email)};}
  }));
  return result;
}
export function downloadCustomerExport(blob,filename){
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
