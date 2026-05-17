'use strict';

const QUESTION_TARGET = 14;
// 4 easy, 7 medium, 3 hard
const DIFFICULTY_PLAN = [
  'easy', 'easy', 'easy', 'easy',
  'medium', 'medium', 'medium', 'medium', 'medium', 'medium', 'medium',
  'hard', 'hard', 'hard',
];

// ─── Fact extraction ─────────────────────────────────────────────────────────

function extractLessonFacts(lesson) {
  const heading = lesson.title || `Lesson ${lesson.lesson_number}`;
  const facts = [];
  for (const section of lesson.sections || []) {
    for (const p of section.paragraphs || []) {
      const text = String(p).trim();
      if (text.length > 20) facts.push({ text, heading: section.heading || heading, type: 'paragraph' });
    }
    for (const b of section.bullet_points || []) {
      const text = String(b).trim();
      if (text.length > 10) facts.push({ text, heading: section.heading || heading, type: 'bullet' });
    }
  }
  return facts;
}

// Rotate through available facts; pad/cycle if fewer facts than needed
function pickFact(facts, index) {
  if (!facts.length) return { text: `Key principle ${index + 1}`, heading: 'Fire Safety', type: 'bullet' };
  return facts[index % facts.length];
}

// ─── Distractor generation ────────────────────────────────────────────────────

const COMMON_WRONG_OPTIONS = [
  'This only applies to commercial buildings, not care homes.',
  'Staff are not responsible — this is solely the fire warden\'s duty.',
  'This precaution can be waived during busy periods.',
  'There is no legal requirement for this in UK care homes.',
  'It is acceptable to ignore this if residents appear calm.',
  'This only applies when medical oxygen is in use.',
  'Verbal guidance is sufficient; written records are not needed.',
  'Night shift staff are exempt from this responsibility.',
  'This applies only during Care Quality Commission inspections.',
  'Residents with dementia do not need individual evacuation plans.',
];

function buildDistractors(correctText, facts, factIndex) {
  const distractors = new Set();

  // Use other bullet facts as plausible distractors (different content = plausible but wrong in context)
  for (let offset = 1; offset <= facts.length; offset++) {
    const candidate = facts[(factIndex + offset) % facts.length];
    if (candidate.text !== correctText && candidate.type === 'bullet' && distractors.size < 3) {
      distractors.add(candidate.text.replace(/\.$/, '') + ' — however this does not apply here.');
    }
    if (distractors.size >= 3) break;
  }

  // Fill remaining slots from common wrong options
  let wrongIndex = factIndex % COMMON_WRONG_OPTIONS.length;
  while (distractors.size < 3) {
    const candidate = COMMON_WRONG_OPTIONS[wrongIndex % COMMON_WRONG_OPTIONS.length];
    if (!distractors.has(candidate)) distractors.add(candidate);
    wrongIndex++;
  }

  return Array.from(distractors).slice(0, 3);
}

// ─── Question builders by type ────────────────────────────────────────────────

function buildEasyQuestion(facts, factIndex, lesson) {
  const fact = pickFact(facts.filter((f) => f.type === 'bullet'), factIndex);
  const allFacts = facts;
  const distractors = buildDistractors(fact.text, allFacts, factIndex);

  return {
    question_type: 'multiple_choice',
    question_text: `In relation to ${fact.heading.toLowerCase()}, which of the following statements is correct?`,
    options: [fact.text, ...distractors],
    correct_answer: 0,
    explanation: `This is a core fire safety principle from the "${fact.heading}" section of the ${lesson.title} lesson.`,
  };
}

function buildMediumQuestion(facts, factIndex, lesson) {
  const paraFacts = facts.filter((f) => f.type === 'paragraph');
  const fact = pickFact(paraFacts.length > 0 ? paraFacts : facts, factIndex);

  // Extract a key phrase to frame the scenario
  const words = fact.text.split(/[.!?,]+/).filter((s) => s.trim().length > 15);
  const scenarioStem = words[factIndex % words.length] || fact.text;
  const trimmed = scenarioStem.trim();

  const correctAction = facts.filter((f) => f.type === 'bullet')[factIndex % Math.max(1, facts.filter((f) => f.type === 'bullet').length)];
  const correctText = correctAction ? correctAction.text : trimmed;
  const distractors = buildDistractors(correctText, facts, factIndex + 2);

  return {
    question_type: 'multiple_choice',
    question_text: `During a shift in a care home, you observe: "${trimmed.slice(0, 120)}..." What is the most appropriate action for staff?`,
    options: [correctText, ...distractors],
    correct_answer: 0,
    explanation: `Staff should respond according to the guidance in the "${fact.heading}" section covering ${lesson.title}.`,
  };
}

function buildHardQuestion(facts, factIndex, lesson) {
  const useTrueFalse = factIndex % 2 === 0;
  const fact = pickFact(facts, factIndex);

  if (useTrueFalse) {
    // Hard true/false: use a real fact (TRUE) or a negated statement (FALSE)
    const isTrue = factIndex % 3 !== 2; // ~67% TRUE, 33% FALSE
    if (isTrue) {
      return {
        question_type: 'true_false',
        question_text: `True or False: ${fact.text}`,
        options: ['True', 'False'],
        correct_answer: 0,
        explanation: `This statement is TRUE. It reflects key fire safety practice covered under "${fact.heading}" in the ${lesson.title} lesson.`,
      };
    }
    // Construct a FALSE statement by inserting a common error
    const falseVersions = [
      `${fact.text.replace('must', 'do not need to')}`,
      `${fact.text.replace('should', 'are not required to')}`,
      `${fact.text.replace('can', 'cannot')}`,
      `Staff are exempt from the requirement: "${fact.text}"`,
    ];
    const falseText = falseVersions[factIndex % falseVersions.length];
    return {
      question_type: 'true_false',
      question_text: `True or False: ${falseText}`,
      options: ['True', 'False'],
      correct_answer: 1,
      explanation: `This statement is FALSE. The correct position is: ${fact.text}`,
    };
  }

  // Hard scenario MCQ requiring reasoning
  const distractors = buildDistractors(fact.text, facts, factIndex + 5);
  return {
    question_type: 'multiple_choice',
    question_text: `A care home manager is reviewing fire safety compliance. Regarding "${fact.heading.toLowerCase()}", which action best demonstrates correct fire safety practice?`,
    options: [fact.text, ...distractors],
    correct_answer: 0,
    explanation: `This reflects the core principle: "${fact.text}" — a requirement under fire safety legislation for UK care homes.`,
  };
}

// ─── Core builders ────────────────────────────────────────────────────────────

function buildLessonQuestionSet(lesson) {
  const facts = extractLessonFacts(lesson);
  const questions = [];

  for (let i = 0; i < QUESTION_TARGET; i++) {
    const difficulty = DIFFICULTY_PLAN[i];
    let q;
    if (difficulty === 'easy') {
      q = buildEasyQuestion(facts, i, lesson);
    } else if (difficulty === 'medium') {
      q = buildMediumQuestion(facts, i, lesson);
    } else {
      q = buildHardQuestion(facts, i, lesson);
    }
    questions.push({ ...q, difficulty });
  }

  return questions;
}

function buildCourseQuizPackage({ lessons, versionTag }) {
  const lessonQuizzes = lessons.map((lesson) => ({
    lesson_number: lesson.lesson_number,
    title: lesson.title,
    questions: buildLessonQuestionSet(lesson).map((q, index) => ({
      ...q,
      version_tag: versionTag,
      lesson_number: lesson.lesson_number,
      order_index: index,
      is_final_assessment: false,
    })),
  }));

  // Final exam: 2 questions per lesson (first easy, first medium)
  const finalQuestions = lessonQuizzes.flatMap((lq) => {
    const easy = lq.questions.find((q) => q.difficulty === 'easy');
    const medium = lq.questions.find((q) => q.difficulty === 'medium');
    return [easy, medium].filter(Boolean);
  }).map((q, index) => ({
    ...q,
    question_key: `final-${q.lesson_number}-${index + 1}`,
    is_final_assessment: true,
    order_index: index,
  }));

  return {
    lessonQuizzes,
    finalExam: {
      version_tag: versionTag,
      questions: finalQuestions,
    },
  };
}

module.exports = {
  QUESTION_TARGET,
  DIFFICULTY_PLAN,
  extractLessonFacts,
  buildLessonQuestionSet,
  buildCourseQuizPackage,
};
