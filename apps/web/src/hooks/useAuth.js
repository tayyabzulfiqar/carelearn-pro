'use client';
import { useState, useEffect } from 'react';
import { getUser, isAuthenticated, logout } from '@/lib/auth';

export default function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isAuthenticated()) {
      setUser(getUser());
    }
    setLoading(false);
  }, []);

  return { user, loading, logout, isAuthenticated: !!user };
}
