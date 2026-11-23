const express = require('express');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const db = require('../../config/db');
const requireAdmin = require('../../middleware/requireAdmin');
const requireDepartment = require('../../middleware/requireDepartment');
const { getSetting, setSetting } = require('../../services/departments');
const { logChange } = require('../../services/changeLog');
const { parseLine, readPhotos } = require('../../services/ocr');
const { encryptPin, decryptPin } = require('../../services/pinCrypto');
const { studentTable } = require('../../services/departmentTables');

const router = express.Router();
router.use(requireAdmin, requireDepartment);

const uploadRoot = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'uploads',
  'voter-list'
);
fs.mkdirSync(uploadRoot, { recursive: true });

function getUploadDir(departmentId) {
  if (departmentId === 'LEGACY') return uploadRoot;
  const dir = path.join(uploadRoot, departmentId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, getUploadDir(req.departmentId)),
    filename: (req, file, cb) =>
      cb(
        null,
        Date.now() +
          '-' +
          Math.round(Math.random() * 1e6) +
          path.extname(file.originalname).toLowerCase()
      ),
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 10 },
  fileFilter: (req, file, cb) =>
    cb(null, ['image/jpeg', 'image/png'].includes(file.mimetype)),
}).array('photos', 10);

const PIN_RE = /^\d{4}$/;
const revealFailures = new Map();

function passwordOk(req, res) {
  const record = revealFailures.get(req.admin) || { count: 0, lockedUntil: 0 };
  if (record.lockedUntil > Date.now()) {
    res
      .status(429)
      .json({ error: 'Too many wrong passwords. Try again in 15 minutes.' });
    return false;
  }

  const admin = db
    .prepare('SELECT password_hash FROM admins WHERE username = ?')
    .get(req.admin);
  const ok =
    admin &&
    bcrypt.compareSync(String(req.body?.password || ''), admin.password_hash);
  if (!ok) {
    record.count += 1;
    if (record.count >= 5) {
      record.count = 0;
      record.lockedUntil = Date.now() + 15 * 60 * 1000;
    }
    revealFailures.set(req.admin, record);
    res.status(401).json({ error: 'Wrong admin password.' });
    return false;
  }

  revealFailures.delete(req.admin);
  return true;
}

function deletePhotos(departmentId) {
  const dir = getUploadDir(departmentId);
  for (const name of fs.readdirSync(dir)) {
    fs.unlinkSync(path.join(dir, name));
  }
}

function readBody(body) {
  const b = body || {};
  return {
    studentId: String(b.studentId || '').trim(),
    fullName: String(b.fullName || '').trim().replace(/\s+/g, ' '),
    course: String(b.course || '').trim().toUpperCase(),
    yearSection: String(b.yearSection || '').trim().toUpperCase(),
    pin: String(b.pin || '').trim(),
  };
}

function validate(f, pinRequired) {
  if (!/^\d{5}$/.test(f.studentId)) {
    return 'Enter a valid 5-digit student ID.';
  }
  if (!f.fullName) return 'Enter the full name.';
  if ((pinRequired || f.pin) && !PIN_RE.test(f.pin)) {
    return 'The PIN must be exactly 4 digits.';
  }
  return null;
}

function duplicateError(err, res) {
  if (String(err.code).startsWith('SQLITE_CONSTRAINT')) {
    return res
      .status(409)
      .json({ error: 'That student ID is already in the list.' });
  }
  throw err;
}

function buildRows(departmentId, status) {
  const table = studentTable(departmentId);
  const students = db
    .prepare(
      'SELECT * FROM ' + table + ' ORDER BY student_id'
    )
    .all();
  const nameCounts = new Map();
  for (const s of students) {
    const key = s.full_name.trim().toLowerCase();
    if (key) nameCounts.set(key, (nameCounts.get(key) || 0) + 1);
  }
  return students.map((s) => {
    const issues = [];
    if (!s.full_name.trim()) issues.push('Missing name');
    if (status === 'draft' && !PIN_RE.test(s.pin || '')) {
      issues.push('PIN must be 4 digits');
    }
    if (!s.course) issues.push('Missing course');
    if (!s.year_section) issues.push('Missing year or section');
    if (nameCounts.get(s.full_name.trim().toLowerCase()) > 1) {
      issues.push('Possible duplicate name');
    }
    if (s.needs_review) issues.push('Check against the photo');
    return {
      id: s.id,
      studentId: s.student_id,
      fullName: s.full_name,
      course: s.course || '',
      yearSection: s.year_section || '',
      pin: status === 'draft' ? s.pin || '' : null,
      hasPin: !!(s.pin || s.pin_hash),
      canReveal: !!s.pin_enc,
      lockedUntil:
        s.locked_until && new Date(s.locked_until) > new Date()
          ? s.locked_until
          : null,
      needsReview: !!s.needs_review,
      issues,
    };
  });
}

router.get('/voter-list', (req, res) => {
  const departmentId = req.departmentId;
  const status = getSetting(departmentId, 'voter_list_status');
  res.json({
    departmentId,
    department: db
      .prepare('SELECT name FROM departments WHERE id = ?')
      .get(departmentId).name,
    status,
    electionMode: getSetting(departmentId, 'election_mode'),
    pollStatus: getSetting(departmentId, 'poll_status'),
    rows: buildRows(departmentId, status),
    deletedAt:
      db
        .prepare('SELECT value FROM settings WHERE key = ?')
        .get(
          departmentId === 'LEGACY'
            ? 'voter_data_deleted'
            : departmentId + ':voter_data_deleted'
        )?.value || null,
  });
});

// Upload photos, read them with OCR, and add the rows to the draft list
router.post('/voter-list/upload', (req, res) => {
  const departmentId = req.departmentId;
  if (getSetting(departmentId, 'voter_list_status') !== 'draft') {
    return res
      .status(400)
      .json({ error: 'Photos can only be uploaded while the list is a draft.' });
  }

  upload(req, res, async (err) => {
    if (err) {
      return res.status(400).json({
        error:
          err.code === 'LIMIT_FILE_SIZE'
            ? 'Each photo must be 10 MB or smaller.'
            : 'Upload failed: ' + err.message,
      });
    }
    const files = req.files || [];
    if (files.length === 0) {
      return res
        .status(400)
        .json({ error: 'Choose at least one JPG or PNG photo.' });
    }

    try {
      const pages = await readPhotos(files.map((f) => f.path));

      const table = studentTable(departmentId);
      const insert = db.prepare(
        'INSERT INTO ' +
          table +
          ' (student_id, full_name, department_id, course, year_section, pin, needs_review) VALUES (?, ?, ?, ?, ?, ?, ?)'
      );
      const exists = db.prepare(
        'SELECT 1 FROM ' + table + ' WHERE student_id = ?'
      );
      let added = 0;
      const skipped = [];
      const unreadable = [];

      for (const page of pages) {
        const lowQuality = page.confidence < 70;
        for (const line of page.text.split(/\r?\n/)) {
          const clean = line.trim();
          if (!clean) continue;
          const row = parseLine(clean);
          if (!row) {
            if (/[A-Za-z]/.test(clean) && clean.length >= 5) {
              unreadable.push(clean);
            }
            continue;
          }
          if (exists.get(row.studentId)) {
            skipped.push(row.studentId + ' (already in the list)');
            continue;
          }
          insert.run(
            row.studentId,
            row.fullName,
            departmentId,
            row.course,
            row.yearSection,
            row.pin,
            row.needsReview || lowQuality ? 1 : 0
          );
          added += 1;
        }
      }

      logChange(
        req.admin,
        'voter_list',
        null,
        'upload',
        null,
        added + ' rows from ' + files.length + ' photo(s)',
        departmentId
      );
      res.json({
        added,
        skipped,
        unreadable,
        lowQuality: pages.some((p) => p.confidence < 70),
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({
        error: 'Could not read the photos. Try a clearer, larger photo.',
      });
    }
  });
});

router.post('/voter-list/students', (req, res) => {
  const departmentId = req.departmentId;
  const status = getSetting(departmentId, 'voter_list_status');
  if (status === 'locked') {
    return res.status(403).json({ error: 'The list is locked.' });
  }
  const f = readBody(req.body);
  const problem = validate(f, true);
  if (problem) return res.status(400).json({ error: problem });

  const draft = status === 'draft';
  try {
    db.prepare(
      'INSERT INTO ' +
        studentTable(departmentId) +
        ' (student_id, full_name, department_id, course, year_section, pin, pin_hash, pin_enc) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      f.studentId,
      f.fullName,
      departmentId,
      f.course,
      f.yearSection,
      draft ? f.pin : null,
      draft ? null : bcrypt.hashSync(f.pin, 8),
      draft ? null : encryptPin(f.pin)
    );
  } catch (err) {
    return duplicateError(err, res);
  }
  logChange(req.admin, 'voter_list', f.studentId, 'add', null, f.fullName, departmentId);
  res.json({ ok: true });
});

router.put('/voter-list/students/:id', (req, res) => {
  const departmentId = req.departmentId;
  const status = getSetting(departmentId, 'voter_list_status');
  if (status === 'locked') {
    return res.status(403).json({ error: 'The list is locked.' });
  }
  const s = db
    .prepare(
      'SELECT * FROM ' + studentTable(departmentId) + ' WHERE id = ?'
    )
    .get(Number(req.params.id));
  if (!s) return res.status(404).json({ error: 'Student not found.' });

  const f = readBody(req.body);
  const problem = validate(f, status === 'draft');
  if (problem) return res.status(400).json({ error: problem });

  const changes = [];
  const compare = (label, a, b) => {
    if ((a || '') !== (b || '')) {
      changes.push(label + ': ' + (a || '-') + ' -> ' + (b || '-'));
    }
  };
  compare('ID', s.student_id, f.studentId);
  compare('name', s.full_name, f.fullName);
  compare('course', s.course, f.course);
  compare('section', s.year_section, f.yearSection);

  let pin = s.pin;
  let pinHash = s.pin_hash;
  let pinEnc = s.pin_enc;
  if (status === 'draft') {
    if (f.pin !== s.pin) changes.push('PIN changed');
    pin = f.pin;
  } else if (f.pin) {
    pin = null;
    pinHash = bcrypt.hashSync(f.pin, 8);
    pinEnc = encryptPin(f.pin);
    changes.push('PIN changed');
  }

  try {
    db.prepare(
      'UPDATE ' +
        studentTable(departmentId) +
        ' SET student_id = ?, full_name = ?, course = ?, year_section = ?, pin = ?, pin_hash = ?, pin_enc = ?, needs_review = 0 WHERE id = ?'
    ).run(
      f.studentId,
      f.fullName,
      f.course,
      f.yearSection,
      pin,
      pinHash,
      pinEnc,
      s.id
    );
  } catch (err) {
    return duplicateError(err, res);
  }

  // PIN values are never written to the change log
  if (changes.length) {
    logChange(req.admin, 'voter_list', s.student_id, 'edit', null, changes.join('; '), departmentId);
  } else if (s.needs_review) {
    logChange(req.admin, 'voter_list', s.student_id, 'reviewed', null, null, departmentId);
  }
  res.json({ ok: true });
});

router.put('/voter-list/students/:id/correct-name', (req, res) => {
  const departmentId = req.departmentId;
  if (getSetting(departmentId, 'voter_list_status') !== 'locked') {
    return res
      .status(409)
      .json({ error: 'Name corrections are only available after the list is locked.' });
  }

  const student = db
    .prepare(
      'SELECT id, student_id, full_name FROM ' +
        studentTable(departmentId) +
        ' WHERE id = ?'
    )
    .get(Number(req.params.id));
  if (!student) return res.status(404).json({ error: 'Student not found.' });

  const fullName = String((req.body || {}).fullName || '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!fullName) {
    return res.status(400).json({ error: 'Enter the corrected full name.' });
  }
  if (fullName === student.full_name) {
    return res.json({ ok: true, changed: false });
  }

  db.prepare(
    'UPDATE ' + studentTable(departmentId) + ' SET full_name = ? WHERE id = ?'
  ).run(
    fullName,
    student.id
  );
  logChange(
    req.admin,
    'voter_list',
    student.student_id,
    'correct-name',
    student.full_name,
    fullName,
    departmentId
  );
  res.json({ ok: true, changed: true });
});

router.delete('/voter-list/students/:id', (req, res) => {
  const departmentId = req.departmentId;
  if (getSetting(departmentId, 'voter_list_status') === 'locked') {
    return res.status(403).json({ error: 'The list is locked.' });
  }
  const s = db
    .prepare(
      'SELECT * FROM ' + studentTable(departmentId) + ' WHERE id = ?'
    )
    .get(Number(req.params.id));
  if (!s) return res.status(404).json({ error: 'Student not found.' });
  db.prepare(
    'DELETE FROM ' + studentTable(departmentId) + ' WHERE id = ?'
  ).run(s.id);
  logChange(req.admin, 'voter_list', s.student_id, 'delete', s.full_name, null, departmentId);
  res.json({ ok: true });
});

// Approve: PINs are hashed and the plain copies are removed
router.post('/voter-list/approve', async (req, res) => {
  const departmentId = req.departmentId;
  if (getSetting(departmentId, 'voter_list_status') !== 'draft') {
    return res.status(409).json({ error: 'The list is not a draft.' });
  }
  const rows = buildRows(departmentId, 'draft');
  if (rows.length === 0) {
    return res.status(400).json({ error: 'The list is empty.' });
  }
  const blocking = rows.filter((r) =>
    r.issues.some((i) => i === 'Missing name' || i === 'PIN must be 4 digits')
  );
  if (blocking.length) {
    return res.status(400).json({
      error:
        blocking.length +
        ' row(s) have a missing name or an invalid PIN. Fix the highlighted rows first.',
    });
  }

  const students = db
    .prepare('SELECT id, pin FROM ' + studentTable(departmentId))
    .all();
  const hashes = [];
  for (const s of students) {
    hashes.push([await bcrypt.hash(s.pin, 8), encryptPin(s.pin), s.id]);
  }

  db.transaction(() => {
    const update = db.prepare(
      'UPDATE ' +
        studentTable(departmentId) +
        ' SET pin_hash = ?, pin_enc = ?, pin = NULL, needs_review = 0 WHERE id = ?'
    );
    for (const [hash, enc, id] of hashes) update.run(hash, enc, id);
    setSetting(departmentId, 'voter_list_status', 'posted');
  })();

  logChange(
    req.admin,
    'voter_list',
    null,
    'approve',
    'draft',
    'posted (' + students.length + ' students)',
    departmentId
  );
  res.json({ ok: true });
});

// Lock: registration opens and the photos are deleted
router.post('/voter-list/lock', (req, res) => {
  const departmentId = req.departmentId;
  if (getSetting(departmentId, 'voter_list_status') !== 'posted') {
    return res
      .status(409)
      .json({ error: 'Approve the list before locking it.' });
  }
  if (req.body?.confirm !== 'LOCK') {
    return res.status(400).json({ error: 'Type LOCK to confirm.' });
  }
  setSetting(departmentId, 'voter_list_status', 'locked');
  deletePhotos(departmentId);
  logChange(req.admin, 'voter_list', null, 'lock', 'posted', 'locked', departmentId);
  res.json({ ok: true });
});

// Test mode only: start over with an empty list
router.post('/voter-list/clear', (req, res) => {
  const departmentId = req.departmentId;
  if (getSetting(departmentId, 'election_mode') !== 'test') {
    return res
      .status(403)
      .json({ error: 'The list cannot be cleared in live mode.' });
  }
  if (getSetting(departmentId, 'poll_status') === 'open') {
    return res.status(400).json({ error: 'Close the polls first.' });
  }
  if (req.body?.confirm !== 'CLEAR') {
    return res.status(400).json({ error: 'Type CLEAR to confirm.' });
  }
  const count = db
    .prepare('SELECT COUNT(*) AS n FROM ' + studentTable(departmentId))
    .get().n;
  db.transaction(() => {
    db.prepare(
      'DELETE FROM votes WHERE position_id IN (SELECT id FROM positions WHERE department_id = ?)'
    ).run(departmentId);
    db.prepare(
      'DELETE FROM voters_voted WHERE department_id = ?'
    ).run(departmentId);
    db.prepare('DELETE FROM ' + studentTable(departmentId)).run();
    setSetting(departmentId, 'voter_list_status', 'draft');
    setSetting(departmentId, 'poll_status', 'not_started');
    db.prepare(
      'DELETE FROM settings WHERE key IN (?, ?)'
    ).run(
      departmentId === 'LEGACY'
        ? 'voter_data_deleted'
        : departmentId + ':voter_data_deleted',
      departmentId === 'LEGACY'
        ? 'final_turnout'
        : departmentId + ':final_turnout'
    );
  })();
  deletePhotos(departmentId);
  logChange(req.admin, 'voter_list', null, 'clear', count + ' students', '0', departmentId);
  res.json({ ok: true });
});
// Show one student's PIN. Needs the admin password again and is written to the change log.
router.post('/voter-list/students/:id/reveal-pin', (req, res) => {
  const departmentId = req.departmentId;
  if (!passwordOk(req, res)) return;

  const s = db
    .prepare(
      'SELECT * FROM ' + studentTable(departmentId) + ' WHERE id = ?'
    )
    .get(Number(req.params.id));
  if (!s) return res.status(404).json({ error: 'Student not found.' });
  if (!s.pin_enc) {
    return res.status(400).json({
      error:
        'This PIN was saved before PIN recovery was added, so it cannot be shown. Ask the adviser, or clear and re-upload the list in test mode.',
    });
  }

  let pin;
  try {
    pin = decryptPin(s.pin_enc);
  } catch {
    return res.status(500).json({
      error: 'Could not decrypt the PIN. Check that PIN_KEY has not changed.',
    });
  }

  // The PIN itself is never written to the log
  logChange(req.admin, 'voter_list', s.student_id, 'reveal-pin', null, null, departmentId);
  res.json({ pin, studentId: s.student_id, fullName: s.full_name });
});

// Unlock a student who is locked out after too many wrong PIN attempts
router.post('/voter-list/students/:id/unlock', (req, res) => {
  const departmentId = req.departmentId;
  const s = db
    .prepare(
      'SELECT * FROM ' + studentTable(departmentId) + ' WHERE id = ?'
    )
    .get(Number(req.params.id));
  if (!s) return res.status(404).json({ error: 'Student not found.' });

  db.prepare(
    'UPDATE ' +
      studentTable(departmentId) +
      ' SET failed_attempts = 0, locked_until = NULL WHERE id = ?'
  ).run(s.id);
  logChange(req.admin, 'voter_list', s.student_id, 'unlock', null, null, departmentId);
  res.json({ ok: true });
});

// Delete voter data after the election while preserving vote totals and turnout.
router.post('/voter-list/delete-data', (req, res) => {
  const departmentId = req.departmentId;
  if (getSetting(departmentId, 'poll_status') !== 'closed') {
    return res.status(400).json({
      error: 'Close the polls first. Voter data can only be deleted after the election.',
    });
  }
  const done = db
    .prepare('SELECT value FROM settings WHERE key = ?')
    .get(
      departmentId === 'LEGACY'
        ? 'voter_data_deleted'
        : departmentId + ':voter_data_deleted'
    );
  if (done) {
    return res.status(409).json({ error: 'The voter data was already deleted.' });
  }
  if (req.body?.confirm !== 'DELETE VOTERS') {
    return res.status(400).json({ error: 'Type DELETE VOTERS to confirm.' });
  }
  if (!passwordOk(req, res)) return;

  const voted = db
    .prepare('SELECT COUNT(*) AS n FROM voters_voted WHERE department_id = ?')
    .get(departmentId).n;
  const eligible = db
    .prepare('SELECT COUNT(*) AS n FROM ' + studentTable(departmentId))
    .get().n;

  db.transaction(() => {
    db.prepare(
      'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)'
    ).run(
      departmentId === 'LEGACY' ? 'final_turnout' : departmentId + ':final_turnout',
      JSON.stringify({ voted, eligible })
    );
    db.prepare(
      'DELETE FROM voters_voted WHERE department_id = ?'
    ).run(departmentId);
    db.prepare('DELETE FROM ' + studentTable(departmentId)).run();
    db.prepare(
      'INSERT OR REPLACE INTO settings (key, value) VALUES (?, datetime(\'now\'))'
    ).run(
      departmentId === 'LEGACY'
        ? 'voter_data_deleted'
        : departmentId + ':voter_data_deleted'
    );
  })();
  deletePhotos(departmentId);

  logChange(
    req.admin,
    'voter_list',
    null,
    'delete-data',
    eligible + ' students, ' + voted + ' voted',
    'deleted',
    departmentId
  );
  res.json({ ok: true });
});

module.exports = router;