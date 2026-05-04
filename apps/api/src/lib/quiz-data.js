const fs = require('node:fs');
const path = require('node:path');

const QUESTION_COUNT = 14;
const QUIZ_PATH = path.resolve(__dirname, '../content/fire-safety/quiz-data.json');
const BANNED_PATTERNS = [
  /final exam/i,
  /mapped from documents/i,
  /x-axis/i,
  /y-axis/i,
  /placeholder/i,
  /slide\d+_\d+\.png/i,
];

function assertCleanText(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  if (value.length > 160) {
    throw new Error(`${label} is too long`);
  }
  for (const pattern of BANNED_PATTERNS) {
    if (pattern.test(value)) {
      throw new Error(`${label} contains blocked text`);
    }
  }
}

function loadQuizData() {
  const raw = fs.readFileSync(QUIZ_PATH, 'utf8');
  const data = JSON.parse(raw);
  return validateQuizData(data);
}

function validateQuizData(data) {
  if (!Array.isArray(data)) {
    throw new Error('quiz-data.json must be an array');
  }
  if (data.length !== QUESTION_COUNT) {
    throw new Error(`quiz-data.json must contain exactly ${QUESTION_COUNT} questions`);
  }

  data.forEach((item, index) => {
    assertCleanText(item.question, `Question ${index + 1}`);
    if (!Array.isArray(item.options) || item.options.length !== 4) {
      throw new Error(`Question ${index + 1} must have exactly 4 options`);
    }
    item.options.forEach((option, optionIndex) => {
      assertCleanText(option, `Question ${index + 1} option ${optionIndex + 1}`);
    });
    if (!Number.isInteger(item.correct_answer) || item.correct_answer < 0 || item.correct_answer > 3) {
      throw new Error(`Question ${index + 1} must have one valid correct_answer`);
    }
  });

  return data;
}

function toApiQuestion(item, index, courseId = null) {
  const id = `fire-safety-static-${index + 1}`;
  return {
    id,
    course_id: courseId,
    module_id: null,
    lesson_number: null,
    question: item.question,
    question_text: item.question,
    question_type: 'multiple_choice',
    options: item.options,
    correct_answer: item.correct_answer,
    explanation: null,
    difficulty: 'standard',
    is_final_assessment: true,
    is_active: true,
    version_tag: 'static-json',
    question_key: id,
    option_order: [0, 1, 2, 3],
    order_index: index,
  };
}

function getStaticQuizQuestions(courseId = null) {
  return loadQuizData().map((item, index) => toApiQuestion(item, index, courseId));
}

function scoreStaticQuiz(answers, courseId = null) {
  const questions = getStaticQuizQuestions(courseId);
  const submittedAnswers = Array.isArray(answers) ? answers : [];
  let correct = 0;

  questions.forEach((question) => {
    const submitted = submittedAnswers.find((answer) => answer.question_id === question.id);
    if (submitted && Number(submitted.answer) === question.correct_answer) {
      correct += 1;
    }
  });

  const total = questions.length;
  const score = Math.round((correct / total) * 100);
  return { questions, correct, total, score, passed: score >= 75 };
}

module.exports = {
  QUESTION_COUNT,
  QUIZ_PATH,
  getStaticQuizQuestions,
  loadQuizData,
  scoreStaticQuiz,
  validateQuizData,
};
