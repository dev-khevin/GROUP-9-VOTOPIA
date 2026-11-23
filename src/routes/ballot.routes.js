const express = require('express');
const db = require('../config/db');
const requireStudent = require('../middleware/requireStudent');
const { getSetting } = require('../services/departments');
const { candidateTable } = require('../services/departmentTables');

const router = express.Router();

const hasVoted = (departmentId, studentId) =>
  !!db
    .prepare(
      'SELECT 1 FROM voters_voted WHERE department_id = ? AND student_id = ?'
    )
    .get(departmentId, studentId);

function checkAllowed(studentId, departmentId) {
  if (getSetting(departmentId, 'poll_status') !== 'open') {
    return { status: 403, error: 'Voting is not open right now.' };
  }
  if (hasVoted(departmentId, studentId)) {
    return { status: 409, error: 'You have already voted.', alreadyVoted: true };
  }
  return null;
}

// The ballot and the "has voted" mark are saved together or not at all
const castVote = db.transaction((departmentId, studentId, rows) => {
  db.prepare(
    'INSERT INTO voters_voted (department_id, student_id) VALUES (?, ?)'
  ).run(departmentId, studentId);
  const insert = db.prepare(
    'INSERT INTO votes (position_id, candidate_id) VALUES (?, ?)'
  );
  for (const row of rows) {
    insert.run(row.positionId, row.candidateId);
  }
});

router.get('/ballot', requireStudent, (req, res) => {
  const problem = checkAllowed(req.studentId, req.departmentId);
  if (problem) {
    const { status, ...body } = problem;
    return res.status(status).json(body);
  }

  const departmentId = req.departmentId;
  const positions = db
    .prepare(
      'SELECT id, name, votes_allowed AS votesAllowed FROM positions WHERE department_id = ? ORDER BY sort_order, id'
    )
    .all(departmentId);
  const candidates = db
    .prepare(
      "SELECT id, full_name AS fullName, course, year_section AS yearSection, partylist, background, position_id AS positionId, CASE WHEN photo IS NULL THEN NULL ELSE '/api/photos/' || photo END AS photoUrl FROM " +
        candidateTable(departmentId) +
        ' ORDER BY full_name'
    )
    .all();

  res.json({
    positions: positions.map((p) => ({
      ...p,
      candidates: candidates.filter((c) => c.positionId === p.id),
    })),
  });
});

router.post('/vote', requireStudent, (req, res) => {
  const problem = checkAllowed(req.studentId, req.departmentId);
  if (problem) {
    const { status, ...body } = problem;
    return res.status(status).json(body);
  }

  const departmentId = req.departmentId;
  const choices = Array.isArray(req.body.choices) ? req.body.choices : [];
  const positions = db
    .prepare(
      'SELECT id, name, votes_allowed FROM positions WHERE department_id = ?'
    )
    .all(departmentId);
  const candidates = db
    .prepare(
      'SELECT id, position_id FROM ' + candidateTable(departmentId)
    )
    .all();

  if (positions.length === 0) {
    return res.status(400).json({ error: 'There is no ballot yet.' });
  }

  const rows = [];
  for (const pos of positions) {
    const choice = choices.find((c) => Number(c.positionId) === pos.id);
    if (!choice) {
      return res
        .status(400)
        .json({ error: 'Please make a choice for every position.' });
    }

    if (choice.abstain) {
      rows.push({ positionId: pos.id, candidateId: null });
      continue;
    }

    const ids = Array.isArray(choice.candidateIds)
      ? choice.candidateIds.map(Number)
      : [];
    const unique = [...new Set(ids)];
    if (
      unique.length === 0 ||
      unique.length !== ids.length ||
      unique.length > pos.votes_allowed
    ) {
      return res
        .status(400)
        .json({ error: 'Invalid choices for ' + pos.name + '.' });
    }

    for (const id of unique) {
      const valid = candidates.find(
        (c) => c.id === id && c.position_id === pos.id
      );
      if (!valid) {
        return res
          .status(400)
          .json({ error: 'Invalid candidate for ' + pos.name + '.' });
      }
      rows.push({ positionId: pos.id, candidateId: id });
    }
  }

  try {
    castVote(departmentId, req.studentId, rows);
  } catch (err) {
    if (String(err.code).startsWith('SQLITE_CONSTRAINT')) {
      return res
        .status(409)
        .json({ error: 'You have already voted.', alreadyVoted: true });
    }
    throw err;
  }

  res.json({ ok: true });
});

module.exports = router;