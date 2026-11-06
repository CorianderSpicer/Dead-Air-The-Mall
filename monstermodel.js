// The Tenant: an original creature. 2.7 m, emaciated, too many joints, skin like wet grey latex, an elongated eyeless skull
// whose jaw unhinges, and a rusted public-address horn grown through its throat that leaks static ("dead air").
// Rags of a mall night-staff vest still hang on it. Fully procedural geometry + procedural animation.
import * as THREE from './three.module.js';

function skinTex() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#8f8a86'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) { const v = 90 + Math.random() * 80; g.fillStyle = `rgba(${v},${v - 8},${v - 10},.25)`; g.beginPath(); g.arc(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 6, 0, 7); g.fill(); }
  g.strokeStyle = 'rgba(70,30,40,.35)'; g.lineWidth = 1.2; for (let i = 0; i < 40; i++) { g.beginPath(); let x = Math.random() * 256, y = Math.random() * 256; g.moveTo(x, y); for (let k = 0; k < 8; k++) { x += (Math.random() - .5) * 26; y += (Math.random() - .5) * 26; g.lineTo(x, y); } g.stroke(); }
  for (let i = 0; i < 18; i++) { const x = Math.random() * 256, y = Math.random() * 256, r = 6 + Math.random() * 20; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(60,20,25,.5)'); gr.addColorStop(1, 'rgba(60,20,25,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}
// organic limb: tapered capsule with bumpy vertices
function limbGeo(len, r0, r1, seg = 8, lump = 0.12) {
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 6, false); g.translate(0, -len / 2, 0); const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const n = 1 + lump * Math.sin(y * 9 + x * 13) * Math.cos(z * 11 + y * 5); p.setXYZ(i, x * n, y, z * n); }
  g.computeVertexNormals(); return g;
}
export function buildMonster(quality = 'medium') {
  const skin = new THREE.MeshStandardMaterial({ map: skinTex(), color: 0x6c625c, roughness: 0.58, metalness: 0.0, bumpScale: 0.03 }); skin.bumpMap = skin.map;
  const dark = new THREE.MeshStandardMaterial({ color: 0x0a0606, roughness: 0.9 }); const teethM = new THREE.MeshStandardMaterial({ color: 0xd8ccb0, roughness: 0.4 });
  const rust = new THREE.MeshStandardMaterial({ color: 0x6a3a22, roughness: 0.75, metalness: 0.6 }); const cloth = new THREE.MeshStandardMaterial({ color: 0x101114, roughness: 1, side: THREE.DoubleSide });
  const glint = new THREE.MeshBasicMaterial({ color: 0xffeedd }); const throat = new THREE.MeshBasicMaterial({ color: 0x1a0202 });
  const seg = quality === 'low' ? 6 : 9;
  const J = (parent, x, y, z) => { const o = new THREE.Group(); o.position.set(x, y, z); parent.add(o); return o; };
  const M = (parent, geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
  const root = new THREE.Group(); const body = J(root, 0, 0, 0);
  const hips = J(body, 0, 1.32, 0); M(hips, new THREE.SphereGeometry(0.2, seg, 6).scale(1.15, 0.7, 0.8), skin); for (const s of [-1, 1]) M(hips, new THREE.SphereGeometry(0.06, 6, 5), skin, s * 0.17, 0.08, -0.02);
  const spine1 = J(hips, 0, 0.05, 0); M(spine1, limbGeo(0.45, 0.13, 0.16, seg, 0.18).rotateX(Math.PI), skin, 0, 0, 0);
  const spine2 = J(spine1, 0, 0.45, 0); M(spine2, limbGeo(0.42, 0.16, 0.22, seg, 0.15).rotateX(Math.PI), skin);
  // ribcage: visible ribs
  for (let i = 0; i < 6; i++) { const rib = new THREE.TorusGeometry(0.205 - i * 0.012, 0.012, 4, 10, Math.PI * 1.2); const m = M(spine2, rib, skin, 0, 0.1 + i * 0.055, 0.02); m.rotation.set(Math.PI / 2, 0, Math.PI * 0.4); }
  for (const [seg2, n] of [[spine1, 4], [spine2, 4]]) for (let i = 0; i < n; i++) M(seg2, new THREE.ConeGeometry(0.025, 0.07, 4).rotateX(-Math.PI / 2.4), skin, 0, 0.06 + i * 0.1, -0.15);
  const torso = new THREE.LatheGeometry([[0.12, -0.5], [0.15, -0.38], [0.11, -0.2], [0.1, 0.0], [0.16, 0.18], [0.21, 0.32], [0.2, 0.42]].map(([x, y]) => new THREE.Vector2(x, y)), seg + 3); { const p = torso.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); p.setXYZ(i, x * 1.15, y, z * (z < 0 ? 0.75 : 0.95) + Math.sin(y * 40) * 0.008); } torso.computeVertexNormals(); }
  M(spine2, torso, skin, 0, 0.05, 0.0);
  const chest = J(spine2, 0, 0.42, 0); M(chest, new THREE.SphereGeometry(0.25, seg, 7).scale(1.25, 0.75, 0.85), skin);
  // the horn: a rusted PA speaker grown into the throat
  const horn = M(chest, new THREE.CylinderGeometry(0.16, 0.04, 0.34, 10, 1, true), rust, 0, 0.08, 0.2); horn.rotation.x = Math.PI / 2 + 0.3; M(horn, new THREE.CircleGeometry(0.15, 10).rotateX(-Math.PI / 2), throat, 0, 0.17, 0);
  const cable = M(chest, new THREE.TorusGeometry(0.22, 0.012, 4, 12, Math.PI), dark, 0.12, -0.15, 0.18); cable.rotation.z = 1.2;
  // vest rags
  for (const [x, rz, w, h] of [[-0.2, 0.12, 0.09, 0.55], [0.21, -0.18, 0.07, 0.62], [-0.06, 0.04, 0.05, 0.4], [0.1, -0.05, 0.04, 0.48]]) { const g = new THREE.PlaneGeometry(w, h, 2, 6); const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const yy = p.getY(i); p.setX(i, p.getX(i) * (1 - (0.5 - yy / h) * 0.6) + Math.sin(yy * 30 + x * 40) * 0.012); p.setZ(i, Math.sin(yy * 9) * 0.02); if (yy < -h * 0.4) p.setY(i, yy + Math.sin(i * 7.1) * 0.06); }
    g.translate(0, -h / 2, 0); const rag = M(chest, g, cloth, x, 0.05, 0.2); rag.rotation.z = rz; rag.rotation.x = -0.25; }
  const tag = M(chest, new THREE.BoxGeometry(0.07, 0.03, 0.005), new THREE.MeshBasicMaterial({ color: 0xc8b070 }), 0.14, 0.02, 0.27);
  // long neck in three segments
  const neck1 = J(chest, 0, 0.16, 0.05); M(neck1, limbGeo(0.22, 0.06, 0.08, seg, 0.2).rotateX(Math.PI), skin);
  const neck2 = J(neck1, 0, 0.22, 0); M(neck2, limbGeo(0.2, 0.05, 0.065, seg, 0.2).rotateX(Math.PI), skin);
  const neck3 = J(neck2, 0, 0.2, 0); M(neck3, limbGeo(0.16, 0.05, 0.055, seg, 0.2).rotateX(Math.PI), skin);
  const head = J(neck3, 0, 0.17, 0.02);
  const skull = new THREE.LatheGeometry([[0, -0.02], [0.08, 0], [0.12, 0.08], [0.15, 0.22], [0.14, 0.36], [0.09, 0.47], [0, 0.5]].map(([x, y]) => new THREE.Vector2(x, y)), seg + 2);
  skull.scale(1, 1, 1.25); M(head, skull, skin, 0, 0.0, 0.05).rotation.x = -0.35;
  for (const s of [-1, 1]) { M(head, new THREE.SphereGeometry(0.035, 8, 6).scale(1, 1.4, 0.6), dark, s * 0.055, 0.2, 0.17); M(head, new THREE.SphereGeometry(0.006, 4, 4), glint, s * 0.05, 0.215, 0.19); }
  const jaw = J(head, 0, 0.08, 0.1); M(jaw, new THREE.BoxGeometry(0.13, 0.05, 0.2), skin, 0, -0.03, 0.06); const mouth = M(head, new THREE.BoxGeometry(0.11, 0.09, 0.02), throat, 0, 0.05, 0.16);
  for (let i = 0; i < 9; i++) { const tooth = new THREE.ConeGeometry(0.008, 0.05 + (i % 3) * 0.015, 4); M(jaw, tooth, teethM, -0.05 + i * 0.0125, 0.01, 0.15).rotation.x = 0; M(head, tooth.clone().rotateX(Math.PI), teethM, -0.05 + i * 0.0125, 0.065, 0.165); }
  // arms: shoulder, upper, fore, hand with four long fingers
  const arms = [];
  for (const s of [-1, 1]) { const sh = J(chest, s * 0.27, 0.06, 0); M(sh, new THREE.SphereGeometry(0.07, 6, 5), skin);
    const L1 = s < 0 ? 0.62 : 0.7, L2 = s < 0 ? 0.66 : 0.74; const up = J(sh, 0, 0, 0); M(up, limbGeo(L1, 0.065, 0.045, seg, 0.2), skin); const fore = J(up, 0, -L1, 0); M(fore, new THREE.SphereGeometry(0.05, 6, 5), skin); M(fore, limbGeo(L2, 0.05, 0.03, seg, 0.25), skin);
    const hand = J(fore, 0, -L2, 0); M(hand, new THREE.BoxGeometry(0.09, 0.1, 0.04), skin, 0, -0.05, 0); const fingers = [];
    for (let f = 0; f < 4; f++) { const f1 = J(hand, -0.035 + f * 0.023, -0.1, 0); M(f1, limbGeo(0.15, 0.012, 0.008, 5, 0.1), skin); const f2 = J(f1, 0, -0.15, 0); M(f2, limbGeo(0.13, 0.008, 0.002, 5, 0.05), skin); fingers.push([f1, f2]); }
    arms.push({ sh, up, fore, hand, fingers, s }); }
  // digitigrade legs
  const legs = [];
  for (const s of [-1, 1]) { const th = J(hips, s * 0.15, -0.05, 0); M(th, limbGeo(0.62, 0.1, 0.065, seg, 0.18), skin); const sh = J(th, 0, -0.62, 0); M(sh, new THREE.SphereGeometry(0.06, 6, 5), skin); M(sh, limbGeo(0.55, 0.055, 0.035, seg, 0.15), skin);
    const ft = J(sh, 0, -0.55, 0); M(ft, limbGeo(0.24, 0.035, 0.02, 6, 0.1).rotateX(-Math.PI / 2), skin, 0, 0, 0); legs.push({ th, sh, ft, s }); }
  const model = { root, body, hips, spine1, spine2, chest, neck1, neck2, neck3, head, jaw, arms, legs, horn, mats: { skin, throat }, t: 0, twitch: 0, twitchT: 0 };
  root.traverse(o => { if (o.isMesh) o.frustumCulled = true; });
  return model;
}
// Procedural animation. state: walk|run|crawl|listen|search|stalk|attack|flinch|scare. speed m/s.
export function animateMonster(m, anim, dt, speed, opts = {}) {
  m.t += dt * (0.6 + speed * 0.55); const t = m.t; const cyc = Math.sin(t * 3.2), cyc2 = Math.cos(t * 3.2);
  m.twitchT -= dt; if (m.twitchT <= 0) { m.twitchT = 0.6 + Math.random() * 2.2; m.twitch = (Math.random() - 0.5) * 1.4; }
  const S = (o, x, y, z, k = 12) => { o.rotation.x += (x - o.rotation.x) * Math.min(1, dt * k); o.rotation.y += (y - o.rotation.y) * Math.min(1, dt * k); o.rotation.z += (z - o.rotation.z) * Math.min(1, dt * k); };
  let lean = 0.62, neckF = 0.5, headTilt = m.twitch * 0.35, jawO = 0.05 + Math.max(0, Math.sin(t * 7)) * 0.04, hipsY = 1.32, armSwing = cyc * 0.25, legSwing = cyc * 0.45, reach = 0.35;
  if (anim === 'run') { lean = 0.75; legSwing = cyc * 0.75; armSwing = cyc * 0.6; neckF = 0.55; }
  if (anim === 'stalk') { lean = 0.85; hipsY = 1.0; legSwing = cyc * 0.35; neckF = 0.2; armSwing = cyc * 0.15; reach = 0.5; }
  if (anim === 'crawl') { lean = 1.35; hipsY = 0.92; legSwing = Math.sin(t * 5) * 0.8; armSwing = -Math.sin(t * 5) * 0.9; neckF = -0.75; reach = 1.25; jawO = 0.25 + Math.sin(t * 9) * 0.1; }
  if (anim === 'listen') { lean = 0.35; legSwing = 0; armSwing = 0; neckF = 0.5; headTilt = Math.sign(Math.sin(t * 0.9)) * 0.9 + m.twitch * 0.2; jawO = Math.max(0, Math.sin(t * 22)) * 0.12; }
  if (anim === 'search') { lean = 0.6; neckF = 0.9 + Math.sin(t * 1.3) * 0.2; headTilt = Math.sin(t * 0.8) * 1.0; }
  if (anim === 'attack' || anim === 'scare') { lean = -0.15; hipsY = 1.45; neckF = 0.9; headTilt = (Math.random() - .5) * 0.25; jawO = 0.95; armSwing = 0; reach = -1.7; legSwing = 0; }
  if (anim === 'flinch') { lean = 0.1; neckF = -0.5; headTilt = 0.8; jawO = 0.5; armSwing = 0; reach = -2.4; }
  const moving = speed > 0.05;
  if (!moving && !['attack', 'scare', 'flinch'].includes(anim)) { legSwing = 0; armSwing = Math.sin(t * 0.8) * 0.05; }
  m.hips.position.y += (hipsY + (moving ? Math.abs(cyc2) * 0.05 : 0) - m.hips.position.y) * Math.min(1, dt * 8);
  S(m.spine1, lean * 0.5, 0, (moving ? cyc * 0.05 : 0)); S(m.spine2, lean * 0.4, cyc * 0.06, 0); S(m.chest, lean * 0.2, 0, 0);
  S(m.neck1, neckF * 0.4, 0, 0, 9); S(m.neck2, neckF * 0.35, headTilt * 0.3, 0, 9); S(m.neck3, neckF * 0.25, headTilt * 0.4, headTilt * 0.4, anim === 'listen' ? 30 : 9); S(m.head, -lean * 0.4 - neckF * 0.2 + (anim === 'crawl' ? -0.6 : 0), headTilt * 0.3, headTilt * 0.5, anim === 'listen' ? 30 : 10);
  m.jaw.rotation.x += (jawO - m.jaw.rotation.x) * Math.min(1, dt * 14);
  for (const a of m.arms) { const sw = armSwing * a.s * (anim === 'crawl' ? 1 : -1); S(a.up, -reach - sw, 0, a.s * (anim === 'attack' || anim === 'scare' ? 1.0 : 0.12), 10); S(a.fore, -0.35 - Math.max(0, sw) * 0.6 - (anim === 'flinch' ? 1.6 : 0), 0, 0, 10);
    for (const [f1, f2] of a.fingers) { const curl = anim === 'attack' || anim === 'scare' ? -0.1 : 0.4 + Math.sin(t * 2 + a.s) * 0.15; S(f1, curl, 0, 0); S(f2, curl * 1.2, 0, 0); } }
  for (const l of m.legs) { const sw = legSwing * l.s; S(l.th, -sw + (anim === 'crawl' ? -0.9 : anim === 'stalk' ? -0.6 : -0.15), 0, l.s * 0.06, 10); S(l.sh, 0.55 + Math.max(0, -sw) * 0.8 + (anim === 'crawl' ? 0.9 : anim === 'stalk' ? 0.7 : 0), 0, 0, 10); S(l.ft, -0.55 - (anim === 'crawl' ? 0.4 : 0), 0, 0, 10); }
  if (m.mats.throat) m.mats.throat.color.setRGB(0.06 + (anim === 'crawl' || anim === 'attack' || anim === 'scare' ? 0.25 + Math.random() * 0.2 : Math.random() * 0.03), 0.008, 0.008);
}
