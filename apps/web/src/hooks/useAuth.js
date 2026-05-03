'use client';
import { useState, useEffect } from 'react';
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
      if (cachedUser) {
        if (mounted) {
          setUser(cachedUser);
          setLoading(false);
        }
        return;
      }

      try {
        const response = await api.get('/auth/me');
        if (mounted) setUser(response.data.user);
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
