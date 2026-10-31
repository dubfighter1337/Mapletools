// Dailies page: everything done per character on a reset that isn't weekly bossing.
// Each group has a reset: daily (00:00 UTC), monday, wednesday (events), weekly (Thursday) or monthly.
// Task fields: id (saved in party data, so don't rename one), name, and optionally
//   icon   'bosses/<id>' or 'symbols/<id>' (data/icons, tools/fetch-wiki-icons.ps1); otherwise the group's badge shows
//   sym    [symbol, index] from Site.SYMBOLS: marked "max" in the picker once that symbol is maxed
//   count  times per reset (Ursus)
//   whole  one task for the whole group ("... (all)"), for people who don't tick each area
//   patch  only once that patch is live (data/patches.js); until: gone once that patch is live
// Custom tasks can be added on the page itself.
(function () {
  const v272 = !!(MapleData.patches || {}).v272;

  MapleData.taskGroups = [
    // ---------------------------------------------------------------- daily
    { reset: 'daily', name: 'Event', badge: '★', tasks: [
      { id: 'daily_gift', name: 'Daily Gift' },
    ] },
    { reset: 'daily', name: 'Sacred Symbol Dailies', tasks: [
      { id: 'sacred_dailies', name: 'Sacred Symbol Dailies (all)', icon: 'symbols/cernium', whole: true },
      { id: 'd_cernium', name: 'Cernium', icon: 'symbols/cernium', sym: ['sac', 0] },
      { id: 'd_arcus', name: 'Hotel Arcus', icon: 'symbols/arcus', sym: ['sac', 1] },
      { id: 'd_odium', name: 'Odium', icon: 'symbols/odium', sym: ['sac', 2] },
      { id: 'd_shangri_la', name: 'Shangri-La', icon: 'symbols/shangri_la', sym: ['sac', 3] },
      { id: 'd_arteria', name: 'Arteria', icon: 'symbols/arteria', sym: ['sac', 4] },
      { id: 'd_carcion', name: 'Carcion', icon: 'symbols/carcion', sym: ['sac', 5] },
      { id: 'd_tallahart', name: 'Tallahart', icon: 'symbols/tallahart', sym: ['gsac', 0] },
      { id: 'd_geardock', name: 'Geardock', icon: 'symbols/geardock', sym: ['gsac', 1] },
    ] },
    { reset: 'daily', name: 'Arcane Symbol Dailies', tasks: [
      { id: 'arcane_dailies', name: 'Arcane Symbol Dailies (all)', icon: 'symbols/arcane', whole: true },
      { id: 'd_vanishing_journey', name: 'Vanishing Journey', icon: 'symbols/vanishing_journey', sym: ['arc', 0] },
      { id: 'd_chu_chu', name: 'Chu Chu Island', icon: 'symbols/chu_chu', sym: ['arc', 1] },
      { id: 'd_lachelein', name: 'Lachelein', icon: 'symbols/lachelein', sym: ['arc', 2] },
      { id: 'd_arcana', name: 'Arcana', icon: 'symbols/arcana', sym: ['arc', 3] },
      { id: 'd_morass', name: 'Morass', icon: 'symbols/morass', sym: ['arc', 4] },
      { id: 'd_esfera', name: 'Esfera', icon: 'symbols/esfera', sym: ['arc', 5] },
      { id: 'd_tenebris', name: 'Tenebris', icon: 'symbols/arcane' },
    ] },
    { reset: 'daily', name: '6th Job', badge: '6', tasks: [
      { id: 'sol_erda_booster', name: 'Sol Erda Booster' },
    ] },
    { reset: 'daily', name: 'Other Dailies', badge: '!', tasks: [
      { id: 'monster_park', name: 'Monster Park' },
      { id: 'commerci_voyages', name: 'Commerci Voyages' },
      { id: 'commerci_pq', name: 'Commerci Party Quest' },
      { id: 'ursus', name: 'Ursus', count: v272 ? 1 : 3 },
      { id: 'maple_tour', name: 'Maple Tour' },
      { id: 'home_caretaker', name: 'Talk to Home Caretaker' },
      { id: 'herbs_minerals', name: 'Auto-Harvest Herbs and Minerals' },
    ] },
    { reset: 'daily', name: 'Daily Bosses', tasks: [
      { id: 'db_zakum', name: 'Easy/Normal Zakum', icon: 'bosses/zakum' },
      { id: 'db_hilla', name: 'Normal Hilla', icon: 'bosses/hilla' },
      { id: 'db_hard_hilla', name: 'Hard Hilla', icon: 'bosses/hilla', patch: 'v272' },
      { id: 'db_von_bon', name: 'Normal Von Bon', icon: 'bosses/von_bon' },
      { id: 'db_crimson_queen', name: 'Normal Crimson Queen', icon: 'bosses/crimson_queen' },
      { id: 'db_pierre', name: 'Normal Pierre', icon: 'bosses/pierre' },
      { id: 'db_vellum', name: 'Normal Vellum', icon: 'bosses/vellum' },
      { id: 'db_horntail', name: 'Horntail', icon: 'bosses/horntail' },
      { id: 'db_von_leon', name: 'Von Leon', icon: 'bosses/von_leon' },
      { id: 'db_pink_bean', name: 'Normal Pink Bean', icon: 'bosses/pink_bean' },
      { id: 'db_chaos_pink_bean', name: 'Chaos Pink Bean', icon: 'bosses/pink_bean', patch: 'v272' },
      { id: 'db_cygnus', name: 'Normal Cygnus', icon: 'bosses/cygnus', patch: 'v272' },
      { id: 'db_magnus', name: 'Easy/Normal Magnus', icon: 'bosses/magnus' },
      { id: 'db_arkarium', name: 'Arkarium', icon: 'bosses/arkarium' },
      { id: 'db_papulatus', name: 'Easy/Normal Papulatus', icon: 'bosses/papulatus' },
      { id: 'db_mori_ranmaru', name: 'Mori Ranmaru', icon: 'bosses/mori_ranmaru' },
      { id: 'db_gollux', name: 'Gollux', icon: 'bosses/gollux' },
    ] },
    { reset: 'daily', name: 'Guild', badge: 'G', tasks: [
      { id: 'guild_check_in', name: 'Guild Check In' },
    ] },
    { reset: 'daily', name: 'Legion', badge: 'L', tasks: [
      { id: 'legion_coins', name: 'Claim Legion Coins' },
    ] },
    { reset: 'daily', name: 'Threads of Fate', badge: '♥', tasks: [
      { id: 'tof_reroll', name: 'Reroll Threads of Fate Ask' },
      { id: 'tof_lock', name: 'Lock Threads of Fate Ask' },
      { id: 'tof_ask', name: 'Threads of Fate Ask' },
      { id: 'tof_talk', name: 'Talk Threads of Fate' },
    ] },

    // ---------------------------------------------------------------- monday
    { reset: 'monday', name: 'Threads of Fate', badge: '♥', tasks: [
      { id: 'tof_gift', name: 'Gift Threads of Fate' },
    ] },

    // ---------------------------------------------------------------- weekly (Thursday)
    { reset: 'weekly', name: '6th Job', badge: '6', tasks: [
      { id: 'erdas_request', name: 'Erda\'s Request' },
      { id: 'high_mountain', name: 'High Mountain Dungeon' },
      { id: 'angler_company', name: 'Angler Company Dungeon' },
      { id: 'nightmare_paradise', name: 'Nightmare Paradise Dungeon' },
    ] },
    { reset: 'weekly', name: 'Arcane Symbol Weeklies', tasks: [
      { id: 'arcane_weeklies', name: 'Arcane Symbol Weeklies (all)', icon: 'symbols/arcane', whole: true },
      { id: 'w_erda_spectrum', name: 'Erda Spectrum', icon: 'symbols/vanishing_journey', sym: ['arc', 0] },
      { id: 'w_hungry_muto', name: 'Hungry Muto', icon: 'symbols/chu_chu', sym: ['arc', 1] },
      { id: 'w_midnight_chaser', name: 'Midnight Chaser', icon: 'symbols/lachelein', sym: ['arc', 2] },
      { id: 'w_spirit_savior', name: 'Spirit Savior', icon: 'symbols/arcana', sym: ['arc', 3] },
      { id: 'w_ranheim_defense', name: 'Ranheim Defense', icon: 'symbols/morass', sym: ['arc', 4] },
      { id: 'w_esfera_guardian', name: 'Esfera Guardian', icon: 'symbols/esfera', sym: ['arc', 5] },
    ] },
    { reset: 'weekly', name: 'Guild', badge: 'G', tasks: [
      { id: 'guild_culvert', name: 'Guild Culvert' },
      { id: 'guild_flag_race', name: 'Guild Flag Race' },
      { id: 'guild_castle', name: 'Guild Castle 5k Mobs' },
    ] },
    { reset: 'weekly', name: 'Legion', badge: 'L', tasks: [
      { id: 'legion_dragons', name: 'Legion Weekly Dragon Extermination' },
    ] },
    { reset: 'weekly', name: 'Other Weeklies', badge: '!', tasks: [
      { id: 'mu_lung_dojo', name: 'Mu Lung Dojo' },
      { id: 'scrapyard', name: 'Scrapyard Weeklies' },
      { id: 'dark_world_tree', name: 'Dark World Tree Weeklies' },
      { id: 'mp_extreme', name: 'Monster Park Extreme', until: 'v272' },
      { id: 'extreme_monster_parker', name: 'Extreme Monster Parker', patch: 'v272' },
      { id: 'extreme_momo', name: 'Buy Extreme Momo (General Store)', patch: 'v272' },
    ] },
  ];

  // Leave out what a patch (data/patches.js) adds before it's live, and what it removes after.
  const on = (p) => !!(MapleData.patches || {})[p];
  MapleData.taskGroups.forEach((g) => { g.tasks = g.tasks.filter((t) => (!t.patch || on(t.patch)) && (!t.until || !on(t.until))); });
})();
