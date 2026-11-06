// First-person officer controller: feet-based capsule on the plan's walkable surfaces (floors, stairs, escalators,
// elevator car), push-out collision, gravity, stamina, crouch with head clearance, head bob, footsteps -> noise,
// flashlight battery drain / flicker, health states. Pure logic (no Three.js) so it is unit-testable.
import { clamp } from './util.js';
import { ITEMS, SLOT_CAP } from './items.js';

export const PDEF = { r: 0.32, hStand: 1.75, hCrouch: 1.05, eyeStand: 1.62, eyeCrouch: 0.98, walk: 2.6, sprint: 5.0, crouch: 1.4, grav: 18 };
export const DRAIN = { normal: 0.34, hard: 0.42, nightmare: 0.52 }; // % per second with the light on

export function newPlayer(id, name, spawn, slot = 0) {
  return { id, name, slot, x: spawn.x, y: spawn.y ?? 0, z: spawn.z, lv: spawn.lv || 'G', yaw: 0, pitch: 0, vx: 0, vz: 0, vy: 0,
    crouch: false, sprint: false, stamina: 1, exhausted: false, fl: true, batt: 100, flick: 1, health: 100, st: 'ok', downT: 0, hidden: null,
    inv: [], keys: [], pk: 0, eye: PDEF.eyeStand, bob: 0, bobPhase: 0, onGround: true, stepAcc: 0, mat: 'tile', moved: 0, spotted: 0, found: 0, hits: 0, lit: false };
}
export const isKeyring = id => ['key', 'part', 'quest'].includes(ITEMS[id]?.cat);
export const heavy = p => p.keys.includes('container');
export const slotsUsed = p => p.inv.length;
export function canTake(p, id) { if (isKeyring(id)) return true; const d = ITEMS[id]; const s = p.inv.find(e => e.id === id && e.n < (d.stack || 1)); return !!s || p.inv.length < SLOT_CAP; }
export function addItem(p, id) {
  if (isKeyring(id)) { p.keys.push(id); return true; }
  const d = ITEMS[id]; const s = p.inv.find(e => e.id === id && e.n < (d.stack || 1)); if (s) { s.n++; return true; }
  if (p.inv.length >= SLOT_CAP) return false; p.inv.push({ id, n: 1, rd: 0 }); return true;
}
export function removeItem(p, id) {
  if (isKeyring(id)) { const i = p.keys.indexOf(id); if (i < 0) return false; p.keys.splice(i, 1); return true; }
  const i = p.inv.findIndex(e => e.id === id); if (i < 0) return false; if (--p.inv[i].n <= 0) p.inv.splice(i, 1); return true;
}
export const hasItem = (p, id) => p.keys.includes(id) || p.inv.some(e => e.id === id);
export const countItem = (p, id) => p.keys.filter(k => k === id).length + p.inv.filter(e => e.id === id).reduce((a, e) => a + e.n, 0);
export const allItems = p => [...p.keys, ...p.inv.flatMap(e => Array(e.n).fill(e.id))];
export const canAct = p => p.st === 'ok' || p.st === 'injured';

// input: { mx, mz (-1..1), sprint, crouch } ; returns { steps:[{x,y,z,lv,r,kind,mat}], landed }
export function stepPlayer(p, input, dt, P, opts = {}) {
  const out = { steps: [] };
  if (!canAct(p) || p.hidden != null) { p.vx = p.vz = 0; p.sprint = false; if (p.st === 'down') { p.eye += (0.45 - p.eye) * Math.min(1, dt * 4); } return out; }
  const hv = heavy(p);
  // crouch / stand with head clearance
  if (input.crouch !== p.crouch) {
    if (input.crouch) p.crouch = true;
    else { const [tx, tz] = P.collide(p.x, p.z, PDEF.r * 0.95, p.y, PDEF.hStand); if (Math.hypot(tx - p.x, tz - p.z) < 0.02) p.crouch = false; else opts.onBlockedStand?.(); }
  }
  const mlen = Math.min(1, Math.hypot(input.mx, input.mz));
  const wantSprint = input.sprint && !p.crouch && !hv && mlen > 0.3 && input.mz > -0.2;
  if (p.stamina <= 0.001) p.exhausted = true; if (p.exhausted && p.stamina > 0.35) p.exhausted = false;
  p.sprint = wantSprint && !p.exhausted;
  const injured = p.st === 'injured' && p.pk <= 0;
  let sp = p.crouch ? PDEF.crouch : p.sprint ? PDEF.sprint : PDEF.walk; if (injured) sp *= p.sprint ? 0.82 : 0.86; if (hv) sp *= 0.85; sp *= opts.speedMul || 1;
  p.stamina = clamp(p.stamina + (p.sprint ? -0.2 : (mlen > 0.1 ? 0.11 : 0.17) * (injured ? 0.7 : 1)) * dt, 0, 1);
  const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw), rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
  let wx = fx * input.mz + rx * input.mx, wz = fz * input.mz + rz * input.mx; const wl = Math.hypot(wx, wz); if (wl > 1e-4) { wx = wx / wl * sp * mlen; wz = wz / wl * sp * mlen; } else { wx = wz = 0; }
  const acc = p.onGround ? 11 : 2; p.vx += (wx - p.vx) * Math.min(1, dt * acc); p.vz += (wz - p.vz) * Math.min(1, dt * acc);
  const h = p.crouch ? PDEF.hCrouch : PDEF.hStand;
  const ox = p.x, oz = p.z, oy = p.y;
  let [nx, nz] = P.collide(p.x + p.vx * dt, p.z + p.vz * dt, PDEF.r, p.y, h);
  let g = P.groundAt(nx, nz, p.y, 0.6);
  if (!g) { // no floor there (void, outside the map): don't walk off
    [nx, nz] = [ox, oz]; g = P.groundAt(nx, nz, p.y, 0.6); p.vx *= 0.2; p.vz *= 0.2;
  }
  p.x = nx; p.z = nz;
  if (g) {
    if (g.y >= p.y - 0.06 || (p.onGround && p.y - g.y < 0.45)) { p.y = g.y; p.vy = 0; if (!p.onGround) out.landed = true; p.onGround = true; } // snap (stairs, ramps, moving lift)
    else { p.onGround = false; p.vy -= PDEF.grav * dt; p.y += p.vy * dt; if (p.y <= g.y) { if (p.vy < -9) out.hard = -p.vy; p.y = g.y; p.vy = 0; p.onGround = true; out.landed = true; } }
    p.mat = g.s.mat || 'tile'; p.surf = g.s;
  }
  p.lv = P.levelAtY(p.y + 0.1);
  // footsteps
  const moved = Math.hypot(p.x - ox, p.z - oz); p.moved += moved;
  const sp2 = moved / Math.max(dt, 1e-4);
  if (p.onGround && sp2 > 0.3) {
    p.stepAcc += moved; const stride = p.crouch ? 0.6 : p.sprint ? 1.05 : 0.78;
    p.bobPhase += moved / stride * Math.PI;
    if (p.stepAcc >= stride) { p.stepAcc = 0; let r = p.crouch ? 2.4 : p.sprint ? 15 : 6; if (p.mat === 'metal') r *= 1.35; if (p.mat === 'carpet') r *= 0.7; if (hv) r *= 1.3;
      out.steps.push({ x: p.x, y: p.y, z: p.z, lv: p.lv, r, kind: p.sprint ? 'sprint' : 'step', mat: p.mat, big: false }); }
  } else p.stepAcc *= 0.9;
  const bobAmp = opts.bob === false ? 0 : (p.crouch ? 0.02 : p.sprint ? 0.07 : 0.04) * Math.min(1, sp2 / 2);
  p.bob += (Math.sin(p.bobPhase) * bobAmp - p.bob) * Math.min(1, dt * 12);
  const eyeT = (p.crouch ? PDEF.eyeCrouch : PDEF.eyeStand); p.eye += (eyeT - p.eye) * Math.min(1, dt * 9);
  p.vy2 = (p.y - oy) / Math.max(dt, 1e-4);
  return out;
}

// flashlight: returns the current light multiplier (0..1) including low-battery flicker
export function updateFlashlight(p, dt, diff = 'normal', t = 0) {
  if (!p.fl || p.batt <= 0 || !canAct(p) && p.st !== 'down') { if (p.batt <= 0) p.fl = false; p.flick = 0; return 0; }
  p.batt = Math.max(0, p.batt - DRAIN[diff] * dt * (p.st === 'down' ? 0.5 : 1));
  let k = 1;
  if (p.batt < 22) { const sev = 1 - p.batt / 22; const n = Math.sin(t * 31) + Math.sin(t * 17.3 + 1) + Math.sin(t * 5.1); if (n > 2.4 - sev * 1.6) k = 0.05 + Math.random() * 0.25; k *= 0.55 + 0.45 * (p.batt / 22); }
  if (p.batt <= 0) { p.fl = false; k = 0; }
  p.flick = k; return k;
}
