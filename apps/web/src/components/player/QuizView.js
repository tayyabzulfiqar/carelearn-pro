'use client';
import { useEffect, useState, useMemo } from 'react';
import api from '@/lib/api';
import { buildAttemptQuestionSet } from '@/lib/quizSession';

export default function QuizView({
  course,
  questions,
  enrollmentId,
  attemptKey,
  mode = 'final',      // 'lesson' | 'final'
  lessonNumber = null, // required when mode='lesson'
  onComplete,
  onExit,
}) {
  const rawQuestions = Array.isArray(questions) ? questions : [];

  // Shuffle questions deterministically using attemptKey as seed
  const shuffled = useMemo(
    () => buildAttemptQuestionSet({ seed: attemptKey || 'default', questions: rawQuestions }).questions,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [attemptKey],
  );

  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState({});
  const [selected, setSelected] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null); // { score, passed, correct, total, pass_mark }

  // Reset fully when attemptKey changes (new attempt / retry)
  useEffect(() => {
    setCurrent(0);
    setAnswers({});
    setSelected(null);
    setSubmitting(false);
    setResult(null);
  }, [attemptKey]);

  const total = shuffled.length;
  const question = shuffled[current];
  const isLast = current === total - 1;
  const answeredCount = Object.keys(answers).length;
  const progress = total > 0 ? Math.round(((current + 1) / total) * 100) : 0;

  const handleSelect = (index) => {
    setSelected(index);
    if (!question) return;
    setAnswers((prev) => ({
      ...prev,
      [question.id]: { question_id: question.id, answer: index },
    }));
  };

  const handleNext = () => {
    const nextIdx = current + 1;
    setCurrent(nextIdx);
    const nextQ = shuffled[nextIdx];
    // Restore saved answer for next question, but never auto-select if unanswered
    setSelected(nextQ ? (answers[nextQ.id]?.answer ?? null) : null);
  };

  const handlePrev = () => {
    const prevIdx = current - 1;
    if (prevIdx < 0) return;
    setCurrent(prevIdx);
    const prevQ = shuffled[prevIdx];
    setSelected(prevQ ? (answers[prevQ.id]?.answer ?? null) : null);
  };

  const handleSubmit = async () => {
    if (!enrollmentId || answeredCount !== total) return;
    setSubmitting(true);
    try {
      const payload = {
        enrollment_id: enrollmentId,
        is_final: mode === 'final',
        answers: Object.values(answers),
      };
      if (mode === 'lesson' && lessonNumber) payload.lesson_number = lessonNumber;

      const response = await api.post(`/courses/${course.id}/attempt`, payload);
      const data = response.data;
      setResult({
        score: data.score,
        passed: data.passed,
        correct: data.correct,
        total: data.total,
        pass_mark: data.pass_mark || 75,
      });
      // Notify parent on pass so it can advance; pass result for fail so parent can gate
      onComplete?.(data);
    } catch (err) {
      console.error(err);
      setSubmitting(false);
    }
  };

  const handleRetry = () => {
    setCurrent(0);
    setAnswers({});
    setSelected(null);
    setSubmitting(false);
    setResult(null);
  };

  // ── Result screen ──────────────────────────────────────────────────────────
  if (result) {
    const passMark = result.pass_mark || 75;
    return (
      <div className="min-h-screen bg-stone-50 flex flex-col">
        <div className="bg-navy-800 text-white px-6 py-4 flex items-center gap-4">
          <button onClick={onExit} className="text-navy-100 hover:text-white text-sm">Exit</button>
          <div className="flex-1">
            <p className="text-xs text-navy-100">{course?.title}</p>
            <p className="text-sm font-medium">{mode === 'lesson' ? `Lesson ${lessonNumber} Quiz` : 'Final Quiz'} — Result</p>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white rounded-[28px] border border-stone-200 shadow-sm p-8 text-center">
            <div className={`w-20 h-20 rounded-full mx-auto flex items-center justify-center text-3xl font-bold mb-4 ${
              result.passed ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
            }`}>
              {result.passed ? '✓' : '✗'}
            </div>
            <h2 className={`text-2xl font-bold mb-1 ${result.passed ? 'text-green-700' : 'text-red-600'}`}>
              {result.passed ? 'PASS' : 'NOT YET'}
            </h2>
            <p className="text-4xl font-bold text-navy-900 my-3">{result.score}%</p>
            <p className="text-sm text-stone-600 mb-1">
              {result.correct} of {result.total} correct — pass mark {passMark}%
            </p>

            {result.passed ? (
              <div className="mt-6">
                <p className="text-sm text-green-700 font-medium mb-4">
                  {mode === 'lesson' ? 'Lesson complete — you may continue.' : 'All done! Your certificate is being prepared.'}
                </p>
                <button
                  onClick={onExit}
                  className="px-6 py-2.5 bg-navy-800 text-white rounded-lg text-sm font-medium hover:bg-navy-700"
                >
                  {mode === 'lesson' ? 'Continue to Next Lesson' : 'View Certificate'}
                </button>
              </div>
            ) : (
              <div className="mt-6 space-y-3">
                <p className="text-sm text-stone-600">
                  You need {passMark}% to pass. Review the lesson and try again.
                </p>
                <button
                  onClick={handleRetry}
                  className="w-full px-6 py-2.5 bg-navy-800 text-white rounded-lg text-sm font-medium hover:bg-navy-700"
                >
                  Try Again
                </button>
                <button
                  onClick={onExit}
                  className="w-full px-6 py-2 border border-stone-300 text-stone-700 rounded-lg text-sm hover:bg-stone-50"
                >
                  Exit to Course
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── No questions screen ────────────────────────────────────────────────────
  if (!question) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="text-center p-8">
          <p className="text-stone-700 mb-2 font-medium">Quiz not available</p>
          <button
            onClick={onExit}
            className="px-5 py-2 bg-navy-800 text-white rounded-lg text-sm font-medium hover:bg-navy-700"
          >
            Back to Courses
          </button>
        </div>
      </div>
    );
  }

  // ── Question screen ────────────────────────────────────────────────────────
  const questionText = question.question_text || question.question || '';

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col">
      <div className="bg-navy-800 text-white px-6 py-4 flex items-center gap-4">
        <button onClick={onExit} className="text-navy-100 hover:text-white text-sm">Exit</button>
        <div className="flex-1">
          <p className="text-xs text-navy-100">{course?.title}</p>
          <p className="text-sm font-medium">
            {mode === 'lesson' ? `Lesson ${lessonNumber} Quiz` : 'Final Quiz'}
          </p>
        </div>
        <span className="text-xs text-navy-100">{current + 1} / {total}</span>
      </div>

      <div className="h-1.5 bg-navy-900">
        <div className="h-1.5 bg-gold-500 transition-all duration-300" style={{ width: `${progress}%` }} />
      </div>

      <div className="flex-1 flex items-start justify-center p-6 pt-10">
        <div className="max-w-3xl w-full">
          <div className="bg-white rounded-[28px] border border-stone-200 shadow-sm p-7 mb-6">
            <p className="text-xs text-navy-500 font-bold uppercase tracking-[0.24em]">
              {mode === 'lesson' ? 'Lesson Check' : 'Course Completion Quiz'}
              {question.difficulty && (
                <span className="ml-2 capitalize text-stone-400">· {question.difficulty}</span>
              )}
            </p>
            <p className="text-xl font-semibold text-navy-900 mt-2 leading-snug">
              {questionText}
            </p>

            <div className="grid gap-3 mt-6">
              {question.options.map((option, index) => {
                const isSelected = selected === index;
                return (
                  <button
                    key={`${question.id}-${index}`}
                    onClick={() => handleSelect(index)}
                    className={`w-full text-left px-5 py-4 rounded-2xl border text-sm font-medium transition-all ${
                      isSelected
                        ? 'border-navy-800 bg-navy-800 text-white'
                        : 'border-stone-200 bg-stone-50 text-stone-800 hover:border-navy-300 hover:bg-white'
                    }`}
                  >
                    <span className={`inline-flex w-7 h-7 rounded-full items-center justify-center text-xs font-bold mr-3 ${
                      isSelected ? 'bg-gold-500 text-white' : 'bg-white text-stone-500'
                    }`}>
                      {String.fromCharCode(65 + index)}
                    </span>
                    {option}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              {current > 0 && (
                <button
                  onClick={handlePrev}
                  className="px-4 py-2 border border-stone-300 text-stone-700 rounded-lg text-sm hover:bg-stone-50"
                >
                  ← Back
                </button>
              )}
              <span className="text-xs text-stone-500">
                {answeredCount} of {total} answered
              </span>
            </div>
            {isLast ? (
              <button
                onClick={handleSubmit}
                disabled={submitting || selected === null || answeredCount !== total}
                className="px-6 py-2.5 bg-navy-800 text-white rounded-lg text-sm font-medium hover:bg-navy-700 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {submitting ? 'Submitting...' : 'Submit Quiz'}
              </button>
            ) : (
              <button
                onClick={handleNext}
                disabled={selected === null}
                className="px-6 py-2.5 bg-navy-800 text-white rounded-lg text-sm font-medium hover:bg-navy-700 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Next Question
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
