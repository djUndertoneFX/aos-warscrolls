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
      <button className={mode === 'image' ? 'ptg-present-active' : ''} onClick={() => onChange('image')}>Officiant</button>
      <button className={mode === 'replica' ? 'ptg-present-active' : ''} onClick={() => onChange('replica')}>Non Corporeal</button>
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

const STORAGE_KEY = 'aos-ptg-recruit-wizard';

export default function PathToGloryWizard({ onClose, factions = [] }) {
  // Read once per mount — resumes wherever the user left off last time they
  // opened this wizard (localStorage persists it across close/reopen).
  const saved = (() => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { return {}; } })();
  const [isEditingExisting] = useState(() => Object.keys(saved).length > 0);

  const [step, setStep] = useState(() => saved.step ?? 0);
  const [activeDoc, setActiveDoc] = useState(() => saved.activeDoc ?? null); // null | 'warlord' | 'roster' | 'oob' | 'army'
  const [presentMode, setPresentMode] = useState(() => saved.presentMode ?? 'replica'); // 'image' | 'replica'
  const modalRef = useRef(null);

  // ── Step 0: Campaign ──
  const [campaign, setCampaign] = useState(() => saved.campaign ?? null);
  const [customCampaignName, setCustomCampaignName] = useState(() => saved.customCampaignName ?? '');

  // ── Step 1: Faction ──
  const [selectedFaction, setSelectedFaction] = useState(() => saved.selectedFaction ?? null);

  // ── Warlord Warscroll ──
  const [warlordName, setWarlordName] = useState(() => saved.warlordName ?? '');
  const [warlordKeywords, setWarlordKeywords] = useState(() => saved.warlordKeywords ?? '');
  const [rangedWeapons, addRanged, updateRanged, removeRanged] = useRowList(saved.rangedWeapons ?? []);
  const [meleeWeapons, addMelee, updateMelee, removeMelee] = useRowList(saved.meleeWeapons ?? []);

  // ── Path to Glory Roster ──
  const [armyName, setArmyName] = useState(() => saved.armyName ?? '');
  const [realmOfOrigin, setRealmOfOrigin] = useState(() => saved.realmOfOrigin ?? '');
  const [faction, setFaction] = useState(() => saved.faction ?? '');
  const [battleFormation, setBattleFormation] = useState(() => saved.battleFormation ?? '');
  const [gloryPoints, setGloryPoints] = useState(() => saved.gloryPoints ?? '0');
  const [currentQuest, setCurrentQuest] = useState(() => saved.currentQuest ?? '');
  const [questPoints, setQuestPoints] = useState(() => saved.questPoints ?? '');
  const [questNotes, setQuestNotes] = useState(() => saved.questNotes ?? '');
  const [questsCompleted, setQuestsCompleted] = useState(() => saved.questsCompleted ?? '');
  const [background, setBackground] = useState(() => saved.background ?? '');
  const [notableEvents, setNotableEvents] = useState(() => saved.notableEvents ?? '');
  const [spellLore, setSpellLore] = useState(() => saved.spellLore ?? Array(6).fill(''));
  const [prayerLore, setPrayerLore] = useState(() => saved.prayerLore ?? Array(6).fill(''));
  const [manifestationLore, setManifestationLore] = useState(() => saved.manifestationLore ?? Array(6).fill(''));
  const setLoreRow = (setter) => (i, value) => setter(rows => rows.map((r, ri) => ri === i ? value : r));

  // ── Order of Battle ──
  const [warlordWarscroll, setWarlordWarscroll] = useState(() => saved.warlordWarscroll ?? '');
  const [warlordRank, setWarlordRank] = useState(() => saved.warlordRank ?? 'Aspiring');
  const [warlordRenown, setWarlordRenown] = useState(() => saved.warlordRenown ?? '5');
  const [warlordEnhancements, setWarlordEnhancements] = useState(() => saved.warlordEnhancements ?? '');
  const [warlordPath, setWarlordPath] = useState(() => saved.warlordPath ?? null);
  const [warlordPathAbility, setWarlordPathAbility] = useState(() => saved.warlordPathAbility ?? '');
  const [oobUnits, addOobUnit, updateOobUnit, removeOobUnit] = useRowList(saved.oobUnits ?? []);
  const oobTotalPoints = oobUnits.reduce((sum, u) => sum + (parseInt(u.points, 10) || 0), 0);

  // ── Army Roster ──
  const [commander, setCommander] = useState(() => saved.commander ?? '');
  const [armyRosterName, setArmyRosterName] = useState(() => saved.armyRosterName ?? '');
  const [pointsLimit, setPointsLimit] = useState(() => saved.pointsLimit ?? '');
  const [armyRosterFaction, setArmyRosterFaction] = useState(() => saved.armyRosterFaction ?? '');
  const [armyRosterFormation, setArmyRosterFormation] = useState(() => saved.armyRosterFormation ?? '');
  const [regiments, setRegiments] = useState(() => saved.regiments ?? [{ id: 'r1', units: [] }]);
  const [auxUnits, addAuxUnit, updateAuxUnit, removeAuxUnit] = useRowList(saved.auxUnits ?? []);
  const [armyNotes, setArmyNotes] = useState(() => saved.armyNotes ?? '');

  const addRegiment = () => setRegiments(rs => [...rs, { id: `${Date.now()}-${rs.length}`, units: [] }]);
  const removeRegiment = rid => setRegiments(rs => rs.filter(r => r.id !== rid));
  const addRegimentUnit = rid => setRegiments(rs => rs.map(r => r.id === rid
    ? { ...r, units: [...r.units, { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, name: '', size: '', notes: '', points: '' }] }
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

  // Persist the whole wizard on every change, so closing and reopening resumes here.
  useEffect(() => {
    const snapshot = {
      step, activeDoc, presentMode, campaign, customCampaignName, selectedFaction,
      warlordName, warlordKeywords, rangedWeapons, meleeWeapons,
      armyName, realmOfOrigin, faction, battleFormation, gloryPoints,
      currentQuest, questPoints, questNotes, questsCompleted, background, notableEvents,
      spellLore, prayerLore, manifestationLore,
      warlordWarscroll, warlordRank, warlordRenown, warlordEnhancements, warlordPath, warlordPathAbility, oobUnits,
      commander, armyRosterName, pointsLimit, armyRosterFaction, armyRosterFormation, regiments, auxUnits, armyNotes,
    };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot)); } catch {}
  }, [
    step, activeDoc, presentMode, campaign, customCampaignName, selectedFaction,
    warlordName, warlordKeywords, rangedWeapons, meleeWeapons,
    armyName, realmOfOrigin, faction, battleFormation, gloryPoints,
    currentQuest, questPoints, questNotes, questsCompleted, background, notableEvents,
    spellLore, prayerLore, manifestationLore,
    warlordWarscroll, warlordRank, warlordRenown, warlordEnhancements, warlordPath, warlordPathAbility, oobUnits,
    commander, armyRosterName, pointsLimit, armyRosterFaction, armyRosterFormation, regiments, auxUnits, armyNotes,
  ]);

  const renderWeaponTable = (title, rows, add, update, remove, hasRange) => (
    <div className="ptg-warscroll-table-block">
      <div className="ptg-warscroll-table-title">{title}</div>
      {rows.length > 0 && (
        <div className={`ptg-warscroll-table${hasRange ? ' ptg-warscroll-table-ranged' : ''}`}>
          <div className="ptg-warscroll-table-head">
            <span>Weapon</span>
            {hasRange && <span>Rng</span>}
            <span>Atk</span><span>Hit</span><span>Wnd</span><span>Rnd</span><span>Dmg</span><span />
          </div>
          {rows.map(r => (
            <div className="ptg-warscroll-table-row" key={r.id}>
              <input value={r.name || ''} onChange={e => update(r.id, 'name', e.target.value)} placeholder="Weapon" />
              {hasRange && <input value={r.rng || ''} onChange={e => update(r.id, 'rng', e.target.value)} />}
              <input value={r.atk || ''} onChange={e => update(r.id, 'atk', e.target.value)} />
              <input value={r.hit || ''} onChange={e => update(r.id, 'hit', e.target.value)} />
              <input value={r.wnd || ''} onChange={e => update(r.id, 'wnd', e.target.value)} />
              <input value={r.rnd || ''} onChange={e => update(r.id, 'rnd', e.target.value)} />
              <input value={r.dmg || ''} onChange={e => update(r.id, 'dmg', e.target.value)} />
              <button className="ptg-oob-row-remove" onClick={() => remove(r.id)} title="Remove weapon">✕</button>
              <input
                className="ptg-warscroll-table-abilities"
                value={r.abilities || ''}
                onChange={e => update(r.id, 'abilities', e.target.value)}
                placeholder="Weapon Abilities"
              />
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

  const campaignLabel = campaign === 'custom'
    ? (customCampaignName.trim() || 'Foreign War of Aggression')
    : CAMPAIGNS.find(c => c.key === campaign)?.name;

  const ALLIANCE_ORDER = ['Order', 'Chaos', 'Death', 'Destruction'];
  const factionsByAlliance = ALLIANCE_ORDER
    .map(alliance => ({ alliance, list: factions.filter(f => f.grand_alliance === alliance) }))
    .filter(g => g.list.length > 0);

  return (
    <>
      <div className="gw-overlay" />
      <div className="ptg-wizard" ref={modalRef} role="dialog" aria-modal="true" aria-label={isEditingExisting ? 'Present the Troops!' : 'Recruit Your Forces'}>
        <button className="gw-close" onClick={onClose} title="Close (Esc)">✕</button>

        <div className="ptg-wizard-banner">
          Path to Glory!{campaignLabel && <span className="ptg-wizard-banner-campaign"> — {campaignLabel}</span>}
        </div>

        <div className="ptg-wizard-header">
          <div className="ptg-wizard-title">{isEditingExisting ? 'Present the Troops!' : 'Recruit Your Forces'}</div>
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
                <button className="ptg-wizard-nav-btn" onClick={() => setActiveDoc(null)}>‹ Back to War Room</button>
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
                        {renderWeaponTable('Ranged Weapons', rangedWeapons, addRanged, updateRanged, removeRanged, true)}
                        {renderWeaponTable('Melee Weapons', meleeWeapons, addMelee, updateMelee, removeMelee, false)}
                        <div className="ptg-field">
                          <label>Keywords</label>
                          <input type="text" value={warlordKeywords} onChange={e => setWarlordKeywords(e.target.value)} placeholder="HERO, INFANTRY, …" />
                        </div>
                      </>
                    )}

                    {activeDoc === 'roster' && (
                      <>
                        <div className="ptg-roster-header-grid">
                          <div className="ptg-field ptg-roster-heraldry"><label>Heraldry</label><div className="ptg-heraldry-box" /></div>
                          <div className="ptg-field ptg-roster-armyname"><label>Army Name</label><input type="text" value={armyName} onChange={e => setArmyName(e.target.value)} placeholder="e.g. The Sundered Vanguard" /></div>
                          <div className="ptg-field ptg-roster-realm"><label>Realm of Origin</label><input type="text" value={realmOfOrigin} onChange={e => setRealmOfOrigin(e.target.value)} placeholder="e.g. Hysh" /></div>
                          <div className="ptg-field ptg-roster-glory"><label>Glory Points</label><input type="text" value={gloryPoints} onChange={e => setGloryPoints(e.target.value)} /></div>
                          <div className="ptg-field ptg-roster-faction"><label>Faction</label><input type="text" value={faction} onChange={e => setFaction(e.target.value)} /></div>
                          <div className="ptg-field ptg-roster-formation"><label>Battle Formation</label><input type="text" value={battleFormation} onChange={e => setBattleFormation(e.target.value)} /></div>
                        </div>

                        <div className="ptg-roster-lower-grid">
                          <div className="ptg-quest-log-block">
                            <div className="ptg-quest-log-title">Quest Log</div>
                            <div className="ptg-quest-log-grid">
                              <div className="ptg-field"><label>Current Quest</label><input type="text" value={currentQuest} onChange={e => setCurrentQuest(e.target.value)} /></div>
                              <div className="ptg-field"><label>Quest Points</label><input type="text" value={questPoints} onChange={e => setQuestPoints(e.target.value)} /></div>
                              <div className="ptg-field"><label>Notes</label><input type="text" value={questNotes} onChange={e => setQuestNotes(e.target.value)} /></div>
                              <div className="ptg-field"><label>Quests Completed</label><input type="text" value={questsCompleted} onChange={e => setQuestsCompleted(e.target.value)} /></div>
                            </div>
                          </div>
                          <div className="ptg-roster-side-stack">
                            <div className="ptg-field"><label>Background</label><textarea rows={4} value={background} onChange={e => setBackground(e.target.value)} /></div>
                            <div className="ptg-field"><label>Notable Events</label><textarea rows={4} value={notableEvents} onChange={e => setNotableEvents(e.target.value)} /></div>
                          </div>
                        </div>

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
                          <div className="ptg-oob-row-grid-4">
                            <div className="ptg-field"><label>Name</label><input value={warlordName} onChange={e => setWarlordName(e.target.value)} /></div>
                            <div className="ptg-field"><label>Warscroll</label><input value={warlordWarscroll} onChange={e => setWarlordWarscroll(e.target.value)} /></div>
                            <div className="ptg-field"><label>Rank</label><input value={warlordRank} onChange={e => setWarlordRank(e.target.value)} /></div>
                            <div className="ptg-field"><label>Renown</label><input value={warlordRenown} onChange={e => setWarlordRenown(e.target.value)} /></div>
                          </div>
                          <div className="ptg-oob-row-grid-3">
                            <div className="ptg-field"><label>Enhancements</label><input value={warlordEnhancements} onChange={e => setWarlordEnhancements(e.target.value)} /></div>
                            <div className="ptg-field">
                              <label>Path</label>
                              <select value={warlordPath || ''} onChange={e => setWarlordPath(e.target.value || null)}>
                                <option value="">…</option>
                                {PATHS.map(p => <option key={p.key} value={p.key}>{p.name}</option>)}
                              </select>
                            </div>
                            <div className="ptg-field"><label>Path Abilities</label><input value={warlordPathAbility} onChange={e => setWarlordPathAbility(e.target.value)} /></div>
                          </div>
                        </div>

                        <div className="ptg-oob-units-title">Units</div>
                        {oobUnits.length === 0 && <div className="ptg-oob-empty">No units added yet.</div>}
                        {oobUnits.map(u => (
                          <div className="ptg-oob-unit-block" key={u.id}>
                            <div className="ptg-oob-row-grid-4">
                              <div className="ptg-field"><label>Unit Name</label><input value={u.name || ''} onChange={e => updateOobUnit(u.id, 'name', e.target.value)} /></div>
                              <div className="ptg-field"><label>Warscroll</label><input value={u.warscroll || ''} onChange={e => updateOobUnit(u.id, 'warscroll', e.target.value)} /></div>
                              <div className="ptg-field"><label>Rank</label><input value={u.rank || ''} onChange={e => updateOobUnit(u.id, 'rank', e.target.value)} /></div>
                              <div className="ptg-field">
                                <label>Renown</label>
                                <div className="ptg-oob-renown-row">
                                  <input value={u.renown || ''} onChange={e => updateOobUnit(u.id, 'renown', e.target.value)} />
                                  <button className="ptg-oob-row-remove" onClick={() => removeOobUnit(u.id)} title="Remove unit">✕</button>
                                </div>
                              </div>
                            </div>
                            <div className="ptg-oob-row-grid-3b">
                              <div className="ptg-field"><label>Enhancements</label><input value={u.enhancements || ''} onChange={e => updateOobUnit(u.id, 'enhancements', e.target.value)} /></div>
                              <div className="ptg-field"><label>Path Abilities</label><input value={u.pathAbility || ''} onChange={e => updateOobUnit(u.id, 'pathAbility', e.target.value)} /></div>
                              <div className="ptg-field"><label>Reinforced?</label><input value={u.reinforced || ''} onChange={e => updateOobUnit(u.id, 'reinforced', e.target.value)} /></div>
                            </div>
                            <div className="ptg-field ptg-oob-pts-field"><label>Pts</label><input value={u.points || ''} onChange={e => updateOobUnit(u.id, 'points', e.target.value)} style={{ maxWidth: '90px' }} /></div>
                          </div>
                        ))}
                        <button className="ptg-wizard-nav-btn ptg-oob-add-btn" onClick={() => addOobUnit({ name: '', warscroll: '', rank: 'Aspiring', renown: '0', points: '', enhancements: '', pathAbility: '', reinforced: '' })}>+ Add Unit</button>
                      </>
                    )}

                    {activeDoc === 'army' && (
                      <>
                        <div className="ptg-army-header-grid">
                          <div className="ptg-field ptg-army-commander"><label>Commander</label><input type="text" value={commander} onChange={e => setCommander(e.target.value)} /></div>
                          <div className="ptg-field ptg-army-name"><label>Army Name</label><input type="text" value={armyRosterName} onChange={e => setArmyRosterName(e.target.value)} /></div>
                          <div className="ptg-field ptg-army-points-limit"><label>Points Limit</label><input type="text" value={pointsLimit} onChange={e => setPointsLimit(e.target.value)} /></div>
                          <div className="ptg-field ptg-army-faction"><label>Faction</label><input type="text" value={armyRosterFaction} onChange={e => setArmyRosterFaction(e.target.value)} /></div>
                          <div className="ptg-field ptg-army-formation"><label>Battle Formation</label><input type="text" value={armyRosterFormation} onChange={e => setArmyRosterFormation(e.target.value)} /></div>
                        </div>

                        {regiments.map((r, ri) => (
                          <div className="ptg-regiment-block" key={r.id}>
                            <div className="ptg-regiment-header">
                              <span>{ri === 0 ? "General's Regiment 1" : `Regiment ${ri + 1}`}</span>
                              {regiments.length > 1 && <button className="ptg-oob-row-remove" onClick={() => removeRegiment(r.id)} title="Remove regiment">✕</button>}
                            </div>
                            <div className="ptg-regiment-table-head">
                              <span>Warscroll Name</span><span>Size</span><span>Notes</span><span>Points</span><span />
                            </div>
                            {r.units.map(u => (
                              <div className="ptg-regiment-table-row" key={u.id}>
                                <input placeholder="Warscroll Name" value={u.name || ''} onChange={e => updateRegimentUnit(r.id, u.id, 'name', e.target.value)} />
                                <input placeholder="Size" value={u.size || ''} onChange={e => updateRegimentUnit(r.id, u.id, 'size', e.target.value)} />
                                <input placeholder="Notes" value={u.notes || ''} onChange={e => updateRegimentUnit(r.id, u.id, 'notes', e.target.value)} />
                                <input placeholder="Pts" value={u.points || ''} onChange={e => updateRegimentUnit(r.id, u.id, 'points', e.target.value)} />
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
                          <div className="ptg-regiment-table-head">
                            <span>Warscroll Name</span><span>Size</span><span>Notes</span><span>Points</span><span />
                          </div>
                          {auxUnits.map(u => (
                            <div className="ptg-regiment-table-row" key={u.id}>
                              <input placeholder="Warscroll Name" value={u.name || ''} onChange={e => updateAuxUnit(u.id, 'name', e.target.value)} />
                              <input placeholder="Size" value={u.size || ''} onChange={e => updateAuxUnit(u.id, 'size', e.target.value)} />
                              <input placeholder="Notes" value={u.notes || ''} onChange={e => updateAuxUnit(u.id, 'notes', e.target.value)} />
                              <input placeholder="Pts" value={u.points || ''} onChange={e => updateAuxUnit(u.id, 'points', e.target.value)} />
                              <button className="ptg-oob-row-remove" onClick={() => removeAuxUnit(u.id)} title="Remove unit">✕</button>
                            </div>
                          ))}
                          <button className="ptg-wizard-nav-btn ptg-oob-add-btn" onClick={() => addAuxUnit({ name: '', size: '', notes: '', points: '' })}>+ Add Unit</button>
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
                        onClick={() => { setCampaign(c.key); setStep(s => Math.min(STEPS.length - 1, s + 1)); }}
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
              ) : step === 1 ? (
                <div className="ptg-faction-grid">
                  {factionsByAlliance.flatMap(g => g.list).map(f => (
                    <button
                      key={f.faction_slug}
                      className={`ptg-faction-badge alliance-${f.grand_alliance}${selectedFaction === f.faction_slug ? ' ptg-faction-badge-selected' : ''}`}
                      onClick={() => { setSelectedFaction(f.faction_slug); setStep(s => Math.min(STEPS.length - 1, s + 1)); }}
                    >
                      {f.faction}
                    </button>
                  ))}
                </div>
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
