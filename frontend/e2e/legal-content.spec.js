import {test,expect} from '@playwright/test';
test('all four legacy documents render with their formatting, current links and editable admin content',async({page})=>{
 const tracking=[];page.on('request',request=>{if(/pixel\.barion|analytics\.google|facebook\.com\/tr/.test(request.url()))tracking.push(request.url());});
 for(const [slug,title,phrase] of [
  ['imprint','Impresszum','66578921-1-41'],['privacy','Adatkezelési tájékoztató','Az érintettek jogai'],['terms','Rendelési feltételek','Ajándékutalvánnyal foglalt workshop'],['cookies','Sütik (cookie-k) kezelése','Hozzájárulás kezelése']
 ]){
  await page.goto('/legal/'+slug);await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();await expect(page.locator('.legal-document')).toContainText(phrase);await expect(page.locator('.legal-document h2').first()).toBeVisible();
 }
 await expect(page.locator('.legal-document table')).toHaveCount(3);
 await page.setViewportSize({width:390,height:844});await expect(page.locator('.legal-document table').first()).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
 await page.screenshot({path:'test-results/legal-cookies-mobile.png',fullPage:true});
 await page.goto('/legal/privacy');await page.locator('.legal-document').getByRole('link',{name:'Cookie-tájékoztatóban',exact:true}).click();await expect(page).toHaveURL(/\/legal\/cookies$/);
 await page.goto('/legal/terms');await page.locator('.legal-document').getByRole('link',{name:'adatkezelési tájékoztató',exact:true}).click();await expect(page).toHaveURL(/\/legal\/privacy$/);expect(tracking).toEqual([]);
 await page.setViewportSize({width:1280,height:900});await page.goto('/admin');await page.getByLabel('Email',{exact:true}).fill('demo@example.test');await page.getByLabel('Jelszó',{exact:true}).fill('Demo-browser-2026!');await page.getByRole('button',{name:'Bejelentkezés',exact:true}).click();await expect(page.getByRole('navigation',{name:'Admin navigáció'})).toBeVisible();
 await page.getByRole('link',{name:'Oldaltartalmak',exact:true}).click();
 const card=page.locator('article').filter({has:page.getByRole('heading',{name:'Rendelési feltételek',exact:true})});await card.getByRole('button',{name:'Szerkesztés',exact:true}).click();
 const area=page.getByRole('textbox',{name:'Oldal szövege',exact:true});await expect(area).toBeVisible();await expect(area).toContainText('1. A rendelés menete');await expect(page.locator('dialog textarea')).toHaveCount(0);
 await area.click();await area.press('Control+End');await area.press('Enter');await area.pressSequentially('Ellenőrzött szerkesztés');await page.getByLabel('Szövegtípus',{exact:true}).selectOption('2');
 await area.press('End');await area.press('Enter');await page.getByLabel('Szövegtípus',{exact:true}).selectOption('paragraph');await area.pressSequentially('A szerkeszthetőség működik.');
 await page.locator('dialog').getByRole('button',{name:'Mentés',exact:true}).click();await expect(page.locator('dialog')).toHaveCount(0);
 await page.goto('/legal/terms');await expect(page.getByRole('heading',{name:'Ellenőrzött szerkesztés',exact:true})).toBeVisible();
});
test('visual editor handles formatting, links, tables, drafts, failed saves and empty content without losing the document',async({page})=>{
 await page.goto('/admin');await page.getByLabel('Email',{exact:true}).fill('demo@example.test');await page.getByLabel('Jelszó',{exact:true}).fill('Demo-browser-2026!');await page.getByRole('button',{name:'Bejelentkezés',exact:true}).click();await expect(page.getByRole('navigation',{name:'Admin navigáció'})).toBeVisible();
 await page.goto('/admin/content');await page.getByRole('button',{name:'Sütik szerkesztése',exact:true}).click();
 const dialog=page.locator('dialog'),area=page.getByRole('textbox',{name:'Oldal szövege',exact:true});await expect(area).toBeVisible();
 await expect(area.locator('table')).toHaveCount(3);const table=area.locator('table').first(),rows=await table.locator('tr').count();
 await table.locator('td').first().click();await dialog.getByRole('button',{name:'Sor hozzáadása',exact:true}).click();await expect(table.locator('tr')).toHaveCount(rows+1);
 await table.locator('tr').nth(2).locator('td').first().click();await area.pressSequentially('Új sütiszolgáltató');
 await area.press('Control+End');await area.press('Enter');await page.getByLabel('Szövegtípus',{exact:true}).selectOption('paragraph');
 await dialog.getByRole('button',{name:'Félkövér',exact:true}).click();await area.pressSequentially('Vizuális próbaszöveg');await dialog.getByRole('button',{name:'Félkövér',exact:true}).click();
 await expect(area.locator('strong').filter({hasText:'Vizuális próbaszöveg'})).toBeVisible();
 await dialog.getByRole('button',{name:'Visszavonás',exact:true}).click();await expect(area).not.toContainText('Vizuális próbaszöveg');await dialog.getByRole('button',{name:'Ismétlés',exact:true}).click();await expect(area).toContainText('Vizuális próbaszöveg');
 await area.press('End');await area.press('Enter');await dialog.getByRole('button',{name:'Hivatkozás',exact:true}).click();
 await dialog.getByLabel('Megjelenő szöveg',{exact:true}).fill('Új hivatkozás');await dialog.getByLabel('Hivatkozás címe',{exact:true}).fill('javascript:alert(1)');await dialog.getByRole('button',{name:'Hivatkozás alkalmazása',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('érvényes webcímet');
 await dialog.getByLabel('Hivatkozás címe',{exact:true}).fill('/legal/terms');await dialog.getByRole('button',{name:'Hivatkozás alkalmazása',exact:true}).click();await expect(area.locator('a[href="/legal/terms"]').filter({hasText:'Új hivatkozás'})).toBeVisible();
 await page.reload();await expect(area).toContainText('Vizuális próbaszöveg');await expect(area).toContainText('Új sütiszolgáltató');await expect(area.locator('a[href="/legal/terms"]').filter({hasText:'Új hivatkozás'})).toBeVisible();await expect(area.locator('table').first().locator('tr')).toHaveCount(rows+1);
 await page.route('**/api/admin/content/cookies',route=>route.fulfill({status:503,json:{message:'Teszt mentési hiba'}}),{times:1});
 await dialog.getByRole('button',{name:'Mentés',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('Teszt mentési hiba');await expect(area).toContainText('Vizuális próbaszöveg');
 await page.screenshot({path:'test-results/visual-editor.png',fullPage:true});
 await dialog.getByRole('button',{name:'Mentés',exact:true}).click();await expect(dialog).toHaveCount(0);
 await page.goto('/legal/cookies');await expect(page.locator('.legal-document table').first().locator('tr')).toHaveCount(rows+1);await expect(page.locator('.legal-document strong').filter({hasText:'Vizuális próbaszöveg'})).toBeVisible();await expect(page.locator('.legal-document a[href="/legal/terms"]').filter({hasText:'Új hivatkozás'})).toBeVisible();
 await page.goto('/admin/content');await page.getByRole('button',{name:'Impresszum szerkesztése',exact:true}).click();await expect(area).toBeVisible();await area.fill('');await dialog.getByRole('button',{name:'Mentés',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('Írj szöveget');
 await dialog.getByRole('button',{name:'Bezárás',exact:true}).click();await page.getByRole('button',{name:'Impresszum szerkesztése',exact:true}).click();await expect(area).toContainText('Braun Edit');
});
