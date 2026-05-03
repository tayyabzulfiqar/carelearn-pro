const router = require('express').Router();
const { register, login, me } = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth');

router.post('/register', register);
router.get('/login', (req, res) => res.status(405).json({ error: 'Use POST /api/v1/auth/login' }));
router.post('/login', login);
router.get('/me', authenticate, me);

module.exports = router;
