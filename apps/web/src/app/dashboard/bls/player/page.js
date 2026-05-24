'use client';
import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import useAuth from '@/hooks/useAuth';
import SlideView from '@/components/player/SlideView';
import QuizView from '@/components/player/QuizView';
import { BLS_COURSE } from '@/lib/bls-course';
import { getAssessmentAttemptResolution } from '@/lib/assessmentAttemptPolicy';

const STORAGE_KEY = 'carelearn-bls-progress';
const ATTEMPT_HISTORY_KEY = 'carelearn-bls-assessment-history';
const CERT_ELIGIBILITY_KEY = 'carelearn-bls-certificate-eligibility';
const PHASE = {
  LESSONS: 'lessons',
  QUIZ: 'quiz',
  CERT: 'cert',
};

function CompletionScreen({ onExit }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
        <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 bg-emerald-100">
          <svg className="w-10 h-10 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Course Complete</h2>
        <p className="text-gray-500 mb-8">
          You have completed all lessons in Basic Life Support (BLS).
        </p>
        <button
          onClick={onExit}
          className="px-5 py-2.5 bg-[#0D1F3C] text-white rounded-lg text-sm font-medium hover:bg-[#1a3560] transition-colors"
        >
          Back to Courses
        </button>
      </div>
    </div>
  );
}

export default function BLSPlayerPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [completedIds, setCompletedIds] = useState(new Set());
  const [phase, setPhase] = useState(PHASE.LESSONS);
  const [quizAttempt, setQuizAttempt] = useState(1);
  const [quizResult, setQuizResult] = useState(null);
  const [certificateEligible, setCertificateEligible] = useState(false);
  const [resetNotice, setResetNotice] = useState('');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.push('/login');
  }, [user, loading, router]);

  // Restore progress from localStorage
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      if (Array.isArray(saved.completedIds)) {
        setCompletedIds(new Set(saved.completedIds));
      }
      if (typeof saved.currentIndex === 'number' && saved.currentIndex < BLS_COURSE.lessons.length) {
        setCurrentIndex(saved.currentIndex);
      }
      const certEligible = localStorage.getItem(CERT_ELIGIBILITY_KEY) === 'true';
      setCertificateEligible(certEligible);
    } catch {
      // ignore malformed storage
    } finally {
      setHydrated(true);
    }
  }, []);

  // Persist progress on every change
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        currentIndex,
        completedIds: [...completedIds],
      }));
      localStorage.setItem(CERT_ELIGIBILITY_KEY, certificateEligible ? 'true' : 'false');
    } catch {
      // ignore storage errors
    }
  }, [hydrated, currentIndex, completedIds, certificateEligible]);

  const allLessonsDone = completedIds.size === BLS_COURSE.lessons.length;

  const appendAttemptHistory = useCallback((entry) => {
    try {
      const existing = JSON.parse(localStorage.getItem(ATTEMPT_HISTORY_KEY) || '[]');
      const normalized = Array.isArray(existing) ? existing : [];
      normalized.push(entry);
      localStorage.setItem(ATTEMPT_HISTORY_KEY, JSON.stringify(normalized));
    } catch {
      // ignore storage errors
    }
  }, []);

  const resetCourseProgressForRetryCycle = useCallback(() => {
    setCompletedIds(new Set());
    setCurrentIndex(0);
    setPhase(PHASE.LESSONS);
    setQuizAttempt(1);
    setQuizResult(null);
    setCertificateEligible(false);
  }, []);

  const handleNext = useCallback(() => {
    setResetNotice('');
    const lesson = BLS_COURSE.lessons[currentIndex];
    if (lesson) {
      setCompletedIds((prev) => { const s = new Set(prev); s.add(lesson.id); return s; });
    }
    if (currentIndex < BLS_COURSE.lessons.length - 1) {
      setCurrentIndex((i) => i + 1);
    } else {
      setPhase(PHASE.QUIZ);
    }
  }, [currentIndex]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) setCurrentIndex((i) => i - 1);
  }, [currentIndex]);

  if (loading || !user) return null;

  const handleQuizComplete = useCallback((result) => {
    setQuizResult(result);
    appendAttemptHistory({
      timestamp: new Date().toISOString(),
      attempt: quizAttempt,
      score: result.score,
      passed: !!result.passed,
      total: result.total,
      correct: result.correct,
    });

    const resolution = getAssessmentAttemptResolution({ passed: result.passed, attempt: quizAttempt });
    if (resolution.action === 'pass') {
      setCertificateEligible(true);
      setPhase(PHASE.CERT);
      return;
    }

    if (resolution.action === 'reset') {
      resetCourseProgressForRetryCycle();
      setResetNotice('Assessment not passed after 3 attempts. Course progress has been reset so you can restart from Lesson 1.');
      return;
    }
  }, [appendAttemptHistory, quizAttempt, resetCourseProgressForRetryCycle]);

  const handleQuizRetry = useCallback(() => {
    setQuizAttempt((prev) => prev + 1);
    setQuizResult(null);
  }, []);

  if (phase === PHASE.CERT && certificateEligible) {
    return <CompletionScreen onExit={() => router.push('/dashboard/courses')} />;
  }

  if (phase === PHASE.QUIZ) {
    return (
      <QuizView
        course={BLS_COURSE}
        questions={BLS_COURSE.questions || []}
        attempt={quizAttempt}
        attemptKey={`bls-final-${quizAttempt}`}
        mode="final"
        onComplete={handleQuizComplete}
        onRetry={handleQuizRetry}
        onExit={() => setPhase(PHASE.LESSONS)}
      />
    );
  }

  return (
    <div>
      {resetNotice ? (
        <div className="mx-auto mt-4 max-w-5xl rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {resetNotice}
        </div>
      ) : null}
      {quizResult && !quizResult.passed ? (
        <div className="mx-auto mt-4 max-w-5xl rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Last score: {quizResult.score}% (attempt {quizAttempt} of 3).
        </div>
      ) : null}
      <SlideView
        course={BLS_COURSE}
        modules={BLS_COURSE.modules}
        lessons={BLS_COURSE.lessons}
        currentIndex={currentIndex}
        completedLessonIds={completedIds}
        isThresholdReached={allLessonsDone}
        hasQuiz={allLessonsDone}
        onNext={handleNext}
        onPrev={handlePrev}
        onLessonSelect={setCurrentIndex}
        onGoToQuiz={() => setPhase(PHASE.QUIZ)}
        onExit={() => router.push('/dashboard/courses')}
      />
    </div>
  );
}
