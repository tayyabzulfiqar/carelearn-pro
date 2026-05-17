'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildAttemptQuestionSet } = require('./quizSession');

const QUESTIONS = [
  { id: 'q1', question_text: 'Q1', options: ['A', 'B', 'C', 'D'], correct_answer: 0 },
  { id: 'q2', question_text: 'Q2', options: ['W', 'X', 'Y', 'Z'], correct_answer: 1 },
  { id: 'q3', question_text: 'Q3', options: ['P', 'Q', 'R', 'S'], correct_answer: 2 },
  { id: 'q4', question_text: 'Q4', options: ['M', 'N', 'O', 'L'], correct_answer: 3 },
];

describe('buildAttemptQuestionSet', () => {
  it('returns same question count as input', () => {
    const { questions } = buildAttemptQuestionSet({ seed: 'test-42', questions: QUESTIONS });
    assert.equal(questions.length, QUESTIONS.length);
  });

  it('is deterministic — same seed produces identical output', () => {
    const a = buildAttemptQuestionSet({ seed: 'deterministic-seed', questions: QUESTIONS });
    const b = buildAttemptQuestionSet({ seed: 'deterministic-seed', questions: QUESTIONS });
    assert.deepEqual(a, b);
  });

  it('different seeds produce different orderings', () => {
    const a = buildAttemptQuestionSet({ seed: 'seed-A', questions: QUESTIONS });
    const b = buildAttemptQuestionSet({ seed: 'seed-B', questions: QUESTIONS });
    const aOrder = a.questions.map((q) => q.id).join(',');
    const bOrder = b.questions.map((q) => q.id).join(',');
    assert.notEqual(aOrder, bOrder, 'Different seeds should yield different question orders');
  });

  it('remaps correct_answer after shuffling options', () => {
    const { questions } = buildAttemptQuestionSet({ seed: 'remap-test', questions: QUESTIONS });
    for (const q of questions) {
      const original = QUESTIONS.find((orig) => orig.id === q.id);
      const correctOptionText = original.options[original.correct_answer];
      assert.equal(
        q.options[q.correct_answer],
        correctOptionText,
        `correct_answer for ${q.id} should point to "${correctOptionText}" after shuffle`,
      );
    }
  });

  it('preserves all original options (no loss during shuffle)', () => {
    const { questions } = buildAttemptQuestionSet({ seed: 'preserve-test', questions: QUESTIONS });
    for (const q of questions) {
      const original = QUESTIONS.find((orig) => orig.id === q.id);
      assert.deepEqual(
        [...q.options].sort(),
        [...original.options].sort(),
        `Options for ${q.id} should be the same set, just reordered`,
      );
    }
  });

  it('assigns display_order sequentially', () => {
    const { questions } = buildAttemptQuestionSet({ seed: 'order-test', questions: QUESTIONS });
    questions.forEach((q, i) => {
      assert.equal(q.display_order, i);
    });
  });

  it('handles empty questions array', () => {
    const { questions } = buildAttemptQuestionSet({ seed: 'empty', questions: [] });
    assert.deepEqual(questions, []);
  });

  it('handles null/undefined questions gracefully', () => {
    const a = buildAttemptQuestionSet({ seed: 'null-test', questions: null });
    const b = buildAttemptQuestionSet({ seed: 'undef-test', questions: undefined });
    assert.deepEqual(a.questions, []);
    assert.deepEqual(b.questions, []);
  });

  it('seed is included in returned object', () => {
    const SEED = 'my-seed-123';
    const result = buildAttemptQuestionSet({ seed: SEED, questions: QUESTIONS });
    assert.equal(result.seed, SEED);
  });

  it('correct_answer always in bounds of shuffled options array', () => {
    for (let i = 0; i < 20; i++) {
      const { questions } = buildAttemptQuestionSet({ seed: `bounds-${i}`, questions: QUESTIONS });
      for (const q of questions) {
        assert.ok(q.correct_answer >= 0 && q.correct_answer < q.options.length,
          `correct_answer ${q.correct_answer} out of bounds for ${q.id}`);
      }
    }
  });
});
