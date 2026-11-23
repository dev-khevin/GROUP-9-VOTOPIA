import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { adminApi, clearAdminSession } from '../../api/admin';
import '../../styles/changelog.css';

const AREA_LABELS = {
  voter_list: 'Voter list',
  candidate_list: 'Candidate list',
  candidate: 'Candidate',
  position: 'Position',
  polls: 'Polls',
  votes: 'Votes',
  election: 'Election mode',
};

const ACTION_LABELS = {
  add: 'Added',
  edit: 'Edited',
  delete: 'Deleted',
  'delete-data': 'Deleted voter data',
  upload: 'Uploaded photos',
  approve: 'Approved',
  lock: 'Locked',
  clear: 'Cleared',
  reset: 'Reset',
  open: 'Opened',
  close: 'Closed',
  'go-live': 'Switched to live mode',
  'reveal-pin': 'Viewed a PIN',
  unlock: 'Unlocked a student',
  reviewed: 'Marked as checked',
  photo: 'Photo',
};

function formatTime(value) {
  const d = new Date(String(value).replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function details(row) {
  if (row.oldValue && row.newValue) return row.oldValue + ' → ' + row.newValue;
  return row.newValue || row.oldValue || '';
}

export default function ChangeLog() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [area, setArea] = useState('');
  const [searchText, setSearchText] = useState('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (area) params.set('target', area);
      if (query) params.set('search', query);
      setData(await adminApi('/change-log?' + params.toString()));
      setError('');
    } catch (err) {
      if (err.status === 401) {
        clearAdminSession();
        navigate('/admin/login');
      } else {
        setError(err.message);
      }
    }
  }, [page, area, query, navigate]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, [load]);

  function handleSearch(e) {
    e.preventDefault();
    setQuery(searchText.trim());
    setPage(1);
  }

  function changeArea(e) {
    setArea(e.target.value);
    setPage(1);
  }

  if (!data) {
    return (
      <main className="cl-page">
        <p className="cl-note">{error || 'Loading...'}</p>
      </main>
    );
  }

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <main className="cl-page">
      <div className="cl-card">
        <div className="cl-header">
          <div>
            <h1>Change Log</h1>
            <p className="cl-note">
              Every admin action, newest first. Times are in your local time.
              PINs are never recorded here.
            </p>
          </div>
          <Link className="cl-back" to="/admin">
            Back to dashboard
          </Link>
        </div>

        {error && <p className="cl-error">{error}</p>}

        <form className="cl-tools" onSubmit={handleSearch}>
          <select value={area} onChange={changeArea}>
            <option value="">All areas</option>
            {data.targets.map((t) => (
              <option key={t} value={t}>
                {AREA_LABELS[t] || t}
              </option>
            ))}
          </select>
          <input
            placeholder="Search by student ID, name, or action"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
          <button className="cl-btn" type="submit">
            Search
          </button>
        </form>

        <div className="cl-wrap">
          <table className="cl-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Admin</th>
                <th>Area</th>
                <th>Action</th>
                <th>Item</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id}>
                  <td className="cl-when">{formatTime(r.createdAt)}</td>
                  <td>{r.admin}</td>
                  <td>{AREA_LABELS[r.target] || r.target}</td>
                  <td>
                    <span className="cl-badge">
                      {ACTION_LABELS[r.action] || r.action}
                    </span>
                  </td>
                  <td>{r.recordId || ''}</td>
                  <td className="cl-details">{details(r)}</td>
                </tr>
              ))}
              {data.rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="cl-empty">
                    No entries found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="cl-pager">
          <span className="cl-note">
            Page {data.page} of {totalPages} ({data.total} entries)
          </span>
          <div>
            <button
              className="cl-btn secondary"
              onClick={() => setPage((p) => p - 1)}
              disabled={page <= 1}
            >
              Previous
            </button>{' '}
            <button
              className="cl-btn secondary"
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= totalPages}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}