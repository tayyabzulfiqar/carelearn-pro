'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import LessonBlockEditor from '@/components/admin/lesson/LessonBlockEditor';
import { normalizeEditorDocument, serializeLessonDocument } from '@/lib/lesson-blocks';

function move(items, from, to) {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function toError(err, fallback) {
  return err?.response?.data?.error || err?.response?.data?.message || fallback;
}

function elapsedLabel(ts) {
  if (!ts) return '';
  const sec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (sec < 5) return 'Saved just now';
  if (sec < 60) return `Saved ${sec}s ago`;
  return `Saved ${Math.floor(sec / 60)}m ago`;
}

export default function CourseStudioPage({ params }) {
  const courseId = params.id;
  const [course, setCourse] = useState(null);
  const [modules, setModules] = useState([]);
  const [activeModuleId, setActiveModuleId] = useState('');
  const [activeLesson, setActiveLesson] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [actionBusy, setActionBusy] = useState({});
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [questions, setQuestions] = useState([]);
  const [questionDraft, setQuestionDraft] = useState({ question_text: '', options: [''], correct_answer: '' });
  const [quizError, setQuizError] = useState('');
  const [quizNotice, setQuizNotice] = useState('');
  const [savingQuestionId, setSavingQuestionId] = useState('');
  const [previewAnswers, setPreviewAnswers] = useState({});
  const [showQuizPreview, setShowQuizPreview] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [autosave, setAutosave] = useState({ state: 'idle', lastSavedAt: null, message: '' });
  const [draggingModuleId, setDraggingModuleId] = useState('');
  const [moduleDropIndex, setModuleDropIndex] = useState(-1);
  const [draggingLesson, setDraggingLesson] = useState(null);
  const [lessonDrop, setLessonDrop] = useState({ moduleId: '', index: -1 });
  const autosaveRef = useRef(null);
  const noticeTimeoutRef = useRef(null);
  const quizNoticeTimeoutRef = useRef(null);

  const pushNotice = (text) => {
    setNotice(text);
    if (noticeTimeoutRef.current) clearTimeout(noticeTimeoutRef.current);
    noticeTimeoutRef.current = setTimeout(() => setNotice(''), 3500);
  };

  const pushQuizNotice = (text) => {
    pushQuizNotice(text);
    if (quizNoticeTimeoutRef.current) clearTimeout(quizNoticeTimeoutRef.current);
    quizNoticeTimeoutRef.current = setTimeout(() => pushQuizNotice(''), 3500);
  };

  const withBusy = async (key, task) => {
    setActionBusy((prev) => ({ ...prev, [key]: true }));
    try {
      return await task();
    } finally {
      setActionBusy((prev) => ({ ...prev, [key]: false }));
    }
  };

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [courseRes, modulesRes, questionsRes] = await Promise.all([
        api.get(`/courses/${courseId}`),
        api.get(`/courses/${courseId}/modules`),
        api.get(`/courses/${courseId}/questions?is_final=true`),
      ]);
      const moduleRows = modulesRes.data?.modules || [];
      setCourse(courseRes.data?.course || null);
      setModules(moduleRows);
      setQuestions(questionsRes.data?.questions || []);
      if (moduleRows.length && !activeModuleId) setActiveModuleId(moduleRows[0].id);
      setExpanded((prev) => {
        const next = { ...prev };
        moduleRows.forEach((m) => {
          if (next[m.id] === undefined) next[m.id] = true;
        });
        return next;
      });
    } catch (err) {
      setError(toError(err, 'Failed to load studio.'));
    } finally {
      setLoading(false);
    }
  }, [courseId, activeModuleId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => () => {
    if (autosaveRef.current) clearTimeout(autosaveRef.current);
    if (noticeTimeoutRef.current) clearTimeout(noticeTimeoutRef.current);
    if (quizNoticeTimeoutRef.current) clearTimeout(quizNoticeTimeoutRef.current);
  }, []);

  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (autosave.state === 'dirty' || autosave.state === 'saving') {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [autosave.state]);

  useEffect(() => {
    const onKey = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (activeLesson) saveLesson(activeLesson, true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeLesson, saveLesson]);

  const openLesson = async (moduleId, lessonId) => {
    try {
      const res = await api.get(`/courses/${courseId}/modules/${moduleId}/lessons`);
      const lesson = (res.data?.lessons || []).find((item) => item.id === lessonId);
      if (!lesson) return;
      setActiveModuleId(moduleId);
      setActiveLesson({ ...lesson, module_id: moduleId, document: normalizeEditorDocument(lesson.content || {}, lesson.title) });
    } catch (err) {
      setError(toError(err, 'Failed to load lesson.'));
    }
  };

  const saveLesson = useCallback(async (lessonToSave, announce = false) => {
    if (!lessonToSave?.id || !lessonToSave?.module_id) return;
    setAutosave((prev) => ({ ...prev, state: 'saving', message: 'Saving...' }));
    try {
      await api.put(`/courses/${courseId}/modules/${lessonToSave.module_id}/lessons/${lessonToSave.id}`, {
        title: lessonToSave.title,
        content: serializeLessonDocument(lessonToSave.document, lessonToSave.title),
        order_index: lessonToSave.order_index || 0,
        duration_minutes: Number(lessonToSave.duration_minutes || 5),
      });
      const savedAt = Date.now();
      setAutosave({ state: 'saved', lastSavedAt: savedAt, message: 'Saved just now' });
      if (announce) pushNotice('Lesson saved.');
      await loadAll();
    } catch (err) {
      setAutosave((prev) => ({ ...prev, state: 'error', message: 'Autosave failed. Retry save.' }));
      setError(toError(err, 'Lesson save failed.'));
    }
  }, [courseId, loadAll]);

  const queueAutosave = (nextLesson) => {
    setActiveLesson(nextLesson);
    setAutosave((prev) => ({ ...prev, state: 'dirty', message: 'Unsaved changes' }));
    if (autosaveRef.current) clearTimeout(autosaveRef.current);
    autosaveRef.current = setTimeout(() => saveLesson(nextLesson), 800);
  };

  const persistModuleOrder = async (nextModules, rollbackSnapshot) => {
    try {
      await Promise.all(nextModules.map((m, i) => api.put(`/courses/${courseId}/modules/${m.id}`, {
        title: m.title,
        description: m.description || '',
        order_index: i,
      })));
      pushNotice('Module order updated.');
    } catch (err) {
      setModules(rollbackSnapshot);
      setError(toError(err, 'Failed to reorder modules.'));
    }
  };

  const addModule = async () => {
    try {
      const res = await api.post(`/courses/${courseId}/modules`, { title: `New Module ${modules.length + 1}`, description: '', order_index: modules.length });
      const created = res.data?.module;
      pushNotice('Module added.');
      await loadAll();
      if (created?.id) {
        setActiveModuleId(created.id);
        setExpanded((prev) => ({ ...prev, [created.id]: true }));
      }
    } catch (err) {
      setError(toError(err, 'Failed to add module.'));
    }
  };

  const addLesson = async (moduleId) => {
    const moduleNode = modules.find((m) => m.id === moduleId);
    try {
      const res = await api.post(`/courses/${courseId}/modules/${moduleId}/lessons`, {
        title: `New Lesson ${(moduleNode?.lessons || []).length + 1}`,
        content: {},
        duration_minutes: 5,
        order_index: (moduleNode?.lessons || []).length,
      });
      pushNotice('Lesson added.');
      await loadAll();
      if (res.data?.lesson?.id) await openLesson(moduleId, res.data.lesson.id);
    } catch (err) {
      setError(toError(err, 'Failed to add lesson.'));
    }
  };

  const updateModuleTitle = async (moduleNode, title) => {
    if (!String(title || '').trim()) return;
    try {
      await api.put(`/courses/${courseId}/modules/${moduleNode.id}`, {
        title,
        description: moduleNode.description || '',
        order_index: moduleNode.order_index || 0,
      });
      pushNotice('Module renamed.');
    } catch (err) {
      setError(toError(err, 'Failed to rename module.'));
      await loadAll();
    }
  };

  const updateLessonInline = async (moduleId, lesson) => {
    try {
      await api.put(`/courses/${courseId}/modules/${moduleId}/lessons/${lesson.id}`, {
        title: lesson.title,
        content: lesson.content || {},
        order_index: lesson.order_index || 0,
        duration_minutes: Number(lesson.duration_minutes || 5),
      });
      if (activeLesson?.id === lesson.id) {
        setActiveLesson((prev) => prev ? { ...prev, title: lesson.title, duration_minutes: lesson.duration_minutes } : prev);
      }
    } catch (err) {
      setError(toError(err, 'Failed to update lesson.'));
      await loadAll();
    }
  };

  const deleteModule = async (moduleId) => {
    if (!window.confirm('Delete module and all lessons?')) return;
    try {
      await api.delete(`/courses/${courseId}/modules/${moduleId}`);
      pushNotice('Module deleted.');
      if (activeModuleId === moduleId) {
        setActiveModuleId('');
        setActiveLesson(null);
      }
      await loadAll();
    } catch (err) {
      setError(toError(err, 'Failed to delete module.'));
    }
  };

  const deleteLesson = async (moduleId, lessonId) => {
    if (!window.confirm('Delete this lesson?')) return;
    try {
      await api.delete(`/courses/${courseId}/modules/${moduleId}/lessons/${lessonId}`);
      pushNotice('Lesson deleted.');
      if (activeLesson?.id === lessonId) setActiveLesson(null);
      await loadAll();
    } catch (err) {
      setError(toError(err, 'Failed to delete lesson.'));
    }
  };

  const reorderLessonsWithinModule = async (moduleId, nextLessons, rollbackSnapshot) => {
    try {
      await Promise.all(nextLessons.map((l, i) => api.put(`/courses/${courseId}/modules/${moduleId}/lessons/${l.id}`, {
        title: l.title,
        content: l.content || {},
        order_index: i,
        duration_minutes: l.duration_minutes || 5,
      })));
      pushNotice('Lesson order updated.');
    } catch (err) {
      setModules(rollbackSnapshot);
      setError(toError(err, 'Failed to reorder lessons.'));
    }
  };

  const moveLessonAcrossModules = async ({ sourceModuleId, targetModuleId, lessonId, targetIndex }) => {
    if (sourceModuleId === targetModuleId) return;
    try {
      const sourceLessonsRes = await api.get(`/courses/${courseId}/modules/${sourceModuleId}/lessons`);
      const sourceLesson = (sourceLessonsRes.data?.lessons || []).find((l) => l.id === lessonId);
      if (!sourceLesson) return;

      const targetLessonsRes = await api.get(`/courses/${courseId}/modules/${targetModuleId}/lessons`);
      const targetLessons = targetLessonsRes.data?.lessons || [];
      const reorderedTarget = [...targetLessons];
      const insertAt = Math.min(Math.max(targetIndex, 0), reorderedTarget.length);
      reorderedTarget.splice(insertAt, 0, sourceLesson);

      const created = await api.post(`/courses/${courseId}/modules/${targetModuleId}/lessons`, {
        title: sourceLesson.title,
        content: sourceLesson.content || {},
        duration_minutes: sourceLesson.duration_minutes || 5,
        order_index: insertAt,
      });

      await Promise.all(reorderedTarget.map((lesson, index) => {
        const lessonIdToUpdate = lesson.id === sourceLesson.id ? created.data?.lesson?.id : lesson.id;
        return api.put(`/courses/${courseId}/modules/${targetModuleId}/lessons/${lessonIdToUpdate}`, {
          title: lesson.title,
          content: lesson.content || {},
          order_index: index,
          duration_minutes: lesson.duration_minutes || 5,
        });
      }));

      await api.delete(`/courses/${courseId}/modules/${sourceModuleId}/lessons/${sourceLesson.id}`);

      if (activeLesson?.id === sourceLesson.id && created.data?.lesson?.id) {
        await openLesson(targetModuleId, created.data.lesson.id);
      }
      pushNotice('Lesson moved across modules.');
      await loadAll();
    } catch (err) {
      setError(toError(err, 'Failed to move lesson.'));
      await loadAll();
    }
  };

  const saveCourseSettings = async () => {
    if (!course) return;
    try {
      await api.put(`/courses/${courseId}`, {
        title: course.title,
        description: course.description || '',
        category: course.category || 'general',
        cqc_reference: course.cqc_reference || '',
        duration_minutes: Number(course.duration_minutes || 30),
        renewal_years: Number(course.renewal_years || 1),
        pass_mark: Number(course.pass_mark || 75),
        is_mandatory: !!course.is_mandatory,
      });
      pushNotice('Course settings saved.');
    } catch (err) {
      setError(toError(err, 'Failed to save course settings.'));
    }
  };

  const publishCourse = async () => {
    setPublishing(true);
    await withBusy('publish', async () => {
      try {
        await api.post(`/courses/${courseId}/publish`, {});
        pushNotice('Course published.');
        await loadAll();
      } catch (err) {
        setError(toError(err, 'Failed to publish course.'));
      } finally {
        setPublishing(false);
      }
    });
  };

  const duplicateCourse = async () => {
    await withBusy('duplicate', async () => {
      try {
        await api.post(`/courses/${courseId}/clone`, {});
        pushNotice('Course duplicated.');
        await loadAll();
      } catch (err) {
        setError(toError(err, 'Failed to duplicate course.'));
      }
    });
  };

  const archiveCourse = async () => {
    await withBusy('archive', async () => {
      try {
        await api.put(`/courses/${courseId}`, {
          title: course?.title || '',
          description: course?.description || '',
          category: course?.category || 'general',
          cqc_reference: course?.cqc_reference || '',
          duration_minutes: Number(course?.duration_minutes || 30),
          renewal_years: Number(course?.renewal_years || 1),
          pass_mark: Number(course?.pass_mark || 75),
          is_mandatory: !!course?.is_mandatory,
          status: 'archived',
        });
        pushNotice('Course archived.');
        await loadAll();
      } catch (err) {
        setError(toError(err, 'Failed to archive course.'));
      }
    });
  };

  const unpublishCourse = async () => {
    await withBusy('unpublish', async () => {
      try {
        await api.put(`/courses/${courseId}`, {
          title: course?.title || '',
          description: course?.description || '',
          category: course?.category || 'general',
          cqc_reference: course?.cqc_reference || '',
          duration_minutes: Number(course?.duration_minutes || 30),
          renewal_years: Number(course?.renewal_years || 1),
          pass_mark: Number(course?.pass_mark || 75),
          is_mandatory: !!course?.is_mandatory,
          status: 'draft',
        });
        pushNotice('Course moved to draft.');
        await loadAll();
      } catch (err) {
        setError(toError(err, 'Failed to unpublish course.'));
      }
    });
  };

  const uploadMedia = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length || !activeLesson) return;
    const formData = new FormData();
    files.forEach((f) => formData.append('files', f));
    setUploading(true);
    setUploadProgress(0);
    try {
      const res = await api.post('/upload/media', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          if (!e.total) return;
          setUploadProgress(Math.round((e.loaded / e.total) * 100));
        },
      });
      const uploaded = res.data?.files || [];
      if (uploaded.length) {
        const first = uploaded[0];
        const ext = String(first.mimeType || '').toLowerCase();
        const newBlock = ext.includes('pdf')
          ? { type: 'file', payload: { href: first.url, label: first.originalName || 'Document', fileType: 'pdf' } }
          : ext.includes('video')
            ? { type: 'video', payload: { src: first.url, title: first.originalName || 'Video', provider: 'direct' } }
            : { type: 'image', payload: { src: first.url, alt: first.originalName || 'Image', caption: '' } };
        const nextLesson = {
          ...activeLesson,
          document: {
            ...activeLesson.document,
            blocks: [...(activeLesson.document?.blocks || []), { id: `media-${Date.now()}`, order: (activeLesson.document?.blocks || []).length, ...newBlock }],
          },
        };
        queueAutosave(nextLesson);
      }
      pushNotice('Media uploaded.');
    } catch (err) {
      setError(toError(err, 'Upload failed.'));
    } finally {
      setUploading(false);
    }
  };

  const addQuestion = async () => {
    setQuizError('');
    pushQuizNotice('');
    try {
      const options = questionDraft.options.map((o) => o.trim()).filter(Boolean);
      if (!questionDraft.question_text.trim()) {
        setQuizError('Question text is required.');
        return;
      }
      if (options.length < 2) {
        setQuizError('Add at least 2 answer options.');
        return;
      }
      const correctIdx = Number(questionDraft.correct_answer);
      if (questionDraft.correct_answer === '' || !Number.isFinite(correctIdx) || correctIdx < 0 || correctIdx >= options.length) {
        setQuizError('Select a correct answer from the available options.');
        return;
      }
      await api.post(`/courses/${courseId}/questions`, {
        question_text: questionDraft.question_text,
        question_type: 'multiple_choice',
        options,
        correct_answer: correctIdx,
        is_final_assessment: true,
        order_index: questions.length,
      });
      setQuestionDraft({ question_text: '', options: [''], correct_answer: '' });
      const res = await api.get(`/courses/${courseId}/questions?is_final=true`);
      setQuestions(res.data?.questions || []);
      pushQuizNotice('Question added.');
    } catch (err) {
      setQuizError(toError(err, 'Failed to add question.'));
    }
  };

  const updateQuestion = async (question) => {
    setSavingQuestionId(question.id);
    setQuizError('');
    try {
      await api.put(`/courses/${courseId}/questions/${question.id}`, {
        question_text: question.question_text,
        options: question.options || [],
        correct_answer: question.correct_answer,
        order_index: question.order_index || 0,
      });
      pushQuizNotice('Question saved.');
    } catch (err) {
      setQuizError(toError(err, 'Failed to update question.'));
      await loadAll();
    } finally {
      setSavingQuestionId('');
    }
  };

  const reorderQuestion = async (index, dir) => {
    const nextIndex = index + dir;
    if (nextIndex < 0 || nextIndex >= questions.length) return;
    const reordered = move(questions, index, nextIndex).map((q, i) => ({ ...q, order_index: i }));
    const prev = questions;
    setQuestions(reordered);
    try {
      await Promise.all(reordered.map((q) => updateQuestion(q)));
      pushNotice('Question order updated.');
    } catch (_err) {
      setQuestions(prev);
    }
  };

  const deleteQuestion = async (id) => {
    if (!window.confirm('Delete this question?')) return;
    try {
      await api.delete(`/courses/${courseId}/questions/${id}`);
      setQuestions((prev) => prev.filter((q) => q.id !== id));
      pushQuizNotice('Question deleted.');
    } catch (err) {
      setQuizError(toError(err, 'Failed to delete question.'));
    }
  };

  const quizPreviewScore = useMemo(() => {
    const total = questions.length;
    if (!total) return { total: 0, correct: 0, score: 0, pass: false };
    let correct = 0;
    questions.forEach((q) => {
      if ((previewAnswers[q.id] || '') === (q.correct_answer || '')) correct += 1;
    });
    const score = Math.round((correct / total) * 100);
    const passMark = Number(course?.pass_mark || 75);
    return { total, correct, score, pass: score >= passMark, passMark };
  }, [questions, previewAnswers, course?.pass_mark]);

  const autosaveHint = useMemo(() => {
    if (autosave.state === 'saved') return elapsedLabel(autosave.lastSavedAt);
    return autosave.message;
  }, [autosave]);

  if (loading) return <div className="p-6 text-sm text-slate-600">Loading studio...</div>;

  return (
    <div className="min-h-[calc(100vh-5rem)] overflow-auto bg-slate-100/60 lg:h-[calc(100vh-5rem)] lg:overflow-hidden">
      <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Course Builder Studio</p>
            <h1 className="text-xl font-semibold text-slate-900">{course?.title || 'Untitled course'}</h1>
            <p className={`text-xs ${autosave.state === 'error' ? 'text-rose-600' : autosave.state === 'dirty' ? 'text-amber-700' : 'text-slate-500'}`}>{autosaveHint}</p>
            {autosave.state === 'error' && activeLesson ? (
              <button type="button" className="mt-1 text-xs font-medium text-rose-700 underline" onClick={() => saveLesson(activeLesson, true)}>Retry save</button>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Link className="btn-secondary" href="/admin/trainings">Back</Link>
            <button type="button" className="btn-secondary" disabled={!!actionBusy.duplicate} onClick={duplicateCourse}>{actionBusy.duplicate ? 'Duplicating...' : 'Duplicate'}</button>
            <button type="button" className="btn-secondary" disabled={!activeLesson || autosave.state === 'saving'} onClick={() => activeLesson && saveLesson(activeLesson, true)}>{autosave.state === 'saving' ? 'Saving...' : 'Save Now'}</button>
            <button type="button" className="btn-primary" disabled={publishing || !!actionBusy.publish} onClick={publishCourse}>{publishing || actionBusy.publish ? 'Publishing...' : 'Publish'}</button>
          </div>
        </div>
        {notice ? <p className="mt-1 text-sm text-emerald-700">{notice}</p> : null}
        {error ? <p className="mt-1 text-sm text-rose-700">{error}</p> : null}
      </div>

      <div className="flex flex-col gap-3 overflow-auto p-3 lg:grid lg:h-[calc(100%-82px)] lg:grid-cols-[320px_1fr_360px] lg:overflow-hidden">
        <aside className="overflow-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="sticky top-0 z-10 mb-3 flex items-center justify-between bg-white/95 pb-2 backdrop-blur">
            <p className="text-sm font-semibold text-slate-900">Modules</p>
            <button type="button" className="btn-secondary" onClick={addModule}>+ Module</button>
          </div>
          <div className="space-y-2">
            {!modules.length ? (
              <p className="rounded-lg border border-dashed border-slate-300 p-3 text-xs text-slate-500">No modules yet. Add a module to start building your course.</p>
            ) : null}
            {modules.map((moduleNode, moduleIndex) => (
              <div
                key={moduleNode.id}
                draggable
                onDragStart={() => setDraggingModuleId(moduleNode.id)}
                onDragOver={(e) => { e.preventDefault(); setModuleDropIndex(moduleIndex); }}
                onDrop={() => {
                  if (!draggingModuleId) return;
                  const fromIndex = modules.findIndex((m) => m.id === draggingModuleId);
                  if (fromIndex === -1 || fromIndex === moduleIndex) return;
                  const snapshot = modules;
                  const reordered = move(modules, fromIndex, moduleIndex).map((m, idx) => ({ ...m, order_index: idx }));
                  setModules(reordered);
                  setDraggingModuleId('');
                  setModuleDropIndex(-1);
                  persistModuleOrder(reordered, snapshot);
                }}
                onDragEnd={() => { setDraggingModuleId(''); setModuleDropIndex(-1); }}
                className={`rounded-xl border p-2 transition ${moduleDropIndex === moduleIndex ? 'border-indigo-400 bg-indigo-50/50' : 'border-slate-200 bg-white'} ${draggingModuleId === moduleNode.id ? 'opacity-60' : ''}`}
              >
                <div className="flex items-center gap-2">
                  <span className="cursor-grab text-slate-400">::</span>
                  <button type="button" className="btn-secondary" onClick={() => setExpanded((prev) => ({ ...prev, [moduleNode.id]: !prev[moduleNode.id] }))}>{expanded[moduleNode.id] ? '-' : '+'}</button>
                  <input
                    className="field-input"
                    value={moduleNode.title || ''}
                    onChange={(e) => setModules((prev) => prev.map((m) => m.id === moduleNode.id ? { ...m, title: e.target.value } : m))}
                    onBlur={(e) => updateModuleTitle(moduleNode, e.target.value)}
                  />
                  <button type="button" className="btn-secondary" onClick={() => deleteModule(moduleNode.id)}>Del</button>
                </div>

                {expanded[moduleNode.id] ? (
                  <div
                    className="mt-2 space-y-1 rounded-lg border border-dashed border-slate-200 p-2"
                    onDragOver={(e) => { e.preventDefault(); setLessonDrop({ moduleId: moduleNode.id, index: (moduleNode.lessons || []).length }); }}
                    onDrop={async () => {
                      if (!draggingLesson) return;
                      if (draggingLesson.moduleId !== moduleNode.id) {
                        await moveLessonAcrossModules({ sourceModuleId: draggingLesson.moduleId, targetModuleId: moduleNode.id, lessonId: draggingLesson.lessonId, targetIndex: lessonDrop.index });
                      }
                      setDraggingLesson(null);
                      setLessonDrop({ moduleId: '', index: -1 });
                    }}
                  >
                    {(moduleNode.lessons || []).map((lesson, lessonIndex) => (
                      <div
                        key={lesson.id}
                        draggable
                        onDragStart={() => setDraggingLesson({ moduleId: moduleNode.id, lessonId: lesson.id })}
                        onDragOver={(e) => { e.preventDefault(); setLessonDrop({ moduleId: moduleNode.id, index: lessonIndex }); }}
                        onDrop={async () => {
                          if (!draggingLesson) return;
                          if (draggingLesson.moduleId === moduleNode.id) {
                            const sourceModule = modules.find((m) => m.id === moduleNode.id);
                            const sourceLessons = sourceModule?.lessons || [];
                            const from = sourceLessons.findIndex((l) => l.id === draggingLesson.lessonId);
                            const to = lessonIndex;
                            if (from !== -1 && from !== to) {
                              const snapshot = modules;
                              const nextLessons = move(sourceLessons, from, to).map((l, idx) => ({ ...l, order_index: idx }));
                              setModules((prev) => prev.map((m) => m.id === moduleNode.id ? { ...m, lessons: nextLessons } : m));
                              await reorderLessonsWithinModule(moduleNode.id, nextLessons, snapshot);
                            }
                          } else {
                            await moveLessonAcrossModules({ sourceModuleId: draggingLesson.moduleId, targetModuleId: moduleNode.id, lessonId: draggingLesson.lessonId, targetIndex: lessonIndex });
                          }
                          setDraggingLesson(null);
                          setLessonDrop({ moduleId: '', index: -1 });
                        }}
                        onDragEnd={() => { setDraggingLesson(null); setLessonDrop({ moduleId: '', index: -1 }); }}
                        className={`rounded-md border px-2 py-1 transition ${activeLesson?.id === lesson.id ? 'border-indigo-300 bg-indigo-50' : 'border-transparent hover:bg-slate-50'} ${lessonDrop.moduleId === moduleNode.id && lessonDrop.index === lessonIndex ? 'ring-2 ring-indigo-300' : ''}`}
                      >
                        <div className="flex items-center gap-1">
                          <span className="cursor-grab text-slate-400">::</span>
                          <input
                            className="w-full rounded border border-transparent bg-transparent px-1 text-xs text-slate-700 outline-none focus:border-slate-300"
                            value={lesson.title || ''}
                            onClick={() => openLesson(moduleNode.id, lesson.id)}
                            onChange={(e) => setModules((prev) => prev.map((m) => m.id === moduleNode.id ? { ...m, lessons: (m.lessons || []).map((l) => l.id === lesson.id ? { ...l, title: e.target.value } : l) } : m))}
                            onBlur={(e) => updateLessonInline(moduleNode.id, { ...lesson, title: e.target.value })}
                          />
                          <input
                            className="w-14 rounded border border-transparent bg-transparent px-1 text-[11px] text-slate-500 outline-none focus:border-slate-300"
                            type="number"
                            value={lesson.duration_minutes || 5}
                            onChange={(e) => setModules((prev) => prev.map((m) => m.id === moduleNode.id ? { ...m, lessons: (m.lessons || []).map((l) => l.id === lesson.id ? { ...l, duration_minutes: Number(e.target.value || 5) } : l) } : m))}
                            onBlur={(e) => updateLessonInline(moduleNode.id, { ...lesson, duration_minutes: Number(e.target.value || 5) })}
                          />
                          <button type="button" className="btn-secondary" onClick={() => deleteLesson(moduleNode.id, lesson.id)}>X</button>
                        </div>
                      </div>
                    ))}
                    <button type="button" className="btn-secondary w-full" onClick={() => addLesson(moduleNode.id)}>+ Lesson</button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </aside>

        <main className="overflow-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {!activeLesson ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">Select a lesson to start editing.</div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                <input className="field-input text-lg font-semibold" value={activeLesson.title || ''} onChange={(e) => queueAutosave({ ...activeLesson, title: e.target.value, document: { ...activeLesson.document, title: e.target.value } })} />
                <input className="field-input w-24" type="number" value={activeLesson.duration_minutes || 5} onChange={(e) => queueAutosave({ ...activeLesson, duration_minutes: Number(e.target.value || 5) })} />
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <label className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Upload Media</label>
                <input className="mt-2 block w-full text-sm" type="file" accept="image/*,video/*,.pdf" onChange={uploadMedia} />
                {uploading ? <p className="mt-1 text-xs text-slate-600">Uploading... {uploadProgress}%</p> : null}
              </div>
              <LessonBlockEditor document={activeLesson.document} onChange={(doc) => queueAutosave({ ...activeLesson, document: doc })} />
            </div>
          )}
        </main>

        <aside className="overflow-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="sticky top-0 z-10 border-b border-slate-100 bg-white pb-3">
            <p className="text-sm font-semibold text-slate-900">Course Settings</p>
            <p className="text-xs text-slate-500">Status: <span className="font-semibold text-slate-700">{course?.status || 'draft'}</span></p>
          </div>
          <div className="mt-3 space-y-2">
            <input className="field-input" value={course?.title || ''} onChange={(e) => setCourse((prev) => ({ ...prev, title: e.target.value }))} placeholder="Course title" />
            <textarea className="field-input min-h-[80px]" value={course?.description || ''} onChange={(e) => setCourse((prev) => ({ ...prev, description: e.target.value }))} placeholder="Description" />
            <input className="field-input" type="number" value={course?.duration_minutes || 30} onChange={(e) => setCourse((prev) => ({ ...prev, duration_minutes: Number(e.target.value || 30) }))} placeholder="Duration" />
            <input className="field-input" type="number" min={1} max={100} value={course?.pass_mark || 75} onChange={(e) => setCourse((prev) => ({ ...prev, pass_mark: Number(e.target.value || 75) }))} placeholder="Pass mark" />
            <button type="button" className="btn-primary w-full" onClick={saveCourseSettings}>Save Draft</button>
            <button type="button" className="btn-secondary w-full" disabled={!!actionBusy.unpublish} onClick={unpublishCourse}>{actionBusy.unpublish ? 'Updating...' : 'Unpublish to Draft'}</button>
            <button type="button" className="btn-secondary w-full" disabled={!!actionBusy.archive} onClick={archiveCourse}>{actionBusy.archive ? 'Archiving...' : 'Archive'}</button>
            <a className="btn-secondary block w-full text-center" href={`/dashboard/courses/${courseId}/player`} target="_blank" rel="noreferrer">Learner Preview</a>
          </div>

          <div className="mt-5 border-t border-slate-200 pt-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900">Quiz Builder</p>
              <button type="button" className="btn-secondary" onClick={() => setShowQuizPreview((prev) => !prev)}>{showQuizPreview ? 'Hide Preview' : 'Preview Quiz'}</button>
            </div>
            {quizError ? <p className="mb-2 text-xs text-rose-600">{quizError}</p> : null}
            {quizNotice ? <p className="mb-2 text-xs text-emerald-700">{quizNotice}</p> : null}
            <textarea className="field-input min-h-[70px]" value={questionDraft.question_text} onChange={(e) => setQuestionDraft((prev) => ({ ...prev, question_text: e.target.value }))} placeholder="Question text" />
            <div className="mt-2 space-y-1">
              {questionDraft.options.map((opt, idx) => (
                <input key={idx} className="field-input" value={opt} onChange={(e) => setQuestionDraft((prev) => ({ ...prev, options: prev.options.map((o, i) => i === idx ? e.target.value : o) }))} placeholder={`Option ${idx + 1}`} />
              ))}
              <button type="button" className="btn-secondary w-full" onClick={() => setQuestionDraft((prev) => ({ ...prev, options: [...prev.options, ''] }))}>Add Option</button>
            </div>
            <select className="field-input mt-2" value={questionDraft.correct_answer} onChange={(e) => setQuestionDraft((prev) => ({ ...prev, correct_answer: e.target.value }))}>
              <option value="">Select correct answer</option>
              {questionDraft.options.map((opt, idx) => (
                <option key={`draft-correct-${idx}`} value={idx}>{opt || `Option ${idx + 1}`}</option>
              ))}
            </select>
            <button type="button" className="btn-primary mt-2 w-full" onClick={addQuestion}>Add Question</button>
            {!questions.length ? (
              <p className="mt-3 rounded border border-dashed border-slate-300 p-3 text-xs text-slate-500">No quiz questions yet. Add your first question to build learner assessment.</p>
            ) : null}
            <div className="mt-3 max-h-72 space-y-2 overflow-auto">
              {questions.map((q, index) => (
                <div key={q.id} className="rounded-lg border border-slate-200 p-2">
                  <textarea className="field-input min-h-[60px]" value={q.question_text || ''} onChange={(e) => setQuestions((prev) => prev.map((item) => item.id === q.id ? { ...item, question_text: e.target.value } : item))} onBlur={(e) => updateQuestion({ ...q, question_text: e.target.value })} />
                  <div className="mt-1 space-y-1">
                    {(q.options || []).map((opt, optIndex) => (
                      <input key={`${q.id}-${optIndex}`} className="field-input" value={opt} onChange={(e) => setQuestions((prev) => prev.map((item) => item.id === q.id ? { ...item, options: (item.options || []).map((o, i) => i === optIndex ? e.target.value : o) } : item))} onBlur={() => updateQuestion(questions.find((item) => item.id === q.id))} />
                    ))}
                  </div>
                  <select className="field-input mt-1" value={q.correct_answer ?? ''} onChange={(e) => setQuestions((prev) => prev.map((item) => item.id === q.id ? { ...item, correct_answer: e.target.value === '' ? '' : Number(e.target.value) } : item))} onBlur={() => updateQuestion(questions.find((item) => item.id === q.id))}>
                    <option value="">Select correct answer</option>
                    {(q.options || []).map((opt, optIndex) => (
                      <option key={`${q.id}-correct-${optIndex}`} value={optIndex}>{opt || `Option ${optIndex + 1}`}</option>
                    ))}
                  </select>
                  <div className="mt-1 flex gap-1">
                    <button type="button" className="btn-secondary" onClick={() => reorderQuestion(index, -1)}>Up</button>
                    <button type="button" className="btn-secondary" onClick={() => reorderQuestion(index, 1)}>Down</button>
                    <button type="button" className="btn-secondary" onClick={() => deleteQuestion(q.id)}>Delete</button>
                    {savingQuestionId === q.id ? <span className="px-2 py-1 text-[11px] text-slate-500">Saving...</span> : null}
                  </div>
                </div>
              ))}
            </div>
            {showQuizPreview ? (
              <div className="mt-4 rounded-lg border border-indigo-200 bg-indigo-50/40 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-indigo-700">Learner Preview</p>
                <div className="mt-2 max-h-64 space-y-2 overflow-auto">
                  {questions.map((q, idx) => (
                    <div key={`preview-${q.id}`} className="rounded border border-indigo-100 bg-white p-2">
                      <p className="text-xs font-medium text-slate-800">{idx + 1}. {q.question_text}</p>
                      <select className="field-input mt-1" value={previewAnswers[q.id] || ''} onChange={(e) => setPreviewAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}>
                        <option value="">Choose answer</option>
                        {(q.options || []).map((opt, optIndex) => (
                          <option key={`preview-${q.id}-${optIndex}`} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
                <div className="mt-2 text-xs text-slate-700">
                  Score: <span className="font-semibold">{quizPreviewScore.score}%</span> ({quizPreviewScore.correct}/{quizPreviewScore.total}) · Pass mark {quizPreviewScore.passMark || 75}% · <span className={quizPreviewScore.pass ? 'text-emerald-700 font-semibold' : 'text-rose-700 font-semibold'}>{quizPreviewScore.pass ? 'PASS' : 'FAIL'}</span>
                </div>
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
