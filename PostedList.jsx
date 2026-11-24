import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import '../styles/auth.css';

export const ADMIN_CONTACT = 'SSC OFFICE';

export default function PostedList() {
  const [loading, setLoading] = useState(true);
  const [networkError, setNetworkError] = useState(false);
  const [data, setData] = useState(null);
  const [department, setDepartment] = useState('LEGACY');
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(50);

  const load = useCallback(async () => {
    setLoading(true);
    setNetworkError(false);
    try {
      const response = await fetch(
        '/api/posted-list?department=' + encodeURIComponent(department)
      );
      if (!response.ok) throw new Error('Request failed');
      setData(await response.json());
    } catch {
      setNetworkError(true);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [department]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredStudents = useMemo(() => {
    const normalizedSearch = search.trim().replace(/\s+/g, ' ').toLowerCase();
    const students = data?.students || [];
    if (!normalizedSearch) return students;
    return students.filter((student) =>
      String(student.fullName || '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase()
        .includes(normalizedSearch)
    );
  }, [data, search]);

  function handleSearchChange(event) {
    setSearch(event.target.value);
    setVisibleCount(50);
  }

  const allStudents = data?.students || [];
  const normalizedSearch = search.trim().replace(/\s+/g, ' ');
  const studentCountText =
    normalizedSearch
      ? `${filteredStudents.length} of ${allStudents.length} students`
      : `${filteredStudents.length} students`;

  return (
    <main className="auth-page student-auth-page" data-department={department}>
      <div className="student-auth-layout single posted-list-layout">
        <section className="auth-card student-auth-card posted-list-card">
          <div className="public-page-brand">
            <span className="public-page-brand-mark" aria-hidden="true">
              <svg viewBox="0 0 44 44" role="presentation">
                <path d="M8 20h28v17H8zM13 20v-7h18v7M16 30l4 4 8-9" />
              </svg>
            </span>
            <strong>VOTOPIA</strong>
          </div>
          <label>
            Department
            <select
              value={department}
              onChange={(event) => {
                setDepartment(event.target.value);
                setSearch('');
                setVisibleCount(50);
              }}
            >
              <option value="LEGACY">SSC Voting</option>
              <option value="BSIT">BSIT</option>
              <option value="BSBA">BSBA</option>
              <option value="BSCE">BSCE</option>
            </select>
          </label>
          {loading && <p className="posted-list-message">Loading the student list...</p>}

          {!loading && networkError && (
            <div className="posted-list-state">
              <p className="posted-list-message">
                Could not load the list. Please try again.
              </p>
              <button type="button" onClick={load}>
                Try again
              </button>
            </div>
          )}

          {!loading && !networkError && data && !data.available && (
            <p className="posted-list-message">
              The student list is not posted yet. Please check again later.
            </p>
          )}

          {!loading && !networkError && data?.available && allStudents.length === 0 && (
            <p className="posted-list-message">
              The student list is no longer available.
            </p>
          )}

          {!loading && !networkError && data?.available && allStudents.length > 0 && (
            <>
              <p className="student-eyebrow">PUBLIC VOTER LIST</p>
              <h2>
                {data.departmentId === 'LEGACY'
                  ? 'SSC Voting List'
                  : `${data.departmentId} student list`}
              </h2>
              <p className="auth-sub">
                Check that your name, course, and year/section are correct.
                If something is wrong, tell the election admin before voting opens:{' '}
                {ADMIN_CONTACT}
              </p>

              <label className="posted-list-search" htmlFor="posted-list-search">
                Search by name
                <input
                  id="posted-list-search"
                  type="search"
                  value={search}
                  onChange={handleSearchChange}
                  placeholder="Enter a full name"
                />
              </label>

              <p className="posted-list-count" aria-live="polite">
                {studentCountText}
              </p>

              {filteredStudents.length === 0 ? (
                <p className="posted-list-message">
                  No student found with that name.
                </p>
              ) : (
                <>
                  <div className="posted-list-table-wrap">
                    <table className="posted-list-table">
                      <thead>
                        <tr>
                          <th scope="col">Name</th>
                          <th scope="col">Course</th>
                          <th scope="col">Year/Section</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredStudents.slice(0, visibleCount).map((student, index) => (
                          <tr key={`${student.fullName}-${index}`}>
                            <td>{student.fullName}</td>
                            <td>{student.course}</td>
                            <td>{student.yearSection}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {visibleCount < filteredStudents.length && (
                    <button
                      type="button"
                      className="posted-list-more"
                      onClick={() => setVisibleCount((count) => count + 50)}
                    >
                      Show more
                    </button>
                  )}
                </>
              )}
            </>
          )}

          <p className="auth-link posted-list-back">
            <Link to="/login">Back to login</Link>
          </p>
        </section>
      </div>
    </main>
  );
}
