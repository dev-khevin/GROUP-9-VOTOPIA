const bcrypt = require('bcryptjs');
const db = require('../config/db');

const [username, password, departmentArg] = process.argv.slice(2);
const departmentId = departmentArg ? departmentArg.trim().toUpperCase() : null;

if (!username || !password || password.length < 8) {
  console.log(
    'Usage: node src/db/createAdmin.js <username> <password> [BSIT|BSBA|BSCE]'
  );
  console.log('The password must be at least 8 characters.');
  process.exit(1);
}
if (departmentArg && !['BSIT', 'BSBA', 'BSCE'].includes(departmentId)) {
  console.error('Department must be BSIT, BSBA, or BSCE.');
  process.exit(1);
}

const name = username.trim().toLowerCase();
const hash = bcrypt.hashSync(password, 10);
const existing = db
  .prepare('SELECT id, department_id FROM admins WHERE username = ?')
  .get(name);

if (existing) {
  db.prepare(
    'UPDATE admins SET password_hash = ?, department_id = ? WHERE id = ?'
  ).run(hash, departmentArg ? departmentId : existing.department_id, existing.id);
  console.log('Updated the credentials for admin "' + name + '".');
} else {
  db.prepare(
    'INSERT INTO admins (username, password_hash, department_id) VALUES (?, ?, ?)'
  ).run(name, hash, departmentId);
  console.log('Created admin "' + name + '".');
}