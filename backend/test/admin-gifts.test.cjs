const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
Object.assign(process.env,{NODE_ENV:'test',FRONTEND_URL:'http://localhost:5173',MAIL_FROM:'gifts@example.test',MAIL_ADMIN:'admin@example.test',MAIL_USER:'',MAIL_PASS:'',SMTP_HOST:'',
  TRANSFER_BENEFICIARY:'',TRANSFER_ACCOUNT:'',STRIPE_SECRET_KEY:'',STRIPE_WEBHOOK_SECRET:'',BILLINGO_API_KEY:''});
let db,server,base,cookie,adminId,issued,requestKey;
async function req(path,method='GET',body,auth=true,key,origin='http://localhost:5173'){
 const r=await fetch(base+'/api'+path,{method,headers:{'Content-Type':'application/json',Origin:origin,
  ...(auth?{cookie}:{}),...(key?{'Idempotency-Key':key}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 return {status:r.status,data:await r.json(),headers:r.headers};
}
const body={amount:19000,quantity:1,names:['Árvíztűrő Vendég'],email:' Gift@Example.Test '};
before(async()=>{
 db=await require('./database.cjs')();await require('../src/migrate')();
 const row=await db.query('INSERT INTO admins(email,password_hash) VALUES($1,$2) RETURNING id',['issuer@example.test',await require('../src/domain/auth').passwordHash('Admin-gift-test-password!')]);adminId=row.rows[0].id;
 const providers=require('../src/payments/providers');providers.stripe=()=>assert.fail('Admin issue must not call Stripe');providers.billingo=()=>assert.fail('Admin issue must not call Billingo');
 server=require('../src/index').listen(0,'127.0.0.1');await new Promise(resolve=>server.on('listening',resolve));base='http://127.0.0.1:'+server.address().port;
 cookie=(await req('/auth/login','POST',{email:'issuer@example.test',password:'Admin-gift-test-password!'},false)).headers.get('set-cookie').split(';')[0];
});
after(async()=>{if(server)await new Promise(resolve=>server.close(resolve));await db?.end();});

test('only a signed-in admin with the correct origin can issue vouchers',async()=>{
 assert.equal((await req('/giftcard/admin/issue','POST',body,false,randomUUID())).status,401);
 assert.equal((await req('/giftcard/admin/issue','POST',body,true,randomUUID(),'https://foreign.example')).status,403);
 assert.equal((await req('/giftcard/admin/orders','GET',undefined,false)).status,401);
});
test('invalid values, names, quantities, addresses and missing retry keys create nothing',async()=>{
 for(const change of [{amount:999},{amount:1000001},{amount:1234.5},{amount:''},{quantity:0},{quantity:21},{quantity:2},{names:['']},{names:'Name'},{email:'invalid'}]){
  assert.equal((await req('/giftcard/admin/issue','POST',{...body,...change},true,randomUUID())).status,400,JSON.stringify(change));
 }
 assert.equal((await req('/giftcard/admin/issue','POST',body)).status,400);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM gift_orders')).rows[0].n,0);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM outbox')).rows[0].n,0);
});
test('admin creates a redeemable PDF and correct emails without billing, bank details or paid records',async()=>{
 requestKey=randomUUID();
 const r=await req('/giftcard/admin/issue','POST',{...body,source:'customer',paidAt:1,issuedBy:{email:'forged@example.test'},paymentMethod:'stripe'},true,requestKey);
 assert.equal(r.status,201,JSON.stringify(r.data));issued=r.data;
 assert.match(issued.codes[0],/^GIFT-[A-Z0-9]{6}-01$/);
 const row=(await db.query('SELECT * FROM gift_orders WHERE id=$1',[issued.id])).rows[0];
 assert.equal(row.data.source,'admin');assert.equal(row.data.issuedBy.id,adminId);assert.equal(row.data.issuedBy.email,'issuer@example.test');
 assert.equal(row.data.meta.paymentMethod,'none');assert.equal(row.data.meta.email,'gift@example.test');assert.equal(row.data.paidAt,undefined);assert.ok(row.data.generatedAt);
 const vouchers=(await db.query('SELECT * FROM gift_vouchers WHERE order_id=$1',[issued.id])).rows;
 assert.equal(vouchers.length,1);assert.equal(vouchers[0].amount,19000);assert.equal(vouchers[0].recipient_name,body.names[0]);
 const expires=new Date(row.data.generatedAt);expires.setMonth(expires.getMonth()+3);assert.equal(issued.validUntil,expires.toISOString().slice(0,10));
 const mails=(await db.query('SELECT * FROM outbox ORDER BY recipient')).rows;assert.equal(mails.length,2);
 const customer=mails.find(m=>m.recipient==='gift@example.test');assert.equal(customer.attachments.length,1);
 assert.ok(Buffer.from(customer.attachments[0].content,'base64').subarray(0,5).equals(Buffer.from('%PDF-')));
 assert.ok(customer.body.includes('Fizetési kötelezettséged nincs.'));assert.ok(!customer.body.includes('Köszönjük a vásárlást'));
 assert.ok(customer.body.includes(issued.codes[0]));assert.ok(!customer.body.includes('Bankszámlaszám'));
 const admin=mails.find(m=>m.recipient==='admin@example.test');assert.ok(admin.subject.includes('admin által'));assert.ok(!admin.subject.includes('fizetett'));
 assert.equal((await db.query('SELECT count(*)::int AS n FROM payment_orders')).rows[0].n,0);
});
test('parallel retries keep one order, voucher and mail pair; changed data is rejected',async()=>{
 const count=(await db.query('SELECT count(*)::int AS n FROM outbox')).rows[0].n;
 const results=await Promise.all([req('/giftcard/admin/issue','POST',body,true,requestKey),req('/giftcard/admin/issue','POST',body,true,requestKey)]);
 for(const result of results){assert.equal(result.status,201);assert.deepEqual(result.data.codes,issued.codes);assert.equal(result.data.id,issued.id);}
 assert.equal((await db.query('SELECT count(*)::int AS n FROM gift_orders')).rows[0].n,1);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM outbox')).rows[0].n,count);
 assert.equal((await req('/giftcard/admin/issue','POST',{...body,amount:20000},true,requestKey)).status,409);
});
test('multiple recipients receive distinct correctly numbered vouchers in one customer email',async()=>{
 const result=await req('/giftcard/admin/issue','POST',{amount:12345,quantity:2,names:['Első Vendég','Második Vendég'],email:'multi@example.test'},true,randomUUID());
 assert.equal(result.status,201);assert.equal(result.data.codes.length,2);
 assert.match(result.data.codes[0],/-01$/);assert.equal(result.data.codes[1],result.data.codes[0].replace(/01$/,'02'));
 const mail=(await db.query('SELECT * FROM outbox WHERE recipient=$1',['multi@example.test'])).rows;
 assert.equal(mail.length,1);assert.equal(mail[0].attachments.length,2);assert.ok(mail[0].body.includes('Összesen: 24690 Ft'));
});
test('admin-issued vouchers cannot be paid again and are accepted by normal redemption',async()=>{
 assert.equal((await req('/giftcard/admin/mark-paid','POST',{id:issued.id})).status,409);
 assert.equal((await req('/transfer-info?id='+issued.id)).status,409);
 const courses=require('../src/domain/courses');
 const service=await courses.serviceSave(null,{title:'Admin gift redemption',price:19000,duration_minutes:60,capacity:6});
 const course=await courses.save(null,{service_id:service.id,start_time:new Date(Date.now()+120*86400000).toISOString()});
 const quote=await req('/giftcard/check-vouchers','POST',{courseId:course.id,seats:1,codes:issued.codes},false);
 assert.equal(quote.status,200,JSON.stringify(quote.data));assert.equal(quote.data.discount,19000);assert.equal(quote.data.due,0);
 const list=await req('/giftcard/admin/orders');assert.equal(list.headers.get('cache-control'),'no-store');
 assert.ok(list.data.find(order=>order.id===issued.id).vouchers.some(v=>v.code===issued.codes[0]));
});
test('a failed email-queue insert rolls the issue back and the same request can safely retry',async()=>{
 const key=randomUUID(),input={...body,email:'failure@example.test'};
 const before=(await db.query('SELECT count(*)::int AS n FROM gift_orders')).rows[0].n;
 await db.query("CREATE FUNCTION fail_admin_gift_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.recipient='failure@example.test' THEN RAISE EXCEPTION 'Test queue failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_admin_gift_test BEFORE INSERT ON outbox FOR EACH ROW EXECUTE FUNCTION fail_admin_gift_test()");
 try{assert.equal((await req('/giftcard/admin/issue','POST',input,true,key)).status,500);}finally{await db.query('DROP TRIGGER fail_admin_gift_test ON outbox; DROP FUNCTION fail_admin_gift_test()');}
 assert.equal((await db.query('SELECT count(*)::int AS n FROM gift_orders')).rows[0].n,before);
 assert.equal((await db.query('SELECT 1 FROM outbox WHERE recipient=$1',[input.email])).rowCount,0);
 assert.equal((await req('/giftcard/admin/issue','POST',input,true,key)).status,201);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM gift_orders')).rows[0].n,before+1);
});

test('local SMTP delivers the admin-issued voucher as an HTML email with a PDF attachment',async()=>{
 const smtp=await require('./smtp.cjs')();
 const previous={SMTP_HOST:process.env.SMTP_HOST,SMTP_PORT:process.env.SMTP_PORT};
 try{
  Object.assign(process.env,{SMTP_HOST:'127.0.0.1',SMTP_PORT:String(smtp.port)});
  await require('../src/domain/notifications').deliver();
  const mail=smtp.messages.find(message=>/To: gift@example.test/.test(message));
  assert.ok(mail);assert.ok(mail.includes('Content-Type: application/pdf'));
  assert.ok(mail.includes('Content-Type: text/html'));assert.ok(mail.includes(issued.codes[0]));
  assert.equal((await db.query('SELECT count(*)::int AS n FROM outbox WHERE recipient=$1 AND sent_at IS NOT NULL',['gift@example.test'])).rows[0].n,1);
 }finally{
  for(const [key,value]of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
  await smtp.close();
 }
});
