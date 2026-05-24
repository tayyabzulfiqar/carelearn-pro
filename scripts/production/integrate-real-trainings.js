/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { Client } = require('ssh2');

const VPS = {
  host: process.env.VPS_HOST || '187.127.105.253',
  port: Number(process.env.VPS_PORT || 22),
  username: process.env.VPS_USER || 'root',
  password: process.env.VPS_PASS || 'Abbasi@3155093759',
};

const COURSE_ROOT = process.env.HEALTHCARE_TRAININGS_ROOT || 'C:\\Users\\HP\\Desktop\\Healthcare trainings\\Nurse';

const COURSES = [
  {
    key: 'bls',
    id: 'b721b5b7-bf9e-4c44-b89d-ede14a5e7bf7',
    title: 'Basic Life Support',
    slug: 'basic-life-support',
    description: 'Essential emergency response and life support training.',
    category: 'Nurse',
    duration: 60,
    folder: 'Basic Life Support',
    assetSlug: 'bls',
    passMark: 75,
    mandatory: true,
    assessmentPattern: /^assessment_\d+\.json$/i,
  },
  {
    key: 'epilepsy',
    id: '3da8ba5f-1a6d-4de9-8de9-1f9db5cc32c4',
    title: 'Caring for Someone with Epilepsy',
    slug: 'caring-for-someone-with-epilepsy',
    description: 'Practical epilepsy care, seizure recognition and safe response.',
    category: 'Nurse',
    duration: 75,
    folder: 'Caring for Someone with Epilepsy',
    assetSlug: 'epilepsy',
    passMark: 75,
    mandatory: true,
    assessmentPattern: /^assessment_\d+\.json$/i,
  },
  {
    key: 'catheter',
    id: 'f9fe3f1e-2c4c-49d1-bb6f-9ecbc6a95f8a',
    title: 'Catheter Care',
    slug: 'catheter-care',
    description: 'Safe catheter insertion, maintenance, complication prevention and documentation best practice.',
    category: 'Nurse',
    duration: 75,
    folder: 'Catheter Care',
    assetSlug: 'catheter-care',
    passMark: 75,
    mandatory: true,
    assessmentPattern: /^assessment_\d+\.json$/i,
  },
];

const DEMO = {
  email: 'demo.learner@carelearn.local',
  password: 'DemoLearner123!',
  firstName: 'Demo',
  lastName: 'Learner',
};

function exec(conn, command, timeout = 300000) {
  return new Promise((resolve, reject) => {
    let out = '';
    let err = '';
    const t = setTimeout(() => reject(new Error(`timeout: ${command.slice(0, 120)}`)), timeout);
    conn.exec(command, (e, stream) => {
      if (e) {
        clearTimeout(t);
        reject(e);
        return;
      }
      stream.on('close', (code) => {
        clearTimeout(t);
        resolve({ code, out: out.trim(), err: err.trim() });
      });
      stream.on('data', (d) => { out += d.toString(); });
      stream.stderr.on('data', (d) => { err += d.toString(); });
    });
  });
}

function writeRemoteFile(conn, remotePath, content) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      const stream = sftp.createWriteStream(remotePath, { flags: 'w', encoding: 'utf8', mode: 0o644 });
      stream.on('error', reject);
      stream.on('close', resolve);
      stream.end(content);
    });
  });
}

function sqlEsc(v) {
  return String(v ?? '').replace(/'/g, "''");
}

function toCanonicalType(type, block) {
  const t = String(type || '').toLowerCase().trim();
  if (t === 'heading') return 'heading';
  if (t === 'paragraph' || t === 'rich_text') return 'rich_text';
  if (t === 'hero_image' || t === 'image') return 'image';
  if (t === 'learning_objectives' || t === 'objective_list' || t === 'bulleted_list' || t === 'bullet_list') return 'objective_list';
  if (Array.isArray(block?.items) && block.items.length) return 'objective_list';
  return 'rich_text';
}

function normalizeBlock(block, idx, imageSet, issues, lessonFile) {
  const canonical = toCanonicalType(block?.type, block);
  const base = {
    id: crypto.randomUUID(),
    order: idx,
    meta: { analyticsKey: `${block?.type || canonical}_${idx + 1}`, tags: [], aiHints: { semanticRole: '', summary: '', difficulty: '' } },
  };

  if (canonical === 'heading') {
    return { ...base, type: 'heading', payload: { text: String(block?.text || '').trim(), level: 2 } };
  }

  if (canonical === 'rich_text') {
    const text = String(block?.text || block?.content || '').trim();
    return { ...base, type: 'rich_text', payload: { text: text || JSON.stringify(block || {}) } };
  }

  if (canonical === 'objective_list') {
    const objectives = Array.isArray(block?.items) ? block.items.map((x) => String(x).trim()).filter(Boolean) : [];
    return { ...base, type: 'objective_list', payload: { objectives, text: '' } };
  }

  const rawSrc = String(block?.src || block?.image || block?.payload?.src || '').trim();
  const fileName = rawSrc.split('/').pop();
  if (fileName && /^IMG_\d+\.webp$/i.test(fileName) && !imageSet.has(fileName)) {
    issues.push(`${lessonFile}: missing image asset ${fileName}`);
  }
  return {
    ...base,
    type: 'image',
    payload: {
      src: rawSrc,
      alt: String(block?.alt || '').trim(),
      caption: String(block?.caption || '').trim(),
      width: 100,
      align: 'center',
    },
  };
}

function validateAndParseLessons(courseDir) {
  const files = fs.readdirSync(courseDir);
  const lessonFiles = files.filter((f) => /^lesson_\d+\.json$/i.test(f))
    .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
  const imageFiles = files.filter((f) => /^IMG_\d+\.webp$/i.test(f));
  const imageSet = new Set(imageFiles);

  const issues = [];
  const warnings = [];
  if (!lessonFiles.length) issues.push('No lesson_*.json files found.');

  const numbers = lessonFiles.map((f) => Number(f.match(/\d+/)[0]));
  const duplicates = numbers.filter((n, i) => numbers.indexOf(n) !== i);
  if (duplicates.length) issues.push(`Duplicate lesson numbers detected: ${[...new Set(duplicates)].join(', ')}`);

  if (numbers.length) {
    const min = Math.min(...numbers);
    const max = Math.max(...numbers);
    const missing = [];
    for (let i = min; i <= max; i++) if (!numbers.includes(i)) missing.push(i);
    if (missing.length) warnings.push(`Missing lesson numbers in source range ${min}-${max}: ${missing.join(', ')}`);
  }

  const lessons = [];
  const referencedImages = new Set();
  lessonFiles.forEach((file, sortedIndex) => {
    const lessonPath = path.join(courseDir, file);
    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(lessonPath, 'utf8'));
    } catch {
      issues.push(`${file}: malformed JSON`);
      return;
    }

    const rawBlocks = Array.isArray(raw.blocks) ? raw.blocks : [];
    if (!rawBlocks.length) {
      issues.push(`${file}: no blocks array content`);
      return;
    }

    const title = String(raw.lessonTitle || raw.title || '').trim() || `Lesson ${sortedIndex + 1}`;
    const durationMinutes = Number(String(raw.lessonDuration || '').match(/\d+/)?.[0] || 5);

    const blocks = rawBlocks.map((b, idx) => normalizeBlock(b, idx, imageSet, issues, file));
    for (const block of blocks) {
      if (block.type === 'image') {
        const src = String(block.payload?.src || '').trim();
        const name = src.split('/').pop();
        if (name && /^IMG_\d+\.webp$/i.test(name)) referencedImages.add(name);
      }
    }

    lessons.push({
      title,
      sourceFile: file,
      sourceNumber: Number(file.match(/\d+/)[0]),
      lessonNumber: sortedIndex + 1,
      durationMinutes,
      content: {
        schema_version: 3,
        title,
        blocks,
        metadata: { locale: 'en', readingMinutes: durationMinutes, tags: [] },
      },
    });
  });

  const orphanImages = imageFiles.filter((img) => !referencedImages.has(img));
  if (orphanImages.length) warnings.push(`Orphan images not referenced by lesson JSON: ${orphanImages.join(', ')}`);

  return {
    lessons,
    lessonFiles,
    lessonNumbers: numbers,
    imageFiles,
    referencedImages: [...referencedImages],
    orphanImages,
    issues,
    warnings,
  };
}

function rewriteImageSrcForPublic(lessons, assetSlug) {
  return lessons.map((lesson) => ({
    ...lesson,
    content: {
      ...lesson.content,
      blocks: lesson.content.blocks.map((block) => {
        if (block.type !== 'image') return block;
        const src = String(block.payload?.src || '').trim();
        if (!src || src.startsWith('http://') || src.startsWith('https://') || src.startsWith('/')) return block;
        const name = src.split('/').pop();
        return {
          ...block,
          payload: { ...block.payload, src: `/course-assets/${assetSlug}/${name}` },
        };
      }),
    },
  }));
}

function parseAssessments(courseDir, pattern, courseKey) {
  const files = fs.readdirSync(courseDir).filter((f) => pattern.test(f)).sort();
  const issues = [];
  const warnings = [];
  const questions = [];

  files.forEach((file) => {
    const assessmentPath = path.join(courseDir, file);
    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(assessmentPath, 'utf8'));
    } catch {
      issues.push(`${file}: malformed JSON`);
      return;
    }
    if (!Array.isArray(raw.questions) || raw.questions.length === 0) {
      warnings.push(`${file}: no questions array`);
      return;
    }

    raw.questions.forEach((q, i) => {
      if (!Array.isArray(q.options) || q.options.length < 2) {
        issues.push(`${file} question ${i + 1}: options must have at least 2 entries`);
        return;
      }
      const options = q.options.map((o) => String(o?.text || '').trim());
      const correctAnswer = q.options.findIndex((o) => Boolean(o?.isCorrect));
      if (correctAnswer < 0) {
        issues.push(`${file} question ${i + 1}: missing correct option`);
        return;
      }
      questions.push({
        questionText: String(q.question || `Question ${i + 1}`).trim(),
        options,
        correctAnswer,
        explanation: String(q.options[correctAnswer]?.explanation || q.explanation || '').trim(),
        orderIndex: questions.length,
        difficulty: 'medium',
        questionKey: `${courseKey}-final-${questions.length + 1}`,
      });
    });
  });

  return { files, questions, issues, warnings };
}

function buildSql({ normalizedCourses, demoPasswordHash }) {
  const now = new Date().toISOString();
  const orgId = crypto.randomUUID();
  const demoUserId = crypto.randomUUID();

  const keepIds = normalizedCourses.map((c) => `'${c.id}'`).join(', ');

  let sql = `\nBEGIN;\n\n`;

  sql += `
INSERT INTO organisations (id, name, slug, is_active)
SELECT '${orgId}', 'CareLearn Demo Org', 'carelearn-demo-org', true
WHERE NOT EXISTS (SELECT 1 FROM organisations);

INSERT INTO users (id, email, password_hash, first_name, last_name, role, is_active)
SELECT '${demoUserId}', '${DEMO.email}', '${sqlEsc(demoPasswordHash)}', '${DEMO.firstName}', '${DEMO.lastName}', 'learner', true
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email='${DEMO.email}');

UPDATE users
SET password_hash='${sqlEsc(demoPasswordHash)}', first_name='${DEMO.firstName}', last_name='${DEMO.lastName}', role='learner', is_active=true, updated_at=NOW()
WHERE email='${DEMO.email}';
`;

  sql += `
DELETE FROM progress WHERE enrollment_id IN (
  SELECT e.id FROM enrollments e WHERE e.course_id NOT IN (${keepIds})
);
DELETE FROM assessment_attempts WHERE enrollment_id IN (
  SELECT e.id FROM enrollments e WHERE e.course_id NOT IN (${keepIds})
);
DELETE FROM certificates WHERE course_id NOT IN (${keepIds});
DELETE FROM assessment_questions WHERE course_id NOT IN (${keepIds});
DELETE FROM enrollments WHERE course_id NOT IN (${keepIds});
DELETE FROM progress WHERE enrollment_id IN (
  SELECT e.id FROM enrollments e WHERE e.course_id IN (${keepIds})
);
DELETE FROM assessment_attempts WHERE enrollment_id IN (
  SELECT e.id FROM enrollments e WHERE e.course_id IN (${keepIds})
);
DELETE FROM lessons WHERE module_id IN (SELECT id FROM modules WHERE course_id NOT IN (${keepIds}));
DELETE FROM modules WHERE course_id NOT IN (${keepIds});
DELETE FROM courses WHERE id NOT IN (${keepIds});
`;

  for (const course of normalizedCourses) {
    sql += `
INSERT INTO courses (id, title, slug, description, category, duration_minutes, renewal_years, pass_mark, is_mandatory, status)
VALUES ('${course.id}', '${sqlEsc(course.title)}', '${course.slug}', '${sqlEsc(course.description)}', '${course.category}', ${course.duration}, 1, ${course.passMark}, ${course.mandatory ? 'true' : 'false'}, 'published')
ON CONFLICT (id) DO UPDATE SET
  title=EXCLUDED.title,
  slug=EXCLUDED.slug,
  description=EXCLUDED.description,
  category=EXCLUDED.category,
  duration_minutes=EXCLUDED.duration_minutes,
  renewal_years=EXCLUDED.renewal_years,
  pass_mark=EXCLUDED.pass_mark,
  is_mandatory=EXCLUDED.is_mandatory,
  status='published',
  updated_at=NOW();
`;

    const moduleId = crypto.randomUUID();
    sql += `
DELETE FROM assessment_questions WHERE course_id='${course.id}';
DELETE FROM lessons WHERE module_id IN (SELECT id FROM modules WHERE course_id='${course.id}');
DELETE FROM modules WHERE course_id='${course.id}';

INSERT INTO modules (id, course_id, title, description, status, order_index)
VALUES ('${moduleId}', '${course.id}', 'Core Lessons', '${sqlEsc(course.title)} lesson sequence', 'published', 0);
`;

    for (const lesson of course.lessons) {
      sql += `
INSERT INTO lessons (id, module_id, title, content, status, is_visible, order_index, duration_minutes, published_at)
VALUES ('${crypto.randomUUID()}', '${moduleId}', '${sqlEsc(lesson.title)}', '${sqlEsc(JSON.stringify(lesson.content))}'::jsonb, 'published', true, ${lesson.lessonNumber - 1}, ${lesson.durationMinutes}, NOW());
`;
    }

    for (const q of course.assessmentQuestions) {
      sql += `
INSERT INTO assessment_questions (
  id, course_id, module_id, lesson_number, question_text, question_type, options,
  correct_answer, explanation, difficulty, is_final_assessment, is_active,
  version_tag, question_key, option_order, order_index
) VALUES (
  '${crypto.randomUUID()}', '${course.id}', '${moduleId}', NULL, '${sqlEsc(q.questionText)}', 'multiple_choice',
  '${sqlEsc(JSON.stringify(q.options))}'::jsonb, ${q.correctAnswer}, '${sqlEsc(q.explanation)}', '${q.difficulty}', true, true,
  'prod-real-courses-${now}', '${sqlEsc(q.questionKey)}', '${sqlEsc(JSON.stringify(q.options.map((_, idx) => idx)))}'::jsonb, ${q.orderIndex}
);
`;
    }

    sql += `
INSERT INTO organisation_members (id, organisation_id, user_id, role)
SELECT '${crypto.randomUUID()}', (SELECT id FROM organisations ORDER BY created_at ASC LIMIT 1), u.id, 'learner'
FROM users u WHERE u.email='${DEMO.email}'
ON CONFLICT (organisation_id, user_id) DO NOTHING;

INSERT INTO enrollments (id, user_id, course_id, organisation_id, status)
SELECT '${crypto.randomUUID()}', u.id, '${course.id}', (SELECT id FROM organisations ORDER BY created_at ASC LIMIT 1), 'enrolled'
FROM users u WHERE u.email='${DEMO.email}'
ON CONFLICT (user_id, course_id) DO NOTHING;
`;
  }

  sql += '\nCOMMIT;\n';
  return sql;
}

async function run() {
  const sourceCourses = COURSES.map((c) => ({ ...c, dir: path.join(COURSE_ROOT, c.folder) }));
  for (const c of sourceCourses) {
    if (!fs.existsSync(c.dir)) throw new Error(`Missing course folder: ${c.dir}`);
  }

  const validation = { at: new Date().toISOString(), root: COURSE_ROOT, courses: [] };
  const normalizedCourses = [];

  for (const c of sourceCourses) {
    const lessonValidation = validateAndParseLessons(c.dir);
    const assessmentValidation = parseAssessments(c.dir, c.assessmentPattern, c.key);

    const allIssues = [...lessonValidation.issues, ...assessmentValidation.issues];
    const allWarnings = [...lessonValidation.warnings, ...assessmentValidation.warnings];

    validation.courses.push({
      key: c.key,
      id: c.id,
      title: c.title,
      folder: c.folder,
      lesson_files: lessonValidation.lessonFiles,
      lesson_numbers_source: lessonValidation.lessonNumbers,
      lesson_count_normalized: lessonValidation.lessons.length,
      assessment_files: assessmentValidation.files,
      assessment_question_count: assessmentValidation.questions.length,
      image_files: lessonValidation.imageFiles,
      image_ref_count: lessonValidation.referencedImages.length,
      orphan_images: lessonValidation.orphanImages,
      issues: allIssues,
      warnings: allWarnings,
      normalized_numbering: lessonValidation.lessons.map((l) => ({ source_file: l.sourceFile, source_number: l.sourceNumber, normalized_number: l.lessonNumber })),
    });

    if (allIssues.length) {
      throw new Error(`Validation failed for ${c.title}: ${allIssues.join(' | ')}`);
    }

    normalizedCourses.push({
      ...c,
      lessons: rewriteImageSrcForPublic(lessonValidation.lessons, c.assetSlug),
      assessmentQuestions: assessmentValidation.questions,
    });
  }

  validation.summary = {
    total_courses: normalizedCourses.length,
    warnings_total: validation.courses.reduce((n, c) => n + c.warnings.length, 0),
    issues_total: 0,
  };

  fs.mkdirSync(path.resolve(process.cwd(), 'cleanup-reports'), { recursive: true });
  const validationReportPath = path.resolve(process.cwd(), 'cleanup-reports', `real-training-validation-${Date.now()}.json`);
  fs.writeFileSync(validationReportPath, JSON.stringify(validation, null, 2));

  const demoPasswordHash = await bcrypt.hash(DEMO.password, 12);
  const sql = buildSql({ normalizedCourses, demoPasswordHash });
  const sqlPath = path.resolve(process.cwd(), 'cleanup-reports', `real-training-integration-${Date.now()}.sql`);
  fs.writeFileSync(sqlPath, sql);

  const conn = new Client();
  await new Promise((resolve, reject) => {
    conn.on('ready', resolve).on('error', reject).connect({ ...VPS, readyTimeout: 30000 });
  });

  try {
    await exec(conn, 'mkdir -p /root/carelearn-pro/backups');
    const remoteSql = '/root/carelearn-pro/backups/real-training-integration.sql';
    await writeRemoteFile(conn, remoteSql, sql);

    const runCmd = `cd /root/carelearn-pro && cat ${remoteSql} | docker compose -f docker-compose.production.yml --env-file .env.production exec -T postgres psql -U carelearn -d carelearn -v ON_ERROR_STOP=1`;
    const applied = await exec(conn, runCmd);
    if (applied.code !== 0) throw new Error(applied.err || 'Failed to apply SQL');

    const verifyCmd = `cd /root/carelearn-pro && docker compose -f docker-compose.production.yml --env-file .env.production exec -T postgres psql -U carelearn -d carelearn -P pager=off -c "SELECT id,title,slug,status FROM courses ORDER BY title; SELECT c.title, COUNT(l.id) AS lesson_count FROM courses c LEFT JOIN modules m ON m.course_id=c.id LEFT JOIN lessons l ON l.module_id=m.id GROUP BY c.title ORDER BY c.title; SELECT c.title, COUNT(aq.id) AS final_questions FROM courses c LEFT JOIN assessment_questions aq ON aq.course_id=c.id AND aq.is_final_assessment=true AND aq.is_active=true GROUP BY c.title ORDER BY c.title;"`;
    const verified = await exec(conn, verifyCmd);
    if (verified.code !== 0) throw new Error(verified.err || 'Failed verify SQL');

    const report = {
      at: new Date().toISOString(),
      source_root: COURSE_ROOT,
      courses: normalizedCourses.map((c) => ({ key: c.key, id: c.id, lessons: c.lessons.length, questions: c.assessmentQuestions.length })),
      demo_learner: { email: DEMO.email, password: DEMO.password },
      validation_report: validationReportPath,
      verification: verified.out,
    };
    const reportPath = path.resolve(process.cwd(), 'cleanup-reports', `real-training-integration-report-${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`Integration complete.\nValidation: ${validationReportPath}\nReport: ${reportPath}`);
  } finally {
    conn.end();
  }
}

run().catch((err) => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
