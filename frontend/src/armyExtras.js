import axios from 'axios';
import LORE_NAMES from './data/loreNames.json';

// The warscrolls an army brings along beyond its units: the manifestations
// its manifestation lore can summon. Used wherever a roster's warscrolls are
// listed for the popup's page dots (Battle Buddy, share previews), so a
// "Summon Everblaze Comet" pick shows the Everblaze Comet's warscroll.

const loose = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/^the/, '');

// Every manifestation warscroll, fetched once (there are well under 200).
let allManifestations = null;
function loadManifestations() {
  if (!allManifestations) {
    allManifestations = axios.get('/api/warscrolls', { params: { isManifestation: '1', pageSize: 500 } })
      .then(r => (r.data?.data || []).filter(u => u.is_manifestation))
      .catch(err => { allManifestations = null; throw err; });
  }
  return allManifestations;
}

// Spell names ("Summon Everblaze Comet", any case) → their manifestation
// warscrolls, in the order given. Non-summon spells are ignored.
export async function manifestationWarscrolls(spellNames = []) {
  const wants = [...new Set((spellNames || [])
    .map(n => String(n || '').trim())
    .filter(n => /^summon\s+/i.test(n))
    .map(n => loose(n.replace(/^summon\s+/i, ''))))].filter(Boolean);
  if (!wants.length) return [];
  let rows;
  try { rows = await loadManifestations(); } catch { return []; }
  const out = [];
  const seen = new Set();
  for (const want of wants) {
    const hit = rows.find(r => loose(r.name) === want)
      || rows.find(r => { const n = loose(r.name); return n.length > 4 && (n.includes(want) || want.includes(n)); });
    if (hit && !seen.has(hit.id)) { seen.add(hit.id); out.push(hit); }
  }
  return out;
}

// An Army Builder list's manifestation lore spells: the lore picked on its
// Manifestation Lore stage, else the faction's own manifestation lore.
export function armyManifestationSpells(factionSlug, selectedOptions = {}) {
  const own = LORE_NAMES.lores?.[factionSlug]?.manifestation_lore || [];
  const universal = LORE_NAMES.lores?.['endless-spells']?.manifestation_lore || [];
  const chosen = selectedOptions?.lore_manifestation_lore?.[0];
  const lore = chosen ? [...own, ...universal].find(l => l.lore === chosen) : null;
  if (lore) return lore.spells || [];
  return own.flatMap(l => l.spells || []);
}
