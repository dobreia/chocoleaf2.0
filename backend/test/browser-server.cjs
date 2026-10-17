// Isolated test fixture: never imported by the application or the local launcher.
const {randomUUID}=require('node:crypto');
Object.assign(process.env,{NODE_ENV:'development',PAYMENT_LOCAL_TEST:'1',FRONTEND_URL:'http://127.0.0.1:5184',STRIPE_SECRET_KEY:'sk_test_browser',STRIPE_WEBHOOK_SECRET:'whsec_browser',MAIL_FROM:'test@example.test',MAIL_ADMIN:'admin@example.test',MAIL_USER:'',MAIL_PASS:'',SMTP_HOST:''});
delete process.env.TEST_DATABASE_URL;
process.env.UPLOAD_DIR=require('node:path').resolve(__dirname,'../../frontend/test-results/browser-uploads');
(async()=>{
  const db=await require('./database.cjs')();
  await require('../src/migrate')();
  await require('../scripts/seed-local.cjs')(db);
  const {passwordHash}=require('../src/domain/auth');
  await db.query('INSERT INTO admins(email,password_hash) VALUES($1,$2)',['demo@example.test',await passwordHash('Demo-browser-2026!')]);
  const sessions=new Map();
  require('../src/payments/providers').stripe=()=>({checkout:{sessions:{create:async(body)=>{
    const id=body.metadata.order_id;
    const session={id:'cs_test_'+randomUUID(),url:'https://checkout.stripe.com/c/pay/'+id,metadata:body.metadata,client_reference_id:id,mode:'payment',currency:'huf',amount_total:body.line_items[0].price_data.unit_amount,payment_status:'unpaid',status:'open'};
    sessions.set(id,session);return session;
  }}}});
  const app=require('../src/index');
  app.get('/__test/state',async(_req,res)=>res.json({bookings:(await db.query('SELECT * FROM bookings')).rows,mail:(await db.query('SELECT recipient,subject,body,attachments FROM outbox')).rows}));
  app.post('/__test/complete/:id',async(req,res)=>{
    const session=sessions.get(req.params.id);if(!session)return res.sendStatus(404);
    const orders=require('../src/payments/orders');
    await orders.applySession({...session,payment_status:'paid',status:'complete'});
    const order=(await db.query('SELECT * FROM payment_orders WHERE id=$1',[req.params.id])).rows[0];
    await orders.invoice(order);
    if(order.gift_order_id)await require('../src/domain/gifts').fulfill(order.gift_order_id,false);
    res.json({ok:true});
  });
  app.listen(3012,'127.0.0.1',()=>console.log('Isolated browser test API ready'));
})().catch(e=>{console.error(e);process.exitCode=1;});
