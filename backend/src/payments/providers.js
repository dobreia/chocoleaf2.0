const { fail, str, email } = require('../domain/rules');

function provider() {
  return 'transfer';
}
function configuration(kind) {
  if (process.env.PAYMENT_LOCAL_TEST === '1') {
    let local = false;
    try { local = ['localhost','127.0.0.1','[::1]'].includes(new URL(process.env.FRONTEND_URL).hostname); } catch { /* invalid URL */ }
    if (process.env.NODE_ENV !== 'development' || !local || !/^sk_test_/.test(process.env.STRIPE_SECRET_KEY || '') || !process.env.STRIPE_WEBHOOK_SECRET)
      fail('A helyi tesztmódhoz localhost, development környezet és Stripe-tesztkulcs szükséges.',503);
    return { mode: 'local-test' };
  }
  const vat = process.env[kind === 'giftcard' ? 'BILLINGO_GIFT_VAT' : 'BILLINGO_BOOKING_VAT'];
  const type = process.env[kind === 'giftcard' ? 'BILLINGO_GIFT_DOCUMENT_TYPE' : 'BILLINGO_BOOKING_DOCUMENT_TYPE'];
  const blockId = Number(process.env.BILLINGO_BLOCK_ID);
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET ||
      !process.env.BILLINGO_API_KEY || !Number.isInteger(blockId) || blockId < 1 ||
      !['0%','5%','18%','27%','AAM','TAM','ÁKK'].includes(vat) || !['invoice', 'advance'].includes(type))
    fail('Az online fizetés beállítása még nem teljes. Kérjük, keress minket.', 503);
  return { vat, type, blockId };
}
function billingData(data) {
  if (!data || !['private','company'].includes(data.buyerType)) fail('Hiányzó számlázási adatok.');
  const company = data.buyerType === 'company';
  const billing = {
    buyerType: data.buyerType,
    name: str(company ? data.companyName : data.privateName, 'Számlázási név', 200),
    country_code: 'HU',
    post_code: str(data.postCode, 'Irányítószám', 4),
    city: str(data.city, 'Település', 100),
    address: str(data.street, 'Utca, házszám', 200),
    taxcode: company ? str(data.taxNumber, 'Adószám', 13) : '',
  };
  if (!/^\d{4}$/.test(billing.post_code)) fail('Négyjegyű magyar irányítószám szükséges.');
  if (company && !/^\d{8}-\d-\d{2}$/.test(billing.taxcode)) fail('Az adószám formátuma: 12345678-1-12.');
  if (company) billing.billingEmail = email(str(data.billingEmail, 'Számlázási e-mail-cím', 254));
  return billing;
}
let client;
function stripe() {
  if (!client) client = new (require('stripe'))(process.env.STRIPE_SECRET_KEY, { timeout: 15000, maxNetworkRetries: 2 });
  return client;
}
async function billingo(path, body) {
  const response = await fetch('https://api.billingo.hu/v3' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'X-API-KEY': process.env.BILLINGO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  if (response.status === 404 && body === undefined) return null;
  if (!response.ok) throw new Error('Billingo HTTP ' + response.status);
  return response.status === 204 ? {} : response.json();
}
module.exports = { provider, configuration, billingData, stripe, billingo };
