import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { DOCS, DocPage, buildPreviewDocData } from '../components/PathToGloryWizard';
import WarscrollGW from '../components/WarscrollGW';
import { looseKey } from '../importList';

// ── Preview mode ──────────────────────────────────────────────────────────
// What a "Share preview" link opens: the roster's sheets and nothing else.
// No nav, no login, none of the site's tools — the recipient is here to look
// at an opponent's army, not to use the app. Everything is fetched with the
// share token in a header (see requireAuthOrPreview on the server), so this
// page works signed out but still can't reach anything the token doesn't
// cover.
//
// Order of Battle leads because it's the sheet that actually lists the army;
// the other sheets are a click away along the top.
const PREVIEW_DOC_ORDER = ['oob', 'warlord', 'roster', 'army'];

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
  const [activeDoc, setActiveDoc] = useState('oob');
  const [openUnit, setOpenUnit] = useState(null);
  const [error, setError] = useState('');

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
        const [f, a, w] = await Promise.all([
          axios.get('/api/factions').then(r => r.data).catch(() => []),
          slug ? axios.get(`/api/apotheosis/${slug}`).then(r => r.data.steps || []).catch(() => []) : [],
          axios.get(`/api/preview/${token}/warscrolls`).then(r => r.data.data || []).catch(() => []),
        ]);
        if (cancelled) return;
        setFactions(f); setApotheosisSteps(a); setWarscrolls(w);
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.error || 'This preview link could not be opened.');
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const docData = useMemo(
    () => (share ? buildPreviewDocData(share.data, factions, apotheosisSteps) : null),
    [share, factions, apotheosisSteps],
  );

  // Every unit named anywhere on the sheets, mapped to its warscroll, so a
  // name on the Order of Battle can be clicked straight through to the
  // card — matched loosely because a roster row is hand-typed or imported
  // ("Gobsprakk, the Mouth of Mork" vs the database's unpunctuated form).
  const unitsByName = useMemo(() => {
    const m = new Map();
    for (const w of warscrolls) m.set(looseKey(w.name), w);
    return m;
  }, [warscrolls]);

  const namedUnits = useMemo(() => {
    if (!docData) return [];
    const names = [
      ...(docData.oobUnits || []).map(u => u.warscroll || u.name),
      ...(docData.regiments || []).flatMap(r => (r.units || []).map(u => u.name)),
      ...(docData.auxUnits || []).map(u => u.name),
      docData.warlordWarscroll,
    ];
    const seen = new Set();
    const out = [];
    for (const n of names) {
      const w = n && unitsByName.get(looseKey(n));
      if (w && !seen.has(w.id)) { seen.add(w.id); out.push(w); }
    }
    // Faction pages are built from contiguous runs of the same faction in
    // navList, so keep allies grouped rather than interleaved.
    return out.sort((a, b) => (a.faction_slug || '').localeCompare(b.faction_slug || ''));
  }, [docData, unitsByName]);

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

  const navIndex = openUnit ? namedUnits.findIndex(u => u.id === openUnit.id) : -1;
  const doc = DOCS.find(d => d.key === activeDoc) || DOCS[0];
  const images = (doc.key === 'warlord' && docData.warlordDocVariant === 'full') ? doc.imagesFull : doc.images;

  return (
    <div className="preview-page">
      <PreviewHeader subtitle={share.name} />

      <div className="preview-doc-strip">
        {PREVIEW_DOC_ORDER.map(key => {
          const d = DOCS.find(x => x.key === key);
          if (!d) return null;
          return (
            <button
              key={key}
              type="button"
              className={`preview-doc-thumb${key === activeDoc ? ' preview-doc-thumb-active' : ''}`}
              onClick={() => setActiveDoc(key)}
            >
              <span className="preview-doc-thumb-label">{d.title}</span>
              <img src={d.thumb} alt={d.title} />
            </button>
          );
        })}
      </div>

      <div className="preview-doc-view">
        {images.map((img, i) => (
          <DocPage key={img.src} img={img} alt={doc.title} docKey={doc.key} pageIndex={i} data={docData} />
        ))}
      </div>

      {namedUnits.length > 0 && (
        <div className="preview-units">
          <div className="preview-units-title">Warscrolls in this army</div>
          <div className="preview-units-row">
            {namedUnits.map(u => (
              <button key={u.id} type="button" className="preview-unit-chip" onClick={() => setOpenUnit(u)}>
                {u.name}
              </button>
            ))}
          </div>
        </div>
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
              onJump={i => namedUnits[i] && setOpenUnit(namedUnits[i])}
              onPrev={navIndex > 0 ? () => setOpenUnit(namedUnits[navIndex - 1]) : undefined}
              onNext={navIndex < namedUnits.length - 1 ? () => setOpenUnit(namedUnits[navIndex + 1]) : undefined}
              onClose={() => setOpenUnit(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function PreviewHeader({ subtitle }) {
  return (
    <div className="preview-header">
      <div className="preview-brand">
        <span className="preview-brand-mark" aria-hidden="true">◈</span>
        <span className="preview-brand-text">
          AoS Warscrolls <span className="preview-brand-tag">Preview</span>
        </span>
      </div>
      {subtitle && <div className="preview-subtitle">{subtitle}</div>}
      <a className="preview-fullsite" href="https://aoswarscrolls.com" target="_blank" rel="noreferrer">
        Go to full site — AOSWarscrolls.com
      </a>
    </div>
  );
}
