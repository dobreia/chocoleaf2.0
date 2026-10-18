import { test, expect } from '@playwright/test';

test('calendar plus creates a course on the chosen day in every view and preserves its draft', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/admin');
  await page.getByLabel('Email', { exact: true }).fill('demo@example.test');
  await page.getByLabel('Jelszó', { exact: true }).fill('Demo-browser-2026!');
  await page.getByRole('button', { name: 'Bejelentkezés', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Admin navigáció' })).toBeVisible();
  await page.goto('/admin/calendar?date=2030-01-15');
  const dialog = page.locator('dialog');
  for (const [view, count] of [['month', 42], ['week', 7], ['day', 1]]) {
    await page.getByRole('combobox', { name: 'Nézet', exact: true }).selectOption(view);
    const buttons = page.locator('.cl-calendar-add');
    await expect(buttons).toHaveCount(count);
    const plus = page.getByRole('button', { name: 'Új kurzusmeghirdetés: 2030-01-15', exact: true });
    await expect(plus).toHaveCSS('background-color', 'rgb(108, 72, 92)');
    await expect(plus).toHaveCSS('color', 'rgb(255, 255, 255)');
    await plus.click();
    await expect(dialog.getByRole('heading')).toHaveText('Új kurzusmeghirdetés');
    await expect(dialog.getByLabel('Kezdés (Budapest)', { exact: true })).toHaveValue('2030-01-15T10:00');
    await dialog.getByRole('button', { name: 'Bezárás', exact: true }).click();
    await expect(dialog).toHaveCount(0);
  }

  const services = await (await page.request.get('/api/admin/services')).json();
  const service = services.find(item => item.active && Number(item.session_count || 1) === 1);
  expect(service).toBeTruthy();
  await page.getByRole('button', { name: 'Új kurzusmeghirdetés: 2030-01-15', exact: true }).click();
  await dialog.getByRole('combobox', { name: 'Szolgáltatás', exact: true }).selectOption(service.id);
  await dialog.getByLabel('Kezdés (Budapest)', { exact: true }).fill('2030-01-15T14:30');
  await page.reload();
  await expect(dialog.getByLabel('Kezdés (Budapest)', { exact: true })).toHaveValue('2030-01-15T14:30');
  await expect(dialog.getByRole('combobox', { name: 'Szolgáltatás', exact: true })).toHaveValue(service.id);
  await expect(dialog.getByLabel('Befejezés (Budapest)', { exact: true })).not.toHaveValue('');
  const saved = page.waitForResponse(response => response.url().endsWith('/api/admin/courses') && response.request().method() === 'POST');
  await dialog.getByRole('button', { name: 'Mentés', exact: true }).click();
  const response = await saved;
  expect(response.ok(), await response.text()).toBe(true);
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.cl-day-courses')).toContainText(service.title);
  await expect(page.locator('.cl-day-courses')).toContainText('14:30');
  await page.reload();
  await expect(dialog).toHaveCount(0);

  await page.getByRole('combobox', { name: 'Nézet', exact: true }).selectOption('month');
  await expect(page.locator('.cl-calendar-add')).toHaveCount(42);
  await page.screenshot({ path: testInfo.outputPath('calendar-create-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('combobox', { name: 'Nézet', exact: true }).selectOption('week');
  await expect(page.locator('.cl-calendar-add')).toHaveCount(7);
  await page.screenshot({ path: testInfo.outputPath('calendar-create-mobile.png'), fullPage: true });
  expect(errors).toEqual([]);
});
