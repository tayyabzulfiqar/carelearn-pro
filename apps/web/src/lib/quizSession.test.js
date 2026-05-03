const test = require('node:test');
const assert = require('node:assert/strict');

const { buildAttemptQuestionSet } = require('./quizSession');

test('buildAttemptQuestionSet shuffles questions and remaps answers without losing correctness', () => {
  const attempt = buildAttemptQuestionSet({
    seed: 'attempt-1',
    questions: [
      { id: 'q1', options: ['A1', 'A2', 'A3', 'A4'], correct_answer: 1 },
      { id: 'q2', options: ['B1', 'B2', 'B3', 'B4'], correct_answer: 2 },
      { id: 'q3', options: ['C1', 'C2', 'C3', 'C4'], correct_answer: 3 },
    ],
  });

  assert.equal(attempt.questions.length, 3);
  assert.notDeepEqual(attempt.questions.map((question) => question.id), ['q1', 'q2', 'q3']);

  attempt.questions.forEach((question) => {
    assert.equal(question.correct_answer >= 0, true);
    assert.equal(question.correct_answer < question.options.length, true);
  });
});

test('buildAttemptQuestionSet produces the same order for the same seed', () => {
  const first = buildAttemptQuestionSet({
    seed: 'repeatable',
    questions: [
      { id: 'q1', options: ['A1', 'A2', 'A3', 'A4'], correct_answer: 1 },
      { id: 'q2', options: ['B1', 'B2', 'B3', 'B4'], correct_answer: 2 },
      { id: 'q3', options: ['C1', 'C2', 'C3', 'C4'], correct_answer: 3 },
    ],
  });
  const second = buildAttemptQuestionSet({
    seed: 'repeatable',
    questions: [
      { id: 'q1', options: ['A1', 'A2', 'A3', 'A4'], correct_answer: 1 },
      { id: 'q2', options: ['B1', 'B2', 'B3', 'B4'], correct_answer: 2 },
      { id: 'q3', options: ['C1', 'C2', 'C3', 'C4'], correct_answer: 3 },
    ],
  });

  assert.deepEqual(first, second);
});
