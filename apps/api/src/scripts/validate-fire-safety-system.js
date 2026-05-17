'use strict';

/**
 * Validates the fire safety quiz system after import.
 *
 * Checks:
 *  - Course exists in DB
 *  - Expected lesson count (17)
 *  - Total active questions (238 lesson + 34 final = 272)
 *  - Difficulty distribution (4/7/3 per lesson × 17)
 *  - pass_mark = 75 on the course
 *  - No placeholder options in question text
 *  - Certificate template image exists
 *
 * Usage:
 *   node apps/api/src/scripts/validate-fire-safety-system.js
 *   FIRE_SAFETY_CONTENT_DIR=/root/carelearn-pro/content/fire-safety node ...
 */

const path = require('node:path');
const fs = require('node:fs');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const db = require('../config/database');
const { QUESTION_TARGET } = require('../lib/fire-safety-quiz');

const CONTENT_DIR = process.env.FIRE_SAFETY_CONTENT_DIR || 'C:\\Users\\HP\\Desktop\\uk training';
const CERT_TEMPLATE_PATHS = [
  path.join(CONTENT_DIR, 'certificate-template.png'),
  '/app/apps/api/uploads/certificate-template.png',
  path.resolve(__dirname, '../../uploads/certificate-template.png'),
];

const EXPECTED_LESSONS = 17;
const EXPECTED_LESSON_QUESTIONS = 238; // 17 × 14
const EXPECTED_FINAL_QUESTIONS = 34;   // 17 × 2
const EXPECTED_TOTAL = EXPECTED_LESSON_QUESTIONS + EXPECTED_FINAL_QUESTIONS;
const PASS_MARK = 75;

const VERSION_TAG = 'fire-safety-v1';

let passed = 0;
let failed = 0;

function ok(label) {
  console.log(`  ✔  ${label}`);
  passed++;
}

function fail(label, detail) {
  console.log(`  ✘  ${label}${detail ? ` — ${detail}` : ''}`);
  failed++;
}

function section(title) {
  console.log(`\n${title}`);
  console.log('─'.repeat(60));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║  Fire Safety System Validation               ║');
  console.log('╚══════════════════════════════════════════════╝');

  // ── 1. Course exists ──────────────────────────────────────
  section('1. Course record');
  const courseResult = await db.query(
    `SELECT id, title, pass_mark FROM courses WHERE LOWER(title) LIKE '%fire safety%' ORDER BY created_at DESC LIMIT 1`,
  );
  if (!courseResult.rows.length) {
    fail('Fire safety course found in DB');
    console.log('\n[FATAL] No fire safety course found — cannot continue validation.\n');
    process.exit(1);
  }
  const course = courseResult.rows[0];
  ok(`Course found: "${course.title}" (id=${course.id})`);

  const passMark = parseInt(course.pass_mark, 10);
  if (passMark === PASS_MARK) {
    ok(`pass_mark = ${passMark}`);
  } else {
    fail(`pass_mark = ${PASS_MARK}`, `got ${passMark}`);
  }

  // ── 2. Question counts ────────────────────────────────────
  section('2. Question counts');

  const totalResult = await db.query(
    `SELECT COUNT(*) AS count FROM questions WHERE course_id = $1 AND is_active = true AND version_tag = $2`,
    [course.id, VERSION_TAG],
  );
  const total = parseInt(totalResult.rows[0].count, 10);
  if (total === EXPECTED_TOTAL) {
    ok(`Total active questions = ${total}`);
  } else {
    fail(`Total active questions`, `expected ${EXPECTED_TOTAL}, got ${total}`);
  }

  const lessonQResult = await db.query(
    `SELECT COUNT(*) AS count FROM questions WHERE course_id = $1 AND is_active = true AND version_tag = $2 AND is_final_assessment = false`,
    [course.id, VERSION_TAG],
  );
  const lessonQCount = parseInt(lessonQResult.rows[0].count, 10);
  if (lessonQCount === EXPECTED_LESSON_QUESTIONS) {
    ok(`Lesson questions = ${lessonQCount}`);
  } else {
    fail(`Lesson questions`, `expected ${EXPECTED_LESSON_QUESTIONS}, got ${lessonQCount}`);
  }

  const finalQResult = await db.query(
    `SELECT COUNT(*) AS count FROM questions WHERE course_id = $1 AND is_active = true AND version_tag = $2 AND is_final_assessment = true`,
    [course.id, VERSION_TAG],
  );
  const finalQCount = parseInt(finalQResult.rows[0].count, 10);
  if (finalQCount === EXPECTED_FINAL_QUESTIONS) {
    ok(`Final exam questions = ${finalQCount}`);
  } else {
    fail(`Final exam questions`, `expected ${EXPECTED_FINAL_QUESTIONS}, got ${finalQCount}`);
  }

  // ── 3. Lesson distribution ────────────────────────────────
  section('3. Lesson distribution');

  const lessonDistResult = await db.query(
    `SELECT lesson_number, COUNT(*) AS count
     FROM questions
     WHERE course_id = $1 AND is_active = true AND version_tag = $2 AND is_final_assessment = false
     GROUP BY lesson_number
     ORDER BY lesson_number`,
    [course.id, VERSION_TAG],
  );
  const lessonNumbers = lessonDistResult.rows.map((r) => parseInt(r.lesson_number, 10));
  const missingLessons = Array.from({ length: EXPECTED_LESSONS }, (_, i) => i + 1)
    .filter((n) => !lessonNumbers.includes(n));

  if (missingLessons.length === 0) {
    ok(`All ${EXPECTED_LESSONS} lessons have questions`);
  } else {
    fail(`Missing lesson questions`, `lessons ${missingLessons.join(', ')} have no questions`);
  }

  const wrongCount = lessonDistResult.rows.filter((r) => parseInt(r.count, 10) !== QUESTION_TARGET);
  if (wrongCount.length === 0) {
    ok(`All lessons have exactly ${QUESTION_TARGET} questions`);
  } else {
    for (const r of wrongCount) {
      fail(`Lesson ${r.lesson_number} question count`, `expected ${QUESTION_TARGET}, got ${r.count}`);
    }
  }

  // ── 4. Difficulty split ────────────────────────────────────
  section('4. Difficulty split (per lesson)');

  const diffResult = await db.query(
    `SELECT lesson_number, difficulty, COUNT(*) AS count
     FROM questions
     WHERE course_id = $1 AND is_active = true AND version_tag = $2 AND is_final_assessment = false
     GROUP BY lesson_number, difficulty
     ORDER BY lesson_number, difficulty`,
    [course.id, VERSION_TAG],
  );

  const diffMap = {};
  for (const r of diffResult.rows) {
    const ln = parseInt(r.lesson_number, 10);
    if (!diffMap[ln]) diffMap[ln] = {};
    diffMap[ln][r.difficulty] = parseInt(r.count, 10);
  }

  let diffOk = true;
  for (let ln = 1; ln <= EXPECTED_LESSONS; ln++) {
    const d = diffMap[ln] || {};
    if (d.easy !== 4 || d.medium !== 7 || d.hard !== 3) {
      fail(`Lesson ${ln} difficulty split`, `easy=${d.easy ?? 0} medium=${d.medium ?? 0} hard=${d.hard ?? 0} (expected 4/7/3)`);
      diffOk = false;
    }
  }
  if (diffOk) ok('All lessons: 4 easy / 7 medium / 3 hard');

  // ── 5. No placeholder options ──────────────────────────────
  section('5. Content quality');

  const placeholderResult = await db.query(
    `SELECT COUNT(*) AS count FROM questions
     WHERE course_id = $1 AND is_active = true AND version_tag = $2
     AND options::text ~* 'option [a-d]'`,
    [course.id, VERSION_TAG],
  );
  const placeholders = parseInt(placeholderResult.rows[0].count, 10);
  if (placeholders === 0) {
    ok('No Option A/B/C/D placeholder options found');
  } else {
    fail('Placeholder options found', `${placeholders} questions have placeholder text`);
  }

  // ── 6. Certificate template ────────────────────────────────
  section('6. Certificate template');

  const certFound = CERT_TEMPLATE_PATHS.find((p) => fs.existsSync(p));
  if (certFound) {
    ok(`Certificate template found: ${certFound}`);
  } else {
    fail('Certificate template image', `not found at any expected path:\n     ${CERT_TEMPLATE_PATHS.join('\n     ')}`);
  }

  // ── Summary ───────────────────────────────────────────────
  console.log('\n' + '═'.repeat(60));
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  if (failed === 0) {
    console.log('  ✅  System production-ready');
  } else {
    console.log('  ❌  System NOT ready — fix failures above before deploying');
  }
  console.log('═'.repeat(60) + '\n');

  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('[validate][FATAL]', err);
  process.exit(1);
});
