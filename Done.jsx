import { Link, useNavigate } from 'react-router-dom';
import { api, clearSession } from '../api/client';
import '../styles/auth.css';

export default function Done() {
  const navigate = useNavigate();

  async function handleLogout() {
    try {
      await api('/logout', { method: 'POST' });
    } catch {
      // Clear this device's session even if the server cannot be reached.
    } finally {
      clearSession();
      navigate('/login');
    }
  }

  return (
    <main className="auth-page student-auth-page">
      <div className="student-auth-layout single">
        <section className="auth-card student-auth-card student-success-card">
          <span className="student-success-icon" aria-hidden="true">✓</span>
          <p className="student-eyebrow">BALLOT SUBMITTED</p>
          <h2>Thanks for showing up.</h2>
          <p className="auth-sub">Your vote has been recorded securely.</p>
          <Link className="auth-button-link" to="/results">
            View live results
          </Link>
          <button type="button" onClick={handleLogout}>
            Log out
          </button>
        </section>
      </div>
    </main>
  );
}