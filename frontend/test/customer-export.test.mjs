import {test} from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync,strFromU8} from 'fflate';
import {customerExportRows,customerExportBlob,customerWorkbookSheets,withCustomerHistories,exportFileName} from '../src/components/admin/customerExportFile.js';

const customer={name:'Árvíztűrő "Anna"; teszt',email:'anna@example.test',phone:'+36301234567',note:'Első sor\nMásodik sor',bookings:2,courses:['Csokoládé','Bonbon'],last_booking:'2026-10-31T12:00:00Z',secret:'never export this'};
test('exports contain only selected fields in a consistent order and validate empty selection',()=>{
  assert.deepEqual(customerExportRows([customer],['name']),[['Név'],[customer.name]]);
  assert.deepEqual(customerExportRows([customer],['email','name','secret']),[['Név','E-mail-cím'],[customer.name,customer.email]]);
  assert.throws(()=>customerExportRows([customer],[]));
  assert.equal(exportFileName('csv',new Date('2026-10-31T23:30:00Z')),'chocoleaf-ugyfelek-2026-11-01.csv');
});
test('CSV preserves UTF-8, delimiter/quote/newline data and neutralizes spreadsheet formulas',async()=>{
  const blob=await customerExportBlob([customer],['name','phone','note'],'csv');
  const bytes=new Uint8Array(await blob.arrayBuffer());assert.deepEqual([...bytes.slice(0,3)],[239,187,191]);
  const text=await blob.text();
  assert.ok(text.includes('"Árvíztűrő ""Anna""; teszt"'));assert.ok(text.includes('"Első sor\nMásodik sor"'));
  assert.ok(text.includes('"\'+36301234567"'));assert.ok(!text.includes('anna@example.test'));
  for(const value of ['=1+1',' @SUM(A1)','\t=1','-1+2','+1']){
    const output=await(await customerExportBlob([{name:value}],['name'],'csv')).text();
    assert.ok(output.endsWith('"\''+value+'"'));
  }
});
test('TXT preserves readable multi-line notes and all sessions including archived/cancelled history',async()=>{
  const history=[{course_title:'Kétalkalmas',status:'cancelled',payment_status:'refunded',seats:1,created_at:'2026-10-01T12:00Z',archived_at:'2026-10-02T12:00Z',sessions:[{start_time:'2026-10-10T08:00Z',end_time:'2026-10-10T09:00Z'},{start_time:'2026-10-11T08:00Z',end_time:'2026-10-11T09:00Z'}]}];
  const text=await(await customerExportBlob([{...customer,history}],['note','history'],'txt')).text();
  for(const value of ['Első sor\nMásodik sor','1/2. alkalom','2/2. alkalom','Lemondva','Visszatérítve','Törölt foglalás'])assert.ok(text.includes(value));
  assert.ok(!text.includes(customer.email));
});
test('Excel is a real XLSX workbook with text phones/formulas and numeric counts',async()=>{
  const blob=await customerExportBlob([{...customer,name:'=SUM(A1)',note:'<script>ügyfél</script>'}],['name','phone','bookings','note'],'xlsx');
  const files=unzipSync(new Uint8Array(await blob.arrayBuffer()));
  const xml=Object.fromEntries(Object.entries(files).map(([name,bytes])=>[name,strFromU8(bytes)]));
  assert.ok(xml['[Content_Types].xml']);assert.ok(xml['xl/workbook.xml'].includes('Ügyfelek'));
  const sheet=xml['xl/worksheets/sheet1.xml'];assert.ok(!sheet.includes('<f>'));assert.ok(sheet.includes('<v>2</v>'));
  const all=Object.values(xml).join('');assert.ok(all.includes('+36301234567'));assert.ok(all.includes('=SUM(A1)'));assert.ok(all.includes('&lt;script&gt;'));assert.ok(!all.includes(customer.email));
  await assert.rejects(customerExportBlob([{name:'x'.repeat(32768)}],['name'],'xlsx'),/túl hosszú/);
});
test('history loads with bounded concurrency and preserves customer ordering; failures stop export',async()=>{
  let active=0,max=0;
  const customers=Array.from({length:9},(_,index)=>({email:String(index)}));
  const result=await withCustomerHistories(customers,async email=>{
    active++;max=Math.max(max,active);await new Promise(resolve=>setTimeout(resolve,3));active--;return[email];
  });
  assert.ok(max<=4);assert.deepEqual(result.map(row=>row.history[0]),customers.map(row=>row.email));
  await assert.rejects(withCustomerHistories(customers,async()=>{throw Error('Network error');}),/Network error/);
});

test('Excel splits every session into a sortable linked row and respects selected identity fields',async()=>{
  const booking={booking_id:'booking-1',course_title:'Kétalkalmas',status:'cancelled',payment_status:'refunded',seats:2,created_at:'2026-10-01T12:00:00Z',archived_at:'2026-10-02T12:00:00Z',sessions:[
    {start_time:'2026-11-01T09:00:00Z',end_time:'2026-11-01T10:30:00Z'},
    {start_time:'2026-10-24T08:00:00Z',end_time:'2026-10-24T09:30:00Z'}
  ]};
  const customers=[{...customer,history:[booking]},{name:'Másik ügyfél',email:'other@example.test',history:[]}];
  const sheets=customerWorkbookSheets(customers,['name','history']);
  assert.deepEqual(sheets.map(sheet=>sheet.sheet),['Ügyfelek','Kurzusalkalmak']);
  assert.deepEqual(sheets[0].rows,[['Ügyfél sorszáma','Név'],[1,customer.name],[2,'Másik ügyfél']]);
  const details=sheets[1].rows,headers=details[0],column=label=>headers.indexOf(label);
  assert.equal(details.length,3);assert.ok(!headers.includes('E-mail-cím'));
  assert.deepEqual(details.slice(1).map(row=>row.slice(0,6)),[
    [1,customer.name,'Kétalkalmas','booking-1',1,2],
    [1,customer.name,'Kétalkalmas','booking-1',2,2]
  ]);
  assert.equal(details[1][column('Kezdés (Budapest)')].toISOString(),'2026-10-24T10:00:00.000Z');
  assert.equal(details[2][column('Kezdés (Budapest)')].toISOString(),'2026-11-01T10:00:00.000Z');
  assert.equal(details[2][column('Befejezés (Budapest)')].toISOString(),'2026-11-01T11:30:00.000Z');
  assert.equal(details[1][column('Foglalási állapot')],'Lemondva');
  assert.equal(details[1][column('Fizetési állapot')],'Visszatérítve');
  assert.equal(details[1][column('Foglalás törölve')],'Igen');
  const blob=await customerExportBlob(customers,['name','history'],'xlsx');
  const files=unzipSync(new Uint8Array(await blob.arrayBuffer()));
  const xml=Object.fromEntries(Object.entries(files).map(([name,bytes])=>[name,strFromU8(bytes)]));
  assert.ok(xml['xl/workbook.xml'].includes('Kurzusalkalmak'));
  const {JSDOM}=await import('jsdom');
  const parse=value=>new JSDOM(value,{contentType:'text/xml'}).window.document;
  const styles=parse(xml['xl/styles.xml']);
  const fonts=[...styles.querySelectorAll('fonts > font')];
  const fills=[...styles.querySelectorAll('fills > fill')];
  const cellStyles=[...styles.querySelectorAll('cellXfs > xf')];
  for(const sheet of ['sheet1','sheet2']){
    const value=xml[`xl/worksheets/${sheet}.xml`];
    assert.ok(value.includes('<autoFilter ref="A1:'));assert.ok(value.includes('state="frozen"'));
    assert.equal((value.match(/<row\b/g)||[]).length,3);
    const headers=parse(value).querySelectorAll('sheetData > row:first-child > c');
    assert.ok(headers.length>0);
    for(const cell of headers){
      const style=cellStyles[Number(cell.getAttribute('s')||0)];
      assert.match(fonts[Number(style.getAttribute('fontId'))].querySelector('color').getAttribute('rgb'),/^(FF)?FFFFFF$/i);
      assert.match(fills[Number(style.getAttribute('fillId'))].querySelector('fgColor').getAttribute('rgb'),/^(FF)?6C485C$/i);
    }
  }
  const all=Object.values(xml).join('');assert.ok(!all.includes('anna@example.test'));assert.ok(!all.includes('Részletes foglalási előzmények'));
  const onlyHistory=customerWorkbookSheets(customers,['history']);
  assert.deepEqual(onlyHistory[0].rows,[['Ügyfél sorszáma'],[1],[2]]);
  assert.ok(!JSON.stringify(onlyHistory).includes(customer.name));
  assert.ok(!JSON.stringify(onlyHistory).includes(customer.email));
  const withEmail=customerWorkbookSheets(customers,['email','history']);assert.ok(withEmail[1].rows[0].includes('E-mail-cím'));
});

test('Excel handles long booking histories as separate rows and supports legacy single-session records',async()=>{
  const booking={booking_id:'legacy',course_title:'Régi kurzus',status:'confirmed',payment_status:'paid',seats:1,start_time:'2026-10-10T08:00Z',end_time:'2026-10-10T09:00Z',created_at:'2026-10-01T12:00Z'};
  const history=Array.from({length:450},(_,index)=>({...booking,booking_id:'booking-'+index}));
  assert.ok(customerExportRows([{...customer,history}],['history'])[1][0].length>32767);
  const blob=await customerExportBlob([{...customer,history}],['email','history'],'xlsx');
  const files=unzipSync(new Uint8Array(await blob.arrayBuffer()));
  assert.equal((strFromU8(files['xl/worksheets/sheet2.xml']).match(/<row\b/g)||[]).length,451);
  assert.equal(customerWorkbookSheets([customer],['name']).length,1);
});
