const test = require('node:test');
const assert = require('node:assert/strict');

const {
  QUIZ_DATA,
  getFireSafetyDemoQuiz,
  scoreFireSafetyDemoQuiz,
} = require('./fire-safety-demo-quiz');

test('fixed fire safety quiz contains exactly 14 clean questions', () => {
  assert.equal(QUIZ_DATA.length, 14);

  QUIZ_DATA.forEach((question) => {
    assert.equal(typeof question.question_text, 'string');
    assert.equal(question.question_text.length > 0, true);
    assert.equal(question.question_text.length < 120, true);
    assert.equal(Array.isArray(question.options), true);
    assert.equal(question.options.length, 4);
    assert.equal(question.correct_answer, 0);
    assert.match(question.question_text, /^[A-Za-z0-9 ,]+$/);
    question.options.forEach((option) => {
      assert.match(option, /^[A-Za-z0-9 ,]+$/);
    });
  });
});

test('fixed fire safety quiz builds a final assessment payload', () => {
  const questions = getFireSafetyDemoQuiz();

  assert.equal(questions.length, 14);
  assert.equal(questions.every((question) => question.is_final_assessment), true);
  assert.equal(questions.every((question) => question.question_type === 'multiple_choice'), true);
});

test('fixed fire safety quiz fails at 10 correct and passes at 11 correct', () => {
  const failAnswers = QUIZ_DATA.map((question, index) => ({
    question_id: question.id,
    answer: index < 10 ? 0 : 1,
  }));
  const passAnswers = QUIZ_DATA.map((question, index) => ({
    question_id: question.id,
    answer: index < 11 ? 0 : 1,
  }));

  assert.deepEqual(scoreFireSafetyDemoQuiz(failAnswers), {
    correct: 10,
    total: 14,
    score: 71,
    passed: false,
  });

  assert.deepEqual(scoreFireSafetyDemoQuiz(passAnswers), {
    correct: 11,
    total: 14,
    score: 79,
    passed: true,
  });
});
