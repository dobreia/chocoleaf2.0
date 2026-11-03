import {test,expect} from '@playwright/test';
const api='http://127.0.0.1:3012/api';
const options=data=>({headers:{Origin:'http://127.0.0.1:5184'},data});
test('Google contacts audience settings, multi-course preview, drafts and recoverable UI errors',async({page})=>{
  await page.goto('/admin');
  await page.getByLabel('Email',{exact:true}).fill('demo@example.test');
  await page.getByLabel('Jelszó',{exact:true}).fill('Demo-browser-2026!');
  await page.getByRole('button',{name:'Bejelentkezés',exact:true}).click();
  await expect(page.getByRole('navigation',{name:'Admin navigáció'})).toBeVisible();
  const courses=[];
  for(const [index,category] of ['Browser Bonbon','Browser Táblás'].entries()){
    const serviceResponse=await page.request.post(api+'/admin/services',options({title:'Google '+category,category:'Közös kategória',duration_minutes:60,session_count:index===0?2:1,price:1000,capacity:20}));
    expect(serviceResponse.ok()).toBe(true);const service=await serviceResponse.json();
    const scheduled=await page.request.post(api+'/admin/courses',options({service_id:service.id,sessions:Array.from({length:service.session_count},(_,n)=>({start_time:new Date(Date.now()+(900+index*10+n)*86400000).toISOString()}))}));
    expect(scheduled.ok()).toBe(true);courses.push(await scheduled.json());
  }
  const book=async(index,name,email)=>{
    const response=await page.request.post(api+'/admin/bookings',options({courseId:courses[index].id,customerName:name,customerEmail:email,seats:1}));
    expect(response.ok()).toBe(true);return(await response.json()).booking;
  };
  await book(0,'Google Alice','google-alice@example.test');await book(1,'Google Alice','google-alice@example.test');
  await book(1,'Google Bob','google-bob@example.test');const cancelled=await book(0,'Google Carol','google-carol@example.test');
  expect((await page.request.patch(api+'/admin/bookings/'+cancelled.id,options({status:'cancelled'}))).ok()).toBe(true);
  await page.getByRole('navigation',{name:'Admin navigáció'}).getByRole('link',{name:'Körlevél / Google',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Körlevél és Google-névjegyek',exact:true})).toBeVisible();
  const mode=page.getByRole('combobox',{name:'Kinek szóljon a körlevél?',exact:true});
  const include=page.getByRole('checkbox',{name:'Lemondott foglalások bevonása a címzettcsoportokba',exact:true});
  await expect(include).not.toBeChecked();await mode.selectOption('courses');
  const bonbon=page.getByRole('checkbox',{name:'Google Browser Bonbon',exact:true}),table=page.getByRole('checkbox',{name:'Google Browser Táblás',exact:true});
  await expect(page.getByRole('checkbox',{name:'Közös kategória',exact:true})).toHaveCount(0);
  await bonbon.check();
  await page.getByRole('button',{name:'Címzettek előnézete',exact:true}).click();
  await expect(page.getByRole('heading',{name:'1 egyedi címzett',exact:true})).toBeVisible();
  await table.check();
  await page.getByRole('button',{name:'Címzettek előnézete',exact:true}).click();
  const preview=page.getByRole('region',{name:'Címzettek előnézete',exact:true});
  await expect(preview.getByRole('heading',{name:'2 egyedi címzett',exact:true})).toBeVisible();
  await expect(preview.getByText('Google Alice · google-alice@example.test',{exact:true})).toHaveCount(1);
  await include.check();await page.getByRole('button',{name:'Címzettek előnézete',exact:true}).click();
  await expect(preview.getByRole('heading',{name:'3 egyedi címzett',exact:true})).toBeVisible();
  await page.reload();await expect(mode).toHaveValue('courses');await expect(include).toBeChecked();await expect(bonbon).toBeChecked();await expect(table).toBeChecked();
  await page.route('**/api/admin/contacts-sync/settings',route=>route.fulfill({status:503,json:{message:'Teszt: átmeneti mentési hiba'}}),{times:1});
  await page.getByRole('button',{name:'Címzettcsoport mentése',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Teszt: átmeneti mentési hiba');await expect(bonbon).toBeChecked();
  await page.getByRole('button',{name:'Címzettcsoport mentése',exact:true}).click();
  await expect(page.getByText('A címzettcsoport beállításai mentve. A Google-címkéket a következő szinkron frissíti.',{exact:true})).toBeVisible();
  await page.reload();await expect(mode).toHaveValue('courses');await expect(include).toBeChecked();await expect(bonbon).toBeChecked();await expect(table).toBeChecked();
  // Only Google account/worker status is simulated; audience and persistence above use the real API/database.
  await page.route('**/api/admin/contacts-sync',async route=>{
    const response=await route.fetch(),data=await response.json();
    await route.fulfill({response,json:{...data,configured:true,connected:true,needsAuth:false,accountEmail:'owner@example.test',
      pending:1,failed:1,issues:[{email:'uncertain@example.test',error:'A Google nem igazolta vissza a létrehozást.',uncertainSince:new Date().toISOString(),retryAt:new Date().toISOString()}]}});
  });
  await page.reload();await expect(page.getByText('Figyelmet igényel',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Nem jött létre a Google-ben – új létrehozás engedélyezése',exact:true}).click();
  const dialog=page.locator('dialog');await expect(dialog).toContainText('különben másolat keletkezhet');
  await dialog.getByRole('button',{name:'Mégse',exact:true}).click();await expect(dialog).toHaveCount(0);
  await page.getByRole('button',{name:'Leválasztás',exact:true}).click();
  await expect(dialog).toContainText('Google-ben lévő névjegyek és címkék megmaradnak');await dialog.getByRole('button',{name:'Mégse',exact:true}).click();
  await page.route('**/api/admin/contacts-sync/connect',route=>route.fulfill({json:{url:'http://127.0.0.1:5184/admin/customer-sync?google=denied'}}));
  await page.getByRole('button',{name:'Google-kapcsolat megújítása',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Az összekapcsolást megszakítottad');
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
  await page.screenshot({path:'test-results/contacts-sync-mobile.png',fullPage:true});
});
