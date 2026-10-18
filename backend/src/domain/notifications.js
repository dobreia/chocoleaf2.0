const pool = require("../db");
const nodemailer = require("nodemailer");
const {getSessions}=require('./courseSessions');
const { syncBookingCalendar } = require('./bookingCalendar');
async function queue(c, to, subject, body, attachments = []) {
  if (to)
    await c.query(
      "INSERT INTO outbox(recipient,subject,body,attachments) VALUES($1,$2,$3,$4)",
      [to, subject, body, JSON.stringify(attachments)],
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
  const billingEmail = payment?.billing?.buyerType === 'company' && payment.billing.billingEmail
    ? `\nSzámlázási e-mail-cím: ${payment.billing.billingEmail}` : '';
  const sessions=await getSessions(c,b.course_id);
  const sessionDetails=sessions.length>1 ? '\nA foglalás az összes alkalomra szól.\n'+sessions.map((s,i)=>`${i+1}/${sessions.length}. alkalom: ${new Date(s.start_time).toLocaleString('hu-HU',{timeZone:'Europe/Budapest'})} – ${new Date(s.end_time).toLocaleString('hu-HU',{timeZone:'Europe/Budapest'})}`).join('\n') : '';
  const body = `Kedves ${b.customer_name}!\n\n${event}\n${slot.title}\n${new Date(slot.start_time).toLocaleString("hu-HU", { timeZone: "Europe/Budapest" })} (budapesti idő)\n${b.seats} fő • ${b.total_price} Ft\nStátusz: ${{ pending: "Függőben", confirmed: "Visszaigazolt", cancelled: "Lemondva", completed: "Teljesítve", "no-show": "Nem jelent meg" }[b.status]}\nAzonosító: ${b.id}${link}\n\nChocoLeaf`;
  const end = slot.end_time || b.end_time;
  const details = sessionDetails + (end ? `\nBefejezés: ${new Date(end).toLocaleString('hu-HU', {timeZone:'Europe/Budapest'})} (budapesti idő)` : '') + `\nFizetés: ${{pending:'Fizetésre vár',paid:'Fizetve',refunded:'Visszatérítve',failed:'Sikertelen'}[b.payment_status] || b.payment_status}`;
  await queue(c, b.customer_email, "ChocoLeaf – " + event, body + details + (payment && b.payment_status === 'pending' ? `\nBankkártyás fizetés folytatása: ${origin}/payment#${payment.id}` : ''));
  await queue(
    c,
    process.env.MAIL_ADMIN || process.env.MAIL_FROM,
    "ChocoLeaf – " + event,
    `${body.replace(link, '')}${details}\nEmail: ${b.customer_email}${billingEmail}\nTelefon: ${b.customer_phone || '–'}\nMegjegyzés: ${b.note || '–'}\n\nAdmin: ${origin}/admin/bookings`,
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
        "SELECT * FROM outbox WHERE sent_at IS NULL AND next_attempt<=now() ORDER BY created_at LIMIT 10 FOR UPDATE SKIP LOCKED",
      )
    ).rows;
    const transport = nodemailer.createTransport(require('../lib/smtp').options());
    for (const mail of rows) {
      try {
        await transport.sendMail({
          from: mail.calendar?.from || process.env.MAIL_FROM || process.env.MAIL_USER,
          to: mail.recipient,
          subject: mail.subject,
          text: mail.body,
          attachments: (mail.attachments || []).map(a => ({filename:a.filename, content:Buffer.from(a.content, 'base64'), contentType:'application/pdf'})),
          ...(mail.calendar ? { icalEvent: {
            method: mail.calendar.method, filename: mail.calendar.filename, content: mail.calendar.content,
          }} : {}),
          messageId: `<${mail.id}@chocoleaf.hu>`,
        });
        await c.query(
          "UPDATE outbox SET sent_at=now(),attempts=attempts+1 WHERE id=$1",
          [mail.id],
        );
      } catch {
        await c.query(
          "UPDATE outbox SET attempts=attempts+1,next_attempt=now()+interval '5 minutes' WHERE id=$1",
          [mail.id],
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
