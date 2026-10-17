const express = require("express");
const pool = require("../db");
const { transaction, one } = require("../domain/store");
const { str, email, integer, token, fail, uuid } = require("../domain/rules");
const { queue } = require("../domain/notifications");
const { requireAdmin } = require("../domain/auth");
const providers = require('../payments/providers');
const payments = require('../payments/orders');
const router = express.Router();
router.post("/start-payment", async (req, res) => {
  const d = req.body;
  const method = providers.provider();
  if (d.paymentMethod && d.paymentMethod !== method)
    fail('A fizetési mód megváltozott. Frissítsd az oldalt.');
  const normalizedBilling = method === 'stripe' ? providers.billingData(d.billingData) : null;
  const config = method === 'stripe' ? providers.configuration('giftcard') : null;
  const requestKey = req.get('Idempotency-Key') ? uuid(req.get('Idempotency-Key')) : null;
  const address = email(d.email),
    amount = integer(d.amount, "Összeg", 1000, 1000000),
    quantity = integer(d.quantity, "Mennyiség", 1, 20);
  if (!Array.isArray(d.names) || d.names.length !== quantity)
    fail("Minden utalványhoz szükséges név.");
  const names = d.names.map((v) => str(v, "Név", 100));
  const billing = d.billingData;
  if (!billing || !["private", "company"].includes(billing.buyerType))
    fail("Hiányzó számlázási adatok.");
  for (const key of method === 'stripe' ? [] : billing.buyerType === "company"
    ? ["companyName", "companyAddress", "taxNumber"]
    : ["privateName", "privateAddress"])
    str(billing[key], "Számlázási adat", 500);
  const id = "gift-" + token(),
    notice = "GIFT-" + token().slice(0, 12).toUpperCase();
  const intent = {
    kind: "giftcard",
    amount: amount * quantity,
    currency: "HUF",
    notice,
    voucherBase: notice,
    meta: {
      names,
      name: names[0],
      email: address,
      unitAmount: amount,
      quantity,
      billingData: billing,
      paymentMethod: method,
    },
    createdAt: Date.now(),
  };
  const result = await transaction(async (c) => {
    if (requestKey) {
      const old = await one(c, 'SELECT p.*,g.data FROM payment_orders p JOIN gift_orders g ON g.id=p.gift_order_id WHERE p.request_key=$1', [requestKey]);
      if (old) {
        if (old.email !== address || old.amount !== intent.amount || JSON.stringify(old.data.meta.names) !== JSON.stringify(names) || old.data.meta.unitAmount !== amount ||
            JSON.stringify(old.billing, Object.keys(old.billing).sort()) !== JSON.stringify(normalizedBilling, Object.keys(normalizedBilling).sort()))
          fail('Ez a kérésazonosító már más rendeléshez tartozik.', 409);
        return { id: old.gift_order_id, paymentId: old.id, redirectUrl: '/payment#' + old.id };
      }
    }
    await c.query("INSERT INTO gift_orders(id,data) VALUES($1,$2)", [
      id,
      intent,
    ]);
    const payment = normalizedBilling ? await payments.insert(c, { giftId: id, key: requestKey, amount: intent.amount,
      email: address, description: `ChocoLeaf ajándékutalvány – ${quantity} db`, billing: normalizedBilling, config }) : null;
    if (payment) await queue(c, address, 'ChocoLeaf – ajándékutalvány fizetése',
      `Bankkártyás fizetés folytatása (30 percig): ${(process.env.FRONTEND_URL || 'http://localhost:5173').split(',')[0]}/payment#${payment.id}`);
    await queue(
      c,
      process.env.MAIL_ADMIN || process.env.MAIL_FROM,
      "Új ajándékutalvány rendelés",
      `${names.join(", ")}\n${address}\n${intent.amount} Ft\nKözlemény: ${notice}\nKezelés: ${process.env.FRONTEND_URL || "http://localhost:5173"}/admin/giftcards`,
    );
    return { id, paymentId: payment?.id, redirectUrl: payment ? '/payment#' + payment.id : '/transfer?id=' + encodeURIComponent(id) };
  });
  if (result.paymentId) Object.assign(result, await payments.checkout(result.paymentId));
  res.json(result);
});
router.get("/admin/orders", requireAdmin, async (req, res) =>
  res.json(
    (
      await pool.query(
        "SELECT * FROM gift_orders ORDER BY created_at DESC LIMIT 500",
      )
    ).rows,
  ),
);
router.post("/admin/mark-paid", requireAdmin, async (req, res) => {
  const id = str(req.body.id, "Azonosító", 100);
  await require('../domain/gifts').fulfill(id, true);
  res.json({ message: "Az utalványok elkészültek, az email küldési sorba került." });
});
module.exports = router;
