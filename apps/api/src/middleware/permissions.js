const PERMISSIONS = {
  super_admin: ['*'],
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