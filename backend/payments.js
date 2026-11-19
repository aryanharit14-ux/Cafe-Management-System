const {randomUUID} = require('node:crypto');
const {createRazorpay, validSignature} = require('./razorpay');
const {validateCheckout} = require('./checkout');
const error = (status, message) => Object.assign(new Error(message), {status});

function installPayments({app, db, protect, serializeOrder, config, gateway}) {
  const enabled = Boolean(config.keyId && config.keySecret);
  const provider = gateway || createRazorpay(config);
  const requireEnabled = (req, res, next) => enabled ? next() : res.status(503).json({message:'Online payment is currently unavailable. You can pay at the café.'});
  const attemptForUser = async (id, user) => {
    if (typeof id !== 'string') throw error(400, 'Select a payment to continue.');
    const attempt = (await db.one('payment_attempts',{id,user_id:user.id}));
    if (!attempt) throw error(404, 'Payment not found.');
    return attempt;
  };
  const publicAttempt = async attempt => ({
    id:attempt.id, amount:attempt.amount, currency:'INR', gatewayOrderId:attempt.gateway_order_id,
    keyId:config.keyId, testMode:config.keyId?.startsWith('rzp_test_') || false,
    order:attempt.cafe_order_id ? serializeOrder((await db.one('orders',{id:attempt.cafe_order_id}))) : null
  });
  const pendingAttempt = attempt => {
    const basket = attempt.checkout;
    return {id:attempt.id, amount:attempt.amount, createdAt:attempt.created_at, items:basket.items, store:basket.store, method:basket.method};
  };

  // Only a captured, correctly priced payment can create a fulfilment order.
  async function confirmPayment(attempt, paymentId) {
    const payment = await provider.fetchPayment(paymentId);
    const remoteOrder = await provider.fetchOrder(attempt.gateway_order_id);
    if (payment.id !== paymentId || payment.order_id !== attempt.gateway_order_id || payment.amount !== attempt.amount || payment.currency !== 'INR' || remoteOrder.id !== attempt.gateway_order_id || remoteOrder.amount !== attempt.amount || remoteOrder.currency !== 'INR') throw error(400, 'Payment details do not match this order.');
    if (Number(payment.amount_refunded || 0)>0 && !attempt.cafe_order_id) throw error(409, 'This payment has been refunded. Contact the café before placing another order.');
    if (payment.status !== 'captured' || remoteOrder.status !== 'paid' || remoteOrder.amount_paid !== attempt.amount) return {pending:true, message:'Payment is not yet captured. Check payment status shortly; do not pay again if your account was debited.'};
    const {saved,created}=await db.transaction(async()=>{
      // A write on the attempt serializes concurrent webhook/callback confirmation.
      await db.update('payment_attempts',{id:attempt.id},{$inc:{confirmationVersion:1}});
      const latest=await db.one('payment_attempts',{id:attempt.id});
      if(latest.cafe_order_id)return {saved:await db.one('orders',{id:latest.cafe_order_id}),created:false};
      const basket=latest.checkout,id=randomUUID();
      const saved=await db.insert('orders',{id,user_id:latest.user_id,items:basket.items,total:basket.total,status:'Pending',store:basket.store,method:basket.method,notes:basket.notes,created_at:new Date().toISOString(),request_key:'online:'+latest.id,payment_method:'razorpay',payment_status:'paid',payment_id:payment.id});
      await db.update('payment_attempts',{id:latest.id},{$set:{cafe_order_id:id}});
      return {saved,created:true};
    });
    if(created)app.locals.notifyOrder(saved);
    return {order:serializeOrder(saved)};
  }

  async function reconcile(attempt) {
    if (attempt.cafe_order_id) return {order:serializeOrder((await db.one('orders',{id:attempt.cafe_order_id})))};
    if (!attempt.gateway_order_id) return {pending:true, message:'Checkout has not started. Return to your bag and try again.'};
    const payments = await provider.fetchOrderPayments(attempt.gateway_order_id);
    const captured = payments.items?.find(p => p.status === 'captured');
    if (captured) return confirmPayment(attempt, captured.id);
    return {pending:true, message:'No captured payment yet. If you were debited, wait and check again before retrying.'};
  }

  app.get('/api/payments/config', (req,res) => res.json({enabled, testMode:enabled && config.keyId.startsWith('rzp_test_')}));
  app.post('/api/payments/razorpay/orders', protect, requireEnabled, async (req,res) => {
    const requestKey = req.body?.requestKey;
    if (typeof requestKey !== 'string' || requestKey.length < 8 || requestKey.length > 80) throw error(400,'Invalid checkout request.');
    let attempt=await db.one('payment_attempts',{request_key:requestKey});
    if(!attempt){
      const basket=await validateCheckout(db,req.body);
      try{attempt=await db.insert('payment_attempts',{id:randomUUID(),user_id:req.user.id,request_key:requestKey,checkout:basket,amount:basket.total*100,created_at:new Date().toISOString()});}
      catch(e){if(e.code!==11000)throw e;attempt=await db.one('payment_attempts',{request_key:requestKey});}
    }
    if(!attempt||attempt.user_id!==req.user.id)throw error(409,'Please retry checkout.');
    // Never call the gateway inside a retryable MongoDB transaction. A persisted
    // lease makes concurrent API instances reuse the same checkout attempt.
    const owner=randomUUID(),deadline=Date.now()+20000;
    while(!attempt.gateway_order_id&&!attempt.cafe_order_id){
      const claim=await db.update('payment_attempts',{id:attempt.id,gateway_order_id:null,$or:[{creation_until:{$exists:false}},{creation_until:{$lt:Date.now()}}]},{$set:{creation_owner:owner,creation_until:Date.now()+60000}});
      if(claim.modifiedCount){
        try{
          const remote=await provider.createOrder({amount:attempt.amount,currency:'INR',receipt:attempt.id,notes:{cafe_payment_id:attempt.id}});
          if(!remote.id||remote.amount!==attempt.amount||remote.currency!=='INR')throw error(502,'Unexpected payment gateway response.');
          const updated=await db.update('payment_attempts',{id:attempt.id,creation_owner:owner},{$set:{gateway_order_id:remote.id},$unset:{creation_owner:'',creation_until:''}});
          if(!updated.matchedCount)throw error(409,'Checkout is still being prepared. Please try again shortly.');
        }catch(e){await db.update('payment_attempts',{id:attempt.id,creation_owner:owner},{$unset:{creation_owner:'',creation_until:''}});throw e;}
      }else{
        if(Date.now()>deadline)throw error(409,'Checkout is still being prepared. Please try again shortly.');
        await new Promise(resolve=>setTimeout(resolve,75));
      }
      attempt=await db.one('payment_attempts',{id:attempt.id});
    }
    const result=await reconcile(attempt);
    if(result.order)return res.json({order:result.order});
    const payments=await provider.fetchOrderPayments(attempt.gateway_order_id);
    if(payments.items?.some(p=>p.status==='authorized'))return res.status(202).json({pending:true,message:'Payment is awaiting capture. Please check My orders shortly.'});
    res.json(await publicAttempt(attempt));
  });
  app.get('/api/payments/pending', protect, async (req,res) => res.json((await db.many('payment_attempts',{user_id:req.user.id,cafe_order_id:null,gateway_order_id:{$type:'string'}},{created_at:-1})).map(pendingAttempt)));
  app.post('/api/payments/:id/check', protect, requireEnabled, async (req,res) => {
    const result = await reconcile(await attemptForUser(req.params.id,req.user));
    res.status(result.pending ? 202 : 200).json(result);
  });
  app.post('/api/payments/:id/resume', protect, requireEnabled, async (req,res) => {
    const attempt = await attemptForUser(req.params.id,req.user);
    const result = await reconcile(attempt);
    if (result.order) return res.json({order:result.order});
    // An authorized payment may still be capturing; never invite a second payment.
    const payments = await provider.fetchOrderPayments(attempt.gateway_order_id);
    if (payments.items?.some(p=>p.status==='authorized')) return res.status(202).json({pending:true,message:'Payment is awaiting capture. Please check again shortly.'});
    res.json(await publicAttempt(attempt));
  });
  app.post('/api/payments/razorpay/verify', protect, requireEnabled, async (req,res) => {
    const {attemptId,razorpay_order_id,razorpay_payment_id,razorpay_signature} = req.body || {};
    const attempt = await attemptForUser(attemptId,req.user);
    if (typeof razorpay_payment_id !== 'string' || !/^pay_[a-zA-Z0-9]+$/.test(razorpay_payment_id) || razorpay_order_id !== attempt.gateway_order_id || !validSignature(`${attempt.gateway_order_id}|${razorpay_payment_id}`,razorpay_signature,config.keySecret)) throw error(400,'Payment signature could not be verified. Check payment status before trying again.');
    const result = await confirmPayment(attempt,razorpay_payment_id);
    res.status(result.pending ? 202 : 200).json(result);
  });
  app.post('/api/payments/razorpay/webhook', async (req,res) => {
    if (!enabled || !config.webhookSecret) throw error(503,'Webhook is not configured.');
    if (!req.rawBody || !validSignature(req.rawBody,req.get('x-razorpay-signature'),config.webhookSecret)) throw error(400,'Invalid webhook signature.');
    const event = req.body;
    const payment = event.payload?.payment?.entity;
    if (['payment.captured','order.paid'].includes(event.event) && payment?.order_id && payment?.id) {
      const attempt = (await db.one('payment_attempts',{gateway_order_id:payment.order_id}));
      if (attempt) await confirmPayment(attempt,payment.id);
    }
    if (event.event === 'refund.processed') {
      const refund = event.payload?.refund?.entity;
      if (refund?.payment_id) {
        const order = (await db.one('orders',{payment_id:refund.payment_id}));
        if (order) {
          const payment = await provider.fetchPayment(refund.payment_id);
          if (payment.id === order.payment_id && payment.amount === order.total*100 && payment.currency==='INR' && payment.amount_refunded > 0) {
            await db.update('orders',{id:order.id,refunded_amount:{$not:{$gt:payment.amount_refunded}}},{$set:{payment_status:payment.amount_refunded>=payment.amount?'refunded':'partially_refunded',refunded_amount:payment.amount_refunded}});
            app.locals.notifyOrder(await db.one('orders',{id:order.id}));
          }
        }
      }
    }
    res.json({received:true});
  });
}
module.exports = {installPayments};
