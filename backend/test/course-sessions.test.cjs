const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
Object.assign(process.env,{NODE_ENV:'development',PAYMENT_LOCAL_TEST:'1',FRONTEND_URL:'http://localhost:5173',STRIPE_SECRET_KEY:'sk_test_sessions',STRIPE_WEBHOOK_SECRET:'whsec_sessions',MAIL_ADMIN:'sessions-admin@example.test',MAIL_FROM:''});
let db, courses, bookings, orders, serviceId, legacyId, legacyBooking, upgradedService, upgradedGroup, server, origin;
const base=Math.floor(Date.now()/86400000)*86400000+180*86400000;
const at=(day,hour=9)=>new Date(base+day*86400000+hour*3600000).toISOString();
const interval=(day,start=9,end=14)=>({start_time:at(day,start),end_time:at(day,end)});
const billing={buyerType:'private',privateName:'Teszt Foglaló',postCode:'1111',city:'Budapest',street:'Teszt utca 1.'};
const create=async(day,extra={})=>{
  const data={service_id:serviceId,price:39000,capacity:4,sessions:[interval(day),interval(day+2,10,14)],...extra};
  // Each fixture explicitly configures the template before advertising dates.
  if(data.sessions.length)await db.query('UPDATE services SET session_count=$2 WHERE id=$1',[serviceId,data.sessions.length]);
  return courses.save(null,data);
};
const book=(slot,email=randomUUID()+'@example.test',seats=1)=>bookings.create({courseId:slot.id,customerName:'Kurzus Vendég',customerEmail:email,seats},randomUUID(),{manual:true});
before(async()=>{
  db=await require('./database.cjs')();
  // Exercise the actual upgrade with an existing booking and exported event.
  await db.query('CREATE TABLE schema_migrations(name TEXT PRIMARY KEY,applied_at TIMESTAMPTZ DEFAULT now())');
  for(const name of fs.readdirSync(path.join(__dirname,'../migrations')).sort().filter(n=>n<'010-course-sessions.sql')){
    await db.query(fs.readFileSync(path.join(__dirname,'../migrations',name),'utf8'));
    await db.query('INSERT INTO schema_migrations(name) VALUES($1)',[name]);
  }
  serviceId=(await db.query("INSERT INTO services(title,duration_minutes,price,capacity) VALUES('Többalkalmas Teszt',300,39000,4) RETURNING id")).rows[0].id;
  legacyId=(await db.query("INSERT INTO courses(service_id,title,start_time,end_time,price,capacity) VALUES($1,'Régi kurzus',$2,$3,1000,4) RETURNING id",[serviceId,at(0),at(0,10)])).rows[0].id;
  legacyBooking=(await db.query("INSERT INTO bookings(course_id,customer_name,customer_email) VALUES($1,'Régi vendég','legacy-sessions@example.test') RETURNING id",[legacyId])).rows[0].id;
  await db.query("INSERT INTO calendar_events(course_id,event_id,desired_hash,synced_hash) VALUES($1,'existing-event','old','old')",[legacyId]);
  await db.query(fs.readFileSync(path.join(__dirname,'../migrations/010-course-sessions.sql'),'utf8'));
  await db.query("INSERT INTO schema_migrations(name) VALUES('010-course-sessions.sql')");
  upgradedService=(await db.query("INSERT INTO services(title,duration_minutes,price,capacity) VALUES('Korábbi többalkalmas kurzus',120,20000,6) RETURNING id")).rows[0].id;
  upgradedGroup=(await db.query("INSERT INTO courses(service_id,title,start_time,end_time,price,capacity) VALUES($1,'Korábbi csomag',$2,$3,20000,6) RETURNING id",[upgradedService,at(470),at(472,14)])).rows[0].id;
  for(const s of [interval(470),interval(472)])await db.query('INSERT INTO course_sessions(course_id,start_time,end_time) VALUES($1,$2,$3)',[upgradedGroup,s.start_time,s.end_time]);
  await require('../src/migrate')();
  courses=require('../src/domain/courses');bookings=require('../src/domain/bookings');orders=require('../src/payments/orders');
  server=require('../src/index').listen(0,'127.0.0.1');
  await new Promise(r=>server.on('listening',r));origin='http://127.0.0.1:'+server.address().port;
});
after(async()=>{if(server)await new Promise(r=>server.close(r));await db?.end();});
test('migration preserves legacy identifiers, bookings and Google event identity; rerun is safe',async()=>{
  const sessions=(await db.query('SELECT * FROM course_sessions WHERE course_id=$1',[legacyId])).rows;
  assert.equal(sessions.length,1);assert.equal(sessions[0].id,legacyId);
  assert.equal((await db.query('SELECT course_id FROM bookings WHERE id=$1',[legacyBooking])).rows[0].course_id,legacyId);
  assert.equal((await db.query('SELECT event_id,session_id FROM calendar_events WHERE course_id=$1',[legacyId])).rows[0].event_id,'existing-event');
  assert.equal((await db.query('SELECT session_count FROM services WHERE id=$1',[serviceId])).rows[0].session_count,1);
  assert.equal((await db.query('SELECT session_count FROM services WHERE id=$1',[upgradedService])).rows[0].session_count,2);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM course_sessions WHERE course_id=$1',[upgradedGroup])).rows[0].n,2);
  await require('../src/migrate')();
  assert.equal((await db.query('SELECT count(*)::int AS n FROM course_sessions WHERE course_id=$1',[legacyId])).rows[0].n,1);
});
test('three differently sized sessions form one priced advertisement, with free gaps between sessions',async()=>{
  const group=await create(10,{sessions:[interval(12,10,14),interval(10),interval(10,15,17)]});
  assert.equal(group.sessions.length,3);assert.equal(group.price,39000);
  assert.equal(new Date(group.start_time).toISOString(),at(10));
  assert.equal(new Date(group.end_time).toISOString(),at(12,14));
  const singleService=await courses.serviceSave(null,{title:'Egyalkalmas teszt',duration_minutes:60,price:1000,capacity:2});
  const gap=await courses.save(null,{service_id:singleService.id,price:1000,capacity:2,...interval(11)});
  assert.ok(gap.id);
  await assert.rejects(courses.save(null,{service_id:singleService.id,price:1000,capacity:2,...interval(12,11,12)}),{status:409});
  await assert.rejects(create(20,{sessions:[interval(20),interval(20,13,15)]}),{status:409});
});
test('invalid sessions and any late conflicting session roll back the entire advertisement',async()=>{
  const before=(await db.query('SELECT count(*)::int AS n FROM courses')).rows[0].n;
  await assert.rejects(create(30,{sessions:[]}),{status:400});
  await assert.rejects(create(30,{sessions:[interval(30,14,9)]}),{status:400});
  await create(32);
  await assert.rejects(create(30),{status:409});
  assert.equal((await db.query('SELECT count(*)::int AS n FROM courses')).rows[0].n,before+1);
});

test('service defines the number of dates; template changes preserve existing advertisements and reject mismatched new dates',async()=>{
  const data={title:'Kurzus alkalomszáma',duration_minutes:120,price:25000,capacity:6,session_count:2};
  const service=await courses.serviceSave(null,data);
  assert.equal(service.session_count,2);
  const advertised=await courses.save(null,{service_id:service.id,sessions:[interval(400),interval(402,10,12)]});
  await assert.rejects(courses.save(null,{service_id:service.id,sessions:[interval(404)]}),{status:400});
  await assert.rejects(courses.save(advertised.id,{sessions:[advertised.sessions[0]]}),{status:400});
  for(const session_count of [0,101,1.5,'',null,true])
    await assert.rejects(courses.serviceSave(service.id,{...data,session_count}),{status:400});
  const changed=await courses.serviceSave(service.id,{...data,session_count:3});
  assert.equal(changed.session_count,3);
  const unchanged=await courses.serviceSave(service.id,{...data,session_count:undefined});
  assert.equal(unchanged.session_count,3);
  const saved=await courses.save(advertised.id,{sessions:advertised.sessions.map((s,i)=>i?{...s,...interval(403,10,13)}:s)});
  assert.equal(saved.sessions.length,2);
  await assert.rejects(courses.save(null,{service_id:service.id,sessions:[interval(406),interval(408)]}),{status:400});
  const next=await courses.save(null,{service_id:service.id,sessions:[interval(410),interval(412),interval(414)]});
  assert.equal(next.sessions.length,3);
  assert.equal(next.price,25000);
});
test('one booking reserves a shared capacity for every session and locks the session count permanently',async()=>{
  const group=await create(40,{capacity:2});
  const b=await book(group,undefined,2);
  assert.equal(b.booking.total_price,78000);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM bookings WHERE course_id=$1',[group.id])).rows[0].n,1);
  await assert.rejects(book(group),{status:409});
  await assert.rejects(courses.save(group.id,{sessions:[...group.sessions,interval(44)]}),{status:409});
  await assert.rejects(courses.save(group.id,{sessions:[group.sessions[0]]}),{status:409});
  await bookings.update(b.booking.id,{status:'cancelled'});
  await assert.rejects(courses.save(group.id,{sessions:[group.sessions[0]]}),{status:409});
  const replacement=await courses.serviceSave(null,{title:'Másik kurzus',duration_minutes:300,price:39000,session_count:2});
  await assert.rejects(courses.save(group.id,{service_id:replacement.id}),{status:409});
  const fresh=await book(group,undefined,2);assert.ok(fresh.booking.id);
});
test('a pending payment holds one package price and locks every session; expiry releases capacity',async()=>{
  const group=await create(50,{capacity:1});
  const result=await bookings.create({courseId:group.id,customerName:'Fizető Vendég',customerEmail:'sessions-pay@example.test',seats:1,billingData:billing},randomUUID());
  const payment=(await db.query('SELECT * FROM payment_orders WHERE id=$1',[result.paymentId])).rows[0];
  assert.equal(payment.amount,39000);
  await assert.rejects(book(group),{status:409});
  await assert.rejects(courses.save(group.id,{sessions:group.sessions.map((s,i)=>i?{...s,...interval(53)}:s)}),{status:409});
  await db.query("UPDATE payment_orders SET status='expired' WHERE id=$1",[result.paymentId]);
  await assert.rejects(courses.save(group.id,{sessions:[group.sessions[0]]}),{status:409});
  assert.ok((await book(group)).booking.id);
});
test('public availability includes all dates across month boundaries and never multiplies the package price',async()=>{
  const date=new Date(base+70*86400000);date.setUTCDate(1);date.setUTCHours(9,0,0,0);
  const first=date.toISOString();date.setUTCMonth(date.getUTCMonth()+1);const second=date.toISOString();
  const group=await create(70,{sessions:[{start_time:first,end_time:new Date(+new Date(first)+3600000).toISOString()},{start_time:second,end_time:new Date(+new Date(second)+7200000).toISOString()}]});
  const response=await fetch(origin+'/api/bookings/availability?'+new URLSearchParams({courseId:serviceId,year:date.getUTCFullYear(),month:date.getUTCMonth()+1}));
  const found=(await response.json()).find(s=>s.id===group.id);
  assert.equal(found.sessions.length,2);assert.equal(found.price,39000);assert.equal(found.available_spots,4);
});
test('rescheduling and cancellation operate on the full package and notifications contain every session',async()=>{
  const source=await create(100),target=await create(110);
  const b=await book(source,'sessions-managed@example.test');
  const mail=(await db.query('SELECT body FROM outbox WHERE recipient=$1',['sessions-managed@example.test'])).rows[0].body;
  assert.match(mail,/1\/2\. alkalom/);assert.match(mail,/2\/2\. alkalom/);
  const token=mail.match(/booking\/manage#[a-f\d-]+\.([a-f\d]{64})/)[1];
  const request=await bookings.request(b.booking.id,token,{kind:'reschedule',course_id:target.id});
  await bookings.resolve(request.id,'approved');
  assert.equal((await db.query('SELECT course_id FROM bookings WHERE id=$1',[b.booking.id])).rows[0].course_id,target.id);
  const cancel=await bookings.request(b.booking.id,token,{kind:'cancel'});
  await bookings.resolve(cancel.id,'approved');
  assert.equal((await db.query('SELECT status FROM bookings WHERE id=$1',[b.booking.id])).rows[0].status,'cancelled');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM bookings WHERE id=$1',[b.booking.id])).rows[0].n,1);
});
test('changing a future session notifies the same booking once and cannot change the purchased session count',async()=>{
  const group=await create(120);const b=await book(group,'sessions-edit@example.test');
  const moved=await courses.save(group.id,{sessions:group.sessions.map((s,i)=>i?{...s,...interval(123,11,14)}:s)});
  assert.equal(moved.sessions.length,2);assert.equal(moved.sessions[1].id,group.sessions[1].id);
  const notices=(await db.query('SELECT body FROM outbox WHERE recipient=$1',['sessions-edit@example.test'])).rows;
  assert.equal(notices.length,2);assert.match(notices.at(-1).body,/időpontjai megváltoztak/);
  assert.equal((await db.query('SELECT course_id,total_price FROM bookings WHERE id=$1',[b.booking.id])).rows[0].total_price,39000);
});
test('after the first session starts, registration and customer changes stop but the future session is editable',async()=>{
  const group=await create(130);const b=await book(group,'sessions-started@example.test');
  const pastStart=new Date(Date.now()-7200000),pastEnd=new Date(Date.now()-3600000);
  await db.query('UPDATE course_sessions SET start_time=$2,end_time=$3 WHERE id=$1',[group.sessions[0].id,pastStart,pastEnd]);
  await db.query('UPDATE courses SET start_time=$2 WHERE id=$1',[group.id,pastStart]);
  await assert.rejects(book(group),{status:409});
  const mail=(await db.query('SELECT body FROM outbox WHERE recipient=$1',['sessions-started@example.test'])).rows[0].body;
  const token=mail.match(/booking\/manage#[a-f\d-]+\.([a-f\d]{64})/)[1];
  await assert.rejects(bookings.request(b.booking.id,token,{kind:'cancel'}),{status:409});
  const list=(await require('../src/domain/courseSessions').getSessions(db,group.id));
  const updated=await courses.save(group.id,{sessions:list.map((s,i)=>i?{...s,...interval(135)}:s)});
  assert.equal(updated.sessions.length,2);
  await assert.rejects(courses.save(group.id,{sessions:updated.sessions.map((s,i)=>i?s:{...s,...interval(134)})}),{status:409});
  const rows=await (await fetch(origin+'/api/bookings/availability?courseId='+serviceId)).json();
  assert.equal(rows.some(s=>s.id===group.id),false);
  await assert.rejects(bookings.update(b.booking.id,{status:'completed'}),{status:400});
});
test('Google exports each session separately and preserves identities through edits and group cancellation',async()=>{
  const group=await create(140);const calendar=require('../src/calendar/events');
  await calendar.reconcile(db);
  let events=(await db.query('SELECT * FROM calendar_events WHERE course_id=$1 ORDER BY session_id',[group.id])).rows;
  assert.equal(events.length,2);assert.match(events[0].desired.summary,/\/2\. alkalom/);
  const ids=events.map(e=>e.event_id);
  await courses.save(group.id,{sessions:group.sessions.map((s,i)=>i?{...s,...interval(144)}:s)});
  await calendar.reconcile(db);
  events=(await db.query('SELECT * FROM calendar_events WHERE course_id=$1 ORDER BY session_id',[group.id])).rows;
  assert.deepEqual(events.map(e=>e.event_id),ids);
  await courses.save(group.id,{active:false});await calendar.reconcile(db);
  assert.ok((await db.query('SELECT desired FROM calendar_events WHERE course_id=$1',[group.id])).rows.every(e=>e.desired===null));
});
test('competing registrations share the last seat across all sessions',async()=>{
  const group=await create(150,{capacity:1});
  const results=await Promise.allSettled([book(group),book(group)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(results.find(r=>r.status==='rejected').reason.status,409);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM bookings WHERE course_id=$1',[group.id])).rows[0].n,1);
});
test('Stripe fulfillment creates exactly one booking for the whole package and is idempotent',async()=>{
  const group=await create(160,{capacity:2});
  const result=await bookings.create({courseId:group.id,customerName:'Stripe Kurzus',customerEmail:'sessions-stripe@example.test',seats:2,billingData:billing},randomUUID());
  const session={id:'cs_test_sessions',metadata:{order_id:result.paymentId},client_reference_id:result.paymentId,mode:'payment',currency:'huf',amount_total:7800000,payment_status:'paid'};
  await orders.applySession(session);await orders.applySession(session);
  const rows=(await db.query('SELECT * FROM bookings WHERE course_id=$1',[group.id])).rows;
  assert.equal(rows.length,1);assert.equal(rows[0].seats,2);assert.equal(rows[0].total_price,78000);
  const mails=(await db.query('SELECT body FROM outbox WHERE recipient=$1',['sessions-stripe@example.test'])).rows;
  assert.equal(mails.length,1);assert.match(mails[0].body,/2\/2\. alkalom/);
});
test('a purchased package cannot be rescheduled into one with a different number of sessions',async()=>{
  const group=await create(170),single=await create(180,{sessions:[interval(180)]});
  const b=await book(group,'sessions-size@example.test');
  const mail=(await db.query('SELECT body FROM outbox WHERE recipient=$1',['sessions-size@example.test'])).rows[0].body;
  const token=mail.match(/booking\/manage#[a-f\d-]+\.([a-f\d]{64})/)[1];
  await assert.rejects(bookings.request(b.booking.id,token,{kind:'reschedule',course_id:single.id}),{status:409});
  await assert.rejects(bookings.update(b.booking.id,{course_id:single.id}),{status:409});
});
