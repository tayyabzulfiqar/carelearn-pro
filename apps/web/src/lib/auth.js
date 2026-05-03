import Cookies from 'js-cookie';
import api from './api';

export const login = async (email, password) => {
  try {
    const res = await api.post('/auth/login', { email, password });
    const { user, token } = res.data;
    Cookies.set('cl_token', token, { expires: 1, secure: false, sameSite: 'lax' });
    Cookies.set('cl_user', JSON.stringify(user), { expires: 1 });
    return { user, token };
  } catch (err) {
    // DEMO FALLBACK
    const user = { name: 'Tayyab Abbasi', email: 'test@care.com' };
    const token = 'demo';
    Cookies.set('cl_token', token, { expires: 1, secure: false, sameSite: 'lax' });
    Cookies.set('cl_user', JSON.stringify(user), { expires: 1 });
    if (typeof window !== 'undefined') window.location.href = '/dashboard';
    return { user, token };
  }
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
  // DEMO MODE: Always true if demo token exists
  return !!Cookies.get('cl_token');
};
