import axios from 'axios';

const API = axios.create({
  baseURL: '/api' // Proxy will be configured in vite.config.js, or use full URL if proxy isn't used
});

// Interceptor for adding token to headers
API.interceptors.request.use((req) => {
  const token = localStorage.getItem('token');
  if (token) {
    req.headers.Authorization = `Bearer ${token}`;
  }
  return req;
});

export const checkHealth = async () => {
  const response = await API.get('/health');
  return response.data;
};

export const fetchMenu = async () => {
  const response = await API.get('/menu');
  return response.data;
};

export const loginUser = async (userData) => {
  const response = await API.post('/auth/login', userData);
  return response.data;
};

export const registerUser = async (userData) => {
  const response = await API.post('/auth/register', userData);
  return response.data;
};

export const getUserProfile = async () => {
  const response = await API.get('/auth/profile');
  return response.data;
};

export const createOrder = async (orderData) => {
  const response = await API.post('/orders', orderData);
  return response.data;
};

export const getMyOrders = async () => {
  const response = await API.get('/orders/myorders');
  return response.data;
};

// --- Admin APIs ---

export const createMenuItem = async (itemData) => {
  const response = await API.post('/menu', itemData);
  return response.data;
};

export const updateMenuItem = async (id, itemData) => {
  const response = await API.put(`/menu/${id}`, itemData);
  return response.data;
};

export const deleteMenuItem = async (id) => {
  const response = await API.delete(`/menu/${id}`);
  return response.data;
};

export const getAllOrders = async () => {
  const response = await API.get('/orders');
  return response.data;
};

export const updateOrderStatus = async (id, status) => {
  const response = await API.put(`/orders/${id}/status`, { status });
  return response.data;
};

export default API;
