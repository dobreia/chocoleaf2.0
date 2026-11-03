const crypto=require('node:crypto');
const {request,GoogleError,authFailure}=require('../calendar/google');
const SCOPES=['https://www.googleapis.com/auth/contacts','https://www.googleapis.com/auth/userinfo.email'];
const FIELDS='names,emailAddresses,memberships,clientData,metadata';
function config(){
  const origin=(process.env.FRONTEND_URL||'').split(',')[0];
  const redirect=process.env.GOOGLE_CONTACTS_REDIRECT_URI||origin+'/api/contacts/google/callback';
  const clientId=process.env.GOOGLE_CONTACTS_CLIENT_ID||process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret=process.env.GOOGLE_CONTACTS_CLIENT_SECRET||process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  const key=process.env.CONTACTS_TOKEN_KEY||process.env.CALENDAR_TOKEN_KEY||'';
  let urls=false;
  try{urls=[new URL(origin),new URL(redirect)].every(u=>!u.username&&!u.password&&(u.protocol==='https:'||
    (process.env.NODE_ENV!=='production'&&u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname))));}catch{}
  return {origin,redirect,clientId,clientSecret,key,ready:!!(urls&&clientId&&clientSecret&&/^[a-f0-9]{64}$/i.test(key))};
}
function encrypt(value){
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',Buffer.from(config().key,'hex'),iv);
  cipher.setAAD(Buffer.from('chocoleaf-contacts-v1'));
  const data=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
  return [iv,cipher.getAuthTag(),data].map(b=>b.toString('base64url')).join('.');
}
function decrypt(value){
  const [iv,tag,data]=value.split('.').map(s=>Buffer.from(s,'base64url'));
  const cipher=crypto.createDecipheriv('aes-256-gcm',Buffer.from(config().key,'hex'),iv);
  cipher.setAAD(Buffer.from('chocoleaf-contacts-v1'));cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(data),cipher.final()]).toString('utf8');
}
function token(body){const c=config();return request('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:c.clientId,client_secret:c.clientSecret,...body})});}
const api=(access,path,method='GET',body)=>request('https://people.googleapis.com/v1'+path,{method,
  headers:{Authorization:'Bearer '+access,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
function friendlyError(e){
  if(authFailure(e))return 'A Google-hozzáférés lejárt vagy visszavonták. Kapcsold össze újra a névjegyeket.';
  if(e.reason==='duplicate')return 'Több Google-névjegy tartozik ehhez az e-mail-címhez. Egyesítsd őket a Google Névjegyekben, majd indíts frissítést.';
  if(e.reason==='primary')return 'Ez a cím nem a Google-névjegy alapértelmezett e-mail-címe. Állítsd alapértelmezetté a Google-ben, majd frissíts.';
  if(e.reason==='group_collision')return 'Már létezik egy azonos nevű, nem a szinkron által kezelt Google-címke. Nevezd át a meglévő címkét, majd frissíts.';
  if(e.reason==='uncertain')return 'A Google nem igazolta vissza a létrehozást. Az eredményt újra ellenőrizzük; addig nem hozunk létre újabb névjegyet.';
  if(e.statusCode===403&&!['rateLimitExceeded','userRateLimitExceeded','RESOURCE_EXHAUSTED'].includes(e.reason))return 'A Google nem engedélyezi a névjegyek elérését. Ellenőrizd a People API engedélyezését és a névjegy-hozzáférést.';
  if([429,503].includes(e.statusCode)||e.reason==='network')return 'A Google átmenetileg nem érhető el vagy korlátozta a kéréseket. Automatikusan újrapróbáljuk.';
  return 'A névjegyek frissítése nem sikerült. A foglalások megmaradtak; a szinkron újrapróbálja a műveletet.';
}
module.exports={SCOPES,FIELDS,config,encrypt,decrypt,token,api,request,GoogleError,authFailure,friendlyError};
