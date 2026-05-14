const router = require('express').Router();
const { body, query } = require('express-validator');
const multer = require('multer');
const ctrl = require('../../controllers/cms/trainingCms.controller');
const { authenticate, authorize } = require('../../middleware/auth');
const { requirePermission } = require('../../middleware/permissions');
const { requireTenant } = require('../../middleware/tenant');
const { withAudit } = require('../../middleware/audit');
const { validate } = require('../../middleware/validation');

const superAdminOnly = authorize('super_admin');
const uploadDocument = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024, files: 1 } });

router.use(authenticate, superAdminOnly, requireTenant);

router.get(
  '/trainings',
  requirePermission('training.read'),
  withAudit('training_list', 'training'),
  validate([
    query('limit').optional().isInt({ min: 1, max: 200 }),
    query('offset').optional().isInt({ min: 0 }),
  ]),
  ctrl.listTrainings
);
router.post('/trainings', requirePermission('training.write'), withAudit('training_create', 'training'), validate([body('title').isString().isLength({ min: 3 })]), ctrl.createTraining);
router.put('/trainings/:id', requirePermission('training.write'), withAudit('training_update', 'training', { metadata: (req) => ({ training_id: req.params.id }) }), ctrl.updateTraining);
router.delete('/trainings/:id', requirePermission('training.write'), withAudit('training_delete', 'training', { metadata: (req) => ({ training_id: req.params.id }) }), ctrl.deleteTraining);
router.post('/trainings/:id/status', requirePermission('training.write'), withAudit('training_status_transition', 'training', { metadata: (req) => ({ training_id: req.params.id }) }), ctrl.transitionTrainingStatus);
router.get('/trainings/:id/preview', requirePermission('training.read'), withAudit('training_preview_view', 'training', { metadata: (req) => ({ training_id: req.params.id }) }), ctrl.getTrainingPreview);
router.post('/trainings/:id/preview/load-latest', requirePermission('training.write'), withAudit('training_preview_load_latest', 'training', { metadata: (req) => ({ training_id: req.params.id }) }), ctrl.loadLatestExtractionToPreview);
router.post(
  '/trainings/:id/approval',
  requirePermission('training.write'),
  withAudit('training_approval_set', 'training', { metadata: (req) => ({ training_id: req.params.id }) }),
  validate([body('action').isIn(['approved', 'rejected']), body('reason').optional().isString()]),
  ctrl.setTrainingApproval
);
router.post('/trainings/:id/publish', requirePermission('training.write'), withAudit('training_publish', 'training', { metadata: (req) => ({ training_id: req.params.id }) }), ctrl.publishTrainingDeterministic);
router.get('/trainings/:id/published-runtime', requirePermission('training.read'), withAudit('training_published_runtime_view', 'training', { metadata: (req) => ({ training_id: req.params.id }) }), ctrl.getPublishedTrainingRuntime);
router.post(
  '/trainings/:id/ai/quiz/generate',
  requirePermission('training.write'),
  withAudit('training_ai_quiz_generate', 'training', { metadata: (req) => ({ training_id: req.params.id }) }),
  validate([body('pass_mark').optional().isInt({ min: 1, max: 100 })]),
  ctrl.generateAiQuiz
);
router.get('/trainings/:id/ai/quiz', requirePermission('training.read'), withAudit('training_ai_quiz_view', 'training', { metadata: (req) => ({ training_id: req.params.id }) }), ctrl.getAiQuiz);
router.post(
  '/trainings/:id/ai/quiz/score',
  requirePermission('training.write'),
  withAudit('training_ai_quiz_score', 'training', { metadata: (req) => ({ training_id: req.params.id }) }),
  validate([body('answers').isArray(), body('learner_id').optional().isString()]),
  ctrl.scoreAiQuiz
);
router.post(
  '/trainings/:id/ai/summary/generate',
  requirePermission('training.write'),
  withAudit('training_ai_summary_generate', 'training', { metadata: (req) => ({ training_id: req.params.id }) }),
  ctrl.generateAiSummary
);
router.get('/trainings/:id/ai/summary', requirePermission('training.read'), withAudit('training_ai_summary_view', 'training', { metadata: (req) => ({ training_id: req.params.id }) }), ctrl.getAiSummary);
router.post(
  '/trainings/:id/ai/narration/generate',
  requirePermission('training.write'),
  withAudit('training_ai_narration_generate', 'training', { metadata: (req) => ({ training_id: req.params.id }) }),
  validate([body('language').optional().isString().isLength({ min: 2, max: 16 })]),
  ctrl.generateAiNarration
);
router.get('/trainings/:id/ai/narration', requirePermission('training.read'), withAudit('training_ai_narration_view', 'training', { metadata: (req) => ({ training_id: req.params.id }) }), ctrl.getAiNarration);
router.post('/layer4/analytics/generate', requirePermission('analytics.read'), withAudit('layer4_analytics_generate', 'analytics'), ctrl.generateLayer4Analytics);
router.get('/layer4/analytics', requirePermission('analytics.read'), withAudit('layer4_analytics_view', 'analytics'), ctrl.getLayer4Analytics);
router.post('/layer4/compliance/run', requirePermission('certificate.write'), withAudit('layer4_compliance_run', 'compliance'), ctrl.runLayer4ComplianceAutomation);
router.get('/layer4/compliance', requirePermission('certificate.read'), withAudit('layer4_compliance_view', 'compliance'), ctrl.getLayer4Compliance);
router.get('/trainings/:id/publish-history', requirePermission('training.read'), withAudit('training_publish_history_view', 'training', { metadata: (req) => ({ training_id: req.params.id }) }), ctrl.getTrainingPublishHistory);
router.get('/ingestion/diagnostics', requirePermission('training.read'), withAudit('ingestion_diagnostics_view', 'ingestion'), ctrl.getIngestionDiagnostics);
router.post(
  '/ingestion/contract/validate',
  requirePermission('training.write'),
  withAudit('ingestion_contract_validate', 'ingestion'),
  validate([
    body('sourceText').isString().isLength({ min: 1 }),
    body('imageFiles').optional().isArray(),
    body('documentType').optional().isIn(['normalized_text']),
  ]),
  ctrl.validateIngestionContract
);
router.post(
  '/ingestion/extract/validate',
  requirePermission('training.write'),
  withAudit('ingestion_extract_validate', 'ingestion'),
  uploadDocument.single('document'),
  ctrl.extractAndValidateDocument
);

router.get('/media-assets', requirePermission('media.write'), ctrl.listMediaAssets);
router.post('/media-assets', requirePermission('media.write'), ctrl.registerMediaAsset);
router.delete('/media-assets/:assetId', requirePermission('media.write'), ctrl.deleteMediaAsset);

router.get('/members', requirePermission('user.read'), ctrl.listOrganisationMembers);
router.get('/invitations', requirePermission('user.read'), ctrl.listInvitations);
router.post('/invitations', requirePermission('user.write'), ctrl.createInvitation);
router.post('/invitations/:invitationId/reissue', requirePermission('user.write'), ctrl.reissueInvitation);
router.post('/invitations/:invitationId/revoke', requirePermission('user.write'), ctrl.revokeInvitation);

router.get('/settings', requirePermission('settings.write'), ctrl.listOrganisationSettings);
router.post('/settings', requirePermission('settings.write'), ctrl.upsertOrganisationSetting);

module.exports = router;
