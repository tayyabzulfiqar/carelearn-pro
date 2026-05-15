const router = require('express').Router();
const c = require('../controllers/certificates.controller');
const { authenticate } = require('../middleware/auth');
const { requireTenantScope } = require('../middleware/tenantAccess');
const { enforceSubscription } = require('../middleware/subscription');

router.get('/verify/:certNumber', c.verify);
router.get('/verify-token/:token', c.verifyByToken);
router.get('/user/:userId', authenticate, c.getByUser);
router.post('/', authenticate, requireTenantScope({ orgResolver: (req) => req.body.organisation_id || req.tenant?.organisationId }), enforceSubscription('certificate.write'), c.issue);
router.get('/download/:fileName', c.downloadImage);

module.exports = router;
