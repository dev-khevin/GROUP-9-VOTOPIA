const bcrypt = require('bcryptjs');
const db = require('../config/db');

const students = [
  ['10111', 'Juan Dela Cruz', 'BSIT', '3-S1', '1234'],
  ['10112', 'Maria Santos', 'BSIT', '3-S1', '4321'],
  ['10113', 'Pedro Reyes', 'BSED', '2-B', '1111'],
  ['10114', 'Ana Garcia', 'BSBA', '1-C', '2222'],
  ['10115', 'Jose Ramos', 'BSIT', '4-A', '3333'],
];

db.prepare("DELETE FROM voters_voted WHERE department_id = 'LEGACY'").run();
db.prepare('DELETE FROM students_ssc').run();

const insert = db.prepare(
  'INSERT INTO students_ssc (student_id, full_name, course, year_section, pin_hash) VALUES (?, ?, ?, ?, ?)'
);
for (const [id, name, course, section, pin] of students) {
  insert.run(id, name, course, section, bcrypt.hashSync(pin, 10));
}

db.prepare("UPDATE settings SET value = 'locked' WHERE key = 'voter_list_status'").run();

console.log('Seeded ' + students.length + ' fake students. Voter list is locked.');