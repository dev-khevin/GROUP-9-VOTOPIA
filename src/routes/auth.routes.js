const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../config/db');
const { getSetting } = require('../services/departments');
const { DEPARTMENT_IDS, studentTable } = require('../services/departmentTables');

const router = express.Router();

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const sessions = new Map(); // token -> student record id
const studentSummary = (student) => ({
  studentId: student.student_id,
  fullName: student.full_name,
  departmentId: student.department_id,
  department: db
    .prepare('SELECT name FROM departments WHERE id = ?')
    .get(student.department_id).name,
});

const clean = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();

function getStudents(studentId) {
  const queries = DEPARTMENT_IDS.map(
    (departmentId) =>
      'SELECT * FROM ' +
      studentTable(departmentId) +
      ' WHERE student_id = ?'
  );
  const query = db.prepare(queries.join(' UNION ALL '));
  const value = String(studentId || '').trim();
  return query.all(...DEPARTMENT_IDS.map(() => value));
}

function isLocked(student) {
  return student.locked_until && new Date(student.locked_until) > new Date();
}

function checkPin(student, pin) {
  if (!student.pin_hash) return false;
  return bcrypt.compareSync(String(pin || ''), student.pin_hash);
}

function recordFailure(student) {
  const attempts = student.failed_attempts + 1;
  if (attempts >= MAX_ATTEMPTS) {
    const until = new Date(Date.now() + LOCK_MINUTES * 60000).toISOString();
    db.prepare(
      'UPDATE ' +
        studentTable(student.department_id) +
        ' SET failed_attempts = 0, locked_until = ? WHERE id = ?'
    ).run(until, student.id);
    return { locked: true, attemptsLeft: 0 };
  }
  db.prepare(
    'UPDATE ' +
      studentTable(student.department_id) +
      ' SET failed_attempts = ? WHERE id = ?'
  ).run(attempts, student.id);
  return { locked: false, attemptsLeft: MAX_ATTEMPTS - attempts };
}

function clearFailures(student) {
  db.prepare(
    'UPDATE ' +
      studentTable(student.department_id) +
      ' SET failed_attempts = 0, locked_until = NULL WHERE id = ?'
  ).run(student.id);
}

function findMatchingStudent(students, fullName, pin) {
  const nameMatches = students.filter(
    (student) => clean(fullName) === clean(student.full_name)
  );
  if (nameMatches.length === 0) {
    const failures = students.map(recordFailure);
    return {
      attemptsLeft: failures.length
        ? Math.min(...failures.map((failure) => failure.attemptsLeft))
        : MAX_ATTEMPTS,
      locked: failures.some((failure) => failure.locked),
    };
  }

  const pinMatches = nameMatches.filter((student) => checkPin(student, pin));
  const departmentMatches = pinMatches.filter(
    (student) => student.department_id !== 'LEGACY'
  );
  const preferredMatches = departmentMatches.length
    ? departmentMatches
    : pinMatches;
  if (preferredMatches.length === 1) return { student: preferredMatches[0] };
  if (preferredMatches.length > 1) return { ambiguous: true };

  const failures = nameMatches.map(recordFailure);
  return {
    attemptsLeft: Math.min(...failures.map((failure) => failure.attemptsLeft)),
    locked: failures.some((failure) => failure.locked),
  };
}

const lockedMessage = {
  error: `Too many wrong attempts. Try again in ${LOCK_MINUTES} minutes, or ask the election admin to unlock your account.`,
};

// Register: student ID, full name, and PIN must all match the approved list
router.post('/register', (req, res) => {
  if (req.body?.consent !== true) {
    return res
      .status(400)
      .json({ error: 'Please agree to the privacy notice to register.' });
  }

  const { studentId, fullName, pin } = req.body;
  const mismatch = { error: 'The details do not match the voter list.' };
  const students = getStudents(studentId);
  if (!students.length) return res.status(400).json(mismatch);
  const match = findMatchingStudent(students, fullName, pin);
  if (match.ambiguous) {
    return res.status(409).json({
      error: 'Your details match more than one department list. Contact an election admin.',
    });
  }
  if (match.locked) return res.status(429).json(lockedMessage);
  const student = match.student;
  if (!student) {
    return res.status(400).json({
      ...mismatch,
      attemptsLeft: match.attemptsLeft,
    });
  }
  if (isLocked(student)) return res.status(429).json(lockedMessage);
  if (getSetting(student.department_id, 'voter_list_status') !== 'locked') {
    return res.status(403).json({ error: 'Registration is not open yet.' });
  }

  if (student.registered) {
    return res
      .status(409)
      .json({ error: 'This student ID is already registered.' });
  }

  db.prepare(
    "UPDATE " +
      studentTable(student.department_id) +
      " SET registered = 1, consent_at = datetime('now') WHERE id = ?"
  ).run(student.id);
  clearFailures(student);
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, {
    id: student.id,
    departmentId: student.department_id,
  });
  res.json({
    ok: true,
    token,
    student: studentSummary(student),
    message: 'Account created.',
  });
});

// Login: student ID, full name, and PIN
router.post('/login', (req, res) => {
  const { studentId, fullName, pin } = req.body;
  const bad = { error: 'The details do not match the voter list.' };

  const students = getStudents(studentId);
  if (!students.length) return res.status(401).json(bad);
  const match = findMatchingStudent(students, fullName, pin);
  if (match.ambiguous) {
    return res.status(409).json({
      error: 'Your details match more than one department list. Contact an election admin.',
    });
  }
  if (match.locked) return res.status(429).json(lockedMessage);
  const student = match.student;
  if (!student) {
    return res.status(401).json({
      ...bad,
      attemptsLeft: match.attemptsLeft,
    });
  }
  if (!student.registered) {
    return res.status(401).json({
      error: "You haven't created an account yet. Please create your account first.",
    });
  }
  if (isLocked(student)) return res.status(429).json(lockedMessage);

  clearFailures(student);
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, {
    id: student.id,
    departmentId: student.department_id,
  });
  res.json({
    ok: true,
    token,
    student: studentSummary(student),
  });
});

router.get('/results/eligible', (req, res) => {
  const studentId = String(req.query.studentId || '').trim();
  if (!studentId) {
    return res.json({ eligible: false });
  }

  const queries = DEPARTMENT_IDS.map(
    (departmentId) =>
      'SELECT 1 FROM ' +
      studentTable(departmentId) +
      ' WHERE student_id = ? AND registered = 1'
  );
  const query = db.prepare(queries.join(' UNION ALL '));
  const eligible = query.get(...DEPARTMENT_IDS.map(() => studentId));
  return res.json({ eligible: !!eligible });
});

// Logout: ends the session
router.post('/logout', (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  sessions.delete(token);
  res.json({ ok: true });
});

module.exports = { router, sessions };