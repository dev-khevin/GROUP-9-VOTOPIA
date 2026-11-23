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

CREATE TABLE IF NOT EXISTS positions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  department_id TEXT NOT NULL DEFAULT 'LEGACY' REFERENCES departments(id),
  name TEXT NOT NULL,
  votes_allowed INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (department_id, name)
);

CREATE TABLE IF NOT EXISTS students_ssc (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  department_id TEXT NOT NULL DEFAULT 'LEGACY' REFERENCES departments(id)
    CHECK (department_id = 'LEGACY'),
  course TEXT,
  year_section TEXT,
  pin TEXT,
  pin_hash TEXT,
  registered INTEGER NOT NULL DEFAULT 0,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  needs_review INTEGER NOT NULL DEFAULT 0,
  pin_enc TEXT,
  consent_at TEXT
);

CREATE TABLE IF NOT EXISTS students_bsit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  department_id TEXT NOT NULL DEFAULT 'BSIT' REFERENCES departments(id)
    CHECK (department_id = 'BSIT'),
  course TEXT,
  year_section TEXT,
  pin TEXT,
  pin_hash TEXT,
  registered INTEGER NOT NULL DEFAULT 0,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  needs_review INTEGER NOT NULL DEFAULT 0,
  pin_enc TEXT,
  consent_at TEXT
);

CREATE TABLE IF NOT EXISTS students_bsba (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  department_id TEXT NOT NULL DEFAULT 'BSBA' REFERENCES departments(id)
    CHECK (department_id = 'BSBA'),
  course TEXT,
  year_section TEXT,
  pin TEXT,
  pin_hash TEXT,
  registered INTEGER NOT NULL DEFAULT 0,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  needs_review INTEGER NOT NULL DEFAULT 0,
  pin_enc TEXT,
  consent_at TEXT
);

CREATE TABLE IF NOT EXISTS students_bsce (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  department_id TEXT NOT NULL DEFAULT 'BSCE' REFERENCES departments(id)
    CHECK (department_id = 'BSCE'),
  course TEXT,
  year_section TEXT,
  pin TEXT,
  pin_hash TEXT,
  registered INTEGER NOT NULL DEFAULT 0,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  needs_review INTEGER NOT NULL DEFAULT 0,
  pin_enc TEXT,
  consent_at TEXT
);

CREATE TABLE IF NOT EXISTS candidate_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  department_id TEXT NOT NULL REFERENCES departments(id),
  student_id TEXT NOT NULL,
  UNIQUE (department_id, student_id)
);

CREATE TABLE IF NOT EXISTS candidates_ssc (
  id INTEGER PRIMARY KEY REFERENCES candidate_records(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  department_id TEXT NOT NULL DEFAULT 'LEGACY' REFERENCES departments(id)
    CHECK (department_id = 'LEGACY'),
  course TEXT,
  year_section TEXT,
  partylist TEXT,
  background TEXT NOT NULL DEFAULT '',
  position_id INTEGER NOT NULL REFERENCES positions(id),
  needs_review INTEGER NOT NULL DEFAULT 0,
  photo TEXT
);

CREATE TABLE IF NOT EXISTS candidates_bsit (
  id INTEGER PRIMARY KEY REFERENCES candidate_records(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  department_id TEXT NOT NULL DEFAULT 'BSIT' REFERENCES departments(id)
    CHECK (department_id = 'BSIT'),
  course TEXT,
  year_section TEXT,
  partylist TEXT,
  background TEXT NOT NULL DEFAULT '',
  position_id INTEGER NOT NULL REFERENCES positions(id),
  needs_review INTEGER NOT NULL DEFAULT 0,
  photo TEXT
);

CREATE TABLE IF NOT EXISTS candidates_bsba (
  id INTEGER PRIMARY KEY REFERENCES candidate_records(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  department_id TEXT NOT NULL DEFAULT 'BSBA' REFERENCES departments(id)
    CHECK (department_id = 'BSBA'),
  course TEXT,
  year_section TEXT,
  partylist TEXT,
  background TEXT NOT NULL DEFAULT '',
  position_id INTEGER NOT NULL REFERENCES positions(id),
  needs_review INTEGER NOT NULL DEFAULT 0,
  photo TEXT
);

CREATE TABLE IF NOT EXISTS candidates_bsce (
  id INTEGER PRIMARY KEY REFERENCES candidate_records(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  department_id TEXT NOT NULL DEFAULT 'BSCE' REFERENCES departments(id)
    CHECK (department_id = 'BSCE'),
  course TEXT,
  year_section TEXT,
  partylist TEXT,
  background TEXT NOT NULL DEFAULT '',
  position_id INTEGER NOT NULL REFERENCES positions(id),
  needs_review INTEGER NOT NULL DEFAULT 0,
  photo TEXT
);

CREATE TABLE IF NOT EXISTS votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  position_id INTEGER NOT NULL REFERENCES positions(id),
  candidate_id INTEGER REFERENCES candidate_records(id)
);

CREATE TABLE IF NOT EXISTS voters_voted (
  department_id TEXT NOT NULL DEFAULT 'LEGACY' REFERENCES departments(id),
  student_id TEXT NOT NULL,
  PRIMARY KEY (department_id, student_id)
);

CREATE TABLE IF NOT EXISTS change_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin TEXT NOT NULL,
  department_id TEXT NOT NULL DEFAULT 'LEGACY' REFERENCES departments(id),
  target TEXT NOT NULL,
  record_id TEXT,
  action TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO settings (key, value) VALUES ('poll_status', 'not_started');
INSERT OR IGNORE INTO settings (key, value) VALUES ('voter_list_status', 'draft');
INSERT OR IGNORE INTO settings (key, value) VALUES ('candidate_list_status', 'draft');
INSERT OR IGNORE INTO settings (key, value) VALUES ('election_mode', 'test');
