const test = require('node:test');
const assert = require('node:assert/strict');

const {
  hasFinalAssessment,
  getCourseCompletionMode,
  canCompleteWithoutAssessment,
  calculateQuizOutcome,
} = require('./coursePlayerState');

test('detects when a course has a final assessment', () => {
  assert.equal(hasFinalAssessment({ questions: [] }), false);
  assert.equal(hasFinalAssessment({ questions: null }), false);
  assert.equal(hasFinalAssessment({ questions: [{ id: 'q1' }] }), true);
});

test('returns the right completion mode for assessment and non-assessment courses', () => {
  assert.equal(getCourseCompletionMode({ questions: [] }), 'no_assessment');
  assert.equal(getCourseCompletionMode({ questions: [{ id: 'q1' }] }), 'assessment_required');
});

test('allows completion without assessment only when all lessons are done and no questions exist', () => {
  assert.equal(canCompleteWithoutAssessment({
    totalLessons: 13,
    completedLessonIds: Array.from({ length: 13 }, (_, index) => `lesson-${index}`),
    course: { questions: [] },
  }), true);

  assert.equal(canCompleteWithoutAssessment({
    totalLessons: 13,
    completedLessonIds: Array.from({ length: 12 }, (_, index) => `lesson-${index}`),
    course: { questions: [] },
  }), false);

  assert.equal(canCompleteWithoutAssessment({
    totalLessons: 13,
    completedLessonIds: Array.from({ length: 13 }, (_, index) => `lesson-${index}`),
    course: { questions: [{ id: 'q1' }] },
  }), false);
});

test('calculates pass and fail outcomes using a 75 percent pass mark', () => {
  const passResult = calculateQuizOutcome({
    questions: [
      { id: 'q1', correct_answer: 0 },
      { id: 'q2', correct_answer: 1 },
      { id: 'q3', correct_answer: 2 },
      { id: 'q4', correct_answer: 3 },
    ],
    answers: [
      { question_id: 'q1', answer: 0 },
      { question_id: 'q2', answer: 1 },
      { question_id: 'q3', answer: 2 },
      { question_id: 'q4', answer: 0 },
    ],
    passMark: 75,
  });

  assert.deepEqual(passResult, {
    total: 4,
    correct: 3,
    score: 75,
    passed: true,
    passMark: 75,
  });

  const failResult = calculateQuizOutcome({
    questions: [
      { id: 'q1', correct_answer: 0 },
      { id: 'q2', correct_answer: 1 },
      { id: 'q3', correct_answer: 2 },
      { id: 'q4', correct_answer: 3 },
    ],
    answers: [
      { question_id: 'q1', answer: 0 },
      { question_id: 'q2', answer: 2 },
      { question_id: 'q3', answer: 2 },
      { question_id: 'q4', answer: 1 },
    ],
    passMark: 75,
  });

  assert.deepEqual(failResult, {
    total: 4,
    correct: 2,
    score: 50,
    passed: false,
    passMark: 75,
  });
});

test('fails a 14-question quiz at 10 correct answers and passes at 11', () => {
  const questions = Array.from({ length: 14 }, (_, index) => ({ id: `q${index}`, correct_answer: 0 }));
  const failAnswers = Array.from({ length: 14 }, (_, index) => ({ question_id: `q${index}`, answer: index < 10 ? 0 : 1 }));
  const passAnswers = Array.from({ length: 14 }, (_, index) => ({ question_id: `q${index}`, answer: index < 11 ? 0 : 1 }));

  assert.equal(calculateQuizOutcome({ questions, answers: failAnswers, passMark: 75 }).passed, false);
  assert.equal(calculateQuizOutcome({ questions, answers: passAnswers, passMark: 75 }).passed, true);
});
