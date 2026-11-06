// Bodycam HUD (REC, timestamp, unit), objective tracker, battery/stamina, hotbar, teammates, prompts, radio messages,
// motion-detector radar, plus the inventory and map/objectives panels.
import { ITEMS, SLOT_CAP } from './items.js';
import { LEVELS } from './mallplan.js';
import { SLOT_COLORS } from './scene.js';

export const ICON = { batt: '🔋', cell: '⚡', key: '🔑', carkey: '🚙', card: '💳', fuse: '🔌', gear: '⚙️', device: '📟', band: '🩹', med: '⛑️', pill: '💊', radio: '📻', map: '🗺️', tool: '🪛', bar: '🔨', cut: '✂️', pick: '🗝️', radar: '📡', flare: '🧨', doc: '📁', box: '🧰', cam: '📹' };
export const icon = id => ICON[ITEMS[id]?.icon] || '▫️';
const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ST_LABEL = { ok: 'OK', injured: 'INJURED', down: 'DOWN', dead: 'K.I.A.', escaped: 'OUT', left: 'OFFLINE' };

export class HUD {
  constructor(root, g) {
    this.g = g; this.root = root; root.innerHTML = ''; root.className = 'hud';
    root.append(this.osd = h('div', 'osd', `<div class="rec"><b></b>REC</div><div class="osdl"><span class="ts"></span><span class="unit"></span></div>`));
    root.append(this.obj = h('div', 'objt'), this.team = h('div', 'team'), this.msgs = h('div', 'msgs'), this.cross = h('div', 'cross'), this.prm = h('div', 'prompt'));
    root.append(this.stat = h('div', 'stat', `<div class="hp"><i></i><span></span></div><div class="batt"><i class="bi">🔦</i><div class="bar"><b></b></div><span class="bp"></span></div><div class="stam"><b></b></div>`));
    root.append(this.bar = h('div', 'hotbar')); root.append(this.radar = h('canvas', 'radar')); this.radar.width = this.radar.height = 180;
    root.append(this.fx = h('div', 'hfx'), this.hideFx = h('div', 'hidefx'), this.downFx = h('div', 'downfx', '<div class="dt"></div><div class="ds"></div>'));
    this.fpsEl = h('div', 'fps'); root.append(this.fpsEl);
    this.slots = []; for (let i = 0; i < SLOT_CAP; i++) { const s = h('button', 'slot', `<i></i><b></b><u>${i + 1}</u>`); s.onclick = () => g.useSlot(i); this.bar.append(s); this.slots.push(s); }
    this.keyring = h('button', 'slot keyr', '<i>🔑</i><b></b>'); this.keyring.onclick = () => g.togglePanel('inv'); this.bar.append(this.keyring);
    this.t = 0; this.last = {};
  }
  msg(text, kind = 'radio', dur = 5) { const m = h('div', 'msg ' + kind, esc(text)); this.msgs.prepend(m); setTimeout(() => m.classList.add('out'), dur * 1000); setTimeout(() => m.remove(), dur * 1000 + 600); while (this.msgs.children.length > 4) this.msgs.lastChild.remove(); }
  prompt(text, hold, sub) { const k = (text || '') + '|' + (sub || ''); if (k !== this.last.prompt) { this.last.prompt = k; this.prm.innerHTML = text ? `<div class="pt">${esc(text)}</div>${sub ? `<div class="ps">${esc(sub)}</div>` : ''}` : ''; this.prm.classList.toggle('on', !!text); }
    this.prm.style.setProperty('--hold', String(hold || 0)); this.prm.classList.toggle('holding', hold > 0); this.cross.classList.toggle('hot', !!text); }
  update(dt) {
    const g = this.g, me = g.me; this.t -= dt; if (!me) return;
    // fast bits every frame
    const b = Math.round(me.batt); this.stat.querySelector('.batt b').style.width = me.batt + '%'; this.stat.classList.toggle('lowb', me.batt < 22); this.stat.querySelector('.batt').classList.toggle('off', !me.fl);
    this.stat.querySelector('.stam b').style.width = (me.stamina * 100) + '%'; this.stat.querySelector('.stam').classList.toggle('show', me.stamina < 0.98); this.stat.querySelector('.stam').classList.toggle('ex', me.exhausted);
    this.hideFx.className = 'hidefx' + (me.hidden != null ? ' on ' + (g.hideKind || '') : '');
    const dn = me.st === 'down'; this.downFx.classList.toggle('on', dn); if (dn) { this.downFx.querySelector('.dt').textContent = g.solo ? 'YOU ARE DOWN' : 'YOU ARE DOWN — HOLD ON'; this.downFx.querySelector('.ds').textContent = g.solo ? (g.canSelfRevive() ? `Hold USE to patch yourself up · ${Math.ceil(me.downT)}s` : `No medical supplies… ${Math.ceil(me.downT)}s`) : `Bleeding out ${Math.ceil(me.downT)}s · a teammate can revive you`; }
    if (this.t > 0) return; this.t = 0.12;
    const clock = new Date(Date.UTC(2026, 10, 5, 2, 13, 7) + g.time * 1000); this.osd.querySelector('.ts').textContent = clock.toISOString().replace('T', ' ').slice(0, 19) + ' -0500';
    this.osd.querySelector('.unit').textContent = `BODY CAM ${me.slot + 1} · OFC. ${me.name.toUpperCase()} · UNIT 4471-${String.fromCharCode(65 + me.slot)}`;
    this.stat.querySelector('.bp').textContent = b + '%';
    const hp = this.stat.querySelector('.hp'); hp.className = 'hp ' + me.st; hp.querySelector('span').textContent = me.st === 'ok' ? (me.health < 100 ? `HEALTH ${Math.round(me.health)}` : 'HEALTHY') : me.st === 'injured' ? `INJURED ${Math.round(me.health)}` + (me.pk > 0 ? ' · 💊' : '') : ST_LABEL[me.st];
    // objectives (compact)
    const view = g.objView().filter(o => o.active && !o.done).slice(0, 3); const key = JSON.stringify(view.map(o => [o.title, o.step, o.prog]));
    if (key !== this.last.obj) { this.last.obj = key; this.obj.innerHTML = view.map(o => `<div class="oi${o.optional ? ' opt' : ''}${o.escape ? ' esc' : ''}"><b>${esc(o.title)}</b><span>${esc(o.step)}${o.prog ? ` <em>${o.prog}</em>` : ''}</span></div>`).join('') || '<div class="oi"><b>All objectives complete</b></div>'; this.obj.classList.remove('pop'); void this.obj.offsetWidth; this.obj.classList.add('pop'); }
    // hotbar
    for (let i = 0; i < SLOT_CAP; i++) { const e = me.inv[i], s = this.slots[i]; const k = e ? e.id + e.n + (e.rd > 0) : ''; if (s.dataset.k !== k) { s.dataset.k = k; s.querySelector('i').textContent = e ? icon(e.id) : ''; s.querySelector('b').textContent = e && e.n > 1 ? e.n : ''; s.classList.toggle('full', !!e); s.classList.toggle('cool', !!e && e.rd > 0); s.title = e ? ITEMS[e.id].name : 'Empty'; } }
    this.keyring.querySelector('b').textContent = me.keys.length || ''; this.keyring.classList.toggle('full', me.keys.length > 0);
    // team
    const others = [...g.players.values()].filter(p => p.id !== me.id);
    const tk = JSON.stringify(others.map(p => [p.name, p.st, Math.round(p.health), Math.round(p.batt ?? 0), g.hasRadio() ? Math.round(Math.hypot(p.x - me.x, p.z - me.z)) : -1, p.lv, Math.ceil(p.downT || 0)]));
    if (tk !== this.last.team) { this.last.team = tk; this.team.innerHTML = others.map(p => `<div class="tm ${p.st}" style="--c:${SLOT_COLORS[p.slot % 4]}"><i></i><b>${esc(p.name)}</b><span>${ST_LABEL[p.st] || ''}${p.st === 'down' ? ' ' + Math.ceil(p.downT) + 's' : ''}${g.hasRadio() && p.st !== 'dead' && p.st !== 'escaped' ? ` · ${Math.round(Math.hypot(p.x - me.x, p.z - me.z))}m ${p.lv !== me.lv ? LEVELS[p.lv]?.name.split(' ')[0] : ''}` : ''}</span><u style="width:${p.batt ?? 0}%"></u></div>`).join(''); }
    if (g.settings.showFps) this.fpsEl.textContent = `${g.fps|0} fps · ${g.E.renderer.info.render.calls} calls`; else this.fpsEl.textContent = '';
    this.radar.classList.toggle('on', !!g.motionOn); if (g.motionOn) this.drawRadar();
  }
  drawRadar() { const g = this.g, c = this.radar.getContext('2d'), me = g.me, R = 90; c.clearRect(0, 0, 180, 180); c.fillStyle = 'rgba(0,20,8,.6)'; c.beginPath(); c.arc(R, R, R - 2, 0, 7); c.fill(); c.strokeStyle = 'rgba(80,255,140,.35)'; for (const r of [30, 60, 88]) { c.beginPath(); c.arc(R, R, r, 0, 7); c.stroke(); }
    const sweep = (performance.now() / 600) % (Math.PI * 2); c.strokeStyle = 'rgba(80,255,140,.6)'; c.beginPath(); c.moveTo(R, R); c.lineTo(R + Math.cos(sweep) * 88, R + Math.sin(sweep) * 88); c.stroke();
    const blip = (x, z, col, sz) => { const dx = x - me.x, dz = z - me.z; const cs = Math.cos(me.yaw), sn = Math.sin(me.yaw); const rx = dx * cs - dz * sn, rz = dx * sn + dz * cs; const k = 88 / 25; const px = R + rx * k, pz = R + rz * k; if (Math.hypot(px - R, pz - R) > 88) return; c.fillStyle = col; c.beginPath(); c.arc(px, pz, sz, 0, 7); c.fill(); };
    if (g.mon && g.mon.sp > 0.2 && Math.abs(g.mon.y - me.y) < 4) blip(g.mon.x, g.mon.z, 'rgba(255,60,40,.95)', 6);
    for (const p of g.players.values()) if (p !== me && Math.hypot(p.vx || 0, p.vz || 0) > 0.3) blip(p.x, p.z, 'rgba(120,255,160,.9)', 4);
    c.fillStyle = '#9fffb8'; c.font = '600 12px Oswald'; c.fillText(`MOTION ${Math.round(g.motionCharge)}%`, R - 34, 172); }
  // ── panels ──
  panel(kind) { this.closePanel(); const g = this.g; const p = h('div', 'panel ' + kind); p.onclick = e => { if (e.target === p) g.togglePanel(null); }; this.root.append(p); this.open = p; this.kind = kind; if (kind === 'inv') this.renderInv(); else this.renderMap(); return p; }
  closePanel() { this.open?.remove(); this.open = null; this.kind = null; }
  renderInv(sel) {
    const g = this.g, me = g.me, p = this.open; if (!p) return; const all = [...me.inv.map((e, i) => ({ id: e.id, n: e.n, i, rd: e.rd })), ...me.keys.map((id, j) => ({ id, n: 1, key: true, j }))];
    sel = sel ?? this.sel ?? (all[0] && 0); this.sel = sel; const cur = all[sel]; const d = cur && ITEMS[cur.id]; const near = g.nearTeammates();
    p.innerHTML = `<div class="card inv"><div class="ph"><h2>Duty Belt</h2><span>${me.inv.length}/${SLOT_CAP} slots · keyring ${me.keys.length}</span><button class="x">✕</button></div>
      <div class="grid">${Array.from({ length: SLOT_CAP }, (_, i) => { const e = me.inv[i]; const ai = all.findIndex(a => a.i === i && !a.key); return `<button class="cell${e ? '' : ' empty'}${ai === sel && e ? ' sel' : ''}" data-s="${ai}">${e ? `<i>${icon(e.id)}</i><b>${e.n > 1 ? '×' + e.n : ''}</b><span>${esc(ITEMS[e.id].name)}</span>` : '<span>empty</span>'}</button>`; }).join('')}</div>
      <h3>Keyring & evidence</h3><div class="keys">${me.keys.length ? me.keys.map((id, j) => { const ai = all.findIndex(a => a.key && a.j === j); return `<button class="kc${ai === sel ? ' sel' : ''}" data-s="${ai}" style="${ITEMS[id].color ? `--kc:${ITEMS[id].color}` : ''}">${icon(id)} ${esc(ITEMS[id].name)}</button>`; }).join('') : '<em>Nothing yet.</em>'}</div>
      ${cur ? `<div class="detail"><div class="big">${icon(cur.id)}</div><div><h4>${esc(d.name)}</h4><p>${esc(d.desc)}</p>${cur.id === 'code_note' ? `<p class="code">The note reads: <b>${g.match.code}</b></p>` : ''}${cur.rd > 0 ? `<p class="warn">Recharging… ${g.S.power ? Math.ceil(cur.rd) + 's' : 'needs mall power'}</p>` : ''}
        <div class="acts">${g.usable(cur.id) ? `<button class="b pri" data-a="use">${d.cat === 'battery' ? 'Load into flashlight' : d.cat === 'med' ? (g.downTeammateNear() ? 'Treat teammate' : 'Use') : cur.id === 'motion' ? (g.motionOn ? 'Switch off' : 'Switch on') : cur.id === 'flare' ? 'Light & drop' : cur.id === 'map' ? 'Open map' : 'Use'}</button>` : ''}
        ${!cur.key || cur.id === 'container' || ['documents', 'bodycam', 'card_red', 'card_blue', 'card_green', 'fuse', 'gen_part', 'keycard'].includes(cur.id) || ITEMS[cur.id].cat === 'key' ? `<button class="b" data-a="drop">Drop</button>` : ''}
        ${near.map(t => `<button class="b" data-a="give" data-to="${t.id}">Give to ${esc(t.name)}</button>`).join('')}</div></div></div>` : ''}</div>`;
    p.querySelector('.x').onclick = () => g.togglePanel(null);
    p.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { const s = +b.dataset.s; if (s >= 0) { g.audio.play('ui', null, { f: 520 }); this.renderInv(s); } });
    p.querySelectorAll('[data-a]').forEach(b => b.onclick = () => { if (!cur) return; const a = b.dataset.a; if (a === 'use') g.useItem(cur.id); if (a === 'drop') g.dropItem(cur.id); if (a === 'give') g.giveItem(cur.id, b.dataset.to); this.sel = Math.max(0, Math.min(sel, all.length - 2)); setTimeout(() => this.renderInv(), 120); });
  }
  renderMap(lv) {
    const g = this.g, me = g.me, p = this.open; if (!p) return; lv = lv || this.mapLv || me.lv; this.mapLv = lv; const hasMap = g.hasItem('map');
    const objs = g.objView();
    p.innerHTML = `<div class="card map"><div class="ph"><h2>${hasMap ? 'Mall Directory' : 'Objectives'}</h2><span>Hollowbrook Galleria · ${g.routeTitle()}</span><button class="x">✕</button></div>
      <div class="mapwrap">${hasMap ? `<div class="lvtabs">${['U', 'G', 'B', 'R'].map(l => `<button class="${l === lv ? 'on' : ''}" data-l="${l}">${LEVELS[l].name}</button>`).join('')}</div><canvas width="960" height="640"></canvas><div class="legend"><span><i class="me"></i>You</span><span><i class="tmt"></i>Team</span><span><i class="ob"></i>Objective</span><span><i class="lk"></i>Locked</span>${g.S.cameras ? '<span><i class="mo"></i>IT (cameras)</span>' : ''}</div>` : `<div class="nomap">📍 You don't have a map. Mall directories stand in the concourses — find a <b>Mall Map</b> to see the floor plan.</div>`}</div>
      <div class="olist">${objs.map(o => `<div class="ob ${o.done ? 'done' : o.active ? 'act' : 'wait'}${o.optional ? ' opt' : ''}"><b>${o.done ? '✔' : o.active ? '▶' : '…'} ${esc(o.title)}${o.optional ? ' <em>optional</em>' : ''}</b><span>${o.done ? 'Done' : o.active ? esc(o.step) + (o.prog ? ' — ' + o.prog : '') : 'Requires: ' + esc(o.waiting)}</span><small>${esc(o.hint || '')}</small></div>`).join('')}</div></div>`;
    p.querySelector('.x').onclick = () => g.togglePanel(null); p.querySelectorAll('[data-l]').forEach(b => b.onclick = () => this.renderMap(b.dataset.l));
    const cv = p.querySelector('canvas'); if (cv) this.drawMap(cv, lv);
  }
  drawMap(cv, lv) {
    const g = this.g, P = g.P, c = cv.getContext('2d'); const sx = cv.width / 124, ox = 2, oz = 2; const X = x => (x + 60 + ox) * sx, Z = z => (z + 40 + oz) * sx * 1.0;
    c.fillStyle = '#0b0d10'; c.fillRect(0, 0, cv.width, cv.height);
    const col = { hall: '#2a3038', shop: '#232a33', service: '#1e2226', maint: '#1e2226', stair: '#3a3a2a', elev: '#3a3a2a', void: '#08090b', outside: '#141c14', parking: '#202428', food: '#2d2a24', cinema: '#2a2230' };
    for (const rm of P.rooms) { if (!(rm.lv || '').includes(lv)) continue; const [x0, z0, x1, z1] = rm.r; c.fillStyle = col[rm.type] || '#252b33'; c.fillRect(X(x0), Z(z0), (x1 - x0) * sx, (z1 - z0) * sx);
      if ((x1 - x0) * sx > 60 && rm.type !== 'void') { c.fillStyle = 'rgba(200,210,220,.5)'; c.font = `${Math.min(14, (x1 - x0) * sx / 8)}px Oswald`; c.textAlign = 'center'; c.fillText(rm.name.toUpperCase(), X((x0 + x1) / 2), Z((z0 + z1) / 2) + 4); } }
    c.strokeStyle = '#7b8794'; c.lineWidth = 1.6; c.beginPath(); for (const w of P.walls) { if (w.lv !== lv || w.kind === 'broken') continue; c.moveTo(X(w.x0), Z(w.z0)); c.lineTo(X(w.x1), Z(w.z1)); } c.stroke();
    for (const d of P.doors) { if (d.lv !== lv) continue; const [a, b, cc, e] = d.seg; c.strokeStyle = d.locked ? '#e04848' : d.open ? '#4a9a5a' : '#c8b060'; c.lineWidth = 3; c.beginPath(); c.moveTo(X(a), Z(b)); c.lineTo(X(cc), Z(e)); c.stroke(); }
    // objective markers
    const t = performance.now() / 400; for (const m of g.objMarkers()) { if (m.lv !== lv) continue; c.strokeStyle = '#ffd24a'; c.lineWidth = 2; c.beginPath(); c.arc(X(m.x), Z(m.z), 7 + Math.sin(t) * 2, 0, 7); c.stroke(); c.fillStyle = '#ffd24a'; c.font = '600 12px Oswald'; c.textAlign = 'left'; c.fillText(m.label, X(m.x) + 10, Z(m.z) + 4); }
    for (const pg of g.pings) { if (pg.lv !== lv) continue; c.strokeStyle = SLOT_COLORS[pg.slot % 4]; c.lineWidth = 2; c.beginPath(); c.arc(X(pg.x), Z(pg.z), 10, 0, 7); c.stroke(); }
    for (const p of g.players.values()) { if (p.lv !== lv || p.st === 'escaped' || p.st === 'left') continue; const me = p === g.me; c.save(); c.translate(X(p.x), Z(p.z)); c.rotate(-p.yaw); c.fillStyle = SLOT_COLORS[p.slot % 4]; c.beginPath(); if (me) { c.moveTo(0, -11); c.lineTo(7, 7); c.lineTo(-7, 7); } else c.arc(0, 0, 6, 0, 7); c.fill(); c.restore(); }
    if (g.S.cameras && g.mon && g.mon.lv === lv && Math.sin(t * 2) > -0.3) { c.fillStyle = '#ff2a2a'; c.beginPath(); c.arc(X(g.mon.x), Z(g.mon.z), 8, 0, 7); c.fill(); c.fillStyle = '#fff'; c.font = '700 11px Oswald'; c.fillText('IT', X(g.mon.x) - 6, Z(g.mon.z) + 4); }
  }
}
