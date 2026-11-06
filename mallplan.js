// The mall as data and pure logic: rooms on four levels, walls/glass/doors/shutters derived from a 1 m occupancy grid,
// walkable surfaces (floors, stairs, escalators, elevator), colliders, line of sight, and a navigation graph with A*.
// No Three.js here — the 3D builder (mall3d.js) and Node tests both consume this.
import { rng } from './util.js';

export const X0 = -60, Z0 = -40, GW = 120, GD = 80;
export const LEVELS = { B: { i: 0, y: -5, h: 4.5, name: 'Basement' }, G: { i: 1, y: 0, h: 6, name: 'Ground Floor' }, U: { i: 2, y: 6, h: 5.5, name: 'Upper Floor' }, R: { i: 3, y: 12, h: 0, name: 'Rooftop' } };
export const LV = ['B', 'G', 'U', 'R'];
export const E = { NONE: 0, WALL: 1, GLASS: 2, BROKEN: 3, RAIL: 4, DOOR: 5, SHUTTER: 6, EXT: 7 };
const PUBLIC = new Set(['atrium', 'hall', 'balcony', 'market', 'foodcourt', 'cinemalobby', 'parking', 'roof', 'gallery', 'dock']);
const NOFLOOR = new Set(['void', 'stair', 'elev']);

// ── layout ──────────────────────────────────────────────────────────────────────────────────────────────────────
// r: [x0, z0, x1, z1] in metres. sides n(-z) s(+z) w(-x) e(+x): 'open' | 'front' | 'rail'. doors: {side, at, w, kind, lock, lv}
const R = (id, lv, r, type, o = {}) => ({ id, lv: Array.isArray(lv) ? lv : [lv], r, type, sides: {}, doors: [], ...o });
const OPEN4 = { n: 'open', s: 'open', w: 'open', e: 'open' };
export const ROOMS = [
  // ── Ground floor ──
  R('atrium', 'G', [-16, -14, 16, 14], 'atrium', { name: 'Central Atrium', sides: OPEN4, floor: 'marble' }),
  R('westHall', 'G', [-58, -5, -16, 5], 'hall', { name: 'West Concourse', sides: OPEN4, floor: 'marble', doors: [{ side: 'w', at: 3, w: 4, kind: 'emergency', lock: 'chain', exit: 'alleyW' }] }),
  R('eastHall', 'G', [16, -5, 58, 5], 'hall', { name: 'East Concourse', sides: OPEN4, floor: 'marble' }),
  R('northHall', 'G', [-8, -20, 8, -14], 'hall', { name: 'North Hall', sides: OPEN4, floor: 'marble' }),
  R('southHall', 'G', [-8, 14, 8, 32], 'hall', { name: 'Main Entrance Hall', sides: OPEN4, floor: 'marble', doors: [{ side: 's', at: 4, w: 8, kind: 'entrance', lock: 'exit', exit: 'plaza' }] }),
  R('market', 'G', [-40, -38, 40, -20], 'market', { name: 'FreshWay Supermarket', sign: 'FRESHWAY', sides: { s: 'open' }, floor: 'lino' }),
  R('wn1', 'G', [-58, -17, -48, -5], 'electronics', { name: 'VOLTAGE Electronics', sign: 'VOLTAGE', sides: { s: 'front' }, doors: [{ side: 'n', at: 2, w: 1.2, kind: 'staff' }] }),
  R('wn2', 'G', [-48, -17, -38, -5], 'clothing', { name: 'Linen & Lace', sign: 'LINEN & LACE', sides: { s: 'front' }, doors: [{ side: 'n', at: 2, w: 1.2, kind: 'staff' }] }),
  R('wn3', 'G', [-38, -17, -27, -5], 'shoes', { name: 'Stride Shoes', sign: 'STRIDE', sides: { s: 'front' }, doors: [{ side: 'n', at: 2, w: 1.2, kind: 'staff' }] }),
  R('wn4', 'G', [-27, -17, -16, -5], 'pharmacy', { name: 'CarePlus Pharmacy', sign: 'CAREPLUS', sides: { s: 'front' }, doors: [{ side: 'n', at: 2, w: 1.2, kind: 'staff' }] }),
  R('ws1', 'G', [-58, 5, -46, 17], 'clothing', { name: 'Northwind Apparel', sign: 'NORTHWIND', sides: { n: 'front' }, doors: [{ side: 's', at: 2, w: 1.2, kind: 'staff' }] }),
  R('ws2', 'G', [-46, 5, -34, 17], 'electronics', { name: 'Pixel Planet', sign: 'PIXEL PLANET', sides: { n: 'front' }, doors: [{ side: 's', at: 2, w: 1.2, kind: 'staff' }] }),
  R('ws3', 'G', [-34, 5, -24, 17], 'phones', { name: 'FixIt Mobile', sign: 'FIXIT MOBILE', sides: { n: 'front' }, doors: [{ side: 's', at: 2, w: 1.2, kind: 'staff' }] }),
  R('ws4', 'G', [-24, 5, -16, 17], 'jewelry', { name: 'Lumen Jewelers', sign: 'LUMEN', sides: { n: 'front' }, doors: [{ side: 's', at: 2, w: 1.2, kind: 'staff' }] }),
  R('svcSW', 'G', [-58, 17, -8, 20], 'service', { name: 'South Service Corridor', floor: 'concrete', doors: [{ side: 'e', at: 0.8, w: 1.4, kind: 'staff' }] }),
  R('security', 'G', [-16, 20, -8, 30], 'security', { name: 'Security Office', doors: [{ side: 'e', at: 3, w: 1.2, kind: 'metal', lock: 'key:security' }, { side: 'n', at: 2, w: 1.1, kind: 'staff' }] }),
  R('customer', 'G', [8, 17, 16, 26], 'customer', { name: 'Customer Service', sign: 'CUSTOMER SERVICE', sides: { w: 'front' }, doors: [{ side: 'e', at: 5, w: 1, kind: 'staff' }] }),
  R('svcNW', 'G', [-58, -20, -8, -17], 'service', { name: 'North-West Service Corridor', floor: 'concrete', doors: [{ side: 'e', at: 0.8, w: 1.4, kind: 'staff' }] }),
  R('svcNE', 'G', [8, -20, 58, -17], 'service', { name: 'North-East Service Corridor', floor: 'concrete', doors: [{ side: 'w', at: 0.8, w: 1.4, kind: 'staff' }] }),
  R('wcW', 'G', [-52, -28, -40, -20], 'toilets', { name: 'Restrooms', floor: 'tile', doors: [{ side: 's', at: 5, w: 1.2, kind: 'door' }] }),
  R('storeroom', 'G', [-40, -38, -28, -28], 'storage', { name: 'Supermarket Stockroom', floor: 'concrete', doors: [{ side: 'e', at: 4, w: 1.6, kind: 'double', lock: 'pick' }] }),
  R('en1', 'G', [16, -17, 30, -5], 'restaurant', { name: 'Trattoria Luce', sign: 'TRATTORIA LUCE', sides: { s: 'front' }, floor: 'wood', doors: [{ side: 'n', at: 2, w: 1.2, kind: 'staff' }] }),
  R('en2', 'G', [30, -17, 40, -5], 'cafe', { name: 'Daily Grind Café', sign: 'DAILY GRIND', sides: { s: 'front' }, floor: 'wood', doors: [{ side: 'n', at: 2, w: 1.2, kind: 'staff' }] }),
  R('en3', 'G', [40, -17, 50, -5], 'sports', { name: 'Peak Sports', sign: 'PEAK SPORTS', sides: { s: 'front' }, doors: [{ side: 'n', at: 2, w: 1.2, kind: 'staff' }] }),
  R('wcE', 'G', [50, -17, 58, -5], 'toilets', { name: 'Restrooms', floor: 'tile', doors: [{ side: 's', at: 3, w: 1.2, kind: 'door' }] }),
  R('foodcourt', 'G', [16, 5, 46, 26], 'foodcourt', { name: 'Food Court', sides: { n: 'open' }, floor: 'tile' }),
  R('fc1', 'G', [16, 26, 26, 32], 'fastfood', { name: 'Wok This Way', sign: 'WOK THIS WAY', sides: { n: 'front' }, floor: 'tile' }),
  R('fc2', 'G', [26, 26, 36, 32], 'fastfood', { name: 'Burger Barn', sign: 'BURGER BARN', sides: { n: 'front' }, floor: 'tile', doors: [{ side: 'w', at: 2, w: 1, kind: 'staff' }] }),
  R('fc3', 'G', [36, 26, 46, 32], 'fastfood', { name: 'Taco Loco', sign: 'TACO LOCO', sides: { n: 'front' }, floor: 'tile', doors: [{ side: 'e', at: 2, w: 1, kind: 'staff' }, { side: 'w', at: 2, w: 1, kind: 'staff' }] }),

  R('svcE', 'G', [46, 5, 50, 32], 'service', { name: 'East Service Corridor', floor: 'concrete', doors: [{ side: 'n', at: 0.8, w: 1.4, kind: 'staff' }, { side: 'w', at: 6, w: 1.2, kind: 'staff' }] }),
  R('kitchen', 'G', [50, 5, 58, 24], 'kitchen', { name: 'Shared Kitchen', floor: 'tile', doors: [{ side: 'w', at: 4, w: 1.4, kind: 'double' }] }),
  R('plaza', 'G', [-12, 32, 12, 40], 'outside', { name: 'Entrance Plaza', floor: 'asphalt' }),
  R('alleyW', 'G', [-60, -5, -58, 5], 'outside', { name: 'West Alley', floor: 'asphalt' }),
  // ── stairwells & elevator (multi-level) ──
  R('stairW', ['B', 'G', 'U'], [-58, -28, -52, -20], 'stair', { name: 'West Stairwell', entry: 's', floor: 'concrete', doors: [{ side: 's', at: 0.5, w: 1.6, kind: 'stair', lv: 'B' }, { side: 's', at: 0.5, w: 1.6, kind: 'stair', lv: 'G' }, { side: 's', at: 0.5, w: 1.6, kind: 'stair', lv: 'U' }] }),
  R('stairE', ['B', 'G', 'U', 'R'], [50, 24, 58, 32], 'stair', { name: 'East Stairwell', entry: 'w', floor: 'concrete', doors: [{ side: 'w', at: 0.5, w: 1.6, kind: 'stair', lv: 'B' }, { side: 'w', at: 0.5, w: 1.6, kind: 'stair', lv: 'G' }, { side: 'w', at: 0.5, w: 1.6, kind: 'stair', lv: 'U' }, { side: 'w', at: 0.5, w: 1.6, kind: 'metal', lv: 'R', lock: 'key:roof' }] }),
  R('elev', ['B', 'G', 'U'], [-2, -14, 2, -11], 'elev', { name: 'Elevator', doors: [{ side: 's', at: 1, w: 2, kind: 'elev', lv: 'B' }, { side: 's', at: 1, w: 2, kind: 'elev', lv: 'G' }, { side: 's', at: 1, w: 2, kind: 'elev', lv: 'U' }] }),
  // ── Upper floor ──
  R('balcony', 'U', [-16, -14, 16, 14], 'balcony', { name: 'Atrium Balcony', sides: OPEN4, floor: 'marble' }),
  R('void', 'U', [-11, -9, 11, 9], 'void', { name: 'Atrium' }),
  R('escVoid', 'U', [-10, 10, 2, 13], 'void', { name: 'Escalators', sides: { e: 'open' } }),
  R('westHallU', 'U', [-58, -5, -16, 5], 'hall', { name: 'Upper West Concourse', sides: OPEN4, floor: 'marble' }),
  R('eastHallU', 'U', [16, -5, 58, 5], 'hall', { name: 'Upper East Concourse', sides: OPEN4, floor: 'marble' }),
  R('cinemaLobby', 'U', [-8, -28, 8, -14], 'cinemalobby', { name: 'Starlight Cinemas Lobby', sign: 'STARLIGHT CINEMAS', sides: OPEN4, floor: 'carpet' }),
  R('cinema1', 'U', [-30, -38, -8, -20], 'cinema', { name: 'Screen 1', floor: 'carpet', doors: [{ side: 'e', at: 13, w: 2, kind: 'double' }] }),
  R('cinema2', 'U', [8, -38, 30, -20], 'cinema', { name: 'Screen 2', floor: 'carpet', doors: [{ side: 'w', at: 13, w: 2, kind: 'double' }] }),
  R('projection', 'U', [-8, -38, 8, -28], 'projection', { name: 'Projection Booth', floor: 'concrete', doors: [{ side: 's', at: 7, w: 1.2, kind: 'metal', lock: 'key:projection' }] }),
  R('un1', 'U', [-58, -17, -44, -5], 'toys', { name: 'Wonderbox Toys', sign: 'WONDERBOX', sides: { s: 'front' }, floor: 'carpet', doors: [{ side: 'n', at: 2, w: 1.2, kind: 'staff' }] }),
  R('un2', 'U', [-44, -17, -30, -5], 'books', { name: 'Dog-Eared Books', sign: 'DOG-EARED BOOKS', sides: { s: 'front' }, floor: 'wood', doors: [{ side: 'n', at: 2, w: 1.2, kind: 'staff' }] }),
  R('un3', 'U', [-30, -17, -16, -5], 'arcade', { name: 'Neon Galaxy Arcade', sign: 'NEON GALAXY', sides: { s: 'front' }, floor: 'carpet', doors: [{ side: 'n', at: 2, w: 1.2, kind: 'staff' }] }),
  R('us1', 'U', [-58, 5, -46, 17], 'clothing', { name: 'Velvet Boutique', sign: 'VELVET', sides: { n: 'front' }, doors: [{ side: 's', at: 2, w: 1.2, kind: 'staff' }] }),
  R('us2', 'U', [-46, 5, -34, 17], 'home', { name: 'Hearth Home', sign: 'HEARTH HOME', sides: { n: 'front' }, floor: 'wood', doors: [{ side: 's', at: 2, w: 1.2, kind: 'staff' }] }),
  R('us3', 'U', [-34, 5, -24, 17], 'music', { name: 'B-Side Records', sign: 'B-SIDE RECORDS', sides: { n: 'front' }, floor: 'wood', doors: [{ side: 's', at: 2, w: 1.2, kind: 'staff' }] }),
  R('us4', 'U', [-24, 5, -16, 17], 'gifts', { name: 'Gifts & Gadgets', sign: 'GIFTS & GADGETS', sides: { n: 'front' }, doors: [{ side: 's', at: 2, w: 1.2, kind: 'staff' }] }),
  R('maintUNW', 'U', [-58, -20, -8, -17], 'maint', { name: 'Upper Maintenance Corridor', floor: 'concrete', doors: [{ side: 'e', at: 0.8, w: 1.4, kind: 'staff' }] }),
  R('maintUNE', 'U', [8, -20, 50, -17], 'maint', { name: 'Upper Maintenance Corridor', floor: 'concrete', doors: [{ side: 'w', at: 0.8, w: 1.4, kind: 'staff' }] }),
  R('maintUSW', 'U', [-58, 17, -8, 20], 'maint', { name: 'Upper Maintenance Corridor', floor: 'concrete', doors: [{ side: 'e', at: 0.8, w: 1.4, kind: 'staff' }] }),
  R('gallery', 'U', [-8, 14, 8, 26], 'gallery', { name: 'Entrance Gallery', sides: OPEN4, floor: 'marble' }),
  R('offices', 'U', [-16, 20, -8, 30], 'office', { name: 'Management Offices', floor: 'carpet', doors: [{ side: 'n', at: 2, w: 1.1, kind: 'door', lock: 'card' }] }),
  R('secControl', 'U', [8, 17, 16, 26], 'secctrl', { name: 'Security Control Room', floor: 'lino', doors: [{ side: 'w', at: 3, w: 1.2, kind: 'metal', lock: 'card' }] }),
  R('medical', 'U', [-8, 26, 8, 32], 'medical', { name: 'First Aid Room', floor: 'lino', doors: [{ side: 'n', at: 7, w: 1.4, kind: 'door', lock: 'pick' }] }),
  R('ue1', 'U', [16, -17, 30, -5], 'restaurant', { name: 'Sakura House', sign: 'SAKURA HOUSE', sides: { s: 'front' }, floor: 'wood', doors: [{ side: 'n', at: 2, w: 1.2, kind: 'staff' }] }),
  R('ue2', 'U', [30, -17, 44, -5], 'restaurant', { name: 'Grill 88', sign: 'GRILL 88', sides: { s: 'front' }, floor: 'wood', doors: [{ side: 'n', at: 2, w: 1.2, kind: 'staff' }] }),
  R('ue3', 'U', [44, -17, 58, -5], 'furniture', { name: 'Iron & Oak Furniture', sign: 'IRON & OAK', sides: { s: 'front' }, floor: 'wood' }),
  R('ue4', 'U', [16, 5, 30, 17], 'kids', { name: 'Tiny Town Play', sign: 'TINY TOWN', sides: { n: 'front' }, floor: 'carpet', doors: [{ side: 's', at: 2, w: 1.2, kind: 'staff' }] }),
  R('ue5', 'U', [30, 5, 46, 17], 'clothing', { name: 'Meridian Department Store', sign: 'MERIDIAN', sides: { n: 'front' }, doors: [{ side: 's', at: 2, w: 1.2, kind: 'staff' }] }),
  R('maintUSE', 'U', [16, 17, 46, 20], 'maint', { name: 'Upper Maintenance Corridor', floor: 'concrete', doors: [{ side: 'e', at: 0.8, w: 1.4, kind: 'staff' }] }),
  R('maintUE', 'U', [46, 5, 50, 32], 'maint', { name: 'East Maintenance Shaft', floor: 'concrete', doors: [{ side: 'n', at: 0.8, w: 1.4, kind: 'staff' }] }),
  // ── Basement ──
  R('parking', 'B', [-58, -38, 10, 30], 'parking', { name: 'Underground Parking', floor: 'asphalt', doors: [{ side: 'w', at: 5, w: 8, kind: 'gate', lock: 'gate', exit: 'rampOut' }] }),
  R('rampOut', 'B', [-60, -33, -58, -25], 'outside', { name: 'Parking Exit Ramp', floor: 'asphalt' }),
  R('storage', 'B', [10, -38, 30, -20], 'storage', { name: 'Storage', floor: 'concrete', doors: [{ side: 'w', at: 6, w: 2, kind: 'double' }] }),
  R('dock', 'B', [30, -38, 58, -10], 'dock', { name: 'Loading Dock', floor: 'concrete', doors: [{ side: 'w', at: 8, w: 2, kind: 'double' }, { side: 'n', at: 10, w: 6, kind: 'dockdoor', lock: 'dock', exit: 'dockyard' }] }),
  R('dockyard', 'B', [36, -40, 50, -38], 'outside', { name: 'Delivery Yard', floor: 'asphalt' }),
  R('staffB', 'B', [10, -20, 14, 30], 'service', { name: 'Basement Staff Corridor', floor: 'concrete', doors: [{ side: 'w', at: 4, w: 1.4, kind: 'staff' }, { side: 'w', at: 30, w: 1.4, kind: 'staff' }, { side: 'n', at: 1, w: 1.6, kind: 'staff' }] }),
  R('electrical', 'B', [14, -20, 30, -12], 'electrical', { name: 'Electrical Room', floor: 'concrete', doors: [{ side: 'w', at: 3, w: 1.2, kind: 'metal', lock: 'key:electrical' }] }),
  R('generator', 'B', [14, -12, 30, -2], 'generator', { name: 'Generator Room', floor: 'concrete', doors: [{ side: 'w', at: 4, w: 1.4, kind: 'metal', lock: 'pry' }] }),
  R('utility', 'B', [30, -10, 46, 4], 'utility', { name: 'Utility Room', floor: 'concrete', doors: [{ side: 'n', at: 6, w: 1.4, kind: 'metal' }, { side: 's', at: 6, w: 1.2, kind: 'metal' }] }),
  R('tunnel', 'B', [14, 4, 50, 8], 'tunnel', { name: 'Maintenance Tunnel', floor: 'concrete', doors: [{ side: 'w', at: 1, w: 1.4, kind: 'staff' }] }),
  R('tunnel2', 'B', [46, 8, 50, 32], 'tunnel', { name: 'Maintenance Tunnel', floor: 'concrete' }),
  R('lockedMaint', 'B', [14, 8, 46, 30], 'maint', { name: 'Sealed Maintenance Section', floor: 'concrete', doors: [{ side: 'n', at: 14, w: 1.4, kind: 'metal', lock: 'chain' }] }),
  // ── Roof ──
  R('roof', 'R', [30, 0, 58, 32], 'roof', { name: 'Rooftop', floor: 'roof' }),
];
export const roomById = id => ROOMS.find(r => r.id === id);

// ── build ──────────────────────────────────────────────────────────────────────────────────────────────────────
const SIDE_OPP = { n: 's', s: 'n', w: 'e', e: 'w' };
const COND_W = [['intact', 25], ['worn', 35], ['damaged', 25], ['wrecked', 10], ['eerie', 5]];

export function buildPlan(seed = 1, opts = {}) {
  const r = rng(seed ^ 0x51a7);
  const P = { seed, rooms: ROOMS.map(x => ({ ...x, sides: { ...x.sides }, doors: x.doors.map(d => ({ ...d })) })), own: {}, vE: {}, hE: {}, doors: [], shutters: [], walls: [], surfaces: [], colliders: [], ramps: [], links: [], spots: [], hides: [], props: [], exits: {} };
  P.room = id => P.rooms.find(x => x.id === id);
  // room condition: some intact, some wrecked, a few strangely untouched
  for (const rm of P.rooms) { rm.cond = ['stair', 'elev', 'void', 'outside'].includes(rm.type) ? 'worn' : weighted(r, COND_W); if (rm.id === 'security' || rm.id === 'secControl') rm.cond = r.chance(0.5) ? 'damaged' : 'worn'; }
  for (const lv of LV) { P.own[lv] = new Int16Array(GW * GD).fill(-1); P.vE[lv] = new Int32Array((GW + 1) * GD); P.hE[lv] = new Int32Array(GW * (GD + 1)); }
  P.rooms.forEach((rm, i) => { rm.idx = i; for (const lv of rm.lv) { const [x0, z0, x1, z1] = rm.r; for (let x = x0; x < x1; x++) for (let z = z0; z < z1; z++) P.own[lv][(x - X0) * GD + (z - Z0)] = i; } });
  P.ownerAt = (lv, x, z) => { const gx = Math.floor(x - X0), gz = Math.floor(z - Z0); if (gx < 0 || gz < 0 || gx >= GW || gz >= GD) return -1; return P.own[lv][gx * GD + gz]; };
  P.roomAt = (lv, x, z) => { const i = P.ownerAt(lv, x, z); return i >= 0 ? P.rooms[i] : null; };
  // doors
  for (const rm of P.rooms) for (const d of rm.doors) { d.at = Math.round(d.at); d.w = Math.max(1, Math.round(d.w)); }
  for (const rm of P.rooms) for (const d of rm.doors) for (const lv of rm.lv) {
    if (d.lv && d.lv !== lv) continue; const [x0, z0, x1, z1] = rm.r; let seg;
    if (d.side === 'n') seg = [x0 + d.at, z0, x0 + d.at + d.w, z0]; else if (d.side === 's') seg = [x0 + d.at, z1, x0 + d.at + d.w, z1];
    else if (d.side === 'w') seg = [x0, z0 + d.at, x0, z0 + d.at + d.w]; else seg = [x1, z0 + d.at, x1, z0 + d.at + d.w];
    const door = { id: P.doors.length, lv, room: rm.id, side: d.side, seg, axis: d.side === 'n' || d.side === 's' ? 'x' : 'z', kind: d.kind, lock: d.lock || null, locked: !!d.lock, open: false, exit: d.exit || null, broken: false };
    if (d.kind === 'elev') door.locked = false;
    P.doors.push(door); if (d.exit) P.exits[d.exit] = door;
  }
  // edges
  const pub = i => i >= 0 && PUBLIC.has(P.rooms[i].type);
  for (const lv of LV) {
    const own = P.own[lv];
    const sideOf = (i, axis, dir) => axis === 'v' ? (dir > 0 ? 'e' : 'w') : (dir > 0 ? 's' : 'n');
    for (let gx = 0; gx <= GW; gx++) for (let gz = 0; gz < GD; gz++) {
      const a = gx > 0 ? own[(gx - 1) * GD + gz] : -1, b = gx < GW ? own[gx * GD + gz] : -1; P.vE[lv][gx * GD + gz] = edgeCode(P, lv, a, b, 'v', X0 + gx, Z0 + gz + 0.5, pub);
    }
    for (let gx = 0; gx < GW; gx++) for (let gz = 0; gz <= GD; gz++) {
      const a = gz > 0 ? own[gx * GD + gz - 1] : -1, b = gz < GD ? own[gx * GD + gz] : -1; P.hE[lv][gx * (GD + 1) + gz] = edgeCode(P, lv, a, b, 'h', X0 + gx + 0.5, Z0 + gz, pub);
    }
  }
  // shopfront entrances (3 m gap in the middle of the front, with a roll shutter in some state)
  for (const rm of P.rooms) for (const [side, kind] of Object.entries(rm.sides)) { if (kind !== 'front') continue; const lv = rm.lv[0]; const [x0, z0, x1, z1] = rm.r;
    const len = side === 'n' || side === 's' ? x1 - x0 : z1 - z0; const a = Math.floor(len / 2) - 1, w = len >= 10 ? 4 : 3;
    const st = rm.cond === 'eerie' ? 'open' : weighted(r, [['open', 50], ['half', 25], ['closed', 25]]);
    const seg = side === 'n' ? [x0 + a, z0, x0 + a + w, z0] : side === 's' ? [x0 + a, z1, x0 + a + w, z1] : side === 'w' ? [x0, z0 + a, x0, z0 + a + w] : [x1, z0 + a, x1, z0 + a + w];
    const sh = { id: P.shutters.length, lv, room: rm.id, seg, axis: side === 'n' || side === 's' ? 'x' : 'z', state: st }; P.shutters.push(sh);
    forEdges(P, lv, seg, (arr, k) => { arr[k] = E.SHUTTER | (sh.id << 4); });
    // damaged/wrecked shops lose some glass
    if (rm.cond === 'damaged' || rm.cond === 'wrecked') { const p = rm.cond === 'wrecked' ? 0.6 : 0.3; const full = side === 'n' ? [x0, z0, x1, z0] : side === 's' ? [x0, z1, x1, z1] : side === 'w' ? [x0, z0, x0, z1] : [x1, z0, x1, z1]; forEdges(P, lv, full, (arr, k) => { if ((arr[k] & 15) === E.GLASS && r.chance(p)) arr[k] = E.BROKEN; }); }
  }
  for (const d of P.doors) forEdges(P, d.lv, d.seg, (arr, k) => { arr[k] = E.DOOR | (d.id << 4); });
  buildSurfaces(P);
  buildWallList(P);
  P.hashCol = new Map(); P.hashSurf = new Map();
  for (const s of P.surfaces) hashAdd(P.hashSurf, s);
  for (const c of P.colliders) hashAdd(P.hashCol, c);
  P.addCollider = c => { P.colliders.push(c); hashAdd(P.hashCol, c); return c; };
  P.addSurface = s => { P.surfaces.push(s); hashAdd(P.hashSurf, s); return s; };
  Object.assign(P, api(P));
  return P;
}
function weighted(r, list) { const t = list.reduce((a, b) => a + b[1], 0); let x = r() * t; for (const [k, w] of list) { x -= w; if (x <= 0) return k; } return list[0][0]; }
function edgeCode(P, lv, a, b, axis, mx, mz, pub) {
  if (a === b) return E.NONE; const A = a >= 0 ? P.rooms[a] : null, B = b >= 0 ? P.rooms[b] : null;
  const sA = axis === 'v' ? 'e' : 's', sB = axis === 'v' ? 'w' : 'n'; // side of A facing B, and of B facing A
  const tA = A?.sides[sA], tB = B?.sides[sB];
  const voidA = A?.type === 'void', voidB = B?.type === 'void';
  if (A && B) {
    if ((tA === 'open' && (pub(b) || voidB && tB === 'open')) || (tB === 'open' && (pub(a) || voidA && tA === 'open'))) return E.NONE;
    if ((voidA && !voidB && pub(b)) || (voidB && !voidA && pub(a))) return E.RAIL;
    if ((tA === 'front' && pub(b)) || (tB === 'front' && pub(a))) return E.GLASS;
    return E.WALL;
  }
  const R0 = A || B; if (R0 && R0.type === 'roof') return E.RAIL;
  return E.EXT;
}
function forEdges(P, lv, [x0, z0, x1, z1], fn) {
  if (x0 === x1) { const gx = Math.round(x0 - X0); for (let z = Math.min(z0, z1); z < Math.max(z0, z1) - 1e-6; z++) { const gz = Math.floor(z - Z0); if (gz >= 0 && gz < GD) fn(P.vE[lv], gx * GD + gz); } }
  else { const gz = Math.round(z0 - Z0); for (let x = Math.min(x0, x1); x < Math.max(x0, x1) - 1e-6; x++) { const gx = Math.floor(x - X0); if (gx >= 0 && gx < GW) fn(P.hE[lv], gx * (GD + 1) + gz); } }
}

// ── walkable surfaces: floors per level (greedy rectangles), stairs, escalators, elevator car ──
function buildSurfaces(P) {
  for (const lv of LV) {
    const y = LEVELS[lv].y, own = P.own[lv], used = new Uint8Array(GW * GD);
    const ok = (gx, gz) => { const i = own[gx * GD + gz]; return i >= 0 && !NOFLOOR.has(P.rooms[i].type) && !used[gx * GD + gz]; };
    for (let gx = 0; gx < GW; gx++) for (let gz = 0; gz < GD; gz++) {
      if (!ok(gx, gz)) continue; const room = own[gx * GD + gz]; let w = 1, d = 1;
      while (gx + w < GW && ok(gx + w, gz) && own[(gx + w) * GD + gz] === room) w++;
      outer: while (gz + d < GD) { for (let k = 0; k < w; k++) if (!ok(gx + k, gz + d) || own[(gx + k) * GD + gz + d] !== room) break outer; d++; }
      for (let a = 0; a < w; a++) for (let b = 0; b < d; b++) used[(gx + a) * GD + gz + b] = 1;
      P.surfaces.push({ lv, x0: X0 + gx, z0: Z0 + gz, x1: X0 + gx + w, z1: Z0 + gz + d, y, room: P.rooms[room].id, mat: P.rooms[room].floor || defaultFloor(P.rooms[room].type) });
    }
  }
  // stairwells: landing strip at the entry side on each level; two half-flights per storey (switchback)
  for (const rm of P.rooms.filter(x => x.type === 'stair')) {
    const lvs = rm.lv; const [x0, z0, x1, z1] = rm.r; const along = rm.entry === 'n' || rm.entry === 's' ? 'z' : 'x'; // flights run along this axis
    const depth = along === 'z' ? z1 - z0 : x1 - x0, width = along === 'z' ? x1 - x0 : z1 - z0; const sgn = rm.entry === 's' || rm.entry === 'e' ? -1 : 1; // direction away from entry
    const ent = rm.entry === 'n' ? z0 : rm.entry === 's' ? z1 : rm.entry === 'w' ? x0 : x1; const run = depth - 3; // 1 m landing, run, 2 m mid landing
    const rect = (a0, a1, c0, c1) => along === 'z' ? { x0: Math.min(c0, c1), x1: Math.max(c0, c1), z0: Math.min(a0, a1), z1: Math.max(a0, a1) } : { x0: Math.min(a0, a1), x1: Math.max(a0, a1), z0: Math.min(c0, c1), z1: Math.max(c0, c1) };
    const cA = along === 'z' ? x0 : z0, cMid = cA + width / 2, cB = cA + width;
    rm.flights = [];
    for (let i = 0; i < lvs.length; i++) {
      const y = LEVELS[lvs[i]].y; P.surfaces.push({ lv: lvs[i], ...rect(ent, ent + sgn * 1, cA, cB), y, room: rm.id, mat: 'concrete', landing: true });
      if (i + 1 < lvs.length) { const yn = LEVELS[lvs[i + 1]].y, ym = (y + yn) / 2;
        const f1 = { lv: lvs[i], ...rect(ent + sgn * 1, ent + sgn * (1 + run), cA, cMid), ramp: along, ya: y, yb: ym, a0: ent + sgn * 1, a1: ent + sgn * (1 + run), room: rm.id, mat: 'stairs' };
        const mid = { lv: lvs[i], ...rect(ent + sgn * (1 + run), ent + sgn * depth, cA, cB), y: ym, room: rm.id, mat: 'concrete', mid: true };
        const f2 = { lv: lvs[i + 1], ...rect(ent + sgn * (1 + run), ent + sgn * 1, cMid, cB), ramp: along, ya: ym, yb: yn, a0: ent + sgn * (1 + run), a1: ent + sgn * 1, room: rm.id, mat: 'stairs' };
        P.surfaces.push(f1, mid, f2); rm.flights.push({ f1, mid, f2 }); P.ramps.push(f1, f2);
        // nav link: landing(i) → landing(i+1)
        const L = (a, c, yy) => along === 'z' ? { x: c, z: a, y: yy } : { x: a, z: c, y: yy };
        const cq1 = (cA + cMid) / 2, cq2 = (cMid + cB) / 2;
        P.links.push({ a: { lv: lvs[i], ...L(ent + sgn * 0.5, cq1, y) }, b: { lv: lvs[i + 1], ...L(ent + sgn * 0.5, cq2, yn) }, via: [L(ent + sgn * 1.2, cq1, y), L(ent + sgn * (run + 1), cq1, ym), L(ent + sgn * (depth - 1), (cA + cB) / 2, ym), L(ent + sgn * (run + 1), cq2, ym), L(ent + sgn * 1.2, cq2, yn)], kind: 'stairs', room: rm.id });
        // the underside of the upper half-flights is not a collider; side walls are the stairwell walls
      }
    }
  }
  // escalators (stopped — walkable as steep stairs) from the atrium floor up to the balcony
  P.escalators = [];
  for (const [z0, z1] of [[10.1, 11.4], [11.6, 12.9]]) {
    const s = { lv: 'G', x0: -8, x1: 2, z0, z1, ramp: 'x', ya: 0, yb: 6, a0: -8, a1: 2, room: 'atrium', mat: 'escalator' }; P.surfaces.push(s); P.ramps.push(s); P.escalators.push(s);
    for (let i = 0; i < 10; i++) { const hx = (i / 10) * 6; P.colliders.push({ x0: -8 + i, x1: -8 + i + 1, z0: z0 - 0.15, z1: z1 + 0.15, y0: 0, y1: Math.max(0.05, hx - 0.05), tag: 'esc' }); // solid body under the treads
      for (const zz of [z0 - 0.12, z1 + 0.02]) P.colliders.push({ x0: -8 + i, x1: -8 + i + 1, z0: zz, z1: zz + 0.1, y0: hx, y1: hx + 0.6 + 1.05, tag: 'escrail' }); }
    P.links.push({ a: { lv: 'G', x: -8.6, z: (z0 + z1) / 2, y: 0 }, b: { lv: 'U', x: 2.6, z: (z0 + z1) / 2, y: 6 }, via: [{ x: -7.8, z: (z0 + z1) / 2, y: 0 }, { x: 1.8, z: (z0 + z1) / 2, y: 6 }], kind: 'escalator' });
  }
  // elevator car — a moving surface
  const er = P.room('elev').r; P.elevator = { x0: er[0] + 0.15, z0: er[1] + 0.15, x1: er[2] - 0.15, z1: er[3] - 0.25, y: 0, target: 0, level: 'G', powered: false, moving: false };
  P.elevSurf = { lv: '*', x0: P.elevator.x0, z0: P.elevator.z0, x1: P.elevator.x1, z1: P.elevator.z1, y: 0, room: 'elev', mat: 'metal', dynamic: true };
  P.surfaces.push(P.elevSurf);
}
const defaultFloor = t => ({ parking: 'asphalt', service: 'concrete', maint: 'concrete', storage: 'concrete', tunnel: 'concrete', generator: 'concrete', electrical: 'concrete', utility: 'concrete', dock: 'concrete', roof: 'roof', outside: 'asphalt' }[t] || 'tile');

// merged wall runs (for rendering and static colliders)
function buildWallList(P) {
  for (const lv of LV) {
    const y = LEVELS[lv].y, h = lv === 'R' ? 1.1 : LEVELS[lv].h;
    const emit = (code, x0, z0, x1, z1) => {
      const k = code & 15; if (k === E.NONE || k === E.DOOR || k === E.SHUTTER) return;
      let top = y + h, kind = k === E.EXT ? 'ext' : k === E.WALL ? 'wall' : k === E.GLASS ? 'glass' : k === E.BROKEN ? 'broken' : 'rail';
      if (k === E.RAIL) top = y + 1.1; if (lv === 'R' && k === E.EXT) { kind = 'rail'; top = y + 1.1; }
      const w = { lv, x0, z0, x1, z1, y0: y, y1: top, kind }; P.walls.push(w);
      if (kind !== 'broken') { const t = kind === 'glass' || kind === 'rail' ? 0.06 : 0.12; P.colliders.push(x0 === x1 ? { x0: x0 - t, x1: x0 + t, z0, z1, y0: y, y1: top, tag: kind } : { x0, x1, z0: z0 - t, z1: z0 + t, y0: y, y1: top, tag: kind }); }
    };
    for (let gx = 0; gx <= GW; gx++) { let start = 0, cur = P.vE[lv][gx * GD] & 15; for (let gz = 1; gz <= GD; gz++) { const c = gz < GD ? P.vE[lv][gx * GD + gz] & 15 : -1; if (c !== cur) { emit(cur, X0 + gx, Z0 + start, X0 + gx, Z0 + gz); start = gz; cur = c; } } }
    for (let gz = 0; gz <= GD; gz++) { let start = 0, cur = P.hE[lv][gz] & 15; for (let gx = 1; gx <= GW; gx++) { const c = gx < GW ? P.hE[lv][gx * (GD + 1) + gz] & 15 : -1; if (c !== cur) { emit(cur, X0 + start, Z0 + gz, X0 + gx, Z0 + gz); start = gx; cur = c; } } }
  }
}
const HS = 4; const hk = (x, z) => `${Math.floor(x / HS)},${Math.floor(z / HS)}`;
function hashAdd(map, o) { for (let x = Math.floor(o.x0 / HS); x <= Math.floor((o.x1 - 1e-6) / HS); x++) for (let z = Math.floor(o.z0 / HS); z <= Math.floor((o.z1 - 1e-6) / HS); z++) { const k = x + ',' + z; let a = map.get(k); if (!a) map.set(k, a = []); a.push(o); } }

// ── queries ──
function api(P) {
  const surfH = (s, x, z) => s.ramp ? s.ya + (s.yb - s.ya) * Math.max(0, Math.min(1, ((s.ramp === 'x' ? x : z) - s.a0) / (s.a1 - s.a0))) : s.y;
  // Highest walkable surface under (x,z) that is at most `step` above footY.
  function groundAt(x, z, footY, step = 0.55) {
    let best = -Infinity, bs = null; const list = P.hashSurf.get(hk(x, z)) || [];
    for (const s of list) { if (x < s.x0 || x > s.x1 || z < s.z0 || z > s.z1) continue; const h = s.dynamic ? s.y : surfH(s, x, z); if (h <= footY + step && h > best) { best = h; bs = s; } }
    return bs ? { y: best, s: bs } : null;
  }
  // Dynamic blockers: closed doors, shutters (half = only above 1.05 m), elevator doors.
  function dynamicColliders(x, z, r) {
    const out = [];
    for (const d of P.doorsNear(x, z, r + 1.5)) if (!d.open || d.kind === 'elev' && !d.open) { const [a, b, c, e] = d.seg; const y = LEVELS[d.lv].y; out.push(d.axis === 'x' ? { x0: a, x1: c, z0: b - 0.1, z1: b + 0.1, y0: y, y1: y + (d.kind === 'gate' || d.kind === 'dockdoor' ? 4.5 : 2.6), door: d } : { x0: a - 0.1, x1: a + 0.1, z0: b, z1: e, y0: y, y1: y + 2.6, door: d }); }
    for (const s of P.shuttersNear(x, z, r + 1.5)) if (s.state !== 'open') { const [a, b, c, e] = s.seg; const y = LEVELS[s.lv].y; const y0 = y + (s.state === 'half' ? 1.05 : 0); out.push(s.axis === 'x' ? { x0: a, x1: c, z0: b - 0.08, z1: b + 0.08, y0, y1: y + 6, shutter: s } : { x0: a - 0.08, x1: a + 0.08, z0: b, z1: e, y0, y1: y + 6, shutter: s }); }
    return out;
  }
  P.doorsNear = (x, z, r) => P.doors.filter(d => { const [a, b, c, e] = d.seg; return x > Math.min(a, c) - r && x < Math.max(a, c) + r && z > Math.min(b, e) - r && z < Math.max(b, e) + r; });
  P.shuttersNear = (x, z, r) => P.shutters.filter(s => { const [a, b, c, e] = s.seg; return x > Math.min(a, c) - r && x < Math.max(a, c) + r && z > Math.min(b, e) - r && z < Math.max(b, e) + r; });
  // Push a vertical capsule (radius r, from footY to footY+height) out of all colliders. Returns adjusted [x,z].
  function collide(x, z, r, footY, height) {
    const y0 = footY + 0.4, y1 = footY + height;
    for (let it = 0; it < 4; it++) {
      let moved = false; const cand = [...(P.hashCol.get(hk(x, z)) || []), ...(P.hashCol.get(hk(x + r, z)) || []), ...(P.hashCol.get(hk(x - r, z)) || []), ...(P.hashCol.get(hk(x, z + r)) || []), ...(P.hashCol.get(hk(x, z - r)) || []), ...dynamicColliders(x, z, r)];
      const seen = new Set();
      for (const c of cand) { if (seen.has(c)) continue; seen.add(c); if (c.y1 <= y0 || c.y0 >= y1) continue; if (c.off) continue;
        const nx = Math.max(c.x0, Math.min(x, c.x1)), nz = Math.max(c.z0, Math.min(z, c.z1)); const dx = x - nx, dz = z - nz, d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-9) { const d = Math.sqrt(d2), p = r - d; x += dx / d * p; z += dz / d * p; }
        else { const pen = [x - c.x0 + r, c.x1 - x + r, z - c.z0 + r, c.z1 - z + r], m = Math.min(...pen); if (m === pen[0]) x = c.x0 - r; else if (m === pen[1]) x = c.x1 + r; else if (m === pen[2]) z = c.z0 - r; else z = c.z1 + r; }
        moved = true; }
      if (!moved) break;
    }
    return [x, z];
  }
  // Edge state helpers (doors/shutters are dynamic).
  function edgeBlocks(code, forSight, crawl) {
    const k = code & 15, id = code >> 4;
    if (k === E.NONE || k === E.BROKEN) return false; if (k === E.GLASS || k === E.RAIL) return !forSight;
    if (k === E.DOOR) { const d = P.doors[id]; return !d.open; }
    if (k === E.SHUTTER) { const s = P.shutters[id]; return s.state === 'closed' || (s.state === 'half' && !forSight && !crawl); }
    return true;
  }
  // Line of sight on one level (grid DDA over wall edges). Cross-level sight only through the atrium void.
  function los(lvA, ax, az, lvB, bx, bz) {
    if (lvA !== lvB) { const inVoid = (x, z) => x > -11.5 && x < 11.5 && z > -9.5 && z < 9.5; const pair = (lvA === 'G' && lvB === 'U') || (lvA === 'U' && lvB === 'G');
      if (!pair) return false; const up = lvA === 'U' ? [ax, az] : [bx, bz], dn = lvA === 'U' ? [bx, bz] : [ax, az];
      return (inVoid(dn[0], dn[1]) || inVoid(up[0], up[1])) && Math.hypot(ax - bx, az - bz) < 26 && (inVoid(up[0], up[1]) || nearVoid(up[0], up[1])); }
    let x = ax - X0, z = az - Z0; const tx = bx - X0, tz = bz - Z0; let gx = Math.floor(x), gz = Math.floor(z); const ex = Math.floor(tx), ez = Math.floor(tz);
    const dx = tx - x, dz = tz - z; const sx = Math.sign(dx), sz = Math.sign(dz);
    const tdx = sx ? Math.abs(1 / dx) : Infinity, tdz = sz ? Math.abs(1 / dz) : Infinity;
    let tmx = sx > 0 ? (gx + 1 - x) * tdx : sx < 0 ? (x - gx) * tdx : Infinity, tmz = sz > 0 ? (gz + 1 - z) * tdz : sz < 0 ? (z - gz) * tdz : Infinity;
    for (let n = 0; n < 400 && (gx !== ex || gz !== ez); n++) {
      if (tmx < tmz) { const lineX = sx > 0 ? gx + 1 : gx; if (lineX < 0 || lineX > GW || gz < 0 || gz >= GD) return false; if (edgeBlocks(P.vE[lvA][lineX * GD + gz], true)) return false; gx += sx; tmx += tdx; }
      else { const lineZ = sz > 0 ? gz + 1 : gz; if (gx < 0 || gx >= GW || lineZ < 0 || lineZ > GD) return false; if (edgeBlocks(P.hE[lvA][gx * (GD + 1) + lineZ], true)) return false; gz += sz; tmz += tdz; }
    }
    return true;
  }
  const nearVoid = (x, z) => x > -14 && x < 14 && z > -12 && z < 12;
  // ── navigation ──
  const NODES = LV.length * GW * GD; const nid = (lvi, gx, gz) => lvi * GW * GD + gx * GD + gz;
  P.navOk = new Uint8Array(NODES);
  function finalizeNav() {
    for (const lv of LV) { const li = LEVELS[lv].i;
      for (let gx = 0; gx < GW; gx++) for (let gz = 0; gz < GD; gz++) { const i = P.own[lv][gx * GD + gz]; if (i < 0) continue; const rm = P.rooms[i];
        let ok = !NOFLOOR.has(rm.type) && rm.type !== 'outside'; const cx = X0 + gx + 0.5, cz = Z0 + gz + 0.5, y = LEVELS[lv].y;
        if (rm.type === 'stair') ok = P.surfaces.some(s => s.landing && s.lv === lv && s.room === rm.id && cx > s.x0 && cx < s.x1 && cz > s.z0 && cz < s.z1);
        if (ok) for (const c of P.hashCol.get(hk(cx, cz)) || []) { if (c.y0 > y + 1.2 || c.y1 < y + 0.3) continue; if (cx + 0.3 > c.x0 && cx - 0.3 < c.x1 && cz + 0.3 > c.z0 && cz - 0.3 < c.z1) { ok = false; break; } }
        P.navOk[nid(li, gx, gz)] = ok ? 1 : 0; } }
    P.linkMap = new Map(); for (const L of P.links) for (const [p, q, rev] of [[L.a, L.b, false], [L.b, L.a, true]]) { const k = cellId(p); if (!P.linkMap.has(k)) P.linkMap.set(k, []); P.linkMap.get(k).push({ to: cellId(q), link: L, rev }); }
  }
  const cellId = p => nid(LEVELS[p.lv].i, Math.floor(p.x - X0), Math.floor(p.z - Z0));
  const canMove = (lv, gx, gz, dx, dz, crawl) => {
    if (dx && dz) return canMove(lv, gx, gz, dx, 0, crawl) && canMove(lv, gx + dx, gz, 0, dz, crawl) && canMove(lv, gx, gz, 0, dz, crawl) && canMove(lv, gx, gz + dz, dx, 0, crawl);
    if (dx) { const line = dx > 0 ? gx + 1 : gx; return !edgeBlocks(P.vE[lv][line * GD + gz], false, crawl); } const line = dz > 0 ? gz + 1 : gz; return !edgeBlocks(P.hE[lv][gx * (GD + 1) + line], false, crawl);
  };
  // A* from (lv,x,z) to (lv2,x2,z2). Returns [{lv,x,y,z}] waypoints or null. crawl: can pass half shutters.
  function findPath(lv, x, z, lv2, x2, z2, crawl = true, maxNodes = 30000) {
    const ns = nearestNav(lv, x, z), ne = nearestNav(lv2, x2, z2); if (ns < 0 || ne < 0) return null;
    const lvOf = n => LV[Math.floor(n / (GW * GD))], gxOf = n => Math.floor((n % (GW * GD)) / GD), gzOf = n => n % GD;
    const H = n => Math.hypot(gxOf(n) - gxOf(ne), gzOf(n) - gzOf(ne)) + Math.abs(LEVELS[lvOf(n)].y - LEVELS[lvOf(ne)].y) * 2;
    const G_ = P._g ||= new Float32Array(NODES), PR = P._pr ||= new Int32Array(NODES), ST = P._st ||= new Uint32Array(NODES), VIA = P._via ||= new Array(NODES), CL = P._cl ||= new Uint32Array(NODES);
    const stamp = P._stamp = (P._stamp || 0) + 1; const gget = m => ST[m] === stamp ? G_[m] : Infinity;
    ST[ns] = stamp; G_[ns] = 0; PR[ns] = -1; VIA[ns] = null; const open = new MinHeap(); open.push(ns, H(ns)); let n = 0, found = ns === ne;
    while (open.size && n++ < maxNodes) {
      const c = open.pop(); if (c === ne) { found = true; break; } if (CL[c] === stamp) continue; CL[c] = stamp;
      const lvc = lvOf(c), gx = gxOf(c), gz = gzOf(c), li = LEVELS[lvc].i, gc = G_[c];
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) { if (!dx && !dz) continue; const X = gx + dx, Z = gz + dz; if (X < 0 || Z < 0 || X >= GW || Z >= GD) continue; const m = nid(li, X, Z); if (!P.navOk[m] || CL[m] === stamp) continue; if (!canMove(lvc, gx, gz, dx, dz, crawl)) continue;
        const ng = gc + (dx && dz ? 1.414 : 1); if (ng < gget(m)) { ST[m] = stamp; G_[m] = ng; PR[m] = c; VIA[m] = null; open.push(m, ng + H(m)); } }
      for (const L of P.linkMap.get(c) || []) { const ng = gc + 14; if (ng < gget(L.to)) { ST[L.to] = stamp; G_[L.to] = ng; PR[L.to] = c; VIA[L.to] = L; open.push(L.to, ng + H(L.to)); } }
    }
    if (!found) return null;
    const cells = []; for (let c = ne, k = 0; c >= 0 && k < 5000; c = PR[c], k++) { cells.push(c); if (c === ns) break; } cells.reverse();
    const out = [];
    for (let i = 0; i < cells.length; i++) { const c = cells[i]; const L = VIA[c]; if (L && i > 0) { const via = L.rev ? [...L.link.via].reverse() : L.link.via; for (const v of via) out.push({ lv: v.lv || lvOf(c), x: v.x, y: v.y, z: v.z, stair: true }); }
      out.push({ lv: lvOf(c), x: X0 + gxOf(c) + 0.5, y: LEVELS[lvOf(c)].y, z: Z0 + gzOf(c) + 0.5 }); }
    // fix stair waypoint levels (y decides) and smooth straight runs
    return smoothPath(out);
  }
  function smoothPath(pts) {
    if (pts.length < 3) return pts; const out = [pts[0]]; let i = 0;
    while (i < pts.length - 1) { let j = Math.min(pts.length - 1, i + 12); while (j > i + 1) { const a = pts[i], b = pts[j]; if (a.lv === b.lv && !a.stair && !b.stair && !pts.slice(i, j).some(p => p.stair) && clearLine(a.lv, a.x, a.z, b.x, b.z)) break; j--; } out.push(pts[j]); i = j; }
    return out;
  }
  function clearLine(lv, ax, az, bx, bz) { const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.5); let pgx = Math.floor(ax - X0), pgz = Math.floor(az - Z0); for (let k = 1; k <= n; k++) { const x = ax + (bx - ax) * k / n, z = az + (bz - az) * k / n; const gx = Math.floor(x - X0), gz = Math.floor(z - Z0); if (!P.navOk[nid(LEVELS[lv].i, gx, gz)]) return false; if (gx !== pgx || gz !== pgz) { if (!canMove(lv, pgx, pgz, Math.sign(gx - pgx), Math.sign(gz - pgz), true)) return false; } pgx = gx; pgz = gz; } return true; }
  function nearestNav(lv, x, z) { const li = LEVELS[lv].i, gx = Math.floor(x - X0), gz = Math.floor(z - Z0); for (let r = 0; r < 4; r++) for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) { if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue; const X = gx + dx, Z = gz + dz; if (X < 0 || Z < 0 || X >= GW || Z >= GD) continue; const m = nid(li, X, Z); if (P.navOk[m]) return m; } return -1; }
  // Reachability flood (treating locked doors as open if `keys` has their lock) → Set of room ids.
  function reachableRooms(startLv, sx, sz, unlocked = () => false) {
    const seen = new Uint8Array(NODES), q = [nearestNav(startLv, sx, sz)], rooms = new Set(); if (q[0] < 0) return rooms; seen[q[0]] = 1;
    const save = P.doors.map(d => d.open); P.doors.forEach(d => { d.open = !d.locked || unlocked(d); if (d.kind === 'elev' || d.exit) d.open = false; });
    const saveSh = P.shutters.map(s => s.state); P.shutters.forEach(s => { if (s.state === 'closed') s.state = 'closed'; });
    while (q.length) { const c = q.pop(); const lv = LV[Math.floor(c / (GW * GD))], gx = Math.floor((c % (GW * GD)) / GD), gz = c % GD; const rm = P.rooms[P.own[lv][gx * GD + gz]]; if (rm) rooms.add(rm.id);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = gx + dx, Z = gz + dz; if (X < 0 || Z < 0 || X >= GW || Z >= GD) continue; const m = nid(LEVELS[lv].i, X, Z); if (seen[m] || !P.navOk[m] || !canMove(lv, gx, gz, dx, dz, true)) continue; seen[m] = 1; q.push(m); }
      for (const L of P.linkMap.get(c) || []) if (!seen[L.to]) { seen[L.to] = 1; q.push(L.to); } }
    P.doors.forEach((d, i) => d.open = save[i]); P.shutters.forEach((s, i) => s.state = saveSh[i]);
    return rooms;
  }
  function randomFloorPoint(rmId, r, margin = 0.8) { const rm = P.room(rmId); const lv = rm.lv[0]; for (let k = 0; k < 60; k++) { const x = r.range(rm.r[0] + margin, rm.r[2] - margin), z = r.range(rm.r[1] + margin, rm.r[3] - margin); const gx = Math.floor(x - X0), gz = Math.floor(z - Z0); if (P.navOk[nid(LEVELS[lv].i, gx, gz)] && P.ownerAt(lv, x, z) === rm.idx) return { lv, x, z, y: LEVELS[lv].y }; } return null; }
  function levelAtY(y) { return y < -2.4 ? 'B' : y < 3.2 ? 'G' : y < 9.2 ? 'U' : 'R'; }
  return { groundAt, collide, los, finalizeNav, findPath, nearestNav, reachableRooms, randomFloorPoint, levelAtY, edgeBlocks, clearLine, surfH, nid };
}
class MinHeap { constructor() { this.k = []; this.p = []; } get size() { return this.k.length; } push(k, p) { const a = this.k, b = this.p; a.push(k); b.push(p); let i = a.length - 1; while (i > 0) { const j = (i - 1) >> 1; if (b[j] <= b[i]) break; [a[i], a[j]] = [a[j], a[i]]; [b[i], b[j]] = [b[j], b[i]]; i = j; } }
  pop() { const a = this.k, b = this.p, top = a[0], lk = a.pop(), lp = b.pop(); if (a.length) { a[0] = lk; b[0] = lp; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && b[l] < b[m]) m = l; if (r < a.length && b[r] < b[m]) m = r; if (m === i) break; [a[i], a[m]] = [a[m], a[i]]; [b[i], b[m]] = [b[m], b[i]]; i = m; } } return top; } }
