const router = require("express").Router();
const pool = require("../db");
const { one } = require("../domain/store");
const { fail, str } = require("../domain/rules");
router.get("/", async (req, res) => {
  const id=str(req.query.id, "Azonosító", 100);
  const r = await one(pool, "SELECT data FROM gift_orders WHERE id=$1", [id]);
  if (!r && /^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(id)) {
    const b=await one(pool,'SELECT * FROM bookings WHERE id=$1',[id]);
    if(!b)fail('A foglalás nem található.',404);
    if(b.payment_method!=='transfer')fail('Ez a foglalás bankkártyával fizethető.',409);
    if(b.status==='cancelled' || b.payment_status==='refunded')fail('Ez a foglalás már nem fizethető.',409);
    if(!b.transfer_reference)fail('Ehhez a foglaláshoz nincs utalási közlemény.',409);
    res.set('Cache-Control','no-store');
    return res.json({kind:'booking',amount:b.total_price,currency:'HUF',notice:b.transfer_reference,
      paid:b.payment_status==='paid',...require('../domain/transfers').configuration()});
  }
  if (!r) fail("A rendelés nem található.", 404);
  const intent = r.data;
  if (intent.meta.paymentMethod === 'stripe') fail('Ez a rendelés bankkártyával fizethető.', 409);
  res.set("Cache-Control", "no-store");
  res.json({
    kind: intent.kind,
    amount: intent.amount,
    currency: "HUF",
    notice: intent.notice,
    paid: Boolean(intent.paidAt || intent.generatedAt),
    ...require('../domain/transfers').configuration(),
  });
});
module.exports = router;
