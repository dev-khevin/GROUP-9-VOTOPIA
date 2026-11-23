const db = require('../config/db');

const text = (v) => (v === null || v === undefined ? null : String(v));

function logChange(
  admin,
  target,
  recordId,
  action,
  oldValue,
  newValue,
  departmentId = 'LEGACY'
) {
  db.prepare(
    'INSERT INTO change_log (admin, department_id, target, record_id, action, old_value, new_value) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(
    admin,
    departmentId,
    target,
    text(recordId),
    action,
    text(oldValue),
    text(newValue)
  );
}

module.exports = { logChange };