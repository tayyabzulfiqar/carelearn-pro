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
const BLS_DIR = path.join(COURSE_ROOT, 'Basic Life Support');
const EPILEPSY_DIR = path.join(COURSE_ROOT, 'Caring for Someone with Epilepsy');

const BLS_COURSE_ID = 'b721b5b7-bf9e-4c44-b89d-ede14a5e7bf7';
const EPILEPSY_COURSE_ID = '3da8ba5f-1a6d-4de9-8de9-1f9db5cc32c4';

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

function sqlEsc(v) {
  return String(v).replace(/'/g, "''");
}

function parseLessonFiles(courseDir) {
  const files = fs.readdirSync(courseDir)
    .filter((f) => /^lesson_\d+\.json$/i.test(f))
    .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));

  return files.map((file, i) => {
    const raw = JSON.parse(fs.readFileSync(path.join(courseDir, file), 'utf8'));
    const lessonNumber = i + 1;
    const title = raw.lessonTitle || raw.title || `Lesson ${lessonNumber}`;
    const durationMinutes = Number(String(raw.lessonDuration || '').match(/\d+/)?.[0] || 5);

    const blocks = (raw.blocks || []).map((block, idx) => {
      const base = {
        id: crypto.randomUUID(),
        order: idx,
        meta: { analyticsKey: `${block.type || 'rich_text'}_${idx + 1}`, tags: [], aiHints: { semanticRole: '', summary: '', difficulty: '' } },
      };

      if (block.type === 'heading') {
        return { ...base, type: 'heading', payload: { text: block.text || '', level: 2 } };
      }
      if (block.type === 'paragraph') {
        return { ...base, type: 'rich_text', payload: { text: block.text || '' } };
      }
      if (block.type === 'learning_objectives' || block.type === 'objective_list') {
        const objectives = Array.isArray(block.items) ? block.items : [];
        return { ...base, type: 'objective_list', payload: { objectives, text: '' } };
      }
      if (block.type === 'hero_image' || block.type === 'image') {
        const src = block.src || '';
        return {
          ...base,
          type: 'image',
          payload: {
            src,
            alt: block.alt || '',
            caption: block.caption || '',
            width: 100,
            align: 'center',
          },
        };
      }

      if (Array.isArray(block.items) && block.items.length) {
        return { ...base, type: 'objective_list', payload: { objectives: block.items, text: '' } };
      }
      return { ...base, type: 'rich_text', payload: { text: block.text || JSON.stringify(block) } };
    });

    return {
      title,
      lessonNumber,
      durationMinutes,
      content: {
        schema_version: 3,
        title,
        blocks,
        metadata: {
          locale: 'en',
          readingMinutes: durationMinutes,
          tags: [],
        },
      },
    };
  });
}

function withPrefixedImageSrc(lessons, slug) {
  return lessons.map((lesson) => ({
    ...lesson,
    content: {
      ...lesson.content,
      blocks: (lesson.content.blocks || []).map((block) => {
        if (block.type !== 'image') return block;
        const src = block.payload?.src || '';
        if (!src || src.startsWith('http://') || src.startsWith('https://') || src.startsWith('/')) return block;
        return {
          ...block,
          payload: {
            ...block.payload,
            src: `/course-assets/${slug}/${src}`,
          },
        };
      }),
    },
  }));
}

function parseAssessment(courseDir) {
  const file = path.join(courseDir, 'assessment_01.json');
  if (!fs.existsSync(file)) return [];
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const qs = Array.isArray(raw.questions) ? raw.questions : [];
  return qs.map((q, i) => {
    const options = Array.isArray(q.options) ? q.options.map((o) => o.text || '') : [];
    const correctAnswer = Array.isArray(q.options) ? q.options.findIndex((o) => o.isCorrect) : -1;
    return {
      questionText: q.question || `Question ${i + 1}`,
      options,
      correctAnswer: correctAnswer >= 0 ? correctAnswer : 0,
      explanation: q.explanation || '',
      orderIndex: i,
      difficulty: 'medium',
      lessonNumber: null,
      isFinal: true,
      questionKey: `bls-final-${i + 1}`,
    };
  });
}

function buildSql({ blsLessons, epilepsyLessons, blsAssessment, demoPasswordHash }) {
  const now = new Date().toISOString();
  const orgId = crypto.randomUUID();
  const demoUserId = crypto.randomUUID();
  const blsModuleId = crypto.randomUUID();
  const epiModuleId = crypto.randomUUID();

  const lessonInserts = [];
  for (const lesson of blsLessons) {
    lessonInserts.push(`
      INSERT INTO lessons (id, module_id, title, content, status, is_visible, order_index, duration_minutes, published_at)
      VALUES ('${crypto.randomUUID()}', '${blsModuleId}', '${sqlEsc(lesson.title)}', '${sqlEsc(JSON.stringify(lesson.content))}'::jsonb, 'published', true, ${lesson.lessonNumber - 1}, ${lesson.durationMinutes}, NOW());`);
  }
  for (const lesson of epilepsyLessons) {
    lessonInserts.push(`
      INSERT INTO lessons (id, module_id, title, content, status, is_visible, order_index, duration_minutes, published_at)
      VALUES ('${crypto.randomUUID()}', '${epiModuleId}', '${sqlEsc(lesson.title)}', '${sqlEsc(JSON.stringify(lesson.content))}'::jsonb, 'published', true, ${lesson.lessonNumber - 1}, ${lesson.durationMinutes}, NOW());`);
  }

  const assessmentInserts = blsAssessment.map((q) => `
    INSERT INTO assessment_questions (
      id, course_id, module_id, lesson_number, question_text, question_type, options,
      correct_answer, explanation, difficulty, is_final_assessment, is_active,
      version_tag, question_key, option_order, order_index
    ) VALUES (
      '${crypto.randomUUID()}', '${BLS_COURSE_ID}', '${blsModuleId}', NULL, '${sqlEsc(q.questionText)}', 'multiple_choice',
      '${sqlEsc(JSON.stringify(q.options))}'::jsonb, ${q.correctAnswer}, '${sqlEsc(q.explanation)}', '${q.difficulty}', true, true,
      'prod-real-courses-${now}', '${sqlEsc(q.questionKey)}', '${sqlEsc(JSON.stringify(q.options.map((_, idx) => idx)))}'::jsonb, ${q.orderIndex}
    );`).join('\n');

  return `
BEGIN;

-- Ensure a tenant org exists for learner enrollments.
INSERT INTO organisations (id, name, slug, is_active)
SELECT '${orgId}', 'CareLearn Demo Org', 'carelearn-demo-org', true
WHERE NOT EXISTS (SELECT 1 FROM organisations);

-- Demo learner (learner-only) with deterministic email.
INSERT INTO users (id, email, password_hash, first_name, last_name, role, is_active)
SELECT '${demoUserId}', '${DEMO.email}', '${sqlEsc(demoPasswordHash)}', '${DEMO.firstName}', '${DEMO.lastName}', 'learner', true
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = '${DEMO.email}');

UPDATE users
SET password_hash='${sqlEsc(demoPasswordHash)}', first_name='${DEMO.firstName}', last_name='${DEMO.lastName}', role='learner', is_active=true, updated_at=NOW()
WHERE email='${DEMO.email}';

-- Keep only the two real production courses.
DELETE FROM progress WHERE enrollment_id IN (
  SELECT e.id FROM enrollments e WHERE e.course_id NOT IN ('${BLS_COURSE_ID}', '${EPILEPSY_COURSE_ID}')
);
DELETE FROM assessment_attempts WHERE enrollment_id IN (
  SELECT e.id FROM enrollments e WHERE e.course_id NOT IN ('${BLS_COURSE_ID}', '${EPILEPSY_COURSE_ID}')
);
DELETE FROM certificates WHERE course_id NOT IN ('${BLS_COURSE_ID}', '${EPILEPSY_COURSE_ID}');
DELETE FROM assessment_questions WHERE course_id NOT IN ('${BLS_COURSE_ID}', '${EPILEPSY_COURSE_ID}');
DELETE FROM enrollments WHERE course_id NOT IN ('${BLS_COURSE_ID}', '${EPILEPSY_COURSE_ID}');
DELETE FROM lessons WHERE module_id IN (SELECT id FROM modules WHERE course_id NOT IN ('${BLS_COURSE_ID}', '${EPILEPSY_COURSE_ID}'));
DELETE FROM modules WHERE course_id NOT IN ('${BLS_COURSE_ID}', '${EPILEPSY_COURSE_ID}');
DELETE FROM courses WHERE id NOT IN ('${BLS_COURSE_ID}', '${EPILEPSY_COURSE_ID}');

-- Upsert BLS and Epilepsy courses.
INSERT INTO courses (id, title, slug, description, category, duration_minutes, renewal_years, pass_mark, is_mandatory, status)
VALUES ('${BLS_COURSE_ID}', 'Basic Life Support', 'basic-life-support', 'Essential emergency response and life support training.', 'Nurse', 60, 1, 75, true, 'published')
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

INSERT INTO courses (id, title, slug, description, category, duration_minutes, renewal_years, pass_mark, is_mandatory, status)
VALUES ('${EPILEPSY_COURSE_ID}', 'Caring for Someone with Epilepsy', 'caring-for-someone-with-epilepsy', 'Practical epilepsy care, seizure recognition and safe response.', 'Nurse', 75, 1, 75, true, 'published')
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

-- Replace modules/lessons for both real courses.
DELETE FROM assessment_questions WHERE course_id IN ('${BLS_COURSE_ID}', '${EPILEPSY_COURSE_ID}');
DELETE FROM lessons WHERE module_id IN (SELECT id FROM modules WHERE course_id IN ('${BLS_COURSE_ID}', '${EPILEPSY_COURSE_ID}'));
DELETE FROM modules WHERE course_id IN ('${BLS_COURSE_ID}', '${EPILEPSY_COURSE_ID}');

INSERT INTO modules (id, course_id, title, description, status, order_index)
VALUES
('${blsModuleId}', '${BLS_COURSE_ID}', 'Core Lessons', 'Real BLS lesson sequence', 'published', 0),
('${epiModuleId}', '${EPILEPSY_COURSE_ID}', 'Core Lessons', 'Real epilepsy care lesson sequence', 'published', 0);

${lessonInserts.join('\n')}

${assessmentInserts}

-- Ensure learner belongs to org and is enrolled in both courses for persistence checks.
INSERT INTO organisation_members (id, organisation_id, user_id, role)
SELECT '${crypto.randomUUID()}', (SELECT id FROM organisations ORDER BY created_at ASC LIMIT 1), u.id, 'learner'
FROM users u WHERE u.email='${DEMO.email}'
ON CONFLICT (organisation_id, user_id) DO NOTHING;

INSERT INTO enrollments (id, user_id, course_id, organisation_id, status)
SELECT '${crypto.randomUUID()}', u.id, '${BLS_COURSE_ID}', (SELECT id FROM organisations ORDER BY created_at ASC LIMIT 1), 'enrolled'
FROM users u WHERE u.email='${DEMO.email}'
ON CONFLICT (user_id, course_id) DO NOTHING;

INSERT INTO enrollments (id, user_id, course_id, organisation_id, status)
SELECT '${crypto.randomUUID()}', u.id, '${EPILEPSY_COURSE_ID}', (SELECT id FROM organisations ORDER BY created_at ASC LIMIT 1), 'enrolled'
FROM users u WHERE u.email='${DEMO.email}'
ON CONFLICT (user_id, course_id) DO NOTHING;

COMMIT;
`;
}

async function run() {
  if (!fs.existsSync(BLS_DIR) || !fs.existsSync(EPILEPSY_DIR)) {
    throw new Error(`Course folders missing. Expected:\n- ${BLS_DIR}\n- ${EPILEPSY_DIR}`);
  }

  const blsLessons = withPrefixedImageSrc(parseLessonFiles(BLS_DIR), 'bls');
  const epilepsyLessons = withPrefixedImageSrc(parseLessonFiles(EPILEPSY_DIR), 'epilepsy');
  const blsAssessment = parseAssessment(BLS_DIR);
  const demoPasswordHash = await bcrypt.hash(DEMO.password, 12);

  const sql = buildSql({ blsLessons, epilepsyLessons, blsAssessment, demoPasswordHash });
  const sqlPath = path.resolve(process.cwd(), 'cleanup-reports', `real-training-integration-${Date.now()}.sql`);
  fs.mkdirSync(path.dirname(sqlPath), { recursive: true });
  fs.writeFileSync(sqlPath, sql);

  const conn = new Client();
  await new Promise((resolve, reject) => {
    conn.on('ready', resolve).on('error', reject).connect({ ...VPS, readyTimeout: 30000 });
  });

  try {
    await exec(conn, 'mkdir -p /root/carelearn-pro/backups');
    const remoteSql = '/root/carelearn-pro/backups/real-training-integration.sql';
    const writeCmd = `cat > ${remoteSql} <<'SQL'\n${sql}\nSQL`;
    const wr = await exec(conn, writeCmd);
    if (wr.code !== 0) throw new Error(wr.err || 'Failed to upload SQL');

    const runCmd = `cd /root/carelearn-pro && cat ${remoteSql} | docker compose -f docker-compose.production.yml --env-file .env.production exec -T postgres psql -U carelearn -d carelearn -v ON_ERROR_STOP=1`;
    const applied = await exec(conn, runCmd);
    if (applied.code !== 0) throw new Error(applied.err || 'Failed to apply SQL');

    const verifyCmd = `cd /root/carelearn-pro && docker compose -f docker-compose.production.yml --env-file .env.production exec -T postgres psql -U carelearn -d carelearn -P pager=off -c "SELECT id,title,slug,status FROM courses ORDER BY title; SELECT c.title, COUNT(l.id) AS lesson_count FROM courses c LEFT JOIN modules m ON m.course_id=c.id LEFT JOIN lessons l ON l.module_id=m.id GROUP BY c.title ORDER BY c.title; SELECT COUNT(*) AS final_questions FROM assessment_questions WHERE course_id='${BLS_COURSE_ID}' AND is_final_assessment=true AND is_active=true;"`;
    const verified = await exec(conn, verifyCmd);
    if (verified.code !== 0) throw new Error(verified.err || 'Failed verify SQL');

    const report = {
      at: new Date().toISOString(),
      source_root: COURSE_ROOT,
      bls_lessons: blsLessons.length,
      epilepsy_lessons: epilepsyLessons.length,
      bls_questions: blsAssessment.length,
      demo_learner: { email: DEMO.email, password: DEMO.password },
      verification: verified.out,
    };
    const reportPath = path.resolve(process.cwd(), 'cleanup-reports', `real-training-integration-report-${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`Integration complete.\nReport: ${reportPath}`);
  } finally {
    conn.end();
  }
}

run().catch((err) => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
