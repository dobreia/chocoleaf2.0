const pool = require('../db');
const { one, transaction } = require('../domain/store');
const { fail, token, hash } = require('../domain/rules');
const { bookingNotice, queue } = require('../domain/notifications');
const providers = require('./providers');

async function insert(c, { bookingId, giftId, courseId, seats, bookingData, key, amount, email, description, billing, config }) {
  if (courseId) await c.query('UPDATE courses SET session_count_locked=true WHERE id=$1',[courseId]);
  if (!Number.isSafeInteger(amount) || amount < 175) fail('A bankkártyás fizetés minimuma 175 Ft.');
  return one(c, `INSERT INTO payment_orders(booking_id,gift_order_id,request_key,amount,email,description,billing,invoice_config,course_id,seats,booking_data)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
  [bookingId || null, giftId || null, key || null, amount, email, description, billing, config, courseId || null, seats || null, bookingData || null]);
}
function returnUrl(order) {
  const origin = (process.env.FRONTEND_URL || 'http://localhost:5173').split(',')[0].replace(/\/$/, '');
  return `${origin}/payment#${order.id}`;
}
async function checkout(id) {
  // The order UUID is an unguessable bearer capability, never exposed in listings to customers.
  const order = await transaction(async c => {
    const current = await one(c, 'SELECT * FROM payment_orders WHERE id=$1 FOR UPDATE', [id]);
    if (!current) fail('A fizetés nem található.', 404);
    if (current.status !== 'pending') fail('Ez a fizetés már lezárult.', 409);
    if (new Date(current.expires_at).getTime() <= Date.now()) fail('A fizetési határidő lejárt. Indíts új rendelést.', 409);
    if (!current.stripe_expires_at) return one(c,
      "UPDATE payment_orders SET stripe_expires_at=now()+interval '31 minutes',expires_at=now()+interval '31 minutes' WHERE id=$1 RETURNING *", [id]);
    return current;
  });
  if (order.checkout_url) return { paymentId: id, redirectUrl: order.checkout_url };
  // Persisted expiry + stable idempotency key make a lost response safe to retry.
  const session = await providers.stripe().checkout.sessions.create({
    mode: 'payment', payment_method_types: ['card'], customer_email: order.email,
    client_reference_id: id, metadata: { order_id: id }, locale: 'hu',
    line_items: [{ price_data: { currency: 'huf', unit_amount: order.amount * 100,
      product_data: { name: order.description } }, quantity: 1 }],
    expires_at: Math.floor(new Date(order.stripe_expires_at).getTime() / 1000),
    success_url: returnUrl(order), cancel_url: returnUrl(order),
  }, { idempotencyKey: 'checkout-' + id });
  await pool.query('UPDATE payment_orders SET stripe_session_id=$2,checkout_url=$3 WHERE id=$1', [id, session.id, session.url]);
  return { paymentId: id, redirectUrl: session.url };
}
async function applySession(session) {
  const id = session.metadata?.order_id;
  if (!id || !/^[a-f\d-]{36}$/.test(id)) return;
  await transaction(async c => {
    const order = await one(c, 'SELECT * FROM payment_orders WHERE id=$1 FOR UPDATE', [id]);
    if (!order) return;
    if (session.mode !== 'payment' || session.client_reference_id !== id ||
        session.currency !== 'huf' || session.amount_total !== order.amount * 100 ||
        (order.stripe_session_id && order.stripe_session_id !== session.id))
      fail('Eltérő fizetési adatok.', 409);
    if (order.status === 'paid') return;
    if (session.payment_status === 'paid') {
      await c.query("UPDATE payment_orders SET status='paid',paid_at=now(),stripe_session_id=$2,next_attempt=now() WHERE id=$1", [id, session.id]);
      if (order.course_id && !order.booking_id) {
        const slot = await one(c, 'SELECT * FROM courses WHERE id=$1 FOR UPDATE', [order.course_id]);
        if (!slot) fail('A fizetéshez tartozó időpont nem található.', 409);
        const t = token();
        const b = await one(c, `INSERT INTO bookings(course_id,customer_name,customer_email,customer_phone,note,seats,total_price,
          payment_method,payment_status,manage_hash,manage_expires,request_key)
          VALUES($1,$2,$3,$4,$5,$6,$7,'stripe','paid',$8,$9,$10) RETURNING *`,
        [order.course_id,order.booking_data.customer_name,order.email,order.booking_data.customer_phone,order.booking_data.note,
          order.seats,order.amount,hash(t),new Date(new Date(slot.end_time).getTime()+30*86400000),order.request_key]);
        await c.query('UPDATE payment_orders SET booking_id=$2 WHERE id=$1', [id,b.id]);
        await bookingNotice(c,b,slot,'Sikeres fizetés után foglalásod megérkezett; visszaigazolása adminisztrátori jóváhagyásra vár',t);
      } else if (order.booking_id) {
        const b = await one(c, "UPDATE bookings SET payment_status='paid',updated_at=clock_timestamp() WHERE id=$1 RETURNING *", [order.booking_id]);
        const slot = await one(c, 'SELECT * FROM courses WHERE id=$1', [b.course_id]);
        await bookingNotice(c, b, slot, 'A bankkártyás fizetésed megérkezett; a foglalás visszaigazolása adminisztrátori jóváhagyásra vár');
      } else {
        await c.query("UPDATE gift_orders SET data=jsonb_set(data,'{paidAt}',to_jsonb($2::bigint)) WHERE id=$1", [order.gift_order_id, Date.now()]);
      }
    } else if (session.status === 'expired' && order.status === 'pending') {
      await c.query("UPDATE payment_orders SET status='expired' WHERE id=$1", [id]);
      if (order.booking_id) await c.query("UPDATE bookings SET status='cancelled',payment_status='failed',updated_at=clock_timestamp() WHERE id=$1 AND payment_status='pending'", [order.booking_id]);
    }
  });
}
async function invoice(order) {
  if (['sent','skipped'].includes(order.invoice_status)) return;
  if (order.status !== 'paid') throw new Error('Unpaid order');
  if (order.invoice_config.mode === 'local-test') {
    await pool.query("UPDATE payment_orders SET invoice_status='skipped',last_error=NULL WHERE id=$1",[order.id]);
    return;
  }
  let document = order.invoice_id ? { id: Number(order.invoice_id) } :
    await providers.billingo('/documents/vendor/' + encodeURIComponent('chocoleaf-' + order.id));
  if (!document) {
    const b = order.billing;
    const partner = await providers.billingo('/partners', {
      name: b.name, emails: [order.email], taxcode: b.taxcode,
      tax_type: b.buyerType === 'company' ? 'HAS_TAX_NUMBER' : 'NO_TAX_NUMBER',
      address: { country_code: b.country_code, post_code: b.post_code, city: b.city, address: b.address },
    });
    const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Budapest' }).format(new Date(order.paid_at));
    document = await providers.billingo('/documents', {
      vendor_id: 'chocoleaf-' + order.id, partner_id: partner.id, block_id: order.invoice_config.blockId,
      type: order.invoice_config.type, fulfillment_date: date, due_date: date,
      payment_method: 'bankcard', language: 'hu', currency: 'HUF', conversion_rate: 1,
      electronic: true, paid: true,
      items: [{ name: order.description, unit_price: order.amount, unit_price_type: 'gross',
        quantity: 1, unit: 'db', vat: order.invoice_config.vat }],
    });
  }
  if (!Number.isSafeInteger(document.id) || document.id < 1) throw new Error('Billingo invalid document');
  // Store the document before obtaining its link. A retry reconciles via vendor_id if the response was lost.
  await pool.query("UPDATE payment_orders SET invoice_id=$2,invoice_status='created' WHERE id=$1", [order.id, document.id]);
  const link = await providers.billingo(`/documents/${document.id}/public-url`);
  if (!link?.public_url || !link.public_url.startsWith('https://')) throw new Error('Billingo invalid link');
  await transaction(async c => {
    const current = await one(c, 'SELECT invoice_status FROM payment_orders WHERE id=$1 FOR UPDATE', [order.id]);
    if (current.invoice_status === 'sent') return;
    await queue(c, order.email, 'ChocoLeaf – számlád elkészült', `A vásárlásodhoz tartozó számla: ${link.public_url}`);
    await c.query("UPDATE payment_orders SET invoice_url=$2,invoice_status='sent',last_error=NULL WHERE id=$1", [order.id, link.public_url]);
  });
}
let running = false;
async function work() {
  if (running || !process.env.STRIPE_SECRET_KEY) return;
  running = true;
  // Dedicated advisory lock prevents two server processes from issuing the same invoice concurrently.
  let lock;
  try {
    lock = await pool.connect();
    const acquired = await one(lock, 'SELECT pg_try_advisory_lock(829107) AS acquired');
    if (!acquired.acquired) return;
    const pending = (await pool.query("SELECT * FROM payment_orders WHERE status='pending' AND next_attempt<=now() ORDER BY created_at LIMIT 20")).rows;
    for (const order of pending) {
      try {
        // Recover sessions created remotely before a local crash using the same idempotency key.
        if (!order.stripe_session_id && order.stripe_expires_at && new Date(order.expires_at) > new Date(Date.now() + 120000)) await checkout(order.id);
        const fresh = await one(pool, 'SELECT * FROM payment_orders WHERE id=$1', [order.id]);
        if (fresh.stripe_session_id) await applySession(await providers.stripe().checkout.sessions.retrieve(fresh.stripe_session_id));
        if (!fresh.stripe_session_id && new Date(order.expires_at).getTime() + 120000 < Date.now()) {
          // Reconcile a lost create response before releasing any seats. Provider failure leaves the reservation held.
          let found = false;
          for await (const session of providers.stripe().checkout.sessions.list({
            created: { gte: Math.floor(new Date(order.created_at).getTime()/1000)-60,
              lte: Math.floor(new Date(order.expires_at).getTime()/1000)+120 }, limit: 100,
          })) {
            if (session.metadata?.order_id === order.id) {
              found = true;
              await pool.query('UPDATE payment_orders SET stripe_session_id=$2,checkout_url=$3 WHERE id=$1', [order.id,session.id,session.url]);
              await applySession(session);
              break;
            }
          }
          if (!found) await transaction(async c => {
            const expired = await one(c, "UPDATE payment_orders SET status='expired' WHERE id=$1 AND status='pending' AND stripe_session_id IS NULL RETURNING booking_id", [order.id]);
            if (expired?.booking_id) await c.query("UPDATE bookings SET status='cancelled',payment_status='failed',updated_at=clock_timestamp() WHERE id=$1 AND payment_status='pending'", [expired.booking_id]);
          });
        }
        await pool.query("UPDATE payment_orders SET next_attempt=now()+interval '1 minute' WHERE id=$1 AND status='pending'", [order.id]);
      } catch (e) { await recordError(order.id, e); }
    }
    const paid = (await pool.query("SELECT p.* FROM payment_orders p LEFT JOIN gift_orders g ON g.id=p.gift_order_id WHERE p.status='paid' AND p.next_attempt<=now() AND (p.invoice_status NOT IN ('sent','skipped') OR (p.gift_order_id IS NOT NULL AND g.data->>'generatedAt' IS NULL)) ORDER BY p.created_at LIMIT 20")).rows;
    for (const order of paid) {
      try {
        // A failed voucher delivery must not block the invoice, or vice versa.
        const outcomes = await Promise.allSettled([
          order.gift_order_id ? require('../domain/gifts').fulfill(order.gift_order_id, false) : Promise.resolve(),
          order.invoice_status !== 'sent' ? invoice(order) : Promise.resolve(),
        ]);
        const failure = outcomes.find(x=>x.status==='rejected');
        if (failure) throw failure.reason;
        await pool.query("UPDATE payment_orders SET next_attempt=now()+interval '1 day',last_error=NULL WHERE id=$1", [order.id]);
      } catch (e) { await recordError(order.id, e); }
    }
  } finally {
    try {
      if (lock) { try { await lock.query('SELECT pg_advisory_unlock(829107)'); } finally { lock.release(); } }
    } finally { running = false; }
  }
}
async function recordError(id, e) {
  const message = /^Billingo /.test(e.message) ? e.message : 'A feldolgozás nem sikerült; automatikus újrapróbálkozás.';
  await pool.query("UPDATE payment_orders SET last_error=$2,next_attempt=now()+interval '5 minutes' WHERE id=$1", [id, message]);
}
module.exports = { insert, checkout, applySession, invoice, work };
