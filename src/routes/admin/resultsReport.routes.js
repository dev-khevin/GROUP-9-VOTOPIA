const express = require('express');
const crypto = require('crypto');
const db = require('../../config/db');
const requireAdmin = require('../../middleware/requireAdmin');
const requireDepartment = require('../../middleware/requireDepartment');
const {
  getSetting,
  settingKey,
} = require('../../services/departments');
const {
  candidateTable,
  studentTable,
} = require('../../services/departmentTables');

const router = express.Router();
router.use(requireAdmin, requireDepartment);

router.get('/results-report', (req, res) => {
  const departmentId = req.departmentId;
  const pollStatus = getSetting(departmentId, 'poll_status');
  const electionMode = getSetting(departmentId, 'election_mode');

  let voted = db
    .prepare('SELECT COUNT(*) AS n FROM voters_voted WHERE department_id = ?')
    .get(departmentId).n;
  let eligible = db
    .prepare('SELECT COUNT(*) AS n FROM ' + studentTable(departmentId))
    .get().n;
  const savedTurnout = db
    .prepare('SELECT value FROM settings WHERE key = ?')
    .get(settingKey(departmentId, 'final_turnout'))?.value;
  if (savedTurnout) {
    try {
      const turnout = JSON.parse(savedTurnout);
      voted = turnout.voted;
      eligible = turnout.eligible;
    } catch {
      // Keep the live database counts if the saved JSON is invalid.
    }
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
      .map((row) => [row.id, row.n])
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
      .map((row) => [row.id, row.n])
  );

  const positions = db
    .prepare(
      'SELECT id, name, votes_allowed AS votesAllowed FROM positions WHERE department_id = ? ORDER BY sort_order, id'
    )
    .all(departmentId);
  const candidates = db
    .prepare(
      'SELECT id, full_name AS fullName, partylist, position_id AS positionId FROM ' +
        candidateTable(departmentId)
    )
    .all();

  const reportPositions = positions.map((position) => ({
    id: position.id,
    name: position.name,
    votesAllowed: position.votesAllowed,
    abstain: abstainCounts.get(position.id) || 0,
    candidates: candidates
      .filter((candidate) => candidate.positionId === position.id)
      .map((candidate) => ({
        id: candidate.id,
        fullName: candidate.fullName,
        partylist: candidate.partylist || '',
        votes: candidateCounts.get(candidate.id) || 0,
      }))
      .sort(
        (a, b) =>
          b.votes - a.votes ||
          a.fullName.localeCompare(b.fullName, undefined, {
            sensitivity: 'base',
          })
      ),
  }));

  const openedAt =
    db
      .prepare(
        "SELECT created_at AS createdAt FROM change_log WHERE department_id = ? AND target = 'polls' AND action = 'open' ORDER BY id DESC LIMIT 1"
      )
      .get(departmentId)?.createdAt || null;
  const closedAt =
    db
      .prepare(
        "SELECT created_at AS createdAt FROM change_log WHERE department_id = ? AND target = 'polls' AND action = 'close' ORDER BY id DESC LIMIT 1"
      )
      .get(departmentId)?.createdAt || null;

  const hashInput = JSON.stringify({
    positions: reportPositions.map((position) => ({
      name: position.name,
      candidates: position.candidates.map((candidate) => ({
        name: candidate.fullName,
        votes: candidate.votes,
      })),
      abstain: position.abstain,
    })),
    turnout: { voted, eligible },
  });
  const reportId = crypto
    .createHash('sha256')
    .update(departmentId + ':' + hashInput)
    .digest('hex')
    .slice(0, 12)
    .toUpperCase();

  res.json({
    departmentId,
    department: db
      .prepare('SELECT name FROM departments WHERE id = ?')
      .get(departmentId).name,
    pollStatus,
    electionMode,
    openedAt,
    closedAt,
    generatedAt: new Date().toISOString(),
    turnout: { voted, eligible },
    positions: reportPositions,
    reportId,
  });
});

module.exports = router;
