const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
Object.assign(process.env,{NODE_ENV:'development',FRONTEND_URL:'http://localhost:5173',MAIL_FROM:'vouchers@example.test',MAIL_ADMIN:'admin@example.test',MAIL_USER:'',MAIL_PASS:'',SMTP_HOST:'',STRIPE_SECRET_KEY:'',STRIPE_WEBHOOK_SECRET:'',BILLINGO_API_KEY:'',TRANSFER_BENEFICIARY:'Test',TRANSFER_ACCOUNT:'11111111-22222222-33333333'});
let db,server,base,cookie,course,target,serial=0;
const billing={buyerType:'private',privateName:'Voucher Guest',postCode:'1111',city:'Budapest',street:'Test 1.'};
async function req(path,method='GET',body,auth=false,key){
  const r=await fetch(base+'/api'+path,{method,headers:{'Content-Type':'application/json',...(auth?{cookie}:{}),...(key?{'Idempotency-Key':key}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  return {status:r.status,data:await r.json()};
}
async function issued(amount=19000,{legacy=false,expired=false,changes=0}={}){
  const code=`GIFT-${String(++serial).padStart(legacy?12:6,'0')}-01`,id='gift-'+randomUUID();
  await db.query('INSERT INTO gift_orders(id,data) VALUES($1,$2)',[id,{}]);
  await db.query("INSERT INTO gift_vouchers(code,order_id,recipient_name,amount,valid_until,changes_used) VALUES($1,$2,'Secret Recipient',$3,$4,$5)",[code,id,amount,expired?'2020-01-01':'2099-12-31',changes]);
  return code;
}
async function book(codes,extra={},key){return req('/bookings','POST',{courseId:course.id,customerName:'Voucher Guest',customerEmail:randomUUID()+'@example.test',seats:1,paymentMethod:'transfer',billingData:billing,voucherCodes:codes,...extra},false,key);}
async function useState(code){return (await db.query('SELECT status FROM booking_vouchers WHERE code=$1 ORDER BY created_at DESC',[code])).rows.map(r=>r.status);}
before(async()=>{
  db=await require('./database.cjs')();
  await db.query('CREATE TABLE gift_orders(id TEXT PRIMARY KEY,data JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now())');
  await db.query('INSERT INTO gift_orders(id,data) VALUES($1,$2)',['gift-legacy-before-migration',{voucherBase:'GIFT-ABCDEF123456',generatedAt:Date.UTC(2090,0,31,12),meta:{names:['Legacy Recipient'],unitAmount:19000}}]);
  await require('../src/migrate')();
  await db.query('INSERT INTO admins(email,password_hash) VALUES($1,$2)',['voucher-admin@example.test',await require('../src/domain/auth').passwordHash('Voucher-password!')]);
  const service=await require('../src/domain/courses').serviceSave(null,{title:'Voucher course',duration_minutes:90,price:19000,capacity:100,session_count:2});
  const create=days=>require('../src/domain/courses').save(null,{service_id:service.id,sessions:[days,days+2].map(day=>({start_time:new Date(Date.now()+day*86400000).toISOString()}))});
  course=await create(30);target=await create(40);
  server=require('../src/index').listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));base='http://127.0.0.1:'+server.address().port;
  const response=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'voucher-admin@example.test',password:'Voucher-password!'})});cookie=response.headers.get('set-cookie').split(';')[0];
});
after(async()=>{if(server)await new Promise(r=>server.close(r));await db?.end();});

test('migration recovers existing issued PDF serials, recipient names and the original month-overflow expiry',async()=>{
  const legacy=(await db.query("SELECT * FROM gift_vouchers WHERE code='GIFT-ABCDEF123456-01'")).rows[0];
  assert.equal(legacy.amount,19000);assert.equal(legacy.recipient_name,'Legacy Recipient');
  assert.equal(new Date(legacy.valid_until).toISOString().slice(0,10),'2090-05-01');
  const result=await req('/giftcard/check-vouchers','POST',{courseId:course.id,seats:1,codes:[legacy.code]});assert.equal(result.status,200);
});

test('only issued valid vouchers can be checked; no recipient names leak; duplicates and excess value fail',async()=>{
  const code=await issued(),expired=await issued(19000,{expired:true}),large=await issued(20000);
  const check=codes=>req('/giftcard/check-vouchers','POST',{courseId:course.id,seats:1,codes});
  const result=await check([code.toLowerCase()]);assert.equal(result.status,200);assert.equal(result.data.discount,19000);assert.equal(result.data.due,0);
  assert.equal(JSON.stringify(result.data).includes('Secret Recipient'),false);
  for(const codes of [['GIFT-XXXXXX-01'],[expired],[large]])assert.equal((await check(codes)).status,409);
  assert.equal((await check([code,code.toLowerCase()])).status,400);
  assert.equal((await check(['GIFT-123456'])).status,400);
  assert.equal((await book([large])).status,409);
});
test('exact coverage reserves both course sessions, no transfer is requested, confirmation remains manual, and retries are stable',async()=>{
  const code=await issued(),key=randomUUID(),email=randomUUID()+'@example.test';
  const r=await book([code],{customerEmail:email},key);assert.equal(r.status,201,JSON.stringify(r.data));
  assert.equal(r.data.booking.total_price,19000);assert.equal(r.data.booking.voucher_discount,19000);assert.equal(r.data.booking.payment_status,'paid');assert.equal(r.data.booking.status,'pending');assert.equal(r.data.redirectUrl,undefined);
  assert.deepEqual(await useState(code),['active']);
  const retry=await book([code],{customerEmail:email},key);assert.equal(retry.status,201);assert.equal(retry.data.booking.id,r.data.booking.id);assert.deepEqual(await useState(code),['active']);
  assert.equal((await book([],{customerEmail:email},key)).status,409);
  const mail=(await db.query('SELECT body FROM outbox WHERE recipient=$1',[email])).rows[0].body;
  assert.ok(mail.includes('1/2. alkalom'));assert.ok(mail.includes('2/2. alkalom'));assert.ok(mail.includes('72 ór'));assert.ok(mail.includes(code));assert.ok(!mail.includes('Kedvezményezett:'));
  assert.equal((await req('/admin/bookings/'+r.data.booking.id,'PATCH',{payment_status:'refunded'},true)).status,409);
});
test('multiple vouchers and legacy codes cover only part of the price; transfer details request exactly the difference',async()=>{
  const a=await issued(5000),b=await issued(6000,{legacy:true});
  const r=await book([a,b]);assert.equal(r.status,201,JSON.stringify(r.data));assert.equal(r.data.booking.voucher_discount,11000);assert.equal(r.data.booking.payment_status,'pending');assert.ok(r.data.redirectUrl);
  const info=await req('/transfer-info?id='+r.data.booking.id);assert.equal(info.status,200);assert.equal(info.data.amount,8000);
  assert.equal((await req('/admin/bookings/'+r.data.booking.id,'PATCH',{payment_status:'paid'},true)).status,200);
  assert.deepEqual(await useState(a),['active']);assert.deepEqual(await useState(b),['active']);
  const listing=await req('/giftcard/admin/orders','GET',undefined,true);assert.equal(listing.status,200);assert.ok(listing.data.some(o=>o.vouchers?.some(v=>v.code===a&&v.name==='Secret Recipient')));
});
test('parallel attempts cannot spend the same voucher twice and failed booking does not consume it',async()=>{
  const code=await issued();const results=await Promise.all([book([code]),book([code])]);assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);assert.deepEqual(await useState(code),['active']);
  const other=await issued();assert.equal((await book([other],{seats:101})).status,400);assert.deepEqual(await useState(other),[]);assert.equal((await book([other])).status,201);
});
test('timely cancellation releases the original code once; reuse preserves expiry and lifetime change limit',async()=>{
  const code=await issued(),r=await book([code]);
  assert.equal((await req('/admin/bookings/'+r.data.booking.id,'PATCH',{status:'cancelled'},true)).status,200);assert.deepEqual(await useState(code),['released']);
  const voucher=(await db.query('SELECT * FROM gift_vouchers WHERE code=$1',[code])).rows[0];assert.equal(voucher.changes_used,1);assert.equal(new Date(voucher.valid_until).getUTCFullYear(),2099);
  const next=await book([code]);assert.equal(next.status,201);
  assert.equal((await req('/admin/bookings/'+next.data.booking.id,'PATCH',{course_id:target.id},true)).status,409);
  assert.equal((await req('/admin/bookings/'+next.data.booking.id,'PATCH',{status:'cancelled'},true)).status,200);
  assert.deepEqual((await useState(code)).sort(),['consumed','released']);assert.equal((await book([code])).status,409);
  // Reopening the first cancelled booking cannot steal a code consumed by another booking.
  assert.equal((await req('/admin/bookings/'+r.data.booking.id,'PATCH',{status:'pending'},true)).status,409);
});
test('rescheduling uses the same one-time allowance; late cancellation consumes, organizer cancellation restores without spending it',async()=>{
  const code=await issued(),r=await book([code]);
  assert.equal((await req('/admin/bookings/'+r.data.booking.id,'PATCH',{course_id:target.id},true)).status,200);
  assert.equal((await db.query('SELECT changes_used FROM gift_vouchers WHERE code=$1',[code])).rows[0].changes_used,1);
  assert.equal((await req('/admin/bookings/'+r.data.booking.id,'PATCH',{course_id:course.id},true)).status,409);
  const late=await issued(),lateBooking=await book([late]);
  const now=new Date(Date.now()+48*3600000),end=new Date(+now+90*60000);
  await db.query('UPDATE courses SET start_time=$2,end_time=$3 WHERE id=$1',[course.id,now,end]);
  assert.equal((await req('/admin/bookings/'+lateBooking.data.booking.id,'PATCH',{status:'cancelled'},true)).status,200);assert.deepEqual(await useState(late),['consumed']);
  const deletedCode=await issued(5000),deleted=await book([deletedCode]);
  assert.equal((await req('/admin/bookings/'+deleted.data.booking.id,'PATCH',{status:'cancelled'},true)).status,200);
  assert.equal((await req('/admin/bookings/'+deleted.data.booking.id,'DELETE',undefined,true)).status,200);
  assert.deepEqual(await useState(deletedCode),['consumed']);assert.equal((await book([deletedCode])).status,409);
  const organizer=await issued(),org=await book([organizer]);assert.equal(org.status,201);
  assert.equal((await req('/admin/bookings/'+org.data.booking.id,'PATCH',{status:'cancelled',organizerCancellation:true},true)).status,200);assert.deepEqual(await useState(organizer),['released']);
  assert.equal((await db.query('SELECT changes_used FROM gift_vouchers WHERE code=$1',[organizer])).rows[0].changes_used,0);
  await db.query('UPDATE courses SET start_time=$2,end_time=$3 WHERE id=$1',[course.id,course.start_time,course.end_time]);
});
test('a timely customer cancellation is evaluated at submission even when the admin approves within 72 hours',async()=>{
  const code=await issued(),email=randomUUID()+'@example.test',r=await book([code],{customerEmail:email});
  const mail=(await db.query('SELECT body FROM outbox WHERE recipient=$1',[email])).rows[0].body;
  const token=mail.match(/booking\/manage#[^.\s]+\.([a-f0-9]{64})/)[1];
  const send=await fetch(base+'/api/bookings/'+r.data.booking.id+'/requests',{method:'POST',headers:{'Content-Type':'application/json','X-Booking-Token':token},body:JSON.stringify({kind:'cancel'})});assert.equal(send.status,201);
  const request=await send.json();
  // Move the request's timestamp to a time safely before the now-upcoming course.
  await db.query("UPDATE change_requests SET created_at=now()-interval '2 days' WHERE id=$1",[request.id]);
  await db.query("UPDATE courses SET start_time=now()+interval '2 days',end_time=now()+interval '2 days 2 hours' WHERE id=$1",[course.id]);
  assert.equal((await req('/admin/requests/'+request.id,'PATCH',{status:'approved'},true)).status,200);assert.deepEqual(await useState(code),['released']);
});
