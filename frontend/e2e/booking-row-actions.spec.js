import { test, expect } from '@playwright/test';
const api = 'http://127.0.0.1:3012';
const options = data => ({ headers: { Origin: 'http://127.0.0.1:5184' }, data });

test.beforeEach(async ({ page }) => {
  await page.goto('/admin');
  await page.getByLabel('Email', { exact: true }).fill('demo@example.test');
  await page.getByLabel('Jelszó', { exact: true }).fill('Demo-browser-2026!');
  await page.getByRole('button', { name: 'Bejelentkezés', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Admin navigáció' })).toBeVisible();
});

async function fixture(page, offset, name) {
  const serviceResponse = await page.request.post(api + '/api/admin/services', options({
    title: name, duration_minutes: 120, price: 19000, capacity: 6, session_count: 2,
  }));
  expect(serviceResponse.ok()).toBe(true);
  const service = await serviceResponse.json();
  const day = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const courseResponse = await page.request.post(api + '/api/admin/courses', options({
    service_id: service.id, sessions: [offset, offset + 2].map(n => ({ start_time: day(n) + 'T09:00:00Z' })),
  }));
  expect(courseResponse.ok()).toBe(true);
  const course = await courseResponse.json();
  const book = async label => {
    const response = await page.request.post(api + '/api/admin/bookings', options({
      courseId: course.id, customerName: label, customerEmail: label.toLowerCase().replaceAll(' ', '-') + '@example.test',
      seats: 1, note: 'Ügyfél megjegyzése',
    }));
    expect(response.ok()).toBe(true);
    return (await response.json()).booking;
  };
  return { service, course, book };
}
const rowFor = (page, id) => page.locator(`tr[data-booking-id="${id}"]`);

test('approving deep in a long list keeps the table mounted and preserves scrolling during background refresh', async ({ page }) => {
  const { service, book } = await fixture(page, 830, 'Stable long booking list');
  const booking = await book('Scroll Guest');
  let holdRefresh = false;
  let releaseRefresh;
  const refreshGate = new Promise(resolve => { releaseRefresh = resolve; });
  let refreshStarted;
  const started = new Promise(resolve => { refreshStarted = resolve; });
  await page.route('**/api/admin/bookings?*', async route => {
    const response = await route.fetch();
    const data = await response.json();
    const selected = data.items.find(item => item.id === booking.id);
    if (selected) {
      data.items = Array.from({ length: 25 }, (_, index) => index === 15 ? selected : {
        ...selected, id: `filler-${index}`, customer_name: `Other guest ${index}`,
      });
      data.total = 75;
    }
    if (holdRefresh) { refreshStarted(); await refreshGate; }
    await route.fulfill({ response, json: data });
  });
  await page.goto('/admin/bookings');
  await page.getByLabel('Keresés', { exact: true }).fill(service.title);
  const row = rowFor(page, booking.id);
  await expect(row).toBeVisible();
  const button = row.getByRole('button', { name: 'Jóváhagyás', exact: true });
  await button.scrollIntoViewIfNeeded();
  const scrollY = await page.evaluate(() => window.scrollY);
  expect(scrollY).toBeGreaterThan(500);
  const table = await page.locator('.cl-table').elementHandle();
  holdRefresh = true;
  await button.click();
  await started;
  await expect(button).toBeDisabled();
  expect(await table.evaluate(element => element.isConnected)).toBe(true);
  expect(Math.abs(await page.evaluate(() => window.scrollY) - scrollY)).toBeLessThanOrEqual(2);
  releaseRefresh();
  await expect(row.locator('.cl-badge')).toHaveText('Visszaigazolt');
  expect(await table.evaluate(element => element.isConnected)).toBe(true);
  expect(Math.abs(await page.evaluate(() => window.scrollY) - scrollY)).toBeLessThanOrEqual(2);
  await expect(page.getByLabel('Keresés', { exact: true })).toHaveValue(service.title);
});

test('approve, reject and delete act on the chosen row without a modal and preserve other bookings and payment data', async ({ page }, testInfo) => {
  const { service, book } = await fixture(page, 800, 'Foglalási sorgombok');
  const first = await book('Row Approved');
  const second = await book('Row Rejected');
  await page.goto('/admin/bookings');
  const search = page.getByLabel('Keresés', { exact: true });
  await search.fill(service.title);
  const firstRow = rowFor(page, first.id), secondRow = rowFor(page, second.id);
  await expect(firstRow).toBeVisible();
  await expect(firstRow.getByRole('button', { name: 'Törlés', exact: true })).toHaveCount(0);
  const patch = page.waitForRequest(request => request.method() === 'PATCH' && request.url().endsWith('/admin/bookings/' + first.id));
  await firstRow.getByRole('button', { name: 'Jóváhagyás', exact: true }).click();
  expect(Object.keys((await patch).postDataJSON()).sort()).toEqual(['status', 'updated_at']);
  await expect(firstRow.locator('.cl-badge')).toHaveText('Visszaigazolt');
  await expect(page.locator('dialog')).toHaveCount(0);
  await expect(secondRow.locator('.cl-badge')).toHaveText('Függőben');
  const saved = await (await page.request.get(api + '/api/admin/bookings/' + first.id)).json();
  for (const key of ['customer_name', 'customer_email', 'seats', 'total_price', 'payment_status', 'note']) expect(saved[key]).toBe(first[key]);
  const state = await (await page.request.get(api + '/__test/state')).json();
  expect(state.mail.filter(mail => mail.calendar?.uid.startsWith(first.id + '.'))).toHaveLength(2);
  await expect(search).toHaveValue(service.title);

  await secondRow.getByRole('button', { name: 'Elutasítás', exact: true }).click();
  await secondRow.getByRole('button', { name: 'Mégse', exact: true }).click();
  await expect(secondRow.locator('.cl-badge')).toHaveText('Függőben');
  await secondRow.getByRole('button', { name: 'Elutasítás', exact: true }).click();
  await secondRow.getByRole('button', { name: 'Elutasítás megerősítése', exact: true }).click();
  await expect(secondRow.locator('.cl-badge')).toHaveText('Lemondva');
  await secondRow.getByRole('button', { name: 'Törlés', exact: true }).click();
  await secondRow.getByRole('button', { name: 'Mégse', exact: true }).click();
  await expect(secondRow).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('booking-actions-desktop.png'), fullPage: true });
  await secondRow.getByRole('button', { name: 'Törlés', exact: true }).click();
  await secondRow.getByRole('button', { name: 'Végleges törlés', exact: true }).click();
  await expect(secondRow).toHaveCount(0);
  await expect(firstRow.locator('.cl-badge')).toHaveText('Visszaigazolt');
});

test('booking list only offers actions, preserves filters on refresh and leaves calendar editors intact', async ({ page }) => {
  const { service, course, book } = await fixture(page, 810, 'Action-only bookings');
  const booking = await book('Action Guest');
  await page.goto('/admin/bookings');
  const search = page.getByLabel('Keresés', { exact: true });
  await search.fill(service.title);
  const row = rowFor(page, booking.id);
  await expect(row).toBeVisible();
  await expect(row.getByRole('button')).toHaveText(['Jóváhagyás', 'Elutasítás']);
  await expect(page.locator('dialog')).toHaveCount(0);
  await expect(page.locator('.cl-booking-editor-row')).toHaveCount(0);
  await page.reload();
  await expect(search).toHaveValue(service.title);
  await expect(row).toBeVisible();

  await page.goto('/admin/calendar?date=' + new Date(course.start_time).toISOString().slice(0, 10));
  await page.locator('.cl-course-event').filter({ hasText: service.title }).first().click();
  await page.getByRole('button', { name: 'Foglalás megnyitása és kezelése', exact: true }).click();
  await expect(page.locator('dialog')).toBeVisible();
  await expect(page.locator('dialog').getByRole('heading', { name: 'Foglalás részletei', exact: true })).toBeVisible();
});

test('stale row approval fails safely; locked payment and paid cancellation cannot bypass existing rules', async ({ page }) => {
  const { service, book } = await fixture(page, 820, 'Foglalási zárolások');
  const booking = await book('Stale Guest');
  await page.goto('/admin/bookings');
  await page.getByLabel('Keresés', { exact: true }).fill(service.title);
  const row = rowFor(page, booking.id);
  await expect(row).toBeVisible();
  expect((await page.request.patch(api + '/api/admin/bookings/' + booking.id, options({ note: 'Időközben módosult' }))).ok()).toBe(true);
  await row.getByRole('button', { name: 'Jóváhagyás', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('A foglalás közben megváltozott');
  expect((await (await page.request.get(api + '/api/admin/bookings/' + booking.id)).json()).status).toBe('pending');

  // These legacy payment states are intentionally view fixtures: current public
  // Stripe checkout does not create a booking before payment succeeds.
  await page.route('**/api/admin/bookings?*', async route => {
    const response = await route.fetch();
    const data = await response.json();
    data.items = data.items.map(item => item.id === booking.id ? { ...item, payment_method: 'stripe', payment_status: 'pending' } : item);
    await route.fulfill({ response, json: data });
  });
  await page.reload();
  await expect(row.getByRole('button', { name: 'Jóváhagyás', exact: true })).toBeDisabled();
  await expect(row.getByRole('button', { name: 'Elutasítás', exact: true })).toBeDisabled();
  await page.unroute('**/api/admin/bookings?*');
  await page.route('**/api/admin/bookings?*', async route => {
    const response = await route.fetch();
    const data = await response.json();
    data.items = data.items.map(item => item.id === booking.id ? { ...item, status: 'cancelled', payment_status: 'paid' } : item);
    await route.fulfill({ response, json: data });
  });
  await page.reload();
  await expect(row.getByRole('button', { name: 'Törlés', exact: true })).toBeDisabled();
  await expect(row).toContainText('csak visszatérítés után törölhető');
});
