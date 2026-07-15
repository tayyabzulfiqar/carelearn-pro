/**
 * Publishes a Recovery package as an isolated test course.
 *
 * Usage:
 *   node apps/api/src/scripts/publish-recovery-course.js --dry-run
 *   node apps/api/src/scripts/publish-recovery-course.js
 *   node apps/api/src/scripts/publish-recovery-course.js --reset
 *
 * --dry-run converts and validates without touching the database.
 * --reset clears this test course's own progress, attempts and certificates,
 *   which is required to re-publish once a test learner has progress.
 */
const path = require('node:path');
const bcrypt = require('bcryptjs');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const { buildBlsCoursePayload } = require('../lib/bls-course-publisher');
const { buildRecoveryCoursePayload, publishRecoveryCourse } = require('../lib/recovery-course-publisher');

const DEFAULT_STRUCTURES_PATH = 'C:/Users/HP/Claude/Projects/Hybrid Benchmark SYSTEM/Recovery/Course_Specs/Basic_Life_Support/Implementation_Ready_Lesson_Structures_Batch1.md';

// Fixed, distinct from the production BLS course id so re-runs are idempotent.
const RECOVERY_COURSE_ID = 'c4f1a2d8-6b3e-4c9a-9f27-1d5e8a0b7c31';

const RECOVERY_LEARNER = {
  email: 'recovery.learner@carelearn.local',
  password: 'RecoveryLearner123!',
  firstName: 'Recovery',
  lastName: 'Learner',
};

// These four data files are the placeholder stubs for the lessons the recovery
// package authored (DEV-008/009/010/012). The package's versions replace them
// at the same sequence positions, so carrying them over as well would publish
// each lesson twice. Preview_Build_And_Verification_Plan.md §2 carries over
// lessons 1-11 only, which is what excluding these leaves.
const SUPERSEDED_LESSON_FILES = [
  'lesson_15.json', // Lung Ventilation
  'lesson_16.json', // Reporting and Recording
  'lesson_17.json', // DNACPR, ReSPECT and ADRT
  'lesson_18.json', // Course Summary
];

function buildPayload(structuresPath = process.env.RECOVERY_STRUCTURES_PATH || DEFAULT_STRUCTURES_PATH) {
  // Carry the existing, verified BLS lessons over under new ids so the test
  // course can be completed front to back. Production BLS is not read from or
  // written to — this reuses the same repo data files it is built from.
  const bls = buildBlsCoursePayload();

  const superseded = bls.lessons.filter((lesson) => SUPERSEDED_LESSON_FILES.includes(lesson.sourceFile));
  if (superseded.length !== SUPERSEDED_LESSON_FILES.length) {
    const found = superseded.map((lesson) => lesson.sourceFile);
    throw new Error(`expected to supersede ${SUPERSEDED_LESSON_FILES.length} stub lessons, matched ${found.length}: ${found.join(', ')}`);
  }

  const baseLessons = bls.lessons.filter((lesson) => !SUPERSEDED_LESSON_FILES.includes(lesson.sourceFile));

  return buildRecoveryCoursePayload({
    courseId: RECOVERY_COURSE_ID,
    title: 'Basic Life Support - Recovery Test',
    slug: 'basic-life-support-recovery-test',
    description: 'Isolated recovery-package test build of Basic Life Support. Not for production enrolment.',
    category: bls.course.category,
    passMark: bls.course.passMark,
    mandatory: false,
    structuresPath,
    baseLessons,
    assessmentQuestions: bls.assessmentQuestions,
    tags: ['basic-life-support', 'recovery-test'],
    source: 'bls_recovery_package_batch1',
  });
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const payload = buildPayload();

  const summary = {
    dryRun,
    courseId: payload.course.id,
    title: payload.course.title,
    slug: payload.course.slug,
    totalLessons: payload.lessons.length,
    carriedOver: payload.lessons.filter((lesson) => lesson.origin === 'carried_over').length,
    fromRecoveryPackage: payload.lessons.filter((lesson) => lesson.origin === 'recovery_package').length,
    assessmentQuestions: payload.assessmentQuestions.length,
    conversionReport: payload.conversionReport,
    lessonOrder: payload.lessons.map((lesson) => `${lesson.orderIndex + 1}. ${lesson.title}${lesson.origin === 'recovery_package' ? ' (new)' : ''}`),
  };

  if (dryRun) {
    console.log(JSON.stringify({ success: true, validated: true, ...summary }, null, 2));
    return;
  }

  const db = require('../config/database');
  try {
    const result = await publishRecoveryCourse(payload, db, {
      resetLearnerData: process.argv.includes('--reset'),
      learner: {
        email: RECOVERY_LEARNER.email,
        firstName: RECOVERY_LEARNER.firstName,
        lastName: RECOVERY_LEARNER.lastName,
        passwordHash: await bcrypt.hash(RECOVERY_LEARNER.password, 12),
      },
    });
    console.log(JSON.stringify({ success: true, ...summary, ...result, learnerEmail: RECOVERY_LEARNER.email }, null, 2));
  } finally {
    await db.pool.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { buildPayload, RECOVERY_COURSE_ID, RECOVERY_LEARNER };
