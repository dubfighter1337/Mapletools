// Boss Planner: per character, the weekly bosses they clear, the crystals that uses and the mesos.
// A character's bosses are the ones picked here plus any Boss Schedule group they're in; ticking a
// group in the schedule ticks its bosses here. Ticks clear themselves at the weekly/monthly reset.
(function () {
  'use strict';

  const { $, esc } = Site;
  const B = Bossing;
  const CHAR_LIMIT = 14;   // weekly-boss crystals one character can sell a week
  const WORLD_LIMIT = 180; // crystals one account can sell per world a week: weekly, monthly (and daily) bosses
  const MAX_PARTY = 6;
  const FILTER_KEY = 'mapletools-planner-filter';
  const LINK_ICON = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">'
    + '<path d="M6.5 9.5l3-3"/><path d="M7 4.5l1.2-1.2a2.6 2.6 0 0 1 3.7 3.7L10.7 8.2"/><path d="M9 11.5l-1.2 1.2a2.6 2.6 0 0 1-3.7-3.7L5.3 7.8"/></svg>';

  let doc = null;
  let filter = Site.readJSON(FILTER_KEY, 'all');
  let pick = null;           // boss picker while open: { cid, sel: { <bossId>: { mode, party } } }
  let savingPreset = false;  // the picker shows the "preset name" field
  let arranging = false;     // Reorder mode for your own cards

  const myId = () => Party.me();
  const playerName = (pid) => (doc.players[pid] && doc.players[pid].name) || 'Unknown player';
  const plan = (cid) => doc.planner.chars[cid] || {};
  const isMine = (cid) => !!doc.characters[cid] && doc.characters[cid].owner === myId();
  const bossIcon = B.iconImg;

  // ------------------------------------------------------------ rows and totals

  // One row per boss: the character's own picks plus bosses a schedule group clears for them.
  // A schedule group decides the difficulty (once ticked) and the party size (its member count).
  function rowsFor(cid, links) {
    const p = plan(cid);
    const sel = p.sel || {};
    const ticks = p.done || {};
    const link = links[cid] || {};
    const rows = [];
    for (const id of new Set([...Object.keys(sel), ...Object.keys(link)])) {
      const boss = B.byId[id];
      if (!boss) continue;
      const s = sel[id], l = link[id];
      const mode = l && (l.done || !s) ? l.mode : B.modeName(boss, s.mode) || Object.keys(boss.modes)[0];
      const party = Math.min(MAX_PARTY, Math.max(1, l ? l.party : Number(s.party) || 1));
      const reset = boss.reset || 'weekly';
      const manual = (ticks[id] || 0) >= B.periodStart(reset);
      const key = B.keyOf(id, mode);
      rows.push({
        id, boss, mode, party, reset, link: l || null, manual,
        done: manual || !!(l && l.done),
        doneAt: manual ? ticks[id] : l && l.done ? l.doneAt : 0,
        value: B.price(key) / party,
      });
    }
    // Weekly by value (only the best 14 crystals can be sold), the monthly Black Mage last.
    return rows.sort((a, b) => (a.reset === 'monthly') - (b.reset === 'monthly') || b.value - a.value);
  }

  function summary(rows) {
    const weekly = rows.filter((r) => r.reset === 'weekly');
    // A monthly boss counts toward this week's crystals and mesos until it's cleared, then only in that week.
    const monthly = rows.filter((r) => r.reset === 'monthly' && (!r.done || r.doneAt >= B.periodStart('weekly')));
    const extra = new Set(weekly.slice(CHAR_LIMIT));
    const sold = [...weekly.filter((r) => !extra.has(r)), ...monthly];
    return {
      weekly: weekly.length,
      weeklyDone: weekly.filter((r) => r.done).length,
      crystals: Math.min(CHAR_LIMIT, weekly.length) + monthly.length,
      crystalsDone: Math.min(CHAR_LIMIT, weekly.filter((r) => r.done).length) + monthly.filter((r) => r.done).length,
      extra,
      total: sold.reduce((s, r) => s + r.value, 0),
      earned: sold.filter((r) => r.done).reduce((s, r) => s + r.value, 0),
      finished: rows.length > 0 && rows.every((r) => r.done),
    };
  }

  // ------------------------------------------------------------ rendering

  function rowTitle(r, c, mine) {
    const parts = [`${r.mode} ${r.boss.name}: ${Site.formatNumber(B.price(B.keyOf(r.id, r.mode)))} mesos a crystal`
      + (r.party > 1 ? `, split ${r.party} ways` : '')];
    if (r.link) parts.push(`Boss Schedule: ${r.link.title} (${r.link.party} in the group)${r.link.done ? ', ticked there' : ''}`);
    if (!mine) parts.push(`Only ${c.name}'s player can tick this`);
    return parts.join('\n');
  }

  function row(r, c, sum, mine) {
    const viaSchedule = !!(r.link && r.link.done);
    const canTick = mine && !viaSchedule;
    return `
      <li class="plan-row ${r.done ? 'is-done' : ''} ${sum.extra.has(r) ? 'is-extra' : ''}" title="${esc(rowTitle(r, c, mine))}">
        <button class="tick" data-tick="${esc(c.id)}|${esc(r.id)}" aria-pressed="${r.done}" ${canTick ? '' : 'disabled'}
          aria-label="${esc(`${r.mode} ${r.boss.name}`)} ${r.done ? 'done' : 'not done'}">✓</button>
        ${bossIcon(r.id)}
        <span class="r-name">${esc(`${r.mode} ${r.boss.name}`)}${r.reset === 'monthly' ? ' <small>monthly</small>' : ''}</span>
        <span class="r-link">${r.link ? LINK_ICON : ''}</span>
        <span class="r-party">${r.party > 1 ? `÷${r.party}` : ''}</span>
        <span class="r-val">${Site.formatMeso(r.value)}</span>
      </li>`;
  }

  function card({ c, rows, sum, hidden }) {
    const mine = isMine(c.id);
    const cls = Site.classInfo(c.cls);
    const avatar = c.img ? `<img class="plan-avatar" src="${esc(c.img)}" alt="" loading="lazy">`
      : cls && cls.icon ? `<img class="plan-avatar is-emblem" src="${esc(cls.icon)}" alt="">` : '<span class="plan-avatar"></span>';
    const tags = [c.level ? `Lv ${c.level}` : '', cls ? cls.name : ''].filter(Boolean).join(' · ');
    const manualTicks = rows.some((r) => r.manual);
    const allDone = rows.length && rows.every((r) => r.done);
    const countTitle = sum.weekly > CHAR_LIMIT
      ? `${sum.weekly} weekly bosses: only the best ${CHAR_LIMIT} crystals can be sold (the faded ones don't count)`
      : `${sum.weeklyDone} of ${sum.weekly} weekly bosses done (max ${CHAR_LIMIT} crystals a week)`;
    return `
      <article class="plan-card ${sum.finished ? 'is-done' : ''} ${hidden ? 'is-hidden' : ''} arr-item" data-key="${esc(c.id)}">${mine && arranging ? Arrange.grip : ''}
        <header class="plan-head">
          ${avatar}
          <div class="plan-who"><strong title="${esc(c.name)}">${esc(c.name)}</strong><span>${esc(tags)}</span></div>
          <span class="plan-count ${sum.weekly > CHAR_LIMIT ? 'is-over' : ''}" title="${esc(countTitle)}">${sum.weeklyDone}/${sum.weekly}</span>
        </header>
        ${rows.length
          ? `<ul class="plan-rows">${rows.map((r) => row(r, c, sum, mine)).join('')}</ul>`
          : `<p class="plan-empty">No bosses yet.${mine ? '' : ` ${esc(c.name)}'s player can pick them.`}</p>`}
        <footer class="plan-foot">
          ${mine ? `<button class="link-btn" data-pick="${esc(c.id)}">Bosses</button>` : ''}
          ${mine && rows.length && (!allDone || manualTicks) ? `<button class="link-btn" data-all="${esc(c.id)}">${allDone && manualTicks ? 'Untick all' : 'Tick all'}</button>` : ''}
          ${mine ? `<button class="link-btn" data-hide="${esc(c.id)}">${hidden ? 'Show' : 'Hide'}</button>` : ''}
          <span class="spacer"></span>
          <span class="plan-meso" title="Mesos from crystals sold / planned this week"><b>${Site.formatMeso(sum.earned)}</b> / ${Site.formatMeso(sum.total)}</span>
        </footer>
      </article>`;
  }

  function totals(list) {
    return list.reduce((t, x) => ({
      earned: t.earned + x.sum.earned,
      total: t.total + x.sum.total,
      crystals: t.crystals + x.sum.crystals,
      crystalsDone: t.crystalsDone + x.sum.crystalsDone,
      finished: t.finished + (x.sum.finished ? 1 : 0),
      planned: t.planned + (x.rows.length ? 1 : 0),
    }), { earned: 0, total: 0, crystals: 0, crystalsDone: 0, finished: 0, planned: 0 });
  }

  function renderStats(mineList) {
    const t = totals(mineList);
    const your = Party.inParty ? 'your ' : '';
    const at = B.nextReset('weekly');
    $('stats').innerHTML = `
      <div class="stat ${t.total && t.earned >= t.total ? 'is-complete' : ''}">
        <b>${Site.formatMeso(t.earned)} / ${Site.formatMeso(t.total)}</b><span>${your}mesos this week</span></div>
      <div class="stat ${t.crystals > WORLD_LIMIT ? 'is-over' : ''}">
        <b>${t.crystalsDone} / ${t.crystals}</b><span>${your}crystals sold · ${Math.max(0, WORLD_LIMIT - t.crystals)} of ${WORLD_LIMIT} left to plan</span></div>
      <div class="stat ${t.planned && t.finished === t.planned ? 'is-complete' : ''}">
        <b>${t.finished} / ${t.planned}</b><span>${your}characters done</span></div>
      <div class="stat"><b>${B.untilText(at)}</b><span>until weekly reset · ${esc(B.localTime(at))}</span></div>`;
  }

  function render() {
    $('planner-sub').textContent = Party.inParty
      ? `${doc.meta.name || 'Your party'} · everyone's characters. Ticking a group in the Boss Schedule ticks its bosses here.`
      : 'Only on this device. Create or join a party on the Characters page to share it.';
    document.querySelectorAll('#filter [data-filter]').forEach((b) => b.classList.toggle('is-active', b.dataset.filter === filter));

    const links = B.scheduleLinks(doc);
    const all = Object.entries(doc.characters).map(([id, c]) => {
      const rows = rowsFor(id, links);
      return { c: { id, ...c }, rows, sum: summary(rows), hidden: !!plan(id).hidden };
    });
    renderStats(all.filter((x) => x.c.owner === myId() && !x.hidden));

    const shown = all.filter((x) => (filter === 'hidden' ? x.hidden : !x.hidden
      && (filter === 'all' || (filter === 'done') === x.sum.finished)));
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
      const t = totals(list);
      const anyTicks = mine && list.some((x) => x.rows.some((r) => r.manual));
      const empty = !ownCount
        ? 'No characters yet. Add them on the <a href="index.html">Characters</a> page.'
        : filter === 'hidden' ? 'No hidden characters.' : filter === 'done' ? 'Nobody is finished yet this week.' : 'Everyone is finished.';
      return `
        <section class="plan-player ${mine ? 'is-me' : ''} ${mine && arranging ? 'is-arranging' : ''}">
          <header class="plan-player-head">
            <h2>${esc(Party.inParty ? playerName(pid) : 'My characters')}${mine && Party.inParty ? '<span class="you">you</span>' : ''}</h2>
            ${list.length ? `<span class="sum">${Site.formatMeso(t.earned)} / ${Site.formatMeso(t.total)} · ${t.crystals} crystal${t.crystals === 1 ? '' : 's'}</span>` : ''}
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

  function toggleTick(cid, id) {
    if (!isMine(cid)) return;
    const ticked = ((plan(cid).done || {})[id] || 0) >= B.periodStart(B.resetOf(id));
    write({ [`planner/chars/${cid}/done/${id}`]: ticked ? null : Date.now() });
  }

  function tickAll(cid) {
    if (!isMine(cid)) return;
    const rows = rowsFor(cid, B.scheduleLinks(doc));
    const updates = {};
    if (rows.every((r) => r.done)) rows.filter((r) => r.manual).forEach((r) => { updates[`planner/chars/${cid}/done/${r.id}`] = null; });
    else rows.filter((r) => !r.done).forEach((r) => { updates[`planner/chars/${cid}/done/${r.id}`] = Date.now(); });
    write(updates);
  }

  function untickMine() {
    if (!confirm('Untick every boss you ticked on your characters this week? Ticks from the Boss Schedule stay.')) return;
    const updates = {};
    Object.entries(doc.characters).filter(([cid]) => isMine(cid))
      .forEach(([cid]) => { if (plan(cid).done) updates[`planner/chars/${cid}/done`] = null; });
    write(updates);
  }

  // ------------------------------------------------------------ boss picker

  function presets() {
    const builtIn = (MapleData.bossPresets || []).map((p, i) => ({
      id: `built-in-${i}`, name: p.name, builtIn: true,
      sel: Object.fromEntries(p.bosses.map((k) => B.parse(k)).filter(Boolean).map((x) => [x.id, { mode: x.mode.toLowerCase(), party: 1 }])),
    }));
    return [...builtIn, ...Object.entries(doc.planner.presets).map(([id, p]) => ({ id, ...p }))];
  }

  function openPicker(cid) {
    if (!isMine(cid)) return;
    pick = { cid, sel: JSON.parse(JSON.stringify(plan(cid).sel || {})) };
    savingPreset = false;
    $('pick-title').textContent = `Bosses for ${doc.characters[cid].name}`;
    $('pick-search').value = '';
    renderPicker();
    $('pick-dialog').showModal();
    $('pick-list').scrollTop = 0;
  }

  const weeklyPicked = () => Object.keys(pick.sel).filter((id) => B.resetOf(id) === 'weekly').length;

  function renderPicker() {
    const weekly = weeklyPicked();
    const income = Object.entries(pick.sel).filter(([id]) => B.resetOf(id) === 'weekly')
      .reduce((s, [id, x]) => s + B.price(B.keyOf(id, x.mode)) / Math.max(1, x.party || 1), 0);
    $('pick-count').innerHTML = `<b class="${weekly >= CHAR_LIMIT ? 'is-full' : ''}">${weekly}/${CHAR_LIMIT}</b> weekly · ${Site.formatMeso(income)} a week`;

    const list = presets();
    $('pick-presets').innerHTML = `
      <span class="muted small">Presets</span>
      ${list.map((p) => `<span class="preset"><button type="button" data-preset="${esc(p.id)}" title="Pick these bosses">${esc(p.name)}</button>${
        !p.builtIn && p.owner === myId() ? `<button type="button" class="preset-x" data-del-preset="${esc(p.id)}" aria-label="Delete preset ${esc(p.name)}">×</button>` : ''}</span>`).join('')}
      ${savingPreset
        ? '<span class="preset-new"><input id="preset-name" type="text" maxlength="24" placeholder="Preset name" aria-label="Preset name"><button type="button" class="btn small" data-save-preset>Save preset</button></span>'
        : '<button type="button" class="link-btn" data-new-preset>+ Save these as a preset</button>'}`;

    const q = $('pick-search').value.trim().toLowerCase();
    const match = (b) => !q || [b.name, ...(b.aliases || [])].some((n) => n.toLowerCase().includes(q));
    $('pick-list').innerHTML = ['weekly', 'monthly'].map((reset) => {
      const bosses = B.BOSSES.filter((b) => (b.reset || 'weekly') === reset && match(b));
      if (!bosses.length) return '';
      return `<section class="pick-section"><h3>${reset === 'weekly' ? 'Weekly' : 'Monthly'}</h3>${bosses.map(pickRow).join('')}</section>`;
    }).join('') || '<p class="plan-empty">No boss matches that.</p>';
    if (savingPreset) $('preset-name').focus();
  }

  function pickRow(b) {
    const s = pick.sel[b.id];
    const modes = Object.keys(b.modes);
    const mode = (s && B.modeName(b, s.mode)) || modes[0];
    const party = s ? Math.max(1, s.party || 1) : 1;
    return `
      <div class="pick-row ${s ? 'is-on' : ''}" data-id="${esc(b.id)}">
        <label class="pick-name"><input type="checkbox" data-on ${s ? 'checked' : ''}>${bossIcon(b.id)}<span>${esc(b.name)}</span></label>
        <span class="pick-ctrl">
          <select data-mode aria-label="${esc(b.name)} difficulty">${modes.map((m) => `<option value="${esc(m.toLowerCase())}" ${m === mode ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select>
          <span class="stepper" title="Party size (splits the crystal's value)">
            <button type="button" data-party="-1" aria-label="Smaller party" ${party <= 1 ? 'disabled' : ''}>−</button><b>${party}</b><button type="button" data-party="1" aria-label="Bigger party" ${party >= MAX_PARTY ? 'disabled' : ''}>+</button>
          </span>
        </span>
        <span class="pick-val">${Site.formatMeso(b.modes[mode] / party)}</span>
      </div>`;
  }

  // Selecting a weekly boss past the 14-crystal limit isn't allowed.
  function select(id, mode, party) {
    if (!pick.sel[id] && B.resetOf(id) === 'weekly' && weeklyPicked() >= CHAR_LIMIT) {
      Site.toast(`A character can sell ${CHAR_LIMIT} weekly crystals. Untick a boss first.`);
      return false;
    }
    pick.sel[id] = { mode, party };
    return true;
  }

  function onPickChange(e) {
    const rowEl = e.target.closest('.pick-row');
    if (!rowEl) return;
    const id = rowEl.dataset.id;
    const mode = rowEl.querySelector('[data-mode]').value;
    const party = pick.sel[id] ? pick.sel[id].party || 1 : 1;
    if (e.target.matches('[data-on]')) {
      if (e.target.checked) select(id, mode, party); else delete pick.sel[id];
    } else if (e.target.matches('[data-mode]')) {
      select(id, mode, party);
    }
    renderPicker();
  }

  function onPickClick(e) {
    const step = e.target.closest('[data-party]');
    if (step) {
      const id = step.closest('.pick-row').dataset.id;
      const cur = pick.sel[id];
      const mode = step.closest('.pick-row').querySelector('[data-mode]').value;
      const party = Math.min(MAX_PARTY, Math.max(1, (cur ? cur.party || 1 : 1) + Number(step.dataset.party)));
      if (cur) cur.party = party; else select(id, mode, party);
      return renderPicker();
    }
    const preset = e.target.closest('[data-preset]');
    if (preset) {
      const p = presets().find((x) => x.id === preset.dataset.preset);
      if (p) { pick.sel = JSON.parse(JSON.stringify(p.sel || {})); renderPicker(); Site.toast(`Picked "${p.name}"`); }
      return;
    }
    const del = e.target.closest('[data-del-preset]');
    if (del) {
      const p = doc.planner.presets[del.dataset.delPreset];
      if (p && confirm(`Delete the preset "${p.name}"?`)) write({ [`planner/presets/${del.dataset.delPreset}`]: null });
      return;
    }
    if (e.target.closest('[data-new-preset]')) { savingPreset = true; return renderPicker(); }
    if (e.target.closest('[data-save-preset]')) savePreset();
  }

  function savePreset() {
    const name = $('preset-name').value.trim();
    if (!name) return $('preset-name').focus();
    if (!Object.keys(pick.sel).length) return Site.toast('Pick some bosses first');
    write({ [`planner/presets/${Site.uid('pr')}`]: { name: name.slice(0, 24), owner: myId(), sel: pick.sel } });
    savingPreset = false;
    renderPicker();
    Site.toast(`Saved the preset "${name}" for everyone in the party`);
  }

  function savePicker(e) {
    e.preventDefault();
    if (!pick) return;
    write({ [`planner/chars/${pick.cid}/sel`]: Object.keys(pick.sel).length ? pick.sel : null });
    $('pick-dialog').close();
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
      if (t.dataset.tick) { const [cid, id] = t.dataset.tick.split('|'); toggleTick(cid, id); }
      else if (t.dataset.all) tickAll(t.dataset.all);
      else if (t.dataset.pick) openPicker(t.dataset.pick);
      else if (t.dataset.hide) { if (isMine(t.dataset.hide)) write({ [`planner/chars/${t.dataset.hide}/hidden`]: plan(t.dataset.hide).hidden ? null : true }); }
      else untickMine();
    });
    $('pick-list').addEventListener('change', onPickChange);
    $('pick-list').addEventListener('click', onPickClick);
    $('pick-presets').addEventListener('click', onPickClick);
    $('pick-presets').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'preset-name') { e.preventDefault(); savePreset(); } });
    $('pick-search').addEventListener('input', renderPicker);
    $('pick-search').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.preventDefault(); });
    $('pick-clear').addEventListener('click', () => { pick.sel = {}; renderPicker(); });
    $('pick-form').addEventListener('submit', savePicker);
    $('pick-dialog').addEventListener('click', (e) => {
      if (e.target.closest('[data-close]') || e.target === $('pick-dialog')) $('pick-dialog').close();
    });
  }

  bind();
  Party.subscribe((d) => {
    doc = d;
    if (!Arrange.dragging) render(); // a drop saves and redraws anyway
  });
  Party.start();
  setInterval(() => { if (doc && !Arrange.dragging) render(); }, 60 * 1000); // countdown, and ticks expiring at the reset
})();
