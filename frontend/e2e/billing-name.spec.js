import { test, expect } from '@playwright/test';

const api = 'http://127.0.0.1:3012';

test('billing name follows the booking name until edited and submits the displayed value', async ({ page, request }) => {
  const slots = await (await request.get(api + '/api/bookings/availability')).json();
  const slot = slots[0];
  const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Budapest' }).format(new Date(slot.start_time));
  await page.goto(`/courses/${slot.service_id}/book?date=${date}&slot=${slot.id}`);
  const name = page.getByLabel('Név', { exact: true });
  const billingName = page.getByLabel('Számlázási név', { exact: true });
  await expect(billingName).toBeVisible({ timeout: 15000 });
  await expect(billingName).toHaveValue('');
  await name.fill('Teszt Foglaló');
  await expect(billingName).toHaveValue('Teszt Foglaló');

  // Editing an address must not stop the name from following the booking name.
  await page.getByLabel('Irányítószám', { exact: true }).fill('1111');
  await name.fill('Javított Foglaló');
  await expect(billingName).toHaveValue('Javított Foglaló');
  await name.clear();
  await expect(billingName).toHaveValue('');
  await name.fill('Végleges Foglaló');
  await page.getByLabel('Email', { exact: true }).fill('billing-name@example.test');
  await page.getByLabel('Település', { exact: true }).fill('Budapest');
  await page.getByLabel('Utca, házszám', { exact: true }).fill('Teszt utca 1.');

  const submissions = [];
  await page.route('**/api/bookings', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    submissions.push(route.request().postDataJSON());
    await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'Teszt: nincs fizetésindítás.' }) });
  });
  const submit = page.getByRole('button', { name: 'Foglalás és bankkártyás fizetés' });
  await submit.click();
  await expect.poll(() => submissions.length).toBe(1);
  expect(submissions[0].billingData.privateName).toBe('Végleges Foglaló');
  await expect(submit).toBeEnabled();

  await billingName.fill('Eltérő Számlatulajdonos');
  await name.fill('Másik Kapcsolattartó');
  await expect(billingName).toHaveValue('Eltérő Számlatulajdonos');
  const buyerType = page.getByRole('combobox', { name: /Vásárló típusa/ });
  await buyerType.selectOption('company');
  const companyName = page.getByLabel('Cégnév', { exact: true });
  await expect(companyName).toHaveValue('');
  await companyName.fill('Teszt Kft.');
  await name.fill('Új Kapcsolattartó');
  await expect(companyName).toHaveValue('Teszt Kft.');
  await buyerType.selectOption('private');
  await expect(billingName).toHaveValue('Eltérő Számlatulajdonos');

  // Explicitly clearing a manually edited name must not silently restore it.
  await billingName.clear();
  await name.fill('Újabb Kapcsolattartó');
  await expect(billingName).toHaveValue('');
  await submit.click();
  expect(submissions).toHaveLength(1);
  await billingName.fill('Végleges Számlatulajdonos');
  await submit.click();
  await expect.poll(() => submissions.length).toBe(2);
  expect(submissions[1].billingData.privateName).toBe('Végleges Számlatulajdonos');
});

test('gift recipient names do not prefill the purchaser billing name', async ({ page }) => {
  await page.goto('/giftcard');
  await page.getByLabel('Az utalványon szereplő név', { exact: true }).fill('Megajándékozott');
  await expect(page.getByLabel('Számlázási név', { exact: true })).toHaveValue('');
});

test('company billing email is required and reaches the admin after payment without changing recipients', async ({ page, request }) => {
  await page.route('https://checkout.stripe.com/**', route => route.fulfill({ contentType:'text/html', body:'<h1>Stripe test double</h1>' }));
  const slots = await (await request.get(api + '/api/bookings/availability')).json();
  const slot = slots[0];
  const date = new Intl.DateTimeFormat('sv-SE', { timeZone:'Europe/Budapest' }).format(new Date(slot.start_time));
  await page.goto(`/courses/${slot.service_id}/book?date=${date}&slot=${slot.id}`);
  await page.getByLabel('Név', { exact:true }).fill('Céges Foglaló');
  await page.getByLabel('Email', { exact:true }).fill('company-browser@example.test');
  const buyerType = page.getByRole('combobox', { name:/Vásárló típusa/ });
  await buyerType.selectOption('company');
  await page.getByLabel('Cégnév', { exact:true }).fill('Teszt Kft.');
  await page.getByLabel('Adószám (12345678-1-12)', { exact:true }).fill('12345678-1-12');
  await page.getByLabel('Irányítószám', { exact:true }).fill('1111');
  await page.getByLabel('Település', { exact:true }).fill('Budapest');
  await page.getByLabel('Utca, házszám', { exact:true }).fill('Teszt utca 1.');
  const billingEmail = page.getByLabel('Számlázási e-mail-cím', { exact:true });
  const submit = page.getByRole('button', { name:'Foglalás és bankkártyás fizetés' });
  let submissions = 0;
  page.on('request', req => { if(req.method() === 'POST' && new URL(req.url()).pathname === '/api/bookings') submissions++; });
  await submit.click();
  expect(await billingEmail.evaluate(input => input.validity.valueMissing)).toBe(true);
  expect(submissions).toBe(0);
  await billingEmail.fill('not-an-email');
  await submit.click();
  expect(await billingEmail.evaluate(input => input.validity.typeMismatch)).toBe(true);
  expect(submissions).toBe(0);
  await billingEmail.fill('company-accounts@example.test');
  await buyerType.selectOption('private');
  await expect(billingEmail).toHaveCount(0);
  await buyerType.selectOption('company');
  await expect(billingEmail).toHaveValue('company-accounts@example.test');
  await submit.click();
  await page.waitForURL('https://checkout.stripe.com/**');
  const paymentId = page.url().split('/').at(-1);
  expect((await request.post(api + '/__test/complete/' + paymentId)).ok()).toBe(true);
  const state = await (await request.get(api + '/__test/state')).json();
  const booking = state.bookings.find(b => b.customer_email === 'company-browser@example.test');
  expect(booking).toBeTruthy();
  const mails = state.mail.filter(m => m.body.includes(booking.id));
  expect(mails.find(m => m.recipient === 'admin@example.test').body).toContain('Számlázási e-mail-cím: company-accounts@example.test');
  expect(mails.find(m => m.recipient === 'company-browser@example.test').body).not.toContain('company-accounts@example.test');
  expect(state.mail.some(m => m.recipient === 'company-accounts@example.test')).toBe(false);
});
