// Procedural canvas textures and the shared material set. Textures are mostly greyscale so vertex colours can tint them.
import * as THREE from './three.module.js';
import { rng } from './util.js';

const cache = {};
function canvas(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h); return c; }
function tex(c, rep = 1, srgb = true) { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.anisotropy = 4; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; }
function noise(g, w, h, n, a, r, col = 0) { for (let i = 0; i < n; i++) { const v = col + Math.floor(r() * a); g.fillStyle = `rgba(${v},${v},${v},${0.04 + r() * 0.1})`; const s = 1 + r() * 3; g.fillRect(r() * w, r() * h, s, s); } }
function grime(g, w, h, r, k = 6, a = 0.18) { for (let i = 0; i < k; i++) { const x = r() * w, y = r() * h, rad = 20 + r() * 90; const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, `rgba(40,32,24,${a * r()})`); gr.addColorStop(1, 'rgba(40,32,24,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); } }

const MAKERS = {
  plain: () => canvas(64, 64, (g, w, h) => { g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, w, h); noise(g, w, h, 300, 60, rng(1), 180); }),
  plaster: () => canvas(256, 256, (g, w, h) => { const r = rng(2); g.fillStyle = '#dcdcd8'; g.fillRect(0, 0, w, h); noise(g, w, h, 4000, 80, r, 170); grime(g, w, h, r, 5, 0.25); g.fillStyle = 'rgba(60,50,40,.25)'; g.fillRect(0, h - 18, w, 18); for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(70,60,50,.08)'; g.fillRect(r() * w, 0, 2 + r() * 6, h); } }),
  marble: () => canvas(512, 512, (g, w, h) => { const r = rng(3); for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 4; tx++) { const b = 205 + r() * 25; g.fillStyle = `rgb(${b},${b},${b - 4})`; g.fillRect(tx * 128, ty * 128, 128, 128); g.strokeStyle = 'rgba(90,90,95,.25)'; g.lineWidth = 1.2; for (let v = 0; v < 3; v++) { g.beginPath(); let x = tx * 128 + r() * 128, y = ty * 128; g.moveTo(x, y); for (let s = 0; s < 8; s++) { x += (r() - .5) * 30; y += 16; g.lineTo(x, y); } g.stroke(); } }
    g.strokeStyle = 'rgba(40,40,40,.55)'; g.lineWidth = 2; for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 128, 0); g.lineTo(i * 128, h); g.stroke(); g.beginPath(); g.moveTo(0, i * 128); g.lineTo(w, i * 128); g.stroke(); } grime(g, w, h, r, 10, 0.3); }),
  tile: () => canvas(256, 256, (g, w, h) => { const r = rng(4); g.fillStyle = '#e8e8e4'; g.fillRect(0, 0, w, h); for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const b = 215 + r() * 30; g.fillStyle = `rgb(${b},${b},${b - 6})`; g.fillRect(x * 32 + 1, y * 32 + 1, 30, 30); } g.fillStyle = 'rgba(80,70,60,.5)'; for (let i = 0; i <= 8; i++) { g.fillRect(i * 32 - 1, 0, 2, h); g.fillRect(0, i * 32 - 1, w, 2); } grime(g, w, h, r, 8, 0.3); }),
  carpet: () => canvas(256, 256, (g, w, h) => { const r = rng(5); g.fillStyle = '#bdbdbd'; g.fillRect(0, 0, w, h); for (let i = 0; i < 9000; i++) { const v = 140 + r() * 90; g.fillStyle = `rgba(${v},${v},${v},.5)`; g.fillRect(r() * w, r() * h, 1.5, 1.5); } g.strokeStyle = 'rgba(60,60,60,.25)'; g.lineWidth = 3; for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(r() * w, r() * h, 10 + r() * 30, 0, 7); g.stroke(); } grime(g, w, h, r, 6, 0.35); }),
  wood: () => canvas(256, 256, (g, w, h) => { const r = rng(6); for (let i = 0; i < 8; i++) { const b = 150 + r() * 60; g.fillStyle = `rgb(${b},${b * 0.86},${b * 0.7})`; g.fillRect(0, i * 32, w, 32); g.strokeStyle = 'rgba(60,40,20,.3)'; for (let k = 0; k < 6; k++) { g.beginPath(); g.moveTo(0, i * 32 + r() * 32); g.bezierCurveTo(w * .3, i * 32 + r() * 32, w * .6, i * 32 + r() * 32, w, i * 32 + r() * 32); g.stroke(); } g.fillStyle = 'rgba(30,20,10,.6)'; g.fillRect(0, i * 32, w, 1.5); g.fillRect(r() * w, i * 32, 1.5, 32); } grime(g, w, h, r, 4, 0.2); }),
  lino: () => canvas(256, 256, (g, w, h) => { const r = rng(7); g.fillStyle = '#cfcfc8'; g.fillRect(0, 0, w, h); noise(g, w, h, 5000, 120, r, 90); g.strokeStyle = 'rgba(70,70,70,.35)'; for (let i = 0; i <= 2; i++) { g.strokeRect(0, 0, i * 128, i * 128); } grime(g, w, h, r, 7, 0.3); }),
  concrete: () => canvas(256, 256, (g, w, h) => { const r = rng(8); g.fillStyle = '#9a9a96'; g.fillRect(0, 0, w, h); noise(g, w, h, 7000, 90, r, 80); grime(g, w, h, r, 12, 0.35); g.strokeStyle = 'rgba(40,40,40,.4)'; g.beginPath(); g.moveTo(0, h * .5); g.lineTo(w * .3, h * .52); g.lineTo(w * .45, h * .6); g.stroke(); }),
  asphalt: () => canvas(256, 256, (g, w, h) => { const r = rng(9); g.fillStyle = '#4a4a4a'; g.fillRect(0, 0, w, h); noise(g, w, h, 9000, 90, r, 40); grime(g, w, h, r, 10, 0.4); }),
  roof: () => canvas(256, 256, (g, w, h) => { const r = rng(10); g.fillStyle = '#6f6f6a'; g.fillRect(0, 0, w, h); for (let i = 0; i < 6000; i++) { const v = 70 + r() * 100; g.fillStyle = `rgb(${v},${v},${v - 5})`; g.fillRect(r() * w, r() * h, 2, 2); } grime(g, w, h, r, 10, 0.4); }),
  ceiling: () => canvas(256, 256, (g, w, h) => { const r = rng(11); g.fillStyle = '#d0d0cc'; g.fillRect(0, 0, w, h); for (let i = 0; i < 3000; i++) { g.fillStyle = 'rgba(90,90,90,.25)'; g.fillRect(r() * w, r() * h, 1.2, 1.2); } g.fillStyle = '#8a8a86'; for (let i = 0; i <= 4; i++) { g.fillRect(i * 64 - 2, 0, 4, h); g.fillRect(0, i * 64 - 2, w, 4); } grime(g, w, h, r, 8, 0.35); }),
  metal: () => canvas(128, 128, (g, w, h) => { const r = rng(12); g.fillStyle = '#b8bcc0'; g.fillRect(0, 0, w, h); for (let i = 0; i < 400; i++) { const v = 150 + r() * 80; g.fillStyle = `rgba(${v},${v},${v},.35)`; g.fillRect(0, r() * h, w, 1); } grime(g, w, h, r, 4, 0.25); }),
  fabric: () => canvas(128, 128, (g, w, h) => { const r = rng(13); g.fillStyle = '#c8c8c8'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 2) { g.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.06})`; g.fillRect(0, y, w, 1); } for (let x = 0; x < w; x += 3) { g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(x, 0, 1, h); } }),
  corrugated: () => canvas(128, 128, (g, w, h) => { const r = rng(14); for (let y = 0; y < h; y += 8) { const gr = g.createLinearGradient(0, y, 0, y + 8); gr.addColorStop(0, '#9aa0a6'); gr.addColorStop(.5, '#d0d4d8'); gr.addColorStop(1, '#7a8086'); g.fillStyle = gr; g.fillRect(0, y, w, 8); } grime(g, w, h, r, 6, 0.4); noise(g, w, h, 600, 60, r, 60); }),
  boxes: () => canvas(256, 256, (g, w, h) => { const r = rng(15); g.fillStyle = '#222'; g.fillRect(0, 0, w, h); for (let y = 0; y < 4; y++) for (let x = 0; x < 8; x++) { const hue = Math.floor(r() * 360); g.fillStyle = `hsl(${hue},${40 + r() * 40}%,${40 + r() * 25}%)`; g.fillRect(x * 32 + 2, y * 64 + 6 + r() * 10, 28, 56 - r() * 14); g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(x * 32 + 6, y * 64 + 24, 18, 4); } }),
  books: () => canvas(256, 128, (g, w, h) => { const r = rng(16); g.fillStyle = '#2a1e14'; g.fillRect(0, 0, w, h); let x = 0; while (x < w) { const bw = 5 + r() * 9; const hue = Math.floor(r() * 360); g.fillStyle = `hsl(${hue},${30 + r() * 40}%,${25 + r() * 30}%)`; g.fillRect(x, 10 + r() * 20, bw - 1, h - 12); g.fillStyle = 'rgba(255,230,180,.4)'; g.fillRect(x + 1, 40 + r() * 30, bw - 3, 2); x += bw; } }),
  clothes: () => canvas(256, 128, (g, w, h) => { const r = rng(17); g.fillStyle = '#111'; g.fillRect(0, 0, w, h); let x = 0; while (x < w) { const bw = 6 + r() * 6; g.fillStyle = `hsl(${Math.floor(r() * 360)},${20 + r() * 50}%,${25 + r() * 45}%)`; g.fillRect(x, 4, bw - 1, h - 10 - r() * 40); x += bw; } }),
  screen: () => canvas(128, 96, (g, w, h) => { const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#1a3550'); gr.addColorStop(1, '#0a1520'); g.fillStyle = gr; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 3) { g.fillStyle = 'rgba(255,255,255,.04)'; g.fillRect(0, y, w, 1); } g.fillStyle = 'rgba(160,220,255,.5)'; g.fillRect(10, 10, 50, 6); g.fillRect(10, 22, 80, 4); g.fillRect(10, 30, 64, 4); }),
  water: () => canvas(128, 128, (g, w, h) => { const r = rng(18); g.fillStyle = '#20262c'; g.fillRect(0, 0, w, h); for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(160,190,220,${0.05 + r() * 0.12})`; g.beginPath(); g.ellipse(r() * w, r() * h, 6 + r() * 20, 2 + r() * 6, 0, 0, 7); g.stroke(); } }),
};
export function getTex(name, rep = 1) { const k = name + rep; if (!cache[k]) cache[k] = tex((cache['c_' + name] ||= MAKERS[name]()), rep); return cache[k]; }

// Text textures: store signs, posters, notes, menu boards.
export function textTex(text, o = {}) {
  const k = 'T' + text + JSON.stringify(o); if (cache[k]) return cache[k];
  const w = o.w || 512, h = o.h || 128;
  const c = canvas(w, h, g => { g.fillStyle = o.bg || '#111'; g.fillRect(0, 0, w, h); if (o.border) { g.strokeStyle = o.border; g.lineWidth = 8; g.strokeRect(4, 4, w - 8, h - 8); }
    g.font = `${o.weight || 800} ${o.size || 64}px ${o.font || 'Arial Black, Impact, sans-serif'}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = o.fg || '#fff';
    if (o.glow) { g.shadowColor = o.fg; g.shadowBlur = 18; }
    const lines = String(text).split('\n'); lines.forEach((ln, i) => g.fillText(ln, w / 2, h / 2 + (i - (lines.length - 1) / 2) * (o.size || 64) * 1.1));
    if (o.dirt !== false) { const r = rng(text.length * 7 + 3); grime(g, w, h, r, 6, 0.5); } });
  const t = tex(c, 1); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return (cache[k] = t);
}
// Original film posters / ads (no real titles or brands).
export const POSTERS = [
  ['THE LAST\nSHIFT', '#7a1e1e', '#ffd9a0'], ['MIDNIGHT\nSALE', '#1e3a7a', '#fff'], ['ORBITAL\nDRIFT', '#101020', '#7fd1ff'], ['SUMMER\nFOREVER', '#e08a2e', '#fff6d8'], ['HOLLOW\nPINES', '#1f2a1a', '#c9f0a0'],
  ['NEON\nRUNNERS', '#2a0e3a', '#ff5ccd'], ['PAWS &\nCLAWS 3', '#f2c94c', '#3a2a10'], ['50% OFF\nEVERYTHING', '#c4161c', '#fff'], ['GRAND\nOPENING', '#0e6a4a', '#fffbe0'], ['WE\nMISS YOU', '#2b2b2b', '#e6e6e6'],
];
export function posterTex(i) { const [t, bg, fg] = POSTERS[i % POSTERS.length]; return textTex(t, { w: 256, h: 384, size: 54, bg, fg, border: fg }); }

// Shared materials. quality: 'low' uses Lambert (cheaper on old iPads).
let MATS = null;
export function materials(quality = 'medium') {
  if (MATS && MATS._q === quality) return MATS;
  const Std = quality === 'low' ? THREE.MeshLambertMaterial : THREE.MeshStandardMaterial;
  const m = (map, o = {}) => { const p = { map: map ? getTex(map, o.rep || 1) : null, vertexColors: true, ...o.p }; if (quality !== 'low') { p.roughness = o.rough ?? 0.85; p.metalness = o.metal ?? 0; } delete p.rep; return new Std(p); };
  MATS = { _q: quality,
    plain: m('plain'), plaster: m('plaster'), marble: m('marble', { rough: 0.35 }), tile: m('tile', { rough: 0.5 }), carpet: m('carpet', { rough: 1 }), wood: m('wood', { rough: 0.7 }), lino: m('lino', { rough: 0.6 }),
    concrete: m('concrete'), asphalt: m('asphalt'), roof: m('roof'), ceiling: m('ceiling'), metal: m('metal', { rough: 0.4, metal: 0.6 }), fabric: m('fabric', { rough: 1 }), corrugated: m('corrugated', { rough: 0.5, metal: 0.4 }),
    boxes: m('boxes'), books: m('books'), clothes: m('clothes', { rough: 1 }), water: m('water', { rough: 0.05, metal: 0.3 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x9fb8c8, transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.2, depthWrite: false, side: THREE.DoubleSide }),
    screen: new THREE.MeshBasicMaterial({ map: getTex('screen'), color: 0x88aacc, vertexColors: true }),
    emissive: new THREE.MeshBasicMaterial({ vertexColors: true }),
    dark: new THREE.MeshBasicMaterial({ color: 0x050505 }),
  };
  return MATS;
}
export const FLOOR_REP = { marble: 0.25, tile: 0.33, carpet: 0.3, wood: 0.4, lino: 0.25, concrete: 0.2, asphalt: 0.15, roof: 0.2, stairs: 1, escalator: 1, metal: 1 };
