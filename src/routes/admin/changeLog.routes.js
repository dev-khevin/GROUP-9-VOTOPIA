const express = require('express');
const db = require('../../config/db');
const requireAdmin = require('../../middleware/requireAdmin');

const router = express.Router();
router.use(requireAdmin);

const PAGE_SIZE = 25;

// Read-only view of the change log: newest first, with filters and pages
router.get('/change-log', (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const target = String(req.query.target || '').trim();
  const search = String(req.query.search || '').trim();

  const where = [];
  const params = [];
  if (target) {
    where.push('target = ?');
    params.push(target);
  }
  if (search) {
    where.push(
      '(admin LIKE ? OR target LIKE ? OR record_id LIKE ? OR action LIKE ? OR old_value LIKE ? OR new_value LIKE ?)'
    );
    const like = '%' + search + '%';
    params.push(like, like, like, like, like, like);
  }
  const clause = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const total = db
    .prepare('SELECT COUNT(*) AS n FROM change_log ' + clause)
    .get(...params).n;

  const rows = db
    .prepare(
      'SELECT id, admin, department_id AS departmentId, target, record_id AS recordId, action, old_value AS oldValue, new_value AS newValue, created_at AS createdAt FROM change_log ' +
        clause +
        ' ORDER BY id DESC LIMIT ? OFFSET ?'
    )
    .all(...params, PAGE_SIZE, (page - 1) * PAGE_SIZE);

  const targets = db
    .prepare('SELECT DISTINCT target FROM change_log ORDER BY target')
    .all()
    .map((r) => r.target);

  res.json({ rows, total, page, pageSize: PAGE_SIZE, targets });
});

module.exports = router;