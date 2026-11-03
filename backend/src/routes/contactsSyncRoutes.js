const express=require('express'),crypto=require('node:crypto');
const pool=require('../db');
const {hash,token,fail,uuid,email}=require('../domain/rules');
const {requireAdmin,rateLimit}=require('../domain/auth');
const google=require('../contacts/google');
const sync=require('../contacts/sync');
const {audience}=require('../contacts/model');
const admin=express.Router(),callback=express.Router();
const browserCookie='chocoleaf_contacts_oauth';
const cookies=req=>Object.fromEntries((req.headers.cookie||'').split(';').map(s=>s.trim().split('=')));
const cookieOptions=()=>({httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/api/contacts/google/callback',maxAge:600000});
admin.use(requireAdmin);
admin.get('/',async(_req,res)=>{
  const c=(await pool.query('SELECT * FROM contacts_connection WHERE id=1')).rows[0];
  const counts=(await pool.query(`SELECT count(*) FILTER(WHERE desired IS NOT NULL AND synced_hash=desired_hash)::int AS synced,
    count(*) FILTER(WHERE synced_hash IS DISTINCT FROM desired_hash)::int AS pending,
    count(*) FILTER(WHERE last_error IS NOT NULL)::int AS failed FROM contacts_people`)).rows[0];
  const snapshot=await audience(pool,c);
  const groupPending=(await pool.query('SELECT count(*)::int AS n FROM contacts_groups WHERE active AND (resource_name IS NULL OR synced_name IS DISTINCT FROM name)')).rows[0].n;
  counts.pending+=groupPending;
  const issues=(await pool.query(`SELECT email,last_error AS error,uncertain_since AS "uncertainSince",next_attempt_at AS "retryAt"
    FROM contacts_people WHERE last_error IS NOT NULL ORDER BY email LIMIT 100`)).rows;
  res.json({configured:google.config().ready,connected:c.enabled,needsAuth:c.needs_auth,accountEmail:c.account_email,
    includeCancelled:c.include_cancelled,campaignMode:c.campaign_mode,campaignCourses:c.campaign_courses,
    needsSelection:c.campaign_mode==='courses'&&!c.campaign_courses.length,
    lastScanAt:c.last_scan_at,lastSyncedAt:c.last_synced_at,retryAt:c.next_attempt_at,error:c.last_error,
    stale:!!(c.enabled&&!c.needs_auth&&new Date(c.next_attempt_at)<new Date()&&Date.now()-new Date(c.last_scan_at||c.connected_at)>180000),
    total:snapshot.people.length,campaignCount:snapshot.campaignCount,courses:snapshot.courses,
    contactsUrl:'https://contacts.google.com/'+(c.account_email?'?authuser='+encodeURIComponent(c.account_email):''),
    groups:(await pool.query('SELECT key,name,resource_name AS "resourceName" FROM contacts_groups ORDER BY key')).rows,
    issues,...counts});
});
function settings(body){
  if(typeof body.includeCancelled!=='boolean'||!['all','courses'].includes(body.campaignMode)||!Array.isArray(body.campaignCourses)||body.campaignCourses.length>1000)fail('Hibás címzettbeállítás.');
  const courses=[...new Set(body.campaignCourses.map(value=>uuid(value).toLowerCase()))];
  if(body.campaignMode==='courses'&&!courses.length)fail('Válassz ki legalább egy kurzust.');
  return {include_cancelled:body.includeCancelled,campaign_mode:body.campaignMode,campaign_courses:courses};
}
admin.post('/preview',async(req,res)=>{
  const snapshot=await audience(pool,settings(req.body));
  res.json({count:snapshot.campaignCount,people:snapshot.people.filter(p=>p.groups.includes('campaign')).map(p=>({name:p.name,email:p.email}))});
});
admin.put('/settings',async(req,res)=>{
  const c=settings(req.body);
  await sync.locked(async db=>{
    await db.query(`UPDATE contacts_connection SET include_cancelled=$1,campaign_mode=$2,campaign_courses=$3,
      next_attempt_at=now() WHERE id=1`,[c.include_cancelled,c.campaign_mode,JSON.stringify(c.campaign_courses)]);
  });
  res.status(202).json({message:'A címzettcsoport beállításai mentve. A Google-címkéket a következő szinkron frissíti.'});
  void sync.tick().catch(()=>{});
});
admin.post('/connect',rateLimit,async(req,res)=>{
  const config=google.config();if(!config.ready)fail('A Google Névjegyek egyszeri szerverbeállítása még hiányzik.',503);
  const state=token(),browser=token(),verifier=token();
  await sync.locked(async db=>{
    await db.query('DELETE FROM contacts_oauth_states');
    await db.query(`INSERT INTO contacts_oauth_states(hash,browser_hash,session_hash,verifier,expires_at)
      VALUES($1,$2,$3,$4,now()+interval '10 minutes')`,[hash(state),hash(browser),hash(cookies(req).chocoleaf_session||''),google.encrypt(verifier)]);
  });
  res.cookie(browserCookie,browser,cookieOptions());
  res.json({url:'https://accounts.google.com/o/oauth2/v2/auth?'+new URLSearchParams({client_id:config.clientId,redirect_uri:config.redirect,
    response_type:'code',scope:google.SCOPES.join(' '),state,access_type:'offline',prompt:'consent select_account',
    code_challenge:crypto.createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'})});
});
callback.get('/google/callback',rateLimit,async(req,res)=>{
  res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});let result='failed';
  try{
    if(!google.config().ready||typeof req.query.state!=='string'||req.query.state.length>200)throw Error('state');
    await sync.locked(async db=>{
      const state=(await db.query(`DELETE FROM contacts_oauth_states WHERE hash=$1 AND browser_hash=$2
        AND expires_at>now() AND EXISTS(SELECT 1 FROM sessions s WHERE s.hash=session_hash AND s.expires_at>now()) RETURNING *`,
      [hash(req.query.state),hash(cookies(req)[browserCookie]||'')])).rows[0];
      if(!state){result='expired';return;}if(req.query.error){result='denied';return;}
      if(typeof req.query.code!=='string'||req.query.code.length>4096)throw Error('code');
      const auth=await google.token({code:req.query.code,grant_type:'authorization_code',redirect_uri:google.config().redirect,code_verifier:google.decrypt(state.verifier)});
      if(!auth.access_token||!auth.refresh_token||!google.SCOPES.every(scope=>(auth.scope||'').split(' ').includes(scope))){result='permissions';return;}
      const profile=await google.request('https://www.googleapis.com/oauth2/v2/userinfo',{headers:{Authorization:'Bearer '+auth.access_token}});
      if(!profile.email||!profile.verified_email)throw Error('identity');
      const old=(await db.query('SELECT * FROM contacts_connection WHERE id=1')).rows[0];
      if(old.enabled&&old.account_email!==profile.email){result='different_account';return;}
      await db.query('BEGIN');
      try{
        if(old.account_email&&old.account_email!==profile.email){await db.query('DELETE FROM contacts_people');await db.query('UPDATE contacts_groups SET resource_name=NULL,synced_name=NULL');}
        await db.query(`UPDATE contacts_connection SET enabled=true,needs_auth=false,account_email=$1,refresh_token=$2,
          last_error=NULL,attempts=0,next_attempt_at=now(),audit_at=now(),connected_at=now() WHERE id=1`,[profile.email,google.encrypt(auth.refresh_token)]);
        await db.query('UPDATE contacts_people SET synced_hash=NULL,next_attempt_at=now(),attempts=0,last_error=NULL');
        await db.query('COMMIT');
      }catch(e){await db.query('ROLLBACK');throw e;}
      result='connected';
    });
  }catch{/* Never expose OAuth tokens, provider response bodies or authorization codes. */}
  res.clearCookie(browserCookie,{...cookieOptions(),maxAge:undefined});
  res.redirect(303,google.config().origin+'/admin/customer-sync?google='+result);
  if(result==='connected')void sync.tick().catch(()=>{});
});
admin.post('/sync',rateLimit,async(_req,res)=>{
  await sync.locked(async db=>{
    const c=(await db.query('SELECT enabled,needs_auth FROM contacts_connection WHERE id=1')).rows[0];
    if(!c.enabled||c.needs_auth)fail('Először kapcsold össze a Google Névjegyeket.',409);
    await db.query('UPDATE contacts_connection SET next_attempt_at=now(),audit_at=now() WHERE id=1');
    await db.query('UPDATE contacts_people SET synced_hash=NULL,next_attempt_at=now(),attempts=0,last_error=NULL');
  });
  res.status(202).json({message:'A névjegyek és címkék teljes ellenőrzését sorba állítottuk.'});void sync.tick().catch(()=>{});
});
admin.post('/retry-create',async(req,res)=>{
  const address=email(req.body.email);if(req.body.confirm!==true)fail('Előbb ellenőrizd a Google Névjegyekben, hogy nem jött létre a névjegy.');
  await sync.locked(async db=>{
    const r=await db.query(`UPDATE contacts_people SET uncertain_since=NULL,last_error=NULL,attempts=0,next_attempt_at=now()
      WHERE email=$1 AND uncertain_since IS NOT NULL AND resource_name IS NULL`,[address]);
    if(!r.rowCount)fail('Ehhez az ügyfélhez nincs bizonytalan létrehozási művelet.',409);
    await db.query('UPDATE contacts_connection SET next_attempt_at=now() WHERE id=1');
  });
  res.json({message:'Az ismételt létrehozást engedélyezted. Előtte még egyszer megkeressük a meglévő névjegyet.'});void sync.tick().catch(()=>{});
});
admin.post('/disconnect',async(_req,res)=>{
  await sync.locked(async db=>{
    await db.query('UPDATE contacts_connection SET enabled=false,refresh_token=NULL,needs_auth=false,last_error=NULL WHERE id=1');
    await db.query('DELETE FROM contacts_oauth_states');
  });
  res.json({message:'A névjegyszinkron leállt. A Google-ben lévő névjegyek és címkék megmaradtak.'});
});
module.exports={admin,callback};
