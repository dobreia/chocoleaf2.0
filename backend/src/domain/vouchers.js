const {one}=require('./store');
const {fail}=require('./rules');
const policy='Ajándékutalvánnyal foglalt workshop: időpontmódosítás vagy lemondás legalább 72 órával az első alkalom előtt, utalványonként összesen egyszer lehetséges. 72 órán belül az utalvány beváltottnak minősül. Pénzbeli visszatérítés nem kérhető.';
function codes(input=[]){
  if(!Array.isArray(input)||input.length>20)fail('Legfeljebb 20 ajándékutalvány használható fel.');
  const result=input.map(code=>{
    if(typeof code!=='string'||!/^GIFT-[A-Z0-9]{6,12}-\d{2}$/i.test(code.trim()))fail('Érvénytelen utalványszám. A teljes, -01 végződést is tartalmazó számot add meg.');
    return code.trim().toUpperCase();
  }).sort();
  if(new Set(result).size!==result.length)fail('Ugyanaz az utalvány csak egyszer adható hozzá.');
  return result;
}
async function quote(c,input,total,bookingId=null){
  const list=codes(input),items=[];
  for(const code of list){
    const voucher=await one(c,`SELECT code,amount,valid_until FROM gift_vouchers v
      WHERE code=$1 AND valid_until>=(now() AT TIME ZONE 'Europe/Budapest')::date
      AND NOT EXISTS(SELECT 1 FROM booking_vouchers u WHERE u.code=v.code AND u.status IN ('active','consumed') AND ($2::uuid IS NULL OR u.booking_id IS DISTINCT FROM $2::uuid))`,[code,bookingId]);
    if(!voucher)fail('Az utalvány nem használható fel: nem kiállított, lejárt vagy már felhasznált.',409);
    items.push(voucher);
  }
  const discount=items.reduce((sum,v)=>sum+v.amount,0);
  if(discount>total)fail('A foglalás összegének el kell érnie a felhasznált utalványok teljes értékét. Maradványegyenleget nem kezelünk.',409);
  return {items,discount,due:total-discount};
}
async function attach(c,bookingId,list){
  for(const code of list)await c.query('INSERT INTO booking_vouchers(code,booking_id) VALUES($1,$2)',[code,bookingId]);
}
async function canChange(c,b,at=new Date()){
  if(new Date(b.start_time).getTime()-new Date(at).getTime()<72*3600000)return false;
  return !await one(c,`SELECT 1 FROM booking_vouchers u JOIN gift_vouchers v ON v.code=u.code
    WHERE u.booking_id=$1 AND u.status='active' AND v.changes_used>0`,[b.id]);
}
async function transition(c,old,b,{requestedAt,organizerCancellation=false}={}){
  if(!old.voucher_codes?.length)return;
  if(b.payment_status==='refunded')fail('Utalvánnyal foglalt workshophoz pénzbeli visszatérítés nem rögzíthető.',409);
  if(old.status==='cancelled'&&b.status!=='cancelled'){
    await quote(c,old.voucher_codes,b.total_price,old.id);
    // Late cancellation permanently consumes the voucher.
    if(await one(c,"SELECT 1 FROM booking_vouchers WHERE booking_id=$1 AND status='consumed'",[old.id]))fail('Az utalvány már beváltottnak minősül.',409);
    await c.query("UPDATE booking_vouchers SET status='active',released_at=NULL WHERE booking_id=$1 AND status='released'",[old.id]);
    return;
  }
  const cancelling=old.status!=='cancelled'&&b.status==='cancelled';
  const moving=b.course_id!==old.course_id;
  if(organizerCancellation&&!cancelling)fail('Szervezői lemondás csak lemondáskor választható.');
  if(!cancelling&&!moving)return;
  const allowed=await canChange(c,old,requestedAt||new Date());
  if(moving&&!allowed)fail('Az utalványos foglalás csak egyszer, legalább 72 órával az első alkalom előtt módosítható.',409);
  if(cancelling){
    const release=organizerCancellation||allowed;
    await c.query("UPDATE booking_vouchers SET status=$2,released_at=now() WHERE booking_id=$1 AND status='active'",[old.id,release?'released':'consumed']);
  }
  if(!organizerCancellation&&allowed)await c.query('UPDATE gift_vouchers SET changes_used=1 WHERE code=ANY($1::text[])',[old.voucher_codes]);
}
module.exports={codes,quote,attach,canChange,transition,policy};
