'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  QUESTION_TARGET,
  DIFFICULTY_PLAN,
  extractLessonFacts,
  buildLessonQuestionSet,
  buildCourseQuizPackage,
} = require('./fire-safety-quiz');

// ─── Fixtures ────────────────────────────────────────────────────────────────

const LESSON_STUB = {
  lesson_number: 1,
  title: 'Introduction to Fire Safety',
  sections: [
    {
      heading: 'Fire Prevention',
      paragraphs: [
        'All care home staff must understand the principles of fire prevention and respond promptly to any fire alarm activation.',
        'Regular fire drills should be conducted at least twice a year to ensure all staff know evacuation procedures.',
      ],
      bullet_points: [
        'Check fire exits are clear and unobstructed at the start of every shift.',
        'Never prop open fire doors without an approved hold-open device.',
        'Report any faulty fire detection equipment to the fire warden immediately.',
        'Ensure flammable materials are stored in designated areas away from ignition sources.',
      ],
    },
    {
      heading: 'Evacuation Procedures',
      paragraphs: [
        'Each resident must have a Personal Emergency Evacuation Plan (PEEP) kept up to date and accessible to all staff.',
        'Staff should be familiar with the location of all fire assembly points and muster areas.',
      ],
      bullet_points: [
        'Assist residents who require help to evacuate according to their PEEP.',
        'Close all doors on your way out to slow the spread of fire and smoke.',
        'Do not use lifts during a fire evacuation.',
      ],
    },
  ],
};

const MINIMAL_LESSON = {
  lesson_number: 2,
  title: 'Fire Equipment',
  sections: [
    {
      heading: 'Equipment',
      paragraphs: ['Fire extinguishers must be inspected annually.'],
      bullet_points: ['Use the correct extinguisher type for the fire class.'],
    },
  ],
};

function buildStubLessons(count) {
  return Array.from({ length: count }, (_, i) => ({
    ...LESSON_STUB,
    lesson_number: i + 1,
    title: `Lesson ${i + 1}`,
  }));
}

// ─── extractLessonFacts ───────────────────────────────────────────────────────

describe('extractLessonFacts', () => {
  it('returns both paragraph and bullet facts', () => {
    const facts = extractLessonFacts(LESSON_STUB);
    const bullets = facts.filter((f) => f.type === 'bullet');
    const paragraphs = facts.filter((f) => f.type === 'paragraph');
    assert.ok(bullets.length > 0, 'Should have bullet facts');
    assert.ok(paragraphs.length > 0, 'Should have paragraph facts');
  });

  it('filters out short strings', () => {
    const lesson = {
      lesson_number: 1,
      title: 'Test',
      sections: [{ heading: 'H', paragraphs: ['Short'], bullet_points: ['Ok'] }],
    };
    const facts = extractLessonFacts(lesson);
    assert.equal(facts.length, 0, 'Short strings should be filtered');
  });

  it('handles missing sections gracefully', () => {
    const facts = extractLessonFacts({ lesson_number: 1, title: 'Empty' });
    assert.deepEqual(facts, []);
  });

  it('attaches heading to each fact', () => {
    const facts = extractLessonFacts(LESSON_STUB);
    for (const f of facts) {
      assert.ok(typeof f.heading === 'string' && f.heading.length > 0, 'Each fact needs a heading');
    }
  });
});

// ─── buildLessonQuestionSet ───────────────────────────────────────────────────

describe('buildLessonQuestionSet', () => {
  it(`returns exactly ${QUESTION_TARGET} questions`, () => {
    const qs = buildLessonQuestionSet(LESSON_STUB);
    assert.equal(qs.length, QUESTION_TARGET);
  });

  it('produces 4 easy, 7 medium, 3 hard', () => {
    const qs = buildLessonQuestionSet(LESSON_STUB);
    const easy = qs.filter((q) => q.difficulty === 'easy').length;
    const medium = qs.filter((q) => q.difficulty === 'medium').length;
    const hard = qs.filter((q) => q.difficulty === 'hard').length;
    assert.equal(easy, 4);
    assert.equal(medium, 7);
    assert.equal(hard, 3);
  });

  it('every question has required fields', () => {
    const qs = buildLessonQuestionSet(LESSON_STUB);
    for (const q of qs) {
      assert.ok(q.question_text, `question_text missing: ${JSON.stringify(q)}`);
      assert.ok(Array.isArray(q.options) && q.options.length > 0, `options missing`);
      assert.ok(typeof q.correct_answer === 'number', `correct_answer missing`);
      assert.ok(q.explanation, `explanation missing`);
      assert.ok(['multiple_choice', 'true_false'].includes(q.question_type), `bad question_type: ${q.question_type}`);
    }
  });

  it('correct_answer always at index 0', () => {
    const qs = buildLessonQuestionSet(LESSON_STUB);
    for (const q of qs) {
      assert.equal(q.correct_answer, 0, `correct_answer should be 0 (quizSession shuffles at runtime)`);
    }
  });

  it('MCQ questions have exactly 4 options', () => {
    const qs = buildLessonQuestionSet(LESSON_STUB);
    for (const q of qs.filter((q) => q.question_type === 'multiple_choice')) {
      assert.equal(q.options.length, 4, `MCQ should have 4 options: ${q.question_text.slice(0, 60)}`);
    }
  });

  it('true_false questions have exactly 2 options', () => {
    const qs = buildLessonQuestionSet(LESSON_STUB);
    for (const q of qs.filter((q) => q.question_type === 'true_false')) {
      assert.equal(q.options.length, 2);
      assert.deepEqual(q.options, ['True', 'False']);
    }
  });

  it('no placeholder Option A/B/C/D text', () => {
    const qs = buildLessonQuestionSet(LESSON_STUB);
    for (const q of qs) {
      for (const opt of q.options) {
        assert.ok(!/^Option [A-D]$/i.test(opt), `Placeholder option found: "${opt}"`);
      }
    }
  });

  it('works with minimal lesson (few facts — cycles without crashing)', () => {
    const qs = buildLessonQuestionSet(MINIMAL_LESSON);
    assert.equal(qs.length, QUESTION_TARGET);
  });

  it('is deterministic — same input produces same output', () => {
    const a = buildLessonQuestionSet(LESSON_STUB);
    const b = buildLessonQuestionSet(LESSON_STUB);
    assert.deepEqual(a, b);
  });
});

// ─── buildCourseQuizPackage ───────────────────────────────────────────────────

describe('buildCourseQuizPackage', () => {
  const LESSONS = buildStubLessons(17);

  it('returns 17 lesson quiz sets', () => {
    const pkg = buildCourseQuizPackage({ lessons: LESSONS, versionTag: 'fire-safety-v1' });
    assert.equal(pkg.lessonQuizzes.length, 17);
  });

  it('each lesson quiz has exactly 14 questions', () => {
    const pkg = buildCourseQuizPackage({ lessons: LESSONS, versionTag: 'fire-safety-v1' });
    for (const lq of pkg.lessonQuizzes) {
      assert.equal(lq.questions.length, QUESTION_TARGET, `Lesson ${lq.lesson_number} has wrong count`);
    }
  });

  it('final exam has 34 questions (2 per lesson × 17)', () => {
    const pkg = buildCourseQuizPackage({ lessons: LESSONS, versionTag: 'fire-safety-v1' });
    assert.equal(pkg.finalExam.questions.length, 34);
  });

  it('final exam questions are marked is_final_assessment=true', () => {
    const pkg = buildCourseQuizPackage({ lessons: LESSONS, versionTag: 'fire-safety-v1' });
    for (const q of pkg.finalExam.questions) {
      assert.equal(q.is_final_assessment, true);
    }
  });

  it('lesson questions are marked is_final_assessment=false', () => {
    const pkg = buildCourseQuizPackage({ lessons: LESSONS, versionTag: 'fire-safety-v1' });
    for (const lq of pkg.lessonQuizzes) {
      for (const q of lq.questions) {
        assert.equal(q.is_final_assessment, false);
      }
    }
  });

  it('version_tag is set on all questions', () => {
    const TAG = 'fire-safety-v1';
    const pkg = buildCourseQuizPackage({ lessons: LESSONS, versionTag: TAG });
    for (const lq of pkg.lessonQuizzes) {
      for (const q of lq.questions) {
        assert.equal(q.version_tag, TAG);
      }
    }
    for (const q of pkg.finalExam.questions) {
      assert.equal(q.version_tag, TAG);
    }
  });

  it('order_index is sequential within each lesson', () => {
    const pkg = buildCourseQuizPackage({ lessons: LESSONS, versionTag: 'fire-safety-v1' });
    for (const lq of pkg.lessonQuizzes) {
      lq.questions.forEach((q, idx) => {
        assert.equal(q.order_index, idx);
      });
    }
  });

  it('final exam total: 272 questions total inserted (238 lesson + 34 final)', () => {
    const pkg = buildCourseQuizPackage({ lessons: LESSONS, versionTag: 'fire-safety-v1' });
    const lessonTotal = pkg.lessonQuizzes.reduce((sum, lq) => sum + lq.questions.length, 0);
    const finalTotal = pkg.finalExam.questions.length;
    assert.equal(lessonTotal, 238, `Expected 238 lesson questions, got ${lessonTotal}`);
    assert.equal(finalTotal, 34, `Expected 34 final questions, got ${finalTotal}`);
    assert.equal(lessonTotal + finalTotal, 272);
  });

  it('works with single lesson', () => {
    const pkg = buildCourseQuizPackage({ lessons: [LESSON_STUB], versionTag: 'v1' });
    assert.equal(pkg.lessonQuizzes.length, 1);
    assert.equal(pkg.finalExam.questions.length, 2);
  });
});

// ─── DIFFICULTY_PLAN integrity ────────────────────────────────────────────────

describe('DIFFICULTY_PLAN', () => {
  it('has exactly 14 entries', () => {
    assert.equal(DIFFICULTY_PLAN.length, QUESTION_TARGET);
  });

  it('contains only valid difficulty values', () => {
    for (const d of DIFFICULTY_PLAN) {
      assert.ok(['easy', 'medium', 'hard'].includes(d), `Invalid difficulty: ${d}`);
    }
  });
});
