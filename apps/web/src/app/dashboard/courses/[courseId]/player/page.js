'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import useAuth from '@/hooks/useAuth';
import api from '@/lib/api';
import SlideView from '@/components/player/SlideView';
import QuizView from '@/components/player/QuizView';
import CertificateView from '@/components/player/CertificateView';

const PHASE = {
  LOADING: 'loading',
  SLIDES: 'slides',
  LESSON_QUIZ: 'lesson_quiz',
  QUIZ: 'quiz',
  RESULT: 'result',
  CERT: 'cert',
};

function parseLessonContent(lesson) {
  let content = lesson?.content;
  if (typeof content === 'string') {
    try {
      content = JSON.parse(content);
    } catch {
      content = {};
    }
  }
  return content || {};
}

export default function CoursePlayerPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const courseId = params.courseId;

  const [phase, setPhase] = useState(PHASE.LOADING);
  const [course, setCourse] = useState(null);
  const [enrollment, setEnrollment] = useState(null);
  const [allLessons, setAllLessons] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [completedLessonIds, setCompletedLessonIds] = useState(new Set());
  const [quizQuestions, setQuizQuestions] = useState([]);
  const [quizAttempt, setQuizAttempt] = useState(1);
  const [quizResult, setQuizResult] = useState(null);
  const [certificate, setCertificate] = useState(null);
  const [error, setError] = useState('');
  const [transitioning, setTransitioning] = useState(false);
  const [smartRuntime, setSmartRuntime] = useState(null);

  // Lesson quiz state
  const [lessonQuizQuestions, setLessonQuizQuestions] = useState([]);
  const [lessonQuizLessonNumber, setLessonQuizLessonNumber] = useState(null);
  const [lessonQuizAttempt, setLessonQuizAttempt] = useState(0);
  const [lessonQuizPassed, setLessonQuizPassed] = useState(false);

  const resumeKey = `carelearn-player-resume-${courseId}`;
  const allLessonsCompleted = allLessons.length > 0 && allLessons.every((l) => completedLessonIds.has(l.id));

  useEffect(() => {
    if (!loading && !user) router.push('/login');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user || !courseId) return;

    const init = async () => {
      try {
        const courseRes = await api.get(`/courses/${courseId}`);
        const courseData = courseRes.data.course;
        setCourse(courseData);
        const smart = await api.get(`/courses/${courseId}/smart-runtime`).catch(() => ({ data: {} }));
        setSmartRuntime(smart.data?.smart_runtime || null);

        let lessons = [];
        if (courseData?.runtime_snapshot?.render?.lessonBlocks?.length) {
          lessons = [{
            id: `published-runtime-${courseId}`,
            title: courseData.runtime_snapshot?.canonical?.title || courseData.title || 'Published Lesson',
            module_title: 'Published Runtime',
            content: {
              schema_version: 3,
              title: courseData.runtime_snapshot?.canonical?.title || courseData.title || 'Published Lesson',
              blocks: courseData.runtime_snapshot.render.lessonBlocks,
              metadata: { deterministic: true, source: 'published_snapshot' },
            },
          }];
        } else {
          for (const courseModule of courseData.modules || []) {
            for (const lesson of courseModule.lessons || []) {
              if (!lesson?.id) continue;
              lessons.push({
                ...lesson,
                content: parseLessonContent(lesson),
                module_title: courseModule.title,
              });
            }
          }
        }
        setAllLessons(lessons);

        const enrollRes = await api.get('/enrollments/my');
        let existingEnrollment = enrollRes.data.enrollments?.find((item) => item.course_id === courseId);
        if (!existingEnrollment) {
          const newEnrollment = await api.post('/enrollments', {
            user_id: user.id,
            course_id: courseId,
          });
          existingEnrollment = newEnrollment.data.enrollment;
        }
        setEnrollment(existingEnrollment);

        const progressRes = await api
          .get(`/enrollments/${existingEnrollment.id}/progress`)
          .catch(() => ({ data: { progress: [] } }));
        const doneIds = new Set(
          (progressRes.data.progress || [])
            .filter((p) => p.completed)
            .map((p) => p.lesson_id),
        );
        setCompletedLessonIds(doneIds);

        const nextIncomplete = lessons.findIndex((l) => !doneIds.has(l.id));
        const persisted = Number(localStorage.getItem(resumeKey));
        const safePersisted = Number.isInteger(persisted) && persisted >= 0 && persisted < lessons.length ? persisted : null;
        setCurrentIndex(safePersisted ?? (nextIncomplete === -1 ? Math.max(lessons.length - 1, 0) : nextIncomplete));
        setPhase(PHASE.SLIDES);
      } catch (err) {
        console.error(err);
        setError('Failed to load course. Please try again.');
      }
    };

    init();
  }, [user, courseId, resumeKey]);

  useEffect(() => {
    localStorage.setItem(resumeKey, String(currentIndex));
  }, [currentIndex, resumeKey]);

  const markLessonComplete = useCallback(async (lessonId) => {
    if (!enrollment?.id || completedLessonIds.has(lessonId)) return;
    await api.put('/enrollments/progress', {
      enrollment_id: enrollment.id,
      lesson_id: lessonId,
      time_spent_seconds: 60,
    });
    setCompletedLessonIds((prev) => {
      const next = new Set(prev);
      next.add(lessonId);
      return next;
    });
  }, [completedLessonIds, enrollment]);

  const loadFinalQuiz = useCallback(async (attempt = 1) => {
    const response = await api.get(`/courses/${courseId}/questions?is_final=true`);
    setQuizQuestions(response.data.questions || []);
    setQuizAttempt(attempt);
    setQuizResult(null);
    setPhase(PHASE.QUIZ);
  }, [courseId]);

  const handleNext = useCallback(async () => {
    const lesson = allLessons[currentIndex];
    if (!lesson) return;

    // Already completed — advance directly without re-quizzing
    if (completedLessonIds.has(lesson.id)) {
      if (currentIndex < allLessons.length - 1) {
        setTransitioning(true);
        setCurrentIndex((i) => i + 1);
        setTimeout(() => setTransitioning(false), 220);
      } else {
        await loadFinalQuiz(1);
      }
      return;
    }

    // Try to load a lesson quiz
    const lessonNum = lesson.lesson_number || currentIndex + 1;
    try {
      const response = await api.get(`/courses/${courseId}/questions?is_final=false&lesson_number=${lessonNum}`);
      const questions = response.data.questions || [];
      if (questions.length > 0) {
        setLessonQuizQuestions(questions);
        setLessonQuizLessonNumber(lessonNum);
        setLessonQuizAttempt((a) => a + 1);
        setLessonQuizPassed(false);
        setPhase(PHASE.LESSON_QUIZ);
        return;
      }
    } catch (e) {
      console.error('Lesson quiz load failed, advancing without gate:', e);
    }

    // No quiz for this lesson — mark complete and advance
    await markLessonComplete(lesson.id);
    if (currentIndex < allLessons.length - 1) {
      setTransitioning(true);
      setCurrentIndex((i) => i + 1);
      setTimeout(() => setTransitioning(false), 220);
    } else {
      await loadFinalQuiz(1);
    }
  }, [allLessons, completedLessonIds, courseId, currentIndex, loadFinalQuiz, markLessonComplete]);

  const handlePrev = () => {
    if (currentIndex > 0) {
      setTransitioning(true);
      setCurrentIndex((i) => i - 1);
      setTimeout(() => setTransitioning(false), 220);
    }
  };

  const handleLessonSelect = (index) => setCurrentIndex(index);

  // Called by QuizView immediately when quiz is submitted (pass or fail)
  const handleLessonQuizComplete = useCallback((result) => {
    if (result.passed) {
      setLessonQuizPassed(true);
      // QuizView shows pass screen; user clicks "Continue to Next Lesson" → handleLessonQuizExit
    }
    // On fail: QuizView handles retry internally — no parent action needed
  }, []);

  // Called when user clicks "Continue to Next Lesson" (pass) or "Exit to Course" (fail)
  const handleLessonQuizExit = useCallback(async () => {
    if (lessonQuizPassed) {
      const lesson = allLessons[currentIndex];
      if (lesson) await markLessonComplete(lesson.id);
      if (currentIndex < allLessons.length - 1) {
        setTransitioning(true);
        setCurrentIndex((i) => i + 1);
        setTimeout(() => setTransitioning(false), 220);
        setPhase(PHASE.SLIDES);
      } else {
        await loadFinalQuiz(1);
      }
    } else {
      setPhase(PHASE.SLIDES);
    }
    setLessonQuizPassed(false);
  }, [allLessons, currentIndex, lessonQuizPassed, loadFinalQuiz, markLessonComplete]);

  const issueCertificate = useCallback(async () => {
    if (!enrollment?.id || !user?.id) return;
    const certRes = await api.post('/certificates', {
      enrollment_id: enrollment.id,
      user_id: user.id,
      course_id: courseId,
      organisation_id: enrollment.organisation_id || null,
    });
    setCertificate(certRes.data.certificate);
    setPhase(PHASE.CERT);
  }, [courseId, enrollment, user]);

  const handleFinalQuizComplete = useCallback(async (result) => {
    setQuizResult(result);
    if (!result.passed) {
      setPhase(PHASE.RESULT);
      return;
    }
    await issueCertificate();
  }, [issueCertificate]);

  const handleRetryFinalQuiz = async () => {
    await loadFinalQuiz(quizAttempt + 1);
  };

  const handleGoToQuiz = async () => {
    if (!allLessonsCompleted) return;
    await loadFinalQuiz(1);
  };

  if (loading || !user) return null;

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center p-8 max-w-md">
          <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold text-red-500">!</div>
          <p className="text-red-600 mb-2 font-semibold text-lg">Something went wrong</p>
          <p className="text-gray-500 text-sm mb-6">{error}</p>
          <button
            onClick={() => { setError(''); window.location.reload(); }}
            className="px-5 py-2.5 bg-[#0D1F3C] text-white rounded-lg text-sm font-medium hover:bg-[#1a3560] transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (phase === PHASE.LOADING) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-full max-w-xl space-y-3 p-4">
          <div className="h-7 w-2/3 animate-pulse rounded bg-slate-200" />
          <div className="h-20 animate-pulse rounded bg-slate-200" />
          <div className="h-20 animate-pulse rounded bg-slate-200" />
          <p className="text-gray-400 text-sm">Preparing your learning session...</p>
        </div>
      </div>
    );
  }

  if (phase === PHASE.SLIDES) {
    return (
      <div className={`transition-opacity duration-200 ${transitioning ? 'opacity-60' : 'opacity-100'}`}>
        {smartRuntime ? (
          <div className="mx-auto mt-4 max-w-5xl rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-slate-700">
            <p className="font-semibold text-slate-900">Smart Recommendation: {smartRuntime.recommendations?.action || 'resume_lessons'}</p>
            <p className="mt-1">
              Completed {smartRuntime.completion?.completed_lessons || 0}/{smartRuntime.completion?.total_lessons || 0} lesson blocks.
            </p>
          </div>
        ) : null}
        <SlideView
          course={course}
          modules={course?.modules || []}
          lessons={allLessons}
          currentIndex={currentIndex}
          completedLessonIds={completedLessonIds}
          isThresholdReached={allLessonsCompleted}
          hasQuiz={allLessonsCompleted}
          onNext={handleNext}
          onPrev={handlePrev}
          onLessonSelect={handleLessonSelect}
          onGoToQuiz={handleGoToQuiz}
          onExit={() => router.push('/dashboard/courses')}
        />
      </div>
    );
  }

  if (phase === PHASE.LESSON_QUIZ) {
    return (
      <QuizView
        course={course}
        questions={lessonQuizQuestions}
        enrollmentId={enrollment?.id}
        attemptKey={`lesson-${lessonQuizLessonNumber}-${lessonQuizAttempt}`}
        mode="lesson"
        lessonNumber={lessonQuizLessonNumber}
        onComplete={handleLessonQuizComplete}
        onExit={handleLessonQuizExit}
      />
    );
  }

  if (phase === PHASE.QUIZ) {
    return (
      <QuizView
        course={course}
        questions={quizQuestions}
        enrollmentId={enrollment?.id}
        attemptKey={`final-${quizAttempt}`}
        mode="final"
        onComplete={handleFinalQuizComplete}
        onExit={() => router.push('/dashboard/courses')}
      />
    );
  }

  if (phase === PHASE.RESULT) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 text-3xl font-bold bg-red-100 text-red-500">
            ✗
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Quiz Failed</h2>
          <p className="text-gray-500 mb-1">
            Score: <span className="font-bold text-gray-900">{quizResult?.score}%</span>
            {' '}({quizResult?.correct}/{quizResult?.total} correct)
          </p>
          <p className="text-sm text-gray-500 mb-8">You must achieve at least 75% to pass</p>
          <button
            onClick={handleRetryFinalQuiz}
            className="px-5 py-2.5 bg-[#0D1F3C] text-white rounded-lg text-sm font-medium hover:bg-[#1a3560] transition-colors"
          >
            Retake Quiz
          </button>
        </div>
      </div>
    );
  }

  if (phase === PHASE.CERT) {
    return (
      <CertificateView
        certificate={certificate}
        course={course}
        user={user}
        onDone={() => router.push('/dashboard/courses')}
      />
    );
  }

  return null;
}
