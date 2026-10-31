// Party data: the shared character roster and boss schedule.
// Not in a party: everything is kept in this browser (localStorage).
// In a party: it lives in Firebase under parties/<code>, and every member sees changes live.
//
// Data shape (same in both modes):
//   meta:       { name, createdAt }
//   players:    { <playerId>: { name, joinedAt } }
//   characters: { <charId>: { owner: playerId, name, cls, level, cp, updatedAt } }   cp = combat power in millions
//   schedule:   { groups: { <groupId>: { title, reset, done, doneAt, members: ["c:<charId>" | "n:<guest name>"], createdAt } },
//                 resets: { daily, weekly, monthly } }   start of the period each reset was last applied for
//   planner:    { chars: { <charId>: { sel: { <bossId>: { mode, party } }, done: { <bossId>: tickedAt }, hidden } },
//                 presets: { <presetId>: { name, owner, sel } } }
//   tasks:      { chars: { <charId>: { sel: { <taskId>: true }, done: { <taskId>: tickedAt | { n, at } }, hidden } },
//                 custom: { <taskId>: { name, reset, owner } }, presets: { <presetId>: { name, owner, sel } } }
window.Party = (function () {
  'use strict';

  const SDK = 'https://www.gstatic.com/firebasejs/11.10.0/';
  const LOCAL_KEY = 'mapletools-local';
  const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const LOCAL_PLAYER = 'local';

  let doc = null;
  let loaded = false;       // true once real data is in (not just the empty placeholder)
  let status = 'local';     // local | connecting | live | offline | error
  let partyRef = null;
  const listeners = [];

  const info = () => Site.partyInfo();
  const configured = () => !!(window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.databaseURL);

  function normalize(v, fallbackName) {
    const d = v || {};
    const s = d.schedule || {};
    const p = d.planner || {};
    const t = d.tasks || {};
    return {
      meta: d.meta || { name: fallbackName || '' },
      players: d.players || {},
      characters: d.characters || {},
      schedule: { groups: s.groups || {}, resets: s.resets || {} },
      planner: { chars: p.chars || {}, presets: p.presets || {} },
      tasks: { chars: t.chars || {}, custom: t.custom || {}, presets: t.presets || {} },
    };
  }

  // Applies Firebase-style multi-path updates ({ "a/b": value, "c": null }) to a plain object.
  function applyUpdates(target, updates) {
    for (const [path, value] of Object.entries(updates)) {
      const keys = path.split('/');
      let o = target;
      for (const k of keys.slice(0, -1)) {
        if (typeof o[k] !== 'object' || o[k] === null) o[k] = {};
        o = o[k];
      }
      const last = keys[keys.length - 1];
      if (value === null) delete o[last]; else o[last] = JSON.parse(JSON.stringify(value));
    }
  }

  function localDoc() {
    const d = normalize(Site.readJSON(LOCAL_KEY, null), 'My characters');
    if (!d.players[LOCAL_PLAYER]) d.players[LOCAL_PLAYER] = { name: 'Me' };
    return d;
  }

  function emit() {
    Site.setPartyStatus(status);
    listeners.forEach((cb) => cb(doc, status));
  }

  async function firebaseDb() {
    if (!configured()) throw new Error('Party sync is not set up yet.');
    if (!window.firebase || !firebase.database) {
      await Site.loadScript(`${SDK}firebase-app-compat.js`);
      await Site.loadScript(`${SDK}firebase-database-compat.js`);
    }
    if (!firebase.apps.length) firebase.initializeApp(window.FIREBASE_CONFIG);
    return firebase.database();
  }

  async function start() {
    const p = info();
    if (!p) {
      status = 'local';
      doc = localDoc();
      loaded = true;
      emit();
      window.addEventListener('storage', (e) => { if (e.key === LOCAL_KEY) { doc = localDoc(); emit(); } });
      return;
    }
    doc = normalize(null, p.name);
    if (!configured()) { status = 'error'; emit(); return; }
    status = 'connecting';
    emit();
    try {
      const db = await firebaseDb();
      db.ref('.info/connected').on('value', (s) => { status = s.val() ? 'live' : 'offline'; emit(); });
      partyRef = db.ref(`parties/${p.code}`);
      partyRef.on('value', (s) => {
        doc = normalize(s.val(), p.name);
        loaded = true;
        if (doc.meta.name && doc.meta.name !== p.name) Site.setPartyInfo({ ...p, name: doc.meta.name });
        emit();
      }, () => { status = 'error'; emit(); });
    } catch (e) {
      console.error(e);
      status = 'error';
      emit();
    }
  }

  // Writes several paths at once, relative to the party root (null deletes).
  function update(updates) {
    if (!info()) {
      const d = localDoc();
      applyUpdates(d, updates);
      Site.writeJSON(LOCAL_KEY, d);
      doc = normalize(d);
      emit();
      return Promise.resolve();
    }
    if (!partyRef) return Promise.reject(new Error('Not connected to the party yet.'));
    return partyRef.update(updates);
  }

  function subscribe(cb) {
    listeners.push(cb);
    if (doc) cb(doc, status);
  }

  const me = () => (info() ? info().playerId : LOCAL_PLAYER);

  function randomCode() {
    const bytes = crypto.getRandomValues(new Uint8Array(10));
    return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
  }
  const cleanCode = (code) => String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  // This device's characters (and boss groups) re-owned by a party player, as party updates.
  function localDataFor(playerId, withSchedule) {
    const local = localDoc();
    const updates = {};
    for (const [cid, c] of Object.entries(local.characters)) {
      updates[`characters/${cid}`] = { ...c, owner: playerId };
      if (local.planner.chars[cid]) updates[`planner/chars/${cid}`] = local.planner.chars[cid];
      if (local.tasks.chars[cid]) updates[`tasks/chars/${cid}`] = local.tasks.chars[cid];
    }
    // Custom tasks come along (picked tasks would point at them); presets only with the schedule.
    for (const [id, task] of Object.entries(local.tasks.custom)) updates[`tasks/custom/${id}`] = { ...task, owner: playerId };
    if (withSchedule) {
      for (const [gid, g] of Object.entries(local.schedule.groups)) updates[`schedule/groups/${gid}`] = g;
      for (const [id, preset] of Object.entries(local.planner.presets)) updates[`planner/presets/${id}`] = { ...preset, owner: playerId };
      for (const [id, preset] of Object.entries(local.tasks.presets)) updates[`tasks/presets/${id}`] = { ...preset, owner: playerId };
    }
    return updates;
  }

  async function create(partyName, playerName, bringLocal) {
    const db = await firebaseDb();
    let code = randomCode();
    for (let i = 0; i < 5 && (await db.ref(`parties/${code}/meta`).get()).exists(); i++) code = randomCode();
    const pid = Site.uid('p');
    const updates = {
      meta: { name: partyName, createdAt: Date.now() },
      [`players/${pid}`]: { name: playerName, joinedAt: Date.now() },
      ...(bringLocal ? localDataFor(pid, true) : {}),
    };
    await db.ref(`parties/${code}`).update(updates);
    Site.setPartyInfo({ code, name: partyName, playerId: pid });
    return code;
  }

  // Reads a party once (for the join screen). Returns null if the code doesn't exist.
  async function peek(code) {
    const db = await firebaseDb();
    const s = await db.ref(`parties/${cleanCode(code)}`).get();
    return s.exists() && s.val().meta ? normalize(s.val()) : null;
  }

  // Join as an existing player (playerId: another device of theirs) or as a new one (newName).
  // bringLocal adds this device's own characters to that player.
  async function join(code, { playerId, newName, bringLocal }) {
    code = cleanCode(code);
    const db = await firebaseDb();
    const meta = (await db.ref(`parties/${code}/meta`).get()).val();
    if (!meta) throw new Error('No party with that code.');
    let pid = playerId;
    if (!pid) {
      pid = Site.uid('p');
      await db.ref(`parties/${code}`).update({
        [`players/${pid}`]: { name: newName, joinedAt: Date.now() },
        ...(bringLocal ? localDataFor(pid, false) : {}),
      });
    } else if (bringLocal && Object.keys(localDoc().characters).length) {
      await db.ref(`parties/${code}`).update(localDataFor(pid, false));
    }
    Site.setPartyInfo({ code, name: meta.name, playerId: pid });
  }

  function leave() { Site.setPartyInfo(null); }

  return {
    start, subscribe, update, me, create, peek, join, leave, configured, cleanCode,
    get doc() { return doc; },
    get loaded() { return loaded; },
    get status() { return status; },
    get inParty() { return !!info(); },
    localCount: () => Object.keys(localDoc().characters).length,
  };
})();
