const router = require('express').Router();
const { query } = require('express-validator');
const admin = require('../controllers/admin.controller');
const { authenticate, authorize } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const { requireTenant } = require('../middleware/tenant');
const { withAudit } = require('../middleware/audit');
const { validate } = require('../middleware/validation');

const superAdminOnly = authorize('super_admin');

router.get(
  '/dashboard',
  authenticate,
  superAdminOnly,
  requireTenant,
  requirePermission('dashboard.read'),
  withAudit('admin_dashboard_view', 'dashboard'),
  admin.getDashboardSummary
);

router.get(
  '/permissions',
  authenticate,
  superAdminOnly,
  requirePermission('dashboard.read'),
  admin.getPermissionMatrix
);

router.get(
  '/audit-logs',
  authenticate,
  superAdminOnly,
  requirePermission('audit.read'),
  validate([query('limit').optional().isInt({ min: 1, max: 500 })]),
  admin.getAuditLogs
);

router.get(
  '/analytics/training',
  authenticate,
  superAdminOnly,
  requirePermission('analytics.read'),
  withAudit('analytics_training_view', 'analytics'),
  admin.getTrainingAnalytics
);

module.exports = router;
