const express = require('express');
const db = require('../../config/db');
const requireAdmin = require('../../middleware/requireAdmin');
const requireDepartment = require('../../middleware/requireDepartment');
const { getSetting, setSetting } = require('../../services/departments');
const { logChange } = require('../../services/changeLog');
const {
  candidateTable,
  studentTable,
} = require('../../services/departmentTables');

const router = express.Router();
router.use(requireAdmin, requireDepartment);

const count = (sql, ...params) => db.prepare(sql).get(...params).n;

// Deletes every vote and every "has voted" record, then stops the polls
const clearVotes = db.transaction((departmentId) => {
  db.prepare(
    'DELETE FROM votes WHERE position_id IN (SELECT id FROM positions WHERE department_id = ?)'
  ).run(departmentId);
  db.prepare(
    'DELETE FROM voters_voted WHERE department_id = ?'
  ).run(departmentId);
  setSetting(departmentId, 'poll_status', 'not_started');
});

router.get('/dashboard', (req, res) => {
  const departmentId = req.departmentId;
  res.json({
    departmentId,
    admin: req.admin,
    department:
      db.prepare('SELECT name FROM departments WHERE id = ?').get(departmentId).name,
    pollStatus: getSetting(departmentId, 'poll_status'),
    electionMode: getSetting(departmentId, 'election_mode'),
    voterListStatus: getSetting(departmentId, 'voter_list_status'),
    candidateListStatus: getSetting(departmentId, 'candidate_list_status'),
    students: count(
      'SELECT COUNT(*) AS n FROM ' + studentTable(departmentId)
    ),
    registered: count(
      'SELECT COUNT(*) AS n FROM ' +
        studentTable(departmentId) +
        ' WHERE registered = 1'
    ),
    lockedOut: db
      .prepare(
        'SELECT COUNT(*) AS n FROM ' +
          studentTable(departmentId) +
          ' WHERE locked_until > ?'
      )
      .get(new Date().toISOString()).n,
    voted: count(
      'SELECT COUNT(*) AS n FROM voters_voted WHERE department_id = ?',
      departmentId
    ),
    positions: count(
      'SELECT COUNT(*) AS n FROM positions WHERE department_id = ?',
      departmentId
    ),
    candidates: count(
      'SELECT COUNT(*) AS n FROM ' + candidateTable(departmentId)
    ),
  });
});

router.post('/polls/open', (req, res) => {
  const departmentId = req.departmentId;
  const status = getSetting(departmentId, 'poll_status');
  if (status === 'open') {
    return res.status(409).json({ error: 'Polls are already open.' });
  }
  if (status === 'closed' && getSetting(departmentId, 'election_mode') === 'live') {
    return res.status(409).json({
      error: 'In live mode, polls that have been closed cannot be reopened.',
    });
  }
  if (
    getSetting(departmentId, 'voter_list_status') !== 'locked' ||
    getSetting(departmentId, 'candidate_list_status') !== 'locked'
  ) {
    return res.status(400).json({
      error: 'The voter list and candidate list must be approved and locked first.',
    });
  }
  if (
    count(
      'SELECT COUNT(*) AS n FROM ' + candidateTable(departmentId)
    ) === 0
  ) {
    return res.status(400).json({ error: 'Add candidates before opening the polls.' });
  }
  setSetting(departmentId, 'poll_status', 'open');
  logChange(req.admin, 'polls', null, 'open', status, 'open', departmentId);
  res.json({ ok: true });
});

router.post('/polls/close', (req, res) => {
  const departmentId = req.departmentId;
  const status = getSetting(departmentId, 'poll_status');
  if (status !== 'open') {
    return res.status(409).json({ error: 'Polls are not open.' });
  }
  setSetting(departmentId, 'poll_status', 'closed');
  logChange(req.admin, 'polls', null, 'close', status, 'closed', departmentId);
  res.json({ ok: true });
});

// Test mode only: wipes the test votes so you can try again
router.post('/polls/reset', (req, res) => {
  const departmentId = req.departmentId;
  if (getSetting(departmentId, 'election_mode') !== 'test') {
    return res
      .status(403)
      .json({ error: 'Votes cannot be reset in live mode.' });
  }
  if (getSetting(departmentId, 'poll_status') === 'open') {
    return res.status(400).json({ error: 'Close the polls first.' });
  }
  if (req.body.confirm !== 'RESET') {
    return res.status(400).json({ error: 'Type RESET to confirm.' });
  }
  const before = count(
    'SELECT COUNT(*) AS n FROM voters_voted WHERE department_id = ?',
    departmentId
  );
  clearVotes(departmentId);
  logChange(req.admin, 'votes', null, 'reset', before + ' voters', '0 voters', departmentId);
  res.json({ ok: true });
});

// One-way switch from test mode to live mode. Starts the real election with zero votes.
router.post('/polls/go-live', (req, res) => {
  const departmentId = req.departmentId;
  if (getSetting(departmentId, 'election_mode') === 'live') {
    return res.status(409).json({ error: 'The system is already in live mode.' });
  }
  if (getSetting(departmentId, 'poll_status') === 'open') {
    return res.status(400).json({ error: 'Close the polls first.' });
  }
  if (req.body.confirm !== 'GO LIVE') {
    return res.status(400).json({ error: 'Type GO LIVE to confirm.' });
  }
  const before = count(
    'SELECT COUNT(*) AS n FROM voters_voted WHERE department_id = ?',
    departmentId
  );
  clearVotes(departmentId);
  setSetting(departmentId, 'election_mode', 'live');
  logChange(req.admin, 'election', null, 'go-live', 'test', 'live', departmentId);
  logChange(req.admin, 'votes', null, 'reset', before + ' test voters', '0 voters', departmentId);
  res.json({ ok: true });
});

module.exports = router;