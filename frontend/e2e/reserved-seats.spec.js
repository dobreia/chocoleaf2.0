import {test,expect} from '@playwright/test';
test('external places can be edited; full dates stay visible but cannot be booked',async({page})=>{
  await page.goto('/admin');await page.getByLabel('Email',{exact:true}).fill('demo@example.test');await page.getByLabel('Jelszó',{exact:true}).fill('Demo-browser-2026!');await page.getByRole('button',{name:'Bejelentkezés',exact:true}).click();await expect(page.getByRole('navigation',{name:'Admin navigáció'})).toBeVisible();
  const origin=new URL(page.url()).origin;
  const slots=await (await page.request.get('/api/admin/courses')).json();
  const slot=slots.find(s=>s.active&&s.title==='Csokoládé Alapélmény');
  let response=await page.request.put('/api/admin/courses/'+slot.id,{headers:{Origin:origin},data:{reserved_seats:2}});expect(response.ok()).toBe(true);
  const start=new Date(Date.now()+400*86400000);start.setUTCHours(9,0,0,0);
  response=await page.request.post('/api/admin/courses',{headers:{Origin:origin},data:{service_id:slot.service_id,capacity:6,reserved_seats:6,sessions:[{start_time:start.toISOString()}]}});expect(response.ok()).toBe(true);
  const full=await response.json(),day=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Budapest',year:'numeric',month:'2-digit',day:'2-digit'}).format(start);
  await page.goto('/admin/courses');
  await page.locator('tr').filter({hasText:'Csokoládé Alapélmény'}).first().getByRole('button',{name:'Szerkesztés',exact:true}).click();
  await expect(page.getByLabel('Máshol már lefoglalt helyek',{exact:true})).toHaveValue('2');await page.getByRole('button',{name:'Bezárás',exact:true}).click();
  await page.goto('/courses/'+slot.service_id);await expect(page.locator('.experience-dates')).toContainText('4 szabad hely');
  const fullCard=page.getByLabel('Betelt időpont',{exact:true});await expect(fullCard).toContainText('Betelt');await expect(fullCard.locator('a')).toHaveCount(0);
  await page.goto('/courses/'+slot.service_id+'/book?date='+day+'&slot='+full.id);
  await page.getByRole('button',{name:day,exact:true}).click();
  const fullButton=page.locator('.booking-calendar-slot').filter({hasText:'Betelt'});await expect(fullButton).toBeVisible();await expect(fullButton).toBeDisabled();
});
