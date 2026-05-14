const { randomUUID: uuidv4 } = require('crypto');
const db = require('../config/database');
const { normalizeLessonContent } = require('../lib/lesson-content');
const { buildLearnerSmartRuntime, buildWeakTopicRecommendations } = require('../lib/layer4-intelligence');

async function getUserOrganisationId(userId) {
  const membership = await db.query(
    `SELECT organisation_id
     FROM organisation_members
     WHERE user_id = $1
     ORDER BY joined_at ASC
     LIMIT 1`,
    [userId]
  );
  return membership.rows[0]?.organisation_id || null;
}

async function getPublishedRuntimeSnapshot({ organisationId, courseId }) {
  if (!organisationId) return null;
  const row = await db.query(
    `SELECT value
     FROM organisation_settings
     WHERE organisation_id = $1 AND key = $2
     LIMIT 1`,
    [organisationId, `layer2_publish_snapshot_${courseId}`]
  );
  return row.rows[0]?.value || null;
}

async function upsertOrgSetting({ organisationId, key, value }) {
  await db.query(
    `INSERT INTO organisation_settings (id, organisation_id, key, value)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (organisation_id, key)
     DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [uuidv4(), organisationId, key, value]
  );
}

exports.getAll = async (req, res, next) => {
  try {
    const { category, status = 'published', search } = req.query;
    let query = `SELECT id, title, description, category, cqc_reference,
                 duration_minutes, renewal_years, is_mandatory, status, created_at
                 FROM courses WHERE 1=1`;
    const params = [];
    if (status) { params.push(status); query += ` AND status = $${params.length}`; }
    if (category) { params.push(category); query += ` AND category = $${params.length}`; }
    if (search) { params.push(`%${search}%`); query += ` AND title ILIKE $${params.length}`; }
    query += ' ORDER BY category, title';
    const result = await db.query(query, params);
    res.json({ courses: result.rows, total: result.rows.length });
  } catch (err) { next(err); }
};

exports.getById = async (req, res, next) => {
  try {
    const course = await db.query('SELECT * FROM courses WHERE id = $1', [req.params.id]);
    if (!course.rows.length) return res.status(404).json({ error: 'Course not found' });
    const organisationId = await getUserOrganisationId(req.user?.id);
    const runtimeSnapshot = await getPublishedRuntimeSnapshot({
      organisationId,
      courseId: req.params.id,
    });
    const modules = await db.query(
      `SELECT m.*, json_agg(l.* ORDER BY l.order_index) FILTER (WHERE l.id IS NOT NULL) as lessons
       FROM modules m LEFT JOIN lessons l ON l.module_id = m.id
       WHERE m.course_id = $1 GROUP BY m.id ORDER BY m.order_index`,
      [req.params.id]
    );
    res.json({
      course: {
        ...course.rows[0],
        runtime_snapshot: runtimeSnapshot,
        modules: modules.rows.map((module) => ({
          ...module,
        lessons: Array.isArray(module.lessons)
            ? module.lessons.map((lesson) => ({
                ...lesson,
                content: normalizeLessonContent({
                  title: lesson.title,
                  content: lesson.content || {},
                }),
              }))
            : [],
        })),
        questions: [],
      }
    });
  } catch (err) { next(err); }
};

exports.create = async (req, res, next) => {
  try {
    const {
      title, description, category, cqc_reference, skills_for_care_ref,
      target_roles, duration_minutes, renewal_years, pass_mark, is_mandatory
    } = req.body;
    const id = uuidv4();
    const result = await db.query(
      `INSERT INTO courses (id, title, description, category, cqc_reference,
       skills_for_care_ref, target_roles, duration_minutes, renewal_years,
       pass_mark, is_mandatory, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [id, title, description, category, cqc_reference, skills_for_care_ref,
       target_roles, duration_minutes, renewal_years, pass_mark, is_mandatory, req.user.id]
    );
    res.status(201).json({ course: result.rows[0] });
  } catch (err) { next(err); }
};

exports.update = async (req, res, next) => {
  try {
    const {
      title, description, category, cqc_reference,
      duration_minutes, renewal_years, pass_mark, is_mandatory
    } = req.body;
    const result = await db.query(
      `UPDATE courses SET title=$1, description=$2, category=$3,
       cqc_reference=$4, duration_minutes=$5, renewal_years=$6,
       pass_mark=$7, is_mandatory=$8, updated_at=NOW()
       WHERE id=$9 RETURNING *`,
      [title, description, category, cqc_reference,
       duration_minutes, renewal_years, pass_mark, is_mandatory, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Course not found' });
    res.json({ course: result.rows[0] });
  } catch (err) { next(err); }
};

exports.publish = async (req, res, next) => {
  try {
    const result = await db.query(
      `UPDATE courses SET status='published', updated_at=NOW()
       WHERE id=$1 RETURNING id, title, status`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Course not found' });
    res.json({ course: result.rows[0] });
  } catch (err) { next(err); }
};

exports.clone = async (req, res, next) => {
  try {
    const source = await db.query('SELECT * FROM courses WHERE id = $1', [req.params.id]);
    if (!source.rows.length) return res.status(404).json({ error: 'Course not found' });
    const s = source.rows[0];
    const newId = uuidv4();
    const result = await db.query(
      `INSERT INTO courses (id, title, description, category, cqc_reference,
       skills_for_care_ref, target_roles, duration_minutes, renewal_years,
       pass_mark, is_mandatory, created_by, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'draft') RETURNING *`,
      [newId, `${s.title} (Copy)`, s.description, s.category, s.cqc_reference,
       s.skills_for_care_ref, s.target_roles, s.duration_minutes,
       s.renewal_years, s.pass_mark, s.is_mandatory, req.user.id]
    );
    res.status(201).json({ course: result.rows[0] });
  } catch (err) { next(err); }
};

exports.getCategories = async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT category, COUNT(*) as course_count
       FROM courses WHERE status='published'
       GROUP BY category ORDER BY category`
    );
    res.json({ categories: result.rows });
  } catch (err) { next(err); }
};

exports.getSmartRuntime = async (req, res, next) => {
  try {
    const courseId = req.params.id;
    const userId = req.user?.id;
    const organisationId = req.tenant?.organisationId || await getUserOrganisationId(userId);
    if (!organisationId) return res.status(400).json({ error: 'Organisation not found' });

    const runtimeSnapshot = await getPublishedRuntimeSnapshot({ organisationId, courseId });
    if (!runtimeSnapshot?.render?.lessonBlocks) {
      return res.status(404).json({ error: 'Published runtime snapshot not found' });
    }

    const enrollment = await db.query(
      `SELECT id
       FROM enrollments
       WHERE user_id = $1 AND course_id = $2
       LIMIT 1`,
      [userId, courseId]
    );
    const enrollmentId = enrollment.rows[0]?.id || null;

    const [progressRows, latestFinalAttempt, wrongQuestionRows] = await Promise.all([
      enrollmentId
        ? db.query(
          `SELECT lesson_id, completed
           FROM progress
           WHERE enrollment_id = $1`,
          [enrollmentId]
        )
        : Promise.resolve({ rows: [] }),
      enrollmentId
        ? db.query(
          `SELECT id, score, passed, attempted_at, answers
           FROM assessment_attempts
           WHERE enrollment_id = $1 AND is_final = true
           ORDER BY attempted_at DESC
           LIMIT 1`,
          [enrollmentId]
        )
        : Promise.resolve({ rows: [] }),
      enrollmentId
        ? db.query(
          `SELECT qq.question_text
           FROM assessment_attempts aa
           JOIN quizzes q ON q.course_id = $1 AND q.quiz_type = 'final' AND q.status = 'published'
           JOIN quiz_questions qq ON qq.quiz_id = q.id
           JOIN LATERAL jsonb_array_elements(aa.answers) a ON true
           WHERE aa.enrollment_id = $2
             AND aa.is_final = true
             AND aa.id = (
               SELECT id FROM assessment_attempts
               WHERE enrollment_id = $2 AND is_final = true
               ORDER BY attempted_at DESC
               LIMIT 1
             )
             AND (a->>'question_id') ~* '^[0-9a-f-]{36}$'
             AND (a->>'question_id')::uuid = qq.id
             AND COALESCE(a->>'answer', '') <> COALESCE(qq.correct_answer, '')`,
          [courseId, enrollmentId]
        )
        : Promise.resolve({ rows: [] }),
    ]);

    const weakTopics = buildWeakTopicRecommendations({
      publishedRuntime: runtimeSnapshot,
      wrongQuestionRows: wrongQuestionRows.rows,
    });

    const smartRuntime = buildLearnerSmartRuntime({
      courseId,
      userId,
      progressRows: progressRows.rows,
      lessonCount: runtimeSnapshot.render.lessonBlocks.filter((b) => b.type === 'heading').length || 1,
      latestFinalAttempt: latestFinalAttempt.rows[0] || null,
      weakTopics,
      generatedAt: new Date().toISOString(),
    });

    await upsertOrgSetting({
      organisationId,
      key: `layer4d_smart_runtime_${courseId}_${userId}`,
      value: smartRuntime,
    });

    return res.json({ smart_runtime: smartRuntime });
  } catch (err) {
    return next(err);
  }
};
