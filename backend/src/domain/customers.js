const pool=require('../db');
const {fail,str,uuid,email}=require('./rules');
const {transaction,one}=require('./store');
function conditions(query){
  const params=[],where=[];
  const status=query.status || 'active';
  if(!['active','cancelled','all'].includes(status))fail('Érvénytelen foglalási szűrő.');
  if(status==='active')where.push("status<>'cancelled'");
  if(status==='cancelled')where.push("status='cancelled'");
  if(query.service){params.push(uuid(query.service));where.push(`COALESCE(service_id,course_id)=$${params.length}`);}
  return {params,where:where.length?'WHERE '+where.join(' AND '):'',includeManual:!query.service&&status!=='cancelled'};
}
async function list(query={}){
  const {params,where,includeManual}=conditions(query);
  let search='';
  if(query.q){
    params.push('%'+str(query.q,'Keresés',200)+'%');
    const p='$'+params.length;
    search=`WHERE p.name ILIKE ${p} OR p.email ILIKE ${p} OR p.phone ILIKE ${p}
      OR EXISTS(SELECT 1 FROM customer_booking_history h WHERE h.customer_email=p.email AND h.course_title ILIKE ${p})`;
  }
  return (await pool.query(`WITH matched AS (
      SELECT DISTINCT customer_email FROM customer_booking_history ${where}
    ), profiles AS (
      SELECT d.* FROM customer_directory d
      WHERE EXISTS(SELECT 1 FROM matched m WHERE m.customer_email=d.email)
        ${includeManual?'OR d.bookings=0':''}
    ) SELECT p.*,COALESCE(n.note,'') AS note FROM profiles p
      LEFT JOIN customer_notes n ON n.customer_email=p.email
      ${search} ORDER BY p.last_booking DESC NULLS LAST,p.email`,params)).rows;
}
async function services(){
  return (await pool.query(`SELECT DISTINCT ON(COALESCE(h.service_id,h.course_id))
    COALESCE(h.service_id,h.course_id) AS id,COALESCE(s.title,h.course_title) AS title,
    s.id IS NULL AS archived
    FROM customer_booking_history h LEFT JOIN services s ON s.id=h.service_id
    ORDER BY COALESCE(h.service_id,h.course_id),h.updated_at DESC,h.booking_id`)).rows
    .sort((a,b)=>a.title.localeCompare(b.title,'hu'));
}
async function history(address){
  return (await pool.query(`SELECT booking_id,course_id,service_id,course_title,start_time,end_time,
    sessions,status,payment_status,seats,created_at,archived_at
    FROM customer_booking_history WHERE customer_email=$1 ORDER BY start_time DESC,created_at DESC,booking_id`,[email(address)])).rows;
}
async function create(data){
  const address=email(data.email),name=str(data.name,'Név'),phone=str(data.phone||'','Telefon',40,false);
  const note=str(data.note===undefined?'':data.note,'Megjegyzés',10000,false);
  return transaction(async c=>{
    if(await one(c,'SELECT 1 FROM customer_directory WHERE email=$1',[address]))fail('Ezzel az e-mail-címmel már szerepel ügyfél a listában.',409);
    await c.query(`INSERT INTO customer_profiles(email,name,phone) VALUES($1,$2,$3)
      ON CONFLICT(email) DO UPDATE SET name=$2,phone=$3,deleted_at=NULL,updated_at=clock_timestamp()`,[address,name,phone]);
    await c.query(`INSERT INTO customer_notes(customer_email,note) VALUES($1,$2)
      ON CONFLICT(customer_email) DO UPDATE SET note=$2,updated_at=clock_timestamp()`,[address,note]);
    return {email:address,name,phone};
  });
}
async function save(data){
  const old=email(data.original_email),address=email(data.email),name=str(data.name,'Név'),phone=str(data.phone||'','Telefon',40,false);
  const note=data.note===undefined?undefined:str(data.note,'Megjegyzés',10000,false);
  if(old!==address)fail('Az email címet foglalásonként módosítsd: ilyenkor új kezelési linket küldünk.');
  return transaction(async c=>{
    if(!await one(c,'SELECT 1 FROM customer_directory WHERE email=$1',[old]))fail('Az ügyfél nem található.',404);
    const live=await c.query('UPDATE bookings SET customer_name=$2,customer_phone=$3,updated_at=clock_timestamp() WHERE lower(customer_email)=$1',[old,name,phone]);
    const archived=await c.query('UPDATE customer_booking_archive SET customer_name=$2,customer_phone=$3,updated_at=clock_timestamp() WHERE customer_email=$1',[old,name,phone]);
    await c.query(`INSERT INTO customer_profiles(email,name,phone) VALUES($1,$2,$3)
      ON CONFLICT(email) DO UPDATE SET name=$2,phone=$3,deleted_at=NULL,updated_at=clock_timestamp()`,[old,name,phone]);
    if(note!==undefined)await c.query(`INSERT INTO customer_notes(customer_email,note) VALUES($1,$2)
      ON CONFLICT(customer_email) DO UPDATE SET note=$2,updated_at=clock_timestamp()`,[old,note]);
    return {updated:Math.max(1,live.rowCount+archived.rowCount)};
  });
}
async function remove(address){
  address=email(address);
  return transaction(async c=>{
    if(!await one(c,'SELECT 1 FROM customer_directory WHERE email=$1',[address]))fail('Az ügyfél nem található.',404);
    await c.query(`INSERT INTO customer_profiles(email,name,phone,deleted_at) VALUES($1,'','',clock_timestamp())
      ON CONFLICT(email) DO UPDATE SET name='',phone='',deleted_at=clock_timestamp(),updated_at=clock_timestamp()`,[address]);
    await c.query('DELETE FROM customer_notes WHERE customer_email=$1',[address]);
    return {deleted:true};
  });
}
module.exports={list,services,history,create,save,remove};
