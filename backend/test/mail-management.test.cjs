const {test,before,after,beforeEach}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const nodemailer=require('nodemailer');
const {renderEmail}=require('../src/lib/mailTemplate');
Object.assign(process.env,{NODE_ENV:'development',FRONTEND_URL:'http://localhost:5173',MAIL_FROM:'mail@example.test',MAIL_ADMIN:'admin@example.test',MAIL_USER:'',MAIL_PASS:'',SMTP_HOST:'127.0.0.1',STRIPE_SECRET_KEY:'',STRIPE_WEBHOOK_SECRET:'',BILLINGO_API_KEY:'',TRANSFER_BENEFICIARY:'Test',TRANSFER_ACCOUNT:'11111111-22222222-33333333'});
let db,server,smtp,base,cookie;
async function req(path,method='GET',body,auth=true){const r=await fetch(base+'/api'+path,{method,headers:{'Content-Type':'application/json',...(auth?{cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json()};}
before(async()=>{
 db=await require('./database.cjs')();await require('../src/migrate')();
 smtp=await require('./smtp.cjs')();process.env.SMTP_PORT=String(smtp.port);
 await db.query('INSERT INTO admins(email,password_hash) VALUES($1,$2)',['mail-admin@example.test',await require('../src/domain/auth').passwordHash('Mail-test-password!')]);
 server=require('../src/index').listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));base='http://127.0.0.1:'+server.address().port;
 const r=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'mail-admin@example.test',password:'Mail-test-password!'})});cookie=r.headers.get('set-cookie').split(';')[0];
});
beforeEach(async()=>{await db.query('DELETE FROM outbox');smtp.messages.length=0;});
after(async()=>{if(server)await new Promise(r=>server.close(r));await smtp?.close();await db?.end();});

test('shared template escapes untrusted fields and never creates a script action',()=>{
 const html=renderEmail({title:'<img onerror="alert(1)">',body:'Kedves <script>alert(1)</script>!\n\nÁtutalási adatok\nKözlemény: <b>test</b>',action:{label:'Open',url:'javascript:alert(1)'}});
 assert.ok(html.includes('#6C485C'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img'));assert.ok(!html.includes('href="javascript:'));
});
test('admin-only list and preview are paginated, exclude attachment data, and preserve sent history',async()=>{
 const {queue,deliver}=require('../src/domain/notifications');await queue(db,'customer@example.test','ChocoLeaf – Teszt','Kedves Ügyfél!\n\nTesztlevél.',[{filename:'test.pdf',content:Buffer.from('%PDF-test').toString('base64')}]);
 const first=(await req('/admin/mail')).data.items[0];
 assert.equal((await req('/admin/mail','GET',undefined,false)).status,401);
 assert.equal((await req('/admin/mail/'+first.id,'GET',undefined,false)).status,401);
 assert.equal(first.attachment_count,1);assert.equal(first.body,undefined);assert.equal(first.attachments,undefined);
 const preview=await req('/admin/mail/'+first.id);assert.equal(preview.status,200);assert.ok(preview.data.html.includes('ChocoLeaf'));assert.ok(preview.data.body.includes('Tesztlevél'));
 await deliver();assert.equal(smtp.messages.length,1);assert.ok(smtp.messages[0].includes('text/plain'));assert.ok(smtp.messages[0].includes('text/html'));assert.ok(smtp.messages[0].includes('application/pdf'));
 assert.equal((await req('/admin/mail/'+first.id+'/retry','POST',{})).status,409);assert.equal((await req('/admin/mail/'+first.id,'DELETE')).status,409);
 assert.equal((await req('/admin/mail?status=sent')).data.counts.sent,1);
 for(let i=0;i<26;i++)await queue(db,'customer@example.test','Page '+i,'Test');
 assert.equal((await req('/admin/mail?status=pending')).data.items.length,25);assert.equal((await req('/admin/mail?status=pending&page=2')).data.items.length,1);
 assert.equal((await req('/admin/mail?status=invalid')).status,400);
});
test('obsolete calendar format is stopped with a useful error and never blocks a valid letter',async()=>{
 const {queue,deliver}=require('../src/domain/notifications');
 const old=(await db.query('INSERT INTO outbox(recipient,subject,body,calendar) VALUES($1,$2,$3,$4) RETURNING id',['old@example.test','Old','Old booking notification',{format:'gmail',reservations:[],from:'ChocoLeaf <mail@example.test>'}])).rows[0];
 await queue(db,'valid@example.test','Valid','Valid body');await deliver();
 assert.equal(smtp.messages.length,1);
 const failed=(await db.query('SELECT * FROM outbox WHERE id=$1',[old.id])).rows[0];assert.equal(failed.attempts,1);assert.equal(failed.retry_stopped,true);assert.match(failed.last_error,/régi vagy hibás naptárformátum/);
 await db.query('UPDATE outbox SET next_attempt=now() WHERE id=$1',[old.id]);await deliver();assert.equal((await db.query('SELECT attempts FROM outbox WHERE id=$1',[old.id])).rows[0].attempts,1);
 assert.equal((await req('/admin/mail?status=failed')).data.items.length,1);
 assert.equal((await req('/admin/mail/'+old.id+'/retry','POST',{})).status,409);
 assert.equal((await req('/admin/mail/'+old.id,'DELETE',undefined,false)).status,401);
 assert.equal((await req('/admin/mail/'+old.id,'DELETE')).status,200);
 assert.equal((await req('/admin/mail')).data.counts.pending,0);
});
test('SMTP errors are stored without credentials, retry schedules once and successful delivery clears the error',async()=>{
 const {queue,deliver}=require('../src/domain/notifications');await queue(db,'retry@example.test','Retry','Retry body');
 const original=nodemailer.createTransport;nodemailer.createTransport=()=>({sendMail:async()=>{throw Object.assign(new Error('secret-password should never be saved'),{code:'EAUTH'});}});
 try{await deliver();}finally{nodemailer.createTransport=original;}
 const row=(await db.query('SELECT * FROM outbox')).rows[0];assert.equal(row.attempts,1);assert.equal(row.retry_stopped,false);assert.match(row.last_error,/bejelentkezést/);assert.ok(!row.last_error.includes('secret-password'));assert.equal(smtp.messages.length,0);
 assert.equal((await req('/admin/mail/'+row.id+'/retry','POST',{},false)).status,401);
 assert.equal((await req('/admin/mail/'+row.id+'/retry','POST',{})).status,200);assert.equal(smtp.messages.length,0);
 await deliver();const sent=(await db.query('SELECT * FROM outbox')).rows[0];assert.ok(sent.sent_at);assert.equal(sent.last_error,null);assert.equal(sent.attempts,2);assert.equal(smtp.messages.length,1);
});
test('stale calendar revisions cannot be retried',async()=>{
 const id=randomUUID();await db.query('INSERT INTO outbox(id,recipient,subject,body,calendar) VALUES($1,$2,$3,$4,$5)',[id,'old@example.test','Stale','Stale',{uid:'missing-event',sequence:0,method:'REQUEST',filename:'event.ics',content:'BEGIN:VCALENDAR\r\nEND:VCALENDAR'}]);
 assert.equal((await req('/admin/mail/'+id+'/retry','POST',{})).status,409);
});
test('gift notifications include billing sections and a read-only admin link; issued PDFs are one personalized plural email',async()=>{
 const billing={buyerType:'company',companyName:'Test <Kft>',taxNumber:'12345678-1-12',billingEmail:'billing@example.test',postCode:'1111',city:'Budapest',street:'Test 1.'};
 const r=await req('/giftcard/start-payment','POST',{email:'gifts@example.test',amount:19000,quantity:2,names:['First Guest','Second Guest'],billingData:billing,paymentMethod:'transfer'},false);assert.equal(r.status,200,JSON.stringify(r.data));
 const mails=(await db.query("SELECT * FROM outbox WHERE recipient='admin@example.test'")).rows;assert.equal(mails.length,1);const mail=mails[0];
 assert.ok(mail.body.includes('billing@example.test'));assert.ok(mail.html.includes('Test &lt;Kft&gt;'));assert.ok(!mail.html.includes('/api/giftcard/admin/mark-paid'));assert.ok(mail.html.includes('/admin/giftcards?order='));assert.ok(mail.html.includes('Rendelés megnyitása'));
 assert.equal((await req('/giftcard/admin/orders?order='+r.data.id)).data.length,1);
 assert.equal((await req('/giftcard/admin/mark-paid','POST',{id:r.data.id})).status,200);
 const voucher=(await db.query("SELECT * FROM outbox WHERE recipient='gifts@example.test' AND jsonb_array_length(attachments)>0")).rows[0];assert.equal(voucher.subject,'ChocoLeaf – Ajándékutalványaid megérkeztek');assert.equal(voucher.attachments.length,2);assert.ok(voucher.html.includes('PDF-csatolmányként'));assert.ok(voucher.body.includes('First Guest'));assert.ok(voucher.body.includes('Second Guest'));
});
