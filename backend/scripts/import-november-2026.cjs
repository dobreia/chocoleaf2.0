// Explicit, repeatable import for the existing local development database.
// Preview: node scripts/import-november-2026.cjs ; apply: append --apply.
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const root=path.resolve(__dirname,'..');
require('dotenv').config({path:path.join(root,'.env'),quiet:true});
require('dotenv').config({path:path.join(root,'.env.local-test'),override:true,quiet:true});
if(process.env.DATABASE_URL){
  const url=new URL(process.env.DATABASE_URL);
  if(!['localhost','127.0.0.1','[::1]','::1'].includes(url.hostname))throw Error('Kizárólag helyi adatbázison futtatható.');
  url.pathname='/chocoleaf_stripe_local';process.env.DATABASE_URL=url.href;
}else if(!['localhost','127.0.0.1','::1'].includes(process.env.DB_HOST||'localhost'))throw Error('Kizárólag helyi adatbázison futtatható.');
process.env.DB_NAME='chocoleaf_stripe_local';
const db=require('../src/db');
const plan=[
  ['Csokoládé Alapélmény','2026-11-13',16,4],
  ['Csokoládé Alapélmény','2026-11-20',16,6],
  ['Csokoládé Alapélmény','2026-11-27',16,6],
  ['Csokoládé Alapélmény','2026-11-28',10,0],
  ['Limitált Ízek Laborja','2026-11-14',10,6],
  ['Limitált Ízek Laborja','2026-11-24',16,6],
];
async function main(){
  const apply=process.argv.includes('--apply');
  if(apply)await require('../src/migrate')();
  const c=await db.connect();
  try{
    await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(829105)');await c.query('SELECT pg_advisory_xact_lock(829108)');
    const services=(await c.query('SELECT * FROM services ORDER BY title FOR UPDATE')).rows;
    const oldCourses=(await c.query('SELECT * FROM courses ORDER BY start_time FOR UPDATE')).rows;
    const oldSessions=(await c.query('SELECT * FROM course_sessions ORDER BY start_time')).rows;
    if((await c.query("SELECT 1 FROM payment_orders WHERE status='pending' AND booking_id IS NULL LIMIT 1")).rowCount)throw Error('Folyamatban lévő fizetés van. Az import nem változtatott az időpontokon.');
    const prepared=[];
    for(const [title,day,hour,free] of plan){
      const service=services.find(s=>s.title===title);
      if(!service||service.session_count!==1)throw Error('Hiányzó vagy többalkalmas szolgáltatás: '+title);
      const start=new Date(`${day}T${String(hour).padStart(2,'0')}:00:00+01:00`),end=new Date(+start+120*60000);
      const matches=oldCourses.filter(x=>x.service_id===service.id&&+new Date(x.start_time)===+start);
      if(matches.length>1)throw Error('Többszörös időpont: '+title+' '+day);
      const old=matches[0],id=old?.id||randomUUID();
      const booked=old?(await c.query("SELECT COALESCE(sum(seats),0)::int n FROM bookings WHERE course_id=$1 AND status<>'cancelled'",[id])).rows[0].n:0;
      const capacity=old?.capacity??service.capacity;
      const reserved=capacity-booked-free;
      if(reserved<0)throw Error('A meglévő foglalásokkal nem állítható be a kért szabad hely: '+day);
      if(old&&(+new Date(old.end_time)!==+end||oldSessions.filter(s=>s.course_id===id).length!==1))throw Error('Az egyező időpont eltérő alkalmakat tartalmaz; kézi egyeztetés szükséges: '+day);
      prepared.push({service,id,old,start,end,capacity,reserved,free});
    }
    console.log(JSON.stringify({database:'chocoleaf_stripe_local',apply,dates:prepared.map(x=>({title:x.service.title,start:x.start.toISOString(),end:x.end.toISOString(),free:x.free})),inactiveServices:services.filter(s=>!prepared.some(x=>x.service.id===s.id)).map(s=>s.title)},null,2));
    if(!apply){await c.query('ROLLBACK');return;}
    const backup=path.join(root,'logs',`before-november-import-${Date.now()}.json`);
    fs.mkdirSync(path.dirname(backup),{recursive:true});
    fs.writeFileSync(backup,JSON.stringify({services,courses:oldCourses,sessions:oldSessions},null,2),{flag:'wx'});
    const activeServices=[...new Set(prepared.map(x=>x.service.id))];
    await c.query('UPDATE courses SET active=false,updated_at=clock_timestamp() WHERE active');
    await c.query('UPDATE services SET active=(id=ANY($1::uuid[])),updated_at=clock_timestamp()',[activeServices]);
    await c.query('UPDATE services SET duration_minutes=120 WHERE id=ANY($1::uuid[])',[activeServices]);
    for(const x of prepared){
      if(x.old)await c.query('UPDATE courses SET active=true,reserved_seats=$2,updated_at=clock_timestamp() WHERE id=$1',[x.id,x.reserved]);
      else{
        await c.query('INSERT INTO courses(id,service_id,title,description,start_time,end_time,price,capacity,reserved_seats,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,true)',[x.id,x.service.id,x.service.title,x.service.description,x.start,x.end,x.service.price,x.capacity,x.reserved]);
        await c.query('INSERT INTO course_sessions(id,course_id,start_time,end_time) VALUES($1,$1,$2,$3)',[x.id,x.start,x.end]);
      }
    }
    await c.query('COMMIT');
    const envPath=path.join(root,'.env.local-test');
    const env=fs.existsSync(envPath)?fs.readFileSync(envPath,'utf8'):'';
    fs.writeFileSync(envPath,env.replace(/^LOCAL_SEED_COURSES=.*(?:\r?\n|$)/gm,'').trimEnd()+'\nLOCAL_SEED_COURSES=false\n');
    console.log('Mentve: 6 aktív meghirdetés. A korábbi foglalások megmaradtak. Automatikus bemutatóidőpontok kikapcsolva.');
    console.log('Biztonsági mentés: '+backup);
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>db.end());
