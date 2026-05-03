const path = require('node:path');
const { randomUUID } = require('node:crypto');

const db = require('../config/database');
const {
  loadFireSafetyCourseSource,
  validateFireSafetyCourseSource,
  formatCourseValidationReport,
} = require('../lib/fire-safety-course');
const { buildCourseQuizPackage } = require('../lib/fire-safety-quiz');

const COURSE_TITLE = 'Fire Safety Awareness';
const SOURCE_ROOT = 'C:/Users/HP/Desktop/uk training';
const JSON_PATH = path.join(SOURCE_ROOT, 'fire-safety-course.json');
const IMAGE_DIR = SOURCE_ROOT;
const PUBLIC_IMAGE_BASE = '/api/v1/local-images';

async function getCourseId() {
  const result = await db.query(
    'SELECT id FROM courses WHERE title = $1 LIMIT 1',
    [COURSE_TITLE]
  );

  if (!result.rows.length) {
    throw new Error(`Course "${COURSE_TITLE}" was not found in the database.`);
  }

  return result.rows[0].id;
}

async function ensurePrimaryModule(courseId) {
  const modules = await db.query(
    `SELECT id, title, order_index
     FROM modules
     WHERE course_id = $1
     ORDER BY order_index ASC, created_at ASC`,
    [courseId]
  );

  if (modules.rows.length > 0) {
    return modules.rows[0].id;
  }

  const moduleId = randomUUID();
  await db.query(
    `INSERT INTO modules (id, course_id, title, description, order_index)
     VALUES ($1, $2, $3, $4, $5)`,
    [moduleId, courseId, 'Fire Safety Course', 'Imported Fire Safety lesson sequence', 0]
  );
  return moduleId;
}

async function loadModuleLessons(moduleId) {
  const result = await db.query(
    `SELECT id, order_index
     FROM lessons
     WHERE module_id = $1
     ORDER BY order_index ASC, created_at ASC`,
    [moduleId]
  );
  return result.rows;
}

async function assertNoProtectedExtraLessons(extraLessonIds) {
  if (!extraLessonIds.length) return;

  const protectedLessons = await db.query(
    `SELECT DISTINCT lesson_id
     FROM progress
     WHERE lesson_id = ANY($1::uuid[])`,
    [extraLessonIds]
  );

  if (protectedLessons.rows.length > 0) {
    throw new Error('Fire Safety content refresh found extra lesson records linked to learner progress. Manual cleanup is required before exact 17-lesson enforcement can proceed safely.');
  }
}

async function upsertLessons({ moduleId, lessons }) {
  const existingLessons = await loadModuleLessons(moduleId);
  const reusableLessons = existingLessons.slice(0, lessons.length);
  const extraLessons = existingLessons.slice(lessons.length);

  await assertNoProtectedExtraLessons(extraLessons.map((lesson) => lesson.id));

  for (const [index, lesson] of lessons.entries()) {
    const existing = reusableLessons[index];
    if (existing) {
      await db.query(
        `UPDATE lessons
         SET title = $1,
             content = $2,
             order_index = $3,
             duration_minutes = $4
         WHERE id = $5`,
        [lesson.title, JSON.stringify(lesson.content), index, 5, existing.id]
      );
    } else {
      await db.query(
        `INSERT INTO lessons (id, module_id, title, content, order_index, duration_minutes)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [randomUUID(), moduleId, lesson.title, JSON.stringify(lesson.content), index, 5]
      );
    }
  }

  if (extraLessons.length > 0) {
    await db.query(
      'DELETE FROM lessons WHERE id = ANY($1::uuid[])',
      [extraLessons.map((lesson) => lesson.id)]
    );
  }
}

async function refreshQuestions({ courseId, moduleId, quizPackage }) {
  await db.query(
    `UPDATE assessment_questions
     SET is_active = false
     WHERE course_id = $1`,
    [courseId]
  );

  const questionGroups = [
    ...quizPackage.lessonQuizzes.map((lessonQuiz) => lessonQuiz.questions),
    quizPackage.finalExam.questions,
  ];

  for (const questions of questionGroups) {
    for (const question of questions) {
      await db.query(
        `INSERT INTO assessment_questions
         (id, course_id, module_id, lesson_number, question_text, question_type, options,
          correct_answer, explanation, difficulty, is_final_assessment, is_active,
          version_tag, question_key, option_order, order_index)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [
          randomUUID(),
          courseId,
          moduleId,
          question.lesson_number || null,
          question.question_text,
          question.question_type,
          JSON.stringify(question.options),
          question.correct_answer,
          `${question.difficulty} ${question.question_type} question generated from Fire Safety lesson content.`,
          question.difficulty,
          question.is_final_assessment,
          true,
          quizPackage.versionTag,
          question.question_key,
          JSON.stringify(question.options.map((_, index) => index)),
          question.order_index,
        ]
      );
    }
  }
}

async function run() {
  const courseId = await getCourseId();
  const source = loadFireSafetyCourseSource({
    jsonPath: JSON_PATH,
    imageDir: IMAGE_DIR,
    publicImageBase: PUBLIC_IMAGE_BASE,
  });
  const validation = validateFireSafetyCourseSource(source);
  const issues = validation.issues || [];

  if (issues.length > 0) {
    throw new Error(`Fire Safety import aborted due to local validation errors:\n- ${issues.join('\n- ')}`);
  }

  const versionTag = `fire-safety-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`;
  const quizPackage = buildCourseQuizPackage({
    lessons: validation.lessons.map((lesson) => ({
      lesson_number: lesson.lessonNumber,
      title: lesson.title,
      sections: lesson.content.sections,
    })),
    versionTag,
  });

  await db.query('BEGIN');

  try {
    await db.query(
      `UPDATE courses
       SET description = $1,
           duration_minutes = $2,
           pass_mark = $3,
           updated_at = NOW()
       WHERE id = $4`,
      [
        'Imported Fire Safety course loaded from local JSON with validated lesson images and deterministic generated quiz banks.',
        validation.totalLessons * 5,
        75,
        courseId,
      ]
    );

    const moduleId = await ensurePrimaryModule(courseId);
    await db.query(
      `UPDATE modules
       SET title = $1,
           description = $2,
           order_index = 0
       WHERE id = $3`,
      ['Fire Safety Course', 'Imported Fire Safety lesson sequence', moduleId]
    );

    await upsertLessons({ moduleId, lessons: validation.lessons });
    await refreshQuestions({ courseId, moduleId, quizPackage });

    await db.query('COMMIT');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }

  console.log(formatCourseValidationReport(validation));
  console.log(`Generated lesson quiz questions: ${quizPackage.lessonQuizzes.length * 14}`);
  console.log(`Generated final exam questions: ${quizPackage.finalExam.questions.length}`);
  console.log(`Question version tag: ${quizPackage.versionTag}`);
}

run()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    db.pool.end();
  });
