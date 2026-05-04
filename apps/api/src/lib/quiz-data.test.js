const assert = require('node:assert/strict');
const test = require('node:test');

const { QUESTION_COUNT, getStaticQuizQuestions } = require('./quiz-data');

test('static Fire Safety quiz has exactly 14 clean MCQs', () => {
  const questions = getStaticQuizQuestions('course-test');
  assert.equal(questions.length, QUESTION_COUNT);

  for (const question of questions) {
    assert.equal(question.options.length, 4);
    assert.match(question.question_text, /\S/);
    assert.doesNotMatch(question.question_text, /Final exam|mapped from documents|x-axis|y-axis|slide\d+_\d+\.png/i);
    assert.ok(Number.isInteger(question.correct_answer));
    assert.ok(question.correct_answer >= 0 && question.correct_answer <= 3);
  }
});
