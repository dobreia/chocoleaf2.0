const pool=require('../db');
const {fail,str,uuid,email}=require('./rules');
function conditions(query){
  const params=[],where=[];
  const status=query.status || 'active';
  if(!['active','cancelled','all'].includes(status))fail('Érvénytelen foglalási szűrő.');
  if(status==='active')where.push("status<>'cancelled'");
  if(status==='cancelled')where.push("status='cancelled'");
  if(query.service){params.push(uuid(query.service));where.push(`COALESCE(service_id,course_id)=$${params.length}`);}
  return {params,where:where.length?'WHERE '+where.join(' AND '):''};
}
async function list(query={}){
  const {params,where}=conditions(query);
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
      SELECT h.customer_email AS email,
        (array_agg(h.customer_name ORDER BY h.updated_at DESC,h.booking_id))[1] AS name,
        (array_agg(h.customer_phone ORDER BY h.updated_at DESC,h.booking_id))[1] AS phone,
        count(*)::int AS bookings,MAX(h.created_at) AS last_booking,
        array_agg(DISTINCT h.course_title ORDER BY h.course_title) AS courses
      FROM customer_booking_history h JOIN matched m ON m.customer_email=h.customer_email
      GROUP BY h.customer_email
    ) SELECT p.* FROM profiles p ${search} ORDER BY p.last_booking DESC,p.email`,params)).rows;
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
module.exports={list,services,history};
