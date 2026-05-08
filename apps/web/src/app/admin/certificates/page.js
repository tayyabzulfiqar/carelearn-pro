'use client';

import { useEffect, useState } from 'react';
import AdminTable from '@/components/admin/AdminTable';
import { AdminErrorState, AdminLoadingState } from '@/components/admin/AdminStates';
import { AdminModal } from '@/components/admin/AdminOverlays';
import AdminFormField from '@/components/admin/AdminFormField';
import { cmsGet, cmsPost, cmsPut, cmsDelete } from '@/lib/admin/cmsApi';

const EMPTY = {
  id: '',
  name: '',
  template_type: 'completion',
  template_data: '{"layout":"default"}',
  status: 'active',
  is_default: false,
};

export default function CertificatesAdminPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const loadRows = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await cmsGet('/certificate-templates');
      setRows(data?.templates || []);
    } catch (_err) {
      setError('Failed to load certificate templates.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadRows(); }, []);

  const save = async (e) => {
    e.preventDefault();
    const payload = {
      name: form.name,
      template_type: form.template_type,
      template_data: JSON.parse(form.template_data || '{}'),
      status: form.status,
      is_default: !!form.is_default,
    };
    if (form.id) {
      await cmsPut(`/certificate-templates/${form.id}`, payload);
    } else {
      await cmsPost('/certificate-templates', payload);
    }
    setOpen(false);
    setForm(EMPTY);
    await loadRows();
  };

  const remove = async (row) => {
    if (!window.confirm(`Delete template "${row.name}"?`)) return;
    await cmsDelete(`/certificate-templates/${row.id}`);
    await loadRows();
  };

  if (loading) return <AdminLoadingState title="Loading certificate templates..." />;
  if (error) return <AdminErrorState message={error} onRetry={loadRows} />;

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <button type="button" className="btn-primary" onClick={() => { setForm(EMPTY); setOpen(true); }}>New Template</button>
      </div>
      <AdminTable
        columns={[
          { key: 'name', label: 'Template' },
          { key: 'template_type', label: 'Type' },
          { key: 'status', label: 'Status' },
          { key: 'is_default', label: 'Default', render: (row) => (row.is_default ? 'Yes' : 'No') },
          {
            key: 'actions',
            label: 'Actions',
            render: (row) => (
              <div className="flex gap-2">
                <button type="button" className="btn-secondary" onClick={() => { setForm({ ...row, template_data: JSON.stringify(row.template_data || {}, null, 2) }); setOpen(true); }}>Edit</button>
                <button type="button" className="btn-secondary" onClick={() => remove(row)}>Delete</button>
              </div>
            ),
          },
        ]}
        rows={rows}
      />

      <AdminModal open={open} title={form.id ? 'Edit Template' : 'Create Template'} onClose={() => setOpen(false)}>
        <form className="space-y-3" onSubmit={save}>
          <AdminFormField label="Name"><input className="field-input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required /></AdminFormField>
          <AdminFormField label="Type"><input className="field-input" value={form.template_type} onChange={(e) => setForm((f) => ({ ...f, template_type: e.target.value }))} /></AdminFormField>
          <AdminFormField label="Template JSON"><textarea className="field-input" rows={6} value={form.template_data} onChange={(e) => setForm((f) => ({ ...f, template_data: e.target.value }))} /></AdminFormField>
          <AdminFormField label="Status">
            <select className="field-input" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          </AdminFormField>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!form.is_default} onChange={(e) => setForm((f) => ({ ...f, is_default: e.target.checked }))} /> Set as default</label>
          <button type="submit" className="btn-primary">Save Template</button>
        </form>
      </AdminModal>
    </div>
  );
}