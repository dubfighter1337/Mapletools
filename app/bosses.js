(function () {
  'use strict';

  const { $, esc } = Site;
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

  // ------------------------------------------------------------ resets (UTC, like the game)

  function periodStart(kind, now = Date.now()) {
    const d = new Date(now);
    const y = d.getUTCFullYear(), m = d.getUTCMonth(), day = d.getUTCDate();
    if (kind === 'daily') return Date.UTC(y, m, day);
    if (kind === 'monthly') return Date.UTC(y, m, 1);
    const sinceThursday = (d.getUTCDay() - 4 + 7) % 7; // weekly reset: Thursday 00:00 UTC
    return Date.UTC(y, m, day - sinceThursday);
  }

  function nextReset(kind, now = Date.now()) {
    const start = new Date(periodStart(kind, now));
    if (kind === 'daily') return start.getTime() + 864e5;
    if (kind === 'monthly') return Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1);
    return start.getTime() + 7 * 864e5;
  }

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

  function untilText(ts) {
    const ms = Math.max(0, ts - Date.now());
    const d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, m = Math.floor(ms / 6e4) % 60;
    return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
  }
  const localTime = (ts) => new Date(ts).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

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

  function memberRow(ref, withOwner) {
    const m = member(ref);
    const emblem = m.cls && m.cls.icon ? `<img class="class-emblem" src="${esc(m.cls.icon)}" alt="${esc(m.cls.name)}" title="${esc(m.cls.name)}">` : '<span class="class-emblem"></span>';
    return `${emblem}
      <span class="m-name" title="${esc(m.name)}">${esc(m.name)}${withOwner && m.owner && Party.inParty ? ` <span class="m-owner">${esc(m.owner)}</span>` : ''}${m.guest ? ' <span class="m-owner">guest</span>' : ''}</span>
      <span class="m-cp">${esc(Site.powerLabel(m))}</span>`;
  }

  // Hover text for a member: level and symbol power (what decides if they can enter a boss).
  function memberTitle(ref) {
    const m = member(ref);
    if (m.guest || m.missing) return '';
    const t = Site.symbolTotals(m.sym);
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

  function groupCard(g) {
    const members = g.members || [];
    const cp = members.reduce((sum, ref) => sum + (Number(member(ref).cp) || 0), 0);
    return `
      <article class="group-card ${g.done ? 'is-done' : ''}">
        <header class="group-head">
          <button class="done-toggle" data-done="${esc(g.id)}" aria-pressed="${g.done ? 'true' : 'false'}"
            title="${g.done ? 'Done. Click to untick' : 'Mark as done'}">✓</button>
          <h3 title="${esc(g.title)}">${esc(g.title)}</h3>
          <button class="btn ghost edit-btn" data-edit="${esc(g.id)}">Edit</button>
        </header>
        <ul class="members">
          ${members.length ? members.map((ref) => `<li class="${ref.startsWith('n:') ? 'is-guest' : ''}" title="${esc(memberTitle(ref))}">${memberRow(ref, true)}</li>`).join('')
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
      return `
        <section class="boss-section">
          <header class="section-head">
            <h2>${s.title}</h2><span class="count">${done} / ${gs.length} done</span>
            <span class="spacer"></span>
            ${done ? `<button class="btn ghost small" data-untick="${s.reset}">Untick all</button>` : ''}
          </header>
          <div class="group-grid">${gs.map(groupCard).join('')}</div>
        </section>`;
    }).join('');
  }

  function render() {
    $('boss-sub').textContent = Party.inParty
      ? `${doc.meta.name || 'Your party'} · ${status === 'live' ? 'live, everyone sees the same schedule' : status === 'connecting' ? 'connecting…' : 'offline, changes sync when back'}`
      : 'Only on this device. Create or join a party on the Characters page to share it.';
    renderStats();
    renderSections();
  }

  // ------------------------------------------------------------ group dialog

  function fillPresets() {
    Site.combo($('g-title'), (MapleData.bosses || [])
      .flatMap((b) => b.modes.map((m) => ({ value: `${m} ${b.name}`, hint: b.reset === 'monthly' ? 'Monthly' : '' }))));
  }

  function guessReset(title) {
    if (/^bm\b|black mage/i.test(title)) return 'monthly';
    const preset = (MapleData.bosses || []).find((b) => title.toLowerCase().includes(b.name.toLowerCase()));
    return (preset && preset.reset) || 'weekly';
  }

  function renderDraft() {
    $('g-count').textContent = `(${draft.length}/${MAX_MEMBERS})`;
    $('g-members').innerHTML = draft.map((ref, i) => `
      <li class="${ref.startsWith('n:') ? 'is-guest' : ''}">${memberRow(ref, true)}
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
    Party.update({
      [`schedule/groups/${id}`]: {
        title: title.slice(0, 40),
        reset: $('g-reset').value,
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
    $('sections').addEventListener('click', (e) => {
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
    $('g-title').addEventListener('input', () => { if (!resetTouched) $('g-reset').value = guessReset($('g-title').value); });
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
    render();
  });
  Party.start();
  // Keep countdowns fresh and catch a reset that happens while the page is open.
  setInterval(() => { if (doc) { applyResets(); renderStats(); } }, 60 * 1000);
})();
