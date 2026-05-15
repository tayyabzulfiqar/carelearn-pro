const { randomUUID: uuidv4 } = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../config/database');

exports.create = async (req, res, next) => {
  try {
    const { name, slug } = req.body;
    const id = uuidv4();
    const result = await db.query(
      `INSERT INTO organisations (id, name, slug) VALUES ($1, $2, $3)
       RETURNING id, name, slug, created_at`,
      [id, name, slug]
    );
    res.status(201).json({ organisation: result.rows[0] });
  } catch (err) { next(err); }
};

exports.getById = async (req, res, next) => {
  try {
    const result = await db.query(
      'SELECT id, name, slug, logo_url, created_at FROM organisations WHERE id = $1',
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Organisation not found' });
    res.json({ organisation: result.rows[0] });
  } catch (err) { next(err); }
};

exports.getMembers = async (req, res, next) => {
  try {
    const orgId = req.scopedOrganisationId || req.params.id;
    const result = await db.query(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.role, om.joined_at
       FROM organisation_members om
       JOIN users u ON u.id = om.user_id
       WHERE om.organisation_id = $1
       ORDER BY om.joined_at DESC`,
      [orgId]
    );
    res.json({ members: result.rows });
  } catch (err) { next(err); }
};

exports.addMember = async (req, res, next) => {
  try {
    const orgId = req.scopedOrganisationId || req.params.id;
    const { email, first_name, last_name, role = 'learner' } = req.body;
    let userId;
    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length) {
      userId = existing.rows[0].id;
    } else {
      userId = uuidv4();
      const hash = await bcrypt.hash(`Temp-${Math.random().toString(36).slice(2, 10)}!`, 10);
      await db.query(
        `INSERT INTO users (id, email, password_hash, first_name, last_name, role)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [userId, email, hash, first_name || 'Staff', last_name || 'User', 'learner']
      );
    }
    await db.query(
      `INSERT INTO organisation_members (id, organisation_id, user_id, role)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (organisation_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
      [uuidv4(), orgId, userId, role]
    );
    return res.status(201).json({ success: true, user_id: userId });
  } catch (err) { next(err); }
};

exports.removeMember = async (req, res, next) => {
  try {
    const orgId = req.scopedOrganisationId || req.params.id;
    await db.query('DELETE FROM organisation_members WHERE organisation_id = $1 AND user_id = $2', [orgId, req.params.userId]);
    return res.json({ success: true });
  } catch (err) { next(err); }
};

exports.enrollMember = async (req, res, next) => {
  try {
    const orgId = req.scopedOrganisationId || req.params.id;
    const { user_id, course_id, due_date = null } = req.body;
    const id = uuidv4();
    const result = await db.query(
      `INSERT INTO enrollments (id, user_id, course_id, organisation_id, due_date)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (user_id, course_id) DO UPDATE SET due_date = EXCLUDED.due_date
       RETURNING *`,
      [id, user_id, course_id, orgId, due_date]
    );
    return res.status(201).json({ enrollment: result.rows[0] });
  } catch (err) { next(err); }
};

exports.getReports = async (req, res, next) => {
  try {
    const orgId = req.scopedOrganisationId || req.params.id;
    const progress = await db.query(
      `SELECT u.id AS user_id, u.email, u.first_name, u.last_name,
              COUNT(e.id)::int AS enrolled,
              COUNT(e.id) FILTER (WHERE e.status = 'completed')::int AS completed
       FROM organisation_members om
       JOIN users u ON u.id = om.user_id
       LEFT JOIN enrollments e ON e.user_id = u.id AND e.organisation_id = om.organisation_id
       WHERE om.organisation_id = $1
       GROUP BY u.id, u.email, u.first_name, u.last_name
       ORDER BY u.email`,
      [orgId]
    );
    const certificates = await db.query(
      `SELECT c.user_id, COUNT(*)::int AS certificate_count, MAX(c.expires_at) AS latest_expiry
       FROM certificates c
       WHERE c.organisation_id = $1
       GROUP BY c.user_id`,
      [orgId]
    );
    return res.json({ progress: progress.rows, certificates: certificates.rows });
  } catch (err) { next(err); }
};
