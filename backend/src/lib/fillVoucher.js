const fs = require("fs");
const path = require("path");
const { PDFDocument, rgb } = require("pdf-lib");
const fontkit = require("fontkit");

async function fillVoucherDesign(recipientText, amount, forcedSerial) {
  const assetsDir = path.resolve(__dirname, "../../../frontend/public/assets");
  const voucherDir = path.join(assetsDir, "voucher");
  const pdfPath = path.join(voucherDir, "utalvany_ures_fillable.pdf");
  const bytes = fs.readFileSync(pdfPath);
  const pdfDoc = await PDFDocument.load(bytes, { updateMetadata: false });
  pdfDoc.registerFontkit(fontkit);

  const form = pdfDoc.getForm();

  const customFont = await pdfDoc.embedFont(
    fs.readFileSync(path.join(assetsDir, "fonts", "bellaboo-1.ttf")),
  );
  const dateFont = await pdfDoc.embedFont(
    fs.readFileSync(path.join(assetsDir, "fonts", "OpenSans-Bold.ttf")),
  );
  const serialFont = await pdfDoc.embedFont(
    fs.readFileSync(path.join(assetsDir, "fonts", "Montserrat-Bold.ttf")),
  );

  form.deleteXFA?.();

  const recipient = form.getTextField("recipient");
  const serial = form.getTextField("serial");
  const valid = form.getTextField("valid_until");
  const amountField = form.getTextField("amount");

  function getRect(field) {
    const acro = field.acroField ?? field;
    const widget = acro.getWidgets()[0];
    const rect = widget.getRectangle?.() ?? widget.getRect?.();
    if (!rect) throw new Error("Nem sikerult rect-et kiolvasni");

    if (Array.isArray(rect)) {
      return {
        x: rect[0],
        y: rect[1],
        width: rect[2] - rect[0],
        height: rect[3] - rect[1],
      };
    }

    return rect;
  }

  function drawTextCustom(
    field,
    text,
    fontSize,
    align,
    color,
    page,
    yOffset = 0,
    font = customFont,
    xOffset = 0,
  ) {
    const { x, y, width, height } = getRect(field);
    const textWidth = font.widthOfTextAtSize(text, fontSize);

    let drawX = x;
    if (align === "right") drawX = x + width - textWidth;
    if (align === "center") drawX = x + (width - textWidth) / 2;

    const baseline = y + (height - fontSize) / 2;

    page.drawText(text, {
      x: drawX + xOffset,
      y: baseline + 2 + yOffset,
      size: fontSize,
      font,
      color,
    });
  }

  const today = new Date();
  const validUntil = new Date(today);
  validUntil.setMonth(validUntil.getMonth() + 3);
  const validText = validUntil.toISOString().split("T")[0];
  const pages = pdfDoc.getPages();

  function generateSerial() {
    const yy = today.getFullYear().toString().slice(-2);
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    const datePart = `${yy}${mm}${dd}`;
    const files = fs.existsSync(voucherDir) ? fs.readdirSync(voucherDir) : [];
    const todays = files.filter((file) =>
      file.includes(`filled_voucher_${datePart}`),
    );
    return `${datePart}-${todays.length + 1}`;
  }

  const serialText =
    (forcedSerial && String(forcedSerial).trim()) || generateSerial();
  const safeSerialForFilename = serialText.replace(/[^A-Za-z0-9._-]/g, "_");

  drawTextCustom(
    recipient,
    String(recipientText || ""),
    20,
    "center",
    rgb(1, 1, 1),
    pages[0],
    3,
  );
  drawTextCustom(
    serial,
    serialText,
    5,
    "right",
    rgb(1, 1, 1),
    pages[0],
    -1,
    serialFont,
    -2,
  );
  drawTextCustom(
    serial,
    serialText,
    5,
    "right",
    rgb(1, 1, 1),
    pages[1],
    -1,
    serialFont,
    -2,
  );
  drawTextCustom(
    valid,
    validText,
    15,
    "center",
    rgb(1, 1, 1),
    pages[1],
    1,
    dateFont,
  );
  drawTextCustom(
    amountField,
    `${amount} Ft`,
    24,
    "center",
    rgb(1, 1, 1),
    pages[0],
  );

  form.removeField(recipient);
  form.removeField(serial);
  form.removeField(valid);
  form.removeField(amountField);

  const outputDir = path.resolve(__dirname, "../../private/vouchers");
  fs.mkdirSync(outputDir, { recursive: true });
  const outPath = path.join(
    outputDir,
    `filled_voucher_${safeSerialForFilename}.pdf`,
  );
  fs.writeFileSync(outPath, await pdfDoc.save());

  return { serial: serialText, outPath };
}

module.exports = {
  fillVoucherDesign,
};
