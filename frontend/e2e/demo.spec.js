import {test,expect} from '@playwright/test';
const api='http://127.0.0.1:3012';
async function login(page){
  await page.goto('/admin');await page.getByLabel('Email',{exact:true}).fill('demo@example.test');
  await page.getByLabel('Jelszó',{exact:true}).fill('Demo-browser-2026!');
  await page.getByRole('button',{name:'Bejelentkezés',exact:true}).click();
  await expect(page.getByRole('navigation',{name:'Admin navigáció'})).toBeVisible();
}
async function billing(page){
  await page.getByLabel('Számlázási név',{exact:true}).fill('Bemutató Vásárló');
  await page.getByLabel('Irányítószám',{exact:true}).fill('1111');
  await page.getByLabel('Település',{exact:true}).fill('Budapest');
  await page.getByLabel('Utca, házszám',{exact:true}).fill('Teszt utca 1.');
}
test('public pages, images and mobile navigation',async({page,request})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const services=await(await request.get(api+'/api/courses')).json();
  for(const path of ['/','/courses',...services.map(s=>'/courses/'+s.id),'/gallery','/about','/giftcards','/contact','/quote-request','/legal/imprint','/legal/privacy','/legal/terms','/legal/cookies']){
    await page.goto(path);await expect(page.locator('h1').first()).toBeVisible();
    await expect(page.getByText('Betöltés…',{exact:true})).toHaveCount(0);
    await page.locator('img').evaluateAll(imgs=>Promise.all(imgs.map(img=>{img.loading='eager';return img.decode().catch(()=>{});})));
    const broken=await page.locator('img').evaluateAll(imgs=>imgs.filter(i=>!i.naturalWidth).map(i=>i.getAttribute('src')));
    expect(broken,path).toEqual([]);
  }
  await page.setViewportSize({width:390,height:844});
  for(const path of ['/','/courses','/giftcard','/contact']){
    await page.goto(path);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),path+' overflow').toBe(true);
    await page.getByRole('button',{name:'Menü megnyitása',exact:true}).click();
    await expect(page.locator('nav').getByRole('link',{name:'Munkáim',exact:true})).toBeVisible();
  }
  expect(errors).toEqual([]);
});
test('contact and quote forms persist in admin; all admin screens load',async({page})=>{
  await page.goto('/contact');await page.getByLabel('Név',{exact:true}).fill('Bemutató Érdeklődő');
  await page.getByLabel('Email',{exact:true}).fill('inquiry@example.test');await page.getByLabel('Üzenet',{exact:true}).fill('Bemutató kapcsolatfelvétel.');
  await page.getByRole('button',{name:'Üzenet elküldése'}).click();await expect(page.locator('.cl-success')).toBeVisible();
  await page.goto('/quote-request');
  await expect(page.getByLabel('Tárgy',{exact:true})).toHaveValue('Egyedi ajánlatkérés');
  await login(page);
  for(const path of ['','calendar','calendar-sync','bookings','services','courses','customers','inquiries','content','giftcards','payments']){
    await page.goto('/admin/'+path);await expect(page.locator('h1').first()).toBeVisible();
    await expect(page.getByRole('navigation',{name:'Admin navigáció'})).toBeVisible();
    await expect(page.getByText('Betöltés…',{exact:true})).toHaveCount(0);
    await expect(page.getByRole('alert')).toHaveCount(0);
  }
  await page.goto('/admin/inquiries');await expect(page.getByText('Bemutató kapcsolatfelvétel.')).toBeVisible();
  await page.getByRole('button',{name:'Kezeltnek jelölés'}).first().click();await expect(page.getByRole('button',{name:'Újra megnyitás'})).toBeVisible();
});
test('booking and voucher checkout redirect, fulfillment and customer management',async({page,request})=>{
  await page.route('https://checkout.stripe.com/**',r=>r.fulfill({contentType:'text/html',body:'<h1>Stripe test double</h1>'}));
  const slots=await(await request.get(api+'/api/bookings/availability')).json(),slot=slots[0];
  const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Budapest'}).format(new Date(slot.start_time));
  await page.goto(`/courses/${slot.service_id}/book?date=${date}&slot=${slot.id}`);
  await page.getByLabel('Név',{exact:true}).fill('Bemutató Foglaló');
  await page.getByLabel('Email',{exact:true}).fill('booking-browser@example.test');
  await billing(page);
  await page.getByRole('button',{name:'Foglalás és bankkártyás fizetés'}).click();
  await page.waitForURL('https://checkout.stripe.com/**');
  const id=page.url().split('/').at(-1);
  expect((await(await request.get(api+'/__test/state')).json()).bookings.filter(b=>b.customer_email==='booking-browser@example.test')).toHaveLength(0);
  expect((await request.post(api+'/__test/complete/'+id)).ok()).toBe(true);
  await page.goto('/payment#'+id);await expect(page.getByRole('heading',{name:'Sikeres fizetés'})).toBeVisible();
  const state=await(await request.get(api+'/__test/state')).json();expect(state.bookings.filter(b=>b.customer_email==='booking-browser@example.test')).toHaveLength(1);
  const mail=state.mail.find(m=>m.recipient==='booking-browser@example.test');
  const link=mail.body.match(/http[^\s]+\/booking\/manage#[^\s]+/)[0];
  await page.goto(link);await expect(page.getByText('Bemutató Foglaló',{exact:false})).toBeVisible();
  await page.getByLabel('Mit szeretnél?').selectOption('cancel');await page.getByRole('button',{name:'Kérelem elküldése'}).click();
  await expect(page.getByText(/Kérelmed elbírálásra vár/)).toBeVisible();
  await page.goto('/giftcard');await page.getByRole('button',{name:/19.*000.*Ft/}).click();
  await page.getByLabel('Az utalványon szereplő név').fill('Bemutató Ajándékozott');
  await page.getByLabel('Kézbesítési emailcím').fill('gift-browser@example.test');await billing(page);
  await page.locator('button[type=submit]').click();await page.waitForURL('https://checkout.stripe.com/**');
  const giftId=page.url().split('/').at(-1);expect((await request.post(api+'/__test/complete/'+giftId)).ok()).toBe(true);
  const giftState=await(await request.get(api+'/__test/state')).json();
  expect(giftState.mail.find(m=>m.recipient==='gift-browser@example.test'&&m.attachments.length).attachments).toHaveLength(1);
  await page.goto('/payment#'+giftId);await expect(page.getByRole('heading',{name:'Sikeres fizetés'})).toBeVisible();
});

test('admin creates a service, uploads an image, schedules and edits a booking, and publishes content',async({page,request})=>{
  await login(page);await page.goto('/admin/services');
  await page.getByRole('button',{name:'+ Új szolgáltatás'}).click();
  const dialog=page.locator('dialog');
  await dialog.getByLabel('Név',{exact:true}).fill('Bemutató szerkesztett workshop');
  await dialog.getByLabel('Leírás',{exact:true}).fill('Böngészőben létrehozott tesztképzés.');
  await dialog.getByLabel('Ár (Ft)',{exact:true}).fill('12000');
  await dialog.getByLabel('Kártyakép',{exact:true}).setInputFiles('public/assets/courses/alap.jpg');
  await expect(dialog.getByAltText('Kártyakép')).toBeVisible();
  await dialog.getByRole('button',{name:'Mentés',exact:true}).click();await expect(dialog).toHaveCount(0);
  const service=(await(await request.get(api+'/api/courses')).json()).find(s=>s.title==='Bemutató szerkesztett workshop');expect(service).toBeTruthy();
  expect((await request.get(api+service.image)).ok()).toBe(true);
  await page.goto('/admin/courses');await page.getByRole('button',{name:'+ Új kurzusmeghirdetés'}).click();
  await dialog.getByRole('combobox',{name:'Szolgáltatás',exact:true}).selectOption(service.id);
  const date=new Date(Date.now()+40*86400000).toISOString().slice(0,10);
  await dialog.getByLabel('Kezdés (Budapest)').fill(date+'T10:00');
  await expect(dialog.getByLabel('Befejezés (Budapest)')).toHaveValue(date+'T11:00');
  await dialog.getByRole('button',{name:'Mentés',exact:true}).click();await expect(dialog).toHaveCount(0);
  const slot=(await(await request.get(api+'/api/bookings/availability?courseId='+service.id)).json())[0];expect(slot).toBeTruthy();
  await page.goto('/admin/bookings');await page.getByRole('button',{name:'+ Új foglalás'}).click();
  await dialog.getByLabel('Ügyfél neve').fill('Manuális Bemutató');await dialog.getByLabel('Email',{exact:true}).fill('manual-browser@example.test');
  await dialog.getByRole('combobox',{name:'Alkalom',exact:true}).selectOption(slot.id);await dialog.getByRole('button',{name:'Mentés',exact:true}).click();await expect(dialog).toHaveCount(0);
  const booking=(await(await request.get(api+'/__test/state')).json()).bookings.find(b=>b.customer_email==='manual-browser@example.test');expect(booking).toBeTruthy();
  await page.goto('/admin/bookings?booking='+booking.id);await dialog.getByLabel('Foglalás státusza').selectOption('confirmed');
  await dialog.getByRole('button',{name:'Mentés',exact:true}).click();await expect(dialog).toHaveCount(0);
  expect((await(await request.get(api+'/__test/state')).json()).bookings.find(b=>b.id===booking.id).status).toBe('confirmed');
  await page.goto('/admin/calendar');
  for(const view of ['day','week','month']){await page.getByRole('combobox',{name:'Nézet',exact:true}).selectOption(view);await expect(page.getByRole('alert')).toHaveCount(0);}
  await page.goto('/admin/content');await page.getByRole('button',{name:'Impresszum szerkesztése'}).click();
  await dialog.getByLabel('Tartalom (bekezdésekkel)').fill('BEMUTATÓ – böngészőből mentett teszttartalom.');
  await dialog.getByRole('button',{name:'Mentés',exact:true}).click();await expect(dialog).toHaveCount(0);
  await page.goto('/legal/imprint');await expect(page.getByText('BEMUTATÓ – böngészőből mentett teszttartalom.')).toBeVisible();
  await page.goto('/admin');await page.getByRole('button',{name:'Kilépés',exact:true}).click();await expect(page.getByRole('heading',{name:'Admin belépés'})).toBeVisible();
});
