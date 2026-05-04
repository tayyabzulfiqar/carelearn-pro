const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildCourseQuizPackage,
  buildLessonQuestionSet,
} = require('./fire-safety-quiz');

function buildLesson(lessonNumber = 1) {
  return {
    lesson_number: lessonNumber,
    title: `Lesson ${lessonNumber}`,
    sections: [
      {
        heading: 'Fire safety responsibilities',
        paragraphs: [
          'Staff must raise the alarm immediately when they discover fire or smoke.',
          'Escape routes must always be kept clear so residents can move safely.',
          'Fire doors slow the spread of smoke and fire through the building.',
          'Only trained staff should use equipment when it is safe to do so.',
        ],
        bullets: [
          'Report fire safety defects immediately',
          'Follow the evacuation plan',
          'Support residents according to their care plans',
          'Stay calm and communicate clearly',
        ],
      },
      {
        heading: 'Evacuation practice',
        paragraphs: [
          'Personal emergency evacuation plans identify the support each resident needs.',
          'Compartmentation helps staff move residents progressively away from danger.',
        ],
        bullets: [
          'Close doors behind you',
          'Never use lifts during a fire',
          'Listen for instructions from the person in charge',
        ],
      },
    ],
  };
}

test('buildLessonQuestionSet contains exactly 14 clean questions', () => {
  const questions = buildLessonQuestionSet(buildLesson());

  assert.equal(questions.length, 14);
  questions.forEach((question) => {
    assert.equal(typeof question.question_text, 'string');
    assert.equal(question.question_text.length > 0, true);
    assert.equal(Array.isArray(question.options), true);
    assert.equal(question.options.length >= 2, true);
    assert.equal(Number.isInteger(question.correct_answer), true);
    assert.equal(question.correct_answer >= 0, true);
    question.options.forEach((option) => {
      assert.equal(typeof option, 'string');
      assert.equal(option.length > 0, true);
    });
  });
});

test('buildCourseQuizPackage creates lesson quizzes and a final exam', () => {
  const lessons = Array.from({ length: 17 }, (_, index) => buildLesson(index + 1));
  const quizPackage = buildCourseQuizPackage({ lessons, versionTag: 'test' });

  assert.equal(quizPackage.lessonQuizzes.length, 17);
  assert.equal(quizPackage.lessonQuizzes.every((lessonQuiz) => lessonQuiz.questions.length === 14), true);
  assert.equal(quizPackage.finalExam.questions.length, 34);
  assert.equal(quizPackage.finalExam.questions.every((question) => question.is_final_assessment), true);
});
