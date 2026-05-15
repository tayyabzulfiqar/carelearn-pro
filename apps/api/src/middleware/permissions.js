const { recordAudit } = require('./audit');

const PERMISSIONS = {
  platform_owner: ['*'],
  super_admin: ['*'],
  agency_admin: [
    'dashboard.read',
    'training.read',
    'quiz.read',
    'certificate.read',
    'certificate.write',
    'user.read',
    'user.write',
    'agency.read',
    'analytics.read',
    'audit.read',
    'settings.write',
    'media.write',
    'enrollment.write',
    'report.read',
  ],
  org_admin: [
    'dashboard.read',
    'training.read',
    'training.write',
    'quiz.read',
    'quiz.write',
    'certificate.read',
    'certificate.write',
    'user.read',
    'user.write',
    'agency.read',
    'analytics.read',
    'audit.read',
    'settings.write',
    'media.write',
    'enrollment.write',
    'report.read',
  ],
  trainer: [
    'dashboard.read',
    'training.read',
    'training.write',
    'quiz.read',
    'quiz.write',
    'certificate.read',
    'analytics.read',
  ],
  learner: ['dashboard.read', 'training.read', 'certificate.read'],
  staff_user: ['dashboard.read', 'training.read', 'certificate.read'],
};

function getUserPermissions(role) {
  return PERMISSIONS[role] || [];
}

function hasPermission(user, permission) {
  if (!user) return false;
  const permissions = getUserPermissions(user.role);
  return permissions.includes('*') || permissions.includes(permission);
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (!hasPermission(req.user, permission)) {
      req.auditMeta = {
        action: 'permission_denied',
        resourceType: 'security',
        startedAt: Date.now(),
        metadata: {
          required_permission: permission,
          role: req.user?.role || 'anonymous',
        },
      };
      recordAudit(req, 403, { outcome: 'error', code: 'FORBIDDEN' }).catch(() => {});
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Insufficient permissions' },
      });
    }
    return next();
  };
}

module.exports = {
  PERMISSIONS,
  getUserPermissions,
  hasPermission,
  requirePermission,
};
