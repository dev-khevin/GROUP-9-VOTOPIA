const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./config/db');

const app = express();

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());
app.use(
  '/api/photos',
  express.static(path.join(__dirname, '..', 'uploads', 'candidate-photos'), {
    dotfiles: 'deny',
    index: false,
    maxAge: '1d',
    setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
  })
);
app.use('/api', require('./routes/auth.routes').router);
app.use('/api', require('./routes/ballot.routes'));
app.use('/api', require('./routes/results.routes'));
app.use('/api/admin', require('./routes/admin/auth.routes'));
app.use('/api/admin', require('./routes/admin/polls.routes'));
app.use('/api/admin', require('./routes/admin/auth.routes'));
app.use('/api/admin', require('./routes/admin/polls.routes'));
app.use('/api/admin', require('./routes/admin/voterList.routes'));
app.use('/api/admin', require('./routes/admin/candidates.routes'));
app.use('/api', require('./routes/postedList.routes'));
app.use('/api/admin', require('./routes/admin/changeLog.routes'));
app.use('/api/admin', require('./routes/admin/resultsReport.routes'));


app.get('/api/health', (req, res) => {
  const row = db
    .prepare("SELECT value FROM settings WHERE key = 'poll_status'")
    .get();
  res.json({ ok: true, pollStatus: row.value });
});

module.exports = app;
