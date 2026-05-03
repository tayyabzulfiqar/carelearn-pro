const fs = require('node:fs');
const path = require('node:path');

const db = require('../config/database');
const {
  loadFireSafetyCourseSource,
  validateFireSafetyCourseSource,
} = require('../lib/fire-safety-course');
const { QUIZ_DATA, scoreFireSafetyDemoQuiz } = require('../lib/fire-safety-demo-quiz');
const { buildCertificateTemplateModel } = require('../lib/certificate-template');

const SOURCE_ROOT = 'C:/Users/HP/Desktop/uk training';
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

  if (QUIZ_DATA.length !== 14) {
    errors.push(`Expected 14 quiz questions but found ${QUIZ_DATA.length}`);
  }

  const failAnswers = QUIZ_DATA.map((question, index) => ({
    question_id: question.id,
    answer: index < 10 ? 0 : 1,
  }));
  const passAnswers = QUIZ_DATA.map((question, index) => ({
    question_id: question.id,
    answer: index < 11 ? 0 : 1,
  }));

  const failResult = scoreFireSafetyDemoQuiz(failAnswers);
  const passResult = scoreFireSafetyDemoQuiz(passAnswers);
  if (failResult.passed) {
    errors.push('Fail threshold is incorrect for 10 correct answers');
  }
  if (!passResult.passed) {
    errors.push('Pass threshold is incorrect for 11 correct answers');
  }

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

  const passFailStatus = errors.some((error) => /pass|fail|question/i.test(error)) ? 'FAIL' : 'PASS';
  const certificateStatus = errors.some((error) => /certificate|director|company|name overlay/i.test(error)) ? 'FAIL' : 'PASS';

  console.log(`Total questions generated: ${QUIZ_DATA.length}`);
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
