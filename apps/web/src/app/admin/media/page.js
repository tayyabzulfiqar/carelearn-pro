'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import AdminTable from '@/components/admin/AdminTable';
import { AdminErrorState, AdminLoadingState } from '@/components/admin/AdminStates';
import { cmsDelete, cmsGet } from '@/lib/admin/cmsApi';
import api from '@/lib/api';

export default function MediaPage() {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
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
      payload.append('files', uploadFile);
      const response = await api.post('/upload/media', payload, {
        headers: { 'Content-Type': 'multipart/form-data' },
        signal: controller.signal,
        onUploadProgress: (event) => {
          if (!event.total) return;
          setUploadProgress(Math.round((event.loaded / event.total) * 100));
        },
      });
      const first = response?.data?.files?.[0];
      const firstAsset = response?.data?.assets?.[0];
      if (first?.filename) {
        setLastUpload({
          file_name: firstAsset?.file_name || first.filename,
          storage_path: firstAsset?.storage_path || first.url,
        });
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

  const filteredRows = rows.filter((row) => {
    const hay = `${row.file_name || ''} ${row.mime_type || ''} ${(row.tags || []).join(' ')}`.toLowerCase();
    return hay.includes(search.toLowerCase());
  });

  return (
    <div className="space-y-4">
      <section className="surface-card p-5">
        <h1 className="text-xl font-semibold text-slate-900">Media Library</h1>
        <p className="mt-1 text-sm text-slate-600">Store and reuse compliant training assets including images, PDFs, and videos.</p>
      </section>

      {/* Bulk image matching guidance */}
      <section className="surface-card p-4 border-l-4 border-indigo-400 bg-indigo-50">
        <p className="text-sm font-semibold text-indigo-900 mb-1">Bulk Image Upload for Structured Courses</p>
        <p className="text-sm text-indigo-800">
          To match and upload images for a structured import course, open the course in Studio and use the
          <strong> 3-File Import panel &rarr; Section D (Image Status)</strong>. Images are matched to
          lessons automatically by filename (e.g. IMG_101.webp).
        </p>
        <a
          href="/admin/trainings"
          className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-700 hover:text-indigo-900"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          Go to Training Catalogue
        </a>
      </section>

      <section className="surface-card p-4">
        <input className="field-input" placeholder="Search assets by name, type, or tag" value={search} onChange={(e) => setSearch(e.target.value)} />
      </section>

      {/* Direct Upload — single file upload to media library */}
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
          <p className="mt-2 text-xs text-slate-500">Drag and drop supported. Max 100MB. Images, videos, and PDFs accepted.</p>
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
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    navigator.clipboard.writeText(row.storage_path);
                    setCopied(row.id);
                    setTimeout(() => setCopied(''), 1200);
                  }}
                >
                  {copied === row.id ? 'Copied' : 'Copy URL'}
                </button>
                <button type="button" className="btn-secondary" onClick={() => remove(row)}>Delete</button>
              </div>
            ),
          },
        ]}
        rows={filteredRows}
      />
      {!filteredRows.length ? (
        <div className="surface-card p-6 text-sm text-slate-500">No media assets match your search. Upload new files or adjust filters.</div>
      ) : null}
    </div>
  );
}
