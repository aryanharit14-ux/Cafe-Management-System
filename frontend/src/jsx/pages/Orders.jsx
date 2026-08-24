import React, { useState, useEffect } from 'react';
import OrderCard from '../components/OrderCard';
import { getMyOrders } from '../../js/api';
import { Link } from 'react-router-dom';

const Orders = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        const data = await getMyOrders();
        setOrders(data);
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to fetch orders');
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, []);

  if (loading) return <div className="orders-page" style={{ maxWidth: '800px', margin: '0 auto' }}><h2>Loading Orders...</h2></div>;
  if (error) return <div className="orders-page" style={{ maxWidth: '800px', margin: '0 auto' }}><h2 style={{color: 'red'}}>{error}</h2></div>;

  return (
    <div className="orders-page" style={{ maxWidth: '800px', margin: '0 auto' }}>
      <h2>My Orders</h2>
      {orders.length === 0 ? (
        <div style={{ textAlign: 'center', marginTop: '2rem' }}>
          <p>You have no previous orders.</p>
          <Link to="/menu" style={{ color: 'blue', textDecoration: 'underline' }}>View Menu</Link>
        </div>
      ) : (
        <div>
          {orders.map(order => (
            <OrderCard key={order._id} order={order} />
          ))}
        </div>
      )}
    </div>
  );
};
export default Orders;
