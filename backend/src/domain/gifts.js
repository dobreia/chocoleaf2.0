const { transaction, one } = require('./store');
const { fail } = require('./rules');
const { fillVoucherDesign } = require('../lib/fillVoucher');
const { queue } = require('./notifications');
const fs = require('node:fs/promises');
const {origin}=require('../lib/mailTemplate');
async function fulfill(id, manual) {
  await transaction(async c => {
    const r = await one(c, 'SELECT * FROM gift_orders WHERE id=$1 FOR UPDATE', [id]);
    if (!r) fail('A rendelés nem található.', 404);
    const intent = r.data;
    if (intent.meta.paymentMethod === 'stripe' && !intent.paidAt) fail('A Stripe-fizetés még nem érkezett meg.', 409);
    if (!manual && intent.meta.paymentMethod !== 'stripe') fail('Nem Stripe-rendelés.', 409);
    if (intent.generatedAt) return;
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
    await queue(c, intent.meta.email, 'ChocoLeaf – '+title,
      `Kedves ${intent.meta.name}!\n\nKöszönjük a vásárlást! ${multiple?'Az ajándékutalványokat':'Az ajándékutalványt'} PDF-csatolmányként találod.\n\nUtalványok adatai\n${attachments.map((a,i)=>`${intent.meta.names[i]}: ${a.filename.replace(/^voucher_|\.pdf$/g,'')}`).join('\n')}\nDarabszám: ${intent.meta.quantity}\nUtalványonként: ${intent.meta.unitAmount} Ft\nÖsszesen: ${intent.amount} Ft\nÉrvényes: ${validUntil}\n\nBeváltáskor a PDF-en szereplő teljes utalványszámot add meg. A felhasználás feltételei az utalványon szerepelnek.\nRendelés azonosítója: ${id}\n\nSzeretettel,\nChocoLeaf`, attachments);
    const adminUrl=origin()+'/admin/giftcards?order='+encodeURIComponent(id);
    await queue(c, process.env.MAIL_ADMIN || process.env.MAIL_FROM,
      'ChocoLeaf – fizetett ajándékutalvány kiállítva',
      `Az utalványok elkészültek, a vásárlói email küldési sorba került.\n\nUtalványok adatai\nVásárló: ${intent.meta.email}\nNevek: ${intent.meta.names.join(', ')}\nDarabszám: ${intent.meta.quantity}\nÖsszeg: ${intent.amount} Ft\nAzonosító: ${id}\nAdmin: ${adminUrl}`,[],{action:{label:'Rendelés megnyitása',url:adminUrl}});
    intent.paidAt ||= Date.now();
    intent.generatedAt = Date.now();
    await c.query('UPDATE gift_orders SET data=$2 WHERE id=$1', [id, intent]);
  });
}
module.exports = { fulfill };
