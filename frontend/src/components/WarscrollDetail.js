import React, { useEffect } from 'react';

// Split effect text into individual sentences for display.
// Splits at ". " before an uppercase letter.
function splitSentences(text) {
  const parts = [];
  let buf = '';
  for (let i = 0; i < text.length; i++) {
    buf += text[i];
    if (text[i] === '.' && i + 1 < text.length && text[i + 1] === ' ' && /[A-Z]/.test(text[i + 2] || '')) {
      parts.push(buf.trim());
      buf = '';
      i++; // skip the space
    }
  }
  if (buf.trim()) parts.push(buf.trim());
  return parts.length ? parts : [text];
}

function StatBox({ label, value }) {
  if (!value) return null;
  return (
    <div className="detail-stat-box">
      <div className="detail-stat-value">{value}</div>
      <div className="detail-stat-label">{label}</div>
    </div>
  );
}

function WeaponTable({ weapons, type }) {
  const rows = weapons.filter(w => w.type === type);
  if (!rows.length) return null;
  const isRanged = type === 'ranged';
  return (
    <div className="detail-weapon-section">
      <div className="detail-weapon-title">{isRanged ? 'Ranged Weapons' : 'Melee Weapons'}</div>
      <table className="detail-weapon-table">
        <thead>
          <tr>
            <th className="col-weapon-name">Weapon</th>
            {isRanged && <th>Range</th>}
            <th>Atk</th>
            <th>Hit</th>
            <th>Wnd</th>
            <th>Rnd</th>
            <th>Dmg</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((w, i) => (
            <tr key={i}>
              <td className="col-weapon-name">{w.name}</td>
              {isRanged && <td className="col-weapon-stat">{w.range}</td>}
              <td className="col-weapon-stat">{w.attacks}</td>
              <td className="col-weapon-stat">{w.hit}</td>
              <td className="col-weapon-stat">{w.wound}</td>
              <td className="col-weapon-stat">{w.rend}</td>
              <td className="col-weapon-stat">{w.damage}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function WarscrollDetail({ unit, onClose }) {
  const weapons  = React.useMemo(() => { try { return JSON.parse(unit.weapons  || '[]'); } catch { return []; } }, [unit]);
  const abilities = React.useMemo(() => { try { return JSON.parse(unit.abilities || '[]'); } catch { return []; } }, [unit]);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const keywords = unit.keywords ? unit.keywords.split(',').map(k => k.trim()).filter(Boolean) : [];

  return (
    <>
      <div className="detail-overlay" onClick={onClose} />
      <div className="detail-panel">
        <button className="detail-close" onClick={onClose}>✕</button>

        {/* Header */}
        <div className="detail-header">
          <div className="detail-faction">{unit.faction}</div>
          <h2 className="detail-name">{unit.name}</h2>
          {unit.grand_alliance && (
            <span className={`alliance-badge alliance-${unit.grand_alliance}`}>{unit.grand_alliance}</span>
          )}
        </div>

        {/* Core stats */}
        <div className="detail-stats-row">
          <StatBox label="Move"    value={unit.move} />
          <StatBox label="Health"  value={unit.health} />
          <StatBox label="Save"    value={unit.save} />
          <StatBox label="Control" value={unit.control} />
          {unit.ward   && <StatBox label="Ward"   value={unit.ward} />}
          {unit.points && <StatBox label="Points" value={unit.points} />}
        </div>
        {(unit.unit_size || unit.base_size) && (
          <div className="detail-meta-row">
            {unit.unit_size && <span>Unit Size: <b>{unit.unit_size}</b></span>}
            {unit.base_size && <span>Base: <b>{unit.base_size}</b></span>}
          </div>
        )}

        {/* Weapons */}
        {weapons.length > 0 && (
          <div className="detail-section">
            <WeaponTable weapons={weapons} type="ranged" />
            <WeaponTable weapons={weapons} type="melee" />
          </div>
        )}

        {/* Abilities */}
        {abilities.length > 0 && (
          <div className="detail-section">
            <div className="detail-section-title">Abilities</div>
            {abilities.map((ab, i) => (
              <div key={i} className="detail-ability">
                <div className="detail-ability-header">
                  <span className="detail-ability-name">{ab.name}</span>
                  {ab.timing && <span className="detail-ability-timing">{ab.timing}</span>}
                </div>
                {ab.declare && (
                  <div className="detail-ability-declare">
                    <span className="detail-ability-label">Declare:</span> {ab.declare}
                  </div>
                )}
                {ab.effect && (
                  <div className="detail-ability-effect">
                    <span className="detail-ability-label">Effect:</span>
                    {splitSentences(ab.effect).map((sentence, j) => (
                      <p key={j} className="detail-ability-sentence">{sentence}</p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Keywords */}
        {keywords.length > 0 && (
          <div className="detail-section">
            <div className="detail-section-title">Keywords</div>
            <div className="detail-keywords">
              {keywords.map(k => <span key={k} className="detail-keyword">{k}</span>)}
            </div>
          </div>
        )}

        {/* Source link */}
        {unit.url && (
          <div className="detail-source">
            <a href={unit.url} target="_blank" rel="noopener noreferrer">View on Wahapedia ↗</a>
          </div>
        )}
      </div>
    </>
  );
}
