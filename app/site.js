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

  // Pages link their files as app/x.js?v=<stamp> (set by tools/bump-version.ps1), so after an update a
  // browser can't pair the new page with an old cached file. asset() gives later-loaded files the same stamp.
  const VERSION = document.currentScript ? new URL(document.currentScript.src).searchParams.get('v') : null;
  const asset = (path) => (VERSION ? `${path}?v=${VERSION}` : path);

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

  // Text field with a styled suggestion list, used instead of <datalist> (whose popup can't be styled).
  // items: strings, or { value, hint } to show a muted note on the right. Picking one fires 'input'.
  function combo(input, items) {
    const all = items.map((it) => (typeof it === 'string' ? { value: it } : it));
    const wrap = document.createElement('div');
    const toggle = document.createElement('button');
    const list = document.createElement('ul');
    wrap.className = 'combo';
    toggle.type = 'button';
    toggle.className = 'combo-toggle';
    toggle.tabIndex = -1;
    toggle.setAttribute('aria-label', 'Show suggestions');
    list.className = 'combo-list';
    list.id = `${input.id}-list`;
    list.setAttribute('role', 'listbox');
    list.hidden = true;
    input.replaceWith(wrap);
    wrap.append(input, toggle, list);
    input.autocomplete = 'off';
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-controls', list.id);
    input.setAttribute('aria-expanded', 'false');

    let shown = [];
    let active = -1;
    let picking = false;

    function open(showAll) {
      const text = input.value.trim().toLowerCase();
      const words = showAll || all.some((it) => it.value.toLowerCase() === text) ? [] : text.split(/\s+/).filter(Boolean);
      shown = all.filter((it) => words.every((w) => it.value.toLowerCase().includes(w)));
      if (!shown.length) return close();
      list.innerHTML = shown.map((it, i) => `<li role="option" id="${list.id}-${i}" data-i="${i}">${esc(it.value)}${it.hint ? `<small>${esc(it.hint)}</small>` : ''}</li>`).join('');
      list.hidden = false;
      list.scrollTop = 0;
      place();
      input.setAttribute('aria-expanded', 'true');
      setActive(shown.findIndex((it) => it.value.toLowerCase() === text));
    }

    // The list is position: fixed so a dialog's scroll area can't cut it off; it opens upwards when
    // there's more room above the field than below.
    function place() {
      const r = input.getBoundingClientRect();
      const below = innerHeight - r.bottom - 12;
      const above = r.top - 12;
      const up = below < 160 && above > below;
      list.style.left = `${r.left}px`;
      list.style.width = `${r.width}px`;
      list.style.maxHeight = `${Math.min(260, up ? above : below)}px`;
      list.style.top = up ? '' : `${r.bottom + 4}px`;
      list.style.bottom = up ? `${innerHeight - r.top + 4}px` : '';
    }

    function close() {
      list.hidden = true;
      active = -1;
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
    }

    function setActive(i) {
      active = i;
      [...list.children].forEach((li, n) => li.classList.toggle('is-active', n === i));
      const li = list.children[i];
      if (!li) return input.removeAttribute('aria-activedescendant');
      input.setAttribute('aria-activedescendant', li.id);
      if (li.offsetTop < list.scrollTop) list.scrollTop = li.offsetTop;
      else if (li.offsetTop + li.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = li.offsetTop + li.offsetHeight - list.clientHeight;
    }

    function pick(i) {
      input.value = shown[i].value;
      close();
      picking = true;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      picking = false;
    }

    input.addEventListener('input', () => { if (!picking) open(false); });
    input.addEventListener('click', () => { if (list.hidden) open(false); });
    input.addEventListener('blur', close);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (list.hidden) return open(false);
        const step = e.key === 'ArrowDown' ? 1 : -1;
        setActive(active < 0 ? (step > 0 ? 0 : shown.length - 1) : (active + step + shown.length) % shown.length);
      } else if (e.key === 'Enter' && !list.hidden && active >= 0) {
        e.preventDefault();
        pick(active);
      } else if (e.key === 'Escape' && !list.hidden) {
        e.preventDefault(); // keep the dialog open, only close the list
        e.stopPropagation();
        close();
      }
    });
    // mousedown would move focus away from the input (and close the list) before the click lands.
    toggle.addEventListener('mousedown', (e) => e.preventDefault());
    toggle.addEventListener('click', () => {
      if (list.hidden) { input.focus(); open(true); } else close();
    });
    list.addEventListener('mousedown', (e) => e.preventDefault());
    const follow = (e) => { if (!list.hidden && e.target !== list) place(); };
    addEventListener('scroll', follow, true);
    addEventListener('resize', follow);
    list.addEventListener('mouseover', (e) => {
      const li = e.target.closest('li');
      if (li) setActive(Number(li.dataset.i));
    });
    list.addEventListener('click', (e) => {
      const li = e.target.closest('li');
      if (li) pick(Number(li.dataset.i));
    });
    return { open, close };
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
    TOOLS, $, esc, asset, readJSON, writeJSON, partyInfo, setPartyInfo, uid, loadScript, toast, combo, formatCode, formatCp,
    formatNumber, classInfo, SYMBOLS, symbolTotals, powerLabel, classFromJob, worldName, renderNav, setPartyStatus,
  };
})();
