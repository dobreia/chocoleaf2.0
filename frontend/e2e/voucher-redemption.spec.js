import {test,expect} from '@playwright/test';
const api='http://127.0.0.1:3024/api',origin='http://127.0.0.1:5196';
const billing={buyerType:'private',privateName:'Voucher Buyer',postCode:'1111',city:'Budapest',street:'Teszt utca 1.'};
const options=data=>({headers:{Origin:origin},data});
test('issued vouchers can be redeemed, retained after reload, restored by cancellation and used towards a higher price',async({page})=>{
  await page.goto('/admin');await page.getByLabel('Email',{exact:true}).fill('demo@example.test');await page.getByLabel('Jelszó',{exact:true}).fill('Demo-browser-2026!');
  await page.getByRole('button',{name:'Bejelentkezés',exact:true}).click();await expect(page.getByRole('navigation',{name:'Admin navigáció'})).toBeVisible();
  const created=await page.request.post(api+'/giftcard/start-payment',options({names:['Gift Recipient'],email:'browser-voucher@example.test',quantity:1,amount:19000,billingData:billing,paymentMethod:'transfer'}));expect(created.ok()).toBe(true);
  const order=await created.json();expect((await page.request.post(api+'/giftcard/admin/mark-paid',options({id:order.id}))).ok()).toBe(true);
  const orders=await(await page.request.get(api+'/giftcard/admin/orders')).json(),code=orders.find(o=>o.id===order.id).vouchers[0].code;
  const service=await(await page.request.post(api+'/admin/services',options({title:'Voucher browser course',session_count:2,duration_minutes:90,price:19000,capacity:10}))).json();
  const day=n=>new Date(Date.now()+n*86400000).toISOString().slice(0,10);
  const course=await(await page.request.post(api+'/admin/courses',options({service_id:service.id,sessions:[{start_time:day(600)+'T09:00:00Z'},{start_time:day(602)+'T09:00:00Z'}]}))).json();
  const url=`/courses/${service.id}/book?date=${day(600)}&slot=${course.id}`;
  async function fillGuest(email){
    await page.getByLabel('Név',{exact:true}).fill('Voucher Browser Guest');await page.getByLabel('Email',{exact:true}).fill(email);
    await page.getByLabel('Irányítószám',{exact:true}).fill('1111');await page.getByLabel('Település',{exact:true}).fill('Budapest');await page.getByLabel('Utca, házszám',{exact:true}).fill('Test 1.');
  }
  async function addVoucher(){await page.getByLabel('Utalványszám',{exact:true}).fill(code.toLowerCase());await page.getByRole('button',{name:'Utalvány hozzáadása',exact:true}).click();await expect(page.locator('.booking-voucher-item')).toContainText(code);}
  await page.goto(url);await fillGuest('voucher-browser-first@example.test');
  await page.getByLabel('Utalványszám',{exact:true}).fill('GIFT-XXXXXX-01');await page.getByRole('button',{name:'Utalvány hozzáadása',exact:true}).click();await expect(page.getByRole('alert')).toContainText('nem használható');
  await addVoucher();await expect(page.locator('.booking-vouchers')).toContainText('Fizetendő különbözet: 0');await page.reload();
  await expect(page.locator('.booking-voucher-item')).toContainText(code);await expect(page.getByLabel('Email',{exact:true})).toHaveValue('voucher-browser-first@example.test');
  await page.getByRole('button',{name:'Foglalás ajándékutalvánnyal',exact:true}).click();await expect(page.getByRole('status')).toContainText('A foglalás mentve');
  let bookings=(await(await page.request.get(api+'/admin/bookings?limit=100')).json()).items;
  const first=bookings.find(b=>b.customer_email==='voucher-browser-first@example.test');expect(first.payment_status).toBe('paid');expect(first.status).toBe('pending');
  await page.goto('/admin/bookings');await page.getByLabel('Keresés',{exact:true}).fill(first.customer_email);
  const row=page.locator(`tr[data-booking-id="${first.id}"]`);await expect(row).toContainText(code);await row.getByRole('combobox',{name:'Foglalás állapota',exact:true}).selectOption('cancelled');
  await row.getByRole('button',{name:'Lemondás megerősítése',exact:true}).click();await expect(row.getByRole('combobox',{name:'Foglalás állapota',exact:true})).toHaveValue('cancelled');
  await page.goto('/admin/giftcards');await expect(page.locator('article').filter({hasText:'browser-voucher@example.test'})).toContainText('Az egyszeri módosítási lehetőség felhasználva');
  await page.goto(url);await fillGuest('voucher-browser-second@example.test');
  await page.getByRole('spinbutton',{name:'Létszám',exact:true}).fill('2');await addVoucher();await expect(page.locator('.booking-vouchers')).toContainText(/Fizetendő különbözet: 19\s?000/);
  await page.getByRole('button',{name:'Foglalás és átutalási adatok',exact:true}).click();await page.waitForURL('**/transfer?id=*');
  bookings=(await(await page.request.get(api+'/admin/bookings?limit=100')).json()).items;
  const second=bookings.find(b=>b.customer_email==='voucher-browser-second@example.test');expect(second.total_price).toBe(38000);expect(second.voucher_discount).toBe(19000);
  const info=await(await page.request.get(api+'/transfer-info?id='+second.id)).json();expect(info.amount).toBe(19000);
  // Organizer cancellation remains available after the lifetime customer allowance is spent.
  await page.goto('/admin/bookings');await page.getByLabel('Keresés',{exact:true}).fill(second.customer_email);
  const secondRow=page.locator(`tr[data-booking-id="${second.id}"]`);await secondRow.getByRole('button',{name:'Szervezői lemondás',exact:true}).click();
  await expect(secondRow).toContainText('az egyszeri módosítási lehetőség nem fogy el');await secondRow.getByRole('button',{name:'Lemondás megerősítése',exact:true}).click();
  await expect(secondRow.getByRole('combobox',{name:'Foglalás állapota',exact:true})).toHaveValue('cancelled');
});
