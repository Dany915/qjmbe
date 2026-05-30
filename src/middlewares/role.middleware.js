const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

  // super_admin bypasses all role restrictions
  if (req.user.role === 'super_admin' || roles.includes(req.user.role))
    return next();

  return res.status(403).json({
    message: `Access denied. Required role(s): ${roles.join(', ')}`,
  });
};

module.exports = { requireRole };
