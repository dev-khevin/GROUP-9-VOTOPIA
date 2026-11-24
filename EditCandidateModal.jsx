import { useEffect, useState } from 'react';
import { adminApi, adminUpload } from '../api/admin';

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_BACKGROUND = 2000;

export default function EditCandidateModal({
  mode,
  candidate,
  positions,
  onClose,
  onSaved,
}) {
  const isEdit = mode === 'edit';
  const [form, setForm] = useState({
    studentId: candidate?.studentId || '',
    fullName: candidate?.fullName || '',
    course: candidate?.course || '',
    yearSection: candidate?.yearSection || '',
    partylist: candidate?.partylist || '',
    background: candidate?.background || '',
    positionId: candidate?.positionId || positions[0]?.id || '',
  });
  const [photoFile, setPhotoFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [removePhoto, setRemovePhoto] = useState(false);
  const [fileKey, setFileKey] = useState(0);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  useEffect(() => {
    if (!photoFile) {
      setPreview('');
      return undefined;
    }
    const url = URL.createObjectURL(photoFile);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  function chooseFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setError('Choose a JPG or PNG photo.');
      setFileKey((k) => k + 1);
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('The photo must be 2 MB or smaller.');
      setFileKey((k) => k + 1);
      return;
    }
    setError('');
    setPhotoFile(file);
    setRemovePhoto(false);
  }

  function clearPhoto() {
    setPhotoFile(null);
    setFileKey((k) => k + 1);
    if (candidate?.photoUrl) setRemovePhoto(true);
  }

  const currentPhoto =
    !removePhoto && !photoFile ? candidate?.photoUrl || '' : '';
  const shown = preview || currentPhoto;
  const backgroundLength = form.background.trim().length;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);

    let id = candidate?.id;
    try {
      if (isEdit) {
        await adminApi('/candidate-list/candidates/' + id, {
          method: 'PUT',
          body: form,
        });
      } else {
        const created = await adminApi('/candidate-list/candidates', {
          method: 'POST',
          body: form,
        });
        id = created.id;
      }
    } catch (err) {
      setError(err.message);
      setSaving(false);
      return;
    }

    const savedText = isEdit ? 'Candidate updated.' : 'Candidate added.';
    try {
      if (photoFile) {
        const data = new FormData();
        data.append('photo', photoFile);
        await adminUpload('/candidate-list/candidates/' + id + '/photo', data);
      } else if (removePhoto && candidate?.photoUrl) {
        await adminApi('/candidate-list/candidates/' + id + '/photo', {
          method: 'DELETE',
        });
      }
    } catch (err) {
      onSaved(
        savedText + ' The photo could not be saved: ' + err.message
      );
      return;
    }
    onSaved(savedText);
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2>{isEdit ? 'Edit candidate' : 'Add candidate'}</h2>

        <form onSubmit={handleSubmit}>
          <div className="photo-field">
            {shown ? (
              <img className="photo-preview" src={shown} alt="Candidate" />
            ) : (
              <div className="photo-preview empty">No photo</div>
            )}
            <div className="photo-controls">
              <input
                key={fileKey}
                type="file"
                accept="image/png,image/jpeg"
                onChange={chooseFile}
              />
              <small>JPG or PNG, up to 2 MB. A clear head-and-shoulders photo works best.</small>
              {shown && (
                <button
                  type="button"
                  className="mini danger"
                  onClick={clearPhoto}
                >
                  Remove photo
                </button>
              )}
            </div>
          </div>

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

          <label>
            Full name
            <input value={form.fullName} onChange={set('fullName')} required />
          </label>

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

          <label>
            Position
            <select value={form.positionId} onChange={set('positionId')} required>
              {positions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Partylist (optional)
            <input value={form.partylist} onChange={set('partylist')} />
          </label>

          <label>
            Candidate background
            <textarea
              value={form.background}
              onChange={set('background')}
              rows={6}
              placeholder="Share the candidate's experience, goals, and background."
              required
            />
            <small
              className={
                backgroundLength >= 1900
                  ? 'background-counter warning'
                  : 'background-counter'
              }
              aria-live="polite"
            >
              {backgroundLength} / {MAX_BACKGROUND}
            </small>
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
            <button
              type="submit"
              className="admin-btn"
              disabled={
                saving ||
                backgroundLength === 0 ||
                backgroundLength > MAX_BACKGROUND
              }
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}