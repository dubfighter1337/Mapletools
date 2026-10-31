(function () {
  'use strict';

  const { $, esc } = Site;
  const CATEGORY_ORDER = ['Warrior', 'Mage', 'Archer', 'Thief', 'Pirate'];
  const REGION_KEY = 'mapletools-region';

  // Rows on each character card. To show another stat: add a row here and a field in the dialog
  // (index.html + readForm/fillForm below).
  const CARD_ROWS = [
    { label: 'Combat power', value: (c) => Site.formatCp(c.cp) },
    { label: 'HEXA converted', value: (c) => Site.formatNumber(c.conv) },
    { label: 'Arcane (ARC)', value: (c) => Site.formatNumber(Site.force(c).ARC), title: (c) => symbolTitle(c, 'ARC') },
    { label: 'Sacred (SAC)', value: (c) => Site.formatNumber(Site.force(c).SAC), title: (c) => symbolTitle(c, 'SAC') },
  ];

  let doc = null;
  let status = 'local';
  let editingId = null;   // character open in the dialog (null = new)
  let lookedUp = null;    // lookup result for the character being added/refreshed
  let region = Site.readJSON(REGION_KEY, 'eu');

  const myId = () => Party.me();
  const classes = () => (window.MapleData && MapleData.classList) || [];

  // ------------------------------------------------------------ lookup (Nexon rankings via relay)

  async function lookup(name, reg) {
    if (!window.LOOKUP_URL) throw new Error('Character lookup isn\'t set up yet, so fill in the details yourself.');
    const res = await fetch(`${window.LOOKUP_URL}?region=${encodeURIComponent(reg)}&name=${encodeURIComponent(name)}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return { ...data, region: reg, cls: Site.classFromJob(data.job) };
  }

  // ------------------------------------------------------------ roster

  function charsOf(pid) {
    return Object.entries(doc.characters)
      .filter(([, c]) => c.owner === pid)
      .map(([id, c]) => ({ id, ...c }))
      .sort((a, b) => (Number(b.cp) || 0) - (Number(a.cp) || 0) || (Number(b.conv) || 0) - (Number(a.conv) || 0)
        || (Number(b.level) || 0) - (Number(a.level) || 0) || a.name.localeCompare(b.name));
  }

  function playerOrder() {
    const ids = new Set(Object.keys(doc.players));
    Object.values(doc.characters).forEach((c) => ids.add(c.owner));
    return [...ids].sort((a, b) => {
      if (a === myId()) return -1;
      if (b === myId()) return 1;
      return playerName(a).localeCompare(playerName(b));
    });
  }

  const playerName = (pid) => (doc.players[pid] && doc.players[pid].name) || 'Unknown player';

  function symbolTitle(c, stat) {
    const bonus = Number((c.bonus || {})[stat.toLowerCase()]) || 0;
    return [...Site.SYMBOLS.filter((s) => s.stat === stat)
      .flatMap((s) => s.names.map((n, i) => `${n}: Lv ${((c.sym || {})[s.key] || [])[i] || 0}`)),
    ...(bonus ? [`Bonus: +${bonus}`] : [])].join('\n');
  }

  function art(c, cls) {
    if (c.img) return `<img class="char-avatar" src="${esc(c.img)}" alt="" loading="lazy">`;
    return cls && cls.icon ? `<img class="class-emblem big" src="${esc(cls.icon)}" alt="">` : '<span class="class-emblem big"></span>';
  }

  function charCard(c, mine) {
    const cls = Site.classInfo(c.cls);
    const place = [Site.worldName(c.world), c.region ? c.region.toUpperCase() : ''].filter(Boolean).join(' · ');
    return `
      <article class="char-card">
        <div class="char-art">${art(c, cls)}</div>
        <strong class="char-name" title="${esc(c.name)}">${esc(c.name)}</strong>
        <div class="char-tags">
          ${c.level ? `<span class="lv">Lv ${esc(c.level)}</span>` : ''}
          <span>${esc(cls ? cls.name : 'Class not set')}</span>
        </div>
        <div class="char-world">${esc(place)}</div>
        <dl class="char-stats">
          ${CARD_ROWS.map((r) => {
            const v = r.value(c);
            return `<div${r.title ? ` title="${esc(r.title(c))}"` : ''}><dt>${esc(r.label)}</dt><dd>${v ? esc(v) : '<span class="muted">—</span>'}</dd></div>`;
          }).join('')}
        </dl>
        <div class="char-actions">
          ${cls ? `<a class="btn ghost" href="hexa.html?class=${encodeURIComponent(cls.id)}" title="Open this class in the HEXA Planner">HEXA</a>` : ''}
          ${mine ? `<button class="btn ghost" data-edit="${esc(c.id)}">Edit</button>` : ''}
          ${mine && window.LOOKUP_URL ? `<button class="btn ghost" data-refresh="${esc(c.id)}" title="Update level, class and picture from the rankings">↻</button>` : ''}
        </div>
      </article>`;
  }

  function renderRoster() {
    const pids = playerOrder();
    const total = Object.keys(doc.characters).length;
    $('roster-sub').textContent = Party.inParty
      ? `${total} character${total === 1 ? '' : 's'} from ${pids.length} player${pids.length === 1 ? '' : 's'} in ${doc.meta.name || 'your party'}.`
      : 'Only on this device. Create or join a party to share them.';
    $('roster').innerHTML = pids.map((pid) => {
      const mine = pid === myId();
      const chars = charsOf(pid);
      if (!mine && !chars.length) return '';
      return `
        <section class="player-block ${mine ? 'is-me' : ''}">
          <header class="player-head">
            <h2>${esc(Party.inParty ? playerName(pid) : 'My characters')}${mine && Party.inParty ? '<span class="you">you</span>' : ''}</h2>
            <span>${chars.length} character${chars.length === 1 ? '' : 's'}</span>
          </header>
          ${chars.length
            ? `<div class="char-grid">${chars.map((c) => charCard(c, mine)).join('')}</div>`
            : '<p class="empty">No characters yet. Type a character name above and press <b>+</b>.</p>'}
        </section>`;
    }).join('');
  }

  function renderRegion() {
    document.querySelectorAll('[data-region]').forEach((b) => b.classList.toggle('is-active', b.dataset.region === region));
  }

  // ------------------------------------------------------------ party card

  const STATUS_TEXT = {
    live: 'Live: changes show up for everyone instantly',
    connecting: 'Connecting…',
    offline: 'Offline: reconnecting, changes will sync when back',
    error: 'Can\'t reach the party right now',
  };

  function renderParty() {
    const el = $('party');
    if (!Party.inParty) {
      const ready = Party.configured();
      el.innerHTML = `
        <h2 class="card-title">Party</h2>
        <p class="muted">You're not in a party. Characters you add stay on this device.</p>
        <p class="muted small">In a party, everyone with the code sees the same roster and boss schedule, live.</p>
        <div class="btn-row">
          <button class="btn primary" data-party="create" ${ready ? '' : 'disabled'}>Create party</button>
          <button class="btn" data-party="join" ${ready ? '' : 'disabled'}>Join party</button>
        </div>
        ${ready ? '' : '<p class="note">Party sync isn\'t switched on for this site yet.</p>'}`;
      return;
    }
    const p = Site.partyInfo();
    const members = playerOrder().map((pid) => `
      <li><span>${esc(playerName(pid))}${pid === myId() ? ' <span class="muted">(you)</span>' : ''}</span>
          <span>${charsOf(pid).length} char${charsOf(pid).length === 1 ? '' : 's'}</span></li>`).join('');
    el.innerHTML = `
      <h2 class="card-title">Party <button class="link-btn" data-party="rename">Rename</button></h2>
      <h3 class="party-name">${esc(doc.meta.name || p.name || 'Party')}</h3>
      <div class="party-code">
        <code>${esc(Site.formatCode(p.code))}</code>
        <span class="btn-row" style="margin:0">
          <button class="btn small" data-party="copy-code">Copy code</button>
          <button class="btn small" data-party="copy-link">Copy invite link</button>
        </span>
      </div>
      <p class="status-line"><span class="dot ${status === 'live' ? 'is-live' : status === 'offline' || status === 'error' ? 'is-off' : ''}"></span>${STATUS_TEXT[status] || ''}</p>
      <p class="small">You are <b>${esc(playerName(myId()))}</b> <button class="link-btn" data-party="rename-me">Change name</button></p>
      <h2 class="card-title" style="margin-top:12px">Members</h2>
      <ul class="member-list">${members}</ul>
      <div class="btn-row"><button class="btn ghost small danger" data-party="leave">Leave party</button></div>`;
  }

  function renderTools() {
    $('tools').innerHTML = Site.TOOLS.filter((t) => t.id !== 'roster').map((t) => `
      <a class="tool-link" href="${t.href}"><strong>${esc(t.label)} →</strong><span>${esc(t.desc)}</span></a>`).join('');
  }

  function render() {
    renderRoster();
    renderParty();
  }

  // ------------------------------------------------------------ adding by name

  async function addByName(e) {
    e.preventDefault();
    const name = $('add-name').value.trim();
    if (!name) return $('add-name').focus();
    const existing = Object.entries(doc.characters).find(([, c]) => c.owner === myId() && c.name.toLowerCase() === name.toLowerCase());
    if (existing) { Site.toast(`${existing[1].name} is already in your roster`); return openCharDialog(existing[0]); }
    setAddStatus(window.LOOKUP_URL ? `Looking up ${name} in the ${region.toUpperCase()} rankings…` : '');
    try {
      const found = await lookup(name, region);
      setAddStatus('');
      openCharDialog(null, { ...found, note: `Found ${found.name} in the rankings. Fill in CP or HEXA converted, and the symbols if you like.` });
    } catch (err) {
      setAddStatus('');
      openCharDialog(null, { name, region, note: err.message });
    }
    $('add-name').value = '';
  }

  function setAddStatus(text) {
    $('add-status').textContent = text;
    $('add-status').hidden = !text;
  }

  async function refreshChar(id) {
    const c = doc.characters[id];
    if (!c) return;
    Site.toast(`Updating ${c.name}…`);
    try {
      const found = await lookup(c.name, c.region || region);
      Party.update({
        [`characters/${id}/level`]: found.level,
        [`characters/${id}/cls`]: found.cls || c.cls || '',
        [`characters/${id}/img`]: found.image || null,
        [`characters/${id}/world`]: found.worldID ?? null,
        [`characters/${id}/lookedUpAt`]: Date.now(),
      }).catch((err) => Site.toast(err.message));
      Site.toast(`${found.name} updated: Lv ${found.level}`);
    } catch (err) { Site.toast(err.message); }
  }

  // ------------------------------------------------------------ character dialog

  function fillClassSelect() {
    const list = classes();
    const cats = [...new Set(list.map((c) => c.category || 'Other'))]
      .sort((a, b) => (CATEGORY_ORDER.indexOf(a) + 1 || 99) - (CATEGORY_ORDER.indexOf(b) + 1 || 99));
    $('char-class').innerHTML = '<option value="">Choose a class…</option>' + cats.map((cat) => `
      <optgroup label="${esc(cat)}">
        ${list.filter((c) => (c.category || 'Other') === cat).sort((a, b) => a.name.localeCompare(b.name))
          .map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}
      </optgroup>`).join('');
  }

  function buildSymbolFields() {
    $('sym-fields').innerHTML = Site.SYMBOLS.map((s) => `
      <fieldset class="sym-group">
        <legend>${esc(s.label)} <span class="muted">(max ${s.max})</span>
          <button type="button" class="link-btn" data-max="${s.key}">All ${s.max}</button></legend>
        <div class="sym-row">
          ${s.names.map((n, i) => `
            <label class="sym"><span title="${esc(n)}">${esc(n)}</span>
              <input type="number" min="0" max="${s.max}" inputmode="numeric" data-sym="${s.key}" data-i="${i}" placeholder="0"></label>`).join('')}
        </div>
      </fieldset>`).join('');
  }

  function readSymbols() {
    const sym = {};
    for (const s of Site.SYMBOLS) {
      sym[s.key] = s.names.map((n, i) => {
        const v = parseInt(document.querySelector(`[data-sym="${s.key}"][data-i="${i}"]`).value, 10);
        return Number.isFinite(v) ? Math.max(0, Math.min(s.max, v)) : 0;
      });
    }
    return sym;
  }

  function readBonus() {
    const n = (id) => Math.max(0, Math.round(parseFloat($(id).value) || 0));
    const bonus = { arc: n('char-bonus-arc'), sac: n('char-bonus-sac') };
    return bonus.arc || bonus.sac ? bonus : null;
  }

  function updateSymbolTotals() {
    const t = Site.symbolTotals(readSymbols(), readBonus());
    $('sym-totals').textContent = `ARC ${t.ARC} · SAC ${t.SAC}`;
  }

  function setArt(img, clsId) {
    const cls = Site.classInfo(clsId);
    $('char-art').innerHTML = art({ img }, cls).replace(' loading="lazy"', '');
  }

  // prefill: lookup result or { name, region, note } for a new character
  function openCharDialog(id, prefill) {
    editingId = id;
    const c = id ? doc.characters[id] : null;
    lookedUp = prefill && prefill.image !== undefined ? prefill : null;
    const src = c || {
      name: prefill ? prefill.name : '', region: prefill ? prefill.region : region,
      cls: prefill ? prefill.cls : '', level: prefill ? prefill.level : '', img: prefill ? prefill.image : '',
    };
    $('char-dialog-title').textContent = c ? `Edit ${c.name}` : 'Add character';
    $('char-name').value = src.name || '';
    $('char-region').value = src.region || region;
    $('char-class').value = src.cls || '';
    $('char-level').value = src.level || '';
    $('char-cp').value = c && c.cp ? c.cp : '';
    $('char-conv').value = c && c.conv ? c.conv : '';
    $('char-bonus-arc').value = c && c.bonus && c.bonus.arc ? c.bonus.arc : '';
    $('char-bonus-sac').value = c && c.bonus && c.bonus.sac ? c.bonus.sac : '';
    for (const s of Site.SYMBOLS) {
      s.names.forEach((n, i) => {
        const v = c && c.sym && c.sym[s.key] ? c.sym[s.key][i] : 0;
        document.querySelector(`[data-sym="${s.key}"][data-i="${i}"]`).value = v || '';
      });
    }
    updateSymbolTotals();
    setArt(src.img, src.cls);
    $('char-note').textContent = prefill && prefill.note ? prefill.note : '';
    $('char-note').hidden = !(prefill && prefill.note);
    $('char-error').hidden = true;
    $('char-delete').hidden = !c;
    $('char-dialog').showModal();
    (c || lookedUp ? $('char-cp') : $('char-name')).focus();
  }

  function saveChar(e) {
    e.preventDefault();
    const name = $('char-name').value.trim();
    const level = parseInt($('char-level').value, 10);
    const cp = parseFloat($('char-cp').value);
    const conv = parseFloat($('char-conv').value);
    if (!name) return showCharError('Fill in the character name.');
    if (!(cp > 0) && !(conv > 0)) return showCharError('Fill in combat power or HEXA converted (at least one).');
    const id = editingId || Site.uid('c');
    const before = editingId ? doc.characters[editingId] : null;
    Party.update({
      [`characters/${id}`]: {
        owner: before ? before.owner : myId(),
        name,
        region: $('char-region').value,
        cls: $('char-class').value || '',
        level: Number.isFinite(level) ? level : null,
        cp: cp > 0 ? Math.round(cp * 10) / 10 : null,
        conv: conv > 0 ? conv : null,
        sym: readSymbols(),
        bonus: readBonus(),
        img: lookedUp ? lookedUp.image || null : before ? before.img || null : null,
        world: lookedUp ? lookedUp.worldID ?? null : before ? before.world ?? null : null,
        lookedUpAt: lookedUp ? Date.now() : before ? before.lookedUpAt || null : null,
        updatedAt: Date.now(),
      },
    }).catch((err) => Site.toast(err.message));
    $('char-dialog').close();
  }

  function showCharError(msg) {
    $('char-error').textContent = msg;
    $('char-error').hidden = false;
  }

  function deleteChar() {
    const c = doc.characters[editingId];
    if (!c || !confirm(`Delete ${c.name}? It's also taken out of any boss groups.`)) return;
    const updates = { [`characters/${editingId}`]: null, [`planner/chars/${editingId}`]: null, [`tasks/chars/${editingId}`]: null };
    for (const [gid, g] of Object.entries(doc.schedule.groups)) {
      const members = g.members || [];
      if (members.includes(`c:${editingId}`)) updates[`schedule/groups/${gid}/members`] = members.filter((m) => m !== `c:${editingId}`);
    }
    Party.update(updates).catch((err) => Site.toast(err.message));
    $('char-dialog').close();
  }

  // ------------------------------------------------------------ party dialog (create / join)

  function openCreate() {
    const local = Party.localCount();
    $('party-form').innerHTML = `
      <h2>Create a party</h2>
      <div class="fields">
        <label class="field span-2"><span>Party name</span><input id="pf-party" type="text" maxlength="30" required placeholder="e.g. Rexx's bossing crew"></label>
        <label class="field span-2"><span>Your name</span><input id="pf-me" type="text" maxlength="20" required placeholder="How the party sees you"></label>
      </div>
      ${local ? `<label class="check"><input id="pf-bring" type="checkbox" checked> Bring my ${local} character${local === 1 ? '' : 's'} (and boss groups) from this device</label>` : ''}
      <p class="form-error" id="pf-error" hidden></p>
      <div class="dialog-actions"><span class="spacer"></span>
        <button type="button" class="btn ghost" data-close>Cancel</button>
        <button type="submit" class="btn primary">Create</button></div>`;
    $('party-form').onsubmit = async (e) => {
      e.preventDefault();
      try {
        busy(true);
        await Party.create($('pf-party').value.trim(), $('pf-me').value.trim(), !!($('pf-bring') && $('pf-bring').checked));
        location.reload();
      } catch (err) { showError(err); }
    };
    $('party-dialog').showModal();
    $('pf-party').focus();
  }

  function openJoin(prefill) {
    $('party-form').innerHTML = `
      <h2>Join a party</h2>
      <div class="fields">
        <label class="field span-2"><span>Party code</span><input id="pf-code" type="text" maxlength="12" required placeholder="ABCDE-FGHJK" autocomplete="off" style="text-transform:uppercase;letter-spacing:1px"></label>
      </div>
      <div id="pf-step2"></div>
      <p class="form-error" id="pf-error" hidden></p>
      <div class="dialog-actions"><span class="spacer"></span>
        <button type="button" class="btn ghost" data-close>Cancel</button>
        <button type="submit" class="btn primary" id="pf-submit">Find party</button></div>`;
    let found = null;
    $('party-form').onsubmit = async (e) => {
      e.preventDefault();
      try {
        busy(true);
        if (!found) {
          found = await Party.peek($('pf-code').value);
          busy(false);
          if (!found) { found = null; return showError(new Error('No party with that code. Check for typos.')); }
          showWho(found);
          return;
        }
        const pick = (document.querySelector('input[name="pf-who"]:checked') || {}).value;
        if (!pick) { busy(false); return showError(new Error('Pick who you are.')); }
        const newName = pick === '__new' ? $('pf-new').value.trim() : '';
        if (pick === '__new' && !newName) { busy(false); return showError(new Error('Type your name.')); }
        await Party.join($('pf-code').value, {
          playerId: pick === '__new' ? null : pick,
          newName,
          bringLocal: !!($('pf-bring') && $('pf-bring').checked),
        });
        location.href = 'index.html';
      } catch (err) { showError(err); }
    };
    $('pf-code').addEventListener('input', () => { found = null; $('pf-step2').innerHTML = ''; $('pf-submit').textContent = 'Find party'; });
    $('party-dialog').showModal();
    if (prefill) { $('pf-code').value = Site.formatCode(Party.cleanCode(prefill)); $('party-form').requestSubmit(); }
    else $('pf-code').focus();
  }

  function showWho(party) {
    const local = Party.localCount();
    const players = Object.entries(party.players).sort((a, b) => a[1].name.localeCompare(b[1].name));
    $('pf-step2').innerHTML = `
      <p><b>${esc(party.meta.name)}</b>. Who are you?</p>
      <div class="choice-list">
        ${players.map(([pid, p]) => `<label class="choice"><input type="radio" name="pf-who" value="${esc(pid)}"> I'm ${esc(p.name)} (on another device)</label>`).join('')}
        <label class="choice"><input type="radio" name="pf-who" value="__new" ${players.length ? '' : 'checked'}> I'm new: <input id="pf-new" type="text" maxlength="20" placeholder="Your name"></label>
      </div>
      ${local ? `<label class="check"><input id="pf-bring" type="checkbox" checked> If I'm new, bring my ${local} character${local === 1 ? '' : 's'} from this device</label>` : ''}`;
    $('pf-new').addEventListener('focus', () => { document.querySelector('input[name="pf-who"][value="__new"]').checked = true; });
    $('pf-submit').textContent = 'Join';
  }

  function busy(on) {
    const btn = $('party-form').querySelector('button[type=submit]');
    if (btn) btn.disabled = on;
    if (on) $('pf-error').hidden = true;
  }
  function showError(err) {
    busy(false);
    $('pf-error').textContent = err.message || String(err);
    $('pf-error').hidden = false;
  }

  async function copy(text, label) {
    try { await navigator.clipboard.writeText(text); Site.toast(`${label} copied`); }
    catch (e) { prompt(`Copy the ${label.toLowerCase()}:`, text); }
  }

  function partyAction(action) {
    const p = Site.partyInfo();
    if (action === 'create') return openCreate();
    if (action === 'join') return openJoin();
    if (action === 'copy-code') return copy(Site.formatCode(p.code), 'Code');
    if (action === 'copy-link') return copy(`${location.origin}${location.pathname}?join=${p.code}`, 'Invite link');
    if (action === 'rename') {
      const name = prompt('Party name:', doc.meta.name || '');
      if (name && name.trim()) Party.update({ 'meta/name': name.trim().slice(0, 30) });
    }
    if (action === 'rename-me') {
      const name = prompt('Your name in this party:', playerName(myId()));
      if (name && name.trim()) Party.update({ [`players/${myId()}/name`]: name.trim().slice(0, 20) });
    }
    if (action === 'leave') {
      if (!confirm('Leave this party on this device? Your characters stay in the party; you can rejoin with the code.')) return;
      Party.leave();
      location.href = 'index.html';
    }
  }

  // ------------------------------------------------------------ boot

  function bind() {
    $('add-bar').addEventListener('submit', addByName);
    document.querySelectorAll('[data-region]').forEach((b) => b.addEventListener('click', () => {
      region = b.dataset.region;
      Site.writeJSON(REGION_KEY, region);
      renderRegion();
    }));
    $('roster').addEventListener('click', (e) => {
      const edit = e.target.closest('[data-edit]');
      if (edit) return openCharDialog(edit.dataset.edit);
      const refresh = e.target.closest('[data-refresh]');
      if (refresh) refreshChar(refresh.dataset.refresh);
    });
    $('party').addEventListener('click', (e) => {
      const b = e.target.closest('[data-party]');
      if (b) partyAction(b.dataset.party);
    });
    $('char-form').addEventListener('submit', saveChar);
    $('char-delete').addEventListener('click', deleteChar);
    $('char-class').addEventListener('change', () => { if (!$('char-art').querySelector('.char-avatar')) setArt('', $('char-class').value); });
    $('sym-fields').addEventListener('input', updateSymbolTotals);
    for (const id of ['char-bonus-arc', 'char-bonus-sac']) $(id).addEventListener('input', updateSymbolTotals);
    $('sym-fields').addEventListener('click', (e) => {
      const b = e.target.closest('[data-max]');
      if (!b) return;
      const s = Site.SYMBOLS.find((x) => x.key === b.dataset.max);
      document.querySelectorAll(`[data-sym="${s.key}"]`).forEach((inp) => { inp.value = s.max; });
      updateSymbolTotals();
    });
    document.querySelectorAll('dialog').forEach((d) => d.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]') || e.target === d) d.close();
    }));
  }

  fillClassSelect();
  buildSymbolFields();
  renderTools();
  renderRegion();
  bind();
  Party.subscribe((d, s) => { doc = d; status = s; render(); });
  Party.start();

  const joinCode = new URLSearchParams(location.search).get('join');
  if (joinCode && Party.inParty && Party.cleanCode(joinCode) !== Site.partyInfo().code) {
    Site.toast('You\'re already in a party. Leave it first to join another one.');
  } else if (joinCode && !Party.inParty && Party.configured()) {
    openJoin(joinCode);
  }
})();
