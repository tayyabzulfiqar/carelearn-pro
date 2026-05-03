'use client';
import { useEffect, useMemo, useState } from 'react';
import api from '@/lib/api';
import { buildAttemptQuestionSet } from '@/lib/quizSession';

function normalizeOptions(question) {
  if (Array.isArray(question?.options)) return question.options;
  if (typeof question?.options === 'string') {
    try {
      return JSON.parse(question.options);
    } catch {
      return [];
    }
  }
  return [];
}

export default function QuizView({
  course,
  questions,
  enrollmentId,
  mode,
  lessonNumber,
  attemptKey,
  onComplete,
  onExit,
}) {
  const attemptSet = useMemo(() => buildAttemptQuestionSet({
    seed: attemptKey,
    questions: (questions || []).map((question) => ({
      ...question,
      options: normalizeOptions(question),
    })),
  }), [questions, attemptKey]);

  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState({});
  const [selected, setSelected] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setCurrent(0);
    setAnswers({});
    setSelected(null);
    setConfirmed(false);
    setSubmitting(false);
  }, [attemptKey, mode, lessonNumber]);

  const total = attemptSet.questions.length;
  const q = attemptSet.questions[current];
  const isLast = current === total - 1;
  const progress = total > 0 ? Math.round(((current + 1) / total) * 100) : 0;
  const title = mode === 'final' ? 'Final Assessment' : `Lesson ${lessonNumber} Quiz`;

  const handleConfirm = () => {
    if (selected === null || !q) return;
    setAnswers((previous) => ({
      ...previous,
      [q.id]: { question_id: q.id, answer: selected },
    }));
    setConfirmed(true);
  };

  const handleNext = () => {
    setCurrent((index) => index + 1);
    setSelected(null);
    setConfirmed(false);
  };

  const handleSubmit = async () => {
    if (!q || !enrollmentId) return;

    const finalAnswer = selected === null
      ? answers[q.id]
      : { question_id: q.id, answer: selected };
    const finalAnswersMap = {
      ...answers,
      ...(finalAnswer ? { [q.id]: finalAnswer } : {}),
    };

    if (Object.keys(finalAnswersMap).length !== total) {
      return;
    }

    setSubmitting(true);

    try {
      const response = await api.post(`/courses/${course.id}/attempt`, {
        enrollment_id: enrollmentId,
        lesson_number: mode === 'lesson' ? lessonNumber : null,
        answers: Object.values(finalAnswersMap),
        is_final: mode === 'final',
      });
      onComplete(response.data);
    } catch (err) {
      console.error(err);
      setSubmitting(false);
    }
  };

  if (!q) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center p-8">
          <p className="text-gray-600 mb-2 font-medium">No assessment available</p>
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

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col">
      <div className="bg-navy-800 text-white px-6 py-4 flex items-center gap-4">
        <button onClick={onExit} className="text-navy-100 hover:text-white text-sm">Exit</button>
        <div className="flex-1">
          <p className="text-xs text-navy-100">{course?.title}</p>
          <p className="text-sm font-medium">{title}</p>
        </div>
        <span className="text-xs text-navy-100">{current + 1} / {total}</span>
      </div>

      <div className="h-1.5 bg-navy-900">
        <div className="h-1.5 bg-gold-500 transition-all duration-500" style={{ width: `${progress}%` }} />
      </div>

      <div className="flex-1 flex items-start justify-center p-6 pt-10">
        <div className="max-w-3xl w-full">
          <div className="bg-white rounded-[28px] border border-stone-200 shadow-sm p-7 mb-6 overflow-hidden">
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <p className="text-xs text-navy-500 font-bold uppercase tracking-[0.24em]">
                  {mode === 'final' ? 'Course Completion Check' : `Lesson ${lessonNumber} Knowledge Check`}
                </p>
                <p className="text-2xl font-semibold text-navy-900 mt-2 leading-snug">{q.question_text}</p>
              </div>
              <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                {q.difficulty || 'mixed'}
              </span>
            </div>

            <div className="grid gap-3">
              {(q.options || []).map((option, index) => {
                const isSelected = selected === index;
                return (
                  <button
                    key={`${q.id}-${index}`}
                    onClick={() => !confirmed && setSelected(index)}
                    disabled={confirmed}
                    className={`w-full text-left px-5 py-4 rounded-2xl border text-sm font-medium transition-all ${
                      isSelected
                        ? 'border-navy-800 bg-navy-800 text-white'
                        : 'border-stone-200 bg-stone-50 text-stone-800 hover:border-navy-300 hover:bg-white'
                    } disabled:cursor-not-allowed`}
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
            <span className="text-xs text-stone-500">
              {Object.keys(answers).length} of {total} answered
            </span>
            {!confirmed ? (
              <button
                onClick={handleConfirm}
                disabled={selected === null}
                className="px-6 py-2.5 bg-gold-500 text-white rounded-lg text-sm font-medium hover:bg-gold-600 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Confirm Answer
              </button>
            ) : isLast ? (
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="px-6 py-2.5 bg-navy-800 text-white rounded-lg text-sm font-medium hover:bg-navy-700 disabled:opacity-60 flex items-center gap-2"
              >
                {submitting && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                Submit Quiz
              </button>
            ) : (
              <button
                onClick={handleNext}
                className="px-6 py-2.5 bg-navy-800 text-white rounded-lg text-sm font-medium hover:bg-navy-700"
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
