const express = require("express");
const { randomInt } = require('node:crypto');
const pool = require("../db");
const { transaction, one } = require("../domain/store");
const { str, email, integer, token, fail, uuid } = require("../domain/rules");
const { queue } = require("../domain/notifications");
const { requireAdmin } = require("../domain/auth");
const providers = require('../payments/providers');
const payments = require('../payments/orders');
const {billingText,origin}=require('../lib/mailTemplate');
const router = express.Router();
router.post('/check-vouchers',async(req,res)=>{
  res.set('Cache-Control','no-store');
  const result=await transaction(async c=>{
    const slot=await one(c,'SELECT price FROM courses WHERE id=$1 AND active',[uuid(req.body.courseId)]);
    if(!slot)fail('Válassz foglalható időpontot.');
    return require('../domain/vouchers').quote(c,req.body.codes,slot.price*integer(req.body.seats,'Létszám',1,100));
  });
  res.json(result);
});
router.get('/amounts',async(req,res)=>{
  res.set('Cache-Control','no-store');
  const details=req.query.details==='1';
  const columns=details?`c.price,s.id AS service_id,s.title,
    (SELECT count(*)::int FROM course_session_times st WHERE st.course_id=c.id) AS session_count`:'c.price';
  const rows=(await pool.query(`SELECT DISTINCT ${columns} FROM courses c JOIN services s ON s.id=c.service_id
    WHERE c.active AND s.active AND c.start_time>now() AND c.price BETWEEN 1000 AND 1000000
    ORDER BY c.price${details?',s.title,s.id':''}`)).rows;
  if(!details)return res.json(rows.map(row=>row.price));
  const options=new Map();
  for(const row of rows){
    if(!options.has(row.price))options.set(row.price,{amount:row.price,courses:[]});
    const courses=options.get(row.price).courses;
    const existing=courses.find(course=>course.id===row.service_id);
    if(existing)existing.multiSession ||= row.session_count>1;
    else courses.push({id:row.service_id,title:row.title,multiSession:row.session_count>1});
  }
  res.json([...options.values()]);
});
router.post("/start-payment", async (req, res) => {
  const d = req.body;
  const method = providers.provider();
  if (d.paymentMethod && d.paymentMethod !== method)
    fail('A fizetési mód megváltozott. Frissítsd az oldalt.');
  const normalizedBilling = providers.billingData(d.billingData);
  if(method==='transfer')require('../domain/transfers').configuration();
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
  const id = "gift-" + token();
  const intent = {
    kind: "giftcard",
    amount: amount * quantity,
    currency: "HUF",
    meta: {
      names,
      name: names[0],
      email: address,
      unitAmount: amount,
      quantity,
      billingData: method==='stripe' ? billing : normalizedBilling,
      paymentMethod: method,
    },
    createdAt: Date.now(),
  };
  const result = await transaction(async (c) => {
    if (requestKey) {
      if(method==='transfer'){
        const old=await one(c,'SELECT * FROM gift_orders WHERE request_key=$1',[requestKey]);
        if(old){
          const sameBilling=JSON.stringify(old.data.meta.billingData,Object.keys(old.data.meta.billingData).sort())===JSON.stringify(normalizedBilling,Object.keys(normalizedBilling).sort());
          if(old.data.meta.paymentMethod!==method || old.data.meta.email!==address || old.data.amount!==intent.amount || old.data.meta.unitAmount!==amount || JSON.stringify(old.data.meta.names)!==JSON.stringify(names) || !sameBilling)
            fail('Ez a kérésazonosító már más rendeléshez tartozik.',409);
          return {id:old.id,redirectUrl:'/transfer?id='+encodeURIComponent(old.id)};
        }
      }
      const old = await one(c, 'SELECT p.*,g.data FROM payment_orders p JOIN gift_orders g ON g.id=p.gift_order_id WHERE p.request_key=$1', [requestKey]);
      if (old) {
        if (old.data.meta.paymentMethod !== method || old.email !== address || old.amount !== intent.amount || JSON.stringify(old.data.meta.names) !== JSON.stringify(names) || old.data.meta.unitAmount !== amount ||
            JSON.stringify(old.billing, Object.keys(old.billing).sort()) !== JSON.stringify(normalizedBilling, Object.keys(normalizedBilling).sort()))
          fail('Ez a kérésazonosító már más rendeléshez tartozik.', 409);
        return { id: old.gift_order_id, paymentId: old.id, redirectUrl: '/payment#' + old.id };
      }
    }
    // Short public reference; the long internal order ID remains unchanged.
    // transaction() serializes writes, including the collision check and insert.
    let notice;
    do {
      notice = 'GIFT-' + randomInt(36 ** 6).toString(36).padStart(6, '0').toUpperCase();
    } while (await one(c,"SELECT 1 FROM gift_orders WHERE data->>'voucherBase'=$1 OR data->>'notice'=$1",[notice]));
    Object.assign(intent,{notice,voucherBase:notice});
    await c.query("INSERT INTO gift_orders(id,data,request_key) VALUES($1,$2,$3)", [
      id,
      intent,
      requestKey,
    ]);
    const payment = method==='stripe' ? await payments.insert(c, { giftId: id, key: requestKey, amount: intent.amount,
      email: address, description: `ChocoLeaf ajándékutalvány – ${quantity} db`, billing: normalizedBilling, config }) : null;
    if (payment) await queue(c, address, 'ChocoLeaf – ajándékutalvány fizetése',
      `Bankkártyás fizetés folytatása (30 percig): ${origin()}/payment#${payment.id}`,[],{action:{label:'Fizetés folytatása',url:`${origin()}/payment#${payment.id}`}});
    else await queue(c,address,'ChocoLeaf – ajándékutalvány rendelésed megérkezett',
      `Kedves ${names[0]}!\n\nRendelésedet elmentettük.\nNevek: ${names.join(', ')}\nDarabszám: ${quantity}\nAz utalványokat az átutalás beérkezésének adminisztrátori jóváhagyása után küldjük.`+require('../domain/transfers').instructions(intent.amount,notice,id),[],{action:{label:'Átutalási adatok',url:origin()+'/transfer?id='+encodeURIComponent(id)}});
    const adminUrl=origin()+'/admin/giftcards?order='+encodeURIComponent(id);
    await queue(
      c,
      process.env.MAIL_ADMIN || process.env.MAIL_FROM,
      "Új ajándékutalvány rendelés",
      `Új ajándékutalvány rendelés érkezett.\n\nUtalványok adatai\nMegrendelő email: ${address}\n${names.map((name,i)=>`${i+1}. név: ${name}`).join('\n')}\nDarabszám: ${quantity}\nUtalványonként: ${amount} Ft\nÖsszeg: ${intent.amount} Ft\nKözlemény: ${notice}\n\nSzámlázási adatok\n${billingText(intent.meta.billingData)}\n\nA fizetést a rendelés adminoldalán hagyd jóvá, ha az összeg ténylegesen megérkezett. A levél gombja csak megnyitja a rendelést.\nKezelés: ${adminUrl}`,[],
      {action:{label:'Rendelés megnyitása',url:adminUrl}},
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
        `SELECT g.*,(SELECT jsonb_agg(jsonb_build_object('code',v.code,'name',v.recipient_name,'amount',v.amount,'valid_until',v.valid_until,'changes_used',v.changes_used,
          'status',COALESCE((SELECT u.status FROM booking_vouchers u WHERE u.code=v.code AND u.status IN ('active','consumed') LIMIT 1),'available')) ORDER BY v.code)
          FROM gift_vouchers v WHERE v.order_id=g.id) AS vouchers FROM gift_orders g ${req.query.order?'WHERE g.id=$1':''} ORDER BY created_at DESC LIMIT 500`,
        req.query.order?[str(req.query.order,'Rendelés',100)]:[],
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
