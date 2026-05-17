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
  const [diagnostics, setDiagnostics] = useState(null);
  const [diagBusy, setDiagBusy] = useState(false);
  const [rowBusy, setRowBusy] = useState({});
  const [rowMenuOpen, setRowMenuOpen] = useState('');
  const [notice, setNotice] = useState('');
  const [formError, setFormError] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const toErrorText = (err, fallback) => {
    const payload = err?.response?.data || {};
    const rawError = payload?.error;
    const code = typeof rawError === 'string' ? rawError : (payload?.code || '');
    const message = typeof rawError === 'string'
      ? (payload?.message || rawError)
      : (payload?.message || fallback);
    return code ? `${message} (${code})` : message;
  };

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
      setPage(1);
    } catch (_err) {
      setError('Unable to load trainings.');
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const loadDiagnostics = useCallback(async () => {
    setDiagBusy(true);
    try {
      const data = await cmsGet('/ingestion/diagnostics');
      setDiagnostics(data?.diagnostics || null);
    } catch (_err) {
      setDiagnostics(null);
    } finally {
      setDiagBusy(false);
    }
  }, []);

  // Diagnostics require org tenant context — only load on explicit Refresh click
  // useEffect(() => { loadDiagnostics(); }, [loadDiagnostics]);

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
    setFormError('');
    setOpen(true);
  };

  const openEdit = (row) => {
    setForm({
      ...EMPTY_FORM,
      ...row,
      tags: Array.isArray(row.tags) ? row.tags.join(', ') : '',
    });
    setFormError('');
    setOpen(true);
  };

  const markRowBusy = (id, busy) => {
    setRowBusy((prev) => ({ ...prev, [id]: busy }));
  };

  const closeRowMenu = () => setRowMenuOpen('');

  const validateForm = () => {
    if (!String(form.title || '').trim()) return 'Title is required.';
    const duration = Number(form.duration_minutes || 0);
    if (!Number.isFinite(duration) || duration <= 0) return 'Duration must be greater than 0.';
    const passMark = Number(form.pass_mark || 0);
    if (!Number.isFinite(passMark) || passMark < 0 || passMark > 100) return 'Pass mark must be between 0 and 100.';
    return '';
  };

  const submit = async (e) => {
    e.preventDefault();
    setFormError('');
    const validationMessage = validateForm();
    if (validationMessage) {
      setFormError(validationMessage);
      return;
    }
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
        setNotice('Training updated.');
      } else {
        await cmsPost('/trainings', payload);
        setNotice('Training created.');
      }

      setOpen(false);
      await loadRows();
    } catch (_err) {
      setFormError(toErrorText(_err, 'Failed to save training.'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row) => {
    if (!window.confirm(`Delete training "${row.title}"?`)) return;
    closeRowMenu();
    markRowBusy(row.id, true);
    try {
      await cmsDelete(`/trainings/${row.id}`);
      await loadRows();
      setNotice('Training deleted.');
    } catch (_err) {
      setError(toErrorText(_err, 'Failed to delete training.'));
    } finally {
      markRowBusy(row.id, false);
    }
  };

  const applyFilters = async () => {
    await loadRows();
  };

  const duplicateTraining = async (row) => {
    closeRowMenu();
    markRowBusy(row.id, true);
    const payload = {
      ...row,
      title: `${row.title} (Copy)`,
      status: 'draft',
      tags: Array.isArray(row.tags) ? row.tags : [],
    };
    delete payload.id;
    try {
      await cmsPost('/trainings', payload);
      await loadRows();
      setNotice('Training duplicated to draft.');
    } catch (_err) {
      setError(toErrorText(_err, 'Failed to duplicate training.'));
    } finally {
      markRowBusy(row.id, false);
    }
  };

  const togglePublish = async (row) => {
    closeRowMenu();
    markRowBusy(row.id, true);
    try {
      if (row.status === 'published') {
        await cmsPost(`/trainings/${row.id}/status`, { status: 'draft' });
        setNotice('Training moved back to draft.');
        await loadRows();
        return;
      }
      await cmsPost(`/trainings/${row.id}/publish`, {});
      setNotice('Training published.');
      await loadRows();
    } catch (_err) {
      setError(toErrorText(_err, row.status === 'published' ? 'Failed to unpublish training.' : 'Failed to publish training.'));
    } finally {
      markRowBusy(row.id, false);
    }
  };

  const archiveTraining = async (row) => {
    closeRowMenu();
    markRowBusy(row.id, true);
    try {
      await cmsPost(`/trainings/${row.id}/status`, { status: 'archived' });
      setNotice('Training archived.');
      await loadRows();
    } catch (_err) {
      setError(toErrorText(_err, 'Failed to archive training.'));
    } finally {
      markRowBusy(row.id, false);
    }
  };

  const openPreview = async (row) => {
    closeRowMenu();
    setPreviewOpen(true);
    setPreviewRow(row);
    setPreviewError('');
    setPreviewBusy(true);
    try {
      let preview;
      try {
        const got = await cmsGet(`/trainings/${row.id}/preview`);
        preview = got?.preview;
      } catch (_err) {
        const loaded = await cmsPost(`/trainings/${row.id}/preview/load-latest`, {});
        preview = loaded?.preview;
      }
      setPreviewData(preview || null);
    } catch (err) {
      setPreviewError(toErrorText(err, 'Unable to load deterministic preview payload.'));
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
      setNotice(action === 'approved' ? 'Preview approved.' : 'Preview rejected.');
      await loadRows();
    } catch (err) {
      setPreviewError(toErrorText(err, 'Approval action failed.'));
    } finally {
      setPreviewBusy(false);
    }
  };

  const approveAndPublish = async () => {
    if (!previewRow?.id) return;
    setPreviewBusy(true);
    setPreviewError('');
    try {
      await cmsPost(`/trainings/${previewRow.id}/approval`, { action: 'approved' });
      await cmsPost(`/trainings/${previewRow.id}/publish`, {});
      const refreshed = await cmsGet(`/trainings/${previewRow.id}/preview`);
      setPreviewData(refreshed?.preview || null);
      setNotice('Preview approved and training published.');
      await loadRows();
    } catch (err) {
      setPreviewError(toErrorText(err, 'Approve + publish failed.'));
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
        {notice ? (
          <p className="mt-2 text-sm text-emerald-700" role="status">{notice}</p>
        ) : null}
        {error ? (
          <p className="mt-2 text-sm text-rose-700" role="alert">{error}</p>
        ) : null}
      </section>
      <section className="surface-card p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Ingestion Diagnostics</h2>
          <button type="button" className="btn-secondary" disabled={diagBusy} onClick={loadDiagnostics}>{diagBusy ? 'Refreshing...' : 'Refresh'}</button>
        </div>
        <p className="mt-2 text-xs text-slate-600">
          Success: {diagnostics?.counters?.succeeded || 0} | Failed: {diagnostics?.counters?.failed || 0} | Total: {diagnostics?.counters?.total || 0}
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
          {
            key: 'title',
            label: 'Training',
            render: (row) => (
              <div className="flex items-center gap-3 py-1">
                <div className="h-12 w-12 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                  {row.thumbnail_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={row.thumbnail_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-[10px] font-semibold text-slate-400">No Img</div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{row.title}</p>
                  <p className="truncate text-xs text-slate-500">{row.description || 'No description yet'}</p>
                </div>
              </div>
            ),
          },
          { key: 'category', label: 'Category' },
          {
            key: 'status',
            label: 'Status',
            render: (row) => (
              <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                row.status === 'published'
                  ? 'bg-emerald-100 text-emerald-700'
                  : row.status === 'archived'
                    ? 'bg-slate-200 text-slate-700'
                    : 'bg-amber-100 text-amber-700'
              }`}>{row.status}</span>
            ),
          },
          { key: 'duration_minutes', label: 'Duration' },
          {
            key: 'actions',
            label: 'Actions',
            render: (row) => (
              <div className="flex items-center gap-2">
                <a className="btn-primary" href={`/admin/trainings/${row.id}/studio`}>Open Studio</a>
                <div className="relative">
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={!!rowBusy[row.id]}
                    onClick={() => setRowMenuOpen((prev) => prev === row.id ? '' : row.id)}
                  >
                    Actions
                  </button>
                  {rowMenuOpen === row.id ? (
                    <div className="absolute right-0 z-20 mt-2 w-48 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                      <button type="button" className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => openEdit(row)}>Edit</button>
                      <button type="button" className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => togglePublish(row)}>{row.status === 'published' ? 'Unpublish' : 'Publish'}</button>
                      <button type="button" className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => openPreview(row)}>Preview</button>
                      <a className="block rounded-lg px-3 py-2 text-sm hover:bg-slate-50" href={`/dashboard/courses/${row.id}/player`} target="_blank" rel="noreferrer" onClick={closeRowMenu}>Learner View</a>
                      <button type="button" className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => duplicateTraining(row)}>Duplicate</button>
                      <button type="button" className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => archiveTraining(row)}>Archive</button>
                      <button type="button" className="w-full rounded-lg px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50" onClick={() => remove(row)}>Delete</button>
                    </div>
                  ) : null}
                </div>
                {rowBusy[row.id] ? <span className="text-xs text-slate-500">Working...</span> : null}
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
          {formError ? <p className="text-sm text-rose-600" role="alert">{formError}</p> : null}
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

      <AdminModal open={previewOpen} title={previewRow ? `Preview: ${previewRow.title}` : 'Preview'} onClose={() => setPreviewOpen(false)}>
        {previewBusy ? <p className="text-sm text-slate-500">Loading preview...</p> : null}
        {previewError ? <p className="text-sm text-rose-600">{previewError}</p> : null}
        {!previewBusy && !previewError && previewData ? (
          <div className="space-y-3 text-sm">
            <p><span className="font-semibold">State:</span> {previewData.state}</p>
            <p><span className="font-semibold">Sections:</span> {previewData.canonical?.sections?.length || 0}</p>
            <p><span className="font-semibold">Images:</span> {Object.keys(previewData.image_manifest || {}).length}</p>
            <div className="max-h-72 overflow-auto rounded-xl border border-slate-200 bg-white p-4">
              <div className="prose prose-sm max-w-none text-slate-700" dangerouslySetInnerHTML={{ __html: previewData.render?.html || '<p>No preview content yet.</p>' }} />
            </div>
            <div className="flex gap-2">
              <button type="button" className="btn-secondary" onClick={() => openPreview(previewRow)}>Refresh Preview</button>
              <button type="button" className="btn-secondary" onClick={() => setApproval('approved')}>Approve</button>
              <button type="button" className="btn-primary" onClick={approveAndPublish}>Publish</button>
            </div>
          </div>
        ) : null}
      </AdminModal>
    </div>
  );
}
