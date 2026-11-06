// Renderer, camera, fog, the bodycam/VHS post-process, a pooled set of dynamic lights that follow the camera,
// lamp flicker/power state, rain outside, and per-level visibility culling.
import * as THREE from './three.module.js';

export const QUALITY = {
  low: { scale: 0.6, pool: 3, shadows: false, post: true, maxPix: 1, fogMul: 1.15 },
  medium: { scale: 0.8, pool: 6, shadows: false, post: true, maxPix: 1.5, fogMul: 1 },
  high: { scale: 1.0, pool: 9, shadows: true, post: true, maxPix: 2, fogMul: 1 },
};

const VHS_FRAG = `
precision highp float; uniform sampler2D tDiffuse; uniform float time, glitch, staticAmt, damage, intensity, lowBatt; uniform vec2 res; varying vec2 vUv;
float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
void main(){
  vec2 uv = vUv; vec2 c = uv - 0.5; float r2 = dot(c,c);
  uv = 0.5 + c * (1.0 + 0.11*intensity*r2 + 0.06*intensity*r2*r2); // bodycam wide-angle barrel
  if (uv.x<0.0||uv.x>1.0||uv.y<0.0||uv.y>1.0){ gl_FragColor = vec4(0.0,0.0,0.0,1.0); return; }
  float line = floor(uv.y*res.y*0.5);
  float jit = (h(vec2(line, floor(time*30.0))) - 0.5) * (0.0012*intensity + glitch*0.02 + staticAmt*0.004);
  float band = smoothstep(0.0,0.02, abs(fract(uv.y*0.5 - time*0.05) - 0.5) - 0.48); // rolling tracking band
  jit += (1.0-band) * 0.004 * intensity;
  uv.x += jit;
  float ca = 0.0016*intensity + glitch*0.012 + staticAmt*0.003;
  vec3 col; col.r = texture2D(tDiffuse, uv + vec2(ca,0.0)).r; col.g = texture2D(tDiffuse, uv).g; col.b = texture2D(tDiffuse, uv - vec2(ca,0.0)).b;
  // VHS colour: chroma bleed, lifted blacks, slightly crushed and green-teal bodycam grade
  vec3 blur = (texture2D(tDiffuse, uv + vec2(0.003,0.0)).rgb + texture2D(tDiffuse, uv - vec2(0.003,0.0)).rgb) * 0.5;
  col = mix(col, vec3(dot(col, vec3(0.299,0.587,0.114))), 0.25*intensity) * 0.92 + blur*0.08;
  col = col * vec3(0.96, 1.03, 0.98) + vec3(0.012,0.016,0.016)*intensity;
  col = pow(col, vec3(1.06));
  float n = h(uv*res + time*61.0);
  col += (n - 0.5) * (0.07*intensity + staticAmt*0.45);
  col *= 0.92 + 0.08*sin(uv.y*res.y*1.4);              // scanlines
  col += (1.0-band) * 0.04 * intensity;
  col = mix(col, vec3(n), clamp(staticAmt,0.0,1.0)*0.55); // dead-air static near the monster / when hit
  float v = smoothstep(0.85, 0.25, length(c)*1.15); col *= mix(0.55, 1.0, v);
  col = mix(col, vec3(0.6,0.0,0.0), damage*0.45*(1.0-v*0.6));
  col *= 1.0 - lowBatt*0.05*step(0.5, h(vec2(floor(time*12.0),1.0)));
  gl_FragColor = vec4(col, 1.0);
}`;

export function createEngine(canvas, quality = 'medium') {
  const Q = QUALITY[quality];
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q.maxPix) * Q.scale);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15; renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = Q.shadows; renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x020306);
  scene.fog = new THREE.FogExp2(0x030405, 0.042 * Q.fogMul);
  const camera = new THREE.PerspectiveCamera(78, 1, 0.05, 80); scene.add(camera);
  const hemi = new THREE.HemisphereLight(0x8090a8, 0x201810, 0.32); scene.add(hemi);
  // pooled point lights driven by nearby lamps
  const pool = []; for (let i = 0; i < Q.pool; i++) { const L = new THREE.PointLight(0xffffff, 0, 9, 1.6); L.castShadow = false; scene.add(L); pool.push(L); }
  // post
  let rt = null, post = null;
  if (Q.post) { rt = new THREE.WebGLRenderTarget(16, 16, { depthBuffer: true, type: THREE.HalfFloatType }); rt.texture.colorSpace = THREE.SRGBColorSpace;
    post = { scene: new THREE.Scene(), cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), mat: new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: rt.texture }, time: { value: 0 }, glitch: { value: 0 }, staticAmt: { value: 0 }, damage: { value: 0 }, intensity: { value: 1 }, lowBatt: { value: 0 }, res: { value: new THREE.Vector2(640, 360) } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: VHS_FRAG, depthTest: false, depthWrite: false }) };
    post.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post.mat)); }
  const E = { renderer, scene, camera, Q, quality, pool, hemi, fx: { glitch: 0, staticAmt: 0, damage: 0, vhs: 1, lowBatt: 0 }, world: null, level: 'G', power: false, rain: null };
  E.resize = () => { const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); if (rt) { const pr = renderer.getPixelRatio(); rt.setSize(Math.floor(w * pr), Math.floor(h * pr)); post.mat.uniforms.res.value.set(w * pr, h * pr); } };
  E.resize(); window.addEventListener('resize', E.resize);
  E.setLevel = lv => { E.level = lv; if (!E.world) return; const show = { B: ['B'], G: ['G', 'U'], U: ['G', 'U'], R: ['R', 'U', 'G'] }[lv] || ['G']; for (const [k, g] of Object.entries(E.world.groups)) g.visible = show.includes(k); if (E.rain) E.rain.visible = lv === 'G'; };
  E.attachWorld = world => { E.world = world; E.setLevel('G'); E.rain = makeRain(scene); };
  // lamp logic
  const tmpC = new THREE.Color(); let poolTimer = 0, assigned = [];
  E.lampOn = l => l.power === 'always' || l.power === 'backup' || (l.power === 'main' && E.power);
  E.lampLevel = (l, t) => { if (!E.lampOn(l)) return 0; let k = l.power === 'backup' && !E.power ? 0.45 : 1; if (l.flick > 0) { const s = Math.sin(t * (7 + l.flick * 13) + l.x * 3.1) + Math.sin(t * 23.7 + l.z * 1.7); if (s > 1.6 - l.flick) k *= 0.08 + Math.random() * 0.3; else if (l.flick > 0.5 && Math.sin(t * 0.7 + l.z) > 0.92) k *= 0.05; }
    if (l.kind === 'siren') k *= Math.sin(t * 9) > 0 ? 1 : 0.05; if (l.kind === 'siren2') k *= Math.sin(t * 9) > 0 ? 0.05 : 1; if (l.dead) k = 0; return k; };
  E.updateLights = (t, dt, camPos) => {
    const W = E.world; if (!W) return; poolTimer -= dt;
    if (poolTimer <= 0) { poolTimer = 0.25; const cand = W.lamps.filter(l => E.lampOn(l) && !l.dead && visibleLv(l.lv)).map(l => ({ l, d: (l.x - camPos.x) ** 2 + (l.y - camPos.y) ** 2 * 3 + (l.z - camPos.z) ** 2 })).sort((a, b) => a.d - b.d); assigned = cand.slice(0, pool.length).map(c => c.l); }
    pool.forEach((L, i) => { const l = assigned[i]; if (!l) { L.intensity = 0; return; } const k = E.lampLevel(l, t); L.position.set(l.x, l.y - 0.25, l.z); L.color.setHex(l.color); L.distance = l.range; L.intensity = k * (l.kind === 'glow' ? 6 : l.kind === 'moon' ? 60 : l.kind.startsWith('siren') ? 60 : 32); });
    // instanced lamp colours (cheap: every frame for the visible levels)
    for (const [lv, im] of Object.entries(W.lampGroups)) { if (!W.groups[lv].visible) continue; let dirty = false; for (const l of W.lamps) { if (l.im !== im) continue; const k = E.lampLevel(l, t); tmpC.setHex(l.color).multiplyScalar(0.12 + k * 2.2); if (!E.lampOn(l)) tmpC.setHex(0x1a1a1a); im.setColorAt(l.inst, tmpC); dirty = true; } if (dirty) im.instanceColor.needsUpdate = true; }
    for (const s of W.signs) { if (!s.glow) continue; const on = s.kind === 'exit' ? 1 : E.power ? (s.flicker && Math.sin(t * (5 + s.flicker * 9) + s.phase) + Math.sin(t * 17 + s.phase * 2) > 1.7 - s.flicker ? 0.15 : 1) : (s.kind === 'store' && s.flicker > 0.5 && Math.sin(t * 3 + s.phase) > 0.97 ? 0.5 : 0.07); s.mat.color.setScalar(on * (s.kind === 'exit' ? 1.4 : 1.6)); }
    E.hemi.intensity += ((E.power ? 0.85 : 0.3) - E.hemi.intensity) * Math.min(1, dt * 0.8);
    if (E.rain) E.rain.update(dt);
  };
  const visibleLv = lv => E.world.groups[lv]?.visible;
  E.render = t => { if (post) { post.mat.uniforms.time.value = t; post.mat.uniforms.glitch.value = E.fx.glitch; post.mat.uniforms.staticAmt.value = E.fx.staticAmt; post.mat.uniforms.damage.value = E.fx.damage; post.mat.uniforms.intensity.value = E.fx.vhs; post.mat.uniforms.lowBatt.value = E.fx.lowBatt;
      renderer.setRenderTarget(rt); renderer.render(scene, camera); renderer.setRenderTarget(null); renderer.render(post.scene, post.cam); } else renderer.render(scene, camera); };
  E.dispose = () => { window.removeEventListener('resize', E.resize); renderer.dispose(); rt?.dispose(); };
  return E;
}
function makeRain(scene) {
  const N = 900, pos = new Float32Array(N * 6); const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const reset = i => { const x = -12 + Math.random() * 24, z = 32.3 + Math.random() * 7.6, y = Math.random() * 8; pos.set([x, y, z, x - 0.03, y - 0.5, z + 0.02], i * 6); };
  for (let i = 0; i < N; i++) reset(i);
  const m = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x8090a0, transparent: true, opacity: 0.35 })); m.frustumCulled = false; scene.add(m);
  m.update = dt => { for (let i = 0; i < N; i++) { pos[i * 6 + 1] -= dt * 14; pos[i * 6 + 4] -= dt * 14; if (pos[i * 6 + 4] < 0) reset(i); } g.attributes.position.needsUpdate = true; };
  return m;
}
