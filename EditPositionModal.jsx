import { useState } from 'react';
import { adminApi } from '../api/admin';

export default function EditPositionModal({
  mode,
  position,
  onClose,
  onSaved,
}) {
  const isEdit = mode === 'edit';
  const [form, setForm] = useState({
    name: position?.name || '',
    votesAllowed: position?.votesAllowed || 1,
    sortOrder: position?.sortOrder ?? '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function changeVotes(delta) {
    const next = Math.min(
      20,
      Math.max(1, Number(form.votesAllowed || 1) + delta)
    );
    setForm({ ...form, votesAllowed: next });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      if (isEdit) {
        await adminApi('/candidate-list/positions/' + position.id, {
          method: 'PUT',
          body: form,
        });
      } else {
        await adminApi('/candidate-list/positions', {
          method: 'POST',
          body: form,
        });
      }
      onSaved(isEdit ? 'Position updated.' : 'Position added.');
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2>{isEdit ? 'Edit position' : 'Add position'}</h2>

        <form onSubmit={handleSubmit}>
          <label>
            Position name
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="President"
              required
            />
          </label>

          <label>
            Votes allowed per student
            <div className="stepper">
              <button
                type="button"
                onClick={() => changeVotes(-1)}
                disabled={form.votesAllowed <= 1}
              >
                −
              </button>
              <input
                type="number"
                min="1"
                max="20"
                value={form.votesAllowed}
                onChange={(e) =>
                  setForm({ ...form, votesAllowed: Number(e.target.value) })
                }
              />
              <button
                type="button"
                onClick={() => changeVotes(1)}
                disabled={form.votesAllowed >= 20}
              >
                +
              </button>
            </div>
          </label>

          <label>
            Order on the ballot (optional)
            <input
              type="number"
              value={form.sortOrder}
              onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
              placeholder="Leave blank to add at the end"
            />
          </label>

          {error && <p className="admin-error">{error}</p>}

          <div className="modal-actions">
            <button
              type="button"
              className="admin-btn secondary"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button type="submit" className="admin-btn" disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}