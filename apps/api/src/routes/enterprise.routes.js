const router = require('express').Router();
const { body, query } = require('express-validator');
const ctrl = require('../controllers/enterprise.controller');
const billing = require('../controllers/billing.controller');
const { authenticate, authorize } = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenant');
const { requirePermission } = require('../middleware/permissions');
const { requireTenantScope } = require('../middleware/tenantAccess');
const { withAudit } = require('../middleware/audit');
const { validate } = require('../middleware/validation');

router.use(authenticate, authorize('platform_owner', 'super_admin', 'agency_admin', 'org_admin'), requireTenant);

router.post(
  '/notifications/run',
  requirePermission('certificate.read'),
  withAudit('layer5d_notifications_run', 'notification'),
  ctrl.runNotificationScan
);
router.get(
  '/notifications',
  requirePermission('certificate.read'),
  withAudit('layer5d_notifications_list', 'notification'),
  validate([query('limit').optional().isInt({ min: 1, max: 500 })]),
  ctrl.listNotifications
);

router.get(
  '/compliance/dashboard',
  requirePermission('certificate.read'),
  withAudit('layer5e_compliance_dashboard', 'compliance'),
  ctrl.getComplianceDashboard
);

router.post(
  '/reports/exports',
  requirePermission('report.read'),
  withAudit('layer5f_report_generate', 'report'),
  validate([
    body('report_type').isIn(['completion', 'certificate', 'compliance', 'subscription_usage']),
    body('format').optional().isIn(['csv', 'pdf']),
  ]),
  ctrl.generateReportExport
);
router.get(
  '/reports/exports',
  requirePermission('report.read'),
  withAudit('layer5f_report_list', 'report'),
  ctrl.listReportExports
);
router.get(
  '/reports/exports/:exportId/download',
  requirePermission('report.read'),
  withAudit('layer5f_report_download', 'report'),
  ctrl.downloadReportExport
);

router.get(
  '/governance/roles',
  requirePermission('dashboard.read'),
  withAudit('layer5g_role_matrix_view', 'governance'),
  ctrl.getRoleMatrix
);
router.post(
  '/governance/feature-flags',
  requirePermission('settings.write'),
  withAudit('layer5g_feature_flag_upsert', 'governance'),
  validate([body('key').isString().isLength({ min: 2, max: 120 }), body('enabled').isBoolean()]),
  ctrl.upsertFeatureFlag
);
router.get(
  '/governance/feature-flags',
  requirePermission('settings.write'),
  withAudit('layer5g_feature_flag_list', 'governance'),
  ctrl.listFeatureFlags
);
router.post(
  '/governance/bulk-enroll',
  requirePermission('enrollment.write'),
  withAudit('layer5g_bulk_enroll', 'governance'),
  requireTenantScope({ orgResolver: (req) => req.body.organisation_id || req.tenant?.organisationId || null }),
  validate([body('course_id').isUUID(), body('user_ids').isArray({ min: 1, max: 200 })]),
  ctrl.bulkEnrollSafe
);

const platformOnly = authorize('platform_owner', 'super_admin');
const agencyOrPlatform = authorize('platform_owner', 'super_admin', 'agency_admin', 'org_admin');

router.post(
  '/billing/platform/generate-monthly',
  platformOnly,
  requirePermission('settings.write'),
  withAudit('layer7a_billing_generate_monthly', 'billing'),
  billing.generateMonthlyInvoices
);
router.get(
  '/billing/platform/invoices',
  platformOnly,
  requirePermission('report.read'),
  withAudit('layer7a_billing_platform_invoices', 'billing'),
  billing.listPlatformInvoices
);
router.get(
  '/billing/platform/dashboard',
  platformOnly,
  requirePermission('report.read'),
  withAudit('layer7a_billing_platform_dashboard', 'billing'),
  billing.platformBillingDashboard
);
router.post(
  '/billing/platform/invoices/:invoiceId/mark-paid',
  platformOnly,
  requirePermission('settings.write'),
  withAudit('layer7a_billing_invoice_mark_paid', 'billing'),
  billing.markInvoicePaid
);
router.post(
  '/billing/platform/organisations/:organisationId/subscription-state',
  platformOnly,
  requirePermission('settings.write'),
  withAudit('layer7a_billing_subscription_state_set', 'billing'),
  billing.setAgencySubscriptionState
);

router.get(
  '/billing/agency/dashboard',
  agencyOrPlatform,
  requirePermission('report.read'),
  withAudit('layer7a_billing_agency_dashboard', 'billing'),
  billing.getAgencyBillingDashboard
);
router.post(
  '/billing/agency/invoices/generate',
  agencyOrPlatform,
  requirePermission('report.read'),
  withAudit('layer7a_billing_agency_generate_invoice', 'billing'),
  billing.generateAgencyInvoice
);
router.get(
  '/billing/agency/invoices/:invoiceId',
  agencyOrPlatform,
  requirePermission('report.read'),
  withAudit('layer7a_billing_invoice_view', 'billing'),
  billing.getInvoiceById
);

module.exports = router;
