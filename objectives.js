// Randomised objective chains with guaranteed-solvable item placement. Pure logic; the host runs it and shares the result.
import { rng } from './util.js';
import { ITEMS, spawnLoot } from './items.js';
import { LEVELS } from './mallplan.js';

export const ROUTES = {
  entrance: { title: 'Escape through the main entrance', zone: 'plaza', hint: 'Main Entrance Hall — ground floor' },
  dock: { title: 'Escape through the loading dock', zone: 'dockyard', hint: 'Loading Dock — basement' },
  parking: { title: 'Drive out through the parking gate', zone: 'rampOut', hint: 'Underground Parking — basement' },
  roof: { title: 'Signal the helicopter from the roof', zone: 'roof', hint: 'Rooftop — via the east stairwell' },
  emergency: { title: 'Break out through the west emergency exit', zone: 'alleyW', hint: 'West Concourse — ground floor' },
};
export const MODIFIERS = {
  power_failure: { name: 'Power Failure', desc: 'The generator needs a replacement component.' },
  heavy_fog: { name: 'Heavy Fog', desc: 'Visibility is much lower.' },
  emergency_lockdown: { name: 'Emergency Lockdown', desc: 'Some exits stay sealed until security is restored.' },
  limited_batteries: { name: 'Limited Batteries', desc: 'Batteries are rare.' },
  aggressive: { name: 'Increased Aggression', desc: 'It hunts harder and searches longer.' },
  unstable_power: { name: 'Unstable Electricity', desc: 'Lights fail and flicker, even after power is restored.' },
  low_visibility: { name: 'Reduced Visibility', desc: 'Your flashlight beam is narrower and dimmer.' },
};
const LOCK_ITEM = { 'key:security': ['key_security'], 'key:electrical': ['key_electrical'], 'key:roof': ['key_roof'], 'key:projection': ['key_projection'], card: ['keycard', 'card_red', 'card_blue', 'card_green', 'sec_device'], pick: ['lockpick'], pry: ['crowbar'], chain: ['wirecutters'] };
export const lockOpenedBy = (lock, inv) => (LOCK_ITEM[lock] || []).some(id => inv.includes(id));
export const lockNeeds = lock => ({ 'key:security': 'Security Office Key', 'key:electrical': 'Electrical Room Key', 'key:roof': 'Rooftop Access Key', 'key:projection': 'Projection Booth Key', card: 'a security keycard', pick: 'a lockpick', pry: 'a crowbar', chain: 'wire cutters', exit: '', gate: '', dock: '' }[lock] || 'something');
export const START = { lv: 'G', x: 0, z: 24 };

export function generateMatch(seed, P, spots, opts = {}) {
  const r = rng(seed ^ 0x0b1ec7); const players = opts.players || 1, diff = opts.difficulty || 'normal'; const mods = opts.modifiers || [];
  const objectives = [], inter = [], need = [], placed = []; const reserved = new Set();
  const addNeed = (item, n = 1, rooms = null, tag = null) => { for (let i = 0; i < n; i++) need.push({ item, rooms, tag }); };
  const roomLock = id => P.doors.filter(d => d.room === id && d.lock && !['exit', 'gate', 'dock'].includes(d.lock)).map(d => d.lock);
  const addInter = (type, room, label, extra = {}) => { const pt = P.randomFloorPoint(room, r, 1.2) || P.randomFloorPoint(room, r, 0.6); const it = { id: type, type, room, label, lv: pt.lv, x: pt.x, y: pt.y, z: pt.z, ...extra }; inter.push(it); for (const l of roomLock(room)) addNeed(LOCK_ITEM[l][0], 1, null, 'lock'); return it; };
  const zone = id => { const rm = P.room(id); return `${rm.name} — ${LEVELS[rm.lv[0]].name.toLowerCase()}`; };
  const has = id => objectives.some(o => o.id === id);
  const T = {
    power() { if (has('power')) return; const fb = addInter('fusebox', 'electrical', 'Fuse Box'); const gen = addInter('generator', 'generator', 'Generator Controls', { hold: 6, noise: 38 }); const nf = players > 1 ? 3 : 2; addNeed('fuse', nf);
      const steps = [{ kind: 'deliver', item: 'fuse', count: nf, at: 'fusebox', t: `Insert fuses in the fuse box` }];
      if (mods.includes('power_failure') || r.chance(0.3)) { addNeed('gen_part'); steps.push({ kind: 'deliver', item: 'gen_part', count: 1, at: 'generator', t: 'Fit the generator component' }); }
      steps.push({ kind: 'use', at: 'generator', hold: 6, noise: 38, t: 'Restart the basement generator (loud!)' });
      objectives.push({ id: 'power', title: 'Restore electricity to the mall', hint: `${zone('electrical')} and ${zone('generator')}`, steps, deps: [] }); },
    security() { if (has('security')) return; T.power(); const variant = r.chance(0.5); addInter('seconsole', 'secControl', 'Security Console', { hold: 3 });
      if (variant) { addNeed('card_red', 1, null, 'card'); addNeed('card_blue', 1, null, 'card'); addNeed('card_green', 1, null, 'card'); objectives.push({ id: 'keycards', title: 'Find three missing security keycards', hint: 'Scattered across the mall', steps: [{ kind: 'collect', items: ['card_red', 'card_blue', 'card_green'], t: 'Recover the red, blue and green keycards' }], deps: [] }); }
      objectives.push({ id: 'security', title: 'Activate the security control system', hint: zone('secControl'), steps: [{ kind: 'use', at: 'seconsole', hold: 3, t: 'Bring the cameras back online', needItems: variant ? ['card_red', 'card_blue', 'card_green'] : null }], deps: variant ? ['power', 'keycards'] : ['power'], effect: 'cameras' }); },
    comms(room) { if (has('comms')) return; T.power(); addNeed('radio'); addInter('relay', room || r.pick(['secControl', 'projection']), 'Emergency Radio Relay', { hold: 4 }); objectives.push({ id: 'comms', title: 'Reactivate the emergency communication system', hint: zone(inter[inter.length - 1].room), steps: [{ kind: 'use', at: 'relay', hold: 4, t: 'Patch a radio into the relay and call Dispatch', needItems: ['radio'] }], deps: ['power'], effect: 'comms' }); },
    code() { if (has('code')) return; const room = r.pick(['offices', 'customer', 'security', 'medical']); addNeed('code_note', 1, [room], 'quest'); objectives.push({ id: 'code', title: 'Find the main entrance access code', hint: 'Someone wrote it down. Offices, the security office or customer service.', steps: [{ kind: 'collect', items: ['code_note'], t: 'Find the note with the access code' }], deps: [] }); },
    guard() { const room = r.pick(['wcE', 'projection', 'storeroom', 'utility', 'tunnel2', 'kitchen', 'medical', 'cinema2']); addInter('guard', room, 'Missing Guard'); objectives.push({ id: 'guard', title: 'Locate the missing security guard', hint: 'Last radio check came from somewhere quiet…', optional: true, steps: [{ kind: 'use', at: 'guard', hold: 2, t: 'Search the guard' }], deps: [], reward: ['bodycam', 'keycard', 'key_security'] }); },
    container() { addNeed('container', 1, ['lockedMaint'], 'quest'); addNeed('wirecutters', 1, null, 'lock'); objectives.push({ id: 'container', title: 'Recover the classified storage container', hint: zone('lockedMaint'), optional: true, risk: true, steps: [{ kind: 'collect', items: ['container'], t: 'Take the container (heavy — no sprinting)' }, { kind: 'carry', item: 'container', t: 'Carry it out when you escape' }], deps: [] }); },
    docs() { for (let i = 0; i < 3; i++) addNeed('documents', 1, null, 'docs'); objectives.push({ id: 'docs', title: 'Retrieve missing research documents', hint: 'Three folders, anywhere', optional: true, steps: [{ kind: 'collect', items: ['documents'], count: 3, t: 'Collect the research documents' }], deps: [] }); },
    elevator() { T.power(); addNeed('screwdriver'); addInter('elevpanel', 'atrium', 'Elevator Service Panel', { hold: 4, near: { x: 3, z: -10 } }); objectives.push({ id: 'elevator', title: 'Restore the elevator', hint: 'Atrium elevator, ground floor', optional: true, steps: [{ kind: 'use', at: 'elevpanel', hold: 4, t: 'Rewire the service panel', needItems: ['screwdriver'] }], deps: ['power'], effect: 'elevator' }); },
  };
  // escape route
  const routeKeys = Object.keys(ROUTES); const route = opts.route || r.pick(routeKeys); const deps = [];
  if (route === 'entrance') { T.code(); deps.push('code'); if (r.chance(0.5)) { T.power(); deps.push('power'); } const k = { id: 'keypad', type: 'keypad', room: 'southHall', label: 'Entrance Keypad', lv: 'G', x: 4.8, y: 0, z: 31.2, hold: 2 }; inter.push(k); }
  if (route === 'dock') { T.power(); deps.push('power'); addNeed('key_dock'); addInter('dockctl', 'dock', 'Dock Shutter Control', { hold: 3, near: { x: 38, z: -36.5 } }); }
  if (route === 'parking') { T.power(); deps.push('power'); addNeed('key_vehicle'); objectives.push({ id: 'vkeys', title: 'Find the emergency vehicle keys', hint: 'Security usually keeps them…', steps: [{ kind: 'collect', items: ['key_vehicle'], t: 'Find the vehicle keys' }], deps: [] }); deps.push('vkeys'); addInter('gatectl', 'parking', 'Parking Gate Control', { hold: 3, near: { x: -55.5, z: -23 } }); }
  if (route === 'roof') { T.comms(); deps.push('comms'); addNeed('key_roof', 1, null, 'lock'); addInter('flarepad', 'roof', 'Helipad', { hold: 2, near: { x: 40, z: 10 } }); addNeed('flare'); }
  if (route === 'emergency') { addNeed('wirecutters', 1, null, 'lock'); if (mods.includes('emergency_lockdown')) { T.security(); deps.push('security'); } }
  // extra required objectives to hit the target count
  const target = Math.min(6, (players > 1 ? 4 : 3) + (diff === 'hard' ? 1 : diff === 'nightmare' ? 2 : 0));
  const extras = r.shuffle(['power', 'security', 'comms']);
  while (objectives.filter(o => !o.optional).length + 1 < target && extras.length) { const k = extras.shift(); if (has(k)) continue; T[k](); deps.push(k); }
  // optional ones (risk / reward)
  for (const k of r.shuffle(['guard', 'container', 'docs', 'elevator']).slice(0, players > 1 ? 2 : 1 + (r.chance(0.5) ? 1 : 0))) T[k]();
  const esc = { id: 'escape', title: ROUTES[route].title, hint: ROUTES[route].hint, steps: [], deps: [...new Set(objectives.filter(o => !o.optional).map(o => o.id))], route };
  if (route === 'entrance') esc.steps.push({ kind: 'use', at: 'keypad', hold: 2, t: 'Enter the access code at the keypad', needItems: ['code_note'] });
  if (route === 'dock') esc.steps.push({ kind: 'use', at: 'dockctl', hold: 3, t: 'Raise the dock shutter', needItems: ['key_dock'] });
  if (route === 'parking') esc.steps.push({ kind: 'use', at: 'gatectl', hold: 3, t: 'Open the parking gate', needItems: ['key_vehicle'] });
  if (route === 'roof') esc.steps.push({ kind: 'use', at: 'flarepad', hold: 2, t: 'Light the flare on the helipad', needItems: ['flare'] }, { kind: 'wait', seconds: players > 1 ? 75 : 60, t: 'Survive until the helicopter lands' });
  if (route === 'emergency') esc.steps.push({ kind: 'door', door: 'alleyW', t: 'Cut the chains on the emergency exit', needItems: ['wirecutters'] });
  esc.steps.push({ kind: 'reach', zone: ROUTES[route].zone, t: 'Get out' }); objectives.push(esc);
  // ── item placement: progressive reachability so every chain is solvable ──
  const unlocked = new Set(); const opens = d => !!d.lock && (LOCK_ITEM[d.lock] || []).some(id => unlocked.has(id));
  const order = r.shuffle(need).sort((a, b) => (a.tag === 'lock' ? 0 : 1) - (b.tag === 'lock' ? 0 : 1));
  const freeSpots = spots.filter(s => P.room(s.room) && !['outside', 'roof'].includes(P.room(s.room).type));
  let reach = P.reachableRooms(START.lv, START.x, START.z, opens); let lastNew = new Set();
  for (const n of order) {
    let cand = freeSpots.filter(s => !reserved.has(s) && reach.has(s.room) && (!n.rooms || n.rooms.includes(s.room)) && s.room !== 'southHall');
    if (n.rooms && !cand.length) { // dedicated room not yet reachable: unlock its door's requirement first
      const want = roomLock(n.rooms[0]); for (const l of want) { const it = LOCK_ITEM[l][0]; if (!unlocked.has(it)) { const c2 = freeSpots.filter(s => !reserved.has(s) && reach.has(s.room) && s.room !== 'southHall'); const s = r.pick(c2); reserved.add(s); placed.push({ item: it, spot: s }); unlocked.add(it); } }
      reach = P.reachableRooms(START.lv, START.x, START.z, opens); cand = freeSpots.filter(s => !reserved.has(s) && reach.has(s.room) && n.rooms.includes(s.room)); }
    if (!cand.length) cand = freeSpots.filter(s => !reserved.has(s) && reach.has(s.room));
    // spread things out; prefer recently unlocked rooms (natural chains) and avoid stacking in one room
    const fresh = cand.filter(s => lastNew.has(s.room)); const pickFrom = fresh.length && r.chance(0.5) ? fresh : cand;
    const used = new Map(); for (const p of placed) used.set(p.spot.room, (used.get(p.spot.room) || 0) + 1);
    const spread = pickFrom.filter(s => (used.get(s.room) || 0) < 2); const s = r.pick(spread.length ? spread : pickFrom); if (!s) continue;
    reserved.add(s); placed.push({ item: n.item, spot: s });
    if (Object.values(LOCK_ITEM).flat().includes(n.item) && !unlocked.has(n.item)) { unlocked.add(n.item); const before = reach; reach = P.reachableRooms(START.lv, START.x, START.z, opens); lastNew = new Set([...reach].filter(x => !before.has(x))); }
  }
  // generic loot
  const loot = spawnLoot(r, freeSpots, P, { difficulty: diff, players, modifiers: mods }, reserved);
  // monster spawn: far from the start, not in a locked room
  const reach0 = P.reachableRooms(START.lv, START.x, START.z, () => false); const openRoom = id => !P.doors.some(d => d.room === id && d.locked && !d.exit);
  const far = freeSpots.filter(s => reach0.has(s.room) && openRoom(s.room) && Math.hypot(s.x - START.x, s.z - START.z) > 45 && s.lv !== 'R');
  const ms = r.pick(far.length ? far : freeSpots);
  const code = String(1000 + Math.floor(r() * 9000));
  return { seed, route, objectives: objectives.map(o => ({ ...o, stage: 0, progress: 0, done: false })), items: [...placed, ...loot].map((p, i) => ({ id: i, item: p.item, x: p.spot.x, y: p.spot.y, z: p.spot.z, lv: p.spot.lv, room: p.spot.room })), inter, code, monster: { x: ms.x, y: LEVELS[ms.lv].y, z: ms.z, lv: ms.lv }, modifiers: mods, difficulty: diff };
}
