'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import useAuth from '@/hooks/useAuth';
import api from '@/lib/api';
import SlideView from '@/components/player/SlideView';
import QuizView from '@/components/player/QuizView';
import CertificateView from '@/components/player/CertificateView';

const PHASE = { LOADING: 'loading', SLIDES: 'slides', QUIZ: 'quiz', RESULT: 'result', CERT: 'cert' };

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
  const [quizContext, setQuizContext] = useState(null);
  const [quizResult, setQuizResult] = useState(null);
  const [certificate, setCertificate] = useState(null);
  const [error, setError] = useState('');

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

        const lessons = [];
        for (const module of (courseData.modules || [])) {
          const lessonList = Array.isArray(module.lessons) ? module.lessons : [];
          for (const lesson of lessonList) {
            if (!lesson?.id) continue;
            lessons.push({
              ...lesson,
              content: parseLessonContent(lesson),
              module_title: module.title,
            });
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
            .filter((progress) => progress.completed)
            .map((progress) => progress.lesson_id)
        );
        setCompletedLessonIds(doneIds);

        const nextIncomplete = lessons.findIndex((lesson) => !doneIds.has(lesson.id));
        setCurrentIndex(nextIncomplete === -1 ? Math.max(lessons.length - 1, 0) : nextIncomplete);
        setPhase(PHASE.SLIDES);
      } catch (err) {
        console.error(err);
        setError('Failed to load course. Please try again.');
      }
    };

    init();
  }, [user, courseId]);

  const markLessonComplete = useCallback(async (lessonId) => {
    if (!enrollment?.id) return;
    await api.put('/enrollments/progress', {
      enrollment_id: enrollment.id,
      lesson_id: lessonId,
      time_spent_seconds: 60,
    });
    setCompletedLessonIds((previous) => {
      const next = new Set(previous);
      next.add(lessonId);
      return next;
    });
  }, [enrollment]);

  const loadLessonQuiz = useCallback(async (lessonIndex, attempt = 1) => {
    const lesson = allLessons[lessonIndex];
    if (!lesson) return;

    const lessonNumber = lessonIndex + 1;
    const response = await api.get(`/courses/${courseId}/lessons/${lessonNumber}/questions`);
    setQuizContext({
      mode: 'lesson',
      lessonNumber,
      lessonId: lesson.id,
      title: lesson.title,
      questions: response.data.questions || [],
      attempt,
    });
    setPhase(PHASE.QUIZ);
  }, [allLessons, courseId]);

  const loadFinalQuiz = useCallback(async (attempt = 1) => {
    const response = await api.get(`/courses/${courseId}/questions?is_final=true`);
    setQuizContext({
      mode: 'final',
      lessonNumber: null,
      lessonId: null,
      title: 'Final Assessment',
      questions: response.data.questions || [],
      attempt,
    });
    setPhase(PHASE.QUIZ);
  }, [courseId]);

  const handleNext = async () => {
    const lesson = allLessons[currentIndex];
    if (!lesson) return;

    if (completedLessonIds.has(lesson.id)) {
      if (currentIndex < allLessons.length - 1) {
        setCurrentIndex((index) => index + 1);
        return;
      }
      await loadFinalQuiz(1);
      return;
    }

    await loadLessonQuiz(currentIndex, 1);
  };

  const handlePrev = () => {
    if (currentIndex > 0) setCurrentIndex((index) => index - 1);
  };

  const handleLessonSelect = (index) => {
    setCurrentIndex(index);
  };

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

  const handleQuizComplete = useCallback(async (result) => {
    if (!quizContext) return;

    if (!result.passed) {
      setQuizResult(result);
      setPhase(PHASE.RESULT);
      return;
    }

    if (quizContext.mode === 'lesson') {
      await markLessonComplete(quizContext.lessonId);
      if (currentIndex < allLessons.length - 1) {
        setCurrentIndex((index) => index + 1);
        setQuizContext(null);
        setQuizResult(null);
        setPhase(PHASE.SLIDES);
        return;
      }

      setQuizContext(null);
      await loadFinalQuiz(1);
      return;
    }

    setQuizResult(result);
    await issueCertificate();
  }, [allLessons.length, currentIndex, issueCertificate, loadFinalQuiz, markLessonComplete, quizContext]);

  const handleRetryQuiz = async () => {
    if (!quizContext) return;
    setQuizResult(null);
    if (quizContext.mode === 'lesson') {
      await loadLessonQuiz(currentIndex, (quizContext.attempt || 1) + 1);
      return;
    }
    await loadFinalQuiz((quizContext.attempt || 1) + 1);
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
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-[#0D1F3C] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-400 text-sm">Loading course...</p>
        </div>
      </div>
    );
  }

  if (phase === PHASE.SLIDES) {
    return (
      <SlideView
        course={course}
        modules={course?.modules || []}
        lessons={allLessons}
        currentIndex={currentIndex}
        completedLessonIds={completedLessonIds}
        isThresholdReached={false}
        hasQuiz
        onNext={handleNext}
        onPrev={handlePrev}
        onLessonSelect={handleLessonSelect}
        onGoToQuiz={handleNext}
        onExit={() => router.push('/dashboard/courses')}
      />
    );
  }

  if (phase === PHASE.QUIZ && quizContext) {
    return (
      <QuizView
        course={course}
        questions={quizContext.questions}
        enrollmentId={enrollment?.id}
        mode={quizContext.mode}
        lessonNumber={quizContext.lessonNumber}
        attemptKey={`${quizContext.mode}-${quizContext.lessonNumber || 'final'}-${quizContext.attempt}`}
        onComplete={handleQuizComplete}
        onExit={() => router.push('/dashboard/courses')}
      />
    );
  }

  if (phase === PHASE.RESULT) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 text-3xl font-bold bg-red-100 text-red-500">
            ×
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Assessment Failed</h2>
          <p className="text-gray-500 mb-1">
            Score: <span className="font-bold text-gray-900">{quizResult?.score}%</span>
            {' '}({quizResult?.correct}/{quizResult?.total} correct)
          </p>
          <p className="text-sm text-gray-500 mb-8">You must achieve at least 75% to pass.</p>
          <button
            onClick={handleRetryQuiz}
            className="px-5 py-2.5 bg-[#0D1F3C] text-white rounded-lg text-sm font-medium hover:bg-[#1a3560] transition-colors"
          >
            Restart Quiz
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
