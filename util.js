// Small shared helpers: seeded RNG, math, weighted picks. No DOM, no Three — safe for Node tests.
export function rng(seed) {
  let s = seed >>> 0;
  const f = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  f.int = (a, b) => a + Math.floor(f() * (b - a + 1));
  f.pick = arr => arr[Math.floor(f() * arr.length)];
  f.chance = p => f() < p;
  f.range = (a, b) => a + f() * (b - a);
  f.shuffle = arr => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(f() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  f.weighted = (items, w = x => x.w) => { let t = 0; for (const it of items) t += w(it); let r = f() * t; for (const it of items) { r -= w(it); if (r <= 0) return it; } return items[items.length - 1]; };
  return f;
}
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
export const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
export const smooth = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
export const hashStr = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
export const fmtTime = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
export const uid = () => Math.random().toString(36).slice(2, 9);
