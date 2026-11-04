import {dateTime} from './format.js';

export function inquiryReplyUrl(inquiry){
  const name=(inquiry.name||'Érdeklődő').replace(/[\r\n]+/g,' ').trim();
  const subject=(inquiry.subject||'ChocoLeaf megkeresés').replace(/[\r\n]+/g,' ').trim();
  const body=[`Kedves ${name}!`,'','','Üdvözlettel,','ChocoLeaf','','--- Eredeti megkeresés ---',
    `Feladó: ${name} <${inquiry.email}>`,`Dátum: ${dateTime(inquiry.created_at)}`,`Tárgy: ${subject}`,'',
    (inquiry.message||'').split(/\r?\n/).map(line=>'> '+line).join('\n')].join('\n');
  return 'https://mail.google.com/mail/?'+new URLSearchParams({tf:'cm',view:'cm',fs:'1',to:inquiry.email,su:'Re: '+subject,body});
}
