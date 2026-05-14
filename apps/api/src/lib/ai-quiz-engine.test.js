const test = require('node:test');
const assert = require('node:assert/strict');
const { buildQuizFromCanonical, scoreQuizAttempt } = require('./ai-quiz-engine');

const canonical = {
  title: 'Fire Safety',
  sections: [
    {
      heading: 'Intro',
      blocks: [
        { type: 'paragraph', text: 'Always check exits before starting a shift.' },
        { type: 'paragraph', text: 'Never block fire doors in a care facility.' },
      ],
    },
    {
      heading: 'Response',
      blocks: [
        { type: 'paragraph', text: 'Report smoke immediately to the senior carer.' },
      ],
    },
  ],
};

test('builds deterministic quiz with source references', () => {
  const first = buildQuizFromCanonical({ canonical, trainingId: 't-1', passMark: 80 });
  const second = buildQuizFromCanonical({ canonical, trainingId: 't-1', passMark: 80 });
  assert.equal(first.questions.length, 4);
  assert.deepEqual(
    first.questions.map((q) => ({ id: q.id, type: q.type, prompt: q.prompt, options: q.options, answer: q.answer })),
    second.questions.map((q) => ({ id: q.id, type: q.type, prompt: q.prompt, options: q.options, answer: q.answer }))
  );
  assert.ok(first.questions.every((q) => Array.isArray(q.source_refs) && q.source_refs.length > 0));
});

test('scores attempts deterministically', () => {
  const quiz = buildQuizFromCanonical({ canonical, trainingId: 't-2' });
  const attempt = scoreQuizAttempt({ quiz, answers: [0, 1, 0, 0] });
  assert.equal(attempt.total_questions, 4);
  assert.equal(attempt.correct_answers, 4);
  assert.equal(attempt.score, 100);
  assert.equal(attempt.passed, true);
});

test('fails loudly for malformed canonical input', () => {
  assert.throws(() => buildQuizFromCanonical({ canonical: {}, trainingId: 'x' }), /AI_CANONICAL_INVALID|AI_CANONICAL_NO_PARAGRAPHS/);
});
