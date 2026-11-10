const express=require('express');
const pool=require('../db');
const {one,transaction}=require('../domain/store');
const {fail,uuid,integer}=require('../domain/rules');
const {calendarError}=require('../lib/mailDelivery');
const {renderEmail}=require('../lib/mailTemplate');
const router=express.Router();
const fields='id,recipient,subject,created_at,sent_at,attempts,last_attempt_at,last_error,retry_stopped,next_attempt,jsonb_array_length(attachments) AS attachment_count';
router.get('/mail',async(req,res)=>{
  const status=req.query.status||'pending';
  const filter={pending:'sent_at IS NULL',failed:'sent_at IS NULL AND (last_error IS NOT NULL OR attempts>0)',sent:'sent_at IS NOT NULL',all:'true'}[status];
  if(!filter)fail('Érvénytelen levélszűrő.');
  const page=integer(req.query.page||1,'Oldal',1,1000000),limit=25;
  const counts=await one(pool,`SELECT count(*) FILTER(WHERE sent_at IS NULL)::int AS pending,
    count(*) FILTER(WHERE sent_at IS NULL AND (last_error IS NOT NULL OR attempts>0))::int AS failed,
    count(*) FILTER(WHERE sent_at IS NOT NULL)::int AS sent FROM outbox`);
  const total=await one(pool,`SELECT count(*)::int AS n FROM outbox WHERE ${filter}`);
  const items=(await pool.query(`SELECT ${fields} FROM outbox WHERE ${filter} ORDER BY created_at DESC,id LIMIT $1 OFFSET $2`,[limit,(page-1)*limit])).rows;
  res.json({items,total:total.n,page,limit,counts,deliveryConfigured:Boolean(process.env.MAIL_USER||process.env.SMTP_HOST)});
});
router.get('/mail/:id',async(req,res)=>{
  const row=await one(pool,`SELECT ${fields},body,html,calendar FROM outbox WHERE id=$1`,[uuid(req.params.id)]);
  if(!row)fail('A levél nem található.',404);
  const {calendar,...mail}=row;
  res.json({...mail,html:mail.html||renderEmail({title:mail.subject.replace(/^ChocoLeaf\s*[–-]\s*/,''),body:mail.body}),calendarError:calendarError(calendar)});
});
router.post('/mail/:id/retry',async(req,res)=>{
  await transaction(async c=>{
    const row=await one(c,'SELECT sent_at,calendar FROM outbox WHERE id=$1 FOR UPDATE',[uuid(req.params.id)]);
    if(!row)fail('A levél nem található.',404);
    if(row.sent_at)fail('A már elküldött levél nem küldhető újra innen.',409);
    const invalid=calendarError(row.calendar);if(invalid)fail(invalid,409);
    if(row.calendar?.uid){
      const event=await one(c,'SELECT sequence FROM booking_calendar_events WHERE uid=$1',[row.calendar.uid]);
      if(!event||event.sequence!==row.calendar.sequence)fail('Ez a naptárértesítés már elavult, nem küldhető újra.',409);
    }
    await c.query('UPDATE outbox SET next_attempt=now(),retry_stopped=false,last_error=NULL WHERE id=$1',[req.params.id]);
  });
  res.json({message:'A küldés újrapróbálását ütemeztük.'});
});
router.delete('/mail/:id',async(req,res)=>{
  const result=await pool.query('DELETE FROM outbox WHERE id=$1 AND sent_at IS NULL RETURNING id',[uuid(req.params.id)]);
  if(!result.rowCount)fail('A levél már elküldött vagy nem található.',409);
  res.json({message:'A várakozó levelet töröltük a küldési sorból.'});
});
module.exports=router;
