import {test, expect} from '@playwright/test';

test('course periods default to today and upcoming, combine with service and survive reload',async({page})=>{
  await page.goto('/admin');
  await page.getByLabel('Email',{exact:true}).fill('demo@example.test');
  await page.getByLabel('Jelszó',{exact:true}).fill('Demo-browser-2026!');
  await page.getByRole('button',{name:'Bejelentkezés',exact:true}).click();
  await expect(page.getByRole('navigation',{name:'Admin navigáció'})).toBeVisible();
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Budapest'}).format(new Date());
  const day=offset=>new Date(Date.parse(today+'T09:00:00Z')+offset*86400000).toISOString();
  const course=(id,start,service_id='one')=>({id,title:id,service_id,start_time:start,end_time:start,active:true,capacity:6,price:1000});
  const courses=[course('Future',day(5),'two'),course('Past',day(-8)),course('Today',day(0)),{
    ...course('Ongoing',day(-3)),sessions:[
      {id:'first',start_time:day(-3),end_time:day(-3)},
      {id:'second',start_time:day(2),end_time:day(2)},
    ],
  }];
  await page.route('**/api/admin/courses',route=>route.fulfill({json:courses}));
  await page.route('**/api/admin/services',route=>route.fulfill({json:[{id:'one',title:'First service'},{id:'two',title:'Second service'}]}));
  await page.goto('/admin/courses');
  const period=page.getByRole('combobox',{name:'Időszak',exact:true});
  const service=page.getByRole('combobox',{name:'Szolgáltatás szűrése',exact:true});
  const rows=page.locator('tbody tr');
  await expect(period).toHaveValue('upcoming');
  await expect(rows).toHaveCount(3);
  await expect(rows.first()).toContainText('Ongoing');
  await expect(rows.last()).toContainText('Future');
  await period.selectOption('past');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Past');
  await period.selectOption('all');
  await expect(rows).toHaveCount(4);
  await expect(rows.first()).toContainText('Future');
  await service.selectOption('two');
  await expect(rows).toHaveCount(1);
  await page.reload();
  await expect(period).toHaveValue('all');
  await expect(service).toHaveValue('two');
  await expect(rows).toHaveCount(1);
  await period.selectOption('past');
  await expect(rows).toHaveCount(0);
  await expect(page.getByText('Nincs a szűrésnek megfelelő meghirdetés.',{exact:true})).toBeVisible();
  await page.getByRole('link',{name:'Áttekintés',exact:true}).click();
  await page.getByRole('link',{name:'Időpontok',exact:true}).click();
  await expect(period).toHaveValue('upcoming');
  await expect(service).toHaveValue('');
  await expect(rows).toHaveCount(3);
});
