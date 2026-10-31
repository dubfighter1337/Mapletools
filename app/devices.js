// "Your devices" card on the Characters page:
//  - a QR code / link that opens MapleTools on a phone or another PC as you, in your party (live sync).
//    Without a party there's nothing to sync with, so it first makes a party just for you.
//  - a backup: your characters with their Boss Planner and Dailies picks as one piece of text.
// The HEXA Planner keeps its own levels per device and isn't part of this.
(function () {
  'use strict';

  const { $, esc } = Site;
  const QR_LIB = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';
  // Backup text: "MT1." + base64url of deflated JSON ("MT0." when the browser can't compress).
  const BACKUP = /^MT([01])\.([A-Za-z0-9_-]+)$/;

  let doc = null;

  const me = () => Party.me();
  const myName = () => (Party.inParty ? ((doc.players[me()] || {}).name || 'you') : 'you');
  const myCharIds = () => Object.keys(doc.characters).filter((id) => doc.characters[id].owner === me());
  const deviceLink = () => {
    const p = Site.partyInfo();
    return `${location.origin}${location.pathname}?device=${p.code}.${encodeURIComponent(p.playerId)}`;
  };

  function render() {
    const n = myCharIds().length;
    $('devices').innerHTML = `
      <h2 class="card-title">Your devices</h2>
      ${Party.inParty
        ? `<p class="small">Use MapleTools on your phone or another PC as <b>${esc(myName())}</b>, with everything in sync.</p>
           <div class="btn-row"><button class="btn primary small" data-dev="qr">Show QR code</button>
             <button class="btn small" data-dev="copy-link">Copy link</button></div>`
        : `<p class="small muted">Your characters are only on this device. To have them on your phone too, they go in a party
             of your own (friends can still join it later).</p>
           <div class="btn-row"><button class="btn primary small" data-dev="own-party" ${Party.configured() ? '' : 'disabled'}>Sync with my phone</button></div>`}
      <h2 class="card-title" style="margin-top:14px">Backup</h2>
      <p class="small muted">Your ${n} character${n === 1 ? '' : 's'} with their bosses and dailies, as one piece of text to keep or paste elsewhere.</p>
      <div class="btn-row"><button class="btn small" data-dev="export" ${n ? '' : 'disabled'}>Copy backup</button>
        <button class="btn small" data-dev="import">Restore backup</button></div>`;
  }

  // ------------------------------------------------------------ dialog helpers

  function dialog(html, onSubmit) {
    $('device-form').innerHTML = html;
    $('device-form').onsubmit = (e) => { e.preventDefault(); if (onSubmit) onSubmit(); };
    if (!$('device-dialog').open) $('device-dialog').showModal();
  }
  const close = () => $('device-dialog').close();
  const actions = (submit, cancel = 'Cancel') => `
    <p class="form-error" id="dev-error" hidden></p>
    <div class="dialog-actions"><span class="spacer"></span>
      ${cancel ? `<button type="button" class="btn ghost" data-close>${cancel}</button>` : ''}
      ${submit ? `<button type="submit" class="btn primary" id="dev-submit">${submit}</button>` : ''}</div>`;
  function fail(err) {
    if ($('dev-submit')) $('dev-submit').disabled = false;
    $('dev-error').textContent = err.message || String(err);
    $('dev-error').hidden = false;
  }
  async function copy(text, label) {
    try { await navigator.clipboard.writeText(text); Site.toast(`${label} copied`); return true; }
    catch (e) { return false; }
  }

  // ------------------------------------------------------------ QR code / device link

  async function showQr() {
    const p = Site.partyInfo();
    const link = deviceLink();
    dialog(`
      <h2>Use MapleTools on your phone</h2>
      <p class="small">Scan this with your phone's camera. It opens MapleTools as <b>${esc(myName())}</b> in
        <b>${esc(doc.meta.name || p.name || 'your party')}</b>, and everything stays in sync.</p>
      <div class="qr-box" id="qr-box"><span class="muted small">Making the code…</span></div>
      <div class="device-link"><input type="text" readonly value="${esc(link)}" aria-label="Device link">
        <button type="button" class="btn small" id="qr-copy">Copy link</button></div>
      <p class="note">Anyone with this code can use MapleTools as you, so only use it on your own devices.</p>
      ${actions('', 'Done')}`);
    $('qr-copy').onclick = () => copy(link, 'Link');
    try {
      if (!window.qrcode) await Site.loadScript(QR_LIB);
      const qr = window.qrcode(0, 'M');
      qr.addData(link);
      qr.make();
      $('qr-box').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true, alt: 'QR code for your device link' });
    } catch (e) {
      $('qr-box').innerHTML = '<span class="muted small">The QR code couldn\'t load. Use Copy link and open it on your phone instead.</span>';
    }
  }

  function ownParty() {
    const n = Party.localCount();
    dialog(`
      <h2>Sync with your phone</h2>
      <p class="small">MapleTools will keep your ${n ? `${n} character${n === 1 ? '' : 's'}, boss groups and picks` : 'characters'} in a party of
        your own, so your phone and this device show the same thing. You can invite friends to it later.</p>
      <div class="fields"><label class="field span-2"><span>Your name</span>
        <input id="dev-name" type="text" maxlength="20" required placeholder="How you'll show up"></label></div>
      ${actions('Make my party')}`, async () => {
      const name = $('dev-name').value.trim();
      if (!name) return $('dev-name').focus();
      $('dev-submit').disabled = true;
      try {
        await Party.create(`${name}'s party`, name, true);
        location.href = 'index.html?showqr=1';
      } catch (err) { fail(err); }
    });
    $('dev-name').focus();
  }

  // Opened from a device link (?device=<party code>.<player id>): become that player on this device.
  async function linkDevice(param) {
    history.replaceState(null, '', location.pathname);
    const [code, pid] = String(param).split('.');
    const now = Site.partyInfo();
    if (now && now.code === Party.cleanCode(code) && now.playerId === pid) return Site.toast('This device is already you');
    if (!Party.configured()) return;
    dialog(`<h2>Use this device as you</h2><p class="muted small">Checking the link…</p>${actions('', 'Cancel')}`);
    let party = null;
    try { party = await Party.peek(code); } catch (e) { /* shown below */ }
    const player = party && party.players[pid];
    if (!player) {
      return dialog(`<h2>Use this device as you</h2>
        <p class="small">This link doesn't match anyone in a party anymore. Make a new QR code on your other device.</p>${actions('', 'Close')}`);
    }
    const local = !now ? Party.localCount() : 0;
    dialog(`
      <h2>Use this device as ${esc(player.name)}?</h2>
      <p class="small">In the party <b>${esc(party.meta.name)}</b>. Your characters, bosses and dailies will be the same here as on your other device.</p>
      ${now ? `<p class="note">This device is in <b>${esc(now.name || 'another party')}</b> now and will switch.</p>` : ''}
      ${local ? `<label class="check"><input id="dev-bring" type="checkbox" checked> Also add the ${local} character${local === 1 ? '' : 's'} that ${local === 1 ? 'is' : 'are'} only on this device</label>` : ''}
      ${actions(`Use as ${esc(player.name)}`, 'Not now')}`, async () => {
      $('dev-submit').disabled = true;
      try {
        await Party.join(code, { playerId: pid, bringLocal: !!($('dev-bring') && $('dev-bring').checked) });
        location.href = 'index.html';
      } catch (err) { fail(err); }
    });
  }

  // ------------------------------------------------------------ backup

  function toBase64Url(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function fromBase64Url(text) {
    const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  }
  const pipe = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());

  async function encode(data) {
    const bytes = new TextEncoder().encode(JSON.stringify(data));
    if (!window.CompressionStream) return `MT0.${toBase64Url(bytes)}`;
    return `MT1.${toBase64Url(await pipe(bytes, new CompressionStream('deflate-raw')))}`;
  }
  async function decode(text) {
    const m = BACKUP.exec(String(text).replace(/\s+/g, ''));
    if (!m) throw new Error('That doesn\'t look like a MapleTools backup. It starts with "MT1."');
    let bytes = fromBase64Url(m[2]);
    if (m[1] === '1') {
      if (!window.DecompressionStream) throw new Error('This browser is too old to read this backup.');
      bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
    }
    const data = JSON.parse(new TextDecoder().decode(bytes));
    if (!data || data.v !== 1 || typeof data.characters !== 'object') throw new Error('This backup is damaged or from a newer MapleTools.');
    return data;
  }

  // Your characters, their Boss Planner and Dailies data, your custom tasks (and ones they use) and presets.
  function backupData() {
    const ids = myCharIds();
    const pick = (obj) => Object.fromEntries(ids.filter((id) => obj[id]).map((id) => [id, obj[id]]));
    const used = new Set(ids.flatMap((id) => Object.keys((doc.tasks.chars[id] || {}).sel || {})));
    const own = (obj, keep) => Object.fromEntries(Object.entries(obj).filter(([id, x]) => x.owner === me() || (keep && keep(id)))
      .map(([id, { owner, ...x }]) => [id, x]));
    return {
      v: 1, at: Date.now(), player: myName() === 'you' ? '' : myName(),
      characters: Object.fromEntries(ids.map((id) => { const { owner, ...c } = doc.characters[id]; return [id, c]; })),
      planner: pick(doc.planner.chars),
      tasks: pick(doc.tasks.chars),
      custom: own(doc.tasks.custom, (id) => used.has(id)),
      presets: { planner: own(doc.planner.presets), tasks: own(doc.tasks.presets) },
    };
  }

  async function exportBackup() {
    const data = backupData();
    const text = await encode(data);
    const n = Object.keys(data.characters).length;
    const copied = await copy(text, 'Backup');
    dialog(`
      <h2>Your backup</h2>
      <p class="small">${copied ? 'Copied. ' : ''}${n} character${n === 1 ? '' : 's'} with their bosses and dailies${
        Object.keys(data.custom).length ? ', and your custom tasks' : ''}. Keep it somewhere safe, or paste it in
        <b>Restore backup</b> on another device or in another party.</p>
      <textarea class="backup-text" readonly rows="5" aria-label="Backup text">${esc(text)}</textarea>
      <div class="dialog-actions"><button type="button" class="btn ghost" id="backup-copy">Copy again</button>
        <span class="spacer"></span><button type="button" class="btn primary" data-close>Done</button></div>`);
    $('backup-copy').onclick = () => copy(text, 'Backup');
    $('device-form').querySelector('textarea').addEventListener('focus', (e) => e.target.select());
  }

  function importBackup() {
    let data = null;
    dialog(`
      <h2>Restore a backup</h2>
      <p class="small">Paste a backup (it starts with "MT1."). Its characters become yours ${Party.inParty ? 'in this party' : 'on this device'}.</p>
      <textarea id="restore-text" class="backup-text" rows="5" placeholder="MT1...." aria-label="Backup text"></textarea>
      <div id="restore-preview"></div>
      ${actions('Read backup')}`, async () => {
      try {
        if (!data) {
          data = await decode($('restore-text').value);
          return preview(data);
        }
        restore(data);
        close();
      } catch (err) { data = null; fail(err); }
    });
    $('restore-text').addEventListener('input', () => { data = null; $('restore-preview').innerHTML = ''; $('dev-submit').textContent = 'Read backup'; });
    $('restore-text').focus();
  }

  // A backup character replaces your character with the same id, or else the same name; otherwise it's added.
  function targetId(oldId, c) {
    const cur = doc.characters[oldId];
    if (cur && cur.owner === me()) return oldId;
    const sameName = myCharIds().find((id) => doc.characters[id].name.toLowerCase() === String(c.name).toLowerCase());
    if (sameName) return sameName;
    return cur ? Site.uid('c') : oldId;
  }

  function preview(data) {
    const rows = Object.entries(data.characters).map(([oldId, c]) => {
      const id = targetId(oldId, c);
      const cls = Site.classInfo(c.cls);
      const replaces = doc.characters[id] && doc.characters[id].owner === me();
      return `<li><span>${esc(c.name)} <span class="muted">${esc([c.level ? `Lv ${c.level}` : '', cls ? cls.name : ''].filter(Boolean).join(' · '))}</span></span>
        <span class="muted">${replaces ? 'replaces yours' : 'new'}</span></li>`;
    }).join('');
    const custom = Object.keys(data.custom || {}).filter((id) => !doc.tasks.custom[id]).length;
    $('restore-preview').innerHTML = `
      <p class="small">From ${esc(data.player || 'a backup')}, ${esc(new Date(data.at).toLocaleString())}:</p>
      <ul class="member-list restore-list">${rows || '<li>No characters in this backup.</li>'}</ul>
      ${custom ? `<p class="small muted">Plus ${custom} custom task${custom === 1 ? '' : 's'}.</p>` : ''}`;
    $('dev-submit').textContent = 'Restore';
  }

  function restore(data) {
    const updates = {};
    for (const [oldId, c] of Object.entries(data.characters)) {
      const id = targetId(oldId, c);
      updates[`characters/${id}`] = { ...c, owner: me(), updatedAt: Date.now() };
      if ((data.planner || {})[oldId]) updates[`planner/chars/${id}`] = data.planner[oldId];
      if ((data.tasks || {})[oldId]) updates[`tasks/chars/${id}`] = data.tasks[oldId];
    }
    for (const [id, t] of Object.entries(data.custom || {})) if (!doc.tasks.custom[id]) updates[`tasks/custom/${id}`] = { ...t, owner: me() };
    const presets = data.presets || {};
    for (const [id, p] of Object.entries(presets.planner || {})) if (!doc.planner.presets[id]) updates[`planner/presets/${id}`] = { ...p, owner: me() };
    for (const [id, p] of Object.entries(presets.tasks || {})) if (!doc.tasks.presets[id]) updates[`tasks/presets/${id}`] = { ...p, owner: me() };
    Party.update(updates)
      .then(() => Site.toast(`Restored ${Object.keys(data.characters).length} character${Object.keys(data.characters).length === 1 ? '' : 's'}`))
      .catch((err) => Site.toast(err.message));
  }

  // ------------------------------------------------------------ boot

  $('devices').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-dev]');
    if (!b) return;
    const action = b.dataset.dev;
    if (action === 'qr') showQr();
    else if (action === 'copy-link') copy(deviceLink(), 'Link');
    else if (action === 'own-party') ownParty();
    else if (action === 'export') exportBackup();
    else if (action === 'import') importBackup();
  });
  $('device-dialog').addEventListener('click', (e) => {
    if (e.target.closest('[data-close]') || e.target === $('device-dialog')) close();
  });

  const params = new URLSearchParams(location.search);
  let started = false;
  Party.subscribe((d) => {
    doc = d;
    render();
    if (started || !Party.loaded) return;
    started = true;
    if (params.get('device')) linkDevice(params.get('device'));
    else if (params.get('showqr') && Party.inParty) { history.replaceState(null, '', location.pathname); showQr(); }
  });
})();
