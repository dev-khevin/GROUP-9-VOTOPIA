const { sessions } = require('../routes/auth.routes');
const adminSessions = require('../services/adminSessions');
const db = require('../config/db');
const { studentTable } = require('../services/departmentTables');

module.exports = function requireResultsAccess(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const studentSession = sessions.get(token);
  if (studentSession) {
    const student = db
      .prepare(
        'SELECT id, student_id, department_id FROM ' +
          studentTable(studentSession.departmentId) +
          ' WHERE id = ?'
      )
      .get(studentSession.id);
    if (student) {
      req.studentId = student.student_id;
      req.studentRecordId = student.id;
      req.departmentId = student.department_id;
      return next();
    }
    sessions.delete(token);
  }

  const adminSession = adminSessions.get(token);
  if (adminSession && adminSession.expires >= Date.now()) {
    req.admin = adminSession.username;
    req.adminSession = adminSession;
    req.token = token;
    return next();
  }
  if (adminSession) adminSessions.delete(token);

  return res.status(401).json({ error: 'Please log in to view results.' });
};
