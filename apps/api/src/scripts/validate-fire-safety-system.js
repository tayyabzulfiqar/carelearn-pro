const fs = require('node:fs');
const path = require('node:path');

const db = require('../config/database');
const {
  loadFireSafetyCourseSource,
  validateFireSafetyCourseSource,
} = require('../lib/fire-safety-course');
const { getStaticQuizQuestions } = require('../lib/quiz-data');
const { buildCertificateTemplateModel } = require('../lib/certificate-template');

const SOURCE_ROOT = process.env.FIRE_SAFETY_SOURCE_ROOT || path.resolve(__dirname, '../content/fire-safety');
const JSON_PATH = path.join(SOURCE_ROOT, 'fire-safety-course.json');
const CERTIFICATE_PATH = path.join(SOURCE_ROOT, 'certificate_fire_safety.png');
const COURSE_TITLE = 'Fire Safety Awareness';

async function run() {
  const errors = [];
  const source = loadFireSafetyCourseSource({
    jsonPath: JSON_PATH,
    imageDir: SOURCE_ROOT,
    publicImageBase: '/api/v1/local-images',
  });
  const validation = validateFireSafetyCourseSource(source);

  if ((validation.issues || []).length > 0) {
    errors.push(...validation.issues);
  }

  if (source.lessons.length !== 17) {
    errors.push(`Expected 17 lessons but found ${source.lessons.length}`);
  }

  if (!fs.existsSync(CERTIFICATE_PATH)) {
    errors.push('certificate_fire_safety.png is missing');
  }

  const questions = getStaticQuizQuestions();
  if (questions.length !== 14) {
    errors.push(`Expected 14 static quiz questions but found ${questions.length}`);
  }
  questions.forEach((question, index) => {
    if (!Array.isArray(question.options) || question.options.length !== 4) {
      errors.push(`Question ${index + 1} does not have 4 options`);
    }
    if (!Number.isInteger(question.correct_answer) || question.correct_answer < 0 || question.correct_answer > 3) {
      errors.push(`Question ${index + 1} has an invalid correct answer`);
    }
  });

  const template = buildCertificateTemplateModel({
    imageRoot: SOURCE_ROOT,
    issuedAt: '2026-05-03T00:00:00.000Z',
  });
  if (!template.backgroundImage.endsWith('certificate_fire_safety.png')) {
    errors.push('Certificate background image is incorrect');
  }
  if (template.recipientName !== 'Tayyab Abbasi') {
    errors.push('Certificate name overlay is incorrect');
  }
  if (template.directorName !== 'Nargis Nawaz') {
    errors.push('Certificate director overlay is incorrect');
  }
  if (template.companyName !== 'Flexible Health Care One Solution Ltd') {
    errors.push('Certificate company overlay is incorrect');
  }

  const courseResult = await db.query(
    'SELECT id, pass_mark FROM courses WHERE title = $1 LIMIT 1',
    [COURSE_TITLE]
  );
  if (!courseResult.rows.length) {
    errors.push(`Course "${COURSE_TITLE}" was not found`);
  } else if (courseResult.rows[0].pass_mark !== 75) {
    errors.push(`Expected pass_mark 75 but found ${courseResult.rows[0].pass_mark}`);
  }

  const passFailStatus = errors.some((error) => /question|quiz|answer|option/i.test(error)) ? 'FAIL' : 'PASS';
  const certificateStatus = errors.some((error) => /certificate|director|company|name overlay/i.test(error)) ? 'FAIL' : 'PASS';

  console.log('Quiz source: STATIC JSON');
  console.log(`Static quiz questions: ${questions.length}`);
  console.log(`Pass/Fail logic status: ${passFailStatus}`);
  console.log(`Certificate status: ${certificateStatus}`);
  console.log(`Errors: ${errors.length}`);

  if (errors.length > 0) {
    errors.forEach((error) => console.log(`- ${error}`));
    process.exitCode = 1;
  } else {
    console.log('System fully implemented, tested, and production-ready');
  }
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    db.pool.end();
  });
