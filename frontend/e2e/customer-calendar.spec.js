import { test, expect } from '@playwright/test';

test('admin confirmation, a moved session and cancellation queue numbered calendar invitations and revisions', async ({ page }) => {
  const api = 'http://127.0.0.1:3012';
  const options = data => ({ headers: { Origin: 'http://127.0.0.1:5184' }, data });
  await page.goto('/admin');
  await page.getByLabel('Email', { exact: true }).fill('demo@example.test');
  await page.getByLabel('Jelszó', { exact: true }).fill('Demo-browser-2026!');
  await page.getByRole('button', { name: 'Bejelentkezés', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Admin navigáció' })).toBeVisible();
  const serviceResponse = await page.request.post(api + '/api/admin/services', options({
    title: 'F09 naptármeghívós kurzus', duration_minutes: 120, price: 19000, capacity: 6, session_count: 2,
  }));
  expect(serviceResponse.ok()).toBe(true);
  const service = await serviceResponse.json();
  const day = offset => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
  const courseResponse = await page.request.post(api + '/api/admin/courses', options({
    service_id: service.id, sessions: [310, 312].map(offset => ({ start_time: day(offset) + 'T09:00:00Z' })),
  }));
  expect(courseResponse.ok()).toBe(true);
  const course = await courseResponse.json();
  const bookingResponse = await page.request.post(api + '/api/admin/bookings', options({
    courseId: course.id, customerName: 'Naptár Vendég', customerEmail: 'calendar-browser@example.test', seats: 1,
  }));
  expect(bookingResponse.ok()).toBe(true);
  const { booking } = await bookingResponse.json();
  const invites = async () => (await (await page.request.get(api + '/__test/state')).json()).mail
    .filter(mail => mail.calendar?.uid.startsWith(booking.id + '.'));
  expect(await invites()).toHaveLength(0);
  const dialog = page.locator('dialog');
  await page.goto('/admin/bookings?booking=' + booking.id);
  await dialog.getByRole('combobox', { name: 'Foglalás státusza', exact: true }).selectOption('confirmed');
  await dialog.getByRole('button', { name: 'Mentés', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  let messages = await invites();
  expect(messages).toHaveLength(2);
  expect(messages.every(mail => mail.recipient === booking.customer_email && mail.calendar.method === 'REQUEST')).toBe(true);
  for (const index of [1, 2]) expect(messages.some(mail => mail.subject.includes(`${index}/2. alkalom`))).toBe(true);
  const oldUid = messages.find(mail => mail.subject.includes('2/2. alkalom')).calendar.uid;

  await page.goto('/admin/courses');
  await page.getByRole('row').filter({ hasText: service.title }).getByRole('button', { name: 'Szerkesztés', exact: true }).click();
  await dialog.getByLabel('2. alkalom kezdése (Budapest)', { exact: true }).fill(day(313) + 'T11:00');
  await dialog.getByLabel('2. alkalom befejezése (Budapest)', { exact: true }).fill(day(313) + 'T13:00');
  await dialog.getByRole('button', { name: 'Mentés', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  messages = await invites();
  expect(messages).toHaveLength(2);
  const changed = messages.find(mail => mail.calendar.uid === oldUid);
  expect(changed.calendar.sequence).toBe(1);
  expect(changed.calendar.content).toContain('METHOD:REQUEST');

  await page.goto('/admin/bookings?booking=' + booking.id);
  await dialog.getByRole('combobox', { name: 'Foglalás státusza', exact: true }).selectOption('cancelled');
  await dialog.getByRole('button', { name: 'Mentés', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  messages = await invites();
  expect(messages).toHaveLength(2);
  expect(messages.every(mail => mail.calendar.method === 'CANCEL')).toBe(true);
  expect(messages.find(mail => mail.calendar.uid === oldUid).calendar.sequence).toBe(2);
});
