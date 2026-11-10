const pool = require("../db");
const nodemailer = require("nodemailer");
const {getSessions}=require('./courseSessions');
const { syncBookingCalendar } = require('./bookingCalendar');
const {renderEmail}=require('../lib/mailTemplate');
const {mailOptions,errorDetails}=require('../lib/mailDelivery');
async function queue(c, to, subject, body, attachments = [], options={}) {
  if (to)
    await c.query(
      "INSERT INTO outbox(recipient,subject,body,attachments,html) VALUES($1,$2,$3,$4,$5)",
      [to, subject, body, JSON.stringify(attachments),renderEmail({title:options.title||subject.replace(/^ChocoLeaf\s*[–-]\s*/,''),body,action:options.action})],
    );
}
async function bookingNotice(c, b, slot, event, manageToken, { calendar = true } = {}) {
  const origin = (process.env.FRONTEND_URL || "http://localhost:5173").split(',')[0].replace(
    /\/$/,
    "",
  );
  const link = manageToken
    ? `\nFoglalás kezelése: ${origin}/booking/manage#${b.id}.${manageToken}\nA módosítás és lemondás adminisztrátori jóváhagyás után lép életbe. A linket tartsd bizalmasan.`
    : "\nA foglalás kezeléséhez használd az eredeti visszaigazoló levélben kapott linket.";
  const payment = b.payment_method === 'stripe'
    ? (await c.query('SELECT id,billing FROM payment_orders WHERE booking_id=$1', [b.id])).rows[0] : null;
  const billing = payment?.billing || b.billing_data;
  const billingEmail = billing?.buyerType === 'company' && billing.billingEmail
    ? `\nSzámlázási e-mail-cím: ${billing.billingEmail}` : '';
  const billingDetails = billing ? `\nSzámlázási név: ${billing.name}\nSzámlázási cím: ${billing.post_code} ${billing.city}, ${billing.address}${billing.taxcode?'\nAdószám: '+billing.taxcode:''}` : '';
  const transfer = b.payment_method === 'transfer' && b.transfer_reference && b.payment_status === 'pending' && b.status !== 'cancelled'
    ? require('./transfers').instructions(b.total_price-(b.voucher_discount||0),b.transfer_reference,b.id) : '';
  const sessions=await getSessions(c,b.course_id);
  let voucherDetails='';
  if(b.voucher_codes?.length){
    const uses=(await c.query('SELECT code,status FROM booking_vouchers WHERE booking_id=$1 ORDER BY code',[b.id])).rows;
    const outcome=b.status==='cancelled'
      ? uses.every(u=>u.status==='released')?'Az utalványok az eredeti lejáratig újra felhasználhatók.':'Az utalványok beváltottnak minősülnek, nem használhatók fel újra.'
      : 'Az utalványokat ehhez a foglaláshoz felhasználtuk.';
    voucherDetails=`\nAjándékutalványok: ${b.voucher_codes.join(', ')}\nUtalványból fedezett összeg: ${b.voucher_discount} Ft\nPénzben fizetendő különbözet: ${b.total_price-b.voucher_discount} Ft\n${outcome}\n${require('./vouchers').policy}`;
  }
  const sessionDetails=sessions.length ? '\n\nKurzus időpontjai\n'+(sessions.length>1?'A foglalás az összes alkalomra szól.\n':'')+sessions.map((s,i)=>`${i+1}/${sessions.length}. alkalom: ${new Date(s.start_time).toLocaleString('hu-HU',{timeZone:'Europe/Budapest'})} – ${new Date(s.end_time).toLocaleString('hu-HU',{timeZone:'Europe/Budapest'})}`).join('\n') : '';
  const body = `Kedves ${b.customer_name}!\n\n${event}\n\nFoglalási adatok\nKurzus: ${slot.title}\nKezdés: ${new Date(slot.start_time).toLocaleString("hu-HU", { timeZone: "Europe/Budapest" })}\nLétszám: ${b.seats} fő\nTeljes összeg: ${b.total_price} Ft\nStátusz: ${{ pending: "Függőben", confirmed: "Visszaigazolt", cancelled: "Lemondva", completed: "Teljesítve", "no-show": "Nem jelent meg" }[b.status]}\nAzonosító: ${b.id}${link}`;
  const end = slot.end_time || b.end_time;
  const details = sessionDetails + (end ? `\nBefejezés: ${new Date(end).toLocaleString('hu-HU', {timeZone:'Europe/Budapest'})} (budapesti idő)` : '') + `\nFizetés: ${{pending:'Fizetésre vár',paid:'Fizetve',refunded:'Visszatérítve',failed:'Sikertelen'}[b.payment_status] || b.payment_status}`;
  await queue(c, b.customer_email, "ChocoLeaf – " + event, body + details + voucherDetails + transfer + (payment && b.payment_status === 'pending' ? `\nBankkártyás fizetés folytatása: ${origin}/payment#${payment.id}` : ''),[],
    {action:manageToken?{label:'Foglalás kezelése',url:`${origin}/booking/manage#${b.id}.${manageToken}`}:undefined});
  await queue(
    c,
    process.env.MAIL_ADMIN || process.env.MAIL_FROM,
    "ChocoLeaf – " + event,
    `${event}\n\nFoglalási adatok\nKurzus: ${slot.title}\nNév: ${b.customer_name}\nLétszám: ${b.seats} fő\nTeljes összeg: ${b.total_price} Ft\nAzonosító: ${b.id}${details}${voucherDetails}${transfer}\n\nÜgyfél elérhetősége\nEmail: ${b.customer_email}\nTelefon: ${b.customer_phone || '–'}\nMegjegyzés: ${b.note || '–'}${billingDetails?'\n\nSzámlázási adatok'+billingDetails+billingEmail:''}\n\nAdmin: ${origin}/admin/bookings?booking=${b.id}`,[],
    {action:{label:'Foglalás megnyitása',url:`${origin}/admin/bookings?booking=${b.id}`}},
  );
  if (calendar) await syncBookingCalendar(c, b, slot, sessions);
}
let running = false;
async function deliver() {
  if (running || (!process.env.MAIL_USER && !process.env.SMTP_HOST)) return;
  running = true;
  let c;
  try {
    c = await pool.connect();
    await c.query("BEGIN");
    const rows = (
      await c.query(
        "SELECT * FROM outbox WHERE sent_at IS NULL AND NOT retry_stopped AND next_attempt<=now() ORDER BY created_at LIMIT 10 FOR UPDATE SKIP LOCKED",
      )
    ).rows;
    const transport = nodemailer.createTransport(require('../lib/smtp').options());
    for (const mail of rows) {
      try {
        await transport.sendMail(mailOptions(mail));
        await c.query(
          "UPDATE outbox SET sent_at=now(),last_attempt_at=now(),last_error=NULL,retry_stopped=false,attempts=attempts+1 WHERE id=$1",
          [mail.id],
        );
      } catch (error) {
        const failure=errorDetails(error);
        await c.query(
          "UPDATE outbox SET attempts=attempts+1,last_attempt_at=now(),last_error=$2,retry_stopped=$3,next_attempt=now()+interval '5 minutes' WHERE id=$1",
          [mail.id,failure.message,failure.stop],
        );
      }
    }
    await c.query("COMMIT");
  } catch (e) {
    if (c) await c.query("ROLLBACK");
    console.error("Email queue:", e.code || "delivery error");
  } finally {
    c?.release();
    running = false;
  }
}
module.exports = { queue, bookingNotice, deliver };
