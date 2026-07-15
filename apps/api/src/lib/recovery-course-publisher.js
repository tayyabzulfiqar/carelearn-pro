const crypto = require('node:crypto');
const fs = require('node:fs');

const { convertRecoveryPackage } = require('./recovery-package-converter');
const { validatePublishableLessons } = require('./course-content-integrity');
const { BLS_COURSE_ID } = require('./bls-course-publisher');

// Courses that must never be written by this pipeline. The Recovery build is a
// separate, isolated course; production BLS is frozen.
const PROTECTED_COURSE_IDS = new Set([BLS_COURSE_ID]);

function assert(condition, message) {
  if (!condition) throw new Error(`[recovery-publisher] ${message}`);
}

/**
 * Builds a publishable course payload from a Recovery Package structures
 * document, optionally carrying over existing lessons ahead of the new ones.
 *
 * Reusable for any Recovery course: point structuresPath at that
 * course's Implementation_Ready_Lesson_Structures document.
 */
function buildRecoveryCoursePayload(config = {}) {
  const {
    courseId,
    title,
    slug,
    description = '',
    category = 'Nurse',
    passMark = 75,
    mandatory = false,
    moduleTitle = 'Core Lessons',
    moduleDescription = 'Recovery package lesson sequence',
    structuresPath,
    baseLessons = [],
    assessmentQuestions = [],
    tags = [],
    source = 'recovery_package',
  } = config;

  assert(courseId, 'a courseId is required');
  assert(!PROTECTED_COURSE_IDS.has(courseId), `courseId ${courseId} is a protected production course and must not be republished by this pipeline`);
  assert(title && slug, 'a title and slug are required');
  assert(structuresPath && fs.existsSync(structuresPath), `structures document not found at ${structuresPath}`);

  const markdown = fs.readFileSync(structuresPath, 'utf8');
  const { lessons: converted, report } = convertRecoveryPackage(markdown, { tags, source });

  const lessons = [
    ...baseLessons.map((lesson, index) => ({
      title: lesson.title,
      orderIndex: index,
      durationMinutes: lesson.durationMinutes || 5,
      content: lesson.content,
      origin: 'carried_over',
    })),
    ...converted.map((lesson, index) => ({
      title: lesson.title,
      orderIndex: baseLessons.length + index,
      durationMinutes: lesson.content.metadata.readingMinutes || 5,
      content: lesson.content,
      origin: 'recovery_package',
    })),
  ];

  // Do not publish anything the platform's own validator rejects.
  const validation = validatePublishableLessons(lessons.map((lesson) => ({ title: lesson.title, content: lesson.content })));
  assert(validation.passed, `lesson validation failed: ${JSON.stringify(validation.errors, null, 2)}`);

  return {
    course: {
      id: courseId,
      title,
      slug,
      description,
      category,
      durationMinutes: lessons.reduce((sum, lesson) => sum + lesson.durationMinutes, 0),
      passMark,
      mandatory,
    },
    module: { title: moduleTitle, description: moduleDescription },
    lessons: lessons.map((lesson, index) => ({
      ...lesson,
      content: validation.normalizedLessons[index].content,
    })),
    assessmentQuestions,
    conversionReport: report,
  };
}

/**
 * Publishes a built recovery payload. Scoped strictly to its own course id:
 * it never reads, deletes, or updates rows belonging to another course.
 */
async function publishRecoveryCourse(payload, db, { learner = null, resetLearnerData = false } = {}) {
  const courseId = payload.course.id;
  assert(!PROTECTED_COURSE_IDS.has(courseId), `refusing to publish over protected course ${courseId}`);

  const existing = await db.query('SELECT slug FROM courses WHERE id=$1', [courseId]);
  assert(
    existing.rows.length === 0 || existing.rows[0].slug === payload.course.slug,
    `course ${courseId} already exists with slug "${existing.rows[0]?.slug}" — refusing to overwrite an unrelated course`,
  );

  // Re-publishing replaces lessons, which progress rows reference. Rather than
  // fail on a raw foreign key error, require the caller to opt in to clearing
  // this course's own learner data first.
  const existingProgress = await db.query(
    `SELECT count(*)::int AS n FROM progress
     WHERE enrollment_id IN (SELECT id FROM enrollments WHERE course_id=$1)`,
    [courseId],
  );
  assert(
    existingProgress.rows[0].n === 0 || resetLearnerData,
    `course ${courseId} has ${existingProgress.rows[0].n} learner progress rows referencing its lessons. `
    + 'Re-publish with resetLearnerData (--reset) to clear this test course\'s own progress, attempts and certificates first.',
  );

  const moduleId = crypto.randomUUID();

  await db.query('BEGIN');
  try {
    await db.query(
      `INSERT INTO courses (id, title, slug, description, category, duration_minutes, renewal_years, pass_mark, is_mandatory, status)
       VALUES ($1, $2, $3, $4, $5, $6, 1, $7, $8, 'published')
       ON CONFLICT (id) DO UPDATE SET
         title=EXCLUDED.title,
         slug=EXCLUDED.slug,
         description=EXCLUDED.description,
         category=EXCLUDED.category,
         duration_minutes=EXCLUDED.duration_minutes,
         pass_mark=EXCLUDED.pass_mark,
         is_mandatory=EXCLUDED.is_mandatory,
         status='published',
         updated_at=NOW()`,
      [
        courseId,
        payload.course.title,
        payload.course.slug,
        payload.course.description,
        payload.course.category,
        payload.course.durationMinutes,
        payload.course.passMark,
        payload.course.mandatory,
      ],
    );

    if (resetLearnerData) {
      // Scoped strictly to this test course's own enrollments.
      await db.query(
        'DELETE FROM progress WHERE enrollment_id IN (SELECT id FROM enrollments WHERE course_id=$1)',
        [courseId],
      );
      await db.query(
        'DELETE FROM assessment_attempts WHERE enrollment_id IN (SELECT id FROM enrollments WHERE course_id=$1)',
        [courseId],
      );
      await db.query('DELETE FROM certificates WHERE course_id=$1', [courseId]);
    }

    // Re-publishing this test course replaces only its own content.
    await db.query('DELETE FROM assessment_questions WHERE course_id=$1', [courseId]);
    await db.query('DELETE FROM lessons WHERE module_id IN (SELECT id FROM modules WHERE course_id=$1)', [courseId]);
    await db.query('DELETE FROM modules WHERE course_id=$1', [courseId]);

    await db.query(
      `INSERT INTO modules (id, course_id, title, description, status, order_index)
       VALUES ($1, $2, $3, $4, 'published', 0)`,
      [moduleId, courseId, payload.module.title, payload.module.description],
    );

    for (const lesson of payload.lessons) {
      await db.query(
        `INSERT INTO lessons (id, module_id, title, content, status, is_visible, order_index, duration_minutes, published_at, is_structured_import)
         VALUES ($1, $2, $3, $4::jsonb, 'published', true, $5, $6, NOW(), true)`,
        [crypto.randomUUID(), moduleId, lesson.title, JSON.stringify(lesson.content), lesson.orderIndex, lesson.durationMinutes],
      );
    }

    for (const question of payload.assessmentQuestions) {
      await db.query(
        `INSERT INTO assessment_questions (
          id, course_id, module_id, lesson_number, question_text, question_type, options,
          correct_answer, explanation, difficulty, is_final_assessment, is_active,
          version_tag, question_key, option_order, order_index
        ) VALUES ($1, $2, $3, NULL, $4, 'multiple_choice', $5::jsonb, $6, $7, $8, true, true, $9, $10, $11::jsonb, $12)`,
        [
          crypto.randomUUID(),
          courseId,
          moduleId,
          question.questionText,
          JSON.stringify(question.options),
          question.correctAnswer,
          question.explanation,
          question.difficulty,
          'recovery-test-v1',
          question.questionKey,
          JSON.stringify(question.options.map((_, index) => index)),
          question.orderIndex,
        ],
      );
    }

    if (learner) {
      await db.query(
        `INSERT INTO users (id, email, password_hash, first_name, last_name, role, is_active)
         VALUES ($1, $2, $3, $4, $5, 'learner', true)
         ON CONFLICT (email) DO UPDATE SET
           password_hash=EXCLUDED.password_hash, role='learner', is_active=true, updated_at=NOW()`,
        [crypto.randomUUID(), learner.email, learner.passwordHash, learner.firstName, learner.lastName],
      );

      await db.query(
        `INSERT INTO organisations (id, name, slug, is_active)
         VALUES ($1, 'CareLearn Demo Org', 'carelearn-demo-org', true)
         ON CONFLICT (slug) DO UPDATE SET is_active=true, updated_at=NOW()`,
        [crypto.randomUUID()],
      );

      await db.query(
        `INSERT INTO organisation_members (id, organisation_id, user_id, role)
         SELECT $1, o.id, u.id, 'learner' FROM organisations o, users u
         WHERE o.slug='carelearn-demo-org' AND u.email=$2
         ON CONFLICT (organisation_id, user_id) DO NOTHING`,
        [crypto.randomUUID(), learner.email],
      );

      await db.query(
        `INSERT INTO enrollments (id, user_id, course_id, organisation_id, status)
         SELECT $1, u.id, $2, o.id, 'enrolled' FROM users u, organisations o
         WHERE u.email=$3 AND o.slug='carelearn-demo-org'
         ON CONFLICT (user_id, course_id) DO UPDATE SET status='enrolled', completed_at=NULL, updated_at=NOW()`,
        [crypto.randomUUID(), courseId, learner.email],
      );
    }

    await db.query('COMMIT');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }

  return {
    courseId,
    moduleId,
    lessons: payload.lessons.length,
    carriedOverLessons: payload.lessons.filter((lesson) => lesson.origin === 'carried_over').length,
    recoveryLessons: payload.lessons.filter((lesson) => lesson.origin === 'recovery_package').length,
    questions: payload.assessmentQuestions.length,
  };
}

module.exports = {
  PROTECTED_COURSE_IDS,
  buildRecoveryCoursePayload,
  publishRecoveryCourse,
};
