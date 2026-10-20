function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    if (!roles.includes(req.session.user.role)) {
      return res.status(403).json({ error: 'Not authorized for this action' });
    }
    // A new account, or the published demo password in production: set
    // your own password (Account page) before doing anything else.
    if (req.session.user.mustChangePassword) {
      return res.status(403).json({ error: 'Set your own password first (Account page).', mustChangePassword: true });
    }
    next();
  };
}

// For public routes that show editors a little more — e.g. a competition
// hidden from the public (Competition.isActive false) still opens for them.
function isEditor(req) {
  return ['ADMIN', 'EDITOR'].includes(req.session?.user?.role);
}

module.exports = { requireAuth, requireRole, isEditor };
