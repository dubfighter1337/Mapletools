// Dailies: per character the daily, weekly and monthly tasks besides weekly bossing (symbols, Monster
// Park, Ursus, daily bosses, guild, ...). The list is data/tasks.js plus the party's own custom tasks.
// Ticks clear themselves at each task's reset (daily, Monday, Wednesday, Thursday or monthly, UTC).
(function () {
  'use strict';

  const { $, esc } = Site;
  const B = Bossing;
  const V272 = !!(MapleData.patches || {}).v272;
  const FILTER_KEY = 'mapletools-dailies-filter';
  const HIDE_DONE_KEY = 'mapletools-dailies-hide-done';
  const RESETS = [
    { kind: 'daily', label: 'Daily', title: 'Resets every day, 00:00 UTC' },
    { kind: 'monday', label: 'Monday', title: 'Resets Monday, 00:00 UTC' },
    { kind: 'wednesday', label: 'Wednesday', title: 'Resets Wednesday, 00:00 UTC (events)' },
    { kind: 'weekly', label: 'Weekly', title: 'Resets Thursday, 00:00 UTC' },
    { kind: 'monthly', label: 'Monthly', title: 'Resets on the 1st, 00:00 UTC' },
  ];
  const URSUS_2X = [[1, 5], [18, 22]]; // Ursus Golden Time (2x mesos), UTC hours; all day from v.272

  let doc = null;
  let filter = Site.readJSON(FILTER_KEY, 'all');
  let hideDone = Site.readJSON(HIDE_DONE_KEY, false);
  let pick = null;           // task picker while open: { cid, sel: Set of task ids }
  let savingPreset = false;  // the picker shows the "preset name" field
  let arranging = false;     // Reorder mode for your own cards
  let tasksById = {};

  const myId = () => Party.me();
  const playerName = (pid) => (doc.players[pid] && doc.players[pid].name) || 'Unknown player';
  const track = (cid) => doc.tasks.chars[cid] || {};
  const isMine = (cid) => !!doc.characters[cid] && doc.characters[cid].owner === myId();
  const resetIndex = (kind) => RESETS.findIndex((r) => r.kind === kind);

  // ------------------------------------------------------------ the task list

  // data/tasks.js groups plus the party's custom tasks (a "Custom" group per reset), in reset order.
  function groups() {
    const out = MapleData.taskGroups.map((g) => ({ ...g, tasks: g.tasks.map((t) => ({ ...t, reset: g.reset, badge: g.badge, group: g.name })) }));
    const custom = Object.entries(doc.tasks.custom)
      .map(([id, t]) => ({ id, name: t.name, reset: t.reset || 'daily', owner: t.owner, badge: '+', group: 'Custom', custom: true }))
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const r of RESETS) {
      const list = custom.filter((t) => t.reset === r.kind);
      if (list.length) out.push({ reset: r.kind, name: 'Custom', badge: '+', tasks: list });
    }
    return out.sort((a, b) => resetIndex(a.reset) - resetIndex(b.reset));
  }

  function taskIcon(t) {
    return t.icon
      ? `<img class="boss-icon" src="data/icons/${esc(t.icon)}.png" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`
      : `<span class="task-badge" aria-hidden="true">${esc(t.badge || '!')}</span>`;
  }

  // How far a character is with a task in its current reset period: n of count.
  function progress(cid, t) {
    const v = (track(cid).done || {})[t.id];
    const at = v && typeof v === 'object' ? v.at : v || 0;
    const count = t.count || 1;
    const n = at >= B.periodStart(t.reset) ? Math.min(count, v && typeof v === 'object' ? v.n || 0 : count) : 0;
    return { n, count, done: n >= count };
  }

  function rowsFor(cid) {
    const sel = track(cid).sel || {};
    const rows = [];
    for (const g of groups()) for (const t of g.tasks) if (sel[t.id]) rows.push({ t, ...progress(cid, t) });
    return rows;
  }

  const maxedSymbol = (c, t) => {
    if (!t.sym) return false;
    const s = Site.SYMBOLS.find((x) => x.key === t.sym[0]);
    return !!s && (((c.sym || {})[t.sym[0]] || [])[t.sym[1]] || 0) >= s.max;
  };

  // ------------------------------------------------------------ rendering

  function row(r, c, mine) {
    const partial = r.count > 1 && r.n > 0 && !r.done;
    const title = [r.count > 1 ? `${r.t.name}: ${r.n} of ${r.count} today` : r.t.name, r.t.group, mine ? '' : `Only ${c.name}'s player can tick this`]
      .filter(Boolean).join('\n');
    return `
      <li class="plan-row ${r.done ? 'is-done' : ''}" title="${esc(title)}">
        <button class="tick ${partial ? 'is-partial' : ''}" data-tick="${esc(c.id)}|${esc(r.t.id)}" aria-pressed="${r.done}" ${mine ? '' : 'disabled'}
          aria-label="${esc(r.t.name)}: ${r.done ? 'done' : partial ? `${r.n} of ${r.count}` : 'not done'}">${partial ? r.n : '✓'}</button>
        ${taskIcon(r.t)}
        <span class="r-name">${esc(r.t.name)}${r.count > 1 ? ` <small>${r.n}/${r.count}</small>` : ''}</span>
      </li>`;
  }

  function card({ c, rows, hidden }) {
    const mine = isMine(c.id);
    const cls = Site.classInfo(c.cls);
    const avatar = c.img ? `<img class="plan-avatar" src="${esc(c.img)}" alt="" loading="lazy">`
      : cls && cls.icon ? `<img class="plan-avatar is-emblem" src="${esc(cls.icon)}" alt="">` : '<span class="plan-avatar"></span>';
    const tags = [c.level ? `Lv ${c.level}` : '', cls ? cls.name : ''].filter(Boolean).join(' · ');
    const done = rows.filter((r) => r.done).length;
    const sections = RESETS.map((r) => {
      const list = rows.filter((x) => x.t.reset === r.kind);
      if (!list.length) return '';
      const n = list.filter((x) => x.done).length;
      const shown = hideDone ? list.filter((x) => !x.done) : list;
      return `
        <section class="task-sec">
          <h4 class="task-sec-head" title="${esc(r.title)} · in ${esc(B.untilText(B.nextReset(r.kind)))}">
            <span>${r.label}</span><span class="n">${n}/${list.length}</span>
            ${mine && n < list.length ? `<button class="link-btn" data-all="${esc(c.id)}|${r.kind}">Tick all</button>` : ''}
          </h4>
          ${shown.length ? `<ul class="plan-rows">${shown.map((x) => row(x, c, mine)).join('')}</ul>` : ''}
        </section>`;
    }).join('');
    return `
      <article class="plan-card ${rows.length && done === rows.length ? 'is-done' : ''} ${hidden ? 'is-hidden' : ''} arr-item" data-key="${esc(c.id)}">${mine && arranging ? Arrange.grip : ''}
        <header class="plan-head">
          ${avatar}
          <div class="plan-who"><strong title="${esc(c.name)}">${esc(c.name)}</strong><span>${esc(tags)}</span></div>
          <span class="plan-count" title="Tasks done in their current reset">${done}/${rows.length}</span>
        </header>
        ${rows.length ? sections : `<p class="plan-empty">No tasks yet.${mine ? '' : ` ${esc(c.name)}'s player can pick them.`}</p>`}
        <footer class="plan-foot">
          ${mine ? `<button class="link-btn" data-pick="${esc(c.id)}">Tasks</button>` : ''}
          ${mine ? `<button class="link-btn" data-hide="${esc(c.id)}">${hidden ? 'Show' : 'Hide'}</button>` : ''}
        </footer>
      </article>`;
  }

  function ursus(now = Date.now()) {
    const d = new Date(now);
    const day = (h) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h);
    const hour = d.getUTCHours() + d.getUTCMinutes() / 60;
    const on = URSUS_2X.find(([a, b]) => hour >= a && hour < b);
    if (on) return `<b>now</b><span>Ursus 2x · ${esc(B.untilText(day(on[1])))} left</span>`;
    const next = URSUS_2X.find(([a]) => a > hour);
    return `<b>${esc(B.untilText(next ? day(next[0]) : day(24 + URSUS_2X[0][0])))}</b><span>until Ursus 2x</span>`;
  }

  function renderStats(mine) {
    const count = (kinds) => {
      const rows = mine.flatMap((x) => x.rows.filter((r) => kinds.includes(r.t.reset)));
      return [rows.filter((r) => r.done).length, rows.length];
    };
    const [d, dn] = count(['daily']);
    const [w, wn] = count(['monday', 'wednesday', 'weekly', 'monthly']);
    const planned = mine.filter((x) => x.rows.length);
    const finished = planned.filter((x) => x.rows.every((r) => r.done)).length;
    const your = Party.inParty ? 'your ' : '';
    const timer = (kind, label) => `<span class="t"><span>${label}</span><b>${esc(B.untilText(B.nextReset(kind)))}</b></span>`;
    $('stats').innerHTML = `
      <div class="stat ${dn && d === dn ? 'is-complete' : ''}"><b>${d} / ${dn}</b><span>${your}dailies done today</span></div>
      <div class="stat ${wn && w === wn ? 'is-complete' : ''}"><b>${w} / ${wn}</b><span>${your}weeklies done</span></div>
      <div class="stat ${planned.length && finished === planned.length ? 'is-complete' : ''}"><b>${finished} / ${planned.length}</b><span>${your}characters done</span></div>
      ${V272 ? '' : `<div class="stat">${ursus()}</div>`}
      <div class="stat timers" title="Resets, in UTC: daily 00:00, events Wednesday 00:00, weekly Thursday 00:00">
        ${timer('daily', 'Daily reset')}${timer('wednesday', 'Wednesday (events)')}${timer('weekly', 'Thursday (weekly)')}</div>`;
  }

  function render() {
    tasksById = Object.fromEntries(groups().flatMap((g) => g.tasks).map((t) => [t.id, t]));
    $('dailies-sub').textContent = Party.inParty
      ? `${doc.meta.name || 'Your party'} · everyone's characters, ticked live.`
      : 'Only on this device. Create or join a party on the Characters page to share it.';
    document.querySelectorAll('#filter [data-filter]').forEach((b) => b.classList.toggle('is-active', b.dataset.filter === filter));
    $('hide-done').checked = hideDone;

    const all = Object.entries(doc.characters).map(([id, c]) => {
      const rows = rowsFor(id);
      return { c: { id, ...c }, rows, finished: rows.length > 0 && rows.every((r) => r.done), hidden: !!track(id).hidden };
    });
    renderStats(all.filter((x) => x.c.owner === myId() && !x.hidden));

    const shown = all.filter((x) => (filter === 'hidden' ? x.hidden : !x.hidden
      && (filter === 'all' || (filter === 'done') === x.finished)));
    const byPlayer = {};
    shown.forEach((x) => (byPlayer[x.c.owner] = byPlayer[x.c.owner] || []).push(x));
    const pids = Object.keys(byPlayer);
    if (!pids.includes(myId())) pids.push(myId());
    pids.sort((a, b) => (a === myId() ? -1 : b === myId() ? 1 : playerName(a).localeCompare(playerName(b))));

    const ownCount = all.filter((x) => x.c.owner === myId()).length;
    $('players').innerHTML = pids.map((pid) => {
      const list = (byPlayer[pid] || []).sort((a, b) => Site.byCharOrder(a.c, b.c));
      const mine = pid === myId();
      if (!list.length && !mine) return '';
      const rows = list.flatMap((x) => x.rows);
      const anyTicks = mine && list.some((x) => Object.keys(track(x.c.id).done || {}).length);
      const empty = !ownCount
        ? 'No characters yet. Add them on the <a href="index.html">Characters</a> page.'
        : filter === 'hidden' ? 'No hidden characters.' : filter === 'done' ? 'Nobody is finished yet.' : 'Everyone is finished.';
      return `
        <section class="plan-player ${mine ? 'is-me' : ''} ${mine && arranging ? 'is-arranging' : ''}">
          <header class="plan-player-head">
            <h2>${esc(Party.inParty ? playerName(pid) : 'My characters')}${mine && Party.inParty ? '<span class="you">you</span>' : ''}</h2>
            ${rows.length ? `<span class="sum">${rows.filter((r) => r.done).length} / ${rows.length} tasks done</span>` : ''}
            <span class="spacer"></span>
            ${anyTicks ? '<button class="btn ghost small" data-untick-mine>Untick all</button>' : ''}
            ${mine ? Site.reorderButtons(arranging, list.length) : ''}
          </header>
          ${list.length ? `<div class="plan-grid arr-row">${list.map(card).join('')}</div>` : `<p class="plan-empty">${empty}</p>`}
        </section>`;
    }).join('');
  }

  // ------------------------------------------------------------ ticking

  function write(updates) {
    Party.update(updates).catch((err) => Site.toast(err.message));
  }

  // A task done once a reset is saved as the time it was ticked; Ursus-style counts as { n, at }.
  // Clicking a counted task adds one run, and clicking it when complete clears it.
  function tick(cid, id) {
    const t = tasksById[id];
    if (!t || !isMine(cid)) return;
    const { n, count } = progress(cid, t);
    const next = n >= count ? 0 : n + 1;
    write({ [`tasks/chars/${cid}/done/${id}`]: !next ? null : count === 1 ? Date.now() : { n: next, at: Date.now() } });
  }

  function tickAll(cid, kind) {
    if (!isMine(cid)) return;
    const updates = {};
    rowsFor(cid).filter((r) => r.t.reset === kind && !r.done).forEach((r) => {
      updates[`tasks/chars/${cid}/done/${r.t.id}`] = r.count === 1 ? Date.now() : { n: r.count, at: Date.now() };
    });
    write(updates);
  }

  function untickMine() {
    if (!confirm('Untick every task on your characters?')) return;
    const updates = {};
    Object.keys(doc.characters).filter(isMine).forEach((cid) => { if (track(cid).done) updates[`tasks/chars/${cid}/done`] = null; });
    write(updates);
  }

  // ------------------------------------------------------------ task picker

  function presets() {
    const own = Object.keys(doc.characters).filter((id) => isMine(id) && id !== pick.cid && Object.keys(track(id).sel || {}).length)
      .map((id) => ({ id: `copy-${id}`, name: `Same as ${doc.characters[id].name}`, sel: track(id).sel, copy: true }));
    return [...own, ...Object.entries(doc.tasks.presets).map(([id, p]) => ({ id, ...p }))];
  }

  function openPicker(cid) {
    if (!isMine(cid)) return;
    pick = { cid, sel: new Set(Object.keys(track(cid).sel || {})) };
    savingPreset = false;
    $('pick-title').textContent = `Tasks for ${doc.characters[cid].name}`;
    $('pick-search').value = '';
    renderPicker();
    $('pick-dialog').showModal();
    $('pick-list').scrollTop = 0;
  }

  function renderPicker() {
    const c = doc.characters[pick.cid];
    const picked = [...pick.sel].filter((id) => tasksById[id]);
    $('pick-count').innerHTML = `<b>${picked.length}</b> task${picked.length === 1 ? '' : 's'} picked`;

    $('pick-presets').innerHTML = `
      <span class="muted small">Presets</span>
      ${presets().map((p) => `<span class="preset"><button type="button" data-preset="${esc(p.id)}" title="Pick these tasks">${esc(p.name)}</button>${
        !p.copy && p.owner === myId() ? `<button type="button" class="preset-x" data-del-preset="${esc(p.id)}" aria-label="Delete preset ${esc(p.name)}">×</button>` : ''}</span>`).join('')}
      ${savingPreset
        ? '<span class="preset-new"><input id="preset-name" type="text" maxlength="24" placeholder="Preset name" aria-label="Preset name"><button type="button" class="btn small" data-save-preset>Save preset</button></span>'
        : '<button type="button" class="link-btn" data-new-preset>+ Save these as a preset</button>'}`;

    const q = $('pick-search').value.trim().toLowerCase();
    const all = groups();
    $('pick-list').innerHTML = RESETS.map((r) => {
      const gs = all.map((g, i) => ({ g, i })).filter(({ g }) => g.reset === r.kind)
        .map(({ g, i }) => ({ g, i, tasks: g.tasks.filter((t) => !q || t.name.toLowerCase().includes(q) || g.name.toLowerCase().includes(q)) }))
        .filter((x) => x.tasks.length);
      if (!gs.length) return '';
      return `<section class="pick-section"><h3>${r.label} <span class="muted">· ${esc(r.title.replace('Resets ', 'resets '))}</span></h3>${gs.map(({ g, i, tasks }) => {
        const anyOn = tasks.some((t) => pick.sel.has(t.id));
        return `
          <div class="task-group">
            <div class="tg-head"><span>${esc(g.name)}</span><button type="button" class="link-btn" data-group="${i}">${anyOn ? 'none' : 'all'}</button></div>
            <div class="tg-chips">${tasks.map((t) => {
              const on = pick.sel.has(t.id);
              const max = maxedSymbol(c, t);
              return `<label class="task-chip ${on ? 'is-on' : ''} ${max ? 'is-max' : ''}" title="${max ? 'This symbol is maxed on the Characters page' : ''}">
                <input type="checkbox" data-task="${esc(t.id)}" ${on ? 'checked' : ''}>${taskIcon(t)}<span>${esc(t.name)}</span>${max ? '<small>max</small>' : ''}${
                t.custom && t.owner === myId() ? `<button type="button" class="chip-x" data-del-custom="${esc(t.id)}" aria-label="Delete custom task ${esc(t.name)}">×</button>` : ''}</label>`;
            }).join('')}</div>
          </div>`;
      }).join('')}</section>`;
    }).join('') || '<p class="plan-empty">No task matches that.</p>';
    if (savingPreset) $('preset-name').focus();
  }

  function onPickChange(e) {
    const id = e.target.dataset.task;
    if (!id) return;
    if (e.target.checked) pick.sel.add(id); else pick.sel.delete(id);
    renderPicker();
  }

  function onPickClick(e) {
    const del = e.target.closest('[data-del-custom]');
    if (del) {
      e.preventDefault();
      const id = del.dataset.delCustom;
      const t = doc.tasks.custom[id];
      if (!t || !confirm(`Delete the custom task "${t.name}" for everyone in the party?`)) return;
      const updates = { [`tasks/custom/${id}`]: null };
      Object.entries(doc.tasks.chars).forEach(([cid, x]) => {
        if ((x.sel || {})[id]) updates[`tasks/chars/${cid}/sel/${id}`] = null;
        if ((x.done || {})[id]) updates[`tasks/chars/${cid}/done/${id}`] = null;
      });
      pick.sel.delete(id);
      write(updates);
      return;
    }
    const group = e.target.closest('[data-group]');
    if (group) {
      const g = groups()[Number(group.dataset.group)];
      const q = $('pick-search').value.trim().toLowerCase();
      const tasks = g.tasks.filter((t) => !q || t.name.toLowerCase().includes(q) || g.name.toLowerCase().includes(q));
      if (tasks.some((t) => pick.sel.has(t.id))) tasks.forEach((t) => pick.sel.delete(t.id));
      else {
        // "all" means each area: not the "(all)" task, and not symbols that are already maxed.
        const c = doc.characters[pick.cid];
        const want = tasks.filter((t) => !t.whole && !maxedSymbol(c, t));
        (want.length ? want : tasks).forEach((t) => pick.sel.add(t.id));
      }
      return renderPicker();
    }
    const preset = e.target.closest('[data-preset]');
    if (preset) {
      const p = presets().find((x) => x.id === preset.dataset.preset);
      if (p) { pick.sel = new Set(Object.keys(p.sel || {})); renderPicker(); Site.toast(`Picked "${p.name}"`); }
      return;
    }
    const delPreset = e.target.closest('[data-del-preset]');
    if (delPreset) {
      const p = doc.tasks.presets[delPreset.dataset.delPreset];
      if (p && confirm(`Delete the preset "${p.name}"?`)) write({ [`tasks/presets/${delPreset.dataset.delPreset}`]: null });
      return;
    }
    if (e.target.closest('[data-new-preset]')) { savingPreset = true; return renderPicker(); }
    if (e.target.closest('[data-save-preset]')) savePreset();
  }

  function savePreset() {
    const name = $('preset-name').value.trim();
    if (!name) return $('preset-name').focus();
    if (!pick.sel.size) return Site.toast('Pick some tasks first');
    write({ [`tasks/presets/${Site.uid('tp')}`]: { name: name.slice(0, 24), owner: myId(), sel: Object.fromEntries([...pick.sel].map((id) => [id, true])) } });
    savingPreset = false;
    renderPicker();
    Site.toast(`Saved the preset "${name}" for everyone in the party`);
  }

  function savePicker(e) {
    e.preventDefault();
    if (!pick) return;
    const sel = [...pick.sel].filter((id) => tasksById[id]);
    write({ [`tasks/chars/${pick.cid}/sel`]: sel.length ? Object.fromEntries(sel.map((id) => [id, true])) : null });
    $('pick-dialog').close();
  }

  function createCustom(e) {
    e.preventDefault();
    const name = $('custom-name').value.trim();
    if (!name) return;
    const id = Site.uid('ct');
    if (pick) pick.sel.add(id); // before the write, which redraws the picker
    write({ [`tasks/custom/${id}`]: { name: name.slice(0, 40), reset: $('custom-reset').value, owner: myId() } });
    $('custom-dialog').close();
    Site.toast(`Added "${name}"`);
  }

  // ------------------------------------------------------------ reorder (the same order as on the Characters page)

  const myOrdered = () => Object.entries(doc.characters).filter(([, c]) => c.owner === myId())
    .map(([id, c]) => ({ id, ...c })).sort(Site.byCharOrder).map((c) => c.id);

  function arrangeAction(a) {
    if (a === 'reset') {
      if (confirm('Put your characters back in combat power order?')) write(Site.orderUpdates(myOrdered(), null));
      return;
    }
    arranging = a === 'start';
    render();
  }

  // ------------------------------------------------------------ boot

  function bind() {
    Arrange.attach($('players'), {
      block: '.plan-player', rows: '.plan-grid', items: '.plan-card',
      onDrop: (rows) => write(Site.orderUpdates(myOrdered(), rows[0])),
    });
    $('hide-done').addEventListener('change', (e) => { hideDone = e.target.checked; Site.writeJSON(HIDE_DONE_KEY, hideDone); render(); });
    $('filter').addEventListener('click', (e) => {
      const b = e.target.closest('[data-filter]');
      if (!b) return;
      filter = b.dataset.filter;
      Site.writeJSON(FILTER_KEY, filter);
      render();
    });
    $('players').addEventListener('click', (e) => {
      const arrange = e.target.closest('[data-arrange]');
      if (arrange) return arrangeAction(arrange.dataset.arrange);
      const t = e.target.closest('[data-tick], [data-all], [data-pick], [data-hide], [data-untick-mine]');
      if (!t) return;
      if (t.dataset.tick) { const [cid, id] = t.dataset.tick.split('|'); tick(cid, id); }
      else if (t.dataset.all) { const [cid, kind] = t.dataset.all.split('|'); tickAll(cid, kind); }
      else if (t.dataset.pick) openPicker(t.dataset.pick);
      else if (t.dataset.hide) { if (isMine(t.dataset.hide)) write({ [`tasks/chars/${t.dataset.hide}/hidden`]: track(t.dataset.hide).hidden ? null : true }); }
      else untickMine();
    });
    $('pick-list').addEventListener('change', onPickChange);
    $('pick-list').addEventListener('click', onPickClick);
    $('pick-presets').addEventListener('click', onPickClick);
    $('pick-presets').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'preset-name') { e.preventDefault(); savePreset(); } });
    $('pick-search').addEventListener('input', renderPicker);
    $('pick-search').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.preventDefault(); });
    $('pick-clear').addEventListener('click', () => { pick.sel.clear(); renderPicker(); });
    $('pick-custom').addEventListener('click', () => {
      $('custom-name').value = '';
      $('custom-reset').value = 'daily';
      $('custom-dialog').showModal();
      $('custom-name').focus();
    });
    $('custom-form').addEventListener('submit', createCustom);
    $('pick-form').addEventListener('submit', savePicker);
    for (const id of ['pick-dialog', 'custom-dialog']) {
      $(id).addEventListener('click', (e) => { if (e.target.closest('[data-close]') || e.target === $(id)) $(id).close(); });
    }
  }

  bind();
  Party.subscribe((d) => {
    doc = d;
    if (!Arrange.dragging) render(); // a drop saves and redraws anyway
    if (pick && $('pick-dialog').open) renderPicker(); // a custom task or preset added while picking
  });
  Party.start();
  setInterval(() => { if (doc && !Arrange.dragging) render(); }, 60 * 1000); // countdowns, and ticks expiring at a reset
})();
