'use strict';

/**
 * Import fire safety course content + generate quiz questions.
 *
 * Safe to re-run: existing questions are deactivated (is_active=false),
 * not deleted. Enrollments, progress and attempts are never touched.
 *
 * Usage:
 *   node apps/api/src/scripts/import-fire-safety-course.js
 *   node apps/api/src/scripts/import-fire-safety-course.js --dry-run
 *   FIRE_SAFETY_CONTENT_DIR=/root/carelearn-pro/content/fire-safety node ...
 */

const path = require('node:path');
const fs = require('node:fs');

// Load .env relative to apps/api
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const db = require('../config/database');
const { buildCourseQuizPackage } = require('../lib/fire-safety-quiz');

const DRY_RUN = process.argv.includes('--dry-run');
const VERSION_TAG = 'fire-safety-v1';
const EXPECTED_LESSON_COUNT = 17;

const CONTENT_DIR = process.env.FIRE_SAFETY_CONTENT_DIR || 'C:\\Users\\HP\\Desktop\\uk training';
const COURSE_JSON_PATH = path.join(CONTENT_DIR, 'fire-safety-course.json');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(msg) { console.log(`[import] ${msg}`); }
function warn(msg) { console.warn(`[import][WARN] ${msg}`); }
function fail(msg) { console.error(`[import][ERROR] ${msg}`); process.exit(1); }

async function dbQuery(text, params) {
  if (DRY_RUN) {
    // In dry-run, still allow SELECT queries
    if (/^\s*(SELECT|WITH)/i.test(text)) return db.query(text, params);
    return { rows: [], rowCount: 0 };
  }
  return db.query(text, params);
}

// ─── Load and validate source JSON ───────────────────────────────────────────

function loadCourseJson() {
  if (!fs.existsSync(COURSE_JSON_PATH)) {
    fail(`Course JSON not found at: ${COURSE_JSON_PATH}\nSet FIRE_SAFETY_CONTENT_DIR env var to the directory containing fire-safety-course.json`);
  }
  const raw = fs.readFileSync(COURSE_JSON_PATH, 'utf8');
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    fail(`Invalid JSON in fire-safety-course.json: ${e.message}`);
  }
  return data;
}

function validateCourse(data) {
  if (!Array.isArray(data.lessons)) fail('fire-safety-course.json missing "lessons" array');
  if (data.lessons.length !== EXPECTED_LESSON_COUNT) {
    warn(`Expected ${EXPECTED_LESSON_COUNT} lessons, found ${data.lessons.length}. Proceeding anyway.`);
  }
  for (const lesson of data.lessons) {
    if (!lesson.lesson_number) fail(`Lesson missing lesson_number: ${JSON.stringify(lesson).slice(0, 60)}`);
    if (!lesson.title) fail(`Lesson ${lesson.lesson_number} missing title`);
    if (!Array.isArray(lesson.sections)) fail(`Lesson ${lesson.lesson_number} missing sections array`);
  }
  log(`Validated ${data.lessons.length} lessons OK`);
}

// ─── Find the fire safety course in DB ───────────────────────────────────────

async function findCourse() {
  const result = await db.query(
    `SELECT id, title FROM courses WHERE LOWER(title) LIKE '%fire safety%' ORDER BY created_at DESC LIMIT 1`,
  );
  if (!result.rows.length) fail('No fire safety course found in courses table. Create the course first.');
  const course = result.rows[0];
  log(`Found course: "${course.title}" (id=${course.id})`);
  return course;
}

// ─── Deactivate old questions ────────────────────────────────────────────────

async function deactivateOldQuestions(courseId) {
  const result = await dbQuery(
    `UPDATE questions SET is_active = false WHERE course_id = $1 AND is_active = true`,
    [courseId],
  );
  const count = DRY_RUN ? '(dry-run)' : result.rowCount;
  log(`Deactivated ${count} existing active questions for course ${courseId}`);
}

// ─── Insert questions ─────────────────────────────────────────────────────────

async function insertQuestions(courseId, allQuestions) {
  let inserted = 0;
  let errors = 0;

  for (const q of allQuestions) {
    try {
      const questionKey = q.question_key || `${VERSION_TAG}-l${q.lesson_number}-${q.order_index}`;
      await dbQuery(
        `INSERT INTO questions (
          course_id, question_type, question_text, options, correct_answer,
          explanation, difficulty, version_tag, is_active, question_key,
          lesson_number, is_final_assessment, order_index
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        ON CONFLICT (course_id, question_key) DO UPDATE SET
          question_type = EXCLUDED.question_type,
          question_text = EXCLUDED.question_text,
          options = EXCLUDED.options,
          correct_answer = EXCLUDED.correct_answer,
          explanation = EXCLUDED.explanation,
          difficulty = EXCLUDED.difficulty,
          version_tag = EXCLUDED.version_tag,
          is_active = EXCLUDED.is_active,
          lesson_number = EXCLUDED.lesson_number,
          is_final_assessment = EXCLUDED.is_final_assessment,
          order_index = EXCLUDED.order_index,
          updated_at = NOW()`,
        [
          courseId,
          q.question_type,
          q.question_text,
          JSON.stringify(q.options),
          q.correct_answer,
          q.explanation,
          q.difficulty || null,
          q.version_tag || VERSION_TAG,
          true,
          questionKey,
          q.lesson_number || null,
          q.is_final_assessment || false,
          q.order_index,
        ],
      );
      inserted++;
    } catch (err) {
      errors++;
      warn(`Failed to insert question at index ${q.order_index} (lesson ${q.lesson_number}): ${err.message}`);
    }
  }

  return { inserted, errors };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  log(`Starting fire safety course import${DRY_RUN ? ' [DRY RUN]' : ''}`);
  log(`Content directory: ${CONTENT_DIR}`);
  log(`Version tag: ${VERSION_TAG}`);

  const courseData = loadCourseJson();
  validateCourse(courseData);

  const { lessonQuizzes, finalExam } = buildCourseQuizPackage({
    lessons: courseData.lessons,
    versionTag: VERSION_TAG,
  });

  const lessonTotal = lessonQuizzes.reduce((sum, lq) => sum + lq.questions.length, 0);
  const finalTotal = finalExam.questions.length;
  log(`Generated: ${lessonTotal} lesson questions + ${finalTotal} final exam questions = ${lessonTotal + finalTotal} total`);

  const course = await findCourse();

  await deactivateOldQuestions(course.id);

  // Flatten all lesson questions with stable keys
  const allLessonQuestions = lessonQuizzes.flatMap((lq) =>
    lq.questions.map((q, idx) => ({
      ...q,
      question_key: `${VERSION_TAG}-l${lq.lesson_number}-${idx}`,
    })),
  );

  // Final exam questions already have question_key from buildCourseQuizPackage
  const allQuestions = [...allLessonQuestions, ...finalExam.questions];

  log(`Inserting ${allQuestions.length} questions...`);
  const { inserted, errors } = await insertQuestions(course.id, allQuestions);

  log(`\n${'─'.repeat(60)}`);
  log(`Import complete${DRY_RUN ? ' [DRY RUN — no writes made]' : ''}`);
  log(`  Course:            ${course.title}`);
  log(`  Lessons:           ${courseData.lessons.length}`);
  log(`  Lesson questions:  ${lessonTotal}`);
  log(`  Final questions:   ${finalTotal}`);
  log(`  Total inserted:    ${inserted}`);
  log(`  Errors:            ${errors}`);
  log(`${'─'.repeat(60)}\n`);

  if (errors > 0) {
    warn(`${errors} questions failed to insert. Check warnings above.`);
    process.exit(1);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('[import][FATAL]', err);
  process.exit(1);
});
