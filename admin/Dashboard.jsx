import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { adminApi, clearAdminSession, getAdminName } from '../../api/admin';
import '../../styles/admin.css';

const POLL_TEXT = {
  not_started: 'Not started',
  open: 'Open',
  closed: 'Closed',
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await adminApi('/dashboard'));
    } catch (err) {
      if (err.status === 401) {
        clearAdminSession();
        navigate('/admin/login');
      } else {
        setError(err.message);
      }
    }
  }, [navigate]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 2000);
    return () => clearInterval(timer);
  }, [load]);

  async function run(path, successText, promptText) {
    setMessage('');
    setError('');
    let body;
    if (promptText) {
      const typed = window.prompt(promptText);
      if (typed === null) return;
      body = { confirm: typed.trim() };
    }
    setBusy(true);
    try {
      await adminApi(path, { method: 'POST', body });
      setMessage(successText);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    try {
      await adminApi('/logout', { method: 'POST' });
    } catch {
      // log out on this device even if the server cannot be reached
    }
    clearAdminSession();
    navigate('/admin/login');
  }

  if (!data) {
    return (
      <main className="admin-page">
        <p className="admin-note">{error || 'Loading...'}</p>
      </main>
    );
  }

  const isOpen = data.pollStatus === 'open';
  const isTest = data.electionMode === 'test';
  const turnout =
    data.students > 0 ? Math.round((data.voted / data.students) * 100) : 0;
  const registration =
    data.students > 0
      ? Math.round((data.registered / data.students) * 100)
      : 0;
  const activeAdmin = data.admin || getAdminName();

  return (
    <main className="admin-page dashboard-page">
      <div className="admin-card dashboard-shell">
        <header className="dashboard-header">
          <div className="dashboard-brand">
            <span className="dashboard-brand-mark" aria-hidden="true">CV</span>
            <span>SSC Voting <small>ADMIN CONSOLE</small></span>
          </div>
          <div className="dashboard-account">
            <button className="dashboard-logout" onClick={handleLogout}>
              Log Out
            </button>
          </div>
        </header>

        <section className="dashboard-welcome">
          <div>
            <h1>Good to see you, {activeAdmin}</h1>
          </div>
          <div className="dashboard-poll-status">
            <span className={'dashboard-status-dot ' + data.pollStatus} />
            <span>
              <small>POLL STATUS</small>
              <strong>{POLL_TEXT[data.pollStatus] || data.pollStatus}</strong>
            </span>
          </div>
        </section>

        {!isTest && (
          <div className="dashboard-mode-note live">
            <strong>Live mode</strong>
            <span>Votes are final and cannot be reset.</span>
          </div>
        )}

        {message && <p className="admin-ok">{message}</p>}
        {error && <p className="admin-error">{error}</p>}

        <section className="dashboard-section">
          <div className="dashboard-section-heading">
            <div>
              <p className="dashboard-eyebrow">AT A GLANCE</p>
              <h2>Election snapshot</h2>
            </div>
            <span className="dashboard-updated">Refreshes automatically</span>
          </div>

          <div className="dashboard-stats">
            <article className="dashboard-stat featured">
              <span className="dashboard-stat-icon" aria-hidden="true">↗</span>
              <span className="dashboard-stat-label">Voter turnout</span>
              <strong>{data.voted} <small>/ {data.students}</small></strong>
              <div className="dashboard-progress" aria-label={turnout + '% voter turnout'}>
                <span style={{ width: turnout + '%' }} />
              </div>
              <small className="dashboard-stat-foot">{turnout}% of listed students</small>
            </article>
            <article className="dashboard-stat">
              <span className="dashboard-stat-icon" aria-hidden="true">✓</span>
              <span className="dashboard-stat-label">Registered students</span>
              <strong>{data.registered} <small>/ {data.students}</small></strong>
              <div className="dashboard-progress" aria-label={registration + '% registration'}>
                <span style={{ width: registration + '%' }} />
              </div>
              <small className="dashboard-stat-foot">{registration}% registered</small>
            </article>
            <article className="dashboard-stat">
              <span className="dashboard-stat-icon" aria-hidden="true">!</span>
              <span className="dashboard-stat-label">Locked out</span>
              <strong>{data.lockedOut}</strong>
              <small className="dashboard-stat-foot">Student accounts</small>
            </article>
            <article className="dashboard-stat">
              <span className="dashboard-stat-icon" aria-hidden="true">▦</span>
              <span className="dashboard-stat-label">Positions</span>
              <strong>{data.positions}</strong>
              <small className="dashboard-stat-foot">On the ballot</small>
            </article>
            <article className="dashboard-stat">
              <span className="dashboard-stat-icon" aria-hidden="true">♙</span>
              <span className="dashboard-stat-label">Candidates</span>
              <strong>{data.candidates}</strong>
              <small className="dashboard-stat-foot">Running in this election</small>
            </article>
          </div>
        </section>

        <section className="dashboard-section">
          <div className="dashboard-section-heading">
            <div>
              <p className="dashboard-eyebrow">QUICK ACCESS</p>
              <h2>Manage your election</h2>
            </div>
          </div>
          <div className="dashboard-tools">
            <Link className="dashboard-tool" to="/admin/voter-list">
              <span className="dashboard-tool-icon voter" aria-hidden="true">01</span>
              <span>
                <strong>Voter list</strong>
                <small>Manage students and registration</small>
                <em>List status: {data.voterListStatus}</em>
              </span>
              <span className="dashboard-tool-arrow" aria-hidden="true">→</span>
            </Link>
            <Link className="dashboard-tool" to="/admin/change-log">
              <span className="dashboard-tool-icon" aria-hidden="true">04</span>
              <span>
                <strong>Change log</strong>
                <small>Review administrator actions</small>
              </span>
              <span className="dashboard-tool-arrow" aria-hidden="true">→</span>
            </Link>
            <Link className="dashboard-tool" to="/admin/candidates">
              <span className="dashboard-tool-icon candidate" aria-hidden="true">02</span>
              <span>
                <strong>Positions &amp; candidates</strong>
                <small>Set up the ballot and candidate profiles</small>
                <em>List status: {data.candidateListStatus}</em>
              </span>
              <span className="dashboard-tool-arrow" aria-hidden="true">→</span>
            </Link>
            <Link className="dashboard-tool" to="/results">
              <span className="dashboard-tool-icon results" aria-hidden="true">03</span>
              <span>
                <strong>Election results</strong>
                <small>View turnout and candidate totals</small>
                <em>Available to signed-in users</em>
              </span>
              <span className="dashboard-tool-arrow" aria-hidden="true">→</span>
            </Link>
            <Link className="dashboard-tool" to="/admin/results-report">
              <span className="dashboard-tool-icon results" aria-hidden="true">05</span>
              <span>
                <strong>Results report</strong>
                <small>Print, save as PDF, or download CSV</small>
                <em>Vote totals only</em>
              </span>
              <span className="dashboard-tool-arrow" aria-hidden="true">→</span>
            </Link>
          </div>
        </section>

        <section className="dashboard-poll-controls">
          <div>
            <p className="dashboard-eyebrow">POLL CONTROLS</p>
            <h2>{isOpen ? 'Voting is live' : 'Control voting'}</h2>
            <p>
              {isOpen
                ? 'Students can currently submit their ballots.'
                : 'Open voting when your election is ready.'}
            </p>
          </div>
          <div className="dashboard-control-buttons">
            <button
              className="admin-btn"
              disabled={busy || isOpen}
              onClick={() => run('/polls/open', 'Polls are open.')}
            >
              Open polls
            </button>
            <button
              className="admin-btn secondary"
              disabled={busy || !isOpen}
              onClick={() => run('/polls/close', 'Polls are closed.')}
            >
              Close polls
            </button>
          </div>
        </section>

        {isTest && (
          <section className="dashboard-test-tools">
            <div>
              <p className="dashboard-eyebrow">TESTING ONLY</p>
              <h2>Test tools</h2>
              <p>
                Close the polls first. These actions require typed confirmation.
              </p>
            </div>
            <div className="dashboard-control-buttons">
              <button
                className="admin-btn danger"
                disabled={busy || isOpen}
                onClick={() =>
                  run(
                    '/polls/reset',
                    'Test votes were reset.',
                    'This deletes ALL votes. Type RESET to confirm.'
                  )
                }
              >
                Reset votes
              </button>
              <button
                className="admin-btn danger-outline"
                disabled={busy || isOpen}
                onClick={() =>
                  run(
                    '/polls/go-live',
                    'The system is now in live mode.',
                    'Live mode is permanent and clears all test votes. Type GO LIVE to confirm.'
                  )
                }
              >
                Switch to live mode
              </button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}