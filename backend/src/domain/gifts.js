const { transaction, one } = require('./store');
const { fail, str, email, integer, token } = require('./rules');
const {randomInt}=require('node:crypto');
const { fillVoucherDesign } = require('../lib/fillVoucher');
const { queue } = require('./notifications');
const fs = require('node:fs/promises');
const {origin}=require('../lib/mailTemplate');
async function nextReference(c) {
  let reference;
  do {
    reference='GIFT-'+randomInt(36**6).toString(36).padStart(6,'0').toUpperCase();
  } while(await one(c,"SELECT 1 FROM gift_orders WHERE data->>'voucherBase'=$1 OR data->>'notice'=$1 UNION ALL SELECT 1 FROM gift_vouchers WHERE code LIKE $1||'-%' LIMIT 1",[reference]));
  return reference;
}
async function issueIn(c,id,intent) {
    const complimentary=intent.source==='admin';
    const expires=new Date();expires.setMonth(expires.getMonth()+3);
    const validUntil=expires.toISOString().slice(0,10);
    const attachments = [];
    for (let i = 0; i < intent.meta.quantity; i++) {
      const serial = intent.voucherBase + '-' + String(i + 1).padStart(2, '0');
      const { outPath } = await fillVoucherDesign(intent.meta.names[i], intent.meta.unitAmount, serial,validUntil);
      await c.query('INSERT INTO gift_vouchers(code,order_id,recipient_name,amount,valid_until) VALUES($1,$2,$3,$4,$5)',
        [serial.toUpperCase(),id,intent.meta.names[i],intent.meta.unitAmount,validUntil]);
      attachments.push({ filename: `voucher_${serial}.pdf`, content: (await fs.readFile(outPath)).toString('base64') });
    }
    const multiple=intent.meta.quantity>1;
    const title=multiple?'Ajándékutalványaid megérkeztek':'Ajándékutalványod megérkezett';
    const intro=complimentary?'Elkészült a számodra kiállított ajándékutalvány. Fizetési kötelezettséged nincs.':'Köszönjük a vásárlást!';
    await queue(c, intent.meta.email, 'ChocoLeaf – '+title,
      `Kedves ${intent.meta.name}!\n\n${intro} ${multiple?'Az ajándékutalványokat':'Az ajándékutalványt'} PDF-csatolmányként találod.\n\nUtalványok adatai\n${attachments.map((a,i)=>`${intent.meta.names[i]}: ${a.filename.replace(/^voucher_|\.pdf$/g,'')}`).join('\n')}\nDarabszám: ${intent.meta.quantity}\nUtalványonként: ${intent.meta.unitAmount} Ft\nÖsszesen: ${intent.amount} Ft\nÉrvényes: ${validUntil}\n\nBeváltáskor a PDF-en szereplő teljes utalványszámot add meg. A felhasználás feltételei az utalványon szerepelnek.\nRendelés azonosítója: ${id}\n\nSzeretettel,\nChocoLeaf`, attachments);
    const adminUrl=origin()+'/admin/giftcards?order='+encodeURIComponent(id);
    await queue(c, process.env.MAIL_ADMIN || process.env.MAIL_FROM,
      complimentary?'ChocoLeaf – admin által kiállított ajándékutalvány':'ChocoLeaf – fizetett ajándékutalvány kiállítva',
      `${complimentary?'Az admin fizetés nélkül állította ki az utalványokat.\nKiállító: '+intent.issuedBy.email:'Az utalványok elkészültek, a vásárlói email küldési sorba került.'}\n\nUtalványok adatai\n${complimentary?'Címzett':'Vásárló'}: ${intent.meta.email}\nNevek: ${intent.meta.names.join(', ')}\nDarabszám: ${intent.meta.quantity}\n${complimentary?'Névérték':'Összeg'}: ${intent.amount} Ft\nAzonosító: ${id}\nAdmin: ${adminUrl}`,[],{action:{label:'Rendelés megnyitása',url:adminUrl}});
    if(!complimentary)intent.paidAt ||= Date.now();
    intent.generatedAt = Date.now();
    await c.query('UPDATE gift_orders SET data=$2 WHERE id=$1', [id, intent]);
}
async function fulfill(id, manual) {
  await transaction(async c => {
    const r = await one(c, 'SELECT * FROM gift_orders WHERE id=$1 FOR UPDATE', [id]);
    if (!r) fail('A rendelés nem található.', 404);
    const intent = r.data;
    if(intent.source==='admin')fail('Az admin által kiállított utalvány nem igényel fizetési jóváhagyást.',409);
    if (intent.meta.paymentMethod === 'stripe' && !intent.paidAt) fail('A Stripe-fizetés még nem érkezett meg.', 409);
    if (!manual && intent.meta.paymentMethod !== 'stripe') fail('Nem Stripe-rendelés.', 409);
    if (intent.generatedAt) return;
    await issueIn(c,id,intent);
  });
}
async function issueByAdmin(input,requestKey,admin) {
  const amount=integer(input.amount,'Összeg',1000,1000000);
  const quantity=integer(input.quantity,'Mennyiség',1,20);
  const address=email(input.email);
  if(!Array.isArray(input.names)||input.names.length!==quantity)fail('Minden utalványhoz szükséges név.');
  const names=input.names.map(name=>str(name,'Név',100));
  return transaction(async c=>{
    let row=await one(c,'SELECT * FROM gift_orders WHERE request_key=$1',[requestKey]);
    if(row){
      const old=row.data;
      if(old.source!=='admin'||old.issuedBy?.id!==admin.id||old.meta.email!==address||old.meta.unitAmount!==amount||
          old.meta.quantity!==quantity||JSON.stringify(old.meta.names)!==JSON.stringify(names))
        fail('Ez a kérésazonosító már más kiállításhoz tartozik.',409);
    }else{
      const reference=await nextReference(c),id='gift-'+token();
      const intent={kind:'giftcard',source:'admin',issuedBy:{id:admin.id,email:admin.email},amount:amount*quantity,currency:'HUF',
        notice:reference,voucherBase:reference,createdAt:Date.now(),
        meta:{names,name:names[0],email:address,unitAmount:amount,quantity,paymentMethod:'none',billingData:{}}};
      await c.query('INSERT INTO gift_orders(id,data,request_key) VALUES($1,$2,$3)',[id,intent,requestKey]);
      await issueIn(c,id,intent);
      row={id,data:intent};
    }
    const vouchers=(await c.query('SELECT code,valid_until::text FROM gift_vouchers WHERE order_id=$1 ORDER BY code',[row.id])).rows;
    return {id:row.id,codes:vouchers.map(v=>v.code),validUntil:vouchers[0]?.valid_until};
  });
}
module.exports = { fulfill, nextReference, issueByAdmin };
