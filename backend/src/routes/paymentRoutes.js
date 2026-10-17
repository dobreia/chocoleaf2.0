const express = require('express');
const pool = require('../db');
const { one } = require('../domain/store');
const { fail, uuid } = require('../domain/rules');
const { rateLimit, requireAdmin } = require('../domain/auth');
const providers = require('../payments/providers');
const orders = require('../payments/orders');
const router = express.Router();
router.get('/config', (_req, res) => res.json({ provider: providers.provider() }));
router.get('/admin/orders', requireAdmin, async (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json((await pool.query('SELECT * FROM payment_orders ORDER BY created_at DESC LIMIT 500')).rows);
});
router.post('/admin/:id/retry', requireAdmin, async (req, res) => {
  await pool.query('UPDATE payment_orders SET next_attempt=now() WHERE id=$1', [uuid(req.params.id)]);
  res.json({ message: 'Az újrapróbálkozást ütemeztük.' });
});
router.get('/:id', rateLimit, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const order = await one(pool, 'SELECT * FROM payment_orders WHERE id=$1', [uuid(req.params.id)]);
  if (!order) fail('A fizetés nem található.', 404);
  res.json({ status: order.status, amount: order.amount, invoiceStatus: order.invoice_status,
    invoiceUrl: order.invoice_url, expiresAt: order.expires_at });
});
router.post('/:id/checkout', rateLimit, async (req, res) => res.json(await orders.checkout(uuid(req.params.id))));
async function webhook(req, res) {
  if (!process.env.STRIPE_WEBHOOK_SECRET) return res.sendStatus(503);
  let event;
  try { event = providers.stripe().webhooks.constructEvent(req.body, req.get('stripe-signature'), process.env.STRIPE_WEBHOOK_SECRET); }
  catch { return res.status(400).json({ message: 'Érvénytelen Stripe-aláírás.' }); }
  if (['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.expired'].includes(event.type))
    await orders.applySession(event.data.object);
  res.json({ received: true });
}
module.exports = { router, webhook };
