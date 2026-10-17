import {test,expect} from '@playwright/test';

const session=(date,start='10:00',end='12:00')=>({start_time:`${date}T${start}:00+01:00`,end_time:`${date}T${end}:00+01:00`});
const group=(id,sessions)=>({id,service_id:'package-demo',sessions,start_time:sessions[0].start_time,end_time:sessions.at(-1).end_time,price:39000,capacity:6,available_spots:6,is_available:true});
const packages=[
  group('package-a',[session('2030-01-20'),session('2030-01-24')]),
  group('package-b',[session('2030-01-20','14:00','16:00'),session('2030-02-18')]),
  group('package-c',[session('2030-01-25'),session('2030-01-25','14:00','16:00')]),
  group('package-d',[session('2030-02-10'),session('2030-02-17')]),
];
async function open(page){
  await page.route('**/api/courses',r=>r.fulfill({json:[{id:'package-demo',title:'Kétalkalmas csokoládékurzus',session_count:2}]}));
  await page.route('**/api/bookings/availability?**',r=>r.fulfill({json:packages}));
  await page.goto('/courses/package-demo/book?date=2030-01-20');
  await expect(page.locator('.booking-calendar-slot')).toHaveCount(2);
}

test('only start days offer bookings; package cards reveal all dates and selection highlights only its own sessions',async({page},testInfo)=>{
  await page.setViewportSize({width:1440,height:1000});
  await open(page);
  const cards=page.locator('.booking-calendar-slot');
  await expect(cards.locator('.booking-calendar-slot-dates > span')).toHaveCount(4);
  await expect(cards.first()).toContainText('jan. 24.');
  await expect(cards.nth(1)).toContainText('febr. 18.');
  await expect(cards.first()).toContainText('teljes kurzus');
  await expect(page.locator('.booking-calendar-day--package')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'2030-01-24',exact:true})).toBeDisabled();
  await cards.first().click();
  await expect(page.getByRole('button',{name:'2030-01-20',exact:true})).toHaveClass(/day--package/);
  await expect(page.getByRole('button',{name:'2030-01-24',exact:true})).toHaveClass(/day--package/);
  await expect(page.getByRole('button',{name:'2030-01-24',exact:true})).toHaveAttribute('title','A kiválasztott kurzus 2. alkalma');
  // A continuation day keeps the existing package rather than starting a new booking.
  await page.getByRole('button',{name:'2030-01-24',exact:true}).click();
  await expect(cards.first()).toHaveAttribute('aria-pressed','true');
  await cards.nth(1).click();
  await expect(page.getByRole('button',{name:'2030-01-24',exact:true})).not.toHaveClass(/day--package/);
  await expect(page.getByRole('button',{name:'Mutasd a naptárban: 2030-02-18',exact:true})).toBeVisible();
  await page.screenshot({path:testInfo.outputPath('calendar-packages-desktop.png'),fullPage:true});
  await page.getByRole('button',{name:'2030-01-25',exact:true}).click();
  await expect(page.locator('.booking-calendar-slot')).toHaveCount(1);
  await expect(page.locator('.booking-calendar-slot')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('.booking-calendar-day--package')).toHaveCount(1);
  await expect(page.getByRole('button',{name:'2030-01-25',exact:true}).locator('.booking-calendar-day-index')).toHaveText('1,2');
  await page.route('**/api/bookings/availability?**',r=>r.fulfill({json:[...packages,group('new-package',[session('2030-01-25','18:00','20:00'),session('2030-02-20')])]}));
  await page.reload();
  await expect(page.locator('.booking-calendar-slot')).toHaveCount(2);
  await expect(page.locator('.booking-calendar-slot--selected')).toContainText('Kezdés: 10:00');
  await expect(page.getByRole('button',{name:'2030-01-25',exact:true}).locator('.booking-calendar-day-index')).toHaveText('1,2');
  // If the admin moves this package, keep its identity rather than silently
  // choosing a different package that still starts on the original day.
  await page.route('**/api/bookings/availability?**',r=>r.fulfill({json:[
    ...packages.filter(s=>s.id!=='package-c'),
    group('package-c',[session('2030-01-26'),session('2030-01-27')]),
    group('new-package',[session('2030-01-25','18:00','20:00'),session('2030-02-20')]),
  ]}));
  await page.reload();
  await expect(page.getByRole('button',{name:'2030-01-26',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('.booking-calendar-slot--selected')).toContainText('jan. 27.');
});

test('on mobile a cross-month session preserves the full package, billing and payment intent through refresh',async({page},testInfo)=>{
  await page.setViewportSize({width:390,height:844});
  await open(page);
  await page.locator('.booking-calendar-slot').nth(1).click();
  await page.getByLabel('Név',{exact:true}).fill('Megőrzött Vendég');
  await page.getByLabel('Email',{exact:true}).fill('package-browser@example.test');
  await page.getByLabel('Irányítószám',{exact:true}).fill('1111');
  await page.getByLabel('Település',{exact:true}).fill('Budapest');
  await page.getByLabel('Utca, házszám',{exact:true}).fill('Teszt utca 1.');
  const attempts=[];
  await page.route('**/api/bookings',async route=>{
    attempts.push({body:route.request().postDataJSON(),key:route.request().headers()['idempotency-key']});
    await route.fulfill({status:503,json:{message:'Szándékos teszthiba'}});
  });
  await page.getByRole('button',{name:'Foglalás és bankkártyás fizetés',exact:true}).click();
  await expect(page.getByRole('status')).toHaveText('Szándékos teszthiba');
  await page.getByRole('button',{name:'Mutasd a naptárban: 2030-02-18',exact:true}).click();
  await expect(page.locator('.booking-calendar-monthbar h2')).toContainText('február');
  await expect(page.getByRole('button',{name:'2030-02-18',exact:true})).toHaveClass(/day--package/);
  await expect(page.getByRole('button',{name:'2030-02-18',exact:true}).locator('.booking-calendar-day-index')).toHaveText('2');
  await expect(page.getByRole('button',{name:'2030-02-17',exact:true})).toBeDisabled();
  await expect(page.locator('.booking-calendar-slot--selected')).toContainText('14:00');
  await page.reload();
  await expect(page.locator('.booking-calendar-monthbar h2')).toContainText('február');
  await expect(page.getByRole('button',{name:'2030-02-18',exact:true})).toHaveClass(/day--package/);
  await expect(page.getByLabel('Név',{exact:true})).toHaveValue('Megőrzött Vendég');
  await expect(page.getByLabel('Irányítószám',{exact:true})).toHaveValue('1111');
  await page.screenshot({path:testInfo.outputPath('calendar-packages-mobile.png'),fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.getByRole('button',{name:'Foglalás és bankkártyás fizetés',exact:true}).click();
  await expect.poll(()=>attempts.length).toBe(2);
  expect(attempts[0].body.courseId).toBe('package-b');
  expect(attempts[1]).toEqual(attempts[0]);
  await page.getByRole('button',{name:'Mutasd a naptárban: 2030-01-20',exact:true}).click();
  await expect(page.locator('.booking-calendar-monthbar h2')).toContainText('január');
  await page.getByRole('button',{name:'Következő hónap',exact:true}).click();
  await expect(page.locator('.booking-calendar-slot')).toHaveCount(1);
  await expect(page.locator('.booking-calendar-slot--selected')).toContainText('febr. 10.');
});
