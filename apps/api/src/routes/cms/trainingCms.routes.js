const router = require('express').Router();
const { body, query } = require('express-validator');
const ctrl = require('../../controllers/cms/trainingCms.controller');
const { authenticate, authorize } = require('../../middleware/auth');
const { requirePermission } = require('../../middleware/permissions');
const { requireTenant } = require('../../middleware/tenant');
const { validate } = require('../../middleware/validation');

const superAdminOnly = authorize('super_admin');

router.use(authenticate, superAdminOnly, requireTenant);

router.get(
  '/trainings',
  requirePermission('training.read'),
  validate([
    query('limit').optional().isInt({ min: 1, max: 200 }),
    query('offset').optional().isInt({ min: 0 }),
  ]),
  ctrl.listTrainings
);
router.post('/trainings', requirePermission('training.write'), validate([body('title').isString().isLength({ min: 3 })]), ctrl.createTraining);
router.put('/trainings/:id', requirePermission('training.write'), ctrl.updateTraining);
router.delete('/trainings/:id', requirePermission('training.write'), ctrl.deleteTraining);
router.post('/trainings/:id/status', requirePermission('training.write'), ctrl.transitionTrainingStatus);
router.post(
  '/ingestion/contract/validate',
  requirePermission('training.write'),
  validate([
    body('sourceText').isString().isLength({ min: 1 }),
    body('imageFiles').optional().isArray(),
    body('documentType').optional().isIn(['normalized_text']),
  ]),
  ctrl.validateIngestionContract
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
