// Geometry builder (emits straight into merge buckets) + the furniture / clutter catalogue + per-room furnishing.
// Each room type has its own layout so shops read as real places; condition (intact/worn/damaged/wrecked/eerie) changes clutter.
import * as THREE from './three.module.js';
import { LEVELS } from './mallplan.js';

const CH = 24; // chunk size for culling
const _m = new THREE.Matrix4(), _n = new THREE.Matrix3(), _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color();
export class Builder {
  constructor(P, r, quality = 'medium') { this.P = P; this.r = r; this.q = quality; this.buckets = new Map(); this.f = { x: 0, y: 0, z: 0, rot: 0, lv: 'G' }; this.blockers = []; this.lamps = []; this.signs = []; this.spots = []; this.hides = []; this.anims = []; this.sounds = []; this.interact = []; }
  at(x, y, z, rot = 0, lv) { this.f = { x, y, z, rot, lv: lv || this.P.levelAtY(y + 0.1) }; return this; }
  bucket(mat, wx, wz) { const k = `${mat}|${this.f.lv}|${Math.floor(wx / CH)},${Math.floor(wz / CH)}`; let b = this.buckets.get(k); if (!b) this.buckets.set(k, b = { mat, lv: this.f.lv, pos: [], nor: [], uv: [], col: [], idx: [] }); return b; }
  world(lx, lz) { const c = Math.cos(this.f.rot), s = Math.sin(this.f.rot); return [this.f.x + lx * c + lz * s, this.f.z - lx * s + lz * c]; }
  mtx(lx, ly, lz, sx, sy, sz, rx = 0, ry = 0, rz = 0) { const [wx, wz] = this.world(lx, lz); _e.set(rx, this.f.rot + ry, rz, 'YXZ'); _q.setFromEuler(_e); _m.compose(_p.set(wx, this.f.y + ly, wz), _q, _s.set(sx, sy, sz)); return [wx, wz]; }
  // box centred at local (lx, ly+h/2, lz)
  box(lx, ly, lz, w, h, d, color, mat = 'plain', o = {}) {
    const [wx, wz] = this.mtx(lx, ly + h / 2, lz, 1, 1, 1, o.rx, o.ry, o.rz); const b = this.bucket(mat, wx, wz); _n.getNormalMatrix(_m); _c.set(color);
    const hw = w / 2, hh = h / 2, hd = d / 2, us = o.uv || 1;
    const F = [[[0, 0, 1], [-hw, -hh, hd], [hw, -hh, hd], [hw, hh, hd], [-hw, hh, hd], w, h], [[0, 0, -1], [hw, -hh, -hd], [-hw, -hh, -hd], [-hw, hh, -hd], [hw, hh, -hd], w, h], [[1, 0, 0], [hw, -hh, hd], [hw, -hh, -hd], [hw, hh, -hd], [hw, hh, hd], d, h], [[-1, 0, 0], [-hw, -hh, -hd], [-hw, -hh, hd], [-hw, hh, hd], [-hw, hh, -hd], d, h], [[0, 1, 0], [-hw, hh, hd], [hw, hh, hd], [hw, hh, -hd], [-hw, hh, -hd], w, d], [[0, -1, 0], [-hw, -hh, -hd], [hw, -hh, -hd], [hw, -hh, hd], [-hw, -hh, hd], w, d]];
    for (const [nrm, a, bb, c, dd, fu, fv] of F) { if (o.noBottom && nrm[1] < 0) continue; if (o.top === false && nrm[1] > 0) continue; const base = b.pos.length / 3; _v.set(...nrm).applyMatrix3(_n).normalize();
      for (const [p, u, v] of [[a, 0, 0], [bb, fu, 0], [c, fu, fv], [dd, 0, fv]]) { const q = _p.set(...p).applyMatrix4(_m); b.pos.push(q.x, q.y, q.z); b.nor.push(_v.x, _v.y, _v.z); b.uv.push(u * us, v * us); const sh = o.shade ? 1 - o.shade * (nrm[1] < 0 ? 1 : nrm[1] > 0 ? 0 : 0.4) : 1; b.col.push(_c.r * sh, _c.g * sh, _c.b * sh); }
      b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3); }
    return this;
  }
  cyl(lx, ly, lz, rt, rb, h, color, mat = 'plain', seg = 10, o = {}) {
    const [wx, wz] = this.mtx(lx, ly + h / 2, lz, 1, 1, 1, o.rx, o.ry, o.rz); const b = this.bucket(mat, wx, wz); _n.getNormalMatrix(_m); _c.set(color);
    const base = b.pos.length / 3; for (let i = 0; i <= seg; i++) { const a = i / seg * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      for (const [r0, y] of [[rb, -h / 2], [rt, h / 2]]) { const q = _p.set(ca * r0, y, sa * r0).applyMatrix4(_m); b.pos.push(q.x, q.y, q.z); _v.set(ca, (rb - rt) / h, sa).applyMatrix3(_n).normalize(); b.nor.push(_v.x, _v.y, _v.z); b.uv.push(i / seg * 2, y > 0 ? 1 : 0); b.col.push(_c.r, _c.g, _c.b); } }
    for (let i = 0; i < seg; i++) { const a = base + i * 2; b.idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    if (o.cap !== false) for (const [r0, y, ny] of [[rt, h / 2, 1], [rb, -h / 2, -1]]) { if (r0 <= 0) continue; const c0 = b.pos.length / 3; _v.set(0, ny, 0).applyMatrix3(_n).normalize(); const q0 = _p.set(0, y, 0).applyMatrix4(_m); b.pos.push(q0.x, q0.y, q0.z); b.nor.push(_v.x, _v.y, _v.z); b.uv.push(.5, .5); b.col.push(_c.r, _c.g, _c.b);
      for (let i = 0; i <= seg; i++) { const a = i / seg * Math.PI * 2; const q = _p.set(Math.cos(a) * r0, y, Math.sin(a) * r0).applyMatrix4(_m); b.pos.push(q.x, q.y, q.z); b.nor.push(_v.x, _v.y, _v.z); b.uv.push(.5 + Math.cos(a) * .5, .5 + Math.sin(a) * .5); b.col.push(_c.r, _c.g, _c.b); }
      for (let i = 0; i < seg; i++) ny > 0 ? b.idx.push(c0, c0 + i + 2, c0 + i + 1) : b.idx.push(c0, c0 + i + 1, c0 + i + 2); }
    return this;
  }
  sph(lx, ly, lz, r0, color, mat = 'plain', sy = 1) { return this.cyl(lx, ly - r0 * sy * 0.7, lz, r0 * 0.55, r0 * 0.55, r0 * sy * 1.4, color, mat, 8).cyl(lx, ly + r0 * sy * 0.5, lz, 0, r0 * 0.55, r0 * sy * 0.3, color, mat, 8, { cap: false }).cyl(lx, ly - r0 * sy * 0.98, lz, r0 * 0.55, 0, r0 * sy * 0.3, color, mat, 8, { cap: false }); }
  // quad on a wall/floor with its own texture (signs, posters, notes): queued as separate meshes
  sign(lx, ly, lz, w, h, tex, o = {}) { const [wx, wz] = this.world(lx, lz); this.signs.push({ x: wx, y: this.f.y + ly, z: wz, w, h, rot: this.f.rot + (o.ry || 0), rx: o.rx || 0, tex, glow: o.glow, lv: this.f.lv, room: o.room, flicker: o.flicker }); return this; }
  col(lx, lz, w, d, h0 = 0, h1 = 1, tag = 'prop') { const pts = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([a, b]) => this.world(lx + a, lz + b)); const xs = pts.map(p => p[0]), zs = pts.map(p => p[1]);
    const c = { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs), y0: this.f.y + h0, y1: this.f.y + h1, tag }; this.P.addCollider(c); this.lastCol = c; return this; }
  spot(lx, ly, lz, tags = '') { const [wx, wz] = this.world(lx, lz); this.spots.push({ x: wx, y: this.f.y + ly, z: wz, lv: this.f.lv, tags, room: this.room?.id }); return this; }
  hide(lx, lz, kind) { const [wx, wz] = this.world(lx, lz); this.hides.push({ x: wx, y: this.f.y, z: wz, lv: this.f.lv, kind, rot: this.f.rot, room: this.room?.id, id: this.hides.length }); return this; }
  lamp(lx, ly, lz, w, d, o = {}) { const [wx, wz] = this.world(lx, lz); this.lamps.push({ x: wx, y: this.f.y + ly, z: wz, w, d, rot: this.f.rot, lv: this.f.lv, power: o.power || 'main', flick: o.flick || 0, color: o.color || 0xfff4e0, kind: o.kind || 'panel', room: this.room?.id, range: o.range || 9 }); return this; }
  // footprint check against blockers & colliders (keeps doorways and aisles clear)
  free(lx, lz, w, d) { const pts = [[-w / 2, -d / 2], [w / 2, d / 2], [w / 2, -d / 2], [-w / 2, d / 2]].map(([a, b]) => this.world(lx + a, lz + b)); const x0 = Math.min(...pts.map(p => p[0])), x1 = Math.max(...pts.map(p => p[0])), z0 = Math.min(...pts.map(p => p[1])), z1 = Math.max(...pts.map(p => p[1]));
    for (const b of this.blockers) if (b.lv === this.f.lv && x0 < b.x1 && x1 > b.x0 && z0 < b.z1 && z1 > b.z0) return false;
    if (this.room) { const [rx0, rz0, rx1, rz1] = this.room.r; if (x0 < rx0 + 0.02 || x1 > rx1 - 0.02 || z0 < rz0 + 0.02 || z1 > rz1 - 0.02) return false; }
    return true; }
  reserve(lx, lz, w, d) { const pts = [[-w / 2, -d / 2], [w / 2, d / 2], [w / 2, -d / 2], [-w / 2, d / 2]].map(([a, b]) => this.world(lx + a, lz + b)); this.blockers.push({ lv: this.f.lv, x0: Math.min(...pts.map(p => p[0])), x1: Math.max(...pts.map(p => p[0])), z0: Math.min(...pts.map(p => p[1])), z1: Math.max(...pts.map(p => p[1])) }); }
}

// ── palette ──
const C = { white: 0xe8e8e4, offwhite: 0xd8d4c8, black: 0x1c1c1e, dark: 0x2c2e33, steel: 0x9aa0a6, chrome: 0xc8ccd0, wood: 0x8a5a3a, lightwood: 0xb48a5e, red: 0xb02a2a, green: 0x2f6f3f, blue: 0x2a4f8f, yellow: 0xd8b02a, orange: 0xd8742a, cream: 0xe8dcc0, brown: 0x5a3e2a, grey: 0x7a7a7a, teal: 0x2a7a78, pink: 0xd87aa0, purple: 0x6a3a8a, plant: 0x3f6f2f, deadplant: 0x6a5a3a, skin: 0xd8c0a8 };
const hsl = (r, s = 0.5, l = 0.45) => new THREE.Color().setHSL(r(), s, l).getHex();

// ── props (local frame: origin on the floor, front faces +z) ──
export const PROP = {
  counter(B, w = 3, d = 0.8, col = C.offwhite, top = C.dark) { B.box(0, 0, 0, w, 0.95, d, col, 'plain', { shade: 0.2 }).box(0, 0.95, 0, w + 0.06, 0.05, d + 0.06, top, 'plain'); B.col(0, 0, w, d, 0, 1); B.spot(-w * 0.3, 1.0, 0, 'counter').spot(w * 0.25, 1.0, 0, 'counter'); },
  register(B) { B.box(0, 0.95, 0, 0.4, 0.15, 0.35, C.dark).box(0, 1.1, -0.05, 0.36, 0.22, 0.04, C.black, 'screen', { rx: -0.3 }); },
  shelf(B, w = 2, h = 1.8, d = 0.5, mat = 'boxes', col = C.white) { B.box(0, 0, 0, w, h, 0.05, C.grey, 'metal').box(0, 0, 0, w, 0.12, d, C.grey, 'metal'); for (let i = 0; i < 4; i++) { const y = 0.12 + i * (h - 0.2) / 4; B.box(0, y, 0.02, w, 0.03, d, C.steel, 'metal').box(0, y + 0.03, 0.04, w - 0.05, (h - 0.2) / 4 - 0.08, d - 0.1, col, mat, { uv: 1 }); }
    B.col(0, 0, w, d + 0.05, 0, h); B.spot(0, 0.14 + (h - 0.2) / 4, 0.1, 'shelf'); },
  gondola(B, len = 6, h = 1.7, mat = 'boxes') { B.box(0, 0, 0, 0.06, h, len, C.grey, 'metal').box(0, 0, 0, 1.1, 0.1, len, C.grey, 'metal'); for (let i = 0; i < 4; i++) { const y = 0.12 + i * (h - 0.2) / 4; for (const s of [-1, 1]) B.box(s * 0.3, y, 0, 0.5, 0.03, len, C.steel, 'metal').box(s * 0.3, y + 0.03, 0, 0.42, (h - 0.2) / 4 - 0.06, len - 0.1, C.white, mat, { uv: 1 }); }
    B.col(0, 0, 1.1, len, 0, h); B.spot(0.35, 0.5, (B.r() - .5) * len * 0.8, 'shelf').spot(-0.35, 0.95, (B.r() - .5) * len * 0.8, 'shelf'); },
  rack(B, col) { B.box(0, 1.4, 0, 1.4, 0.04, 0.04, C.chrome, 'metal').box(-0.68, 0, 0, 0.04, 1.4, 0.04, C.chrome, 'metal').box(0.68, 0, 0, 0.04, 1.4, 0.04, C.chrome, 'metal').box(0, 0, 0, 1.5, 0.04, 0.5, C.chrome, 'metal');
    for (let i = 0; i < 9; i++) B.box(-0.6 + i * 0.15, 0.55, 0, 0.12, 0.85, 0.45, col ?? hsl(B.r, 0.4, 0.35 + B.r() * 0.3), 'fabric'); B.col(0, 0, 1.5, 0.5, 0, 1.5); },
  roundrack(B) { B.cyl(0, 0, 0, 0.04, 0.04, 1.3, C.chrome, 'metal', 6).cyl(0, 1.25, 0, 0.6, 0.6, 0.03, C.chrome, 'metal', 12); for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; B.box(Math.cos(a) * 0.6, 0.45, Math.sin(a) * 0.6, 0.35, 0.8, 0.12, hsl(B.r, 0.35, 0.4 + B.r() * 0.2), 'fabric', { ry: -a }); } B.col(0, 0, 1.3, 1.3, 0, 1.3); },
  mannequin(B, fallen = false, col) { const c = col ?? hsl(B.r, 0.3, 0.4); const o = fallen ? { rx: Math.PI / 2 } : {}; if (fallen) { B.box(0, 0.1, 0, 0.4, 0.22, 1.7, C.cream, 'plain').box(0, 0.12, -0.3, 0.42, 0.2, 0.6, c, 'fabric'); B.sph(0, 0.15, 0.95, 0.12, C.cream); B.col(0, 0, 0.5, 2, 0, 0.3); return; }
    B.cyl(0, 0, 0, 0.18, 0.2, 0.03, C.dark, 'metal').cyl(0, 0, 0, 0.02, 0.02, 0.8, C.chrome, 'metal', 6).box(0, 0.8, 0, 0.38, 0.6, 0.22, c, 'fabric').box(0, 1.4, 0, 0.42, 0.1, 0.24, c, 'fabric').cyl(0, 1.5, 0, 0.05, 0.05, 0.1, C.cream, 'plain', 6); B.sph(0, 1.68, 0, 0.12, C.cream, 'plain', 1.2);
    B.box(-0.25, 0.85, 0, 0.08, 0.6, 0.08, C.cream, 'plain', { rz: 0.1 }).box(0.25, 0.85, 0, 0.08, 0.6, 0.08, C.cream, 'plain', { rz: -0.1 }); B.col(0, 0, 0.45, 0.35, 0, 1.8); B.anims.push({ kind: 'mannequin', x: B.world(0, 0)[0], z: B.world(0, 0)[1], y: B.f.y, lv: B.f.lv }); },
  display(B, w = 1.6, d = 0.6) { B.box(0, 0, 0, w, 0.85, d, C.dark, 'wood').box(0, 0.85, 0, w, 0.35, d, 0x88aabb, 'plain', { top: false }); B.col(0, 0, w, d, 0, 1.2); B.spot(0, 0.9, 0, 'display'); for (let i = 0; i < 4; i++) B.box(-w / 2 + 0.2 + i * (w - 0.4) / 3, 0.88, 0, 0.12, 0.05, 0.12, B.r() > .5 ? C.yellow : C.chrome, 'metal'); },
  table(B, w = 1.2, d = 0.8, col = C.lightwood, chairs = 4, cond = 'worn') { B.box(0, 0.72, 0, w, 0.05, d, col, 'wood').box(0, 0, 0, 0.08, 0.72, 0.08, C.dark, 'metal').box(0, 0, 0, 0.6, 0.04, 0.6, C.dark, 'metal'); B.col(0, 0, w * 0.85, d * 0.85, 0, 0.78); B.spot((B.r() - .5) * w * 0.5, 0.76, 0, 'table');
    const seats = chairs === 2 ? [[0, d / 2 + 0.35, Math.PI], [0, -d / 2 - 0.35, 0]] : [[0, d / 2 + 0.35, Math.PI], [0, -d / 2 - 0.35, 0], [w / 2 + 0.35, 0, -Math.PI / 2], [-w / 2 - 0.35, 0, Math.PI / 2]];
    for (const [x, z, a] of seats.slice(0, chairs)) { const tip = (cond === 'damaged' || cond === 'wrecked') && B.r() < (cond === 'wrecked' ? 0.5 : 0.2); PROP.chair(B, x + (B.r() - .5) * 0.3, z + (B.r() - .5) * 0.3, a + (B.r() - .5) * 0.5, tip); }
    if (cond !== 'wrecked' && B.r() < 0.5) PROP.meal(B, (B.r() - .5) * 0.4, 0.75, (B.r() - .5) * 0.2, cond === 'eerie'); },
  chair(B, x, z, a, tip = false, col = C.dark) { const save = { ...B.f }; const [wx, wz] = B.world(x, z); B.at(wx, save.y, wz, save.rot + a, save.lv);
    if (tip) { B.box(0, 0.05, 0, 0.42, 0.42, 0.04, col, 'plain', { rx: Math.PI / 2 }).box(0, 0.25, -0.3, 0.42, 0.04, 0.5, col, 'plain', { rx: 0.2 }); }
    else { B.box(0, 0.44, 0, 0.42, 0.04, 0.42, col, 'plain').box(0, 0.46, -0.19, 0.42, 0.45, 0.04, col, 'plain'); for (const [u, v] of [[-.18, -.18], [.18, -.18], [-.18, .18], [.18, .18]]) B.box(u, 0, v, 0.03, 0.44, 0.03, C.steel, 'metal'); }
    B.f = save; },
  meal(B, x, y, z, fresh) { B.cyl(x, y, z, 0.13, 0.11, 0.02, C.white, 'plain', 10); B.box(x, y + 0.02, z, 0.12, fresh ? 0.04 : 0.02, 0.08, fresh ? C.orange : C.brown, 'plain'); B.cyl(x + 0.2, y, z, 0.04, 0.035, 0.12, B.r() > .5 ? C.red : C.white, 'plain', 8); },
  booth(B, w = 1.6) { B.box(0, 0, -0.5, w, 0.45, 0.55, C.red, 'fabric').box(0, 0.45, -0.72, w, 0.6, 0.12, C.red, 'fabric').box(0, 0, 0.5, w, 0.45, 0.55, C.red, 'fabric').box(0, 0.45, 0.72, w, 0.6, 0.12, C.red, 'fabric'); B.box(0, 0.72, 0, w - 0.1, 0.05, 0.7, C.lightwood, 'wood').box(0, 0, 0, 0.1, 0.72, 0.1, C.dark, 'metal'); B.col(0, 0, w, 1.6, 0, 1.0); B.spot(0, 0.76, 0, 'table'); },
  bench(B, w = 2) { B.box(0, 0.42, 0, w, 0.06, 0.45, C.wood, 'wood').box(0, 0.48, -0.2, w, 0.4, 0.05, C.wood, 'wood'); for (const u of [-w / 2 + 0.15, w / 2 - 0.15]) B.box(u, 0, 0, 0.06, 0.42, 0.45, C.dark, 'metal'); B.col(0, 0, w, 0.5, 0, 0.9); },
  planter(B, s = 1.2, dead = false) { B.box(0, 0, 0, s, 0.55, s, 0x6a6a64, 'concrete').box(0, 0.5, 0, s - 0.1, 0.06, s - 0.1, C.brown, 'plain'); const g = dead ? C.deadplant : C.plant;
    B.cyl(0, 0.55, 0, 0.05, 0.07, 1.3, C.brown, 'wood', 6); for (let i = 0; i < 6; i++) { const a = i + B.r(); B.box(Math.cos(a) * 0.25, 1.4 + B.r() * 0.6, Math.sin(a) * 0.25, 0.5, 0.06, 0.18, g, 'plain', { ry: a, rz: dead ? -0.6 : -0.25 }); } B.col(0, 0, s, s, 0, 0.6); },
  tree(B, dead = true) { B.cyl(0, 0, 0, 1.0, 1.1, 0.7, 0x6a6a64, 'concrete', 12).cyl(0, 0.68, 0, 0.95, 0.95, 0.04, C.brown, 'plain', 12).cyl(0, 0.7, 0, 0.1, 0.16, 3.6, C.brown, 'wood', 7);
    for (let i = 0; i < 7; i++) { const a = i * 0.9, h = 2.4 + B.r() * 1.6; B.cyl(Math.cos(a) * 0.5, h, Math.sin(a) * 0.5, 0.02, 0.05, 1.3, C.brown, 'wood', 5, { rz: Math.cos(a) * 0.7, rx: Math.sin(a) * 0.7 }); if (!dead || B.r() < 0.3) B.sph(Math.cos(a) * 0.9, h + 0.7, Math.sin(a) * 0.9, 0.5, dead ? C.deadplant : C.plant); } B.col(0, 0, 2, 2, 0, 0.75); },
  bin(B) { B.cyl(0, 0, 0, 0.26, 0.24, 0.85, C.dark, 'metal', 10).cyl(0, 0.85, 0, 0.27, 0.27, 0.05, C.grey, 'metal', 10); B.col(0, 0, 0.5, 0.5, 0, 0.9); },
  vending(B, col = C.red) { B.box(0, 0, 0, 0.95, 1.85, 0.8, col, 'plain', { shade: 0.2 }).box(-0.12, 0.6, 0.41, 0.6, 1.1, 0.02, C.black, 'screen').box(0.33, 0.8, 0.41, 0.18, 0.5, 0.02, C.dark, 'metal'); B.col(0, 0, 0.95, 0.8, 0, 1.85); B.lamp(-0.12, 1.15, 0.45, 0.5, 0.05, { power: 'main', flick: 0.4, color: 0xbfe0ff, kind: 'glow', range: 3 }); },
  atm(B) { B.box(0, 0, 0, 0.8, 1.7, 0.7, C.steel, 'metal').box(0, 1.1, 0.36, 0.4, 0.3, 0.02, C.black, 'screen'); B.col(0, 0, 0.8, 0.7, 0, 1.7); },
  kiosk(B, col) { const c = col ?? hsl(B.r, 0.5, 0.35); B.box(0, 0, 0, 2.4, 1.0, 1.2, c, 'plain', { shade: 0.2 }).box(0, 1.0, 0, 2.5, 0.05, 1.3, C.dark).box(-1.15, 1.05, 0, 0.06, 1.2, 0.06, C.chrome, 'metal').box(1.15, 1.05, 0, 0.06, 1.2, 0.06, C.chrome, 'metal').box(0, 2.25, 0, 2.6, 0.12, 1.4, c, 'plain'); B.col(0, 0, 2.4, 1.2, 0, 1.1); B.spot(0.5, 1.05, 0, 'counter'); },
  cart(B, tipped = false) { const o = tipped ? { rz: Math.PI / 2 } : {}; const y = tipped ? 0.3 : 0.25; B.box(0, y, 0, 0.55, 0.45, 0.85, C.chrome, 'metal', o); if (!tipped) { B.box(0, 0.06, 0, 0.5, 0.04, 0.8, C.steel, 'metal').box(0, 0.75, -0.45, 0.55, 0.03, 0.05, C.red, 'plain'); for (const [u, v] of [[-.22, -.35], [.22, -.35], [-.22, .35], [.22, .35]]) B.cyl(u, 0, v, 0.05, 0.05, 0.06, C.black, 'plain', 6); } B.col(0, 0, 0.6, 0.9, 0, 0.9); },
  boxpile(B, n = 4) { for (let i = 0; i < n; i++) B.box((B.r() - .5) * 1.2, i < 2 ? 0 : 0.45, (B.r() - .5) * 0.8, 0.5 + B.r() * 0.3, 0.45, 0.4 + B.r() * 0.3, 0xa07850, 'plain', { ry: B.r() }); B.col(0, 0, 1.4, 1.0, 0, 0.9); B.spot(0, 0.95, 0, 'crate'); },
  pallet(B) { B.box(0, 0, 0, 1.2, 0.14, 1.0, 0x9a7a52, 'wood'); for (let i = 0; i < 2; i++) B.box((B.r() - .5) * 0.4, 0.14 + i * 0.5, (B.r() - .5) * 0.3, 1.0, 0.5, 0.8, 0xa07850, 'plain'); B.col(0, 0, 1.2, 1.0, 0, 1.1); B.spot(0, 1.15, 0, 'crate'); },
  rackHigh(B, len = 4) { for (const u of [-len / 2, len / 2]) for (const v of [-0.5, 0.5]) B.box(u, 0, v, 0.08, 3.2, 0.08, C.blue, 'metal'); for (let i = 0; i < 3; i++) { B.box(0, 0.4 + i * 1.05, 0, len, 0.08, 1.1, C.orange, 'metal'); for (let k = 0; k < len; k += 1.3) if (B.r() > .25) B.box(-len / 2 + 0.6 + k, 0.48 + i * 1.05, 0, 1.0, 0.6 + B.r() * 0.3, 0.9, 0xa07850, 'plain'); } B.col(0, 0, len, 1.1, 0, 3.2); B.spot(0, 0.48, 0.3, 'crate').spot(-len * 0.3, 1.53, 0.3, 'crate'); },
  locker(B, n = 3, hideable = true) { for (let i = 0; i < n; i++) { B.box(-((n - 1) * 0.25) + i * 0.5, 0, 0, 0.48, 1.9, 0.5, 0x5a6a7a, 'metal', { shade: 0.2 }); for (let k = 0; k < 3; k++) B.box(-((n - 1) * 0.25) + i * 0.5, 1.55 + k * 0.06, 0.26, 0.3, 0.02, 0.01, C.black); } B.col(0, 0, n * 0.5, 0.5, 0, 1.9); if (hideable) B.hide(0, 0.6, 'locker'); },
  desk(B, monitor = true, cond = 'worn') { B.box(0, 0.72, 0, 1.4, 0.04, 0.7, C.lightwood, 'wood').box(-0.65, 0, 0, 0.05, 0.72, 0.65, C.grey, 'metal').box(0.65, 0, 0, 0.05, 0.72, 0.65, C.grey, 'metal').box(0.45, 0, 0, 0.4, 0.68, 0.6, C.grey, 'metal');
    if (monitor) { B.box(0, 0.76, -0.15, 0.2, 0.05, 0.15, C.dark).box(0, 0.8, -0.18, 0.55, 0.35, 0.04, C.black, cond === 'eerie' ? 'screen' : 'plain'); B.box(0, 0.76, 0.12, 0.45, 0.02, 0.15, C.dark); }
    for (let i = 0; i < 3; i++) if (B.r() > 0.4) B.box(-0.45 + B.r() * 0.3, 0.76 + i * 0.01, 0.05, 0.21, 0.01, 0.29, C.white, 'plain', { ry: B.r() });
    PROP.chair(B, 0, 0.6, Math.PI + (B.r() - .5) * 0.6, cond === 'wrecked' && B.r() < 0.4); B.col(0, 0, 1.4, 0.7, 0, 0.78); B.spot(-0.4, 0.77, 0, 'desk'); },
  filing(B) { B.box(0, 0, 0, 0.5, 1.3, 0.6, C.grey, 'metal', { shade: 0.2 }); for (let k = 0; k < 4; k++) B.box(0, 0.2 + k * 0.3, 0.31, 0.15, 0.03, 0.02, C.chrome, 'metal'); B.col(0, 0, 0.5, 0.6, 0, 1.3); B.spot(0, 1.32, 0, 'desk'); },
  monitors(B, w = 3) { B.box(0, 0, 0, w, 0.8, 0.6, C.dark, 'metal'); for (let r = 0; r < 3; r++) for (let c = 0; c < Math.floor(w / 0.6); c++) B.box(-w / 2 + 0.3 + c * 0.6, 1.0 + r * 0.42, -0.2, 0.55, 0.38, 0.06, C.black, 'screen'); B.col(0, 0, w, 0.6, 0, 2.3); B.spot(0.5, 0.82, 0.1, 'desk'); },
  server(B) { B.box(0, 0, 0, 0.6, 2.0, 0.9, C.black, 'metal'); for (let k = 0; k < 12; k++) B.box(0, 0.15 + k * 0.15, 0.46, 0.5, 0.08, 0.01, k % 3 ? 0x1a2a1a : 0x2a1a1a, 'plain'); B.col(0, 0, 0.6, 0.9, 0, 2); },
  tvwall(B, w = 4) { for (let i = 0; i < Math.floor(w / 1.1); i++) for (let j = 0; j < 2; j++) B.box(-w / 2 + 0.6 + i * 1.1, 1.2 + j * 0.7, 0, 1.0, 0.6, 0.06, C.black, j + i % 2 ? 'plain' : 'screen'); },
  arcade(B, col) { const c = col ?? hsl(B.r, 0.7, 0.35); B.box(0, 0, 0, 0.75, 1.75, 0.8, c, 'plain', { shade: 0.3 }).box(0, 1.05, 0.25, 0.6, 0.5, 0.05, C.black, 'screen', { rx: -0.25 }).box(0, 0.85, 0.42, 0.7, 0.08, 0.25, C.dark).box(0, 1.65, 0.3, 0.7, 0.2, 0.05, c, 'emissive'); B.col(0, 0, 0.75, 0.8, 0, 1.75); B.lamp(0, 1.3, 0.5, 0.4, 0.1, { flick: 0.6, color: 0x9fd8ff, kind: 'glow', range: 2.5 }); },
  seatsRow(B, n = 8) { for (let i = 0; i < n; i++) { const x = -n * 0.3 + i * 0.6 + 0.3; B.box(x, 0.4, 0, 0.52, 0.12, 0.5, C.red, 'fabric').box(x, 0.5, -0.24, 0.52, 0.55, 0.1, C.red, 'fabric').box(x - 0.28, 0, 0, 0.06, 0.68, 0.5, C.dark); } B.col(0, 0, n * 0.6, 0.6, 0, 1.0); },
  bookcase(B, w = 2, h = 2.2) { B.box(0, 0, 0, w, h, 0.4, C.wood, 'wood'); for (let i = 0; i < 5; i++) B.box(0, 0.1 + i * (h - 0.15) / 5, 0.04, w - 0.08, (h - 0.15) / 5 - 0.05, 0.34, C.white, 'books'); B.col(0, 0, w, 0.4, 0, h); B.spot(0.3, 0.12 + (h - 0.15) / 5, 0.15, 'shelf'); },
  bed(B, col = C.blue) { B.box(0, 0, 0, 1.5, 0.45, 2.0, C.wood, 'wood').box(0, 0.45, 0.05, 1.45, 0.15, 1.85, C.white, 'fabric').box(0, 0.6, 0.3, 1.45, 0.06, 1.3, col, 'fabric').box(0, 0, -1.0, 1.5, 1.0, 0.08, C.wood, 'wood'); B.col(0, 0, 1.5, 2.0, 0, 0.7); },
  sofa(B, col = C.brown) { B.box(0, 0, 0, 2.0, 0.42, 0.85, col, 'fabric').box(0, 0.42, -0.33, 2.0, 0.45, 0.2, col, 'fabric').box(-0.95, 0.42, 0, 0.15, 0.25, 0.85, col, 'fabric').box(0.95, 0.42, 0, 0.15, 0.25, 0.85, col, 'fabric'); B.col(0, 0, 2, 0.85, 0, 0.9); },
  hospitalBed(B) { B.box(0, 0.4, 0, 0.95, 0.15, 2.0, C.white, 'fabric').box(0, 0, 0, 0.9, 0.4, 1.9, C.steel, 'metal').box(0, 0.55, -0.85, 0.95, 0.5, 0.06, C.steel, 'metal'); B.col(0, 0, 0.95, 2, 0, 0.7); B.spot(0.3, 0.56, 0.4, 'bed'); },
  stall(B, hide = true) { B.box(-0.6, 0.15, 0, 0.04, 1.8, 1.4, 0x6a8a9a, 'plain').box(0.6, 0.15, 0, 0.04, 1.8, 1.4, 0x6a8a9a, 'plain').box(0.15, 0.15, 0.7, 0.85, 1.8, 0.04, 0x6a8a9a, 'plain', { ry: 0.5 }); B.box(0, 0, -0.45, 0.4, 0.45, 0.55, C.white, 'plain'); B.col(-0.6, 0, 0.06, 1.4, 0, 2).col(0.6, 0, 0.06, 1.4, 0, 2); if (hide) B.hide(0, -0.1, 'stall'); },
  sinks(B, n = 3) { B.box(0, 0.8, 0, n * 0.8, 0.12, 0.55, C.white, 'tile'); for (let i = 0; i < n; i++) B.cyl(-n * 0.4 + 0.4 + i * 0.8, 0.86, 0, 0.18, 0.15, 0.08, C.white, 'plain', 10); B.box(0, 1.3, -0.25, n * 0.8, 0.9, 0.02, 0x9ab0c0, 'metal'); B.col(0, 0, n * 0.8, 0.55, 0, 0.95); },
  fridge(B, w = 2.4) { B.box(0, 0, 0, w, 2.1, 0.8, C.white, 'plain', { shade: 0.2 }); for (let i = 0; i < 3; i++) B.box(-w / 2 + w / 6 + i * w / 3, 0.2, 0.41, w / 3 - 0.06, 1.7, 0.02, 0x8fb0c0, 'boxes'); B.col(0, 0, w, 0.8, 0, 2.1); B.lamp(0, 2.0, 0.45, w * 0.8, 0.05, { power: 'main', flick: 0.3, color: 0xdff2ff, kind: 'glow', range: 3 }); B.spot(0, 0.3, 0.3, 'shelf'); },
  checkout(B) { B.box(0, 0, 0, 0.8, 0.9, 2.4, C.offwhite, 'plain', { shade: 0.2 }).box(0, 0.9, 0.3, 0.6, 0.03, 1.6, C.black).box(0, 0.93, -0.8, 0.4, 0.15, 0.35, C.dark); B.box(0.2, 0.93, -0.8, 0.05, 0.3, 0.05, C.grey).box(0.2, 1.23, -0.8, 0.3, 0.22, 0.04, C.black, 'screen'); B.col(0, 0, 0.8, 2.4, 0, 1); B.spot(0, 0.95, 0.2, 'counter'); },
  produce(B) { B.box(0, 0, 0, 2, 0.75, 1.2, C.wood, 'wood', { rx: 0 }); for (let i = 0; i < 8; i++) B.sph(-0.8 + (i % 4) * 0.55, 0.85, i < 4 ? -0.3 : 0.3, 0.22, [0x6a8a2a, 0xa02a2a, 0xc8a02a, 0x4a3a2a][i % 4], 'plain', 0.6); B.col(0, 0, 2, 1.2, 0, 1); },
  car(B, col) { const c = col ?? [0x7a1a1a, 0x1a2a4a, 0x2a2a2a, 0xc8c8c8, 0x3a4a3a, 0x8a8a7a][Math.floor(B.r() * 6)];
    B.box(0, 0.25, 0, 1.8, 0.65, 4.4, c, 'metal', { shade: 0.15 }).box(0, 0.9, -0.2, 1.6, 0.55, 2.3, c, 'metal').box(0, 0.95, 0.96, 1.5, 0.45, 0.04, 0x223344, 'plain', { rx: 0.5 }).box(0, 0.95, -1.36, 1.5, 0.45, 0.04, 0x223344, 'plain', { rx: -0.5 });
    for (const [u, v] of [[-.85, 1.4], [.85, 1.4], [-.85, -1.4], [.85, -1.4]]) B.cyl(u, 0.34, v, 0.33, 0.33, 0.24, C.black, 'plain', 10, { rz: Math.PI / 2 }); B.box(-0.6, 0.55, 2.2, 0.3, 0.12, 0.02, 0xd8d8b0, 'emissive').box(0.6, 0.55, 2.2, 0.3, 0.12, 0.02, 0xd8d8b0, 'emissive'); B.col(0, 0, 1.85, 4.45, 0, 1.45); B.spot(0.6, 0.9, 0.5, 'car'); },
  policeCar(B) { PROP.car(B, 0x15181e); B.box(0, 0.6, 0, 1.82, 0.3, 1.6, 0xe8e8e8, 'metal').box(0, 1.47, -0.2, 1.2, 0.12, 0.25, C.dark).box(-0.35, 1.5, -0.2, 0.45, 0.1, 0.22, 0xff2020, 'emissive').box(0.35, 1.5, -0.2, 0.45, 0.1, 0.22, 0x2040ff, 'emissive');
    B.lamp(-0.4, 1.7, -0.2, 0.3, 0.3, { power: 'always', kind: 'siren', color: 0xff2020, range: 14 }); B.lamp(0.4, 1.7, -0.2, 0.3, 0.3, { power: 'always', kind: 'siren2', color: 0x2040ff, range: 14 }); },
  pillar(B, h = 6, r0 = 0.45, round = true) { if (round) B.cyl(0, 0, 0, r0, r0, h, C.offwhite, 'plaster', 14); else B.box(0, 0, 0, r0 * 2, h, r0 * 2, 0x8a8a86, 'concrete'); B.col(0, 0, r0 * 2, r0 * 2, 0, h, 'pillar'); },
  fountain(B, water) { B.cyl(0, 0, 0, 3.2, 3.3, 0.55, 0x9a9a92, 'marble', 20).cyl(0, 0.4, 0, 3.0, 3.0, 0.1, water ? 0x30404a : 0x6a6a64, water ? 'water' : 'concrete', 20).cyl(0, 0.5, 0, 0.4, 0.6, 1.4, 0x9a9a92, 'marble', 12).cyl(0, 1.9, 0, 1.2, 0.5, 0.25, 0x9a9a92, 'marble', 14); B.col(0, 0, 6.2, 6.2, 0, 0.6); B.spot(2.6, 0.55, 0, 'floor'); },
  directory(B) { B.box(0, 0, 0, 1.2, 2.2, 0.25, C.dark, 'metal').box(0, 0.6, 0.13, 1.0, 1.4, 0.02, 0x2a3a4a, 'screen'); B.col(0, 0, 1.2, 0.3, 0, 2.2); },
  stroller(B) { B.box(0, 0.35, 0, 0.5, 0.35, 0.7, C.blue, 'fabric').cyl(0, 0.7, -0.2, 0.3, 0.3, 0.05, C.blue, 'fabric', 8, { rx: 1.2 }); for (const [u, v] of [[-.22, -.25], [.22, -.25], [-.22, .25], [.22, .25]]) B.cyl(u, 0, v, 0.08, 0.08, 0.04, C.black, 'plain', 6, { rz: Math.PI / 2 }); },
  bags(B, n = 3) { for (let i = 0; i < n; i++) { const fall = B.r() < 0.5; B.box((B.r() - .5) * 0.8, 0, (B.r() - .5) * 0.6, 0.35, fall ? 0.12 : 0.4, fall ? 0.4 : 0.12, hsl(B.r, 0.5, 0.5), 'plain', { ry: B.r() * 3 }); } },
  debris(B, n = 6) { for (let i = 0; i < n; i++) B.box((B.r() - .5) * 2, 0, (B.r() - .5) * 2, 0.1 + B.r() * 0.5, 0.03 + B.r() * 0.15, 0.1 + B.r() * 0.4, [0x8a8a86, 0x6a6a64, 0xd0d0cc, 0x5a4a3a][i % 4], i % 3 ? 'concrete' : 'ceiling', { ry: B.r() * 3, rx: (B.r() - .5) * 0.6 }); },
  ceilingPanel(B) { B.box((B.r() - .5) * 1.5, 0.02, (B.r() - .5) * 1.5, 0.6, 0.02, 0.6, 0xd0d0cc, 'ceiling', { ry: B.r() * 3, rx: (B.r() - .5) * 0.3 }); },
  papers(B, n = 6) { for (let i = 0; i < n; i++) B.box((B.r() - .5) * 2.5, 0.005 + i * 0.002, (B.r() - .5) * 2.5, 0.21, 0.004, 0.29, C.white, 'plain', { ry: B.r() * 6 }); },
  puddle(B, s = 1.5) { B.cyl(0, 0.01, 0, s, s * 0.9, 0.012, 0x30363c, 'water', 14); },
  glassShards(B, len = 3) { for (let i = 0; i < 14; i++) B.box((B.r() - .5) * len, 0.005, B.r() * 1.2, 0.05 + B.r() * 0.2, 0.01, 0.04 + B.r() * 0.15, 0xa8c8d8, 'plain', { ry: B.r() * 6 }); },
  pipes(B, len, h, n = 3) { for (let i = 0; i < n; i++) B.cyl(0, h - 0.2 - i * 0.28, 0, 0.09 + (i % 2) * 0.05, 0.09 + (i % 2) * 0.05, len, [0x7a5a3a, 0x5a6a7a, 0x8a3a2a][i % 3], 'metal', 8, { rx: Math.PI / 2 }); },
  generator(B) { B.box(0, 0, 0, 3.2, 1.8, 1.6, 0x3a5a3a, 'metal', { shade: 0.2 }).box(0, 1.8, 0, 2.6, 0.5, 1.2, 0x2a3a2a, 'metal').cyl(1.2, 2.3, 0.4, 0.15, 0.15, 1.2, C.dark, 'metal', 8).box(-1.62, 0.6, 0, 0.04, 0.8, 1.0, C.dark, 'plain'); B.col(0, 0, 3.2, 1.6, 0, 2.4); },
  panel(B, w = 1.2) { B.box(0, 0.3, 0, w, 1.8, 0.35, 0x8a8f94, 'metal', { shade: 0.2 }); for (let i = 0; i < 4; i++) B.box(-w / 2 + 0.2 + i * (w - 0.3) / 3, 1.5, 0.18, 0.12, 0.08, 0.01, i % 2 ? 0xa02020 : 0x20a020, 'emissive'); B.box(0, 0.9, 0.18, w * 0.6, 0.02, 0.01, C.yellow); B.col(0, 0, w, 0.4, 0, 2.1); },
  boiler(B) { B.cyl(0, 0, 0, 0.9, 0.9, 2.6, 0x7a6a5a, 'metal', 14).cyl(0, 2.6, 0, 0.3, 0.9, 0.3, 0x6a5a4a, 'metal', 14); B.col(0, 0, 1.8, 1.8, 0, 2.9); },
  forklift(B) { B.box(0, 0.2, 0, 1.1, 1.0, 1.8, C.yellow, 'metal').box(0, 1.2, -0.3, 1.0, 1.1, 0.05, C.dark).box(0, 0, 1.1, 0.9, 0.06, 1.0, C.dark, 'metal'); for (const [u, v] of [[-.5, .6], [.5, .6], [-.5, -.6], [.5, -.6]]) B.cyl(u, 0.25, v, 0.25, 0.25, 0.2, C.black, 'plain', 8, { rz: Math.PI / 2 }); B.col(0, 0, 1.2, 2.6, 0, 2.2); },
  trailer(B) { B.box(0, 1.2, 0, 2.5, 2.7, 9, 0xd8d8d0, 'corrugated', { uv: 3 }); for (const v of [-3.5, -2.3, 3]) for (const u of [-1, 1]) B.cyl(u, 0.45, v, 0.45, 0.45, 0.3, C.black, 'plain', 10, { rz: Math.PI / 2 }); B.col(0, 0, 2.6, 9.1, 0, 3.9); },
  popcorn(B) { B.box(0, 0.95, 0, 0.6, 0.8, 0.5, 0xc81a1a, 'plain').box(0, 1.05, 0.02, 0.5, 0.55, 0.48, 0xf2e2a0, 'plain', { top: false }); },
  softplay(B) { for (let i = 0; i < 4; i++) B.box(-1.5 + i, 0, 0, 0.9, 0.5 + (i % 2) * 0.4, 2.5, [C.red, C.yellow, C.blue, C.green][i], 'fabric'); B.box(0, 1.2, 0, 4, 0.1, 2.6, C.blue, 'fabric'); B.col(0, 0, 4, 2.6, 0, 1.4); for (let i = 0; i < 30; i++) B.sph((B.r() - .5) * 4, 0.08, 1.6 + B.r() * 0.8, 0.07, [C.red, C.yellow, C.blue, C.green][i % 4], 'plain'); },
  teddy(B) { B.sph(0, 0.5, 0, 0.45, 0x8a5a3a, 'fabric').sph(0, 1.15, 0, 0.3, 0x8a5a3a, 'fabric').sph(-0.22, 1.4, 0, 0.1, 0x8a5a3a, 'fabric').sph(0.22, 1.4, 0, 0.1, 0x8a5a3a, 'fabric'); B.col(0, 0, 0.9, 0.9, 0, 1.4); },
  records(B) { B.box(0, 0, 0, 1.8, 0.85, 0.7, C.wood, 'wood'); for (let i = 0; i < 16; i++) B.box(-0.8 + i * 0.105, 0.85, 0, 0.012, 0.32, 0.31, hsl(B.r, 0.6, 0.4), 'plain', { rz: (B.r() - .5) * 0.4 }); B.col(0, 0, 1.8, 0.7, 0, 1.2); B.spot(0.5, 0.86, 0.2, 'display'); },
  guitars(B, n = 5) { for (let i = 0; i < n; i++) { const x = -n * 0.3 + i * 0.6; B.box(x, 1.0, 0, 0.36, 0.5, 0.08, hsl(B.r, 0.6, 0.35), 'wood').box(x, 1.5, 0, 0.06, 0.7, 0.04, C.brown, 'wood'); } },
  shoes(B, w = 2) { B.box(0, 0, 0, w, 2.0, 0.35, C.white, 'plain'); for (let i = 0; i < 5; i++) for (let k = 0; k < Math.floor(w / 0.35); k++) B.box(-w / 2 + 0.2 + k * 0.35, 0.2 + i * 0.38, 0.1, 0.28, 0.1, 0.12, hsl(B.r, 0.5, 0.4), 'plain'); B.col(0, 0, w, 0.4, 0, 2); B.spot(0, 0.58, 0.1, 'shelf'); },
  hvac(B) { B.box(0, 0, 0, 2.4, 1.4, 1.8, 0x9aa0a6, 'metal', { shade: 0.2 }); B.cyl(0, 1.4, 0, 0.6, 0.6, 0.12, C.dark, 'metal', 12); B.col(0, 0, 2.4, 1.8, 0, 1.6); },
  generatorTable(B) { PROP.desk(B, false); },
  mopBucket(B) { B.cyl(0, 0, 0, 0.25, 0.22, 0.35, C.yellow, 'plain', 10).cyl(0.1, 0.3, 0, 0.015, 0.015, 1.3, C.wood, 'wood', 5, { rz: 0.25 }); },
  coatRack(B) { B.cyl(0, 0, 0, 0.03, 0.03, 1.8, C.dark, 'metal', 5).box(0.15, 1.1, 0, 0.3, 0.6, 0.15, C.brown, 'fabric', { rz: 0.1 }); },
};

// ── per-room furnishing ──────────────────────────────────────────────────────────────────────────────────────────
// Room-local frame: u across the front (0..W), v from the front inward (0..D). F(u, v, faceRot) places B.
function frameOf(rm) {
  const [x0, z0, x1, z1] = rm.r; let side = Object.entries(rm.sides || {}).find(([, k]) => k === 'front')?.[0] || rm.doors?.[0]?.side || 's';
  if (['atrium', 'hall', 'balcony', 'market', 'foodcourt', 'parking', 'roof', 'gallery', 'cinemalobby', 'dock'].includes(rm.type)) side = rm.type === 'market' ? 's' : side;
  const W = side === 'n' || side === 's' ? x1 - x0 : z1 - z0, D = side === 'n' || side === 's' ? z1 - z0 : x1 - x0;
  const map = { n: (u, v) => [x0 + u, z0 + v, Math.PI], s: (u, v) => [x1 - u, z1 - v, 0], w: (u, v) => [x0 + v, z1 - u, -Math.PI / 2], e: (u, v) => [x1 - v, z0 + u, Math.PI / 2] }[side];
  return { W, D, side, map };
}
export function furnishAll(B, P, r) {
  // clearances for doors, shopfront entrances and stair/elevator entries
  for (const d of P.doors) { const [a, b, c, e] = d.seg; const pad = d.kind === 'gate' || d.kind === 'dockdoor' || d.kind === 'entrance' ? 4 : 1.8; B.blockers.push({ lv: d.lv, x0: Math.min(a, c) - (d.axis === 'z' ? pad : 0.6), x1: Math.max(a, c) + (d.axis === 'z' ? pad : 0.6), z0: Math.min(b, e) - (d.axis === 'x' ? pad : 0.6), z1: Math.max(b, e) + (d.axis === 'x' ? pad : 0.6) }); }
  for (const s of P.shutters) { const [a, b, c, e] = s.seg; B.blockers.push({ lv: s.lv, x0: Math.min(a, c) - (s.axis === 'z' ? 3 : 0.3), x1: Math.max(a, c) + (s.axis === 'z' ? 3 : 0.3), z0: Math.min(b, e) - (s.axis === 'x' ? 3 : 0.3), z1: Math.max(b, e) + (s.axis === 'x' ? 3 : 0.3) }); }
  for (const L of P.links) for (const p of [L.a, L.b]) B.blockers.push({ lv: p.lv, x0: p.x - 2, x1: p.x + 2, z0: p.z - 2, z1: p.z + 2 });
  B.blockers.push({ lv: 'G', x0: -9, x1: 3, z0: 9.5, z1: 13.5 }, { lv: 'U', x0: 1, x1: 4, z0: 9.5, z1: 13.5 }, { lv: 'G', x0: -3, x1: 3, z0: -11, z1: -8 }, { lv: 'U', x0: -3, x1: 3, z0: -11, z1: -9 }, { lv: 'B', x0: -3, x1: 3, z0: -11, z1: -8 });
  for (const rm of P.rooms) { if (['void', 'stair', 'elev'].includes(rm.type)) continue; B.room = rm; const fn = ROOMFN[rm.type] || ROOMFN.generic; try { fn(B, rm, frameOf(rm), r, P); } catch (e) { console.warn('furnish', rm.id, e); } addCondition(B, rm, r); }
  B.room = null;
}
function put(B, rm, Fr, u, v, rot, fn, w, d, ...args) { const [x, z, base] = Fr.map(u, v); B.at(x, LEVELS[rm.lv[0]].y, z, base + rot, rm.lv[0]); if (w && !B.free(0, 0, w, d)) return false; fn(B, ...args); if (w) B.reserve(0, 0, w, d); return true; }
const ceilLamps = (B, rm, h, step = 4, o = {}) => { const [x0, z0, x1, z1] = rm.r; const y = LEVELS[rm.lv[0]].y; for (let x = x0 + step / 2; x < x1; x += step) for (let z = z0 + step / 2; z < z1; z += step) { B.at(x, y, z, 0, rm.lv[0]); B.lamp(0, h - 0.05, 0, 1.2, 0.3, { flick: o.flick ?? (rm.cond === 'damaged' ? 0.3 : rm.cond === 'wrecked' ? 0.6 : 0.05), power: rm.cond === 'eerie' ? 'backup' : o.power || 'main', range: o.range || 8, color: o.color }); } };
const ROOMFN = {
  generic(B, rm, F, r) { ceilLamps(B, rm, 3.4); },
  atrium(B, rm, F, r, P) { const y = 0; B.at(0, y, 0, 0, 'G'); PROP.fountain(B, r() < 0.5); for (const [x, z] of [[-12, -10], [12, -10], [-12, 8], [12, 8]]) { B.at(x, y, z, r() * 6, 'G'); PROP.tree(B, true); }
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, x = Math.cos(a) * 6.2, z = Math.sin(a) * 6.2 - 1; if (z > 8.5 && x < 3) continue; B.at(x, y, z, -a + Math.PI / 2, 'G'); if (B.free(0, 0, 2, 0.6)) { PROP.bench(B); B.reserve(0, 0, 2, 0.6); } }
    for (const [x, z] of [[-9, -2], [9, 2]]) { B.at(x, y, z, r() * 3, 'G'); if (B.free(0, 0, 2.6, 1.4)) { PROP.kiosk(B); B.reserve(0, 0, 2.6, 1.4); } }
    for (const [x, z] of [[-14, -12], [14, -12], [-14, 12], [14, 12], [-11.5, -9.5], [11.5, -9.5], [-11.5, 9.5], [11.5, 9.5]]) { B.at(x, 0, z, 0, 'G'); PROP.pillar(B, 6, 0.45); }
    B.at(5, 0, 6, 0.3, 'G'); PROP.directory(B); B.at(-5, 0, 5, 0, 'G'); PROP.stroller(B); PROP.bags(B, 3);
    for (let x = -12; x <= 12; x += 6) for (const z of [-12.5, 12.5]) { B.at(x, 0, z, 0, 'G'); B.lamp(0, 5.9, 0, 1.4, 0.4, { flick: 0.15 }); }
    B.at(0, 6, 0, 0, 'U'); B.lamp(0, 8.5, 0, 2, 2, { kind: 'moon', power: 'always', color: 0x6f86b8, range: 22 }); },
  hall(B, rm, F, r) { const [x0, z0, x1, z1] = rm.r, y = LEVELS[rm.lv[0]].y, lv = rm.lv[0], cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, horiz = x1 - x0 > z1 - z0;
    const len = horiz ? x1 - x0 : z1 - z0; for (let k = 4; k < len - 2; k += 8) { const x = horiz ? x0 + k : cx, z = horiz ? cz : z0 + k; const kind = r();
      B.at(x + (horiz ? 0 : 0), y, z, horiz ? 0 : Math.PI / 2, lv);
      if (kind < 0.3) { if (B.free(0, 0, 1.4, 1.4)) { PROP.planter(B, 1.2, r() < 0.7); B.reserve(0, 0, 1.4, 1.4); } }
      else if (kind < 0.55) { for (const s of [-1, 1]) { B.at(x + (horiz ? 0 : s * 1.2), y, z + (horiz ? s * 1.2 : 0), (horiz ? 0 : Math.PI / 2) + (s > 0 ? Math.PI : 0), lv); if (B.free(0, 0, 2, 0.6)) { PROP.bench(B); B.reserve(0, 0, 2, 0.6); } } }
      else if (kind < 0.75) { if (B.free(0, 0, 2.6, 1.4)) { PROP.kiosk(B); B.reserve(0, 0, 2.6, 1.4); } }
      else { B.at(x, y, z + (horiz ? 3.4 : 0), horiz ? Math.PI : 0, lv); if (B.free(0, 0, 1, 0.9)) { (r() < 0.5 ? PROP.vending : PROP.atm)(B); B.reserve(0, 0, 1, 0.9); } }
      B.at(x + (horiz ? 3 : 2.6), y, z + (horiz ? -3.2 : 3), 0, lv); if (B.free(0, 0, 0.6, 0.6)) { PROP.bin(B); B.reserve(0, 0, 0.6, 0.6); }
      if (r() < 0.25) { B.at(x + (r() - .5) * 4, y, z + (r() - .5) * 4, r() * 6, lv); if (B.free(0, 0, 1, 1)) PROP.cart(B, r() < 0.4); }
      B.at(x, y, z, 0, lv); B.lamp(0, LEVELS[lv].h - 0.1, 0, 1.6, 0.4, { flick: rm.cond === 'damaged' ? 0.35 : 0.12, range: 10 });
      if (r() < 0.4) { B.at(x + (r() - .5) * 3, y, z + (r() - .5) * 3, r() * 6, lv); PROP.papers(B, 4); } } },
  balcony(B, rm, F, r) { for (const [x, z] of [[-13.5, -11.5], [13.5, -11.5], [-13.5, 11.5], [13.5, 11.5]]) { B.at(x, 6, z, 0, 'U'); PROP.planter(B, 1.2, true); } for (const [x, z, a] of [[-13, 0, Math.PI / 2], [13, 0, -Math.PI / 2], [0, -11.5, 0]]) { B.at(x, 6, z, a, 'U'); if (B.free(0, 0, 2, 0.6)) PROP.bench(B); }
    for (let x = -12; x <= 12; x += 6) for (const z of [-12, 12]) { B.at(x, 6, z, 0, 'U'); B.lamp(0, 5.4, 0, 1.4, 0.4, { flick: 0.2 }); } for (const [x, z] of [[-11.5, -9.5], [11.5, -9.5], [-11.5, 9.5], [11.5, 9.5]]) { B.at(x, 6, z, 0, 'U'); PROP.pillar(B, 5.5, 0.45); } },
  gallery(B, rm, F, r) { ROOMFN.hall(B, rm, F, r); },
  cinemalobby(B, rm, F, r) { const y = 6; put(B, rm, F, 8, 12, Math.PI, PROP.counter, 6, 1, 6, 0.8, 0x6a1a1a); put(B, rm, F, 6, 11.4, 0, PROP.popcorn); put(B, rm, F, 10, 11.4, 0, PROP.register);
    for (let i = 0; i < 4; i++) put(B, rm, F, 3 + i * 3.2, 5, 0, (B2) => { B2.box(0, 0, 0, 0.06, 0.9, 0.06, C.chrome, 'metal'); B2.box(0, 0.85, 1.5, 0.04, 0.04, 3, 0x8a1a1a, 'fabric'); }, 0.3, 0.3);
    for (let i = 0; i < 6; i++) { const [x, z, a] = F.map(0.08, 3 + i * 1.8); B.at(x, y, z, a + Math.PI / 2, 'U'); B.sign(0, 1.2, 0.02, 1.0, 1.5, 'poster:' + (i % 10), { room: rm.id }); }
    ceilLamps(B, rm, 3.6, 4, { color: 0xffd8a0 }); },
  market(B, rm, F, r) { const [x0, z0, x1, z1] = rm.r; // aisles run north-south, checkouts near the hall entrance
    for (let x = x0 + 4; x < x1 - 3; x += 3.2) { if (x > -10 && x < 10) continue; B.at(x, 0, -29.5, 0, 'G'); if (B.free(0, 0, 1.2, 12)) { PROP.gondola(B, 12, 1.75, 'boxes'); B.reserve(0, 0, 1.3, 12); if (r() < 0.25) { B.at(x + 1.5, 0, -29 + (r() - .5) * 6, r() * 6, 'G'); PROP.boxpile(B, 3); } } }
    for (let x = x0 + 3; x < x1 - 3; x += 3) { B.at(x, 0, z0 + 0.5, 0, 'G'); if (B.free(0, 0, 2.4, 0.9)) { PROP.fridge(B, 2.4); B.reserve(0, 0, 2.4, 0.9); } }
    for (const x of [-7, -3, 3, 7]) { B.at(x, 0, -24, 0, 'G'); if (B.free(0, 0, 0.9, 2.6)) { PROP.checkout(B); B.reserve(0, 0, 0.9, 2.6); } }
    for (const x of [-5, 5]) for (const z of [-34, -31]) { B.at(x, 0, z, r() * 0.4, 'G'); if (B.free(0, 0, 2, 1.2)) { PROP.produce(B); B.reserve(0, 0, 2, 1.2); } }
    for (let i = 0; i < 9; i++) { B.at(-8 + r() * 16, 0, -21.5 - r() * 3, r() * 6, 'G'); if (B.free(0, 0, 0.7, 1)) PROP.cart(B, r() < 0.3); }
    for (let x = x0 + 4; x < x1; x += 6) for (let z = z0 + 4; z < z1; z += 6) { B.at(x, 0, z, 0, 'G'); B.lamp(0, 5.6, 0, 2.4, 0.3, { flick: rm.cond === 'wrecked' ? 0.6 : 0.2, range: 9 }); }
    if (rm.cond !== 'eerie') for (let i = 0; i < 18; i++) { B.at(x0 + r() * (x1 - x0), 0, z0 + r() * (z1 - z0), r() * 6, 'G'); if (B.free(0, 0, 0.5, 0.5)) B.box(0, 0, 0, 0.3, 0.18, 0.22, hsl(r, 0.6, 0.45), 'plain', { ry: r() * 3, rx: r() < 0.3 ? Math.PI / 2 : 0 }); } },
  clothing(B, rm, F, r) { const { W, D } = F; put(B, rm, F, W - 2.5, D - 1.2, Math.PI, PROP.counter, 3.2, 1, 2.6, 0.7); put(B, rm, F, W - 2.5, D - 1.3, 0, PROP.register);
    for (let v = 3.5; v < D - 3; v += 2.2) for (const u of [2, W - 2]) put(B, rm, F, u, v, 0, PROP.rack, 1.6, 0.6);
    for (let v = 4; v < D - 3; v += 3) put(B, rm, F, W / 2 + (r() > .5 ? 2 : -2), v, 0, PROP.roundrack, 1.4, 1.4);
    for (const u of [1.2, W - 1.2]) put(B, rm, F, u, 1.0, r() * 6, PROP.mannequin, 0.6, 0.6, (rm.cond === 'wrecked' || rm.cond === 'damaged') && r() < 0.5);
    put(B, rm, F, 0.8, D - 2.5, Math.PI / 2, PROP.stall, 1.3, 1.45, true); put(B, rm, F, 0.8, D - 4.0, Math.PI / 2, PROP.stall, 1.3, 1.45, false);
    for (let v = 3; v < D - 1; v += 2.1) { put(B, rm, F, W - 0.3, v, -Math.PI / 2, PROP.shelf, 2, 0.6, 2, 1.8, 0.4, 'clothes'); }
    ceilLamps(B, rm, 3.4, 3.5); },
  electronics(B, rm, F, r) { const { W, D } = F; put(B, rm, F, W / 2, D - 0.3, Math.PI, PROP.tvwall, W - 2, 0.3, W - 2); put(B, rm, F, 2.5, D - 2, Math.PI, PROP.counter, 3, 1, 2.6, 0.7, 0x2a2a3a);
    for (let v = 3; v < D - 3; v += 2.6) for (const u of [W / 2 - 2, W / 2 + 2]) put(B, rm, F, u, v, 0, PROP.display, 2, 1, 1.8, 0.8);
    for (let v = 2.5; v < D - 2; v += 2.1) put(B, rm, F, 0.3, v, Math.PI / 2, PROP.shelf, 2, 0.6, 2, 1.8, 0.4, 'boxes');
    ceilLamps(B, rm, 3.4, 3.5, { color: 0xdfe8ff }); },
  phones(B, rm, F, r) { ROOMFN.electronics(B, rm, F, r); },
  shoes(B, rm, F, r) { const { W, D } = F; for (let v = 2.5; v < D - 1; v += 2.1) { put(B, rm, F, 0.25, v, Math.PI / 2, PROP.shoes, 2, 0.5, 2); put(B, rm, F, W - 0.25, v, -Math.PI / 2, PROP.shoes, 2, 0.5, 2); }
    for (let v = 3.5; v < D - 2; v += 3) put(B, rm, F, W / 2, v, Math.PI / 2, PROP.bench, 2, 0.7, 1.6); put(B, rm, F, W / 2, D - 1, Math.PI, PROP.counter, 2.6, 1, 2.2, 0.6); ceilLamps(B, rm, 3.4, 3.5); },
  pharmacy(B, rm, F, r) { const { W, D } = F; put(B, rm, F, W / 2, D - 1.6, Math.PI, PROP.counter, W - 3, 1, W - 3.5, 0.7, 0xe8ece8);
    for (let k = 0; k < 3; k++) put(B, rm, F, 2 + k * 2.2, D - 0.3, Math.PI, PROP.shelf, 2.1, 0.6, 2, 2, 0.4, 'boxes');
    for (let v = 3; v < D - 4; v += 2.6) put(B, rm, F, W / 2, v, Math.PI / 2, PROP.gondola, 4.5, 1.3, 4);
    put(B, rm, F, W - 1.5, 1.2, 0, PROP.bin, 0.6, 0.6); ceilLamps(B, rm, 3.4, 3.5, { color: 0xeaf6ff }); },
  jewelry(B, rm, F, r) { const { W, D } = F; for (let v = 3; v < D - 1.5; v += 2) { put(B, rm, F, 1.2, v, Math.PI / 2, PROP.display, 1.8, 0.8, 1.6, 0.6); put(B, rm, F, W - 1.2, v, -Math.PI / 2, PROP.display, 1.8, 0.8, 1.6, 0.6); } put(B, rm, F, W / 2, D - 1, Math.PI, PROP.display, 2.6, 0.8, 2.4, 0.6); ceilLamps(B, rm, 3.2, 3); },
  restaurant(B, rm, F, r) { const { W, D } = F; put(B, rm, F, W / 2, D - 1.2, Math.PI, PROP.counter, W - 4, 1, W - 5, 0.7, 0x5a3a2a);
    for (let v = 3; v < D - 3; v += 2.4) for (let u = 2; u < W - 1.5; u += 2.6) put(B, rm, F, u, v, r() * 0.2, PROP.table, 2.2, 2.2, 1.0, 0.8, C.wood, 4, rm.cond);
    for (let v = 3; v < D - 2; v += 2.2) put(B, rm, F, W - 0.8, v, Math.PI / 2, PROP.booth, 1.7, 1.7, 1.4); ceilLamps(B, rm, 3.3, 3, { color: 0xffd8a0 }); },
  cafe(B, rm, F, r) { const { W, D } = F; put(B, rm, F, W / 2, D - 1.4, Math.PI, PROP.counter, W - 3, 1, W - 3.5, 0.7, 0x3a2a1a); put(B, rm, F, W / 2 - 1, D - 1.5, 0, PROP.display, 0, 0, 1.0, 0.5);
    for (let v = 2.5; v < D - 3.5; v += 2.1) for (let u = 1.8; u < W - 1; u += 2.4) put(B, rm, F, u, v, r() * 0.5, PROP.table, 1.6, 1.6, 0.7, 0.7, C.wood, 2, rm.cond); ceilLamps(B, rm, 3.3, 3, { color: 0xffd0a0 }); },
  fastfood(B, rm, F, r) { const { W, D } = F; put(B, rm, F, W / 2, 1.2, 0, PROP.counter, W - 2, 1, W - 2.5, 0.8, 0xc84a2a); put(B, rm, F, W / 2 - 2, 1.2, Math.PI, PROP.register);
    const [x, z, a] = F.map(W / 2, 3.4); B.at(x, 0, z, a + Math.PI, 'G'); B.sign(0, 2.6, 0, 3, 0.9, 'menu:' + rm.sign, { glow: true, room: rm.id, flicker: 0.3 });
    for (let u = 1.5; u < W - 1; u += 2.2) put(B, rm, F, u, D - 0.6, Math.PI, PROP.counter, 2, 1, 1.8, 0.7, 0x9aa0a6, 0x5a5a5a); ceilLamps(B, rm, 3.2, 3); },
  foodcourt(B, rm, F, r) { const [x0, z0, x1, z1] = rm.r; for (let x = x0 + 3; x < x1 - 2; x += 3.4) for (let z = z0 + 4; z < z1 - 2; z += 3.2) { B.at(x + (r() - .5) * 0.6, 0, z + (r() - .5) * 0.6, r() * 0.6, 'G'); if (B.free(0, 0, 2.4, 2.4)) { PROP.table(B, 1.1, 1.1, 0xd8d0c0, 4, rm.cond); B.reserve(0, 0, 2.4, 2.4); } }
    for (const [x, z] of [[x0 + 1, z0 + 2], [x1 - 1, z0 + 2], [x0 + 1, z1 - 2], [x1 - 1, z1 - 2]]) { B.at(x, 0, z, 0, 'G'); PROP.bin(B); }
    for (const x of [24, 38]) { B.at(x, 0, 15.5, 0, 'G'); if (B.free(0, 0, 1.4, 1.4)) PROP.planter(B, 1.3, true); }
    for (let x = x0 + 4; x < x1; x += 7) for (let z = z0 + 4; z < z1; z += 7) { B.at(x, 0, z, 0, 'G'); B.lamp(0, 5.6, 0, 1.6, 0.4, { flick: 0.25, range: 10 }); } },
  sports(B, rm, F, r) { const { W, D } = F; for (let v = 3; v < D - 2; v += 2.4) for (const u of [2, W - 2]) put(B, rm, F, u, v, 0, PROP.rack, 1.6, 0.6); for (let v = 2.5; v < D - 1; v += 2.1) put(B, rm, F, W / 2, v, Math.PI / 2, PROP.shelf, 2, 0.6, 2, 1.4, 0.5);
    put(B, rm, F, 1.5, 1.2, 0.3, PROP.mannequin, 0.6, 0.6, rm.cond === 'wrecked'); ceilLamps(B, rm, 3.4, 3.5); },
  toilets(B, rm, F, r) { const { W, D } = F; for (let u = 1; u < W - 1; u += 1.3) put(B, rm, F, u, D - 0.8, Math.PI, PROP.stall, 1.25, 1.45, true); put(B, rm, F, W / 2, 1.0, 0, PROP.sinks, 3, 0.7, 3); ceilLamps(B, rm, 3, 3, { color: 0xe0f0ff }); if (r() < 0.6) { const [x, z] = F.map(W / 2, D / 2); B.at(x, LEVELS[rm.lv[0]].y, z, 0, rm.lv[0]); PROP.puddle(B, 1.4); } },
  service(B, rm, F, r) { const [x0, z0, x1, z1] = rm.r, lv = rm.lv[0], y = LEVELS[lv].y, horiz = x1 - x0 > z1 - z0, len = horiz ? x1 - x0 : z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    B.at(cx, y, horiz ? z0 + 0.3 : cz, horiz ? Math.PI / 2 : 0, lv); PROP.pipes(B, len - 0.4, LEVELS[lv].h * 0.55, 3);
    for (let k = 3; k < len - 2; k += 7) { const x = horiz ? x0 + k : x1 - 0.4, z = horiz ? z1 - 0.4 : z0 + k; const pick = r(); B.at(x + (horiz ? 0 : 0.1), y, z + (horiz ? 0.1 : 0), horiz ? Math.PI : -Math.PI / 2, lv);
      if (pick < 0.35) { if (B.free(0, 0, 1.5, 0.6)) { PROP.locker(B, 3, true); B.reserve(0, 0, 1.6, 0.7); } } else if (pick < 0.6) { if (B.free(0, 0, 1.4, 1)) { PROP.boxpile(B, 3); B.reserve(0, 0, 1.4, 1); } } else if (pick < 0.75) { if (B.free(0, 0, 0.6, 0.6)) PROP.mopBucket(B); } else if (B.free(0, 0, 0.8, 1)) { PROP.cart(B); } }
    for (let k = 2; k < len; k += 5) { B.at(horiz ? x0 + k : cx, y, horiz ? cz : z0 + k, 0, lv); B.lamp(0, Math.min(3.2, LEVELS[lv].h - 0.2), 0, 1.2, 0.15, { flick: 0.45, color: 0xd8f0ff, range: 6 }); } },
  maint(B, rm, F, r) { if (rm.id === 'lockedMaint') return ROOMFN.lockedMaint(B, rm, F, r); ROOMFN.service(B, rm, F, r); },
  tunnel(B, rm, F, r) { ROOMFN.service(B, rm, F, r); const [x0, z0, x1, z1] = rm.r; for (let i = 0; i < 3; i++) { B.at(x0 + r() * (x1 - x0), -5, z0 + r() * (z1 - z0), 0, 'B'); PROP.puddle(B, 0.8 + r()); } },
  security(B, rm, F, r) { const { W, D } = F; put(B, rm, F, W / 2, D - 0.5, Math.PI, PROP.monitors, 3.2, 0.8, 3); put(B, rm, F, 2, 2.5, 0, PROP.desk, 1.5, 1.4, true, rm.cond); put(B, rm, F, W - 2, 2.5, 0, PROP.desk, 1.5, 1.4, true, rm.cond);
    put(B, rm, F, 0.35, D - 3, Math.PI / 2, PROP.locker, 1.6, 0.6, 3, true); put(B, rm, F, W - 0.4, 4, -Math.PI / 2, PROP.filing, 0.6, 0.7); put(B, rm, F, W - 0.4, 5, -Math.PI / 2, PROP.coatRack); ceilLamps(B, rm, 3, 3, { color: 0xe8f0ff }); },
  secctrl(B, rm, F, r) { const { W, D } = F; put(B, rm, F, W / 2, D - 0.5, Math.PI, PROP.monitors, W - 1.4, 0.8, W - 1.6); put(B, rm, F, W / 2, D - 2.2, 0, PROP.desk, 1.5, 1.4, true, rm.cond); put(B, rm, F, 0.5, 2, Math.PI / 2, PROP.server, 0.7, 1); put(B, rm, F, 0.5, 3, Math.PI / 2, PROP.server, 0.7, 1);
    put(B, rm, F, W - 0.4, 2.5, -Math.PI / 2, PROP.locker, 1.6, 0.6, 3, true); ceilLamps(B, rm, 3, 3, { color: 0xd8e8ff }); },
  office(B, rm, F, r) { const { W, D } = F; for (let v = 2.2; v < D - 1; v += 2.3) for (const u of [1.8, W - 1.8]) put(B, rm, F, u, v, 0, PROP.desk, 1.5, 1.6, true, rm.cond); put(B, rm, F, W / 2, D - 0.4, Math.PI, PROP.filing, 0.6, 0.7); put(B, rm, F, W / 2 + 0.7, D - 0.4, Math.PI, PROP.filing, 0.6, 0.7); put(B, rm, F, 0.4, D - 1, Math.PI / 2, PROP.locker, 1.1, 0.6, 2, true); ceilLamps(B, rm, 3, 3); },
  medical(B, rm, F, r) { const { W, D } = F; for (let u = 1.5; u < W - 1; u += 2.5) put(B, rm, F, u, D - 1.3, 0, PROP.hospitalBed, 1.1, 2.1); put(B, rm, F, 0.4, 2, Math.PI / 2, PROP.shelf, 2, 0.6, 2, 1.8, 0.4, 'boxes'); put(B, rm, F, W - 1.5, 1.6, 0, PROP.desk, 1.5, 1.4, false, rm.cond); ceilLamps(B, rm, 3, 3, { color: 0xe8fff0, flick: 0.5 }); },
  customer(B, rm, F, r) { const { W, D } = F; put(B, rm, F, W / 2, 2, 0, PROP.counter, W - 2, 1, W - 2.5, 0.8, 0x2a4f8f); for (let u = 1.5; u < W - 1; u += 2.2) put(B, rm, F, u, D - 0.4, Math.PI, PROP.shelf, 2, 0.6, 2, 1.8, 0.4, 'boxes'); put(B, rm, F, 1.4, 4, 0, PROP.desk, 1.5, 1.4, true, rm.cond); ceilLamps(B, rm, 3.2, 3); },
  kitchen(B, rm, F, r) { const { W, D } = F; for (let v = 2; v < D - 1; v += 2.4) { put(B, rm, F, 0.5, v, Math.PI / 2, PROP.counter, 2.2, 1, 2, 0.8, 0x9aa0a6, 0x8a9096); put(B, rm, F, W - 0.5, v, -Math.PI / 2, PROP.counter, 2.2, 1, 2, 0.8, 0x9aa0a6, 0x8a9096); } put(B, rm, F, W / 2, D - 0.5, Math.PI, PROP.fridge, 2.6, 1, 2.4); ceilLamps(B, rm, 3.2, 3.5, { color: 0xe8f8ff }); },
  storage(B, rm, F, r) { const [x0, z0, x1, z1] = rm.r, lv = rm.lv[0], y = LEVELS[lv].y; for (let x = x0 + 2.5; x < x1 - 2; x += 3) { B.at(x, y, (z0 + z1) / 2, Math.PI / 2, lv); if (B.free(0, 0, Math.min(6, z1 - z0 - 4), 1.2)) { PROP.rackHigh(B, Math.min(6, z1 - z0 - 4)); B.reserve(0, 0, Math.min(6, z1 - z0 - 4), 1.2); } }
    for (let i = 0; i < 4; i++) { B.at(x0 + 1 + r() * (x1 - x0 - 2), y, z0 + 1 + r() * (z1 - z0 - 2), r() * 3, lv); if (B.free(0, 0, 1.3, 1.1)) { PROP.pallet(B); B.reserve(0, 0, 1.3, 1.1); } } ceilLamps(B, rm, LEVELS[lv].h - 0.3, 5, { flick: 0.4, range: 7 }); },
  parking(B, rm, F, r) { const [x0, z0, x1, z1] = rm.r; for (let x = x0 + 6; x < x1 - 2; x += 8) for (let z = z0 + 6; z < z1 - 2; z += 8) { B.at(x, -5, z, 0, 'B'); if (B.free(0, 0, 1, 1)) { PROP.pillar(B, 4.5, 0.4, false); B.reserve(0, 0, 1, 1); }
      for (const dx of [-2.6, 2.6]) { if (r() < 0.45) { B.at(x + dx, -5, z + (r() - .5) * 0.6, (r() < 0.5 ? 0 : Math.PI) + (r() - .5) * 0.15, 'B'); if (B.free(0, 0, 2, 4.6)) { PROP.car(B); B.reserve(0, 0, 2, 4.6); } } }
      B.at(x, -5, z + 4, 0, 'B'); B.lamp(0, 4.2, 0, 1.4, 0.2, { flick: 0.5, range: 9, color: 0xd8ffe8 }); }
    for (let i = 0; i < 6; i++) { B.at(x0 + r() * (x1 - x0), -5, z0 + r() * (z1 - z0), r() * 6, 'B'); if (B.free(0, 0, 0.8, 1)) PROP.cart(B, r() < 0.5); } },
  dock(B, rm, F, r) { B.at(44, -5, -24, 0, 'B'); PROP.trailer(B); B.reserve(0, 0, 2.6, 9.1); B.at(36, -5, -18, 0.6, 'B'); if (B.free(0, 0, 1.3, 2.6)) PROP.forklift(B); for (let i = 0; i < 6; i++) { B.at(32 + r() * 24, -5, -36 + r() * 24, r() * 3, 'B'); if (B.free(0, 0, 1.3, 1.1)) { PROP.pallet(B); B.reserve(0, 0, 1.3, 1.1); } } ceilLamps(B, rm, 4.2, 6, { flick: 0.5, range: 9 }); },
  electrical(B, rm, F, r) { const [x0, z0, x1, z1] = rm.r; for (let x = x0 + 1.5; x < x1 - 1; x += 1.6) { B.at(x, -5, z0 + 0.3, 0, 'B'); if (B.free(0, 0, 1.2, 0.5)) PROP.panel(B, 1.2); } B.at((x0 + x1) / 2, -5, z1 - 2.5, 0, 'B'); if (B.free(0, 0, 3.2, 1.6)) PROP.generator(B); ceilLamps(B, rm, 4, 4, { power: 'backup', flick: 0.6, color: 0xffd8a0, range: 7 }); },
  generator(B, rm, F, r) { const [x0, z0, x1, z1] = rm.r; for (const x of [x0 + 3.5, x1 - 3.5]) { B.at(x, -5, (z0 + z1) / 2, 0, 'B'); if (B.free(0, 0, 3.4, 1.8)) { PROP.generator(B); B.reserve(0, 0, 3.4, 1.8); } } B.at((x0 + x1) / 2, -5, z0 + 0.3, 0, 'B'); PROP.pipes(B, 6, 4, 3); ceilLamps(B, rm, 4, 5, { power: 'backup', flick: 0.5, color: 0xffb070, range: 8 }); },
  utility(B, rm, F, r) { const [x0, z0, x1, z1] = rm.r; for (const [x, z] of [[x0 + 3, z0 + 3], [x0 + 7, z0 + 3], [x1 - 3, z1 - 3]]) { B.at(x, -5, z, 0, 'B'); if (B.free(0, 0, 2, 2)) { PROP.boiler(B); B.reserve(0, 0, 2, 2); } } ceilLamps(B, rm, 4, 5, { flick: 0.5, range: 8 }); },
  lockedMaint(B, rm, F, r) { const [x0, z0, x1, z1] = rm.r; ROOMFN.storage(B, rm, F, r); B.at(x1 - 4, -5, z1 - 3, Math.PI, 'B'); if (B.free(0, 0, 2, 2.2)) PROP.bed(B, 0x4a4a3a); B.at(x1 - 7, -5, z1 - 2, Math.PI, 'B'); if (B.free(0, 0, 1.5, 1.5)) PROP.desk(B, false, 'wrecked'); B.at(x1 - 6, -5, z1 - 4, 0, 'B'); PROP.papers(B, 10); },
  toys(B, rm, F, r) { const { W, D } = F; for (let v = 3; v < D - 2; v += 2.4) for (const u of [2.5, W - 2.5]) put(B, rm, F, u, v, Math.PI / 2, PROP.gondola, 2.4, 1.3, 2, 1.5); put(B, rm, F, W / 2, 2, 0.4, PROP.teddy, 1, 1); put(B, rm, F, W / 2, D - 1.2, Math.PI, PROP.counter, 3, 1, 2.6, 0.7, 0xd8742a); ceilLamps(B, rm, 3.4, 3.5); },
  books(B, rm, F, r) { const { W, D } = F; for (let v = 3; v < D - 2.5; v += 2.2) for (const u of [3, W - 3]) put(B, rm, F, u, v, 0, PROP.bookcase, 2.2, 0.6, 2, 2.2); for (let v = 2; v < D - 1; v += 2.2) put(B, rm, F, 0.25, v, Math.PI / 2, PROP.bookcase, 2.1, 0.5, 2, 2.3); put(B, rm, F, W / 2, 1.8, 0.2, PROP.sofa, 2.2, 1, 0x5a3a2a); put(B, rm, F, W - 2, D - 1, Math.PI, PROP.counter, 2.6, 1, 2.2, 0.7, 0x5a3a2a); ceilLamps(B, rm, 3.3, 3.5, { color: 0xffd8a0 }); },
  arcade(B, rm, F, r) { const { W, D } = F; for (let u = 1; u < W - 0.5; u += 1.0) { put(B, rm, F, u, D - 0.6, Math.PI, PROP.arcade, 0.9, 0.9); } for (let u = 2; u < W - 2; u += 1.0) { put(B, rm, F, u, 5, 0, PROP.arcade, 0.9, 0.9); put(B, rm, F, u, 6.1, Math.PI, PROP.arcade, 0.9, 0.9); }
    put(B, rm, F, 2, 2, 0, PROP.counter, 2.6, 1, 2.4, 0.7, 0x6a3a8a); ceilLamps(B, rm, 3.4, 3.5, { color: 0xc8a0ff, flick: 0.4 }); },
  home(B, rm, F, r) { const { W, D } = F; put(B, rm, F, 2.5, 4, 0, PROP.sofa, 2.2, 1, 0x7a6a5a); put(B, rm, F, W - 2.5, 4, 0, PROP.bed, 1.6, 2.2); put(B, rm, F, W / 2, 8, 0, PROP.table, 2.2, 2.2, 1.4, 0.9, C.wood, 4, rm.cond); for (let v = 2; v < D - 1; v += 2.2) put(B, rm, F, 0.3, v, Math.PI / 2, PROP.shelf, 2, 0.6, 2, 1.8, 0.4, 'boxes'); ceilLamps(B, rm, 3.3, 3.5, { color: 0xffe0b0 }); },
  furniture(B, rm, F, r) { const { W, D } = F; for (let v = 3; v < D - 2; v += 3) for (let u = 2.5; u < W - 2; u += 3.5) put(B, rm, F, u, v, r() * 0.3, [PROP.sofa, PROP.bed, (B2) => PROP.table(B2, 1.4, 0.9, C.wood, 4, rm.cond)][Math.floor(r() * 3)], 2.6, 2.4); ceilLamps(B, rm, 3.3, 4); },
  music(B, rm, F, r) { const { W, D } = F; for (let v = 3; v < D - 2; v += 2) put(B, rm, F, W / 2, v, 0, PROP.records, 2, 0.8); put(B, rm, F, W - 0.3, D / 2, -Math.PI / 2, PROP.guitars, 3, 0.3, 5); put(B, rm, F, 1.6, D - 1, Math.PI, PROP.counter, 2.6, 1, 2.2, 0.7, 0x2a2a2a); ceilLamps(B, rm, 3.3, 3.5, { color: 0xffc8a0 }); },
  gifts(B, rm, F, r) { ROOMFN.toys(B, rm, F, r); },
  kids(B, rm, F, r) { const { W, D } = F; put(B, rm, F, W / 2, D / 2 + 1, 0, PROP.softplay, 4.4, 3.6); for (let u = 2; u < W - 1; u += 3) put(B, rm, F, u, 2.5, 0, PROP.table, 1.6, 1.6, 0.8, 0.8, 0xd8742a, 4, rm.cond); ceilLamps(B, rm, 3.3, 3.5); },
  cinema(B, rm, F, r) { const [x0, z0, x1, z1] = rm.r; const sx = rm.id === 'cinema1' ? x0 + 0.3 : x1 - 0.3; B.at(sx, 6, (z0 + z1) / 2, rm.id === 'cinema1' ? Math.PI / 2 : -Math.PI / 2, 'U'); B.box(0, 1, 0, 14, 4.2, 0.1, 0xd8d8d0, 'emissive');
    for (let k = 0; k < 7; k++) { const x = rm.id === 'cinema1' ? x0 + 6 + k * 1.9 : x1 - 6 - k * 1.9; B.at(x, 6, (z0 + z1) / 2 - 1.2, rm.id === 'cinema1' ? -Math.PI / 2 : Math.PI / 2, 'U'); if (B.free(0, 0, 0.7, 13)) { PROP.seatsRow(B, 20); B.reserve(0, 0, 0.7, 12.2); } }
    for (let z = z0 + 2; z < z1; z += 4) { B.at(rm.id === 'cinema1' ? x1 - 0.3 : x0 + 0.3, 6, z, 0, 'U'); B.lamp(0, 2, 0, 0.3, 0.2, { kind: 'wall', flick: 0.2, color: 0xffb070, range: 4 }); } },
  projection(B, rm, F, r) { const [x0, z0, x1, z1] = rm.r; B.at(-4, 6, -33, 0, 'U'); PROP.desk(B, false, rm.cond); B.at(4, 6, -36, 0, 'U'); PROP.boxpile(B, 4); B.at(0, 6, -37.2, 0, 'U'); PROP.shelf(B, 3, 2, 0.5); ceilLamps(B, rm, 3, 4, { power: 'backup', flick: 0.5 }); },
  roof(B, rm, F, r) { for (const [x, z] of [[34, 22], [40, 26], [54, 6], [36, 2], [56, 18]]) { B.at(x, 12, z, r() * 3, 'R'); if (B.free(0, 0, 2.6, 2.2)) { PROP.hvac(B); B.reserve(0, 0, 2.6, 2.2); } } B.at(40, 12, 10, 0, 'R'); B.box(0, 0, 0, 8, 0.02, 8, 0x3a3a38, 'concrete').box(0, 0.02, 0, 0.6, 0.01, 4, 0xd8d0a0).box(1.2, 0.02, 0, 0.6, 0.01, 4, 0xd8d0a0).box(-1.2, 0.02, 0, 0.6, 0.01, 4, 0xd8d0a0).box(0, 0.02, 0, 2.4, 0.01, 0.6, 0xd8d0a0); },
  outside(B, rm, F, r) { if (rm.id === 'plaza') { B.at(-2, 0, 37, Math.PI / 2 + 0.2, 'G'); PROP.policeCar(B); B.at(5, 0, 36, -0.4, 'G'); PROP.policeCar(B); } },
  dockyard() {},
};
// condition: some areas intact, some trashed, a few strangely untouched
function addCondition(B, rm, r) {
  if (['void', 'stair', 'elev', 'outside', 'roof'].includes(rm.type)) return; const [x0, z0, x1, z1] = rm.r, lv = rm.lv[0], y = LEVELS[lv].y, area = (x1 - x0) * (z1 - z0);
  const n = { intact: 0.01, worn: 0.02, damaged: 0.05, wrecked: 0.09, eerie: 0 }[rm.cond] * area;
  for (let i = 0; i < n; i++) { B.at(x0 + 1 + r() * (x1 - x0 - 2), y, z0 + 1 + r() * (z1 - z0 - 2), r() * 6, lv); if (!B.free(0, 0, 0.8, 0.8)) continue; const k = r();
    if (k < 0.3) PROP.papers(B, 5); else if (k < 0.5) PROP.debris(B, 5); else if (k < 0.65) PROP.ceilingPanel(B); else if (k < 0.75) PROP.bags(B, 2); else if (k < 0.85) PROP.puddle(B, 0.6 + r()); else PROP.boxpile(B, 2); }
  if (rm.cond === 'wrecked' && area > 40) { B.at((x0 + x1) / 2 + (r() - .5) * 3, y, (z0 + z1) / 2 + (r() - .5) * 3, r() * 6, lv); if (B.free(0, 0, 1.4, 1.4)) PROP.debris(B, 12); }
  for (const s of B.P.shutters.filter(s => s.room === rm.id)) { /* shards in front of broken glass are added by mall3d */ }
}
export { C as COLORS, CH };
