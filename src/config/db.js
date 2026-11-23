const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(
  process.env.CAMPUSVOTE_DB_PATH || path.join(dataDir, 'voting.db')
);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const DEPARTMENTS = ['BSIT', 'BSBA', 'BSCE'];
const ALL_DEPARTMENTS = ['LEGACY', ...DEPARTMENTS];
const TABLE_SUFFIX = {
  LEGACY: 'ssc',
  BSIT: 'bsit',
  BSBA: 'bsba',
  BSCE: 'bsce',
};

function tableExists(name) {
  return !!db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name);
}

function columnNames(table) {
  return db.prepare('PRAGMA table_info("' + table + '")').all().map((c) => c.name);
}

function ensureColumn(table, columns, name, definition) {
  if (!columns.includes(name)) {
    db.exec('ALTER TABLE "' + table + '" ADD COLUMN ' + definition);
    columns.push(name);
  }
}

function departmentFor(value) {
  return ALL_DEPARTMENTS.includes(value) ? value : 'LEGACY';
}

function studentTable(departmentId) {
  return 'students_' + TABLE_SUFFIX[departmentId];
}

function candidateTable(departmentId) {
  return 'candidates_' + TABLE_SUFFIX[departmentId];
}

db.exec(`
  CREATE TABLE IF NOT EXISTS departments (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    is_legacy INTEGER NOT NULL DEFAULT 0
  );
  INSERT OR IGNORE INTO departments (id, name, is_legacy) VALUES
    ('BSIT', 'BSIT', 0),
    ('BSBA', 'BSBA', 0),
    ('BSCE', 'BSCE', 0),
    ('LEGACY', 'SSC Voting', 1);
  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    department_id TEXT REFERENCES departments(id)
  );
`);

if (tableExists('admins')) {
  const adminCols = columnNames('admins');
  ensureColumn('admins', adminCols, 'department_id', 'department_id TEXT');
}

if (tableExists('positions')) {
  const positionCols = columnNames('positions');
  ensureColumn(
    'positions',
    positionCols,
    'votes_allowed',
    'votes_allowed INTEGER NOT NULL DEFAULT 1'
  );
  ensureColumn(
    'positions',
    positionCols,
    'sort_order',
    'sort_order INTEGER NOT NULL DEFAULT 0'
  );

  const uniqueIndexes = db
    .prepare('PRAGMA index_list(positions)')
    .all()
    .filter((index) => index.unique)
    .map((index) =>
      db
        .prepare('PRAGMA index_info("' + index.name.replace(/"/g, '""') + '")')
        .all()
        .map((column) => column.name)
    );
  const hasScopedUniqueIndex = uniqueIndexes.some(
    (columns) =>
      columns.length === 2 &&
      columns.includes('department_id') &&
      columns.includes('name')
  );

  if (!positionCols.includes('department_id') || !hasScopedUniqueIndex) {
    db.pragma('foreign_keys = OFF');
    try {
      db.transaction(() => {
        const departmentExpr = positionCols.includes('department_id')
          ? "CASE WHEN department_id IN ('LEGACY', 'BSIT', 'BSBA', 'BSCE') THEN department_id ELSE 'LEGACY' END"
          : "'LEGACY'";
        db.exec(`
          CREATE TABLE positions_department_migration (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            department_id TEXT NOT NULL DEFAULT 'LEGACY' REFERENCES departments(id),
            name TEXT NOT NULL,
            votes_allowed INTEGER NOT NULL DEFAULT 1,
            sort_order INTEGER NOT NULL DEFAULT 0,
            UNIQUE (department_id, name)
          );
          INSERT INTO positions_department_migration
            (id, department_id, name, votes_allowed, sort_order)
          SELECT id, ${departmentExpr}, name, votes_allowed, sort_order
          FROM positions;
          DROP TABLE positions;
          ALTER TABLE positions_department_migration RENAME TO positions;
        `);
      })();
    } finally {
      db.pragma('foreign_keys = ON');
    }
  }
}

const schema = fs.readFileSync(
  path.join(__dirname, '..', 'db', 'schema.sql'),
  'utf8'
);
db.exec(schema);
db.prepare("UPDATE departments SET name = 'SSC Voting', is_legacy = 1 WHERE id = 'LEGACY'").run();

if (tableExists('students')) {
  const studentCols = columnNames('students');
  ensureColumn('students', studentCols, 'department_id', "department_id TEXT NOT NULL DEFAULT 'LEGACY'");
  ensureColumn('students', studentCols, 'pin', 'pin TEXT');
  ensureColumn('students', studentCols, 'pin_hash', 'pin_hash TEXT');
  ensureColumn('students', studentCols, 'registered', 'registered INTEGER NOT NULL DEFAULT 0');
  ensureColumn(
    'students',
    studentCols,
    'failed_attempts',
    'failed_attempts INTEGER NOT NULL DEFAULT 0'
  );
  ensureColumn('students', studentCols, 'locked_until', 'locked_until TEXT');
  ensureColumn(
    'students',
    studentCols,
    'needs_review',
    'needs_review INTEGER NOT NULL DEFAULT 0'
  );
  ensureColumn('students', studentCols, 'pin_enc', 'pin_enc TEXT');
  ensureColumn('students', studentCols, 'consent_at', 'consent_at TEXT');

  const rows = db.prepare('SELECT * FROM students ORDER BY id').all();
  const insertByDepartment = Object.fromEntries(
    ALL_DEPARTMENTS.map((departmentId) => [
      departmentId,
      db.prepare(`
        INSERT INTO ${studentTable(departmentId)}
          (id, student_id, full_name, department_id, course, year_section, pin,
           pin_hash, registered, failed_attempts, locked_until, needs_review,
           pin_enc, consent_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),
    ])
  );
  const migrateStudents = db.transaction(() => {
    for (const student of rows) {
      const departmentId = departmentFor(student.department_id);
      insertByDepartment[departmentId].run(
        student.id,
        student.student_id,
        student.full_name,
        departmentId,
        student.course || null,
        student.year_section || null,
        student.pin || null,
        student.pin_hash || null,
        student.registered || 0,
        student.failed_attempts || 0,
        student.locked_until || null,
        student.needs_review || 0,
        student.pin_enc || null,
        student.consent_at || null
      );
    }
    db.exec('DROP TABLE students');
  });
  migrateStudents();
}

if (tableExists('candidates')) {
  const candidateCols = columnNames('candidates');
  ensureColumn(
    'candidates',
    candidateCols,
    'department_id',
    "department_id TEXT NOT NULL DEFAULT 'LEGACY'"
  );
  ensureColumn(
    'candidates',
    candidateCols,
    'needs_review',
    'needs_review INTEGER NOT NULL DEFAULT 0'
  );
  ensureColumn('candidates', candidateCols, 'photo', 'photo TEXT');
  ensureColumn(
    'candidates',
    candidateCols,
    'background',
    "background TEXT NOT NULL DEFAULT ''"
  );

  const rows = db.prepare('SELECT * FROM candidates ORDER BY id').all();
  db.pragma('foreign_keys = OFF');
  try {
    db.transaction(() => {
      const insertRecord = db.prepare(
        'INSERT INTO candidate_records (id, department_id, student_id) VALUES (?, ?, ?)'
      );
      const insertByDepartment = Object.fromEntries(
        ALL_DEPARTMENTS.map((departmentId) => [
          departmentId,
          db.prepare(`
            INSERT INTO ${candidateTable(departmentId)}
              (id, student_id, full_name, department_id, course, year_section,
               partylist, background, position_id, needs_review, photo)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `),
        ])
      );

      for (const candidate of rows) {
        const departmentId = departmentFor(candidate.department_id);
        insertRecord.run(candidate.id, departmentId, candidate.student_id);
        insertByDepartment[departmentId].run(
          candidate.id,
          candidate.student_id,
          candidate.full_name,
          departmentId,
          candidate.course || null,
          candidate.year_section || null,
          candidate.partylist || null,
          candidate.background || '',
          candidate.position_id,
          candidate.needs_review || 0,
          candidate.photo || null
        );
      }

      if (tableExists('votes')) {
        db.exec(`
          CREATE TABLE votes_candidate_migration (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            position_id INTEGER NOT NULL REFERENCES positions(id),
            candidate_id INTEGER REFERENCES candidate_records(id)
          );
          INSERT INTO votes_candidate_migration (id, position_id, candidate_id)
          SELECT id, position_id, candidate_id FROM votes;
          DROP TABLE votes;
          ALTER TABLE votes_candidate_migration RENAME TO votes;
        `);
      }
      db.exec('DROP TABLE candidates');
    })();
  } finally {
    db.pragma('foreign_keys = ON');
  }
}

if (tableExists('voters_voted')) {
  const votedCols = columnNames('voters_voted');
  if (!votedCols.includes('department_id')) {
    db.pragma('foreign_keys = OFF');
    try {
      db.transaction(() => {
        db.exec(`
          CREATE TABLE voters_voted_department_migration (
            department_id TEXT NOT NULL DEFAULT 'LEGACY' REFERENCES departments(id),
            student_id TEXT NOT NULL,
            PRIMARY KEY (department_id, student_id)
          );
          INSERT INTO voters_voted_department_migration (department_id, student_id)
          SELECT 'LEGACY', student_id FROM voters_voted;
          DROP TABLE voters_voted;
          ALTER TABLE voters_voted_department_migration RENAME TO voters_voted;
        `);
      })();
    } finally {
      db.pragma('foreign_keys = ON');
    }
  }
}

if (tableExists('change_log')) {
  const changeLogCols = columnNames('change_log');
  ensureColumn(
    'change_log',
    changeLogCols,
    'department_id',
    "department_id TEXT NOT NULL DEFAULT 'LEGACY'"
  );
}

for (const departmentId of DEPARTMENTS) {
  for (const [key, value] of [
    ['poll_status', 'not_started'],
    ['voter_list_status', 'draft'],
    ['candidate_list_status', 'draft'],
    ['election_mode', 'test'],
  ]) {
    db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run(
      departmentId + ':' + key,
      value
    );
  }
}

const foreignKeyErrors = db.pragma('foreign_key_check');
if (foreignKeyErrors.length) {
  throw new Error(
    'Database migration left foreign-key violations: ' +
      JSON.stringify(foreignKeyErrors)
  );
}

module.exports = db;
