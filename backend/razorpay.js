const {createHmac, timingSafeEqual} = require('node:crypto');
function validSignature(message, signature, secret) {
  if (!secret || typeof signature !== 'string' || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(message).digest();
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}
function createRazorpay({keyId, keySecret}) {
  async function request(endpoint, body) {
    let response;
    try {
      response = await fetch('https://api.razorpay.com/v1' + endpoint, {
        method: body ? 'POST' : 'GET',
        headers: {Authorization:'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64'), 'Content-Type':'application/json'},
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(15000)
      });
      if (!response.ok) throw new Error('Gateway rejected the request');
      return await response.json();
    } catch {
      throw Object.assign(new Error('Razorpay could not be reached. Please retry or check payment status before paying again.'), {status:502});
    }
  }
  return {
    createOrder: body => request('/orders', body),
    fetchOrder: id => request('/orders/' + encodeURIComponent(id)),
    fetchPayment: id => request('/payments/' + encodeURIComponent(id)),
    fetchOrderPayments: id => request('/orders/' + encodeURIComponent(id) + '/payments')
  };
}
module.exports = {createRazorpay, validSignature};
