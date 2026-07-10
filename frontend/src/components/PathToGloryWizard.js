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

// The 4 documents a Path to Glory roster is built from. `images` point at
// scans of the official GW sheets (extracted from the PDFs the user
// provided) — used both for the tray thumbnail and the "Image" presentation.
const DOCS = [
  { key: 'warlord', title: 'Warlord Warscroll', images: ['/ptg/warlord-warscroll.jpg'], thumb: '/ptg/warlord-warscroll-thumb.jpg' },
  { key: 'roster',  title: 'Path to Glory Roster', images: ['/ptg/ptg-roster.jpg'], thumb: '/ptg/ptg-roster-thumb.jpg' },
  { key: 'oob',     title: 'Order of Battle', images: ['/ptg/order-of-battle.jpg'], thumb: '/ptg/order-of-battle-thumb.jpg' },
  { key: 'army',    title: 'Army Roster', images: ['/ptg/army-roster-1.jpg', '/ptg/army-roster-2.jpg'], thumb: '/ptg/army-roster-1-thumb.jpg' },
];

function DocThumb({ doc, active, onClick }) {
  return (
    <button
      className={`ptg-doc-thumb${active ? ' ptg-doc-thumb-active' : ''}`}
      onClick={() => onClick(doc.key)}
      title={`Click to edit your ${doc.title}`}
    >
      <div className="ptg-doc-thumb-header">{doc.title}</div>
      <div className="ptg-doc-thumb-img-wrap">
        <img src={doc.thumb} alt={doc.title} className="ptg-doc-thumb-img" />
      </div>
    </button>
  );
}

function PresentToggle({ mode, onChange }) {
  return (
    <div className="ptg-present-toggle">
      <button className={mode === 'image' ? 'ptg-present-active' : ''} onClick={() => onChange('image')}>Image</button>
      <button className={mode === 'replica' ? 'ptg-present-active' : ''} onClick={() => onChange('replica')}>Replica</button>
    </div>
  );
}

// Generic "list of editable rows" state helper — used for weapon tables,
// Order of Battle units, and Army Roster unit rows.
function useRowList(initial = []) {
  const [rows, setRows] = useState(initial);
  const add = (extra = {}) => setRows(r => [...r, { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, ...extra }]);
  const update = (id, field, value) => setRows(r => r.map(x => x.id === id ? { ...x, [field]: value } : x));
  const remove = id => setRows(r => r.filter(x => x.id !== id));
  return [rows, add, update, remove, setRows];
}

export default function PathToGloryWizard({ onClose }) {
  const [step, setStep] = useState(0);
  const [activeDoc, setActiveDoc] = useState(null); // null | 'warlord' | 'roster' | 'oob' | 'army'
  const [presentMode, setPresentMode] = useState('replica'); // 'image' | 'replica'
  const modalRef = useRef(null);

  // ── Step 0: Campaign ──
  const [campaign, setCampaign] = useState(null);
  const [customCampaignName, setCustomCampaignName] = useState('');

  // ── Warlord Warscroll ──
  const [warlordName, setWarlordName] = useState('');
  const [warlordKeywords, setWarlordKeywords] = useState('');
  const [rangedWeapons, addRanged, updateRanged, removeRanged] = useRowList([]);
  const [meleeWeapons, addMelee, updateMelee, removeMelee] = useRowList([]);

  // ── Path to Glory Roster ──
  const [armyName, setArmyName] = useState('');
  const [realmOfOrigin, setRealmOfOrigin] = useState('');
  const [faction, setFaction] = useState('');
  const [battleFormation, setBattleFormation] = useState('');
  const [gloryPoints, setGloryPoints] = useState('0');
  const [currentQuest, setCurrentQuest] = useState('');
  const [questPoints, setQuestPoints] = useState('');
  const [questNotes, setQuestNotes] = useState('');
  const [questsCompleted, setQuestsCompleted] = useState('');
  const [background, setBackground] = useState('');
  const [notableEvents, setNotableEvents] = useState('');
  const [spellLore, setSpellLore] = useState(Array(6).fill(''));
  const [prayerLore, setPrayerLore] = useState(Array(6).fill(''));
  const [manifestationLore, setManifestationLore] = useState(Array(6).fill(''));
  const setLoreRow = (setter) => (i, value) => setter(rows => rows.map((r, ri) => ri === i ? value : r));

  // ── Order of Battle ──
  const [warlordRank, setWarlordRank] = useState('Aspiring');
  const [warlordRenown, setWarlordRenown] = useState('5');
  const [warlordEnhancements, setWarlordEnhancements] = useState('');
  const [warlordPath, setWarlordPath] = useState(null);
  const [warlordPathAbility, setWarlordPathAbility] = useState('');
  const [oobUnits, addOobUnit, updateOobUnit, removeOobUnit] = useRowList([]);
  const oobTotalPoints = oobUnits.reduce((sum, u) => sum + (parseInt(u.points, 10) || 0), 0);

  // ── Army Roster ──
  const [commander, setCommander] = useState('');
  const [armyRosterName, setArmyRosterName] = useState('');
  const [pointsLimit, setPointsLimit] = useState('');
  const [armyRosterFaction, setArmyRosterFaction] = useState('');
  const [armyRosterFormation, setArmyRosterFormation] = useState('');
  const [regiments, setRegiments] = useState([{ id: 'r1', units: [] }]);
  const [auxUnits, addAuxUnit, updateAuxUnit, removeAuxUnit] = useRowList([]);
  const [armyNotes, setArmyNotes] = useState('');

  const addRegiment = () => setRegiments(rs => [...rs, { id: `${Date.now()}-${rs.length}`, units: [] }]);
  const removeRegiment = rid => setRegiments(rs => rs.filter(r => r.id !== rid));
  const addRegimentUnit = rid => setRegiments(rs => rs.map(r => r.id === rid
    ? { ...r, units: [...r.units, { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, name: '', size: '', points: '' }] }
    : r));
  const updateRegimentUnit = (rid, uid, field, value) => setRegiments(rs => rs.map(r => r.id === rid
    ? { ...r, units: r.units.map(u => u.id === uid ? { ...u, [field]: value } : u) }
    : r));
  const removeRegimentUnit = (rid, uid) => setRegiments(rs => rs.map(r => r.id === rid
    ? { ...r, units: r.units.filter(u => u.id !== uid) }
    : r));
  const regimentsTotal = regiments.reduce((sum, r) => sum + r.units.reduce((s, u) => s + (parseInt(u.points, 10) || 0), 0), 0);
  const auxTotal = auxUnits.reduce((sum, u) => sum + (parseInt(u.points, 10) || 0), 0);
  const armyUnitsTotal = regimentsTotal + auxTotal;

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

  const renderWeaponTable = (title, rows, add, update, remove) => (
    <div className="ptg-warscroll-table-block">
      <div className="ptg-warscroll-table-title">{title}</div>
      {rows.length > 0 && (
        <div className="ptg-warscroll-table">
          <div className="ptg-warscroll-table-head">
            <span>Name</span><span>Atk</span><span>Hit</span><span>Wnd</span><span>Rnd</span><span>Dmg</span><span />
          </div>
          {rows.map(r => (
            <div className="ptg-warscroll-table-row" key={r.id}>
              <input value={r.name || ''} onChange={e => update(r.id, 'name', e.target.value)} placeholder="Weapon" />
              <input value={r.atk || ''} onChange={e => update(r.id, 'atk', e.target.value)} />
              <input value={r.hit || ''} onChange={e => update(r.id, 'hit', e.target.value)} />
              <input value={r.wnd || ''} onChange={e => update(r.id, 'wnd', e.target.value)} />
              <input value={r.rnd || ''} onChange={e => update(r.id, 'rnd', e.target.value)} />
              <input value={r.dmg || ''} onChange={e => update(r.id, 'dmg', e.target.value)} />
              <button className="ptg-oob-row-remove" onClick={() => remove(r.id)} title="Remove weapon">✕</button>
            </div>
          ))}
        </div>
      )}
      <button className="ptg-wizard-nav-btn ptg-oob-add-btn" onClick={() => add()}>+ Add Weapon</button>
    </div>
  );

  const renderImageView = doc => (
    <div className="ptg-doc-image-view">
      {doc.images.map(src => <img key={src} src={src} alt={doc.title} />)}
    </div>
  );

  return (
    <>
      <div className="gw-overlay" />
      <div className="ptg-wizard" ref={modalRef} role="dialog" aria-modal="true" aria-label="Recruit Your Forces">
        <button className="gw-close" onClick={onClose} title="Close (Esc)">✕</button>

        <div className="ptg-wizard-header">
          <div className="ptg-wizard-title">Recruit Your Forces</div>
        </div>

        <div className="ptg-doc-tray">
          {DOCS.map(doc => (
            <DocThumb key={doc.key} doc={doc} active={activeDoc === doc.key} onClick={setActiveDoc} />
          ))}
        </div>

        {activeDoc ? (() => {
          const doc = DOCS.find(d => d.key === activeDoc);
          return (
            <>
              <div className="ptg-doc-editor-header">
                <button className="ptg-wizard-nav-btn" onClick={() => setActiveDoc(null)}>‹ Back to Wizard</button>
                <div className="ptg-doc-editor-title">{doc.title}</div>
                <PresentToggle mode={presentMode} onChange={setPresentMode} />
              </div>

              <div className="ptg-doc-editor-body">
                {presentMode === 'image' ? renderImageView(doc) : (
                  <>
                    {activeDoc === 'warlord' && (
                      <>
                        <div className="ptg-field">
                          <label>Warlord Name</label>
                          <input type="text" value={warlordName} onChange={e => setWarlordName(e.target.value)} placeholder="e.g. Iladrien the Bright" />
                        </div>
                        {renderWeaponTable('Ranged Weapons', rangedWeapons, addRanged, updateRanged, removeRanged)}
                        {renderWeaponTable('Melee Weapons', meleeWeapons, addMelee, updateMelee, removeMelee)}
                        <div className="ptg-field">
                          <label>Keywords</label>
                          <input type="text" value={warlordKeywords} onChange={e => setWarlordKeywords(e.target.value)} placeholder="HERO, INFANTRY, …" />
                        </div>
                      </>
                    )}

                    {activeDoc === 'roster' && (
                      <>
                        <div className="ptg-roster-grid">
                          <div className="ptg-field"><label>Army Name</label><input type="text" value={armyName} onChange={e => setArmyName(e.target.value)} placeholder="e.g. The Sundered Vanguard" /></div>
                          <div className="ptg-field"><label>Realm of Origin</label><input type="text" value={realmOfOrigin} onChange={e => setRealmOfOrigin(e.target.value)} placeholder="e.g. Hysh" /></div>
                          <div className="ptg-field"><label>Faction</label><input type="text" value={faction} onChange={e => setFaction(e.target.value)} /></div>
                          <div className="ptg-field"><label>Battle Formation</label><input type="text" value={battleFormation} onChange={e => setBattleFormation(e.target.value)} /></div>
                          <div className="ptg-field"><label>Glory Points</label><input type="text" value={gloryPoints} onChange={e => setGloryPoints(e.target.value)} /></div>
                        </div>
                        <div className="ptg-roster-grid">
                          <div className="ptg-field"><label>Current Quest</label><input type="text" value={currentQuest} onChange={e => setCurrentQuest(e.target.value)} /></div>
                          <div className="ptg-field"><label>Quest Points</label><input type="text" value={questPoints} onChange={e => setQuestPoints(e.target.value)} /></div>
                          <div className="ptg-field"><label>Notes</label><input type="text" value={questNotes} onChange={e => setQuestNotes(e.target.value)} /></div>
                          <div className="ptg-field"><label>Quests Completed</label><input type="text" value={questsCompleted} onChange={e => setQuestsCompleted(e.target.value)} /></div>
                        </div>
                        <div className="ptg-field"><label>Background</label><textarea rows={2} value={background} onChange={e => setBackground(e.target.value)} /></div>
                        <div className="ptg-field"><label>Notable Events</label><textarea rows={2} value={notableEvents} onChange={e => setNotableEvents(e.target.value)} /></div>

                        <div className="ptg-arcane-tome-title">Arcane Tome</div>
                        <div className="ptg-arcane-tome-grid">
                          {[{ label: 'Spell Lore', rows: spellLore, setter: setSpellLore },
                            { label: 'Prayer Lore', rows: prayerLore, setter: setPrayerLore },
                            { label: 'Manifestation Lore', rows: manifestationLore, setter: setManifestationLore }].map(col => (
                            <div className="ptg-arcane-tome-col" key={col.label}>
                              <div className="ptg-arcane-tome-col-header">{col.label}</div>
                              {col.rows.map((v, i) => (
                                <input key={i} value={v} placeholder={`${i + 1}.`} onChange={e => setLoreRow(col.setter)(i, e.target.value)} />
                              ))}
                            </div>
                          ))}
                        </div>
                      </>
                    )}

                    {activeDoc === 'oob' && (
                      <>
                        <div className="ptg-oob-cap">
                          Starting units + Warlord must total <strong>1000 points</strong> or fewer.{' '}
                          <span className={oobTotalPoints > 1000 ? 'ptg-oob-over' : ''}>Current total: {oobTotalPoints}pts</span>
                        </div>

                        <div className="ptg-oob-warlord-block">
                          <div className="ptg-oob-warlord-title">Warlord</div>
                          <div className="ptg-oob-warlord-grid">
                            <input placeholder="Name" value={warlordName} onChange={e => setWarlordName(e.target.value)} />
                            <input placeholder="Rank" value={warlordRank} onChange={e => setWarlordRank(e.target.value)} />
                            <input placeholder="Renown" value={warlordRenown} onChange={e => setWarlordRenown(e.target.value)} />
                          </div>
                          <div className="ptg-oob-warlord-grid">
                            <input placeholder="Enhancements" value={warlordEnhancements} onChange={e => setWarlordEnhancements(e.target.value)} />
                            <select value={warlordPath || ''} onChange={e => setWarlordPath(e.target.value || null)}>
                              <option value="">Path…</option>
                              {PATHS.map(p => <option key={p.key} value={p.key}>{p.name}</option>)}
                            </select>
                            <input placeholder="Path Abilities" value={warlordPathAbility} onChange={e => setWarlordPathAbility(e.target.value)} />
                          </div>
                        </div>

                        <div className="ptg-oob-units-title">Units</div>
                        {oobUnits.length === 0 && <div className="ptg-oob-empty">No units added yet.</div>}
                        {oobUnits.map(u => (
                          <div className="ptg-oob-unit-block" key={u.id}>
                            <div className="ptg-oob-warlord-grid">
                              <input placeholder="Unit Name" value={u.name || ''} onChange={e => updateOobUnit(u.id, 'name', e.target.value)} />
                              <input placeholder="Rank" value={u.rank || ''} onChange={e => updateOobUnit(u.id, 'rank', e.target.value)} />
                              <input placeholder="Renown" value={u.renown || ''} onChange={e => updateOobUnit(u.id, 'renown', e.target.value)} />
                              <input placeholder="Pts" value={u.points || ''} onChange={e => updateOobUnit(u.id, 'points', e.target.value)} style={{ maxWidth: '70px' }} />
                              <button className="ptg-oob-row-remove" onClick={() => removeOobUnit(u.id)} title="Remove unit">✕</button>
                            </div>
                            <div className="ptg-oob-warlord-grid">
                              <input placeholder="Enhancements" value={u.enhancements || ''} onChange={e => updateOobUnit(u.id, 'enhancements', e.target.value)} />
                              <input placeholder="Path Abilities" value={u.pathAbility || ''} onChange={e => updateOobUnit(u.id, 'pathAbility', e.target.value)} style={{ gridColumn: 'span 2' }} />
                            </div>
                          </div>
                        ))}
                        <button className="ptg-wizard-nav-btn ptg-oob-add-btn" onClick={() => addOobUnit({ name: '', rank: 'Aspiring', renown: '0', points: '', enhancements: '', pathAbility: '' })}>+ Add Unit</button>
                      </>
                    )}

                    {activeDoc === 'army' && (
                      <>
                        <div className="ptg-roster-grid">
                          <div className="ptg-field"><label>Commander</label><input type="text" value={commander} onChange={e => setCommander(e.target.value)} /></div>
                          <div className="ptg-field"><label>Army Name</label><input type="text" value={armyRosterName} onChange={e => setArmyRosterName(e.target.value)} /></div>
                          <div className="ptg-field"><label>Points Limit</label><input type="text" value={pointsLimit} onChange={e => setPointsLimit(e.target.value)} /></div>
                          <div className="ptg-field"><label>Faction</label><input type="text" value={armyRosterFaction} onChange={e => setArmyRosterFaction(e.target.value)} /></div>
                          <div className="ptg-field"><label>Battle Formation</label><input type="text" value={armyRosterFormation} onChange={e => setArmyRosterFormation(e.target.value)} /></div>
                        </div>

                        {regiments.map((r, ri) => (
                          <div className="ptg-regiment-block" key={r.id}>
                            <div className="ptg-regiment-header">
                              <span>{ri === 0 ? "General's Regiment 1" : `Regiment ${ri + 1}`}</span>
                              {regiments.length > 1 && <button className="ptg-oob-row-remove" onClick={() => removeRegiment(r.id)} title="Remove regiment">✕</button>}
                            </div>
                            {r.units.map(u => (
                              <div className="ptg-oob-row" key={u.id}>
                                <input placeholder="Warscroll Name" value={u.name || ''} onChange={e => updateRegimentUnit(r.id, u.id, 'name', e.target.value)} />
                                <input placeholder="Size" value={u.size || ''} onChange={e => updateRegimentUnit(r.id, u.id, 'size', e.target.value)} style={{ maxWidth: '70px' }} />
                                <input placeholder="Pts" value={u.points || ''} onChange={e => updateRegimentUnit(r.id, u.id, 'points', e.target.value)} style={{ maxWidth: '70px' }} />
                                <button className="ptg-oob-row-remove" onClick={() => removeRegimentUnit(r.id, u.id)} title="Remove unit">✕</button>
                              </div>
                            ))}
                            <button className="ptg-wizard-nav-btn ptg-oob-add-btn" onClick={() => addRegimentUnit(r.id)}>+ Add Unit</button>
                          </div>
                        ))}
                        <button className="ptg-wizard-nav-btn ptg-oob-add-btn" onClick={addRegiment}>+ Add Regiment</button>
                        <div className="ptg-oob-cap">Regiments Total: {regimentsTotal}pts</div>

                        <div className="ptg-regiment-block">
                          <div className="ptg-regiment-header"><span>Auxiliary Units</span></div>
                          {auxUnits.map(u => (
                            <div className="ptg-oob-row" key={u.id}>
                              <input placeholder="Warscroll Name" value={u.name || ''} onChange={e => updateAuxUnit(u.id, 'name', e.target.value)} />
                              <input placeholder="Size" value={u.size || ''} onChange={e => updateAuxUnit(u.id, 'size', e.target.value)} style={{ maxWidth: '70px' }} />
                              <input placeholder="Pts" value={u.points || ''} onChange={e => updateAuxUnit(u.id, 'points', e.target.value)} style={{ maxWidth: '70px' }} />
                              <button className="ptg-oob-row-remove" onClick={() => removeAuxUnit(u.id)} title="Remove unit">✕</button>
                            </div>
                          ))}
                          <button className="ptg-wizard-nav-btn ptg-oob-add-btn" onClick={() => addAuxUnit({ name: '', size: '', points: '' })}>+ Add Unit</button>
                        </div>
                        <div className="ptg-oob-cap">Auxiliary Units Total: {auxTotal}pts</div>
                        <div className="ptg-oob-cap"><strong>Units Total: {armyUnitsTotal}pts</strong></div>

                        <div className="ptg-field"><label>Notes</label><textarea rows={3} value={armyNotes} onChange={e => setArmyNotes(e.target.value)} /></div>
                      </>
                    )}
                  </>
                )}
              </div>
            </>
          );
        })() : (
          <>
            <div className="ptg-wizard-steps">
              {STEPS.map((label, i) => (
                <button
                  key={i}
                  className={`ptg-wizard-step${i === step ? ' ptg-wizard-step-active' : ''}${i < step ? ' ptg-wizard-step-done' : ''}`}
                  onClick={() => setStep(i)}
                  title={label}
                >
                  <span className="ptg-wizard-step-num">{i + 1}</span>
                  <span className="ptg-wizard-step-label">{label}</span>
                </button>
              ))}
            </div>

            <div className="ptg-wizard-body">
              <div className="ptg-wizard-body-title">{step + 1}. {STEPS[step]}</div>
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
