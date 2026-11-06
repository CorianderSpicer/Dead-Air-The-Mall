// Settings persistence (localStorage, guarded — private mode or blocked storage just falls back to defaults).
const KEY = 'deadair.settings.v1';
function autoQuality() {
  const ua = navigator.userAgent, touch = navigator.maxTouchPoints > 1, cores = navigator.hardwareConcurrency || 4;
  const ipad = /iPad/.test(ua) || (/Macintosh/.test(ua) && touch); const phone = /iPhone|Android/.test(ua);
  if (phone) return 'low'; if (ipad) return cores <= 4 ? 'low' : 'medium'; return cores >= 8 ? 'high' : 'medium';
}
export const DEFAULTS = { name: '', quality: autoQuality(), sens: 1, mouseSens: 1, joySize: 1, btnSize: 1, invertY: false, vhs: 1, reduced: false, vol: 0.8, sfx: 1, music: 0.8, amb: 0.9, fov: 78, bob: true, edgeSprint: false, sprintToggle: false, crouchHold: false, leftHanded: false, showFps: false, turnUrl: '', turnUser: '', turnPass: '', diff: 'normal', mods: [], route: '', seenHelp: false };
export function loadSettings() { let s = {}; try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { } return { ...DEFAULTS, ...s }; }
export function saveSettings(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { } }
