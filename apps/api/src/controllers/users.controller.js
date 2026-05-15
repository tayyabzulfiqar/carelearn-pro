const db = require('../config/database');
const { isGlobalRole } = require('../middleware/tenantAccess');

exports.getAll = async (req, res, next) => {
  try {
    let result;
    if (isGlobalRole(req.user?.role)) {
      result = await db.query(
        'SELECT id, email, first_name, last_name, role, created_at FROM users ORDER BY created_at DESC'
      );
    } else {
      result = await db.query(
        `SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.created_at
         FROM users u
         JOIN organisation_members om ON om.user_id = u.id
         WHERE om.organisation_id = $1
         ORDER BY u.created_at DESC`,
        [req.tenant?.organisationId || null]
      );
    }
    res.json({ users: result.rows });
  } catch (err) { next(err); }
};

exports.getById = async (req, res, next) => {
  try {
    if (!isGlobalRole(req.user?.role)) {
      if (req.user.id !== req.params.id) {
        const member = await db.query(
          `SELECT 1
           FROM organisation_members om1
           JOIN organisation_members om2 ON om2.organisation_id = om1.organisation_id
           WHERE om1.user_id = $1 AND om2.user_id = $2
           LIMIT 1`,
          [req.user.id, req.params.id]
        );
        if (!member.rows.length) return res.status(403).json({ error: 'Cross-tenant access blocked' });
      }
    }
    const result = await db.query(
      'SELECT id, email, first_name, last_name, role, created_at FROM users WHERE id = $1',
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ user: result.rows[0] });
  } catch (err) { next(err); }
};

exports.update = async (req, res, next) => {
  try {
    if (!isGlobalRole(req.user?.role) && req.user.id !== req.params.id) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    const { first_name, last_name } = req.body;
    const result = await db.query(
      `UPDATE users SET first_name = $1, last_name = $2, updated_at = NOW()
       WHERE id = $3 RETURNING id, email, first_name, last_name, role`,
      [first_name, last_name, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ user: result.rows[0] });
  } catch (err) { next(err); }
};
