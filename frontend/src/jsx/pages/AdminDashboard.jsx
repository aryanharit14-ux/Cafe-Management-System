import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { fetchMenu, getAllOrders } from '../../js/api';
import '../../css/pages/Admin.css';

const AdminDashboard = () => {
  const [menuItems, setMenuItems] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [menuData, ordersData] = await Promise.all([
          fetchMenu(),
          getAllOrders()
        ]);
        setMenuItems(menuData);
        setOrders(ordersData);
      } catch (err) {
        setError('Failed to fetch admin data.');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) return <div className="admin-page"><h2>Loading Dashboard...</h2></div>;
  if (error) return <div className="admin-page"><h2 style={{color: 'red'}}>{error}</h2></div>;

  const availableItems = menuItems.filter(item => item.isAvailable).length;
  
  const pendingOrders = orders.filter(o => o.status === 'Pending').length;
  const preparingOrders = orders.filter(o => o.status === 'Preparing').length;
  const readyOrders = orders.filter(o => o.status === 'Ready').length;
  const completedOrders = orders.filter(o => o.status === 'Completed').length;

  return (
    <div className="admin-page">
      <h2>Admin Dashboard</h2>
      
      <div className="admin-nav">
        <Link to="/admin">Dashboard</Link>
        <Link to="/admin/menu">Manage Menu</Link>
        <Link to="/admin/orders">Manage Orders</Link>
      </div>

      <div className="admin-stats">
        <div className="stat-box">
          <h3>Menu Items</h3>
          <p>Total: {menuItems.length}</p>
          <p>Available: {availableItems}</p>
        </div>
        <div className="stat-box">
          <h3>Total Orders</h3>
          <p>{orders.length}</p>
        </div>
        <div className="stat-box">
          <h3>Order Statuses</h3>
          <p>Pending: {pendingOrders}</p>
          <p>Preparing: {preparingOrders}</p>
          <p>Ready: {readyOrders}</p>
          <p>Completed: {completedOrders}</p>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
