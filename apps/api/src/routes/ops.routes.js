const router = require('express').Router();
const multer = require('multer');
const { body, query } = require('express-validator');
const ctrl = require('../controllers/ops.controller');
const { authenticate, authorize } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const { requireTenant } = require('../middleware/tenant');
const { withAudit } = require('../middleware/audit');
const { validate } = require('../middleware/validation');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024, files: 1 } });

router.use(authenticate, authorize('platform_owner', 'super_admin', 'agency_admin', 'org_admin'), requireTenant);

router.post('/queue/jobs', requirePermission('settings.write'), withAudit('layer6_queue_enqueue', 'ops'), ctrl.enqueue);
router.post('/queue/process/:queueName', requirePermission('settings.write'), withAudit('layer6_queue_process', 'ops'), validate([query('limit').optional().isInt({ min: 1, max: 200 })]), ctrl.processQueue);
router.get('/queue/stats', requirePermission('settings.write'), withAudit('layer6_queue_stats', 'ops'), ctrl.queueStats);

router.post('/email/queue', requirePermission('settings.write'), withAudit('layer6_email_queue', 'ops'),
  validate([body('recipient_email').isEmail(), body('template_key').isString().isLength({ min: 2, max: 120 })]), ctrl.queueEmail);
router.get('/email/stats', requirePermission('settings.write'), withAudit('layer6_email_stats', 'ops'), ctrl.emailStats);

router.post('/storage/object', requirePermission('media.write'), withAudit('layer6_storage_save', 'ops'), upload.single('file'), ctrl.storeObject);
router.get('/storage/integrity', requirePermission('media.write'), withAudit('layer6_storage_integrity', 'ops'), ctrl.storageIntegrity);
router.get('/storage/signed-url', requirePermission('media.write'), withAudit('layer6_storage_signed_url', 'ops'), ctrl.storageSignedUrl);

router.post('/scheduler/run', requirePermission('settings.write'), withAudit('layer6_scheduler_run', 'ops'), ctrl.runScheduler);
router.get('/scheduler/history', requirePermission('settings.write'), withAudit('layer6_scheduler_history', 'ops'), ctrl.schedulerHistory);

router.post('/monitoring/snapshot', requirePermission('settings.write'), withAudit('layer6_monitoring_snapshot', 'ops'), ctrl.monitoringSnapshot);
router.get('/monitoring/history', requirePermission('settings.write'), withAudit('layer6_monitoring_history', 'ops'), ctrl.monitoringHistory);
router.get('/monitoring/metrics', requirePermission('settings.write'), withAudit('layer6_monitoring_metrics', 'ops'), ctrl.metrics);
router.get('/worker/health', requirePermission('settings.write'), withAudit('layer6_worker_health', 'ops'), ctrl.workerHealth);
router.post('/cleanup/run', requirePermission('settings.write'), withAudit('layer6_cleanup_run', 'ops'), ctrl.runCleanup);
router.get('/providers/status', requirePermission('settings.write'), withAudit('layer6_provider_status', 'ops'), ctrl.providerStatus);

router.post('/release/register', requirePermission('settings.write'), withAudit('layer6_release_register', 'ops'),
  validate([body('release_tag').isString().isLength({ min: 2, max: 120 }), body('commit_hash').isString().isLength({ min: 6, max: 64 })]), ctrl.releaseRegister);
router.get('/release/history', requirePermission('settings.write'), withAudit('layer6_release_history', 'ops'), ctrl.releaseHistory);
router.get('/release/preflight', requirePermission('settings.write'), withAudit('layer6_release_preflight', 'ops'), ctrl.envPreflight);

router.post('/recovery/artifacts', requirePermission('settings.write'), withAudit('layer6_recovery_record', 'ops'),
  validate([body('environment').isIn(['staging', 'production']), body('artifact_type').isString().isLength({ min: 2, max: 80 }), body('storage_path').isString().isLength({ min: 2, max: 500 })]),
  ctrl.recoveryRecord);
router.get('/recovery/artifacts', requirePermission('settings.write'), withAudit('layer6_recovery_history', 'ops'), ctrl.recoveryHistory);

module.exports = router;
