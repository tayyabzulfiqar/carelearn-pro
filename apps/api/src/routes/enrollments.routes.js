const router = require('express').Router();
const e = require('../controllers/enrollments.controller');
const { authenticate } = require('../middleware/auth');
const { requireTenantScope } = require('../middleware/tenantAccess');
const { enforceSubscription } = require('../middleware/subscription');

router.post('/', authenticate, requireTenantScope({ orgResolver: (req) => req.body.organisation_id || req.tenant?.organisationId }), enforceSubscription('enrollment.write'), e.enroll);
router.get('/my', authenticate, e.getMyEnrollments);
router.put('/progress', authenticate, e.updateProgress);
router.post('/complete', authenticate, e.complete);
router.get('/:enrollmentId/progress', authenticate, e.getProgress);

module.exports = router;
