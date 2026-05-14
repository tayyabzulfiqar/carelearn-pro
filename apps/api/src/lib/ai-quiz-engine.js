const { createHash } = require('crypto');
const { collectCanonicalParagraphs, normalizeText } = require('./ai-content-utils');

function digest(value) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 16);
}

function buildQuizFromCanonical({ canonical, trainingId, passMark = 75 }) {
  const items = collectCanonicalParagraphs(canonical);
  const snippets = items.map((item) => item.sentences[0]);
  if (snippets.length < 2) {
    throw new Error('AI_QUIZ_INSUFFICIENT_CONTENT');
  }

  const primary = items[0];
  const secondary = items[Math.min(1, items.length - 1)];
  const tertiary = items[Math.min(2, items.length - 1)];
  const quaternary = items[Math.min(3, items.length - 1)];

  const questions = [];

  questions.push({
    id: `q_mcq_${digest(`${trainingId}|mcq|${primary.text}`)}`,
    type: 'mcq',
    prompt: `According to "${primary.heading}", which statement appears in the lesson?`,
    options: [
      normalizeText(primary.sentences[0]),
      normalizeText(secondary.sentences[0]),
      normalizeText(tertiary.sentences[0]),
      normalizeText(quaternary.sentences[0]),
    ],
    answer: 0,
    source_refs: [
      {
        section_index: primary.sectionIndex,
        block_index: primary.blockIndex,
        excerpt: normalizeText(primary.sentences[0]),
      },
    ],
  });

  questions.push({
    id: `q_tf_${digest(`${trainingId}|tf|${secondary.text}`)}`,
    type: 'true_false',
    prompt: `True or False: In section "${primary.heading}", the lesson states "${normalizeText(secondary.sentences[0])}"`,
    options: ['True', 'False'],
    answer: 1,
    source_refs: [
      {
        section_index: primary.sectionIndex,
        block_index: primary.blockIndex,
        excerpt: normalizeText(primary.sentences[0]),
      },
      {
        section_index: secondary.sectionIndex,
        block_index: secondary.blockIndex,
        excerpt: normalizeText(secondary.sentences[0]),
      },
    ],
  });

  questions.push({
    id: `q_scn_${digest(`${trainingId}|scenario|${tertiary.text}`)}`,
    type: 'scenario',
    prompt: `Scenario: A caregiver needs to apply guidance from "${secondary.heading}". Which response is directly stated in the lesson?`,
    options: [
      normalizeText(secondary.sentences[0]),
      normalizeText(primary.sentences[0]),
      normalizeText(tertiary.sentences[0]),
      normalizeText(quaternary.sentences[0]),
    ],
    answer: 0,
    source_refs: [
      {
        section_index: secondary.sectionIndex,
        block_index: secondary.blockIndex,
        excerpt: normalizeText(secondary.sentences[0]),
      },
    ],
  });

  const complianceSentence = items
    .flatMap((item) => item.sentences.map((sentence) => ({ ...item, sentence })))
    .find((item) => /(must|required|always|never|compliance|policy|safety)/i.test(item.sentence))
    || { ...primary, sentence: primary.sentences[0] };

  questions.push({
    id: `q_cmp_${digest(`${trainingId}|compliance|${complianceSentence.sentence}`)}`,
    type: 'compliance',
    prompt: 'Which statement below is directly documented as a compliance or safety instruction in this lesson?',
    options: [
      normalizeText(complianceSentence.sentence),
      normalizeText(secondary.sentences[0]),
      normalizeText(tertiary.sentences[0]),
      normalizeText(quaternary.sentences[0]),
    ],
    answer: 0,
    source_refs: [
      {
        section_index: complianceSentence.sectionIndex,
        block_index: complianceSentence.blockIndex,
        excerpt: normalizeText(complianceSentence.sentence),
      },
    ],
  });

  const totalQuestions = questions.length;
  return {
    generated_at: new Date().toISOString(),
    generator: 'deterministic_ai_quiz_v1',
    training_id: trainingId,
    pass_mark: Number(passMark),
    total_questions: totalQuestions,
    questions,
  };
}

function scoreQuizAttempt({ quiz, answers = [] }) {
  if (!quiz || !Array.isArray(quiz.questions) || !quiz.questions.length) {
    throw new Error('AI_QUIZ_INVALID');
  }
  const normalizedAnswers = Array.isArray(answers) ? answers : [];
  let correct = 0;
  const results = quiz.questions.map((question, index) => {
    const given = Number(normalizedAnswers[index]);
    const expected = Number(question.answer);
    const isCorrect = Number.isFinite(given) && given === expected;
    if (isCorrect) correct += 1;
    return {
      question_id: question.id,
      given_answer: Number.isFinite(given) ? given : null,
      correct_answer: expected,
      correct: isCorrect,
      source_refs: question.source_refs || [],
    };
  });
  const total = quiz.questions.length;
  const score = Math.round((correct / total) * 100);
  return {
    attempted_at: new Date().toISOString(),
    total_questions: total,
    correct_answers: correct,
    score,
    passed: score >= Number(quiz.pass_mark || 75),
    results,
  };
}

module.exports = {
  buildQuizFromCanonical,
  scoreQuizAttempt,
};
