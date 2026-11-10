function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function safeUrl(value){
  try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)?url.href:null;}catch{return null;}
}
function origin(){return (process.env.FRONTEND_URL||'http://localhost:5173').split(',')[0].replace(/\/$/,'');}
function lineHtml(value){
  return String(value).split(/(https?:\/\/[^\s<>"']+)/g).map(part=>{
    const url=safeUrl(part);
    try{if(url&&new URL(url).origin===new URL(origin()).origin)return `<a href="${escapeHtml(url)}" style="color:#6C485C;overflow-wrap:anywhere">${escapeHtml(part)}</a>`;}catch{ /* invalid configured origin */ }
    return escapeHtml(part);
  }).join('');
}
function billingText(b={}){
  const company=b.buyerType==='company';
  return `Vevő típusa: ${company?'Cég':'Magánszemély'}\nSzámlázási név: ${b.name||(company?b.companyName:b.privateName)||'–'}\nSzámlázási cím: ${b.post_code?[b.post_code,b.city,b.address].filter(Boolean).join(' '):(company?b.companyAddress:b.privateAddress)||'–'}${company?'\nAdószám: '+(b.taxcode||b.taxNumber||'–'):''}${b.billingEmail?'\nSzámlázási e-mail-cím: '+b.billingEmail:''}`;
}
function renderEmail({title,body,action}){
  const paragraphs=String(body||'').split(/\n\s*\n/).filter(Boolean).map(block=>{
    const lines=block.split('\n').map(line=>{
      const match=line.match(/^([^:]{1,45}):\s*(.*)$/);
      if(match){
        const amount=/^(\d+) Ft$/.exec(match[2]);
        const value=amount?new Intl.NumberFormat('hu-HU').format(Number(amount[1]))+' Ft':match[2];
        return `<strong>${escapeHtml(match[1])}:</strong> ${lineHtml(value)}`;
      }
      return lineHtml(line);
    }).join('<br>');
    const highlight=/^(Átutalási adatok|Számlázási adatok|Kurzus időpontjai|Ajándékutalványok|Utalványok adatai|Foglalási adatok)/.test(block);
    return `<p style="margin:0 0 20px;line-height:1.7;overflow-wrap:anywhere;${highlight?'padding:16px;background:#f5edf2;border-left:4px solid #6C485C;border-radius:6px;':''}">${lines}</p>`;
  }).join('');
  const url=action&&safeUrl(action.url);
  return `<!doctype html><html lang="hu"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head><body style="margin:0;background:#f7f3ef;color:#402b39;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#fff;border:1px solid #e3d4df;border-radius:16px"><tr><td style="padding:24px 28px;background:#6C485C;color:#fff;border-radius:16px 16px 0 0;font-size:26px;font-weight:bold">ChocoLeaf</td></tr><tr><td style="padding:28px"><h1 style="font-size:24px;line-height:1.3;margin:0 0 24px;color:#6C485C">${escapeHtml(title)}</h1>${paragraphs}${url?`<p style="margin:24px 0"><a href="${escapeHtml(url)}" style="display:inline-block;padding:13px 20px;background:#6C485C;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">${escapeHtml(action.label)}</a></p><p style="font-size:12px;line-height:1.5;overflow-wrap:anywhere">Ha a gomb nem nyílik meg: <a href="${escapeHtml(url)}" style="color:#6C485C">${escapeHtml(url)}</a></p>`:''}</td></tr><tr><td style="padding:18px 28px;border-top:1px solid #e3d4df;color:#76616e;font-size:12px">ChocoLeaf · Kézműves csokoládéélmények</td></tr></table></td></tr></table></body></html>`;
}
module.exports={escapeHtml,safeUrl,origin,billingText,renderEmail};
