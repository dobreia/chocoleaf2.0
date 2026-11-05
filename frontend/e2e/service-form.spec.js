import {test,expect} from '@playwright/test';
const api='http://127.0.0.1:3012/api';
const options=data=>({headers:{Origin:'http://127.0.0.1:5184'},data});
async function login(page){
  await page.goto('/admin');await page.getByLabel('Email',{exact:true}).fill('demo@example.test');await page.getByLabel('Jelszó',{exact:true}).fill('Demo-browser-2026!');
  await page.getByRole('button',{name:'Bejelentkezés',exact:true}).click();await expect(page.getByRole('navigation',{name:'Admin navigáció'})).toBeVisible();
  await page.goto('/admin/services');
}
test('service numeric fields clear, keep drafts and decimals, validate, and save both new and existing services',async({page})=>{
  const title=`Numeric service test ${Date.now()}`;
  await login(page);await page.getByRole('button',{name:'+ Új szolgáltatás',exact:true}).click();
  const dialog=page.locator('dialog'),field=name=>dialog.getByRole('spinbutton',{name,exact:true});
  await dialog.getByRole('textbox',{name:'Név',exact:true}).fill(title);
  for(const name of ['Ár (Ft)','Alkalmak száma','Alap időtartam (óra)','Alap férőhely']){
    await field(name).fill('');await expect(field(name)).toHaveValue('');
  }
  await page.reload();
  for(const name of ['Ár (Ft)','Alkalmak száma','Alap időtartam (óra)','Alap férőhely'])await expect(field(name)).toHaveValue('');
  let submits=0;page.on('request',request=>{if(request.url().endsWith('/api/admin/services')&&request.method()==='POST')submits++;});
  await dialog.getByRole('button',{name:'Mentés',exact:true}).click();expect(submits).toBe(0);
  for(const [name,value] of [['Ár (Ft)','23500'],['Alkalmak száma','2'],['Alap időtartam (óra)','2.75'],['Alap férőhely','8']])await field(name).pressSequentially(value);
  await expect(field('Alap időtartam (óra)')).toHaveValue('2.75');
  await dialog.getByRole('button',{name:'+ Új alkalom hozzáadása',exact:true}).click();await expect(field('Alkalmak száma')).toHaveValue('3');
  for(const [name,invalid,valid] of [['Ár (Ft)','-1','23500'],['Ár (Ft)','12.5','23500'],['Ár (Ft)','10000001','23500'],['Alkalmak száma','101','3'],['Alap férőhely','101','8'],['Alap időtartam (óra)','25','2.75']]){
    await field(name).fill(invalid);expect(await field(name).evaluate(input=>input.checkValidity())).toBe(false);await field(name).fill(valid);
  }
  await page.route('**/api/admin/services',async route=>{if(route.request().method()==='POST')await route.fulfill({status:503,json:{message:'Teszt mentési hiba'}});else await route.continue();},{times:1});
  await dialog.getByRole('button',{name:'Mentés',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('Teszt mentési hiba');
  await expect(field('Ár (Ft)')).toHaveValue('23500');await expect(field('Alap időtartam (óra)')).toHaveValue('2.75');
  const sent=page.waitForRequest(request=>request.url().endsWith('/api/admin/services')&&request.method()==='POST');
  await dialog.getByRole('button',{name:'Mentés',exact:true}).click();
  expect((await sent).postDataJSON()).toMatchObject({price:23500,duration_minutes:165,session_count:3,capacity:8});
  await expect(dialog).toHaveCount(0);
  const service=(await(await page.request.get(api+'/admin/services')).json()).find(s=>s.title===title);
  expect(service).toMatchObject({price:23500,duration_minutes:165,session_count:3,capacity:8});
  const advertised=await page.request.post(api+'/admin/courses',options({service_id:service.id,active:false,sessions:Array.from({length:3},(_,index)=>({start_time:new Date(Date.now()+(1500+index)*86400000).toISOString()}))}));
  expect(advertised.status(),await advertised.text()).toBe(201);
  const advertisement=await advertised.json();
  const card=page.locator('article.cl-card').filter({has:page.getByRole('heading',{name:title,exact:true})});
  await card.getByRole('button',{name:'Szerkesztés',exact:true}).click();
  for(const [name,value] of [['Ár (Ft)','0'],['Alkalmak száma','1'],['Alap időtartam (óra)','0.5'],['Alap férőhely','1']]){await field(name).fill('');await field(name).pressSequentially(value);}
  await dialog.getByRole('textbox',{name:'Leírás',exact:true}).fill('Rövid leírás');
  await dialog.getByRole('textbox',{name:'Részletes leírás',exact:true}).fill('Részletes leírás\nMásodik bekezdés');
  await dialog.getByLabel('Aktív szolgáltatás',{exact:true}).uncheck();
  await dialog.getByRole('button',{name:'Mentés',exact:true}).click();await expect(dialog).toHaveCount(0);
  const saved=(await(await page.request.get(api+'/admin/services')).json()).find(s=>s.id===service.id);
  expect(saved).toMatchObject({price:0,duration_minutes:30,session_count:1,capacity:1,active:false,description:'Rövid leírás',long_description:'Részletes leírás\nMásodik bekezdés'});
  const existing=(await(await page.request.get(api+'/admin/courses')).json()).find(c=>c.id===advertisement.id);expect(existing.sessions).toHaveLength(3);
  await card.getByRole('button',{name:'Szerkesztés',exact:true}).click();await expect(field('Ár (Ft)')).toHaveValue('0');await expect(field('Alap időtartam (óra)')).toHaveValue('0.5');
  await field('Alkalmak száma').fill('99');await dialog.getByRole('button',{name:'+ Új alkalom hozzáadása',exact:true}).click();
  await expect(field('Alkalmak száma')).toHaveValue('100');await expect(dialog.getByRole('button',{name:'+ Új alkalom hozzáadása',exact:true})).toBeDisabled();
  await dialog.getByRole('button',{name:'Bezárás',exact:true}).click();await page.reload();await expect(dialog).toHaveCount(0);
});
test('a finished upload from a closed service editor cannot populate a new service',async({page})=>{
  await login(page);await page.getByRole('button',{name:'+ Új szolgáltatás',exact:true}).click();
  let release,started;
  const gate=new Promise(resolve=>{release=resolve;}),began=new Promise(resolve=>{started=resolve;});
  await page.route('**/api/admin/media',async route=>{started();await gate;const response=await route.fetch();await route.fulfill({response});});
  const dialog=page.locator('dialog');
  await dialog.getByLabel('Kártyakép',{exact:true}).setInputFiles('public/assets/courses/alap.jpg');await began;
  await expect(dialog.getByRole('button',{name:'Mentés',exact:true})).toBeDisabled();
  await dialog.getByRole('button',{name:'Bezárás',exact:true}).click();
  await page.getByRole('button',{name:'+ Új szolgáltatás',exact:true}).click();
  await dialog.getByRole('textbox',{name:'Név',exact:true}).fill('Other editor');
  const finished=page.waitForResponse(response=>response.url().endsWith('/api/admin/media'));
  release();await finished;
  await expect(dialog.getByAltText('Kártyakép',{exact:true})).toHaveCount(0);
  await expect(dialog.getByRole('button',{name:'Mentés',exact:true})).toBeEnabled();
  await dialog.getByLabel('Kártyakép',{exact:true}).setInputFiles('public/assets/courses/alap.jpg');await expect(dialog.getByAltText('Kártyakép',{exact:true})).toBeVisible();
  await dialog.getByRole('button',{name:'Kép eltávolítása',exact:true}).click();await expect(dialog.getByAltText('Kártyakép',{exact:true})).toHaveCount(0);
  await dialog.getByRole('button',{name:'Bezárás',exact:true}).click();
});
