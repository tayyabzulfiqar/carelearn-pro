const db = require('../config/database');
const { getUserPermissions } = require('../middleware/permissions');
const { randomUUID } = require('crypto');
const { setSubscriptionState, getSubscriptionState } = require('../middleware/subscription');

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

exports.getPlatformDashboard = async (req, res, next) => {
  try {
    const [agencies, organisations, users, enrollments, certificates] = await Promise.all([
      db.query('SELECT COUNT(*)::int AS count FROM agencies'),
      db.query('SELECT COUNT(*)::int AS count FROM organisations'),
      db.query('SELECT COUNT(*)::int AS count FROM users'),
      db.query('SELECT COUNT(*)::int AS count FROM enrollments'),
      db.query('SELECT COUNT(*)::int AS count FROM certificates'),
    ]);
    return res.success({
      agencies: agencies.rows[0].count,
      organisations: organisations.rows[0].count,
      users: users.rows[0].count,
      enrollments: enrollments.rows[0].count,
      certificates: certificates.rows[0].count,
    });
  } catch (err) {
    return next(err);
  }
};

exports.listAgencies = async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT a.*, o.id AS organisation_id, o.name AS organisation_name, o.slug AS organisation_slug,
              o.subscription_plan, o.max_seats, o.is_active
       FROM agencies a
       LEFT JOIN organisations o ON o.slug = a.slug
       ORDER BY a.created_at DESC`
    );
    return res.success({ agencies: result.rows });
  } catch (err) {
    return next(err);
  }
};

exports.createAgency = async (req, res, next) => {
  try {
    const { name, slug, billing_email, owner_user_id, organisation_name } = req.body;
    const agencyId = randomUUID();
    const organisationId = randomUUID();
    await db.query('BEGIN');
    const agency = await db.query(
      `INSERT INTO agencies (id, name, slug, billing_email, owner_user_id, status)
       VALUES ($1,$2,$3,$4,$5,'active') RETURNING *`,
      [agencyId, name, slug, billing_email || null, owner_user_id || null]
    );
    const org = await db.query(
      `INSERT INTO organisations (id, name, slug, subscription_plan, max_seats, is_active)
       VALUES ($1,$2,$3,'starter',50,true)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
       RETURNING *`,
      [organisationId, organisation_name || name, slug]
    );
    if (owner_user_id) {
      await db.query(
        `INSERT INTO organisation_members (id, organisation_id, user_id, role)
         VALUES ($1,$2,$3,'agency_admin')
         ON CONFLICT (organisation_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
        [randomUUID(), org.rows[0].id, owner_user_id]
      );
    }
    await setSubscriptionState({
      organisationId: org.rows[0].id,
      actorId: req.user.id,
      payload: {
        state: 'trial',
        seat_limit: 50,
        trial_seat_limit: 10,
        starts_at: new Date().toISOString(),
        ends_at: null,
        features: { enrollment: true, certificates: true, compliance: true },
      },
    });
    await db.query('COMMIT');
    return res.success({ agency: agency.rows[0], organisation: org.rows[0] }, {}, 201);
  } catch (err) {
    await db.query('ROLLBACK');
    return next(err);
  }
};

exports.updateAgencyStatus = async (req, res, next) => {
  try {
    const { agencyId } = req.params;
    const { status } = req.body;
    if (!['active', 'suspended', 'archived'].includes(status)) {
      return res.fail('Invalid agency status', 'INVALID_AGENCY_STATUS', 422);
    }
    const updated = await db.query(
      'UPDATE agencies SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [status, agencyId]
    );
    if (!updated.rows.length) return res.fail('Agency not found', 'NOT_FOUND', 404);
    await db.query(
      'UPDATE organisations SET is_active = $1, updated_at = NOW() WHERE slug = $2',
      [status === 'active', updated.rows[0].slug]
    );
    return res.success({ agency: updated.rows[0] });
  } catch (err) {
    return next(err);
  }
};

exports.deleteAgency = async (req, res, next) => {
  try {
    const { agencyId } = req.params;
    await db.query('BEGIN');
    const agency = await db.query('SELECT * FROM agencies WHERE id = $1', [agencyId]);
    if (!agency.rows.length) {
      await db.query('ROLLBACK');
      return res.fail('Agency not found', 'NOT_FOUND', 404);
    }
    const slug = agency.rows[0].slug;
    await db.query('UPDATE agencies SET status = $1, updated_at = NOW() WHERE id = $2', ['archived', agencyId]);
    await db.query('UPDATE organisations SET is_active = false, updated_at = NOW() WHERE slug = $1', [slug]);
    await db.query('COMMIT');
    return res.success({ deleted: true, archived: true });
  } catch (err) {
    await db.query('ROLLBACK');
    return next(err);
  }
};

exports.setOrganisationSubscription = async (req, res, next) => {
  try {
    const { organisationId } = req.params;
    const { state, seat_limit, trial_seat_limit, starts_at, ends_at, features = {} } = req.body;
    if (!['active', 'suspended', 'expired', 'trial', 'cancelled'].includes(state)) {
      return res.fail('Invalid subscription state', 'INVALID_SUBSCRIPTION_STATE', 422);
    }
    const payload = {
      state,
      seat_limit: Number(seat_limit || 50),
      trial_seat_limit: Number(trial_seat_limit || 10),
      starts_at: starts_at || null,
      ends_at: ends_at || null,
      features: {
        enrollment: features.enrollment !== false,
        certificates: features.certificates !== false,
        compliance: features.compliance !== false,
      },
    };
    const value = await setSubscriptionState({
      organisationId,
      payload,
      actorId: req.user.id,
    });
    return res.success({ subscription: value });
  } catch (err) {
    return next(err);
  }
};

exports.getOrganisationSubscription = async (req, res, next) => {
  try {
    const { organisationId } = req.params;
    const subscription = await getSubscriptionState(organisationId);
    return res.success({ subscription });
  } catch (err) {
    return next(err);
  }
};
