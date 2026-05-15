const router = require('express').Router();
const { getAll, getById, update } = require('../controllers/users.controller');
const { authenticate, authorize } = require('../middleware/auth');

router.get('/', authenticate, authorize('platform_owner', 'super_admin', 'agency_admin', 'org_admin'), getAll);
router.get('/:id', authenticate, getById);
router.put('/:id', authenticate, update);

module.exports = router;
