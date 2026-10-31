const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
Object.assign(process.env,{FRONTEND_URL:'http://localhost:5173',MAIL_FROM:'',MAIL_ADMIN:'',SMTP_HOST:'',MAIL_USER:''});
let db,server,base,cookie,services,groups,alice,aliceCancelled,bob,dana,carol;
const day=n=>new Date(Date.now()+n*86400000).toISOString().slice(0,10)+'T09:00:00Z';
async function req(path,method='GET',body,auth=true){
  const r=await fetch(base+'/api/admin'+path,{method,headers:{'Content-Type':'application/json',...(auth?{cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  return {status:r.status,data:await r.json()};
}
const emails=rows=>rows.map(row=>row.email).sort();
before(async()=>{
  db=await require('./database.cjs')();await require('../src/migrate')();
  await db.query('INSERT INTO admins(email,password_hash) VALUES($1,$2)',['customers@example.test',await require('../src/domain/auth').passwordHash('Customer-test-password!')]);
  const courses=require('../src/domain/courses');services=[];groups=[];
  for(const [index,title] of ['History A','History B','Deleted History'].entries()){
    const service=await courses.serviceSave(null,{title,duration_minutes:90,price:1000,capacity:10,session_count:index===0?2:1});services.push(service);
    groups.push(await courses.save(null,{service_id:service.id,sessions:Array.from({length:service.session_count},(_,n)=>({start_time:day(500+index*10+n*2)}))}));
  }
  const bookings=require('../src/domain/bookings');
  const book=async(group,name,email)=> (await bookings.create({courseId:group.id,customerName:name,customerEmail:email,seats:1},randomUUID(),{manual:true})).booking;
  alice=await book(groups[0],'Alice','alice@example.test');
  aliceCancelled=await book(groups[1],'Alice','alice@example.test');await bookings.update(aliceCancelled.id,{status:'cancelled'});
  bob=await book(groups[1],'Bob','bob@example.test');
  dana=await book(groups[1],'Dana','dana@example.test');await bookings.update(dana.id,{status:'cancelled'});
  carol=await book(groups[2],'Carol','carol@example.test');
  await db.query("UPDATE bookings SET customer_email='ALICE@example.test',admin_note='do not expose',manage_hash='secret management hash' WHERE id=$1",[alice.id]);
  server=require('../src/index').listen(0,'127.0.0.1');await new Promise(resolve=>server.on('listening',resolve));base='http://127.0.0.1:'+server.address().port;
  const r=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'customers@example.test',password:'Customer-test-password!'})});cookie=r.headers.get('set-cookie').split(';')[0];
});
after(async()=>{if(server)await new Promise(resolve=>server.close(resolve));await db?.end();});

test('customers are deduplicated by email and course/status filters match the same booking',async()=>{
  assert.deepEqual(emails((await req('/customers')).data),['alice@example.test','bob@example.test','carol@example.test']);
  const list=(await req('/customers?service='+services[0].id)).data;assert.deepEqual(emails(list),['alice@example.test']);
  assert.equal(list[0].bookings,2);assert.deepEqual(list[0].courses,['History A','History B']);
  assert.deepEqual(emails((await req('/customers?service='+services[1].id)).data),['bob@example.test']);
  assert.deepEqual(emails((await req('/customers?service='+services[1].id+'&status=cancelled')).data),['alice@example.test','dana@example.test']);
  assert.deepEqual(emails((await req('/customers?service='+services[1].id+'&status=all')).data),['alice@example.test','bob@example.test','dana@example.test']);
  assert.deepEqual((await req('/customers?service='+services[1].id+'&q=Alice')).data,[]);
  assert.deepEqual(emails((await req('/customers?q=History%20A')).data),['alice@example.test']);
  const history=(await req('/customers/history?email=ALICE%40example.test')).data;
  assert.equal(history.length,2);assert.equal(history.find(row=>row.booking_id===alice.id).sessions.length,2);
  assert.equal(history.find(row=>row.booking_id===aliceCancelled.id).status,'cancelled');
  for(const secret of ['manage_hash','billing_data','admin_note','do not expose','secret management hash'])assert.ok(!JSON.stringify(history).includes(secret));
});

test('live history follows session edits, service renames and rescheduling without duplicating bookings',async()=>{
  const courses=require('../src/domain/courses');
  await courses.save(groups[0].id,{sessions:groups[0].sessions.map((session,index)=>index?{...session,start_time:day(504),end_time:new Date(+new Date(day(504))+90*60000).toISOString()}:session)});
  let history=(await req('/customers/history?email=alice@example.test')).data;
  assert.equal(+new Date(history.find(row=>row.booking_id===alice.id).sessions[1].start_time),+new Date(day(504)));
  const target=await courses.save(null,{service_id:services[0].id,sessions:[{start_time:day(506)},{start_time:day(508)}]});
  await require('../src/domain/bookings').update(alice.id,{course_id:target.id});
  await courses.serviceSave(services[0].id,{...services[0],title:'Renamed History A'});
  history=(await req('/customers/history?email=alice@example.test')).data;
  assert.equal(history.length,2);assert.equal(history.find(row=>row.booking_id===alice.id).course_id,target.id);
  assert.equal(history.find(row=>row.booking_id===alice.id).course_title,'Renamed History A');
  assert.equal((await req('/customers/services')).data.find(row=>row.id===services[0].id).title,'Renamed History A');
});

test('permanent deletion preserves a short customer history even after the course and service are removed',async()=>{
  assert.equal((await req('/bookings/'+carol.id,'DELETE')).status,409);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM customer_booking_archive')).rows[0].n,0);
  await require('../src/domain/bookings').update(carol.id,{status:'cancelled'});
  assert.equal((await req('/bookings/'+carol.id,'DELETE')).status,200);
  assert.equal((await req('/bookings/'+carol.id)).status,404);
  assert.equal((await req('/courses/'+groups[2].id,'DELETE')).status,200);
  await db.query('DELETE FROM services WHERE id=$1',[services[2].id]);
  assert.ok(!emails((await req('/customers')).data).includes('carol@example.test'));
  const customers=(await req('/customers?service='+services[2].id+'&status=all')).data;
  assert.deepEqual(emails(customers),['carol@example.test']);assert.equal(customers[0].bookings,1);
  const history=(await req('/customers/history?email=carol@example.test')).data;
  assert.equal(history.length,1);assert.ok(history[0].archived_at);assert.equal(history[0].course_title,'Deleted History');
  assert.equal(history[0].status,'cancelled');assert.equal(history[0].sessions.length,1);
  const option=(await req('/customers/services')).data.find(row=>row.id===services[2].id);
  assert.equal(option.archived,true);assert.equal(option.title,'Deleted History');
  assert.equal((await req('/customers','PUT',{original_email:'carol@example.test',email:'carol@example.test',name:'Carol Updated',phone:'+361234567'})).status,200);
  const saved=(await req('/customers?status=all&q=Carol%20Updated')).data;
  assert.equal(saved[0].phone,'+361234567');
  const before=(await db.query('SELECT * FROM customer_booking_archive')).rows;
  await require('../src/migrate')();assert.deepEqual((await db.query('SELECT * FROM customer_booking_archive')).rows,before);
});

test('customer endpoints require admin, validate input and keep customer edits connected to live history',async()=>{
  for(const path of ['/customers','/customers/services','/customers/history?email=alice@example.test'])assert.equal((await req(path,'GET',undefined,false)).status,401);
  for(const path of ['/customers?service=invalid','/customers?status=invalid','/customers/history?email=invalid'])assert.equal((await req(path)).status,400);
  assert.deepEqual((await req('/customers?service='+randomUUID())).data,[]);
  assert.equal((await req('/customers','PUT',{original_email:'alice@example.test',email:'different@example.test',name:'Alice',phone:''})).status,400);
  assert.equal((await req('/customers','PUT',{original_email:'alice@example.test',email:'alice@example.test',name:'Alice Updated',phone:'+36301234567'})).status,200);
  const rows=(await req('/customers?q=Alice%20Updated')).data;assert.equal(rows.length,1);assert.equal(rows[0].bookings,2);
  assert.equal((await db.query('SELECT customer_name FROM bookings WHERE id=$1',[alice.id])).rows[0].customer_name,'Alice Updated');
});

test('internal customer notes persist independently, validate input and survive booking deletion',async()=>{
  const profile={original_email:'BOB@example.test',email:'bob@example.test',name:'Bob',phone:''};
  const note='Belső megjegyzés\nMásodik sor <script>teszt</script>';
  assert.equal((await req('/customers','PUT',{...profile,note},false)).status,401);
  assert.equal((await req('/customers','PUT',{...profile,note})).status,200);
  const saved=async()=> (await req('/customers?status=all&q=bob@example.test')).data[0];
  assert.equal((await saved()).note,note);
  assert.equal((await req('/customers','PUT',profile)).status,200);
  assert.equal((await saved()).note,note); // Older clients must not erase notes.
  for(const invalid of ['x'.repeat(10001),null,{}])assert.equal((await req('/customers','PUT',{...profile,note:invalid})).status,400);
  assert.equal((await saved()).note,note);
  const unknown={...profile,original_email:'unknown@example.test',email:'unknown@example.test',note};
  assert.equal((await req('/customers','PUT',unknown)).status,404);
  assert.equal((await db.query('SELECT * FROM customer_notes WHERE customer_email=$1',[unknown.email])).rowCount,0);
  await require('../src/domain/bookings').update(bob.id,{status:'cancelled'});
  assert.equal((await req('/bookings/'+bob.id,'DELETE')).status,200);
  assert.equal((await saved()).note,note);
  assert.ok(!JSON.stringify((await req('/customers/history?email=bob@example.test')).data).includes(note));
  assert.equal((await req('/customers','PUT',{...profile,note:''})).status,200);
  assert.equal((await saved()).note,'');
});
