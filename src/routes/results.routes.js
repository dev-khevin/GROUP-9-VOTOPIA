const express = require('express');
const db = require('../config/db');
const requireResultsAccess = require('../middleware/requireResultsAccess');
const requireDepartment = require('../middleware/requireDepartment');
const {
  getSetting,
  settingKey,
} = require('../services/departments');
const {
  candidateTable,
  studentTable,
} = require('../services/departmentTables');

const router = express.Router();

// true  = candidate totals are visible while the polls are open
// false = only turnout is visible until the polls close
const SHOW_LIVE_COUNTS = true;

function sendResults(req, res, departmentId) {
  const pollStatus = getSetting(departmentId, 'poll_status');
  let totalVoters = db
    .prepare('SELECT COUNT(*) AS n FROM voters_voted WHERE department_id = ?')
    .get(departmentId).n;
  let eligibleVoters = db
    .prepare('SELECT COUNT(*) AS n FROM ' + studentTable(departmentId))
    .get().n;
  const savedTurnout = db
    .prepare('SELECT value FROM settings WHERE key = ?')
    .get(settingKey(departmentId, 'final_turnout'));
  if (savedTurnout) {
    const turnout = JSON.parse(savedTurnout.value);
    totalVoters = turnout.voted;
    eligibleVoters = turnout.eligible;
  }

  const department = db
    .prepare('SELECT name FROM departments WHERE id = ?')
    .get(departmentId);
  const base = {
    departmentId,
    department: department.name,
    pollStatus,
    totalVoters,
    eligibleVoters,
  };

  if (pollStatus === 'open' && !SHOW_LIVE_COUNTS) {
    return res.json({ ...base, hidden: true, positions: [] });
  }

  const candidateCounts = new Map(
    db
      .prepare(
        `SELECT v.candidate_id AS id, COUNT(*) AS n
         FROM votes v JOIN candidate_records c ON c.id = v.candidate_id
         WHERE c.department_id = ? AND v.candidate_id IS NOT NULL
         GROUP BY v.candidate_id`
      )
      .all(departmentId)
      .map((r) => [r.id, r.n])
  );
  const abstainCounts = new Map(
    db
      .prepare(
        `SELECT v.position_id AS id, COUNT(*) AS n
         FROM votes v JOIN positions p ON p.id = v.position_id
         WHERE p.department_id = ? AND v.candidate_id IS NULL
         GROUP BY v.position_id`
      )
      .all(departmentId)
      .map((r) => [r.id, r.n])
  );

  const positions = db
    .prepare(
      'SELECT id, name, votes_allowed AS votesAllowed FROM positions WHERE department_id = ? ORDER BY sort_order, id'
    )
    .all(departmentId);
  const candidates = db
    .prepare(
      "SELECT id, full_name AS fullName, partylist, background, position_id AS positionId, CASE WHEN photo IS NULL THEN NULL ELSE '/api/photos/' || photo END AS photoUrl FROM " +
        candidateTable(departmentId)
    )
    .all();

  res.json({
    ...base,
    hidden: false,
    positions: positions.map((p) => ({
      ...p,
      abstain: abstainCounts.get(p.id) || 0,
      candidates: candidates
        .filter((c) => c.positionId === p.id)
        .map((c) => ({ ...c, votes: candidateCounts.get(c.id) || 0 }))
        .sort((a, b) => b.votes - a.votes),
    })),
  });
}

router.get('/results', requireResultsAccess, (req, res) => {
  if (req.admin) {
    return requireDepartment(req, res, () =>
      sendResults(req, res, req.departmentId)
    );
  }

  return sendResults(req, res, req.departmentId);
});

module.exports = router;