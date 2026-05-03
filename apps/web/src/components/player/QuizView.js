'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';

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
  attemptKey,
  onComplete,
  onExit,
}) {
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState({});
  const [selected, setSelected] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const normalizedQuestions = (questions || []).map((question) => ({
    ...question,
    options: normalizeOptions(question),
  }));

  useEffect(() => {
    setCurrent(0);
    setAnswers({});
    setSelected(null);
    setSubmitting(false);
  }, [attemptKey]);

  const total = normalizedQuestions.length;
  const question = normalizedQuestions[current];
  const isLast = current === total - 1;
  const progress = total > 0 ? Math.round(((current + 1) / total) * 100) : 0;

  const handleSelect = (index) => {
    setSelected(index);
    if (!question) return;
    setAnswers((previous) => ({
      ...previous,
      [question.id]: {
        question_id: question.id,
        answer: index,
      },
    }));
  };

  const handleNext = () => {
    setCurrent((index) => index + 1);
    const nextQuestion = normalizedQuestions[current + 1];
    setSelected(nextQuestion ? answers[nextQuestion.id]?.answer ?? null : null);
  };

  const handleSubmit = async () => {
    if (!enrollmentId || Object.keys(answers).length !== total) return;

    setSubmitting(true);
    try {
      const response = await api.post(`/courses/${course.id}/attempt`, {
        enrollment_id: enrollmentId,
        is_final: true,
        answers: Object.values(answers),
      });
      onComplete(response.data);
    } catch (err) {
      console.error(err);
      setSubmitting(false);
    }
  };

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

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col">
      <div className="bg-navy-800 text-white px-6 py-4 flex items-center gap-4">
        <button onClick={onExit} className="text-navy-100 hover:text-white text-sm">Exit</button>
        <div className="flex-1">
          <p className="text-xs text-navy-100">{course?.title}</p>
          <p className="text-sm font-medium">Final Quiz</p>
        </div>
        <span className="text-xs text-navy-100">{current + 1} / {total}</span>
      </div>

      <div className="h-1.5 bg-navy-900">
        <div className="h-1.5 bg-gold-500 transition-all duration-300" style={{ width: `${progress}%` }} />
      </div>

      <div className="flex-1 flex items-start justify-center p-6 pt-10">
        <div className="max-w-3xl w-full">
          <div className="bg-white rounded-[28px] border border-stone-200 shadow-sm p-7 mb-6 overflow-hidden">
            <p className="text-xs text-navy-500 font-bold uppercase tracking-[0.24em]">
              Course Completion Quiz
            </p>
            <p className="text-2xl font-semibold text-navy-900 mt-2 leading-snug">
              {question.question_text}
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
            <span className="text-xs text-stone-500">
              {Object.keys(answers).length} of {total} answered
            </span>
            {isLast ? (
              <button
                onClick={handleSubmit}
                disabled={submitting || selected === null || Object.keys(answers).length !== total}
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
