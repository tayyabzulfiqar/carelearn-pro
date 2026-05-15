const router = require('express').Router();
const {
  create,
  getById,
  getMembers,
  addMember,
  removeMember,
  enrollMember,
  getReports,
} = require('../controllers/organisations.controller');
const { authenticate, authorize } = require('../middleware/auth');
const { requireTenantScope } = require('../middleware/tenantAccess');
const { enforceSubscription } = require('../middleware/subscription');

router.post('/', authenticate, authorize('platform_owner', 'super_admin'), create);
router.get('/:id', authenticate, requireTenantScope({ orgResolver: (req) => req.params.id }), getById);
router.get('/:id/members', authenticate, authorize('platform_owner', 'super_admin', 'agency_admin', 'org_admin'), requireTenantScope({ orgResolver: (req) => req.params.id }), getMembers);
router.post('/:id/members', authenticate, authorize('platform_owner', 'super_admin', 'agency_admin', 'org_admin'), requireTenantScope({ orgResolver: (req) => req.params.id }), addMember);
router.delete('/:id/members/:userId', authenticate, authorize('platform_owner', 'super_admin', 'agency_admin', 'org_admin'), requireTenantScope({ orgResolver: (req) => req.params.id }), removeMember);
router.post('/:id/enrollments', authenticate, authorize('platform_owner', 'super_admin', 'agency_admin', 'org_admin'), requireTenantScope({ orgResolver: (req) => req.params.id }), enforceSubscription('enrollment.write'), enrollMember);
router.get('/:id/reports', authenticate, authorize('platform_owner', 'super_admin', 'agency_admin', 'org_admin'), requireTenantScope({ orgResolver: (req) => req.params.id }), getReports);

module.exports = router;
