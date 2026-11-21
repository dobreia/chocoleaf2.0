// One canonical public address for payment links, emails and OAuth callbacks.
function siteConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const value = env.FRONTEND_URL || (production ? '' : 'http://localhost:5173');
  const origins = value.split(',').map(value => value.trim()).filter(Boolean).map(value => {
    let url;
    try { url = new URL(value); } catch { throw Error('A FRONTEND_URL érvényes webcím legyen.'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
        url.pathname !== '/' || url.search || url.hash ||
        (production && (url.protocol !== 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))))
      throw Error('A FRONTEND_URL csak webhelycímet tartalmazhat; élesben nyilvános HTTPS-cím szükséges.');
    return url.origin;
  });
  if (!origins.length) throw Error('Éles indításhoz add meg a FRONTEND_URL értékét.');
  return {origin: origins[0], origins: [...new Set(origins)]};
}
module.exports = siteConfig;
