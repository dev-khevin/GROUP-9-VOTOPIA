import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, clearSession, getStudent } from '../api/client';
import CandidateProfileModal from '../components/CandidateProfileModal';
import '../styles/ballot.css';
import '../styles/candidate-profile.css';

export default function Ballot() {
  const navigate = useNavigate();
  const student = getStudent();
  const [positions, setPositions] = useState([]);
  const [picks, setPicks] = useState({});
  const [step, setStep] = useState('ballot');
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('');
  const [alreadyVoted, setAlreadyVoted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [profileCandidate, setProfileCandidate] = useState(null);
  const [logoutConfirmationOpen, setLogoutConfirmationOpen] = useState(false);

  useEffect(() => {
    api('/ballot')
      .then((data) => {
        setPositions(data.positions);
        setStatus('ready');
      })
      .catch((err) => {
        if (err.status === 401) {
          clearSession();
          navigate('/login');
          return;
        }
        setAlreadyVoted(!!err.data?.alreadyVoted);
        setMessage(err.message);
        setStatus('blocked');
      });
  }, [navigate]);

  useEffect(() => {
    if (!logoutConfirmationOpen) return undefined;

    function handleKeyDown(event) {
      if (event.key === 'Escape') setLogoutConfirmationOpen(false);
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [logoutConfirmationOpen]);

  const pickFor = (id) => picks[id] || { abstain: false, ids: [] };

  function toggleCandidate(pos, candidateId) {
    const current = pickFor(pos.id).ids;
    let ids;
    if (current.includes(candidateId)) {
      ids = current.filter((x) => x !== candidateId);
    } else if (pos.votesAllowed === 1) {
      ids = [candidateId];
    } else if (current.length >= pos.votesAllowed) {
      return;
    } else {
      ids = [...current, candidateId];
    }
    setPicks({ ...picks, [pos.id]: { abstain: false, ids } });
  }

  function toggleAbstain(pos) {
    const abstain = !pickFor(pos.id).abstain;
    setPicks({ ...picks, [pos.id]: { abstain, ids: [] } });
  }

  const complete =
    positions.length > 0 &&
    positions.every((p) => {
      const k = pickFor(p.id);
      return k.abstain || k.ids.length > 0;
    });
  const completedPositions = positions.filter((p) => {
    const choice = pickFor(p.id);
    return choice.abstain || choice.ids.length > 0;
  }).length;

  const hasSelections = Object.values(picks).some(
    (k) => k.abstain || k.ids.length > 0
  );

  async function handleLogout() {
    try {
      await api('/logout', { method: 'POST' });
    } catch {
      // log out on this device even if the server cannot be reached
    }
    clearSession();
    navigate('/login');
  }

  const logoutConfirmation = logoutConfirmationOpen && (
    <div
      className="logout-confirm-overlay"
      role="presentation"
      onClick={() => setLogoutConfirmationOpen(false)}
    >
      <section
        className="logout-confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="logout-confirm-title"
        aria-describedby={hasSelections ? 'logout-confirm-message' : undefined}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="logout-confirm-title">Are you sure you want to log out?</h2>
        {hasSelections && (
          <p id="logout-confirm-message">
            Your unsubmitted choices will be lost if you log out.
          </p>
        )}
        <div className="logout-confirm-actions">
          <button
            type="button"
            className="logout-confirm-cancel"
            autoFocus
            onClick={() => setLogoutConfirmationOpen(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="logout-confirm-submit"
            onClick={handleLogout}
          >
            Log out
          </button>
        </div>
      </section>
    </div>
  );

  async function handleSubmit() {
    setSubmitting(true);
    setMessage('');
    const choices = positions.map((p) => {
      const k = pickFor(p.id);
      return { positionId: p.id, abstain: k.abstain, candidateIds: k.ids };
    });
    try {
      await api('/vote', { method: 'POST', body: { choices } });
      try {
        await api('/logout', { method: 'POST' });
      } catch {
        // log out on this device even if the server is unreachable
      }
      clearSession();
      navigate('/login?studentId=' + encodeURIComponent(student?.studentId || ''));
    } catch (err) {
      setMessage(err.message);
      setSubmitting(false);
    }
  }

  if (status === 'loading') {
    return (
      <main className="ballot-page student-ballot-page">
        <div className="ballot-card student-ballot-card">
          <div className="student-brand">
            <span className="student-brand-mark" aria-hidden="true">CV</span>
            <span>VoTopia</span>
          </div>
          <p className="ballot-note">Getting your ballot ready...</p>
        </div>
      </main>
    );
  }

  if (status === 'blocked') {
    return (
      <main className="ballot-page student-ballot-page">
        <div className="ballot-card student-ballot-card">
          <h1>Ballot unavailable</h1>
          <p className="ballot-note">{message}</p>
          {alreadyVoted && (
            <button
              className="btn-primary student-results-button"
              onClick={() => navigate('/results')}
            >
              View election results
            </button>
          )}
          <button
            className="btn-secondary"
            onClick={() => setLogoutConfirmationOpen(true)}
          >
            Log out
          </button>
        </div>
        {logoutConfirmation}
      </main>
    );
  }

  if (step === 'review') {
    return (
      <main className="ballot-page student-ballot-page">
        <div className="ballot-card student-ballot-card">
          <div className="student-brand">
            <span className="student-brand-mark" aria-hidden="true">CV</span>
            <span>VoTopia</span>
          </div>
          <p className="student-eyebrow">FINAL CHECK</p>
          <h1>Review your ballot</h1>
          <p className="ballot-note">Your vote is final once you submit it.</p>

          {positions.map((p) => {
            const k = pickFor(p.id);
            const names = k.abstain
              ? ['Abstain']
              : p.candidates
                  .filter((c) => k.ids.includes(c.id))
                  .map((c) => c.fullName);
            return (
              <div className="review-row" key={p.id}>
                <span className="review-position">{p.name}</span>
                <span className="review-choice">{names.join(', ')}</span>
              </div>
            );
          })}

          {message && <p className="ballot-error">{message}</p>}

          <div className="ballot-actions">
            <button
              className="btn-secondary"
              onClick={() => setStep('ballot')}
              disabled={submitting}
            >
              Back
            </button>
            <button
              className="btn-primary"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? 'Submitting...' : 'Submit vote'}
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="ballot-page student-ballot-page">
      <div className="ballot-card student-ballot-card">
        <div className="student-ballot-topline">
          <div className="student-brand">
            <span className="student-brand-mark" aria-hidden="true">CV</span>
            <span>VoTopia</span>
          </div>
          <span className="student-ballot-badge">
            OFFICIAL {student?.department || ''} BALLOT
          </span>
        </div>
        <div className="student-ballot-intro">
          <p className="student-eyebrow">YOUR VOICE MATTERS</p>
          <h1>Choose your student leaders</h1>
          <p className="ballot-note">
            Hi {student?.fullName || 'student'}, make your selections for each
            position. You can review everything before submitting.
          </p>
        </div>
        <div className="student-ballot-progress">
          <div>
            <strong>{completedPositions} of {positions.length}</strong>
            <span>positions completed</span>
          </div>
          <div
            className="student-progress-track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={positions.length}
            aria-valuenow={completedPositions}
            aria-label="Ballot completion"
          >
            <span
              style={{
                width:
                  positions.length > 0
                    ? (completedPositions / positions.length) * 100 + '%'
                    : '0%',
              }}
            />
          </div>
        </div>
        <div className="ballot-header">
          <div>
            <h2>Ballot selections</h2>
          </div>
          <button
            className="btn-link"
            onClick={() => setLogoutConfirmationOpen(true)}
          >
            Log out
          </button>
        </div>

        {positions.map((p) => {
          const k = pickFor(p.id);
          const full = !k.abstain && k.ids.length >= p.votesAllowed;
          return (
            <section className="position student-position" key={p.id}>
              <div className="student-position-heading">
                <span className="student-position-tag">POSITION</span>
                <h2>{p.name}</h2>
                {pickFor(p.id).abstain || pickFor(p.id).ids.length > 0 ? (
                  <span className="student-position-done">Done</span>
                ) : null}
              </div>
              <p className="position-hint">
                {p.votesAllowed === 1
                  ? 'Choose 1'
                  : 'Choose up to ' + p.votesAllowed}
                {' · Tap a candidate photo to read their background'}
              </p>

              {p.candidates.map((c) => {
                const checked = k.ids.includes(c.id);
                const disabled = !checked && full && p.votesAllowed > 1;
                return (
                  <div
                    className={
                      'choice' +
                      (checked ? ' selected' : '') +
                      (disabled ? ' disabled' : '')
                    }
                    key={c.id}
                  >
                    <input
                      id={'candidate-' + c.id}
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => toggleCandidate(p, c.id)}
                    />
                    <button
                      className="candidate-profile-trigger"
                      type="button"
                      aria-label={'View ' + c.fullName + "'s background"}
                      onClick={() => setProfileCandidate(c)}
                    >
                      {c.photoUrl ? (
                        <img className="avatar" src={c.photoUrl} alt="" />
                      ) : (
                        <span className="avatar placeholder" aria-hidden="true">
                          {c.fullName.charAt(0)}
                        </span>
                      )}
                    </button>
                    <label className="choice-text" htmlFor={'candidate-' + c.id}>
                      <strong>{c.fullName}</strong>
                      <small>
                        {[c.course, c.yearSection, c.partylist]
                          .filter(Boolean)
                          .join(' · ')}
                      </small>
                    </label>
                  </div>
                );
              })}

              <label
                className={'choice abstain' + (k.abstain ? ' selected' : '')}
              >
                <input
                  type="checkbox"
                  checked={k.abstain}
                  onChange={() => toggleAbstain(p)}
                />
                <span className="choice-text">
                  <strong>Abstain</strong>
                </span>
              </label>
            </section>
          );
        })}

        <button
          className="btn-primary"
          disabled={!complete}
          onClick={() => setStep('review')}
        >
          Review my ballot
        </button>
        {!complete && (
          <p className="ballot-note center">
            Choose a candidate or Abstain for every position to continue.
          </p>
        )}
      </div>
      {profileCandidate && (
        <CandidateProfileModal
          candidate={profileCandidate}
          onClose={() => setProfileCandidate(null)}
        />
      )}
      {logoutConfirmation}
    </main>
  );
}