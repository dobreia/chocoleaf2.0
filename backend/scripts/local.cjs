// Development-only launcher. Never used by npm start / production.
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname,'..');
require('dotenv').config({path:path.join(root,'.env'),quiet:true});
require('dotenv').config({path:path.join(root,'.env.local-test'),override:true,quiet:true});
const check = process.argv.includes('--check');
const setupOnly = process.argv.includes('--setup');
const mailSettings = require('../src/lib/smtp');
const mailMode = mailSettings.localMode(process.env, check);
const children = [];
let smtp, mailTimer, stopping = false;
const apiPort = 3002, webPort = 5174;
const apiUrl = `http://127.0.0.1:${apiPort}`, webUrl = `http://127.0.0.1:${webPort}`;
Object.assign(process.env,{NODE_ENV:'development',PAYMENT_LOCAL_TEST:'1',FRONTEND_URL:webUrl,PORT:String(apiPort),HOST:'127.0.0.1',LOCAL_API_URL:apiUrl,VITE_API_URL:'/api'});
function launch(file,args,options={}) {
  const child=spawn(file,args,{cwd:root,env:process.env,windowsHide:true,stdio:'inherit',...options});
  children.push(child);
  child.on('error',e=>{console.error('Nem indítható:',e.code);stop(1);});
  child.on('exit',()=>{if(!stopping)stop(1);});
  return child;
}
function stop(code=0) {
  if(stopping)return;stopping=true;process.exitCode=code;clearInterval(mailTimer);
  flushMail();
  for(const child of children)child.kill();
  smtp?.close().catch(()=>{});
  setTimeout(()=>process.exit(code),1000).unref();
}
function flushMail() {
  if(!smtp)return;
  const mailbox=path.join(root,'.local-mail');
  for(const mail of smtp.messages.splice(0))fs.writeFileSync(path.join(mailbox,`${Date.now()}-${require('node:crypto').randomUUID()}.eml`),mail);
}
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
async function setup() {
  const {Pool}=require('pg');
  const url=process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
  const host=url?.hostname || process.env.DB_HOST || 'localhost';
  if(!['localhost','127.0.0.1','::1','[::1]'].includes(host))throw Error('A helyi indító kizárólag helyi PostgreSQL-t használhat.');
  const control=new Pool(url?{connectionString:url.href,connectionTimeoutMillis:5000}:{host,port:process.env.DB_PORT||5432,database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD,connectionTimeoutMillis:5000});
  try {
    if(!(await control.query("SELECT 1 FROM pg_database WHERE datname='chocoleaf_stripe_local'")).rowCount)
      await control.query('CREATE DATABASE chocoleaf_stripe_local');
  } finally {await control.end();}
  if(url){url.pathname='/chocoleaf_stripe_local';process.env.DATABASE_URL=url.href;}
  process.env.DB_NAME='chocoleaf_stripe_local';
  const db=require('../src/db');
  try {
    await require('../src/migrate')();
    if(!(await db.query('SELECT 1 FROM admins LIMIT 1')).rowCount && process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD?.length>=12){
      const {passwordHash}=require('../src/domain/auth');
      await db.query('INSERT INTO admins(email,password_hash) VALUES($1,$2)',[process.env.ADMIN_EMAIL.trim().toLowerCase(),await passwordHash(process.env.ADMIN_PASSWORD)]);
    }
    await require('./seed-local.cjs')(db);
  } finally {await db.end();}
  console.log('Külön helyi tesztadatbázis és tesztidőpont előkészítve.');
}
async function free(port) {
  await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',()=>reject(Error(`A ${port} port foglalt. Állítsd le az ott futó fejlesztői szervert.`)));s.listen(port,'127.0.0.1',()=>s.close(resolve));});
}
async function main() {
  if(!check && !setupOnly && mailMode==='real') await mailSettings.verifyReal();
  if(!setupOnly){await free(apiPort);await free(webPort);}
  await setup();
  if(setupOnly)return;
  if(!check && !/^sk_test_[A-Za-z0-9]+$/.test(process.env.STRIPE_SECRET_KEY||'')){
    console.log('Még ezt kell megadnod: backend/.env.local-test → STRIPE_SECRET_KEY=sk_test_...');
    console.log('Utána indítsd újra: npm run local');process.exitCode=1;return;
  }
  if(mailMode==='capture') {
    smtp=await require('../test/smtp.cjs')();
    Object.assign(process.env,{SMTP_HOST:'127.0.0.1',SMTP_PORT:String(smtp.port),MAIL_USER:'',MAIL_PASS:'',MAIL_FROM:'ChocoLeaf teszt <teszt@localhost>',MAIL_ADMIN:'admin@localhost'});
    const mailbox=path.join(root,'.local-mail');fs.mkdirSync(mailbox,{recursive:true});
    mailTimer=setInterval(flushMail,1000);
  } else console.log('Valódi SMTP-emailküldés bekapcsolva: a vásárlói és adminlevelek a megadott címzettekhez mennek.');
  if(!check){
    console.log('Stripe teszt-webhook csatlakoztatása…');
    const cli=require.resolve('@stripe/cli-win32-x64/package.json');
    const binary=path.join(path.dirname(cli),'bin','stripe.exe');
    const secret=await new Promise((resolve,reject)=>{
      const child=launch(binary,['listen','--forward-to',apiUrl+'/api/payments/webhook','--events','checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.expired'],{stdio:['ignore','pipe','pipe'],env:{...process.env,STRIPE_API_KEY:process.env.STRIPE_SECRET_KEY}});
      let buffer='';const timer=setTimeout(()=>reject(Error('A Stripe nem válaszolt. Ellenőrizd a tesztkulcsot és az internetkapcsolatot.')),45000);
      const read=chunk=>{buffer=(buffer+chunk.toString()).slice(-16000);const match=buffer.match(/whsec_[A-Za-z0-9]+(?=[\s\x1b])/);if(match){clearTimeout(timer);resolve(match[0]);}};
      child.stdout.on('data',read);child.stderr.on('data',read);child.once('exit',()=>{clearTimeout(timer);reject(Error('A Stripe CLI leállt. Ellenőrizd a tesztkulcsot.'));});
    });
    process.env.STRIPE_WEBHOOK_SECRET=secret;
    console.log('Stripe webhook csatlakoztatva; a titok automatikusan átadva a backendnek.');
  } else {process.env.STRIPE_SECRET_KEY='';process.env.STRIPE_WEBHOOK_SECRET='';}
  launch(process.execPath,[path.join(root,'src/index.js')]);
  launch(process.execPath,[path.join(root,'../frontend/node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port',String(webPort),'--strictPort'],{cwd:path.resolve(root,'../frontend')});
  let ready=false;
  for(let i=0;i<40;i++){
    if(stopping)return;
    try {const a=await fetch(apiUrl+'/api/health',{signal:AbortSignal.timeout(2000)});const b=await fetch(webUrl+'/api/health',{signal:AbortSignal.timeout(2000)});if(a.ok&&b.ok){ready=true;break;}}catch{/* wait for startup */}
    await new Promise(r=>setTimeout(r,250));
  }
  if(!ready)throw Error('A helyi szerverek nem indultak el időben.');
  console.log(`Weboldal: ${webUrl} | Admin: ${webUrl}/admin`);
  console.log(`Időpontválasztó minta: ${webUrl}/idopont-minta`);
  console.log('Billingo kikapcsolva ebben a tesztben. '+(mailMode==='real'?'Email: valódi kézbesítés.':'A levelek: backend/.local-mail (EML fájlok).')+' Leállítás: Ctrl+C.');
  if(check){
    const slots=await(await fetch(webUrl+'/api/bookings/availability')).json();
    if(!Array.isArray(slots)||!slots.length)throw Error('A tesztidőpont nem érhető el a felületről.');
    if(process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD){
      const login=await fetch(webUrl+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:webUrl},body:JSON.stringify({email:process.env.ADMIN_EMAIL,password:process.env.ADMIN_PASSWORD})});
      if(!login.ok)throw Error('A helyi admin belépés nem sikerült a backend/.env adataival.');
      const cookie=login.headers.get('set-cookie')?.split(';')[0];
      const admin=await fetch(webUrl+'/api/admin/bookings',{headers:{cookie}});
      if(!admin.ok)throw Error('A helyi admin jogosultság ellenőrzése nem sikerült.');
      await fetch(webUrl+'/api/auth/logout',{method:'POST',headers:{cookie,Origin:webUrl}});
      console.log('Admin belépés és tesztidőpont: OK.');
    }
    await require('nodemailer').createTransport({host:'127.0.0.1',port:smtp.port,secure:false}).sendMail({from:'teszt@localhost',to:'helyi@localhost',subject:'ChocoLeaf helyi indítás ellenőrzése',text:'A helyi levélfogadó működik. Ez a levél nem került ki az internetre.'});
    if(!smtp.messages.length)throw Error('A helyi levélfogadó nem kapta meg a tesztlevelet.');
    flushMail();
    console.log('Helyi indítás, frontend → backend → adatbázis és SMTP-fájlkimenet: OK.');stop();
  }
}
main().catch(e=>{console.error(e.message);stop(1);});
