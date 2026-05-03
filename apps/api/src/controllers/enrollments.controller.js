const { randomUUID: uuidv4 } = require('crypto');
const db = require('../config/database');

exports.enroll = async (req, res, next) => {
  try {
    const { user_id, course_id, organisation_id, due_date } = req.body;
    const id = uuidv4();
    const result = await db.query(
      `INSERT INTO enrollments (id, user_id, course_id, organisation_id, due_date)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (user_id, course_id) DO UPDATE SET due_date=$5
       RETURNING *`,
      [id, user_id, course_id, organisation_id, due_date]
    );
    res.status(201).json({ enrollment: result.rows[0] });
  } catch (err) { next(err); }
};

exports.getMyEnrollments = async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT e.*, c.title as course_title, c.category, c.duration_minutes,
              c.is_mandatory,
              COUNT(l.id)::int as total_lessons,
              COUNT(p.id) FILTER (WHERE p.completed=true)::int as completed_lessons
       FROM enrollments e
       JOIN courses c ON c.id = e.course_id
       LEFT JOIN modules m ON m.course_id = c.id
       LEFT JOIN lessons l ON l.module_id = m.id
       LEFT JOIN progress p ON p.lesson_id = l.id AND p.enrollment_id = e.id
       WHERE e.user_id = $1
       GROUP BY e.id, c.title, c.category, c.duration_minutes, c.is_mandatory
       ORDER BY e.enrolled_at DESC`,
      [req.user.id]
    );
    res.json({ enrollments: result.rows });
  } catch (err) { next(err); }
};

exports.updateProgress = async (req, res, next) => {
  try {
    const { enrollment_id, lesson_id, time_spent_seconds } = req.body;
    const id = uuidv4();
    await db.query(
      `INSERT INTO progress (id, enrollment_id, lesson_id, completed, time_spent_seconds, completed_at)
       VALUES ($1,$2,$3,true,$4,NOW())
       ON CONFLICT (enrollment_id, lesson_id)
       DO UPDATE SET completed=true, time_spent_seconds=$4, completed_at=NOW()`,
      [id, enrollment_id, lesson_id, time_spent_seconds || 0]
    );
    await db.query(
      `UPDATE enrollments SET status='in_progress', updated_at=NOW() WHERE id=$1`,
      [enrollment_id]
    );
    res.json({ message: 'Progress updated' });
  } catch (err) { next(err); }
};

exports.getProgress = async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT p.*, l.title as lesson_title, l.order_index
       FROM progress p JOIN lessons l ON l.id = p.lesson_id
       WHERE p.enrollment_id = $1 ORDER BY l.order_index`,
      [req.params.enrollmentId]
    );
    res.json({ progress: result.rows });
  } catch (err) { next(err); }
};

exports.complete = async (req, res, next) => {
  try {
    const { enrollment_id } = req.body;
    const enrollmentResult = await db.query(
      `SELECT e.*, c.pass_mark
       FROM enrollments e
       JOIN courses c ON c.id = e.course_id
       WHERE e.id = $1 AND e.user_id = $2`,
      [enrollment_id, req.user.id]
    );
    if (!enrollmentResult.rows.length) {
      return res.status(404).json({ error: 'Enrollment not found' });
    }

    const enrollment = enrollmentResult.rows[0];

    const lessonCountResult = await db.query(
      `SELECT COUNT(l.id)::int AS total_lessons
       FROM modules m
       LEFT JOIN lessons l ON l.module_id = m.id
       WHERE m.course_id = $1`,
      [enrollment.course_id]
    );
    const totalLessons = lessonCountResult.rows[0]?.total_lessons || 0;

    const progressCountResult = await db.query(
      `SELECT COUNT(*)::int AS completed_lessons
       FROM progress
       WHERE enrollment_id = $1 AND completed = true`,
      [enrollment_id]
    );
    const completedLessons = progressCountResult.rows[0]?.completed_lessons || 0;
    if (totalLessons > 0 && completedLessons < totalLessons) {
      return res.status(403).json({ error: 'All lessons must be completed first' });
    }

    const questionCountResult = await db.query(
      `SELECT COUNT(*)::int AS final_questions
       FROM assessment_questions
       WHERE course_id = $1 AND is_final_assessment = true AND is_active = true`,
      [enrollment.course_id]
    );
    const finalQuestions = questionCountResult.rows[0]?.final_questions || 0;

    if (finalQuestions > 0) {
      const passedAttemptResult = await db.query(
        `SELECT id
         FROM assessment_attempts
         WHERE enrollment_id = $1 AND is_final = true AND passed = true
         LIMIT 1`,
        [enrollment_id]
      );
      if (!passedAttemptResult.rows.length) {
        return res.status(403).json({ error: 'Final assessment must be passed first' });
      }
    }

    const updated = await db.query(
      `UPDATE enrollments
       SET status = 'completed', completed_at = COALESCE(completed_at, NOW()), updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [enrollment_id]
    );
    res.json({ enrollment: updated.rows[0], has_assessment: finalQuestions > 0 });
  } catch (err) { next(err); }
};
