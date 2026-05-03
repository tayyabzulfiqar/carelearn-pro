const router = require('express').Router();
const e = require('../controllers/enrollments.controller');
const { authenticate } = require('../middleware/auth');

router.post('/', authenticate, e.enroll);
router.get('/my', authenticate, e.getMyEnrollments);
router.put('/progress', authenticate, e.updateProgress);
router.post('/complete', authenticate, e.complete);
router.get('/:enrollmentId/progress', authenticate, e.getProgress);

module.exports = router;
