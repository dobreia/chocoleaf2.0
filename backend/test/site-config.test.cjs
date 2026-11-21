const {test}=require('node:test');
const assert=require('node:assert/strict');
const siteConfig=require('../src/lib/siteConfig');

test('production uses the canonical HTTPS domain and normalizes CORS origins',()=>{
  assert.deepEqual(siteConfig({NODE_ENV:'production',FRONTEND_URL:' https://www.chocoleaf.hu/ , https://chocoleaf.hu '}),{
    origin:'https://www.chocoleaf.hu',origins:['https://www.chocoleaf.hu','https://chocoleaf.hu'],
  });
});
test('production rejects missing, local, insecure or path-based public addresses',()=>{
  for(const FRONTEND_URL of ['', 'http://www.chocoleaf.hu', 'https://localhost', 'https://127.0.0.1',
    'https://www.chocoleaf.hu/courses', 'https://www.chocoleaf.hu?x=1', 'https://www.chocoleaf.hu/#x',
    'https://user:password@www.chocoleaf.hu','not-a-url'])
    assert.throws(()=>siteConfig({NODE_ENV:'production',FRONTEND_URL}));
});
test('local development retains its HTTP address',()=>{
  assert.equal(siteConfig({}).origin,'http://localhost:5173');
  assert.equal(siteConfig({NODE_ENV:'development',FRONTEND_URL:'http://127.0.0.1:5174/'}).origin,'http://127.0.0.1:5174');
});
test('email, transfer instructions and Google callbacks all use the canonical domain',()=>{
  const values={NODE_ENV:'production',FRONTEND_URL:'https://www.chocoleaf.hu/',
    TRANSFER_BENEFICIARY:'Example',TRANSFER_ACCOUNT:'11111111-22222222',
    GOOGLE_CONTACTS_REDIRECT_URI:'',GOOGLE_CALENDAR_REDIRECT_URI:''};
  const saved=Object.fromEntries(Object.keys(values).map(key=>[key,process.env[key]]));
  try{
    Object.assign(process.env,values);
    const mail=require('../src/lib/mailTemplate');
    assert.equal(mail.origin(),'https://www.chocoleaf.hu');
    const body=require('../src/domain/transfers').instructions(19000,'REFERENCE','booking-id');
    assert.match(body,/https:\/\/www\.chocoleaf\.hu\/transfer\?id=booking-id/);
    const html=mail.renderEmail({title:'Test',body,action:{label:'Admin',url:mail.origin()+'/admin'}});
    assert.match(html,/href="https:\/\/www\.chocoleaf\.hu\/admin"/);
    assert.doesNotMatch(html,/localhost|127\.0\.0\.1/);
    assert.equal(require('../src/contacts/google').config().redirect,'https://www.chocoleaf.hu/api/contacts/google/callback');
    assert.equal(require('../src/calendar/google').config().redirect,'https://www.chocoleaf.hu/api/calendar/google/callback');
  }finally{
    for(const [key,value] of Object.entries(saved)){
      if(value===undefined)delete process.env[key];else process.env[key]=value;
    }
  }
});
