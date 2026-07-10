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

// GW currently publishes 3 Path to Glory battlepacks — only Ascension's core
// rules are implemented so far, so the other two are shown but disabled.
const CAMPAIGNS = [
  { key: 'ascension',    name: 'Ascension',                 desc: 'The core Path to Glory campaign — forge your warlord’s rise to legend.', available: true },
  { key: 'ravaged-coast', name: 'Ravaged Coast',             desc: 'A narrative Path to Glory battlepack.', available: false },
  { key: 'blighted-wilds', name: 'Blighted Wilds',           desc: 'A narrative Path to Glory battlepack.', available: false },
  { key: 'custom',        name: 'Foreign War of Aggression', desc: 'A custom, homebrew campaign of your own design.', available: true, custom: true },
];

export default function PathToGloryWizard({ onClose }) {
  const [step, setStep] = useState(0);
  const [campaign, setCampaign] = useState(null);
  const [customCampaignName, setCustomCampaignName] = useState('');
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
          {step === 0 ? (
            <>
              <div className="ptg-campaign-grid">
                {CAMPAIGNS.map(c => (
                  <button
                    key={c.key}
                    className={`ptg-campaign-card${campaign === c.key ? ' ptg-campaign-selected' : ''}`}
                    disabled={!c.available}
                    onClick={() => setCampaign(c.key)}
                  >
                    <div className="ptg-campaign-name">{c.name}</div>
                    <div className="ptg-campaign-desc">{c.desc}</div>
                    {!c.available && <div className="ptg-campaign-soon">Coming Soon</div>}
                  </button>
                ))}
              </div>
              {campaign === 'custom' && (
                <input
                  className="ptg-campaign-name-input"
                  type="text"
                  placeholder="Name your campaign…"
                  value={customCampaignName}
                  onChange={e => setCustomCampaignName(e.target.value)}
                />
              )}
            </>
          ) : (
            <div className="ptg-wizard-body-placeholder">Coming soon.</div>
          )}
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
