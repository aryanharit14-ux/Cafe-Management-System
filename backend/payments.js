const {randomUUID} = require('node:crypto');
const {createRazorpay, validSignature} = require('./razorpay');
const {validateCheckout} = require('./checkout');
const error = (status, message) => Object.assign(new Error(message), {status});

function installPayments({app, db, protect, serializeOrder, config, gateway}) {
  const enabled = Boolean(config.keyId && config.keySecret);
  const provider = gateway || createRazorpay(config);
  const inFlight = new Map();
  db.exec(`CREATE TABLE IF NOT EXISTS payment_attempts (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), request_key TEXT NOT NULL UNIQUE,
    checkout TEXT NOT NULL, amount INTEGER NOT NULL, gateway_order_id TEXT UNIQUE,
    cafe_order_id TEXT, created_at TEXT NOT NULL, last_error TEXT NOT NULL DEFAULT ''
  );
  CREATE UNIQUE INDEX IF NOT EXISTS orders_payment_id ON orders(payment_id) WHERE payment_id IS NOT NULL;`);

  const requireEnabled = (req, res, next) => enabled ? next() : res.status(503).json({message:'Online payment is currently unavailable. You can pay at the café.'});
  const attemptForUser = (id, user) => {
    if (typeof id !== 'string') throw error(400, 'Select a payment to continue.');
    const attempt = db.prepare('SELECT * FROM payment_attempts WHERE id=? AND user_id=?').get(id, user.id);
    if (!attempt) throw error(404, 'Payment not found.');
    return attempt;
  };
  const publicAttempt = attempt => ({
    id:attempt.id, amount:attempt.amount, currency:'INR', gatewayOrderId:attempt.gateway_order_id,
    keyId:config.keyId, testMode:config.keyId?.startsWith('rzp_test_') || false,
    order:attempt.cafe_order_id ? serializeOrder(db.prepare('SELECT * FROM orders WHERE id=?').get(attempt.cafe_order_id)) : null
  });
  const pendingAttempt = attempt => {
    const basket = JSON.parse(attempt.checkout);
    return {id:attempt.id, amount:attempt.amount, createdAt:attempt.created_at, items:basket.items, store:basket.store, method:basket.method};
  };

  // Only a captured, correctly priced payment can create a fulfilment order.
  async function confirmPayment(attempt, paymentId) {
    const payment = await provider.fetchPayment(paymentId);
    const remoteOrder = await provider.fetchOrder(attempt.gateway_order_id);
    if (payment.id !== paymentId || payment.order_id !== attempt.gateway_order_id || payment.amount !== attempt.amount || payment.currency !== 'INR' || remoteOrder.id !== attempt.gateway_order_id || remoteOrder.amount !== attempt.amount || remoteOrder.currency !== 'INR') throw error(400, 'Payment details do not match this order.');
    if (Number(payment.amount_refunded || 0)>0 && !attempt.cafe_order_id) throw error(409, 'This payment has been refunded. Contact the café before placing another order.');
    if (payment.status !== 'captured' || remoteOrder.status !== 'paid' || remoteOrder.amount_paid !== attempt.amount) return {pending:true, message:'Payment is not yet captured. Check payment status shortly; do not pay again if your account was debited.'};
    db.exec('BEGIN IMMEDIATE');
    try {
      const latest = db.prepare('SELECT * FROM payment_attempts WHERE id=?').get(attempt.id);
      if (latest.cafe_order_id) {
        const existing = db.prepare('SELECT * FROM orders WHERE id=?').get(latest.cafe_order_id);
        db.exec('COMMIT');
        return {order:serializeOrder(existing)};
      }
      const basket = JSON.parse(latest.checkout);
      const id = randomUUID();
      db.prepare(`INSERT INTO orders (id,user_id,items,total,status,store,method,notes,created_at,request_key,payment_method,payment_status,payment_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,latest.user_id,JSON.stringify(basket.items),basket.total,'Pending',basket.store,basket.method,basket.notes,new Date().toISOString(),'online:'+latest.id,'razorpay','paid',payment.id);
      db.prepare('UPDATE payment_attempts SET cafe_order_id=? WHERE id=?').run(id,latest.id);
      db.exec('COMMIT');
      return {order:serializeOrder(db.prepare('SELECT * FROM orders WHERE id=?').get(id))};
    } catch (err) { db.exec('ROLLBACK'); throw err; }
  }

  async function reconcile(attempt) {
    if (attempt.cafe_order_id) return {order:serializeOrder(db.prepare('SELECT * FROM orders WHERE id=?').get(attempt.cafe_order_id))};
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
    let attempt = db.prepare('SELECT * FROM payment_attempts WHERE request_key=?').get(requestKey);
    if (attempt && attempt.user_id !== req.user.id) throw error(409,'Please retry checkout.');
    if (!attempt) {
      const basket = validateCheckout(db, req.body);
      const id = randomUUID();
      db.prepare('INSERT INTO payment_attempts (id,user_id,request_key,checkout,amount,created_at) VALUES (?,?,?,?,?,?)').run(id,req.user.id,requestKey,JSON.stringify(basket),basket.total*100,new Date().toISOString());
      attempt = db.prepare('SELECT * FROM payment_attempts WHERE id=?').get(id);
    }
    if (attempt.gateway_order_id) {
      const result=await reconcile(attempt);
      if (result.order) return res.json({order:result.order});
      const payments=await provider.fetchOrderPayments(attempt.gateway_order_id);
      if (payments.items?.some(p=>p.status==='authorized')) return res.status(202).json({pending:true,message:'Payment is awaiting capture. Please check My orders shortly.'});
    }
    if (!attempt.gateway_order_id && !attempt.cafe_order_id) {
      // Multiple clicks share one server request and one Razorpay order.
      if (!inFlight.has(attempt.id)) {
        const creation = provider.createOrder({amount:attempt.amount,currency:'INR',receipt:attempt.id,notes:{cafe_payment_id:attempt.id}}).then(remote => {
          if (!remote.id || remote.amount !== attempt.amount || remote.currency !== 'INR') throw error(502,'Unexpected payment gateway response.');
          db.prepare('UPDATE payment_attempts SET gateway_order_id=? WHERE id=?').run(remote.id,attempt.id);
        }).finally(() => inFlight.delete(attempt.id));
        inFlight.set(attempt.id,creation);
      }
      await inFlight.get(attempt.id);
    }
    res.json(publicAttempt(db.prepare('SELECT * FROM payment_attempts WHERE id=?').get(attempt.id)));
  });
  app.get('/api/payments/pending', protect, (req,res) => res.json(db.prepare('SELECT * FROM payment_attempts WHERE user_id=? AND cafe_order_id IS NULL AND gateway_order_id IS NOT NULL ORDER BY created_at DESC').all(req.user.id).map(pendingAttempt)));
  app.post('/api/payments/:id/check', protect, requireEnabled, async (req,res) => {
    const result = await reconcile(attemptForUser(req.params.id,req.user));
    res.status(result.pending ? 202 : 200).json(result);
  });
  app.post('/api/payments/:id/resume', protect, requireEnabled, async (req,res) => {
    const attempt = attemptForUser(req.params.id,req.user);
    const result = await reconcile(attempt);
    if (result.order) return res.json({order:result.order});
    // An authorized payment may still be capturing; never invite a second payment.
    const payments = await provider.fetchOrderPayments(attempt.gateway_order_id);
    if (payments.items?.some(p=>p.status==='authorized')) return res.status(202).json({pending:true,message:'Payment is awaiting capture. Please check again shortly.'});
    res.json(publicAttempt(attempt));
  });
  app.post('/api/payments/razorpay/verify', protect, requireEnabled, async (req,res) => {
    const {attemptId,razorpay_order_id,razorpay_payment_id,razorpay_signature} = req.body || {};
    const attempt = attemptForUser(attemptId,req.user);
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
      const attempt = db.prepare('SELECT * FROM payment_attempts WHERE gateway_order_id=?').get(payment.order_id);
      if (attempt) await confirmPayment(attempt,payment.id);
    }
    if (event.event === 'refund.processed') {
      const refund = event.payload?.refund?.entity;
      if (refund?.payment_id) {
        const order = db.prepare('SELECT * FROM orders WHERE payment_id=?').get(refund.payment_id);
        if (order) {
          const payment = await provider.fetchPayment(refund.payment_id);
          if (payment.id === order.payment_id && payment.amount === order.total*100 && payment.currency==='INR' && payment.amount_refunded > 0) {
            db.prepare('UPDATE orders SET payment_status=? WHERE id=?').run(payment.amount_refunded>=payment.amount?'refunded':'partially_refunded',order.id);
          }
        }
      }
    }
    res.json({received:true});
  });
}
module.exports = {installPayments};
