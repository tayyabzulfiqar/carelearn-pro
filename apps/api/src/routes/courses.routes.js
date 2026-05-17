const router = require('express').Router();
const c = require('../controllers/courses.controller');
const m = require('../controllers/modules.controller');
const l = require('../controllers/lessons.controller');
const a = require('../controllers/assessments.controller');
const { authenticate, authorize } = require('../middleware/auth');
const { withAudit } = require('../middleware/audit');
const superAdmin = authorize('super_admin');

router.get('/categories', authenticate, c.getCategories);
router.get('/', authenticate, c.getAll);
router.get('/:id', authenticate, c.getById);
router.get('/:id/smart-runtime', authenticate, withAudit('learner_smart_runtime_view', 'learning', { metadata: (req) => ({ course_id: req.params.id }) }), c.getSmartRuntime);
router.post('/', authenticate, superAdmin, c.create);
router.put('/:id', authenticate, superAdmin, c.update);
router.post('/:id/publish', authenticate, superAdmin, c.publish);
router.post('/:id/clone', authenticate, superAdmin, c.clone);

router.get('/:courseId/modules', authenticate, m.getByCourse);
router.post('/:courseId/modules', authenticate, superAdmin, m.create);
router.put('/:courseId/modules/:moduleId', authenticate, superAdmin, m.update);
router.delete('/:courseId/modules/:moduleId', authenticate, superAdmin, m.delete);

router.get('/:courseId/modules/:moduleId/lessons', authenticate, l.getByModule);
router.post('/:courseId/modules/:moduleId/lessons', authenticate, superAdmin, l.create);
router.put('/:courseId/modules/:moduleId/lessons/:lessonId', authenticate, superAdmin, l.update);
router.delete('/:courseId/modules/:moduleId/lessons/:lessonId', authenticate, superAdmin, l.delete);

router.get('/:courseId/questions', authenticate, a.getQuestions);
router.get('/:courseId/lessons/:lessonNumber/questions', authenticate, a.getQuestions);
router.post('/:courseId/questions', authenticate, superAdmin, a.addQuestion);
router.put('/:courseId/questions/:questionId', authenticate, superAdmin, a.updateQuestion);
router.delete('/:courseId/questions/:questionId', authenticate, superAdmin, a.deleteQuestion);
router.post('/:courseId/attempt', authenticate, a.submitAttempt);

module.exports = router;
