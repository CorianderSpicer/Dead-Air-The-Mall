// "The Tenant" — monster AI. Host-authoritative, pure logic. It never reads player positions directly except through
// its senses: a sight cone with real line of sight (light makes you visible further), hearing with wall attenuation,
// and a "director" that only ever nudges it toward a rough area. States: roam, patrol, listen, investigate, search,
// stalk, hunt, chase, attack, lost, retreat, flinch, seekhide.
import { rng, angDiff, clamp } from './util.js';
import { LEVELS } from './mallplan.js';

const SPEED = { roam: 1.25, patrol: 1.2, investigate: 2.1, search: 1.6, stalk: 1.5, hunt: 3.2, chase: 4.3, retreat: 3.0, seekhide: 3.4, lost: 2.4 };
export class MonsterAI {
  constructor(P, spawn, opts = {}) {
    this.P = P; this.r = rng((opts.seed || 1) ^ 0x7e7a7); this.diff = opts.difficulty || 'normal'; this.players = opts.players || 1; this.aggrMod = (opts.modifiers || []).includes('aggressive') ? 1.25 : 1;
    this.x = spawn.x; this.z = spawn.z; this.y = spawn.y; this.lv = spawn.lv; this.yaw = 0; this.state = 'roam'; this.timer = 0; this.path = null; this.pi = 0; this.goal = null; this.speed = 0;
    this.aware = {}; this.target = null; this.lastSeen = null; this.lastHeard = null; this.events = []; this.anim = 'walk'; this.windup = 0; this.cooldown = 0; this.flinchCd = 0; this.dirTimer = 20 + this.r() * 20; this.age = 0; this.doorWait = 0; this.repath = 0; this.listenCd = 8; this.lookPhase = 0; this.seenHide = null; this.stuck = 0;
    const d = { normal: 1, hard: 1.12, nightmare: 1.25 }[this.diff]; this.k = d * this.aggrMod * (this.players === 1 ? 0.92 : 1);
  }
  get aggression() { return clamp(this.k + this.age / 900 * 0.25, 0.8, 1.7); } // grows slowly through the night
  setState(s, t = 0) { if (this.state !== s) { this.events.push({ type: 'state', state: s, prev: this.state }); this.state = s; } this.timer = t; this.path = null; this.repath = 0; }
  // ── senses ──
  sense(players, dt) {
    const P = this.P; let best = null, bestA = 0;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    for (const p of players) {
      if (p.dead || p.escaped) { this.aware[p.id] = 0; continue; }
      if (p.hidden != null) { this.aware[p.id] = Math.max(0, (this.aware[p.id] || 0) - dt * 0.3); continue; }
      const dx = p.x - this.x, dz = p.z - this.z, d = Math.hypot(dx, dz) + Math.abs(p.y - this.y) * 0.5;
      const ang = Math.abs(angDiff(this.yaw, Math.atan2(dx, dz)));
      let range = p.flashlight ? 30 : p.crouch ? 6.5 : p.sprint ? 18 : 12; if (p.lit) range *= 1.5; if (p.down) range = 9;
      // a beam in its face is noticed at long range regardless of where it looks
      const beam = p.flashlight && p.lookAtMonster && d < 32; const inFov = ang < 1.15 || d < 2.6 || beam;
      let seen = false;
      if (d < range && inFov && P.los(this.lv, this.x, this.z, p.lv, p.x, p.z)) seen = true;
      const gain = seen ? (1.6 * (1 - d / range) + (p.sprint ? 0.6 : 0) + (beam ? 1.2 : 0) + (p.flashlight ? 0.3 : 0)) * this.aggression : -0.25;
      this.aware[p.id] = clamp((this.aware[p.id] || 0) + gain * dt, 0, 2);
      if (seen) { p._seenBy = true; if (this.aware[p.id] > bestA) { bestA = this.aware[p.id]; best = p; } }
      // flinch: torchlight held on its face up close
      if (beam && d < 9 && seen && this.flinchCd <= 0) { p._beamTime = (p._beamTime || 0) + dt; if (p._beamTime > 1.4 && this.state === 'chase') { p._beamTime = 0; this.flinchCd = 14; this.setState('flinch', 0.9); this.events.push({ type: 'flinch' }); } } else if (p) p._beamTime = 0;
    }
    return best;
  }
  hear(noises) {
    let best = null, bv = 0;
    for (const n of noises) { const d = Math.hypot(n.x - this.x, n.z - this.z) + Math.abs(n.y - this.y) * 1.5; let r = n.r * (this.state === 'listen' ? 1.6 : 1) * (0.85 + 0.15 * this.aggression);
      if (n.lv !== this.lv && !(Math.abs(n.y - this.y) < 7 && this.P.los(this.lv, this.x, this.z, n.lv, n.x, n.z))) r *= 0.45; else if (!this.P.los(this.lv, this.x, this.z, n.lv, n.x, n.z)) r *= 0.6;
      if (d < r) { const v = (1 - d / r) * (n.big ? 2 : 1); if (v > bv) { bv = v; best = n; } } }
    return best ? { ...best, v: bv } : null;
  }
  // ── movement ──
  goTo(lv, x, z) { const P = this.P; const save = P.doors.map(d => d.open); P.doors.forEach(d => { if (!d.locked && !d.exit && d.kind !== 'elev') d.open = true; });
    this.path = P.findPath(this.lv, this.x, this.z, lv, x, z, true, 18000); P.doors.forEach((d, i) => d.open = save[i]); this.pi = 0; this.goal = { lv, x, z }; this.repath = 1.2 + this.r() * 0.6; return !!this.path; }
  step(dt, speed) {
    const P = this.P; if (!this.path || this.pi >= this.path.length) { this.speed = 0; return true; }
    if (this.doorWait > 0) { this.doorWait -= dt; this.speed = 0; return false; }
    const w = this.path[this.pi]; const dx = w.x - this.x, dz = w.z - this.z, d = Math.hypot(dx, dz);
    if (d < 0.35 || (w.stair && d < 0.6)) { this.pi++; return this.pi >= this.path.length; }
    // doors in the way: open (unlocked) — makes noise; locked/closed shutters: give up this path
    for (const door of P.doorsNear(this.x, this.z, 1.1)) if (!door.open && door.lv === this.lv) { if (door.locked || door.exit || door.kind === 'elev') { this.path = null; this.stuck++; return true; } door.open = true; this.doorWait = 0.55; this.events.push({ type: 'door', id: door.id, slam: this.state === 'chase' || this.state === 'hunt' }); return false; }
    const v = Math.min(d, speed * dt); const nx = this.x + dx / d * v, nz = this.z + dz / d * v;
    const [cx, cz] = P.collide(nx, nz, 0.4, this.y, 2.4); this.x = cx; this.z = cz;
    const g = P.groundAt(this.x, this.z, this.y + 0.7, 0.9); if (g) this.y += (g.y - this.y) * Math.min(1, dt * 12); else if (w.y != null) this.y += (w.y - this.y) * Math.min(1, dt * 4);
    this.lv = P.levelAtY(this.y + 0.1); const ty = Math.atan2(dx, dz); this.yaw += angDiff(this.yaw, ty) * Math.min(1, dt * 7); this.speed = speed;
    if (Math.hypot(cx - nx, cz - nz) > v * 0.8 && v > 0.01) { this.stuckT = (this.stuckT || 0) + dt; if (this.stuckT > 1.2) { this.stuckT = 0; this.path = null; this.stuck++; } } else this.stuckT = 0;
    return false;
  }
  randomPoint(nearX, nearZ, rad, lv) { const P = this.P; for (let k = 0; k < 25; k++) { const a = this.r() * Math.PI * 2, rr = rad * (0.3 + this.r() * 0.7); const x = nearX + Math.cos(a) * rr, z = nearZ + Math.sin(a) * rr; const l = lv || this.lv; if (P.nearestNav(l, x, z) >= 0 && P.roomAt(l, x, z)?.type !== 'outside') return { lv: l, x, z }; } return null; }
  roomPoint() { const P = this.P; const rooms = P.rooms.filter(r => !['void', 'stair', 'elev', 'outside', 'roof'].includes(r.type) && !P.doors.some(d => d.room === r.id && d.locked && !d.exit)); for (let k = 0; k < 20; k++) { const rm = this.r.pick(rooms); const p = P.randomFloorPoint(rm.id, this.r); if (p) return p; } return null; }
  // ── main update ──
  update(dt, players, noises, hides) {
    this.events.length = 0; this.age += dt; this.cooldown -= dt; this.flinchCd -= dt; this.repath -= dt; this.timer -= dt; this.dirTimer -= dt; this.listenCd -= dt;
    const seen = this.sense(players, dt); const heard = this.hear(noises); const A = this.aggression;
    const alive = players.filter(p => !p.dead && !p.escaped);
    if (seen && (this.aware[seen.id] > 1 || (this.aware[seen.id] > 0.6 && seen.flashlight)) && !['attack', 'retreat', 'flinch'].includes(this.state)) {
      if (this.state !== 'chase') { this.events.push({ type: 'spotted', pid: seen.id }); this.setState('chase'); } this.target = seen.id; this.lastSeen = { lv: seen.lv, x: seen.x, z: seen.z, y: seen.y, vx: seen.vx || 0, vz: seen.vz || 0, t: 0 }; }
    else if (seen && this.aware[seen.id] > 0.35 && ['roam', 'patrol', 'listen', 'search', 'investigate', 'lost'].includes(this.state)) { this.lastSeen = { lv: seen.lv, x: seen.x, z: seen.z, y: seen.y, t: 0 }; if (this.state !== 'stalk') this.setState('stalk', 10 + this.r() * 8); this.target = seen.id; }
    if (heard && !['chase', 'attack', 'flinch', 'retreat'].includes(this.state)) { this.lastHeard = heard; if (heard.v > 0.25 || heard.big) { if (this.state !== 'investigate' && this.state !== 'hunt') this.events.push({ type: 'heard', kind: heard.kind }); this.setState(heard.big || heard.v > 0.75 ? 'hunt' : 'investigate', 20); this.goTo(heard.lv, heard.x, heard.z); } else if (this.state === 'roam' || this.state === 'patrol') { this.setState('listen', 2 + this.r() * 2); } }
    // hiding: it saw you get in
    for (const p of players) if (p.hidden != null && p._justHid && (this.aware[p.id] > 0.55) && this.P.los(this.lv, this.x, this.z, p.lv, p.x, p.z)) { this.seenHide = { pid: p.id, hide: p.hidden, x: p.x, z: p.z, lv: p.lv }; this.setState('seekhide', 12); this.goTo(p.lv, p.x, p.z); }
    switch (this.state) {
      case 'roam': case 'patrol': {
        if (!this.path || this.step(dt, SPEED.roam * (0.9 + A * 0.1))) {
          // director: nudge toward the rough area of someone, never the exact spot
          if (this.dirTimer <= 0 && alive.length) { const p = this.r.pick(alive); this.dirTimer = (55 - A * 15) + this.r() * 30; const pt = this.randomPoint(p.x, p.z, 22 - A * 4, p.lv) || this.roomPoint(); if (pt) this.goTo(pt.lv, pt.x, pt.z); }
          else { const pt = this.roomPoint(); if (pt && !this.goTo(pt.lv, pt.x, pt.z)) this.stuck++; if (this.listenCd <= 0) { this.listenCd = 10 + this.r() * 12; this.setState('listen', 2.5 + this.r() * 2); } } }
        this.anim = 'walk'; break; }
      case 'listen': this.speed = 0; this.anim = 'listen'; if (this.timer <= 0) this.setState('roam'); break;
      case 'investigate': { const done = this.step(dt, SPEED.investigate * A); this.anim = 'walk'; if (done || !this.path) this.setState('search', 14 + this.r() * 8 * A); break; }
      case 'hunt': { const done = this.step(dt, SPEED.hunt * A); this.anim = 'run'; if (done || !this.path) this.setState('search', 16 + 8 * A); break; }
      case 'search': {
        if (!this.path || this.step(dt, SPEED.search * A)) { const c = this.lastSeen || this.lastHeard || this; const pt = this.randomPoint(c.x, c.z, 8, c.lv || this.lv); if (pt) this.goTo(pt.lv, pt.x, pt.z); if (this.r() < 0.35) this.events.push({ type: 'sniff' }); }
        this.anim = 'search'; if (this.timer <= 0) { this.lastSeen = null; this.events.push({ type: 'gaveup' }); this.setState('roam'); } break; }
      case 'stalk': { const t = players.find(p => p.id === this.target); const ls = this.lastSeen;
        if (ls && (!this.path || this.repath <= 0)) { const dx = this.x - ls.x, dz = this.z - ls.z, d = Math.hypot(dx, dz) || 1; const keep = 11; const px = ls.x + dx / d * keep, pz = ls.z + dz / d * keep; this.goTo(ls.lv, px, pz); }
        this.step(dt, SPEED.stalk * A); this.anim = 'stalk';
        if (t && seen === t && this.aware[t.id] > 1) this.setState('chase'); if (this.timer <= 0) this.setState(ls ? 'hunt' : 'roam', 12); if (this.state === 'hunt' && ls) this.goTo(ls.lv, ls.x, ls.z); break; }
      case 'chase': { const t = players.find(p => p.id === this.target);
        if (!t || t.dead || t.escaped || (t.down && this.players > 1)) { this.setState('retreat', 18); break; }
        const canSee = seen === t || (t.hidden == null && this.P.los(this.lv, this.x, this.z, t.lv, t.x, t.z) && Math.hypot(t.x - this.x, t.z - this.z) < 22);
        if (canSee) { this.lastSeen = { lv: t.lv, x: t.x, z: t.z, y: t.y, vx: t.vx || 0, vz: t.vz || 0, t: 0 }; this.lostT = 0; } else this.lostT = (this.lostT || 0) + dt;
        if (this.lostT > 2.6 + A) { const ls = this.lastSeen; this.events.push({ type: 'lostsight' }); this.setState('lost', 10); if (ls) this.goTo(ls.lv, ls.x + (ls.vx || 0) * 2.5, ls.z + (ls.vz || 0) * 2.5); break; }
        const d = Math.hypot(t.x - this.x, t.z - this.z), dy = Math.abs(t.y - this.y);
        if (d < 1.55 && dy < 1.2 && canSee && this.cooldown <= 0) { this.setState('attack', 0.45); this.windup = 0.45; this.events.push({ type: 'windup', pid: t.id }); break; }
        if (this.repath <= 0 || !this.path) this.goTo(t.lv, t.x, t.z);
        if (d < 3 && canSee && t.lv === this.lv) { const sp = SPEED.chase * A * dt; const ux = (t.x - this.x) / d, uz = (t.z - this.z) / d; const [cx, cz] = this.P.collide(this.x + ux * sp, this.z + uz * sp, 0.4, this.y, 2.4); this.x = cx; this.z = cz; this.yaw += angDiff(this.yaw, Math.atan2(ux, uz)) * Math.min(1, dt * 10); this.speed = SPEED.chase * A; }
        else this.step(dt, (SPEED.chase - (this.players === 1 ? 0.3 : 0)) * A);
        this.anim = 'crawl'; break; }
      case 'attack': { const t = players.find(p => p.id === this.target); this.speed = 0; this.anim = 'attack';
        if (t) this.yaw += angDiff(this.yaw, Math.atan2(t.x - this.x, t.z - this.z)) * Math.min(1, dt * 12);
        if (this.timer <= 0) { const ok = t && !t.dead && t.hidden == null && Math.hypot(t.x - this.x, t.z - this.z) < 2.1 && Math.abs(t.y - this.y) < 1.3 && this.P.los(this.lv, this.x, this.z, t.lv, t.x, t.z);
          if (ok) { this.events.push({ type: 'hit', pid: t.id, variant: this.attackVariant(t) }); this.cooldown = 2.2; this.setState(t.health <= 50 || t.down ? 'retreat' : 'chase', t.health <= 50 ? 16 + 6 / A : 0); }
          else { this.events.push({ type: 'miss' }); this.cooldown = 0.6; this.setState('chase'); } } break; }
      case 'seekhide': { const h = this.seenHide; const done = this.step(dt, SPEED.seekhide * A); this.anim = 'run'; const p = h && players.find(q => q.id === h.pid);
        if (done || !this.path) { if (p && p.hidden === h.hide) { this.target = p.id; this.events.push({ type: 'hit', pid: p.id, variant: 'pulled' }); this.cooldown = 2.5; this.setState('retreat', 16); } else this.setState('search', 12); this.seenHide = null; } break; }
      case 'lost': { const done = this.step(dt, SPEED.lost * A); this.anim = 'run'; if (done || !this.path || this.timer <= 0) this.setState('search', 14 + 8 * A); break; }
      case 'retreat': { if (!this.path) { const far = this.roomPoint(); if (far) this.goTo(far.lv, far.x, far.z); } this.step(dt, SPEED.retreat); this.anim = 'walk'; if (this.timer <= 0) this.setState('roam'); break; }
      case 'flinch': this.speed = 0; this.anim = 'flinch'; if (this.timer <= 0) this.setState('chase'); break;
    }
    if (this.stuck > 6) { this.stuck = 0; this.unstuck = (this.unstuck || 0) + 1; const pt = this.roomPoint(); if (pt) { this.setState('roam'); if (!this.goTo(pt.lv, pt.x, pt.z) && this.unstuck > 2) { // boxed in: slip away through the ducts (only when no player can see it)
      const seen = players.some(p => !p.dead && this.P.los(this.lv, this.x, this.z, p.lv, p.x, p.z) && Math.hypot(p.x - this.x, p.z - this.z) < 30); if (!seen) { this.x = pt.x; this.z = pt.z; this.y = pt.y ?? LEVELS[pt.lv].y; this.lv = pt.lv; this.unstuck = 0; this.events.push({ type: 'vent' }); } } else if (this.path) this.unstuck = 0; } }
    for (const p of players) p._justHid = false;
    return this.events;
  }
  attackVariant(t) { const ang = Math.abs(angDiff(t.yaw ?? 0, Math.atan2(this.x - t.x, this.z - t.z)));
    const door = this.P.doorsNear(t.x, t.z, 1.6).some(d => d.open); if (door && this.r() < 0.6) return 'doorway'; if (ang > 2.0) return 'behind'; if (this.state === 'attack' && this.r() < 0.25) return 'lift'; return this.r() < 0.5 ? 'lunge' : 'grab'; }
  snapshot() { return { x: +this.x.toFixed(2), y: +this.y.toFixed(2), z: +this.z.toFixed(2), yaw: +this.yaw.toFixed(2), st: this.state, an: this.anim, sp: +this.speed.toFixed(2), lv: this.lv }; }
}
