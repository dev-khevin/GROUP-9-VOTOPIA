const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../../config/db');
const adminSessions = require('../../services/adminSessions');
const requireAdmin = require('../../middleware/requireAdmin');
const { DEPARTMENTS, normalizeDepartment } = require('../../services/departments');
const { logChange } = require('../../services/changeLog');

const router = express.Router();

const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;
const SESSION_MS = 2 * 60 * 60 * 1000;
const failures = new Map(); // username -> { count, lockedUntil }
const departmentFailures = new Map();
const dummyHash = bcrypt.hashSync('not-a-real-password', 10);

router.post('/login', (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const record = failures.get(username) || { count: 0, lockedUntil: 0 };

  if (record.lockedUntil > Date.now()) {
    return res
      .status(429)
      .json({ error: 'Too many wrong attempts. Try again in 15 minutes.' });
  }

  const admin = db
    .prepare('SELECT * FROM admins WHERE username = ?')
    .get(username);
  const ok = bcrypt.compareSync(
    password,
    admin ? admin.password_hash : dummyHash
  );

  if (!admin || !ok) {
    record.count += 1;
    if (record.count >= MAX_ATTEMPTS) {
      record.count = 0;
      record.lockedUntil = Date.now() + LOCK_MS;
    }
    failures.set(username, record);
    return res.status(401).json({ error: 'Wrong username or password.' });
  }

  failures.delete(username);
  const token = crypto.randomBytes(32).toString('hex');
  adminSessions.set(token, {
    username: admin.username,
    expires: Date.now() + SESSION_MS,
  });
  res.json({ ok: true, token, admin: { username: admin.username } });
});

router.post('/department/access', requireAdmin, (req, res) => {
  const departmentId = normalizeDepartment(req.body.departmentId);
  if (!departmentId || !DEPARTMENTS.includes(departmentId)) {
    return res.status(400).json({ error: 'Choose a valid department.' });
  }

  const username = String(req.body.username || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const key = req.token + ':' + departmentId;
  const record = departmentFailures.get(key) || { count: 0, lockedUntil: 0 };
  if (record.lockedUntil > Date.now()) {
    return res
      .status(429)
      .json({ error: 'Too many wrong attempts. Try again in 15 minutes.' });
  }

  const departmentAdmin = db
    .prepare(
      'SELECT username, password_hash FROM admins WHERE username = ? AND department_id = ?'
    )
    .get(username, departmentId);
  const ok = bcrypt.compareSync(
    password,
    departmentAdmin ? departmentAdmin.password_hash : dummyHash
  );
  if (!departmentAdmin || !ok) {
    record.count += 1;
    if (record.count >= MAX_ATTEMPTS) {
      record.count = 0;
      record.lockedUntil = Date.now() + LOCK_MS;
    }
    departmentFailures.set(key, record);
    return res.status(401).json({ error: 'Wrong department admin username or password.' });
  }

  departmentFailures.delete(key);
  req.adminSession.departmentAccess = {
    departmentId,
    username: departmentAdmin.username,
  };
  logChange(
    departmentAdmin.username,
    'department',
    departmentId,
    'access',
    null,
    'authenticated',
    departmentId
  );
  res.json({ ok: true, departmentId });
});

router.post('/logout', requireAdmin, (req, res) => {
  adminSessions.delete(req.token);
  res.json({ ok: true });
});

router.get('/me', requireAdmin, (req, res) => {
  res.json({ username: req.admin });
});

module.exports = router;