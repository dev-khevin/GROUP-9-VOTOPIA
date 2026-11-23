import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { adminApi, clearAdminSession } from '../../api/admin';
import '../../styles/admin.css';

export const SCHOOL_NAME = '[School Name]';
export const ELECTION_TITLE = '[Election title, e.g. Student Council Election 2026]';

function formatDateTime(value) {
  if (!value) return 'Not recorded';
  const date = new Date(String(value).replace(' ', 'T') + (String(value).includes('T') ? '' : 'Z'));
  return Number.isNaN(date.getTime()) ? 'Not recorded' : date.toLocaleString();
}

function getRanks(candidates) {
  let previousVotes = null;
  let previousRank = 0;
  return candidates.map((candidate, index) => {
    if (candidate.votes !== previousVotes) previousRank = index + 1;
    previousVotes = candidate.votes;
    return { ...candidate, rank: previousRank };
  });
}

function getTieNote(position) {
  const place = position.votesAllowed;
  if (!place || place < 1 || position.candidates.length <= place) return null;
  const atPlace = position.candidates[place - 1];
  const next = position.candidates[place];
  return atPlace.votes === next.votes
    ? `Tie for place ${place}: to be decided under the election rules.`
    : null;
}

export default function ResultsReport() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    adminApi('/results-report')
      .then((report) => {
        if (active) setData(report);
      })
      .catch((err) => {
        if (err.status === 401) {
          clearAdminSession();
          navigate('/admin/login');
        } else if (active) {
          setError(err.message);
        }
      });
    return () => {
      active = false;
    };
  }, [navigate]);

  if (!data) {
    return (
      <main className="admin-page results-report-page">
        <p className="admin-note">{error || 'Loading report...'}</p>
      </main>
    );
  }

  const percentage =
    data.turnout.eligible > 0
      ? (data.turnout.voted / data.turnout.eligible) * 100
      : 0;
  const turnoutText = `${percentage.toFixed(1)}%`;

  function downloadCsv() {
    const rows = [
      ['Department', '', '', '', data.department],
      ['Position', 'Rank', 'Candidate', 'Partylist', 'Votes'],
    ];
    data.positions.forEach((position) => {
      getRanks(position.candidates).forEach((candidate) => {
        rows.push([
          position.name,
          String(candidate.rank),
          candidate.fullName,
          candidate.partylist,
          String(candidate.votes),
        ]);
      });
      rows.push([position.name, '', 'Abstain', '', String(position.abstain)]);
    });
    rows.push(
      ['Turnout voted', '', '', '', String(data.turnout.voted)],
      ['Turnout eligible', '', '', '', String(data.turnout.eligible)],
      ['Report ID', '', '', '', data.reportId],
      ['Status', '', '', '', data.pollStatus],
      ['Mode', '', '', '', data.electionMode]
    );

    function escapeCsvCell(value) {
      let text = String(value ?? '');
      if (/^[=+\-@]/.test(text)) text = "'" + text;
      return '"' + text.replace(/"/g, '""') + '"';
    }

    const csv = '\uFEFF' + rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `votopia-results-${data.reportId}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="admin-page results-report-page">
      <article className="admin-card results-report-card">
        <div className="results-report-actions">
          <button type="button" className="admin-btn" onClick={() => window.print()}>
            Print or save as PDF
          </button>
          <button type="button" className="admin-btn secondary" onClick={downloadCsv}>
            Download CSV
          </button>
          <Link className="admin-btn secondary" to="/admin">
            Back to dashboard
          </Link>
        </div>

        {data.electionMode === 'test' && (
          <div className="results-report-test-banner">
            TEST DATA - this is not an official election result.
          </div>
        )}

        <header className="results-report-header">
          <p className="dashboard-eyebrow">VOTOPIA</p>
          <h1>VoTopia - {data.department} Election Results Report</h1>
          <p>{SCHOOL_NAME}</p>
          <p>{ELECTION_TITLE}</p>
        </header>

        <div
          className={
            'results-report-status ' +
            (data.pollStatus === 'closed' ? 'final' : 'preliminary')
          }
        >
          {data.pollStatus === 'closed'
            ? `FINAL RESULTS - closed ${formatDateTime(data.closedAt)}`
            : 'PRELIMINARY RESULTS - polls are not closed yet'}
        </div>

        <section className="results-report-turnout">
          <strong>
            {data.turnout.voted} of {data.turnout.eligible} students voted ({turnoutText})
          </strong>
          <div
            className="results-report-bar"
            role="progressbar"
            aria-label="Student turnout"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow={Math.round(percentage)}
          >
            <span style={{ width: `${percentage}%` }} />
          </div>
        </section>

        {data.positions.map((position) => {
          const rankedCandidates = getRanks(position.candidates);
          const tieNote = getTieNote(position);
          return (
            <section className="results-report-position" key={position.id}>
              <h2>{position.name}</h2>
              <p className="results-report-votes-allowed">
                Votes per student: {position.votesAllowed}
              </p>
              <table>
                <thead>
                  <tr>
                    <th scope="col">Rank</th>
                    <th scope="col">Candidate</th>
                    <th scope="col">Partylist</th>
                    <th scope="col">Votes</th>
                    <th scope="col">Share of voters</th>
                  </tr>
                </thead>
                <tbody>
                  {rankedCandidates.map((candidate) => {
                    const share =
                      data.turnout.voted > 0
                        ? (candidate.votes / data.turnout.voted) * 100
                        : 0;
                    return (
                      <tr key={candidate.id}>
                        <td>{candidate.rank}</td>
                        <td>{candidate.fullName}</td>
                        <td>{candidate.partylist}</td>
                        <td>{candidate.votes}</td>
                        <td>{share.toFixed(1)}%</td>
                      </tr>
                    );
                  })}
                  <tr className="abstain-row">
                    <td />
                    <td>Abstain</td>
                    <td />
                    <td>{position.abstain}</td>
                    <td>
                      {data.turnout.voted > 0
                        ? ((position.abstain / data.turnout.voted) * 100).toFixed(1)
                        : '0.0'}
                      %
                    </td>
                  </tr>
                </tbody>
              </table>
              {tieNote && <p className="results-report-tie-note">{tieNote}</p>}
            </section>
          );
        })}

        <footer className="results-report-footer">
          <p>Generated on {formatDateTime(data.generatedAt)}</p>
          <p>Report ID: {data.reportId}</p>
          <p>Opened: {formatDateTime(data.openedAt)}</p>
          <p>Closed: {formatDateTime(data.closedAt)}</p>
          <p>
            This report contains vote totals only. No voter information is included.
          </p>
        </footer>
      </article>
    </main>
  );
}
