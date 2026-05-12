'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AdminTable from '@/components/admin/AdminTable';
import { AdminErrorState, AdminLoadingState, AdminEmptyState } from '@/components/admin/AdminStates';
import Link from 'next/link';
import AdminFilterBar from '@/components/admin/AdminFilterBar';
import { AdminModal } from '@/components/admin/AdminOverlays';
import LessonBlockEditor from '@/components/admin/lesson/LessonBlockEditor';
import RichLessonRenderer from '@/components/lesson/RichLessonRenderer';
import { normalizeEditorDocument, serializeLessonDocument } from '@/lib/lesson-blocks';
import { cmsGet, cmsPost, cmsPut } from '@/lib/admin/cmsApi';
import { useToast } from '@/components/admin/providers/ToastProvider';
import { useGlobalLoading } from '@/components/admin/providers/GlobalLoadingProvider';

const DRAFT_KEY = 'carelearn-cms-course-builder-draft-v2';

function moveArray(items, from, to) {
  if (to < 0 || to >= items.length) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

function withDepth(modules) {
  const byParent = new Map();
  modules.forEach((module) => {
    const key = module.parent_module_id || 'root';
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(module);
  });
  byParent.forEach((list) => list.sort((a, b) => a.order_index - b.order_index));

  const flattened = [];
  function dfs(parentId, depth) {
    const list = byParent.get(parentId || 'root') || [];
    list.forEach((module) => {
      flattened.push({ ...module, depth });
      dfs(module.id, depth + 1);
    });
  }
  dfs(null, 0);
  return flattened;
}

export default function CoursesBuilderPage() {
  const toast = useToast();
  const globalLoading = useGlobalLoading();
  const [trainings, setTrainings] = useState([]);
  const [selected, setSelected] = useState('');
  const [modules, setModules] = useState([]);
  const [selectedModuleId, setSelectedModuleId] = useState('');
  const [lessons, setLessons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [moduleTitle, setModuleTitle] = useState('');
  const [lessonTitle, setLessonTitle] = useState('');
  const [draggingModuleId, setDraggingModuleId] = useState('');
  const [draggingLessonId, setDraggingLessonId] = useState('');
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [historyEntries, setHistoryEntries] = useState([]);
  const [builderVersion, setBuilderVersion] = useState(0);
  const [conflict, setConflict] = useState('');
  const [hoverModuleId, setHoverModuleId] = useState('');
  const [lessonEditorOpen, setLessonEditorOpen] = useState(false);
  const [editingLesson, setEditingLesson] = useState(null);
  const [lessonDraft, setLessonDraft] = useState(null);
  const [lessonSaving, setLessonSaving] = useState(false);
  const [lessonDirty, setLessonDirty] = useState(false);
  const [lessonAutosaveAt, setLessonAutosaveAt] = useState(0);
  const [lessonAutosaving, setLessonAutosaving] = useState(false);
  const [previewMode, setPreviewMode] = useState('split');
  const [moduleSaving, setModuleSaving] = useState(false);
  const [lessonOrderSaving, setLessonOrderSaving] = useState(false);
  const autosaveTimerRef = useRef(null);
  const lessonDraftKey = useMemo(() => (
    editingLesson?.id ? `carelearn-lesson-draft-v3-${editingLesson.id}` : ''
  ), [editingLesson?.id]);

  const loadTrainings = useCallback(async () => {
    const data = await cmsGet('/trainings');
    const rows = data?.trainings || [];
    setTrainings(rows);
    if (!selected && rows.length) setSelected(rows[0].id);
  }, [selected]);

  const loadModules = useCallback(async (courseId) => {
    if (!courseId) return;
    const [data, historyRes] = await Promise.all([
      cmsGet(`/trainings/${courseId}/modules`),
      cmsGet(`/trainings/${courseId}/modules/history`).catch(() => ({ entries: [] })),
    ]);
    const rows = data?.modules || [];
    setModules(rows);
    setHistoryEntries(historyRes?.entries || []);
    setBuilderVersion(Number(historyRes?.version || 0));
    if (!selectedModuleId && rows.length) setSelectedModuleId(rows[0].id);
  }, [selectedModuleId]);

  const loadLessons = useCallback(async (moduleId) => {
    if (!moduleId) return;
    const data = await cmsGet(`/modules/${moduleId}/lessons`);
    setLessons(data?.lessons || []);
  }, []);

  const bootstrap = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      await loadTrainings();
    } catch (_err) {
      setError('Failed to load training builder.');
    } finally {
      setLoading(false);
    }
  }, [loadTrainings]);

  useEffect(() => { bootstrap(); }, [bootstrap]);
  useEffect(() => { if (selected) loadModules(selected); }, [selected, loadModules]);
  useEffect(() => { if (selectedModuleId) loadLessons(selectedModuleId); }, [selectedModuleId, loadLessons]);

  useEffect(() => {
    const timer = setTimeout(() => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ selected, selectedModuleId, moduleTitle, lessonTitle, modules }));
    }, 500);
    return () => clearTimeout(timer);
  }, [selected, selectedModuleId, moduleTitle, lessonTitle, modules]);

  useEffect(() => {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      setModuleTitle(data.moduleTitle || '');
      setLessonTitle(data.lessonTitle || '');
      if (data.selected) setSelected(data.selected);
      if (data.selectedModuleId) setSelectedModuleId(data.selectedModuleId);
    } catch {}
  }, []);

  const persistModuleTree = useCallback(async (next, withHistory = true) => {
    const payload = next.map((module, index) => ({
      id: module.id,
      parent_module_id: module.parent_module_id || null,
      order_index: index,
    }));
    setModules(next);
    setModuleSaving(true);
    try {
      const saveRes = await cmsPost(`/trainings/${selected}/modules/tree`, { modules: payload, expectedVersion: builderVersion });
      if (typeof saveRes?.version === 'number') setBuilderVersion(saveRes.version);
      setConflict('');
    } catch (err) {
      if (err?.response?.status === 409) {
        setConflict('Version conflict detected: another admin changed this builder. Reload and reconcile.');
      }
      throw err;
    }
    if (withHistory) {
      setHistoryEntries((prev) => [{ id: `local-${Date.now()}`, saved_at: new Date().toISOString(), modules: payload }, ...prev].slice(0, 20));
    }
    setModuleSaving(false);
    toast.info('Module tree saved');
  }, [selected, toast, builderVersion]);

  const persistLessonOrder = useCallback(async (next) => {
    setLessons(next);
    setLessonOrderSaving(true);
    await cmsPost(`/modules/${selectedModuleId}/lessons/reorder`, { orderedLessonIds: next.map((l) => l.id) });
    setLessonOrderSaving(false);
    toast.info('Lesson order saved');
  }, [selectedModuleId, toast]);

  const openLessonEditor = (lesson) => {
    const doc = normalizeEditorDocument(lesson?.content || {}, lesson?.title || '');
    setEditingLesson(lesson);
    setLessonDraft(doc);
    setLessonEditorOpen(true);
    setLessonDirty(false);
  };

  const saveLessonContent = useCallback(async () => {
    if (!editingLesson || !selectedModuleId || !lessonDraft) return;
    setLessonSaving(true);
    try {
      const payload = {
        title: editingLesson.title,
        content: serializeLessonDocument(lessonDraft, editingLesson.title),
      };
      await cmsPut(`/modules/${selectedModuleId}/lessons/${editingLesson.id}`, payload);
      toast.success('Lesson content saved');
      if (lessonDraftKey) localStorage.removeItem(lessonDraftKey);
      await loadLessons(selectedModuleId);
      setLessonEditorOpen(false);
      setLessonDirty(false);
    } finally {
      setLessonSaving(false);
    }
  }, [editingLesson, lessonDraft, lessonDraftKey, loadLessons, selectedModuleId, toast]);

  const saveLessonAutosave = useCallback(async () => {
    if (!editingLesson || !selectedModuleId || !lessonDraft || lessonSaving || !lessonDirty) return;
    setLessonAutosaving(true);
    try {
      await cmsPut(`/modules/${selectedModuleId}/lessons/${editingLesson.id}`, {
        title: editingLesson.title,
        content: serializeLessonDocument(lessonDraft, editingLesson.title),
      });
      setLessonAutosaveAt(Date.now());
      setLessonDirty(false);
    } catch {
      toast.error('Autosave failed. Your local draft is still retained.');
    } finally {
      setLessonAutosaving(false);
    }
  }, [editingLesson, lessonDraft, selectedModuleId, lessonSaving, lessonDirty, toast]);

  useEffect(() => {
    if (!lessonEditorOpen || !lessonDraftKey || !lessonDraft) return undefined;
    const timer = setTimeout(() => {
      localStorage.setItem(lessonDraftKey, JSON.stringify(lessonDraft));
      setLessonDirty(true);
    }, 400);
    return () => clearTimeout(timer);
  }, [lessonDraft, lessonDraftKey, lessonEditorOpen]);

  useEffect(() => {
    if (!lessonEditorOpen || !lessonDraftKey || !editingLesson) return;
    const cached = localStorage.getItem(lessonDraftKey);
    if (!cached) return;
    try {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed.blocks) && parsed.blocks.length) {
        setLessonDraft(parsed);
        toast.info('Recovered local lesson draft');
      }
    } catch {}
  }, [editingLesson, lessonDraftKey, lessonEditorOpen, toast]);

  useEffect(() => {
    if (!lessonEditorOpen || !lessonDirty) return undefined;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      saveLessonAutosave();
    }, 1500);
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [lessonDirty, lessonEditorOpen, saveLessonAutosave]);

  useEffect(() => {
    if (!lessonEditorOpen) return undefined;
    const onKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        saveLessonContent();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [lessonEditorOpen, saveLessonContent]);

  useEffect(() => {
    if (!lessonEditorOpen) return undefined;
    const onBeforeUnload = (event) => {
      if (!lessonDirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [lessonDirty, lessonEditorOpen]);

  const snapshotUndo = useCallback(() => {
    setUndoStack((prev) => [...prev, modules]);
    setRedoStack([]);
  }, [modules]);

  const undo = async () => {
    if (!undoStack.length) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack((stack) => stack.slice(0, -1));
    setRedoStack((stack) => [...stack, modules]);
    await persistModuleTree(prev, false);
  };

  const redo = async () => {
    if (!redoStack.length) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((stack) => stack.slice(0, -1));
    setUndoStack((stack) => [...stack, modules]);
    await persistModuleTree(next, false);
  };

  const addModule = async () => {
    if (!selected || !moduleTitle.trim()) return;
    globalLoading.start();
    try {
      await cmsPost(`/trainings/${selected}/modules`, { title: moduleTitle, status: 'draft' });
      toast.success('Module added');
      setModuleTitle('');
      await loadModules(selected);
    } finally {
      globalLoading.stop();
    }
  };

  const addLesson = async () => {
    if (!selectedModuleId || !lessonTitle.trim()) return;
    globalLoading.start();
    try {
      await cmsPost(`/modules/${selectedModuleId}/lessons`, { title: lessonTitle, status: 'draft', is_visible: true });
      toast.success('Lesson added');
      setLessonTitle('');
      await loadLessons(selectedModuleId);
    } finally {
      globalLoading.stop();
    }
  };

  const moduleFilters = useMemo(() => ([{
    key: 'training',
    value: selected,
    onChange: setSelected,
    options: trainings.map((training) => ({ label: training.title, value: training.id })),
  }]), [trainings, selected]);

  const visibleModules = useMemo(() => withDepth(modules), [modules]);

  if (loading) return <AdminLoadingState title="Loading course builder..." />;
  if (error && !trainings.length) return <AdminErrorState message={error} onRetry={bootstrap} />;
  if (!trainings.length) {
    return (
      <AdminEmptyState
        title="No Training Drafts Available"
        description="Create your first healthcare training draft before building modules and lessons."
      >
        <Link href="/admin/trainings/new" className="btn-primary">Open Training Wizard</Link>
      </AdminEmptyState>
    );
  }

  return (
    <div className="space-y-6">
      <AdminFilterBar
        search=""
        onSearchChange={() => {}}
        filters={moduleFilters}
        actions={(
          <div className="flex gap-2">
            {moduleSaving ? <span className="text-xs text-slate-500">Saving module tree...</span> : null}
            <button type="button" className="btn-secondary" onClick={undo} disabled={!undoStack.length}>Undo</button>
            <button type="button" className="btn-secondary" onClick={redo} disabled={!redoStack.length}>Redo</button>
          </div>
        )}
      />
      {conflict ? (
        <div className="surface-card border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
          {conflict}
          <button type="button" className="btn-secondary ml-3" onClick={() => loadModules(selected)}>Reload</button>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="surface-card p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-base font-semibold">Modules (Nested Tree)</h3>
            <span className="text-xs text-slate-500">History snapshots: {historyEntries.length}</span>
          </div>
          <div className="mb-3 flex gap-2">
            <input className="field-input" value={moduleTitle} onChange={(e) => setModuleTitle(e.target.value)} placeholder="New module title" />
            <button type="button" className="btn-primary" onClick={addModule}>Add</button>
          </div>
          <AdminTable
            columns={[
              {
                key: 'title',
                label: 'Module',
                render: (row) => {
                  const index = modules.findIndex((m) => m.id === row.id);
                  return (
                    <div
                      draggable
                      role="button"
                      tabIndex={0}
                      className={`rounded-lg border px-3 py-2 ${draggingModuleId === row.id ? 'border-blue-400 bg-blue-50' : hoverModuleId === row.id ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200'}`}
                      style={{ marginLeft: `${Math.min((row.depth || 0) * 14, 56)}px` }}
                      onDragStart={() => setDraggingModuleId(row.id)}
                      onDragOver={(e) => { e.preventDefault(); setHoverModuleId(row.id); }}
                      onDrop={async () => {
                        const from = modules.findIndex((m) => m.id === draggingModuleId);
                        if (from === -1 || from === index) return;
                        snapshotUndo();
                        await persistModuleTree(moveArray(modules, from, index));
                        setDraggingModuleId('');
                        setHoverModuleId('');
                      }}
                      onDragEnd={() => { setDraggingModuleId(''); setHoverModuleId(''); }}
                      onKeyDown={async (e) => {
                        if (e.key === 'ArrowUp') {
                          snapshotUndo();
                          await persistModuleTree(moveArray(modules, index, index - 1));
                        }
                        if (e.key === 'ArrowDown') {
                          snapshotUndo();
                          await persistModuleTree(moveArray(modules, index, index + 1));
                        }
                      }}
                    >
                      <p className="font-medium text-slate-800">{'+ '.repeat(row.depth || 0)}{row.title}</p>
                      <div className="mt-2 flex gap-1">
                        <button type="button" className="btn-secondary" onClick={async () => {
                          const dragged = modules.find((m) => m.id === draggingModuleId);
                          if (!dragged) return;
                          snapshotUndo();
                          const next = modules.map((m) => m.id === dragged.id ? { ...m, parent_module_id: row.id } : m);
                          await persistModuleTree(next);
                          setDraggingModuleId('');
                        }}>Drop As Child</button>
                        <button type="button" className="btn-secondary" onClick={async () => {
                          const parent = modules[index - 1];
                          if (!parent) return;
                          snapshotUndo();
                          const next = modules.map((m) => m.id === row.id ? { ...m, parent_module_id: parent.id } : m);
                          await persistModuleTree(next);
                        }}>Nest</button>
                        <button type="button" className="btn-secondary" onClick={async () => {
                          snapshotUndo();
                          const next = modules.map((m) => m.id === row.id ? { ...m, parent_module_id: null } : m);
                          await persistModuleTree(next);
                        }}>Unnest</button>
                      </div>
                    </div>
                  );
                },
              },
              { key: 'status', label: 'Status' },
              {
                key: 'actions',
                label: 'Actions',
                render: (row) => (
                  <button type="button" className="btn-secondary" onClick={() => setSelectedModuleId(row.id)}>Open</button>
                ),
              },
            ]}
            rows={visibleModules}
          />
        </section>

        <section className="surface-card p-4">
          <h3 className="mb-3 text-base font-semibold">Lessons</h3>
          {lessonOrderSaving ? <p className="mb-2 text-xs text-slate-500">Saving lesson order...</p> : null}
          <div className="mb-3 flex gap-2">
            <input className="field-input" value={lessonTitle} onChange={(e) => setLessonTitle(e.target.value)} placeholder="New lesson title" />
            <button type="button" className="btn-primary" onClick={addLesson}>Add</button>
          </div>
          <AdminTable
            columns={[
              {
                key: 'title',
                label: 'Lesson',
                render: (row) => {
                  const index = lessons.findIndex((l) => l.id === row.id);
                  return (
                    <div
                      draggable
                      role="button"
                      tabIndex={0}
                      className={`rounded-lg border px-3 py-2 ${draggingLessonId === row.id ? 'border-blue-400 bg-blue-50' : 'border-slate-200'}`}
                      onDragStart={() => setDraggingLessonId(row.id)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={async () => {
                        const from = lessons.findIndex((l) => l.id === draggingLessonId);
                        if (from === -1 || from === index) return;
                        await persistLessonOrder(moveArray(lessons, from, index));
                        setDraggingLessonId('');
                      }}
                      onDragEnd={() => setDraggingLessonId('')}
                    >
                      <p className="font-medium text-slate-800">{row.title}</p>
                    </div>
                  );
                },
              },
              { key: 'status', label: 'Status' },
              { key: 'duration_minutes', label: 'Duration' },
              {
                key: 'actions',
                label: 'Actions',
                render: (row) => (
                  <button type="button" className="btn-secondary" onClick={() => openLessonEditor(row)}>Edit Content</button>
                ),
              },
            ]}
            rows={lessons}
          />
        </section>
      </div>

      <AdminModal open={lessonEditorOpen} onClose={() => setLessonEditorOpen(false)} title={`Lesson Editor${editingLesson?.title ? ` - ${editingLesson.title}` : ''}`} size="xl">
        {lessonDraft ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex gap-2">
                <button type="button" className={`btn-secondary ${previewMode === 'editor' ? 'border-blue-400' : ''}`} onClick={() => setPreviewMode('editor')}>Editor</button>
                <button type="button" className={`btn-secondary ${previewMode === 'split' ? 'border-blue-400' : ''}`} onClick={() => setPreviewMode('split')}>Split</button>
                <button type="button" className={`btn-secondary ${previewMode === 'preview' ? 'border-blue-400' : ''}`} onClick={() => setPreviewMode('preview')}>Preview</button>
              </div>
              <p className="text-xs text-slate-500">
                {lessonAutosaving ? 'Autosaving...' : lessonDirty ? 'Unsaved changes' : lessonAutosaveAt ? `Autosaved ${new Date(lessonAutosaveAt).toLocaleTimeString()}` : 'No changes yet'}
              </p>
            </div>
            <div className={`grid gap-4 ${previewMode === 'split' ? 'lg:grid-cols-2' : ''}`}>
              {previewMode !== 'preview' ? <LessonBlockEditor document={lessonDraft} onChange={setLessonDraft} /> : null}
              {previewMode !== 'editor' ? (
                <div className="rounded-xl border border-slate-200 p-4">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">Preview</p>
                  <RichLessonRenderer blocks={lessonDraft.blocks || []} />
                </div>
              ) : null}
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => {
                if (lessonDirty && !window.confirm('You have unsaved changes. Close anyway?')) return;
                setLessonEditorOpen(false);
              }}>Cancel</button>
              <button type="button" className="btn-primary" disabled={lessonSaving} onClick={saveLessonContent}>
                {lessonSaving ? 'Saving...' : 'Save Lesson'}
              </button>
            </div>
          </div>
        ) : null}
      </AdminModal>
    </div>
  );
}
