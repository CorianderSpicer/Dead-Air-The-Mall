// Item catalogue + weighted loot spawning. Pure logic (no Three.js) — the host generates, everyone receives the same list.
export const ITEMS = {
  // power
  batt_aa: { name: 'Standard Battery', cat: 'battery', icon: 'batt', charge: 25, w: 30, stack: 3, desc: 'AA cell. Restores 25% flashlight power.' },
  batt_pack: { name: 'Large Battery Pack', cat: 'battery', icon: 'batt', charge: 60, w: 9, stack: 2, desc: 'Heavy-duty pack. Restores 60% flashlight power.' },
  batt_cell: { name: 'Emergency Power Cell', cat: 'battery', icon: 'cell', charge: 100, w: 2, stack: 1, desc: 'Military-grade cell. Fully recharges the flashlight.' },
  batt_recharge: { name: 'Rechargeable Battery', cat: 'battery', icon: 'batt', charge: 40, w: 4, stack: 1, reusable: true, desc: 'Restores 40%. Can be topped up at a wall charger once power is restored.' },
  // keys & access
  key_security: { name: 'Security Office Key', cat: 'key', icon: 'key', w: 0, desc: 'Brass key on a lanyard marked "SEC-01".' },
  key_electrical: { name: 'Electrical Room Key', cat: 'key', icon: 'key', w: 0, desc: 'Tagged "B1 ELECTRICAL — AUTHORISED ONLY".' },
  key_roof: { name: 'Rooftop Access Key', cat: 'key', icon: 'key', w: 0, desc: 'Red tag: "ROOF / HELIPAD".' },
  key_projection: { name: 'Projection Booth Key', cat: 'key', icon: 'key', w: 0, desc: 'Starlight Cinemas staff key.' },
  key_vehicle: { name: 'Emergency Vehicle Keys', cat: 'key', icon: 'carkey', w: 0, desc: 'Keys and gate fob for the mall security truck in the parking level.' },
  key_dock: { name: 'Dock Control Key', cat: 'key', icon: 'key', w: 0, desc: 'Turns the loading-dock shutter control.' },
  keycard: { name: 'Security Keycard', cat: 'key', icon: 'card', w: 3, desc: 'Opens doors with card readers.' },
  card_red: { name: 'Keycard (Red)', cat: 'key', icon: 'card', w: 0, color: '#e04040', desc: 'One of three cards the security console needs.' },
  card_blue: { name: 'Keycard (Blue)', cat: 'key', icon: 'card', w: 0, color: '#4080e0', desc: 'One of three cards the security console needs.' },
  card_green: { name: 'Keycard (Green)', cat: 'key', icon: 'card', w: 0, color: '#40c060', desc: 'One of three cards the security console needs.' },
  fuse: { name: 'Fuse', cat: 'part', icon: 'fuse', w: 0, stack: 4, desc: '30A ceramic fuse. The electrical room fuse box takes these.' },
  gen_part: { name: 'Generator Component', cat: 'part', icon: 'gear', w: 0, desc: 'Starter solenoid for the basement generator.' },
  sec_device: { name: 'Security Access Device', cat: 'tool', icon: 'device', w: 1, desc: 'Override tool: opens one card-locked door, or bypasses a keypad.' },
  // medical
  bandage: { name: 'Bandage', cat: 'med', icon: 'band', heal: 25, w: 14, stack: 3, desc: 'Stops bleeding. +25 health.' },
  firstaid: { name: 'First Aid Kit', cat: 'med', icon: 'med', heal: 60, w: 6, stack: 1, desc: '+60 health. Revive a teammate faster, or yourself when you are down alone.' },
  painkillers: { name: 'Painkillers', cat: 'med', icon: 'pill', w: 8, stack: 2, desc: 'Ignore injury for 90 seconds: full speed, steady aim.' },
  medsupply: { name: 'Emergency Medical Supplies', cat: 'med', icon: 'med', heal: 100, w: 2, stack: 1, desc: 'Instant revive for a downed teammate, or a full heal.' },
  // utility
  radio: { name: 'Radio', cat: 'tool', icon: 'radio', w: 5, desc: 'Talk to teammates with pings. Static gets worse when IT is close.' },
  map: { name: 'Mall Map', cat: 'tool', icon: 'map', w: 5, desc: 'Fold-out directory. Shows the floor plan and where you are.' },
  screwdriver: { name: 'Screwdriver', cat: 'tool', icon: 'tool', w: 5, desc: 'Opens panels and covers. Needed for some repairs.' },
  crowbar: { name: 'Crowbar', cat: 'tool', icon: 'bar', w: 4, desc: 'Pries open jammed doors and roll shutters. Loud.' },
  wirecutters: { name: 'Wire Cutters', cat: 'tool', icon: 'cut', w: 3, desc: 'Cuts chains and padlocks.' },
  lockpick: { name: 'Lockpick Set', cat: 'tool', icon: 'pick', w: 4, desc: 'Opens simple locks. Takes a few seconds.' },
  motion: { name: 'Motion Detector', cat: 'tool', icon: 'radar', w: 2, desc: 'Shows movement nearby while held. Drains its own cell.' },
  flare: { name: 'Signal Flare', cat: 'tool', icon: 'flare', w: 2, desc: 'Burns bright red. Marks a landing zone — or distracts something.' },
  // story / objective artifacts
  documents: { name: 'Research Documents', cat: 'quest', icon: 'doc', w: 0, desc: 'Water-stained pages titled "PROJECT TENANT — acoustic resonance trials".' },
  container: { name: 'Classified Container', cat: 'quest', icon: 'box', w: 0, heavy: true, desc: 'Steel case, government seals. Heavy — you cannot sprint while carrying it.' },
  bodycam: { name: "Guard's Bodycam", cat: 'quest', icon: 'cam', w: 0, desc: 'Recovered from the missing guard. The last file is 47 minutes of static.' },
  code_note: { name: 'Access Code Note', cat: 'quest', icon: 'doc', w: 0, desc: 'A sticky note with a 4-digit code.' },
};
export const SLOT_CAP = 6;
// where loot tends to appear (room types)
const PREF = { battery: ['electronics', 'phones', 'security', 'service', 'maint', 'storage', 'market', 'kiosk', 'customer', 'office', 'secctrl', 'toys', 'gifts', 'sports'], med: ['pharmacy', 'medical', 'toilets', 'security', 'office', 'kitchen', 'customer'], tool: ['service', 'maint', 'storage', 'utility', 'generator', 'electrical', 'dock', 'tunnel', 'security', 'sports', 'home'] };

// Weighted, synchronised loot placement. spots: [{x,y,z,lv,room,tags}]. reach: Set of room ids accessible from the start.
export function spawnLoot(r, spots, P, opts, reserved = new Set()) {
  const { difficulty = 'normal', players = 1, modifiers = [] } = opts;
  const scarce = difficulty === 'nightmare' ? 0.5 : difficulty === 'hard' ? 0.72 : 1; const solo = players === 1 ? 1.2 : 1;
  const battMul = (modifiers.includes('limited_batteries') ? 0.55 : 1) * scarce * solo;
  const total = Math.round((38 + players * 6) * scarce * solo);
  const pool = Object.entries(ITEMS).filter(([, d]) => d.w > 0).map(([id, d]) => ({ id, d, w: d.w * (d.cat === 'battery' ? battMul : d.cat === 'med' ? scarce * solo : 1) }));
  const free = spots.filter(s => !reserved.has(s)); const out = [];
  for (let i = 0; i < total && free.length; i++) {
    const it = r.weighted(pool); const pref = PREF[it.d.cat];
    let cand = pref ? free.filter(s => pref.includes(P.room(s.room)?.type)) : free; if (!cand.length || r() < 0.35) cand = free;
    const s = r.pick(cand); free.splice(free.indexOf(s), 1); out.push({ item: it.id, spot: s });
  }
  // guarantee a sane minimum of batteries anywhere reachable
  const minB = Math.max(3, Math.round(6 * battMul)); let nb = out.filter(o => ITEMS[o.item].cat === 'battery').length;
  while (nb < minB && free.length) { const s = r.pick(free); free.splice(free.indexOf(s), 1); out.push({ item: 'batt_aa', spot: s }); nb++; }
  return out;
}
