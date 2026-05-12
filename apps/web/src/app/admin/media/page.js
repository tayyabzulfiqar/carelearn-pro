'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import AdminTable from '@/components/admin/AdminTable';
import { AdminErrorState, AdminLoadingState } from '@/components/admin/AdminStates';
import AdminFormField from '@/components/admin/AdminFormField';
import { cmsDelete, cmsGet, cmsPost } from '@/lib/admin/cmsApi';
import api from '@/lib/api';

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
  const [uploadFile, setUploadFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState('');
  const [lastUpload, setLastUpload] = useState(null);
  const [abortController, setAbortController] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [copied, setCopied] = useState('');

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

  const beginUpload = async () => {
    if (!uploadFile) return;
    const maxBytes = 100 * 1024 * 1024;
    const allowed = ['image/', 'video/', 'application/pdf'];
    if (!allowed.some((token) => (uploadFile.type || '').startsWith(token))) {
      setUploadError('Unsupported file type. Upload image, video, or PDF.');
      return;
    }
    if ((uploadFile.size || 0) > maxBytes) {
      setUploadError('File too large. Max size is 100MB.');
      return;
    }
    setUploadError('');
    setUploading(true);
    setUploadProgress(0);
    const controller = new AbortController();
    setAbortController(controller);
    try {
      const payload = new FormData();
      payload.append('images', uploadFile);
      const response = await api.post('/upload/images', payload, {
        headers: { 'Content-Type': 'multipart/form-data' },
        signal: controller.signal,
        onUploadProgress: (event) => {
          if (!event.total) return;
          setUploadProgress(Math.round((event.loaded / event.total) * 100));
        },
      });
      const first = response?.data?.images?.[0];
      if (first?.filename) {
        const next = {
          file_name: first.filename,
          storage_path: first.url,
          mime_type: uploadFile.type || '',
          file_size_bytes: uploadFile.size || 0,
          tags: [],
          metadata: {},
        };
        await cmsPost('/media-assets', next);
        setLastUpload(next);
      }
      await loadRows();
    } catch (err) {
      if (!axios.isCancel(err) && err.name !== 'CanceledError') {
        setUploadError('Upload failed. You can retry with the same file.');
      }
    } finally {
      setUploading(false);
      setAbortController(null);
    }
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
      <div className="surface-card space-y-3 p-4">
        <p className="text-sm font-semibold text-slate-900">Direct Upload</p>
        <div
          className={`rounded-xl border-2 border-dashed p-4 ${dragActive ? 'border-blue-500 bg-blue-50' : 'border-slate-300'}`}
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragActive(false);
            const file = e.dataTransfer.files?.[0];
            setUploadFile(file || null);
            setUploadError('');
            if (file?.type?.startsWith('image/')) setPreviewUrl(URL.createObjectURL(file));
          }}
        >
          <input
            type="file"
            accept="image/*,video/*,.pdf"
            onChange={(e) => {
              const file = e.target.files?.[0];
              setUploadFile(file || null);
              setUploadError('');
              if (file?.type?.startsWith('image/')) {
                setPreviewUrl(URL.createObjectURL(file));
              } else {
                setPreviewUrl('');
              }
            }}
          />
          <p className="mt-2 text-xs text-slate-500">Drag and drop supported. Max 100MB.</p>
        </div>
        {previewUrl ? <img src={previewUrl} alt="Media preview" className="max-h-48 rounded-lg border border-slate-200 object-contain" /> : null}
        {uploading ? (
          <div className="space-y-2">
            <div className="h-2 rounded bg-slate-200">
              <div className="h-2 rounded bg-blue-600 transition-all" style={{ width: `${uploadProgress}%` }} />
            </div>
            <p className="text-xs text-slate-500">Uploading {uploadProgress}%</p>
          </div>
        ) : null}
        {uploadError ? <p className="text-sm text-rose-600">{uploadError}</p> : null}
        {lastUpload ? <p className="text-xs text-emerald-700">Uploaded: {lastUpload.file_name}</p> : null}
        <div className="flex gap-2">
          <button type="button" className="btn-primary" disabled={!uploadFile || uploading} onClick={beginUpload}>Upload</button>
          <button type="button" className="btn-secondary" disabled={!uploadError || uploading} onClick={beginUpload}>Retry</button>
          <button type="button" className="btn-secondary" disabled={!uploading} onClick={() => abortController?.abort()}>Cancel Upload</button>
        </div>
      </div>

      <AdminTable
        columns={[
          { key: 'file_name', label: 'File' },
          { key: 'storage_path', label: 'Path' },
          { key: 'mime_type', label: 'Type' },
          { key: 'file_size_bytes', label: 'Size' },
          { key: 'tags', label: 'Tags', render: (row) => Array.isArray(row.tags) ? row.tags.join(', ') : '' },
          {
            key: 'actions',
            label: 'Actions',
            render: (row) => (
              <div className="flex gap-2">
                <button type="button" className="btn-secondary" onClick={() => { navigator.clipboard.writeText(row.storage_path); setCopied(row.id); setTimeout(() => setCopied(''), 1200); }}>{copied === row.id ? 'Copied' : 'Copy URL'}</button>
                <button type="button" className="btn-secondary" onClick={() => remove(row)}>Delete</button>
              </div>
            ),
          },
        ]}
        rows={rows}
      />
    </div>
  );
}
