const db = require('../config/database');

async function attachTenant(req, _res, next) {
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

function requireTenant(req, res, next) {
  if (!req.tenant?.organisationId && req.user?.role !== 'super_admin') {
    return res.status(400).json({
      success: false,
      error: { code: 'TENANT_REQUIRED', message: 'Organisation context is required' },
    });
  }
  return next();
}

module.exports = { attachTenant, requireTenant };