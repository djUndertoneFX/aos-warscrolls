import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { DOCS, DocPage, buildPreviewDocData, abilitiesInText, buildAbilityLookup, buildLoreLookup, LoreAbilityPopup, WARLORD_UNIT_KEY } from '../components/PathToGloryWizard';
import { ArmyRosterPreviewSheets } from './ArmyBuilderPage';
import { BattleBuddyPreview } from './BattleBuddyPage';
import WarscrollGW, { AbilityCard } from '../components/WarscrollGW';
import { looseKey } from '../importList';

// ── Preview mode ──────────────────────────────────────────────────────────
// What a "Share preview" link opens: the roster's sheets and nothing else.
// No nav, no login, none of the site's tools — the recipient is here to look
// at an opponent's army, not to use the app. Everything is fetched with the
// share token in a header (see requireAuthOrPreview on the server), so this
// page works signed out but still can't reach anything the token doesn't
// cover.
//
// Every sheet is shown, one after another in a scrolling column (Order of
// Battle first, since it lists the army; it gets a page per 5 units), with a
// Print button that prints just the sheets. Hovering a unit name — on the
// Order of Battle, the Army Roster or the chips below — peeks its warscroll
// beside the pointer; a click opens it properly with the army's dot strip.
const PREVIEW_DOC_ORDER = ['oob', 'warlord', 'roster', 'army'];
const PEEK_DELAY = 250;

// The share token has to reach every request this page causes, including the
// ones fired by components it renders (WarscrollGW fetches its own faction
// rules for the purple faction pages). An interceptor is the reliable way to
// do that: setting axios defaults from an effect races the children's first
// fetches, and clearing them on unmount killed requests that were still in
// flight. Set synchronously during render instead, so it is in place before
// anything below can ask for data, and left alone afterwards — it is only
// ever added when a real Authorization header is absent.
let previewToken = null;
axios.interceptors.request.use(cfg => {
  if (previewToken && !cfg.headers?.Authorization) {
    cfg.headers = { ...cfg.headers, 'x-preview-token': previewToken };
  }
  return cfg;
});

export default function PreviewPage() {
  const { token } = useParams();
  const [share, setShare] = useState(null);
  const [factions, setFactions] = useState([]);
  const [apotheosisSteps, setApotheosisSteps] = useState([]);
  const [warscrolls, setWarscrolls] = useState([]);
  const [factionRules, setFactionRules] = useState({});
  const [openUnit, setOpenUnit] = useState(null);
  // What's peeked beside the pointer: a unit's warscroll and/or the ability
  // cards for its Enhancements and Path Abilities — { unit, abilities, side,
  // pinned }. Hovering any field of a sheet row shows the whole row; a click
  // on a row that has ability cards pins them open.
  const [peek, setPeek] = useState(null);
  const peekTimer = useRef(null);
  const [error, setError] = useState('');
  // Arcane Tome names → LoreAbilityPopup.
  const [lorePopup, setLorePopup] = useState(null);
  const [allManifestationLores, setAllManifestationLores] = useState([]);
  useEffect(() => {
    if (!lorePopup || allManifestationLores.length) return;
    axios.get('/api/manifestation-lores').then(res => setAllManifestationLores(res.data ?? [])).catch(() => {});
  }, [lorePopup, allManifestationLores.length]);

  // Synchronous, before the first fetch below or in any child.
  if (token) previewToken = token;

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await axios.get(`/api/preview/${token}`);
        if (cancelled) return;
        setShare(data);
        const slug = data.faction_slug || data.data?.faction || data.data?.selectedFaction || '';
        const [f, a, w, fr] = await Promise.all([
          axios.get('/api/factions').then(r => r.data).catch(() => []),
          slug ? axios.get(`/api/apotheosis/${slug}`).then(r => r.data.steps || []).catch(() => []) : [],
          axios.get(`/api/preview/${token}/warscrolls`).then(r => r.data.data || []).catch(() => []),
          slug ? axios.get(`/api/faction-rules/${slug}`).then(r => r.data || {}).catch(() => ({})) : {},
        ]);
        if (cancelled) return;
        setFactions(f); setApotheosisSteps(a); setWarscrolls(w); setFactionRules(fr);
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.error || 'This preview link could not be opened.');
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  // An Army Builder share ("army") is a matched-play list: it gets the
  // official Army Roster sheet, not the Path to Glory set. Its "docData" is
  // only what the shared peek / warscroll code below reads.
  const isArmy = share?.kind === 'army';
  const docData = useMemo(() => {
    if (!share) return null;
    if (share.kind === 'army' || share.kind === 'battle') {
      const factionSlug = share.faction_slug || share.data?.faction || '';
      return { factionSlug, abilityLookup: buildAbilityLookup({ factionSlug, factionRules }), warlordEnhancements: '', oobUnits: [] };
    }
    return buildPreviewDocData(share.data, factions, apotheosisSteps, factionRules);
  }, [share, factions, apotheosisSteps, factionRules]);
  const unitsById = useMemo(() => Object.fromEntries(warscrolls.map(w => [String(w.id), w])), [warscrolls]);
  // Army list: a Hero's chosen Heroic Trait / Artefact, by warscroll id.
  const armyEnhancementsFor = id => {
    const a = share?.data?.heroAssignments?.[id];
    return a ? ['heroic_traits', 'artefacts'].map(k => a[k]).filter(Boolean).join(', ') : '';
  };

  // Every unit named anywhere on the sheets, mapped to its warscroll, so a
  // name on the Order of Battle can be clicked straight through to the
  // card — matched loosely because a roster row is hand-typed or imported
  // ("Gobsprakk, the Mouth of Mork" vs the database's unpunctuated form).
  const unitsByName = useMemo(() => {
    const m = new Map();
    for (const w of warscrolls) m.set(looseKey(w.name), w);
    return m;
  }, [warscrolls]);

  // The Warlord as a warscroll card: an Anvil-built Hero has no database
  // warscroll, so it's assembled from the Warlord sheet — profile, weapons
  // and the same ability groups the sheet prints. It leads the dot strip
  // (green dot), right after the faction's purple pages.
  const warlordUnit = useMemo(() => {
    if (!docData || !docData.warlordName) return null;
    const faction = factions.find(f => f.faction_slug === docData.factionSlug);
    const weapon = type => w => ({
      type, name: w.name, range: type === 'ranged' ? w.rng : undefined,
      attacks: w.atk, hit: w.hit, wound: w.wnd, rend: w.rnd, damage: w.dmg, ability: w.abilities || '',
    });
    return {
      id: 'anvil-warlord',
      _anvilWarlord: true,
      _noImage: true,
      name: docData.warlordName,
      faction_slug: docData.factionSlug,
      faction: faction?.faction || docData.factionLabel || '',
      grand_alliance: faction?.grand_alliance,
      move: docData.warlordMove, health: docData.warlordHealth, save: docData.warlordSave, control: docData.warlordControl,
      ward: docData.warlordWard || '',
      points: docData.warlordPoints || '',
      unit_size: 1,
      weapons: JSON.stringify([
        ...(docData.rangedWeapons || []).filter(w => w.name).map(weapon('ranged')),
        ...(docData.meleeWeapons || []).filter(w => w.name).map(weapon('melee')),
      ]),
      // Enhancements and Path abilities are shown under the warscroll
      // (renderPathRows / the row peek), not among its own abilities.
      abilities: JSON.stringify((docData.warlordAbilityGroups || [])
        .filter(g => g.header !== 'Enhancements' && g.header !== docData.warlordPathLabel)
        .flatMap(g => g.abilities || [])),
      keywords: [docData.warlordKeywordsLine1, docData.warlordKeywordsLine2].filter(Boolean).join(', '),
    };
  }, [docData, factions]);

  const namedUnits = useMemo(() => {
    if (!docData) return [];
    const names = isArmy ? Object.keys(share.data?.roster || {}).map(id => unitsById[id]?.name) : [
      ...(docData.oobUnits || []).map(u => u.warscroll || u.name),
      ...(docData.regiments || []).flatMap(r => (r.units || []).filter(u => u.sourceUnitId !== 'warlord').map(u => u.name)),
      ...(docData.auxUnits || []).map(u => u.name),
      ...(warlordUnit ? [] : [docData.warlordWarscroll]),
    ];
    const seen = new Set();
    const out = [];
    for (const n of names) {
      const w = n && unitsByName.get(looseKey(n));
      if (w && !seen.has(w.id)) { seen.add(w.id); out.push(w); }
    }
    // Faction pages are built from contiguous runs of the same faction in
    // navList, so keep allies grouped rather than interleaved — the army's
    // own faction first, so its purple pages lead and the Warlord follows.
    // Within a faction: Heroes, Infantry, Cavalry, Beasts, Monsters, War
    // Machines, Terrain, Manifestations, then by name — the same order as
    // every warscroll table on the site (/api/warscrolls' typeOrder).
    const own = docData.factionSlug;
    const typeRank = u => (u.is_hero ? 1 : u.is_infantry ? 2 : u.is_cavalry ? 3 : u.is_beast ? 4
      : u.is_monster ? 5 : u.is_war_machine ? 6 : u.is_terrain ? 7 : u.is_manifestation ? 8 : 7);
    out.sort((a, b) => ((a.faction_slug === own ? 0 : 1) - (b.faction_slug === own ? 0 : 1))
      || (a.faction_slug || '').localeCompare(b.faction_slug || '')
      || typeRank(a) - typeRank(b)
      || (a.name || '').localeCompare(b.name || ''));
    return warlordUnit ? [warlordUnit, ...out] : out;
  }, [docData, unitsByName, warlordUnit, isArmy, share, unitsById]);

  // Per unit: one row per distinct Path / rank / picked-abilities combination
  // among the army's copies of it ("2× Path: Enclave Rank: Veteran").
  const pathGroupsByUnit = useMemo(() => {
    const m = new Map();
    for (const row of docData?.oobUnits || []) {
      const ps = row.pathSummary;
      const key = looseKey(row.warscroll || row.name);
      if (!ps || !key) continue;
      const gk = [ps.pathName, ps.rank, ps.abilities.map(a => a.name).join('|')].join('#');
      if (!m.has(key)) m.set(key, new Map());
      const groups = m.get(key);
      if (groups.has(gk)) groups.get(gk).count += 1;
      else groups.set(gk, { ...ps, count: 1 });
    }
    return m;
  }, [docData]);

  if (error) {
    return (
      <div className="preview-page preview-page-error">
        <PreviewHeader />
        <div className="preview-error">{error}</div>
      </div>
    );
  }
  if (!share || !docData) {
    return (
      <div className="preview-page">
        <PreviewHeader />
        <div className="preview-loading">Loading preview…</div>
      </div>
    );
  }

  // A shared Battle Buddy matchup: its own read-only Fight screen.
  if (share.kind === 'battle') {
    return (
      <div className="preview-page preview-page-battle">
        <PreviewHeader subtitle={share.name} />
        <BattleBuddyPreview data={share.data} />
      </div>
    );
  }

  const navIndex = openUnit ? namedUnits.findIndex(u => u.id === openUnit.id) : -1;

  // Every sheet's pages, in order; the Order of Battle repeats per 5 units.
  const pages = PREVIEW_DOC_ORDER.flatMap(key => {
    const d = DOCS.find(x => x.key === key);
    if (!d) return [];
    let imgs = (key === 'warlord' && docData.warlordDocVariant === 'full') ? d.imagesFull : d.images;
    if (key === 'oob') imgs = Array.from({ length: Math.max(1, Math.ceil((docData.oobUnits || []).length / 5)) }, () => d.images[0]);
    return imgs.map((img, i) => ({ doc: d, img, i }));
  });

  const unitFor = name => (name === WARLORD_UNIT_KEY ? warlordUnit : name ? unitsByName.get(looseKey(name)) : null);
  const sideOf = e => (e && e.clientX > window.innerWidth / 2 ? 'left' : 'right');
  const abilitiesFor = text => abilitiesInText(text, docData.abilityLookup || new Map());
  // Heroic Traits / Artefacts the army actually took (named in any
  // Enhancements field) — the purple faction pages show only those.
  const takenEnhancements = new Set(
    [docData.warlordEnhancements, ...(docData.oobUnits || []).map(u => u.enhancements),
      ...(isArmy ? Object.keys(share.data?.heroAssignments || {}).map(armyEnhancementsFor) : [])]
      .flatMap(t => abilitiesFor(t)).map(a => looseKey(a.name)),
  );
  const ruleFilter = (key, items) => ((key === 'heroic_traits' || key === 'artefacts')
    ? items.filter(it => takenEnhancements.has(looseKey(it.name)))
    : items);
  const renderAbilityCards = abilities => (
    <div className="preview-row-abilities">
      <div className="gw-section-rule"><span>{isArmy ? 'ENHANCEMENTS' : <>ENHANCEMENTS &amp; PATH ABILITIES</>}</span></div>
      <div className="preview-row-abilities-grid">
        {abilities.map((a, i) => (
          <div key={i} className="preview-ability-item">
            {a._kind && <div className="preview-ability-kind">{a._kind}</div>}
            <AbilityCard ab={a} />
          </div>
        ))}
      </div>
    </div>
  );
  const renderPathRows = unit => {
    if (!unit) return null;
    if (isArmy) {
      const abilities = abilitiesFor(armyEnhancementsFor(String(unit.id)));
      return abilities.length ? renderAbilityCards(abilities) : null;
    }
    if (unit._anvilWarlord) {
      const abilities = abilitiesFor([docData.warlordEnhancements, docData.warlordPathAbility].filter(Boolean).join(', '));
      return abilities.length ? renderAbilityCards(abilities) : null;
    }
    const groups = pathGroupsByUnit.get(looseKey(unit.name));
    if (!groups || !groups.size) return null;
    return (
      <div className="preview-path-rows">
        <div className="gw-section-rule"><span>PATHS IN THIS ARMY</span></div>
        {[...groups.values()].map((g, i) => (
          <div className="preview-path-row" key={i}>
            <div className="preview-path-row-head">
              <span className="preview-path-count">{g.count}×</span>
              {g.pathName && <span><b>Path:</b> {g.pathName.replace(/^Path of (the )?/i, '')}</span>}
              {g.rank && <span><b>Rank:</b> {g.rank}</span>}
              {g.abilities.length > 0 && <span><b>Abilities:</b> {g.abilities.map(a => a.name).join(', ')}</span>}
            </div>
            {g.abilities.length > 0 && (
              <div className="preview-path-cards">
                {g.abilities.map((a, j) => <AbilityCard key={j} ab={a} />)}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };
  const startPeek = (unit, e, abilities = []) => {
    if ((!unit && !abilities.length) || openUnit || peek?.pinned) return;
    clearTimeout(peekTimer.current);
    const side = sideOf(e);
    peekTimer.current = setTimeout(() => setPeek({ unit, abilities, side, pinned: false }), PEEK_DELAY);
  };
  const endPeek = () => { clearTimeout(peekTimer.current); setPeek(p => (p?.pinned ? p : null)); };
  const closePeek = () => { clearTimeout(peekTimer.current); setPeek(null); };
  const rowHover = (row, e) => startPeek(unitFor(row.unit), e, abilitiesFor(row.abilities));
  const rowClick = (row, e) => {
    const abilities = abilitiesFor(row.abilities);
    const unit = unitFor(row.unit);
    // A unit's row opens its full warscroll (with the army's pages); a row
    // with only ability cards (no matching warscroll) pins them instead.
    if (unit) openFull(unit);
    else if (abilities.length) { clearTimeout(peekTimer.current); setPeek({ unit: null, abilities, side: sideOf(e), pinned: true }); }
  };
  const openFull = unit => { if (!unit) return; closePeek(); setOpenUnit(unit); };

  return (
    <div className="preview-page">
      <PreviewHeader subtitle={share.name} onPrint={() => { closePeek(); window.print(); }} />

      <div className="preview-doc-view">
        {isArmy && (
          <ArmyRosterPreviewSheets
            data={share.data} listName={share.name}
            factionName={share.faction_name || factions.find(f => f.faction_slug === docData.factionSlug)?.faction || ''}
            unitsById={unitsById} factionRules={factionRules}
            onRowHover={rowHover} onRowLeave={endPeek} onRowClick={rowClick}
          />
        )}
        {!isArmy && pages.map(({ doc: d, img, i }) => (
          <div className="preview-doc-sheet" key={`${d.key}-${i}`}>
            <DocPage
              img={img} alt={d.title} docKey={d.key} pageIndex={i} data={docData}
              onRowHover={rowHover}
              onRowLeave={endPeek}
              onRowClick={rowClick}
              onLoreClick={setLorePopup}
            />
          </div>
        ))}
      </div>

      {namedUnits.length > 0 && (
        <div className="preview-units">
          <div className="preview-units-title">Warscrolls in this army</div>
          <div className="preview-units-row">
            {namedUnits.map(u => (
              <button key={u.id} type="button" className="preview-unit-chip" onClick={() => openFull(u)} onMouseEnter={e => startPeek(u, e)} onMouseLeave={endPeek}>
                {u.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {peek && !openUnit && (
        <>
          {peek.pinned && <div className="preview-ability-backdrop" onMouseDown={closePeek} />}
          {/* With a unit, its Enhancement / Path ability cards sit under the
              warscroll (above its keywords); without one they get a panel. */}
          {peek.unit && (
            <div className={`preview-peek preview-peek-${peek.side}${peek.pinned ? ' preview-peek-pinned' : ''}`} aria-hidden={!peek.pinned}>
              <WarscrollGW
                unit={peek.unit} factions={factions} onClose={closePeek} hideViewToggle
                renderExtras={peek.abilities?.length ? () => renderAbilityCards(peek.abilities) : undefined}
              />
            </div>
          )}
          {!peek.unit && peek.abilities?.length > 0 && (
            <div className={`preview-ability-peek preview-peek-${peek.side}${peek.pinned ? ' preview-ability-peek-pinned' : ''}`}>
              {peek.pinned && <button type="button" className="preview-ability-close" onClick={closePeek}>✕</button>}
              {renderAbilityCards(peek.abilities)}
            </div>
          )}
        </>
      )}

      {openUnit && (
        <div className="preview-warscroll-backdrop" onMouseDown={() => setOpenUnit(null)}>
          <div className="preview-warscroll-modal" onMouseDown={e => e.stopPropagation()}>
            {/* navList/navIndex are what give the card its dot strip — the
                gold unit dots step through this army, and the purple faction
                pages come with them. */}
            <WarscrollGW
              unit={openUnit}
              factions={factions}
              navList={namedUnits}
              navIndex={navIndex}
              /* The purple faction pages only load in faction-sorted mode —
                 WarscrollGW skips fetching faction rules otherwise. */
              sortBy="faction"
              hideViewToggle
              allFactionPages
              renderExtras={renderPathRows}
              ruleFilter={ruleFilter}
              onJump={i => namedUnits[i] && setOpenUnit(namedUnits[i])}
              onPrev={navIndex > 0 ? () => setOpenUnit(namedUnits[navIndex - 1]) : undefined}
              onNext={navIndex < namedUnits.length - 1 ? () => setOpenUnit(namedUnits[navIndex + 1]) : undefined}
              onClose={() => setOpenUnit(null)}
            />
          </div>
        </div>
      )}
      {lorePopup && (
        <LoreAbilityPopup
          name={lorePopup} factions={factions} onClose={() => setLorePopup(null)}
          lookup={buildLoreLookup({ factionRules, campaign: share?.data?.campaign || '', allManifestationLores })}
        />
      )}
    </div>
  );
}

function PreviewHeader({ subtitle, onPrint }) {
  return (
    <div className="preview-header">
      <span className="navbar-brand preview-brand">
        ⚔ <span>AoS</span> Warscrolls <span className="preview-brand-tag">Preview</span>
      </span>
      {subtitle && <div className="preview-subtitle">{subtitle}</div>}
      {onPrint && <button type="button" className="preview-print-btn" onClick={onPrint}>🖨 Print</button>}
      <a className="preview-fullsite" href="https://aoswarscrolls.com" target="_blank" rel="noreferrer">
        Go to full site — AOSWarscrolls.com
      </a>
    </div>
  );
}
