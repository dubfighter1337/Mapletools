// Upcoming game patches, already worked into the data but switched off until they're live.
// Set a patch to true once it's in the game (then run tools/bump-version.ps1 and publish).
MapleData.patches = {
  // v.272, November 11, 2026: Easy Cygnus removed; Normal Cygnus, Hard Hilla and Chaos Pink Bean become
  // daily bosses; Monster Park Extreme removed (new weekly "Extreme Monster Parker" quest and Extreme Momo
  // in the General Store); Ursus once a day with 2x Golden Time all day; weekly and monthly bosses get a
  // 20 minute time limit and most lose about a third of their HP (below).
  v272: false,
};

// What a patch changes about the bosses themselves, shown on the Boss Info page once it's switched on.
// hpCut: the share of HP taken off per boss and difficulty (the patch notes give them as "~31.5%").
MapleData.patchBossChanges = {
  v272: {
    timeLimit: '20 minutes',
    hpCut: {
      'zakum:chaos': 0.325, 'magnus:hard': 0.317, 'papulatus:chaos': 0.313,
      'lotus:normal': 0.316, 'lotus:hard': 0.316, 'lotus:extreme': 0.322,
      'damien:normal': 0.315, 'damien:hard': 0.315,
      'slime:normal': 0.314, 'slime:chaos': 0.314,
      'lucid:easy': 0.315, 'lucid:normal': 0.315, 'lucid:hard': 0.285,
      'will:easy': 0.329, 'will:normal': 0.329, 'will:hard': 0.329,
      'gloom:normal': 0.323, 'gloom:chaos': 0.323,
      'verus_hilla:normal': 0.314, 'verus_hilla:hard': 0.314,
      'darknell:normal': 0.313, 'darknell:hard': 0.313,
      'black_mage:hard': 0.649, 'black_mage:extreme': 0.323,
      'seren:normal': 0.321, 'seren:hard': 0.321, 'seren:extreme': 0.321,
      'kalos:easy': 0.332, 'kalos:normal': 0.332, 'kalos:chaos': 0.332, 'kalos:extreme': 0.332,
      'first_adversary:easy': 0.322, 'first_adversary:normal': 0.322, 'first_adversary:hard': 0.322, 'first_adversary:extreme': 0.322,
      'kaling:easy': 0.322, 'kaling:normal': 0.322, 'kaling:hard': 0.322, 'kaling:extreme': 0.322,
      'malefic_star:normal': 0.32, 'malefic_star:hard': 0.32,
      'limbo:normal': 0.325, 'limbo:hard': 0.325,
      'baldrix:normal': 0.322, 'baldrix:hard': 0.322,
      'jupiter:normal': 0.32, 'jupiter:hard': 0.32,
    },
  },
};
