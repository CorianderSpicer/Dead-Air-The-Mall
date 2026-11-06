// Match orchestration. The host (or the solo player) owns the authoritative world: monster AI, items, doors,
// shutters, objectives, health and the elevator. Every change to shared state is an idempotent event applied by
// applyEv() on every peer; clients predict their own movement and stream it to the host.
import * as THREE from './three.module.js';
import { buildPlan, LEVELS } from './mallplan.js';
import { buildMall } from './mall3d.js';
import { createEngine } from './engine.js';
import { generateMatch, ROUTES, MODIFIERS, lockOpenedBy, lockNeeds, START } from './objectives.js';
import { MonsterAI } from './monster.js';
import { buildMonster, animateMonster } from './monstermodel.js';
import { ITEMS } from './items.js';
import { newPlayer, stepPlayer, updateFlashlight, addItem, removeItem, hasItem, countItem, allItems, canTake, canAct, PDEF } from './player.js';
import { itemMesh, officerMesh, animateOfficer, interMesh, flareMesh, cartMesh, phantomFrom, SLOT_COLORS } from './scene.js';
import { HUD, icon } from './hud.js';
import { rng, clamp, angDiff } from './util.js';

const DMG = { normal: 50, hard: 60, nightmare: 75 };
const BLEED = { normal: 60, hard: 45, nightmare: 30 };
const SPAWN = [[0, 27.5], [1.6, 28], [-1.6, 28], [0, 29.2]];
const yieldUI = () => new Promise(r => setTimeout(r, 16));
const clone = p => ({ inv: p.inv.map(e => ({ ...e })), keys: [...p.keys] });
const MEDS = { bandage: 25, firstaid: 60, medsupply: 100 };
const o_match = g => g.match ? Promise.resolve(g.match) : g.matchPromise;

export class Game {
  constructor(o) {
    Object.assign(this, { canvas: o.canvas, ctrl: o.ctrl, audio: o.audio, settings: o.settings, net: o.net, mode: o.mode, myId: o.myId, roster: o.roster, seed: o.seed, cfg: o.cfg, match: o.match || null, matchPromise: o.matchPromise, onEnd: o.onEnd, onPause: o.onPause, hudRoot: o.hudRoot });
    this.host = this.mode !== 'client'; this.solo = this.mode === 'solo' || this.roster.length === 1;
    this.players = new Map(); this.items = new Map(); this.S = { power: false, cameras: false, comms: false, elev: false, heli: 0, waitT: 0 }; this.collected = {};
    this.time = 0; this.noises = []; this.outEvs = []; this.pings = []; this.flares = []; this.fps = 60; this.paused = false; this.running = false; this.panel = null;
    this.mon = { x: 0, y: 0, z: 0, yaw: 0, st: 'roam', an: 'walk', sp: 0, lv: 'B', tg: null }; this.monT = null; this.fx = { glitch: 0, staticAmt: 0, damage: 0 };
    this.hold = null; this.target = null; this.netT = 0; this.motionOn = false; this.motionCharge = 100; this.nextItemId = 10000; this.stats = { start: 0 };
  }
  // ───────────────────────── loading ─────────────────────────
  async load(progress = () => { }) {
    const q = this.settings.quality; progress(0.05, 'Pulling floor plans'); await yieldUI();
    const P = this.P = buildPlan(this.seed); progress(0.18, 'Warming up the bodycam'); await yieldUI();
    const E = this.E = createEngine(this.canvas, q); E.camera.fov = this.settings.fov || 78; E.camera.updateProjectionMatrix(); E.fx.vhs = this.settings.vhs ?? 1;
    progress(0.3, 'Walking the concourse'); await yieldUI();
    const W = this.W = buildMall(P, E.scene, q, this.seed); progress(0.62, 'Mapping every corridor'); await yieldUI();
    P.finalizeNav(); E.attachWorld(W); progress(0.75, 'Listening for movement'); await yieldUI();
    if (!this.host) { progress(0.76, 'Waiting for the host'); this.match = await o_match(this); }
    if (this.host) this.match = generateMatch(this.seed, P, W.spots, { players: this.roster.length, difficulty: this.cfg.difficulty, modifiers: this.cfg.modifiers, route: this.cfg.route || null });
    const M = this.match; this.mods = M.modifiers || []; this.diff = M.difficulty;
    if (this.mods.includes('heavy_fog')) E.scene.fog.density *= 1.9; if (this.mods.includes('unstable_power')) { const r = rng(this.seed ^ 77); for (const l of W.lamps) if (r() < 0.35) l.flick = Math.max(l.flick || 0, 0.3 + r() * 0.6); }
    for (const it of M.items) this.spawnItem(it);
    this.interMeshes = new Map(); for (const it of M.inter) { const m = interMesh(it.type); m.position.set(it.x, it.y, it.z); const rm = P.room(it.room); if (rm) { const [x0, z0, x1, z1] = rm.r; m.rotation.y = Math.atan2((x0 + x1) / 2 - it.x, (z0 + z1) / 2 - it.z); } (W.groups[it.lv] || E.scene).add(m); this.interMeshes.set(it.id, m);
      const f = m.userData.foot; if (f) { const r = Math.max(f[0], f[1]) / 2; P.addCollider({ x0: it.x - r, x1: it.x + r, z0: it.z - r, z1: it.z + r, y0: it.y, y1: it.y + 1.6, tag: 'prop' }); } }
    progress(0.85, 'Checking radios'); await yieldUI();
    const free = (x, z) => { for (let rad = 0; rad < 4; rad += 0.4) for (let a = 0; a < 6.28; a += rad ? 0.5 / rad : 7) { const px = x + Math.cos(a) * rad, pz = z + Math.sin(a) * rad; const [cx, cz] = P.collide(px, pz, PDEF.r + 0.1, 0, PDEF.hStand); const g = P.groundAt(px, pz, 0.3, 0.6); if (g && Math.abs(g.y) < 0.05 && Math.hypot(cx - px, cz - pz) < 0.01) return [px, pz]; } return [x, z]; };
    this.roster.forEach((r, i) => { const [x, z] = free(...SPAWN[i % 4]); const p = newPlayer(r.id, r.name, { x, y: 0, z, lv: 'G' }, r.slot ?? i); this.players.set(r.id, p); if (r.id !== this.myId) { p.view = officerMesh(r.name, p.slot, q !== 'low'); E.scene.add(p.view.root); } });
    this.me = this.players.get(this.myId);
    this.model = buildMonster(q); E.scene.add(this.model.root); this.model.root.position.set(M.monster.x, M.monster.y, M.monster.z); Object.assign(this.mon, M.monster);
    if (this.host) this.AI = new MonsterAI(P, M.monster, { seed: this.seed, difficulty: this.diff, players: this.roster.length, modifiers: this.mods });
    this.phantom = phantomFrom(buildMonster); this.phantom.root.visible = false; E.scene.add(this.phantom.root);
    // flashlight (a spot that lags behind the view a little, like a hand-held torch)
    const lowV = this.mods.includes('low_visibility'); this.flash = new THREE.SpotLight(0xfff1dc, lowV ? 105 : 160, lowV ? 22 : 34, lowV ? 0.4 : 0.55, 0.55, 1.6); this.flashBase = this.flash.intensity;
    if (q === 'high') { this.flash.castShadow = true; this.flash.shadow.mapSize.set(1024, 1024); this.flash.shadow.camera.near = 0.2; this.flash.shadow.bias = -0.0008; }
    E.scene.add(this.flash, this.flash.target); this.fill = new THREE.PointLight(0xa0b0c0, 0.5, 5, 2); E.scene.add(this.fill); this.aimDir = new THREE.Vector3(0, 0, -1);
    this.pingMat = new THREE.SpriteMaterial({ color: 0xffd24a, depthTest: false, transparent: true });
    this.hud = new HUD(this.hudRoot, this); this.ray = new THREE.Raycaster();
    this.scareDir = (60 + Math.random() * 40) * (this.settings.reduced ? 1.7 : 1); this.prevElevMoving = false; this.monStepAcc = 0; this.garbleT = 12;
    if (this.mods.includes('limited_batteries')) for (const p of this.players.values()) p.batt = 75;
    progress(1, 'REC'); await yieldUI();
  }
  // ───────────────────────── lifecycle ─────────────────────────
  start() { this.running = true; this.ctrl.setEnabled(true); this.ctrl.onUnlock = () => { if (this.running && !this.ended) this.setPause(true); }; this.last = performance.now(); this.stats.start = Date.now(); this.loop = t => { if (!this.running) return; this.raf = requestAnimationFrame(this.loop); this.frame(t); }; this.raf = requestAnimationFrame(this.loop);
    this.audio.init(); this.briefing(); }
  stop() { this.running = false; cancelAnimationFrame(this.raf); this.ctrl.setEnabled(false); this.audio.stopAll(); try { speechSynthesis?.cancel(); } catch (e) { } this.hud?.closePanel(); this.hudRoot.innerHTML = ''; this.E?.dispose(); }
  setPause(v) { if (this.ended) return; this.paused = v; this.ctrl.setEnabled(!v); if (this.audio.ctx && this.solo) v ? this.audio.ctx.suspend() : this.audio.ctx.resume(); this.onPause?.(v); if (!v) this.last = performance.now(); }
  briefing() { const M = this.match, r = ROUTES[M.route]; const lines = [[0.8, 'DISPATCH: Unit 4471, we lost your vehicle telemetry at Hollowbrook Galleria. Doors sealed behind you?'], [5.5, `DISPATCH: Plan B — ${r.title.toLowerCase()}. Check your objectives.`], [11, this.solo ? 'DISPATCH: You are on your own in there. Stay quiet. Stay out of its light.' : 'DISPATCH: Stick together. Revive anyone who goes down.']];
    for (const [t, s] of lines) setTimeout(() => { if (!this.running) return; this.hud.msg(s, 'radio', 6); this.audio.play('radio', null, { len: 1.2 }); }, t * 1000);
    if (this.mods.length) setTimeout(() => this.running && this.hud.msg('Conditions: ' + this.mods.map(m => MODIFIERS[m].name).join(' · '), 'warn', 7), 16000); }
  // ───────────────────────── helpers ─────────────────────────
  hasItem(id, p = this.me) { return hasItem(p, id); }
  hasRadio() { return this.hasItem('radio') || this.S.comms; }
  canSelfRevive() { return this.hasItem('firstaid') || this.hasItem('medsupply'); }
  routeTitle() { return ROUTES[this.match.route].title; }
  alive(p) { return p.st === 'ok' || p.st === 'injured' || p.st === 'down'; }
  nearTeammates() { return [...this.players.values()].filter(p => p !== this.me && canAct(p) && p.lv === this.me.lv && Math.hypot(p.x - this.me.x, p.z - this.me.z) < 3); }
  downTeammateNear() { return [...this.players.values()].find(p => p !== this.me && p.st === 'down' && Math.hypot(p.x - this.me.x, p.z - this.me.z) < 2.5 && Math.abs(p.y - this.me.y) < 1.5); }
  usable(id) { const c = ITEMS[id].cat; return c === 'battery' || c === 'med' || ['flare', 'motion', 'map', 'radio'].includes(id); }
  objActive(o) { return !o.done && o.deps.every(d => this.match.objectives.find(x => x.id === d)?.done); }
  objView() { return this.match.objectives.map(o => { const s = o.steps[o.stage]; const act = this.objActive(o); let prog = '';
    if (s?.kind === 'deliver') prog = `${o.progress}/${s.count}`; if (s?.kind === 'collect') { const n = s.count || 1; const have = s.items.reduce((a, i) => a + Math.min(n, this.collected[i] || 0), 0); prog = `${have}/${s.items.length * n}`; } if (s?.kind === 'wait') prog = `${Math.max(0, Math.ceil(s.seconds - this.S.waitT))}s`;
    return { id: o.id, title: o.title, hint: o.hint, step: s ? s.t : 'Done', prog, done: o.done, active: act, optional: o.optional, escape: o.id === 'escape', waiting: o.deps.filter(d => !this.match.objectives.find(x => x.id === d)?.done).map(d => this.match.objectives.find(x => x.id === d)?.title).join(', ') }; }); }
  objMarkers() { const out = []; for (const o of this.match.objectives) { if (!this.objActive(o)) continue; const s = o.steps[o.stage]; if (!s) continue; if (s.at) { const it = this.match.inter.find(i => i.id === s.at); if (it) out.push({ ...it, label: it.label }); } if (s.kind === 'reach' || s.kind === 'door') { const z = ROUTES[this.match.route].zone; const rm = this.P.room(z); if (rm) out.push({ lv: rm.lv[0], x: (rm.r[0] + rm.r[2]) / 2, z: (rm.r[1] + rm.r[3]) / 2, label: 'EXIT' }); } } return out; }
  eye() { const p = this.me; return { x: p.x, y: p.y + p.eye, z: p.z }; }
  fwd(p = this.me) { return { x: -Math.sin(p.yaw) * Math.cos(p.pitch), y: Math.sin(p.pitch), z: -Math.cos(p.yaw) * Math.cos(p.pitch) }; }
  // ───────────────────────── items ─────────────────────────
  spawnItem(it) { const m = itemMesh(it.item); m.position.set(it.x, it.y, it.z); (this.W.groups[it.lv] || this.E.scene).add(m); this.items.set(it.id, { ...it, mesh: m }); }
  removeItemMesh(id) { const it = this.items.get(id); if (!it) return; it.mesh.parent?.remove(it.mesh); this.items.delete(id); }
  // ───────────────────────── actions (local) ─────────────────────────
  act(a) { if (this.host) this.handleAct(this.myId, a); else this.net.send('host', { t: 'act', ...a }); }
  useSlot(i) { const e = this.me.inv[i]; if (e) this.useItem(e.id); }
  useItem(id) {
    const me = this.me, d = ITEMS[id]; if (!d || !this.hasItem(id)) return;
    if (id === 'map') return this.togglePanel('map');
    if (id === 'radio') { this.hud.msg(this.S.comms ? 'Channel open. Teammates show range on your HUD.' : 'Radio on. Static gets worse when IT is near.', 'info', 4); this.audio.play('radio', null, { len: 0.6 }); return; }
    if (id === 'motion') { if (this.motionCharge <= 0) { this.hud.msg('Motion detector cell is dead.', 'warn'); return; } this.motionOn = !this.motionOn; this.audio.play('click', null); return; }
    if (me.st === 'down' && this.solo && (id === 'firstaid' || id === 'medsupply')) { this.togglePanel(null); this.startHold({ kind: 'selfrevive', dur: 5, label: 'Patching yourself up' }); return; }
    if (!canAct(me)) return;
    if (d.cat === 'battery') { if (me.batt >= 99) { this.hud.msg('Flashlight is already full.', 'info', 2); return; } const e = me.inv.find(x => x.id === id); if (e?.rd > 0) { this.hud.msg(this.S.power ? 'Still recharging.' : 'Needs mall power to recharge.', 'warn', 2.5); return; } }
    if (d.cat === 'med') { const t = this.downTeammateNear(); if (t) { this.startHold({ kind: 'revive', pid: t.id, item: id, dur: id === 'medsupply' ? 0.6 : id === 'firstaid' ? 2.5 : 4, label: `Treating ${t.name}` }); this.togglePanel(null); return; } if (me.health >= 100 && id !== 'painkillers') { this.hud.msg('You are not hurt.', 'info', 2); return; } }
    this.act({ a: 'use', item: id }); if (this.panel) setTimeout(() => this.hud.renderInv(), 150);
  }
  dropItem(id) { this.act({ a: 'drop', item: id }); }
  giveItem(id, to) { this.act({ a: 'give', item: id, to }); }
  togglePanel(kind) { if (!kind || this.panel === kind) { this.panel = null; this.hud.closePanel(); this.ctrl.setEnabled(!this.paused); return; } this.panel = kind; this.hud.panel(kind); this.audio.play('ui', null, { f: 440 }); if (document.pointerLockElement) document.exitPointerLock(); }
  startHold(h) { this.hold = { ...h, t: 0, auto: true, lock: true }; }
  // ───────────────────────── main frame ─────────────────────────
  frame(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now; this.fps += ((1 / Math.max(dt, 1e-3)) - this.fps) * 0.05;
    if (this.paused && this.solo) { this.E.render(now / 1000); return; }
    this.time += dt; const t = now / 1000, me = this.me, E = this.E, P = this.P;
    const inp = this.ctrl.consume(); this.handlePressed(inp.pressed);
    const blocked = !!this.panel || this.paused || this.ended;
    // look
    if (!blocked && !this.scare) { me.yaw -= inp.lookX; me.pitch = clamp(me.pitch - inp.lookY, -1.45, 1.45); if (me.hidden != null) { me.yaw = this.hideYaw + clamp(angDiff(this.hideYaw, me.yaw), -0.7, 0.7); me.pitch = clamp(me.pitch, -0.5, 0.4); } }
    // move
    const mv = blocked || this.hold?.lock ? { mx: 0, mz: 0, sprint: false, crouch: me.crouch } : { mx: inp.mx, mz: inp.mz, sprint: inp.sprint, crouch: inp.crouch };
    const res = stepPlayer(me, mv, dt, P, { bob: this.settings.bob !== false, onBlockedStand: () => { this.ctrl.setCrouch(true); } });
    if (me.crouch !== inp.crouch && !me.crouch) this.ctrl.setCrouch(false);
    for (const s of res.steps) { this.audio.play('step', null, { mat: s.mat, sprint: me.sprint, crouch: me.crouch, vol: 0.55 }); this.noise(s); }
    if (res.landed && res.hard) this.audio.play('land', null);
    if (me.pk > 0) me.pk -= dt;
    for (const e of me.inv) if (e.rd > 0 && this.S.power) e.rd = Math.max(0, e.rd - dt);
    // flashlight
    const fk = updateFlashlight(me, dt, this.diff, t); this.updateFlash(dt, fk);
    if (this.motionOn) { this.motionCharge -= dt * 1.6; if (this.motionCharge <= 0 || !this.hasItem('motion')) { this.motionOn = false; this.motionCharge = Math.max(0, this.motionCharge); } }
    // senses we report: lit + beam on monster
    this.senseT = (this.senseT || 0) - dt; if (this.senseT <= 0) { this.senseT = 0.2; me.lit = this.isLit(me, t); me.look = this.beamOnMonster(); }
    // interaction
    this.updateInteraction(dt, inp);
    // simulation
    if (this.host) this.simHost(dt); else this.simClient(dt);
    for (const d of this.W.doors) d.update(dt); for (const s of this.W.shutters) s.update(dt); this.W.elevator.update(dt); P.elevator.powered = this.S.elev;
    this.updateMonsterView(dt, t); this.updateOfficers(dt); this.updateWorldFx(dt, t); this.scareDirector(dt);
    // network
    this.netT -= dt; if (this.netT <= 0) { this.netT = 1 / 15; this.sendNet(); } this.flushEvs();
    // camera + render
    this.placeCamera(dt, t); this.levelVisibility();
    E.fx.glitch = this.fx.glitch; E.fx.staticAmt = this.fx.staticAmt; E.fx.damage = this.fx.damage; E.fx.lowBatt = me.batt < 22 && me.fl ? 1 : 0; E.power = this.S.power && !this.brownout;
    E.updateLights(t, dt, E.camera.position); E.render(t);
    // audio + HUD
    const md = Math.hypot(this.mon.x - me.x, this.mon.z - me.z) + Math.abs(this.mon.y - me.y);
    const chase = this.mon.st === 'chase' ? (this.mon.tg === this.myId ? 1 : 0.55) : this.mon.st === 'hunt' || this.mon.st === 'seekhide' ? 0.35 : 0;
    const f = this.fwd(); this.audio.listen(E.camera.position.x, E.camera.position.y, E.camera.position.z, f.x, f.z);
    this.audio.update(dt, { mon: this.mon, lv: me.lv, monDist: md, radio: this.hasItem('radio'), chase, fear: clamp(1 - md / 16, 0, 1) * (this.mon.lv === me.lv ? 1 : 0.4), hurt: me.health < 40 && this.alive(me) ? 1 - me.health / 40 : 0, power: this.S.power && !this.brownout, distRain: Math.hypot(me.x, Math.max(0, 32 - me.z)) });
    this.hud.update(dt);
  }
  handlePressed(pr) {
    if (pr.has('pause')) { if (this.panel) this.togglePanel(null); else this.setPause(!this.paused); }
    if (this.paused || this.ended) return;
    if (pr.has('inv')) this.togglePanel('inv'); if (pr.has('map') || pr.has('obj')) this.togglePanel('map');
    if (pr.has('flash')) { const me = this.me; if (me.batt <= 0) { this.hud.msg('Flashlight is dead. Load a battery.', 'warn', 2.5); this.audio.play('click', null); } else { me.fl = !me.fl; this.audio.play('click', null); } }
    if (pr.has('battery')) { const b = ['batt_aa', 'batt_recharge', 'batt_pack', 'batt_cell'].find(id => this.me.inv.some(e => e.id === id && !(e.rd > 0))); b ? this.useItem(b) : this.hud.msg('No batteries.', 'warn', 2); }
    if (pr.has('heal')) { const m = ['bandage', 'firstaid', 'medsupply'].find(id => this.hasItem(id)); m ? this.useItem(m) : this.hud.msg('No medical supplies.', 'warn', 2); }
    if (pr.has('ping')) this.doPing();
    if (pr.has('drop') && this.me.inv.length) this.dropItem(this.me.inv[this.me.inv.length - 1].id);
    for (let i = 1; i <= 6; i++) if (pr.has('slot' + i)) this.useSlot(i - 1);
  }
  noise(n) { const x = { x: n.x, y: n.y, z: n.z, lv: n.lv, r: n.r, kind: n.kind || 'step', big: !!n.big }; if (this.host) this.noises.push(x); else this.net.send('host', { t: 'noise', n: x }); }
  // ───────────────────────── flashlight / senses ─────────────────────────
  updateFlash(dt, k) {
    const cam = this.E.camera, me = this.me; const f = this.fwd(); const lag = Math.min(1, dt * (me.sprint ? 9 : 13));
    this.aimDir.x += (f.x - this.aimDir.x) * lag; this.aimDir.y += (f.y - this.aimDir.y) * lag; this.aimDir.z += (f.z - this.aimDir.z) * lag; this.aimDir.normalize();
    const rx = Math.cos(me.yaw), rz = -Math.sin(me.yaw); this.flash.position.set(cam.position.x + rx * 0.22, cam.position.y - 0.22, cam.position.z + rz * 0.22);
    this.flash.target.position.set(this.flash.position.x + this.aimDir.x * 10, this.flash.position.y + this.aimDir.y * 10, this.flash.position.z + this.aimDir.z * 10);
    const on = me.fl && me.batt > 0 && me.hidden == null && me.st !== 'dead' && me.st !== 'escaped';
    this.flash.intensity = on ? this.flashBase * k : 0; this.fill.position.copy(cam.position); this.fill.intensity = me.hidden != null ? 0.1 : 0.45;
  }
  isLit(p, t) { for (const l of this.W.lamps) { if (l.lv !== p.lv || Math.abs(l.x - p.x) > 3.6 || Math.abs(l.z - p.z) > 3.6) continue; if (this.E.lampLevel(l, t) > 0.4) return true; } return this.flares.some(f => Math.hypot(f.x - p.x, f.z - p.z) < 6); }
  beamOnMonster() { const me = this.me; if (!me.fl || me.batt <= 0) return false; const e = this.eye(), f = this.fwd(); const dx = this.mon.x - e.x, dy = this.mon.y + 1.8 - e.y, dz = this.mon.z - e.z, d = Math.hypot(dx, dy, dz); if (d > 30) return false;
    return (dx * f.x + dy * f.y + dz * f.z) / d > Math.cos(0.32) && this.P.los(me.lv, me.x, me.z, this.mon.lv, this.mon.x, this.mon.z); }
  // ───────────────────────── interaction targeting ─────────────────────────
  findTarget() {
    const me = this.me, P = this.P, e = this.eye(), f = this.fwd(); let best = null, bs = 1e9;
    const consider = (x, y, z, maxD, maxA, mk) => { const dx = x - e.x, dy = y - e.y, dz = z - e.z, d = Math.hypot(dx, dy, dz); if (d > maxD) return; const ang = Math.acos(clamp((dx * f.x + dy * f.y + dz * f.z) / Math.max(d, 1e-3), -1, 1)); if (ang > maxA && d > 0.9) return; const s = ang * 2 + d * 0.35; if (s < bs) { bs = s; best = mk; } };
    if (me.st === 'down') { if (this.solo && this.canSelfRevive()) return { kind: 'selfrevive', label: 'Patch yourself up', hold: 5, sub: 'Uses a first aid kit' }; return null; }
    if (me.hidden != null) return { kind: 'unhide', label: 'Leave hiding place' };
    if (!canAct(me)) return null;
    for (const it of this.items.values()) { if (it.lv !== me.lv || Math.abs(it.x - me.x) > 3 || Math.abs(it.z - me.z) > 3) continue; consider(it.x, it.y + 0.05, it.z, 2.4, 0.42, { kind: 'take', id: it.id, label: `Pick up ${ITEMS[it.item].name}`, icon: icon(it.item) }); }
    for (const p of this.players.values()) if (p !== me && p.st === 'down' && p.lv === me.lv) { const med = ['medsupply', 'firstaid', 'bandage'].find(id => this.hasItem(id)); consider(p.x, p.y + 0.3, p.z, 2.6, 0.9, { kind: 'revive', pid: p.id, item: med || null, label: `Revive ${p.name}`, hold: med === 'medsupply' ? 0.6 : med === 'firstaid' ? 2.5 : 5, sub: med ? `Uses ${ITEMS[med].name}` : 'No supplies — slow' }); }
    for (const it of this.match.inter) { if (it.lv !== me.lv) continue; consider(it.x, it.y + 1, it.z, 2.6, 0.8, { kind: 'inter', id: it.id, ...this.interPrompt(it) }); }
    for (const h of this.W.hides) { if (h.lv !== me.lv || Math.abs(h.x - me.x) > 2 || Math.abs(h.z - me.z) > 2) continue; consider(h.x, h.y + 1, h.z, 1.7, 0.9, { kind: 'hide', id: h.id, label: h.kind === 'locker' ? 'Hide in locker' : 'Hide in stall' }); }
    for (const d of P.doorsNear(me.x, me.z, 1.6)) { if (d.lv !== me.lv) continue; const [a, b, c, z2] = d.seg; consider((a + c) / 2, LEVELS[d.lv].y + 1.2, (b + z2) / 2, 2.4, 1.1, { kind: 'door', id: d.id, ...this.doorPrompt(d) }); }
    for (const s of P.shuttersNear(me.x, me.z, 1.6)) { if (s.lv !== me.lv) continue; const [a, b, c, z2] = s.seg; const pr = this.shutterPrompt(s); if (pr) consider((a + c) / 2, LEVELS[s.lv].y + 1, (b + z2) / 2, 2.6, 1.0, { kind: 'shutter', id: s.id ?? P.shutters.indexOf(s), ...pr }); }
    if (me.surf === P.elevSurf && !P.elevator.moving) { const lvs = ['B', 'G', 'U']; const i = lvs.indexOf(P.elevator.level); const up = me.pitch > -0.25; const to = lvs[clamp(i + (up ? 1 : -1), 0, 2)]; if (to !== P.elevator.level) { const c = { kind: 'elev', lv: to, label: `Ride to ${LEVELS[to].name}`, sub: this.S.elev ? (up ? 'Look down to go down' : 'Look up to go up') : 'No power to the elevator' }; if (!best || bs > 1.2) best = c; } }
    return best;
  }
  interPrompt(it) {
    const o = this.match.objectives.find(o => this.objActive(o) && o.steps[o.stage]?.at === it.id); const ref = this.match.objectives.find(o => o.steps.some(s => s.at === it.id));
    if (!o) { if (ref?.done) return { label: `${it.label} — done`, tap: 'info' }; return { label: it.label, sub: ref ? (ref.deps.length && !this.objActive(ref) ? `Requires: ${ref.deps.map(d => this.match.objectives.find(x => x.id === d)?.title).join(', ')}` : 'Not yet') : '', tap: 'info' }; }
    const s = o.steps[o.stage];
    if (s.kind === 'deliver') { const n = countItem(this.me, s.item); return { label: `${s.t} (${o.progress}/${s.count})`, sub: n ? `You have ${n} ${ITEMS[s.item].name}${n > 1 ? 's' : ''}` : `Needs: ${ITEMS[s.item].name}`, hold: n ? 1.2 : 0, need: !n }; }
    const miss = (s.needItems || []).filter(i => !this.hasItem(i)); return { label: s.t, sub: miss.length ? `Needs: ${miss.map(i => ITEMS[i].name).join(', ')}` : it.noise ? 'Loud!' : '', hold: miss.length ? 0 : (s.hold || it.hold || 1.5), need: miss.length > 0 };
  }
  doorPrompt(d) {
    if (d.kind === 'elev') return { label: this.S.elev ? (this.P.elevator.level === d.lv && !this.P.elevator.moving ? 'Open elevator' : 'Call elevator') : 'Elevator (no power)' };
    if (d.locked) {
      if (d.exit) { const esc = this.match.objectives.find(o => o.id === 'escape'); const st = esc && this.objActive(esc) && esc.steps[esc.stage];
        if (d.lock === 'chain') return st?.kind === 'door' ? (this.hasItem('wirecutters') ? { label: 'Cut the chains', hold: 2.5, sub: 'Loud' } : { label: 'Chained shut', sub: 'Needs: Wire Cutters', tap: 'info' }) : { label: 'Chained shut', sub: this.match.route === 'emergency' ? 'Finish your other objectives first' : 'Not your way out tonight', tap: 'info' };
        return { label: { exit: 'Entrance — sealed', gate: 'Parking gate — down', dock: 'Dock shutter — down' }[d.lock] || 'Sealed', sub: { exit: 'Enter the access code at the keypad', gate: 'Use the gate control', dock: 'Use the dock control' }[d.lock], tap: 'info' }; }
      const inv = allItems(this.me); if (lockOpenedBy(d.lock, inv)) { const tool = d.lock === 'pick' ? 'lockpick' : d.lock === 'pry' ? 'crowbar' : d.lock === 'chain' ? 'wirecutters' : null; return { label: tool === 'crowbar' ? 'Pry the door open' : tool === 'wirecutters' ? 'Cut the padlock' : tool === 'lockpick' ? 'Pick the lock' : 'Unlock', hold: tool === 'lockpick' ? 3 : tool ? 1.8 : 0.5, sub: tool === 'crowbar' ? 'Loud' : '' }; }
      return { label: 'Locked', sub: `Needs ${lockNeeds(d.lock)}`, tap: 'info', locked: true };
    }
    return { label: d.open ? 'Close door' : 'Open door' };
  }
  shutterPrompt(s) { if (s.state === 'closed') return this.hasItem('crowbar') ? { label: 'Pry the shutter up', hold: 2, sub: 'Loud' } : { label: 'Shutter is down', sub: 'A crowbar could pry it up', tap: 'info' }; if (s.state === 'half') return { label: 'Raise shutter', hold: 1.2, sub: 'Or crouch to slip under' }; return { label: 'Pull shutter down', hold: 0.5 }; }
  updateInteraction(dt, inp) {
    const me = this.me; const tg = (this.panel || this.paused || this.ended || this.scare) ? null : this.findTarget(); this.target = tg;
    if (this.hold) { const h = this.hold; const same = tg && tg.kind === h.kind && (tg.id ?? tg.pid ?? tg.lv) === (h.id ?? h.pid ?? h.lv);
      if ((!inp.interact && !h.auto) || (!same && !h.auto) || !this.alive(me)) { this.hold = null; } else { h.t += dt; if (h.t >= h.dur) { this.hold = null; this.performTarget(h, true); } } }
    else if (tg && inp.pressed.has('interact')) { if (tg.hold > 0) this.hold = { ...tg, dur: tg.hold, t: 0 }; else this.performTarget(tg, false); }
    this.hud.prompt(tg ? tg.label : (this.hold?.auto ? this.hold.label : ''), this.hold ? this.hold.t / this.hold.dur : 0, tg?.sub || ''); this.ctrl.setHold(this.hold ? this.hold.t / this.hold.dur : 0);
  }
  performTarget(tg) {
    const me = this.me;
    switch (tg.kind) {
      case 'take': this.act({ a: 'take', id: tg.id }); break;
      case 'revive': this.act({ a: 'revive', pid: tg.pid, item: tg.item }); break;
      case 'selfrevive': this.act({ a: 'selfrevive' }); break;
      case 'inter': if (tg.tap === 'info' || tg.need) { this.hud.msg(tg.sub ? `${tg.label}. ${tg.sub}.` : tg.label, 'info', 3); this.audio.play('deny', null, { vol: 0.5 }); } else this.act({ a: 'inter', id: tg.id }); break;
      case 'door': if (tg.tap === 'info') { this.hud.msg(`${tg.label}. ${tg.sub || ''}`, 'info', 3); this.audio.play('locked', this.doorPos(tg.id)); } else this.act({ a: this.P.doors[tg.id].kind === 'elev' ? 'elev' : 'door', id: tg.id, lv: this.P.doors[tg.id].lv }); break;
      case 'shutter': if (tg.tap === 'info') { this.hud.msg(`${tg.label}. ${tg.sub}.`, 'info', 3); this.audio.play('locked', null); } else this.act({ a: 'shutter', id: tg.id }); break;
      case 'hide': { const h = this.W.hides[tg.id]; if ([...this.players.values()].some(p => p.hidden === h.id)) { this.hud.msg('Someone is already in there.', 'info', 2); break; } this.preHide = { x: me.x, z: me.z, y: me.y }; me.hidden = h.id; me._justHid = true; this.hideKind = h.kind; this.hideYaw = me.yaw + Math.PI; me.yaw = this.hideYaw; me.pitch = 0; me.fl = false; this.audio.play('doorClose', null, { vol: 0.4 }); this.noise({ x: me.x, y: me.y, z: me.z, lv: me.lv, r: 4, kind: 'hide' }); break; }
      case 'unhide': this.leaveHide(); break;
      case 'elev': this.act({ a: 'elev', lv: tg.lv }); break;
    }
  }
  leaveHide() { const me = this.me; if (me.hidden == null) return; me.hidden = null; if (this.preHide) { me.x = this.preHide.x; me.z = this.preHide.z; } this.audio.play('doorOpen', null, { vol: 0.4 }); }
  doorPos(id) { const d = this.P.doors[id]; const [a, b, c, e] = d.seg; return { x: (a + c) / 2, y: LEVELS[d.lv].y + 1.2, z: (b + e) / 2 }; }
  doPing() { const e = this.eye(), f = this.fwd(); const cam = this.E.camera; this.ray.set(cam.position, new THREE.Vector3(f.x, f.y, f.z)); this.ray.far = 30; const vis = this.W.meshes.filter(m => m.parent?.visible); const hit = this.ray.intersectObjects(vis, false)[0];
    const pt = hit ? hit.point : new THREE.Vector3(e.x + f.x * 12, e.y + f.y * 12, e.z + f.z * 12); this.act({ a: 'ping', x: pt.x, y: pt.y, z: pt.z, lv: this.me.lv }); }
  // ───────────────────────── host: authoritative actions ─────────────────────────
  emit(ev) { this.applyEv(ev); this.outEvs.push(ev); }
  flushEvs() { if (!this.outEvs.length) return; if (this.host && this.net) this.net.broadcast({ t: 'ev', evs: this.outEvs }); this.outEvs = []; }
  tell(pid, text, kind = 'info') { this.emit({ e: 'msg', to: pid, text, kind }); }
  sfx(name, pos, o = {}) { this.emit({ e: 'sfx', name, pos, o }); }
  invEv(pid, c) { this.emit({ e: 'inv', pid, inv: c.inv, keys: c.keys }); }
  handleAct(pid, a) {
    const p = this.players.get(pid); if (!p || this.ended) return; const P = this.P; const near = (x, z, r) => Math.hypot(p.x - x, p.z - z) < r;
    switch (a.a) {
      case 'take': { const it = this.items.get(a.id); if (!it || !canAct(p) || !near(it.x, it.z, 3.5)) return; if (!canTake(p, it.item)) return this.tell(pid, 'No room on your belt. Drop something first.', 'warn');
        const c = clone(p); addItem(c, it.item); this.emit({ e: 'take', id: it.id, pid, item: it.item }); this.invEv(pid, c); this.collected[it.item] = (this.collected[it.item] || 0) + 1; this.checkCollect(); this.emitObj(); break; }
      case 'drop': { if (!hasItem(p, a.item)) return; const c = clone(p); removeItem(c, a.item); this.invEv(pid, c); const f = this.fwd(p); let x = p.x + f.x * 0.6, z = p.z + f.z * 0.6; const g = P.groundAt(x, z, p.y + 0.5, 0.8); if (!g || Math.abs(g.y - p.y) > 0.6) { x = p.x; z = p.z; }
        if (a.item === 'container' || ITEMS[a.item].cat === 'quest' || ITEMS[a.item].cat === 'part' || ITEMS[a.item].cat === 'key') this.collected[a.item] = Math.max(0, (this.collected[a.item] || 0) - 1);
        this.emit({ e: 'spawn', id: this.nextItemId++, item: a.item, x, y: (g ? g.y : p.y) + 0.01, z, lv: p.lv }); this.noises.push({ x, y: p.y, z, lv: p.lv, r: a.item === 'container' ? 14 : 8, kind: 'drop' }); this.sfx('drop', { x, y: p.y, z }); this.emitObj(); break; }
      case 'give': { const q = this.players.get(a.to); if (!q || !hasItem(p, a.item) || !canAct(q) || Math.hypot(p.x - q.x, p.z - q.z) > 4) return; if (!canTake(q, a.item)) return this.tell(pid, `${q.name} has no room.`, 'warn'); const c1 = clone(p), c2 = clone(q); removeItem(c1, a.item); addItem(c2, a.item); this.invEv(pid, c1); this.invEv(q.id, c2); this.tell(q.id, `${p.name} gave you ${ITEMS[a.item].name}.`); this.tell(pid, `Gave ${ITEMS[a.item].name} to ${q.name}.`); break; }
      case 'use': { const id = a.item, d = ITEMS[id]; if (!d || !hasItem(p, id)) return; const c = clone(p);
        if (d.cat === 'battery') { const e = c.inv.find(x => x.id === id && !(x.rd > 0)); if (!e) return; if (d.reusable) e.rd = 90; else removeItem(c, id); this.invEv(pid, c); this.emit({ e: 'used', pid, item: id }); this.sfx('battery', { x: p.x, y: p.y + 1, z: p.z }); break; }
        if (id === 'painkillers') { if (!canAct(p)) return; removeItem(c, id); this.invEv(pid, c); this.emit({ e: 'used', pid, item: id }); break; }
        if (MEDS[id]) { if (!canAct(p)) return; removeItem(c, id); this.invEv(pid, c); const hp = Math.min(100, p.health + MEDS[id]); this.emit({ e: 'hp', pid, health: hp, st: hp < 60 ? 'injured' : 'ok' }); this.sfx('heal', { x: p.x, y: p.y + 1, z: p.z }); break; }
        if (id === 'flare') { removeItem(c, id); this.invEv(pid, c); const f = this.fwd(p); this.emit({ e: 'flare', x: p.x + f.x * 0.8, y: p.y + 0.02, z: p.z + f.z * 0.8, lv: p.lv, life: 30 }); break; }
        break; }
      case 'revive': { const q = this.players.get(a.pid); if (!q || q.st !== 'down' || !canAct(p) || Math.hypot(p.x - q.x, p.z - q.z) > 3.2) return; let hp = 30; if (a.item && hasItem(p, a.item)) { const c = clone(p); removeItem(c, a.item); this.invEv(pid, c); hp = { bandage: 40, firstaid: 60, medsupply: 100 }[a.item] || 30; }
        this.emit({ e: 'hp', pid: q.id, health: hp, st: hp < 60 ? 'injured' : 'ok', downT: 0 }); this.tell(q.id, `${p.name} got you back on your feet.`); this.sfx('heal', { x: q.x, y: q.y, z: q.z }); break; }
      case 'selfrevive': { if (p.st !== 'down') return; const id = ['medsupply', 'firstaid'].find(i => hasItem(p, i)); if (!id) return; const c = clone(p); removeItem(c, id); this.invEv(pid, c); const hp = id === 'medsupply' ? 80 : 40; this.emit({ e: 'hp', pid, health: hp, st: hp < 60 ? 'injured' : 'ok', downT: 0 }); this.sfx('heal', { x: p.x, y: p.y, z: p.z }); break; }
      case 'door': this.actDoor(p, a.id); break;
      case 'shutter': this.actShutter(p, a.id); break;
      case 'inter': this.actInter(p, a.id); break;
      case 'elev': this.actElev(p, a.lv); break;
      case 'ping': this.emit({ e: 'ping', pid, x: a.x, y: a.y, z: a.z, lv: a.lv }); break;
    }
  }
  actDoor(p, id) {
    const d = this.P.doors[id]; if (!d || !canAct(p) || Math.hypot(p.x - this.doorPos(id).x, p.z - this.doorPos(id).z) > 3.2) return; const pos = this.doorPos(id), pid = p.id;
    if (d.kind === 'elev') return this.actElev(p, d.lv);
    if (d.locked) {
      if (d.exit) { if (d.lock !== 'chain') return; const esc = this.match.objectives.find(o => o.id === 'escape'); const st = esc && this.objActive(esc) && esc.steps[esc.stage]; if (st?.kind !== 'door' || !hasItem(p, 'wirecutters')) return this.tell(pid, 'The chains hold.', 'warn');
        this.emit({ e: 'door', id, open: true, locked: false }); this.sfx('cut', pos); this.noises.push({ ...pos, lv: d.lv, r: 16, kind: 'cut' }); this.advance(esc); return; }
      const inv = allItems(p); if (!lockOpenedBy(d.lock, inv)) { this.sfx('locked', pos); return this.tell(pid, `Locked. Needs ${lockNeeds(d.lock)}.`, 'warn'); }
      if (d.lock === 'card' && !['keycard', 'card_red', 'card_blue', 'card_green'].some(i => inv.includes(i))) { const c = clone(p); removeItem(c, 'sec_device'); this.invEv(pid, c); this.tell(pid, 'The override device burns out after one use.'); }
      this.emit({ e: 'door', id, open: true, locked: false }); this.sfx(d.lock === 'pry' ? 'pry' : d.lock === 'chain' ? 'cut' : 'unlock', pos); if (d.lock !== 'pry') this.sfx('doorOpen', pos);
      this.noises.push({ ...pos, lv: d.lv, r: d.lock === 'pry' ? 24 : d.lock === 'chain' ? 14 : 8, kind: 'door', big: d.lock === 'pry' }); return;
    }
    this.emit({ e: 'door', id, open: !d.open, locked: false }); this.sfx(d.open ? 'doorClose' : 'doorOpen', pos); this.noises.push({ ...pos, lv: d.lv, r: d.open ? 9 : 10, kind: 'door' });
  }
  actShutter(p, id) {
    const s = this.P.shutters[id]; if (!s || !canAct(p)) return; const [a, b, c, e] = s.seg; const pos = { x: (a + c) / 2, y: LEVELS[s.lv].y + 1.5, z: (b + e) / 2 }; if (Math.hypot(p.x - pos.x, p.z - pos.z) > 4) return;
    let to = null, r = 14, big = false; if (s.state === 'closed') { if (!hasItem(p, 'crowbar')) return this.tell(p.id, 'It will not budge without a crowbar.', 'warn'); to = 'half'; r = 22; big = true; this.sfx('pry', pos); } else if (s.state === 'half') to = 'open'; else to = 'closed';
    this.emit({ e: 'shutter', id, state: to }); this.sfx('shutter', pos); this.noises.push({ ...pos, lv: s.lv, r, kind: 'shutter', big });
  }
  actElev(p, lv) {
    const e = this.P.elevator; if (!this.S.elev) { this.sfx('deny', { x: p.x, y: p.y + 1, z: p.z }); return this.tell(p.id, 'The elevator has no power. (Optional: restore it at the service panel.)', 'warn'); } if (e.moving) return;
    if (e.level === lv) { const d = this.P.doors.find(d => d.kind === 'elev' && d.lv === lv); if (d) this.emit({ e: 'door', id: d.id, open: true, locked: false }); return; }
    this.emit({ e: 'elev', to: lv }); this.noises.push({ x: (e.x0 + e.x1) / 2, y: e.y, z: (e.z0 + e.z1) / 2, lv: e.level, r: 20, kind: 'machine' });
  }
  actInter(p, iid) {
    const it = this.match.inter.find(i => i.id === iid); if (!it || !canAct(p) || Math.hypot(p.x - it.x, p.z - it.z) > 3.2) return; const pid = p.id; const pos = { x: it.x, y: it.y + 1, z: it.z };
    const o = this.match.objectives.find(o => this.objActive(o) && o.steps[o.stage]?.at === iid); if (!o) return this.tell(pid, 'Nothing happens.', 'warn'); const s = o.steps[o.stage];
    if (s.kind === 'deliver') { const n = countItem(p, s.item); if (!n) return this.tell(pid, `You need: ${ITEMS[s.item].name}.`, 'warn'); const use = Math.min(n, s.count - o.progress); const c = clone(p); for (let i = 0; i < use; i++) removeItem(c, s.item); this.invEv(pid, c); o.progress += use; this.sfx('unlock', pos);
      if (o.progress >= s.count) this.advance(o); else this.tell(pid, `${o.progress}/${s.count} — ${s.t.toLowerCase()}.`); this.emitObj(); return; }
    if (s.kind === 'use') { const miss = (s.needItems || []).filter(i => !hasItem(p, i)); if (miss.length) return this.tell(pid, `You need: ${miss.map(i => ITEMS[i].name).join(', ')}.`, 'warn');
      if (it.type === 'flarepad') { const c = clone(p); removeItem(c, 'flare'); this.invEv(pid, c); this.emit({ e: 'flare', x: it.x, y: it.y + 0.02, z: it.z, lv: it.lv, life: 90 }); }
      if (it.type === 'keypad') this.sfx('keypad', pos); else if (it.type === 'generator') this.sfx('generator', pos); else this.sfx('success', pos);
      if (it.noise) this.noises.push({ ...pos, lv: it.lv, r: it.noise, kind: 'machine', big: true });
      if (it.type === 'guard') { for (const [k, item] of (o.reward || []).entries()) this.emit({ e: 'spawn', id: this.nextItemId++, item, x: it.x + 0.5 * Math.cos(k * 2.1), y: it.y + 0.01, z: it.z + 0.5 * Math.sin(k * 2.1), lv: it.lv }); this.tell(pid, 'Officer Hale. His bodycam is still recording. His keys and card are here.'); }
      this.advance(o); this.emitObj(); }
  }
  advance(o) {
    o.stage++; o.progress = 0; const M = this.match;
    if (o.stage >= o.steps.length || o.steps[o.stage].kind === 'carry') { if (o.steps[o.stage]?.kind !== 'carry') o.done = true; else o.carry = true; }
    if (o.done || o.carry) this.emit({ e: 'objdone', id: o.id, title: o.title });
    if (o.done) { if (o.id === 'power') this.emit({ e: 'flag', k: 'power', v: true }); if (o.effect === 'cameras') this.emit({ e: 'flag', k: 'cameras', v: true }); if (o.effect === 'comms') this.emit({ e: 'flag', k: 'comms', v: true }); if (o.effect === 'elevator') this.emit({ e: 'flag', k: 'elev', v: true }); }
    if (o.id === 'escape') { const s = o.steps[o.stage - 1]; const unlock = z => { const d = this.P.exits[z]; if (d) { this.emit({ e: 'door', id: d.id, open: true, locked: false }); this.sfx(d.kind === 'entrance' ? 'unlock' : 'shutter', this.doorPos(d.id)); } };
      if (s?.at === 'keypad') unlock('plaza'); if (s?.at === 'dockctl') { unlock('dockyard'); this.noises.push({ ...this.doorPos(this.P.exits.dockyard.id), lv: 'B', r: 30, kind: 'machine', big: true }); } if (s?.at === 'gatectl') { unlock('rampOut'); this.noises.push({ ...this.doorPos(this.P.exits.rampOut.id), lv: 'B', r: 30, kind: 'machine', big: true }); }
      if (s?.at === 'flarepad') this.emit({ e: 'msg', text: 'DISPATCH: Air One sees your flare. Hold that roof — ETA ' + o.steps[o.stage].seconds + ' seconds.', kind: 'radio' }); if (s?.kind === 'wait') this.emit({ e: 'flag', k: 'heli', v: 1 }); }
    // newly active objectives may already be satisfied (collect steps)
    this.checkCollect(); this.emitObj();
  }
  checkCollect() { for (const o of this.match.objectives) { if (!this.objActive(o)) continue; const s = o.steps[o.stage]; if (s?.kind === 'collect' && s.items.every(i => (this.collected[i] || 0) >= (s.count || 1))) this.advance(o); } }
  emitObj() { this.emit({ e: 'obj', o: this.match.objectives.map(o => [o.stage, o.progress, o.done ? 1 : 0, o.carry ? 1 : 0]), col: this.collected, w: Math.round(this.S.waitT) }); }
  // ───────────────────────── host simulation ─────────────────────────
  aiPlayers() { this.aiP = this.aiP || new Map(); return [...this.players.values()].filter(p => p.st !== 'left').map(p => { let a = this.aiP.get(p.id); if (!a) this.aiP.set(p.id, a = { id: p.id }); Object.assign(a, { x: p.x, y: p.y, z: p.z, lv: p.lv, yaw: p.yaw + Math.PI, flashlight: p.fl && (p.flick ?? 1) > 0.3 && p.batt > 0, crouch: p.crouch, sprint: p.sprint, lit: p.lit, down: p.st === 'down', dead: p.st === 'dead', escaped: p.st === 'escaped', hidden: p.hidden, lookAtMonster: !!p.look, health: p.health, vx: p.vx, vz: p.vz }); if (p._justHid) { a._justHid = true; p._justHid = false; } return a; }); }
  simHost(dt) {
    const AI = this.AI, M = this.match;
    // flares keep calling it
    for (const f of this.flares) if (f.life > 0 && (f.nt = (f.nt || 0) - dt) <= 0) { f.nt = 1; this.noises.push({ x: f.x, y: f.y, z: f.z, lv: f.lv, r: 26, kind: 'flare' }); }
    if (this.me.hidden != null && this.me._justHidSent !== this.me.hidden) { this.me._justHidSent = this.me.hidden; }
    const evs = AI.update(dt, this.aiPlayers(), this.noises, this.W.hides); this.noises = [];
    for (const ev of evs) this.monsterEvent(ev);
    Object.assign(this.mon, AI.snapshot(), { tg: AI.target, x: AI.x, y: AI.y, z: AI.z, yaw: AI.yaw });
    for (const p of this.players.values()) { if (p.st === 'down') { p.downT -= dt; if (p.downT <= 0) this.emit({ e: 'hp', pid: p.id, health: 0, st: 'dead', downT: 0 }); } }
    // wait step (helicopter)
    for (const o of M.objectives) { if (!this.objActive(o)) continue; const s = o.steps[o.stage]; if (s?.kind === 'wait') { this.S.waitT += dt; if (Math.floor(this.S.waitT) % 5 === 0 && Math.floor(this.S.waitT) !== this._lastW) { this._lastW = Math.floor(this.S.waitT); this.emitObj(); } if (this.S.waitT >= s.seconds) { this.emit({ e: 'flag', k: 'heli', v: 2 }); this.emit({ e: 'msg', text: 'AIR ONE: Skids down on the helipad. Move, move!', kind: 'radio' }); this.advance(o); } } }
    // escape zone
    const esc = M.objectives.find(o => o.id === 'escape'); const st = esc && this.objActive(esc) && esc.steps[esc.stage];
    if (st?.kind === 'reach') { const pad = M.inter.find(i => i.id === 'flarepad'); for (const p of this.players.values()) { if (!canAct(p)) continue; const rm = this.P.roomAt(p.lv, p.x, p.z); const ok = st.zone === 'roof' ? pad && p.lv === 'R' && Math.hypot(p.x - pad.x, p.z - pad.z) < 7 : rm?.id === st.zone; if (ok) this.escape(p); } }
    // elevator arrival
    const e = this.P.elevator; if (this.prevElevMoving && !e.moving) { const d = this.P.doors.find(d => d.kind === 'elev' && d.lv === e.level); if (d) this.emit({ e: 'door', id: d.id, open: true, locked: false }); this.sfx('elevDing', { x: (e.x0 + e.x1) / 2, y: e.y + 2, z: (e.z0 + e.z1) / 2 }); } this.prevElevMoving = e.moving;
    // end of match
    if (!this.ended) { const ps = [...this.players.values()].filter(p => p.st !== 'left'); if (ps.length && ps.every(p => p.st === 'dead' || p.st === 'escaped')) this.finish(ps.some(p => p.st === 'escaped')); }
  }
  escape(p) { const c = p.keys.includes('container'); const eo = this.match.objectives.find(o => o.id === 'escape'); if (eo && !eo.done) { eo.done = true; this.emitObj(); } this.emit({ e: 'hp', pid: p.id, health: p.health, st: 'escaped' }); this.emit({ e: 'msg', text: `${p.name} made it out.`, kind: 'good' }); if (c) { const o = this.match.objectives.find(o => o.id === 'container'); if (o && !o.done) { o.done = true; this.emit({ e: 'objdone', id: o.id, title: o.title }); this.emitObj(); } } }
  monsterEvent(ev) {
    const AI = this.AI, pos = { x: AI.x, y: AI.y + 2, z: AI.z };
    switch (ev.type) {
      case 'door': { const d = this.P.doors[ev.id]; this.emit({ e: 'door', id: ev.id, open: true, locked: d.locked }); this.sfx(ev.slam ? 'slam' : 'doorOpen', this.doorPos(ev.id)); break; }
      case 'hit': { const p = this.players.get(ev.pid); if (!p || !this.alive(p)) break; const dmg = DMG[this.diff] + (ev.variant === 'pulled' ? 15 : 0); let hp = p.health - dmg, st, downT = 0;
        if (p.st === 'down') { st = 'dead'; hp = 0; } else if (hp <= 0) { hp = 0; if (this.solo) { st = hasItem(p, 'firstaid') || hasItem(p, 'medsupply') ? 'down' : 'dead'; downT = 25; } else { st = 'down'; downT = BLEED[this.diff]; } } else st = hp < 60 ? 'injured' : 'ok';
        this.emit({ e: 'scare', pid: p.id, v: ev.variant, mx: AI.x, my: AI.y, mz: AI.z }); this.emit({ e: 'hp', pid: p.id, health: hp, st, downT, hit: 1 }); break; }
      default: this.emit({ e: 'mev', type: ev.type, pid: ev.pid, pos });
    }
  }
  finish(win) {
    this.ended = true; const M = this.match; const req = M.objectives.filter(o => !o.optional), opt = M.objectives.filter(o => o.optional);
    const res = { win, time: this.time, route: ROUTES[M.route].title, difficulty: this.diff, modifiers: this.mods, req: [req.filter(o => o.done).length, req.length], opt: [opt.filter(o => o.done).length, opt.length], optList: opt.map(o => [o.title, o.done]), seed: this.seed,
      players: [...this.players.values()].map(p => ({ name: p.name, slot: p.slot, st: p.st, found: p.found, dist: Math.round(p.moved), spotted: p.spotted, hits: p.hits })) };
    this.emit({ e: 'end', res }); this.flushEvs();
  }
  // ───────────────────────── events (all peers) ─────────────────────────
  applyEv(ev) {
    const me = this.me, P = this.P; const p = ev.pid != null ? this.players.get(ev.pid) : null;
    switch (ev.e) {
      case 'take': this.removeItemMesh(ev.id); if (p === me) { this.audio.play('pickup', null); this.hud.msg(`${icon(ev.item)} ${ITEMS[ev.item].name}`, 'item', 2.5); } if (p) p.found++; break;
      case 'spawn': this.spawnItem(ev); break;
      case 'inv': if (p) { p.inv = ev.inv.map(e => ({ ...e })); p.keys = [...ev.keys]; if (p === me && this.panel === 'inv') this.hud.renderInv(); } break;
      case 'used': if (p === me) { const d = ITEMS[ev.item]; if (d.cat === 'battery') { me.batt = Math.min(100, me.batt + d.charge); me.fl = true; this.audio.play('battery', null); this.hud.msg(`Flashlight ${Math.round(me.batt)}%`, 'item', 2); } if (ev.item === 'painkillers') { me.pk = 90; this.hud.msg('Painkillers: you can ignore the pain for a while.', 'item', 3); } } break;
      case 'door': { const d = P.doors[ev.id]; if (d) { d.open = ev.open; d.locked = ev.locked; } break; }
      case 'shutter': { const s = P.shutters[ev.id]; if (s) s.state = ev.state; break; }
      case 'elev': { const e = P.elevator; for (const d of P.doors) if (d.kind === 'elev') d.open = false; e.targetLv = ev.to; e.moving = true; this.audio.play('elevMove', { x: (e.x0 + e.x1) / 2, y: e.y + 1.5, z: (e.z0 + e.z1) / 2 }); break; }
      case 'obj': ev.o.forEach(([s, pr, d, c], i) => { const o = this.match.objectives[i]; o.stage = s; o.progress = pr; o.done = !!d; o.carry = !!c; }); this.collected = ev.col; this.S.waitT = ev.w; if (this.panel === 'map') this.hud.renderMap(); break;
      case 'objdone': this.audio.play('objective', null); this.hud.msg(`✔ ${ev.title}`, 'good', 4.5); break;
      case 'flag': this.S[ev.k] = ev.v; if (ev.k === 'power' && ev.v) { this.audio.play('powerOn', null); this.hud.msg('POWER RESTORED — lights, cameras, music… and every noise carries further.', 'good', 6); } if (ev.k === 'cameras') this.hud.msg('Security cameras online: its position now shows on the map.', 'good', 5); if (ev.k === 'comms') { this.hud.msg('DISPATCH: We hear you, 4471. Radios are patched through — team positions on your HUD.', 'radio', 6); this.audio.play('radio', null, { len: 1.8 }); } if (ev.k === 'elev') this.hud.msg('Elevator powered.', 'good', 4); if (ev.k === 'heli' && ev.v === 1) this.heliT = 0; break;
      case 'hp': if (p) { const prev = p.st; p.health = ev.health; p.st = ev.st; if (ev.downT != null) p.downT = ev.downT; if (ev.hit) p.hits++; if (p === me) this.onMyState(prev, ev); else if (ev.st === 'down' && prev !== 'down') this.hud.msg(`${p.name} is down! Revive them.`, 'warn', 5); else if (ev.st === 'dead' && prev !== 'dead') this.hud.msg(`${p.name} — signal lost.`, 'warn', 5); if (ev.st === 'escaped' || ev.st === 'dead') { if (p.hidden != null) p.hidden = null; } } break;
      case 'scare': if (p === me) this.jumpscare(ev); else this.audio.play('scream', { x: ev.mx, y: ev.my + 2, z: ev.mz }, { vol: 0.9 }); break;
      case 'mev': this.onMonsterEv(ev); break;
      case 'sfx': this.audio.play(ev.name, ev.pos, ev.o); break;
      case 'msg': if (!ev.to || ev.to === this.myId) { this.hud.msg(ev.text, ev.kind || 'info', ev.kind === 'radio' ? 6 : 3.5); if (ev.kind === 'radio') this.audio.play('radio', null); if (ev.kind === 'warn') this.audio.play('deny', null, { vol: 0.4 }); } break;
      case 'ping': this.pings.push({ x: ev.x, y: ev.y, z: ev.z, lv: ev.lv, slot: p?.slot ?? 0, t: 8, name: p?.name }); this.addPingSprite(this.pings[this.pings.length - 1]); this.audio.play('ping', null); break;
      case 'flare': { const m = flareMesh(); m.position.set(ev.x, ev.y, ev.z); this.E.scene.add(m); this.flares.push({ ...ev, mesh: m }); this.audio.play('flare', ev); break; }
      case 'end': this.ended = true; this.results = ev.res; setTimeout(() => this.onEnd?.(ev.res), ev.res.win ? 1200 : 2600); break;
    }
  }
  onMyState(prev, ev) {
    const me = this.me;
    if (ev.st === 'down' && prev !== 'down') { this.leaveHide(); this.hud.msg(this.solo ? (this.canSelfRevive() ? 'You are down. Patch yourself up — fast.' : 'You are down…') : 'You are down. Your team can revive you.', 'warn', 5); me.crouch = false; }
    if (ev.st === 'dead' && prev !== 'dead') { this.leaveHide(); this.fx.staticAmt = 1; this.deadT = 0; this.audio.play('staticBurst', null, { len: 1.6, vol: 1.2 }); this.hud.msg('SIGNAL LOST', 'warn', 4); }
    if (ev.st === 'escaped' && prev !== 'escaped') { this.leaveHide(); this.hud.msg('You made it out.', 'good', 5); this.audio.play('success', null); }
    if ((ev.st === 'ok' || ev.st === 'injured') && prev === 'down') this.hud.msg('Back on your feet.', 'good', 3);
  }
  onMonsterEv(ev) {
    const me = this.me, R = this.settings.reduced;
    switch (ev.type) {
      case 'spotted': if (ev.pid === this.myId) { me.spotted++; this.audio.play('stinger', null, { vol: R ? 0.45 : 1 }); this.fx.glitch = Math.max(this.fx.glitch, R ? 0.25 : 0.6); } else { const p = this.players.get(ev.pid); if (p) p.spotted++; } this.audio.play('growl', ev.pos); break;
      case 'heard': this.audio.play('growl', ev.pos, { vol: 0.7 }); break;
      case 'windup': this.audio.play('scream', ev.pos, { vol: R ? 0.5 : 1 }); break;
      case 'flinch': this.audio.play('scream', ev.pos, { vol: 0.8 }); this.fx.staticAmt = Math.max(this.fx.staticAmt, 0.4); if (Math.hypot(ev.pos.x - me.x, ev.pos.z - me.z) < 12) this.hud.msg('Your light drove it back — for now.', 'good', 3); break;
      case 'sniff': this.audio.play('sniff', ev.pos); break;
      case 'gaveup': this.audio.play('garble', ev.pos, { len: 2.2 }); break;
      case 'lostsight': this.audio.play('growl', ev.pos, { vol: 0.5 }); break;
    }
  }
  // ───────────────────────── client side ─────────────────────────
  simClient(dt) { if (this.monT) { const k = Math.min(1, dt * 10); for (const f of ['x', 'y', 'z']) this.mon[f] += (this.monT[f] - this.mon[f]) * k; this.mon.yaw += angDiff(this.mon.yaw, this.monT.yaw) * k; Object.assign(this.mon, { st: this.monT.st, an: this.monT.an, sp: this.monT.sp, lv: this.monT.lv, tg: this.monT.tg }); if (Math.hypot(this.monT.x - this.mon.x, this.monT.z - this.mon.z) > 6) Object.assign(this.mon, { x: this.monT.x, y: this.monT.y, z: this.monT.z }); }
    for (const p of this.players.values()) if (p.st === 'down') p.downT = Math.max(0, p.downT - dt); }
  myState() { const p = this.me; return { x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3), yaw: +p.yaw.toFixed(3), pitch: +p.pitch.toFixed(2), lv: p.lv, cr: p.crouch ? 1 : 0, sp: p.sprint ? 1 : 0, fl: p.fl ? 1 : 0, flk: +(p.flick ?? 1).toFixed(2), hid: p.hidden, lit: p.lit ? 1 : 0, look: p.look ? 1 : 0, vx: +p.vx.toFixed(2), vz: +p.vz.toFixed(2), batt: Math.round(p.batt), jh: p._justHid ? 1 : 0, mv: Math.round(p.moved) }; }
  sendNet() {
    if (!this.net || this.solo) return;
    if (this.host) { const ps = [...this.players.values()].map(p => [p.id, +p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2), +p.yaw.toFixed(2), +p.pitch.toFixed(2), p.lv, p.crouch ? 1 : 0, p.fl ? 1 : 0, +(p.flick ?? 1).toFixed(2), p.hidden, p.st, Math.round(p.health), Math.round(p.batt), Math.round(p.downT || 0), +(p.vx || 0).toFixed(1), +(p.vz || 0).toFixed(1)]);
      this.net.broadcast({ t: 'snap', m: { ...this.AI.snapshot(), tg: this.AI.target }, ps, el: [this.P.elevator.y, this.P.elevator.level, this.P.elevator.moving ? 1 : 0], tm: +this.time.toFixed(1) }); }
    else { this.net.send('host', { t: 'st', p: this.myState() }); this.me._justHid = false; }
  }
  onNet(from, m) {
    if (m.t === 'ev') { for (const ev of m.evs) this.applyEv(ev); return; }
    if (this.host) {
      const p = this.players.get(from); if (!p) return;
      if (m.t === 'st') { const s = m.p; Object.assign(p, { x: s.x, y: s.y, z: s.z, yaw: s.yaw, pitch: s.pitch, lv: s.lv, crouch: !!s.cr, sprint: !!s.sp, fl: !!s.fl, flick: s.flk, hidden: s.hid, lit: !!s.lit, look: !!s.look, vx: s.vx, vz: s.vz, batt: s.batt, moved: s.mv }); if (s.jh) p._justHid = true; }
      else if (m.t === 'act') this.handleAct(from, m); else if (m.t === 'noise') { const n = m.n; if (n && n.r < 40) this.noises.push(n); }
    } else if (m.t === 'snap') {
      this.monT = m.m; if (!this._gotSnap) { this._gotSnap = true; Object.assign(this.mon, m.m); }
      for (const a of m.ps) { const p = this.players.get(a[0]); if (!p || p === this.me) { if (p) { p.health = a[12]; } continue; } Object.assign(p, { x: a[1], y: a[2], z: a[3], yaw: a[4], pitch: a[5], lv: a[6], crouch: !!a[7], fl: !!a[8], flick: a[9], hidden: a[10], st: a[11], health: a[12], batt: a[13], downT: a[14], vx: a[15], vz: a[16] }); }
      const e = this.P.elevator; if (Math.abs(e.y - m.el[0]) > 0.6) e.y = m.el[0];
    }
  }
  dropPlayer(id) { const p = this.players.get(id); if (!p || p.st === 'left') return; this.hud.msg(`${p.name} lost connection.`, 'warn', 5);
    if (this.host) { for (const id2 of [...p.keys, ...p.inv.flatMap(e => Array(e.n).fill(e.id))]) this.emit({ e: 'spawn', id: this.nextItemId++, item: id2, x: p.x + (Math.random() - .5), y: p.y + 0.01, z: p.z + (Math.random() - .5), lv: p.lv }); this.emit({ e: 'hp', pid: id, health: 0, st: 'left' }); this.emit({ e: 'inv', pid: id, inv: [], keys: [] }); }
    if (p.view) p.view.root.visible = false; }
  // ───────────────────────── visuals ─────────────────────────
  updateMonsterView(dt, t) {
    const m = this.mon, mdl = this.model; if (this.scare) return; const vis = this.lvVisible(m.lv);
    mdl.root.visible = vis; mdl.root.position.set(m.x, m.y, m.z); mdl.root.rotation.y = m.yaw; animateMonster(mdl, m.an || 'walk', dt, m.sp || 0);
    // footfalls + horn chatter
    const d = Math.hypot(m.x - (this._mx ?? m.x), m.z - (this._mz ?? m.z)); this._mx = m.x; this._mz = m.z; this.monStepAcc += d; const pos = { x: m.x, y: m.y + 0.3, z: m.z };
    const stride = m.an === 'crawl' ? 0.7 : m.an === 'run' ? 1.4 : 1.15; if (this.monStepAcc > stride) { this.monStepAcc = 0; const occl = m.lv !== this.me.lv; this.audio.play(m.an === 'crawl' ? 'skitter' : 'thud', pos, { vol: m.an === 'stalk' ? 0.35 : 0.8, muffle: occl }); if (m.an === 'crawl' && Math.random() < 0.5) this.audio.play('thud', pos, { vol: 0.6, muffle: occl }); }
    this.garbleT -= dt; if (this.garbleT <= 0) { this.garbleT = 10 + Math.random() * 18; if (['roam', 'patrol', 'search', 'listen', 'stalk'].includes(m.st)) this.audio.play('garble', { x: m.x, y: m.y + 2.2, z: m.z }, { len: 1.2 + Math.random() * 1.6, vol: m.st === 'stalk' ? 0.5 : 0.9, muffle: m.lv !== this.me.lv }); }
  }
  updateOfficers(dt) {
    for (const p of this.players.values()) { if (!p.view) continue; const v = p.view; const show = p.st !== 'escaped' && p.st !== 'left' && p.hidden == null && this.lvVisible(p.lv); v.root.visible = show; if (!show) continue;
      const k = Math.min(1, dt * 12), r = v.root; if (!v.init || Math.hypot(r.position.x - p.x, r.position.z - p.z) > 6) { v.init = true; r.position.set(p.x, p.y, p.z); v.yaw = p.yaw; } else { r.position.x += (p.x - r.position.x) * k; r.position.y += (p.y - r.position.y) * k; r.position.z += (p.z - r.position.z) * k; v.yaw += angDiff(v.yaw, p.yaw) * k; } r.rotation.y = v.yaw + Math.PI; animateOfficer(v, { ...p, cr: p.crouch, flk: p.flick }, dt); v.label.visible = p.st !== 'dead'; }
  }
  addPingSprite(pg) { const s = new THREE.Sprite(this.pingMat.clone()); s.material.color.set(SLOT_COLORS[pg.slot % 4]); s.scale.set(0.35, 0.35, 1); s.position.set(pg.x, pg.y + 0.4, pg.z); s.renderOrder = 20; this.E.scene.add(s); pg.sprite = s; }
  updateWorldFx(dt, t) {
    const me = this.me, f = this.fwd(), e = this.eye();
    // item glints (brighter in the beam)
    for (const it of this.items.values()) { const dx = it.x - e.x, dz = it.z - e.z, d2 = dx * dx + dz * dz; const m = it.mesh; m.visible = d2 < 900; if (d2 > 220 || !m.visible) { m.userData.glint.material.opacity = 0; continue; } const d = Math.sqrt(d2) || 1; const inBeam = me.fl && this.flash.intensity > 0 && (dx * f.x + (it.y - e.y) * f.y + dz * f.z) / Math.hypot(d, it.y - e.y) > 0.93;
      m.userData.glint.material.opacity = (inBeam ? 0.75 : 0.18) * (0.6 + 0.4 * Math.sin(t * 3 + m.userData.phase)) * (1 - d / 15); }
    for (const [id, m] of this.interMeshes) { const led = m.userData.led; if (!led) continue; const o = this.match.objectives.find(o => o.steps[o.stage]?.at === id && this.objActive(o)); led.material.emissive.setHex(o ? (Math.sin(t * 5) > 0 ? 0x40ff60 : 0x103010) : 0x601008); }
    // pings + flares
    for (const pg of this.pings) { pg.t -= dt; if (pg.sprite) { pg.sprite.material.opacity = Math.min(1, pg.t) * (0.6 + 0.4 * Math.sin(t * 8)); if (pg.t <= 0) this.E.scene.remove(pg.sprite); } } this.pings = this.pings.filter(p => p.t > 0);
    for (const fl of this.flares) { fl.life -= dt; const k = fl.life > 0 ? 0.75 + Math.random() * 0.25 : 0; fl.mesh.userData.L.intensity = 40 * k; fl.mesh.userData.glow.material.opacity = k; fl.mesh.visible = fl.life > -1; }
    // helicopter light from the sky
    if (this.S.heli && this.match.route === 'roof') { if (!this.heli) { this.heli = new THREE.SpotLight(0xe8f0ff, 0, 60, 0.35, 0.6, 1.2); this.E.scene.add(this.heli, this.heli.target); this.audio.play('heli', { x: 40, y: 30, z: 10 }, { len: 90 }); } const pad = this.match.inter.find(i => i.id === 'flarepad'); const k = this.S.heli === 2 ? 1 : clamp(this.S.waitT / 60, 0, 1); this.heli.position.set(pad.x + Math.sin(t * 0.3) * (20 - k * 16), pad.y + 40 - k * 25, pad.z + Math.cos(t * 0.3) * (20 - k * 16)); this.heli.target.position.set(pad.x + Math.sin(t * 0.9) * 3, pad.y, pad.z); this.heli.intensity = 200 * k + 40; }
    // camera static near the monster; damage fade
    const md = Math.hypot(this.mon.x - me.x, this.mon.z - me.z) + Math.abs(this.mon.y - me.y) * 2; const near = clamp(1 - md / 15, 0, 1) ** 2 * (this.settings.reduced ? 0.18 : 0.32);
    this.fx.staticAmt += (Math.max(near + (me.st === 'dead' ? 0.6 : 0), 0) - this.fx.staticAmt) * Math.min(1, dt * (this.fx.staticAmt > near ? 1.5 : 4));
    this.fx.glitch = Math.max(0, this.fx.glitch - dt * 1.5) + (near > 0.15 && Math.random() < 0.04 ? 0.25 : 0); this.fx.damage = Math.max(me.st === 'down' ? 0.55 : me.health < 40 && this.alive(me) ? 0.2 + 0.1 * Math.sin(t * 5) : 0, this.fx.damage - dt * 0.8);
    // unstable power brownouts
    if (this.S.power && this.mods.includes('unstable_power')) { this.boT = (this.boT ?? 30) - dt; if (this.boT <= 0) { this.brownout = !this.brownout; this.boT = this.brownout ? 1.5 + Math.random() * 3 : 25 + Math.random() * 50; if (this.brownout) this.audio.play('spark', { x: me.x, y: me.y + 4, z: me.z }); } }
    // solo self-revive / dead spectate timers
    if (me.st === 'dead') this.deadT = (this.deadT || 0) + dt;
  }
  lvVisible(lv) { return this.W.groups[lv]?.visible; }
  levelVisibility() { const y = this.E.camera.position.y; const show = { B: y < 1.2, G: y > -3.6, U: y > -0.5, R: y > 9 }; for (const [k, g] of Object.entries(this.W.groups)) g.visible = !!show[k]; if (this.E.rain) this.E.rain.visible = show.G && y < 7; }
  placeCamera(dt, t) {
    const cam = this.E.camera, me = this.me;
    if (this.scare) return this.scareFrame(dt, t);
    let x = me.x, y = me.y + me.eye + me.bob, z = me.z, yaw = me.yaw, pitch = me.pitch, roll = 0;
    if (me.hidden != null) { const h = this.W.hides[me.hidden]; x = h.x; z = h.z; y = h.y + (h.kind === 'stall' ? 1.15 : 1.5); }
    if ((me.st === 'dead' || me.st === 'escaped') && !this.solo && this.deadT > 2.5 || me.st === 'escaped') { const q = [...this.players.values()].find(p => p !== me && canAct(p)); if (q) { x = q.x - Math.sin(q.yaw) * -0.1; y = q.y + 1.65; z = q.z; yaw = q.yaw; pitch = q.pitch; this.hud.prompt(`Spectating ${q.name}`, 0, ''); } }
    if (me.st === 'down') { y = me.y + 0.45; roll = 0.35; }
    const sway = me.sprint ? Math.sin(me.bobPhase) * 0.012 : Math.sin(me.bobPhase) * 0.004; roll += sway;
    cam.position.set(x, y, z); cam.rotation.set(pitch, yaw, roll, 'YXZ');
    const tf = (this.settings.fov || 78) + (me.sprint ? 4 : 0); if (Math.abs(cam.fov - tf) > 0.05) { cam.fov += (tf - cam.fov) * Math.min(1, dt * 5); cam.updateProjectionMatrix(); }
  }
  // ───────────────────────── jumpscares ─────────────────────────
  jumpscare(ev) {
    const R = this.settings.reduced, me = this.me; this.leaveHide(); const v = R && ev.v === 'behind' ? 'lunge' : ev.v;
    this.scare = { v, t: 0, dur: R ? 0.6 : ({ behind: 1.25, lift: 1.4, pulled: 1.3, doorway: 1.15 }[v] || 1.05), yaw0: me.yaw, mx: ev.mx, mz: ev.mz };
    this.audio.play('jumpscare', null, { vol: R ? 0.35 : 1 }); this.audio.play('hit', null, { vol: R ? 0.5 : 1, delay: R ? 0.1 : 0.35 }); if (navigator.vibrate && !R) navigator.vibrate([60, 40, 120]);
    // face toward where it actually is (so it stays fair)
    this.scare.faceYaw = Math.atan2(-(ev.mx - me.x), -(ev.mz - me.z)); if (v !== 'behind') me.yaw = this.scare.faceYaw;
  }
  scareFrame(dt, t) {
    const s = this.scare, me = this.me, cam = this.E.camera, mdl = this.model, R = this.settings.reduced; s.t += dt; const k = s.t / s.dur;
    let yaw = me.yaw; if (s.v === 'behind') { const w = Math.min(1, s.t / 0.2); yaw = s.yaw0 + angDiff(s.yaw0, s.faceYaw) * (w * w * (3 - 2 * w)); me.yaw = yaw; }
    const shake = (R ? 0.01 : 0.045) * (1 - k); let y = me.y + me.eye + (s.v === 'lift' ? Math.min(0.5, s.t * 1.2) : 0) + (Math.random() - .5) * shake; const x = me.x + (Math.random() - .5) * shake, z = me.z + (Math.random() - .5) * shake;
    if (s.v === 'pulled') y -= Math.min(0.5, s.t);
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    let dist = 0.95, lat = 0; if (s.v === 'lunge') dist = 2.4 - 1.55 * Math.min(1, s.t / 0.14); if (s.v === 'doorway') lat = 1.4 * (1 - Math.min(1, s.t / 0.16)); if (s.v === 'grab') dist = 0.75; if (s.v === 'behind' && s.t < 0.2) dist = 1.1;
    const mx = x + fx * dist + rx * lat, mz = z + fz * dist + rz * lat; mdl.root.visible = true; mdl.root.position.set(mx, y - 2.6, mz); mdl.root.rotation.y = Math.atan2(x - mx, z - mz); animateMonster(mdl, 'scare', dt, 0);
    // frame the skull: shift the whole body so the head sits just above eye level, `dist` in front of the lens
    mdl.root.updateMatrixWorld(true); const hp = mdl.head.getWorldPosition(this._hv || (this._hv = new THREE.Vector3())); mdl.root.position.x += mx - hp.x; mdl.root.position.z += mz - hp.z; mdl.root.position.y += (y + 0.02) - (hp.y + 0.22);
    this.flash.intensity = this.flashBase * (Math.random() < 0.25 ? 0.02 : 0.09 + Math.random() * 0.08); // the torch fails as it hits you
    cam.position.set(x, y, z); cam.rotation.set(0.06 + (Math.random() - .5) * shake * 2, yaw + (Math.random() - .5) * shake * 2, (Math.random() - .5) * shake * 3, 'YXZ');
    const fov = (this.settings.fov || 78) - (R ? 6 : 16) * Math.sin(Math.min(1, k * 2) * Math.PI / 2); cam.fov = fov; cam.updateProjectionMatrix();
    this.fx.glitch = (R ? 0.3 : 1) * (1 - k * 0.7); this.fx.staticAmt = (R ? 0.25 : 0.75) * (1 - k); this.fx.damage = 1;
    if (s.t >= s.dur) { this.scare = null; me.pitch = 0; cam.fov = this.settings.fov || 78; cam.updateProjectionMatrix(); this.fx.staticAmt = 0.5; }
  }
  // false alarms & ambient scares — local only, purely cosmetic, never damage
  scareDirector(dt) {
    const me = this.me; if (!canAct(me) || this.scare || this.mon.st === 'chase') return; this.scareDir -= dt; this.updateFalse(dt);
    if (this.scareDir > 0) return; const R = this.settings.reduced; this.scareDir = (55 + Math.random() * 70) * (R ? 1.8 : 1);
    const md = Math.hypot(this.mon.x - me.x, this.mon.z - me.z); const kinds = ['phantom', 'lights', 'phone', 'knock', 'pa', 'cart', 'steps', 'whisper']; if (!R) kinds.push('bang', 'phantom');
    const k = kinds[Math.floor(Math.random() * kinds.length)]; const e = this.eye(), f = this.fwd(); const P = this.P;
    const pointAt = (d, spread) => { for (let i = 0; i < 12; i++) { const a = Math.atan2(f.x, f.z) + (Math.random() - .5) * spread; const x = me.x + Math.sin(a) * d, z = me.z + Math.cos(a) * d; const g = P.groundAt(x, z, me.y + 0.5, 1); if (g && Math.abs(g.y - me.y) < 0.5 && P.los(me.lv, me.x, me.z, me.lv, x, z)) return { x, y: g.y, z }; } return null; };
    if (k === 'phantom' && md > 22) { const pt = pointAt(15 + Math.random() * 8, 0.7); if (pt) { const ph = this.phantom; ph.root.visible = true; ph.root.position.set(pt.x, pt.y, pt.z); ph.root.rotation.y = Math.atan2(me.x - pt.x, me.z - pt.z); for (let i = 0; i < 20; i++) animateMonster(ph, 'stalk', 0.05, 0); this.falseT = { k, t: 1.4 }; this.audio.play('whisper', { x: pt.x, y: pt.y + 2, z: pt.z }, { len: 1, vol: 0.6 }); return; } }
    if (k === 'lights') { const l = this.W.lamps.filter(l => l.lv === me.lv && !l.dead && Math.hypot(l.x - me.x, l.z - me.z) < 9 && this.E.lampLevel(l, this.time) > 0.1).sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0]; if (l) { l.dead = true; this.audio.play('glass', l, { vol: R ? 0.5 : 1 }); this.audio.play('spark', l); this.fx.glitch = 0.35; return; } }
    if (k === 'phone') { const pt = pointAt(9 + Math.random() * 6, 3) || { x: me.x + 8, y: me.y, z: me.z }; this.audio.play('phone', { ...pt, y: pt.y + 1.4 }, { vol: 0.8 }); return; }
    if (k === 'knock') { const h = this.W.hides.find(h => h.lv === me.lv && Math.hypot(h.x - me.x, h.z - me.z) < 12 && Math.hypot(h.x - me.x, h.z - me.z) > 3); if (h) { this.audio.play('knock', { x: h.x, y: h.y + 1.2, z: h.z }, { n: 3 + (Math.random() * 3 | 0) }); return; } }
    if (k === 'bang') { this.audio.play('bang', { x: me.x - f.x * 6, y: me.y + 2, z: me.z - f.z * 6 }); this.fx.glitch = 0.5; return; }
    if (k === 'cart') { const pt = pointAt(6 + Math.random() * 3, 1.2); if (pt) { const c = cartMesh(); const side = Math.random() < 0.5 ? -1 : 1; const rx = Math.cos(me.yaw) * side, rz = -Math.sin(me.yaw) * side; c.position.set(pt.x - rx * 2.5, pt.y, pt.z - rz * 2.5); c.rotation.y = Math.atan2(rx, rz); this.E.scene.add(c); this.falseT = { k, t: 3, mesh: c, vx: rx * 1.6, vz: rz * 1.6 }; this.audio.play('cart', pt); return; } }
    if (k === 'steps') { const b = { x: me.x - f.x * 5, y: me.y, z: me.z - f.z * 5 }; for (let i = 0; i < 4; i++) this.audio.play('thud', { x: b.x + f.x * i * 0.8, y: b.y, z: b.z + f.z * i * 0.8 }, { delay: i * 0.55, vol: 0.4 + i * 0.12 }); return; }
    if (k === 'whisper' && this.hasItem('radio')) { this.audio.play('radio', null, { len: 1.5, vol: 0.6 }); this.say(`Officer ${me.name}…`, 0.6); return; }
    // fallback / 'pa': the PA wakes up
    this.audio.play('pa', null); setTimeout(() => { if (!this.running) return; this.audio.play('garble', { x: me.x + 6, y: me.y + 5, z: me.z }, { len: 2.4 }); this.say(['Attention shoppers. The mall is now closed.', 'Please remain where you are. Someone will find you.', 'Would the owner of a blue sedan… please come home.'][Math.floor(Math.random() * 3)], 0.4); }, 2200);
  }
  updateFalse(dt) { const f = this.falseT; if (!f) return; f.t -= dt; const me = this.me;
    if (f.k === 'phantom') { const ph = this.phantom.root; const lookAt = this.flash.intensity > 0 && (() => { const e = this.eye(), v = this.fwd(); const dx = ph.position.x - e.x, dz = ph.position.z - e.z, d = Math.hypot(dx, dz); return (dx * v.x + dz * v.z) / d > 0.97; })(); if (lookAt) f.t = Math.min(f.t, 0.25); if (f.t <= 0) { ph.visible = false; this.fx.staticAmt = Math.max(this.fx.staticAmt, 0.3); this.audio.play('staticBurst', null, { len: 0.25, vol: 0.4 }); } }
    if (f.k === 'cart' && f.mesh) { f.mesh.position.x += f.vx * dt; f.mesh.position.z += f.vz * dt; f.vx *= 0.995; f.vz *= 0.995; if (f.t <= 0) this.E.scene.remove(f.mesh); }
    if (f.t <= 0) this.falseT = null; }
  say(text, vol = 0.5) { try { if (!window.speechSynthesis || this.settings.reduced) return; const u = new SpeechSynthesisUtterance(text); u.pitch = 0.1; u.rate = 0.72; u.volume = vol * (this.settings.vol ?? 0.8); speechSynthesis.speak(u); } catch (e) { } }
  // ───────────────────────── test hooks ─────────────────────────
  debug() { return { me: this.me, mon: this.mon, AI: this.AI, P: this.P, W: this.W, match: this.match, players: this.players, items: this.items, S: this.S, game: this }; }
}
