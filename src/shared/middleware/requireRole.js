const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    // req.user is set by your existing requireAuth middleware
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: "Access denied. You do not have permission to perform this action." 
      });
    }
    next();
  };
};

module.exports = requireRole;