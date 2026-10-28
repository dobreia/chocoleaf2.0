const { transaction, one } = require("./store");
const {
  fail,
  uuid,
  str,
  email,
  integer,
  token,
  hash,
  statuses,
} = require("./rules");
const { checkBooking } = require("./schedule");
const { bookingNotice } = require("./notifications");
const providers = require('../payments/providers');
const payments = require('../payments/orders');
const {sessionsSQL,getSessions}=require('./courseSessions');
const select = `SELECT b.*,c.title AS course_title,c.start_time,c.end_time,c.service_id,c.capacity,${sessionsSQL('c')} AS sessions FROM bookings b JOIN courses c ON c.id=b.course_id`;
function publicBooking(b) {
  const { manage_hash, manage_expires, request_key, admin_note, billing_data, ...safe } = b;
  return safe;
}
async function create(data, key, { manual = false } = {}) {
  return transaction(async (c) => {
    const name = str(data.customerName, "Név"),
      address = email(data.customerEmail),
      phone = str(data.customerPhone || "", "Telefonszám", 40, false),
      note = str(data.note || "", "Megjegyzés", 2000, false),
      seats = integer(data.seats === undefined ? 1 : data.seats, "Létszám", 1, 100);
    uuid(data.courseId);
    const paymentMethod = manual ? 'transfer' : providers.provider();
    if (data.paymentMethod && data.paymentMethod !== paymentMethod)
      fail('A fizetési mód megváltozott. Frissítsd az oldalt.');
    const billing = !manual ? providers.billingData(data.billingData) : null;
    if (paymentMethod === 'transfer' && !manual) require('./transfers').configuration();
    const config = paymentMethod === 'stripe' ? providers.configuration('booking') : null;
    const draft = { customer_name: name, customer_phone: phone, note };
    if (key && paymentMethod === 'stripe') {
      uuid(key);
      const oldPayment = await one(c, 'SELECT * FROM payment_orders WHERE request_key=$1', [key]);
      if (oldPayment) {
        const same = (a,b) => JSON.stringify(a, Object.keys(a || {}).sort()) === JSON.stringify(b, Object.keys(b || {}).sort());
        if (oldPayment.course_id !== data.courseId || oldPayment.email !== address || oldPayment.seats !== seats ||
            !same(oldPayment.booking_data, draft) || !same(oldPayment.billing, billing))
          fail('Ez a kérésazonosító más fizetési adatokhoz tartozik.', 409);
        return { paymentId: oldPayment.id, replayed: true };
      }
    }
    if (key) {
      uuid(key);
      if(paymentMethod==='transfer' && await one(c,'SELECT 1 FROM payment_orders WHERE request_key=$1',[key]))
        fail('Ez a kérésazonosító korábbi bankkártyás fizetéshez tartozik. Módosítsd az űrlapot az új foglaláshoz.',409);
      const old = await one(c, "SELECT * FROM bookings WHERE request_key=$1", [
        key,
      ]);
      if (old) {
        if (paymentMethod === 'transfer' && JSON.stringify(old.billing_data,Object.keys(old.billing_data||{}).sort()) !== JSON.stringify(billing,Object.keys(billing||{}).sort()))
          fail('Ez a kérésazonosító más számlázási adatokhoz tartozik.',409);
        if (
          old.customer_email !== address ||
          old.course_id !== data.courseId ||
          old.customer_name !== name ||
          old.seats !== seats || old.customer_phone !== phone || old.note !== note || old.payment_method !== paymentMethod
        )
          fail("Ez a kérésazonosító már más foglaláshoz tartozik.", 409);
        const payment = await one(c, 'SELECT id,billing FROM payment_orders WHERE booking_id=$1', [old.id]);
        if (payment && JSON.stringify(payment.billing, Object.keys(payment.billing).sort()) !== JSON.stringify(billing, Object.keys(billing).sort()))
          fail('Ez a kérésazonosító más számlázási adatokhoz tartozik.', 409);
        return { booking: publicBooking(old), replayed: true, paymentId: payment?.id,
          ...(old.transfer_reference ? {redirectUrl:'/transfer?id='+old.id} : {}) };
      }
    }
    const slot = await checkBooking(c, data.courseId, seats, null, address);
    if (paymentMethod === 'stripe') {
      const payment = await payments.insert(c, { courseId: slot.id, seats, bookingData: draft, key,
        amount: Number(slot.price) * seats, email: address, description: `${slot.title} – ${seats} fő`, billing, config });
      // No booking, management token or booking confirmation exists before a verified payment.
      return { paymentId: payment.id };
    }
    const t = token();
    const b = await one(
      c,
      `INSERT INTO bookings(course_id,customer_name,customer_email,customer_phone,note,seats,total_price,manage_hash,manage_expires,request_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [
        slot.id,
        name,
        address,
        phone,
        note,
        seats,
        Number(slot.price) * seats,
        hash(t),
        new Date(new Date(slot.end_time).getTime() + 30 * 86400000),
        key || null,
      ],
    );
    const reference = manual ? null : 'CL-'+token().slice(0,12).toUpperCase();
    await c.query('UPDATE bookings SET payment_method=$2,billing_data=$3,transfer_reference=$4 WHERE id=$1', [b.id, paymentMethod, billing, reference]);
    b.payment_method = paymentMethod;
    b.billing_data = billing;
    b.transfer_reference = reference;
    await c.query('UPDATE courses SET session_count_locked=true WHERE id=$1',[slot.id]);
    const payment = paymentMethod === 'stripe' && billing ? await payments.insert(c, { bookingId: b.id, amount: Number(b.total_price),
      email: address, description: `${slot.title} – ${seats} fő`, billing, config }) : null;
    await bookingNotice(c, b, slot, "Foglalásod megérkezett", t);
    return { booking: publicBooking(b), course: slot, notification: "queued", paymentId: payment?.id,
      ...(reference ? {redirectUrl:'/transfer?id='+b.id} : {}) };
  });
}
async function updateIn(c, id, data) {
  const old = await one(c, select + " WHERE b.id=$1 FOR UPDATE OF b", [
    uuid(id),
  ]);
  if (!old) fail("A foglalás nem található.", 404);
  if (old.payment_method === 'stripe') {
    if (data.payment_status !== undefined && data.payment_status !== old.payment_status &&
        !(old.payment_status === 'paid' && data.payment_status === 'refunded'))
      fail('Stripe-fizetésnél csak a már fizetett összeg visszatérítése rögzíthető kézzel.', 409);
    if ((data.total_price !== undefined && Number(data.total_price) !== Number(old.total_price)) ||
        (data.seats !== undefined && Number(data.seats) !== old.seats))
      fail('Stripe-fizetéshez tartozó összeg és létszám itt nem módosítható.', 409);
    if (old.payment_status === 'pending' && ['course_id','status','customer_email'].some(k => data[k] !== undefined && data[k] !== old[k]))
      fail('A fizetés lezárásáig ez a foglalás nem módosítható.', 409);
  }
  if (
    data.updated_at &&
    new Date(data.updated_at).getTime() !== new Date(old.updated_at).getTime()
  )
    fail("A foglalás közben megváltozott. Frissítsd az oldalt.", 409);
  const b = { ...old };
  if (data.course_id !== undefined) b.course_id = uuid(data.course_id);
  if (data.customer_name !== undefined)
    b.customer_name = str(data.customer_name, "Név");
  if (data.customer_email !== undefined)
    b.customer_email = email(data.customer_email);
  if (data.customer_phone !== undefined)
    b.customer_phone = str(data.customer_phone, "Telefon", 40, false);
  if (data.note !== undefined)
    b.note = str(data.note, "Megjegyzés", 2000, false);
  if (data.admin_note !== undefined)
    b.admin_note = str(data.admin_note, "Belső megjegyzés", 4000, false);
  if (data.seats !== undefined)
    b.seats = integer(data.seats, "Létszám", 1, 100);
  if (data.status !== undefined) {
    if (!statuses.includes(data.status)) fail("Érvénytelen státusz.");
    b.status = data.status;
  }
  if (data.payment_status !== undefined) {
    if (
      !["pending", "paid", "refunded", "failed"].includes(data.payment_status)
    )
      fail("Érvénytelen fizetési státusz.");
    b.payment_status = data.payment_status;
  }
  const changed =
    b.course_id !== old.course_id ||
    b.seats !== old.seats ||
    b.customer_email !== old.customer_email ||
    (old.status === "cancelled" && b.status !== "cancelled");
  let slot = await one(c, "SELECT * FROM courses WHERE id=$1", [b.course_id]);
  if (!slot) fail("Az időpont nem található.", 404);
  if (b.course_id !== old.course_id) {
    if (new Date(old.start_time)<=new Date()) fail('Elkezdődött kurzus foglalása nem helyezhető át.',409);
    if ((await getSessions(c,b.course_id)).length!==old.sessions.length) fail('Az átfoglalás célja ugyanannyi alkalmat tartalmazzon.',409);
  }
  if (b.status !== "cancelled" && changed)
    slot = await checkBooking(c, b.course_id, b.seats, b.id, b.customer_email);
  if (
    ["completed", "no-show"].includes(b.status) &&
    new Date(slot.end_time) > new Date()
  )
    fail(
      "Teljesített vagy meg nem jelent státusz csak az alkalom vége után állítható be.",
    );
  if (changed && b.status === "cancelled" && b.course_id !== old.course_id)
    fail("Lemondott foglalás nem helyezhető át.");
  if (old.payment_method !== 'stripe' && (b.course_id !== old.course_id || b.seats !== old.seats))
    b.total_price = Number(slot.price) * b.seats;
  if (data.total_price !== undefined)
    b.total_price = integer(data.total_price, "Összeg");
  let newToken = null;
  if (b.customer_email !== old.customer_email) newToken = token();
  const saved = await one(
    c,
    `UPDATE bookings SET course_id=$2,customer_name=$3,customer_email=$4,customer_phone=$5,seats=$6,note=$7,admin_note=$8,status=$9,payment_status=$10,total_price=$11,updated_at=clock_timestamp(),manage_hash=COALESCE($12,manage_hash),manage_expires=$13 WHERE id=$1 RETURNING *`,
    [
      id,
      b.course_id,
      b.customer_name,
      b.customer_email,
      b.customer_phone,
      b.seats,
      b.note,
      b.admin_note,
      b.status,
      b.payment_status,
      b.total_price,
      newToken ? hash(newToken) : null,
      new Date(new Date(slot.end_time).getTime() + 30 * 86400000),
    ],
  );
  await bookingNotice(c, saved, slot, "Foglalásod frissült", newToken);
  return saved;
}
async function update(id, data) {
  return transaction(async (c) => {
    const before = await one(c,"SELECT course_id FROM bookings WHERE id=$1",[uuid(id)]);
    const b = await updateIn(c, id, data);
    if (b.course_id !== before.course_id || ["cancelled","completed","no-show"].includes(b.status))
      await c.query(
        "UPDATE change_requests SET status='rejected' WHERE booking_id=$1 AND status='pending'",
        [id],
      );
    return b;
  });
}
async function managed(c, id, t) {
  if (typeof t !== "string" || !/^[a-f\d]{64}$/.test(t))
    fail("Érvénytelen foglaláskezelő link.", 403);
  const b = await one(
    c,
    select + " WHERE b.id=$1 AND b.manage_hash=$2 AND b.manage_expires>now()",
    [uuid(id), hash(t)],
  );
  if (!b) fail("A link érvénytelen vagy lejárt.", 403);
  return b;
}
async function request(id, t, data) {
  return transaction(async (c) => {
    const b = await managed(c, id, t);
    if (!["pending", "confirmed"].includes(b.status))
      fail("Ez a foglalás már nem módosítható.", 409);
    const s = await one(c, "SELECT * FROM settings WHERE id=1");
    if (
      new Date(b.start_time).getTime() - Date.now() <
      s.cancellation_hours * 3600000
    )
      fail(
        "Az online módosítási határidő lejárt. Kérjük, lépj kapcsolatba velünk.",
        409,
      );
    if (!["cancel", "reschedule"].includes(data.kind))
      fail("Érvénytelen módosítás.");
    let target = null;
    if (data.kind === "reschedule") {
      target = await checkBooking(
        c,
        uuid(data.course_id),
        b.seats,
        b.id,
        b.customer_email,
      );
      if (target.service_id !== b.service_id || target.id === b.course_id)
        fail("Ugyanennek a képzésnek egy másik időpontját válaszd.");
      if (target.sessions.length!==b.sessions.length) fail('Ugyanennyi alkalmat tartalmazó kurzust válassz.',409);
    }
    if (
      await one(
        c,
        "SELECT 1 FROM change_requests WHERE booking_id=$1 AND status='pending'",
        [id],
      )
    )
      fail("Már van elbírálásra váró kérelmed.", 409);
    const r = await one(
      c,
      "INSERT INTO change_requests(booking_id,kind,target_course_id,note) VALUES($1,$2,$3,$4) RETURNING *",
      [
        id,
        data.kind,
        target?.id || null,
        str(data.note || "", "Megjegyzés", 2000, false),
      ],
    );
    await bookingNotice(
      c,
      b,
      { title: b.course_title, start_time: b.start_time },
      "Módosítási kérelmed adminisztrátori jóváhagyásra vár",
      undefined, { calendar: false },
    );
    return r;
  });
}
async function resolve(id, decision) {
  if (!["approved", "rejected"].includes(decision)) fail("Érvénytelen döntés.");
  return transaction(async (c) => {
    const r = await one(
      c,
      "SELECT * FROM change_requests WHERE id=$1 AND status='pending' FOR UPDATE",
      [uuid(id)],
    );
    if (!r) fail("A kérelem nem található vagy már elbírálták.", 409);
    if (decision === "approved") {
      const current = await one(c, select + " WHERE b.id=$1", [r.booking_id]);
      if (!["pending", "confirmed"].includes(current.status))
        fail("A foglalás már nem módosítható.", 409);
      if (r.kind === "reschedule") {
        const target = await one(
          c,
          "SELECT service_id FROM courses WHERE id=$1",
          [r.target_course_id],
        );
        if (!target || target.service_id !== current.service_id)
          fail("A kérelem már nem azonos szolgáltatásra vonatkozik.", 409);
      }
      await updateIn(
        c,
        r.booking_id,
        r.kind === "cancel"
          ? { status: "cancelled" }
          : { course_id: r.target_course_id, status: "confirmed" },
      );
    } else {
      const b = await one(c, select + " WHERE b.id=$1", [r.booking_id]);
      await bookingNotice(
        c,
        b,
        { title: b.course_title, start_time: b.start_time },
        "Módosítási kérelmedet elutasítottuk; az eredeti foglalás marad érvényben",
        undefined, { calendar: false },
      );
    }
    return one(
      c,
      "UPDATE change_requests SET status=$2 WHERE id=$1 RETURNING *",
      [id, decision],
    );
  });
}
module.exports = {
  select,
  publicBooking,
  create,
  update,
  managed,
  request,
  resolve,
};
