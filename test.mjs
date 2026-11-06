// Logic tests (Node 18+, no browser): `node test.mjs`
// Covers: objective solvability across seeds/routes/difficulties, physical walkability between floors with the real
// player controller, monster fairness (no hits through walls, needs sight), hearing, loot scaling, inventory rules,
// connection-code packing.
import { buildPlan, LEVELS } from './mallplan.js';
import { Builder, furnishAll } from './props.js';
import { generateMatch, START, lockOpenedBy, ROUTES } from './objectives.js';
import { MonsterAI } from './monster.js';
import { newPlayer, stepPlayer, addItem, canTake, removeItem, hasItem } from './player.js';
import { ITEMS, SLOT_CAP } from './items.js';
import { rng } from './util.js';
import { pack, unpack } from './net.js';

let pass = 0, fail = 0; const ok = (c, msg) => { if (c) pass++; else { fail++; console.log('  ✖ ' + msg); } };
const world = seed => { const P = buildPlan(seed); const r = rng(seed ^ 0x3d); const B = new Builder(P, r); furnishAll(B, P, r); P.finalizeNav(); return { P, B }; };
const t0 = Date.now();

// 1. every required chain is solvable from the start, for every route
console.log('▶ objective solvability');
const routes = Object.keys(ROUTES); let combos = 0;
for (let seed = 1; seed <= 30; seed++) {
  const { P, B } = world(seed);
  for (const route of routes) {
    const players = 1 + (seed + routes.indexOf(route)) % 4, difficulty = ['normal', 'hard', 'nightmare'][seed % 3];
    const M = generateMatch(seed * 7 + route.length, P, B.spots, { players, difficulty, route, modifiers: seed % 5 === 0 ? ['emergency_lockdown', 'power_failure'] : [] }); combos++;
    const req = M.objectives.filter(o => !o.optional); ok(req.length >= 2 && req.length <= 7, `seed ${seed} ${route}: ${req.length} required objectives`);
    ok(M.objectives.length >= 3 && M.objectives.length <= 9, `seed ${seed} ${route}: ${M.objectives.length} objectives total`);
    const inv = []; let reach; for (let it = 0; it < 30; it++) { reach = P.reachableRooms(START.lv, START.x, START.z, d => lockOpenedBy(d.lock, inv)); let got = 0; for (const i of M.items) if (!i._t && reach.has(i.room)) { i._t = 1; inv.push(i.item); got++; } if (!got) break; }
    for (const o of req) for (const s of o.steps) {
      if (s.item && s.kind === 'deliver') ok(inv.filter(x => x === s.item).length >= s.count, `seed ${seed} ${route}: ${o.id} needs ${s.count}× ${s.item}`);
      for (const n of [...(s.needItems || []), ...(s.items || [])]) ok(inv.includes(n), `seed ${seed} ${route}: ${o.id} needs ${n}`);
      if (s.at) { const I = M.inter.find(q => q.id === s.at); ok(I && reach.has(I.room), `seed ${seed} ${route}: ${o.id} station ${s.at} reachable`); }
    }
    ok(reach.has(P.roomAt(M.monster.lv, M.monster.x, M.monster.z)?.id), `seed ${seed} ${route}: monster spawns in a reachable room`);
    ok(Math.hypot(M.monster.x - START.x, M.monster.z - START.z) > 40, `seed ${seed} ${route}: monster spawns far from players`);
    ok(M.items.filter(i => ITEMS[i.item].cat === 'battery').length >= 3, `seed ${seed} ${route}: minimum batteries`);
  }
}
console.log(`  ${combos} seed/route combinations`);

// 2. the real controller can walk from the entrance to every level (stairs, escalators) — and back
console.log('▶ walkability between floors');
{ const { P } = world(3); const targets = [['U', -30, 0], ['B', -20, -20], ['U', 30, 0], ['R', 40, 10], ['G', -40, 0], ['B', 40, -25]];
  for (const [lv, tx, tz] of targets) {
    P.doors.forEach(d => { if (!d.exit) { d.open = true; d.locked = false; } });
    const p = newPlayer('t', 'T', { x: START.x, y: 0, z: START.z + 3, lv: 'G' }); const path = P.findPath('G', p.x, p.z, lv, tx, tz, false, 40000);
    ok(!!path, `path G→${lv} (${tx},${tz})`); if (!path) continue; let wi = 0, tt = 0;
    while (wi < path.length && tt < 240) { const w = path[wi]; const dx = w.x - p.x, dz = w.z - p.z, d = Math.hypot(dx, dz); if (d < 0.45) { wi++; continue; }
      p.yaw = Math.atan2(-dx, -dz); stepPlayer(p, { mx: 0, mz: 1, sprint: false, crouch: false }, 1 / 30, P); tt += 1 / 30; }
    ok(p.lv === lv && Math.abs(p.y - LEVELS[lv].y) < 0.3, `walked to ${lv}: ended on ${p.lv} y=${p.y.toFixed(2)} after ${tt.toFixed(0)}s`);
  } }

// 3. monster fairness
console.log('▶ monster fairness');
{ const { P, B } = world(5);
  // find a wall with floor on both sides: player on one side, monster on the other, 1 m apart
  let tested = 0, hitsThroughWall = 0;
  for (const w of P.walls.filter(w => w.kind === 'wall' && w.lv === 'G').slice(0, 400)) {
    if (tested >= 25) break; const vert = w.x0 === w.x1; const mx = vert ? w.x0 : (w.x0 + w.x1) / 2, mz = vert ? (w.z0 + w.z1) / 2 : w.z0; if ((vert ? w.z1 - w.z0 : w.x1 - w.x0) < 2) continue;
    const a = vert ? [mx - 0.6, mz] : [mx, mz - 0.6], b = vert ? [mx + 0.6, mz] : [mx, mz + 0.6];
    if (!P.groundAt(a[0], a[1], 0.3) || !P.groundAt(b[0], b[1], 0.3) || P.nearestNav('G', a[0], a[1]) < 0 || P.nearestNav('G', b[0], b[1]) < 0) continue; if (P.los('G', a[0], a[1], 'G', b[0], b[1])) continue;
    tested++; const AI = new MonsterAI(P, { x: a[0], y: 0, z: a[1], lv: 'G' }, { seed: 1 }); const pl = [{ id: 'p', x: b[0], y: 0, z: b[1], lv: 'G', yaw: 0, health: 100, flashlight: true, sprint: true }];
    AI.setState('chase'); AI.target = 'p'; for (let i = 0; i < 25; i++) { const ev = AI.update(1 / 30, pl, [], B.hides); if (ev.some(e => e.type === 'hit')) { const d = Math.hypot(AI.x - pl[0].x, AI.z - pl[0].z); if (!P.los('G', AI.x, AI.z, 'G', pl[0].x, pl[0].z) || d > 2.2) hitsThroughWall++; } }
  }
  ok(tested >= 10, `tested ${tested} wall cases`); ok(hitsThroughWall === 0, `no hits through walls (${hitsThroughWall})`);
  // a crouching, dark, quiet player 9 m away behind it is not noticed in 3 s; a sprinting torch-lit one in front is
  const open = P.room('atrium') ? { x: 0, z: 14 } : { x: 0, z: 20 };
  const AI = new MonsterAI(P, { x: open.x, y: 0, z: open.z, lv: 'G' }, { seed: 2 }); AI.yaw = 0; // facing +z
  const sneaky = [{ id: 's', x: open.x, y: 0, z: open.z - 9, lv: 'G', yaw: 0, health: 100, crouch: true }];
  let spotted = false; for (let i = 0; i < 90; i++) { AI.yaw = 0; if (AI.update(1 / 30, sneaky, [], B.hides).some(e => e.type === 'spotted')) spotted = true; } ok(!spotted, 'quiet crouched player behind it stays unseen');
  const AI2 = new MonsterAI(P, { x: open.x, y: 0, z: open.z, lv: 'G' }, { seed: 3 }); AI2.yaw = 0; const loud = [{ id: 'l', x: open.x, y: 0, z: open.z + 8, lv: 'G', yaw: Math.PI, health: 100, flashlight: true, lookAtMonster: true, sprint: true }];
  spotted = false; for (let i = 0; i < 90; i++) { AI2.yaw = 0; if (AI2.update(1 / 30, loud, [], B.hides).some(e => e.type === 'spotted')) spotted = true; } ok(spotted, 'torch in its face gets you spotted');
  const AI3 = new MonsterAI(P, { x: open.x, y: 0, z: open.z, lv: 'G' }, { seed: 4 }); const ev = AI3.update(1 / 30, [], [{ x: open.x + 10, y: 0, z: open.z, lv: 'G', r: 30, kind: 'machine', big: true }], B.hides); ok(['hunt', 'investigate'].includes(AI3.state), `loud machine noise draws it (${AI3.state})`);
}

// 4. loot scaling, inventory rules
console.log('▶ loot & inventory');
{ const { P, B } = world(9); const count = (d, mods = []) => generateMatch(42, P, B.spots, { players: 1, difficulty: d, modifiers: mods }).items.filter(i => ITEMS[i.item].cat === 'battery').length;
  ok(count('normal') > count('nightmare'), `more batteries on normal (${count('normal')}) than nightmare (${count('nightmare')})`); ok(count('normal', ['limited_batteries']) < count('normal'), 'limited batteries modifier works');
  const p = newPlayer('a', 'A', { x: 0, z: 0 }); let n = 0; for (const id of ['crowbar', 'radio', 'map', 'lockpick', 'motion', 'screwdriver', 'wirecutters']) if (canTake(p, id)) { addItem(p, id); n++; }
  ok(n === SLOT_CAP, `belt holds ${SLOT_CAP} tools (${n})`); ok(canTake(p, 'key_roof') && addItem(p, 'key_roof') && hasItem(p, 'key_roof'), 'keys always fit on the keyring');
  removeItem(p, 'radio'); ok(!hasItem(p, 'radio') && canTake(p, 'bandage'), 'removing frees a slot');
  const q = newPlayer('b', 'B', { x: 0, z: 0 }); addItem(q, 'batt_aa'); addItem(q, 'batt_aa'); addItem(q, 'batt_aa'); ok(q.inv.length === 1 && q.inv[0].n === 3, 'batteries stack');
}

// 5. connection codes round-trip
console.log('▶ connection codes');
{ const o = { v: 1, k: 'o', id: 'm1', sdp: 'v=0\r\no=- 123 2 IN IP4 127.0.0.1\r\n'.repeat(12) }; const s = await pack(o); ok(s.startsWith('DA'), 'packed prefix'); ok(JSON.stringify(await unpack(s)) === JSON.stringify(o), 'pack/unpack round trip'); ok(s.length < JSON.stringify(o).length, `compressed (${s.length} < ${JSON.stringify(o).length})`); }

console.log(`\n${fail ? '✖' : '✔'} ${pass} passed, ${fail} failed in ${((Date.now() - t0) / 1000).toFixed(1)}s`); process.exit(fail ? 1 : 0);
