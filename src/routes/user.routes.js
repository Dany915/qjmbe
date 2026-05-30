const router = require('express').Router();
const { authenticate } = require('../middlewares/auth.middleware');
const { requireRole } = require('../middlewares/role.middleware');
const {
  listUsers,
  getUser,
  activateUser,
  suspendUser,
  updateRole,
  resetUserPassword,
} = require('../controllers/user.controller');

const adminOnly = [authenticate, requireRole('admin')];
const superAdminOnly = [authenticate, requireRole('super_admin')];

router.get('/', ...adminOnly, listUsers);
router.get('/:id', ...adminOnly, getUser);
router.patch('/:id/activate', ...adminOnly, activateUser);
router.patch('/:id/suspend', ...superAdminOnly, suspendUser);
router.patch('/:id/role', ...superAdminOnly, updateRole);
router.patch('/:id/reset-password', ...superAdminOnly, resetUserPassword);

module.exports = router;
