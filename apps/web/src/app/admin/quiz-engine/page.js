'use client';

import { useCallback, useEffect, useState } from 'react';
import AdminFilterBar from '@/components/admin/AdminFilterBar';
import AdminFormField from '@/components/admin/AdminFormField';
import { AdminModal } from '@/components/admin/AdminOverlays';
import AdminTable from '@/components/admin/AdminTable';
import { AdminErrorState, AdminLoadingState } from '@/components/admin/AdminStates';
import { cmsGet, cmsPost, cmsPut, cmsDelete } from '@/lib/admin/cmsApi';

const EMPTY = {
  id: '',
  title: '',
  quiz_type: 'final',
  pass_mark: 75,
  retry_limit: 3,
  status: 'draft',
};

export default function QuizEnginePage() {
  const [trainings, setTrainings] = useState([]);
  const [courseId, setCourseId] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const loadTrainings = async () => {
    const data = await cmsGet('/trainings');
    const items = data?.trainings || [];
    setTrainings(items);
    if (!courseId && items.length) setCourseId(items[0].id);
  };

  const loadQuizzes = async (selectedCourse) => {
    if (!selectedCourse) return;
    const data = await cmsGet(`/trainings/${selectedCourse}/quizzes`);
    setRows(data?.quizzes || []);
  };

  const bootstrap = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      await loadTrainings();
    } catch (_err) {
      setError('Failed to initialize quiz management.');
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => { bootstrap(); }, [bootstrap]);
  useEffect(() => { if (courseId) loadQuizzes(courseId); }, [courseId]);

  const save = async (e) => {
    e.preventDefault();
    const payload = {
      title: form.title,
      quiz_type: form.quiz_type,
      pass_mark: Number(form.pass_mark || 75),
      retry_limit: Number(form.retry_limit || 3),
      status: form.status,
    };
    if (form.id) {
      await cmsPut(`/quizzes/${form.id}`, payload);
    } else {
      await cmsPost(`/trainings/${courseId}/quizzes`, payload);
    }
    setOpen(false);
    setForm(EMPTY);
    await loadQuizzes(courseId);
  };

  const remove = async (row) => {
    if (!window.confirm(`Delete quiz "${row.title}"?`)) return;
    await cmsDelete(`/quizzes/${row.id}`);
    await loadQuizzes(courseId);
  };

  if (loading) return <AdminLoadingState title="Loading quiz engine..." />;
  if (error) return <AdminErrorState message={error} onRetry={bootstrap} />;

  return (
    <div>
      <AdminFilterBar
        search=""
        onSearchChange={() => {}}
        filters={[
          {
            key: 'course',
            value: courseId,
            onChange: setCourseId,
            options: trainings.map((t) => ({ label: t.title, value: t.id })),
          },
        ]}
        actions={<button type="button" className="btn-primary" onClick={() => setOpen(true)}>New Quiz</button>}
      />

      <AdminTable
        columns={[
          { key: 'title', label: 'Quiz' },
          { key: 'quiz_type', label: 'Type' },
          { key: 'pass_mark', label: 'Pass Mark' },
          { key: 'retry_limit', label: 'Retry Limit' },
          { key: 'status', label: 'Status' },
          {
            key: 'actions',
            label: 'Actions',
            render: (row) => (
              <div className="flex gap-2">
                <button type="button" className="btn-secondary" onClick={() => { setForm({ ...row }); setOpen(true); }}>Edit</button>
                <button type="button" className="btn-secondary" onClick={() => remove(row)}>Delete</button>
              </div>
            ),
          },
        ]}
        rows={rows}
      />

      <AdminModal open={open} title={form.id ? 'Edit Quiz' : 'Create Quiz'} onClose={() => setOpen(false)}>
        <form className="space-y-3" onSubmit={save}>
          <AdminFormField label="Title"><input className="field-input" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required /></AdminFormField>
          <div className="grid grid-cols-2 gap-3">
            <AdminFormField label="Type">
              <select className="field-input" value={form.quiz_type} onChange={(e) => setForm((f) => ({ ...f, quiz_type: e.target.value }))}>
                <option value="final">Final</option>
                <option value="module">Module</option>
                <option value="lesson">Lesson</option>
              </select>
            </AdminFormField>
            <AdminFormField label="Status">
              <select className="field-input" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
            </AdminFormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <AdminFormField label="Pass Mark"><input className="field-input" type="number" value={form.pass_mark} onChange={(e) => setForm((f) => ({ ...f, pass_mark: e.target.value }))} /></AdminFormField>
            <AdminFormField label="Retry Limit"><input className="field-input" type="number" value={form.retry_limit} onChange={(e) => setForm((f) => ({ ...f, retry_limit: e.target.value }))} /></AdminFormField>
          </div>
          <button type="submit" className="btn-primary">Save Quiz</button>
        </form>
      </AdminModal>
    </div>
  );
}
