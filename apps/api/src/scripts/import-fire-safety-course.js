const path = require('node:path');
const { randomUUID } = require('node:crypto');

const db = require('../config/database');
const {
  loadFireSafetyCourseSource,
  validateFireSafetyCourseSource,
  formatCourseValidationReport,
} = require('../lib/fire-safety-course');
const { getStaticQuizQuestions } = require('../lib/quiz-data');

const COURSE_TITLE = 'Fire Safety Awareness';
const SOURCE_ROOT = process.env.FIRE_SAFETY_SOURCE_ROOT || path.resolve(__dirname, '../content/fire-safety');
const JSON_PATH = path.join(SOURCE_ROOT, 'fire-safety-course.json');
const IMAGE_DIR = SOURCE_ROOT;
const PUBLIC_IMAGE_BASE = '/api/v1/local-images';

async function ensureCourseId() {
  const result = await db.query(
    'SELECT id FROM courses WHERE title = $1 LIMIT 1',
    [COURSE_TITLE]
  );

  if (result.rows.length) {
    return result.rows[0].id;
  }

  const courseId = randomUUID();
  await db.query(
    `INSERT INTO courses
     (id, title, description, category, cqc_reference, duration_minutes, renewal_years, pass_mark, is_mandatory, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      courseId,
      COURSE_TITLE,
      'Imported Fire Safety course loaded from fire-safety-course.json with validated lesson images and static quiz-data.json.',
      'Fire Safety',
      'CQC-HS-004',
      85,
      1,
      75,
      true,
      'published',
    ]
  );
  return courseId;
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

async function refreshQuestions({ courseId, moduleId, questions }) {
  await db.query('DELETE FROM assessment_questions WHERE course_id = $1', [courseId]);

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
        null,
        question.question_text,
        question.question_type,
        JSON.stringify(question.options),
        question.correct_answer,
        'Static Fire Safety quiz question from quiz-data.json.',
        question.difficulty,
        true,
        true,
        'static-json',
        question.question_key,
        JSON.stringify(question.option_order),
        question.order_index,
      ]
    );
  }
}

async function run() {
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

  const questions = getStaticQuizQuestions();

  await db.query('BEGIN');

  try {
    const courseId = await ensureCourseId();

    await db.query(
      `UPDATE courses
       SET description = $1,
           duration_minutes = $2,
           pass_mark = $3,
           updated_at = NOW()
       WHERE id = $4`,
      [
        'Imported Fire Safety course loaded from local JSON with validated lesson images and static quiz-data.json.',
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
    await refreshQuestions({ courseId, moduleId, questions: getStaticQuizQuestions(courseId) });

    await db.query('COMMIT');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }

  console.log(formatCourseValidationReport(validation));
  console.log(`Static quiz questions imported: ${questions.length}`);
  console.log('Question version tag: static-json');
}

run()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    db.pool.end();
  });
