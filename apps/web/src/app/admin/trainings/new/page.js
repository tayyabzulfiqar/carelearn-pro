'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import api from '@/lib/api';
import { cmsPost } from '@/lib/admin/cmsApi';

const SOURCE_OPTIONS = [
  { value: 'blank', label: 'Create Blank Course', hint: 'Start with module and lesson structure from scratch.' },
  { value: 'manual', label: 'Paste Manual Content', hint: 'Add text and headings manually in builder blocks.' },
  { value: 'document', label: 'Upload PDF/DOCX Pack', hint: 'Upload source files and map manually to modules.' },
];

export default function NewTrainingWizardPage() {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [createdTrainingId, setCreatedTrainingId] = useState('');
  const [uploaded, setUploaded] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [source, setSource] = useState('blank');

  const [form, setForm] = useState({
    title: '',
    description: '',
    category: 'Mandatory Compliance',
    duration_minutes: 45,
    issue_certificate: true,
    tags: 'care, compliance',
    thumbnail_url: '',
  });

  const [thumbnailFile, setThumbnailFile] = useState(null);
  const [contentFiles, setContentFiles] = useState([]);

  const canContinueStep1 = useMemo(() => form.title.trim().length >= 3 && form.description.trim().length >= 20, [form]);

  async function uploadFile(file) {
    const payload = new FormData();
    payload.append('files', file);
    const response = await api.post('/upload/media', payload, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (event) => {
        if (!event.total) return;
        setUploadProgress(Math.round((event.loaded / event.total) * 100));
      },
    });
    const uploadedFile = response.data?.files?.[0];
    if (!uploadedFile) throw new Error('Upload response missing file payload.');
    return uploadedFile;
  }

  async function handleThumbnailUpload() {
    if (!thumbnailFile) return;
    const uploadedThumb = await uploadFile(thumbnailFile);
    setForm((prev) => ({ ...prev, thumbnail_url: uploadedThumb.url }));
  }

  async function handleCreateTraining() {
    if (!canContinueStep1) return;
    setError('');
    setSubmitting(true);
    try {
      if (thumbnailFile && !form.thumbnail_url) {
        await handleThumbnailUpload();
      }

      const payload = {
        title: form.title,
        description: form.description,
        category: form.category,
        duration_minutes: Number(form.duration_minutes || 45),
        status: 'draft',
        thumbnail_url: form.thumbnail_url || null,
        tags: form.tags.split(',').map((item) => item.trim()).filter(Boolean).concat([source]).slice(0, 10),
      };

      const response = await cmsPost('/trainings', payload);
      const training = response?.training || response?.data?.training;
      setCreatedTrainingId(training?.id || '');
      setStep(2);
    } catch (err) {
      setError(err?.response?.data?.error?.message || 'Unable to create training draft.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleContentUpload() {
    if (!contentFiles.length || !createdTrainingId) return;
    setUploading(true);
    setError('');
    try {
      const next = [];
      for (const file of contentFiles) {
        const uploadedFile = await uploadFile(file);
        await cmsPost('/media-assets', {
          file_name: uploadedFile.filename,
          storage_path: uploadedFile.url,
          mime_type: uploadedFile.mimeType || file.type,
          file_size_bytes: file.size,
          tags: ['training-source', source],
          metadata: { training_id: createdTrainingId, original_name: file.name },
        });
        next.push(uploadedFile);
      }
      setUploaded(next);
      setStep(3);
    } catch (err) {
      setError(err?.response?.data?.error?.message || 'One or more files failed to upload. Retry with validated files.');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }

  return (
    <div className="space-y-6">
      <header className="surface-card p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-600">Training Wizard</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Create Healthcare Training</h1>
        <p className="mt-2 text-sm text-slate-600">
          Publish structured healthcare learning in a controlled workflow with manual indexing, media support, and professional formatting.
        </p>
      </header>

      <section className="surface-card p-5">
        <div className="mb-4 flex gap-2 text-sm">
          {[1, 2, 3].map((n) => (
            <div key={n} className={`rounded-full px-3 py-1 ${step >= n ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-500'}`}>Step {n}</div>
          ))}
        </div>

        {step === 1 ? (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <input className="field-input" placeholder="Training title" value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />
              <input className="field-input" placeholder="Category (e.g. Infection Prevention)" value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))} />
              <textarea className="field-input md:col-span-2" rows={4} placeholder="Professional training description" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
              <input className="field-input" type="number" placeholder="Estimated duration" value={form.duration_minutes} onChange={(e) => setForm((p) => ({ ...p, duration_minutes: e.target.value }))} />
              <input className="field-input" placeholder="Tags (comma separated)" value={form.tags} onChange={(e) => setForm((p) => ({ ...p, tags: e.target.value }))} />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={form.issue_certificate} onChange={(e) => setForm((p) => ({ ...p, issue_certificate: e.target.checked }))} />
              Enable certificate on completion
            </label>
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="mb-2 text-sm font-semibold text-slate-900">Thumbnail Upload</p>
              <input type="file" accept="image/*" onChange={(e) => setThumbnailFile(e.target.files?.[0] || null)} />
              <p className="mt-2 text-xs text-slate-500">Upload an image file. URL entry is not required.</p>
            </div>
            <div className="flex justify-end gap-2">
              <Link href="/admin/trainings" className="btn-secondary">Cancel</Link>
              <button type="button" className="btn-primary" onClick={handleCreateTraining} disabled={!canContinueStep1 || submitting}>
                {submitting ? 'Creating...' : 'Save Draft & Continue'}
              </button>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              {SOURCE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setSource(option.value)}
                  className={`rounded-xl border p-4 text-left ${source === option.value ? 'border-sky-500 bg-sky-50' : 'border-slate-200'}`}
                >
                  <p className="text-sm font-semibold text-slate-900">{option.label}</p>
                  <p className="mt-1 text-xs text-slate-600">{option.hint}</p>
                </button>
              ))}
            </div>
            <div className="rounded-xl border-2 border-dashed border-slate-300 p-5">
              <p className="mb-2 text-sm font-semibold text-slate-900">Upload Source Files</p>
              <input
                type="file"
                multiple
                accept="image/*,video/*,.pdf,.doc,.docx"
                onChange={(e) => setContentFiles(Array.from(e.target.files || []))}
              />
              <p className="mt-2 text-xs text-slate-500">Supports image folders, PDF packs, video files, and DOCX sources. Admin controls final structure manually.</p>
              {contentFiles.length ? <p className="mt-2 text-xs text-slate-700">Selected: {contentFiles.length} file(s)</p> : null}
              {uploading ? (
                <div className="mt-3">
                  <div className="h-2 rounded bg-slate-200">
                    <div className="h-2 rounded bg-sky-600" style={{ width: `${uploadProgress}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">Uploading {uploadProgress}%</p>
                </div>
              ) : null}
            </div>
            <div className="flex justify-between">
              <button type="button" className="btn-secondary" onClick={() => setStep(1)}>Back</button>
              <button type="button" className="btn-primary" onClick={handleContentUpload} disabled={!contentFiles.length || uploading}>
                {uploading ? 'Uploading...' : 'Upload Files & Continue'}
              </button>
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-sm font-semibold text-emerald-800">Training Draft Ready</p>
              <p className="mt-1 text-xs text-emerald-700">Your training draft and media pack were saved. Proceed to module/lesson structuring in builder.</p>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="mb-2 text-sm font-semibold text-slate-900">Uploaded Assets</p>
              {uploaded.length ? (
                <ul className="space-y-1 text-xs text-slate-600">
                  {uploaded.map((item) => <li key={item.filename}>{item.originalName || item.filename}</li>)}
                </ul>
              ) : <p className="text-xs text-slate-500">No files uploaded in this step.</p>}
            </div>
            <div className="flex justify-end gap-2">
              <Link className="btn-secondary" href="/admin/media">Open Media Library</Link>
              <Link className="btn-primary" href="/admin/courses">Open Course Builder</Link>
            </div>
          </div>
        ) : null}

        {error ? <p className="mt-4 text-sm text-rose-700">{error}</p> : null}
      </section>
    </div>
  );
}
