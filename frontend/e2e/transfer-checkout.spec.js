import {test,expect} from '@playwright/test';
const api='http://127.0.0.1:3012';
const options=data=>({headers:{Origin:'http://127.0.0.1:5184'},data});
async function login(page){
  await page.goto('/admin');await page.getByLabel('Email',{exact:true}).fill('demo@example.test');
  await page.getByLabel('Jelszó',{exact:true}).fill('Demo-browser-2026!');
  await page.getByRole('button',{name:'Bejelentkezés',exact:true}).click();
  await expect(page.getByRole('navigation',{name:'Admin navigáció'})).toBeVisible();
}
async function billing(page){
  await page.getByLabel('Számlázási név',{exact:true}).fill('Transfer Buyer');
  await page.getByLabel('Irányítószám',{exact:true}).fill('1111');
  await page.getByLabel('Település',{exact:true}).fill('Budapest');
  await page.getByLabel('Utca, házszám',{exact:true}).fill('Teszt utca 1.');
}
test('two-session booking keeps the form, opens bank details and admin saves payment before confirmation',async({page})=>{
  await login(page);
  const service=await(await page.request.post(api+'/api/admin/services',options({title:'Transfer browser course',session_count:2,duration_minutes:90,price:19000,capacity:6}))).json();
  const day=n=>new Date(Date.now()+n*86400000).toISOString().slice(0,10);
  const course=await(await page.request.post(api+'/api/admin/courses',options({service_id:service.id,sessions:[{start_time:day(90)+'T09:00:00Z'},{start_time:day(92)+'T09:00:00Z'}]}))).json();
  await page.goto(`/courses/${service.id}/book?date=${day(90)}&slot=${course.id}`);
  await page.getByLabel('Név',{exact:true}).fill('Transfer Browser Guest');
  await page.getByLabel('Email',{exact:true}).fill('transfer-browser@example.test');
  await billing(page);
  await page.reload();
  await expect(page.getByLabel('Számlázási név',{exact:true})).toHaveValue('Transfer Buyer');
  await page.getByRole('button',{name:'Foglalás és átutalási adatok',exact:true}).click();
  await page.waitForURL('**/transfer?id=*');
  await expect(page.getByRole('heading',{name:'Átutalásos fizetés',exact:true})).toBeVisible();
  await expect(page.getByText('11111111-22222222-33333333',{exact:true})).toBeVisible();
  const state=await(await page.request.get(api+'/__test/state')).json();
  const booking=state.bookings.find(item=>item.customer_email==='transfer-browser@example.test');
  expect(booking.payment_status).toBe('pending');expect(booking.billing_data.name).toBe('Transfer Buyer');
  await expect(page.getByText(booking.transfer_reference,{exact:true})).toBeVisible();
  await page.reload();await expect(page.getByText(booking.transfer_reference,{exact:true})).toBeVisible();
  await page.goto('/admin/bookings');
  await page.getByLabel('Keresés',{exact:true}).fill('transfer-browser@example.test');
  const row=page.locator(`tr[data-booking-id="${booking.id}"]`);
  await row.getByRole('combobox',{name:'Fizetés állapota',exact:true}).selectOption('paid');
  await expect(row.getByRole('combobox',{name:'Fizetés állapota',exact:true})).toBeEnabled();
  await page.reload();
  await expect(row.getByRole('combobox',{name:'Fizetés állapota',exact:true})).toHaveValue('paid');
  await expect(row.getByRole('combobox',{name:'Foglalás állapota',exact:true})).toHaveValue('pending');
  await row.getByRole('combobox',{name:'Foglalás állapota',exact:true}).selectOption('confirmed');
  await expect(row.locator('.cl-badge')).toHaveText('Visszaigazolt');
  const saved=await(await page.request.get(api+'/__test/state')).json();
  expect(saved.mail.filter(mail=>mail.calendar?.uid.startsWith(booking.id+'.'))).toHaveLength(2);
  await page.goto('/transfer?id='+booking.id);
  await expect(page.getByText(/A fizetés beérkezését már rögzítettük/)).toBeVisible();
});
test('voucher purchase opens bank details and manual admin approval saves paid state and queues PDFs once',async({page})=>{
  await page.goto('/giftcard');
  await page.getByRole('button',{name:/19.*000.*Ft/}).click();
  await page.getByRole('textbox',{name:/^Az utalványon szereplő név:?$/}).fill('Transfer Voucher Guest');
  await page.getByRole('textbox',{name:/^Kézbesítési email ?cím:?$/}).fill('transfer-voucher@example.test');
  await billing(page);
  await page.getByRole('button',{name:'Megrendelés és átutalási adatok',exact:true}).click();
  await page.waitForURL('**/transfer?id=*');
  const id=new URL(page.url()).searchParams.get('id');
  await expect(page.getByText('11111111-22222222-33333333',{exact:true})).toBeVisible();
  await login(page);await page.goto('/admin/giftcards');
  const card=page.locator('article').filter({hasText:'transfer-voucher@example.test'});
  page.once('dialog',dialog=>dialog.accept());
  await card.getByRole('button',{name:'Fizetés jóváhagyása és utalványküldés',exact:true}).click();
  await expect(card.getByText(/Kiállítva, emailküldésre átadva/)).toBeVisible();
  await page.reload();await expect(card.getByText(/Kiállítva, emailküldésre átadva/)).toBeVisible();
  const orders=await(await page.request.get(api+'/api/giftcard/admin/orders')).json();
  expect(orders.find(order=>order.id===id).data.paidAt).toBeTruthy();
  expect((await page.request.post(api+'/api/giftcard/admin/mark-paid',options({id}))).ok()).toBe(true);
  const state=await(await page.request.get(api+'/__test/state')).json();
  expect(state.mail.filter(mail=>mail.recipient==='transfer-voucher@example.test'&&mail.attachments.length)).toHaveLength(1);
});

test('custom voucher amount validates, survives reload and preset switching, then pays for two exact-value PDFs',async({page})=>{
  await page.goto('/giftcard');
  const custom=page.getByRole('button',{name:/^Egyéni összeg/});
  await custom.click();
  const value=page.getByRole('textbox',{name:'Egyéni összeg (Ft / utalvány)',exact:true});
  await expect(value).toBeFocused();
  await expect(value).toHaveValue('1000');
  await expect(page.locator('.voucher-total strong')).toHaveText(/1\s*000 Ft/);
  for(const invalid of ['-1000','1000001','10000001','1234.5','1e4','abc']){
    await value.fill(invalid);await expect(value).toHaveValue('1000');
  }
  for(const temporary of ['','999']){
    await value.fill(temporary);await value.press('Tab');await expect(value).toHaveValue('1000');
  }
  await value.focus();await value.press('Control+A');await value.pressSequentially('12345');await expect(value).toHaveValue('12345');
  await value.fill('12345');
  await page.getByRole('button',{name:'Egy utalvánnyal több',exact:true}).click();
  await page.getByLabel('1. utalvány – név',{exact:true}).fill('Custom First');
  await page.getByLabel('2. utalvány – név',{exact:true}).fill('Custom Second');
  await page.getByRole('textbox',{name:/^Kézbesítési email ?cím:?$/}).fill('custom-voucher@example.test');
  await billing(page);
  await expect(page.locator('.voucher-total strong')).toHaveText(/24\s*690 Ft/);
  await page.reload();await expect(custom).toHaveAttribute('aria-pressed','true');await expect(value).toHaveValue('12345');
  await expect(page.locator('.voucher-total strong')).toHaveText(/24\s*690 Ft/);
  await page.getByRole('button',{name:/19.*000.*Ft/}).click();
  await expect(value).toHaveCount(0);await expect(page.locator('.voucher-total strong')).toHaveText(/38\s*000 Ft/);
  await custom.click();await expect(value).toHaveValue('12345');
  const submitted=page.waitForRequest(request=>request.url().endsWith('/api/giftcard/start-payment')&&request.method()==='POST');
  await page.getByRole('button',{name:'Megrendelés és átutalási adatok',exact:true}).click();
  expect((await submitted).postDataJSON()).toMatchObject({amount:12345,quantity:2,names:['Custom First','Custom Second']});
  await page.waitForURL('**/transfer?id=*');
  const id=new URL(page.url()).searchParams.get('id');
  const transfer=await(await page.request.get(api+'/api/transfer-info?id='+id)).json();expect(transfer.amount).toBe(24690);
  await login(page);
  expect((await page.request.post(api+'/api/giftcard/admin/mark-paid',options({id}))).ok()).toBe(true);
  const orders=await(await page.request.get(api+'/api/giftcard/admin/orders')).json();
  expect(orders.find(order=>order.id===id).data.meta.unitAmount).toBe(12345);
  const state=await(await page.request.get(api+'/__test/state')).json();
  const mail=state.mail.find(mail=>mail.recipient==='custom-voucher@example.test'&&mail.attachments.length);
  expect(mail.attachments).toHaveLength(2);expect(mail.body).toContain('Utalványonként: 12345 Ft');expect(mail.body).toContain('Összesen: 24690 Ft');
  await page.goto('/giftcard');await custom.click();await expect(value).toHaveValue('1000');
  await value.fill('15555');await page.goto('/courses');await page.goto('/giftcard');
  await expect(custom).toHaveAttribute('aria-pressed','false');await custom.click();await expect(value).toHaveValue('1000');
});
