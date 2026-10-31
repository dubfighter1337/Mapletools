// Boss Info: every weekly and monthly boss with its level, HP, Force needed and crystal at a glance;
// clicking a boss opens the details: phases, party size, time limit, deaths and drops.
// Data: data/bosses.js (crystals), data/boss-info.js (the party's boss info sheet) and
// data/boss-details.js (the MapleStory wiki). Patch changes (data/patches.js) show once switched on.
(function () {
  'use strict';

  const { $, esc } = Site;
  const B = Bossing;
  const INFO = MapleData.bossInfo || {};
  const DETAILS = MapleData.bossDetails || {};
  const LIVE_PATCHES = Object.entries(MapleData.patches || {}).filter(([, on]) => on).map(([p]) => p);
  const CHANGES = LIVE_PATCHES.map((p) => ({ patch: p, ...((MapleData.patchBossChanges || {})[p] || {}) }));
  // The drops worth showing, grouped by tools/import-boss-wiki.ps1 (everything else is left out there).
  const DROP_GROUPS = [['gear', 'Gear'], ['sig', 'Signature'], ['box', 'Equipment boxes'], ['ring', 'Boss Ring Boxes'],
    ['erda', 'Sol Erda'], ['whisper', 'Whisper crystals']];
  const picked = {}; // boss id -> difficulty shown on its card
  let openId = null; // boss shown in the details dialog

  const modesOf = (b) => Object.keys(b.modes);
  const modeOf = (b) => (modesOf(b).includes(picked[b.id]) ? picked[b.id] : modesOf(b)[0]);
  const trim = (s) => s.replace(/\.0+$|(\.\d*?)0+$/, '$1');

  function formatHp(n) {
    for (const [v, u] of [[1e15, 'Q'], [1e12, 'T'], [1e9, 'B'], [1e6, 'M']]) if (n >= v) return `${trim((n / v).toFixed(2))}${u}`;
    return Site.formatNumber(n);
  }

  // HP after any live patch that cuts it.
  function hpOf(key) {
    const base = (INFO[key] || {}).hp;
    if (!base) return null;
    const cut = CHANGES.map((c) => (c.hpCut || {})[key]).find(Boolean);
    return { value: cut ? base * (1 - cut) : base, base, cut, patch: cut && CHANGES.find((c) => (c.hpCut || {})[key]).patch };
  }
  const timeOf = (key) => (CHANGES.find((c) => c.timeLimit) || {}).timeLimit || (DETAILS[key] || {}).time || '';

  const phases = (v) => (Array.isArray(v) ? v : null);
  const short = (v) => (Array.isArray(v) ? (Math.min(...v) === Math.max(...v) ? `${v[0]}` : `${Math.min(...v)}–${Math.max(...v)}`) : `${v}`);
  const byPhase = (v) => v.map((x, i) => `Phase ${i + 1}: ${x}`).join(' · ');

  function forceOf(key) {
    const b = INFO[key] || {};
    if (b.arc) return { stat: 'ARC', value: b.arc, text: `${b.arc}` };
    if (b.sac) return { stat: 'SAC', value: b.sac, text: Array.isArray(b.sac) ? b.sac.join(' / ') : `${b.sac}` };
    return null;
  }

  const bossIcon = (id) => B.iconImg(id).replace('class="boss-icon"', 'class="boss-icon big"');

  // ------------------------------------------------------------ the grid

  function card(b) {
    const mode = modeOf(b);
    const key = B.keyOf(b.id, mode);
    const info = INFO[key] || {};
    const hp = hpOf(key);
    const f = forceOf(key);
    return `
      <article class="info-card" data-boss="${esc(b.id)}" tabindex="0" title="${esc(`${mode} ${b.name}: click for drops and more`)}">
        <header class="info-head">
          ${bossIcon(b.id)}
          <h3>${esc(b.name)}</h3>
          ${b.reset === 'monthly' ? '<span class="info-tag">Monthly</span>' : ''}
        </header>
        <div class="mode-pills" role="group" aria-label="Difficulty">
          ${modesOf(b).map((m) => `<button type="button" data-mode="${esc(m)}" class="${m === mode ? 'is-active' : ''}">${esc(m)}</button>`).join('')}
        </div>
        <dl class="info-stats">
          <div><dt>Level</dt><dd>${info.level ? esc(short(info.level)) : '—'}</dd></div>
          <div><dt>HP</dt><dd>${hp ? `${hp.cut ? '~' : ''}${formatHp(hp.value)}` : '—'}</dd></div>
          <div><dt>${f ? f.stat : 'Force'}</dt><dd class="${f ? `f-${f.stat.toLowerCase()}` : ''}">${f ? esc(f.text) : '—'}</dd></div>
          <div><dt>Crystal</dt><dd>${Site.formatMeso(B.price(key))}</dd></div>
        </dl>
      </article>`;
  }

  function render() {
    const q = $('search').value.trim().toLowerCase();
    const list = B.BOSSES.filter((b) => !q || [b.name, ...(b.aliases || [])].some((n) => n.toLowerCase().includes(q)));
    $('boss-grid').innerHTML = list.map(card).join('') || '<p class="muted">No boss matches that.</p>';
  }

  // ------------------------------------------------------------ the details

  function forceRow(key) {
    const b = INFO[key] || {};
    if (b.arc) {
      const [a, c, d] = B.arcSteps(key);
      return `<div><dt>Arcane Force</dt><dd><b class="f-arc">ARC ${b.arc}</b>
        <span class="steps">+10% damage at ${a} · +30% at ${c} · +50% at ${d}</span></dd></div>`;
    }
    if (b.sac) {
      const max = Array.isArray(b.sac) ? Math.max(...b.sac) : b.sac;
      return `<div><dt>Sacred Force</dt><dd><b class="f-sac">SAC ${phases(b.sac) ? esc(byPhase(b.sac)) : max}</b>
        <span class="steps">+5% final damage per 10 over, up to +25% at ${max + 50}; -10% per 10 short</span></dd></div>`;
    }
    return '';
  }

  function dropTile(d) {
    const [, name, icon, extra] = d;
    return `<div class="drop" title="${esc([name, extra].filter(Boolean).join('\n'))}">
      <span class="drop-icon">${icon ? `<img src="data/icons/items/${esc(icon)}.png" alt="" loading="lazy" onerror="this.remove()">` : ''}</span>
      <span class="drop-name">${esc(name)}${extra ? `<small>${esc(extra)}</small>` : ''}</span></div>`;
  }

  function openBoss(id, mode) {
    const b = B.byId[id];
    if (!b) return;
    openId = id;
    picked[id] = mode || modeOf(b);
    const m = modeOf(b);
    const key = B.keyOf(b.id, m);
    const info = INFO[key] || {};
    const det = DETAILS[key] || {};
    const hp = hpOf(key);
    const price = B.price(key);
    const drops = det.drops || [];
    const wiki = det.wiki ? `https://maplestorywiki.net/w/${encodeURI(det.wiki.replace(/ /g, '_'))}` : '';
    $('boss-detail').innerHTML = `
      <header class="detail-head">
        ${bossIcon(b.id)}
        <div><h2>${esc(`${m} ${b.name}`)}</h2><span class="muted small">${b.reset === 'monthly' ? 'Monthly' : 'Weekly'} boss</span></div>
        <button type="button" class="detail-x" data-close aria-label="Close">×</button>
      </header>
      <div class="mode-pills" role="group" aria-label="Difficulty">
        ${modesOf(b).map((x) => `<button type="button" data-detail-mode="${esc(x)}" class="${x === m ? 'is-active' : ''}">${esc(x)}</button>`).join('')}
      </div>
      <dl class="detail-stats">
        <div><dt>Boss level</dt><dd>${info.level ? esc(phases(info.level) ? byPhase(info.level) : info.level) : '—'}</dd></div>
        <div><dt>Entry level</dt><dd>${esc(det.entry || '—')}</dd></div>
        <div><dt>HP</dt><dd>${hp ? `${hp.cut ? '~' : ''}${formatHp(hp.value)}${hp.cut ? ` <span class="steps">${Math.round(hp.cut * 1000) / 10}% less since ${esc(hp.patch.replace('v', 'v.'))} (was ${formatHp(hp.base)})</span>` : ''}` : '—'}</dd></div>
        ${forceRow(key)}
        <div><dt>Party</dt><dd>${esc(det.party || '—')}</dd></div>
        <div><dt>Time limit</dt><dd>${esc(timeOf(key) || '—')}</dd></div>
        <div><dt>Deaths allowed</dt><dd>${esc(det.deaths || '—')}</dd></div>
        <div><dt>Crystal</dt><dd>${Site.formatNumber(price)} <span class="steps">${[2, 3, 6].map((n) => `${n} people: ${Site.formatMeso(price / n)} each`).join(' · ')}</span></dd></div>
      </dl>
      ${DROP_GROUPS.map(([g, title]) => {
        const list = drops.filter((d) => d[0] === g);
        return list.length ? `<h3 class="drop-head">${title}</h3><div class="drop-grid">${list.map(dropTile).join('')}</div>` : '';
      }).join('')}
      ${wiki ? `<p class="small"><a href="${esc(wiki)}" target="_blank" rel="noopener">More on the MapleStory Wiki ↗</a></p>` : ''}`;
    if (!$('boss-dialog').open) $('boss-dialog').showModal();
    render();
  }

  // ------------------------------------------------------------ boot

  $('search').addEventListener('input', render);
  $('boss-grid').addEventListener('click', (e) => {
    const c = e.target.closest('.info-card');
    if (!c) return;
    const pill = e.target.closest('[data-mode]');
    if (pill) { picked[c.dataset.boss] = pill.dataset.mode; render(); return; }
    openBoss(c.dataset.boss);
  });
  $('boss-grid').addEventListener('keydown', (e) => {
    const c = e.target.closest('.info-card');
    if (c && (e.key === 'Enter' || e.key === ' ') && e.target === c) { e.preventDefault(); openBoss(c.dataset.boss); }
  });
  $('boss-dialog').addEventListener('click', (e) => {
    const pill = e.target.closest('[data-detail-mode]');
    if (pill) return openBoss(openId, pill.dataset.detailMode);
    if (e.target.closest('[data-close]') || e.target === $('boss-dialog')) $('boss-dialog').close();
  });
  $('info-note').textContent = [
    'Level, HP and Force from the party\'s boss info sheet; party, time limit, deaths and drops from the MapleStory Wiki (Heroic worlds).',
    LIVE_PATCHES.length ? `Includes the changes of ${LIVE_PATCHES.map((p) => p.replace('v', 'v.')).join(', ')}.` : '',
  ].filter(Boolean).join(' ');
  render();
})();
