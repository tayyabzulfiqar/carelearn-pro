'use client';
import { useState, useEffect } from 'react';
import Cookies from 'js-cookie';
import { getUser, isAuthenticated, logout } from '@/lib/auth';
import api from '@/lib/api';

export default function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadUser() {
      if (!isAuthenticated()) {
        if (mounted) setLoading(false);
        return;
      }

      const cachedUser = getUser();
      if (cachedUser && mounted) setUser(cachedUser);

      try {
        const response = await api.get('/auth/me');
        if (mounted) {
          setUser(response.data.user);
          const secure = typeof window !== 'undefined' && window.location.protocol === 'https:';
          Cookies.set('cl_user', JSON.stringify(response.data.user), { expires: 1, secure, sameSite: 'lax' });
        }
      } catch (_error) {
        logout();
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadUser();
    return () => { mounted = false; };
  }, []);

  return { user, loading, logout, isAuthenticated: !!user };
}
