import axios from 'axios';
import Cookies from 'js-cookie';

export const API_BASE = process.env.NEXT_PUBLIC_API_URL;

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = typeof window !== 'undefined'
    ? localStorage.getItem('cl_token') || Cookies.get('cl_token')
    : Cookies.get('cl_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      Cookies.remove('cl_token');
      Cookies.remove('cl_user');
      if (typeof window !== 'undefined') {
        localStorage.removeItem('cl_token');
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

export default api;
