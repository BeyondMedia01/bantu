const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is not set. Refusing to start.');
  process.exit(1);
}

const signToken = (payload) =>
  jwt.sign(payload, SECRET, { expiresIn: '8h' });

const verifyToken = (token) =>
  jwt.verify(token, SECRET);

/**
 * Express middleware — verifies Bearer JWT and sets req.user.
 */
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Authentication required' });

  try {
    req.user = verifyToken(token);
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

/**
 * Middleware factory — requires one of the given roles.
 * Must be used after authenticateToken.
 */
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ message: `Access denied: requires role ${roles.join(' or ')}` });
  }
  next();
};

const getCurrentUser = (req) => req.user ?? null;

module.exports = { signToken, verifyToken, authenticateToken, requireRole, getCurrentUser };
