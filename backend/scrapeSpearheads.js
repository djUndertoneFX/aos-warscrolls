/**
 * Seed the warscrolls.spearhead column with AoS 4th edition Spearhead army data.
 * Each faction has one official Spearhead army. We store the faction name in the
 * spearhead column for each unit that belongs to that faction's Spearhead force.
 *
 * Unit names must match exactly what's in the DB (lowercase, normalized).
 * Run: node scrapeSpearheads.js
 */

const { getDb, initDb } = require('./db');

// Maps faction_slug -> { display name, unit names as they appear in the DB }
const SPEARHEADS = {
  'stormcast-eternals': {
    name: 'Stormcast Eternals',
    units: [
      'lordimperatant',
      'liberators',
      'prosecutors',
      'annihilators',
    ],
  },
  'cities-of-sigmar': {
    name: 'Cities of Sigmar',
    units: [
      'freeguild marshal and relic envoy',
      'freeguild steelhelms',
      'freeguild fusiliers',
      'freeguild cavaliers',
    ],
  },
  'daughters-of-khaine': {
    name: 'Daughters of Khaine',
    units: [
      'slaughter queen',
      'witch aelves',
      'blood sisters',
      'blood stalkers',
    ],
  },
  'fyreslayers': {
    name: 'Fyreslayers',
    units: [
      'auric runemaster',
      'vulkite berzerkers with fyresteel weapons',
      'hearthguard berzerker with berzerker broadaxes',
      'auric hearthguard',
    ],
  },
  'idoneth-deepkin': {
    name: 'Idoneth Deepkin',
    units: [
      'isharann soulrender',
      'namarti thralls',
      'namarti reavers',
      'akhelian morrsarr guard',
    ],
  },
  'kharadron-overlords': {
    name: 'Kharadron Overlords',
    units: [
      'aetherkhemist',
      'arkanaut company',
      'grundstok thunderers',
      'endrinriggers',
    ],
  },
  'lumineth-realm-lords': {
    name: 'Lumineth Realm-lords',
    units: [
      'scinari cathallar',
      'vanari auralan wardens',
      'vanari auralan sentinels',
      'hurakan windchargers',
    ],
  },
  'seraphon': {
    name: 'Seraphon',
    units: [
      'skink starpriest',
      'skinks',
      'saurus warriors',
      'aggradon lancers',
    ],
  },
  'sylvaneth': {
    name: 'Sylvaneth',
    units: [
      'branchwych',
      'dryads',
      'treerevenants',
      'kurnoth hunters with greatbows',
    ],
  },
  'blades-of-khorne': {
    name: 'Blades of Khorne',
    units: [
      'slaughterpriest',
      'bloodreavers',
      'bloodletters',
      'flesh hounds',
    ],
  },
  'disciples-of-tzeentch': {
    name: 'Disciples of Tzeentch',
    units: [
      'magister',
      'kairic acolytes',
      'pink horrors',
      'flamers of tzeentch',
    ],
  },
  'hedonites-of-slaanesh': {
    name: 'Hedonites of Slaanesh',
    units: [
      'shardspeaker of slaanesh',
      'blissbarb archers',
      'daemonettes',
      'slickblade seekers',
    ],
  },
  'maggotkin-of-nurgle': {
    name: 'Maggotkin of Nurgle',
    units: [
      'lord of plagues',
      'putrid blightkings',
      'plaguebearers',
      'nurglings',
    ],
  },
  'skaven': {
    name: 'Skaven',
    units: [
      'warlock bombardier',
      'clanrats',
      'stormfiends',
      'warplock jezzails',
    ],
  },
  'slaves-to-darkness': {
    name: 'Slaves to Darkness',
    units: [
      'chaos lord',
      'chaos warriors',
      'darkoath marauders',
      'chaos knights',
    ],
  },
  'flesh-eater-courts': {
    name: 'Flesh-eater Courts',
    units: [
      'abhorrant archregent',
      'crypt ghouls',
      'crypt horrors',
      'crypt flayers',
    ],
  },
  'nighthaunt': {
    name: 'Nighthaunt',
    units: [
      'lady olynder mortarch of grief',
      'chainrasps',
      'grimghast reapers',
      'myrmourn banshees',
    ],
  },
  'ossiarch-bonereapers': {
    name: 'Ossiarch Bonereapers',
    units: [
      'mortisan soulmason',
      'mortek guard',
      'kavalos deathriders',
      'gothizzar harvester',
    ],
  },
  'soulblight-gravelords': {
    name: 'Soulblight Gravelords',
    units: [
      'lauka vai mother of nightmares',
      'deathrattle skeletons',
      'dire wolves',
      'vargheists',
    ],
  },
  'gloomspite-gitz': {
    name: 'Gloomspite Gitz',
    units: [
      'loonboss',
      'moonclan stabbas',
      'squig hoppers',
      'squig herd',
    ],
  },
  'ironjawz': {
    name: 'Ironjawz',
    units: [
      'megaboss',
      'ardboyz',
      'brutes',
      'goregruntas',
    ],
  },
  'kruleboyz': {
    name: 'Kruleboyz',
    units: [
      'swampcalla shaman with potgrot',
      'gutrippaz',
      'manskewer boltboyz',
      'hobgrot slittaz',
    ],
  },
  'ogor-mawtribes': {
    name: 'Ogor Mawtribes',
    units: [
      'butcher',
      'ogor gluttons',
      'leadbelchers',
      'mournfang pack',
    ],
  },
  'sons-of-behemat': {
    name: 'Sons of Behemat',
    units: [
      'warstomper megagargant',
      'mancrusher mob',
    ],
  },
};

function run(opts = {}) {
  initDb();
  const db = getDb();

  // Clear all existing spearhead values first
  db.prepare('UPDATE warscrolls SET spearhead = NULL').run();

  let totalUpdated = 0;
  const missed = [];

  for (const [slug, sp] of Object.entries(SPEARHEADS)) {
    console.log(`\n${sp.name}:`);
    for (const unitName of sp.units) {
      // Exact match against the normalized name in the DB
      const row = db.prepare(
        'SELECT id, name FROM warscrolls WHERE faction_slug = ? AND LOWER(name) = ?'
      ).get(slug, unitName.toLowerCase());

      if (row) {
        db.prepare('UPDATE warscrolls SET spearhead = ? WHERE id = ?').run(sp.name, row.id);
        console.log(`  ✓ ${row.name}`);
        totalUpdated++;
      } else {
        // Try a LIKE fallback (partial match)
        const fuzzy = db.prepare(
          "SELECT id, name FROM warscrolls WHERE faction_slug = ? AND LOWER(name) LIKE ?"
        ).get(slug, `%${unitName.toLowerCase()}%`);
        if (fuzzy) {
          db.prepare('UPDATE warscrolls SET spearhead = ? WHERE id = ?').run(sp.name, fuzzy.id);
          console.log(`  ~ ${fuzzy.name}  (fuzzy match for "${unitName}")`);
          totalUpdated++;
        } else {
          console.log(`  ✗ NOT FOUND: "${unitName}"`);
          missed.push({ slug, unitName });
        }
      }
    }
  }

  if (opts.closeDb !== false && require.main === module) db.close();

  console.log(`\n✅ Updated ${totalUpdated} units with spearhead data.`);
  if (missed.length) {
    console.log(`⚠️  ${missed.length} unit(s) not found:`);
    missed.forEach(m => console.log(`   [${m.slug}] "${m.unitName}"`));
  }
}

if (require.main === module) run();
module.exports = { run };
