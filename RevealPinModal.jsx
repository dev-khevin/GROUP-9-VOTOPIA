import { useEffect, useState } from 'react';
import { adminApi } from '../api/admin';

export default function RevealPinModal({ student, onClose }) {
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Hide the PIN again after 30 seconds
  useEffect(() => {
    if (!pin) return undefined;
    const timer = setTimeout(onClose, 30000);
    return () => clearTimeout(timer);
  }, [pin, onClose]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await adminApi(
        '/voter-list/students/' + student.id + '/reveal-pin',
        { method: 'POST', body: { password } }
      );
      setPin(data.pin);
      setPassword('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2>PIN for {student.fullName}</h2>
        <p className="admin-note">{student.studentId}</p>

        {pin ? (
          <>
            <div className="pin-display">{pin}</div>
            <p className="admin-note">
              Give this to the student in person after checking their school ID.
              This view is recorded in the change log. It hides itself after 30
              seconds.
            </p>
            <div className="modal-actions">
              <button className="admin-btn" onClick={onClose}>
                Done
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <label>
              Enter your admin password to view this PIN
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                autoFocus
                required
              />
            </label>

            {error && <p className="admin-error">{error}</p>}

            <div className="modal-actions">
              <button
                type="button"
                className="admin-btn secondary"
                onClick={onClose}
                disabled={loading}
              >
                Cancel
              </button>
              <button type="submit" className="admin-btn" disabled={loading}>
                {loading ? 'Checking...' : 'Show PIN'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}