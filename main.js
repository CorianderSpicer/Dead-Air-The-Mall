// App shell: menus, solo setup, multiplayer lobby (room code or manual QR), loading, pause, settings, results.
import { Game } from './game.js';
import { Controls } from './controls.js';
import { Audio } from './audio.js';
import { Net, qrSVG, scanQR } from './net.js';
import { loadSettings, saveSettings } from './save.js';
import { MODIFIERS, ROUTES } from './objectives.js';
import { SLOT_COLORS } from './scene.js';
import { fmtTime } from './util.js';

const $ = s => document.querySelector(s); const app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const S = loadSettings(); if (!S.name) S.name = ['Reyes', 'Okafor', 'Lindqvist', 'Tanaka', 'Morales', 'Kowalski', 'Haddad', 'Brennan'][Math.floor(Math.random() * 8)];
{ const qp = new URLSearchParams(location.search); if (['low', 'medium', 'high'].includes(qp.get('q'))) S.quality = qp.get('q'); }
const audio = new Audio(S); const ctrl = new Controls($('#touchroot'), S);
const DIFF = { normal: ['Normal', 'Fair fights. Plenty of batteries. It forgives a mistake or two.'], hard: ['Hard', 'Scarcer supplies, sharper senses, an extra objective.'], nightmare: ['Nightmare', 'Batteries are rare. It hits hard and hunts long. Two extra objectives.'] };
const VERSION = 'v1.0';
let game = null, net = null, lobby = null, scanStop = null;
const save = () => saveSettings(S);
const click = (f = 600) => { audio.init(); audio.play('ui', null, { f }); };

// ───────── screen helpers ─────────
function screen(html, cls = '') { stopScan(); app.className = 'screen ' + cls; app.innerHTML = html; app.querySelectorAll('button').forEach(b => b.addEventListener('pointerdown', () => click(b.classList.contains('pri') ? 720 : 560))); app.scrollTop = 0; return app; }
function toast(msg, kind = '') { const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = msg; document.body.append(t); setTimeout(() => t.classList.add('out'), 3200); setTimeout(() => t.remove(), 3800); }
function stopScan() { try { scanStop?.(); } catch (e) { } scanStop = null; }
const logo = (small) => `<div class="logo${small ? ' small' : ''}"><div class="l1" data-t="DEAD AIR">DEAD AIR</div><div class="l2">THE MALL</div></div>`;
const back = (fn = 'title') => `<button class="b ghost back" data-go="${fn}">← Back</button>`;
function wireNav() { app.querySelectorAll('[data-go]').forEach(b => b.onclick = () => go(b.dataset.go)); }
function go(where) { ({ title, solo: soloMenu, mp: mpMenu, settings: () => settingsScreen(title), help: () => helpScreen(title), credits }[where] || title)(); }

// ───────── title ─────────
function title() {
  leaveNet();
  screen(`<div class="bg-noise"></div><div class="title-wrap">${logo()}<p class="tag">Hollowbrook Galleria has been closed for nine years. Tonight your unit answered its silent alarm.<br>Your bodycams are still recording.</p>
    <div class="mainmenu"><button class="b pri big" id="bSolo">Single Player</button><button class="b big" id="bMp">Multiplayer <small>up to 4 officers</small></button>
    <div class="row"><button class="b" data-go="settings">Settings</button><button class="b" data-go="help">How to play</button><button class="b" data-go="credits">Credits</button></div></div>
    <div class="name"><label>Officer surname</label><input id="nm" maxlength="14" value="${esc(S.name)}" autocomplete="off" spellcheck="false"></div>
    <div class="foot">${VERSION} · best with headphones · <span class="hint">${matchMedia('(pointer: coarse)').matches ? 'iPad: rotate to landscape' : 'Keyboard + mouse supported'}</span></div></div>`, 'title');
  $('#nm').oninput = e => { S.name = e.target.value.replace(/[^\p{L}\p{N} .'-]/gu, '').slice(0, 14) || 'Officer'; save(); };
  $('#bSolo').onclick = soloMenu; $('#bMp').onclick = mpMenu; wireNav();
  const j = new URLSearchParams(location.search).get('join'); if (j) { history.replaceState(null, '', location.pathname); joinByCode(j); }
}
// ───────── shared setup widgets ─────────
function setupHTML(cfg, editable = true) {
  return `<div class="setup"><h3>Difficulty</h3><div class="diffs">${Object.entries(DIFF).map(([k, [n, d]]) => `<button class="dcard ${cfg.diff === k ? 'on' : ''} ${k}" data-d="${k}" ${editable ? '' : 'disabled'}><b>${n}</b><span>${d}</span></button>`).join('')}</div>
    <h3>Match modifiers <small>optional</small></h3><div class="mods">${Object.entries(MODIFIERS).map(([k, m]) => `<button class="chip ${cfg.mods.includes(k) ? 'on' : ''}" data-m="${k}" title="${esc(m.desc)}" ${editable ? '' : 'disabled'}>${m.name}</button>`).join('')}</div>
    <h3>Way out</h3><div class="routes"><select id="route" ${editable ? '' : 'disabled'}><option value="">Random (recommended)</option>${Object.entries(ROUTES).map(([k, r]) => `<option value="${k}" ${cfg.route === k ? 'selected' : ''}>${r.title}</option>`).join('')}</select></div></div>`;
}
function wireSetup(cfg, onChange) {
  app.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { cfg.diff = b.dataset.d; app.querySelectorAll('[data-d]').forEach(x => x.classList.toggle('on', x === b)); onChange(); });
  app.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { const k = b.dataset.m; cfg.mods = cfg.mods.includes(k) ? cfg.mods.filter(x => x !== k) : [...cfg.mods, k]; b.classList.toggle('on'); onChange(); });
  const r = $('#route'); if (r) r.onchange = () => { cfg.route = r.value; onChange(); };
}
// ───────── single player ─────────
function soloMenu() {
  const cfg = { diff: S.diff, mods: [...S.mods], route: S.route };
  screen(`${back()}<div class="panelwrap">${logo(true)}<div class="card"><h2>Single Player</h2><p class="sub">Solo is rebalanced: more supplies, a slightly slower monster, and you can patch yourself up once you're down — if you carry a first aid kit.</p>
    ${setupHTML(cfg)}<div class="row end"><label class="seed">Mall seed <input id="seed" inputmode="numeric" placeholder="random" maxlength="9"></label><button class="b pri big" id="go">Enter the mall</button></div></div></div>`, 'menu');
  wireNav(); wireSetup(cfg, () => { S.diff = cfg.diff; S.mods = cfg.mods; S.route = cfg.route; save(); });
  $('#go').onclick = () => { const sd = parseInt($('#seed').value, 10); startSolo(Number.isFinite(sd) ? sd : (Math.random() * 1e9) | 0, cfg); };
}
async function startSolo(seed, cfg) {
  const roster = [{ id: 'me', name: S.name, slot: 0 }];
  await runGame({ mode: 'solo', myId: 'me', roster, seed, cfg: { difficulty: cfg.diff, modifiers: cfg.mods, route: cfg.route || null } }, { retry: () => startSolo(seed, cfg), fresh: () => startSolo((Math.random() * 1e9) | 0, cfg) });
}
// ───────── multiplayer menu ─────────
function mpMenu() {
  leaveNet();
  screen(`${back()}<div class="panelwrap">${logo(true)}<div class="mpgrid">
    <div class="card"><h2>Host a lobby</h2><p class="sub">You run the mall: the monster, items and objectives live on your device. Keep it plugged in.</p>
      <button class="b pri big" id="hCode">Host with a room code</button><button class="b" id="hMan">Host offline (QR / copy-paste)</button></div>
    <div class="card"><h2>Join a lobby</h2><p class="sub">Enter the 5-letter code from your host.</p><div class="row"><input id="code" class="code" maxlength="5" placeholder="ABCDE" autocapitalize="characters" autocomplete="off" spellcheck="false"><button class="b pri" id="jCode">Join</button></div>
      <button class="b" id="jMan">Join offline (scan / paste invite)</button></div></div>
    <div class="note">Room codes use the free public PeerJS broker only to introduce devices; gameplay then runs device-to-device. Offline mode needs no broker at all but asks you to swap two codes. Some networks (strict NAT, many cellular / corporate networks) block direct connections — see the README for TURN.</div></div>`, 'menu');
  wireNav(); $('#hCode').onclick = () => hostLobby('code'); $('#hMan').onclick = () => hostLobby('manual'); $('#jMan').onclick = joinManual; $('#jCode').onclick = () => joinByCode($('#code').value);
  $('#code').addEventListener('keydown', e => { if (e.key === 'Enter') joinByCode($('#code').value); });
}
function mkNet() { leaveNet(); net = new Net(); if (S.turnUrl) net.turn = { urls: S.turnUrl, username: S.turnUser, credential: S.turnPass }; return net; }
function leaveNet() { if (game) { game.stop(); game = null; } try { net?.close(); } catch (e) { } net = null; lobby = null; }
// ───────── host lobby ─────────
async function hostLobby(kind) {
  mkNet(); lobby = { host: true, kind, code: null, players: [{ id: 'h', name: S.name, slot: 0, ready: true, link: null }], cfg: { diff: S.diff, mods: [...S.mods], route: S.route }, invites: [] };
  net.onlink = link => { /* wait for hello */ };
  net.onmsg = (lid, m) => onHostMsg(lid, m);
  net.ondrop = lid => { const p = lobby?.players.find(p => p.link === lid); if (!p) return; if (game) game.dropPlayer(p.id); else { lobby.players = lobby.players.filter(x => x !== p); toast(`${p.name} left`); renderLobby(); pushLobby(); } };
  if (kind === 'code') { renderLobby('Opening a room…'); try { lobby.code = await net.hostRoom(Net.code()); } catch (e) { toast(e.message, 'bad'); return mpMenu(); } }
  renderLobby();
}
function onHostMsg(lid, m) {
  if (game && ['st', 'act', 'noise'].includes(m.t)) { const p = lobby.players.find(p => p.link === lid); if (p) game.onNet(p.id, m); return; }
  if (m.t === 'hello') { if (game || lobby.players.length >= 4) { net.send(lid, { t: 'full', why: game ? 'Match already running.' : 'Lobby is full (4 officers).' }); return; } if (m.v !== VERSION) { net.send(lid, { t: 'full', why: `Version mismatch (host ${VERSION}, you ${m.v}). Refresh both pages.` }); return; }
    const used = lobby.players.map(p => p.slot); const slot = [0, 1, 2, 3].find(s => !used.includes(s)); const p = { id: lid, link: lid, name: String(m.name || 'Officer').slice(0, 14), slot, ready: false }; lobby.players.push(p); net.send(lid, { t: 'welcome', pid: lid, slot }); toast(`${p.name} joined`); audio.play('ping', null); renderLobby(); pushLobby(); }
  if (m.t === 'ready') { const p = lobby.players.find(p => p.link === lid); if (p) { p.ready = !!m.v; renderLobby(); pushLobby(); } }
  if (m.t === 'loaded') { const p = lobby.players.find(p => p.link === lid); if (p) { p.loaded = true; maybeGo(); } }
}
function pushLobby() { if (!net) return; net.broadcast({ t: 'lobby', players: lobby.players.map(p => ({ id: p.id, name: p.name, slot: p.slot, ready: p.ready })), cfg: lobby.cfg, code: lobby.code }); }
function slotsHTML(players) { return `<div class="slots">${[0, 1, 2, 3].map(s => { const p = players.find(p => p.slot === s); return `<div class="pslot ${p ? 'on' : ''} ${p?.ready ? 'ready' : ''}" style="--c:${SLOT_COLORS[s]}"><i>${s + 1}</i><b>${p ? esc(p.name) : 'Waiting for officer…'}</b><span>${p ? (p.id === 'h' ? 'HOST' : p.ready ? 'READY' : 'not ready') : ''}</span></div>`; }).join('')}</div>`; }
function renderLobby(busy) {
  const L = lobby; const joinURL = L.code ? `${location.origin}${location.pathname}?join=${L.code}` : '';
  screen(`${back('mp')}<div class="panelwrap wide">${logo(true)}<div class="lobby"><div class="card">
      <h2>Lobby ${L.code ? `<span class="rcode">${L.code}</span>` : '<span class="rcode off">OFFLINE</span>'}</h2>
      ${busy ? `<p class="sub">${busy}</p>` : L.code ? `<p class="sub">Friends open the game → Multiplayer → enter <b>${L.code}</b>, or scan:</p><div class="qr small">${qrSVG(joinURL)}</div>` : `<p class="sub">Invite each officer with a two-way code swap (works on the same Wi-Fi without internet).</p>`}
      ${slotsHTML(L.players)}
      ${L.kind === 'manual' ? `<div class="invites">${L.invites.map((iv, i) => `<div class="invite"><h4>Invite #${i + 1} ${iv.done ? '✔ connected' : ''}</h4>${iv.done ? '' : `<div class="qr">${qrSVG(iv.text)}</div><div class="row"><button class="b sm" data-copy="${i}">Copy invite</button></div><label>Their reply code</label><div class="row"><textarea data-ans="${i}" rows="2" placeholder="Paste DA1… reply here"></textarea></div><div class="row"><button class="b sm pri" data-acc="${i}">Connect</button><button class="b sm" data-scan="${i}">Scan reply QR</button></div><video data-v="${i}" class="scanv" muted></video>`}</div>`).join('')}</div>${L.players.length + L.invites.filter(i => !i.done).length < 4 ? '<button class="b" id="inv">+ Create invite</button>' : ''}` : ''}
    </div><div class="card">${setupHTML(L.cfg, true)}<div class="row end"><button class="b pri big" id="start" ${L.players.every(p => p.ready) ? '' : 'disabled'}>Start (${L.players.length} officer${L.players.length > 1 ? 's' : ''})</button></div><p class="sub tiny">Everyone must be ready. More officers = more objectives and a hungrier monster.</p></div></div></div>`, 'menu');
  wireNav(); wireSetup(L.cfg, () => { S.diff = L.cfg.diff; S.mods = L.cfg.mods; S.route = L.cfg.route; save(); pushLobby(); });
  $('#start').onclick = hostStart; $('#inv') && ($('#inv').onclick = makeInvite);
  app.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => copy(L.invites[+b.dataset.copy].text));
  app.querySelectorAll('[data-acc]').forEach(b => b.onclick = () => acceptAnswer(+b.dataset.acc, app.querySelector(`[data-ans="${b.dataset.acc}"]`).value));
  app.querySelectorAll('[data-scan]').forEach(b => b.onclick = async () => { const i = +b.dataset.scan; const v = app.querySelector(`[data-v="${i}"]`); v.classList.add('on'); try { scanStop = await scanQR(v, txt => acceptAnswer(i, txt)); } catch (e) { toast('Camera unavailable — paste the code instead.', 'bad'); } });
}
async function makeInvite() { try { const o = await net.manualOffer(); lobby.invites.push({ id: o.id, text: o.text, done: false }); renderLobby(); } catch (e) { toast('Could not create invite: ' + e.message, 'bad'); } }
async function acceptAnswer(i, txt) { stopScan(); const iv = lobby.invites[i]; try { await net.manualAccept(iv.id, txt); iv.done = true; toast('Connecting…'); setTimeout(renderLobby, 300); } catch (e) { toast(e.message, 'bad'); } }
async function copy(t) { try { await navigator.clipboard.writeText(t); toast('Copied'); } catch (e) { const ta = document.createElement('textarea'); ta.value = t; document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove(); toast('Copied'); } }
async function hostStart() {
  const L = lobby; if (!L.players.every(p => p.ready)) return; const seed = (Math.random() * 1e9) | 0; const roster = L.players.map(p => ({ id: p.id, name: p.name, slot: p.slot }));
  const cfg = { difficulty: L.cfg.diff, modifiers: L.cfg.mods, route: L.cfg.route || null }; L.players.forEach(p => p.loaded = p.id === 'h');
  net.broadcast({ t: 'start', seed, cfg, roster });
  await runGame({ mode: L.players.length > 1 ? 'host' : 'solo', myId: 'h', roster, seed, cfg, net }, { lobby: true, afterLoad: g => { net.broadcast({ t: 'match', match: g.match }); L.hostLoaded = true; return new Promise(res => { L.goRes = res; maybeGo(); setTimeout(() => res(), 45000); }); } });
}
function maybeGo() { const L = lobby; if (L?.hostLoaded && L.players.every(p => p.loaded) && L.goRes) { net.broadcast({ t: 'go' }); const r = L.goRes; L.goRes = null; r(); } }
// ───────── join ─────────
async function joinByCode(code) { code = String(code || '').trim().toUpperCase(); if (!/^[A-Z0-9]{5}$/.test(code)) return toast('Codes are 5 letters/numbers.', 'bad'); mkNet(); screen(`<div class="panelwrap">${logo(true)}<div class="card center"><h2>Joining ${esc(code)}…</h2><p class="sub">Contacting the host.</p><div class="spin"></div>${back('mp')}</div></div>`, 'menu'); wireNav();
  try { const link = await net.joinRoom(code); clientConnected(link, code); } catch (e) { toast(e.message, 'bad'); mpMenu(); } }
function joinManual() {
  mkNet(); screen(`${back('mp')}<div class="panelwrap">${logo(true)}<div class="card"><h2>Join offline</h2><p class="sub">1 · Scan or paste the host's invite. 2 · Show your reply to the host. 3 · Wait for the lobby.</p>
    <label>Host invite</label><textarea id="offer" rows="3" placeholder="Paste DA1… invite here"></textarea><div class="row"><button class="b pri" id="mk">Create reply</button><button class="b" id="scan">Scan invite QR</button></div><video id="scanv" class="scanv" muted></video><div id="ans"></div></div></div>`, 'menu');
  wireNav();
  const make = async txt => { stopScan(); try { const r = await net.manualAnswer(txt); window.__lastReply = r.text; $('#ans').innerHTML = `<h3>Your reply — show this to the host</h3><div class="qr">${qrSVG(r.text)}</div><div class="row"><button class="b" id="cp">Copy reply</button></div><p class="sub">Waiting for the host to connect…</p><div class="spin"></div>`; $('#cp').onclick = () => copy(r.text);
    const link = await r.opened; clientConnected(link, null); } catch (e) { toast(e.message, 'bad'); } };
  $('#mk').onclick = () => make($('#offer').value); $('#scan').onclick = async () => { const v = $('#scanv'); v.classList.add('on'); try { scanStop = await scanQR(v, txt => { $('#offer').value = txt; make(txt); }); } catch (e) { toast('Camera unavailable — paste the invite instead.', 'bad'); } };
}
function clientConnected(link, code) {
  lobby = { host: false, code, players: [], cfg: { diff: 'normal', mods: [], route: '' }, me: null, ready: false };
  net.onmsg = (_, m) => onClientMsg(m); net.ondrop = () => { if (game) { game.hud?.msg('Host disconnected.', 'warn', 6); setTimeout(() => { toast('The host left — match over.', 'bad'); title(); }, 2500); } else { toast('Lost connection to the host.', 'bad'); mpMenu(); } };
  net.send('host', { t: 'hello', name: S.name, v: VERSION });
}
function onClientMsg(m) {
  const L = lobby; if (!L) return;
  if (game && ['ev', 'snap'].includes(m.t)) return game.onNet('host', m);
  if (m.t === 'full') { toast(m.why, 'bad'); return mpMenu(); }
  if (m.t === 'welcome') { L.me = m.pid; L.slot = m.slot; renderClientLobby(); }
  if (m.t === 'lobby') { L.players = m.players; L.cfg = m.cfg; L.code = m.code; if (!game) renderClientLobby(); }
  if (m.t === 'start') { let resMatch; const matchPromise = new Promise(r => resMatch = r); L.resMatch = resMatch; runGame({ mode: 'client', myId: L.me, roster: m.roster, seed: m.seed, cfg: m.cfg, net, matchPromise }, { lobby: true, afterLoad: () => { net.send('host', { t: 'loaded' }); return new Promise(res => { L.go = res; }); } }); }
  if (m.t === 'match') L.resMatch?.(m.match);
  if (m.t === 'go') L.go?.();
}
function renderClientLobby() { const L = lobby; const me = L.players.find(p => p.id === L.me);
  screen(`${back('mp')}<div class="panelwrap wide">${logo(true)}<div class="lobby"><div class="card"><h2>Lobby ${L.code ? `<span class="rcode">${L.code}</span>` : '<span class="rcode off">OFFLINE</span>'}</h2>${slotsHTML(L.players)}<div class="row end"><button class="b pri big" id="rdy">${me?.ready ? 'Not ready' : "I'm ready"}</button></div></div>
    <div class="card"><h3>Host's settings</h3><p><b>${DIFF[L.cfg.diff]?.[0]}</b> — ${DIFF[L.cfg.diff]?.[1]}</p><p>${L.cfg.mods.length ? L.cfg.mods.map(k => `<span class="chip on">${MODIFIERS[k].name}</span>`).join(' ') : '<span class="sub">No modifiers</span>'}</p><p class="sub">Way out: ${L.cfg.route ? ROUTES[L.cfg.route].title : 'random'}</p></div></div></div>`, 'menu');
  wireNav(); $('#rdy').onclick = () => { L.ready = !me?.ready; net.send('host', { t: 'ready', v: L.ready }); }; }
// ───────── running a match ─────────
async function runGame(opts, extra = {}) {
  stopScan(); audio.init();
  screen(`<div class="loading"><div class="bootlog"><div>BODY CAM ${VERSION} — FIRMWARE OK</div><div>UNIT 4471 · SQUAD LINK ${opts.mode === 'solo' ? 'SOLO' : opts.roster.length + ' OFFICERS'}</div><div class="ld-step">Starting…</div></div><div class="ld-bar"><b></b></div><div class="ld-tip">${tips[Math.floor(Math.random() * tips.length)]}</div></div>`, 'loadingscr');
  const canvas = $('#view'); canvas.classList.add('on'); document.body.classList.add('ingame'); document.body.classList.toggle('lowq', S.quality === 'low');
  const g = game = new Game({ ...opts, canvas, ctrl, audio, settings: S, hudRoot: $('#hud'), onEnd: res => results(res, extra), onPause: v => v ? pauseMenu() : closePause() });
  try { await g.load((f, msg) => { const b = app.querySelector('.ld-bar b'); if (b) b.style.width = Math.round(f * 100) + '%'; const s = app.querySelector('.ld-step'); if (s) s.textContent = msg + '…'; }); }
  catch (e) { console.error(e); toast('Failed to load: ' + e.message, 'bad'); canvas.classList.remove('on'); document.body.classList.remove('ingame'); return title(); }
  window.__game = g;
  if (extra.afterLoad) { const s = app.querySelector('.ld-step'); if (s) s.textContent = 'Waiting for the other officers…'; await extra.afterLoad(g); }
  if (game !== g) return;
  app.className = 'screen hidden'; app.innerHTML = ''; g.start();
  if (!S.seenHelp) { S.seenHelp = true; save(); setTimeout(() => g.hud?.msg(matchMedia('(pointer: coarse)').matches ? 'Left thumb: move · Right thumb: look · ✋ USE: hold to interact' : 'WASD move · Mouse look (click) · E interact · F light · Tab belt · M map', 'info', 9), 2000); }
}
const tips = ['Your flashlight makes you visible from much further away. Sometimes the dark is safer.', 'Sprinting is loud. Crouching is almost silent.', 'Hold your beam on its face up close and it will flinch — once in a while.', 'If it sees you climb into a locker, it will check that locker.', 'Pull a shutter down behind you. A crowbar can pry one back up.', 'Restoring power helps — but the generator is loud, and so is everything after.', 'Cameras online? The mall map will show where it is.', 'Downed teammates bleed out. Revive them — a first aid kit makes it fast.', 'Rechargeable batteries refill themselves once the mall has power.', 'A lit flare is a lure. It cannot resist a light that will not move.', 'Not everything you hear in here is real.'];
function pauseMenu() {
  const p = document.createElement('div'); p.className = 'overlay pause'; p.id = 'pause'; const g = game;
  p.innerHTML = `<div class="card"><h2>${g?.solo ? 'Paused' : 'Menu'}</h2>${g?.solo ? '' : '<p class="sub">The mall keeps moving while you are in this menu.</p>'}<div class="mainmenu"><button class="b pri big" id="pr">Resume</button><button class="b" id="pm">Objectives & map</button><button class="b" id="ps">Settings</button><button class="b" id="ph">How to play</button><button class="b danger" id="pq">Quit to title</button></div></div>`;
  document.body.append(p); p.querySelectorAll('button').forEach(b => b.addEventListener('pointerdown', () => click()));
  p.querySelector('#pr').onclick = () => g.setPause(false); p.querySelector('#pm').onclick = () => { g.setPause(false); g.togglePanel('map'); };
  p.querySelector('#ps').onclick = () => { p.remove(); settingsScreen(() => pauseMenu(), true); }; p.querySelector('#ph').onclick = () => { p.remove(); helpScreen(() => pauseMenu(), true); };
  p.querySelector('#pq').onclick = () => { if (confirmQuit()) { closePause(); quitToTitle(); } };
}
const confirmQuit = () => !game || game.solo || window.confirm('Leave the match? Your teammates continue without you.');
function closePause() { document.querySelectorAll('.overlay').forEach(o => o.remove()); }
function quitToTitle() { closePause(); if (game) { game.stop(); game = null; } $('#view').classList.remove('on'); document.body.classList.remove('ingame'); title(); }
function results(res, extra) {
  const g = game; if (g) { g.stop(); game = null; } $('#view').classList.remove('on'); document.body.classList.remove('ingame'); closePause();
  screen(`<div class="results ${res.win ? 'win' : 'lose'}"><div class="rh">${res.win ? '<b>EXTRACTED</b>' : '<b class="glitch" data-t="SIGNAL LOST">SIGNAL LOST</b>'}<span>${esc(res.route)} · ${DIFF[res.difficulty][0]} · ${fmtTime(res.time)}</span></div>
    <div class="card"><div class="stats"><div><i>${res.req[0]}/${res.req[1]}</i><span>required objectives</span></div><div><i>${res.opt[0]}/${res.opt[1]}</i><span>optional</span></div><div><i>${fmtTime(res.time)}</i><span>time inside</span></div><div><i>${res.players.filter(p => p.st === 'escaped').length}/${res.players.length}</i><span>officers out</span></div></div>
      ${res.optList.length ? `<div class="opts">${res.optList.map(([t, d]) => `<span class="chip ${d ? 'ok' : ''}">${d ? '✔' : '✖'} ${esc(t)}</span>`).join('')}</div>` : ''}
      <table class="ptab"><tr><th>Officer</th><th>Status</th><th>Items</th><th>Walked</th><th>Spotted</th><th>Hits</th></tr>${res.players.map(p => `<tr style="--c:${SLOT_COLORS[p.slot]}"><td><i></i>${esc(p.name)}</td><td>${{ escaped: 'Extracted', dead: 'K.I.A.', left: 'Disconnected', down: 'Left behind' }[p.st] || 'Missing'}</td><td>${p.found}</td><td>${p.dist} m</td><td>${p.spotted}×</td><td>${p.hits}</td></tr>`).join('')}</table>
      ${res.modifiers.length ? `<p class="sub">Modifiers: ${res.modifiers.map(m => MODIFIERS[m].name).join(', ')}</p>` : ''}<p class="sub tiny">Mall seed ${res.seed}</p>
      <div class="row end">${extra.retry ? '<button class="b" id="rt">Retry same mall</button><button class="b pri" id="nw">New mall</button>' : ''}${extra.lobby && lobby?.host ? '<button class="b pri" id="lb">Back to lobby</button>' : ''}<button class="b" id="tt">Main menu</button></div></div></div>`, 'menu');
  $('#tt').onclick = () => title(); $('#rt') && ($('#rt').onclick = extra.retry); $('#nw') && ($('#nw').onclick = extra.fresh);
  $('#lb') && ($('#lb').onclick = () => { lobby.players.forEach(p => p.ready = p.id === 'h'); net.broadcast({ t: 'lobby', players: lobby.players.map(p => ({ id: p.id, name: p.name, slot: p.slot, ready: p.ready })), cfg: lobby.cfg, code: lobby.code }); renderLobby(); });
  if (!extra.lobby) return; if (!lobby?.host && net) { setTimeout(() => { if (!game && lobby) { /* client returns to lobby view when host resets */ } }, 0); }
}
// ───────── settings / help / credits ─────────
function settingsScreen(done, overlay) {
  const row = (k, label, min, max, step, fmt = v => v) => `<label class="srow"><span>${label}</span><input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${S[k]}"><em>${fmt(S[k])}</em></label>`;
  const tog = (k, label, sub = '') => `<label class="srow tog"><span>${label}${sub ? `<small>${sub}</small>` : ''}</span><input type="checkbox" data-k="${k}" ${S[k] ? 'checked' : ''}><i></i></label>`;
  const html = `<div class="card settings"><h2>Settings</h2><div class="sgrid">
    <section><h3>Graphics</h3><label class="srow"><span>Quality<small>applies to the next match</small></span><select data-k="quality"><option value="low">Low — older iPads</option><option value="medium">Medium</option><option value="high">High — shadows</option></select></label>${row('vhs', 'Bodycam / VHS filter', 0, 1.5, 0.05, v => Math.round(v * 100) + '%')}${row('fov', 'Field of view', 65, 95, 1, v => v + '°')}${tog('bob', 'Head bob')}${tog('showFps', 'Show FPS')}</section>
    <section><h3>Controls</h3>${row('sens', 'Touch look sensitivity', 0.3, 2.5, 0.05, v => (+v).toFixed(2))}${row('mouseSens', 'Mouse sensitivity', 0.3, 2.5, 0.05, v => (+v).toFixed(2))}${row('joySize', 'Joystick size', 0.7, 1.5, 0.05, v => Math.round(v * 100) + '%')}${row('btnSize', 'Button size', 0.8, 1.4, 0.05, v => Math.round(v * 100) + '%')}${tog('invertY', 'Invert look Y')}${tog('sprintToggle', 'Sprint button toggles')}${tog('edgeSprint', 'Sprint when joystick is at the edge')}${tog('leftHanded', 'Left-handed layout', 'swap move / look sides')}${tog('crouchHold', 'Hold Ctrl/C to crouch')}</section>
    <section><h3>Audio</h3>${row('vol', 'Master', 0, 1, 0.05, v => Math.round(v * 100) + '%')}${row('sfx', 'Effects', 0, 1, 0.05, v => Math.round(v * 100) + '%')}${row('music', 'Music', 0, 1, 0.05, v => Math.round(v * 100) + '%')}${row('amb', 'Ambience', 0, 1, 0.05, v => Math.round(v * 100) + '%')}</section>
    <section><h3>Comfort</h3>${tog('reduced', 'Reduced-intensity jumpscares', 'shorter, quieter, no camera whip, fewer false alarms')}<h3>Network</h3><p class="sub tiny">Optional TURN relay for restrictive networks (you must run or rent one).</p><label class="srow txt"><span>TURN URL</span><input data-k="turnUrl" placeholder="turn:host:3478" value="${esc(S.turnUrl)}"></label><label class="srow txt"><span>Username</span><input data-k="turnUser" value="${esc(S.turnUser)}"></label><label class="srow txt"><span>Password</span><input data-k="turnPass" type="password" value="${esc(S.turnPass)}"></label></section>
    </div><div class="row end"><button class="b pri big" id="sd">Done</button></div></div>`;
  let root; if (overlay) { root = document.createElement('div'); root.className = 'overlay'; root.innerHTML = html; document.body.append(root); } else { screen(`<div class="panelwrap wide">${html}</div>`, 'menu'); root = app; }
  root.querySelector('[data-k=quality]').value = S.quality;
  root.querySelectorAll('[data-k]').forEach(el => el.addEventListener('input', () => { const k = el.dataset.k; S[k] = el.type === 'checkbox' ? el.checked : el.type === 'range' ? +el.value : el.value; const em = el.parentElement.querySelector('em'); if (em) em.textContent = el.type === 'range' ? (k === 'fov' ? el.value + '°' : ['sens', 'mouseSens'].includes(k) ? (+el.value).toFixed(2) : Math.round(el.value * 100) + '%') : '';
    save(); audio.applyVolume(); ctrl.applySettings(); if (game) { game.E.fx.vhs = S.vhs; } }));
  root.querySelector('#sd').onclick = () => { if (overlay) root.remove(); done(); };
}
function helpScreen(done, overlay) {
  const html = `<div class="card help"><h2>How to play</h2><div class="hgrid">
    <section><h3>The job</h3><p>You and up to three other officers are trapped inside Hollowbrook Galleria with <b>the Tenant</b> — a thing that wears what's left of a night guard's vest and talks through the mall's PA horns. Complete the objectives (top right), then get out the way Dispatch tells you.</p>
      <h3>Staying alive</h3><ul><li><b>Light</b> lets you see — and lets it see <i>you</i>, from far away. Batteries drain.</li><li><b>Noise</b>: sprinting, doors, shutters, dropped items, machinery. Crouch-walk to stay quiet.</li><li><b>Hide</b> in lockers and toilet stalls — unless it watched you get in.</li><li>Two hits and you're down. Teammates can revive you. Solo, a first aid kit lets you get back up once.</li><li>Its attacks are fair: it has to reach you and see you. You'll hear it first — static on your bodycam means it is close.</li></ul></section>
    <section><h3>iPad</h3><ul><li>Left thumb anywhere on the left: move</li><li>Right side: drag to look</li><li>✋ USE: tap / hold to interact</li><li>» RUN (hold), ▾ CROUCH (toggle), ◐ LIGHT</li><li>Top: ▤ belt, ⌖ map & objectives, ◎ ping, ❚❚ menu</li></ul>
      <h3>Keyboard & mouse</h3><ul><li>WASD move · mouse look (click the view)</li><li>Shift sprint · Ctrl / C crouch · E interact (hold)</li><li>F flashlight · R load battery · H heal</li><li>Tab belt · M map & objectives · Q ping · 1–6 use slot · G drop · Esc menu</li></ul></section></div><div class="row end"><button class="b pri big" id="hd">Got it</button></div></div>`;
  let root; if (overlay) { root = document.createElement('div'); root.className = 'overlay'; root.innerHTML = html; document.body.append(root); } else { screen(`${back()}<div class="panelwrap wide">${html}</div>`, 'menu'); root = app; wireNav(); }
  root.querySelector('#hd').onclick = () => { if (overlay) root.remove(); done(); };
}
function credits() { screen(`${back()}<div class="panelwrap">${logo(true)}<div class="card"><h2>Credits</h2><p>An original survival-horror game. Every model, texture and sound is generated in code at runtime — no external art or audio files.</p>
  <h3>Open-source libraries (bundled locally)</h3><ul><li>three.js — MIT</li><li>PeerJS — MIT</li><li>qrcode-generator (Kazuhiko Arase) — MIT</li><li>jsQR — Apache-2.0</li><li>Fonts: VT323, Oswald, Inter — SIL Open Font License</li></ul><p class="sub">Full texts in LICENSES.txt.</p></div></div>`, 'menu'); wireNav(); }

// ───────── heartbeat: a peer that goes quiet (closed tab, sleeping iPad, lost Wi-Fi) is dropped ─────────
setInterval(() => { if (!net) return; const now = performance.now(); for (const [id, l] of net.links) { if (game && now - l.lastRx > (net.host ? 9000 : 12000)) { l.close(); } else if (!game && l.open) l.send({ t: 'hb' }); } }, 1500);
// ───────── boot ─────────
window.addEventListener('contextmenu', e => { if (document.body.classList.contains('ingame')) e.preventDefault(); });
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('visibilitychange', () => { if (document.hidden && game && !game.paused && !game.ended) game.setPause(true); });
title();
window.__app = { S, get game() { return game; }, get net() { return net; }, get lobby() { return lobby; }, startSolo, hostLobby, joinByCode, joinManual, makeInvite, acceptAnswer, hostStart };
