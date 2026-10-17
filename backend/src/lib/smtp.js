function options(env = process.env) {
  const common = {connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000};
  return env.SMTP_HOST ? {...common,host:env.SMTP_HOST,port:Number(env.SMTP_PORT || 587),secure:Number(env.SMTP_PORT || 587)===465,
    auth:env.MAIL_USER ? {user:env.MAIL_USER,pass:env.MAIL_PASS} : undefined} :
    {...common,service:'gmail',auth:{user:env.MAIL_USER,pass:env.MAIL_PASS}};
}
function validateReal(env = process.env) {
  const missing=['MAIL_USER','MAIL_PASS','MAIL_FROM','MAIL_ADMIN'].filter(k=>!env[k]?.trim());
  if(missing.length)throw Error('A valódi emailküldéshez töltsd ki a backend/.env fájlban: '+missing.join(', ')+'.');
  const port=Number(env.SMTP_PORT || 587);
  if(!Number.isInteger(port)||port<1||port>65535)throw Error('Érvénytelen SMTP_PORT.');
}
async function verifyReal(env = process.env) {
  validateReal(env);
  const transport=require('nodemailer').createTransport(options(env));
  try {await transport.verify();}
  catch {throw Error('Az SMTP-kapcsolat ellenőrzése sikertelen. Ellenőrizd a kiszolgálót, portot, felhasználónevet és jelszót a backend/.env fájlban.');}
  finally {transport.close();}
}
function localMode(env = process.env, check = false) {
  if(check)return 'capture';
  const mode=env.LOCAL_MAIL_MODE || 'capture';
  if(!['real','capture'].includes(mode))throw Error('A LOCAL_MAIL_MODE értéke real vagy capture lehet.');
  return mode;
}
module.exports={options,validateReal,verifyReal,localMode};
