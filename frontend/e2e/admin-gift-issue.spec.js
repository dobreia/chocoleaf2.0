import {test,expect} from '@playwright/test';

async function openGifts(page){
  await page.goto('/admin');
  await page.getByLabel('Email',{exact:true}).fill('demo@example.test');
  await page.getByLabel('Jelszó',{exact:true}).fill('Demo-browser-2026!');
  await page.getByRole('button',{name:'Bejelentkezés',exact:true}).click();
  await expect(page.getByRole('navigation',{name:'Admin navigáció'})).toBeVisible();
  await page.getByRole('link',{name:'Utalványok',exact:true}).click();
}

test('admin issues multiple free vouchers; draft survives reload and issued vouchers appear immediately',async({page})=>{
  await openGifts(page);
  await page.getByRole('button',{name:'+ Utalvány kiállítása',exact:true}).click();
  const form=page.getByRole('dialog',{name:'Ajándékutalvány kiállítása'});
  await expect(form).toBeVisible();
  await expect(form.getByLabel('Utalvány értéke (Ft / db)',{exact:true})).toHaveValue('1000');
  await form.getByLabel('Kézbesítési e-mail-cím').fill('admin-issued-browser@example.test');
  await form.getByLabel('Utalvány értéke (Ft / db)',{exact:true}).fill('12345');
  await form.getByRole('button',{name:'Egy utalvánnyal több'}).click();
  await form.getByLabel('1. utalvány – név',{exact:true}).fill('Első Admin Vendég');
  await form.getByLabel('2. utalvány – név',{exact:true}).fill('Második Admin Vendég');
  await page.reload();
  await expect(form).toBeVisible();
  await expect(form.getByLabel('Kézbesítési e-mail-cím')).toHaveValue('admin-issued-browser@example.test');
  await expect(form.getByLabel('Utalvány értéke (Ft / db)',{exact:true})).toHaveValue('12345');
  await expect(form.getByLabel('2. utalvány – név',{exact:true})).toHaveValue('Második Admin Vendég');
  await expect(form.getByText('Fizetendő: 0 Ft.')).toBeVisible();
  await expect(form.getByRole('button',{name:'Fizetés jóváhagyása és utalványküldés'})).toHaveCount(0);
  await form.getByRole('button',{name:'Kiállítás és e-mail küldése',exact:true}).click();
  await expect(form).not.toBeVisible();
  await expect(page.getByRole('status')).toContainText('Az utalványok elkészültek');
  const card=page.locator('article.cl-card').filter({hasText:'admin-issued-browser@example.test'});
  await expect(card).toContainText('Admin által kiállítva · fizetés nélkül');
  await expect(card).toContainText(/24\s*690 Ft/);
  await expect(card.locator('strong').filter({hasText:/^GIFT-/})).toHaveCount(2);
  const orders=await(await page.request.get('/api/giftcard/admin/orders')).json();
  const issued=orders.filter(order=>order.data.meta.email==='admin-issued-browser@example.test');
  expect(issued).toHaveLength(1);expect(issued[0].data.paidAt).toBeUndefined();expect(issued[0].vouchers).toHaveLength(2);
  await page.getByRole('button',{name:'+ Utalvány kiállítása',exact:true}).click();
  await expect(form.getByLabel('Kézbesítési e-mail-cím')).toHaveValue('');
  await expect(form.getByLabel('Utalvány értéke (Ft / db)',{exact:true})).toHaveValue('1000');
});

test('invalid numeric characters are ignored and cancel or leaving the page clears the draft',async({page})=>{
  await openGifts(page);
  await page.getByRole('button',{name:'+ Utalvány kiállítása',exact:true}).click();
  const form=page.getByRole('dialog',{name:'Ajándékutalvány kiállítása'}),amount=form.getByLabel('Utalvány értéke (Ft / db)',{exact:true});
  for(const invalid of ['-1000','1e4','1000001','1234.5']){await amount.fill(invalid);await expect(amount).toHaveValue('1000');}
  await amount.fill('');await amount.press('Tab');await expect(amount).toHaveValue('1000');
  await form.getByLabel('1. utalvány – név',{exact:true}).fill('Elvetett Vendég');
  await form.getByRole('button',{name:'Mégse',exact:true}).click();
  await page.getByRole('button',{name:'+ Utalvány kiállítása',exact:true}).click();
  await expect(form.getByLabel('1. utalvány – név',{exact:true})).toHaveValue('');
  await form.getByLabel('1. utalvány – név',{exact:true}).fill('Elhagyott Vendég');
  await page.goto('/admin/bookings');await page.goto('/admin/giftcards');
  await expect(form).not.toBeVisible();
  await page.getByRole('button',{name:'+ Utalvány kiállítása',exact:true}).click();
  await expect(form.getByLabel('1. utalvány – név',{exact:true})).toHaveValue('');
});

test('admin manages individual voucher states and keeps deleted serials with their audit without page navigation',async({page})=>{
  await openGifts(page);
  const response=await page.request.post('/api/giftcard/admin/issue',{
    headers:{'Idempotency-Key':crypto.randomUUID()},
    data:{amount:19000,quantity:2,names:['Személyes Beváltás','Törölt Utalvány'],email:'managed-browser@example.test'},
  });
  expect(response.status()).toBe(201);
  const {codes}=await response.json();
  await page.reload();
  const first=page.locator('.cl-gift-voucher').filter({hasText:codes[0]});
  const second=page.locator('.cl-gift-voucher').filter({hasText:codes[1]});
  let navigations=0;
  page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigations++;});
  await first.getByRole('combobox').selectOption('paid');
  await expect(first.getByRole('combobox')).toHaveValue('paid');
  await first.getByText(/Módosítási előzmények/).click();
  await expect(first).toContainText('demo@example.test');
  page.once('dialog',dialog=>dialog.accept());
  await first.getByRole('combobox').selectOption('redeemed');
  await expect(first).toContainText('Személyesen beváltva, újra nem használható');
  page.once('dialog',dialog=>dialog.dismiss());
  await second.getByRole('button',{name:'Utalvány törlése'}).click();
  await expect(second.getByRole('combobox')).toHaveValue('issued');
  page.once('dialog',dialog=>dialog.accept());
  await second.getByRole('button',{name:'Utalvány törlése'}).click();
  await expect(second).toContainText('Törölt utalvány – nem váltható be');
  await expect(second.getByRole('combobox')).toBeEnabled();
  await expect(second.getByRole('combobox')).toHaveValue('deleted');
  await expect(second.getByRole('button',{name:'Utalvány törlése'})).toHaveCount(0);
  await second.getByText(/Módosítási előzmények/).click();
  await expect(second).toContainText('Kiállított → Törölt');
  page.once('dialog',dialog=>dialog.accept());
  await second.getByRole('combobox').selectOption('paid');
  await expect(second.getByRole('combobox')).toHaveValue('paid');
  await expect(second).toContainText('Törölt → Fizetett');
  expect(navigations).toBe(0);
});
