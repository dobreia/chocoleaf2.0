const {renderEmail}=require('./mailTemplate');
function calendarError(calendar){
  if(!calendar)return null;
  if(!['REQUEST','CANCEL'].includes(calendar.method)||typeof calendar.content!=='string'||!calendar.content.startsWith('BEGIN:VCALENDAR')||typeof calendar.filename!=='string')
    return 'A levél régi vagy hibás naptárformátumot tartalmaz. Automatikus küldése leállt; törölhető a küldési sorból.';
  return null;
}
function errorDetails(error){
  if(error.code==='MAIL_FORMAT')return {message:error.message,stop:true};
  if(error.code==='EAUTH')return {message:'A levelezőszerver nem fogadta el a bejelentkezést. Ellenőrizd az SMTP-felhasználót és az alkalmazásjelszót.',stop:false};
  if(error.code==='EENVELOPE')return {message:'A levelezőszerver nem fogadta el a feladót vagy a címzettet. Ellenőrizd a címeket és a feladó jogosultságát.',stop:Number(error.responseCode)>=500};
  if(['ECONNECTION','ECONNREFUSED','ENOTFOUND','ETIMEDOUT','ESOCKET'].includes(error.code))return {message:'Nem sikerült kapcsolódni a levelezőszerverhez. Ellenőrizd a hálózatot, az SMTP-kiszolgálót és a portot.',stop:false};
  if(error.responseCode)return {message:`A levelezőszerver elutasította a küldést (SMTP ${Number(error.responseCode)||'hiba'}).`,stop:Number(error.responseCode)>=500};
  return {message:'Nem sikerült összeállítani vagy elküldeni a levelet. Az automatikus újrapróbálkozás folytatódik.',stop:false};
}
function mailOptions(mail){
  const invalid=calendarError(mail.calendar);
  if(invalid)throw Object.assign(new Error(invalid),{code:'MAIL_FORMAT'});
  return {
    from:mail.calendar?.from||process.env.MAIL_FROM||process.env.MAIL_USER,to:mail.recipient,subject:mail.subject,text:mail.body,
    html:mail.html||renderEmail({title:mail.subject.replace(/^ChocoLeaf\s*[–-]\s*/,''),body:mail.body}),
    attachments:(mail.attachments||[]).map(a=>({filename:a.filename,content:Buffer.from(a.content,'base64'),contentType:'application/pdf'})),
    ...(mail.calendar?{icalEvent:{method:mail.calendar.method,filename:mail.calendar.filename,content:mail.calendar.content}}:{}),
    messageId:`<${mail.id}@chocoleaf.hu>`
  };
}
module.exports={calendarError,errorDetails,mailOptions};
