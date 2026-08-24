import React, { useContext } from 'react';
import { CartContext } from '../context/CartContext';
import { formatPrice } from '../../js/helpers';

const MenuCard = ({ item }) => {
  const { addToCart } = useContext(CartContext);

  return (
    <div className="menu-card" style={{ border: '1px solid #ccc', padding: '1rem', margin: '1rem', borderRadius: '8px', minWidth: '250px', display: 'flex', flexDirection: 'column' }}>
      {item.image ? (
        <img src={`http://127.0.0.1:5001${item.image}`} alt={item.name} style={{ width: '100%', height: '150px', objectFit: 'cover', borderRadius: '4px', marginBottom: '1rem' }} />
      ) : (
        <div style={{ width: '100%', height: '150px', backgroundColor: '#eee', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px', marginBottom: '1rem', color: '#888' }}>
          No Image Available
        </div>
      )}
      <h3 style={{ margin: '0 0 0.5rem 0' }}>{item.name}</h3>
      <p style={{ flex: 1, margin: '0 0 1rem 0' }}>{item.description}</p>
      <p style={{ margin: '0 0 1rem 0' }}><strong>Price:</strong> {formatPrice(item.price)}</p>
      
      {item.isAvailable ? (
        <button 
          onClick={() => addToCart(item)}
          style={{ padding: '0.5rem', cursor: 'pointer', backgroundColor: '#333', color: '#fff', border: 'none', borderRadius: '4px' }}
        >
          Add to Cart
        </button>
      ) : (
        <button disabled style={{ padding: '0.5rem', backgroundColor: '#ccc', border: 'none', borderRadius: '4px' }}>
          Out of Stock
        </button>
      )}
    </div>
  );
};

export default MenuCard;
