import React, { useState, useEffect, useRef } from 'react';

const STEPS = [
  'Select your Campaign',
  'Pick your Faction',
  'Pick your Warlord',
  'Pick your Warlord Path',
  'Add your Starting units',
  'Add your Enhancements',
  'Add your Lores',
  'Pick your First Quest',
  'Prepare for Battle',
];

export default function PathToGloryWizard({ onClose }) {
  const [step, setStep] = useState(0);
  const modalRef = useRef(null);

  useEffect(() => {
    const h = e => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft')  { e.preventDefault(); setStep(s => Math.max(0, s - 1)); }
      if (e.key === 'ArrowRight') { e.preventDefault(); setStep(s => Math.min(STEPS.length - 1, s + 1)); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  useEffect(() => {
    const h = e => {
      if (modalRef.current?.contains(e.target)) return;
      onClose();
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  return (
    <>
      <div className="gw-overlay" />
      <div className="ptg-wizard" ref={modalRef} role="dialog" aria-modal="true" aria-label="Recruit Your Forces">
        <button className="gw-close" onClick={onClose} title="Close (Esc)">✕</button>

        <div className="ptg-wizard-header">
          <div className="ptg-wizard-title">Recruit Your Forces</div>
        </div>

        <div className="ptg-wizard-steps">
          {STEPS.map((label, i) => (
            <button
              key={i}
              className={`ptg-wizard-step${i === step ? ' ptg-wizard-step-active' : ''}${i < step ? ' ptg-wizard-step-done' : ''}`}
              onClick={() => setStep(i)}
              title={label}
            >
              <span className="ptg-wizard-step-num">{i}</span>
              <span className="ptg-wizard-step-label">{label}</span>
            </button>
          ))}
        </div>

        <div className="ptg-wizard-body">
          <div className="ptg-wizard-body-title">{step}. {STEPS[step]}</div>
          <div className="ptg-wizard-body-placeholder">Coming soon.</div>
        </div>

        <div className="ptg-wizard-nav">
          <button className="ptg-wizard-nav-btn" onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0}>
            ‹ Back
          </button>
          <button className="ptg-wizard-nav-btn" onClick={() => setStep(s => Math.min(STEPS.length - 1, s + 1))} disabled={step === STEPS.length - 1}>
            Next ›
          </button>
        </div>
      </div>
    </>
  );
}
