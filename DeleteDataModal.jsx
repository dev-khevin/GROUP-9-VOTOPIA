import { useState } from 'react';
import { adminApi } from '../api/admin';

export default function DeleteDataModal({ onClose, onDeleted }) {
  const [confirm, setConfirm] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [savedReport, setSavedReport] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await adminApi('/voter-list/delete-data', {
        method: 'POST',
        body: { confirm: confirm.trim(), password },
      });
      onDeleted('Voter data deleted. The vote totals were kept.');
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2>Delete voter data</h2>
        <p className="admin-note">
          This permanently deletes every student record, every account, and the
          record of who voted. The vote totals and the final turnout are kept.
          Students will no longer be able to log in, so only do this after the
          final results are announced and saved. It cannot be undone.
        </p>
        <p className="admin-note">
          Save or print the results report first. After deletion, students can no
          longer log in to view results.{' '}
          <a
            className="admin-link"
            href="/admin/results-report"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open results report
          </a>
        </p>

        <form onSubmit={handleSubmit}>
          <label>
            Type DELETE VOTERS to confirm
            <input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoFocus
              required
            />
          </label>

          <label>
            Your admin password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          <label className="inline-check" htmlFor="saved-results-report">
            <input
              id="saved-results-report"
              type="checkbox"
              checked={savedReport}
              onChange={(e) => setSavedReport(e.target.checked)}
            />
            I have saved or printed the final results report.
          </label>

          {error && <p className="admin-error">{error}</p>}

          <div className="modal-actions">
            <button
              type="button"
              className="admin-btn secondary"
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="admin-btn danger"
              disabled={
                busy ||
                confirm.trim() !== 'DELETE VOTERS' ||
                password.trim() === '' ||
                !savedReport
              }
            >
              {busy ? 'Deleting...' : 'Delete voter data'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
