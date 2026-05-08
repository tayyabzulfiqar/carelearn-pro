'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import AdminTable from '@/components/admin/AdminTable';
import { AdminErrorState, AdminLoadingState } from '@/components/admin/AdminStates';

export default function AuditLogsPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadLogs() {
      try {
        const response = await api.get('/admin/audit-logs?limit=100');
        setRows(response.data?.data?.logs || []);
      } catch (_err) {
        setError('Failed to load audit logs.');
      } finally {
        setLoading(false);
      }
    }
    loadLogs();
  }, []);

  if (loading) return <AdminLoadingState title="Loading audit events..." />;
  if (error) return <AdminErrorState message={error} />;

  return (
    <AdminTable
      columns={[
        { key: 'created_at', label: 'Timestamp' },
        { key: 'action', label: 'Action' },
        { key: 'resource_type', label: 'Resource' },
        { key: 'user_id', label: 'User' },
      ]}
      rows={rows}
    />
  );
}