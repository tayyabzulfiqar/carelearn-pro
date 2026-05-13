const db = require('../config/database');
const jwt = require('jsonwebtoken');

function attachUserFromToken(req) {
  if (req.user) return;
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return;
  const token = authHeader.slice(7);
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
  } catch (_err) {
    // Ignore invalid token here; auth middleware will reject protected routes.
  }
}

async function attachTenant(req, _res, next) {
  attachUserFromToken(req);
  if (!req.user) return next();

  const explicitTenant = req.context?.tenantId || req.headers['x-org-id'];
  if (explicitTenant) {
    req.tenant = { organisationId: explicitTenant };
    return next();
  }

  try {
    const result = await db.query(
      `SELECT organisation_id, role
       FROM organisation_members
       WHERE user_id = $1
       ORDER BY joined_at ASC
       LIMIT 1`,
      [req.user.id]
    );

    req.tenant = {
      organisationId: result.rows[0]?.organisation_id || null,
      tenantRole: result.rows[0]?.role || null,
    };
    return next();
  } catch (err) {
    return next(err);
  }
}

async function requireTenant(req, res, next) {
  if (req.tenant?.organisationId || req.user?.role === 'super_admin') return next();

  try {
    // Allow first-run environments with no organisations to operate in global mode.
    const orgs = await db.query('SELECT id FROM organisations LIMIT 1');
    if (!orgs.rows.length) return next();
  } catch (err) {
    return next(err);
  }

  return res.status(400).json({
    success: false,
    error: { code: 'TENANT_REQUIRED', message: 'Organisation context is required' },
  });
}

module.exports = { attachTenant, requireTenant };
