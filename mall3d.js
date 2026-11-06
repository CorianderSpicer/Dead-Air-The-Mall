// Builds the Three.js mall from the plan: floors, drop ceilings (with missing tiles where damaged), walls, shopfront glass,
// fascia signs, stairs, escalators, elevator, doors, shutters, skylight, lamps — merged per material & chunk for iPad.
import * as THREE from './three.module.js';
import { LEVELS, LV, E, X0, Z0, GW, GD } from './mallplan.js';
import { Builder, furnishAll, PROP } from './props.js';
import { materials, textTex, posterTex, FLOOR_REP } from './textures.js';
import { rng } from './util.js';

const DROP = new Set(['clothing', 'electronics', 'shoes', 'pharmacy', 'phones', 'jewelry', 'restaurant', 'cafe', 'sports', 'toilets', 'security', 'customer', 'kitchen', 'fastfood', 'toys', 'books', 'arcade', 'home', 'music', 'gifts', 'kids', 'furniture', 'office', 'secctrl', 'medical', 'service', 'maint', 'cinemalobby', 'projection']);
const WALLCOL = { G: 0xd6cfc0, U: 0xcfd2cc, B: 0x8a8a84, R: 0x9a9a94 };

export function buildMall(P, scene, quality = 'medium', seed = 1) {
  const r = rng(seed ^ 0x3d), M = materials(quality), B = new Builder(P, r, quality);
  const groups = Object.fromEntries(LV.map(lv => [lv, new THREE.Group()])); for (const g of Object.values(groups)) scene.add(g);
  const quad = (mat, lv, pts, n, uvs, col) => { B.f.lv = lv; const cx = (pts[0][0] + pts[2][0]) / 2, cz = (pts[0][2] + pts[2][2]) / 2; const b = B.bucket(mat, cx, cz); const base = b.pos.length / 3; const c = new THREE.Color(col);
    pts.forEach((p, i) => { b.pos.push(...p); b.nor.push(...n); b.uv.push(...uvs[i]); b.col.push(c.r, c.g, c.b); }); b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3); };
  const hquad = (mat, lv, x0, z0, x1, z1, y, up, col, rep = 0.25) => { const pts = up ? [[x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0]] : [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]];
    quad(mat, lv, pts, [0, up ? 1 : -1, 0], pts.map(p => [p[0] * rep, p[2] * rep]), col); };
  // ── floors ──
  const FLOORCOL = { marble: 0xe6e2da, tile: 0xe8e8e4, carpet: 0x6a5a6e, wood: 0xa88866, lino: 0xc8c8be, concrete: 0x9a9a94, asphalt: 0x5a5a5a, roof: 0x8a8a84 };
  const carpetCol = id => [0x6a3a3a, 0x3a4a6a, 0x5a4a6a, 0x3a5a4a, 0x6a5a3a][Math.abs([...id].reduce((a, c) => a + c.charCodeAt(0), 0)) % 5];
  for (const s of P.surfaces) {
    if (s.dynamic) continue;
    if (s.ramp) { buildRamp(B, s); continue; }
    const mat = s.mat === 'stairs' ? 'concrete' : s.mat; const col = s.mat === 'carpet' ? carpetCol(s.room) : FLOORCOL[mat] ?? 0xcccccc;
    const lv = s.lv === '*' ? 'G' : (s.landing || s.mid) ? P.levelAtY(s.y + 0.1) : s.lv;
    hquad(M[mat] ? mat : 'concrete', lv, s.x0, s.z0, s.x1, s.z1, s.y, true, col, FLOOR_REP[mat] || 0.25);
    if (s.mid || s.landing) { B.f.lv = lv; B.at((s.x0 + s.x1) / 2, s.y - 0.25, (s.z0 + s.z1) / 2, 0, lv); B.box(0, 0, 0, s.x1 - s.x0, 0.25, s.z1 - s.z0, 0x8a8a84, 'concrete', { top: false }); }
    else if (s.lv === 'U' || s.lv === 'R') hquad('concrete', s.lv, s.x0, s.z0, s.x1, s.z1, s.y - 0.35, false, 0x9a9a94, 0.2); // slab underside seen from below
  }
  // parking bay lines
  for (let x = -54; x < 8; x += 8) for (let z = -34; z < 28; z += 8) for (const dx of [-4.0, -1.3, 1.3, 4.0]) { B.at(x + dx, -4.995, z, 0, 'B'); B.box(0, 0, 0, 0.1, 0.004, 4.6, 0xd8d0a0, 'plain'); }
  // ── ceilings ──
  for (const rm of P.rooms) {
    if (['void', 'stair', 'elev', 'outside', 'roof'].includes(rm.type)) continue; const lv = rm.lv[0], L = LEVELS[lv]; const [x0, z0, x1, z1] = rm.r;
    const drop = DROP.has(rm.type); const h = lv === 'B' ? L.h : drop ? (rm.type === 'service' || rm.type === 'maint' ? 3.6 : 3.6) : L.h - 0.05; const y = L.y + h;
    if (!drop && lv === 'G') continue; // tall public spaces on G see the upper slab
    if (rm.type === 'balcony') { // roof over the balcony ring with the skylight over the void
      for (const [a, b, c, d] of [[-16, -14, 16, -9], [-16, 9, 16, 14], [-16, -9, -11, 9], [11, -9, 16, 9]]) hquad('ceiling', 'U', a, b, c, d, y, false, 0xc8c8c4, 0.42);
      continue; }
    const tile = 1.2, holeP = { intact: 0, worn: 0.03, damaged: 0.12, wrecked: 0.28, eerie: 0 }[rm.cond] ?? 0.02; const mat = lv === 'B' ? 'concrete' : 'ceiling';
    for (let x = x0; x < x1 - 1e-6; x += tile) for (let z = z0; z < z1 - 1e-6; z += tile) { const xx = Math.min(x + tile, x1), zz = Math.min(z + tile, z1);
      if (P.ownerAt(lv, x + 0.1, z + 0.1) !== rm.idx) continue;
      if (lv !== 'B' && r() < holeP) { hquad('ceiling', lv, x, z, xx, zz, y + 0.6, false, 0x151515, 1); if (r() < 0.4) { B.at(x + 0.6, y - 0.6, z + 0.6, r() * 3, lv); B.box(0, 0, 0, 0.6, 0.02, 0.6, 0xd0d0cc, 'ceiling', { rx: 0.9 + r() * 0.5 }); } continue; }
      hquad(mat, lv, x, z, xx, zz, y, false, lv === 'B' ? 0x7a7a74 : 0xd8d8d4, lv === 'B' ? 0.2 : 0.42); }
    if (lv === 'B' && rm.type === 'parking') for (let x = x0 + 4; x < x1; x += 8) { B.at(x, y - 0.6, (z0 + z1) / 2, 0, 'B'); B.box(0, 0, 0, 0.5, 0.6, z1 - z0, 0x7a7a74, 'concrete'); }
    if (drop) { // bulkhead between the drop ceiling and the structural ceiling above it, so you never see into the void
      const top = L.y + L.h; hquad('ceiling', lv, x0, z0, x1, z1, top - 0.02, false, 0x101010, 1); }
  }
  // skylight over the atrium void
  B.at(0, 11.5, 0, 0, 'U'); for (let x = -11; x <= 11; x += 2.75) B.box(x, 0, 0, 0.12, 0.2, 18, 0x3a3e44, 'metal'); for (let z = -9; z <= 9; z += 3) B.box(0, 0, z, 22, 0.2, 0.12, 0x3a3e44, 'metal');
  // ── walls ──
  const dropTop = (lv, x, z) => { const rm = P.roomAt(lv, x, z); return rm && DROP.has(rm.type); };
  for (const w of P.walls) {
    const lv = w.lv, vert = w.x0 === w.x1, len = vert ? w.z1 - w.z0 : w.x1 - w.x0, h = w.y1 - w.y0; const cx = (w.x0 + w.x1) / 2, cz = (w.z0 + w.z1) / 2;
    B.at(cx, w.y0, cz, vert ? Math.PI / 2 : 0, lv);
    if (w.kind === 'wall' || w.kind === 'ext') { B.box(0, 0, 0, len, h, w.kind === 'ext' ? 0.4 : 0.22, w.kind === 'ext' ? 0x8a8a84 : WALLCOL[lv], w.kind === 'ext' || lv === 'B' ? 'concrete' : 'plaster', { uv: 0.33 }); }
    else if (w.kind === 'glass' || w.kind === 'broken') { const gh = Math.min(3.4, h);
      if (w.kind === 'glass') B.box(0, 0.15, 0, len, gh - 0.15, 0.03, 0xffffff, 'glass');
      for (let k = 0; k <= len + 0.01; k += len / Math.max(1, Math.round(len / 1.5))) B.box(-len / 2 + k, 0, 0, 0.07, gh, 0.1, 0x2a2c30, 'metal');
      B.box(0, 0, 0, len, 0.15, 0.14, 0x2a2c30, 'metal').box(0, gh, 0, len, h - gh, 0.24, WALLCOL[lv], 'plaster', { uv: 0.33 });
      if (w.kind === 'broken') { B.at(cx, w.y0, cz, vert ? Math.PI / 2 : 0, lv); PROP.glassShards(B, len); B.at(cx, w.y0, cz, (vert ? Math.PI / 2 : 0) + Math.PI, lv); PROP.glassShards(B, len); for (let k = 0; k < 3; k++) { B.at(cx, w.y0, cz, vert ? Math.PI / 2 : 0, lv); B.box(-len / 2 + r() * len, 0.15, 0, 0.3 + r() * 0.5, 0.2 + r() * 0.8, 0.02, 0xffffff, 'glass', { rz: (r() - .5) * 1.5 }); } } }
    else if (w.kind === 'rail') { B.box(0, 0, 0, len, 1.0, 0.03, 0xffffff, 'glass').box(0, 1.0, 0, len, 0.06, 0.09, 0x2a2c30, 'metal'); for (let k = 0; k <= len + 0.01; k += 2) B.box(-len / 2 + k, 0, 0, 0.06, 1.0, 0.06, 0x2a2c30, 'metal');
      if (lv === 'U') { B.box(0, -0.4, 0, len, 0.4, 0.3, 0xd0ccc4, 'plaster'); } }
  }
  // door frames + header walls above doors
  for (const d of P.doors) { const [a, b, c, e] = d.seg, L = LEVELS[d.lv], vert = d.axis === 'z', len = vert ? e - b : c - a; const dh = d.kind === 'gate' || d.kind === 'dockdoor' ? 4.2 : d.kind === 'entrance' ? 3.4 : 2.4; const top = d.lv === 'R' ? L.y + 3 : L.y + L.h;
    B.at((a + c) / 2, L.y, (b + e) / 2, vert ? Math.PI / 2 : 0, d.lv); if (top > L.y + dh) B.box(0, dh, 0, len, top - L.y - dh, 0.24, d.lv === 'B' ? 0x8a8a84 : WALLCOL[d.lv], d.lv === 'B' ? 'concrete' : 'plaster');
    B.box(-len / 2, 0, 0, 0.1, dh, 0.3, 0x3a3c40, 'metal').box(len / 2, 0, 0, 0.1, dh, 0.3, 0x3a3c40, 'metal').box(0, dh - 0.1, 0, len, 0.1, 0.3, 0x3a3c40, 'metal');
    if (d.kind === 'staff' || d.kind === 'stair' || d.kind === 'emergency' || d.kind === 'metal') { B.sign(0, dh + 0.25, 0.16, 0.5, 0.2, d.kind === 'emergency' || d.kind === 'stair' ? 'exit' : 'staff', { glow: true }); B.sign(0, dh + 0.25, -0.16, 0.5, 0.2, d.kind === 'emergency' || d.kind === 'stair' ? 'exit' : 'staff', { glow: true, ry: Math.PI }); } }
  // shutter housings
  for (const s of P.shutters) { const [a, b, c, e] = s.seg, L = LEVELS[s.lv], vert = s.axis === 'z', len = vert ? e - b : c - a; B.at((a + c) / 2, L.y, (b + e) / 2, vert ? Math.PI / 2 : 0, s.lv); B.box(0, 3.4, 0, len + 0.3, 0.4, 0.4, 0x3a3c40, 'metal').box(0, 3.8, 0, len, L.h - 3.8, 0.24, WALLCOL[s.lv], 'plaster'); }
  // stairwell inner rails & escalator dressing
  for (const s of P.escalators) { const len = s.x1 - s.x0, w = s.z1 - s.z0; B.at(s.x0, 0, (s.z0 + s.z1) / 2, 0, 'G');
    for (const zz of [-w / 2 - 0.08, w / 2 + 0.08]) for (let i = 0; i < 10; i++) { const hy = i * 0.6; B.at(s.x0 + i + 0.5, hy, (s.z0 + s.z1) / 2 + zz, 0, 'G'); B.box(0, 0.2, 0, 1.17, 0.9, 0.04, 0xffffff, 'glass', { rz: Math.atan2(6, 10) }); B.box(0, 1.05, 0, 1.17, 0.07, 0.1, 0x111111, 'plain', { rz: Math.atan2(6, 10) }); B.box(0, -0.4, 0, 1.17, 0.6, 0.18, 0x9aa0a6, 'metal', { rz: Math.atan2(6, 10) }); } }
  // elevator shaft door frames get call buttons
  // ── furnishing ──
  furnishAll(B, P, r);
  // fascia signs over shopfronts
  for (const rm of P.rooms) { if (!rm.sign) continue; const fs = Object.entries(rm.sides).find(([, k]) => k === 'front'); const lv = rm.lv[0], L = LEVELS[lv]; const [x0, z0, x1, z1] = rm.r;
    if (rm.type === 'market') { B.at(0, 0, -20.15, 0, 'G'); B.sign(0, 4.2, 0, 7, 1.1, 'store:' + rm.sign, { glow: true, room: rm.id, flicker: 0.2 }); continue; }
    if (!fs) { if (rm.type === 'cinemalobby') { B.at(0, 6, -14.2, 0, 'U'); B.sign(0, 4, 0, 8, 1, 'store:' + rm.sign, { glow: true, room: rm.id, flicker: 0.2 }); } continue; }
    const side = fs[0], len = side === 'n' || side === 's' ? x1 - x0 : z1 - z0; const pos = { n: [(x0 + x1) / 2, z0 - 0.15, Math.PI], s: [(x0 + x1) / 2, z1 + 0.15, 0], w: [x0 - 0.15, (z0 + z1) / 2, -Math.PI / 2], e: [x1 + 0.15, (z0 + z1) / 2, Math.PI / 2] }[side];
    B.at(pos[0], L.y, pos[1], pos[2], lv); B.sign(0, 3.75, 0, Math.min(len - 1.5, 6.5), 0.75, 'store:' + rm.sign, { glow: true, room: rm.id, flicker: rm.cond === 'damaged' || rm.cond === 'wrecked' ? 0.6 : 0.1 }); }
  // level indicators near stairs
  for (const rm of P.rooms.filter(x => x.type === 'stair')) for (const lv of rm.lv) { const d = P.doors.find(q => q.room === rm.id && q.lv === lv); if (!d) continue; const [a, b, c, e] = d.seg; B.at((a + c) / 2 + (d.axis === 'z' ? -0.2 : 0), LEVELS[lv].y, (b + e) / 2 + (d.axis === 'x' ? 0.2 : 0), d.axis === 'z' ? -Math.PI / 2 : 0, lv); B.sign(1.6, 1.6, 0, 0.7, 0.5, 'level:' + LEVELS[lv].name, {}); }
  // ── flush buckets → meshes ──
  const meshes = [];
  for (const b of B.buckets.values()) { if (!b.pos.length) continue; const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3)); g.setIndex(b.idx); g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, M[b.mat] || M.plain); mesh.matrixAutoUpdate = false; mesh.receiveShadow = quality === 'high' && !['glass', 'emissive', 'screen'].includes(b.mat); mesh.castShadow = quality === 'high' && !['glass', 'emissive', 'screen', 'ceiling', 'water'].includes(b.mat) && b.pos.length < 200000; if (b.mat === 'glass') mesh.renderOrder = 2; groups[b.lv].add(mesh); meshes.push(mesh); }
  // signs & posters (own textures)
  const signs = [];
  const SG = new THREE.PlaneGeometry(1, 1);
  for (const s of B.signs) { let tex, base = 0xffffff; const k = s.tex;
    if (k.startsWith('store:')) tex = textTex(k.slice(6), { w: 512, h: 96, size: 58, bg: '#14161a', fg: ['#ff4a4a', '#4ad8ff', '#ffd84a', '#ff7ad8', '#7aff9a', '#ffffff'][Math.abs(hashS(k)) % 6], glow: true });
    else if (k.startsWith('menu:')) tex = textTex(k.slice(5) + '\nCOMBO  4.99   ·   MEAL  6.49', { w: 512, h: 160, size: 34, bg: '#1a1208', fg: '#ffd890' });
    else if (k.startsWith('poster:')) tex = posterTex(+k.slice(7));
    else if (k === 'exit') { tex = textTex('EXIT', { w: 128, h: 48, size: 34, bg: '#0a3a1a', fg: '#7aff9a', glow: true, dirt: false }); }
    else if (k === 'staff') tex = textTex('STAFF ONLY', { w: 192, h: 48, size: 26, bg: '#2a2a2a', fg: '#e8e8e8', dirt: false });
    else if (k.startsWith('level:')) tex = textTex(k.slice(6).toUpperCase(), { w: 256, h: 96, size: 34, bg: '#e8d84a', fg: '#111', dirt: true });
    else continue;
    const glow = s.glow; const mat = new THREE.MeshBasicMaterial({ map: tex, color: base, toneMapped: !glow, fog: true });
    const m = new THREE.Mesh(SG, mat); m.position.set(s.x, s.y, s.z); m.rotation.set(s.rx, s.rot, 0, 'YXZ'); m.scale.set(s.w, s.h, 1); groups[s.lv]?.add(m);
    signs.push({ mesh: m, mat, glow, kind: k.split(':')[0], flicker: s.flicker || 0, lv: s.lv, room: s.room, x: s.x, z: s.z, phase: Math.random() * 10 }); }
  // dynamic: doors, shutters, elevator
  const doors = P.doors.map(d => makeDoor(d, M, groups[d.lv]));
  const shutters = P.shutters.map(s => makeShutter(s, M, groups[s.lv]));
  const elevator = makeElevator(P, M, groups);
  // lamps: instanced panels per level
  const lampGroups = {}; const LGEO = new THREE.BoxGeometry(1, 0.06, 1);
  for (const lv of LV) { const list = B.lamps.filter(l => l.lv === lv && l.kind === 'panel'); if (!list.length) continue; const im = new THREE.InstancedMesh(LGEO, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), list.length); const m4 = new THREE.Matrix4();
    list.forEach((l, i) => { m4.compose(new THREE.Vector3(l.x, l.y, l.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, l.rot, 0)), new THREE.Vector3(l.w, 1, l.d)); im.setMatrixAt(i, m4); im.setColorAt(i, new THREE.Color(0x222222)); l.inst = i; l.im = im; });
    im.instanceMatrix.needsUpdate = true; groups[lv].add(im); lampGroups[lv] = im; }
  return { groups, meshes, signs, doors, shutters, elevator, lamps: B.lamps, lampGroups, spots: B.spots, hides: B.hides, anims: B.anims, B };
}
const hashS = s => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; };

function buildRamp(B, s) {
  const lv = s.lv, along = s.ramp, run = Math.abs(s.a1 - s.a0), rise = s.yb - s.ya, n = Math.max(2, Math.round(Math.abs(rise) / 0.18)); const dir = Math.sign(s.a1 - s.a0);
  const w = along === 'x' ? s.z1 - s.z0 : s.x1 - s.x0, c = along === 'x' ? (s.z0 + s.z1) / 2 : (s.x0 + s.x1) / 2;
  for (let i = 0; i < n; i++) { const a = s.a0 + dir * (i + 0.5) * run / n, y = s.ya + (i + 1) * rise / n; const lvv = B.P.levelAtY(y);
    B.at(along === 'x' ? a : c, s.ya + i * rise / n, along === 'x' ? c : a, 0, lvv);
    const esc = s.mat === 'escalator'; const sx = along === 'x' ? run / n : w, sz = along === 'x' ? w : run / n;
    B.box(0, -0.25, 0, sx, rise / n + 0.25, sz, esc ? 0x55595e : 0x8a8a84, esc ? 'metal' : 'concrete', { noBottom: true }); if (esc) B.box(0, rise / n, 0, sx, 0.005, sz, 0xd8b02a, 'plain'); }
  // underside slab
  const lvv = B.P.levelAtY((s.ya + s.yb) / 2); B.at(along === 'x' ? (s.a0 + s.a1) / 2 : c, (s.ya + s.yb) / 2 - 0.45, along === 'x' ? c : (s.a0 + s.a1) / 2, 0, lvv);
  const ang = Math.atan2(rise, run) * dir; B.box(0, 0, 0, along === 'x' ? Math.hypot(run, rise) : w, 0.3, along === 'x' ? w : Math.hypot(run, rise), 0x7a7a74, 'concrete', along === 'x' ? { rz: ang } : { rx: -ang });
}

function makeDoor(d, M, group) {
  const [a, b, c, e] = d.seg, L = LEVELS[d.lv], vert = d.axis === 'z', len = vert ? e - b : c - a; const root = new THREE.Group(); root.position.set((a + c) / 2, L.y, (b + e) / 2); root.rotation.y = vert ? Math.PI / 2 : 0; group.add(root);
  const mk = (w, h, col, mat = M.plain, o = {}) => { const g = new THREE.BoxGeometry(w, h, o.d || 0.06); const m = new THREE.Mesh(g, mat.clone ? mat : mat); const cc = new THREE.Color(col); const n = g.attributes.position.count; g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(n).fill(0).flatMap(() => [cc.r, cc.g, cc.b]), 3)); return m; };
  const leaves = []; const kind = d.kind;
  if (kind === 'gate' || kind === 'dockdoor') { const m = mk(len, kind === 'gate' ? 4.2 : 4.2, 0xa8acb0, M.corrugated, { d: 0.12 }); m.position.y = 2.1; root.add(m); leaves.push({ mesh: m, type: 'roll' }); }
  else if (kind === 'elev') { for (const s of [-1, 1]) { const m = mk(len / 2, 2.4, 0xb8bcc0, M.metal, { d: 0.06 }); m.position.set(s * len / 4, 1.2, 0.05); root.add(m); leaves.push({ mesh: m, type: 'slide', s, w: len / 2 }); } }
  else { const double = len >= 1.8; const n = double ? 2 : 1, lw = len / n; const col = { entrance: 0xffffff, glass: 0xffffff, metal: 0x5a6a7a, emergency: 0x8a2a2a, stair: 0x6a5a4a, staff: 0x7a7468, double: 0x7a7468, door: 0x8a6a4a }[kind] ?? 0x7a7468; const glassy = kind === 'entrance';
    for (let i = 0; i < n; i++) { const pivot = new THREE.Group(); const s = i === 0 ? -1 : 1; pivot.position.set(s * len / 2, 0, 0); root.add(pivot); const h = kind === 'entrance' ? 3.3 : 2.3;
      const leaf = glassy ? new THREE.Mesh(new THREE.BoxGeometry(lw - 0.04, h, 0.03), M.glass) : mk(lw - 0.04, h, col, kind === 'metal' || kind === 'emergency' ? M.metal : M.wood); leaf.position.set(-s * (lw / 2), h / 2, 0); pivot.add(leaf);
      if (glassy) { const fr = mk(lw, 0.08, 0x2a2c30, M.metal); fr.position.set(-s * lw / 2, h, 0); pivot.add(fr); const fr2 = fr.clone(); fr2.position.y = 0.05; pivot.add(fr2); if (d.lock === 'exit') { const ch = mk(lw * 0.9, 0.08, 0x8a8a8a, M.metal, { d: 0.12 }); ch.position.set(-s * lw / 2, 1.1, 0.08); ch.rotation.z = s * 0.3; pivot.add(ch); leaves.push({ chain: ch }); } }
      else { const kn = mk(0.12, 0.05, 0xd0d0d0, M.metal, { d: 0.12 }); kn.position.set(-s * (lw - 0.15), 1.0, 0); pivot.add(kn); if (kind === 'emergency') { const bar = mk(lw * 0.8, 0.07, 0xc8c8c8, M.metal, { d: 0.14 }); bar.position.set(-s * lw / 2, 1.0, 0.06); pivot.add(bar); } }
      leaves.push({ pivot, type: 'hinge', s }); } }
  return { d, root, leaves, t: d.open ? 1 : 0,
    update(dt) { const target = d.open ? 1 : 0; this.t += Math.sign(target - this.t) * Math.min(Math.abs(target - this.t), dt * (d.kind === 'gate' || d.kind === 'dockdoor' ? 0.35 : d.kind === 'elev' ? 1.6 : 2.5));
      for (const l of this.leaves) { if (l.type === 'hinge') l.pivot.rotation.y = l.s * this.t * 1.5; else if (l.type === 'roll') { l.mesh.scale.y = Math.max(0.05, 1 - this.t); l.mesh.position.y = 4.2 - 2.1 * l.mesh.scale.y; } else if (l.type === 'slide') l.mesh.position.x = l.s * (len / 4 + this.t * len / 2 * 0.95); else if (l.chain) l.chain.visible = d.locked; } } };
}
function makeShutter(s, M, group) {
  const [a, b, c, e] = s.seg, L = LEVELS[s.lv], vert = s.axis === 'z', len = vert ? e - b : c - a; const g = new THREE.BoxGeometry(len, 3.4, 0.06); const col = new THREE.Color(0xb0b4b8); g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(g.attributes.position.count).fill(0).flatMap(() => [col.r, col.g, col.b]), 3));
  const m = new THREE.Mesh(g, M.corrugated); m.position.set((a + c) / 2, L.y + 1.7, (b + e) / 2); m.rotation.y = vert ? Math.PI / 2 : 0; group.add(m);
  const H = { open: 0.02, half: 0.69, closed: 1 }; let cur = H[s.state];
  const apply = () => { m.scale.y = Math.max(0.02, cur); m.position.y = L.y + 3.4 - 1.7 * m.scale.y; };
  apply(); return { s, mesh: m, update(dt) { const t = H[s.state]; if (Math.abs(t - cur) > 0.001) { cur += Math.sign(t - cur) * Math.min(Math.abs(t - cur), dt * 0.6); apply(); } } };
}
function makeElevator(P, M, groups) {
  const E2 = P.elevator, w = E2.x1 - E2.x0, d = E2.z1 - E2.z0; const car = new THREE.Group(); const col = new THREE.Color(0x9aa0a6);
  const part = (sx, sy, sz, x, y, z, mat = M.metal, c = col) => { const g = new THREE.BoxGeometry(sx, sy, sz); g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(g.attributes.position.count).fill(0).flatMap(() => [c.r, c.g, c.b]), 3)); const m = new THREE.Mesh(g, mat); m.position.set(x, y, z); car.add(m); return m; };
  part(w, 0.1, d, 0, -0.05, 0); part(w, 0.08, d, 0, 2.55, 0); part(0.06, 2.6, d, -w / 2, 1.3, 0); part(0.06, 2.6, d, w / 2, 1.3, 0); part(w, 2.6, 0.06, 0, 1.3, -d / 2);
  const btn = part(0.25, 0.4, 0.04, w / 2 - 0.1, 1.2, d / 2 - 0.4, M.emissive, new THREE.Color(0x553311)); const light = part(w * 0.6, 0.03, d * 0.6, 0, 2.5, 0, M.emissive, new THREE.Color(0x777766));
  car.position.set((E2.x0 + E2.x1) / 2, E2.y, (E2.z0 + E2.z1) / 2); (groups.G).add(car);
  const lvs = ['B', 'G', 'U'];
  return { car, btn, light, update(dt, P2) { const e = P.elevator; if (e.moving) { const ty = LEVELS[e.targetLv].y, dy = ty - e.y; const st = Math.sign(dy) * Math.min(Math.abs(dy), dt * 1.4); e.y += st; if (Math.abs(ty - e.y) < 0.001) { e.y = ty; e.moving = false; e.level = e.targetLv; } }
    P.elevSurf.y = e.y; car.position.y = e.y; btn.material = M.emissive; const c = e.powered ? 0x66ff99 : 0x552211; btn.geometry.attributes.color.array.fill(0); const cc = new THREE.Color(c); const arr = btn.geometry.attributes.color.array; for (let i = 0; i < arr.length; i += 3) { arr[i] = cc.r; arr[i + 1] = cc.g; arr[i + 2] = cc.b; } btn.geometry.attributes.color.needsUpdate = true;
    // move the car between level groups so it stays visible on the right floor
    const lvNow = e.y < -2.5 ? 'B' : e.y < 3 ? 'G' : 'U'; if (car.parent !== groups[lvNow]) groups[lvNow].add(car); }, lvs };
}
