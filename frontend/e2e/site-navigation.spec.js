import {test,expect} from '@playwright/test';

test('public navigation keeps the home destinations and follows home section links from other pages',async({page})=>{
  const links={
    'Főoldal':'/', 'Rólam':'/#introduction', 'Munkáim':'/gallery', 'Kapcsolat':'/#footer',
    'Ajándékutalvány':'/giftcard', 'Ajánlatkérés':'/#form', 'Képzések':'/courses',
  };
  const services=await(await page.request.get('http://127.0.0.1:3012/api/courses')).json();
  for(const path of ['/','/courses','/courses/'+services[0].id,'/gallery','/giftcard','/contact']){
    await page.goto(path);
    const nav=page.getByRole('navigation',{name:'Fő navigáció',exact:true});
    for(const [name,to] of Object.entries(links))
      await expect(nav.getByRole('link',{name,exact:true})).toHaveAttribute('href',to);
  }
  for(const [name,id] of [['Rólam','introduction'],['Kapcsolat','footer'],['Ajánlatkérés','form']]){
    await page.goto('/courses');
    await page.getByRole('navigation',{name:'Fő navigáció',exact:true}).getByRole('link',{name,exact:true}).click();
    await expect(page).toHaveURL('/#'+id);
    await expect(page.locator('#'+id)).toBeInViewport();
  }
  await page.setViewportSize({width:390,height:844});
  await page.goto('/courses');
  await page.getByRole('button',{name:'Menü megnyitása',exact:true}).click();
  await page.getByRole('navigation',{name:'Fő navigáció',exact:true}).getByRole('link',{name:'Rólam',exact:true}).click();
  await expect(page.locator('#introduction')).toBeInViewport();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
});
