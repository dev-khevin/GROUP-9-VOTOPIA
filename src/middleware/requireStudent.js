const { sessions } = require('../routes/auth.routes');
const db = require('../config/db');
const { studentTable } = require('../services/departmentTables');

module.exports = function requireStudent(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const studentSession = sessions.get(token);
  if (!studentSession) {
    return res.status(401).json({ error: 'Please log in.' });
  }
  const student = db
    .prepare(
      'SELECT id, student_id, department_id FROM ' +
        studentTable(studentSession.departmentId) +
        ' WHERE id = ?'
    )
    .get(studentSession.id);
  if (!student) {
    sessions.delete(token);
    return res.status(401).json({ error: 'Your voter record could not be found.' });
  }
  req.studentId = student.student_id;
  req.studentRecordId = student.id;
  req.departmentId = student.department_id;
  req.token = token;
  next();
};