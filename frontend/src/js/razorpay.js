let checkoutScript;
export function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve();
  if (checkoutScript) return checkoutScript;
  checkoutScript = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timer = setTimeout(() => fail(), 15000);
    const fail = () => {
      clearTimeout(timer);
      script.remove();
      checkoutScript = null;
      reject(new Error('The payment window could not load. Check your connection and try again.'));
    };
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => { clearTimeout(timer); if (window.Razorpay) resolve(); else fail(); };
    script.onerror = fail;
    document.head.appendChild(script);
  });
  return checkoutScript;
}
export async function openRazorpay(attempt, user) {
  await loadRazorpay();
  return new Promise((resolve, reject) => {
    let lastError = '';
    let completed = false;
    const checkout = new window.Razorpay({
      key:attempt.keyId,
      order_id:attempt.gatewayOrderId,
      amount:attempt.amount,
      currency:attempt.currency,
      name:'Juniper Coffee',
      description:'Your handcrafted café order',
      prefill:{name:user.name, email:user.email},
      theme:{color:'#173f32'},
      handler:response => { completed = true; resolve(response); },
      modal:{ondismiss:() => { if (!completed) reject(new Error(lastError || 'Payment window closed. Your bag is saved. Check My orders if you were debited.')); }}
    });
    checkout.on('payment.failed', () => { lastError = 'Payment did not complete. Your bag is saved; check payment status before retrying if you were debited.'; });
    checkout.open();
  });
}
