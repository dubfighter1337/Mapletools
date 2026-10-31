// Boss helpers shared by the Boss Schedule, Boss Planner and Dailies: the game's resets, the boss list
// from data/bosses.js, and which bosses a schedule group clears for which characters.
// A boss at a difficulty is written as a key: "lucid:hard".
window.Bossing = (function () {
  'use strict';

  // ------------------------------------------------------------ resets (UTC, like the game)

  // Resets on a weekday at 00:00 UTC: the weekly one (bosses, most weeklies) is Thursday.
  const WEEKDAY = { monday: 1, wednesday: 3, weekly: 4 };

  function periodStart(kind, now = Date.now()) {
    const d = new Date(now);
    const y = d.getUTCFullYear(), m = d.getUTCMonth(), day = d.getUTCDate();
    if (kind === 'daily') return Date.UTC(y, m, day);
    if (kind === 'monthly') return Date.UTC(y, m, 1);
    const since = (d.getUTCDay() - (WEEKDAY[kind] ?? 4) + 7) % 7;
    return Date.UTC(y, m, day - since);
  }

  function nextReset(kind, now = Date.now()) {
    const start = new Date(periodStart(kind, now));
    if (kind === 'daily') return start.getTime() + 864e5;
    if (kind === 'monthly') return Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1);
    return start.getTime() + 7 * 864e5;
  }

  function untilText(ts) {
    const ms = Math.max(0, ts - Date.now());
    const d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, m = Math.floor(ms / 6e4) % 60;
    return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
  }
  const localTime = (ts) => new Date(ts).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  // ------------------------------------------------------------ boss list

  const BOSSES = MapleData.bosses || [];
  const BUNDLES = MapleData.bossBundles || [];
  const byId = Object.fromEntries(BOSSES.map((b) => [b.id, b]));
  const resetOf = (id) => (byId[id] && byId[id].reset) || 'weekly';
  const icon = (id) => (byId[id] ? byId[id].icon || `data/icons/bosses/${id}.png` : ''); // tools/fetch-wiki-icons.ps1
  // <img> for a boss icon; one that's missing hides itself instead of showing a broken image.
  const iconImg = (id) => (byId[id]
    ? `<img class="boss-icon" src="${icon(id)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`
    : '<span class="boss-icon"></span>');
  const modeName = (b, mode) => Object.keys(b.modes).find((m) => m.toLowerCase() === String(mode || '').toLowerCase());

  function parse(key) {
    const [id, mode] = String(key || '').split(':');
    const boss = byId[id];
    const m = boss && modeName(boss, mode);
    return m ? { boss, id, mode: m, key: `${id}:${m.toLowerCase()}` } : null;
  }
  const keyOf = (id, mode) => `${id}:${String(mode).toLowerCase()}`;
  const label = (key) => { const p = parse(key); return p ? `${p.mode} ${p.boss.name}` : String(key); };
  const price = (key) => { const p = parse(key); return p ? p.boss.modes[p.mode] || 0 : 0; };
  const allKeys = () => BOSSES.flatMap((b) => Object.keys(b.modes).map((m) => keyOf(b.id, m)));

  // The most players a boss difficulty allows (data/boss-party.js, from the wiki: Extreme Lotus 2,
  // the Grandis bosses 3); for several bosses (a Ctene group) the smallest of them.
  const PARTY_MAX = 6;
  function maxParty(keys) {
    const sizes = [].concat(keys).map(parse).filter(Boolean)
      .map((p) => ((MapleData.bossParty || {})[p.id] || {})[p.mode.toLowerCase()] || PARTY_MAX);
    return sizes.length ? Math.min(...sizes) : PARTY_MAX;
  }

  // ------------------------------------------------------------ schedule groups -> bosses

  const SHORT_MODES = { e: 'easy', n: 'normal', h: 'hard', c: 'chaos', x: 'extreme' };
  const bundleFor = (title) => BUNDLES.find((x) => String(title || '').trim().toLowerCase().startsWith(x.name.toLowerCase()));

  // The bosses a group's name most likely means: a bundle ("Ctene ..."), or a boss with its difficulty
  // written in full ("Hard Lucid 2") or as a letter ("HLucid", "C Gloom").
  function guessCovers(title) {
    const bundle = bundleFor(title);
    if (bundle) return [...bundle.bosses];
    const t = String(title || '').toLowerCase();
    const names = BOSSES.flatMap((b) => [b.name, ...(b.aliases || [])].map((n) => ({ b, n: n.toLowerCase() })))
      .sort((x, y) => y.n.length - x.n.length); // "verus hilla" before "hilla"
    for (const { b, n } of names) {
      const at = t.indexOf(n);
      if (at < 0) continue;
      const modes = Object.keys(b.modes);
      const word = modes.find((m) => new RegExp(`\\b${m}\\b`, 'i').test(t));
      const letter = (t.slice(0, at).match(/(?:^|[^a-z])([enhcx])\s?$/) || [])[1];
      const m = word || modeName(b, SHORT_MODES[letter]) || (modes.length === 1 ? modes[0] : null);
      return m ? [keyOf(b.id, m)] : [];
    }
    return [];
  }

  // covers: a list of keys, false for "none on purpose", or missing (older groups: guessed from the name).
  function coversOf(g) {
    if (g.covers === false) return [];
    if (g.covers) return Object.values(g.covers).filter((k) => parse(k));
    return guessCovers(g.title);
  }

  // Per character, the schedule group they're in for each boss:
  //   { <charId>: { <bossId>: { key, mode, gid, title, party, done, doneAt } } }
  // done = the group was ticked during the boss's current reset period.
  function scheduleLinks(doc, now = Date.now()) {
    const out = {};
    for (const [gid, g] of Object.entries(doc.schedule.groups)) {
      const members = g.members || [];
      for (const key of coversOf(g)) {
        const p = parse(key);
        const done = !!g.done && (g.doneAt || 0) >= periodStart(resetOf(p.id), now);
        for (const ref of members) {
          if (!ref.startsWith('c:')) continue;
          const slot = (out[ref.slice(2)] = out[ref.slice(2)] || {});
          if (!slot[p.id] || (done && !slot[p.id].done)) {
            slot[p.id] = { key: p.key, mode: p.mode, gid, title: g.title, party: members.length, done, doneAt: done ? g.doneAt : 0 };
          }
        }
      }
    }
    return out;
  }

  // The Force a list of bosses ("lucid:hard") asks for, from data/boss-info.js: the highest Arcane and the
  // highest Sacred, with the boss that asks it. { arc: { value, key }, sac: { value, key } }
  function need(keys) {
    const info = MapleData.bossInfo || {};
    const out = {};
    for (const k of keys) {
      const b = info[k];
      if (!b) continue;
      for (const s of ['arc', 'sac']) {
        const v = Array.isArray(b[s]) ? Math.max(...b[s]) : b[s];
        if (v && (!out[s] || v > out[s].value)) out[s] = { value: v, key: k };
      }
    }
    return out;
  }

  // The ARC where 110 / 130 / 150% damage start for a boss (from the sheet, else 1.1x / 1.3x / 1.5x).
  function arcSteps(key) {
    const b = (MapleData.bossInfo || {})[key] || {};
    return b.arcSteps || (b.arc ? [1.1, 1.3, 1.5].map((x) => Math.ceil(b.arc * x)) : []);
  }

  // Extra damage (%) for more Force than a boss needs, from the boss info sheet: Arcane +10 / +30 / +50%
  // at its steps, Sacred +5% final damage per 10 over (up to +25% at 50 over). null: below what it needs
  // (Sacred then loses 10% final damage per 10 short).
  function forceBonus(s, have, key) {
    const b = (MapleData.bossInfo || {})[key] || {};
    const req = Array.isArray(b[s]) ? Math.max(...b[s]) : b[s];
    if (!req || have < req) return null;
    if (s === 'sac') return Math.min(25, Math.floor((have - req) / 10) * 5);
    const [a, c, d] = arcSteps(key);
    return have >= d ? 50 : have >= c ? 30 : have >= a ? 10 : 0;
  }

  // The Sacred / Grand Sacred symbol whose max level gives +20% damage on a boss (data/bosses.js: symbol),
  // with how far a character has it: { name, icon, level, max, maxed }.
  const SYMBOL_BONUS = 20;
  function symbolFor(id, c) {
    const b = byId[id];
    const s = b && b.symbol && Site.SYMBOLS.find((x) => x.key === b.symbol[0]);
    if (!s) return null;
    const name = s.names[b.symbol[1]];
    const level = Number((((c && c.sym) || {})[s.key] || [])[b.symbol[1]]) || 0;
    return { name, icon: `data/icons/symbols/${name.toLowerCase().replace(/[^a-z]+/g, '_')}.png`, level, max: s.max, maxed: level >= s.max };
  }

  return {
    need, arcSteps, forceBonus, symbolFor, SYMBOL_BONUS,
    periodStart, nextReset, untilText, localTime,
    BOSSES, BUNDLES, byId, resetOf, icon, iconImg, modeName, parse, keyOf, label, price, allKeys, maxParty,
    bundleFor, guessCovers, coversOf, scheduleLinks,
  };
})();
