// Input: iPad touch (floating left joystick, drag-to-look on the right, action buttons) and keyboard + mouse
// (WASD, pointer-locked mouse look, Shift, Ctrl/C, E, F, Tab, M, Esc, Q, R, H, 1-6). Produces a polled state +
// one-shot "pressed" actions.
export class Controls {
  constructor(root, settings) {
    this.root = root; this.S = settings; this.mx = 0; this.mz = 0; this.lookX = 0; this.lookY = 0; this.sprint = false; this.crouch = false; this.interact = false;
    this.pressed = new Set(); this.keys = new Set(); this.enabled = false; this.touchMode = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window; this.joy = null; this.look = null;
    this.buildTouch(); this.bindKeys(); this.applySettings();
  }
  applySettings() { const js = this.S.joySize || 1; this.root.style.setProperty('--joy', `${Math.round(130 * js)}px`); this.root.style.setProperty('--btn', `${Math.round(66 * (this.S.btnSize || 1))}px`); this.touchEl.classList.toggle('show', this.touchMode && this.enabled); this.touchEl.classList.toggle('left', !!this.S.leftHanded); }
  setEnabled(v) { this.enabled = v; if (!v) { this.mx = this.mz = 0; this.sprint = false; this.interact = false; this.joy = this.look = null; this.joyKnob.style.opacity = 0; if (document.pointerLockElement) document.exitPointerLock?.(); } this.applySettings(); }
  consume() { const r = { mx: this.mx, mz: this.mz, lookX: this.lookX, lookY: this.lookY, sprint: this.sprint, crouch: this.crouch, interact: this.interact, pressed: this.pressed };
    if (!this.touchMode || this.keys.size) { let x = 0, z = 0; const k = this.keys; if (k.has('KeyW') || k.has('ArrowUp')) z += 1; if (k.has('KeyS') || k.has('ArrowDown')) z -= 1; if (k.has('KeyD') || k.has('ArrowRight')) x += 1; if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1; if (x || z) { const l = Math.hypot(x, z); r.mx = x / l; r.mz = z / l; } }
    this.lookX = 0; this.lookY = 0; this.pressed = new Set(); return r; }
  press(a) { if (this.enabled || a === 'pause') this.pressed.add(a); }
  // ── touch ──
  buildTouch() {
    const el = document.createElement('div'); el.className = 'touch'; el.innerHTML = `
      <div class="tzone tl"></div><div class="tzone tr"></div>
      <div class="joy"><div class="joyknob"></div></div>
      <div class="tbtns">
        <button class="tb big" data-a="interact" aria-label="Interact"><span>✋</span><i>USE</i><svg class="ring" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18"/></svg></button>
        <button class="tb" data-a="sprint" aria-label="Sprint"><span>»</span><i>RUN</i></button>
        <button class="tb" data-a="crouch" aria-label="Crouch"><span>▾</span><i>CROUCH</i></button>
        <button class="tb" data-a="flash" aria-label="Flashlight"><span>◐</span><i>LIGHT</i></button>
      </div>
      <div class="ttop"><button class="tb sm" data-a="inv" aria-label="Inventory">▤</button><button class="tb sm" data-a="map" aria-label="Map and objectives">⌖</button><button class="tb sm" data-a="ping" aria-label="Ping">◎</button><button class="tb sm" data-a="pause" aria-label="Pause">❚❚</button></div>`;
    this.root.appendChild(el); this.touchEl = el; this.joyEl = el.querySelector('.joy'); this.joyKnob = el.querySelector('.joyknob'); this.ring = el.querySelector('.tb.big .ring circle');
    const tl = el.querySelector('.tl'), tr = el.querySelector('.tr');
    const joyStart = e => { for (const t of e.changedTouches) { if (this.joy) break; this.joy = { id: t.identifier, x: t.clientX, y: t.clientY }; this.joyEl.style.left = t.clientX + 'px'; this.joyEl.style.top = t.clientY + 'px'; this.joyEl.classList.add('on'); this.joyKnob.style.transform = 'translate(-50%,-50%)'; } e.preventDefault(); };
    const lookStart = e => { for (const t of e.changedTouches) { if (this.look) break; this.look = { id: t.identifier, x: t.clientX, y: t.clientY }; } e.preventDefault(); };
    (this.S.leftHanded ? tr : tl).addEventListener('touchstart', joyStart, { passive: false }); (this.S.leftHanded ? tl : tr).addEventListener('touchstart', lookStart, { passive: false });
    window.addEventListener('touchmove', e => { if (!this.enabled) return; for (const t of e.changedTouches) {
      if (this.joy && t.identifier === this.joy.id) { const R = (this.S.joySize || 1) * 55; let dx = t.clientX - this.joy.x, dy = t.clientY - this.joy.y; const l = Math.hypot(dx, dy); if (l > R) { dx = dx / l * R; dy = dy / l * R; }
        this.joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`; const dz = 0.12; let nx = dx / R, nz = -dy / R; const m = Math.hypot(nx, nz); if (m < dz) { nx = nz = 0; } this.mx = nx; this.mz = nz; if (this.S.edgeSprint) this.sprint = m > 0.97 || this.btnSprint; }
      if (this.look && t.identifier === this.look.id) { const s = (this.S.sens || 1) * 0.0052; this.lookX += (t.clientX - this.look.x) * s; this.lookY += (t.clientY - this.look.y) * s * (this.S.invertY ? -1 : 1); this.look.x = t.clientX; this.look.y = t.clientY; } } e.preventDefault(); }, { passive: false });
    const end = e => { for (const t of e.changedTouches) { if (this.joy && t.identifier === this.joy.id) { this.joy = null; this.mx = this.mz = 0; this.joyEl.classList.remove('on'); if (this.S.edgeSprint) this.sprint = this.btnSprint; } if (this.look && t.identifier === this.look.id) this.look = null; } };
    window.addEventListener('touchend', end); window.addEventListener('touchcancel', end);
    for (const b of el.querySelectorAll('.tb')) { const a = b.dataset.a;
      b.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); b.classList.add('dn'); if (a === 'sprint') { this.btnSprint = this.S.sprintToggle ? !this.btnSprint : true; this.sprint = this.btnSprint; b.classList.toggle('lock', this.btnSprint && this.S.sprintToggle); } else if (a === 'interact') { this.interact = true; this.press('interact'); } else if (a === 'crouch') { this.crouch = !this.crouch; b.classList.toggle('lock', this.crouch); } else this.press(a);
        // a finger landing on a button can also look (drag from the button)
        if (a === 'interact' || a === 'sprint') { const t = e.changedTouches[0]; if (!this.look) this.look = { id: t.identifier, x: t.clientX, y: t.clientY }; } }, { passive: false });
      const up = e => { b.classList.remove('dn'); if (a === 'sprint' && !this.S.sprintToggle) { this.btnSprint = false; this.sprint = false; } if (a === 'interact') this.interact = false; };
      b.addEventListener('touchend', up); b.addEventListener('touchcancel', up);
      b.addEventListener('click', e => { if (this.touchMode) return; this.press(a); }); }
  }
  setHold(frac) { if (!this.ring) return; const c = 113; this.ring.style.strokeDashoffset = String(c - c * Math.max(0, Math.min(1, frac || 0))); }
  setCrouch(v) { this.crouch = v; this.touchEl.querySelector('[data-a=crouch]')?.classList.toggle('lock', v); }
  // ── keyboard + mouse ──
  bindKeys() {
    const canvasClick = e => { if (this.enabled && !this.touchMode && e.target.tagName === 'CANVAS' && !document.pointerLockElement) e.target.requestPointerLock?.(); };
    document.addEventListener('mousedown', canvasClick);
    document.addEventListener('mousemove', e => { if (!this.enabled || document.pointerLockElement == null) return; const s = (this.S.mouseSens || 1) * 0.0022; this.lookX += e.movementX * s; this.lookY += e.movementY * s * (this.S.invertY ? -1 : 1); });
    document.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.code === 'Tab') e.preventDefault(); if ((e.ctrlKey || e.metaKey) && ['KeyW', 'KeyS', 'KeyD'].includes(e.code) && this.enabled) e.preventDefault();
      if (this.touchMode && !e.repeat) { this.touchMode = false; this.applySettings(); }
      if (e.repeat) return; this.keys.add(e.code);
      switch (e.code) { case 'ShiftLeft': case 'ShiftRight': this.sprint = true; break; case 'ControlLeft': case 'ControlRight': case 'KeyC': this.crouch = this.S.crouchHold ? true : !this.crouch; break;
        case 'KeyE': this.interact = true; this.press('interact'); break; case 'KeyF': this.press('flash'); break; case 'Tab': case 'KeyI': this.press('inv'); break; case 'KeyM': this.press('map'); break; case 'KeyO': this.press('obj'); break;
        case 'Escape': case 'KeyP': this.press('pause'); break; case 'KeyQ': this.press('ping'); break; case 'KeyR': this.press('battery'); break; case 'KeyH': this.press('heal'); break; case 'KeyG': this.press('drop'); break;
        default: if (/^Digit[1-6]$/.test(e.code)) this.press('slot' + e.code.slice(5)); }
    });
    document.addEventListener('keyup', e => { this.keys.delete(e.code); if (e.code.startsWith('Shift')) this.sprint = false; if (e.code === 'KeyE') this.interact = false; if (this.S.crouchHold && (e.code.startsWith('Control') || e.code === 'KeyC')) this.crouch = false; });
    window.addEventListener('blur', () => { this.keys.clear(); this.sprint = false; this.interact = false; });
    document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement && this.enabled && !this.touchMode) this.onUnlock?.(); });
  }
}
