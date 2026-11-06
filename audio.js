// All sound is synthesised with WebAudio (no audio files): mall ambience (HVAC drone, rain, drips, creaks), positional
// one-shots via HRTF panners, per-surface footsteps, doors/shutters/elevator, the Tenant's "dead air" breathing/static,
// chase music, heartbeat, PA chimes, radio static and jumpscare stings.
export class Audio {
  constructor(settings) { this.S = settings; this.ctx = null; this.ok = false; this.loops = {}; this.t = 0; }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.connect(c.destination);
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(this.master); this.out = comp;
    this.sfx = c.createGain(); this.sfx.connect(comp); this.amb = c.createGain(); this.amb.connect(comp); this.mus = c.createGain(); this.mus.connect(comp);
    // bodycam mic colouring: gentle band-limit on everything world-side
    this.world = c.createBiquadFilter(); this.world.type = 'lowpass'; this.world.frequency.value = 9000; this.world.connect(this.sfx);
    this.noiseBuf = this.mkNoise(2, 'white'); this.brownBuf = this.mkNoise(4, 'brown'); this.pinkBuf = this.mkNoise(3, 'pink');
    this.applyVolume(); this.ok = true; this.startAmbience();
  }
  applyVolume() { if (!this.ctx) return; const S = this.S; this.master.gain.value = (S.vol ?? 0.8); this.sfx.gain.value = (S.sfx ?? 1); this.amb.gain.value = (S.amb ?? 0.9); this.mus.gain.value = (S.music ?? 0.8); }
  mkNoise(sec, kind) { const c = this.ctx, n = c.sampleRate * sec, b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0); let l = 0, b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; if (kind === 'brown') { l = (l + 0.02 * w) / 1.02; d[i] = l * 3.5; } else if (kind === 'pink') { b0 = 0.997 * b0 + w * 0.029; b1 = 0.985 * b1 + w * 0.032; b2 = 0.95 * b2 + w * 0.048; d[i] = (b0 + b1 + b2 + w * 0.05) * 1.6; } else d[i] = w; } return b; }
  // listener follows the camera
  listen(x, y, z, fx, fz) { if (!this.ok) return; const L = this.ctx.listener, t = this.ctx.currentTime; this.lx = x; this.ly = y; this.lz = z;
    if (L.positionX) { L.positionX.setTargetAtTime(x, t, 0.02); L.positionY.setTargetAtTime(y, t, 0.02); L.positionZ.setTargetAtTime(z, t, 0.02); L.forwardX.setTargetAtTime(fx, t, 0.02); L.forwardY.setTargetAtTime(0, t, 0.02); L.forwardZ.setTargetAtTime(fz, t, 0.02); L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0; }
    else { L.setPosition(x, y, z); L.setOrientation(fx, 0, fz, 0, 1, 0); } }
  panner(x, y, z, ref = 2, roll = 1.4, max = 60) { const p = this.ctx.createPanner(); p.panningModel = this.S.quality === 'low' ? 'equalpower' : 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = ref; p.rolloffFactor = roll; p.maxDistance = max;
    if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; } else p.setPosition(x, y, z); p.connect(this.world); return p; }
  dest(pos, o = {}) { if (!pos) { const g = this.ctx.createGain(); g.connect(o.dry ? this.sfx : this.world); return g; } // occluded (other level / behind walls): muffle
    let node = this.panner(pos.x, pos.y ?? this.ly, pos.z, o.ref || 2, o.roll || 1.4); if (o.muffle) { const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 650; f.connect(node); node = f; } return node; }
  far(pos) { return pos && this.lx != null && Math.hypot(pos.x - this.lx, pos.z - this.lz) > 70; }
  env(g, t, a, peak, d, end = 0.0001) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a); g.gain.exponentialRampToValueAtTime(end, t + a + d); }
  noise(dst, t, dur, f, q, peak, type = 'bandpass', buf) { const c = this.ctx, s = c.createBufferSource(); s.buffer = buf || this.noiseBuf; s.loop = true; const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = c.createGain(); s.connect(fl); fl.connect(g); g.connect(dst); s.start(t, Math.random()); this.env(g, t, Math.min(0.01, dur * 0.2), peak, dur); s.stop(t + dur + 0.1); return { s, fl, g }; }
  tone(dst, t, type, f0, f1, dur, peak, a = 0.005) { const c = this.ctx, o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur); const g = c.createGain(); o.connect(g); g.connect(dst); this.env(g, t, a, peak, dur); o.start(t); o.stop(t + dur + a + 0.05); return o; }
  // ── one-shots ──
  play(name, pos, o = {}) {
    if (!this.ok || this.far(pos)) return; const c = this.ctx, t = c.currentTime + (o.delay || 0), d = this.dest(pos, o), v = o.vol ?? 1;
    switch (name) {
      case 'step': { const m = o.mat || 'tile'; const P = { tile: [2200, 1.4, 0.05, 0.25], marble: [2600, 2, 0.06, 0.28], carpet: [600, 0.7, 0.07, 0.18], wood: [900, 2, 0.07, 0.28], lino: [1500, 1.2, 0.05, 0.22], concrete: [1300, 1, 0.06, 0.26], asphalt: [900, 0.8, 0.07, 0.24], roof: [800, 0.9, 0.07, 0.25], metal: [3000, 8, 0.12, 0.3] }[m] || [1600, 1, 0.06, 0.24];
        const k = (o.sprint ? 1.5 : o.crouch ? 0.4 : 1) * v; this.noise(d, t, P[2], P[0] * (0.9 + Math.random() * 0.2), P[1], P[3] * k); this.tone(d, t, 'sine', 120, 60, 0.05, 0.12 * k);
        if (m === 'metal') this.tone(d, t, 'triangle', 420 + Math.random() * 80, 400, 0.2, 0.04 * k); if (o.wet) this.noise(d, t + 0.01, 0.12, 3500, 0.6, 0.12 * k, 'highpass'); if (o.glass) for (let i = 0; i < 3; i++) this.tone(d, t + i * 0.02, 'sine', 4000 + Math.random() * 3000, 3800, 0.04, 0.03 * k); break; }
      case 'land': this.noise(d, t, 0.15, 400, 0.8, 0.5 * v, 'lowpass'); break;
      case 'click': this.tone(d, t, 'square', 2400, 1800, 0.02, 0.08 * v); this.noise(d, t, 0.02, 4000, 1, 0.1 * v); break;
      case 'ui': this.tone(this.sfx, t, 'sine', o.f || 660, (o.f || 660) * 1.02, 0.08, 0.08 * v); break;
      case 'pickup': this.noise(d, t, 0.08, 2500, 1.5, 0.15 * v); this.tone(d, t + 0.04, 'triangle', 880, 990, 0.08, 0.06 * v); break;
      case 'drop': this.noise(d, t, 0.1, 900, 1, 0.35 * v); this.tone(d, t, 'triangle', 300, 180, 0.15, 0.12 * v); break;
      case 'battery': this.tone(d, t, 'square', 1200, 1200, 0.03, 0.06); this.tone(d, t + 0.12, 'square', 1600, 1600, 0.03, 0.06); this.noise(d, t + 0.05, 0.06, 1800, 2, 0.15); break;
      case 'heal': this.noise(d, t, 0.5, 3000, 0.7, 0.12, 'highpass'); this.noise(d, t + 0.5, 0.3, 2000, 0.7, 0.1); break;
      case 'doorOpen': { const o2 = c.createOscillator(); o2.type = 'sawtooth'; o2.frequency.setValueAtTime(140 + Math.random() * 60, t); o2.frequency.linearRampToValueAtTime(90 + Math.random() * 120, t + 0.6); const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 6; const g = c.createGain(); o2.connect(f); f.connect(g); g.connect(d); this.env(g, t, 0.05, 0.08 * v, 0.6); o2.start(t); o2.stop(t + 0.75); this.noise(d, t, 0.06, 1200, 1, 0.3 * v); break; }
      case 'doorClose': this.noise(d, t, 0.18, 300, 0.7, 0.55 * v, 'lowpass'); this.tone(d, t, 'sine', 90, 50, 0.2, 0.35 * v); break;
      case 'slam': this.noise(d, t, 0.35, 260, 0.6, 1.0 * v, 'lowpass'); this.tone(d, t, 'sine', 70, 35, 0.4, 0.8 * v); this.noise(d, t, 0.6, 2400, 3, 0.1 * v); break;
      case 'locked': this.noise(d, t, 0.05, 1500, 3, 0.3); this.noise(d, t + 0.11, 0.05, 1300, 3, 0.28); this.tone(d, t, 'square', 180, 160, 0.06, 0.05); break;
      case 'unlock': this.noise(d, t, 0.04, 2500, 4, 0.3); this.tone(d, t + 0.08, 'square', 900, 700, 0.05, 0.08); break;
      case 'shutter': for (let i = 0; i < 14; i++) this.noise(d, t + i * 0.07, 0.06, 1100 + Math.random() * 600, 3, 0.25 * v); this.noise(d, t, 1.1, 300, 0.6, 0.25 * v, 'lowpass'); break;
      case 'pry': this.tone(d, t, 'sawtooth', 300, 90, 0.5, 0.12); this.noise(d, t + 0.4, 0.3, 700, 1, 0.8, 'lowpass'); for (let i = 0; i < 3; i++) this.tone(d, t + 0.45 + i * 0.05, 'triangle', 1800 + i * 500, 1700, 0.25, 0.06); break;
      case 'cut': this.noise(d, t, 0.05, 3000, 2, 0.5); this.tone(d, t + 0.05, 'triangle', 2600, 2500, 0.4, 0.07); this.noise(d, t + 0.1, 0.3, 600, 1, 0.4); break;
      case 'glass': for (let i = 0; i < 9; i++) this.tone(d, t + Math.random() * 0.25, 'sine', 2500 + Math.random() * 5000, 2000, 0.15 + Math.random() * 0.2, 0.08 * v); this.noise(d, t, 0.3, 5000, 0.5, 0.5 * v, 'highpass'); break;
      case 'spark': for (let i = 0; i < 6; i++) this.noise(d, t + Math.random() * 0.4, 0.03, 6000, 1, 0.3 * v, 'highpass'); this.tone(d, t, 'sawtooth', 100, 100, 0.5, 0.06 * v); break;
      case 'elevDing': this.tone(d, t, 'sine', 1318, 1318, 1.2, 0.25, 0.002); this.tone(d, t + 0.35, 'sine', 1046, 1046, 1.5, 0.22, 0.002); break;
      case 'elevMove': this.noise(d, t, 3.2, 120, 0.5, 0.35, 'lowpass', this.brownBuf); this.tone(d, t, 'sawtooth', 55, 58, 3.2, 0.05, 0.5); break;
      case 'generator': { for (let i = 0; i < 3; i++) { this.noise(d, t + i * 0.45, 0.35, 180, 1, 0.9, 'lowpass', this.brownBuf); this.tone(d, t + i * 0.45, 'sawtooth', 40, 70, 0.35, 0.3); } this.noise(d, t + 1.4, 2.5, 140, 0.6, 1, 'lowpass', this.brownBuf); this.tone(d, t + 1.4, 'square', 50, 60, 2.5, 0.12); break; }
      case 'powerOn': { const g = this.sfx; this.tone(g, t, 'sawtooth', 40, 120, 1.6, 0.12, 0.3); for (let i = 0; i < 6; i++) this.noise(g, t + 0.6 + i * 0.18, 0.08, 400, 2, 0.35); this.chime(t + 2); break; }
      case 'pa': this.chime(t); break;
      case 'keypad': for (let i = 0; i < 4; i++) this.tone(d, t + i * 0.18, 'square', [697, 770, 852, 941][i % 4] + 1209 * 0, 700, 0.08, 0.06); this.tone(d, t + 0.8, 'sine', 1500, 1500, 0.25, 0.1); break;
      case 'deny': this.tone(d, t, 'square', 220, 220, 0.25, 0.08); this.tone(d, t + 0.3, 'square', 220, 220, 0.25, 0.08); break;
      case 'success': this.tone(this.sfx, t, 'triangle', 523, 523, 0.12, 0.12); this.tone(this.sfx, t + 0.1, 'triangle', 784, 784, 0.25, 0.12); break;
      case 'objective': this.tone(this.sfx, t, 'sine', 440, 440, 0.15, 0.1); this.tone(this.sfx, t + 0.12, 'sine', 660, 660, 0.15, 0.1); this.tone(this.sfx, t + 0.24, 'sine', 880, 880, 0.4, 0.1); break;
      case 'radio': this.noise(this.sfx, t, 0.15, 2000, 0.8, 0.25 * v); this.tone(this.sfx, t + 0.15, 'square', 1800, 1800, 0.05, 0.05); this.noise(this.sfx, t + 0.25, o.len || 1.2, 1500, 1.2, 0.07 * v); this.noise(this.sfx, t + 0.25 + (o.len || 1.2), 0.12, 2000, 0.8, 0.2 * v); break;
      case 'ping': this.tone(this.sfx, t, 'sine', 1200, 1200, 0.12, 0.1); this.tone(this.sfx, t + 0.12, 'sine', 1500, 1500, 0.2, 0.08); break;
      case 'phone': for (let r = 0; r < 3; r++) for (let i = 0; i < 18; i++) { this.tone(d, t + r * 3 + i * 0.05, 'sine', 440, 440, 0.04, 0.12); this.tone(d, t + r * 3 + i * 0.05, 'sine', 480, 480, 0.04, 0.12); } break;
      case 'knock': for (let i = 0; i < (o.n || 3); i++) { this.noise(d, t + i * (0.32 + Math.random() * 0.1), 0.08, 350, 1, 0.9 * v, 'lowpass'); this.tone(d, t + i * 0.36, 'sine', 110, 70, 0.1, 0.4 * v); } break;
      case 'bang': this.noise(d, t, 0.7, 180, 0.6, 1.4 * v, 'lowpass', this.brownBuf); this.tone(d, t, 'sine', 55, 30, 0.8, 1.0 * v); this.noise(d, t, 0.25, 2000, 0.6, 0.5 * v); break;
      case 'cart': for (let i = 0; i < 30; i++) this.noise(d, t + i * 0.09, 0.05, 1800 + Math.sin(i) * 400, 4, 0.12 * v); this.noise(d, t, 2.8, 300, 0.7, 0.1 * v, 'lowpass', this.brownBuf); break;
      case 'drip': this.tone(d, t, 'sine', 1400 + Math.random() * 900, 600, 0.09, 0.08 * v); break;
      case 'creak': { const o2 = c.createOscillator(); o2.type = 'sawtooth'; o2.frequency.setValueAtTime(60 + Math.random() * 40, t); o2.frequency.linearRampToValueAtTime(40 + Math.random() * 80, t + 1.4); const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 500 + Math.random() * 600; f.Q.value = 9; const g = c.createGain(); o2.connect(f); f.connect(g); g.connect(d); this.env(g, t, 0.3, 0.12 * v, 1.2); o2.start(t); o2.stop(t + 1.6); break; }
      case 'thud': this.noise(d, t, 0.25, 140, 0.7, 0.9 * v, 'lowpass', this.brownBuf); this.tone(d, t, 'sine', 65, 38, 0.25, 0.7 * v); break; // monster footfall
      case 'skitter': for (let i = 0; i < 4; i++) this.noise(d, t + i * 0.035, 0.03, 2500 + Math.random() * 2000, 3, 0.35 * v); break;
      case 'scream': this.scream(d, t, v, o.long); break;
      case 'growl': { const o2 = c.createOscillator(); o2.type = 'sawtooth'; o2.frequency.setValueAtTime(70, t); o2.frequency.linearRampToValueAtTime(52, t + 1.2); const am = c.createOscillator(); am.frequency.value = 23; const amg = c.createGain(); amg.gain.value = 0.5; am.connect(amg); const g = c.createGain(); amg.connect(g.gain); const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500; o2.connect(f); f.connect(g); g.connect(d); this.env(g, t, 0.15, 0.6 * v, 1.2); o2.start(t); am.start(t); o2.stop(t + 1.5); am.stop(t + 1.5); this.noise(d, t, 1.2, 900, 2, 0.25 * v); break; }
      case 'sniff': for (let i = 0; i < 4; i++) this.noise(d, t + i * 0.16, 0.1, 1800, 2.5, 0.35 * v); break;
      case 'garble': this.garble(d, t, o.len || 1.8, v); break; // PA horn "voice"
      case 'staticBurst': this.noise(this.sfx, t, o.len || 0.4, 2500, 0.4, 0.4 * v); break;
      case 'stinger': { const g = this.sfx; for (const f of [55, 58.3, 82.4, 110, 116.5]) this.tone(g, t, 'sawtooth', f * 2, f * 1.9, 1.6, 0.09 * v, 0.01); this.noise(g, t, 0.8, 1200, 0.5, 0.35 * v); break; }
      case 'jumpscare': { const g = this.sfx; this.scream(g, t, 1.2 * v, true); this.noise(g, t, 0.9, 2000, 0.3, 0.9 * v); for (const f of [41, 43.6, 61.7, 87]) this.tone(g, t, 'sawtooth', f * 4, f * 3, 1.3, 0.16 * v, 0.003); this.tone(g, t, 'sine', 50, 30, 0.6, 1.2 * v); break; }
      case 'hit': this.noise(this.sfx, t, 0.3, 600, 0.5, 1 * v, 'lowpass'); this.tone(this.sfx, t, 'sine', 90, 40, 0.3, 0.9 * v); this.noise(this.sfx, t + 0.05, 0.4, 3500, 1, 0.25 * v); break;
      case 'flare': this.noise(d, t, 0.25, 2500, 0.5, 0.5); this.noise(d, t + 0.2, 6, 1800, 0.4, 0.12, 'bandpass'); break;
      case 'heli': this.noise(d, t, o.len || 6, 120, 0.7, 0.9, 'lowpass', this.brownBuf); for (let i = 0; i < (o.len || 6) * 9; i++) this.noise(d, t + i / 9, 0.06, 200, 1, 0.5, 'lowpass'); break;
      case 'whisper': this.noise(d, t, o.len || 1.2, 3500, 2.5, 0.12 * v); this.noise(d, t + 0.1, (o.len || 1.2) * 0.8, 5200, 3, 0.08 * v); break;
      case 'heartbeat': this.tone(this.sfx, t, 'sine', 62, 48, 0.12, 0.6 * v); this.tone(this.sfx, t + 0.22, 'sine', 55, 42, 0.14, 0.45 * v); break;
      case 'breath': this.noise(this.sfx, t, o.len || 0.6, 900, 0.8, 0.06 * v, 'bandpass', this.pinkBuf); break;
    }
  }
  chime(t) { const g = this.amb; [[659, 0], [523, 0.55], [392, 1.1]].forEach(([f, dt]) => { this.tone(g, t + dt, 'sine', f, f, 1.6, 0.12, 0.004); this.tone(g, t + dt, 'sine', f * 2.01, f * 2, 0.8, 0.02, 0.004); }); }
  scream(d, t, v = 1, long) { const c = this.ctx, dur = long ? 1.5 : 0.9; const ws = c.createWaveShaper(); const k = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 128 - 1; k[i] = Math.tanh(x * 6); } ws.curve = k; const g = c.createGain(); ws.connect(g); g.connect(d); this.env(g, t, 0.03, 0.35 * v, dur);
    for (const [f0, f1] of [[620, 380], [930, 520], [1240, 760], [410, 260]]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f0 * (0.95 + Math.random() * 0.1), t); o.frequency.exponentialRampToValueAtTime(f1, t + dur); const vib = c.createOscillator(); vib.frequency.value = 9 + Math.random() * 6; const vg = c.createGain(); vg.gain.value = 40; vib.connect(vg); vg.connect(o.frequency); const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f0 * 1.4; bp.Q.value = 2; o.connect(bp); bp.connect(ws); o.start(t); vib.start(t); o.stop(t + dur + 0.1); vib.stop(t + dur + 0.1); }
    this.noise(ws, t, dur, 2500, 0.7, 0.5); }
  garble(d, t, len, v = 1) { const c = this.ctx; const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1300; f.Q.value = 3; f.connect(d); // formant-ish chopped noise + buzz through a PA horn
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 110; const g = c.createGain(); o.connect(g); g.connect(f); g.gain.value = 0; o.start(t); o.stop(t + len + 0.1);
    for (let s = 0; s < len; s += 0.09 + Math.random() * 0.08) { const on = Math.random() < 0.7; g.gain.setValueAtTime(on ? 0.12 * v : 0, t + s); o.frequency.setValueAtTime(90 + Math.random() * 70, t + s); f.frequency.setValueAtTime(700 + Math.random() * 1800, t + s); }
    this.noise(f, t, len, 1500, 0.5, 0.1 * v); }
  // ── loops ──
  loop(name, make) { if (!this.ok) return null; if (!this.loops[name]) this.loops[name] = make(); return this.loops[name]; }
  startAmbience() { const c = this.ctx;
    // HVAC / building hum
    const hum = c.createBufferSource(); hum.buffer = this.brownBuf; hum.loop = true; const hf = c.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 180; const hg = c.createGain(); hg.gain.value = 0.22; hum.connect(hf); hf.connect(hg); hg.connect(this.amb); hum.start();
    const drone = c.createOscillator(); drone.frequency.value = 49; const dr2 = c.createOscillator(); dr2.frequency.value = 49.7; const dg = c.createGain(); dg.gain.value = 0.025; drone.connect(dg); dr2.connect(dg); dg.connect(this.amb); drone.start(); dr2.start();
    // rain (louder near the entrance)
    const rain = c.createBufferSource(); rain.buffer = this.pinkBuf; rain.loop = true; const rf = c.createBiquadFilter(); rf.type = 'highpass'; rf.frequency.value = 600; const rg = c.createGain(); rg.gain.value = 0.02; rain.connect(rf); rf.connect(rg); rg.connect(this.amb); rain.start();
    // the Tenant: static + wet breathing, positional
    const ms = c.createBufferSource(); ms.buffer = this.noiseBuf; ms.loop = true; const mf = c.createBiquadFilter(); mf.type = 'bandpass'; mf.frequency.value = 2200; mf.Q.value = 0.8; const mg = c.createGain(); mg.gain.value = 0; const mp = this.panner(0, 0, 0, 3, 1.2, 50); ms.connect(mf); mf.connect(mg); mg.connect(mp); ms.start();
    const br = c.createBufferSource(); br.buffer = this.pinkBuf; br.loop = true; const bf = c.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = 500; bf.Q.value = 1.5; const bg = c.createGain(); bg.gain.value = 0; br.connect(bf); bf.connect(bg); bg.connect(mp); br.start();
    // radio static near it (only if the player holds a radio)
    const rs = c.createBufferSource(); rs.buffer = this.noiseBuf; rs.loop = true; const rsf = c.createBiquadFilter(); rsf.type = 'bandpass'; rsf.frequency.value = 3000; rsf.Q.value = 0.5; const rsg = c.createGain(); rsg.gain.value = 0; rs.connect(rsf); rsf.connect(rsg); rsg.connect(this.sfx); rs.start();
    // chase music: pulsing low drum + dissonant cluster
    const cg = c.createGain(); cg.gain.value = 0; cg.connect(this.mus); const cl = c.createBiquadFilter(); cl.type = 'lowpass'; cl.frequency.value = 700; cl.connect(cg);
    const oscs = [55, 58.27, 77.78, 82.41, 110.0].map(f => { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; const g = c.createGain(); g.gain.value = 0.08; o.connect(g); g.connect(cl); o.start(); return o; });
    const lfo = c.createOscillator(); lfo.frequency.value = 2.2; const lg = c.createGain(); lg.gain.value = 0.5; lfo.connect(lg); const pulse = c.createGain(); pulse.gain.value = 0.5; lg.connect(pulse.gain); cl.disconnect(); cl.connect(pulse); pulse.connect(cg); lfo.start();
    // muzak on the PA once power is back: warped, slow, detuned
    const mz = c.createGain(); mz.gain.value = 0; const mzf = c.createBiquadFilter(); mzf.type = 'bandpass'; mzf.frequency.value = 1100; mzf.Q.value = 0.7; mz.connect(mzf); mzf.connect(this.amb);
    this.loops = { hg, rg, mg, bg, mp, mf, rsg, cg, lfo, cl, mz, oscs };
    this.muzakT = 0; this.muzakStep = 0;
  }
  // per-frame: monster position/state, chase intensity, rain proximity, heartbeat, muzak
  update(dt, s) {
    if (!this.ok) return; const L = this.loops, c = this.ctx, t = c.currentTime; this.t += dt;
    const k = (v, tc = 0.2) => v; // helper for readability
    L.rg.gain.setTargetAtTime(0.012 + 0.12 * Math.max(0, 1 - (s.distRain ?? 99) / 18), t, 0.5);
    L.hg.gain.setTargetAtTime(s.power ? 0.3 : 0.18, t, 1);
    if (s.mon) { const m = s.mon; if (L.mp.positionX) { L.mp.positionX.setTargetAtTime(m.x, t, 0.05); L.mp.positionY.setTargetAtTime(m.y + 2, t, 0.05); L.mp.positionZ.setTargetAtTime(m.z, t, 0.05); } else L.mp.setPosition(m.x, m.y + 2, m.z);
      const occl = m.lv !== s.lv ? 0.35 : 1; const loud = m.st === 'chase' ? 0.5 : m.st === 'hunt' || m.st === 'search' ? 0.3 : 0.18; L.mg.gain.setTargetAtTime(loud * occl * (0.6 + Math.random() * 0.4), t, 0.08); L.bg.gain.setTargetAtTime(0.35 * occl * (0.5 + 0.5 * Math.sin(this.t * (m.st === 'chase' ? 9 : 2.4))), t, 0.05); L.mf.frequency.setTargetAtTime(1500 + Math.random() * 1800, t, 0.05); }
    L.rsg.gain.setTargetAtTime(s.radio ? Math.max(0, 1 - s.monDist / 26) ** 2 * 0.35 : 0, t, 0.2);
    L.cg.gain.setTargetAtTime((s.chase || 0) * 0.55, t, s.chase ? 0.3 : 1.5); L.lfo.frequency.setTargetAtTime(1.6 + (s.chase || 0) * 2.4, t, 0.5); L.cl.frequency.setTargetAtTime(400 + (s.chase || 0) * 1400, t, 0.4);
    // heartbeat: near the monster or badly hurt
    const fear = Math.max(s.fear || 0, s.hurt || 0); this.hbT = (this.hbT || 0) - dt; if (fear > 0.25 && this.hbT <= 0) { this.hbT = 1.1 - fear * 0.6; this.play('heartbeat', null, { vol: 0.3 + fear * 0.6 }); }
    // muzak: a slow, wrong little tune through the PA
    L.mz.gain.setTargetAtTime(s.power ? 0.05 : 0, t, 2);
    if (s.power) { this.muzakT -= dt; if (this.muzakT <= 0) { const notes = [392, 440, 494, 392, 330, 349, 392, 0, 523, 494, 440, 392, 370, 392, 330, 0]; const f = notes[this.muzakStep++ % notes.length]; this.muzakT = 0.55; if (f) { const wob = 1 + Math.sin(this.t * 0.4) * 0.025; this.tone(L.mz, t, 'triangle', f * wob, f * wob * 0.99, 0.5, 0.5, 0.02); this.tone(L.mz, t, 'sine', f / 2 * wob, f / 2 * wob, 0.5, 0.3, 0.02); } } }
    // random ambience one-shots around the listener
    this.ambT = (this.ambT ?? 3) - dt; if (this.ambT <= 0 && this.lx != null) { this.ambT = 2 + Math.random() * 6; const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 18; const pos = { x: this.lx + Math.cos(a) * r, y: this.ly + 2 + Math.random() * 2, z: this.lz + Math.sin(a) * r }; const pick = Math.random(); this.play(pick < 0.45 ? 'drip' : pick < 0.8 ? 'creak' : 'skitter', pos, { vol: pick > 0.8 ? 0.25 : 0.6 }); }
  }
  stopAll() { if (!this.ok) return; const L = this.loops, t = this.ctx.currentTime; for (const g of [L.mg, L.bg, L.rsg, L.cg, L.mz]) g.gain.setTargetAtTime(0, t, 0.1); }
}
