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

  const AUTOSAVE_COLORS = {
    idle: 'text-slate-400',
    dirty: 'text-amber-600',
    saving: 'text-indigo-600',
    saved: 'text-emerald-600',
    error: 'text-rose-600',
  };
  const AUTOSAVE_ICONS = {
    idle: '○',
    dirty: '●',
    saving: '↻',
    saved: '✓',
    error: '✕',
  };
  const STATUS_COLORS = {
    published: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    draft: 'bg-amber-100 text-amber-800 border-amber-200',
    archived: 'bg-slate-100 text-slate-600 border-slate-200',
  };

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-5rem)] items-center justify-center bg-slate-50">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-slate-500 font-medium">Loading course studio…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-5rem)] overflow-auto bg-slate-50 lg:h-[calc(100vh-5rem)] lg:overflow-hidden">

      {/* ── Top Bar ─────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 border-b border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between px-5 py-3">
          <div className="flex items-center gap-4 min-w-0">
            <Link
              href="/admin/trainings"
              className="flex-shrink-0 flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Trainings
            </Link>
            <div className="h-4 w-px bg-slate-200" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-base font-semibold text-slate-900 truncate max-w-xs">{course?.title || 'Untitled course'}</h1>
                <span className={`flex-shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_COLORS[course?.status || 'draft']}`}>
                  {(course?.status || 'draft').toUpperCase()}
                </span>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`text-xs font-mono ${AUTOSAVE_COLORS[autosave.state]}`}>{AUTOSAVE_ICONS[autosave.state]}</span>
                <span className={`text-xs ${AUTOSAVE_COLORS[autosave.state]}`}>{autosaveHint || 'All changes saved'}</span>
                {autosave.state === 'error' && activeLesson ? (
                  <button type="button" className="text-xs font-semibold text-rose-600 underline hover:text-rose-800" onClick={() => saveLesson(activeLesson, true)}>Retry</button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              disabled={!!actionBusy.duplicate}
              onClick={duplicateCourse}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              {actionBusy.duplicate ? 'Duplicating…' : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
                  Duplicate
                </>
              )}
            </button>
            <button
              type="button"
              disabled={!activeLesson || autosave.state === 'saving'}
              onClick={() => activeLesson && saveLesson(activeLesson, true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-40 transition-colors"
            >
              {autosave.state === 'saving' ? (
                <span className="animate-spin inline-block">↻</span>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
              )}
              {autosave.state === 'saving' ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              disabled={publishing || !!actionBusy.publish}
              onClick={publishCourse}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60 transition-colors"
            >
              {(publishing || actionBusy.publish) ? (
                <><span className="animate-spin inline-block">↻</span> Publishing…</>
              ) : (
                <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg> Publish</>
              )}
            </button>
          </div>
        </div>

        {/* Notice / Error strip */}
        {notice ? (
          <div className="border-t border-emerald-100 bg-emerald-50 px-5 py-2 flex items-center gap-2">
            <svg className="w-3.5 h-3.5 text-emerald-600" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
            <p className="text-sm text-emerald-800 font-medium">{notice}</p>
          </div>
        ) : null}
        {error ? (
          <div className="border-t border-rose-100 bg-rose-50 px-5 py-2 flex items-center gap-2">
            <svg className="w-3.5 h-3.5 text-rose-600" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
            <p className="text-sm text-rose-700">{error}</p>
          </div>
        ) : null}
      </div>

      {/* ── Three-Panel Layout ───────────────────────────────────────── */}
      <div className="flex flex-col gap-0 overflow-auto lg:grid lg:h-[calc(100%-64px)] lg:grid-cols-[300px_1fr_340px] lg:overflow-hidden">

        {/* ── LEFT: Module Navigator ──────────────────────────────── */}
        <aside className="overflow-auto border-r border-slate-200 bg-white lg:border-r">
          <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Structure</p>
              <p className="text-sm font-semibold text-slate-900 mt-0.5">{modules.length} module{modules.length !== 1 ? 's' : ''}</p>
            </div>
            <button
              type="button"
              onClick={addModule}
              className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
              Module
            </button>
          </div>

          <div className="p-3 space-y-2">
            {!modules.length ? (
              <div className="rounded-xl border-2 border-dashed border-slate-200 p-8 text-center">
                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
                  <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                </div>
                <p className="text-sm font-semibold text-slate-600 mb-1">No modules yet</p>
                <p className="text-xs text-slate-400">Click <strong>+ Module</strong> above to build your course structure</p>
              </div>
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
                className={`rounded-xl border transition-all duration-150 overflow-hidden
                  ${moduleDropIndex === moduleIndex ? 'border-indigo-400 shadow-md shadow-indigo-100' : 'border-slate-200'}
                  ${draggingModuleId === moduleNode.id ? 'opacity-50 scale-98' : ''}
                  ${activeModuleId === moduleNode.id ? 'shadow-sm' : ''}
                `}
              >
                {/* Module header */}
                <div className={`flex items-center gap-2 px-3 py-2.5 ${activeModuleId === moduleNode.id ? 'bg-indigo-50' : 'bg-slate-50'}`}>
                  <span className="cursor-grab text-slate-300 hover:text-slate-500 transition-colors select-none text-sm">⠿</span>
                  <div className="flex-shrink-0 w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center">
                    <span className="text-[10px] font-bold text-indigo-700">{moduleIndex + 1}</span>
                  </div>
                  <input
                    className="flex-1 bg-transparent text-sm font-semibold text-slate-800 outline-none placeholder:text-slate-400 focus:text-slate-900 min-w-0"
                    value={moduleNode.title || ''}
                    placeholder="Module title…"
                    onChange={(e) => setModules((prev) => prev.map((m) => m.id === moduleNode.id ? { ...m, title: e.target.value } : m))}
                    onBlur={(e) => updateModuleTitle(moduleNode, e.target.value)}
                  />
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => setExpanded((prev) => ({ ...prev, [moduleNode.id]: !prev[moduleNode.id] }))}
                      className="w-5 h-5 rounded flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-white transition-colors text-xs"
                    >
                      {expanded[moduleNode.id] ? '▲' : '▼'}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteModule(moduleNode.id)}
                      className="w-5 h-5 rounded flex items-center justify-center text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-colors"
                      title="Delete module"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                </div>

                {/* Lessons */}
                {expanded[moduleNode.id] ? (
                  <div
                    className="p-2 space-y-1 bg-white"
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
                    {!(moduleNode.lessons || []).length ? (
                      <p className="text-center text-[11px] text-slate-400 py-2">No lessons — click + Lesson to add</p>
                    ) : null}

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
                        className={`group flex items-center gap-2 rounded-lg px-2.5 py-2 cursor-pointer transition-all
                          ${activeLesson?.id === lesson.id ? 'bg-indigo-600 shadow-sm' : 'hover:bg-slate-50'}
                          ${lessonDrop.moduleId === moduleNode.id && lessonDrop.index === lessonIndex ? 'ring-2 ring-indigo-300 ring-offset-1' : ''}
                        `}
                        onClick={() => openLesson(moduleNode.id, lesson.id)}
                      >
                        <span className="cursor-grab text-slate-300 group-hover:text-slate-400 select-none text-xs flex-shrink-0">⠿</span>
                        <svg className={`w-3.5 h-3.5 flex-shrink-0 ${activeLesson?.id === lesson.id ? 'text-indigo-200' : 'text-slate-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <span
                          className={`flex-1 text-xs font-medium truncate ${activeLesson?.id === lesson.id ? 'text-white' : 'text-slate-700'}`}
                          title={lesson.title}
                        >
                          {lesson.title || 'Untitled lesson'}
                        </span>
                        <span className={`text-[10px] flex-shrink-0 ${activeLesson?.id === lesson.id ? 'text-indigo-200' : 'text-slate-400'}`}>{lesson.duration_minutes || 5}m</span>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); deleteLesson(moduleNode.id, lesson.id); }}
                          className={`flex-shrink-0 w-4 h-4 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity
                            ${activeLesson?.id === lesson.id ? 'text-indigo-200 hover:text-white hover:bg-indigo-500' : 'text-slate-300 hover:text-rose-500 hover:bg-rose-50'}`}
                          title="Delete lesson"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    ))}

                    <button
                      type="button"
                      onClick={() => addLesson(moduleNode.id)}
                      className="w-full flex items-center gap-2 rounded-lg border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-400 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50/40 transition-all"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                      Add lesson
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </aside>

        {/* ── CENTRE: Lesson Editor ────────────────────────────────── */}
        <main className="overflow-auto bg-white border-r border-slate-200">
          {!activeLesson ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[400px] p-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </div>
              <h3 className="text-base font-semibold text-slate-700 mb-2">Select a lesson to edit</h3>
              <p className="text-sm text-slate-400 max-w-xs">Choose a lesson from the left panel, or add a new module and lesson to get started.</p>
              {!modules.length ? (
                <button type="button" onClick={addModule} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors shadow-sm">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                  Add First Module
                </button>
              ) : null}
            </div>
          ) : (
            <div className="p-5 space-y-5">
              {/* Lesson title + duration */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-2 block">Lesson Title</label>
                <input
                  className="w-full bg-transparent text-lg font-semibold text-slate-900 outline-none placeholder:text-slate-300 focus:ring-0 border-0"
                  value={activeLesson.title || ''}
                  placeholder="Untitled lesson…"
                  onChange={(e) => queueAutosave({ ...activeLesson, title: e.target.value, document: { ...activeLesson.document, title: e.target.value } })}
                />
                <div className="mt-3 flex items-center gap-3 pt-3 border-t border-slate-200">
                  <label className="text-xs text-slate-500 flex-shrink-0">Duration (min)</label>
                  <input
                    className="w-20 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent"
                    type="number"
                    min={1}
                    value={activeLesson.duration_minutes || 5}
                    onChange={(e) => queueAutosave({ ...activeLesson, duration_minutes: Number(e.target.value || 5) })}
                  />
                  <span className="text-xs text-slate-400">Ctrl/⌘+S to force save</span>
                </div>
              </div>

              {/* Media upload */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-3 block">Upload Media</label>
                <label className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-200 p-6 cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors">
                  <svg className="w-7 h-7 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                  <span className="text-sm text-slate-500 font-medium">Drop files here or click to upload</span>
                  <span className="text-xs text-slate-400">Images, videos, PDFs supported</span>
                  <input type="file" accept="image/*,video/*,.pdf" className="hidden" onChange={uploadMedia} />
                </label>
                {uploading ? (
                  <div className="mt-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-slate-600">Uploading…</span>
                      <span className="text-xs font-semibold text-indigo-700">{uploadProgress}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: uploadProgress + '%' }} />
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Block editor */}
              <LessonBlockEditor document={activeLesson.document} onChange={(doc) => queueAutosave({ ...activeLesson, document: doc })} />
            </div>
          )}
        </main>

        {/* ── RIGHT: Settings + Quiz Builder ──────────────────────── */}
        <aside className="overflow-auto bg-white">

          {/* Course Settings */}
          <div className="border-b border-slate-200">
            <div className="px-4 pt-4 pb-3">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Course Settings</p>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_COLORS[course?.status || 'draft']}`}>
                  {(course?.status || 'draft').toUpperCase()}
                </span>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs text-slate-500 font-medium block mb-1">Title</label>
                  <input
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent"
                    value={course?.title || ''}
                    onChange={(e) => setCourse((prev) => ({ ...prev, title: e.target.value }))}
                    placeholder="Course title"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 font-medium block mb-1">Description</label>
                  <textarea
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent min-h-[70px] resize-none"
                    value={course?.description || ''}
                    onChange={(e) => setCourse((prev) => ({ ...prev, description: e.target.value }))}
                    placeholder="Describe this course…"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-slate-500 font-medium block mb-1">Duration (min)</label>
                    <input type="number" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-indigo-300" value={course?.duration_minutes || 30} onChange={(e) => setCourse((prev) => ({ ...prev, duration_minutes: Number(e.target.value || 30) }))} />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 font-medium block mb-1">Pass mark (%)</label>
                    <input type="number" min={1} max={100} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-indigo-300" value={course?.pass_mark || 75} onChange={(e) => setCourse((prev) => ({ ...prev, pass_mark: Number(e.target.value || 75) }))} />
                  </div>
                </div>
                <button type="button" onClick={saveCourseSettings} className="w-full rounded-lg bg-slate-900 py-2 text-xs font-semibold text-white hover:bg-slate-700 transition-colors">
                  Save Settings
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={!!actionBusy.unpublish}
                    onClick={unpublishCourse}
                    className="rounded-lg border border-slate-200 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
                  >
                    {actionBusy.unpublish ? 'Updating…' : 'Unpublish'}
                  </button>
                  <button
                    type="button"
                    disabled={!!actionBusy.archive}
                    onClick={archiveCourse}
                    className="rounded-lg border border-slate-200 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
                  >
                    {actionBusy.archive ? 'Archiving…' : 'Archive'}
                  </button>
                </div>
                <a
                  href={`/dashboard/courses/${courseId}/player`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-2 w-full rounded-lg border border-indigo-200 bg-indigo-50 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  Learner Preview
                </a>
              </div>
            </div>
          </div>

          {/* Quiz Builder */}
          <div className="px-4 pt-4 pb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Quiz Builder</p>
                <p className="text-sm font-semibold text-slate-900 mt-0.5">{questions.length} question{questions.length !== 1 ? 's' : ''}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowQuizPreview((prev) => !prev)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${showQuizPreview ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                {showQuizPreview ? 'Hide' : 'Preview'}
              </button>
            </div>

            {/* Feedback messages */}
            {quizError ? (
              <div className="mb-3 rounded-xl bg-rose-50 border border-rose-200 px-3 py-2.5 flex items-center gap-2">
                <svg className="w-4 h-4 text-rose-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                <p className="text-xs text-rose-700 font-medium">{quizError}</p>
              </div>
            ) : null}
            {quizNotice ? (
              <div className="mb-3 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2.5 flex items-center gap-2">
                <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                <p className="text-xs text-emerald-700 font-medium">{quizNotice}</p>
              </div>
            ) : null}

            {/* Add question form */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 mb-4">
              <p className="text-xs font-semibold text-slate-600 mb-2">New Question</p>
              <textarea
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent resize-none min-h-[70px]"
                value={questionDraft.question_text}
                onChange={(e) => setQuestionDraft((prev) => ({ ...prev, question_text: e.target.value }))}
                placeholder="Type your question here…"
              />

              <div className="mt-2 space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Answer Options</p>
                {questionDraft.options.map((opt, idx) => (
                  <div key={idx} className="flex items-center gap-1.5">
                    <div className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px] font-bold
                      ${String(questionDraft.correct_answer) === String(idx) ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 text-slate-500'}`}>
                      {String.fromCharCode(65 + idx)}
                    </div>
                    <input
                      className="flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent"
                      value={opt}
                      onChange={(e) => setQuestionDraft((prev) => ({ ...prev, options: prev.options.map((o, i) => i === idx ? e.target.value : o) }))}
                      placeholder={`Option ${String.fromCharCode(65 + idx)}`}
                    />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setQuestionDraft((prev) => ({ ...prev, options: [...prev.options, ''] }))}
                  className="w-full text-center py-1.5 rounded-lg border border-dashed border-slate-200 text-xs text-slate-400 hover:border-indigo-300 hover:text-indigo-600 transition-colors"
                >
                  + Add option
                </button>
              </div>

              <div className="mt-2">
                <label className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 mb-1.5 block">Correct Answer</label>
                <select
                  className="w-full rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 font-medium outline-none focus:ring-2 focus:ring-emerald-300"
                  value={questionDraft.correct_answer}
                  onChange={(e) => setQuestionDraft((prev) => ({ ...prev, correct_answer: e.target.value }))}
                >
                  <option value="">Select correct answer…</option>
                  {questionDraft.options.map((opt, idx) => (
                    <option key={`draft-correct-${idx}`} value={idx}>{String.fromCharCode(65 + idx)}. {opt || `Option ${idx + 1}`}</option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={addQuestion}
                className="w-full mt-3 rounded-lg bg-indigo-600 py-2 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors flex items-center justify-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                Add Question
              </button>
            </div>

            {/* Existing questions */}
            {!questions.length ? (
              <div className="rounded-xl border-2 border-dashed border-slate-200 p-6 text-center">
                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-2">
                  <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
                <p className="text-xs font-semibold text-slate-500 mb-1">No questions yet</p>
                <p className="text-[11px] text-slate-400">Build your assessment using the form above</p>
              </div>
            ) : null}

            <div className="space-y-2 max-h-64 overflow-auto">
              {questions.map((q, index) => (
                <div key={q.id} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                  <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 border-b border-slate-100">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center text-[10px] font-bold text-indigo-700">{index + 1}</span>
                    <p className="flex-1 text-xs font-medium text-slate-700 truncate">{q.question_text || 'Untitled question'}</p>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button type="button" onClick={() => reorderQuestion(index, -1)} className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-slate-700 text-xs rounded hover:bg-slate-100">↑</button>
                      <button type="button" onClick={() => reorderQuestion(index, 1)} className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-slate-700 text-xs rounded hover:bg-slate-100">↓</button>
                      <button type="button" onClick={() => deleteQuestion(q.id)} className="w-5 h-5 flex items-center justify-center text-slate-300 hover:text-rose-500 rounded hover:bg-rose-50 transition-colors">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                      {savingQuestionId === q.id ? <span className="text-[10px] text-indigo-500 animate-pulse">saving</span> : null}
                    </div>
                  </div>
                  <div className="p-2.5 space-y-1.5">
                    <textarea
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent resize-none min-h-[50px]"
                      value={q.question_text || ''}
                      onChange={(e) => setQuestions((prev) => prev.map((item) => item.id === q.id ? { ...item, question_text: e.target.value } : item))}
                      onBlur={(e) => updateQuestion({ ...q, question_text: e.target.value })}
                    />
                    <div className="space-y-1">
                      {(q.options || []).map((opt, optIndex) => (
                        <div key={`${q.id}-${optIndex}`} className="flex items-center gap-1.5">
                          <div className={`flex-shrink-0 w-4 h-4 rounded-full border flex items-center justify-center text-[9px] font-bold
                            ${q.correct_answer === optIndex ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 text-slate-400'}`}>
                            {String.fromCharCode(65 + optIndex)}
                          </div>
                          <input
                            className="flex-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 outline-none focus:ring-1 focus:ring-indigo-300"
                            value={opt}
                            onChange={(e) => setQuestions((prev) => prev.map((item) => item.id === q.id ? { ...item, options: (item.options || []).map((o, i) => i === optIndex ? e.target.value : o) } : item))}
                            onBlur={() => updateQuestion(questions.find((item) => item.id === q.id))}
                          />
                        </div>
                      ))}
                    </div>
                    <select
                      className="w-full rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-800 font-medium outline-none focus:ring-2 focus:ring-emerald-300"
                      value={q.correct_answer ?? ''}
                      onChange={(e) => setQuestions((prev) => prev.map((item) => item.id === q.id ? { ...item, correct_answer: e.target.value === '' ? '' : Number(e.target.value) } : item))}
                      onBlur={() => updateQuestion(questions.find((item) => item.id === q.id))}
                    >
                      <option value="">Select correct answer</option>
                      {(q.options || []).map((opt, optIndex) => (
                        <option key={`${q.id}-correct-${optIndex}`} value={optIndex}>{String.fromCharCode(65 + optIndex)}. {opt || `Option ${optIndex + 1}`}</option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>

            {/* Quiz Preview Mode */}
            {showQuizPreview && questions.length > 0 ? (
              <div className="mt-4 rounded-2xl border border-indigo-200 bg-gradient-to-b from-indigo-50 to-white p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center">
                    <svg className="w-3.5 h-3.5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /></svg>
                  </div>
                  <p className="text-xs font-bold text-indigo-700 uppercase tracking-[0.12em]">Learner Simulation</p>
                </div>
                <div className="space-y-3 max-h-56 overflow-auto">
                  {questions.map((q, idx) => (
                    <div key={`preview-${q.id}`} className="rounded-xl border border-indigo-100 bg-white p-3 shadow-sm">
                      <p className="text-xs font-semibold text-slate-800 mb-2">{idx + 1}. {q.question_text}</p>
                      <div className="space-y-1.5">
                        {(q.options || []).map((opt, optIdx) => (
                          <button
                            key={`prev-opt-${q.id}-${optIdx}`}
                            type="button"
                            onClick={() => setPreviewAnswers((prev) => ({ ...prev, [q.id]: optIdx }))}
                            className={`w-full text-left flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-all
                              ${previewAnswers[q.id] === optIdx ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-700 hover:bg-slate-100'}`}
                          >
                            <span className={`flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold
                              ${previewAnswers[q.id] === optIdx ? 'bg-white text-indigo-700' : 'bg-white text-slate-500 border border-slate-300'}`}>
                              {String.fromCharCode(65 + optIdx)}
                            </span>
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 rounded-xl bg-white border border-slate-200 px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Score</p>
                    <p className="text-2xl font-bold text-slate-900">{quizPreviewScore.score}<span className="text-sm text-slate-400">%</span></p>
                    <p className="text-[11px] text-slate-500">{quizPreviewScore.correct}/{quizPreviewScore.total} correct · pass ≥{quizPreviewScore.passMark || 75}%</p>
                  </div>
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold
                    ${quizPreviewScore.pass ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-600'}`}>
                    {quizPreviewScore.pass ? '✓' : '✗'}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
