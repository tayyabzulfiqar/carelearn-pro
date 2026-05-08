const db = require('../config/database');
const { getUserPermissions } = require('../middleware/permissions');

exports.getDashboardSummary = async (req, res, next) => {
  try {
    const [users, courses, enrollments, completions, certificates] = await Promise.all([
      db.query('SELECT COUNT(*)::int AS count FROM users'),
      db.query('SELECT COUNT(*)::int AS count FROM courses'),
      db.query('SELECT COUNT(*)::int AS count FROM enrollments'),
      db.query("SELECT COUNT(*)::int AS count FROM enrollments WHERE status = 'completed'"),
      db.query('SELECT COUNT(*)::int AS count FROM certificates'),
    ]);

    return res.success({
      users: users.rows[0].count,
      courses: courses.rows[0].count,
      enrollments: enrollments.rows[0].count,
      completions: completions.rows[0].count,
      certificates: certificates.rows[0].count,
      completionRate:
        enrollments.rows[0].count > 0
          ? Number(((completions.rows[0].count / enrollments.rows[0].count) * 100).toFixed(2))
          : 0,
    });
  } catch (err) {
    return next(err);
  }
};

exports.getPermissionMatrix = async (req, res) => {
  return res.success({
    role: req.user.role,
    permissions: getUserPermissions(req.user.role),
  });
};

exports.getAuditLogs = async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit || 100), 500);
    const result = await db.query(
      `SELECT id, user_id, organisation_id, action, resource_type, metadata, ip_address, created_at
       FROM audit_logs
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );

    return res.success({ logs: result.rows });
  } catch (err) {
    return next(err);
  }
};

exports.getTrainingAnalytics = async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT c.id, c.title,
              COUNT(e.id)::int AS enrolled,
              COUNT(e.id) FILTER (WHERE e.status = 'completed')::int AS completed,
              AVG(a.score) FILTER (WHERE a.is_final = true)::numeric(10,2) AS avg_final_score
       FROM courses c
       LEFT JOIN enrollments e ON e.course_id = c.id
       LEFT JOIN assessment_attempts a ON a.enrollment_id = e.id
       GROUP BY c.id, c.title
       ORDER BY c.title ASC`
    );

    return res.success({ courses: result.rows });
  } catch (err) {
    return next(err);
  }
};