import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getAllOrders, updateOrderStatus } from '../../js/api';
import { formatPrice } from '../../js/helpers';
import '../../css/pages/Admin.css';

const AdminOrders = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    try {
      const data = await getAllOrders();
      setOrders(data);
    } catch (err) {
      setError('Failed to fetch orders.');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (id, newStatus) => {
    try {
      await updateOrderStatus(id, newStatus);
      loadOrders(); // Refresh to ensure backend confirmation
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update order status');
    }
  };

  if (loading) return <div className="admin-page"><h2>Loading Orders...</h2></div>;

  return (
    <div className="admin-page">
      <h2>Manage Orders</h2>
      
      <div className="admin-nav">
        <Link to="/admin">Dashboard</Link>
        <Link to="/admin/menu">Manage Menu</Link>
        <Link to="/admin/orders">Manage Orders</Link>
      </div>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      {orders.length === 0 ? (
        <p>No orders found.</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Order ID</th>
              <th>Customer</th>
              <th>Items</th>
              <th>Total</th>
              <th>Date</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {orders.map(order => (
              <tr key={order._id}>
                <td style={{ fontSize: '0.85rem' }}>{order._id}</td>
                <td>
                  {order.user ? (
                    <>
                      <div>{order.user.name}</div>
                      <div style={{ fontSize: '0.85rem', color: '#666' }}>{order.user.email}</div>
                    </>
                  ) : 'Unknown'}
                </td>
                <td>
                  <ul style={{ margin: 0, paddingLeft: '1rem', fontSize: '0.9rem' }}>
                    {order.orderItems.map(item => (
                      <li key={item._id}>{item.qty}x {item.name}</li>
                    ))}
                  </ul>
                </td>
                <td>{formatPrice(order.totalAmount)}</td>
                <td style={{ fontSize: '0.85rem' }}>{new Date(order.createdAt).toLocaleString()}</td>
                <td>
                  <select 
                    value={order.status} 
                    onChange={(e) => handleStatusChange(order._id, e.target.value)}
                    style={{ padding: '0.25rem' }}
                  >
                    <option value="Pending">Pending</option>
                    <option value="Preparing">Preparing</option>
                    <option value="Ready">Ready</option>
                    <option value="Completed">Completed</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default AdminOrders;
