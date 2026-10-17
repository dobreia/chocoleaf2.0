import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { MemoryRouter } from 'react-router-dom';
const vite = await createServer({optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},appType:'custom'});
const {default:BillingFields}=await vite.ssrLoadModule('/src/components/BillingFields.jsx');
const {default:PaymentPage}=await vite.ssrLoadModule('/src/pages/PaymentPage.jsx');
const {redirectToStripe,startStripePayment}=await vite.ssrLoadModule('/src/api/payments.js');
const dom = new JSDOM('<div id="root"></div>',{url:'http://localhost/payment'});
globalThis.window=dom.window;globalThis.document=dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const originalFetch=globalThis.fetch;
after(async()=>{globalThis.fetch=originalFetch;dom.window.close();await vite.close();delete globalThis.window;delete globalThis.document;});
test('checkout uses full browser navigation and rejects non-Stripe redirects',()=>{
  const visited=[];
  const location={assign:url=>visited.push(url)};
  redirectToStripe('https://checkout.stripe.com/c/pay/test',location);
  assert.deepEqual(visited,['https://checkout.stripe.com/c/pay/test']);
  for(const url of ['/payment#test','https://example.com','http://checkout.stripe.com','https://checkout.stripe.com.evil.test'])
    assert.throws(()=>redirectToStripe(url,location));
  assert.equal(visited.length,1);
});

test('old and new submit responses go directly to Stripe and checkout errors remain retryable',async()=>{
  const visited=[],requests=[];
  const location={assign:url=>visited.push(url)};
  globalThis.fetch=async(url,options)=>{
    requests.push({url,options});
    return new Response(JSON.stringify({redirectUrl:'https://checkout.stripe.com/c/pay/test'}));
  };
  try {
    await startStripePayment({paymentId:'test',redirectUrl:'/payment#test'},location);
    assert.equal(requests[0].url,'/api/payments/test/checkout');
    assert.equal(requests[0].options.method,'POST');
    await startStripePayment({paymentId:'test',redirectUrl:'https://checkout.stripe.com/c/pay/test'},location);
    assert.equal(requests.length,1);
    assert.deepEqual(visited,Array(2).fill('https://checkout.stripe.com/c/pay/test'));
    globalThis.fetch=async()=>new Response(JSON.stringify({message:'Próbáld újra'}),{status:503});
    await assert.rejects(startStripePayment({paymentId:'test',redirectUrl:'/payment#test'},location),/Próbáld újra/);
    assert.equal(visited.length,2);
  } finally {globalThis.fetch=originalFetch;}
});

test('billing captures a structured address and company tax number without retaining hidden private fields',()=>{
  const markup=renderToStaticMarkup(React.createElement(BillingFields,{value:{buyerType:'company',companyName:'Cég',taxNumber:'12345678-1-12',postCode:'1111',city:'Budapest',street:'Teszt'},onChange(){}}));
  const doc=new JSDOM(markup).window.document;
  assert.equal(doc.querySelectorAll('input[required]').length,5);
  assert.ok(doc.querySelector('input[pattern="[0-9]{4}"]'));
  assert.match(doc.body.textContent,/Adószám/);
  assert.doesNotMatch(doc.body.textContent,/Számlázási név/);
});
async function mount(status) {
  globalThis.fetch=async()=>new Response(JSON.stringify({status,amount:19000,invoiceStatus:'pending'}),{status:200,headers:{'Content-Type':'application/json'}});
  const root=createRoot(document.getElementById('root'));
  await act(async()=>{root.render(React.createElement(MemoryRouter,{initialEntries:['/payment?success=true#12345678-1234-1234-1234-123456789abc']},React.createElement(PaymentPage)));});
  return root;
}
test('return URL cannot claim payment success and a paid order never offers a second charge',async()=>{
  let root=await mount('pending');
  assert.doesNotMatch(document.body.textContent,/Sikeres fizetés/);
  assert.match(document.body.textContent,/Fizetés a Stripe oldalán/);
  await act(async()=>root.unmount());
  root=await mount('paid');
  assert.match(document.body.textContent,/Sikeres fizetés/);
  assert.equal(document.querySelector('button'),null);
  await act(async()=>root.unmount());
});
test('expired order offers a new order instead of a checkout retry',async()=>{
  const root=await mount('expired');
  assert.match(document.body.textContent,/fizetési határidő lejárt/);
  assert.equal(document.querySelector('button'),null);
  await act(async()=>root.unmount());
});
