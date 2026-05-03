import Cookies from 'js-cookie';
import api from './api';

export const login = async (email, password) => {
  const res = await api.post('/auth/login', { email, password });
  const { user, token } = res.data;
  Cookies.set('cl_token', token, { expires: 1, secure: false, sameSite: 'lax' });
  Cookies.set('cl_user', JSON.stringify(user), { expires: 1 });
  return { user, token };
};

export const logout = () => {
  Cookies.remove('cl_token');
  Cookies.remove('cl_user');
  window.location.href = '/login';
};

export const getUser = () => {
  if (typeof window === 'undefined') return null;
  const u = Cookies.get('cl_user');
  return u ? JSON.parse(u) : null;
};

export const isAuthenticated = () => {
  return !!Cookies.get('cl_token');
};
