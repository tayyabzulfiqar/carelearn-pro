'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import AdminTable from '@/components/admin/AdminTable';
import { AdminErrorState, AdminLoadingState } from '@/components/admin/AdminStates';

export default function QuizEnginePage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadAnalytics() {
      try {
        const response = await api.get('/admin/analytics/training');
        setRows(response.data?.data?.courses || []);
      } catch (_err) {
        setError('Unable to load quiz/training metrics.');
      } finally {
        setLoading(false);
      }
    }
    loadAnalytics();
  }, []);

  if (loading) return <AdminLoadingState title="Loading quiz analytics..." />;
  if (error) return <AdminErrorState message={error} />;

  return (
    <AdminTable
      columns={[
        { key: 'title', label: 'Course' },
        { key: 'enrolled', label: 'Enrolled' },
        { key: 'completed', label: 'Completed' },
        { key: 'avg_final_score', label: 'Avg Final Score' },
      ]}
      rows={rows}
    />
  );
}