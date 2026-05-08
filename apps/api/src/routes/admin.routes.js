const router = require('express').Router();
const { query } = require('express-validator');
const admin = require('../controllers/admin.controller');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const { requireTenant } = require('../middleware/tenant');
const { withAudit } = require('../middleware/audit');
const { validate } = require('../middleware/validation');

router.get(
  '/dashboard',
  authenticate,
  requireTenant,
  requirePermission('dashboard.read'),
  withAudit('admin_dashboard_view', 'dashboard'),
  admin.getDashboardSummary
);

router.get(
  '/permissions',
  authenticate,
  requirePermission('dashboard.read'),
  admin.getPermissionMatrix
);

router.get(
  '/audit-logs',
  authenticate,
  requirePermission('audit.read'),
  validate([query('limit').optional().isInt({ min: 1, max: 500 })]),
  admin.getAuditLogs
);

router.get(
  '/analytics/training',
  authenticate,
  requirePermission('analytics.read'),
  withAudit('analytics_training_view', 'analytics'),
  admin.getTrainingAnalytics
);

module.exports = router;