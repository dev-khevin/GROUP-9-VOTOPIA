const express = require('express');
const db = require('../config/db');
const { normalizeDepartment } = require('../services/departments');
const { studentTable } = require('../services/departmentTables');

const router = express.Router();

// Public list so students can check their details before registering.
// Names and sections only: no student IDs and no PINs.
router.get('/posted-list', (req, res) => {
  const departmentId = normalizeDepartment(req.query.department || 'LEGACY');
  if (!departmentId) {
    return res.status(400).json({ error: 'Choose a valid department.' });
  }
  const status = db
    .prepare('SELECT value FROM settings WHERE key = ?')
    .get(
      departmentId === 'LEGACY'
        ? 'voter_list_status'
        : departmentId + ':voter_list_status'
    )?.value;

  if (!status || status === 'draft') {
    return res.json({ available: false, status, departmentId, students: [] });
  }

  const students = db
    .prepare(
      'SELECT full_name AS fullName, course, year_section AS yearSection FROM ' +
        studentTable(departmentId) +
        ' ORDER BY full_name COLLATE NOCASE'
    )
    .all();
  res.json({ available: true, status, departmentId, students });
});

module.exports = router;