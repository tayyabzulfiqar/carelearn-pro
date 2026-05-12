const router = require('express').Router();
const { body, query } = require('express-validator');
const ctrl = require('../../controllers/cms/trainingCms.controller');
const { authenticate } = require('../../middleware/auth');
const { requirePermission } = require('../../middleware/permissions');
const { requireTenant } = require('../../middleware/tenant');
const { validate } = require('../../middleware/validation');

router.use(authenticate, requireTenant);

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

router.get('/trainings/:courseId/modules', requirePermission('training.read'), ctrl.listModules);
router.post('/trainings/:courseId/modules', requirePermission('training.write'), ctrl.createModule);
router.put('/trainings/:courseId/modules/:moduleId', requirePermission('training.write'), ctrl.updateModule);
router.post('/trainings/:courseId/modules/reorder', requirePermission('training.write'), ctrl.reorderModules);
router.delete('/trainings/:courseId/modules/:moduleId', requirePermission('training.write'), ctrl.deleteModule);

router.get('/modules/:moduleId/lessons', requirePermission('training.read'), ctrl.listLessons);
router.post('/modules/:moduleId/lessons', requirePermission('training.write'), ctrl.createLesson);
router.put('/modules/:moduleId/lessons/:lessonId', requirePermission('training.write'), ctrl.updateLesson);
router.post('/modules/:moduleId/lessons/reorder', requirePermission('training.write'), ctrl.reorderLessons);
router.delete('/modules/:moduleId/lessons/:lessonId', requirePermission('training.write'), ctrl.deleteLesson);

router.get('/trainings/:courseId/quizzes', requirePermission('quiz.read'), ctrl.listQuizzes);
router.post('/trainings/:courseId/quizzes', requirePermission('quiz.write'), ctrl.createQuiz);
router.put('/quizzes/:quizId', requirePermission('quiz.write'), ctrl.updateQuiz);
router.delete('/quizzes/:quizId', requirePermission('quiz.write'), ctrl.deleteQuiz);
router.get('/quizzes/:quizId/questions', requirePermission('quiz.read'), ctrl.listQuizQuestions);
router.post('/quizzes/:quizId/questions', requirePermission('quiz.write'), ctrl.createQuizQuestion);
router.put('/quizzes/:quizId/questions/:questionId', requirePermission('quiz.write'), ctrl.updateQuizQuestion);
router.delete('/quizzes/:quizId/questions/:questionId', requirePermission('quiz.write'), ctrl.deleteQuizQuestion);
router.get('/trainings/:courseId/quiz-analytics', requirePermission('analytics.read'), ctrl.getQuizAnalytics);

router.get('/certificate-templates', requirePermission('certificate.read'), ctrl.listCertificateTemplates);
router.post('/certificate-templates', requirePermission('certificate.write'), ctrl.createCertificateTemplate);
router.put('/certificate-templates/:templateId', requirePermission('certificate.write'), ctrl.updateCertificateTemplate);
router.delete('/certificate-templates/:templateId', requirePermission('certificate.write'), ctrl.deleteCertificateTemplate);
router.post('/certificates/:certificateId/renew', requirePermission('certificate.write'), ctrl.renewCertificate);

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
