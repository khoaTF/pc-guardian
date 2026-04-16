const { readData } = require('../utils/storage');

// In-memory session store
const sessions = new Map();

/**
 * Auth middleware - checks for valid session token
 */
function authMiddleware(req, res, next) {
  // Skip auth for login endpoint and static files
  if (req.path === '/api/auth/login' || req.path === '/api/auth/setup-check') {
    return next();
  }

  const token = req.headers['x-auth-token'] || req.query.token;

  if (!token) {
    return res.status(401).json({ error: 'Chưa đăng nhập' });
  }

  const session = sessions.get(token);
  if (!session) {
    return res.status(401).json({ error: 'Phiên đăng nhập không hợp lệ' });
  }

  // Check session expiry (30 minutes)
  if (Date.now() - session.lastActivity > 30 * 60 * 1000) {
    sessions.delete(token);
    return res.status(401).json({ error: 'Phiên đăng nhập đã hết hạn' });
  }

  // Update last activity
  session.lastActivity = Date.now();
  req.session = session;

  next();
}

/**
 * Create a new session
 * @returns {string} Session token
 */
function createSession() {
  const { v4: uuidv4 } = require('uuid');
  const token = uuidv4();
  sessions.set(token, {
    token,
    createdAt: Date.now(),
    lastActivity: Date.now()
  });
  return token;
}

/**
 * Destroy a session
 * @param {string} token
 */
function destroySession(token) {
  sessions.delete(token);
}

/**
 * Check if password has been set up
 */
function isSetup() {
  const settings = readData('settings.json', {});
  return !!settings.passwordHash;
}

module.exports = { authMiddleware, createSession, destroySession, isSetup };
