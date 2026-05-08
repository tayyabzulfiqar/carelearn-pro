'use client';

import { useEffect, useState } from 'react';
import AdminTable from '@/components/admin/AdminTable';
import { AdminErrorState, AdminLoadingState } from '@/components/admin/AdminStates';
import AdminFormField from '@/components/admin/AdminFormField';
import { cmsDelete, cmsGet, cmsPost } from '@/lib/admin/cmsApi';

const EMPTY = {
  file_name: '',
  storage_path: '',
  mime_type: '',
  file_size_bytes: 0,
  tags: '',
};

export default function MediaPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(EMPTY);

  const loadRows = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await cmsGet('/media-assets');
      setRows(data?.assets || []);
    } catch (_err) {
      setError('Failed to load media assets.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadRows(); }, []);

  const addAsset = async (e) => {
    e.preventDefault();
    await cmsPost('/media-assets', {
      file_name: form.file_name,
      storage_path: form.storage_path,
      mime_type: form.mime_type,
      file_size_bytes: Number(form.file_size_bytes || 0),
      tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
      metadata: {},
    });
    setForm(EMPTY);
    await loadRows();
  };

  const remove = async (row) => {
    if (!window.confirm(`Delete media asset "${row.file_name}"?`)) return;
    await cmsDelete(`/media-assets/${row.id}`);
    await loadRows();
  };

  if (loading) return <AdminLoadingState title="Loading media library..." />;
  if (error) return <AdminErrorState message={error} onRetry={loadRows} />;

  return (
    <div className="space-y-4">
      <form className="surface-card grid gap-3 p-4 md:grid-cols-2" onSubmit={addAsset}>
        <AdminFormField label="File Name"><input className="field-input" value={form.file_name} onChange={(e) => setForm((f) => ({ ...f, file_name: e.target.value }))} required /></AdminFormField>
        <AdminFormField label="Storage Path"><input className="field-input" value={form.storage_path} onChange={(e) => setForm((f) => ({ ...f, storage_path: e.target.value }))} required /></AdminFormField>
        <AdminFormField label="MIME Type"><input className="field-input" value={form.mime_type} onChange={(e) => setForm((f) => ({ ...f, mime_type: e.target.value }))} /></AdminFormField>
        <AdminFormField label="File Size Bytes"><input className="field-input" type="number" value={form.file_size_bytes} onChange={(e) => setForm((f) => ({ ...f, file_size_bytes: e.target.value }))} /></AdminFormField>
        <AdminFormField label="Tags"><input className="field-input" value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} placeholder="image, onboarding" /></AdminFormField>
        <div className="flex items-end"><button type="submit" className="btn-primary">Register Asset</button></div>
      </form>

      <AdminTable
        columns={[
          { key: 'file_name', label: 'File' },
          { key: 'storage_path', label: 'Path' },
          { key: 'mime_type', label: 'Type' },
          { key: 'file_size_bytes', label: 'Size' },
          { key: 'tags', label: 'Tags', render: (row) => Array.isArray(row.tags) ? row.tags.join(', ') : '' },
          { key: 'actions', label: 'Actions', render: (row) => <button type="button" className="btn-secondary" onClick={() => remove(row)}>Delete</button> },
        ]}
        rows={rows}
      />
    </div>
  );
}