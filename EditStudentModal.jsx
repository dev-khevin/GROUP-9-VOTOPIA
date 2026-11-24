import { useState } from 'react';
import { adminApi } from '../api/admin';

export default function EditStudentModal({
  mode,
  student,
  status,
  onClose,
  onSaved,
}) {
  const isEdit = mode === 'edit';
  const isNameCorrection = mode === 'correct-name';
  const pinOptional = isEdit && status !== 'draft';
  const [form, setForm] = useState({
    studentId: student?.studentId || '',
    fullName: student?.fullName || '',
    course: student?.course || '',
    yearSection: student?.yearSection || '',
    pin: student?.pin || '',
  });
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      let result;
      if (isNameCorrection) {
        result = await adminApi(
          '/voter-list/students/' + student.id + '/correct-name',
          { method: 'PUT', body: { fullName: form.fullName } }
        );
      } else if (isEdit) {
        await adminApi('/voter-list/students/' + student.id, {
          method: 'PUT',
          body: form,
        });
      } else {
        await adminApi('/voter-list/students', { method: 'POST', body: form });
      }
      onSaved(
        isNameCorrection
          ? result.changed
            ? 'Student name corrected.'
            : 'Student name unchanged.'
          : isEdit
            ? 'Student updated.'
            : 'Student added.'
      );
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2>
          {isNameCorrection
            ? 'Correct student name'
            : isEdit
              ? 'Edit student'
              : 'Add student'}
        </h2>

        <form onSubmit={handleSubmit}>
          {!isNameCorrection && (
            <label>
              Student ID
              <input
                value={form.studentId}
                inputMode="numeric"
                maxLength={5}
                onChange={(e) =>
                  setForm({
                    ...form,
                    studentId: e.target.value.replace(/\D/g, '').slice(0, 5),
                  })
                }
                placeholder="10111"
                required
              />
            </label>
          )}

          <label>
            {isNameCorrection ? 'Corrected full name' : 'Full name'}
            <input
              value={form.fullName}
              onChange={set('fullName')}
              required
              autoFocus={isNameCorrection}
            />
          </label>

          {!isNameCorrection && (
            <div className="modal-row">
              <label>
                Course
                <input value={form.course} onChange={set('course')} />
              </label>
              <label>
                Year / Section
                <input
                  value={form.yearSection}
                  onChange={set('yearSection')}
                  placeholder="3-S1"
                />
              </label>
            </div>
          )}

          {!isNameCorrection && (
            <>
              <label>
                4-digit PIN
                <input
                  type={showPin ? 'text' : 'password'}
                  inputMode="numeric"
                  maxLength={4}
                  value={form.pin}
                  onChange={(e) =>
                    setForm({ ...form, pin: e.target.value.replace(/\D/g, '') })
                  }
                  placeholder={
                    pinOptional ? 'Leave blank to keep the current PIN' : ''
                  }
                  required={!pinOptional}
                />
              </label>

              <label className="inline-check">
                <input
                  type="checkbox"
                  checked={showPin}
                  onChange={(e) => setShowPin(e.target.checked)}
                />
                Show PIN
              </label>
            </>
          )}

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
              {saving
                ? 'Saving...'
                : isNameCorrection
                  ? 'Save corrected name'
                  : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}