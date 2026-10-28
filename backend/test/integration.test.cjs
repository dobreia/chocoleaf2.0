const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
process.env.UPLOAD_DIR=require("node:fs").mkdtempSync(require("node:path").join(require("node:os").tmpdir(),"chocoleaf-images-"));
let uploadedPath;
let pool, server, base, cookie, service, slot, slot2, bookingId, manageToken;
Object.assign(process.env, {
  MAIL_USER: "",
  MAIL_PASS: "",
  MAIL_ADMIN: "admin@example.test",
  MAIL_FROM: "noreply@example.test",
  FRONTEND_URL: "http://localhost:5173",
});
async function req(path, method = "GET", body, auth = true, headers = {}) {
  if(path==='/bookings' && method==='POST' && body && !Object.hasOwn(body,'billingData'))
    body={...body,billingData:{buyerType:'private',privateName:'Test Buyer',postCode:'1111',city:'Budapest',street:'Test street 1.'}};
  const r = await fetch(base + "/api" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(auth && cookie ? { cookie } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, data: await r.json(), headers: r.headers };
}
const at = (days, hour) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
};
before(async () => {
  pool = await require("./database.cjs")();
  // Legacy transfer fixtures exercise existing management, capacity and voucher behavior.
  // The real public Stripe-only flow is exercised separately in payments.test.cjs.
  require('../src/payments/providers').provider = () => 'transfer';
  Object.assign(process.env,{TRANSFER_BENEFICIARY:'ChocoLeaf test',TRANSFER_ACCOUNT:'11111111-22222222-33333333'});
  await require("../src/migrate")();
  const { passwordHash } = require("../src/domain/auth");
  await pool.query("INSERT INTO admins(email,password_hash) VALUES($1,$2)", [
    "admin@example.test",
    await passwordHash("test-password-only-123"),
  ]);
  server = require("../src/index").listen(0);
  await new Promise((r) => server.on("listening", r));
  base = "http://localhost:" + server.address().port;
});
after(async () => {
  await new Promise((r) => server.close(r));
  await pool.end();
  require("node:fs").rmSync(process.env.UPLOAD_DIR,{recursive:true,force:true});
});
test("migration rerun preserves catalog", async () => {
  await require("../src/migrate")();
  assert.equal((await req("/courses")).data.length, 5);
});
test("anonymous admin access is denied", async () =>
  assert.equal(
    (await req("/admin/bookings", "GET", undefined, false)).status,
    401,
  ));
test("login verifies password and sets HttpOnly cookie", async () => {
  assert.equal(
    (
      await req(
        "/auth/login",
        "POST",
        { email: "admin@example.test", password: "wrong" },
        false,
      )
    ).status,
    401,
  );
  const r = await req(
    "/auth/login",
    "POST",
    { email: "admin@example.test", password: "test-password-only-123" },
    false,
  );
  assert.equal(r.status, 200);
  assert.match(r.headers.get("set-cookie"), /HttpOnly/);
  cookie = r.headers.get("set-cookie").split(";")[0];
});
test("cross-origin write denied", async () =>
  assert.equal(
    (
      await req("/admin/services", "POST", {}, true, {
        Origin: "https://evil.example",
      })
    ).status,
    403,
  ));
test("service CRUD writes catalog", async () => {
  const r = await req("/admin/services", "POST", {
    title: "Integration workshop",
    description: "Test only",
    duration_minutes: 60,
    price: 1000,
    capacity: 2,
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  service = r.data;
});
test("future slot creation", async () => {
  const r = await req("/admin/courses", "POST", {
    service_id: service.id,
    start_time: at(10, 10),
    end_time: at(10, 11),
    price: 1000,
    capacity: 2,
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  slot = r.data;
});
test("overlap, past and reversed intervals denied", async () => {
  for (const d of [
    { start_time: at(10, 10), end_time: at(10, 12) },
    { start_time: at(-2, 10), end_time: at(-2, 11) },
    { start_time: at(12, 12), end_time: at(12, 11) },
  ])
    assert.ok(
      (
        await req("/admin/courses", "POST", {
          service_id: service.id,
          price: 1000,
          capacity: 2,
          ...d,
        })
      ).status >= 400,
    );
});
test("booking reserves seats and retry is idempotent", async () => {
  const key = randomUUID(),
    body = {
      courseId: slot.id,
      customerName: "Teszt Ügyfél",
      customerEmail: "customer@example.test",
      seats: 2,
    };
  const r = await req("/bookings", "POST", body, false, {
    "Idempotency-Key": key,
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  bookingId = r.data.booking.id;
  assert.equal(r.data.booking.total_price, 2000);
  assert.equal(r.data.booking.manage_hash, undefined);
  const again = await req("/bookings", "POST", body, false, {
    "Idempotency-Key": key,
  });
  assert.equal(again.data.booking.id, bookingId);
  const mail = (
    await pool.query("SELECT body FROM outbox WHERE recipient=$1", [
      "customer@example.test",
    ])
  ).rows[0];
  manageToken = mail.body.match(/#[-\w]+\.([a-f\d]{64})/)[1];
  assert.match(mail.body,/Befejezés:/);
  assert.match(mail.body,/Fizetés:/);
  const adminMail=(await pool.query('SELECT body FROM outbox WHERE recipient=$1',['admin@example.test'])).rows.find(x=>x.body.includes(bookingId));
  assert.ok(adminMail);
  assert.match(adminMail.body,/customer@example.test/);
  assert.match(adminMail.body,/\/admin\/bookings/);
  assert.ok(!adminMail.body.includes(manageToken));
});
test("availability sums seats", async () =>
  assert.equal(
    (await req("/bookings/availability?courseId=" + service.id)).data[0]
      .available_spots,
    0,
  ));
test("full slot booking denied", async () =>
  assert.equal(
    (
      await req(
        "/bookings",
        "POST",
        {
          courseId: slot.id,
          customerName: "Other",
          customerEmail: "other@example.test",
        },
        false,
      )
    ).status,
    409,
  ));
test("capacity cannot drop below reservations", async () =>
  assert.equal(
    (await req("/admin/courses/" + slot.id, "PUT", { ...slot, capacity: 1 }))
      .status,
    409,
  ));
test("invalid management token denied", async () =>
  assert.equal(
    (
      await req("/bookings/" + bookingId + "/manage", "GET", undefined, false, {
        "X-Booking-Token": "a".repeat(64),
      })
    ).status,
    403,
  ));
test("valid link excludes internal notes", async () => {
  const r = await req(
    "/bookings/" + bookingId + "/manage",
    "GET",
    undefined,
    false,
    { "X-Booking-Token": manageToken },
  );
  assert.equal(r.status, 200);
  assert.equal(r.data.admin_note, undefined);
});
test("reschedule requires approval and reprices", async () => {
  const created = await req("/admin/courses", "POST", {
    service_id: service.id,
    start_time: at(12, 10),
    end_time: at(12, 11),
    price: 1200,
    capacity: 3,
  });
  assert.equal(created.status, 201);
  slot2 = created.data;
  const r = await req(
    "/bookings/" + bookingId + "/requests",
    "POST",
    { kind: "reschedule", course_id: slot2.id },
    false,
    { "X-Booking-Token": manageToken },
  );
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(
    (
      await pool.query("SELECT course_id FROM bookings WHERE id=$1", [
        bookingId,
      ])
    ).rows[0].course_id,
    slot.id,
  );
  assert.equal(
    (await req("/admin/requests/" + r.data.id, "PATCH", { status: "approved" }))
      .status,
    200,
  );
  const b = (
    await pool.query("SELECT * FROM bookings WHERE id=$1", [bookingId])
  ).rows[0];
  assert.equal(b.course_id, slot2.id);
  assert.equal(b.total_price, 2400);
});
test("search, pagination and actual dashboard", async () => {
  const r = await req("/admin/bookings?q=customer&page=1&limit=1");
  assert.equal(r.data.total, 1);
  assert.equal(r.data.items.length, 1);
  assert.equal((await req("/admin/dashboard")).data.popular[0].count, 2);
});
test("approved cancellation frees seats", async () => {
  const r = await req(
    "/bookings/" + bookingId + "/requests",
    "POST",
    { kind: "cancel" },
    false,
    { "X-Booking-Token": manageToken },
  );
  assert.equal(r.status, 201);
  assert.equal(
    (await req("/admin/requests/" + r.data.id, "PATCH", { status: "approved" }))
      .status,
    200,
  );
  assert.equal(
    (await req("/bookings/availability?courseId=" + service.id)).data.find(
      (s) => s.id === slot2.id,
    ).available_spots,
    3,
  );
});
test("parallel last-seat requests have one winner (single-engine adapter)", async () => {
  const r = await req("/admin/courses", "POST", {
    service_id: service.id,
    start_time: at(13, 10),
    end_time: at(13, 11),
    price: 1000,
    capacity: 1,
  });
  const attempts = await Promise.all(
    [1, 2, 3, 4].map((n) =>
      req(
        "/bookings",
        "POST",
        {
          courseId: r.data.id,
          customerName: "Race " + n,
          customerEmail: "race" + n + "@example.test",
        },
        false,
      ),
    ),
  );
  assert.equal(attempts.filter((r) => r.status === 201).length, 1);
  assert.equal(attempts.filter((r) => r.status === 409).length, 3);
});
test("reactivation rechecks capacity", async () => {
  await req(
    "/bookings",
    "POST",
    {
      courseId: slot2.id,
      customerName: "Full",
      customerEmail: "full@example.test",
      seats: 3,
    },
    false,
  );
  assert.equal(
    (
      await req("/admin/bookings/" + bookingId, "PATCH", {
        status: "confirmed",
      })
    ).status,
    409,
  );
});
test("inactive service rejects booking", async () => {
  await req("/admin/services/" + service.id, "DELETE");
  assert.equal(
    (
      await req(
        "/bookings",
        "POST",
        {
          courseId: slot.id,
          customerName: "Blocked",
          customerEmail: "blocked@example.test",
        },
        false,
      )
    ).status,
    409,
  );
  assert.ok(!(await req("/courses")).data.some((s) => s.id === service.id));
});
test("removed management endpoints are unavailable", async () => {
  for (const path of ["/admin/staff", "/admin/settings", "/admin/blocks"]) {
    assert.equal((await req(path)).status, 404);
    assert.equal((await req(path, "POST", {})).status, 404);
    assert.equal((await req(path, "PUT", {})).status, 404);
  }
});
test("legacy hours and inactive staff do not restrict booking", async () => {
  const serviceId=(await req("/courses")).data[0].id;
  const person=await pool.query("INSERT INTO staff(name,active) VALUES('Legacy',false) RETURNING id");
  await pool.query("UPDATE settings SET hours_enabled=true,hours='{}' WHERE id=1");
  const created=await req("/admin/courses", "POST", {service_id:serviceId,start_time:at(80,20),end_time:at(80,21),capacity:3,price:1000});
  assert.equal(created.status,201,JSON.stringify(created.data));
  await pool.query("UPDATE courses SET staff_id=$2 WHERE id=$1",[created.data.id,person.rows[0].id]);
  assert.equal((await req("/bookings","POST",{courseId:created.data.id,customerName:'Legacy booking',customerEmail:'legacy@example.test'},false)).status,201);
  const listing=await req("/bookings/availability?courseId="+serviceId);
  assert(listing.data.some(x=>x.id===created.data.id));
  assert(listing.data.every(x=>!Object.hasOwn(x,'staff_id')));
  assert((await req('/admin/courses')).data.every(x=>!Object.hasOwn(x,'staff_id')));
  // A different legacy association cannot bypass the shared schedule.
  assert.equal((await req('/admin/courses','POST',{service_id:serviceId,start_time:at(80,20),end_time:at(80,22),capacity:3,price:1000,staff_id:randomUUID()})).status,409);
  await pool.query("UPDATE settings SET hours_enabled=false WHERE id=1");
});
test("legacy overlapping appointments cannot accept new bookings", async () => {
 const serviceId=(await req('/courses')).data[0].id;
 const first=await req('/admin/courses','POST',{service_id:serviceId,start_time:at(90,10),end_time:at(90,11),capacity:4,price:1000});
 assert.equal(first.status,201);
 const legacy=await pool.query("INSERT INTO courses(service_id,title,start_time,end_time,capacity,price,active) VALUES($1,'Legacy overlap',$2,$3,4,1000,true) RETURNING id",[serviceId,at(90,10),at(90,11)]);
 try {
  assert.equal((await req('/bookings','POST',{courseId:first.data.id,customerName:'Conflict',customerEmail:'conflict@example.test'},false)).status,409);
  assert(!(await req('/bookings/availability?courseId='+serviceId)).data.some(x=>x.id===first.data.id||x.id===legacy.rows[0].id));
 } finally { await pool.query('DELETE FROM courses WHERE id=$1',[legacy.rows[0].id]); }
});
test("dashboard has no financial aggregate", async () => {
 const r=await req('/admin/dashboard');assert.equal(r.status,200);assert(!Object.hasOwn(r.data,'revenue'));assert.equal(typeof r.data.today,'number');
});
test("inquiry persists and can be marked handled", async () => {
  assert.equal(
    (
      await req(
        "/inquiries",
        "POST",
        {
          name: "Inquiry",
          email: "inquiry@example.test",
          subject: "Question",
          message: "Test message",
        },
        false,
      )
    ).status,
    201,
  );
  const r = await req("/admin/inquiries");
  assert.equal(r.data.length, 1);
  assert.equal(
    (
      await req("/admin/inquiries/" + r.data[0].id, "PATCH", {
        status: "handled",
      })
    ).data.status,
    "handled",
  );
});
test('inquiry unread counts require admin and reading only marks the displayed IDs without handling or hiding later arrivals',async()=>{
  assert.equal((await req('/admin/inquiries/unread-count','GET',undefined,false)).status,401);
  assert.equal((await req('/admin/inquiries/read','POST',{ids:[]},false)).status,401);
  assert.equal((await req('/admin/inquiries/read','POST',{ids:[]},true,{Origin:'https://evil.example'})).status,403);
  const existing=(await req('/admin/inquiries')).data;
  await req('/admin/inquiries/read','POST',{ids:existing.map(item=>item.id)});
  const create=async name=>{
    assert.equal((await req('/inquiries','POST',{name,email:'unread@example.test',subject:name,message:'Unread message'},false)).status,201);
    return (await req('/admin/inquiries')).data.find(item=>item.name===name);
  };
  const first=await create('First unread'),second=await create('Second unread');
  assert.equal((await req('/admin/inquiries/unread-count')).data.unread,2);
  assert.equal(first.read_at,null);assert.equal(second.read_at,null);
  assert.equal((await req('/admin/inquiries/read','POST',{ids:[first.id]})).data.updated,1);
  const firstRead=(await req('/admin/inquiries')).data.find(item=>item.id===first.id);
  assert.ok(firstRead.read_at);assert.equal(firstRead.status,'new');
  assert.equal((await req('/admin/inquiries/unread-count')).data.unread,1);
  const later=await create('Arrived after list was fetched');
  assert.equal((await req('/admin/inquiries/read','POST',{ids:[first.id,second.id]})).data.updated,1);
  assert.equal((await req('/admin/inquiries/unread-count')).data.unread,1);
  assert.equal((await req('/admin/inquiries')).data.find(item=>item.id===later.id).read_at,null);
  assert.equal((await req('/admin/inquiries/read','POST',{ids:[first.id]})).data.updated,0);
  assert.equal((await req('/admin/inquiries')).data.find(item=>item.id===first.id).read_at,firstRead.read_at);
  for(const body of [{},{ids:'invalid'},{ids:['invalid']},{ids:Array(501).fill(first.id)}])
    assert.equal((await req('/admin/inquiries/read','POST',body)).status,400);
  assert.equal((await req('/admin/inquiries/unread-count')).data.unread,1);
  await req('/admin/inquiries/read','POST',{ids:[later.id]});
  assert.equal((await req('/admin/inquiries/unread-count')).data.unread,0);
  assert.equal((await req('/admin/inquiries/'+first.id,'PATCH',{status:'handled'})).data.status,'handled');
  await req('/admin/inquiries/'+first.id,'PATCH',{status:'new'});
  assert.equal((await req('/admin/inquiries/unread-count')).data.unread,0);
});

test("gift order persists and legacy GET approval is gone", async () => {
  const r = await req(
    "/giftcard/start-payment",
    "POST",
    {
      names: ["Recipient"],
      email: "gift@example.test",
      amount: 10000,
      quantity: 1,
      billingData: {
        buyerType: "private",
        privateName: "Buyer",
        postCode:'1111',city:'Budapest',street:'Test address',
      },
    },
    false,
  );
  assert.equal(r.status, 200);
  assert.equal(
    (await req("/transfer-info?id=" + r.data.id)).data.amount,
    10000,
  );
  assert.equal(
    (await req("/giftcard/admin/mark-paid?id=" + r.data.id)).status,
    404,
  );
  assert.equal(
    (await req("/giftcard/admin/mark-paid", "POST", { id: r.data.id }, false))
      .status,
    401,
  );
});
test("owner content can be published", async () => {
  assert.equal(
    (
      await req("/admin/content/terms", "PUT", {
        title: "Terms",
        body: "Owner supplied test text",
      })
    ).status,
    200,
  );
  assert.equal(
    (await req("/content/terms")).data.body,
    "Owner supplied test text",
  );
});
test("malformed booking fields receive validation errors", async () => {
  for (const body of [
    {
      courseId: "not-a-uuid",
      customerName: "A",
      customerEmail: "a@example.test",
    },
    { courseId: slot.id, customerName: 42, customerEmail: "a@example.test" },
    { courseId: slot.id, customerName: "A", customerEmail: "broken" },
    {
      courseId: slot.id,
      customerName: "A",
      customerEmail: "a@example.test",
      seats: -1,
    },
  ])
    assert.equal((await req("/bookings", "POST", body, false)).status, 400);
  assert.equal((await req("/bookings", "POST", [], false)).status, 400);
});
test("management token rotation revokes original link", async () => {
  assert.equal(
    (await req("/admin/bookings/" + bookingId + "/send-link", "POST")).status,
    200,
  );
  assert.equal(
    (
      await req("/bookings/" + bookingId + "/manage", "GET", undefined, false, {
        "X-Booking-Token": manageToken,
      })
    ).status,
    403,
  );
});
test("catalog migration never recreates renamed services", async () => {
  const first = (await req("/admin/services")).data.find(
    (s) => s.slug === "csokolade-alapelmeny",
  );
  await req("/admin/services/" + first.id, "PUT", {
    ...first,
    title: "Renamed original course",
  });
  await require("../src/migrate")();
  const records = (await req("/admin/services")).data;
  assert.equal(
    records.find((s) => s.id === first.id).title,
    "Renamed original course",
  );
  assert.ok(!records.some((s) => s.title === first.title));
});
test("database checks reject invalid seats even outside the API", async () => {
  await assert.rejects(
    pool.query("UPDATE bookings SET seats=0 WHERE id=$1", [bookingId]),
    (e) => e.code === "23514",
  );
});
test("SMTP outbox delivers through a local capture server", async () => {
  const smtp = await require("./smtp.cjs")();
  Object.assign(process.env, {
    SMTP_HOST: "127.0.0.1",
    SMTP_PORT: String(smtp.port),
    MAIL_USER: "",
    MAIL_PASS: "",
  });
  try {
    await require("../src/domain/notifications").deliver();
    assert.ok(smtp.messages.length > 0);
    assert.ok(
      (
        await pool.query(
          "SELECT count(*)::int AS n FROM outbox WHERE sent_at IS NOT NULL",
        )
      ).rows[0].n > 0,
    );
  } finally {
    process.env.SMTP_HOST = "";
    await smtp.close();
  }
});
test("gift PDF is sent once after authorized payment approval", async () => {
  const smtp = await require("./smtp.cjs")();
  Object.assign(process.env, {
    SMTP_HOST: "127.0.0.1",
    SMTP_PORT: String(smtp.port),
    MAIL_USER: "",
    MAIL_PASS: "",
  });
  try {
    const id = (await pool.query("SELECT id FROM gift_orders LIMIT 1")).rows[0]
      .id;
    const r = await req("/giftcard/admin/mark-paid", "POST", { id });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(smtp.messages.length, 0);
    const queued = (await pool.query("SELECT * FROM outbox WHERE subject IN ('ChocoLeaf – ajándékutalványod elkészült','ChocoLeaf – fizetett ajándékutalvány kiállítva')")).rows;
    assert.equal(queued.length, 2);
    const customer = queued.find(x=>x.attachments.length);
    assert.ok(customer);
    assert.equal(Buffer.from(customer.attachments[0].content,'base64').subarray(0,4).toString(),'%PDF');
    // Unrelated notifications are delivered as well; drain all due batches.
    for(let i=0;i<10;i++) await require('../src/domain/notifications').deliver();
    assert.equal(smtp.messages.filter(x=>/application\/pdf/.test(x)).length,1);
    const delivered = smtp.messages.length;
    assert.equal(
      (await req("/giftcard/admin/mark-paid", "POST", { id })).status,
      200,
    );
    await require('../src/domain/notifications').deliver();
    assert.equal(smtp.messages.length, delivered);
  } finally {
    process.env.SMTP_HOST = "";
    await smtp.close();
  }
});
test('SMTP failure preserves PDF attachments for a successful retry',async()=>{
  const nodemailer=require('nodemailer'),original=nodemailer.createTransport;
  const smtp=await require('./smtp.cjs')();
  Object.assign(process.env,{SMTP_HOST:'127.0.0.1',SMTP_PORT:String(smtp.port),MAIL_USER:'',MAIL_PASS:''});
  const content=Buffer.from('%PDF-test-retry').toString('base64');
  try {
    await require('../src/domain/notifications').queue(pool,'retry@example.test','Retry test','Body',[{filename:'retry.pdf',content}]);
    nodemailer.createTransport=()=>({sendMail:async()=>{throw new Error('simulated SMTP outage');}});
    await require('../src/domain/notifications').deliver();
    let row=(await pool.query("SELECT * FROM outbox WHERE recipient='retry@example.test'")).rows[0];
    assert.equal(row.sent_at,null);assert.equal(row.attempts,1);
    assert.equal(row.attachments[0].content,content);
    assert.ok(new Date(row.next_attempt)>new Date());
    nodemailer.createTransport=original;
    await pool.query('UPDATE outbox SET next_attempt=now() WHERE id=$1',[row.id]);
    await require('../src/domain/notifications').deliver();
    row=(await pool.query('SELECT * FROM outbox WHERE id=$1',[row.id])).rows[0];
    assert.ok(row.sent_at);assert.equal(row.attempts,2);
    assert.equal(smtp.messages.length,1);assert.match(smtp.messages[0],/application\/pdf/);
    await require('../src/domain/notifications').deliver();assert.equal(smtp.messages.length,1);
  } finally {nodemailer.createTransport=original;process.env.SMTP_HOST='';await smtp.close();}
});

test("seat input validation rejects explicit invalid values and enforces capacity",async()=>{
 const serviceId=(await req('/courses')).data[0].id;
 const slot=(await req('/admin/courses','POST',{service_id:serviceId,start_time:at(100,10),end_time:at(100,11),capacity:8,price:1000})).data;
 for(const seats of ['',null,0,-1,1.5])assert.equal((await req('/bookings','POST',{courseId:slot.id,customerName:'Invalid seats',customerEmail:'invalidseat@example.test',seats},false)).status,400);
 assert.equal((await req('/bookings','POST',{courseId:slot.id,customerName:'Family',customerEmail:'family@example.test',seats:7},false)).status,201);
 assert.equal((await req('/bookings','POST',{courseId:slot.id,customerName:'Overflow',customerEmail:'overflow@example.test',seats:2},false)).status,409);
 assert.equal((await req('/bookings/availability?courseId='+serviceId)).data.find(s=>s.id===slot.id).available_spots,1);
});
test("authenticated image upload validates content and persists on disk", async () => {
 const image=await require('sharp')({create:{width:30,height:20,channels:3,background:'#79546e'}}).png().toBuffer();
 const upload=(bytes,type='image/png',auth=true)=>fetch(base+'/api/admin/media',{method:'POST',headers:{'Content-Type':type,...(auth?{cookie}:{})},body:bytes});
 assert.equal((await upload(image,'image/png',false)).status,401);
 assert.equal((await upload(Buffer.from('not an image'))).status,400);
 assert.equal((await upload(image,'image/jpeg')).status,400);
 assert.equal((await upload(Buffer.alloc(5*1024*1024+1))).status,413);
 const response=await upload(image);const data=await response.json();assert.equal(response.status,201,JSON.stringify(data));uploadedPath=data.path;
 const file=await fetch(base+uploadedPath);assert.equal(file.status,200);assert.equal(file.headers.get('content-type'),'image/webp');
 assert.equal((await require('sharp')(Buffer.from(await file.arrayBuffer())).metadata()).width,30);
 const service=(await req('/courses')).data[0];
 assert.equal((await req('/admin/services/'+service.id,'PUT',{...service,image:uploadedPath,image_detail:uploadedPath})).status,200);
 assert.equal((await req('/courses/'+service.id)).data.image,uploadedPath);
 assert(!uploadedPath.startsWith('data:'));
});
test("images remain accessible after backend restart; replacement and removal persist", async()=>{
 await new Promise(r=>server.close(r));server=require('../src/index').listen(0);await new Promise(r=>server.on('listening',r));base='http://localhost:'+server.address().port;
 assert.equal((await fetch(base+uploadedPath)).status,200);
 const service=(await req('/courses')).data[0];
 const image=await require('sharp')({create:{width:40,height:20,channels:3,background:'#fff'}}).jpeg().toBuffer();
 const r=await fetch(base+'/api/admin/media',{method:'POST',headers:{'Content-Type':'image/jpeg',cookie},body:image});const replacement=(await r.json()).path;assert.equal(r.status,201);
 await req('/admin/services/'+service.id,'PUT',{...service,image:replacement});assert.equal((await req('/courses/'+service.id)).data.image,replacement);
 await req('/admin/services/'+service.id,'PUT',{...service,image:''});assert.equal((await req('/courses/'+service.id)).data.image,'');
 assert.equal((await fetch(base+uploadedPath)).status,200); // other service fields may still reference the old file
});
test("calendar API reports sum of held seats",async()=>{
 const rows=(await req('/admin/courses')).data;
 for(const c of rows){const n=await pool.query("SELECT COALESCE(SUM(seats),0)::int AS n FROM bookings WHERE course_id=$1 AND status<>'cancelled'",[c.id]);assert.equal(c.booked_seats,n.rows[0].n);}
});
test('deleting a refunded legacy Stripe booking preserves its payment and invoice history',async()=>{
 const serviceId=(await req('/courses')).data[0].id;
 const course=(await req('/admin/courses','POST',{service_id:serviceId,start_time:at(120,10),capacity:6,price:1000})).data;
 const created=await req('/admin/bookings','POST',{courseId:course.id,customerName:'Refund history',customerEmail:'refund-history@example.test',seats:1});
 assert.equal(created.status,201);
 const b=created.data.booking;
 await pool.query("UPDATE bookings SET payment_method='stripe',payment_status='paid' WHERE id=$1",[b.id]);
 const order=(await pool.query(`INSERT INTO payment_orders(booking_id,amount,email,description,billing,invoice_config,status,invoice_id,invoice_url,invoice_status)
 VALUES($1,1000,$2,'Legacy payment','{}','{}','paid',12345,'https://example.test/invoice','sent') RETURNING *`,[b.id,b.customer_email])).rows[0];
 assert.equal((await req('/admin/bookings/'+b.id,'DELETE')).status,409);
 assert.equal((await req('/admin/bookings/'+b.id,'PATCH',{payment_status:'refunded'})).status,200);
 assert.equal((await req('/admin/bookings/'+b.id,'DELETE')).status,409);
 assert.equal((await req('/admin/bookings/'+b.id,'PATCH',{status:'cancelled'})).status,200);
 assert.equal((await req('/admin/bookings/'+b.id,'DELETE')).status,200);
 assert.equal((await req('/admin/bookings/'+b.id)).status,404);
 const saved=(await pool.query('SELECT * FROM payment_orders WHERE id=$1',[order.id])).rows[0];
 for(const key of ['amount','email','status','invoice_id','invoice_url','invoice_status'])assert.deepEqual(saved[key],order[key]);
 assert.equal(saved.booking_id,null);assert.equal(saved.course_id,course.id);assert.equal(saved.seats,1);
 assert.equal(saved.booking_data.customer_name,b.customer_name);
 await require('../src/payments/orders').applySession({id:'cs_legacy_paid',metadata:{order_id:order.id},client_reference_id:order.id,mode:'payment',currency:'huf',amount_total:100000,payment_status:'paid'});
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM bookings WHERE id=$1',[b.id])).rows[0].n,0);
});

test("logout invalidates session", async () => {
  await req("/auth/logout", "POST");
  assert.equal((await req("/admin/bookings")).status, 401);
});
