const categories = ['Hot coffee', 'Cold coffee', 'Tea & more', 'Refreshers', 'Bakery', 'Kitchen', 'Sandwiches & wraps', 'Desserts'];
const stores = ['Juniper • Central café', 'Juniper • Riverside café'];
function checkoutError(message) { return Object.assign(new Error(message), {status:400}); }
function validateCheckout(db, body = {}) {
  const {orderItems, store, method, notes = '', requestKey} = body;
  if (!Array.isArray(orderItems) || !orderItems.length || orderItems.length > 50 || !stores.includes(store) || !['Takeaway', 'Dine in'].includes(method) || typeof notes !== 'string' || notes.length > 300 || typeof requestKey !== 'string' || requestKey.length < 8 || requestKey.length > 80) {
    throw checkoutError('Check your basket and pickup details.');
  }
  const items = [];
  let total = 0;
  for (const item of orderItems) {
    if (!item || typeof item.menuItem !== 'string' || !Number.isInteger(item.qty) || item.qty < 1 || item.qty > 20) throw checkoutError('Item quantities must be between 1 and 20.');
    const product = db.prepare('SELECT * FROM menu WHERE id=?').get(item.menuItem);
    if (!product || !product.available) throw checkoutError('An item is no longer available. Please update your basket.');
    const drink = ['Hot coffee', 'Cold coffee', 'Tea & more'].includes(product.category);
    const size = drink ? (item.size || 'Regular') : 'Regular';
    const milk = drink ? (item.milk || 'Dairy') : 'None';
    if (!['Regular', 'Large'].includes(size) || !(drink ? ['Dairy', 'Oat', 'Almond'] : ['None']).includes(milk)) throw checkoutError('Invalid drink options.');
    const price = product.price + (size === 'Large' ? 50 : 0) + (['Oat', 'Almond'].includes(milk) ? 40 : 0);
    total += price * item.qty;
    items.push({menuItem:product.id, name:product.name, qty:item.qty, price, size, milk, image:product.image});
  }
  return {items, total, store, method, notes:notes.trim(), requestKey};
}
module.exports = {validateCheckout, categories, stores};
