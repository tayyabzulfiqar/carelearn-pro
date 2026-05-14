'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import AdminTable from '@/components/admin/AdminTable';
import { AdminErrorState, AdminLoadingState } from '@/components/admin/AdminStates';

export default function AnalyticsPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [layer4, setLayer4] = useState(null);
  const [compliance, setCompliance] = useState(null);

  useEffect(() => {
    async function loadRows() {
      try {
        const response = await api.get('/admin/analytics/training');
        setRows(response.data?.data?.courses || []);
        const generated = await api.post('/admin/cms/layer4/analytics/generate').catch(() => null);
        setLayer4(generated?.data?.data?.analytics || null);
        const complianceRun = await api.post('/admin/cms/layer4/compliance/run').catch(() => null);
        setCompliance(complianceRun?.data?.data?.compliance || null);
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
    <div className="space-y-4">
      <section className="surface-card p-4">
        <h2 className="text-sm font-semibold text-slate-900">Layer 4 Insights</h2>
        <p className="mt-1 text-xs text-slate-600">
          Difficult topics tracked: {layer4?.difficult_topics?.length || 0} | Compliance alerts: {compliance?.totals?.combined || 0}
        </p>
      </section>
      <AdminTable
        columns={[
          { key: 'title', label: 'Course' },
          { key: 'enrolled', label: 'Enrollments' },
          { key: 'completed', label: 'Completions' },
          { key: 'avg_final_score', label: 'Final Score Avg' },
        ]}
        rows={rows}
      />
    </div>
  );
}
