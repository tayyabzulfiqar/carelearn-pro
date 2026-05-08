const router = require('express').Router();
const c = require('../controllers/certificates.controller');
const { authenticate } = require('../middleware/auth');

router.get('/verify/:certNumber', c.verify);
router.get('/verify-token/:token', c.verifyByToken);
router.get('/user/:userId', authenticate, c.getByUser);
router.post('/', authenticate, c.issue);
router.get('/download/:fileName', c.downloadImage);

module.exports = router;
