const db = require('../config/db');
const {
  normalizeDepartment,
  LEGACY_DEPARTMENT,
} = require('../services/departments');

module.exports = function requireDepartment(req, res, next) {
  const departmentId = normalizeDepartment(req.get('X-Department') || LEGACY_DEPARTMENT);
  if (!departmentId) {
    return res.status(400).json({ error: 'Choose a valid department.' });
  }

  const exists = db
    .prepare('SELECT 1 FROM departments WHERE id = ?')
    .get(departmentId);
  if (!exists) {
    return res.status(400).json({ error: 'Choose a valid department.' });
  }

  if (departmentId === LEGACY_DEPARTMENT) {
    const account = db
      .prepare('SELECT department_id FROM admins WHERE username = ?')
      .get(req.adminSession.username);
    if (!account || account.department_id) {
      return res.status(403).json({
        error: 'Your admin account cannot access SSC Voting.',
      });
    }
  } else {
    const grant = req.adminSession?.departmentAccess;
    if (!grant || grant.departmentId !== departmentId) {
      return res.status(403).json({
        error: 'Enter the administrator credentials for this department first.',
      });
    }
    req.admin = grant.username;
  }

  req.departmentId = departmentId;
  next();
};
