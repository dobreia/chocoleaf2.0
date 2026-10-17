const {test}=require('node:test');
const assert=require('node:assert/strict');
const smtp=require('../src/lib/smtp');
test('real email mode preserves SMTP credentials; checks always use capture',()=>{
  const env={LOCAL_MAIL_MODE:'real',SMTP_HOST:'smtp.example.test',SMTP_PORT:'465',MAIL_USER:'user',MAIL_PASS:'secret',MAIL_FROM:'sender@example.test',MAIL_ADMIN:'admin@example.test'};
  assert.equal(smtp.localMode(env),'real');assert.equal(smtp.localMode(env,true),'capture');
  assert.equal(smtp.localMode({}),'capture');assert.throws(()=>smtp.localMode({LOCAL_MAIL_MODE:'typo'}));
  smtp.validateReal(env);assert.equal(smtp.options(env).secure,true);assert.deepEqual(smtp.options(env).auth,{user:'user',pass:'secret'});
  assert.equal(smtp.options({...env,SMTP_PORT:'587'}).secure,false);
  assert.throws(()=>smtp.validateReal({...env,MAIL_ADMIN:''}),/MAIL_ADMIN/);
  assert.throws(()=>smtp.validateReal({...env,SMTP_PORT:'bad'}),/SMTP_PORT/);
});
test('SMTP verification does not send emails and sanitizes provider errors',async()=>{
  const mailer=require('nodemailer'),original=mailer.createTransport;
  const env={MAIL_USER:'user',MAIL_PASS:'private-password',MAIL_FROM:'sender@example.test',MAIL_ADMIN:'admin@example.test'};
  let closed=0;
  try {
    mailer.createTransport=()=>({verify:async()=>true,close:()=>closed++,sendMail:()=>assert.fail('Verification must not send mail')});
    await smtp.verifyReal(env);assert.equal(closed,1);
    mailer.createTransport=()=>({verify:async()=>{throw Error('private-password');},close:()=>closed++});
    await assert.rejects(smtp.verifyReal(env),e=>e.message.includes('SMTP')&&!e.message.includes('private-password'));
    assert.equal(closed,2);
  } finally {mailer.createTransport=original;}
});
