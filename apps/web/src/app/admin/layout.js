'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import useAuth from '@/hooks/useAuth';
import api from '@/lib/api';
import AdminSidebar from '@/components/admin/AdminSidebar';
import AdminTopbar from '@/components/admin/AdminTopbar';
import { AdminLoadingState, AdminErrorState } from '@/components/admin/AdminStates';
import { ToastProvider } from '@/components/admin/providers/ToastProvider';
import { GlobalLoadingProvider } from '@/components/admin/providers/GlobalLoadingProvider';

export default function AdminLayout({ children }) {
  const router = useRouter();
  const { user, loading, isAuthenticated } = useAuth();
  const [permissions, setPermissions] = useState([]);
  const [permLoading, setPermLoading] = useState(true);
  const [permError, setPermError] = useState('');

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [loading, isAuthenticated, router]);

  useEffect(() => {
    let mounted = true;
    async function loadPermissions() {
      if (!isAuthenticated) return;
      try {
        const response = await api.get('/admin/permissions');
        if (mounted) setPermissions(response.data?.data?.permissions || []);
      } catch (_err) {
        if (mounted) setPermError('Unable to load role permissions.');
      } finally {
        if (mounted) setPermLoading(false);
      }
    }
    loadPermissions();
    return () => {
      mounted = false;
    };
  }, [isAuthenticated]);

  if (loading || permLoading) {
    return <div className="page-container py-8"><AdminLoadingState title="Preparing admin workspace..." /></div>;
  }

  if (!isAuthenticated) return null;

  if (permError) {
    return <div className="page-container py-8"><AdminErrorState message={permError} /></div>;
  }

  const hasAdminAccess = permissions.includes('*')
    || permissions.includes('training.write')
    || permissions.includes('media.write')
    || permissions.includes('user.read')
    || permissions.includes('settings.write');

  if (!hasAdminAccess || user?.role !== 'super_admin') {
    return (
      <div className="page-container py-8">
        <AdminErrorState message="Your account does not have super admin workspace access." />
      </div>
    );
  }

  return (
    <ToastProvider>
      <GlobalLoadingProvider>
        <div className="page-shell flex min-h-screen">
          <AdminSidebar permissions={permissions} />
          <div className="flex min-h-screen flex-1 flex-col">
            <AdminTopbar user={user} />
            <main className="page-container flex-1 py-6">{children}</main>
          </div>
        </div>
      </GlobalLoadingProvider>
    </ToastProvider>
  );
}
