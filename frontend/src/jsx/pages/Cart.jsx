import React, { useContext, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import CartItem from '../components/CartItem';
import { CartContext } from '../context/CartContext';
import { AuthContext } from '../context/AuthContext';
import { formatPrice } from '../../js/helpers';
import { createOrder } from '../../js/api';

const Cart = () => {
  const { cartItems, cartTotal, clearCart } = useContext(CartContext);
  const { user } = useContext(AuthContext);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleCheckout = async () => {
    if (!user) {
      navigate('/login');
      return;
    }

    if (cartItems.length === 0) return;

    try {
      setLoading(true);
      setError('');
      
      const orderPayload = {
        orderItems: cartItems.map(item => ({
          menuItem: item._id,
          qty: item.qty
        }))
      };

      await createOrder(orderPayload);
      clearCart();
      navigate('/orders');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to place order');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="cart-page" style={{ maxWidth: '800px', margin: '0 auto' }}>
      <h2>Shopping Cart</h2>
      
      {error && <p style={{ color: 'red', textAlign: 'center' }}>{error}</p>}

      {cartItems.length === 0 ? (
        <div style={{ textAlign: 'center', marginTop: '2rem' }}>
          <p>Your cart is empty.</p>
          <Link to="/menu" style={{ color: 'blue', textDecoration: 'underline' }}>Continue Shopping</Link>
        </div>
      ) : (
        <div>
          {cartItems.map(item => (
            <CartItem key={item._id} item={item} />
          ))}
          
          <div style={{ marginTop: '2rem', textAlign: 'right' }}>
            <h3>Total: {formatPrice(cartTotal)}</h3>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
              <button onClick={clearCart} disabled={loading} style={{ padding: '0.5rem 1rem', background: '#ccc', border: 'none', cursor: 'pointer' }}>
                Clear Cart
              </button>
              <button onClick={handleCheckout} disabled={loading} style={{ padding: '0.5rem 1rem', background: '#333', color: 'white', border: 'none', cursor: 'pointer' }}>
                {loading ? 'Processing...' : 'Checkout'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default Cart;
