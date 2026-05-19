const router = require('express').Router();
const c = require('../controllers/courses.controller');
const m = require('../controllers/modules.controller');
const l = require('../controllers/lessons.controller');
const a = require('../controllers/assessments.controller');
const { authenticate, authorize } = require('../middleware/auth');
const { withAudit } = require('../middleware/audit');
const structuredLessonGuard = require('../middleware/structuredLessonGuard');
const courseAdmin = authorize('super_admin', 'platform_owner', 'agency_admin');

router.get('/categories', authenticate, c.getCategories);
router.get('/', authenticate, c.getAll);
router.get('/:id', authenticate, c.getById);
router.get('/:id/smart-runtime', authenticate, withAudit('learner_smart_runtime_view', 'learning', { metadata: (req) => ({ course_id: req.params.id }) }), c.getSmartRuntime);
router.post('/', authenticate, courseAdmin, c.create);
router.put('/:id', authenticate, courseAdmin, c.update);
router.post('/:id/publish', authenticate, courseAdmin, c.publish);
router.post('/:id/clone', authenticate, courseAdmin, c.clone);

router.get('/:courseId/modules', authenticate, m.getByCourse);
router.post('/:courseId/modules', authenticate, courseAdmin, m.create);
router.put('/:courseId/modules/:moduleId', authenticate, courseAdmin, m.update);
router.delete('/:courseId/modules/:moduleId', authenticate, courseAdmin, m.delete);

router.get('/:courseId/modules/:moduleId/lessons', authenticate, l.getByModule);
router.post('/:courseId/modules/:moduleId/lessons', authenticate, courseAdmin, l.create);
router.put('/:courseId/modules/:moduleId/lessons/:lessonId', authenticate, courseAdmin, structuredLessonGuard, l.update);
router.delete('/:courseId/modules/:moduleId/lessons/:lessonId', authenticate, courseAdmin, l.delete);

router.get('/:courseId/questions', authenticate, a.getQuestions);
router.get('/:courseId/lessons/:lessonNumber/questions', authenticate, a.getQuestions);
router.post('/:courseId/questions', authenticate, courseAdmin, a.addQuestion);
router.put('/:courseId/questions/:questionId', authenticate, courseAdmin, a.updateQuestion);
router.delete('/:courseId/questions/:questionId', authenticate, courseAdmin, a.deleteQuestion);
router.post('/:courseId/attempt', authenticate, a.submitAttempt);

module.exports = router;
