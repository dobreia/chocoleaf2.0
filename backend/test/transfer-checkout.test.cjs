const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
Object.assign(process.env,{NODE_ENV:'development',FRONTEND_URL:'http://localhost:5173',MAIL_FROM:'transfer@example.test',MAIL_ADMIN:'admin@example.test',MAIL_USER:'',MAIL_PASS:'',SMTP_HOST:'',STRIPE_SECRET_KEY:'',STRIPE_WEBHOOK_SECRET:'',BILLINGO_API_KEY:'',
  TRANSFER_BENEFICIARY:'ChocoLeaf teszt',TRANSFER_BANK_NAME:'Tesztbank',TRANSFER_ACCOUNT:'11111111-22222222-33333333'});
const billing={buyerType:'company',companyName:'Teszt Kft.',taxNumber:'12345678-1-12',billingEmail:' Accounts@Example.Test ',postCode:'1111',city:'Budapest',street:'Teszt utca 1.'};
let db,server,base,cookie,course,booking;
async function req(path,method='GET',body,auth=false,key){
  const response=await fetch(base+'/api'+path,{method,headers:{'Content-Type':'application/json',...(auth?{cookie}:{}),...(key?{'Idempotency-Key':key}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  return {status:response.status,data:await response.json(),headers:response.headers};
}
before(async()=>{
  db=await require('./database.cjs')();await require('../src/migrate')();
  const providers=require('../src/payments/providers');
  providers.stripe=()=>assert.fail('Transfer checkout must not call Stripe');
  providers.billingo=()=>assert.fail('Transfer checkout must not issue an automatic invoice');
  await db.query('INSERT INTO admins(email,password_hash) VALUES($1,$2)',['transfer-admin@example.test',await require('../src/domain/auth').passwordHash('Transfer-test-password!')]);
  const service=await require('../src/domain/courses').serviceSave(null,{title:'Transfer course',duration_minutes:90,price:19000,capacity:6,session_count:2});
  const day=n=>new Date(Date.now()+n*86400000).toISOString().slice(0,10)+'T09:00:00Z';
  course=await require('../src/domain/courses').save(null,{service_id:service.id,sessions:[{start_time:day(30)},{start_time:day(32)}]});
  server=require('../src/index').listen(0,'127.0.0.1');await new Promise(resolve=>server.on('listening',resolve));base='http://127.0.0.1:'+server.address().port;
  const login=await req('/auth/login','POST',{email:'transfer-admin@example.test',password:'Transfer-test-password!'});cookie=login.headers.get('set-cookie').split(';')[0];
});
after(async()=>{if(server)await new Promise(resolve=>server.close(resolve));await db?.end();});

test('public booking opens transfer details, reserves all sessions, preserves billing and retries without duplicates',async()=>{
  assert.equal(require('../src/payments/providers').provider(),'transfer');
  assert.equal((await req('/payments/config')).data.provider,'transfer');
  const body={courseId:course.id,customerName:'Transfer Guest',customerEmail:'guest@example.test',seats:2,paymentMethod:'transfer',billingData:billing};
  const key=randomUUID();const result=await req('/bookings','POST',body,false,key);
  assert.equal(result.status,201,JSON.stringify(result.data));booking=result.data.booking;
  assert.equal(booking.payment_method,'transfer');assert.equal(booking.payment_status,'pending');assert.equal(booking.status,'pending');
  assert.equal(booking.total_price,38000);assert.equal(result.data.redirectUrl,'/transfer?id='+booking.id);assert.equal(result.data.paymentId,undefined);assert.equal(booking.billing_data,undefined);
  const stored=(await db.query('SELECT * FROM bookings WHERE id=$1',[booking.id])).rows[0];
  assert.equal(stored.billing_data.billingEmail,'accounts@example.test');assert.equal(stored.billing_data.name,billing.companyName);
  const info=await req('/transfer-info?id='+booking.id);assert.equal(info.status,200);assert.equal(info.data.kind,'booking');assert.equal(info.data.amount,38000);assert.equal(info.data.account,process.env.TRANSFER_ACCOUNT);assert.equal(info.data.notice,stored.transfer_reference);assert.equal(info.data.email,undefined);
  const mail=(await db.query('SELECT * FROM outbox WHERE recipient=$1',[body.customerEmail])).rows;
  assert.equal(mail.length,1);assert.ok(mail[0].body.includes(stored.transfer_reference));assert.ok(mail[0].body.includes('1/2. alkalom'));assert.ok(mail[0].body.includes('2/2. alkalom'));assert.ok(!mail[0].body.includes('accounts@example.test'));
  assert.ok((await db.query("SELECT body FROM outbox WHERE recipient='admin@example.test'")).rows.some(item=>item.body.includes('accounts@example.test')));
  const replay=await req('/bookings','POST',body,false,key);assert.equal(replay.status,201);assert.equal(replay.data.booking.id,booking.id);assert.equal(replay.data.redirectUrl,result.data.redirectUrl);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM bookings WHERE request_key=$1',[key])).rows[0].n,1);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM outbox WHERE recipient=$1',[body.customerEmail])).rows[0].n,1);
  assert.equal((await req('/bookings','POST',{...body,billingData:{...billing,city:'Other'}},false,key)).status,409);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM payment_orders')).rows[0].n,0);
});

test('admin recording payment is persistent and separate from confirmation; customer cannot self-approve',async()=>{
  assert.equal((await req('/admin/bookings/'+booking.id,'PATCH',{payment_status:'paid'})).status,401);
  assert.equal((await req('/admin/bookings/'+booking.id,'PATCH',{payment_status:'paid',updated_at:booking.updated_at},true)).status,200);
  const stored=(await req('/admin/bookings/'+booking.id,'GET',undefined,true)).data;
  assert.equal(stored.payment_status,'paid');assert.equal(stored.status,'pending');
  assert.equal((await req('/transfer-info?id='+booking.id)).data.paid,true);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM booking_calendar_events WHERE booking_id=$1',[booking.id])).rows[0].n,0);
  assert.equal((await req('/admin/bookings/'+booking.id,'PATCH',{status:'confirmed',updated_at:stored.updated_at},true)).status,200);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM booking_calendar_events WHERE booking_id=$1',[booking.id])).rows[0].n,2);
});

test('transfer voucher order is idempotent, keeps billing and sends PDFs only after admin records payment',async()=>{
  const body={names:['First Guest','Second Guest'],email:'voucher-transfer@example.test',quantity:2,amount:19000,billingData:billing,paymentMethod:'transfer'};
  const key=randomUUID();const result=await req('/giftcard/start-payment','POST',body,false,key);
  assert.equal(result.status,200,JSON.stringify(result.data));assert.equal(result.data.paymentId,undefined);assert.equal(result.data.redirectUrl,'/transfer?id='+result.data.id);
  const info=(await req('/transfer-info?id='+result.data.id)).data;assert.equal(info.amount,38000);assert.equal(info.kind,'giftcard');
  const replay=await req('/giftcard/start-payment','POST',body,false,key);assert.equal(replay.data.id,result.data.id);
  assert.equal((await req('/giftcard/start-payment','POST',{...body,names:['Changed','Second Guest']},false,key)).status,409);
  let order=(await db.query('SELECT * FROM gift_orders WHERE id=$1',[result.data.id])).rows[0];assert.equal(order.data.meta.billingData.billingEmail,'accounts@example.test');assert.equal(order.data.paidAt,undefined);
  assert.equal((await db.query('SELECT attachments FROM outbox WHERE recipient=$1',[body.email])).rows[0].attachments.length,0);
  assert.equal((await req('/giftcard/admin/mark-paid','POST',{id:result.data.id})).status,401);
  assert.equal((await req('/giftcard/admin/mark-paid','POST',{id:result.data.id},true)).status,200);
  assert.equal((await req('/giftcard/admin/mark-paid','POST',{id:result.data.id},true)).status,200);
  order=(await db.query('SELECT * FROM gift_orders WHERE id=$1',[result.data.id])).rows[0];assert.ok(order.data.paidAt);assert.ok(order.data.generatedAt);
  const messages=(await db.query('SELECT * FROM outbox WHERE recipient=$1',[body.email])).rows;assert.equal(messages.length,2);assert.equal(messages.find(mail=>mail.attachments.length).attachments.length,2);
  assert.equal((await req('/transfer-info?id='+result.data.id)).data.paid,true);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM payment_orders')).rows[0].n,0);
});

test('missing bank details and invalid billing fail before creating an order; cancelled bookings cannot be paid',async()=>{
  const before=(await db.query('SELECT count(*)::int AS n FROM bookings')).rows[0].n;
  const body={courseId:course.id,customerName:'Missing config',customerEmail:'missing@example.test',seats:1,billingData:billing};
  const account=process.env.TRANSFER_ACCOUNT;delete process.env.TRANSFER_ACCOUNT;
  try {assert.equal((await req('/bookings','POST',body)).status,503);} finally {process.env.TRANSFER_ACCOUNT=account;}
  assert.equal((await req('/bookings','POST',{...body,billingData:{...billing,billingEmail:''}})).status,400);
  assert.equal((await req('/bookings','POST',{...body,paymentMethod:'stripe'})).status,400);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM bookings')).rows[0].n,before);
  const oldKey=randomUUID();
  await require('../src/payments/orders').insert(db,{courseId:course.id,seats:1,bookingData:{customer_name:body.customerName},key:oldKey,amount:19000,email:body.customerEmail,description:'Archived checkout',billing:require('../src/payments/providers').billingData(billing),config:{}});
  assert.equal((await req('/bookings','POST',body,false,oldKey)).status,409);
  assert.equal((await req('/transfer-info?id='+randomUUID())).status,404);
  assert.equal((await req('/admin/bookings/'+booking.id,'PATCH',{status:'cancelled'},true)).status,200);
  assert.equal((await req('/transfer-info?id='+booking.id)).status,409);
});
