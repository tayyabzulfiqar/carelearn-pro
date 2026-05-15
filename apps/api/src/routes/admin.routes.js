const router = require('express').Router();
const { query } = require('express-validator');
const admin = require('../controllers/admin.controller');
const { authenticate, authorize } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const { requireTenant } = require('../middleware/tenant');
const { withAudit } = require('../middleware/audit');
const { validate } = require('../middleware/validation');

const superAdminOnly = authorize('super_admin');
const platformOwnerOnly = authorize('platform_owner', 'super_admin');

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

router.get(
  '/platform/dashboard',
  authenticate,
  platformOwnerOnly,
  requirePermission('dashboard.read'),
  withAudit('platform_dashboard_view', 'platform'),
  admin.getPlatformDashboard
);

router.get(
  '/platform/agencies',
  authenticate,
  platformOwnerOnly,
  requirePermission('agency.read'),
  withAudit('platform_agencies_list', 'agency'),
  admin.listAgencies
);

router.post(
  '/platform/agencies',
  authenticate,
  platformOwnerOnly,
  requirePermission('agency.read'),
  withAudit('platform_agency_create', 'agency'),
  admin.createAgency
);

router.post(
  '/platform/agencies/onboard',
  authenticate,
  platformOwnerOnly,
  requirePermission('agency.read'),
  withAudit('platform_agency_onboard', 'agency'),
  admin.onboardAgency
);

router.post(
  '/platform/agencies/:agencyId/status',
  authenticate,
  platformOwnerOnly,
  requirePermission('agency.read'),
  withAudit('platform_agency_status_update', 'agency'),
  admin.updateAgencyStatus
);

router.delete(
  '/platform/agencies/:agencyId',
  authenticate,
  platformOwnerOnly,
  requirePermission('agency.read'),
  withAudit('platform_agency_delete', 'agency'),
  admin.deleteAgency
);

router.get(
  '/platform/organisations/:organisationId/subscription',
  authenticate,
  platformOwnerOnly,
  requirePermission('settings.write'),
  withAudit('platform_subscription_view', 'subscription'),
  admin.getOrganisationSubscription
);

router.post(
  '/platform/organisations/:organisationId/subscription',
  authenticate,
  platformOwnerOnly,
  requirePermission('settings.write'),
  withAudit('platform_subscription_update', 'subscription'),
  admin.setOrganisationSubscription
);

module.exports = router;
