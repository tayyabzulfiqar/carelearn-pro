'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AdminTable from '@/components/admin/AdminTable';
import { AdminErrorState, AdminLoadingState } from '@/components/admin/AdminStates';
import { AdminModal } from '@/components/admin/AdminOverlays';
import AdminFilterBar from '@/components/admin/AdminFilterBar';
import AdminFormField from '@/components/admin/AdminFormField';
import { cmsDelete, cmsGet, cmsPost, cmsPut } from '@/lib/admin/cmsApi';

const EMPTY_FORM = {
  id: '',
  title: '',
  description: '',
  category: 'general',
  tags: '',
  thumbnail_url: '',
  duration_minutes: 30,
  pass_mark: 75,
  status: 'draft',
};

export default function TrainingsPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [previewRow, setPreviewRow] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await cmsGet('/trainings', {
        params: {
          q: search || undefined,
          status: status || undefined,
          sort: 'updated_desc',
        },
      });
      setRows(data?.trainings || []);
    } catch (_err) {
      setError('Unable to load trainings.');
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const filters = useMemo(() => ([
    {
      key: 'status',
      value: status,
      onChange: setStatus,
      options: [
        { label: 'All statuses', value: '' },
        { label: 'Draft', value: 'draft' },
        { label: 'Published', value: 'published' },
        { label: 'Archived', value: 'archived' },
      ],
    },
  ]), [status]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setOpen(true);
  };

  const openEdit = (row) => {
    setForm({
      ...EMPTY_FORM,
      ...row,
      tags: Array.isArray(row.tags) ? row.tags.join(', ') : '',
    });
    setOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        title: form.title,
        description: form.description,
        category: form.category,
        tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
        thumbnail_url: form.thumbnail_url || null,
        duration_minutes: Number(form.duration_minutes || 30),
        pass_mark: Number(form.pass_mark || 75),
        status: form.status,
      };

      if (form.id) {
        await cmsPut(`/trainings/${form.id}`, payload);
      } else {
        await cmsPost('/trainings', payload);
      }

      setOpen(false);
      await loadRows();
    } catch (_err) {
      setError('Failed to save training.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row) => {
    if (!window.confirm(`Delete training "${row.title}"?`)) return;
    try {
      await cmsDelete(`/trainings/${row.id}`);
      await loadRows();
    } catch (_err) {
      setError('Failed to delete training.');
    }
  };

  const applyFilters = async () => {
    await loadRows();
  };

  const duplicateTraining = async (row) => {
    const payload = {
      ...row,
      title: `${row.title} (Copy)`,
      status: 'draft',
      tags: Array.isArray(row.tags) ? row.tags : [],
    };
    delete payload.id;
    await cmsPost('/trainings', payload);
    await loadRows();
  };

  const togglePublish = async (row) => {
    if (row.status === 'published') {
      await cmsPost(`/trainings/${row.id}/status`, { status: 'draft' });
      await loadRows();
      return;
    }
    await cmsPost(`/trainings/${row.id}/publish`, {});
    await loadRows();
  };

  const openPreview = async (row) => {
    setPreviewOpen(true);
    setPreviewRow(row);
    setPreviewError('');
    setPreviewBusy(true);
    try {
      let preview;
      try {
        const loaded = await cmsPost(`/trainings/${row.id}/preview/load-latest`, {});
        preview = loaded?.preview;
      } catch (_err) {
        const got = await cmsGet(`/trainings/${row.id}/preview`);
        preview = got?.preview;
      }
      setPreviewData(preview || null);
    } catch (_err) {
      setPreviewError('Unable to load deterministic preview payload.');
      setPreviewData(null);
    } finally {
      setPreviewBusy(false);
    }
  };

  const setApproval = async (action) => {
    if (!previewRow?.id) return;
    setPreviewBusy(true);
    setPreviewError('');
    try {
      const result = await cmsPost(`/trainings/${previewRow.id}/approval`, { action });
      setPreviewData(result?.preview || null);
      await loadRows();
    } catch (_err) {
      setPreviewError('Approval action failed.');
    } finally {
      setPreviewBusy(false);
    }
  };

  const paginatedRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));

  const bulkArchiveDrafts = async () => {
    const draftRows = rows.filter((row) => row.status === 'draft');
    if (!draftRows.length) return;
    setBulkBusy(true);
    try {
      await Promise.all(draftRows.map((row) => cmsPut(`/trainings/${row.id}`, { ...row, status: 'archived' })));
      await loadRows();
    } finally {
      setBulkBusy(false);
    }
  };

  if (loading) return <AdminLoadingState title="Loading training management..." />;
  if (error && !rows.length) return <AdminErrorState message={error} onRetry={loadRows} />;

  return (
    <div className="space-y-4">
      <section className="surface-card p-5">
        <h1 className="text-xl font-semibold text-slate-900">Training Catalogue</h1>
        <p className="mt-1 text-sm text-slate-600">
          Manage healthcare training drafts, publication state, and learner-ready course availability.
        </p>
      </section>
      <AdminFilterBar
        search={search}
        onSearchChange={setSearch}
        filters={filters}
        actions={(
          <>
            <button type="button" className="btn-secondary" onClick={applyFilters}>Apply</button>
            <button type="button" className="btn-secondary" disabled={bulkBusy} onClick={bulkArchiveDrafts}>{bulkBusy ? 'Archiving...' : 'Archive Drafts'}</button>
            <button type="button" className="btn-secondary" onClick={openCreate}>Quick Create</button>
          </>
        )}
      />

      <AdminTable
        columns={[
          { key: 'title', label: 'Title' },
          { key: 'category', label: 'Category' },
          { key: 'status', label: 'Status' },
          { key: 'duration_minutes', label: 'Duration' },
          {
            key: 'actions',
            label: 'Actions',
            render: (row) => (
              <div className="flex gap-2">
                <button type="button" className="btn-secondary" onClick={() => openEdit(row)}>Edit</button>
                <button type="button" className="btn-secondary" onClick={() => openPreview(row)}>Preview</button>
                <a className="btn-secondary" href={`/dashboard/courses/${row.id}/player`} target="_blank" rel="noreferrer">Preview</a>
                <button type="button" className="btn-secondary" onClick={() => duplicateTraining(row)}>Duplicate</button>
                <button type="button" className="btn-secondary" onClick={() => togglePublish(row)}>{row.status === 'published' ? 'Unpublish' : 'Publish'}</button>
                <button type="button" className="btn-secondary" onClick={() => remove(row)}>Delete</button>
              </div>
            ),
          },
        ]}
        rows={paginatedRows}
      />
      <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
        <p>Page {page} of {totalPages}</p>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <button type="button" className="btn-secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      </div>

      <AdminModal open={open} title={form.id ? 'Edit Training' : 'Create Training'} onClose={() => setOpen(false)}>
        <form className="space-y-3" onSubmit={submit}>
          <AdminFormField label="Title"><input className="field-input" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required /></AdminFormField>
          <AdminFormField label="Description"><textarea className="field-input" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={3} /></AdminFormField>
          <div className="grid grid-cols-2 gap-3">
            <AdminFormField label="Category"><input className="field-input" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} /></AdminFormField>
            <AdminFormField label="Status">
              <select className="field-input" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
            </AdminFormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <AdminFormField label="Duration (min)"><input className="field-input" type="number" value={form.duration_minutes} onChange={(e) => setForm((f) => ({ ...f, duration_minutes: e.target.value }))} /></AdminFormField>
            <AdminFormField label="Pass Mark"><input className="field-input" type="number" value={form.pass_mark} onChange={(e) => setForm((f) => ({ ...f, pass_mark: e.target.value }))} /></AdminFormField>
          </div>
          <AdminFormField label="Tags (comma separated)"><input className="field-input" value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} /></AdminFormField>
          <AdminFormField label="Thumbnail URL"><input className="field-input" value={form.thumbnail_url} onChange={(e) => setForm((f) => ({ ...f, thumbnail_url: e.target.value }))} /></AdminFormField>
          {form.thumbnail_url ? (
            <img src={form.thumbnail_url} alt="Thumbnail preview" className="h-32 w-full rounded-lg border border-slate-200 object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          ) : null}
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save Training'}</button>
        </form>
      </AdminModal>

      <AdminModal open={previewOpen} title={previewRow ? `Deterministic Preview: ${previewRow.title}` : 'Deterministic Preview'} onClose={() => setPreviewOpen(false)}>
        {previewBusy ? <p className="text-sm text-slate-500">Loading preview...</p> : null}
        {previewError ? <p className="text-sm text-rose-600">{previewError}</p> : null}
        {!previewBusy && !previewError && previewData ? (
          <div className="space-y-3 text-sm">
            <p><span className="font-semibold">State:</span> {previewData.state}</p>
            <p><span className="font-semibold">Sections:</span> {previewData.canonical?.sections?.length || 0}</p>
            <p><span className="font-semibold">Images:</span> {Object.keys(previewData.image_manifest || {}).length}</p>
            <div className="max-h-64 overflow-auto rounded border border-slate-200 bg-slate-50 p-3 font-mono text-xs whitespace-pre-wrap">
              {previewData.render?.html || ''}
            </div>
            <div className="flex gap-2">
              <button type="button" className="btn-secondary" onClick={() => setApproval('approved')}>Approve</button>
              <button type="button" className="btn-secondary" onClick={() => setApproval('rejected')}>Reject</button>
            </div>
          </div>
        ) : null}
      </AdminModal>
    </div>
  );
}
