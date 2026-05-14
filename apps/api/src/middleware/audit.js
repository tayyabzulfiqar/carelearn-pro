const db = require('../config/database');

function withAudit(action, resourceType, options = {}) {
  return async (req, _res, next) => {
    req.auditMeta = {
      action,
      resourceType,
      startedAt: Date.now(),
      metadata: typeof options.metadata === 'function'
        ? options.metadata(req)
        : (options.metadata || {}),
    };
    next();
  };
}

async function recordAudit(req, statusCode, metadata = {}) {
  if (!req.user?.id || !req.auditMeta) return;

  const payload = {
    ...metadata,
    ...(req.auditMeta.metadata || {}),
    duration_ms: Date.now() - req.auditMeta.startedAt,
    request_id: req.context?.requestId,
    status_code: statusCode,
    method: req.method,
    path: req.originalUrl,
  };

  try {
    await db.query(
      `INSERT INTO audit_logs (user_id, organisation_id, action, resource_type, metadata, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        req.user.id,
        req.tenant?.organisationId || null,
        req.auditMeta.action,
        req.auditMeta.resourceType,
        payload,
        req.ip,
      ]
    );
  } catch (err) {
    console.error('Audit log write failed', err.message);
  }
}

module.exports = { withAudit, recordAudit };
