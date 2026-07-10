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

// The 4 Warlord Paths (core rules pgs 256-261) — Mage/Devout are restricted
// to Wizard/Priest warlords respectively.
const PATHS = [
  { key: 'warrior', name: 'Path of the Warrior', restricted: null,
    desc: 'Warlords who walk this Path pride their martial prowess and strength above all else.' },
  { key: 'leader', name: 'Path of the Leader', restricted: null,
    desc: 'The tactical acumen of this warlord is their greatest asset. Even in the heat of battle, they can spot weaknesses in the enemy line and exploit them without mercy.' },
  { key: 'mage', name: 'Path of the Mage', restricted: 'Wizard only',
    desc: 'To walk this Path, your warlord must already have some proficiency in the arcane arts. By the end, they will be able to shape the very realms.' },
  { key: 'devout', name: 'Path of the Devout', restricted: 'Priest only',
    desc: 'With an unshakable faith to guide them, this warlord has been chosen by their patron deity for a greater purpose (or so they claim!).' },
];

const DOC_TITLES = {
  hero: 'Hero Warscroll',
  oob: 'Order of Battle',
  roster: 'Army Roster',
};

function DocThumb({ id, title, active, onClick, lines }) {
  return (
    <button
      className={`ptg-doc-thumb${active ? ' ptg-doc-thumb-active' : ''}`}
      onClick={() => onClick(id)}
      title={`Click to edit your ${title}`}
    >
      <div className="ptg-doc-thumb-header">{title}</div>
      <div className="ptg-doc-thumb-preview">
        {lines.map((w, i) => (
          <div key={i} className={`ptg-doc-thumb-line${i === 0 ? ' ptg-doc-thumb-line-title' : ''}${w === 'short' ? ' short' : ''}`} />
        ))}
      </div>
    </button>
  );
}

export default function PathToGloryWizard({ onClose }) {
  const [step, setStep] = useState(0);
  const [activeDoc, setActiveDoc] = useState(null); // null | 'hero' | 'oob' | 'roster'
  const modalRef = useRef(null);

  // ── Step 0: Campaign ──
  const [campaign, setCampaign] = useState(null);
  const [customCampaignName, setCustomCampaignName] = useState('');

  // ── Hero Warscroll (Warlord) ──
  const [heroName, setHeroName] = useState('');
  const [heroPoints, setHeroPoints] = useState('');
  const [heroPath, setHeroPath] = useState(null);

  // ── Order of Battle ──
  const [units, setUnits] = useState([]);
  const addUnit = () => setUnits(u => [...u, { id: `${Date.now()}-${u.length}`, name: '', points: '' }]);
  const updateUnit = (id, field, value) => setUnits(u => u.map(x => x.id === id ? { ...x, [field]: value } : x));
  const removeUnit = id => setUnits(u => u.filter(x => x.id !== id));
  const totalPoints = (parseInt(heroPoints, 10) || 0) + units.reduce((sum, u) => sum + (parseInt(u.points, 10) || 0), 0);

  // ── Army Roster ──
  const [armyName, setArmyName] = useState('');
  const [realmOfOrigin, setRealmOfOrigin] = useState('');
  const [battleFormation, setBattleFormation] = useState('');
  const [gloryPoints, setGloryPoints] = useState('0');
  const [questLog, setQuestLog] = useState('');

  useEffect(() => {
    const h = e => {
      if (e.key === 'Escape') onClose();
      if (activeDoc) return; // arrow keys only navigate wizard steps, not while editing a document
      if (e.key === 'ArrowLeft')  { e.preventDefault(); setStep(s => Math.max(0, s - 1)); }
      if (e.key === 'ArrowRight') { e.preventDefault(); setStep(s => Math.min(STEPS.length - 1, s + 1)); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose, activeDoc]);

  useEffect(() => {
    const h = e => {
      if (modalRef.current?.contains(e.target)) return;
      onClose();
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  const heroLines = [heroName || 'No warlord chosen yet', heroPath ? PATHS.find(p => p.key === heroPath)?.name : 'short', 'short'];
  const oobLines = units.length
    ? [`${units.length} unit${units.length === 1 ? '' : 's'} · ${totalPoints}pts`, 'short', 'short']
    : ['No units added yet', 'short'];
  const rosterLines = [armyName || 'Unnamed army', realmOfOrigin || 'short', battleFormation || 'short'];

  return (
    <>
      <div className="gw-overlay" />
      <div className="ptg-wizard" ref={modalRef} role="dialog" aria-modal="true" aria-label="Recruit Your Forces">
        <button className="gw-close" onClick={onClose} title="Close (Esc)">✕</button>

        <div className="ptg-wizard-header">
          <div className="ptg-wizard-title">Recruit Your Forces</div>
        </div>

        <div className="ptg-doc-tray">
          <DocThumb id="hero"   title={DOC_TITLES.hero}   active={activeDoc === 'hero'}   onClick={setActiveDoc} lines={heroLines} />
          <DocThumb id="oob"    title={DOC_TITLES.oob}    active={activeDoc === 'oob'}    onClick={setActiveDoc} lines={oobLines} />
          <DocThumb id="roster" title={DOC_TITLES.roster} active={activeDoc === 'roster'} onClick={setActiveDoc} lines={rosterLines} />
        </div>

        {activeDoc ? (
          <>
            <div className="ptg-doc-editor-header">
              <button className="ptg-wizard-nav-btn" onClick={() => setActiveDoc(null)}>‹ Back to Wizard</button>
              <div className="ptg-doc-editor-title">{DOC_TITLES[activeDoc]}</div>
            </div>

            <div className="ptg-doc-editor-body">
              {activeDoc === 'hero' && (
                <>
                  <div className="ptg-field">
                    <label>Warlord Name</label>
                    <input type="text" value={heroName} onChange={e => setHeroName(e.target.value)} placeholder="e.g. Iladrien the Bright" />
                  </div>
                  <div className="ptg-field">
                    <label>Points (single model, ≤300pts, not Unique)</label>
                    <input type="text" value={heroPoints} onChange={e => setHeroPoints(e.target.value)} placeholder="e.g. 140" />
                  </div>
                  <div className="ptg-field">
                    <label>Starting Rank</label>
                    <div className="ptg-readonly-pill">Aspiring · 5 Renown points</div>
                  </div>
                  <div className="ptg-field">
                    <label>Warlord's Path</label>
                    <div className="ptg-campaign-grid">
                      {PATHS.map(p => (
                        <button
                          key={p.key}
                          className={`ptg-campaign-card${heroPath === p.key ? ' ptg-campaign-selected' : ''}`}
                          onClick={() => setHeroPath(p.key)}
                        >
                          <div className="ptg-campaign-name">{p.name}</div>
                          <div className="ptg-campaign-desc">{p.desc}</div>
                          {p.restricted && <div className="ptg-campaign-soon">{p.restricted}</div>}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {activeDoc === 'oob' && (
                <>
                  <div className="ptg-oob-cap">
                    Starting units + Warlord must total <strong>1000 points</strong> or fewer.{' '}
                    <span className={totalPoints > 1000 ? 'ptg-oob-over' : ''}>Current total: {totalPoints}pts</span>
                  </div>
                  {units.length === 0 && <div className="ptg-oob-empty">No units added yet.</div>}
                  {units.map(u => (
                    <div className="ptg-oob-row" key={u.id}>
                      <input type="text" placeholder="Unit name" value={u.name} onChange={e => updateUnit(u.id, 'name', e.target.value)} />
                      <input type="text" placeholder="Pts" value={u.points} onChange={e => updateUnit(u.id, 'points', e.target.value)} style={{ maxWidth: '80px' }} />
                      <button className="ptg-oob-row-remove" onClick={() => removeUnit(u.id)} title="Remove unit">✕</button>
                    </div>
                  ))}
                  <button className="ptg-wizard-nav-btn ptg-oob-add-btn" onClick={addUnit}>+ Add Unit</button>
                </>
              )}

              {activeDoc === 'roster' && (
                <>
                  <div className="ptg-field">
                    <label>Army Name</label>
                    <input type="text" value={armyName} onChange={e => setArmyName(e.target.value)} placeholder="e.g. The Sundered Vanguard" />
                  </div>
                  <div className="ptg-field">
                    <label>Realm of Origin</label>
                    <input type="text" value={realmOfOrigin} onChange={e => setRealmOfOrigin(e.target.value)} placeholder="e.g. Hysh" />
                  </div>
                  <div className="ptg-field">
                    <label>Battle Formation</label>
                    <input type="text" value={battleFormation} onChange={e => setBattleFormation(e.target.value)} />
                  </div>
                  <div className="ptg-field">
                    <label>Glory Points</label>
                    <input type="text" value={gloryPoints} onChange={e => setGloryPoints(e.target.value)} style={{ maxWidth: '100px' }} />
                  </div>
                  <div className="ptg-field">
                    <label>Quest Log</label>
                    <textarea rows={3} value={questLog} onChange={e => setQuestLog(e.target.value)} placeholder="Current quest and progress notes…" />
                  </div>
                </>
              )}
            </div>
          </>
        ) : (
          <>
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
          </>
        )}
      </div>
    </>
  );
}
