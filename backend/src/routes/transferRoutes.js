const router = require("express").Router();
const pool = require("../db");
const { one } = require("../domain/store");
const { fail, str } = require("../domain/rules");
router.get("/", async (req, res) => {
  const r = await one(pool, "SELECT data FROM gift_orders WHERE id=$1", [
    str(req.query.id, "Azonosító", 100),
  ]);
  if (!r) fail("A rendelés nem található.", 404);
  const intent = r.data;
  if (intent.meta.paymentMethod === 'stripe') fail('Ez a rendelés bankkártyával fizethető.', 409);
  res.set("Cache-Control", "no-store");
  res.json({
    kind: intent.kind,
    amount: intent.amount,
    currency: "HUF",
    notice: intent.notice,
    beneficiary: process.env.TRANSFER_BENEFICIARY || "",
    bankName: process.env.TRANSFER_BANK_NAME || "",
    account: process.env.TRANSFER_ACCOUNT || "",
    iban: process.env.TRANSFER_IBAN || "",
    swift: process.env.TRANSFER_SWIFT || "",
  });
});
module.exports = router;
