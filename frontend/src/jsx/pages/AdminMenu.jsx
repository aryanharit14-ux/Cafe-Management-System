import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { fetchMenu, createMenuItem, updateMenuItem, deleteMenuItem } from '../../js/api';
import { formatPrice } from '../../js/helpers';
import '../../css/pages/Admin.css';

const AdminMenu = () => {
  const [menuItems, setMenuItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({ name: '', description: '', price: '', category: '', isAvailable: true });
  const [imageFile, setImageFile] = useState(null);
  const [editId, setEditId] = useState(null);
  const [formError, setFormError] = useState('');
  
  const fileInputRef = useRef(null);

  useEffect(() => {
    loadMenu();
  }, []);

  const loadMenu = async () => {
    try {
      const data = await fetchMenu();
      setMenuItems(data);
    } catch (err) {
      setError('Failed to fetch menu items.');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked, files } = e.target;
    if (type === 'file') {
      setImageFile(files[0]);
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: type === 'checkbox' ? checked : value
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!formData.name || !formData.category || !formData.price) {
      return setFormError('Name, category, and price are required.');
    }
    
    if (isNaN(formData.price) || Number(formData.price) < 0) {
      return setFormError('Price must be a valid non-negative number.');
    }

    const payload = new FormData();
    payload.append('name', formData.name);
    payload.append('description', formData.description);
    payload.append('price', formData.price);
    payload.append('category', formData.category);
    payload.append('isAvailable', formData.isAvailable);
    if (imageFile) {
      payload.append('image', imageFile);
    }

    try {
      if (editId) {
        await updateMenuItem(editId, payload);
      } else {
        await createMenuItem(payload);
      }
      resetForm();
      loadMenu();
    } catch (err) {
      setFormError(err.response?.data?.message || 'Failed to save menu item.');
    }
  };

  const resetForm = () => {
    setFormData({ name: '', description: '', price: '', category: '', isAvailable: true });
    setImageFile(null);
    setEditId(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleEdit = (item) => {
    setEditId(item._id);
    setFormData({
      name: item.name,
      description: item.description || '',
      price: item.price,
      category: item.category,
      isAvailable: item.isAvailable
    });
    setImageFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this item?')) {
      try {
        await deleteMenuItem(id);
        loadMenu();
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to delete item.');
      }
    }
  };

  const handleCancelEdit = () => {
    resetForm();
    setFormError('');
  };

  if (loading) return <div className="admin-page"><h2>Loading Menu Management...</h2></div>;

  return (
    <div className="admin-page">
      <h2>Manage Menu</h2>
      
      <div className="admin-nav">
        <Link to="/admin">Dashboard</Link>
        <Link to="/admin/menu">Manage Menu</Link>
        <Link to="/admin/orders">Manage Orders</Link>
      </div>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      <form className="admin-form" onSubmit={handleSubmit} encType="multipart/form-data">
        <h3>{editId ? 'Edit Menu Item' : 'Add New Menu Item'}</h3>
        {formError && <p style={{ color: 'red' }}>{formError}</p>}
        
        <div>
          <label>Name*</label>
          <input type="text" name="name" value={formData.name} onChange={handleInputChange} />
        </div>
        <div>
          <label>Category*</label>
          <input type="text" name="category" value={formData.category} onChange={handleInputChange} />
        </div>
        <div>
          <label>Price*</label>
          <input type="number" step="0.01" name="price" value={formData.price} onChange={handleInputChange} />
        </div>
        <div>
          <label>Description</label>
          <textarea name="description" value={formData.description} onChange={handleInputChange} rows="3"></textarea>
        </div>
        <div>
          <label>Image (Optional)</label>
          <input type="file" name="image" accept="image/png, image/jpeg, image/jpg" onChange={handleInputChange} ref={fileInputRef} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <input type="checkbox" name="isAvailable" checked={formData.isAvailable} onChange={handleInputChange} style={{ width: 'auto' }} />
          <label>Available for order</label>
        </div>
        
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button type="submit" style={{ flex: 1, padding: '0.5rem', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px' }}>
            {editId ? 'Update Item' : 'Add Item'}
          </button>
          {editId && (
            <button type="button" onClick={handleCancelEdit} style={{ flex: 1, padding: '0.5rem', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px' }}>
              Cancel
            </button>
          )}
        </div>
      </form>

      <h3>Current Menu Items</h3>
      <table className="admin-table">
        <thead>
          <tr>
            <th>Image</th>
            <th>Name</th>
            <th>Category</th>
            <th>Price</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {menuItems.map(item => (
            <tr key={item._id}>
              <td>
                {item.image ? (
                  <img src={`http://127.0.0.1:5001${item.image}`} alt={item.name} style={{ width: '50px', height: '50px', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: '50px', height: '50px', backgroundColor: '#eee', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem' }}>No Img</div>
                )}
              </td>
              <td>{item.name}</td>
              <td>{item.category}</td>
              <td>{formatPrice(item.price)}</td>
              <td>{item.isAvailable ? 'Available' : 'Out of Stock'}</td>
              <td>
                <button className="btn-edit" onClick={() => handleEdit(item)}>Edit</button>
                <button className="btn-delete" onClick={() => handleDelete(item._id)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default AdminMenu;
