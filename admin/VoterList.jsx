import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { adminApi, adminUpload, clearAdminSession } from '../../api/admin';
import EditStudentModal from '../../components/EditStudentModal';
import DeleteDataModal from '../../components/DeleteDataModal';
import RevealPinModal from '../../components/RevealPinModal';
import '../../styles/admin.css';
import '../../styles/voterlist.css';

const STATUS_TEXT = {
  draft: 'Draft: upload photos and correct the list.',
  posted:
    'Approved and posted: students can check the list. Fix any reported errors, then lock it.',
  locked:
    'Locked: registration is open. Other list edits are disabled; correct names for reported typos.',
};

export default function VoterList() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [showPins, setShowPins] = useState(false);
  const [modal, setModal] = useState(null);
  const [reveal, setReveal] = useState(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [files, setFiles] = useState([]);
  const [inputKey, setInputKey] = useState(0);
  const [uploadResult, setUploadResult] = useState(null);

  const load = useCallback(async () => {
    try {
      setData(await adminApi('/voter-list'));
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

  useEffect(() => {
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, [load]);

  const rows = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data.rows;
    return data.rows.filter(
      (r) =>
        r.studentId.toLowerCase().includes(q) ||
        r.fullName.toLowerCase().includes(q)
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

  function unlock(row) {
    act(
      () =>
        adminApi('/voter-list/students/' + row.id + '/unlock', {
          method: 'POST',
        }),
      row.fullName + ' can log in again.'
    );
  }

  function handleUpload(e) {
    e.preventDefault();
    if (files.length === 0) return;
    act(async () => {
      const form = new FormData();
      files.forEach((f) => form.append('photos', f));
      setUploadResult(await adminUpload('/voter-list/upload', form));
      setFiles([]);
      setInputKey((k) => k + 1);
    });
  }

  function removeRow(row) {
    if (!window.confirm('Remove ' + (row.fullName || row.studentId) + '?')) {
      return;
    }
    act(
      () => adminApi('/voter-list/students/' + row.id, { method: 'DELETE' }),
      'Student removed.'
    );
  }

  function approve() {
    const flagged = data.rows.filter((r) => r.needsReview).length;
    const text = flagged
      ? flagged +
        ' row(s) are still marked "Check against the photo". Approve anyway? PINs will be hidden after approval.'
      : 'Approve this list? PINs will be hidden after approval.';
    if (!window.confirm(text)) return;
    act(
      () => adminApi('/voter-list/approve', { method: 'POST' }),
      'List approved and posted.'
    );
  }

  function confirmWord(path, word, prompt, successText) {
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
  const flaggedCount = data.rows.filter((r) => r.issues.length > 0).length;

  function pinCell(r) {
    if (data.status === 'draft') {
      if (!r.pin) return '-';
      return showPins ? r.pin : '••••';
    }
    return r.hasPin ? 'Set' : '-';
  }

  return (
    <main className="admin-page">
      <div className="admin-card wide">
        <div className="admin-header">
          <div>
            <h1>{data.department} Voter List</h1>
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

        {data.status === 'draft' && (
          <form className="upload-box" onSubmit={handleUpload}>
            <h2>Upload photos of the student list</h2>
            <p className="admin-note">
              JPG or PNG, up to 10 photos. Use clear, straight, well-lit photos
              with the columns in this order: ID, name, course, year/section,
              PIN.
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
              disabled={busy || files.length === 0}
            >
              {busy ? 'Reading photos... this can take a minute' : 'Read photos'}
            </button>
          </form>
        )}

        {uploadResult && (
          <div className="upload-result">
            <strong>Added {uploadResult.added} students.</strong>
            {uploadResult.lowQuality && (
              <p>
                The photo quality was low, so the new rows are highlighted.
                Check them carefully.
              </p>
            )}
            {uploadResult.skipped.length > 0 && (
              <p>Skipped: {uploadResult.skipped.join(', ')}</p>
            )}
            {uploadResult.unreadable.length > 0 && (
              <>
                <p>
                  These lines had no student ID, so they were not added (header
                  lines can be ignored). Use Add student for any real students.
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

        {data.deletedAt && (
          <p className="admin-ok">
            Voter data was deleted on{' '}
            {new Date(data.deletedAt.replace(' ', 'T') + 'Z').toLocaleString()}
            . The vote totals were kept.
          </p>
        )}

        <div className="table-tools">
          <input
            className="search"
            placeholder="Search by name or ID"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {data.status === 'draft' && (
            <label className="inline-check">
              <input
                type="checkbox"
                checked={showPins}
                onChange={(e) => setShowPins(e.target.checked)}
              />
              Show PINs
            </label>
          )}
          {canEdit && (
            <button
              className="admin-btn"
              onClick={() => setModal({ mode: 'add' })}
              disabled={busy}
            >
              Add student
            </button>
          )}
        </div>

        <p className="admin-note">
          {data.rows.length} students
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
                <th>PIN</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={r.issues.length ? 'flagged' : ''}>
                  <td>{r.studentId}</td>
                  <td>
                    {r.fullName || <em>(missing)</em>}
                    {r.issues.length > 0 && (
                      <small className="issues">{r.issues.join(' · ')}</small>
                    )}
                    {r.lockedUntil && (
                      <small className="locked-note">
                        Locked out until{' '}
                        {new Date(r.lockedUntil).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </small>
                    )}
                  </td>
                  <td>{r.course}</td>
                  <td>{r.yearSection}</td>
                  <td>{pinCell(r)}</td>
                  <td className="row-actions">
                    {canEdit && (
                      <>
                        <button
                          className="mini"
                          onClick={() => setModal({ mode: 'edit', row: r })}
                          disabled={busy}
                        >
                          Edit
                        </button>
                        <button
                          className="mini danger"
                          onClick={() => removeRow(r)}
                          disabled={busy}
                        >
                          Delete
                        </button>
                      </>
                    )}
                    {data.status === 'locked' && (
                      <button
                        className="mini"
                        onClick={() =>
                          setModal({ mode: 'correct-name', row: r })
                        }
                        disabled={busy}
                      >
                        Correct name
                      </button>
                    )}
                    {data.status !== 'draft' && (
                      <button
                        className="mini"
                        onClick={() => setReveal(r)}
                        disabled={busy || !r.canReveal}
                        title={
                          r.canReveal
                            ? 'Show this PIN'
                            : 'Not available for this student'
                        }
                      >
                        View PIN
                      </button>
                    )}
                    {r.lockedUntil && (
                      <button
                        className="mini warn"
                        onClick={() => unlock(r)}
                        disabled={busy}
                      >
                        Unlock
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="empty">
                    No students to show.
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
              disabled={busy || data.rows.length === 0}
            >
              Approve list
            </button>
          )}
          {data.status === 'posted' && (
            <button
              className="admin-btn"
              onClick={() =>
                confirmWord(
                  '/voter-list/lock',
                  'LOCK',
                  'Locking opens registration and deletes the uploaded photos. Type LOCK to confirm.',
                  'List locked. Registration is open.'
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
                  '/voter-list/clear',
                  'CLEAR',
                  'This deletes ALL students and ALL votes (test mode only). Type CLEAR to confirm.',
                  'The list was cleared.'
                )
              }
              disabled={busy}
            >
              Clear list (test mode)
            </button>
          )}
          {data.status === 'locked' &&
            data.pollStatus === 'closed' &&
            !data.deletedAt && (
              <button
                className="admin-btn danger"
                onClick={() => setDeleteOpen(true)}
                disabled={busy}
              >
                Delete voter data
              </button>
            )}
        </div>
      </div>

      {modal && (
        <EditStudentModal
          mode={modal.mode}
          student={modal.row}
          status={data.status}
          onClose={() => setModal(null)}
          onSaved={(text) => {
            setModal(null);
            setMessage(text);
            load();
          }}
        />
      )}
      {reveal && (
        <RevealPinModal student={reveal} onClose={() => setReveal(null)} />
      )}
      {deleteOpen && (
        <DeleteDataModal
          onClose={() => setDeleteOpen(false)}
          onDeleted={(text) => {
            setDeleteOpen(false);
            setMessage(text);
            load();
          }}
        />
      )}
    </main>
  );
}