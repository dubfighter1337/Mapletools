(function () {
  'use strict';

  const D = window.MapleData;
  const STORAGE_KEY = 'maple-6th-planner-v1';
  const AHEAD_ROWS = 12;
  const MAX_PINNED = 15;
  const CATEGORY_ORDER = ['Warrior', 'Mage', 'Archer', 'Thief', 'Pirate'];

  const GROUP_LABELS = {
    skill: 'Skill', mastery: 'Mastery', boost: 'Boost', common: 'Common', stat: 'Stat',
    shinestone: 'Shinestone', utility: 'Utility', special: 'Special', other: 'Other',
  };
  const HEXA_SECTIONS = [
    { title: 'Skill Nodes', group: 'skill' },
    { title: 'Mastery Nodes', group: 'mastery' },
    { title: 'Boost Nodes', group: 'boost' },
    { title: 'Common Nodes', group: 'common' },
    { title: 'HEXA Stats', group: 'stat' },
    { title: 'Other', group: 'other' },
  ];
  // Erda Link boards use the tracker sheet's cell grid; one column/row in logical pixels.
  const ERDA_COL = 17, ERDA_ROW = 12.5, ERDA_TILE = 54;

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => Math.round(n).toLocaleString('en-US');
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  let state = loadState();
  let current = null;      // active class definition
  let selectedId = null;   // selected node id
  let tipId = null;        // node the tooltip is showing
  const undoStack = [];

  // ------------------------------------------------------------ storage

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed === 'object') return { classes: {}, ...parsed };
    } catch (e) { /* private mode or corrupt value: start fresh */ }
    return { classes: {} };
  }

  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* storage unavailable */ }
  }

  function classState(cls) {
    let cs = state.classes[cls.id];
    if (!cs) {
      cs = state.classes[cls.id] = {
        levels: { ...(D.startingLevels[cls.id] || {}) },
        order: D.startingOrders[cls.id] || (cls.orders[0] && cls.orders[0].id),
        fragsOwned: 0,
        fragsPerDay: 0,
      };
      saveState();
    }
    if (!cls.orders.some((o) => o.id === cs.order)) cs.order = cls.orders[0] && cls.orders[0].id;
    return cs;
  }

  // ------------------------------------------------------------ data helpers

  function prepareClass(cls) {
    cls.byId = {};
    cls.nodes.forEach((n) => {
      n.min = n.min || 0;
      cls.byId[n.id] = n;
    });
    cls.orders.forEach((o) => {
      o.steps = o.steps.filter((s) => {
        if (cls.byId[s[0]]) return true;
        console.warn(`${cls.name}: order "${o.name}" mentions unknown node "${s[0]}"`);
        return false;
      });
      o.planMax = {};
      o.steps.forEach(([id, lvl]) => { o.planMax[id] = Math.max(o.planMax[id] || 0, lvl); });
    });
  }

  function levelOf(cs, node) {
    const v = cs.levels[node.id];
    return clamp(Number.isFinite(v) ? v : node.min, node.min, node.max);
  }

  // Cost to go from (lvl - 1) to lvl, or null when the data doesn't say.
  function levelCost(node, lvl) {
    let row = null;
    if (node.costs) row = node.costs[lvl - 1];
    else if (node.cost && D.hexaCosts[node.cost]) row = D.hexaCosts[node.cost][lvl - 1];
    return row ? { erda: row[0], frags: row[1] } : null;
  }

  function rangeCost(node, from, to) {
    const t = { erda: 0, frags: 0, unknown: 0 };
    for (let l = from + 1; l <= to; l++) {
      const c = levelCost(node, l);
      if (c) { t.erda += c.erda; t.frags += c.frags; } else t.unknown++;
    }
    return t;
  }

  function addCost(a, b) { a.erda += b.erda; a.frags += b.frags; a.unknown += b.unknown; return a; }
  const zero = () => ({ erda: 0, frags: 0, unknown: 0 });

  function activeOrder(cls, cs) { return cls.orders.find((o) => o.id === cs.order) || null; }

  // Walks the priority order and works out what is left, grouping back-to-back steps
  // on the same node into one "run" (that run's last target is the checkpoint).
  function computePlan(cls, cs) {
    const order = activeOrder(cls, cs);
    const sim = {};
    cls.nodes.forEach((n) => { sim[n.id] = levelOf(cs, n); });
    const runs = [];
    let done = 0;
    if (order) {
      for (const [id, target, note] of order.steps) {
        if (sim[id] >= target) { done++; continue; }
        const node = cls.byId[id];
        const last = runs[runs.length - 1];
        if (last && last.node === node) {
          last.target = target;
          if (note) last.notes.push(note);
        } else {
          runs.push({ node, from: sim[id], firstTarget: target, target, notes: note ? [note] : [] });
        }
        sim[id] = target;
      }
    }
    const remaining = zero(), planTotal = zero(), spent = zero();
    cls.nodes.forEach((n) => {
      if (cls.system === 'hexa' && n.group === 'stat') return; // roll-based cost, like the sheet
      const lvl = levelOf(cs, n);
      addCost(spent, rangeCost(n, n.min, lvl));
      const pm = order && order.planMax[n.id];
      if (pm) {
        addCost(planTotal, rangeCost(n, n.min, pm));
        if (lvl < pm) addCost(remaining, rangeCost(n, lvl, pm));
      }
    });
    return { order, runs, done, total: order ? order.steps.length : 0, remaining, planTotal, spent };
  }

  // ------------------------------------------------------------ actions

  function setLevel(node, lvl, record = true) {
    const cs = classState(current);
    const before = levelOf(cs, node);
    const after = clamp(lvl, node.min, node.max);
    if (before === after) return;
    if (record) {
      undoStack.push({ classId: current.id, changes: [[node.id, before]] });
      if (undoStack.length > 300) undoStack.shift();
    }
    cs.levels[node.id] = after;
    saveState();
    render();
  }

  function setMany(changes) {
    const cs = classState(current);
    const prev = [];
    changes.forEach(([id, lvl]) => {
      const node = current.byId[id];
      prev.push([id, levelOf(cs, node)]);
      cs.levels[id] = clamp(lvl, node.min, node.max);
    });
    undoStack.push({ classId: current.id, changes: prev });
    saveState();
    render();
  }

  function undo() {
    const entry = undoStack.pop();
    if (!entry) return;
    const cls = D.classes.find((c) => c.id === entry.classId);
    if (!cls) return;
    const cs = classState(cls);
    entry.changes.forEach(([id, lvl]) => { cs.levels[id] = lvl; });
    saveState();
    if (current !== cls) switchClass(cls.id); else render();
  }

  function switchClass(id) {
    current = D.classes.find((c) => c.id === id) || D.classes[0];
    state.active = current.id;
    selectedId = null;
    saveState();
    const cs = classState(current);
    $('frags-owned').value = cs.fragsOwned || '';
    $('frags-day').value = cs.fragsPerDay || '';
    renderOrderSelect();
    render();
  }

  // ------------------------------------------------------------ rendering

  function render() {
    renderTabs();
    renderHeader();
    renderBoard();
    renderSidebar();
    $('undo').disabled = undoStack.length === 0;
    // The board was rebuilt: re-anchor the tooltip to the new tile (or drop it).
    const tipEl = tipId && $('board').querySelector(`[data-node="${CSS.escape(tipId)}"]`);
    if (tipEl) showTip(tipEl); else hideTip();
  }

  // ------------------------------------------------------------ class tabs + picker

  const systemLabel = (c) => (c.system === 'erdaLink' ? 'Erda Link' : 'HEXA');

  function pinnedIds() {
    if (!Array.isArray(state.pinned)) state.pinned = (D.defaultPinned || []).slice(0, MAX_PINNED);
    return state.pinned.filter((id) => D.classes.some((c) => c.id === id));
  }

  function renderTabs() {
    const pinned = pinnedIds().map((id) => D.classes.find((c) => c.id === id));
    const tabs = $('tabs');
    const scroll = tabs.scrollLeft;
    tabs.innerHTML = pinned.map((c) => `
      <button class="tab ${c === current ? 'is-active' : ''}" data-class="${esc(c.id)}">
        <span>${esc(c.name)}</span>
        <span class="tab-system">${systemLabel(c)}</span>
      </button>`).join('');
    tabs.scrollLeft = scroll;
    const active = tabs.querySelector('.is-active');
    if (active && (active.offsetLeft < tabs.scrollLeft - 2 || active.offsetLeft + active.offsetWidth > tabs.scrollLeft + tabs.clientWidth + 2)) {
      tabs.scrollLeft = active.offsetLeft - 8;
    }
    const unpinnedActive = current && !pinned.includes(current);
    const btn = $('picker-btn');
    btn.classList.toggle('is-active', unpinnedActive);
    btn.innerHTML = unpinnedActive
      ? `<span>${esc(current.name)}</span><span class="caret">▾</span>`
      : `<span>All classes</span><span class="caret">▾</span>`;
  }

  function renderPickerList() {
    const q = $('picker-search').value.trim().toLowerCase();
    const pinned = pinnedIds();
    $('picker-hint').textContent = pinned.length >= MAX_PINNED
      ? `★ ${pinned.length}/${MAX_PINNED} pinned. Unpin one to pin another.`
      : `★ ${pinned.length}/${MAX_PINNED} pinned. Star a class to keep it in the top bar.`;
    const matches = D.classes.filter((c) => !q || c.name.toLowerCase().includes(q));
    const cats = [...new Set(matches.map((c) => c.category || 'Other'))]
      .sort((a, b) => (CATEGORY_ORDER.indexOf(a) + 1 || 99) - (CATEGORY_ORDER.indexOf(b) + 1 || 99));
    $('picker-list').innerHTML = cats.map((cat) => `
      <section class="picker-group">
        <h4>${esc(cat)}</h4>
        ${matches.filter((c) => (c.category || 'Other') === cat).sort((a, b) => a.name.localeCompare(b.name)).map((c) => {
          const isPinned = pinned.includes(c.id);
          return `
            <div class="picker-row ${c === current ? 'is-active' : ''}">
              <button class="picker-pick" data-pick="${esc(c.id)}">
                <span>${esc(c.name)}</span><span class="tab-system">${systemLabel(c)}</span>
              </button>
              <button class="picker-pin ${isPinned ? 'is-pinned' : ''}" data-pin="${esc(c.id)}"
                ${!isPinned && pinned.length >= MAX_PINNED ? 'disabled' : ''}
                title="${isPinned ? 'Unpin from the top bar' : 'Pin to the top bar'}" aria-label="${isPinned ? 'Unpin' : 'Pin'} ${esc(c.name)}">${isPinned ? '★' : '☆'}</button>
            </div>`;
        }).join('')}
      </section>`).join('') || '<p class="muted picker-empty">No class matches that.</p>';
  }

  function openPicker(open) {
    const panel = $('picker-panel');
    panel.hidden = !open;
    $('picker-btn').setAttribute('aria-expanded', String(open));
    if (open) {
      $('picker-search').value = '';
      renderPickerList();
      $('picker-search').focus();
    }
  }

  function togglePin(id) {
    const pinned = pinnedIds();
    state.pinned = pinned.includes(id) ? pinned.filter((p) => p !== id) : pinned.concat(id).slice(0, MAX_PINNED);
    saveState();
    renderTabs();
    renderPickerList();
  }

  function renderHeader() {
    $('class-title').textContent = current.name;
    const bits = [];
    if (current.dataVersion) bits.push(`Data ${esc(current.dataVersion)}`);
    if (current.importedOn) bits.push(`imported ${esc(current.importedOn)}`);
    if (current.dataNote) bits.push(esc(current.dataNote));
    $('class-meta').innerHTML = bits.join(' · ');
    document.title = `${current.name} · HEXA Planner`;
  }

  function renderOrderSelect() {
    const cs = classState(current);
    $('order-field').hidden = current.orders.length === 0;
    $('order-select').innerHTML = current.orders.map((o) =>
      `<option value="${esc(o.id)}" ${o.id === cs.order ? 'selected' : ''}>${esc(o.name)}</option>`).join('');
    $('order-select').disabled = current.orders.length < 2;
  }

  function nodeClasses(node, lvl, plan) {
    const next = plan.runs[0];
    const cls = ['node', `g-${node.group}`];
    if (lvl <= 0) cls.push('is-zero');
    if (lvl >= node.max) cls.push('is-max');
    if (next && next.node === node) cls.push('is-next');
    if (node.id === selectedId) cls.push('is-selected');
    return cls.join(' ');
  }

  function iconHtml(node) {
    if (node.icon) return `<img src="${esc(node.icon)}" alt="" draggable="false">`;
    const label = node.short || node.name;
    const words = label.replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
    const mono = words.length > 1 ? words[0][0] + words[1][0] : label.slice(0, 2);
    return `<span class="mono">${esc(mono)}</span>`;
  }

  function levelBadge(node, lvl) {
    if (node.max === 1) return '';
    return `<span class="lvl">${lvl}<small>/${node.max}</small></span>`;
  }

  function renderBoard() {
    const cs = classState(current);
    const plan = computePlan(current, cs);
    const board = $('board');
    const oldVp = $('erda-viewport');
    const keepScroll = oldVp && board.dataset.cls === current.id ? oldVp.scrollLeft : null;
    board.className = `board board-${current.system}`;
    board.dataset.cls = current.id;
    board.innerHTML = current.system === 'erdaLink' ? erdaBoardHtml(cs, plan) : hexaBoardHtml(cs, plan);
    if (current.system === 'erdaLink') {
      fitErdaBoard();
      if (keepScroll !== null) $('erda-viewport').scrollLeft = keepScroll;
      else centerErdaOn(board.querySelector('.erda-canvas .is-next'));
    }
  }

  // On narrow screens the board scrolls; bring a node into the middle of the view.
  function centerErdaOn(tileEl) {
    const vp = $('erda-viewport'), canvas = $('erda-canvas');
    if (!vp || !canvas || !tileEl || vp.scrollWidth <= vp.clientWidth) return;
    const scale = vp.scrollWidth / Number(canvas.dataset.w);
    vp.scrollLeft = (parseFloat(tileEl.style.left) + ERDA_TILE / 2) * scale - vp.clientWidth / 2;
  }

  function hexaBoardHtml(cs, plan) {
    return HEXA_SECTIONS.map((sec) => {
      const nodes = current.nodes.filter((n) => n.group === sec.group).sort((a, b) => a.id.localeCompare(b.id));
      if (!nodes.length) return '';
      const sum = nodes.reduce((s, n) => s + levelOf(cs, n), 0);
      const max = nodes.reduce((s, n) => s + n.max, 0);
      return `
        <section class="hexa-section g-${sec.group}">
          <header class="hexa-section-head"><h3>${sec.title}</h3><span>${sum} / ${max}</span></header>
          <div class="hexa-nodes">
            ${nodes.map((n) => {
              const lvl = levelOf(cs, n);
              return `
                <div class="hexa-node">
                  <button class="${nodeClasses(n, lvl, plan)}" data-node="${esc(n.id)}" aria-label="${esc(n.name)} level ${lvl} of ${n.max}">
                    <span class="node-icon">${iconHtml(n)}</span>
                    ${levelBadge(n, lvl)}
                  </button>
                  <span class="hexa-name">${esc(n.short || n.name)}</span>
                  ${(n.role || GROUP_LABELS[n.group]) !== (n.short || n.name) ? `<span class="hexa-role">${esc(n.role || GROUP_LABELS[n.group])}</span>` : ''}
                </div>`;
            }).join('')}
          </div>
        </section>`;
    }).join('');
  }

  // Places Erda Link nodes from their sheet cell, nudging apart any that the sheet packs
  // closer than a tile (its columns aren't all the same width).
  function layoutErda(nodes) {
    const GAP = 6, SPAN = ERDA_TILE + GAP;
    const pos = nodes.map((n) => ({ n, left: n.x * ERDA_COL, top: n.y * ERDA_ROW }));
    for (let pass = 0; pass < 8; pass++) {
      let moved = false;
      pos.sort((a, b) => a.left - b.left);
      for (let i = 0; i < pos.length; i++) {
        for (let j = i + 1; j < pos.length; j++) {
          const a = pos[i], b = pos[j];
          if (Math.abs(a.top - b.top) >= SPAN) continue;
          const dx = b.left - a.left;
          if (dx < SPAN) { a.left -= SPAN - dx; moved = true; }
        }
      }
      if (!moved) break;
    }
    const minL = Math.min(...pos.map((p) => p.left)), minT = Math.min(...pos.map((p) => p.top));
    pos.forEach((p) => { p.left -= minL; p.top -= minT; });
    return {
      pos,
      w: Math.max(...pos.map((p) => p.left)) + ERDA_TILE,
      h: Math.max(...pos.map((p) => p.top)) + ERDA_TILE,
    };
  }

  function erdaBoardHtml(cs, plan) {
    const onBoard = current.nodes.filter((n) => n.group !== 'shinestone' && Number.isFinite(n.x));
    const stones = current.nodes.filter((n) => n.group === 'shinestone');
    const { pos, w, h } = layoutErda(onBoard);
    const tile = (n, style) => {
      const lvl = levelOf(cs, n);
      return `<button class="${nodeClasses(n, lvl, plan)}" data-node="${esc(n.id)}" ${style ? `style="${style}"` : ''}
                aria-label="${esc(n.name)} level ${lvl} of ${n.max}">
                <span class="node-icon">${iconHtml(n)}</span>${levelBadge(n, lvl)}
              </button>`;
    };
    const legend = ['skill', 'mastery', 'boost', 'common', 'stat', 'utility']
      .filter((g) => onBoard.some((n) => n.group === g))
      .map((g) => `<span class="legend-item g-${g}"><i></i>${GROUP_LABELS[g]}</span>`).join('');
    return `
      <div class="erda-legend">${legend}</div>
      <div class="erda-viewport" id="erda-viewport">
        <div class="erda-sizer" id="erda-sizer">
          <div class="erda-canvas" id="erda-canvas" style="width:${w}px;height:${h}px" data-w="${w}" data-h="${h}">
            ${pos.map((p) => tile(p.n, `left:${p.left}px;top:${p.top}px`)).join('')}
          </div>
        </div>
      </div>
      ${stones.length ? `
        <section class="stones">
          <header class="hexa-section-head"><h3>Shinestones</h3><span>${stones.reduce((s, n) => s + levelOf(cs, n), 0)} / ${stones.reduce((s, n) => s + n.max, 0)}</span></header>
          <div class="stones-row">${stones.map((n) => `<div class="stone">${tile(n)}<span class="hexa-name">${esc(n.name)}</span></div>`).join('')}</div>
        </section>` : ''}`;
  }

  // Scales the board to the available width, but never so small that tiles get hard to tap;
  // below that the board scrolls sideways instead.
  function fitErdaBoard() {
    const vp = $('erda-viewport'), sizer = $('erda-sizer'), canvas = $('erda-canvas');
    if (!vp || !canvas) return;
    const w = Number(canvas.dataset.w), h = Number(canvas.dataset.h);
    const scale = clamp(vp.clientWidth / w, 0.62, 1.15);
    canvas.style.transform = `scale(${scale})`;
    sizer.style.width = `${w * scale}px`;
    sizer.style.height = `${h * scale}px`;
  }

  function costHtml(c, opts = {}) {
    if (!c) return '<span class="muted">—</span>';
    const parts = [];
    const known = c.erda || c.frags || !c.unknown;
    if (known) {
      parts.push(`<span class="cost-erda" title="Sol Erda">${fmt(c.erda)}</span>`);
      parts.push(`<span class="cost-frag" title="Sol Erda Fragments">${fmt(c.frags)}</span>`);
    }
    if (c.unknown) {
      const text = opts.unknownText || (known ? '+ ?' : '?');
      parts.push(`<span class="muted" title="${opts.unknownTitle || 'No cost data for this in the source sheet'}">${text}</span>`);
    }
    return `<span class="cost">${parts.join('')}</span>`;
  }

  function daysText(frags, cs) {
    const need = Math.max(0, frags - (cs.fragsOwned || 0));
    if (need === 0) return 'ready now';
    if (!cs.fragsPerDay) return `${fmt(need)} frags short`;
    const d = need / cs.fragsPerDay;
    return d < 1 ? 'under a day' : `~${d < 10 ? d.toFixed(1) : fmt(d)} days`;
  }

  function unknownLabel(node) {
    return current.system === 'hexa' && node.group === 'stat'
      ? { unknownText: 'RNG', unknownTitle: 'HEXA Stat fragment cost depends on rolls; not counted' }
      : {};
  }

  function renderSidebar() {
    const cs = classState(current);
    const plan = computePlan(current, cs);
    renderNextCard(cs, plan);
    renderSelected(cs, plan);
    renderAhead(cs, plan);
    renderEta(cs, plan);
    renderProgress(cs, plan);
  }

  function renderNextCard(cs, plan) {
    const el = $('next-card');
    const run = plan.runs[0];
    if (!plan.order) { el.innerHTML = '<h2 class="card-title">Next upgrade</h2><p class="muted">This class has no priority order.</p>'; return; }
    if (!run) {
      el.innerHTML = `<h2 class="card-title">Next upgrade</h2><p class="done-text">Priority order complete.</p>`;
      return;
    }
    const n = run.node;
    const nextCost = rangeCost(n, run.from, run.firstTarget);
    const cpCost = rangeCost(n, run.from, run.target);
    const multi = run.target > run.firstTarget;
    el.innerHTML = `
      <h2 class="card-title">Next upgrade <span class="step-count">step ${plan.done + 1} of ${plan.total}</span></h2>
      <button class="next-main" data-node="${esc(n.id)}">
        <span class="${nodeClasses(n, run.from, { runs: [] })} node-sm"><span class="node-icon">${iconHtml(n)}</span></span>
        <span class="next-text">
          <strong>${esc(n.name)}</strong>
          <span>Lv ${run.from} → <b>${run.firstTarget}</b>${multi ? ` <span class="muted">(keep going to ${run.target})</span>` : ''}</span>
        </span>
      </button>
      <div class="next-costs">
        <div><span class="muted">Next level</span>${costHtml(nextCost, unknownLabel(n))}</div>
        ${multi ? `<div><span class="muted">To Lv ${run.target}</span>${costHtml(cpCost, unknownLabel(n))}</div>` : ''}
      </div>
      ${run.notes.length ? `<p class="note">${esc(run.notes[0])}</p>` : ''}
      <div class="btn-row">
        <button class="btn primary" id="apply-next">Done: Lv ${run.firstTarget}</button>
        ${multi ? `<button class="btn" id="apply-checkpoint">Done: Lv ${run.target}</button>` : ''}
      </div>`;
    $('apply-next').onclick = () => setLevel(n, run.firstTarget);
    if (multi) $('apply-checkpoint').onclick = () => setLevel(n, run.target);
  }

  function renderSelected(cs, plan) {
    const el = $('selected-card');
    const n = selectedId && current.byId[selectedId];
    if (!n) {
      el.innerHTML = '<h2 class="card-title">Node</h2><p class="muted">Click a node to see its costs and set its level.</p>';
      return;
    }
    const lvl = levelOf(cs, n);
    const pm = plan.order && plan.order.planMax[n.id];
    const label = unknownLabel(n);
    el.innerHTML = `
      <h2 class="card-title">Node</h2>
      <p class="sel-name">${esc(n.name)}</p>
      <p class="muted sel-sub">${esc(n.role || GROUP_LABELS[n.group])}${n.short && n.short !== n.name ? ` · ${esc(n.short)}` : ''}</p>
      ${n.nameKo ? `<p class="muted small sel-ko" lang="ko">${esc(n.nameKo)}</p>` : ''}
      <div class="stepper">
        <button class="btn" data-set="${n.min}" title="Reset">⟲</button>
        <button class="btn" data-set="${lvl - 1}" ${lvl <= n.min ? 'disabled' : ''}>−</button>
        <input id="sel-level" type="number" min="${n.min}" max="${n.max}" value="${lvl}" inputmode="numeric" aria-label="Level">
        <button class="btn" data-set="${lvl + 1}" ${lvl >= n.max ? 'disabled' : ''}>+</button>
        <button class="btn" data-set="${n.max}" title="Max">Max</button>
      </div>
      <dl class="kv">
        <dt>Level</dt><dd>${lvl} / ${n.max}</dd>
        ${lvl < n.max ? `<dt>Next level</dt><dd>${costHtml(rangeCost(n, lvl, lvl + 1), label)}</dd>` : ''}
        ${lvl < n.max ? `<dt>To max</dt><dd>${costHtml(rangeCost(n, lvl, n.max), label)}</dd>` : ''}
        <dt>Spent</dt><dd>${costHtml(rangeCost(n, n.min, lvl), label)}</dd>
        <dt>Priority goal</dt><dd>${pm ? `Lv ${pm}` : '<span class="muted">not in this order</span>'}</dd>
      </dl>`;
    el.querySelectorAll('[data-set]').forEach((b) => { b.onclick = () => setLevel(n, Number(b.dataset.set)); });
    $('sel-level').onchange = (e) => { const v = parseInt(e.target.value, 10); if (Number.isFinite(v)) setLevel(n, v); };
  }

  function renderAhead(cs, plan) {
    const rows = plan.runs.slice(1, AHEAD_ROWS + 1);
    let running = 0;
    if (plan.runs[0]) running = rangeCost(plan.runs[0].node, plan.runs[0].from, plan.runs[0].target).frags;
    $('ahead').innerHTML = rows.length ? rows.map((r) => {
      const c = rangeCost(r.node, r.from, r.target);
      running += c.frags;
      return `
        <li>
          <button class="ahead-row" data-node="${esc(r.node.id)}" title="${esc(r.notes.join(' · '))}">
            <span class="${nodeClasses(r.node, r.from, { runs: [] })} node-xs"><span class="node-icon">${iconHtml(r.node)}</span></span>
            <span class="ahead-name">${esc(r.node.short || r.node.name)}</span>
            <span class="ahead-lvl">${r.from}→${r.target}</span>
            <span class="ahead-cost">${c.unknown && !c.frags ? '?' : fmt(c.frags)}</span>
          </button>
        </li>`;
    }).join('') : '<li class="muted">Nothing queued after the next upgrade.</li>';
  }

  function renderEta(cs, plan) {
    const run = plan.runs[0];
    const lines = [];
    if (run) {
      lines.push(['Next level', rangeCost(run.node, run.from, run.firstTarget).frags]);
      if (run.target > run.firstTarget) lines.push([`${run.node.short || run.node.name} Lv ${run.target}`, rangeCost(run.node, run.from, run.target).frags]);
    }
    lines.push(['Whole priority order', plan.remaining.frags]);
    $('eta').innerHTML = `<dl class="kv eta">${lines.map(([label, frags]) =>
      `<dt>${esc(label)}</dt><dd><span class="cost-frag">${fmt(frags)}</span><span class="eta-days">${daysText(frags, cs)}</span></dd>`).join('')}</dl>`;
  }

  function renderProgress(cs, plan) {
    const pct = plan.planTotal.frags ? (1 - plan.remaining.frags / plan.planTotal.frags) * 100 : 0;
    $('progress').innerHTML = `
      <h2 class="card-title">Progress <span class="step-count">${pct.toFixed(1)}%</span></h2>
      <div class="bar"><span style="width:${pct.toFixed(2)}%"></span></div>
      <dl class="kv">
        <dt>Spent so far</dt><dd>${costHtml(plan.spent)}</dd>
        <dt>Left in order</dt><dd>${costHtml(plan.remaining)}</dd>
        <dt>Order total</dt><dd>${costHtml(plan.planTotal)}</dd>
      </dl>
      ${current.system === 'hexa' ? '<p class="muted small">HEXA Stat fragments are not counted (they depend on rolls).</p>' : ''}`;
  }

  // ------------------------------------------------------------ tooltip

  function showTip(target) {
    const n = current.byId[target.dataset.node];
    if (!n) return;
    const cs = classState(current);
    const lvl = levelOf(cs, n);
    const label = unknownLabel(n);
    const tip = $('tip');
    tipId = n.id;
    tip.innerHTML = `
      <strong>${esc(n.name)}</strong>
      ${n.nameKo ? `<span class="muted" lang="ko">${esc(n.nameKo)}</span>` : ''}
      <span class="muted">${esc(n.role || GROUP_LABELS[n.group])} · Lv ${lvl}/${n.max}</span>
      ${lvl < n.max ? `<span>Next: ${costHtml(rangeCost(n, lvl, lvl + 1), label)}</span><span>To max: ${costHtml(rangeCost(n, lvl, n.max), label)}</span>` : '<span class="done-text">Maxed</span>'}`;
    tip.hidden = false;
    const r = target.getBoundingClientRect();
    const tr = tip.getBoundingClientRect();
    let left = r.left + r.width / 2 - tr.width / 2;
    left = clamp(left, 8, window.innerWidth - tr.width - 8);
    let top = r.top - tr.height - 8;
    if (top < 8) top = r.bottom + 8;
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  }

  function hideTip() { tipId = null; $('tip').hidden = true; }

  // ------------------------------------------------------------ events

  function nodeFromEvent(e) {
    const el = e.target.closest('[data-node]');
    return el && current.byId[el.dataset.node] ? { el, node: current.byId[el.dataset.node] } : null;
  }

  function bindEvents() {
    $('tabs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-class]');
      if (b) switchClass(b.dataset.class);
    });
    // With many pinned classes the bar scrolls sideways; let the mouse wheel do that.
    $('tabs').addEventListener('wheel', (e) => {
      const tabs = $('tabs');
      if (tabs.scrollWidth <= tabs.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      tabs.scrollLeft += e.deltaY;
      e.preventDefault();
    }, { passive: false });

    $('picker-btn').addEventListener('click', () => openPicker($('picker-panel').hidden));
    $('picker-search').addEventListener('input', renderPickerList);
    $('picker-search').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const first = $('picker-list').querySelector('[data-pick]');
        if (first) { openPicker(false); switchClass(first.dataset.pick); }
      }
    });
    $('picker-list').addEventListener('click', (e) => {
      const pin = e.target.closest('[data-pin]');
      if (pin) { togglePin(pin.dataset.pin); return; }
      const pick = e.target.closest('[data-pick]');
      if (pick) { openPicker(false); switchClass(pick.dataset.pick); }
    });
    document.addEventListener('click', (e) => {
      if (!$('picker-panel').hidden && !e.target.closest('#picker')) openPicker(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !$('picker-panel').hidden) { openPicker(false); $('picker-btn').focus(); }
    });

    const board = $('board');
    board.addEventListener('click', (e) => {
      const hit = nodeFromEvent(e);
      if (!hit) return;
      const lvl = levelOf(classState(current), hit.node);
      selectedId = hit.node.id;
      if (e.shiftKey) setLevel(hit.node, hit.node.max);
      else if (lvl < hit.node.max) setLevel(hit.node, lvl + 1);
      else render();
    });
    board.addEventListener('contextmenu', (e) => {
      const hit = nodeFromEvent(e);
      if (!hit) return;
      e.preventDefault();
      const lvl = levelOf(classState(current), hit.node);
      selectedId = hit.node.id;
      if (e.shiftKey) setLevel(hit.node, hit.node.min);
      else if (lvl > hit.node.min) setLevel(hit.node, lvl - 1);
      else render();
    });
    // Tooltip: mouse only (on touch, the Node panel shows the same info).
    board.addEventListener('pointerover', (e) => {
      if (e.pointerType !== 'mouse') return;
      const hit = nodeFromEvent(e);
      if (hit) showTip(hit.el);
    });
    board.addEventListener('pointerleave', hideTip);
    document.addEventListener('pointermove', (e) => {
      if (tipId && !e.target.closest('#board [data-node]')) hideTip();
    }, { passive: true });

    // Sidebar shortcuts: clicking a node there selects it on the board.
    document.querySelector('.sidebar').addEventListener('click', (e) => {
      const b = e.target.closest('.next-main, .ahead-row');
      if (!b) return;
      selectedId = b.dataset.node;
      render();
      const onBoard = board.querySelector(`[data-node="${CSS.escape(selectedId)}"]`);
      if (onBoard) {
        if (onBoard.closest('.erda-canvas')) centerErdaOn(onBoard);
        onBoard.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    });

    $('order-select').addEventListener('change', (e) => {
      classState(current).order = e.target.value;
      saveState();
      render();
    });

    const numberInput = (id, key) => $(id).addEventListener('input', (e) => {
      const v = Math.max(0, parseInt(e.target.value, 10) || 0);
      classState(current)[key] = v;
      saveState();
      renderSidebar();
    });
    numberInput('frags-owned', 'fragsOwned');
    numberInput('frags-day', 'fragsPerDay');

    $('reset-class').addEventListener('click', () => {
      if (!confirm(`Set every ${current.name} node back to its starting level? (Undo can bring it back.)`)) return;
      setMany(current.nodes.map((n) => [n.id, n.min]));
    });

    $('undo').addEventListener('click', undo);
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.target.matches('input, select, textarea')) {
        e.preventDefault();
        undo();
      }
    });

    $('export').addEventListener('click', exportBackup);
    $('import').addEventListener('change', importBackup);
    window.addEventListener('resize', () => { if (current && current.system === 'erdaLink') fitErdaBoard(); hideTip(); });
    window.addEventListener('scroll', hideTip, { passive: true });
  }

  // ------------------------------------------------------------ backup

  function exportBackup() {
    const blob = new Blob([JSON.stringify({ app: '6th-job-planner', version: 1, savedAt: new Date().toISOString(), ...state }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `6th-job-planner-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  function importBackup(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    file.text().then((text) => {
      const data = JSON.parse(text);
      if (!data || typeof data.classes !== 'object') throw new Error('not a planner backup');
      if (!confirm('Replace all levels in this browser with the backup?')) return;
      state = { classes: data.classes, active: data.active };
      undoStack.length = 0;
      saveState();
      switchClass(state.active || current.id);
    }).catch((err) => alert(`Could not read that file: ${err.message}`));
  }

  // ------------------------------------------------------------ boot

  function loadScript(src) {
    return new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => resolve(true);
      s.onerror = () => resolve(false);
      document.head.appendChild(s);
    });
  }

  async function boot() {
    // Your own starting levels; this file is optional and kept out of the shared (GitHub) copy.
    await loadScript('data/my-levels.js');
    const results = await Promise.all(D.classFiles.map((id) => loadScript(`data/classes/${id}.js`).then((ok) => ({ id, ok }))));
    const failed = results.filter((r) => !r.ok).map((r) => r.id);
    if (failed.length) {
      const box = $('load-error');
      box.textContent = `Could not load class file(s): ${failed.map((id) => `data/classes/${id}.js`).join(', ')}`;
      box.hidden = false;
    }
    D.classes.sort((a, b) => D.classFiles.indexOf(a.id) - D.classFiles.indexOf(b.id));
    D.classes.forEach(prepareClass);
    if (!D.classes.length) return;
    bindEvents();
    // The roster links here as hexa.html?class=<id> to open a character's class.
    const fromLink = new URLSearchParams(location.search).get('class');
    switchClass(D.classes.some((c) => c.id === fromLink) ? fromLink : state.active);
  }

  boot();
})();
