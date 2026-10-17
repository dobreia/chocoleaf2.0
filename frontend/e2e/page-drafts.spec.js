import { test, expect } from '@playwright/test';

const api = 'http://127.0.0.1:3012';
async function login(page) {
  await page.goto('/admin');
  await page.getByLabel('Email', { exact:true }).fill('demo@example.test');
  await page.getByLabel('Jelszó', { exact:true }).fill('Demo-browser-2026!');
  await page.getByRole('button', { name:'Bejelentkezés', exact:true }).click();
  await expect(page.getByRole('navigation', { name:'Admin navigáció' })).toBeVisible();
}
async function bookingPage(page, request) {
  const slots = await (await request.get(api + '/api/bookings/availability')).json();
  const slot = slots.find(s => s.is_available && s.available_spots > 1);
  const date = new Intl.DateTimeFormat('sv-SE', { timeZone:'Europe/Budapest' }).format(new Date(slot.start_time));
  await page.goto(`/courses/${slot.service_id}/book?date=${date}&slot=${slot.id}`);
  await expect(page.getByLabel('Számlázási név', { exact:true })).toBeVisible({ timeout:15000 });
  return slot;
}

for (const path of ['/contact', '/quote-request']) {
  test(`${path} restores drafts on repeated refresh, preserves failures, clears on submit and SPA navigation`, async ({ page }) => {
    await page.goto(path);
    const name = page.getByLabel('Név', { exact:true });
    const message = page.getByRole('textbox', { name:'Üzenet', exact:true });
    await name.fill('Piszkozat Név');
    await page.getByLabel('Email', { exact:true }).fill('draft-inquiry@example.test');
    await page.getByLabel('Telefon', { exact:true }).fill('+36301234567');
    await message.fill('Frissítés után is megmaradó üzenet.');
    for (let i = 0; i < 2; i++) {
      await page.reload();
      await expect(name).toHaveValue('Piszkozat Név');
      await expect(message).toHaveValue('Frissítés után is megmaradó üzenet.');
    }
    await page.route('**/api/inquiries', route => route.fulfill({ status:503, contentType:'application/json', body:JSON.stringify({ message:'Tesztelési hiba' }) }), { times:1 });
    await page.getByRole('button', { name:'Üzenet elküldése' }).click();
    await expect(page.getByRole('alert')).toContainText('Tesztelési hiba');
    await page.reload();
    await expect(message).toHaveValue('Frissítés után is megmaradó üzenet.');
    await page.getByRole('button', { name:'Üzenet elküldése' }).click();
    await expect(name).toHaveValue('');
    await expect(message).toHaveValue('');
    await page.reload();
    await expect(message).toHaveValue('');
    await name.fill('Elhagyott oldal');
    const nav = page.getByRole('navigation', { name:'Fő navigáció' });
    await nav.getByRole('link', { name:'Képzések', exact:true }).click();
    await nav.getByRole('link', { name:path === '/contact' ? 'Kapcsolat' : 'Ajánlatkérés', exact:true }).click();
    await expect(name).toHaveValue('');
    await page.reload();
    await expect(name).toHaveValue('');
  });
}

test('home inquiry restores every field and clears after submission or leaving the page', async ({ page }) => {
  await page.goto('/');
  const values = { nev:'Főoldali Piszkozat', email:'home-draft@example.test', telefon:'+36301234567', termek:'Praliné', reszletek:'Egyedi ajándékcsomag', datum:'2027-12-01' };
  for (const [id, value] of Object.entries(values)) await page.locator('#' + id).fill(value);
  await page.reload();
  for (const [id, value] of Object.entries(values)) await expect(page.locator('#' + id)).toHaveValue(value);
  await page.locator('form input[type="submit"]').click();
  await expect(page.locator('#nev')).toHaveValue('');
  await page.reload();
  await expect(page.locator('#reszletek')).toHaveValue('');
  await page.locator('#nev').fill('Elhagyott főoldali űrlap');
  await page.goto('/courses');
  await page.goto('/');
  await expect(page.locator('#nev')).toHaveValue('');
});

test('gift order restores quantities, recipient names, amount and both billing modes without leaking to another tab', async ({ page, context }) => {
  await page.goto('/giftcards');
  const amount = page.getByRole('button', { name:/19.*000.*Ft/ });
  await amount.click();
  await page.getByLabel('Utalványok száma', { exact:true }).fill('2');
  await page.getByLabel('1. utalvány – név', { exact:true }).fill('Első Név');
  await page.getByLabel('2. utalvány – név', { exact:true }).fill('Második Név');
  await page.getByLabel('Kézbesítési emailcím', { exact:true }).fill('gift-draft@example.test');
  await page.getByLabel('Számlázási név', { exact:true }).fill('Eltérő Vásárló');
  const buyer = page.getByRole('combobox', { name:/Vásárló típusa/ });
  await buyer.selectOption('company');
  await page.getByLabel('Cégnév', { exact:true }).fill('Piszkozat Kft.');
  await page.getByLabel('Számlázási e-mail-cím', { exact:true }).fill('accounts-draft@example.test');
  await page.reload();
  await expect(amount).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Utalványok száma', { exact:true })).toHaveValue('2');
  await expect(page.getByLabel('2. utalvány – név', { exact:true })).toHaveValue('Második Név');
  await expect(buyer).toHaveValue('company');
  await expect(page.getByLabel('Cégnév', { exact:true })).toHaveValue('Piszkozat Kft.');
  await expect(page.getByLabel('Számlázási e-mail-cím', { exact:true })).toHaveValue('accounts-draft@example.test');
  await buyer.selectOption('private');
  await expect(page.getByLabel('Számlázási név', { exact:true })).toHaveValue('Eltérő Vásárló');
  await page.reload();
  await expect(buyer).toHaveValue('private');
  const other = await context.newPage();
  await other.goto('/giftcards');
  await expect(other.getByLabel('Az utalványon szereplő név', { exact:true })).toHaveValue('');
  await other.close();
  await page.getByRole('navigation', { name:'Fő navigáció' }).getByRole('link', { name:'Képzések', exact:true }).click();
  await page.getByRole('navigation', { name:'Fő navigáció' }).getByRole('link', { name:'Ajándékutalvány', exact:true }).click();
  await expect(page.getByLabel('Az utalványon szereplő név', { exact:true })).toHaveValue('');
  await expect(amount).toHaveAttribute('aria-pressed', 'false');
});

test('booking restores selection, company mode and manual billing name, then resets after leaving', async ({ page, request }) => {
  await bookingPage(page, request);
  await page.getByLabel('Név', { exact:true }).fill('Foglalási Piszkozat');
  await page.getByLabel('Számlázási név', { exact:true }).fill('Kézi Számlatulajdonos');
  await page.getByLabel('Létszám', { exact:true }).fill('2');
  await page.getByRole('textbox', { name:'Megjegyzés', exact:true }).fill('Megőrzött foglalási megjegyzés');
  const buyer = page.getByRole('combobox', { name:/Vásárló típusa/ });
  await buyer.selectOption('company');
  await page.getByLabel('Cégnév', { exact:true }).fill('Foglaló Kft.');
  await page.getByLabel('Számlázási e-mail-cím', { exact:true }).fill('booking-accounts@example.test');
  await page.reload();
  await expect(page.getByLabel('Név', { exact:true })).toHaveValue('Foglalási Piszkozat');
  await expect(page.getByLabel('Létszám', { exact:true })).toHaveValue('2');
  await expect(page.getByRole('textbox', { name:'Megjegyzés', exact:true })).toHaveValue('Megőrzött foglalási megjegyzés');
  await expect(buyer).toHaveValue('company');
  await expect(page.locator('.booking-calendar-slot[aria-pressed="true"]')).toHaveCount(1);
  await buyer.selectOption('private');
  await expect(page.getByLabel('Számlázási név', { exact:true })).toHaveValue('Kézi Számlatulajdonos');
  await page.getByLabel('Név', { exact:true }).fill('Módosított Kapcsolattartó');
  await expect(page.getByLabel('Számlázási név', { exact:true })).toHaveValue('Kézi Számlatulajdonos');
  await page.reload();
  await expect(buyer).toHaveValue('private');
  await page.getByLabel('Számlázási név', { exact:true }).fill('');
  await page.reload();
  await expect(page.getByLabel('Számlázási név', { exact:true })).toHaveValue('');
  await page.getByRole('link', { name:'Vissza a képzésekhez' }).click();
  await bookingPage(page, request);
  await expect(page.getByLabel('Név', { exact:true })).toHaveValue('');
  await expect(page.getByLabel('Létszám', { exact:true })).toHaveValue('1');
});

test('booking retries after refresh reuse the same payment request identifier', async ({ page, request }) => {
  await bookingPage(page, request);
  await page.getByLabel('Név', { exact:true }).fill('Újrapróbáló Foglaló');
  await page.getByLabel('Email', { exact:true }).fill('retry-draft@example.test');
  await page.getByLabel('Irányítószám', { exact:true }).fill('1111');
  await page.getByLabel('Település', { exact:true }).fill('Budapest');
  await page.getByLabel('Utca, házszám', { exact:true }).fill('Teszt utca 1.');
  const keys = [];
  await page.route('**/api/bookings', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    keys.push(route.request().headers()['idempotency-key']);
    await route.fulfill({ status:503, contentType:'application/json', body:JSON.stringify({ message:'Tesztelési hiba' }) });
  });
  const submit = page.getByRole('button', { name:'Foglalás és bankkártyás fizetés', exact:true });
  await submit.click();
  await expect.poll(() => keys.length).toBe(1);
  await expect(page.getByText('Tesztelési hiba', { exact:true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Név', { exact:true })).toHaveValue('Újrapróbáló Foglaló');
  await submit.click();
  await expect.poll(() => keys.length).toBe(2);
  expect(keys[0]).toBeTruthy();
  expect(keys[1]).toBe(keys[0]);
});

test('admin login keeps email on refresh without storing the password', async ({ page }) => {
  await page.goto('/admin');
  await page.getByLabel('Email', { exact:true }).fill('demo@example.test');
  await page.getByLabel('Jelszó', { exact:true }).fill('Not-stored-password');
  await page.reload();
  await expect(page.getByLabel('Email', { exact:true })).toHaveValue('demo@example.test');
  await expect(page.getByLabel('Jelszó', { exact:true })).toHaveValue('');
  expect(await page.evaluate(() => JSON.stringify({ ...sessionStorage }))).not.toContain('Not-stored-password');
});

test('admin service, slot and booking modals reopen after refresh and discard on close or save', async ({ page, request }) => {
  await login(page);
  const dialog = page.locator('dialog');
  for (const [path, button, label] of [
    ['/admin/services', '+ Új szolgáltatás', 'Név'],
    ['/admin/courses', '+ Új alkalom', 'Ár / fő (Ft)'],
    ['/admin/bookings', '+ Új foglalás', 'Ügyfél neve'],
    ['/admin/calendar', '+ Foglalás', 'Ügyfél neve'],
  ]) {
    await page.goto(path);
    await page.getByRole('button', { name:button, exact:true }).click();
    const value = path === '/admin/courses' ? '12345' : 'Admin Piszkozat';
    await dialog.getByLabel(label, { exact:true }).fill(value);
    if (path === '/admin/services') {
      await dialog.getByRole('textbox', { name:'Részletes leírás', exact:true }).fill('Hosszú, megőrzött szolgáltatásleírás.');
      await dialog.getByLabel('Aktív szolgáltatás', { exact:true }).uncheck();
      await dialog.getByLabel('Kártyakép', { exact:true }).setInputFiles('public/assets/courses/alap.jpg');
      await expect(dialog.getByAltText('Kártyakép', { exact:true })).toBeVisible();
    }
    if (path === '/admin/courses') {
      const services = await (await request.get(api + '/api/courses')).json();
      await dialog.getByRole('combobox', { name:'Szolgáltatás', exact:true }).selectOption(services[0].id);
      await dialog.getByLabel(label, { exact:true }).fill(value);
      await dialog.getByLabel('Kezdés (Budapest)', { exact:true }).fill('2027-12-01T10:00');
      await dialog.getByLabel('Befejezés (Budapest)', { exact:true }).fill('2027-12-01T12:00');
    }
    await page.reload();
    await expect(dialog).toBeVisible({ timeout:15000 });
    await expect(dialog.getByLabel(label, { exact:true })).toHaveValue(value);
    if (path === '/admin/services') {
      await expect(dialog.getByRole('textbox', { name:'Részletes leírás', exact:true })).toHaveValue('Hosszú, megőrzött szolgáltatásleírás.');
      await expect(dialog.getByLabel('Aktív szolgáltatás', { exact:true })).not.toBeChecked();
      await expect(dialog.getByAltText('Kártyakép', { exact:true })).toBeVisible();
    }
    if (path === '/admin/courses') {
      await expect(dialog.getByLabel('Kezdés (Budapest)', { exact:true })).toHaveValue('2027-12-01T10:00');
      await expect(dialog.getByLabel('Befejezés (Budapest)', { exact:true })).toHaveValue('2027-12-01T12:00');
    }
    await dialog.getByRole('button', { name:'Bezárás', exact:true }).click();
    await page.reload();
    await expect(page.getByRole('button', { name:button, exact:true })).toBeVisible();
    await expect(dialog).toHaveCount(0);
    await page.getByRole('button', { name:button, exact:true }).click();
    await expect(dialog.getByLabel(label, { exact:true })).toHaveValue(path === '/admin/courses' ? '0' : '');
    await dialog.getByRole('button', { name:'Bezárás', exact:true }).click();
  }
  await page.goto('/admin/services');
  await page.getByRole('button', { name:'+ Új szolgáltatás', exact:true }).click();
  await dialog.getByLabel('Név', { exact:true }).fill('Mentett Piszkozat Szolgáltatás');
  await dialog.getByRole('button', { name:'Mentés', exact:true }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name:'+ Új szolgáltatás', exact:true })).toBeVisible();
  await expect(dialog).toHaveCount(0);
  expect((await (await request.get(api + '/api/courses')).json()).some(s => s.title === 'Mentett Piszkozat Szolgáltatás')).toBe(true);
});

test('admin content editor and customer booking management preserve drafts', async ({ page, request }) => {
  await login(page);
  await page.goto('/admin/content');
  await page.getByRole('button', { name:'Impresszum szerkesztése', exact:true }).click();
  const dialog = page.locator('dialog');
  const content = dialog.getByRole('textbox', { name:'Tartalom (bekezdésekkel)', exact:true });
  await content.fill('Nem publikált, megőrzött oldaltartalom.');
  await page.reload();
  await expect(content).toHaveValue('Nem publikált, megőrzött oldaltartalom.');
  await dialog.getByRole('button', { name:'Bezárás', exact:true }).click();
  await page.reload();
  await expect(dialog).toHaveCount(0);

  const slots = await (await request.get(api + '/api/bookings/availability')).json();
  const slot = slots.find(s => s.is_available);
  const response = await page.request.post(api + '/api/admin/bookings', { headers:{ Origin:'http://127.0.0.1:5184' }, data:{ courseId:slot.id, customerName:'Piszkozat Ügyfél', customerEmail:'manage-draft@example.test', seats:1 } });
  expect(response.ok(), await response.text()).toBe(true);
  await page.goto('/admin/customers');
  await page.locator('.cl-card').filter({ has:page.getByRole('heading', { name:'Piszkozat Ügyfél', exact:true }) }).getByRole('button', { name:'Szerkesztés', exact:true }).click();
  await dialog.getByLabel('Név', { exact:true }).fill('Ügyfél Piszkozat Módosítás');
  await dialog.getByLabel('Telefon', { exact:true }).fill('+36307654321');
  await page.reload();
  await expect(dialog.getByLabel('Név', { exact:true })).toHaveValue('Ügyfél Piszkozat Módosítás');
  await expect(dialog.getByLabel('Telefon', { exact:true })).toHaveValue('+36307654321');
  await dialog.getByRole('button', { name:'Bezárás', exact:true }).click();
  const state = await (await request.get(api + '/__test/state')).json();
  const mail = state.mail.find(m => m.recipient === 'manage-draft@example.test');
  const link = new URL(mail.body.match(/http[^\s]+\/booking\/manage#[^\s]+/)[0]);
  await page.goto(link.pathname + link.hash);
  await page.getByRole('combobox', { name:/Mit szeretnél/ }).selectOption('cancel');
  await page.getByRole('textbox', { name:'Megjegyzés', exact:true }).fill('Megőrzött lemondási indok');
  await page.reload();
  await expect(page.getByRole('combobox', { name:/Mit szeretnél/ })).toHaveValue('cancel');
  await expect(page.getByRole('textbox', { name:'Megjegyzés', exact:true })).toHaveValue('Megőrzött lemondási indok');
  await page.getByRole('button', { name:'Kérelem elküldése', exact:true }).click();
  await expect(page.getByText(/Kérelmed elbírálásra vár/)).toBeVisible();
  expect(await page.evaluate(() => JSON.stringify({ ...sessionStorage }))).not.toContain('Megőrzött lemondási indok');
});
