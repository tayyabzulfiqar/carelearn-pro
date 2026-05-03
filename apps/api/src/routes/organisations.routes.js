const router = require('express').Router();
const { create, getById, getMembers } = require('../controllers/organisations.controller');
const { authenticate, authorize } = require('../middleware/auth');

router.post('/', authenticate, authorize('super_admin'), create);
router.get('/:id', authenticate, getById);
router.get('/:id/members', authenticate, authorize('super_admin', 'org_admin'), getMembers);

module.exports = router;
