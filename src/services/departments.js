const db = require('../config/db');

const DEPARTMENTS = ['BSIT', 'BSBA', 'BSCE'];
const LEGACY_DEPARTMENT = 'LEGACY';

function normalizeDepartment(value) {
  const department = String(value || '').trim().toUpperCase();
  if (department === LEGACY_DEPARTMENT || DEPARTMENTS.includes(department)) {
    return department;
  }
  return null;
}

function settingKey(departmentId, key) {
  return departmentId === LEGACY_DEPARTMENT
    ? key
    : departmentId + ':' + key;
}

function getSetting(departmentId, key) {
  const row = db
    .prepare('SELECT value FROM settings WHERE key = ?')
    .get(settingKey(departmentId, key));
  if (!row) {
    throw new Error(
      'Missing setting "' + key + '" for department "' + departmentId + '".'
    );
  }
  return row.value;
}

function setSetting(departmentId, key, value) {
  const result = db
    .prepare('UPDATE settings SET value = ? WHERE key = ?')
    .run(value, settingKey(departmentId, key));
  if (result.changes === 0) {
    throw new Error(
      'Missing setting "' + key + '" for department "' + departmentId + '".'
    );
  }
}

module.exports = {
  DEPARTMENTS,
  LEGACY_DEPARTMENT,
  normalizeDepartment,
  settingKey,
  getSetting,
  setSetting,
};
