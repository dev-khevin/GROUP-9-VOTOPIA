import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { adminApi, adminUpload, clearAdminSession } from '../../api/admin';
import EditPositionModal from '../../components/EditPositionModal';
import EditCandidateModal from '../../components/EditCandidateModal';
import '../../styles/admin.css';
import '../../styles/voterlist.css';

const STATUS_TEXT = {
  draft: 'Draft: set up the positions, then upload photos and correct the list.',
  posted:
    'Approved and posted: students and candidates can check the list. Fix any reported errors, then lock it.',
  locked: 'Locked: the ballot is final and cannot be changed.',
};

export default function Candidates() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [posModal, setPosModal] = useState(null);
  const [candModal, setCandModal] = useState(null);
  const [files, setFiles] = useState([]);
  const [inputKey, setInputKey] = useState(0);
  const [uploadResult, setUploadResult] = useState(null);

  const load = useCallback(async () => {
    try {
      setData(await adminApi('/candidate-list'));
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
  }, [load]);

  const candidates = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data.candidates;
    return data.candidates.filter(
      (c) =>
        c.studentId.toLowerCase().includes(q) ||
        c.fullName.toLowerCase().includes(q) ||
        c.positionName.toLowerCase().includes(q)
    );
  }, [data, search]);

  async function act(fn, successText) {
    setError('');
    setMessage('');
    setBusy(true);
    try {
      await fn();
      if (successText) setMessage(successText);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function handleUpload(e) {
    e.preventDefault();
    if (files.length === 0) return;
    act(async () => {
      const form = new FormData();
      files.forEach((f) => form.append('photos', f));
      setUploadResult(await adminUpload('/candidate-list/upload', form));
      setFiles([]);
      setInputKey((k) => k + 1);
    });
  }

  function removePosition(p) {
    if (!window.confirm('Remove the position "' + p.name + '"?')) return;
    act(
      () => adminApi('/candidate-list/positions/' + p.id, { method: 'DELETE' }),
      'Position removed.'
    );
  }

  function removeCandidate(c) {
    if (!window.confirm('Remove ' + (c.fullName || c.studentId) + '?')) return;
    act(
      () =>
        adminApi('/candidate-list/candidates/' + c.id, { method: 'DELETE' }),
      'Candidate removed.'
    );
  }

  function approve() {
    const flagged = data.candidates.filter((c) => c.issues.length > 0).length;
    const text = flagged
      ? flagged +
        ' candidate(s) still have notes. Approve anyway? (Candidates who are not on the voter list will block approval.)'
      : 'Approve this candidate list?';
    if (!window.confirm(text)) return;
    act(
      () => adminApi('/candidate-list/approve', { method: 'POST' }),
      'Candidate list approved and posted.'
    );
  }

  function confirmWord(path, prompt, successText) {
    const typed = window.prompt(prompt);
    if (typed === null) return;
    act(
      () =>
        adminApi(path, { method: 'POST', body: { confirm: typed.trim() } }),
      successText
    );
  }

  if (!data) {
    return (
      <main className="admin-page">
        <p className="admin-note">{error || 'Loading...'}</p>
      </main>
    );
  }

  const canEdit = data.status !== 'locked';
  const flaggedCount = data.candidates.filter((c) => c.issues.length > 0).length;

  return (
    <main className="admin-page">
      <div className="admin-card wide">
        <div className="admin-header">
          <div>
            <h1>{data.department} Positions and Candidates</h1>
            <p className="admin-note">{STATUS_TEXT[data.status]}</p>
          </div>
          <Link className="admin-link" to="/admin">
            Back to dashboard
          </Link>
        </div>

        <div className="steps">
          <span className={data.status === 'draft' ? 'step on' : 'step'}>
            1. Draft
          </span>
          <span className={data.status === 'posted' ? 'step on' : 'step'}>
            2. Approved and posted
          </span>
          <span className={data.status === 'locked' ? 'step on' : 'step'}>
            3. Locked
          </span>
        </div>

        {message && <p className="admin-ok">{message}</p>}
        {error && <p className="admin-error">{error}</p>}

        <div className="section-head">
          <h2>Positions</h2>
          {canEdit && (
            <button
              className="admin-btn"
              onClick={() => setPosModal({ mode: 'add' })}
              disabled={busy}
            >
              Add position
            </button>
          )}
        </div>
        <p className="admin-note">
          "Votes allowed" is how many candidates a student can choose for that
          position. The ballot shows positions in this order.
        </p>

        <div className="table-wrap">
          <table className="student-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Position</th>
                <th>Votes allowed</th>
                <th>Candidates</th>
                {canEdit && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {data.positions.map((p) => (
                <tr key={p.id}>
                  <td>{p.sortOrder}</td>
                  <td>{p.name}</td>
                  <td>{p.votesAllowed}</td>
                  <td>{p.candidateCount}</td>
                  {canEdit && (
                    <td className="row-actions">
                      <button
                        className="mini"
                        onClick={() => setPosModal({ mode: 'edit', row: p })}
                        disabled={busy}
                      >
                        Edit
                      </button>
                      <button
                        className="mini danger"
                        onClick={() => removePosition(p)}
                        disabled={busy}
                      >
                        Delete
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {data.positions.length === 0 && (
                <tr>
                  <td colSpan={5} className="empty">
                    No positions yet. Add the positions first.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {data.status === 'draft' && (
          <form className="upload-box" onSubmit={handleUpload}>
            <h2>Upload photos of the candidate list</h2>
            <p className="admin-note">
              JPG or PNG, up to 10 photos. Use clear, straight, well-lit photos
              with the columns in this order: ID, name, course, year/section,
              position, partylist. The position must match one of the names
              above.
            </p>
            <input
              key={inputKey}
              type="file"
              accept="image/png,image/jpeg"
              multiple
              onChange={(e) => setFiles([...e.target.files])}
            />
            <button
              className="admin-btn"
              type="submit"
              disabled={busy || files.length === 0 || data.positions.length === 0}
            >
              {busy ? 'Reading photos... this can take a minute' : 'Read photos'}
            </button>
          </form>
        )}

        {uploadResult && (
          <div className="upload-result">
            <strong>Added {uploadResult.added} candidates.</strong>
            {uploadResult.lowQuality && (
              <p>
                The photo quality was low, so the new rows are highlighted.
                Check them carefully.
              </p>
            )}
            {uploadResult.skipped.length > 0 && (
              <p>Skipped: {uploadResult.skipped.join(', ')}</p>
            )}
            {uploadResult.unmatched.length > 0 && (
              <>
                <p>
                  The position was not recognized on these lines, so they were
                  not added. Use Add candidate for them.
                </p>
                <ul>
                  {uploadResult.unmatched.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              </>
            )}
            {uploadResult.unreadable.length > 0 && (
              <>
                <p>
                  These lines had no student ID, so they were not added (header
                  lines can be ignored).
                </p>
                <ul>
                  {uploadResult.unreadable.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        <div className="section-head">
          <h2>Candidates</h2>
        </div>
        <p className="admin-note">
          Every candidate needs a background description before the list can be
          approved and locked.
        </p>

        <div className="table-tools">
          <input
            className="search"
            placeholder="Search by name, ID, or position"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {canEdit && (
            <button
              className="admin-btn"
              onClick={() => setCandModal({ mode: 'add' })}
              disabled={busy || data.positions.length === 0}
            >
              Add candidate
            </button>
          )}
        </div>

        <p className="admin-note">
          {data.candidates.length} candidates
          {flaggedCount > 0 && ', ' + flaggedCount + ' highlighted for checking'}
        </p>

        <div className="table-wrap">
          <table className="student-table">
            <thead>
              <tr>
                <th>Student ID</th>
                <th>Name</th>
                <th>Course</th>
                <th>Year / Section</th>
                <th>Position</th>
                <th>Partylist</th>
                {canEdit && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {candidates.map((c) => (
                <tr key={c.id} className={c.issues.length ? 'flagged' : ''}>
                  <td>{c.studentId}</td>
                  <td>
                    <span className="name-cell">
                      {c.photoUrl ? (
                        <img className="thumb" src={c.photoUrl} alt="" />
                      ) : (
                        <span className="thumb placeholder">
                          {c.fullName.charAt(0)}
                        </span>
                      )}
                      <span>{c.fullName}</span>
                    </span>
                    {c.issues.length > 0 && (
                      <small className="issues">{c.issues.join(' · ')}</small>
                    )}
                  </td>
                  <td>{c.course}</td>
                  <td>{c.yearSection}</td>
                  <td>{c.positionName}</td>
                  <td>{c.partylist}</td>
                  {canEdit && (
                    <td className="row-actions">
                      <button
                        className="mini"
                        onClick={() => setCandModal({ mode: 'edit', row: c })}
                        disabled={busy}
                      >
                        Edit
                      </button>
                      <button
                        className="mini danger"
                        onClick={() => removeCandidate(c)}
                        disabled={busy}
                      >
                        Delete
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {candidates.length === 0 && (
                <tr>
                  <td colSpan={7} className="empty">
                    No candidates to show.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="admin-actions list-actions">
          {data.status === 'draft' && (
            <button
              className="admin-btn"
              onClick={approve}
              disabled={busy || data.candidates.length === 0}
            >
              Approve list
            </button>
          )}
          {data.status === 'posted' && (
            <button
              className="admin-btn"
              onClick={() =>
                confirmWord(
                  '/candidate-list/lock',
                  'Locking makes the ballot final and deletes the uploaded photos. Type LOCK to confirm.',
                  'Candidate list locked.'
                )
              }
              disabled={busy}
            >
              Lock list
            </button>
          )}
          {data.electionMode === 'test' && data.pollStatus !== 'open' && (
            <button
              className="admin-btn danger"
              onClick={() =>
                confirmWord(
                  '/candidate-list/clear',
                  'This deletes ALL candidates and ALL votes (test mode only). Positions stay. Type CLEAR to confirm.',
                  'The candidate list was cleared.'
                )
              }
              disabled={busy}
            >
              Clear candidates (test mode)
            </button>
          )}
        </div>
      </div>

      {posModal && (
        <EditPositionModal
          mode={posModal.mode}
          position={posModal.row}
          onClose={() => setPosModal(null)}
          onSaved={(text) => {
            setPosModal(null);
            setMessage(text);
            load();
          }}
        />
      )}

      {candModal && (
        <EditCandidateModal
          mode={candModal.mode}
          candidate={candModal.row}
          positions={data.positions}
          onClose={() => setCandModal(null)}
          onSaved={(text) => {
            setCandModal(null);
            setMessage(text);
            load();
          }}
        />
      )}
    </main>
  );
}