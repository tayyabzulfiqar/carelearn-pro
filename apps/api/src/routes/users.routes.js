const router = require('express').Router();
const { getAll, getById, update } = require('../controllers/users.controller');
const { authenticate, authorize } = require('../middleware/auth');

router.get('/', authenticate, authorize('super_admin', 'org_admin'), getAll);
router.get('/:id', authenticate, getById);
router.put('/:id', authenticate, update);

module.exports = router;
