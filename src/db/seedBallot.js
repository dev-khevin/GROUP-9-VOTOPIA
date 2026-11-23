const db = require('../config/db');

db.prepare(
  "DELETE FROM votes WHERE position_id IN (SELECT id FROM positions WHERE department_id = 'LEGACY')"
).run();
db.prepare("DELETE FROM voters_voted WHERE department_id = 'LEGACY'").run();
db.prepare("DELETE FROM candidate_records WHERE department_id = 'LEGACY'").run();
db.prepare("DELETE FROM positions WHERE department_id = 'LEGACY'").run();

const addPosition = db.prepare(
  'INSERT INTO positions (department_id, name, votes_allowed, sort_order) VALUES (?, ?, ?, ?)'
);
const addCandidate = db.transaction(
  (studentId, fullName, course, yearSection, partylist, positionId) => {
    const info = db
      .prepare(
        "INSERT INTO candidate_records (department_id, student_id) VALUES ('LEGACY', ?)"
      )
      .run(studentId);
    db.prepare(
      'INSERT INTO candidates_ssc (id, student_id, full_name, course, year_section, partylist, position_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(
      info.lastInsertRowid,
      studentId,
      fullName,
      course,
      yearSection,
      partylist,
      positionId
    );
  }
);

const president = addPosition.run('LEGACY', 'President', 1, 1).lastInsertRowid;
const vice = addPosition.run('LEGACY', 'Vice President', 1, 2).lastInsertRowid;
const rep = addPosition.run('LEGACY', 'Representative', 2, 3).lastInsertRowid;

addCandidate('10101', 'Lara Mendoza', 'BSIT', '4-S1', 'Unity', president);
addCandidate('10102', 'Carlo Bautista', 'BSBA', '4-S1', 'Progress', president);
addCandidate('10103', 'Dina Flores', 'BSED', '3-S1', 'Unity', vice);
addCandidate('10104', 'Mark Villanueva', 'BSIT', '3-S1', 'Progress', vice);
addCandidate('10105', 'Ella Cruz', 'BSIT', '2-S1', 'Unity', rep);
addCandidate('10106', 'Noel Aquino', 'BSED', '2-S1', 'Progress', rep);
addCandidate('10107', 'Joy Lim', 'BSBA', '2-S1', null, rep);

db.prepare("UPDATE settings SET value = 'locked' WHERE key = 'candidate_list_status'").run();
db.prepare("UPDATE settings SET value = 'open' WHERE key = 'poll_status'").run();

console.log('Seeded 3 positions and 7 fake candidates. Polls are open.');