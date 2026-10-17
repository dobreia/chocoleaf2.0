import { api } from './courses';

export function redirectToStripe(redirectUrl, location = window.location) {
  let url;
  try { url = new URL(redirectUrl); }
  catch { throw new Error('Érvénytelen fizetési hivatkozás. Próbáld újra a fizetés indítását.'); }
  if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com' || url.username || url.password)
    throw new Error('Érvénytelen fizetési hivatkozás.');
  location.assign(url.href);
}

export async function startStripePayment(result, location = window.location) {
  let redirectUrl = result.redirectUrl;
  // Older running backends return a local continuation URL. Resolve it without showing that page.
  if (result.paymentId && (!redirectUrl || redirectUrl === '/payment#' + result.paymentId)) {
    const checkout = await api(`/payments/${encodeURIComponent(result.paymentId)}/checkout`, { method: 'POST', body: {} });
    redirectUrl = checkout.redirectUrl;
  }
  redirectToStripe(redirectUrl, location);
}
