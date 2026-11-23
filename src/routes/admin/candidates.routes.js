const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const db = require('../../config/db');
const requireAdmin = require('../../middleware/requireAdmin');
const requireDepartment = require('../../middleware/requireDepartment');
const { getSetting, setSetting } = require('../../services/departments');
const { logChange } = require('../../services/changeLog');
const { readPhotos } = require('../../services/ocr');
const { parseCandidateLine } = require('../../services/candidateOcr');
const {
  candidateTable,
  studentTable,
} = require('../../services/departmentTables');

const router = express.Router();
router.use(requireAdmin, requireDepartment);

const MAX_BACKGROUND_LENGTH = 2000;

const uploadRoot = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'uploads',
  'candidate-list'
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

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const isLocked = (departmentId) =>
  getSetting(departmentId, 'candidate_list_status') === 'locked';
const lockedReply = (res) =>
  res.status(403).json({ error: 'The candidate list is locked.' });

function deletePhotos(departmentId) {
  const dir = getUploadDir(departmentId);
  for (const name of fs.readdirSync(dir)) {
    fs.unlinkSync(path.join(dir, name));
  }
}
// Candidate profile photos are kept (they show on the ballot), in their own folder
const photoDir = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'uploads',
  'candidate-photos'
);
fs.mkdirSync(photoDir, { recursive: true });

const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
}).single('photo');

// Check the real file type from its first bytes, not from the file name
function photoType(buf) {
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'jpg';
  }
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buf.length > 8 && buf.subarray(0, 8).equals(png)) return 'png';
  return null;
}

function removePhotoFile(name) {
  if (!name) return;
  const file = path.join(photoDir, path.basename(name));
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

function uniqueError(err, res, message) {
  if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return res.status(409).json({ error: message });
  }
  throw err;
}

function insertCandidate(departmentId, candidate) {
  return db.transaction(() => {
    const info = db
      .prepare(
        'INSERT INTO candidate_records (department_id, student_id) VALUES (?, ?)'
      )
      .run(departmentId, candidate.studentId);
    const id = Number(info.lastInsertRowid);
    db.prepare(
      'INSERT INTO ' +
        candidateTable(departmentId) +
        ' (id, student_id, full_name, department_id, course, year_section, partylist, background, position_id, needs_review) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      id,
      candidate.studentId,
      candidate.fullName,
      departmentId,
      candidate.course,
      candidate.yearSection,
      candidate.partylist || null,
      candidate.background || '',
      candidate.positionId,
      candidate.needsReview || 0
    );
    return id;
  })();
}

function listPositions(departmentId) {
  const table = candidateTable(departmentId);
  return db
    .prepare(
      `SELECT p.id, p.name, p.votes_allowed AS votesAllowed,
              p.sort_order AS sortOrder, COUNT(c.id) AS candidateCount
       FROM positions p
       LEFT JOIN ${table} c ON c.position_id = p.id
       WHERE p.department_id = ?
       GROUP BY p.id
       ORDER BY p.sort_order, p.id`
    )
    .all(departmentId);
}

function buildCandidates(departmentId) {
  const table = candidateTable(departmentId);
  const rows = db
    .prepare(
      `SELECT c.*, p.name AS position_name
       FROM ${table} c
       JOIN positions p ON p.id = c.position_id
       WHERE c.department_id = ?
       ORDER BY p.sort_order, p.id, c.full_name`
    )
    .all(departmentId);
  return rows.map((c) => {
    const issues = [];
    if (!c.course) issues.push('Missing course');
    if (!c.year_section) issues.push('Missing year or section');
    if (!c.background || !c.background.trim()) issues.push('Missing background');
    if (c.needs_review) issues.push('Check against the photo');
    return {
      id: c.id,
      studentId: c.student_id,
      fullName: c.full_name,
      course: c.course || '',
      yearSection: c.year_section || '',
      partylist: c.partylist || '',
      background: c.background || '',
      photoUrl: c.photo ? '/api/photos/' + c.photo : null,
      positionId: c.position_id,
      positionName: c.position_name,
      needsReview: !!c.needs_review,
      issues,
    };
  });
}

router.get('/candidate-list', (req, res) => {
  const departmentId = req.departmentId;
  res.json({
    departmentId,
    department: db
      .prepare('SELECT name FROM departments WHERE id = ?')
      .get(departmentId).name,
    status: getSetting(departmentId, 'candidate_list_status'),
    voterListStatus: getSetting(departmentId, 'voter_list_status'),
    electionMode: getSetting(departmentId, 'election_mode'),
    pollStatus: getSetting(departmentId, 'poll_status'),
    positions: listPositions(departmentId),
    candidates: buildCandidates(departmentId),
  });
});

/* ---------- Positions ---------- */

function readPosition(body) {
  const b = body || {};
  return {
    name: String(b.name || '').trim().replace(/\s+/g, ' '),
    votesAllowed: Number(b.votesAllowed),
    sortOrder:
      b.sortOrder === '' || b.sortOrder === undefined || b.sortOrder === null
        ? null
        : Number(b.sortOrder),
  };
}

function validatePosition(f) {
  if (!f.name || f.name.length > 60) return 'Enter a position name (up to 60 characters).';
  if (!Number.isInteger(f.votesAllowed) || f.votesAllowed < 1 || f.votesAllowed > 20) {
    return 'Votes allowed must be a whole number from 1 to 20.';
  }
  if (f.sortOrder !== null && !Number.isInteger(f.sortOrder)) {
    return 'The order must be a whole number.';
  }
  return null;
}

router.post('/candidate-list/positions', (req, res) => {
  const departmentId = req.departmentId;
  if (isLocked(departmentId)) return lockedReply(res);
  const f = readPosition(req.body);
  const problem = validatePosition(f);
  if (problem) return res.status(400).json({ error: problem });

  const order =
    f.sortOrder !== null
      ? f.sortOrder
      : db
          .prepare(
            'SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM positions WHERE department_id = ?'
          )
          .get(departmentId).n;
  try {
    db.prepare(
      'INSERT INTO positions (department_id, name, votes_allowed, sort_order) VALUES (?, ?, ?, ?)'
    ).run(departmentId, f.name, f.votesAllowed, order);
  } catch (err) {
    return uniqueError(err, res, 'A position with that name already exists.');
  }
  logChange(req.admin, 'position', f.name, 'add', null, 'votes allowed: ' + f.votesAllowed, departmentId);
  res.json({ ok: true });
});

router.put('/candidate-list/positions/:id', (req, res) => {
  const departmentId = req.departmentId;
  if (isLocked(departmentId)) return lockedReply(res);
  const p = db
    .prepare('SELECT * FROM positions WHERE id = ? AND department_id = ?')
    .get(Number(req.params.id), departmentId);
  if (!p) return res.status(404).json({ error: 'Position not found.' });

  const f = readPosition(req.body);
  const problem = validatePosition(f);
  if (problem) return res.status(400).json({ error: problem });

  const order = f.sortOrder !== null ? f.sortOrder : p.sort_order;
  const changes = [];
  if (p.name !== f.name) changes.push('name: ' + p.name + ' -> ' + f.name);
  if (p.votes_allowed !== f.votesAllowed) {
    changes.push('votes allowed: ' + p.votes_allowed + ' -> ' + f.votesAllowed);
  }
  if (p.sort_order !== order) changes.push('order: ' + p.sort_order + ' -> ' + order);

  try {
    db.prepare(
      'UPDATE positions SET name = ?, votes_allowed = ?, sort_order = ? WHERE id = ? AND department_id = ?'
    ).run(f.name, f.votesAllowed, order, p.id, departmentId);
  } catch (err) {
    return uniqueError(err, res, 'A position with that name already exists.');
  }
  if (changes.length) {
    logChange(req.admin, 'position', p.name, 'edit', null, changes.join('; '), departmentId);
  }
  res.json({ ok: true });
});

router.delete('/candidate-list/positions/:id', (req, res) => {
  const departmentId = req.departmentId;
  if (isLocked(departmentId)) return lockedReply(res);
  const p = db
    .prepare('SELECT * FROM positions WHERE id = ? AND department_id = ?')
    .get(Number(req.params.id), departmentId);
  if (!p) return res.status(404).json({ error: 'Position not found.' });

  const n = db
    .prepare(
      'SELECT COUNT(*) AS n FROM ' +
        candidateTable(departmentId) +
        ' WHERE position_id = ?'
    )
    .get(p.id).n;
  if (n > 0) {
    return res
      .status(400)
      .json({ error: 'Remove or move this position\'s candidates first.' });
  }
  db.prepare('DELETE FROM positions WHERE id = ? AND department_id = ?').run(
    p.id,
    departmentId
  );
  logChange(req.admin, 'position', p.name, 'delete', p.name, null, departmentId);
  res.json({ ok: true });
});

/* ---------- Candidates ---------- */

function readCandidate(body) {
  const b = body || {};
  return {
    studentId: String(b.studentId || '').trim(),
    fullName: String(b.fullName || '').trim().replace(/\s+/g, ' '),
    course: String(b.course || '').trim().toUpperCase(),
    yearSection: String(b.yearSection || '').trim().toUpperCase(),
    partylist: String(b.partylist || '').trim().replace(/\s+/g, ' '),
    background: String(b.background || '').trim(),
    positionId: Number(b.positionId),
  };
}

function validateCandidate(f, departmentId) {
  if (!/^\d{5}$/.test(f.studentId)) return 'Enter a valid 5-digit student ID.';
  if (!f.fullName) return 'Enter the full name.';
  if (!f.background) return 'Enter the candidate background.';
  if (f.background.length > MAX_BACKGROUND_LENGTH) {
    return 'The background must be 2,000 characters or fewer.';
  }
  if (
    !db
      .prepare('SELECT 1 FROM positions WHERE id = ? AND department_id = ?')
      .get(f.positionId, departmentId)
  ) {
    return 'Choose a position.';
  }
  return null;
}

const DUPLICATE = 'That student is already a candidate.';

router.post('/candidate-list/candidates', (req, res) => {
  const departmentId = req.departmentId;
  if (isLocked(departmentId)) return lockedReply(res);
  const f = readCandidate(req.body);
  const problem = validateCandidate(f, departmentId);
  if (problem) return res.status(400).json({ error: problem });

  let id;
  try {
    id = insertCandidate(departmentId, f);
  } catch (err) {
    return uniqueError(err, res, DUPLICATE);
  }
  logChange(req.admin, 'candidate', f.studentId, 'add', null, f.fullName, departmentId);
  res.json({ ok: true, id });
});

router.put('/candidate-list/candidates/:id', (req, res) => {
  const departmentId = req.departmentId;
  if (isLocked(departmentId)) return lockedReply(res);
  const c = db
    .prepare(
      'SELECT * FROM ' + candidateTable(departmentId) + ' WHERE id = ?'
    )
    .get(Number(req.params.id));
  if (!c) return res.status(404).json({ error: 'Candidate not found.' });

  const f = readCandidate(req.body);
  const problem = validateCandidate(f, departmentId);
  if (problem) return res.status(400).json({ error: problem });

  const changes = [];
  const compare = (label, a, b) => {
    if ((a || '') !== (b || '')) {
      changes.push(label + ': ' + (a || '-') + ' -> ' + (b || '-'));
    }
  };
  compare('ID', c.student_id, f.studentId);
  compare('name', c.full_name, f.fullName);
  compare('course', c.course, f.course);
  compare('section', c.year_section, f.yearSection);
  compare('partylist', c.partylist, f.partylist);
  if ((c.background || '') !== f.background) changes.push('background updated');
  if (c.position_id !== f.positionId) changes.push('position changed');

  try {
    db.transaction(() => {
      db.prepare(
        'UPDATE candidate_records SET student_id = ? WHERE id = ? AND department_id = ?'
      ).run(f.studentId, c.id, departmentId);
      db.prepare(
        'UPDATE ' +
          candidateTable(departmentId) +
          ' SET student_id = ?, full_name = ?, course = ?, year_section = ?, partylist = ?, background = ?, position_id = ?, needs_review = 0 WHERE id = ?'
      ).run(
        f.studentId,
        f.fullName,
        f.course,
        f.yearSection,
        f.partylist || null,
        f.background,
        f.positionId,
        c.id
      );
    })();
  } catch (err) {
    return uniqueError(err, res, DUPLICATE);
  }
  if (changes.length) {
    logChange(req.admin, 'candidate', c.student_id, 'edit', null, changes.join('; '), departmentId);
  } else if (c.needs_review) {
    logChange(req.admin, 'candidate', c.student_id, 'reviewed', null, null, departmentId);
  }
  res.json({ ok: true });
});

router.delete('/candidate-list/candidates/:id', (req, res) => {
  const departmentId = req.departmentId;
  if (isLocked(departmentId)) return lockedReply(res);
  const c = db
    .prepare(
      'SELECT * FROM ' + candidateTable(departmentId) + ' WHERE id = ?'
    )
    .get(Number(req.params.id));
  if (!c) return res.status(404).json({ error: 'Candidate not found.' });
  try {
    db.prepare(
      'DELETE FROM candidate_records WHERE id = ? AND department_id = ?'
    ).run(c.id, departmentId);
  } catch (err) {
    if (String(err.code).startsWith('SQLITE_CONSTRAINT')) {
      return res
        .status(409)
        .json({ error: 'This candidate already has votes and cannot be removed.' });
    }
    throw err;
  }
  removePhotoFile(c.photo);
  logChange(req.admin, 'candidate', c.student_id, 'delete', c.full_name, null, departmentId);
  res.json({ ok: true });
});

/* ---------- Photo upload ---------- */

router.post('/candidate-list/upload', (req, res) => {
  const departmentId = req.departmentId;
  if (getSetting(departmentId, 'candidate_list_status') !== 'draft') {
    return res
      .status(400)
      .json({ error: 'Photos can only be uploaded while the list is a draft.' });
  }
  const positions = db
    .prepare('SELECT id, name FROM positions WHERE department_id = ?')
    .all(departmentId);
  if (positions.length === 0) {
    return res
      .status(400)
      .json({ error: 'Add the positions first, so the reader can recognize them.' });
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
      return res.status(400).json({ error: 'Choose at least one JPG or PNG photo.' });
    }

    try {
      const pages = await readPhotos(files.map((f) => f.path));

      const table = candidateTable(departmentId);
      const exists = db.prepare(
        'SELECT 1 FROM ' + table + ' WHERE student_id = ?'
      );
      let added = 0;
      const skipped = [];
      const unmatched = [];
      const unreadable = [];

      for (const page of pages) {
        const lowQuality = page.confidence < 70;
        for (const line of page.text.split(/\r?\n/)) {
          const clean = line.trim();
          if (!clean) continue;
          const row = parseCandidateLine(clean, positions);
          if (!row) {
            if (/[A-Za-z]/.test(clean) && clean.length >= 5) unreadable.push(clean);
            continue;
          }
          if (row.positionId === null) {
            unmatched.push(clean);
            continue;
          }
          if (exists.get(row.studentId)) {
            skipped.push(row.studentId + ' (already in the list)');
            continue;
          }
          insertCandidate(departmentId, {
            ...row,
            needsReview: row.needsReview || lowQuality ? 1 : 0,
          });
          added += 1;
        }
      }

      logChange(
        req.admin,
        'candidate_list',
        null,
        'upload',
        null,
        added + ' rows from ' + files.length + ' photo(s)',
        departmentId
      );
      res.json({
        added,
        skipped,
        unmatched,
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

/* ---------- Approve, lock, clear ---------- */

router.post('/candidate-list/approve', (req, res) => {
  const departmentId = req.departmentId;
  if (getSetting(departmentId, 'candidate_list_status') !== 'draft') {
    return res.status(409).json({ error: 'The list is not a draft.' });
  }
  if (getSetting(departmentId, 'voter_list_status') === 'draft') {
    return res
      .status(400)
      .json({ error: 'Approve the voter list first, so candidates can be checked against it.' });
  }
  const positions = listPositions(departmentId);
  if (positions.length === 0) {
    return res.status(400).json({ error: 'Add at least one position.' });
  }
  const empty = positions.filter((p) => p.candidateCount === 0);
  if (empty.length) {
    return res.status(400).json({
      error: 'These positions have no candidates: ' + empty.map((p) => p.name).join(', ') + '.',
    });
  }
  const missingBackgrounds = db
    .prepare(
      "SELECT COUNT(*) AS n FROM " +
        candidateTable(departmentId) +
        " WHERE TRIM(COALESCE(background, '')) = ''"
    )
    .get().n;
  if (missingBackgrounds) {
    return res.status(400).json({
      error:
        'Add a background description for every candidate before approving the list.',
    });
  }
  const notOnVoterList = db
    .prepare(
      `SELECT COUNT(*) AS n FROM ${candidateTable(departmentId)} c
       WHERE NOT EXISTS (
           SELECT 1 FROM ${studentTable(departmentId)} s
           WHERE s.student_id = c.student_id
         )`
    )
    .get().n;
  if (notOnVoterList) {
    return res.status(400).json({
      error: notOnVoterList + " candidate(s) are not on this department's voter list.",
    });
  }
  db.prepare(
    'UPDATE ' +
      candidateTable(departmentId) +
      ' SET needs_review = 0'
  ).run();
  setSetting(departmentId, 'candidate_list_status', 'posted');
  const total = db
    .prepare('SELECT COUNT(*) AS n FROM ' + candidateTable(departmentId))
    .get().n;
  logChange(req.admin, 'candidate_list', null, 'approve', 'draft', 'posted (' + total + ' candidates)', departmentId);
  res.json({ ok: true });
});

router.post('/candidate-list/lock', (req, res) => {
  const departmentId = req.departmentId;
  if (getSetting(departmentId, 'candidate_list_status') !== 'posted') {
    return res.status(409).json({ error: 'Approve the list before locking it.' });
  }
  if (req.body?.confirm !== 'LOCK') {
    return res.status(400).json({ error: 'Type LOCK to confirm.' });
  }
  const missingBackgrounds = db
    .prepare(
      "SELECT COUNT(*) AS n FROM " +
        candidateTable(departmentId) +
        " WHERE TRIM(COALESCE(background, '')) = ''"
    )
    .get().n;
  if (missingBackgrounds) {
    return res.status(400).json({
      error:
        'Add a background description for every candidate before locking the list.',
    });
  }
  setSetting(departmentId, 'candidate_list_status', 'locked');
  deletePhotos(departmentId);
  logChange(req.admin, 'candidate_list', null, 'lock', 'posted', 'locked', departmentId);
  res.json({ ok: true });
});

// Test mode only: remove all candidates (positions stay) and any votes
router.post('/candidate-list/clear', (req, res) => {
  const departmentId = req.departmentId;
  if (getSetting(departmentId, 'election_mode') !== 'test') {
    return res
      .status(403)
      .json({ error: 'The candidate list cannot be cleared in live mode.' });
  }
  if (getSetting(departmentId, 'poll_status') === 'open') {
    return res.status(400).json({ error: 'Close the polls first.' });
  }
  if (req.body?.confirm !== 'CLEAR') {
    return res.status(400).json({ error: 'Type CLEAR to confirm.' });
  }
  const count = db
    .prepare('SELECT COUNT(*) AS n FROM ' + candidateTable(departmentId))
    .get().n;
  const photoNames = db
    .prepare(
      'SELECT photo FROM ' +
        candidateTable(departmentId) +
        ' WHERE photo IS NOT NULL'
    )
    .all()
    .map((row) => row.photo);
  db.transaction(() => {
    db.prepare(
      'DELETE FROM votes WHERE position_id IN (SELECT id FROM positions WHERE department_id = ?)'
    ).run(departmentId);
    db.prepare(
      'DELETE FROM voters_voted WHERE department_id = ?'
    ).run(departmentId);
    db.prepare(
      'DELETE FROM candidate_records WHERE department_id = ?'
    ).run(departmentId);
    setSetting(departmentId, 'candidate_list_status', 'draft');
    setSetting(departmentId, 'poll_status', 'not_started');
  })();
  for (const name of photoNames) removePhotoFile(name);
  deletePhotos(departmentId);
  logChange(req.admin, 'candidate_list', null, 'clear', count + ' candidates', '0', departmentId);
  res.json({ ok: true });
});

/* ---------- Candidate profile photos ---------- */

router.post('/candidate-list/candidates/:id/photo', (req, res) => {
  const departmentId = req.departmentId;
  if (isLocked(departmentId)) return lockedReply(res);
  const c = db
    .prepare(
      'SELECT * FROM ' + candidateTable(departmentId) + ' WHERE id = ?'
    )
    .get(Number(req.params.id));
  if (!c) return res.status(404).json({ error: 'Candidate not found.' });

  photoUpload(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        error:
          err.code === 'LIMIT_FILE_SIZE'
            ? 'The photo must be 2 MB or smaller.'
            : 'Upload failed: ' + err.message,
      });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Choose a JPG or PNG photo.' });
    }
    const ext = photoType(req.file.buffer);
    if (!ext) {
      return res.status(400).json({ error: 'Only JPG and PNG photos are allowed.' });
    }

    const name =
      'c' + c.id + '-' + Date.now() + '-' + Math.round(Math.random() * 1e6) + '.' + ext;
    fs.writeFileSync(path.join(photoDir, name), req.file.buffer);
    db.prepare(
      'UPDATE ' + candidateTable(departmentId) + ' SET photo = ? WHERE id = ?'
    ).run(name, c.id);
    removePhotoFile(c.photo);
    logChange(req.admin, 'candidate', c.student_id, 'photo', null, c.photo ? 'replaced' : 'added', departmentId);
    res.json({ ok: true, photoUrl: '/api/photos/' + name });
  });
});

router.delete('/candidate-list/candidates/:id/photo', (req, res) => {
  const departmentId = req.departmentId;
  if (isLocked(departmentId)) return lockedReply(res);
  const c = db
    .prepare(
      'SELECT * FROM ' + candidateTable(departmentId) + ' WHERE id = ?'
    )
    .get(Number(req.params.id));
  if (!c) return res.status(404).json({ error: 'Candidate not found.' });
  db.prepare(
    'UPDATE ' + candidateTable(departmentId) + ' SET photo = NULL WHERE id = ?'
  ).run(c.id);
  removePhotoFile(c.photo);
  if (c.photo) logChange(req.admin, 'candidate', c.student_id, 'photo', null, 'removed', departmentId);
  res.json({ ok: true });
});

module.exports = router;