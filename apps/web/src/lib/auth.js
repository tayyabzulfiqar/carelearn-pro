import Cookies from 'js-cookie';
import api from './api';

export const login = async (email, password) => {
  const res = await api.post('/auth/login', { email, password });
  const { user, token } = res.data;
  if (!user || !token) {
    throw new Error('Login response did not include user and token');
  }
  if (typeof window !== 'undefined') {
    localStorage.setItem('cl_token', token);
  }
  const secure = typeof window !== 'undefined' && window.location.protocol === 'https:';
  Cookies.set('cl_token', token, { expires: 1, secure, sameSite: 'lax' });
  Cookies.set('cl_user', JSON.stringify(user), { expires: 1, secure, sameSite: 'lax' });
  return { user, token };
};

export const logout = () => {
  Cookies.remove('cl_token');
  Cookies.remove('cl_user');
  if (typeof window !== 'undefined') localStorage.removeItem('cl_token');
  window.location.href = '/login';
};

export const getUser = () => {
  if (typeof window === 'undefined') return null;
  const u = Cookies.get('cl_user');
  return u ? JSON.parse(u) : null;
};

export const getToken = () => {
  if (typeof window === 'undefined') return Cookies.get('cl_token') || null;
  return localStorage.getItem('cl_token') || Cookies.get('cl_token') || null;
};

export const isAuthenticated = () => {
  return !!getToken();
};
