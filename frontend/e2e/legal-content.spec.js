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
 const area=page.locator('dialog textarea');await expect(area).toHaveValue(/## 1\. A rendelés menete/);await area.fill((await area.inputValue())+'\n\n## Ellenőrzött szerkesztés\n\nA szerkeszthetőség működik.');
 await page.locator('dialog').getByRole('button',{name:'Mentés',exact:true}).click();await expect(page.locator('dialog')).toHaveCount(0);
 await page.goto('/legal/terms');await expect(page.getByRole('heading',{name:'Ellenőrzött szerkesztés',exact:true})).toBeVisible();
});
