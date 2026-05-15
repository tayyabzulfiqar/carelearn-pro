const db = require('../config/database');

function isGlobalRole(role) {
  return role === 'platform_owner' || role === 'super_admin';
}

async function isUserInOrganisation(userId, organisationId) {
  const result = await db.query(
    `SELECT 1
     FROM organisation_members
     WHERE user_id = $1 AND organisation_id = $2
     LIMIT 1`,
    [userId, organisationId]
  );
  return result.rows.length > 0;
}

function requireTenantScope(options = {}) {
  const orgResolver = options.orgResolver || ((req) => req.tenant?.organisationId || req.body?.organisation_id || req.params?.organisationId || null);
  return async (req, res, next) => {
    const organisationId = orgResolver(req);
    if (!organisationId) {
      return res.status(400).json({
        success: false,
        error: { code: 'TENANT_REQUIRED', message: 'Organisation context is required' },
      });
    }
    req.scopedOrganisationId = organisationId;
    if (isGlobalRole(req.user?.role)) return next();
    try {
      const allowed = await isUserInOrganisation(req.user.id, organisationId);
      if (!allowed) {
        return res.status(403).json({
          success: false,
          error: { code: 'TENANT_SCOPE_VIOLATION', message: 'Cross-tenant access is blocked' },
        });
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = {
  requireTenantScope,
  isGlobalRole,
};

