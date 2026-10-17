const nodemailer = require("nodemailer");

function getTransporter() {
  return nodemailer.createTransport(
    process.env.SMTP_HOST
      ? {
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT || 587),
          secure: process.env.SMTP_PORT === "465",
          auth: process.env.MAIL_USER
            ? { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS }
            : undefined,
          connectionTimeout: 10000,
          socketTimeout: 15000,
        }
      : {
          service: "gmail",
          auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
          connectionTimeout: 10000,
          socketTimeout: 15000,
        },
  );
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function sendVoucherEmail(toEmail, recipientName, attachments) {
  const isMultiple = attachments.length > 1;
  const voucherWord = isMultiple ? "ajándékutalványokat" : "ajándékutalványt";
  const subject = isMultiple
    ? "Ajándékutalványaid megérkeztek"
    : "Ajándékutalványod megérkezett";

  await getTransporter().sendMail({
    from: process.env.MAIL_FROM,
    to: toEmail,
    subject,
    text: `Kedves ${recipientName}!

Köszönjük a vásárlást! Az ${voucherWord} csatolmányként megtalálod.

Üdv,
ChocoLeaf`,
    attachments: attachments.map((attachment) => ({
      filename: `voucher_${attachment.serial}.pdf`,
      path: attachment.path,
    })),
  });
}

async function sendGiftcardAdminEmail(intent, approveUrl) {
  const { meta, amount, notice } = intent;
  const names =
    Array.isArray(meta.names) && meta.names.length > 0
      ? meta.names
      : [meta.name];
  const isMultiple = names.length > 1;
  const nameLabel = isMultiple
    ? "Utalványokon szereplő nevek"
    : "Utalványon szereplő név";
  const billingData = meta.billingData || {};

  const namesText = isMultiple
    ? names.map((name, index) => `${index + 1}. ${name}`).join("\n")
    : names[0];
  const namesHtml = isMultiple
    ? `<ul>${names.map((name, index) => `<li>${index + 1}. ${escapeHtml(name)}</li>`).join("")}</ul>`
    : `<p><b>${nameLabel}:</b> ${escapeHtml(names[0])}</p>`;

  const billingText =
    billingData.buyerType === "company"
      ? `Vevő típusa: Cég
Cégnév: ${billingData.companyName}
Székhely: ${billingData.companyAddress}
Adószám: ${billingData.taxNumber}`
      : `Vevő típusa: Magánszemély
Név: ${billingData.privateName || ""}
Lakcím: ${billingData.privateAddress || ""}`;

  const billingHtml =
    billingData.buyerType === "company"
      ? `
            <p><b>Vevő típusa:</b> Cég</p>
            <p><b>Cégnév:</b> ${escapeHtml(billingData.companyName)}</p>
            <p><b>Székhely:</b> ${escapeHtml(billingData.companyAddress)}</p>
            <p><b>Adószám:</b> ${escapeHtml(billingData.taxNumber)}</p>
        `
      : `
            <p><b>Vevő típusa:</b> Magánszemély</p>
            <p><b>Név:</b> ${escapeHtml(billingData.privateName)}</p>
            <p><b>Lakcím:</b> ${escapeHtml(billingData.privateAddress)}</p>
        `;

  await getTransporter().sendMail({
    from: process.env.MAIL_FROM,
    to: process.env.MAIL_ADMIN || process.env.MAIL_FROM,
    subject: "Új ajándékutalvány rendelés érkezett",
    text: `Új ajándékutalvány rendelés

Megrendelő email: ${meta.email}

${nameLabel}:
${namesText}

Számlázási adatok:
${billingText}

Összeg: ${amount} Ft
Darabszám: ${meta.quantity}
Közlemény: ${notice}

Kifizetve -> Voucher küldése:
${approveUrl}

Csak akkor kattints, ha az utalás ténylegesen megérkezett.`,
    html: `
            <h2>Új ajándékutalvány rendelés</h2>
            <p><b>Megrendelő email:</b> ${escapeHtml(meta.email)}</p>
            ${isMultiple ? `<p><b>${nameLabel}:</b></p>${namesHtml}` : namesHtml}
            <h3>Számlázási adatok</h3>
            ${billingHtml}
            <p><b>Összeg:</b> ${amount} Ft</p>
            <p><b>Darabszám:</b> ${meta.quantity}</p>
            <p><b>Közlemény:</b> <code>${escapeHtml(notice)}</code></p>
            <hr/>
            <p>
                <a href="${escapeHtml(approveUrl)}" style="display:inline-block;padding:10px 16px;background:#6C485C;color:white;text-decoration:none;border-radius:6px;font-weight:bold;">
                    Kifizetve -> Voucher küldése
                </a>
            </p>
            <p style="color:#666;font-size:12px">Csak akkor kattints, ha az utalás ténylegesen megérkezett.</p>
        `,
  });
}

module.exports = {
  sendVoucherEmail,
  sendGiftcardAdminEmail,
};
