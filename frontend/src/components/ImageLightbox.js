import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

// Mirrors backend/server.js nameSlug() — units resolve to the same image file when
// their slugs match, even if the raw name text differs slightly (punctuation, case,
// stray whitespace) between faction entries. Used to dedupe cross-faction units
// (e.g. Kragnos) by actual image identity rather than exact name-string equality.
export function nameSlug(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export default function ImageLightbox({ unit, hasPrev, hasNext, onClose, onPrev, onNext }) {
  const modalRef = useRef(null);
  const [imgError, setImgError] = useState(false);

  useEffect(() => { setImgError(false); }, [unit?.id]);

  useEffect(() => {
    const h = e => {
      if (e.key === 'Escape')      onClose();
      if (e.key === 'ArrowLeft')  { e.preventDefault(); onPrev?.(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); onNext?.(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose, onPrev, onNext]);

  // Click outside the image/controls: close
  useEffect(() => {
    const h = e => {
      if (modalRef.current?.contains(e.target)) return;
      onClose();
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  if (!unit) return null;

  return (
    <>
      <div className="gw-overlay" />
      <div ref={modalRef}>
        {hasPrev && (
          <button className="img-lightbox-arrow img-lightbox-arrow-left" onClick={onPrev} title="Previous (←)">‹</button>
        )}
        {hasNext && (
          <button className="img-lightbox-arrow img-lightbox-arrow-right" onClick={onNext} title="Next (→)">›</button>
        )}
        <div className="img-lightbox" role="dialog" aria-modal="true" aria-label={unit.name}>
          <button className="gw-close" onClick={onClose} title="Close (Esc)">✕</button>
          {imgError ? (
            <div className="img-lightbox-noimg">No image available</div>
          ) : (
            <img
              key={unit.id}
              src={`${axios.defaults.baseURL || ''}/api/unit-image/${unit.id}`}
              alt={unit.name}
              className="img-lightbox-img"
              onError={() => setImgError(true)}
            />
          )}
          <div className="img-lightbox-caption">{unit.name}</div>
        </div>
      </div>
    </>
  );
}
