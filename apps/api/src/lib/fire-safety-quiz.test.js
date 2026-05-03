const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildLessonQuestionSet,
  buildCourseQuizPackage,
} = require('./fire-safety-quiz');

function makeLesson(lessonNumber) {
  return {
    lesson_number: lessonNumber,
    title: `Lesson ${lessonNumber}`,
    sections: [
      {
        heading: 'Section A',
        paragraphs: [
          `Lesson ${lessonNumber} paragraph one about staff actions and hazard prevention.`,
          `Lesson ${lessonNumber} paragraph two about alarms, smoke, and emergency response.`,
        ],
        bullets: [
          `Lesson ${lessonNumber} bullet one about local procedure.`,
          `Lesson ${lessonNumber} bullet two about resident safety.`,
        ],
      },
      {
        heading: 'Section B',
        paragraphs: [
          `Lesson ${lessonNumber} paragraph three about care-home decision making.`,
        ],
        bullets: [
          `Lesson ${lessonNumber} bullet three about reporting and evacuation.`,
        ],
      },
    ],
  };
}

test('buildLessonQuestionSet returns exactly 14 typed questions with a 4/7/3 difficulty split', () => {
  const questions = buildLessonQuestionSet(makeLesson(1));

  assert.equal(questions.length, 14);
  assert.equal(questions.filter((q) => q.difficulty === 'easy').length, 4);
  assert.equal(questions.filter((q) => q.difficulty === 'medium').length, 7);
  assert.equal(questions.filter((q) => q.difficulty === 'hard').length, 3);

  const questionTypes = new Set(questions.map((question) => question.question_type));
  assert.equal(questionTypes.has('multiple_choice'), true);
  assert.equal(questionTypes.has('scenario'), true);
  assert.equal(questionTypes.has('true_false'), true);
});

test('buildLessonQuestionSet derives all prompts from lesson content without generic filler', () => {
  const questions = buildLessonQuestionSet(makeLesson(2));

  questions.forEach((question) => {
    assert.match(question.question_text, /Lesson 2|staff|resident|alarm|smoke|evacuation/i);
    assert.equal(question.question_text.includes('Option A'), false);
    assert.equal(question.question_text.includes('Option B'), false);
    assert.equal(Array.isArray(question.options), true);
    assert.equal(question.correct_answer >= 0, true);
    assert.equal(question.correct_answer < question.options.length, true);
  });

  const trueFalse = questions.find((question) => question.question_type === 'true_false');
  assert.deepEqual(trueFalse.options, ['True', 'False']);
});

test('buildCourseQuizPackage generates 17 lesson quizzes with 14 questions each and a final exam', () => {
  const lessons = Array.from({ length: 17 }, (_, index) => makeLesson(index + 1));
  const quizPackage = buildCourseQuizPackage({ lessons, versionTag: 'fire-safety-v1' });

  assert.equal(quizPackage.lessonQuizzes.length, 17);
  assert.equal(quizPackage.lessonQuizzes.every((lessonQuiz) => lessonQuiz.questions.length === 14), true);
  assert.equal(quizPackage.finalExam.questions.length, 34);
  assert.equal(quizPackage.finalExam.questions.every((question) => question.is_final_assessment), true);
});
