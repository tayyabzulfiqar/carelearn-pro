'use client';

import { useCallback, useEffect, useState } from 'react';
import AdminTable from '@/components/admin/AdminTable';
import { AdminErrorState, AdminLoadingState } from '@/components/admin/AdminStates';
import AdminFilterBar from '@/components/admin/AdminFilterBar';
import { cmsGet, cmsPost } from '@/lib/admin/cmsApi';

export default function CoursesBuilderPage() {
  const [trainings, setTrainings] = useState([]);
  const [selected, setSelected] = useState('');
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [moduleTitle, setModuleTitle] = useState('');

  const loadTrainings = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await cmsGet('/trainings');
      const rows = data?.trainings || [];
      setTrainings(rows);
      if (!selected && rows.length) setSelected(rows[0].id);
    } catch (_err) {
      setError('Failed to load trainings.');
    } finally {
      setLoading(false);
    }
  }, [selected]);

  const loadModules = async (courseId) => {
    if (!courseId) return;
    try {
      const data = await cmsGet(`/trainings/${courseId}/modules`);
      setModules(data?.modules || []);
    } catch (_err) {
      setError('Failed to load modules.');
    }
  };

  useEffect(() => { loadTrainings(); }, [loadTrainings]);
  useEffect(() => { loadModules(selected); }, [selected]);

  const addModule = async () => {
    if (!selected || !moduleTitle.trim()) return;
    await cmsPost(`/trainings/${selected}/modules`, { title: moduleTitle, status: 'draft' });
    setModuleTitle('');
    await loadModules(selected);
  };

  if (loading) return <AdminLoadingState title="Loading course builder..." />;
  if (error && !trainings.length) return <AdminErrorState message={error} onRetry={loadTrainings} />;

  return (
    <div>
      <AdminFilterBar
        search=""
        onSearchChange={() => {}}
        filters={[
          {
            key: 'training',
            value: selected,
            onChange: setSelected,
            options: trainings.map((training) => ({ label: training.title, value: training.id })),
          },
        ]}
      />

      <div className="surface-card mb-4 p-4">
        <div className="flex gap-2">
          <input className="field-input" value={moduleTitle} onChange={(e) => setModuleTitle(e.target.value)} placeholder="New module title" />
          <button type="button" className="btn-primary" onClick={addModule}>Add Module</button>
        </div>
      </div>

      <AdminTable
        columns={[
          { key: 'title', label: 'Module Title' },
          { key: 'status', label: 'Status' },
          { key: 'order_index', label: 'Order' },
          { key: 'description', label: 'Description' },
        ]}
        rows={modules}
      />
    </div>
  );
}
