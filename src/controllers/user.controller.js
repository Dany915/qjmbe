const User = require('../models/User');

const listUsers = async (req, res) => {
  try {
    const { status, role, page = 1, limit = 20 } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (role) filter.role = role;

    const skip = (Number(page) - 1) * Number(limit);

    const [users, total] = await Promise.all([
      User.find(filter)
        .select('-password -googleId -__v')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      User.countDocuments(filter),
    ]);

    return res.json({
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
      users,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password -googleId -__v');
    if (!user) return res.status(404).json({ message: 'User not found' });
    return res.json({ user });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const activateUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.status === 'active')
      return res.status(400).json({ message: 'User is already active' });

    user.status = 'active';
    user.activatedBy = req.user._id;
    user.activatedAt = new Date();
    await user.save();

    return res.json({ message: 'User activated successfully', user: user.toSafeObject() });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const suspendUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user._id.equals(req.user._id))
      return res.status(400).json({ message: 'You cannot suspend your own account' });

    if (user.role === 'super_admin')
      return res.status(403).json({ message: 'No se puede suspender una cuenta de super administrador' });

    if (user.status === 'suspended')
      return res.status(400).json({ message: 'User is already suspended' });

    user.status = 'suspended';
    await user.save();

    return res.json({ message: 'User suspended successfully', user: user.toSafeObject() });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const updateRole = async (req, res) => {
  try {
    const { role } = req.body;
    const allowed = ['user', 'admin'];

    if (!allowed.includes(role))
      return res.status(400).json({ message: `Role must be one of: ${allowed.join(', ')}` });

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user._id.equals(req.user._id))
      return res.status(400).json({ message: 'You cannot change your own role' });

    if (user.role === 'super_admin')
      return res.status(403).json({ message: 'No se puede modificar el rol de un super administrador' });

    user.role = role;
    await user.save();

    return res.json({ message: 'Role updated successfully', user: user.toSafeObject() });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const resetUserPassword = async (req, res) => {
  try {
    const { password } = req.body;

    if (!password || password.length < 6)
      return res.status(400).json({ message: 'La nueva contraseña debe tener al menos 6 caracteres' });

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.role === 'super_admin')
      return res.status(403).json({ message: 'No se puede modificar la contraseña de un super administrador' });

    if (user.authProvider === 'google')
      return res.status(400).json({ message: 'Este usuario inició sesión con Google y no tiene contraseña local' });

    user.password = password;
    await user.save();

    return res.json({ message: 'Contraseña actualizada exitosamente' });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = { listUsers, getUser, activateUser, suspendUser, updateRole, resetUserPassword };
