const path=require('node:path');
require('dotenv').config({path:path.resolve(__dirname,'../.env'),quiet:true});
require('dotenv').config({path:path.resolve(__dirname,'../.env.local-test'),override:true,quiet:true});
require('../src/lib/smtp').verifyReal().then(()=>console.log('SMTP-kapcsolat és hitelesítés rendben. Tesztlevél nem került elküldésre.'))
  .catch(e=>{console.error(e.message);process.exitCode=1;});
