const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
Object.assign(process.env,{NODE_ENV:'test',FRONTEND_URL:'http://localhost:5173',MAIL_FROM:'test@example.test',MAIL_ADMIN:'admin@example.test',SMTP_HOST:'',MAIL_USER:'',MAIL_PASS:''});
let db,server,base,cookie,admin;
async function req(code,status,expectedStatus,auth=true,origin='http://localhost:5173'){
 const response=await fetch(base+'/api/giftcard/admin/vouchers/'+code,{method:'PATCH',headers:{'Content-Type':'application/json',Origin:origin,...(auth?{cookie}:{})},body:JSON.stringify({status,expectedStatus})});
 return {status:response.status,data:await response.json()};
}
async function create(code,paid=false){
 await db.query('INSERT INTO gift_orders(id,data) VALUES($1,$2)',[code,{notice:code,meta:{names:['Vendég'],email:'guest@example.test'},...(paid?{paidAt:Date.now()}:{source:'admin'})}]);
 await db.query("INSERT INTO gift_vouchers(code,order_id,recipient_name,amount,valid_until) VALUES($1,$1,'Vendég',19000,current_date+90)",[code]);
 return code;
}
const state=async code=>(await db.query('SELECT admin_status FROM gift_vouchers WHERE code=$1',[code])).rows[0].admin_status;
const events=async code=>(await db.query('SELECT * FROM gift_voucher_events WHERE code=$1 ORDER BY created_at',[code])).rows;
const quote=code=>require('../src/domain/store').transaction(c=>require('../src/domain/vouchers').quote(c,[code],19000));
before(async()=>{
 db=await require('./database.cjs')();await require('../src/migrate')();
 admin=(await db.query('INSERT INTO admins(email,password_hash) VALUES($1,$2) RETURNING *',['manager@example.test',await require('../src/domain/auth').passwordHash('Voucher-management-test!')])).rows[0];
 server=require('../src/index').listen(0,'127.0.0.1');await new Promise(resolve=>server.on('listening',resolve));base='http://127.0.0.1:'+server.address().port;
 const response=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:'http://localhost:5173'},body:JSON.stringify({email:admin.email,password:'Voucher-management-test!'})});
 cookie=response.headers.get('set-cookie').split(';')[0];
});
after(async()=>{if(server)await new Promise(resolve=>server.close(resolve));await db?.end();});

test('voucher management requires an admin and trusted origin',async()=>{
 const code=await create('GIFT-AUTH00-01');
 assert.equal((await req(code,'paid','issued',false)).status,401);
 assert.equal((await req(code,'paid','issued',true,'https://foreign.example')).status,403);
 assert.equal(await state(code),null);
});
test('payment annotations preserve actual finances, PDFs and email queue; changes record the real actor',async()=>{
 const code=await create('GIFT-STATE0-01');
 assert.equal((await req(code,'paid','issued')).status,200);
 assert.equal(await state(code),'paid');assert.equal((await quote(code)).discount,19000);
 const history=await events(code);assert.equal(history.length,1);assert.equal(history[0].previous_status,'issued');assert.equal(history[0].status,'paid');assert.equal(history[0].admin_id,admin.id);assert.equal(history[0].admin_email,admin.email);
 assert.equal((await db.query('SELECT data FROM gift_orders WHERE id=$1',[code])).rows[0].data.paidAt,undefined);
 assert.equal((await db.query('SELECT count(*)::int n FROM payment_orders')).rows[0].n,0);
 assert.equal((await db.query('SELECT count(*)::int n FROM outbox')).rows[0].n,0);
 assert.equal((await req(code,'issued','paid')).status,200);
 assert.equal((await events(code)).length,2);
});
test('manual in-person redemption blocks online use and an audited correction can restore it',async()=>{
 const code=await create('GIFT-REDEEM-01',true);
 assert.equal((await req(code,'redeemed','paid')).status,200);
 await assert.rejects(quote(code),e=>e.status===409);
 assert.equal((await req(code,'paid','redeemed')).status,200);
 assert.equal((await quote(code)).discount,19000);
 assert.equal((await events(code)).length,2);
});
test('deleted vouchers keep their audit and can be assigned a new status directly',async()=>{
 const code=await create('GIFT-DELETE-01');
 assert.equal((await req(code,'deleted','issued')).status,200);
 assert.equal(await state(code),'deleted');
 await assert.rejects(quote(code),e=>e.status===409);
 assert.equal((await events(code))[0].status,'deleted');
 const response=await fetch(base+'/api/giftcard/admin/orders',{headers:{cookie}});assert.equal(response.status,200);
 const order=(await response.json()).find(order=>order.id===code);
 assert.equal(order.vouchers[0].code,code);assert.equal(order.vouchers[0].status,'deleted');assert.equal(order.vouchers[0].management_status,'deleted');assert.equal(order.vouchers[0].events.length,1);
 assert.equal((await req(code,'paid','deleted')).status,200);
 assert.equal(await state(code),'paid');
 assert.equal((await quote(code)).discount,19000);
 assert.equal((await req(code,'redeemed','deleted')).status,409);
 assert.equal((await req(code,'deleted','paid')).status,200);
 assert.equal((await req(code,'redeemed','deleted')).status,200);
 assert.equal(await state(code),'redeemed');
 await assert.rejects(quote(code),e=>e.status===409);
 const history=await events(code);
 assert.equal(history.length,4);
 assert.deepEqual(history.filter(event=>event.previous_status==='deleted').map(event=>event.status),['paid','redeemed']);
});
test('online active or consumed vouchers cannot be changed or deleted; released vouchers remain manageable',async()=>{
 for(const status of ['active','consumed','released']){
  const code=await create('GIFT-'+status.toUpperCase().padEnd(8,'0')+'-01');
  await db.query('INSERT INTO booking_vouchers(code,status) VALUES($1,$2)',[code,status]);
  assert.equal((await req(code,'deleted','issued')).status,status==='released'?200:409);
  if(status!=='released'){assert.equal((await req(code,'redeemed','issued')).status,409);assert.equal(await state(code),null);}
 }
});
test('invalid states, missing vouchers and stale edits fail without adding history',async()=>{
 const code=await create('GIFT-STALE0-01');
 assert.equal((await req(code,'unknown','issued')).status,400);
 assert.equal((await req(code,'paid',undefined)).status,400);
 assert.equal((await req('GIFT-ABSENT-01','paid','issued')).status,404);
 assert.equal((await req(code,'paid','paid')).status,409);
 assert.equal((await events(code)).length,0);
 const responses=await Promise.all([req(code,'paid','issued'),req(code,'redeemed','issued')]);
 assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);assert.equal((await events(code)).length,1);
});
test('an unchanged status is a no-op and paid purchases retain their original default',async()=>{
 const code=await create('GIFT-PAID00-01',true);
 assert.equal((await req(code,'paid','paid')).status,200);
 assert.equal(await state(code),null);assert.equal((await events(code)).length,0);
});
