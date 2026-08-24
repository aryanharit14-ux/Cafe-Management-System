import React, { useState, useEffect } from 'react';
import MenuCard from '../components/MenuCard';
import { fetchMenu } from '../../js/api';

const Menu = () => {
  const [menuItems, setMenuItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const getMenu = async () => {
      try {
        const data = await fetchMenu();
        setMenuItems(data);
        setLoading(false);
      } catch (err) {
        setError('Failed to fetch menu. The server might be down.');
        setLoading(false);
      }
    };

    getMenu();
  }, []);

  if (loading) return <div className="menu-page"><h2>Loading Menu...</h2></div>;
  if (error) return <div className="menu-page"><h2 style={{color: 'red'}}>{error}</h2></div>;

  return (
    <div className="menu-page">
      <h2>Our Menu</h2>
      {menuItems.length === 0 ? (
        <p>No items currently available.</p>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center' }}>
          {menuItems.map(item => (
            <MenuCard key={item._id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
};
export default Menu;
