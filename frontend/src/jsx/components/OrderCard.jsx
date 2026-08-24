import React from 'react';
import { formatPrice } from '../../js/helpers';

const OrderCard = ({ order }) => {
  return (
    <div className="order-card" style={{ border: '1px solid #ccc', padding: '1rem', margin: '1rem 0', borderRadius: '8px', backgroundColor: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #eee', paddingBottom: '0.5rem', marginBottom: '0.5rem' }}>
        <h4>Order ID: {order._id}</h4>
        <span><strong>Status:</strong> {order.status}</span>
      </div>
      
      <p style={{ fontSize: '0.9rem', color: '#666' }}>Date: {new Date(order.createdAt).toLocaleString()}</p>
      
      <div style={{ margin: '1rem 0' }}>
        {order.orderItems.map(item => (
          <div key={item._id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.95rem', margin: '0.25rem 0' }}>
            <span>{item.qty} x {item.name}</span>
            <span>{formatPrice(item.price * item.qty)}</span>
          </div>
        ))}
      </div>

      <div style={{ textAlign: 'right', borderTop: '1px solid #eee', paddingTop: '0.5rem' }}>
        <strong>Total: {formatPrice(order.totalAmount)}</strong>
      </div>
    </div>
  );
};

export default OrderCard;
