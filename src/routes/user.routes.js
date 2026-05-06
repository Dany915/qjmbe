const router = require('express').Router();
const { authenticate } = require('../middlewares/auth.middleware');
const { requireRole } = require('../middlewares/role.middleware');
const {
  listUsers,
  getUser,
  activateUser,
  suspendUser,
  updateRole,
} = require('../controllers/user.controller');

const adminOnly = [authenticate, requireRole('admin')];

router.get('/', ...adminOnly, listUsers);
router.get('/:id', ...adminOnly, getUser);
router.patch('/:id/activate', ...adminOnly, activateUser);
router.patch('/:id/suspend', ...adminOnly, suspendUser);
router.patch('/:id/role', ...adminOnly, updateRole);

module.exports = router;
