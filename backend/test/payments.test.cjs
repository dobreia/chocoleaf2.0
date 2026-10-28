const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const Stripe = require('stripe');
Object.assign(process.env, {
  PAYMENT_PROVIDER: 'stripe', STRIPE_SECRET_KEY: 'sk_test_local_only', STRIPE_WEBHOOK_SECRET: 'whsec_local_only',
  BILLINGO_API_KEY: 'local_only', BILLINGO_BLOCK_ID: '1', BILLINGO_BOOKING_VAT: 'AAM', BILLINGO_GIFT_VAT: '27%',
  BILLINGO_BOOKING_DOCUMENT_TYPE: 'advance', BILLINGO_GIFT_DOCUMENT_TYPE: 'invoice',
  FRONTEND_URL: 'http://localhost:5173', MAIL_ADMIN: '', MAIL_FROM: '',
});
let pool, server, base, providers, orders, bookings, courseId;
const billing = { buyerType:'private', privateName:'Teszt Vásárló', postCode:'1111', city:'Budapest', street:'Teszt utca 1.' };
const companyBilling = { ...billing, buyerType:'company', companyName:'Teszt Kft.', taxNumber:'12345678-1-12', billingEmail:' Accounts@Example.Test ' };
const sessions = new Map();
let createCalls = [];
const sdk = new Stripe('sk_test_local_only');
const stripeMock = {
  webhooks: sdk.webhooks,
  checkout: { sessions: {
    create: async (body, options) => {
      createCalls.push({ body, options });
      if (sessions.has(options.idempotencyKey)) return sessions.get(options.idempotencyKey);
      const session = { id:'cs_test_' + randomUUID(), url:'https://checkout.stripe.com/c/pay/test',
        status:'open', payment_status:'unpaid', amount_total:body.line_items[0].price_data.unit_amount,
        currency:'huf', metadata:body.metadata, client_reference_id:body.client_reference_id, mode:'payment' };
      sessions.set(options.idempotencyKey, session); return session;
    },
    retrieve: async id => [...sessions.values()].find(x=>x.id===id),
    list: async function* () { yield* sessions.values(); },
  } },
};
before(async () => {
  pool = await require('./database.cjs')();
  await require('../src/migrate')();
  providers = require('../src/payments/providers'); providers.stripe = () => stripeMock;
  // Exercise the preserved Stripe implementation independently of this branch's transfer default.
  providers.provider=()=> 'stripe';
  orders = require('../src/payments/orders'); bookings = require('../src/domain/bookings');
  const service = (await pool.query('SELECT id FROM services LIMIT 1')).rows[0];
  courseId = (await pool.query("INSERT INTO courses(title,price,capacity,start_time,end_time,service_id) VALUES('Teszt',19000,100,now()+interval '10 days',now()+interval '10 days 1 hour',$1) RETURNING id", [service.id])).rows[0].id;
  server = require('../src/index').listen(0);
  await new Promise(r=>server.on('listening',r)); base='http://localhost:' + server.address().port;
});
after(async()=>{await new Promise(r=>server.close(r));await pool.end();});
async function newBooking() {
  const key=randomUUID();
  const data = {courseId,customerName:'Teszt',customerEmail:key+'@example.test',seats:2,paymentMethod:'stripe',billingData:billing};
  return { ...(await bookings.create(data,key)), key, data };
}
async function row(id) {return (await pool.query('SELECT * FROM payment_orders WHERE id=$1',[id])).rows[0];}
async function webhook(session, type='checkout.session.completed', signature=true) {
  const payload=JSON.stringify({id:'evt_'+randomUUID(),object:'event',type,data:{object:session}});
  return fetch(base+'/api/payments/webhook',{method:'POST',headers:{'Content-Type':'application/json',
    'stripe-signature':signature?sdk.webhooks.generateTestHeaderString({payload,secret:process.env.STRIPE_WEBHOOK_SECRET}):'invalid'},body:payload});
}
test('Stripe requires complete configuration and structured billing before reserving seats', async()=>{
  const saved=process.env.BILLINGO_BOOKING_VAT; delete process.env.BILLINGO_BOOKING_VAT;
  try {await assert.rejects(newBooking(),{status:503});} finally {process.env.BILLINGO_BOOKING_VAT=saved;}
  assert.throws(()=>providers.billingData({...billing,postCode:'bad'}),{status:400});
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM bookings')).rows[0].n,0);
});
test('local test mode requires a test key, development and loopback; paid test orders never call Billingo',async()=>{
  const saved={NODE_ENV:process.env.NODE_ENV,PAYMENT_LOCAL_TEST:process.env.PAYMENT_LOCAL_TEST,STRIPE_SECRET_KEY:process.env.STRIPE_SECRET_KEY,FRONTEND_URL:process.env.FRONTEND_URL};
  const originalBillingo=providers.billingo;
  try {
    Object.assign(process.env,{NODE_ENV:'development',PAYMENT_LOCAL_TEST:'1'});
    assert.deepEqual(providers.configuration('booking'),{mode:'local-test'});
    process.env.NODE_ENV='production';assert.throws(()=>providers.configuration('booking'),{status:503});
    process.env.NODE_ENV='development';process.env.STRIPE_SECRET_KEY='sk_live_forbidden';assert.throws(()=>providers.configuration('booking'),{status:503});
    process.env.STRIPE_SECRET_KEY=saved.STRIPE_SECRET_KEY;process.env.FRONTEND_URL='https://example.com';assert.throws(()=>providers.configuration('booking'),{status:503});
    process.env.FRONTEND_URL=saved.FRONTEND_URL;
    const b=await newBooking();await orders.checkout(b.paymentId);
    await orders.applySession({...sessions.get('checkout-'+b.paymentId),payment_status:'paid'});
    providers.billingo=async()=>{assert.fail('Local test must never issue an invoice');};
    await orders.invoice(await row(b.paymentId));
    assert.equal((await row(b.paymentId)).invoice_status,'skipped');
    assert.equal((await row(b.paymentId)).invoice_id,null);
    assert.ok((await row(b.paymentId)).booking_id);
  } finally {
    providers.billingo=originalBillingo;
    for(const [k,v] of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v;}
  }
});
test('trusted admin creation retains manual bookings while public callers cannot choose transfer',async()=>{
  const data={courseId,customerName:'Admin vendég',customerEmail:'manual@example.test',seats:1};
  const manual=await bookings.create(data,randomUUID(),{manual:true});
  assert.equal(manual.booking.payment_method,'transfer');assert.equal(manual.paymentId,undefined);
  await assert.rejects(bookings.create({...data,paymentMethod:'transfer'},randomUUID()),{status:400});
});
test('both public products stay Stripe-only even with the old transfer environment setting',async()=>{
  process.env.PAYMENT_PROVIDER='transfer';
  try {
    assert.equal(providers.provider(),'stripe');
    const config=await(await fetch(base+'/api/payments/config')).json();assert.equal(config.provider,'stripe');
    const r=await fetch(base+'/api/giftcard/start-payment',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({paymentMethod:'transfer'})});
    assert.equal(r.status,400);
  } finally {process.env.PAYMENT_PROVIDER='stripe';}
});
test('concurrent checkout intents protect the last seat without appearing as bookings',async()=>{
  const service=(await pool.query('SELECT service_id FROM courses WHERE id=$1',[courseId])).rows[0].service_id;
  const slot=(await pool.query("INSERT INTO courses(title,price,capacity,start_time,end_time,service_id) VALUES('Utolsó hely',19000,1,now()+interval '20 days',now()+interval '20 days 1 hour',$1) RETURNING *",[service])).rows[0];
  const create=i=>bookings.create({courseId:slot.id,customerName:'Vendég',customerEmail:`last${i}@example.test`,seats:1,billingData:billing},randomUUID());
  const results=await Promise.allSettled([create(1),create(2)]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
  const payment=results.find(x=>x.status==='fulfilled').value;
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM bookings WHERE course_id=$1',[slot.id])).rows[0].n,0);
  const availability=await(await fetch(base+'/api/bookings/availability')).json();
  assert.equal(availability.find(x=>x.id===slot.id).available_spots,0);
  await assert.rejects(require('../src/domain/courses').save(slot.id,{active:false}),{status:409});
  await orders.checkout(payment.paymentId);
  await orders.applySession({...sessions.get('checkout-'+payment.paymentId),status:'expired'});
  const fresh=await(await fetch(base+'/api/bookings/availability')).json();
  assert.equal(fresh.find(x=>x.id===slot.id).available_spots,1);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM bookings WHERE course_id=$1',[slot.id])).rows[0].n,0);
  const retry=await create(3);await orders.checkout(retry.paymentId);
  await Promise.all([orders.applySession({...sessions.get('checkout-'+retry.paymentId),payment_status:'paid'}),orders.applySession({...sessions.get('checkout-'+retry.paymentId),payment_status:'paid'})]);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM bookings WHERE course_id=$1',[slot.id])).rows[0].n,1);
});
test('server price, booking idempotency, changed billing rejection and checkout HUF amount',async()=>{
  const beforeCount=(await pool.query('SELECT count(*)::int AS n FROM bookings')).rows[0].n;
  const beforeMail=(await pool.query('SELECT count(*)::int AS n FROM outbox')).rows[0].n;
  const b=await newBooking();
  assert.equal(b.booking,undefined);
  assert.equal((await row(b.paymentId)).booking_id,null);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM bookings')).rows[0].n,beforeCount);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM outbox')).rows[0].n,beforeMail);
  assert.equal((await row(b.paymentId)).amount,38000);
  assert.equal((await bookings.create(b.data,b.key)).paymentId,b.paymentId);
  await assert.rejects(bookings.create({...b.data,billingData:{...billing,street:'Más utca'}},b.key),{status:409});
  const result=await orders.checkout(b.paymentId);
  assert.equal(result.redirectUrl,'https://checkout.stripe.com/c/pay/test');
  assert.equal(createCalls.at(-1).body.line_items[0].price_data.unit_amount,3800000);
  assert.equal(createCalls.at(-1).body.success_url,'http://localhost:5173/payment#'+b.paymentId);
  const count=createCalls.length;await orders.checkout(b.paymentId);assert.equal(createCalls.length,count);
  // Simulate losing the database write after Stripe created the session.
  await pool.query('UPDATE payment_orders SET stripe_session_id=NULL,checkout_url=NULL WHERE id=$1',[b.paymentId]);
  await orders.checkout(b.paymentId);
  assert.equal(createCalls.at(-1).options.idempotencyKey,createCalls.at(-2).options.idempotencyKey);
  assert.deepEqual(createCalls.at(-1).body,createCalls.at(-2).body);
});
test('invalid webhook signature, unpaid and wrong amounts cannot mark a booking paid',async()=>{
  const b=await newBooking();await orders.checkout(b.paymentId);
  const session=sessions.get('checkout-'+b.paymentId);
  assert.equal((await webhook({...session,payment_status:'paid'},undefined,false)).status,400);
  assert.equal((await webhook(session)).status,200);
  assert.equal((await row(b.paymentId)).status,'pending');
  assert.equal((await webhook({...session,payment_status:'paid',amount_total:1})).status,409);
  assert.equal((await row(b.paymentId)).status,'pending');
  assert.equal((await fetch(base+'/api/payments/admin/orders')).status,401);
});
test('paid webhook is idempotent; late expiry cannot reverse payment; admin cannot override Stripe',async()=>{
  const b=await newBooking();await orders.checkout(b.paymentId);
  const session={...sessions.get('checkout-'+b.paymentId),payment_status:'paid',status:'complete'};
  const count=(await pool.query('SELECT count(*)::int AS n FROM outbox')).rows[0].n;
  assert.equal((await webhook(session)).status,200);
  assert.equal((await webhook(session)).status,200);
  assert.equal((await webhook({...session,payment_status:'unpaid',status:'expired'},'checkout.session.expired')).status,200);
  assert.equal((await row(b.paymentId)).status,'paid');
  const bookingId=(await row(b.paymentId)).booking_id;
  assert.ok(bookingId);
  const saved=(await pool.query('SELECT * FROM bookings WHERE id=$1',[bookingId])).rows[0];
  assert.equal(saved.payment_status,'paid');assert.equal(saved.status,'pending');
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM outbox')).rows[0].n,count+1);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM bookings WHERE request_key=$1',[b.key])).rows[0].n,1);
  const mail=(await pool.query('SELECT body FROM outbox WHERE recipient=$1',[b.data.customerEmail])).rows[0].body;
  assert.match(mail,/booking\/manage#/);
  await assert.rejects(bookings.update(bookingId,{payment_status:'pending'}),{status:409});
  await assert.rejects(bookings.update(bookingId,{seats:1}),{status:409});
  const response=await fetch(base+'/api/payments/'+b.paymentId);const publicData=await response.json();
  assert.equal(publicData.status,'paid');assert.equal(publicData.email,undefined);assert.equal(publicData.billing,undefined);
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM outbox WHERE calendar->>'uid' LIKE $1",[bookingId+'.%'])).rows[0].n,0);
  await bookings.update(bookingId,{status:'confirmed'});
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM outbox WHERE calendar->>'uid' LIKE $1",[bookingId+'.%'])).rows[0].n,1);
  await webhook(session);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM outbox WHERE calendar->>'uid' LIKE $1",[bookingId+'.%'])).rows[0].n,1);
});
test('admin records an already completed Stripe refund without changing checkout history or allowing other payment overrides',async()=>{
  const result=await newBooking();await orders.checkout(result.paymentId);
  const session={...sessions.get('checkout-'+result.paymentId),payment_status:'paid',status:'complete'};
  await orders.applySession(session);
  const bookingId=(await row(result.paymentId)).booking_id;
  await bookings.update(bookingId,{status:'confirmed'});
  const cancelled=await bookings.update(bookingId,{status:'cancelled'});
  await assert.rejects(bookings.update(bookingId,{payment_status:'failed'}),{status:409});
  await assert.rejects(bookings.update(bookingId,{payment_status:'refunded',updated_at:'2000-01-01T00:00:00Z'}),{status:409});
  const refunded=await bookings.update(bookingId,{payment_status:'refunded',updated_at:cancelled.updated_at});
  assert.equal(refunded.payment_status,'refunded');assert.equal(refunded.status,'cancelled');
  assert.equal(refunded.total_price,cancelled.total_price);assert.equal(refunded.seats,cancelled.seats);
  assert.equal((await row(result.paymentId)).status,'paid');
  await orders.applySession(session);
  assert.equal((await pool.query('SELECT payment_status FROM bookings WHERE id=$1',[bookingId])).rows[0].payment_status,'refunded');
  await assert.rejects(bookings.update(bookingId,{payment_status:'paid'}),{status:409});
  const legacy=await bookings.create({courseId,customerName:'Legacy',customerEmail:randomUUID()+'@example.test',seats:1},randomUUID(),{manual:true});
  await pool.query("UPDATE bookings SET payment_method='stripe' WHERE id=$1",[legacy.booking.id]);
  await assert.rejects(bookings.update(legacy.booking.id,{payment_status:'refunded'}),{status:409});
  await assert.rejects(bookings.update(legacy.booking.id,{payment_status:'paid'}),{status:409});
});

test('expired checkout releases its hold without ever saving an unpaid booking',async()=>{
  const b=await newBooking();await orders.checkout(b.paymentId);
  await orders.applySession({...sessions.get('checkout-'+b.paymentId),status:'expired'});
  assert.equal((await row(b.paymentId)).status,'expired');
  assert.equal((await row(b.paymentId)).booking_id,null);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM bookings WHERE request_key=$1',[b.key])).rows[0].n,0);
  await assert.rejects(orders.checkout(b.paymentId),{status:409});
});
test('delayed first checkout persists a fresh Stripe expiry and reuses it for retries',async()=>{
  const b=await newBooking();
  await pool.query("UPDATE payment_orders SET expires_at=now()+interval '5 minutes' WHERE id=$1",[b.paymentId]);
  await orders.checkout(b.paymentId);
  const saved=await row(b.paymentId);
  assert.ok(new Date(saved.stripe_expires_at).getTime()>Date.now()+30*60000);
  assert.equal(createCalls.at(-1).body.expires_at,Math.floor(new Date(saved.stripe_expires_at).getTime()/1000));
});
test('Billingo lost create response recovers by vendor id and queues a single invoice email',async()=>{
  const b=await newBooking();await orders.checkout(b.paymentId);
  await orders.applySession({...sessions.get('checkout-'+b.paymentId),payment_status:'paid'});
  let remote=null, creates=0;
  providers.billingo=async(path,body)=>{
    if(path.startsWith('/documents/vendor/'))return remote;
    if(path==='/partners'){assert.equal(body.address.post_code,'1111');assert.equal(body.tax_type,'NO_TAX_NUMBER');return{id:10};}
    if(path==='/documents'){
      creates++;assert.equal(body.vendor_id,'chocoleaf-'+b.paymentId);assert.equal(body.items[0].unit_price,38000);
      assert.equal(body.items[0].vat,'AAM');assert.equal(body.type,'advance');assert.equal(body.paid,true);
      remote={id:42};throw new Error('lost response');
    }
    if(path==='/documents/42/public-url')return{public_url:'https://app.billingo.hu/test-invoice'};
    throw new Error('unexpected '+path);
  };
  await assert.rejects(orders.invoice(await row(b.paymentId)),/lost response/);
  assert.equal((await row(b.paymentId)).status,'paid');
  await orders.invoice(await row(b.paymentId));await orders.invoice(await row(b.paymentId));
  assert.equal(creates,1);assert.equal((await row(b.paymentId)).invoice_status,'sent');
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM outbox WHERE recipient=$1 AND subject='ChocoLeaf – számlád elkészült'",[b.data.customerEmail])).rows[0].n,1);
});
test('booking submit returns Stripe directly and retries a provider failure without duplicating the draft',async()=>{
  const key=randomUUID();
  const body={courseId,customerName:'Redirect',customerEmail:key+'@example.test',seats:1,billingData:billing,paymentMethod:'stripe'};
  const send=()=>fetch(base+'/api/bookings',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(body)});
  const original=stripeMock.checkout.sessions.create;
  stripeMock.checkout.sessions.create=async()=>{throw new Error('Simulated Stripe outage');};
  try {assert.equal((await send()).status,500);} finally {stripeMock.checkout.sessions.create=original;}
  const response=await send();assert.equal(response.status,201);
  const first=await response.json(),again=await(await send()).json();
  assert.equal(first.redirectUrl,'https://checkout.stripe.com/c/pay/test');
  assert.equal(again.paymentId,first.paymentId);
  assert.equal(again.redirectUrl,first.redirectUrl);
  assert.equal((await row(first.paymentId)).booking_id,null);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM payment_orders WHERE request_key=$1',[key])).rows[0].n,1);
});

test('gift checkout is idempotent and unpaid Stripe gift cannot be manually fulfilled',async()=>{
  const key=randomUUID(),body={email:'gift@example.test',amount:19000,quantity:2,names:['A','B'],billingData:billing,paymentMethod:'stripe'};
  const send=()=>fetch(base+'/api/giftcard/start-payment',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(body)});
  const first=await(await send()).json(),second=await(await send()).json();
  assert.ok(first.paymentId);assert.equal(first.paymentId,second.paymentId);
  assert.equal(first.redirectUrl,'https://checkout.stripe.com/c/pay/test');
  assert.equal(second.redirectUrl,first.redirectUrl);
  await assert.rejects(require('../src/domain/gifts').fulfill(first.id,true),{status:409});
  assert.equal((await fetch(base+'/api/transfer-info?id='+first.id)).status,409);
  await orders.checkout(first.paymentId);
  await orders.applySession({...sessions.get('checkout-'+first.paymentId),payment_status:'paid'});
  assert.ok((await pool.query('SELECT data FROM gift_orders WHERE id=$1',[first.id])).rows[0].data.paidAt);
  const oldAdmin=process.env.MAIL_ADMIN;
  process.env.MAIL_ADMIN='gift-admin@example.test';
  try {
    await require('../src/domain/gifts').fulfill(first.id,false);
    await require('../src/domain/gifts').fulfill(first.id,false);
    const mails=(await pool.query('SELECT * FROM outbox WHERE body LIKE $1',['%'+first.id+'%'])).rows;
    const customer=mails.filter(x=>x.recipient===body.email && x.attachments.length);
    assert.equal(customer.length,1);assert.equal(customer[0].attachments.length,2);
    for(const attachment of customer[0].attachments) assert.equal(Buffer.from(attachment.content,'base64').subarray(0,4).toString(),'%PDF');
    assert.equal(mails.filter(x=>x.recipient==='gift-admin@example.test').length,1);
  } finally {process.env.MAIL_ADMIN=oldAdmin;}
});
test('company billing email is required, validated and ignored for private buyers',()=>{
  assert.equal(providers.billingData(companyBilling).billingEmail,'accounts@example.test');
  for (const billingEmail of [undefined,'','   ','not-an-email','a@example.test\nBcc: other@example.test','a'.repeat(255)+'@example.test'])
    assert.throws(()=>providers.billingData({...companyBilling,billingEmail}),{status:400});
  assert.equal(Object.hasOwn(providers.billingData({...billing,billingEmail:'ignored@example.test'}),'billingEmail'),false);
});

test('background reconciliation expires abandoned orders and recovers a paid session after a lost local write',async()=>{
  // Keep other test fixtures out of this worker pass.
  await pool.query("UPDATE payment_orders SET next_attempt=now()+interval '1 day'");
  const abandoned=await newBooking(),recovered=await newBooking();
  await orders.checkout(recovered.paymentId);
  const remote=sessions.get('checkout-'+recovered.paymentId);remote.payment_status='paid';remote.status='complete';
  await pool.query("UPDATE payment_orders SET stripe_session_id=NULL,checkout_url=NULL,expires_at=now()-interval '3 minutes' WHERE id IN ($1,$2)",[abandoned.paymentId,recovered.paymentId]);
  providers.billingo=async(path)=>{
    if(path.startsWith('/documents/vendor/'))return{id:99};
    if(path==='/documents/99/public-url')return{public_url:'https://app.billingo.hu/recovered'};
    throw new Error('unexpected '+path);
  };
  // PGlite's test adapter serializes connections; emulate only the dedicated session lock connection.
  // With TEST_DATABASE_URL, the actual PostgreSQL advisory lock is exercised instead.
  const connect=pool.connect;
  if(!process.env.TEST_DATABASE_URL){
    let first=true;
    pool.connect=async()=>{
      if(first){first=false;return{query:async()=>({rows:[{acquired:true}]}),release(){}};}
      return connect();
    };
  }
  try {await orders.work();} finally {pool.connect=connect;}
  assert.equal((await row(abandoned.paymentId)).status,'expired');
  assert.equal((await row(recovered.paymentId)).status,'paid');
  assert.equal((await row(recovered.paymentId)).invoice_status,'sent');
});

test('company billing email persists and is shown only in the admin booking notice',async()=>{
  const oldAdmin=process.env.MAIL_ADMIN;
  process.env.MAIL_ADMIN='company-admin@example.test';
  try {
    const key=randomUUID();
    const data={courseId,customerName:'Céges Foglaló',customerEmail:'company-contact@example.test',seats:1,billingData:companyBilling};
    await assert.rejects(bookings.create({...data,billingData:{...companyBilling,billingEmail:''}},randomUUID()),{status:400});
    const result=await bookings.create(data,key);
    assert.equal((await row(result.paymentId)).billing.billingEmail,'accounts@example.test');
    assert.equal((await bookings.create(data,key)).paymentId,result.paymentId);
    await assert.rejects(bookings.create({...data,billingData:{...companyBilling,billingEmail:'other@example.test'}},key),{status:409});
    await orders.checkout(result.paymentId);
    assert.equal(createCalls.at(-1).body.customer_email,data.customerEmail);
    await orders.applySession({...sessions.get('checkout-'+result.paymentId),payment_status:'paid',status:'complete'});
    const bookingId=(await row(result.paymentId)).booking_id;
    await bookings.update(bookingId,{admin_note:'Ellenőrzött céges foglalás'});
    const mails=(await pool.query('SELECT recipient,body FROM outbox WHERE body LIKE $1',['%'+bookingId+'%'])).rows;
    const adminMails=mails.filter(m=>m.recipient==='company-admin@example.test');
    const customerMails=mails.filter(m=>m.recipient===data.customerEmail);
    assert.equal(adminMails.length,2);
    assert.equal(customerMails.length,2);
    for(const mail of adminMails) assert.match(mail.body,/Számlázási e-mail-cím: accounts@example\.test/);
    for(const mail of customerMails) {
      assert.doesNotMatch(mail.body,/accounts@example\.test/);
      assert.doesNotMatch(mail.body,/Bankkártyás fizetés folytatása/);
    }
    assert.equal(mails.some(m=>m.recipient==='accounts@example.test'),false);
  } finally {process.env.MAIL_ADMIN=oldAdmin;}
});
