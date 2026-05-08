'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import AdminTable from '@/components/admin/AdminTable';
import { AdminErrorState, AdminLoadingState } from '@/components/admin/AdminStates';

export default function AnalyticsPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadRows() {
      try {
        const response = await api.get('/admin/analytics/training');
        setRows(response.data?.data?.courses || []);
      } catch (_err) {
        setError('Failed to load analytics.');
      } finally {
        setLoading(false);
      }
    }
    loadRows();
  }, []);

  if (loading) return <AdminLoadingState title="Loading analytics..." />;
  if (error) return <AdminErrorState message={error} />;

  return (
    <AdminTable
      columns={[
        { key: 'title', label: 'Course' },
        { key: 'enrolled', label: 'Enrollments' },
        { key: 'completed', label: 'Completions' },
        { key: 'avg_final_score', label: 'Final Score Avg' },
      ]}
      rows={rows}
    />
  );
}