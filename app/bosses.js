(function () {
  'use strict';

  const { $, esc } = Site;
  const B = Bossing;
  const { periodStart, nextReset, untilText, localTime } = Bossing;
  const MAX_MEMBERS = 6;
  const SECTIONS = [
    { reset: 'weekly', title: 'Weekly bosses' },
    { reset: 'monthly', title: 'Monthly bosses' },
    { reset: 'daily', title: 'Daily bosses' },
  ];
  let doc = null;
  let status = 'local';
  let editingId = null;     // group open in the dialog (null = new)
  let draft = [];           // members being edited: "c:<charId>" | "n:<guest name>"
  let resetTouched = false; // user picked the reset type themselves in the dialog
  let coverList = [];       // bosses shown in the dialog's "Ticks in the Boss Planner" list ("lucid:hard")
  let coverOn = new Set();  // ...and the ones ticked there
  let coversTouched = false;
  let arranging = false;    // Arrange mode: cards are dragged into rows (the layout is shared by the party)

  // ------------------------------------------------------------ resets (UTC, like the game)

  // Unticks groups whose reset period has started since they were ticked. Safe if several
  // party members' pages do it at once: they all write the same values.
  function applyResets() {
    if (!Party.loaded) return;
    const updates = {};
    for (const kind of ['daily', 'weekly', 'monthly']) {
      const start = periodStart(kind);
      if ((doc.schedule.resets[kind] || 0) >= start) continue;
      updates[`schedule/resets/${kind}`] = start;
      for (const [gid, g] of Object.entries(doc.schedule.groups)) {
        if ((g.reset || 'weekly') === kind && g.done && (g.doneAt || 0) < start) {
          updates[`schedule/groups/${gid}/done`] = false;
          updates[`schedule/groups/${gid}/doneAt`] = null;
        }
      }
    }
    if (Object.keys(updates).length) Party.update(updates).catch((err) => console.warn(err));
  }

  // ------------------------------------------------------------ helpers

  const groupsOf = (reset) => Object.entries(doc.schedule.groups)
    .filter(([, g]) => (g.reset || 'weekly') === reset)
    .map(([id, g]) => ({ id, ...g }))
    .sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' }));

  function member(ref) {
    if (ref.startsWith('n:')) return { guest: true, name: ref.slice(2) };
    const c = doc.characters[ref.slice(2)];
    if (!c) return { missing: true, name: 'Removed character' };
    const player = doc.players[c.owner];
    return { ...c, cls: Site.classInfo(c.cls), owner: player ? player.name : '' };
  }

  // need: the Force the group's bosses ask for (Bossing.need); the member's ARC or SAC shows next to their power.
  function memberRow(ref, withOwner, need = {}) {
    const m = member(ref);
    const emblem = m.cls && m.cls.icon ? `<img class="class-emblem" src="${esc(m.cls.icon)}" alt="${esc(m.cls.name)}" title="${esc(m.cls.name)}">` : '<span class="class-emblem"></span>';
    return `${emblem}
      <span class="m-name" title="${esc(m.name)}">${esc(m.name)}${withOwner && m.owner && Party.inParty ? ` <span class="m-owner">${esc(m.owner)}</span>` : ''}${m.guest ? ' <span class="m-owner">guest</span>' : ''}</span>
      <span class="m-stats">${forceBadges(m, need)}<span class="m-cp">${esc(Site.powerLabel(m))}</span></span>`;
  }

  // ARC for Arcane bosses (Lucid to Black Mage, Ctene), SAC for Sacred ones: green with enough, red without.
  function forceBadges(m, need) {
    if (m.guest || m.missing) return '';
    const have = Site.force(m);
    return ['arc', 'sac'].filter((s) => need[s]).map((s) => {
      const stat = s.toUpperCase();
      const v = have[stat];
      const req = need[s].value;
      const key = need[s].key;
      // A maxed region symbol (Cernium for Seren, ...) adds +20% damage on top: its icon marks the badge.
      const sym = s === 'sac' ? B.symbolFor(B.parse(key).id, m) : null;
      const extra = B.forceBonus(s, v, key);
      const total = extra === null ? null : extra + (sym && sym.maxed ? B.SYMBOL_BONUS : 0);
      return `<span class="m-force ${v >= req ? 'is-ok' : 'is-low'}" title="${esc(forceTip(s, v, req, key, sym))}">${
        sym && sym.maxed ? `<img class="m-sym" src="${esc(sym.icon)}" alt="">` : ''}${stat} ${v}${total > 0 ? ` <b>+${total}%</b>` : ''}</span>`;
    }).join('');
  }

  function forceTip(s, have, req, key, sym) {
    const head = `${s.toUpperCase()} ${have}: ${B.label(key)} needs ${req}`;
    const extra = B.forceBonus(s, have, key);
    const symLine = !sym ? '' : sym.maxed
      ? `\nMaxed ${sym.name} symbol: +${B.SYMBOL_BONUS}% damage on this boss`
      : `\n${sym.name} symbol Lv ${sym.level}/${sym.max}: +${B.SYMBOL_BONUS}% damage on this boss once it's maxed`;
    if (extra === null) return (s === 'arc' ? `${head}. Below it you deal much less damage` : `${head}. ${req - have} short: -10% final damage per 10 short`) + symLine;
    const next = B.arcSteps(key)[extra >= 30 ? 2 : extra >= 10 ? 1 : 0];
    return `${head}. ${extra ? `+${extra}% ${s === 'arc' ? 'damage' : 'final damage'}` : 'Enough, no extra damage yet'}${
      s === 'arc' && extra < 50 ? ` (next step at ${next})` : ''}${
      s === 'sac' && extra < 25 ? ` (+5% per 10 over, up to +25% at ${req + 50})` : ''}${symLine}`;
  }

  // Hover text for a member: level and symbol power (what decides if they can enter a boss).
  function memberTitle(ref) {
    const m = member(ref);
    if (m.guest || m.missing) return '';
    const t = Site.force(m);
    return [m.level ? `Lv ${m.level}` : '', m.cls ? m.cls.name : '', t.ARC ? `ARC ${t.ARC}` : '', t.SAC ? `SAC ${t.SAC}` : '']
      .filter(Boolean).join(' · ');
  }

  // ------------------------------------------------------------ rendering

  function renderStats() {
    const chips = [];
    for (const s of SECTIONS) {
      const gs = groupsOf(s.reset);
      if (!gs.length && s.reset === 'daily') continue;
      const done = gs.filter((g) => g.done).length;
      chips.push(`
        <div class="stat ${gs.length && done === gs.length ? 'is-complete' : ''}">
          <b>${done} / ${gs.length}</b><span>${s.title.replace(' bosses', '')} done</span>
        </div>`);
    }
    for (const kind of ['weekly', 'monthly']) {
      const at = nextReset(kind);
      chips.push(`<div class="stat"><b>${untilText(at)}</b><span>until ${kind} reset · ${esc(localTime(at))}</span></div>`);
    }
    $('stats').innerHTML = chips.join('');
  }

  // Groups that clear several bosses (Ctene) list them under the name; one boss is already in the name.
  function coversLine(g) {
    const covers = B.coversOf(g);
    if (covers.length < 2) return '';
    const names = covers.map(B.label).join(', ');
    return `<p class="group-covers" title="Ticking this group ticks these bosses in the Boss Planner:\n${esc(covers.map(B.label).join('\n'))}">${covers.length} bosses: ${esc(names)}</p>`;
  }

  function groupCard(g) {
    const members = g.members || [];
    const need = B.need(B.coversOf(g));
    const cp = members.reduce((sum, ref) => sum + (Number(member(ref).cp) || 0), 0);
    return `
      <article class="group-card arr-item ${g.done ? 'is-done' : ''}" data-key="${esc(g.id)}">${arranging ? Arrange.grip : ''}
        <header class="group-head">
          <button class="done-toggle" data-done="${esc(g.id)}" aria-pressed="${g.done ? 'true' : 'false'}"
            title="${g.done ? 'Done. Click to untick' : 'Mark as done'}">✓</button>
          ${B.coversOf(g).length ? B.iconImg(B.parse(B.coversOf(g)[0]).id) : ''}
          <h3 title="${esc(g.title)}">${esc(g.title)}</h3>
          <button class="btn ghost edit-btn" data-edit="${esc(g.id)}">Edit</button>
        </header>
        ${coversLine(g)}
        <ul class="members">
          ${members.length ? members.map((ref) => `<li class="${ref.startsWith('n:') ? 'is-guest' : ''}" title="${esc(memberTitle(ref))}">${memberRow(ref, true, need)}</li>`).join('')
            : '<li class="empty">No members yet</li>'}
        </ul>
        <footer class="group-foot"><span>${members.length} / ${MAX_MEMBERS}</span><span>${cp ? `${esc(Site.formatCp(cp))} total` : ''}</span></footer>
      </article>`;
  }

  function renderSections() {
    const total = Object.keys(doc.schedule.groups).length;
    if (!total) {
      $('sections').innerHTML = '<div class="empty-state">No boss groups yet. Use <b>+ Add group</b> to make your first one.</div>';
      return;
    }
    $('sections').innerHTML = SECTIONS.map((s) => {
      const gs = groupsOf(s.reset);
      if (!gs.length) return '';
      const done = gs.filter((g) => g.done).length;
      const byId = Object.fromEntries(gs.map((g) => [g.id, g]));
      const cell = (t, ri, ci) => (t === '_'
        ? `<div class="group-gap arr-item" data-key="_">${arranging
          ? `${Arrange.grip}<button class="arr-x" data-gap-x="${s.reset}|${ri}|${ci}" title="Remove this empty spot" aria-label="Remove this empty spot">×</button>` : ''}</div>`
        : groupCard(byId[t]));
      const rows = sectionRows(s.reset, gs);
      return `
        <section class="boss-section ${arranging ? 'is-arranging' : ''}" data-reset="${s.reset}">
          <header class="section-head">
            <h2>${s.title}</h2><span class="count">${done} / ${gs.length} done</span>
            <span class="spacer"></span>
            ${arranging
              ? `<span class="arrange-note">Drag cards between rows</span>${(doc.schedule.layout || {})[s.reset] ? `<button class="btn ghost small" data-reset-layout="${s.reset}">Reset layout</button>` : ''}`
              : done ? `<button class="btn ghost small" data-untick="${s.reset}">Untick all</button>` : ''}
          </header>
          ${rows.map((r, ri) => `<div class="group-grid group-row">${r.map((t, ci) => cell(t, ri, ci)).join('')}</div>${arranging
            ? `<div class="row-tools"><button class="link-btn" data-add-gap="${s.reset}|${ri}">+ empty spot</button></div>` : ''}`).join('')}
          ${arranging ? '<div class="group-grid group-row arr-new"></div>' : ''}
        </section>`;
    }).join('');
  }

  // ------------------------------------------------------------ layout (Arrange)

  // A section's rows of group ids and "_" (empty spots), saved as one list with "|" between rows.
  // Groups the layout doesn't have yet (new ones) go at the end of the last row.
  function sectionRows(reset, gs) {
    const ids = new Set(gs.map((g) => g.id));
    const saved = (doc.schedule.layout || {})[reset];
    const rows = [[]];
    const placed = new Set();
    for (const t of Object.values(saved || {})) {
      if (t === '|') rows.push([]);
      else if (t === '_') rows[rows.length - 1].push('_');
      else if (ids.has(t) && !placed.has(t)) { rows[rows.length - 1].push(t); placed.add(t); }
    }
    rows[rows.length - 1].push(...gs.filter((g) => !placed.has(g.id)).map((g) => g.id));
    return rows.filter((r) => r.some((t) => t !== '_'));
  }

  function saveLayout(reset, rows) {
    const tokens = rows.filter((r) => r.length).flatMap((r, i) => (i ? ['|', ...r] : r));
    Party.update({ [`schedule/layout/${reset}`]: tokens.length ? tokens : null }).catch((err) => Site.toast(err.message));
  }

  function render() {
    $('boss-sub').textContent = Party.inParty
      ? `${doc.meta.name || 'Your party'} · ${status === 'live' ? 'live, everyone sees the same schedule' : status === 'connecting' ? 'connecting…' : 'offline, changes sync when back'}`
      : 'Only on this device. Create or join a party on the Characters page to share it.';
    $('arrange').textContent = arranging ? 'Done' : 'Arrange';
    $('arrange').classList.toggle('primary', arranging);
    renderStats();
    renderSections();
  }

  // ------------------------------------------------------------ group dialog

  function fillPresets() {
    Site.combo($('g-title'), [
      ...B.BUNDLES.map((x) => ({ value: x.name, hint: `${x.bosses.length} bosses` })),
      ...B.allKeys().map((k) => ({ value: B.label(k), hint: B.resetOf(B.parse(k).id) === 'monthly' ? 'Monthly' : '' })),
    ]);
  }

  function guessReset(title) {
    return B.guessCovers(title).some((k) => B.resetOf(B.parse(k).id) === 'monthly') ? 'monthly' : 'weekly';
  }

  // ------------------------------------------------------------ "Ticks in the Boss Planner"

  function coversFromTitle() {
    coverList = B.guessCovers($('g-title').value);
    coverOn = new Set(coverList);
    renderCovers();
  }

  // One boss per group, taken from its name. Only a bundle (Ctene) lists several, as checkboxes.
  function renderCovers() {
    const bundle = B.bundleFor($('g-title').value);
    $('g-covers').innerHTML = bundle
      ? coverList.map((k) => `<label class="cover-chip ${coverOn.has(k) ? 'is-on' : ''}"><input type="checkbox" data-cover="${esc(k)}" ${coverOn.has(k) ? 'checked' : ''}>${
        B.iconImg(B.parse(k).id)}${esc(B.label(k))}</label>`).join('')
      : coverList.slice(0, 1).map((k) => `<span class="cover-chip is-on">${B.iconImg(B.parse(k).id)}${esc(B.label(k))}</span>`).join('');
    $('g-covers-note').textContent = bundle ? '· untick the ones this group doesn\'t do'
      : coverList.length ? '' : '· pick a boss from the list as the name';
    if ($('group-dialog').open) renderDraft(); // the members' ARC / SAC follow the bosses
  }

  // The bosses the group in the dialog clears.
  const draftCovers = () => (B.bundleFor($('g-title').value) ? coverList.filter((k) => coverOn.has(k)) : coverList.slice(0, 1));

  function renderDraft() {
    $('g-count').textContent = `(${draft.length}/${MAX_MEMBERS})`;
    const need = B.need(draftCovers());
    $('g-members').innerHTML = draft.map((ref, i) => `
      <li class="${ref.startsWith('n:') ? 'is-guest' : ''}">${memberRow(ref, true, need)}
        <button type="button" class="remove" data-remove="${i}" aria-label="Remove">×</button></li>`).join('')
      || '<li class="muted" style="grid-template-columns:1fr">Nobody yet. Add characters below.</li>';

    // Roster characters not in the group yet, grouped by player.
    const byPlayer = {};
    for (const [cid, c] of Object.entries(doc.characters)) {
      if (draft.includes(`c:${cid}`)) continue;
      (byPlayer[c.owner] = byPlayer[c.owner] || []).push({ cid, ...c });
    }
    const full = draft.length >= MAX_MEMBERS;
    $('g-add-char').innerHTML = `<option value="">${full ? 'Group is full' : '+ Add a character…'}</option>` +
      Object.entries(byPlayer).map(([pid, chars]) => `
        <optgroup label="${esc(Party.inParty ? (doc.players[pid] || {}).name || 'Unknown player' : 'My characters')}">
          ${chars.sort((a, b) => (b.cp || 0) - (a.cp || 0)).map((c) => {
            const cls = Site.classInfo(c.cls);
            const power = Site.powerLabel(c);
            return `<option value="c:${esc(c.cid)}">${esc(c.name)}${cls ? ` · ${esc(cls.name)}` : ''}${power ? ` · ${esc(power)}` : ''}</option>`;
          }).join('')}
        </optgroup>`).join('');
    $('g-add-char').disabled = full;
    $('g-guest').disabled = full;
    $('g-add-guest').disabled = full;
  }

  function openGroupDialog(id) {
    editingId = id;
    const g = id ? doc.schedule.groups[id] : null;
    $('group-dialog-title').textContent = g ? `Edit ${g.title}` : 'Add boss group';
    $('g-title').value = g ? g.title : '';
    $('g-reset').value = g ? g.reset || 'weekly' : 'weekly';
    resetTouched = !!g;
    draft = g ? [...(g.members || [])] : [];
    // A Ctene group lists every Ctene boss, so one left out can be ticked again; others have one boss.
    const bundle = g && B.bundleFor(g.title);
    coversTouched = !!bundle;
    coverList = !g ? [] : bundle ? [...new Set([...B.guessCovers(g.title), ...B.coversOf(g)])] : B.guessCovers(g.title);
    coverOn = new Set(!g ? [] : bundle ? B.coversOf(g) : coverList);
    renderCovers();
    $('g-guest').value = '';
    $('g-delete').hidden = !g;
    renderDraft();
    $('group-dialog').showModal();
    if (!g) $('g-title').focus();
  }

  function addGuest() {
    const name = $('g-guest').value.trim();
    if (!name || draft.length >= MAX_MEMBERS) return;
    draft.push(`n:${name.slice(0, 24)}`);
    $('g-guest').value = '';
    renderDraft();
  }

  function saveGroup(e) {
    e.preventDefault();
    const title = $('g-title').value.trim();
    if (!title) return;
    const id = editingId || Site.uid('g');
    const before = editingId ? doc.schedule.groups[editingId] : null;
    const covers = draftCovers();
    Party.update({
      [`schedule/groups/${id}`]: {
        title: title.slice(0, 40),
        reset: $('g-reset').value,
        covers: covers.length ? covers : false,
        done: before ? !!before.done : false,
        doneAt: before && before.done ? before.doneAt || Date.now() : null,
        members: draft,
        createdAt: before ? before.createdAt || Date.now() : Date.now(),
      },
    }).catch((err) => Site.toast(err.message));
    $('group-dialog').close();
  }

  function deleteGroup() {
    const g = doc.schedule.groups[editingId];
    if (!g || !confirm(`Delete the group "${g.title}"?`)) return;
    Party.update({ [`schedule/groups/${editingId}`]: null }).catch((err) => Site.toast(err.message));
    $('group-dialog').close();
  }

  // ------------------------------------------------------------ boot

  function bind() {
    $('add-group').addEventListener('click', () => openGroupDialog(null));
    $('arrange').addEventListener('click', () => { arranging = !arranging; render(); });
    Arrange.attach($('sections'), {
      block: '.boss-section', rows: '.group-row', items: '.arr-item',
      onDrop: (rows, section) => saveLayout(section.dataset.reset, rows),
    });
    $('sections').addEventListener('click', (e) => {
      const addGap = e.target.closest('[data-add-gap]');
      const gapX = e.target.closest('[data-gap-x]');
      const resetLayout = e.target.closest('[data-reset-layout]');
      if (addGap || gapX) {
        const [reset, ri, ci] = (addGap || gapX).dataset[addGap ? 'addGap' : 'gapX'].split('|');
        const rows = sectionRows(reset, groupsOf(reset));
        if (addGap) rows[Number(ri)].push('_'); else rows[Number(ri)].splice(Number(ci), 1);
        return saveLayout(reset, rows);
      }
      if (resetLayout) {
        if (confirm('Put this section back in name order?')) Party.update({ [`schedule/layout/${resetLayout.dataset.resetLayout}`]: null }).catch((err) => Site.toast(err.message));
        return;
      }
      const done = e.target.closest('[data-done]');
      if (done) {
        const g = doc.schedule.groups[done.dataset.done];
        const now = !g.done;
        Party.update({
          [`schedule/groups/${done.dataset.done}/done`]: now,
          [`schedule/groups/${done.dataset.done}/doneAt`]: now ? Date.now() : null,
        }).catch((err) => Site.toast(err.message));
        return;
      }
      const edit = e.target.closest('[data-edit]');
      if (edit) return openGroupDialog(edit.dataset.edit);
      const untick = e.target.closest('[data-untick]');
      if (untick && confirm('Untick every group in this section?')) {
        const updates = {};
        groupsOf(untick.dataset.untick).filter((g) => g.done).forEach((g) => {
          updates[`schedule/groups/${g.id}/done`] = false;
          updates[`schedule/groups/${g.id}/doneAt`] = null;
        });
        Party.update(updates).catch((err) => Site.toast(err.message));
      }
    });
    $('group-form').addEventListener('submit', saveGroup);
    $('g-delete').addEventListener('click', deleteGroup);
    $('g-title').addEventListener('input', () => {
      if (!resetTouched) $('g-reset').value = guessReset($('g-title').value);
      if (!coversTouched || !B.bundleFor($('g-title').value)) coversFromTitle();
    });
    $('g-covers').addEventListener('change', (e) => {
      const k = e.target.dataset.cover;
      if (!k) return;
      if (e.target.checked) coverOn.add(k); else coverOn.delete(k);
      coversTouched = true;
      renderCovers();
    });
    $('g-reset').addEventListener('change', () => { resetTouched = true; });
    $('g-add-char').addEventListener('change', (e) => {
      if (e.target.value && draft.length < MAX_MEMBERS) draft.push(e.target.value);
      renderDraft();
    });
    $('g-add-guest').addEventListener('click', addGuest);
    $('g-guest').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addGuest(); } });
    $('g-members').addEventListener('click', (e) => {
      const b = e.target.closest('[data-remove]');
      if (b) { draft.splice(Number(b.dataset.remove), 1); renderDraft(); }
    });
    $('group-dialog').addEventListener('click', (e) => {
      if (e.target.closest('[data-close]') || e.target === $('group-dialog')) $('group-dialog').close();
    });
  }

  fillPresets();
  bind();
  Party.subscribe((d, s) => {
    doc = d;
    status = s;
    applyResets();
    if (!Arrange.dragging) render(); // a drop saves and redraws anyway
  });
  Party.start();
  // Keep countdowns fresh and catch a reset that happens while the page is open.
  setInterval(() => { if (doc) { applyResets(); renderStats(); } }, 60 * 1000);
})();
