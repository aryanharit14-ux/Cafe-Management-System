import React, { useContext } from 'react';
import { CartContext } from '../context/CartContext';
import { formatPrice } from '../../js/helpers';

const CartItem = ({ item }) => {
  const { increaseQty, decreaseQty, removeFromCart } = useContext(CartContext);

  return (
    <div className="cart-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', borderBottom: '1px solid #ccc' }}>
      <div style={{ flex: 1 }}>
        <h4>{item.name}</h4>
        <p>{formatPrice(item.price)} each</p>
      </div>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button onClick={() => decreaseQty(item._id)} style={{ padding: '0.25rem 0.5rem' }}>-</button>
        <span>{item.qty}</span>
        <button onClick={() => increaseQty(item._id)} style={{ padding: '0.25rem 0.5rem' }}>+</button>
      </div>

      <div style={{ flex: 1, textAlign: 'right' }}>
        <p><strong>Subtotal:</strong> {formatPrice(item.price * item.qty)}</p>
        <button 
          onClick={() => removeFromCart(item._id)}
          style={{ color: 'red', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
        >
          Remove
        </button>
      </div>
    </div>
  );
};

export default CartItem;
