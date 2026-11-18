const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createHmac} = require('node:crypto');
const {createApp} = require('../app');
const {validSignature, createRazorpay} = require('../razorpay');
const {DatabaseSync} = require('node:sqlite');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const config = {keyId:'rzp_test_fixture', keySecret:'test-only-secret', webhookSecret:'test-only-webhook-secret'};
const sign = (body, secret=config.keySecret) => createHmac('sha256',secret).update(body).digest('hex');
const basket = key => ({requestKey:key, orderItems:[{menuItem:'latte',qty:2,size:'Large',milk:'Oat',price:1}], store:'Juniper • Central café',method:'Takeaway',totalAmount:1});

function fakeGateway() {
  let calls = 0;
  const orders = new Map(), payments = new Map();
  return {
    orders, payments,
    get calls(){ return calls; },
    async createOrder(body){
      calls++;
      await new Promise(resolve=>setTimeout(resolve,15));
      const order = {...body,id:'order_fixture'+calls,status:'created',amount_paid:0};
      orders.set(order.id,order);return {...order};
    },
    async fetchOrder(id){return {...orders.get(id)};},
    async fetchPayment(id){return {...payments.get(id)};},
    async fetchOrderPayments(id){return {items:[...payments.values()].filter(p=>p.order_id===id).map(p=>({...p}))};},
    pay(orderId,status='captured'){
      const order=orders.get(orderId);
      const payment={id:'pay_fixture'+(payments.size+1),order_id:orderId,amount:order.amount,currency:'INR',status,amount_refunded:0};
      payments.set(payment.id,payment);
      if(status==='captured'){order.status='paid';order.amount_paid=order.amount;}
      return payment;
    }
  };
}
async function fixture(t, enabled=true) {
  const gateway=fakeGateway();
  const app=createApp({databasePath:':memory:',adminEmail:'staff@test.example',adminPassword:'Fixture-staff-password',paymentConfig:enabled?config:{},paymentGateway:gateway});
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));app.locals.db.close();});
  const base=`http://127.0.0.1:${server.address().port}/api`;
  const request=async(url,body,token,method=body?'POST':'GET',headers={})=>{
    const response=await fetch(base+url,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...headers},body:body?JSON.stringify(body):undefined});
    return {status:response.status,data:await response.json()};
  };
  const token=(await request('/auth/register',{name:'Fixture Customer',email:'customer@test.example',password:'Fixture-customer-password'})).data.token;
  const other=(await request('/auth/register',{name:'Other Customer',email:'other@test.example',password:'Fixture-customer-password'})).data.token;
  const staff=(await request('/auth/login',{email:'staff@test.example',password:'Fixture-staff-password'})).data.token;
  const create=async key=>(await request('/payments/razorpay/orders',basket(key),token)).data;
  const verify=(a,p,changes={})=>request('/payments/razorpay/verify',{attemptId:a.id,razorpay_order_id:a.gatewayOrderId,razorpay_payment_id:p.id,razorpay_signature:sign(a.gatewayOrderId+'|'+p.id),...changes},token);
  const webhook=(event,signature)=>request('/payments/razorpay/webhook',event,null,'POST',{'x-razorpay-signature':signature||sign(JSON.stringify(event),config.webhookSecret)});
  return {app,gateway,request,token,other,staff,create,verify,webhook};
}

test('online payment disabled cleanly without keys; counter checkout still works',async t=>{
  const {request,token}=await fixture(t,false);
  const configResponse=await request('/payments/config');assert.deepEqual(configResponse.data,{enabled:false,testMode:false});
  assert.equal((await request('/payments/razorpay/orders',basket('disabled-payment'),token)).status,503);
  const order=await request('/orders',basket('counter-checkout'),token);assert.equal(order.status,201);assert.equal(order.data.paymentMethod,'counter');assert.equal(order.data.paymentStatus,'unpaid');
});

test('server pricing, concurrent checkout idempotency, signature validation and ownership',async t=>{
  const {app,gateway,request,token,other,create,verify}=await fixture(t);
  assert.equal((await request('/payments/razorpay/orders',basket('no-auth-payment'))).status,401);
  const concurrent=await Promise.all([request('/payments/razorpay/orders',basket('same-checkout-key'),token),request('/payments/razorpay/orders',basket('same-checkout-key'),token)]);
  assert.ok(concurrent.every(r=>r.status===200));assert.equal(gateway.calls,1);
  const attempt=concurrent[0].data;assert.equal(attempt.id,concurrent[1].data.id);assert.equal(attempt.amount,67000);assert.equal(attempt.currency,'INR');assert.equal(attempt.testMode,true);assert.equal(attempt.keySecret,undefined);
  assert.equal((await request('/payments/razorpay/orders',basket('same-checkout-key'),other)).status,409);
  assert.equal((await request(`/payments/${attempt.id}/check`,{},other)).status,404);
  assert.equal((await request(`/payments/${attempt.id}/resume`,{},other)).status,404);
  const payment=gateway.pay(attempt.gatewayOrderId);
  assert.equal((await verify(attempt,payment,{razorpay_signature:'0'.repeat(64)})).status,400);
  assert.equal((await verify(attempt,payment,{razorpay_order_id:'order_wrong'})).status,400);
  assert.equal(app.locals.db.prepare('SELECT COUNT(*) AS n FROM orders').get().n,0);
  const result=await verify(attempt,payment);assert.equal(result.status,200);assert.equal(result.data.order.totalAmount,670);assert.equal(result.data.order.paymentStatus,'paid');assert.equal(result.data.order.paymentId,payment.id);
  const repeat=await verify(attempt,payment);assert.equal(repeat.data.order._id,result.data.order._id);
  assert.equal(app.locals.db.prepare('SELECT COUNT(*) AS n FROM orders').get().n,1);
  assert.equal((await request('/payments/pending',null,token)).data.length,0);
  assert.equal((await request('/orders/myorders',null,other)).data.length,0);
});

test('authorized, failed, mismatched and refunded payments cannot enter the kitchen',async t=>{
  const {app,gateway,request,token,create,verify}=await fixture(t);
  const attempt=await create('authorized-checkout');const payment=gateway.pay(attempt.gatewayOrderId,'authorized');
  assert.equal((await verify(attempt,payment)).status,202);
  assert.equal((await request(`/payments/${attempt.id}/resume`,{},token)).status,202);
  payment.status='failed';assert.equal((await verify(attempt,payment)).status,202);
  payment.status='captured';const remote=gateway.orders.get(attempt.gatewayOrderId);remote.status='paid';remote.amount_paid=remote.amount;
  payment.amount=1;assert.equal((await verify(attempt,payment)).status,400);payment.amount=67000;
  payment.currency='USD';assert.equal((await verify(attempt,payment)).status,400);payment.currency='INR';
  payment.order_id='order_different';assert.equal((await verify(attempt,payment)).status,400);payment.order_id=attempt.gatewayOrderId;
  payment.amount_refunded=67000;assert.equal((await verify(attempt,payment)).status,409);
  assert.equal(app.locals.db.prepare('SELECT COUNT(*) AS n FROM orders').get().n,0);
});

test('signed webhooks recover a closed checkout exactly once and refunds stay truthful',async t=>{
  const {app,gateway,request,token,staff,create,webhook,verify}=await fixture(t);
  const attempt=await create('webhook-checkout');const payment=gateway.pay(attempt.gatewayOrderId);
  const event={event:'payment.captured',payload:{payment:{entity:payment}}};
  assert.equal((await webhook(event,'0'.repeat(64))).status,400);
  assert.equal(app.locals.db.prepare('SELECT COUNT(*) AS n FROM orders').get().n,0);
  const results=await Promise.all([webhook(event),webhook(event),verify(attempt,payment)]);assert.ok(results.every(r=>r.status===200));
  assert.equal(app.locals.db.prepare('SELECT COUNT(*) AS n FROM orders').get().n,1);
  const order=(await request('/orders/myorders',null,token)).data[0];
  assert.equal((await request(`/orders/${order._id}/status`,{status:'Cancelled'},staff,'PUT')).data.paymentStatus,'refund_due');
  await webhook(event);assert.equal((await request('/orders/myorders',null,token)).data[0].status,'Cancelled');
  payment.amount_refunded=10000;
  const refundEvent={event:'refund.processed',payload:{refund:{entity:{id:'rfnd_fixture',payment_id:payment.id}}}};
  assert.equal((await webhook(refundEvent)).status,200);assert.equal((await request('/orders/myorders',null,token)).data[0].paymentStatus,'partially_refunded');
  payment.amount_refunded=67000;
  assert.equal((await webhook(refundEvent)).status,200);assert.equal((await request('/orders/myorders',null,token)).data[0].paymentStatus,'refunded');
});

test('payment status checks recover missed callbacks without creating a second gateway order',async t=>{
  const {gateway,request,token,create}=await fixture(t);
  const attempt=await create('recovery-checkout');assert.equal((await request('/payments/pending',null,token)).data.length,1);
  assert.equal((await request(`/payments/${attempt.id}/check`,{},token)).status,202);
  const resume=await request(`/payments/${attempt.id}/resume`,{},token);assert.equal(resume.data.gatewayOrderId,attempt.gatewayOrderId);assert.equal(gateway.calls,1);
  gateway.pay(attempt.gatewayOrderId);
  const recovered=await request(`/payments/${attempt.id}/check`,{},token);assert.equal(recovered.status,200);assert.equal(recovered.data.order.paymentStatus,'paid');
  const again=await request(`/payments/${attempt.id}/resume`,{},token);assert.equal(again.data.order._id,recovered.data.order._id);assert.equal(gateway.calls,1);
});

test('catalog migration preserves edited items and old orders, then does not reseed deletions',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'juniper-migration-'));const file=path.join(dir,'old.sqlite');
  const old=new DatabaseSync(file);
  old.exec(`CREATE TABLE users (id TEXT PRIMARY KEY,name TEXT,email TEXT,password TEXT,role TEXT);
    CREATE TABLE menu (id TEXT PRIMARY KEY,name TEXT,description TEXT,category TEXT,price INTEGER,image TEXT,tag TEXT,available INTEGER DEFAULT 1);
    CREATE TABLE orders (id TEXT PRIMARY KEY,user_id TEXT,items TEXT,total INTEGER,status TEXT,store TEXT,method TEXT,notes TEXT,created_at TEXT,request_key TEXT UNIQUE);
    INSERT INTO menu VALUES ('latte','Staff edited latte','Edited','Hot coffee',999,'/images/latte.jpg','',1);
    INSERT INTO orders VALUES ('legacy','customer','[]',100,'Completed','Central','Takeaway','','2026-01-01','legacy-key');`);old.close();
  let app=createApp({databasePath:file,paymentConfig:{}});const db=app.locals.db;
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM menu').get().n,36);assert.equal(db.prepare("SELECT price FROM menu WHERE id='latte'").get().price,999);
  assert.equal(db.prepare("SELECT payment_method FROM orders WHERE id='legacy'").get().payment_method,'counter');
  db.prepare("DELETE FROM menu WHERE id='espresso'").run();db.close();
  app=createApp({databasePath:file,paymentConfig:{}});assert.equal(app.locals.db.prepare('SELECT COUNT(*) AS n FROM menu').get().n,35);app.locals.db.close();fs.rmSync(dir,{recursive:true,force:true});
});

test('webhook verification uses exact raw bytes and rejects malformed signatures',()=>{
  const raw=Buffer.from('{ "event": "payment.captured" }');
  assert.equal(validSignature(raw,sign(raw,config.webhookSecret),config.webhookSecret),true);
  assert.equal(validSignature(JSON.stringify(JSON.parse(raw)),sign(raw,config.webhookSecret),config.webhookSecret),false);
  for(const signature of ['',null,'xyz','0'.repeat(63)])assert.equal(validSignature(raw,signature,config.webhookSecret),false);
});

test('Razorpay HTTP adapter authenticates server-side and sends paise without exposing secrets in failures',async t=>{
  const original=global.fetch;const seen=[];
  t.after(()=>{global.fetch=original;});
  global.fetch=async(url,options)=>{seen.push({url,options});return {ok:true,json:async()=>({id:'order_provider'})};};
  const client=createRazorpay(config);await client.createOrder({amount:67000,currency:'INR',receipt:'receipt'});
  assert.equal(seen[0].url,'https://api.razorpay.com/v1/orders');assert.equal(JSON.parse(seen[0].options.body).amount,67000);assert.equal(seen[0].options.headers.Authorization,'Basic '+Buffer.from(config.keyId+':'+config.keySecret).toString('base64'));
  global.fetch=async()=>({ok:false});await assert.rejects(client.fetchPayment('pay_fixture'),err=>err.status===502&&!err.message.includes(config.keySecret));
});
