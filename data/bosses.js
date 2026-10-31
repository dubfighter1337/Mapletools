// Weekly and monthly bosses (GMS): the Intense Power Crystal's sale price per difficulty, for a party
// of 1 (a party of 2 or 3 splits it). Prices are Heroic world prices from the in-game price list
// (October 2026). Daily bosses belong to the dailies tool, not here.
// Used by the Boss Schedule's name suggestions and by the Boss Planner.
// To add a boss or a difficulty, add it here. id is used in saved data, so don't rename one.
// aliases: other names people use in group names ("BM"). Icons: data/icons/bosses/<id>.png (tools/fetch-boss-icons.ps1).
MapleData.bosses = [
  { id: 'black_mage', name: 'Black Mage', reset: 'monthly', aliases: ['BM'], modes: { Hard: 4500000000, Extreme: 18000000000 } },
  { id: 'jupiter', name: 'Jupiter', modes: { Normal: 2965000000, Hard: 5953000000 } },
  { id: 'kaling', name: 'Kaling', modes: { Easy: 1031250000, Normal: 1506500000, Hard: 2990000000, Extreme: 6026000000 } },
  { id: 'first_adversary', name: 'First Adversary', aliases: ['Adversary'], modes: { Easy: 985000000, Normal: 1365000000, Hard: 2940000000, Extreme: 5880000000 } },
  { id: 'kalos', name: 'Kalos', aliases: ['Kalos the Guardian'], modes: { Easy: 937500000, Normal: 1300000000, Chaos: 2600000000, Extreme: 5200000000 } },
  { id: 'seren', name: 'Seren', aliases: ['Chosen Seren'], modes: { Normal: 889021875, Hard: 1096562500, Extreme: 4235000000 } },
  { id: 'baldrix', name: 'Baldrix', modes: { Normal: 2800000000, Hard: 4200000000 } },
  { id: 'malefic_star', name: 'Malefic Star', modes: { Normal: 1452000000, Hard: 3990000000 } },
  { id: 'limbo', name: 'Limbo', modes: { Normal: 2100000000, Hard: 3745000000 } },
  { id: 'lotus', name: 'Lotus', modes: { Normal: 162562500, Hard: 444675000, Extreme: 1397500000 } },
  { id: 'verus_hilla', name: 'Verus Hilla', aliases: ['VHilla'], modes: { Normal: 581880000, Hard: 762105000 } },
  { id: 'darknell', name: 'Darknell', modes: { Normal: 316875000, Hard: 667920000 } },
  { id: 'will', name: 'Will', modes: { Easy: 246744750, Normal: 279075000, Hard: 621810000 } },
  { id: 'slime', name: 'Slime', aliases: ['Guardian Angel Slime', 'GAS'], modes: { Normal: 231673500, Chaos: 600578125 } },
  { id: 'gloom', name: 'Gloom', modes: { Normal: 297675000, Chaos: 563945000 } },
  { id: 'lucid', name: 'Lucid', modes: { Easy: 237009375, Normal: 253828125, Hard: 504000000 } },
  { id: 'damien', name: 'Damien', modes: { Normal: 169000000, Hard: 421875000 } },
  { id: 'akechi', name: 'Akechi', aliases: ['Akechi Mitsuhide'], modes: { Normal: 144000000 } },
  { id: 'papulatus', name: 'Papulatus', aliases: ['Papu'], modes: { Chaos: 132250000 } },
  { id: 'vellum', name: 'Vellum', modes: { Chaos: 105062500 } },
  { id: 'magnus', name: 'Magnus', modes: { Hard: 95062500 } },
  { id: 'princess_no', name: 'Princess No', modes: { Normal: 81000000 } },
  { id: 'zakum', name: 'Zakum', modes: { Chaos: 81000000 } },
  { id: 'pierre', name: 'Pierre', modes: { Chaos: 81000000 } },
  { id: 'von_bon', name: 'Von Bon', modes: { Chaos: 81000000 } },
  { id: 'crimson_queen', name: 'Crimson Queen', aliases: ['Queen'], modes: { Chaos: 81000000 } },
  { id: 'cygnus', name: 'Cygnus', modes: { Easy: 45562500, Normal: 72250000 } },
  { id: 'pink_bean', name: 'Pink Bean', modes: { Chaos: 64000000 } },
  { id: 'hilla', name: 'Hilla', modes: { Hard: 56250000 } },
];

// Patch v.272 (November 11, 2026), prepared but switched off. Set to true once the patch is live:
// Easy Cygnus is removed, and Normal Cygnus, Hard Hilla and Chaos Pink Bean become daily bosses.
MapleData.bossPatchV272 = false;
if (MapleData.bossPatchV272) {
  MapleData.bosses = MapleData.bosses.filter((b) => !['cygnus', 'hilla', 'pink_bean'].includes(b.id));
}

// Groups that clear several bosses together. In the Boss Schedule a group named after one of these
// lists its bosses as checkboxes (all ticked), so a group that doesn't do one of them can untick it.
MapleData.bossBundles = [
  { name: 'Ctene', bosses: ['verus_hilla:hard', 'darknell:hard', 'will:hard', 'gloom:chaos', 'lucid:hard', 'slime:chaos', 'lotus:hard', 'damien:hard'] },
];

// Ready-made picks in the Boss Planner (each party can save its own too).
MapleData.bossPresets = [
  { name: 'Ctene mule', bosses: ['verus_hilla:hard', 'darknell:hard', 'will:hard', 'slime:chaos', 'gloom:chaos', 'lucid:hard', 'lotus:hard', 'damien:hard',
    'akechi:normal', 'papulatus:chaos', 'vellum:chaos', 'magnus:hard', 'crimson_queen:chaos', 'princess_no:normal'] },
];
