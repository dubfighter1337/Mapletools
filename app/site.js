// Shared by every page: the site menu and small helpers. Add a tool to TOOLS to put it in the menu
// (and on the Characters page).
window.Site = (function () {
  'use strict';

  const TOOLS = [
    { id: 'roster', href: 'index.html', label: 'Characters', desc: 'Your party and everyone\'s characters.' },
    { id: 'hexa', href: 'hexa.html', label: 'HEXA Planner', desc: 'Click your 6th job nodes up and see what to level next.' },
    { id: 'bosses', href: 'bosses.html', label: 'Boss Schedule', desc: 'Weekly and monthly boss groups, ticked off live with your party.' },
  ];
  const PARTY_KEY = 'mapletools-party';

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function writeJSON(key, value) {
    try {
      if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { /* storage unavailable */ }
  }

  // { code, name, playerId } while this browser is in a party, otherwise null.
  const partyInfo = () => readJSON(PARTY_KEY, null);
  const setPartyInfo = (info) => writeJSON(PARTY_KEY, info);

  function uid(prefix) {
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error(`Could not load ${src}`));
      document.head.appendChild(s);
    });
  }

  let toastTimer = null;
  function toast(message) {
    let el = $('site-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'site-toast';
      el.className = 'toast';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
  }

  // Party codes are shown as ABCDE-FGHJK; stored without the dash.
  const formatCode = (code) => (code && code.length === 10 ? `${code.slice(0, 5)}-${code.slice(5)}` : code || '');

  // "160m" / "1.25b": combat power is entered in millions.
  function formatCp(cp) {
    const n = Number(cp);
    if (!n) return '';
    return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 2).replace(/\.?0+$/, '')}b` : `${Math.round(n)}m`;
  }

  function classInfo(id) {
    const list = (window.MapleData && MapleData.classList) || [];
    return list.find((c) => c.id === id) || null;
  }

  const formatNumber = (n) => (Number(n) ? Math.round(Number(n)).toLocaleString('en-US') : '');

  // Symbols per character: arrays of levels in the order of `names`. Power per symbol level from
  // the MapleStory wiki: Arcane starts at 30 (+10 per level, max 20); Sacred and Grand Sacred start at
  // 10 (+10 per level, max 11). Grand Sacred power counts toward Sacred Power (SAC).
  const SYMBOLS = [
    { key: 'arc', label: 'Arcane', stat: 'ARC', max: 20, power: (l) => (l > 0 ? 20 + 10 * l : 0),
      names: ['Vanishing Journey', 'Chu Chu Island', 'Lachelein', 'Arcana', 'Morass', 'Esfera'] },
    { key: 'sac', label: 'Sacred', stat: 'SAC', max: 11, power: (l) => 10 * l,
      names: ['Cernium', 'Arcus', 'Odium', 'Shangri-La', 'Arteria', 'Carcion'] },
    { key: 'gsac', label: 'Grand Sacred', stat: 'SAC', max: 11, power: (l) => 10 * l,
      names: ['Tallahart', 'Geardock'] },
  ];

  function symbolTotals(sym) {
    const totals = { ARC: 0, SAC: 0 };
    for (const s of SYMBOLS) {
      ((sym && sym[s.key]) || []).forEach((lvl) => { totals[s.stat] += s.power(Number(lvl) || 0); });
    }
    return totals;
  }

  // Combat power if known, otherwise the HEXA converted number.
  function powerLabel(c) {
    if (Number(c.cp)) return formatCp(c.cp);
    if (Number(c.conv)) return `${formatNumber(c.conv)} conv.`;
    return '';
  }

  // Nexon's ranking job names -> our class ids (most match the class name directly).
  const JOB_ALIASES = {
    'bow master': 'bowmaster', 'blade master': 'dual_blade', 'cannon master': 'cannoneer',
    'arch mage (f/p)': 'arch_mage_fire_poison', 'arch mage (i/l)': 'arch_mage_ice_lightning',
  };
  function classFromJob(job) {
    const key = String(job || '').trim().toLowerCase();
    if (JOB_ALIASES[key]) return JOB_ALIASES[key];
    const list = (window.MapleData && MapleData.classList) || [];
    const hit = list.find((c) => c.name.toLowerCase() === key);
    return hit ? hit.id : '';
  }

  // World ids seen in Nexon's rankings (others just show the region).
  const WORLDS = { 30: 'Luna', 45: 'Kronos', 46: 'Solis', 70: 'Hyperion' };
  const worldName = (id) => WORLDS[id] || '';

  function renderNav() {
    const el = $('sitenav');
    if (!el) return;
    const page = el.dataset.page;
    const party = partyInfo();
    el.innerHTML = `
      <a class="site-brand" href="index.html"><span class="brand-mark" aria-hidden="true">◆</span><span>MapleTools</span></a>
      <nav class="site-links" aria-label="Tools">
        ${TOOLS.map((t) => `<a href="${t.href}" class="${t.id === page ? 'is-active' : ''}">${esc(t.label)}</a>`).join('')}
      </nav>
      <a class="party-chip" href="index.html#party" title="${party ? `Party code ${formatCode(party.code)}` : 'Not in a party'}">
        <span class="dot" id="party-dot"></span><span class="chip-label">${esc(party ? party.name || 'Party' : 'No party')}</span>
      </a>`;
  }

  // 'live' | 'offline' | 'connecting' | 'local'
  function setPartyStatus(status) {
    const dot = $('party-dot');
    if (!dot) return;
    dot.className = `dot ${status === 'live' ? 'is-live' : status === 'offline' || status === 'error' ? 'is-off' : ''}`;
  }

  document.addEventListener('DOMContentLoaded', renderNav);

  return {
    TOOLS, $, esc, readJSON, writeJSON, partyInfo, setPartyInfo, uid, loadScript, toast, formatCode, formatCp,
    formatNumber, classInfo, SYMBOLS, symbolTotals, powerLabel, classFromJob, worldName, renderNav, setPartyStatus,
  };
})();
