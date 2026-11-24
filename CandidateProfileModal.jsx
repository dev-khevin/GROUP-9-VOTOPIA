import { useEffect } from 'react';

export default function CandidateProfileModal({ candidate, onClose }) {
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="candidate-profile-overlay"
      onClick={onClose}
      role="presentation"
    >
      <section
        className="candidate-profile-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="candidate-profile-name"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          className="candidate-profile-close"
          type="button"
          onClick={onClose}
          aria-label="Close candidate profile"
        >
          &times;
        </button>
        {candidate.photoUrl ? (
          <img
            className="candidate-profile-photo"
            src={candidate.photoUrl}
            alt=""
          />
        ) : (
          <span className="candidate-profile-photo placeholder" aria-hidden="true">
            {candidate.fullName.charAt(0)}
          </span>
        )}
        <h2 id="candidate-profile-name">{candidate.fullName}</h2>
        {(candidate.course || candidate.yearSection || candidate.partylist) && (
          <p className="candidate-profile-meta">
            {[candidate.course, candidate.yearSection, candidate.partylist]
              .filter(Boolean)
              .join(' · ')}
          </p>
        )}
        <div className="candidate-profile-background">
          {candidate.background || 'Background not provided.'}
        </div>
      </section>
    </div>
  );
}
