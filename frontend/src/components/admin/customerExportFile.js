import {dateTime,dayKey,labels,localInput} from './format.js';

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
  gmail:{label:'Google Névjegyek / Gmail (.csv)',mime:'text/csv',extension:'csv'},
};
export const gmailExportFieldIds=['name','email','phone','note'];
export function exportFileName(format,now=new Date()){
  return `chocoleaf-${format==='gmail'?'gmail':'ugyfelek'}-${dayKey(now)}.${customerExportFormats[format]?.extension||format}`;
}
export function customerExportRows(customers,selected){
  const fields=customerExportFields.filter(field=>selected.includes(field.id));
  if(!fields.length)throw Error('Válassz ki legalább egy adatmezőt.');
  return [fields.map(field=>field.label),...customers.map(customer=>fields.map(field=>field.value(customer)))];
}
// Treat spreadsheet-looking input as text, including phone numbers beginning with +.
const quoteCsvCell=value=>'"'+String(value??'').replaceAll('"','""')+'"';
function csvCell(value){
  let text=String(value??'');
  if(/^[\s\uFEFF]*[=+@-]/u.test(text)||/^[\t\r\n]/u.test(text))text="'"+text;
  return quoteCsvCell(text);
}
function gmailExportRows(customers,selected,label){
  if(!selected.includes('email'))throw Error('A Gmail-exporthoz az e-mail-címet is ki kell választani.');
  const headers={name:'First Name',email:'Email 1 - Value',phone:'Phone 1 - Value',note:'Notes'};
  const fields=customerExportFields.filter(field=>gmailExportFieldIds.includes(field.id)&&selected.includes(field.id));
  const group=String(label??'ChocoLeaf').trim();
  return [[...fields.map(field=>headers[field.id]),...(group?['Labels']:[])],
    ...customers.map(customer=>[...fields.map(field=>field.value(customer)),...(group?[group]:[])])];
}
// Excel dates represent the Budapest wall clock, independent of the user's timezone.
const excelDate=value=>value?new Date(localInput(value)+'Z'):'';
export function customerWorkbookSheets(customers,selected){
  const detailed=selected.includes('history');
  const fields=selected.filter(id=>id!=='history');
  const rows=fields.length?customerExportRows(customers,fields):[[],...customers.map(()=>[])];
  if(!fields.length&&!detailed)throw Error('Válassz ki legalább egy adatmezőt.');
  if(detailed)rows.forEach((row,index)=>row.unshift(index===0?'Ügyfél sorszáma':index));
  const sheets=[{sheet:'Ügyfelek',rows}];
  if(detailed){
    const identity=customerExportFields.filter(field=>['name','email'].includes(field.id)&&selected.includes(field.id));
    const appointments=[['Ügyfél sorszáma',...identity.map(field=>field.label),'Kurzus','Foglalásazonosító','Alkalom sorszáma','Alkalmak száma',
      'Kezdés (Budapest)','Befejezés (Budapest)','Foglalási állapot','Fizetési állapot','Létszám','Foglalás dátuma (Budapest)','Foglalás törölve']];
    customers.forEach((customer,index)=>{
      for(const booking of customer.history||[]){
        const sessions=(booking.sessions?.length?[...booking.sessions]:[booking]).sort((a,b)=>new Date(a.start_time)-new Date(b.start_time));
        sessions.forEach((session,sessionIndex)=>appointments.push([
          index+1,...identity.map(field=>field.value(customer)),booking.course_title,booking.booking_id||'',sessionIndex+1,sessions.length,
          excelDate(session.start_time),excelDate(session.end_time),labels[booking.status]||booking.status,
          labels[booking.payment_status]||booking.payment_status,booking.seats,excelDate(booking.created_at),booking.archived_at?'Igen':'Nem'
        ]));
      }
    });
    sheets.push({sheet:'Kurzusalkalmak',rows:appointments});
  }
  return sheets;
}
export async function customerExportBlob(customers,selected,format,options={}){
  // Google Contacts consumes literal contact text. In particular, + phone prefixes
  // must not receive the spreadsheet-specific apostrophe used by the general CSV.
  if(format==='gmail')return new Blob(['\uFEFF'+gmailExportRows(customers,selected,options.label).map(row=>row.map(quoteCsvCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});
  const rows=format==='xlsx'?null:customerExportRows(customers,selected);
  if(format==='csv')return new Blob(['\uFEFF'+rows.map(row=>row.map(csvCell).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'});
  if(format==='txt')return new Blob([rows.slice(1).map(row=>row.map((value,index)=>`${rows[0][index]}: ${value??''}`).join('\r\n')).join('\r\n\r\n--------------------\r\n\r\n')],{type:'text/plain;charset=utf-8'});
  if(format!=='xlsx')throw Error('Ismeretlen exportformátum.');
  const sheets=customerWorkbookSheets(customers,selected);
  if(sheets.some(sheet=>sheet.rows.length>1048576))throw Error('Túl sok sor az Excelhez. Szűkítsd az ügyfelek listáját.');
  if(sheets.some(sheet=>sheet.rows.some(row=>row.some(value=>String(value??'').length>32767))))throw Error('Egy mező túl hosszú az Excelhez. Válaszd a TXT vagy CSV formátumot.');
  const {default:writeExcelFile}=await import('write-excel-file/browser');
  const filters={files:{transform:{'xl/worksheets/sheet{id}.xml':{
    transform:(xml,_options,{sheetIndex})=>{
      const rows=sheets[sheetIndex].rows;
      const lastColumn=String.fromCharCode(64+rows[0].length);
      return xml.replace('</sheetData>',`</sheetData><autoFilter ref="A1:${lastColumn}${rows.length}"/>`);
    }
  }}}};
  return writeExcelFile(sheets.map(({sheet,rows})=>({sheet,stickyRowsCount:1,
    columns:rows[0].map(()=>({width:30})),
    data:rows.map((row,index)=>row.map(value=>({
      type:value instanceof Date?Date:typeof value==='number'?Number:String,value:value??'',
      ...(value instanceof Date?{format:'yyyy-mm-dd hh:mm'}:{}),
      ...(index===0?{fontWeight:'bold',backgroundColor:'#6c485c',textColor:'#ffffff'}:{}),wrap:true
    })))
  })),{features:[filters]}).toBlob();
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
