/**
 * Seed the warscrolls.spearhead column with AoS 4th edition Spearhead army data.
 * The spearhead column stores the specific spearhead name (e.g. "Fangs of the Blood God").
 * Units that appear in multiple spearheads have pipe-separated values:
 *   "Gnawfeast Clawpack|Warpspark Clawpack"
 *
 * Run: node scrapeSpearheads.js
 */

const { getDb, initDb } = require('./db');

// Each spearhead entry: name, faction_slug(s), and unit names as they appear in the DB.
// Units are matched by LOWER(name) exact or fuzzy LIKE search within the faction.
// faction_slug can be a string or array (for multi-subfaction armies like Orruk Warclans).
const SPEARHEADS = [
  // ── ORDER ────────────────────────────────────────────────────────────────
  {
    name: 'Castelite Company',
    faction: 'cities-of-sigmar',
    units: ['Freeguild Cavalier-Marshal', 'Freeguild Steelhelms', 'Freeguild Cavaliers', 'Ironweld Great Cannon'],
  },
  {
    name: 'Fusil-Platoon',
    faction: 'cities-of-sigmar',
    units: ['Fusil-Major on Ogor Warhulk', 'Alchemite Warforger', 'Freeguild Fusiliers', 'Wildercorps Hunters'],
  },
  {
    name: "Zenestra's Zealots",
    faction: 'cities-of-sigmar',
    units: ['Freeguild Marshal and Relic Envoy', 'Pontifex Zenestra', 'Freeguild Command Corps', 'Freeguild Steelhelms'],
  },
  {
    name: 'Heartflayer Troupe',
    faction: 'daughters-of-khaine',
    units: ['Melusai Ironscale', 'Witch Aelves', 'Doomfire Warlocks', 'Blood Stalkers'],
  },
  {
    name: 'Khainite Shadow Coven',
    faction: 'daughters-of-khaine',
    units: ['Slaughter Queen on Cauldron of Blood', 'Hag Queen', 'Bloodwrack Medusa', 'Khainite Shadowstalkers', 'Sisters of Slaughter'],
  },
  {
    name: 'Saga Axeband',
    faction: 'fyreslayers',
    units: ['Battlesmith', 'Hearthguard Berzerkers', 'Vulkite Berzerkers'],
  },
  {
    name: 'Akhelian Tide Guard',
    faction: 'idoneth-deepkin',
    units: ['Akhelian King', 'Akhelian Morrsarr Guard', 'Akhelian Ishlaen Guard', 'Namarti Reavers'],
  },
  {
    name: 'Soulraid Hunt',
    faction: 'idoneth-deepkin',
    units: ['Isharann Soulscryer', 'Akhelian Morrsarr Guard', 'Akhelian Allopex', 'Namarti Thralls'],
  },
  {
    name: 'Grundstok Trailblazers',
    faction: 'kharadron-overlords',
    units: ['Endrinmaster with Dirigible Suit', 'Grundstok Thunderers', 'Grundstok Gunhauler', 'Endrinriggers'],
  },
  {
    name: 'Skyhammer Task Force',
    faction: 'kharadron-overlords',
    units: ['Arkanaut Admiral', 'Arkanaut Company', 'Skywardens', 'Arkanaut Frigate'],
  },
  {
    name: 'Glittering Phalanx',
    faction: 'lumineth-realm-lords',
    units: ['Scinari Cathallar', 'Vanari Auralan Sentinels', 'Vanari Auralan Wardens', 'Vanari Bladelords'],
  },
  {
    name: 'Hurakan Vanguard',
    faction: 'lumineth-realm-lords',
    units: ['Hurakan Windmage', 'Hurakan Windchargers', 'Vanari Auralan Wardens', 'Hurakan Spirit of the Wind'],
  },
  {
    name: 'Starscale Warhost',
    faction: 'seraphon',
    units: ['Saurus Oldblood on Carnosaur', 'Saurus Warriors', 'Kroxigor'],
  },
  {
    name: 'Sunblooded Prowlers',
    faction: 'seraphon',
    units: ['Sunblood', 'Saurus Warriors', 'Hunters of Huanchi', 'Terrawings', 'Spawn of Chotec'],
  },
  {
    name: "Yndrasta's Spearhead",
    faction: 'stormcast-eternals',
    units: ['Yndrasta', 'Knight-Vexillor', 'Annihilators', 'Vanquishers', 'Stormstrike Chariot'],
  },
  {
    name: 'Vigilant Brotherhood',
    faction: 'stormcast-eternals',
    units: ['Lord-Vigilant on Gryph-stalker', 'Lord-Veritant', 'Prosecutors', 'Liberators'],
  },
  {
    name: 'Bitterbark Copse',
    faction: 'sylvaneth',
    units: ['Branchwych', 'Treelord', 'Kurnoth Hunters', 'Treerevenants'],
  },
  {
    name: 'Spitewing Flight',
    faction: 'sylvaneth',
    units: ['Archrevenant', 'Gossamid Archers', 'Spiterider Lancers', 'Revenant Seekers'],
  },
  // ── CHAOS ─────────────────────────────────────────────────────────────────
  {
    name: 'Fangs of the Blood God',
    faction: 'blades-of-khorne',
    units: ['Karanak', 'Flesh Hounds', 'Claws of Karanak'],
  },
  {
    name: 'Gore Pilgrims',
    faction: 'blades-of-khorne',
    units: ['Slaughterpriest', 'Blood Warriors', 'Bloodreavers', 'Mighty Skullcrushers'],
  },
  {
    name: 'Fluxblade Coven',
    faction: 'disciples-of-tzeentch',
    units: ['Magister on Disc of Tzeentch', 'Flamers of Tzeentch', 'Screamers of Tzeentch', 'Tzaangors', 'Kairic Acolytes'],
  },
  {
    name: 'Tzaangor Warflock',
    faction: 'disciples-of-tzeentch',
    units: ['Tzaangor Shaman', 'Tzaangors', 'Tzaangor Enlightened', 'Tzaangor Skyfires'],
  },
  {
    name: 'Blades of The Lurid Dream',
    faction: 'hedonites-of-slaanesh',
    units: ['Shardspeaker of Slaanesh', 'Blissbarb Archers', 'Slickblade Seekers', 'Slaangor Fiendbloods'],
  },
  {
    name: 'Epicurean Revellers',
    faction: 'hedonites-of-slaanesh',
    units: ['Thricefold Discord', 'Fiends', 'Daemonettes', 'Seekers'],
  },
  {
    name: 'Bleak Host',
    faction: 'maggotkin-of-nurgle',
    units: ['Spoilpox Scrivener', 'Pusgoyle Blightlords', 'Putrid Blightkings', 'Plaguebearers'],
  },
  {
    name: 'Bubonic Cell',
    faction: 'maggotkin-of-nurgle',
    units: ['Rotbringer Sorcerer', 'Nurglings', 'Beast of Nurgle', 'Rotmire Creed'],
  },
  {
    name: 'Gnawfeast Clawpack',
    faction: 'skaven',
    units: ['Clawlord', 'Grey Seer', 'Warlock Engineer', 'Clanrats', 'Rat Ogors'],
  },
  {
    name: 'Warpspark Clawpack',
    faction: 'skaven',
    units: ['Grey Seer', 'Stormfiends', 'Warp Lightning Cannon', 'Clanrats'],
  },
  {
    name: 'Bloodwind Legion',
    faction: 'slaves-to-darkness',
    units: ['Chaos Lord', 'Chaos Chariot', 'Chaos Warriors', 'Chaos Knights'],
  },
  {
    name: 'Darkoath Raiders',
    faction: 'slaves-to-darkness',
    units: ['Darkoath Warqueen', 'Darkoath Savagers', 'Darkoath Fellriders', 'Darkoath Marauders'],
  },
  // ── DEATH ─────────────────────────────────────────────────────────────────
  {
    name: 'Carrion Retainers',
    faction: 'flesh-eater-courts',
    units: ['Abhorrant Archregent', 'Cryptguard', 'Morbheg Knights', 'Varghulf Courtier'],
  },
  {
    name: 'Charnel Watch',
    faction: 'flesh-eater-courts',
    units: ['Abhorrant Gorewarden', 'Royal Beastflayers', 'Crypt Horrors', 'Crypt Flayers'],
  },
  {
    name: 'Cursed Shacklehorde',
    faction: 'nighthaunt',
    units: ['Spirit Torment', 'Chainghasts', 'Bladegheist Revenants', 'Dreadscythe Harridans', 'Dreadblade Harrows'],
  },
  {
    name: 'Slasher Host',
    faction: 'nighthaunt',
    units: ['Knight of Shrouds', 'Spirit Hosts', 'Grimghast Reapers', 'Chainrasps'],
  },
  {
    name: 'Kavalos Vanguard',
    faction: 'ossiarch-bonereapers',
    units: ['Liege-Kavalos', 'Kavalos Deathriders', 'Teratic Cohort'],
  },
  {
    name: 'Mortisan Elite',
    faction: 'ossiarch-bonereapers',
    units: ['Mortisan Ossifector', 'Immortis Guard', 'Necropolis Stalkers', 'Morghast Archai'],
  },
  {
    name: 'Tithe-Reaper Echelon',
    faction: 'ossiarch-bonereapers',
    units: ['Mortisan Soulreaper', 'Mortek Guard', 'Kavalos Deathriders', 'Gothizzar Harvester'],
  },
  {
    name: 'Bloodcrave Hunt',
    faction: 'soulblight-gravelords',
    units: ['Vampire Lord', 'Deathrattle Skeletons', 'Blood Knights', 'Vargheists'],
  },
  {
    name: 'Deathrattle Tomb Host',
    faction: 'soulblight-gravelords',
    units: ['Wight King', 'Barrow Guard', 'Barrow Knights', 'Deathrattle Skeletons'],
  },
  // ── DESTRUCTION ────────────────────────────────────────────────────────────
  {
    name: 'Bad Moon Madmob',
    faction: 'gloomspite-gitz',
    units: ['Loonboss', 'Moonclan Stabbas', 'Squig Hoppers', 'Rockgut Troggoths'],
  },
  {
    name: 'Snarlpack Huntaz',
    faction: 'gloomspite-gitz',
    units: ['Snarlboss', 'Wolfgit Retinue', 'Snarlpack Cavalry', 'Sunsteala Wheela'],
  },
  {
    name: 'Ironjawz Bigmob',
    faction: ['ironjawz', 'orruk-warclans'],
    units: ['Megaboss', 'Brute Ragerz', 'Ardboyz', 'Brutes'],
  },
  {
    name: 'Swampskulka Gang',
    faction: ['kruleboyz', 'orruk-warclans'],
    units: ['Killaboss on Great Gnashtoof', 'Murknob with Belcha-banna', 'Man-skewer Boltboyz', 'Gutrippaz', 'Beast-skewer Killbow'],
  },
  {
    name: 'Scrapglutt',
    faction: 'ogor-mawtribes',
    units: ['Gnoblar Scraplauncher', 'Ironguts', 'Gnoblars'],
  },
  {
    name: "Tyrant's Bellow",
    faction: 'ogor-mawtribes',
    units: ['Tyrant', 'Mournfang Pack', 'Ogor Gluttons', 'Leadbelchers', 'Ironblaster'],
  },
  {
    name: 'Wallsmasher Stomp',
    faction: 'sons-of-behemat',
    units: ['Mancrusher Gargant', 'Mancrusher Mob'],
  },
  // ── NEW / UNRELEASED FACTIONS (may not be in DB yet) ─────────────────────
  {
    name: 'Helforge Host',
    faction: 'helsmiths-of-hashut',
    units: ['War Despot', 'Dominator Engine', 'Tormentor Bombard', 'Infernal Cohort'],
  },
];

function run(opts = {}) {
  initDb();
  const db = getDb();

  // Clear all existing spearhead values
  db.prepare('UPDATE warscrolls SET spearhead = NULL').run();

  let totalUpdated = 0;
  const missed = [];
  // Track which warscroll IDs have been assigned which spearhead names, to build pipe-separated lists
  const assigned = new Map(); // warscroll_id → Set of spearhead names

  const tryMatch = (factionSlug, unitName) => {
    const slugs = Array.isArray(factionSlug) ? factionSlug : [factionSlug];
    const nameLower = unitName.toLowerCase().trim();
    // DB strips hyphens during scraping, so also try hyphen-stripped version
    const nameNorm = nameLower.replace(/-/g, '');

    for (const slug of slugs) {
      // Exact match
      let row = db.prepare(
        'SELECT id, name FROM warscrolls WHERE faction_slug = ? AND LOWER(name) = ?'
      ).get(slug, nameLower)
      || db.prepare(
        'SELECT id, name FROM warscrolls WHERE faction_slug = ? AND LOWER(name) = ?'
      ).get(slug, nameNorm);

      if (!row) {
        // Prefix match
        row = db.prepare(
          "SELECT id, name FROM warscrolls WHERE faction_slug = ? AND LOWER(name) LIKE ? LIMIT 1"
        ).get(slug, `${nameLower}%`)
        || db.prepare(
          "SELECT id, name FROM warscrolls WHERE faction_slug = ? AND LOWER(name) LIKE ? LIMIT 1"
        ).get(slug, `${nameNorm}%`);
      }

      if (!row) {
        // Substring match — also try DB-side hyphen stripping
        row = db.prepare(
          "SELECT id, name FROM warscrolls WHERE faction_slug = ? AND LOWER(name) LIKE ? LIMIT 1"
        ).get(slug, `%${nameLower}%`)
        || db.prepare(
          "SELECT id, name FROM warscrolls WHERE faction_slug = ? AND LOWER(REPLACE(name,'-','')) LIKE ? LIMIT 1"
        ).get(slug, `%${nameNorm}%`);
      }

      if (row) return row;
    }
    return null;
  };

  for (const sp of SPEARHEADS) {
    console.log(`\n${sp.name} (${Array.isArray(sp.faction) ? sp.faction.join('/') : sp.faction}):`);
    // Track matched unit names to avoid double-counting for multi-size units (e.g. Flesh Hounds appearing twice)
    const matchedUnitNames = new Set();

    for (const unitName of sp.units) {
      const row = tryMatch(sp.faction, unitName);
      if (row) {
        if (!assigned.has(row.id)) assigned.set(row.id, new Set());
        assigned.get(row.id).add(sp.name);
        if (!matchedUnitNames.has(row.name)) {
          console.log(`  ✓ ${row.name}`);
          matchedUnitNames.add(row.name);
          totalUpdated++;
        }
      } else {
        console.log(`  ✗ NOT FOUND: "${unitName}"`);
        missed.push({ spearhead: sp.name, slug: Array.isArray(sp.faction) ? sp.faction[0] : sp.faction, unitName });
      }
    }
  }

  // Write back: pipe-separated spearhead names for units in multiple spearheads
  for (const [id, names] of assigned.entries()) {
    const value = [...names].join('|');
    db.prepare('UPDATE warscrolls SET spearhead = ? WHERE id = ?').run(value, id);
  }

  if (opts.closeDb !== false && require.main === module) db.close();

  console.log(`\n✅ Updated ${totalUpdated} unique DB units across ${SPEARHEADS.length} spearheads.`);
  if (missed.length) {
    console.log(`⚠️  ${missed.length} unit(s) not found in DB:`);
    missed.forEach(m => console.log(`   [${m.spearhead}] "${m.unitName}"`));
  }
}

if (require.main === module) run();
module.exports = { run };
