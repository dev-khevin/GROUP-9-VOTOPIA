import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getAdminDepartment, getAdminToken } from '../api/admin';
import { getToken } from '../api/client';
import CandidateProfileModal from '../components/CandidateProfileModal';
import '../styles/results.css';
import '../styles/candidate-profile.css';

const STATUS_TEXT = {
  not_started: 'Voting has not started yet.',
  open: 'Voting is in progress. Results update automatically.',
  closed: 'Voting is closed. These are the final results.',
};

export default function Results() {
  const navigate = useNavigate();
  const isAdmin = !!getAdminToken();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [profileCandidate, setProfileCandidate] = useState(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const token = isAdmin ? getAdminToken() : getToken();
        const res = await fetch('/api/results', {
          headers: {
            ...(token ? { Authorization: 'Bearer ' + token } : {}),
            ...(isAdmin ? { 'X-Department': getAdminDepartment() } : {}),
          },
        });
        const json = await res.json();
        if (res.status === 401) {
          navigate(isAdmin ? '/admin/login' : '/login', { replace: true });
          return;
        }
        if (!res.ok) throw new Error(json.error || 'Could not load results.');
        if (active) {
          setData(json);
          setError('');
        }
      } catch {
        if (active) setError('Could not load results. Retrying...');
      }
    }

    load();
    const timer = setInterval(load, 2000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [isAdmin, navigate]);

  if (!data) {
    return (
      <main className="results-page">
        <p className="results-note">{error || 'Loading results...'}</p>
      </main>
    );
  }

  const turnout =
    data.eligibleVoters > 0
      ? Math.round((data.totalVoters / data.eligibleVoters) * 100)
      : 0;

  return (
    <main className="results-page">
      <div className="results-card">
        <h1>{data.department} Election Results</h1>
        <p className="results-note">{STATUS_TEXT[data.pollStatus]}</p>
        <p className="results-note">
          Select a candidate photo to view their background.
        </p>
        {error && <p className="results-error">{error}</p>}
        {!isAdmin && (
          <Link className="results-link results-vote-link" to="/ballot">
            Vote now
          </Link>
        )}

        <div className="turnout">
          <strong>
            {data.totalVoters} of {data.eligibleVoters} students voted
          </strong>
          <div className="bar">
            <div className="bar-fill" style={{ width: turnout + '%' }} />
          </div>
          <small>{turnout}% turnout</small>
        </div>

        {data.hidden && (
          <p className="results-note">
            Candidate totals will be shown when voting closes.
          </p>
        )}

        {data.positions.map((p) => (
          <section className="result-position" key={p.id}>
            <h2>{p.name}</h2>

            {p.candidates.map((c) => {
              const width =
                data.totalVoters > 0 ? (c.votes / data.totalVoters) * 100 : 0;
              return (
                <div className="result-row" key={c.id}>
                  <div className="result-candidate">
                    <button
                      className="result-photo-trigger"
                      type="button"
                      aria-label={'View ' + c.fullName + "'s background"}
                      onClick={() => setProfileCandidate(c)}
                    >
                      {c.photoUrl ? (
                        <img className="result-photo" src={c.photoUrl} alt="" />
                      ) : (
                        <span className="result-photo placeholder" aria-hidden="true">
                          {c.fullName.charAt(0)}
                        </span>
                      )}
                    </button>
                    <div className="result-body">
                      <div className="result-line">
                        <span>
                          {c.fullName}
                          {c.partylist ? ' (' + c.partylist + ')' : ''}
                        </span>
                        <strong>{c.votes} votes</strong>
                      </div>
                      <div className="bar">
                        <div
                          className="bar-fill"
                          style={{ width: width + '%' }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            <div className="result-row">
              <div className="result-line muted">
                <span>Abstain</span>
                <strong>{p.abstain}</strong>
              </div>
            </div>
          </section>
        ))}
         <Link
           className="results-link"
           to={
             isAdmin
               ? '/admin'
               : '/login' + (new URLSearchParams(window.location.search).get('studentId') ? '?studentId=' + encodeURIComponent(new URLSearchParams(window.location.search).get('studentId')) : '')
           }
         >
          {isAdmin ? 'Back to admin dashboard' : 'Back to login'}
         </Link>

        
      </div>
      {profileCandidate && (
         <CandidateProfileModal
           candidate={profileCandidate}
           onClose={() => setProfileCandidate(null)}
         />
      )}
    </main>
  );
}