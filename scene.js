// Small runtime meshes: pickup items, teammate officers, objective props (fuse box, consoles, keypad, the missing
// guard...), flares, the false-alarm cart, and a black phantom silhouette.
import * as THREE from './three.module.js';
import { ITEMS } from './items.js';

const mats = {}; const M = (hex, o = {}) => { const k = hex + JSON.stringify(o); return mats[k] || (mats[k] = new THREE.MeshStandardMaterial({ color: hex, roughness: o.r ?? 0.6, metalness: o.m ?? 0.1, emissive: o.e ?? 0x000000, emissiveIntensity: o.ei ?? 1 })); };
const box = (w, h, d, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return m; };
const cyl = (r0, r1, h, mat, x = 0, y = 0, z = 0, seg = 10) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), mat); m.position.set(x, y, z); return m; };
let glintTex = null;
function glintTexture() { if (glintTex) return glintTex; const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,250,230,1)'); gr.addColorStop(0.15, 'rgba(255,240,200,.6)'); gr.addColorStop(1, 'rgba(255,240,200,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); g.strokeStyle = 'rgba(255,250,230,.8)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(32, 4); g.lineTo(32, 60); g.moveTo(4, 32); g.lineTo(60, 32); g.stroke(); glintTex = new THREE.CanvasTexture(c); return glintTex; }
const crossTex = (() => { let t = null; return () => { if (t) return t; const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#eee'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#c22'; g.fillRect(24, 10, 16, 44); g.fillRect(10, 24, 44, 16); t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }; })();

export function itemMesh(id) {
  const d = ITEMS[id] || {}; const g = new THREE.Group(); const c = d.cat;
  if (id === 'batt_aa') { for (let i = 0; i < 2; i++) { const b = cyl(0.014, 0.014, 0.05, M(0x2a8a3a, { m: 0.4, r: 0.4 }), i * 0.03, 0.007, 0); b.rotation.z = Math.PI / 2; g.add(b); } }
  else if (id === 'batt_pack') g.add(box(0.12, 0.07, 0.07, M(0x222222), 0, 0.035, 0), box(0.04, 0.02, 0.02, M(0xc0a020, { m: 0.8 }), 0.03, 0.075, 0));
  else if (id === 'batt_cell') g.add(box(0.1, 0.14, 0.06, M(0x404850, { m: 0.6 }), 0, 0.07, 0), box(0.08, 0.02, 0.062, M(0x30ff90, { e: 0x30ff90, ei: 1.4 }), 0, 0.1, 0));
  else if (id === 'batt_recharge') { const b = cyl(0.016, 0.016, 0.06, M(0x2060c0, { m: 0.4 }), 0, 0.016, 0); b.rotation.z = Math.PI / 2; g.add(b); }
  else if (c === 'key' && id.startsWith('card') || id === 'keycard') g.add(box(0.085, 0.004, 0.055, M(new THREE.Color(d.color || '#e8e8e8').getHex(), { r: 0.3 }), 0, 0.003, 0), box(0.02, 0.005, 0.015, M(0xc0a020, { m: 0.9 }), -0.02, 0.006, 0));
  else if (c === 'key') { g.add(cyl(0.018, 0.018, 0.004, M(0xb89a40, { m: 0.9, r: 0.3 }), 0, 0.003, 0), box(0.06, 0.004, 0.012, M(0xb89a40, { m: 0.9, r: 0.3 }), 0.04, 0.003, 0), box(0.05, 0.003, 0.03, M(id === 'key_roof' ? 0xc02020 : id === 'key_vehicle' ? 0x202020 : 0xe0d8c0), -0.045, 0.003, 0)); }
  else if (id === 'fuse') { const f = cyl(0.012, 0.012, 0.06, M(0xe8e4d8, { r: 0.3 }), 0, 0.012, 0); f.rotation.z = Math.PI / 2; g.add(f, box(0.012, 0.026, 0.026, M(0xb0b0b0, { m: 0.9 }), 0.034, 0.013, 0), box(0.012, 0.026, 0.026, M(0xb0b0b0, { m: 0.9 }), -0.034, 0.013, 0)); }
  else if (id === 'gen_part') g.add(cyl(0.04, 0.04, 0.12, M(0x8a8a90, { m: 0.8, r: 0.35 }), 0, 0.06, 0), cyl(0.05, 0.05, 0.02, M(0xa06030, { m: 0.7 }), 0, 0.12, 0));
  else if (id === 'sec_device') g.add(box(0.07, 0.025, 0.13, M(0x202428), 0, 0.012, 0), box(0.05, 0.004, 0.03, M(0x40c0ff, { e: 0x40c0ff, ei: 1 }), 0, 0.026, 0.02));
  else if (id === 'bandage') g.add(cyl(0.035, 0.035, 0.05, M(0xf0ece0, { r: 0.9 }), 0, 0.025, 0));
  else if (id === 'firstaid' || id === 'medsupply') { const s = id === 'medsupply' ? 1.4 : 1; const b = box(0.2 * s, 0.09 * s, 0.14 * s, new THREE.MeshStandardMaterial({ map: crossTex(), roughness: 0.6 }), 0, 0.045 * s, 0); g.add(b); }
  else if (id === 'painkillers') g.add(cyl(0.02, 0.02, 0.06, M(0xd08020, { r: 0.3 }), 0, 0.03, 0), cyl(0.021, 0.021, 0.015, M(0xf0f0f0), 0, 0.065, 0));
  else if (id === 'radio') g.add(box(0.06, 0.16, 0.035, M(0x1a1a1a), 0, 0.08, 0), cyl(0.006, 0.006, 0.09, M(0x111111), 0.018, 0.2, 0), box(0.04, 0.03, 0.002, M(0x406040, { e: 0x203020 }), 0, 0.12, 0.019));
  else if (id === 'map') { const m = box(0.22, 0.01, 0.3, M(0xd8d0b0, { r: 0.9 }), 0, 0.005, 0); g.add(m, box(0.2, 0.012, 0.03, M(0x2050a0), 0, 0.006, -0.12)); }
  else if (id === 'screwdriver') { const a = cyl(0.012, 0.016, 0.09, M(0xd02020), 0, 0.012, 0); a.rotation.z = Math.PI / 2; const b = cyl(0.004, 0.004, 0.1, M(0xb0b0b0, { m: 0.9 }), 0.09, 0.012, 0); b.rotation.z = Math.PI / 2; g.add(a, b); }
  else if (id === 'crowbar') { const a = cyl(0.012, 0.012, 0.7, M(0x902020, { m: 0.6 }), 0, 0.012, 0); a.rotation.z = Math.PI / 2; g.add(a, box(0.02, 0.012, 0.08, M(0x902020, { m: 0.6 }), 0.34, 0.012, 0.03)); }
  else if (id === 'wirecutters') g.add(box(0.2, 0.02, 0.03, M(0xd0a020), 0, 0.01, -0.02), box(0.2, 0.02, 0.03, M(0xd0a020), 0, 0.01, 0.02), box(0.06, 0.02, 0.05, M(0x777777, { m: 0.9 }), 0.12, 0.01, 0));
  else if (id === 'lockpick') g.add(box(0.12, 0.015, 0.07, M(0x3a2a20, { r: 0.8 }), 0, 0.008, 0));
  else if (id === 'motion') g.add(box(0.09, 0.03, 0.15, M(0x30383a), 0, 0.015, 0), box(0.07, 0.003, 0.07, M(0x20ff60, { e: 0x109030 }), 0, 0.031, -0.02));
  else if (id === 'flare') { const f = cyl(0.02, 0.02, 0.24, M(0xd02010, { r: 0.4 }), 0, 0.02, 0); f.rotation.z = Math.PI / 2; g.add(f); }
  else if (id === 'documents') g.add(box(0.24, 0.03, 0.31, M(0xd8b060, { r: 0.9 }), 0, 0.015, 0), box(0.08, 0.002, 0.04, M(0xa02020), 0.05, 0.031, -0.1));
  else if (id === 'container') g.add(box(0.5, 0.32, 0.36, M(0x4a5048, { m: 0.6, r: 0.4 }), 0, 0.16, 0), box(0.52, 0.04, 0.05, M(0xc8b040, { m: 0.8 }), 0, 0.2, 0), box(0.1, 0.05, 0.02, M(0xc02020), 0, 0.22, 0.19));
  else if (id === 'bodycam') g.add(box(0.06, 0.09, 0.03, M(0x111111), 0, 0.045, 0), cyl(0.012, 0.012, 0.01, M(0x203040, { m: 0.9 }), 0, 0.06, 0.02));
  else if (id === 'code_note') g.add(box(0.075, 0.002, 0.075, M(0xf0e040, { r: 0.9 }), 0, 0.001, 0));
  else g.add(box(0.1, 0.06, 0.1, M(0x888888), 0, 0.03, 0));
  g.rotation.y = Math.random() * Math.PI * 2;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glintTexture(), color: c === 'quest' || c === 'key' || c === 'part' ? 0xffd890 : 0xfff6e0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6, fog: true }));
  s.scale.setScalar(0.22); s.position.y = 0.08; g.add(s); g.userData.glint = s; g.userData.phase = Math.random() * 7;
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

function labelSprite(text, color = '#e8f0ff') { const c = document.createElement('canvas'); c.width = 256; c.height = 48; const g = c.getContext('2d'); g.font = '600 26px Oswald, sans-serif'; g.textAlign = 'center'; g.fillStyle = 'rgba(0,0,0,.55)'; const w = g.measureText(text).width + 20; g.beginPath(); g.roundRect?.(128 - w / 2, 6, w, 36, 10); g.fill(); g.fillStyle = color; g.fillText(text, 128, 34);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false, fog: false })); s.scale.set(1.1, 0.21, 1); s.renderOrder = 10; return s; }
export const SLOT_COLORS = ['#ffd24a', '#4ad8ff', '#ff6a8a', '#8aff6a'];
export function officerMesh(name, slot, hq) {
  const g = new THREE.Group(); const uni = M(0x1c2333, { r: 0.85 }), dark = M(0x0c0e12, { r: 0.7 }), skin = M(0x9a7a64, { r: 0.7 }), vis = M(new THREE.Color(SLOT_COLORS[slot % 4]).getHex(), { r: 0.5, e: new THREE.Color(SLOT_COLORS[slot % 4]).multiplyScalar(0.15).getHex() });
  const body = new THREE.Group(); g.add(body);
  const legs = [-1, 1].map(s => { const L = new THREE.Group(); L.position.set(s * 0.11, 0.9, 0); L.add(box(0.15, 0.88, 0.17, uni, 0, -0.44, 0), box(0.16, 0.1, 0.26, dark, 0, -0.86, 0.04)); body.add(L); return L; });
  const torso = new THREE.Group(); torso.position.y = 0.9; body.add(torso);
  torso.add(box(0.44, 0.6, 0.26, uni, 0, 0.3, 0), box(0.46, 0.34, 0.29, dark, 0, 0.34, 0) /* vest */, box(0.47, 0.05, 0.3, vis, 0, 0.42, 0), box(0.06, 0.08, 0.03, M(0x111111), 0.12, 0.42, 0.16) /* bodycam */, box(0.42, 0.06, 0.28, dark, 0, 0.02, 0) /* belt */);
  const head = new THREE.Group(); head.position.y = 0.66; torso.add(head); head.add(new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), skin)); const cap = cyl(0.125, 0.12, 0.08, dark, 0, 0.08, 0); head.add(cap, box(0.2, 0.015, 0.1, dark, 0, 0.05, 0.11));
  const arms = [-1, 1].map(s => { const A = new THREE.Group(); A.position.set(s * 0.27, 0.56, 0); A.add(box(0.12, 0.6, 0.13, uni, 0, -0.3, 0)); torso.add(A); return A; });
  // flashlight in the right hand + a fake beam cone
  const torch = cyl(0.025, 0.03, 0.2, M(0x222222, { m: 0.6 }), 0, -0.62, 0.05); arms[1].add(torch);
  const beamGeo = new THREE.ConeGeometry(1.4, 7, 16, 1, true); beamGeo.translate(0, -3.5, 0);
  const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xfff0d0, transparent: true, opacity: 0.05, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: true }));
  beam.rotation.x = Math.PI; beam.position.set(0, -0.6, 0.18); beam.rotation.set(0, 0, 0); arms[1].add(beam); beam.position.set(0, -0.6, 0.15); beam.lookAt;
  let spot = null; if (hq) { spot = new THREE.SpotLight(0xfff0dc, 60, 22, 0.5, 0.5, 1.6); spot.position.set(0.27, 1.45, 0.2); g.add(spot); spot.target.position.set(0.27, 1.2, 6); g.add(spot.target); }
  const label = labelSprite(name, SLOT_COLORS[slot % 4]); label.position.y = 2.1; g.add(label);
  g.traverse(o => { if (o.isMesh && o !== beam) o.castShadow = true; });
  return { root: g, body, torso, head, legs, arms, beam, spot, label, phase: 0 };
}
export function animateOfficer(o, p, dt) {
  const sp = Math.hypot(p.vx || 0, p.vz || 0); o.phase += dt * sp * 3.2; const sw = Math.sin(o.phase) * Math.min(0.6, sp * 0.18);
  const down = p.st === 'down' || p.st === 'dead';
  o.body.rotation.x += ((down ? -Math.PI / 2 : 0) - o.body.rotation.x) * Math.min(1, dt * 6); o.body.position.y = down ? 0.15 : (p.cr ? -0.35 : 0); o.body.position.z = down ? -0.9 : 0;
  o.legs[0].rotation.x = sw; o.legs[1].rotation.x = -sw; o.arms[0].rotation.x = -sw * 0.7; o.arms[1].rotation.x = -1.35 - (p.pitch || 0) * 0.8; o.head.rotation.x = -(p.pitch || 0) * 0.6; o.torso.rotation.x = p.cr ? 0.35 : 0;
  const on = p.fl && !down && (p.flk ?? 1) > 0.2; o.beam.visible = on; o.beam.material.opacity = 0.05 * (p.flk ?? 1); if (o.spot) o.spot.intensity = on ? 60 * (p.flk ?? 1) : 0;
}
// objective props at interactable spots
export function interMesh(type) {
  const g = new THREE.Group(); const metal = M(0x6a7078, { m: 0.6, r: 0.5 }), dark = M(0x15181c), led = M(0xff3020, { e: 0xff2010, ei: 1.5 });
  const L = (x, y, z) => { const l = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 4), led.clone()); l.position.set(x, y, z); g.add(l); g.userData.led = l; };
  let foot = [0.6, 0.4];
  switch (type) {
    case 'fusebox': g.add(box(0.7, 1.4, 0.3, M(0x8a9098, { m: 0.5 }), 0, 0.9, 0), box(0.6, 1.2, 0.02, dark, 0, 0.9, 0.16)); for (let i = 0; i < 6; i++) g.add(box(0.08, 0.05, 0.03, M(0xe8e4d8), -0.2 + (i % 3) * 0.2, 1.2 - Math.floor(i / 3) * 0.3, 0.17)); L(0.25, 1.5, 0.17); foot = [0.7, 0.3]; break;
    case 'generator': g.add(box(0.6, 1.1, 0.5, M(0x8a7a30, { m: 0.4 }), 0, 0.55, 0), box(0.4, 0.3, 0.02, dark, 0, 0.85, 0.26), box(0.08, 0.08, 0.04, M(0xc02020), 0.15, 0.6, 0.26)); L(-0.15, 0.95, 0.27); foot = [0.6, 0.5]; break;
    case 'seconsole': case 'relay': g.add(box(1.4, 0.75, 0.7, M(0x4a4e54, { m: 0.3 }), 0, 0.375, 0)); for (let i = 0; i < (type === 'relay' ? 1 : 3); i++) { const s = box(0.42, 0.3, 0.05, dark, -0.45 + i * 0.45, 1.0, -0.15); s.rotation.x = -0.15; g.add(s); } if (type === 'relay') g.add(box(0.5, 0.35, 0.35, M(0x2a3a2a), 0.35, 0.93, 0), cyl(0.008, 0.008, 0.8, dark, 0.5, 1.5, 0)); L(0.5, 0.78, 0.36); foot = [1.4, 0.7]; break;
    case 'keypad': case 'dockctl': case 'gatectl': g.add(box(0.12, 1.1, 0.12, M(0x555a60, { m: 0.5 }), 0, 0.55, 0), box(0.28, 0.36, 0.12, M(type === 'keypad' ? 0x30343a : 0xc8a020, { m: 0.4 }), 0, 1.25, 0)); for (let i = 0; i < 9; i++) g.add(box(0.05, 0.04, 0.02, M(0xc8c8c8), -0.07 + (i % 3) * 0.07, 1.33 - Math.floor(i / 3) * 0.06, 0.07)); L(0, 1.4, 0.07); foot = [0.3, 0.3]; break;
    case 'elevpanel': g.add(box(0.5, 0.8, 0.12, M(0x8a8e94, { m: 0.6 }), 0, 1.2, 0), box(0.4, 0.6, 0.02, dark, 0, 1.2, 0.07)); L(0.15, 1.5, 0.08); foot = [0.5, 0.15]; break;
    case 'flarepad': { const ring = new THREE.Mesh(new THREE.RingGeometry(3.2, 3.6, 40), M(0xd8d8c8, { r: 0.9 })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; g.add(ring); const h1 = box(0.4, 0.01, 2.4, M(0xd8d8c8, { r: 0.9 }), -0.7, 0.02, 0), h2 = box(0.4, 0.01, 2.4, M(0xd8d8c8, { r: 0.9 }), 0.7, 0.02, 0), h3 = box(1.0, 0.01, 0.4, M(0xd8d8c8, { r: 0.9 }), 0, 0.02, 0); g.add(h1, h2, h3); foot = null; break; }
    case 'guard': { const o = officerMesh('', 3, false); o.label.visible = false; o.beam.visible = false; o.root.traverse(m => { if (m.isMesh && m.material.color) { m.material = m.material.clone(); m.material.color.multiplyScalar(0.7); } }); o.body.rotation.x = -Math.PI / 2; o.body.position.set(0, 0.15, -0.9); o.head.rotation.z = 0.8; o.arms[1].rotation.x = -2.6; g.add(o.root);
      const stain = new THREE.Mesh(new THREE.CircleGeometry(0.9, 16), new THREE.MeshBasicMaterial({ color: 0x1a0505, transparent: true, opacity: 0.85, depthWrite: false })); stain.rotation.x = -Math.PI / 2; stain.position.set(0.1, 0.012, -0.5); stain.scale.set(1, 1.4, 1); g.add(stain); foot = null; break; }
    default: g.add(box(0.5, 1, 0.5, metal, 0, 0.5, 0)); }
  g.userData.foot = foot; g.traverse(o => { if (o.isMesh) o.castShadow = true; }); return g;
}
export function flareMesh() { const g = new THREE.Group(); const f = cyl(0.02, 0.02, 0.24, M(0xd02010), 0, 0.02, 0); f.rotation.z = Math.PI / 2; g.add(f); const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glintTexture(), color: 0xff3020, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); glow.scale.setScalar(1.6); glow.position.set(0.12, 0.06, 0); g.add(glow); const L = new THREE.PointLight(0xff3018, 40, 16, 1.6); L.position.set(0.12, 0.3, 0); g.add(L); g.userData = { glow, L }; return g; }
export function cartMesh() { const g = new THREE.Group(); const m = M(0x8a9098, { m: 0.8, r: 0.4 }); g.add(box(0.55, 0.04, 0.9, m, 0, 0.45, 0)); for (const [x, z] of [[-0.25, -0.4], [0.25, -0.4], [-0.25, 0.4], [0.25, 0.4]]) g.add(cyl(0.05, 0.05, 0.03, M(0x111111), x, 0.05, z)); for (const s of [-1, 1]) g.add(box(0.02, 0.45, 0.9, m, s * 0.27, 0.68, 0)); g.add(box(0.55, 0.45, 0.02, m, 0, 0.68, 0.45), box(0.55, 0.45, 0.02, m, 0, 0.68, -0.45), box(0.6, 0.03, 0.03, M(0xc02020), 0, 1.05, 0.5)); return g; }
export function phantomFrom(buildMonster) { const m = buildMonster('low'); const black = new THREE.MeshBasicMaterial({ color: 0x000000, fog: true }); m.root.traverse(o => { if (o.isMesh) { o.material = black; o.castShadow = false; } }); return m; }
