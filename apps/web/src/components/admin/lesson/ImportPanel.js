'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';

const INITIAL_STATE = {
  phase: 'input',           // input | parsed | assembling | assembled | images
  file1: '',
  file2: '',
  parsing: false,
  parseResult: null,
  parseError: '',
  importJobId: null,
  assembling: false,
  assembleResult: null,
  assembleError: '',
  imageStatus: null,
  imageStatusLoading: false,
  uploading: false,
  uploadResult: null,
  resetConfirm: '',
  resetLoading: false,
  resetResult: null,
  resetError: '',
};

export default function ImportPanel({ courseId, orgId, onMappingsResolved }) {
  const router = useRouter();
  const [state, setState] = useState(INITIAL_STATE);
  const file1InputRef = useRef(null);
  const file2InputRef = useRef(null);
  const imageInputRef = useRef(null);

  const set = (patch) => setState(prev => ({ ...prev, ...patch }));

  const readFileAsText = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsText(file);
  });

  const loadFile1 = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    set({ file1: await readFileAsText(file) });
  };

  const loadFile2 = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    set({ file2: await readFileAsText(file) });
  };

  const parseAndValidate = async () => {
    if (!state.file1.trim() || !state.file2.trim()) {
      set({ parseError: 'Both FILE 1 (Content File) and FILE 2 (Mapping File) are required.' });
      return;
    }
    set({ parsing: true, parseError: '', parseResult: null });
    try {
      const res = await api.post('/admin/cms/import/parse', {
        courseId,
        file1Content: state.file1,
        file2Content: state.file2,
      });
      const data = res.data?.data || res.data;
      set({ parsing: false, parseResult: data, importJobId: data.importJobId, phase: 'parsed' });
    } catch (err) {
      const msg = err?.response?.data?.error?.message || err?.message || 'Parse failed';
      set({ parsing: false, parseError: msg });
    }
  };

  const assembleImport = async () => {
    set({ assembling: true, assembleError: '' });
    try {
      const res = await api.post('/admin/cms/import/assemble', { importJobId: state.importJobId });
      const data = res.data?.data || res.data;
      set({ assembling: false, assembleResult: data, phase: 'assembled' });
      // Clear any localStorage keys for this course so learner player re-fetches fresh state
      if (typeof window !== 'undefined') {
        Object.keys(localStorage).forEach(key => {
          if (key.includes(courseId)) localStorage.removeItem(key);
        });
      }
      router.refresh();
      // Auto-load image status
      loadImageStatus(courseId);
    } catch (err) {
      const msg = err?.response?.data?.error?.message || err?.message || 'Assembly failed';
      set({ assembling: false, assembleError: msg });
    }
  };

  const loadImageStatus = useCallback(async (cId) => {
    set({ imageStatusLoading: true });
    try {
      const res = await api.get(`/admin/cms/import/images/status?courseId=${cId}`);
      const data = res.data?.data || res.data;
      set({ imageStatus: data, imageStatusLoading: false, phase: 'images' });
      if (typeof onMappingsResolved === 'function') {
        onMappingsResolved(data);
      }
    } catch (_err) {
      set({ imageStatusLoading: false });
    }
  }, [onMappingsResolved]);

  const bulkUploadImages = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    set({ uploading: true, uploadResult: null });
    try {
      const formData = new FormData();
      formData.append('courseId', courseId);
      files.forEach(f => formData.append('images[]', f));
      const res = await api.post('/admin/cms/import/images/match', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const data = res.data?.data || res.data;
      set({ uploading: false, uploadResult: data });
      loadImageStatus(courseId);
    } catch (err) {
      set({ uploading: false, uploadResult: { error: err?.response?.data?.error?.message || err?.message } });
    }
    e.target.value = '';
  };

  const reset = () => setState(INITIAL_STATE);

  const handleReset = async () => {
    if (state.resetConfirm !== 'RESET') return;
    set({ resetLoading: true, resetError: '', resetResult: null });
    try {
      const res = await api.post('/admin/cms/import/reset', {
        courseId,
        confirm: 'RESET_STRUCTURED_IMPORT',
      });
      const data = res.data?.data || res.data;
      set({ resetLoading: false, resetResult: data, resetConfirm: '' });
      reset();
    } catch (err) {
      const msg = err?.response?.data?.error?.message || err?.message || 'Reset failed';
      set({ resetLoading: false, resetError: msg });
    }
  };

  const { phase, file1, file2, parsing, parseResult, parseError, assembling, assembleResult, assembleError, imageStatus, imageStatusLoading, uploading, uploadResult, resetConfirm, resetLoading, resetResult, resetError } = state;

  const hasExistingImport = phase === 'assembled' || phase === 'images' || !!assembleResult;

  return (
    <div className="space-y-4">
      {/* SECTION A — File Upload */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Section A — Content & Mapping Files</p>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-semibold text-slate-600">FILE 1 — Content File</label>
            <label className="text-xs text-indigo-600 cursor-pointer hover:text-indigo-800">
              Load from file
              <input ref={file1InputRef} type="file" accept=".txt,.md" className="hidden" onChange={loadFile1} />
            </label>
          </div>
          <textarea
            value={file1}
            onChange={e => set({ file1: e.target.value })}
            placeholder="Paste FILE 1 content here... (block-tagged course content)"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-mono text-slate-700 outline-none focus:ring-2 focus:ring-indigo-300 resize-none min-h-[100px]"
            rows={6}
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-semibold text-slate-600">FILE 2 — Image Mapping File</label>
            <label className="text-xs text-indigo-600 cursor-pointer hover:text-indigo-800">
              Load from file
              <input ref={file2InputRef} type="file" accept=".txt,.md" className="hidden" onChange={loadFile2} />
            </label>
          </div>
          <textarea
            value={file2}
            onChange={e => set({ file2: e.target.value })}
            placeholder="Paste FILE 2 content here... (IMAGE_ID: IMG_101, POSITION: full_width, ...)"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-mono text-slate-700 outline-none focus:ring-2 focus:ring-indigo-300 resize-none min-h-[80px]"
            rows={4}
          />
        </div>

        {parseError && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{parseError}</div>
        )}

        <button
          type="button"
          disabled={parsing}
          onClick={parseAndValidate}
          className="w-full rounded-lg bg-indigo-600 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
        >
          {parsing ? <><span className="animate-spin">↻</span> Parsing & Validating…</> : 'Parse & Validate'}
        </button>
      </div>

      {/* SECTION B — Parse Results */}
      {phase !== 'input' && parseResult && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Section B — Parse Results</p>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: 'Modules', value: parseResult.stats?.moduleCount ?? 0 },
              { label: 'Lessons', value: parseResult.stats?.lessonCount ?? 0 },
              { label: 'Blocks', value: parseResult.stats?.blockCount ?? 0 },
              { label: 'Image Slots', value: parseResult.stats?.imageSlotCount ?? 0 },
            ].map(s => (
              <div key={s.label} className="rounded-lg border border-slate-100 bg-slate-50 p-2 text-center">
                <p className="text-lg font-bold text-slate-900">{s.value}</p>
                <p className="text-[10px] text-slate-400">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Publish status */}
          {parseResult.canPublish ? (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2">
              <span className="text-emerald-600">✓</span>
              <p className="text-xs font-semibold text-emerald-800">Validation passed — ready to assemble</p>
            </div>
          ) : (
            <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2">
              <p className="text-xs font-semibold text-rose-800 mb-1">✕ Validation failed — fix errors before assembling</p>
              {(parseResult.validationErrors || []).map((e, i) => (
                <p key={i} className="text-xs text-rose-700 ml-3">• {e.detail || JSON.stringify(e)}</p>
              ))}
            </div>
          )}

          {/* Warnings */}
          {(parseResult.warnings || []).length > 0 && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
              <p className="text-xs font-semibold text-amber-800 mb-1">⚠ {parseResult.warnings.length} warning(s)</p>
              {parseResult.warnings.map((w, i) => (
                <p key={i} className="text-xs text-amber-700 ml-3">• {w.detail || JSON.stringify(w)}</p>
              ))}
            </div>
          )}

          {/* Module preview tree */}
          {(parseResult.preview?.modules || []).length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Course Structure Preview</p>
              {parseResult.preview.modules.map((mod, mi) => (
                <details key={mi} className="rounded-lg border border-slate-200 overflow-hidden">
                  <summary className="px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-50 cursor-pointer">
                    Module {mi + 1}: {mod.title} ({mod.lessonCount} lesson{mod.lessonCount !== 1 ? 's' : ''})
                  </summary>
                  <div className="px-4 py-2 space-y-1">
                    {(mod.lessons || []).map((lesson, li) => (
                      <p key={li} className="text-xs text-slate-600">
                        {li + 1}. {lesson.title} <span className="text-slate-400">({lesson.blockCount} blocks)</span>
                      </p>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          )}

          {assembleError && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{assembleError}</div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              disabled={!parseResult.canPublish || assembling || phase === 'assembled'}
              onClick={assembleImport}
              className="flex-1 rounded-lg bg-indigo-600 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              {assembling ? <><span className="animate-spin">↻</span> Assembling Course…</> : 'Assemble Course'}
            </button>
            <button type="button" onClick={reset} className="rounded-lg border border-slate-200 px-4 py-2 text-xs text-slate-600 hover:bg-slate-50">
              Reset
            </button>
          </div>
        </div>
      )}

      {/* SECTION C — Assembly Progress */}
      {(phase === 'assembling' || phase === 'assembled') && assembleResult && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-600">Section C — Assembly Complete</p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Modules', value: assembleResult.modulesCreated },
              { label: 'Lessons', value: assembleResult.lessonsCreated },
              { label: 'Blocks', value: assembleResult.blocksCreated },
            ].map(s => (
              <div key={s.label} className="rounded-lg bg-white border border-emerald-100 p-2 text-center">
                <p className="text-lg font-bold text-slate-900">{s.value}</p>
                <p className="text-[10px] text-slate-400">{s.label}</p>
              </div>
            ))}
          </div>
          <a
            href={assembleResult.studioUrl}
            className="flex items-center justify-center gap-2 w-full rounded-lg bg-emerald-600 py-2 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors"
          >
            Open Studio →
          </a>
        </div>
      )}

      {/* SECTION D — Image Status Panel */}
      {(phase === 'images' || imageStatus) && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Section D — Image Status</p>
            <button type="button" onClick={() => loadImageStatus(courseId)} className="text-xs text-indigo-600 hover:text-indigo-800">
              {imageStatusLoading ? '↻ Refreshing…' : 'Refresh'}
            </button>
          </div>

          {imageStatus && (
            <>
              {/* Progress bar */}
              <div>
                <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                  <span>{imageStatus.resolvedSlots}/{imageStatus.totalSlots} images resolved</span>
                  <span>{imageStatus.pendingSlots} pending · {imageStatus.errorSlots} errors</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all"
                    style={{ width: imageStatus.totalSlots ? `${(imageStatus.resolvedSlots / imageStatus.totalSlots) * 100}%` : '0%' }}
                  />
                </div>
              </div>

              {/* Bulk upload */}
              {imageStatus.pendingSlots > 0 && (
                <label className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-200 p-4 cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors">
                  <span className="text-xs font-medium text-slate-500">
                    {uploading ? '↻ Uploading images…' : `Upload ${imageStatus.pendingSlots} pending image(s)`}
                  </span>
                  <span className="text-[10px] text-slate-400">Files must match IMG_NNN.ext naming pattern</span>
                  <input
                    ref={imageInputRef}
                    type="file"
                    multiple
                    accept="image/*,.webp"
                    className="hidden"
                    onChange={bulkUploadImages}
                    disabled={uploading}
                  />
                </label>
              )}

              {uploadResult && !uploadResult.error && (
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-700">
                  ✓ {uploadResult.matched} matched · {uploadResult.orphaned} orphaned
                </div>
              )}
              {uploadResult?.error && (
                <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700">{uploadResult.error}</div>
              )}

              {/* Image slots table */}
              <div className="overflow-auto max-h-64">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left py-1.5 px-2 font-semibold text-slate-500">IMG ID</th>
                      <th className="text-left py-1.5 px-2 font-semibold text-slate-500">Lesson</th>
                      <th className="text-left py-1.5 px-2 font-semibold text-slate-500">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(imageStatus.slots || []).map((slot, i) => (
                      <tr key={i} className="border-b border-slate-50">
                        <td className="py-1.5 px-2 font-mono text-slate-700">{slot.imageId}</td>
                        <td className="py-1.5 px-2 text-slate-500 truncate max-w-[120px]">{slot.lessonTitle || '—'}</td>
                        <td className="py-1.5 px-2">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            slot.resolutionStatus === 'resolved' ? 'bg-emerald-100 text-emerald-700' :
                            slot.resolutionStatus === 'asset_pending' ? 'bg-amber-100 text-amber-700' :
                            slot.resolutionStatus === 'unresolved_error' ? 'bg-rose-100 text-rose-700' :
                            'bg-slate-100 text-slate-600'
                          }`}>
                            {slot.resolutionStatus}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* SECTION E — Reset Structured Import */}
      {hasExistingImport && (
        <div style={{ marginTop: '32px', borderTop: '2px solid #fca5a5', paddingTop: '16px' }}>
          <h4 style={{ color: '#dc2626', margin: '0 0 8px', fontSize: '13px', fontWeight: 700 }}>
            Reset Structured Import
          </h4>
          <p style={{ fontSize: '12px', color: '#666', margin: '0 0 12px' }}>
            Removes all structured import data for this course. Manual lessons are preserved. Type RESET to confirm.
          </p>
          {resetError && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700 mb-2">{resetError}</div>
          )}
          {resetResult && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-700 mb-2">
              Reset complete: {resetResult.structuredLessonsRemoved} structured lessons removed, {resetResult.manualLessonsPreserved} manual lessons preserved.
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder='Type "RESET" to confirm'
              value={resetConfirm}
              onChange={e => set({ resetConfirm: e.target.value })}
              style={{ padding: '6px 10px', border: '1px solid #f87171', borderRadius: '6px', fontSize: '12px', width: '180px' }}
            />
            <button
              type="button"
              disabled={resetConfirm !== 'RESET' || resetLoading}
              onClick={handleReset}
              style={{
                background: resetConfirm === 'RESET' ? '#dc2626' : '#ccc',
                color: 'white',
                border: 'none',
                padding: '6px 14px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: resetConfirm === 'RESET' ? 'pointer' : 'default',
              }}
            >
              {resetLoading ? 'Resetting…' : 'Reset Import'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
