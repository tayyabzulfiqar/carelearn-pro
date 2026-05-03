const QUESTION_TARGET = 14;
const FINAL_EXAM_PER_LESSON = 2;
const DIFFICULTY_PLAN = [
  'easy',
  'easy',
  'easy',
  'easy',
  'medium',
  'medium',
  'medium',
  'medium',
  'medium',
  'medium',
  'medium',
  'hard',
  'hard',
  'hard',
];
const QUESTION_TYPE_PLAN = [
  'multiple_choice',
  'true_false',
  'scenario',
  'multiple_choice',
  'true_false',
  'scenario',
  'multiple_choice',
  'multiple_choice',
  'scenario',
  'true_false',
  'multiple_choice',
  'scenario',
  'multiple_choice',
  'true_false',
];

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function sentenceCase(value) {
  const text = normalizeText(value);
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function extractLessonFacts(lesson) {
  return (lesson.sections || []).flatMap((section) => {
    const heading = sentenceCase(section.heading);
    const paragraphs = Array.isArray(section.paragraphs) ? section.paragraphs : [];
    const bullets = Array.isArray(section.bullets) ? section.bullets : Array.isArray(section.bullet_points) ? section.bullet_points : [];

    return [
      ...(heading ? [`${lesson.title}: ${heading}`] : []),
      ...paragraphs,
      ...bullets,
    ].map(normalizeText).filter(Boolean);
  });
}

function rotate(values, offset) {
  if (!values.length) return [];
  const normalizedOffset = offset % values.length;
  return values.slice(normalizedOffset).concat(values.slice(0, normalizedOffset));
}

function uniqueOptions(baseOptions, correctOption, fallbackSource) {
  const options = [];
  const seen = new Set();

  [correctOption, ...baseOptions, ...fallbackSource]
    .map(sentenceCase)
    .filter(Boolean)
    .forEach((option) => {
      const key = option.toLowerCase();
      if (!seen.has(key) && options.length < 4) {
        seen.add(key);
        options.push(option);
      }
    });

  return options;
}

function buildMultipleChoiceQuestion({ lesson, facts, index, difficulty }) {
  const fact = facts[index % facts.length];
  const headingFact = facts[(index + 1) % facts.length];
  const distractors = rotate(facts, index + 2)
    .filter((candidate) => candidate !== fact)
    .slice(0, 6);

  const correctOption = sentenceCase(fact);
  const options = uniqueOptions(distractors, correctOption, facts).slice(0, 4);
  const correctAnswer = options.findIndex((option) => option.toLowerCase() === correctOption.toLowerCase());

  return {
    question_type: 'multiple_choice',
    difficulty,
    question_text: `Lesson ${lesson.lesson_number}: Which statement best matches the training content on ${headingFact.toLowerCase()}?`,
    options,
    correct_answer: correctAnswer === -1 ? 0 : correctAnswer,
  };
}

function buildTrueFalseQuestion({ lesson, facts, index, difficulty }) {
  const sourceFact = sentenceCase(facts[index % facts.length]);
  const shouldBeTrue = index % 2 === 0;
  const falseFact = sourceFact.replace(/\bmust\b/i, 'may').replace(/\balways\b/i, 'sometimes');
  const statement = shouldBeTrue ? sourceFact : (falseFact === sourceFact ? `${sourceFact} This is not required in the lesson.` : falseFact);

  return {
    question_type: 'true_false',
    difficulty,
    question_text: `Lesson ${lesson.lesson_number}: True or false? ${statement}`,
    options: ['True', 'False'],
    correct_answer: shouldBeTrue ? 0 : 1,
  };
}

function buildScenarioQuestion({ lesson, facts, index, difficulty }) {
  const riskFact = sentenceCase(facts[index % facts.length]);
  const responseFact = sentenceCase(facts[(index + 3) % facts.length]);
  const distractors = rotate(facts, index + 4)
    .filter((candidate) => candidate !== responseFact)
    .slice(0, 8);

  const correctOption = responseFact;
  const options = uniqueOptions(distractors, correctOption, facts).slice(0, 4);
  const correctAnswer = options.findIndex((option) => option.toLowerCase() === correctOption.toLowerCase());

  return {
    question_type: 'scenario',
    difficulty,
    question_text: `Lesson ${lesson.lesson_number}: During a care-home shift, staff notice that ${riskFact.toLowerCase()}. Based on this lesson, what is the best immediate action?`,
    options,
    correct_answer: correctAnswer === -1 ? 0 : correctAnswer,
  };
}

function buildQuestion({ lesson, facts, index, difficulty, type }) {
  if (type === 'true_false') {
    return buildTrueFalseQuestion({ lesson, facts, index, difficulty });
  }
  if (type === 'scenario') {
    return buildScenarioQuestion({ lesson, facts, index, difficulty });
  }
  return buildMultipleChoiceQuestion({ lesson, facts, index, difficulty });
}

function buildLessonQuestionSet(lesson) {
  const facts = extractLessonFacts(lesson);
  if (facts.length < 4) {
    throw new Error(`Lesson ${lesson.lesson_number} does not contain enough content to generate ${QUESTION_TARGET} questions`);
  }

  return Array.from({ length: QUESTION_TARGET }, (_, index) => {
    const difficulty = DIFFICULTY_PLAN[index];
    const questionType = QUESTION_TYPE_PLAN[index];
    const question = buildQuestion({
      lesson,
      facts,
      index,
      difficulty,
      type: questionType,
    });

    return {
      question_key: `lesson-${lesson.lesson_number}-${index + 1}`,
      lesson_number: lesson.lesson_number,
      ...question,
    };
  });
}

function buildCourseQuizPackage({ lessons, versionTag }) {
  const lessonQuizzes = lessons.map((lesson) => ({
    lesson_number: lesson.lesson_number,
    title: lesson.title,
    questions: buildLessonQuestionSet(lesson).map((question, index) => ({
      ...question,
      version_tag: versionTag,
      is_final_assessment: false,
      order_index: index,
    })),
  }));

  const finalExamQuestions = lessonQuizzes.flatMap((lessonQuiz) => (
    lessonQuiz.questions.slice(0, FINAL_EXAM_PER_LESSON).map((question, index) => ({
      ...question,
      question_key: `final-${lessonQuiz.lesson_number}-${index + 1}`,
      question_text: `${question.question_text} (Final exam)`,
      is_final_assessment: true,
    }))
  )).map((question, index) => ({
    ...question,
    order_index: index,
  }));

  return {
    versionTag,
    lessonQuizzes,
    finalExam: {
      version_tag: versionTag,
      questions: finalExamQuestions,
    },
  };
}

module.exports = {
  QUESTION_TARGET,
  DIFFICULTY_PLAN,
  QUESTION_TYPE_PLAN,
  extractLessonFacts,
  buildLessonQuestionSet,
  buildCourseQuizPackage,
};
