const adminSessions = require('../services/adminSessions');

module.exports = function requireAdmin(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const session = adminSessions.get(token);
  if (!session || session.expires < Date.now()) {
    adminSessions.delete(token);
    return res.status(401).json({ error: 'Please log in as admin.' });
  }
  req.admin = session.username;
  req.adminSession = session;
  req.token = token;
  next();
};