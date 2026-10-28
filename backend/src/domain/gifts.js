const { transaction, one } = require('./store');
const { fail } = require('./rules');
const { fillVoucherDesign } = require('../lib/fillVoucher');
const { queue } = require('./notifications');
const fs = require('node:fs/promises');
async function fulfill(id, manual) {
  await transaction(async c => {
    const r = await one(c, 'SELECT * FROM gift_orders WHERE id=$1 FOR UPDATE', [id]);
    if (!r) fail('A rendelés nem található.', 404);
    const intent = r.data;
    if (intent.meta.paymentMethod === 'stripe' && !intent.paidAt) fail('A Stripe-fizetés még nem érkezett meg.', 409);
    if (!manual && intent.meta.paymentMethod !== 'stripe') fail('Nem Stripe-rendelés.', 409);
    if (intent.generatedAt) return;
    const attachments = [];
    for (let i = 0; i < intent.meta.quantity; i++) {
      const serial = intent.voucherBase + '-' + String(i + 1).padStart(2, '0');
      const { outPath } = await fillVoucherDesign(intent.meta.names[i], intent.meta.unitAmount, serial);
      attachments.push({ filename: `voucher_${serial}.pdf`, content: (await fs.readFile(outPath)).toString('base64') });
    }
    await queue(c, intent.meta.email, 'ChocoLeaf – ajándékutalványod elkészült',
      `Kedves ${intent.meta.name}!\n\nKöszönjük a vásárlást! A névre szóló ajándékutalványokat PDF-csatolmányként találod.\nNevek: ${intent.meta.names.join(', ')}\nDarabszám: ${intent.meta.quantity}\nUtalványonként: ${intent.meta.unitAmount} Ft\nÖsszesen: ${intent.amount} Ft\nAzonosító: ${id}\nA felhasználás feltételei és az érvényesség az utalványon szerepelnek.\n\nChocoLeaf`, attachments);
    const origin = (process.env.FRONTEND_URL || 'http://localhost:5173').split(',')[0].replace(/\/$/, '');
    await queue(c, process.env.MAIL_ADMIN || process.env.MAIL_FROM,
      'ChocoLeaf – fizetett ajándékutalvány kiállítva',
      `Az utalványok elkészültek, a vásárlói email küldési sorba került.\nVásárló: ${intent.meta.email}\nNevek: ${intent.meta.names.join(', ')}\nDarabszám: ${intent.meta.quantity}\nÖsszeg: ${intent.amount} Ft\nAzonosító: ${id}\nAdmin: ${origin}/admin/giftcards`);
    intent.paidAt ||= Date.now();
    intent.generatedAt = Date.now();
    await c.query('UPDATE gift_orders SET data=$2 WHERE id=$1', [id, intent]);
  });
}
module.exports = { fulfill };
