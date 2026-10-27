// Interactive 3D model of the smart bottle, built procedurally from the poster's proportions.
// Units: 1 = 100 px of the 1024x1536 poster. The bottle stands on y = 0, its front faces +z.
import * as THREE from './three.module.min.js';
import { OrbitControls } from './OrbitControls.js';
import { RoomEnvironment } from './RoomEnvironment.js';

const R = 1.13;                       // body radius
const TAU = Math.PI * 2;

function canvasTex(w, h, draw, { srgb = true, repeatX = 1 } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeatX !== 1) { t.wrapS = THREE.RepeatWrapping; t.repeat.x = repeatX; }
  return t;
}
function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// ------------------------------------------------------------------ textures
function bodyTexture() {
  // powder-coated olive green with the engraved mountain mark on the front (u = 0.5 is the front)
  return canvasTex(2048, 1024, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#33433a'); grd.addColorStop(1, '#2c3a32');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    const r = rng(7);
    for (let i = 0; i < 60000; i++) {               // fine powder-coat speckle
      const a = r() * 0.06; g.fillStyle = r() < .5 ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a * .6})`;
      g.fillRect(r() * w, r() * h, 1.5, 1.5);
    }
    // mountain mark: poster y ~1030 on a body that spans y 585..1105  -> v from top = (1030-585)/520
    const cx = w * 0.515, cy = h * ((1030 - 585) / 520), s = 34;
    const pts = [[-2.2, .9], [-1.1, -.55], [-.55, .15], [.35, -1], [1.45, .5], [2.2, .9]];
    const path = () => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo : g.moveTo).call(g, cx + x * s, cy + y * s)); };
    g.lineJoin = 'miter'; g.lineCap = 'butt';
    path(); g.strokeStyle = 'rgba(255,255,255,.10)'; g.lineWidth = 7; g.translate(0, 2); g.stroke(); g.setTransform(1, 0, 0, 1, 0, 0);
    path(); g.strokeStyle = 'rgba(8,12,10,.85)'; g.lineWidth = 6; g.stroke();
  });
}
function knurlTexture() {
  return canvasTex(1024, 64, (g, w, h) => {
    g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 8) { g.fillStyle = '#ffffff'; g.fillRect(x, 0, 3, h); g.fillStyle = '#202020'; g.fillRect(x + 4, 0, 2, h); }
  }, { srgb: false });
}
function meshTexture() {
  // perforated stainless filter mesh
  return canvasTex(2048, 300, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#9aa1a7'); grd.addColorStop(.5, '#d7dce0'); grd.addColorStop(1, '#8d949a');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1b1f22';
    for (let y = 20; y < h - 12; y += 19)
      for (let x = 9; x < w; x += 19) { g.beginPath(); g.arc(x, y, 5.2, 0, TAU); g.fill(); }
  });
}
function panelTexture() {
  return canvasTex(256, 1024, (g, w, h) => {
    g.fillStyle = '#0d1b33'; g.fillRect(0, 0, w, h);
    const r = rng(3), cw = w / 3, ch = h / 12;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 12; j++) {
      const grd = g.createLinearGradient(i * cw, j * ch, (i + 1) * cw, (j + 1) * ch);
      grd.addColorStop(0, '#1d3766'); grd.addColorStop(1, '#10213f');
      g.fillStyle = grd; g.fillRect(i * cw + 3, j * ch + 3, cw - 6, ch - 6);
      g.strokeStyle = 'rgba(160,190,240,.18)'; g.lineWidth = 1;
      for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(i * cw + 3, j * ch + k * ch / 4); g.lineTo((i + 1) * cw - 3, j * ch + k * ch / 4); g.stroke(); }
    }
    for (let k = 0; k < 900; k++) { g.fillStyle = `rgba(200,220,255,${r() * .10})`; g.fillRect(r() * w, r() * h, 1, 1); }
  });
}
function roundedAlpha(w, h, rad) {
  return canvasTex(w, h, (g) => { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; roundRect(g, 2, 2, w - 4, h - 4, rad); g.fill(); }, { srgb: false });
}
function shadowTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grd.addColorStop(0, 'rgba(0,0,0,.75)'); grd.addColorStop(.45, 'rgba(0,0,0,.35)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  });
}

// ------------------------------------------------------------------ live display
class Display {
  constructor() {
    this.c = document.createElement('canvas'); this.c.width = 320; this.c.height = 664;
    this.g = this.c.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.c); this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.anisotropy = 8;
    this.last = '';
  }
  state(t) {                     // 14 s loop: 22 -> 4 (cool) -> 55 (heat) -> 22, battery charging
    const p = t % 14, e = (a, b, x) => { x = Math.min(Math.max((x - a) / (b - a), 0), 1); return x * x * (3 - 2 * x); };
    let temp = 22, col = '#ffffff';
    if (p < 4) { temp = 22 - 18 * e(.6, 2.6, p); col = p > .6 ? '#7fe3ff' : '#ffffff'; }
    else if (p < 8.5) { temp = 4 + 51 * e(4.6, 6.6, p); col = p > 4.6 ? '#ffa24a' : '#7fe3ff'; }
    else { temp = 55 - 33 * e(8.8, 10.8, p); col = p > 10.8 ? '#ffffff' : '#ffa24a'; }
    const bat = Math.min(4, 2 + Math.floor(e(10.5, 13.2, p) * 2.999)), blink = p > 10.5 && p < 13.2 && (Math.floor(t * 3) % 2 === 0);
    return { temp: Math.round(temp), col, bat, blink };
  }
  draw(t) {
    const s = this.state(t), key = `${s.temp}|${s.col}|${s.bat}|${s.blink}`;
    if (key === this.last) return; this.last = key;
    const g = this.g, w = this.c.width, h = this.c.height, cx = w / 2;
    g.fillStyle = '#05080b'; g.fillRect(0, 0, w, h);
    // temperature
    g.textBaseline = 'alphabetic'; g.textAlign = 'center';
    g.font = '600 104px Orbitron, Montserrat, sans-serif';
    const tw = g.measureText(String(s.temp)).width;
    const x = cx - 14;
    g.shadowColor = s.col; g.shadowBlur = 22; g.fillStyle = s.col;
    g.fillText(String(s.temp), x, 236);
    g.shadowBlur = 0;
    g.font = '600 30px Orbitron, Montserrat, sans-serif'; g.textAlign = 'left';
    g.fillText('°', x + tw / 2 + 4, 170); g.fillText('C', x + tw / 2 + 6, 236);
    // drop
    g.fillStyle = '#7fe3ff'; g.beginPath();
    const dy = 340, r = 24; g.moveTo(cx, dy - r * 1.4);
    g.bezierCurveTo(cx + r * .6, dy - r * .5, cx + r, dy, cx + r, dy + r * .3);
    g.arc(cx, dy + r * .3, r, 0, Math.PI); g.bezierCurveTo(cx - r, dy, cx - r * .6, dy - r * .5, cx, dy - r * 1.4); g.fill();
    // battery
    const bw = 92, bh = 42, bx = cx - bw / 2 - 5, by = 432;
    g.strokeStyle = '#7fe3ff'; g.lineWidth = 5; roundRect(g, bx, by, bw, bh, 8); g.stroke();
    g.fillStyle = '#7fe3ff'; g.fillRect(bx + bw + 3, by + 13, 8, 16);
    for (let k = 0; k < 4; k++) {
      const on = k < s.bat || (k === s.bat && s.blink);
      g.globalAlpha = on ? 1 : .14; g.fillRect(bx + 10 + k * 19.5, by + 9, 14, bh - 18);
    }
    g.globalAlpha = 1;
    // sun
    const sy = 580; g.strokeStyle = '#ffd23f'; g.lineWidth = 6; g.lineCap = 'round';
    g.shadowColor = '#ffd23f'; g.shadowBlur = 14;
    g.beginPath(); g.arc(cx, sy, 18, 0, TAU); g.stroke();
    for (let a = 0; a < 8; a++) { const q = a * Math.PI / 4; g.beginPath(); g.moveTo(cx + Math.cos(q) * 30, sy + Math.sin(q) * 30); g.lineTo(cx + Math.cos(q) * 42, sy + Math.sin(q) * 42); g.stroke(); }
    g.shadowBlur = 0;
    this.tex.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ model
function buildBottle(display) {
  const grp = new THREE.Group();
  const seg = 128;
  const add = (geo, mat, y = 0) => { const m = new THREE.Mesh(geo, mat); m.position.y = y; m.castShadow = m.receiveShadow = false; grp.add(m); return m; };

  const green = new THREE.MeshPhysicalMaterial({ map: bodyTexture(), roughness: .58, metalness: 0, clearcoat: .25, clearcoatRoughness: .45 });
  const greenPlain = new THREE.MeshPhysicalMaterial({ color: '#2f3d34', roughness: .58, clearcoat: .25, clearcoatRoughness: .45 });
  const dark = new THREE.MeshPhysicalMaterial({ color: '#232b26', roughness: .5, clearcoat: .2 });
  const black = new THREE.MeshPhysicalMaterial({ color: '#141618', roughness: .42, clearcoat: .3, clearcoatRoughness: .35 });
  const knurl = knurlTexture(); knurl.wrapS = THREE.RepeatWrapping; knurl.repeat.x = 1;
  const blackKnurl = new THREE.MeshPhysicalMaterial({ color: '#16181a', roughness: .5, bumpMap: knurl, bumpScale: 2.2 });
  const steel = new THREE.MeshStandardMaterial({ color: '#d5dade', metalness: 1, roughness: .28 });
  const glow = new THREE.MeshStandardMaterial({ color: '#0b2a33', emissive: '#4fdcff', emissiveIntensity: 2.2, roughness: .3 });
  const glass = new THREE.MeshPhysicalMaterial({ color: '#ffffff', metalness: 0, roughness: .04, transmission: 1, thickness: .08, ior: 1.45, transparent: true, opacity: 1, envMapIntensity: 1.2, side: THREE.DoubleSide });

  // base: darker cup with rounded bottom edge (lathe profile, radius vs height)
  const baseProfile = [[0, 0], [0.98, 0], [1.06, .03], [1.10, .10], [1.11, .20], [1.11, .52], [1.095, .55]].map(([r, y]) => new THREE.Vector2(r, y));
  add(new THREE.LatheGeometry(baseProfile, seg), dark);
  add(new THREE.CylinderGeometry(1.09, 1.09, .03, seg, 1, true), new THREE.MeshStandardMaterial({ color: '#0d100e', roughness: .8 }), .565);
  // main body 0.58 .. 5.75 (uniform UVs for the logo)
  const bodyGeo = new THREE.CylinderGeometry(R, R, 5.17, seg, 1, true, -Math.PI, TAU);
  add(bodyGeo, green, .58 + 5.17 / 2);
  add(new THREE.CylinderGeometry(R, R, .0, seg), greenPlain, .58);
  // thin steel ring under the shoulder
  add(new THREE.TorusGeometry(R + .004, .022, 12, seg).rotateX(Math.PI / 2), steel, 5.77);
  // shoulder
  const sh = [[R, 5.79], [R, 6.02], [1.115, 6.12], [1.09, 6.2], [1.075, 6.25]].map(([r, y]) => new THREE.Vector2(r, y));
  add(new THREE.LatheGeometry(sh, seg), greenPlain);
  // glowing teal ring
  add(new THREE.CylinderGeometry(1.072, 1.072, .16, seg, 1, false), glow, 6.33);
  // filter window: steel mesh behind a clear glass wall
  const mt = meshTexture(); mt.wrapS = THREE.RepeatWrapping; mt.repeat.x = 1;
  add(new THREE.CylinderGeometry(.86, .86, .78, seg, 1, true), new THREE.MeshStandardMaterial({ map: mt, metalness: .85, roughness: .38 }), 6.84);
  add(new THREE.CylinderGeometry(.84, .84, .78, seg, 1, false), new THREE.MeshStandardMaterial({ color: '#0c0f11', roughness: .9 }), 6.84);
  add(new THREE.CylinderGeometry(1.0, 1.0, .06, seg), black, 6.44);
  add(new THREE.CylinderGeometry(1.0, 1.0, .06, seg), black, 7.25);
  add(new THREE.CylinderGeometry(1.055, 1.055, .86, seg, 1, true), glass, 6.85);
  // cap: smooth black lid with a seam, as on the poster
  const capP = [[1.0, 7.27], [1.07, 7.3], [1.085, 7.36], [1.085, 7.56], [1.07, 7.585], [1.085, 7.61], [1.085, 7.9],
                [1.07, 7.97], [1.02, 8.02], [.4, 8.05], [0, 8.05]].map(([r, y]) => new THREE.Vector2(r, y));
  add(new THREE.LatheGeometry(capP, seg), black);
  // central boss the handle grows out of
  const boss = [[.42, 8.0], [.42, 8.22], [.38, 8.27], [0, 8.28]].map(([r, y]) => new THREE.Vector2(r, y));
  add(new THREE.LatheGeometry(boss, 64), black);
  // flat carry handle: rises from the boss, arches over and loops down past the right edge of the lid
  const hp = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-.15, 8.18, 0), new THREE.Vector3(.05, 8.55, 0), new THREE.Vector3(.55, 8.72, 0),
    new THREE.Vector3(1.08, 8.6, 0), new THREE.Vector3(1.32, 8.2, 0), new THREE.Vector3(1.3, 7.78, 0), new THREE.Vector3(1.12, 7.62, 0)]);
  const handle = new THREE.Mesh(new THREE.TubeGeometry(hp, 96, .15, 24, false), black);
  handle.scale.z = 2.0;                       // flatten the round tube into a wide band
  grp.add(handle);
  const lug = new THREE.Mesh(new THREE.BoxGeometry(.16, .36, .58), black); lug.position.set(1.1, 7.66, 0); grp.add(lug);
  // small hinge lug on the left side of the cap
  const lug2 = new THREE.Mesh(new THREE.BoxGeometry(.1, .3, .34), black); lug2.position.set(-1.1, 7.5, 0); grp.add(lug2);

  // front display (curved panel) with bezel; centre slightly left of the front, as on the poster
  const dTheta = -0.17, dArc = 1.02, dY0 = (1160 - 893) / 100, dY1 = (1160 - 652) / 100;
  const bez = new THREE.CylinderGeometry(R + .012, R + .012, dY1 - dY0 + .1, 48, 1, true, dTheta - dArc / 2 - .045, dArc + .09);
  add(bez, new THREE.MeshPhysicalMaterial({ color: '#1b252d', roughness: .35, alphaMap: roundedAlpha(256, 512, 46), alphaTest: .5 }), (dY0 + dY1) / 2);
  const scr = new THREE.CylinderGeometry(R + .02, R + .02, dY1 - dY0, 64, 1, true, dTheta - dArc / 2, dArc);
  const screenMat = new THREE.MeshPhysicalMaterial({ color: '#000000', emissive: '#ffffff', emissiveMap: display.tex, emissiveIntensity: 1.25,
    roughness: .08, clearcoat: 1, clearcoatRoughness: .05, alphaMap: roundedAlpha(256, 532, 40), alphaTest: .5 });
  add(scr, screenMat, (dY0 + dY1) / 2);
  // solar strip on the right side
  const pTheta = 0.9, pArc = .42, pY0 = (1160 - 1058) / 100, pY1 = (1160 - 648) / 100;
  const pb = new THREE.CylinderGeometry(R + .01, R + .01, pY1 - pY0 + .08, 32, 1, true, pTheta - pArc / 2 - .04, pArc + .08);
  add(pb, new THREE.MeshPhysicalMaterial({ color: '#1a2128', roughness: .4, alphaMap: roundedAlpha(128, 512, 52), alphaTest: .5 }), (pY0 + pY1) / 2);
  const pn = new THREE.CylinderGeometry(R + .018, R + .018, pY1 - pY0, 32, 1, true, pTheta - pArc / 2, pArc);
  add(pn, new THREE.MeshPhysicalMaterial({ map: panelTexture(), roughness: .18, metalness: .35, clearcoat: 1, clearcoatRoughness: .08,
    alphaMap: roundedAlpha(128, 512, 48), alphaTest: .5 }), (pY0 + pY1) / 2);
  return grp;
}

// ------------------------------------------------------------------ viewer
export async function mountBottle(host) {
  const canvas = host.querySelector('canvas');
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' }); }
  catch (e) { host.classList.add('no-webgl'); return null; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture;
  scene.environmentIntensity = .75;

  const sun = new THREE.DirectionalLight('#fff1d6', 2.4); sun.position.set(6, 9, 6); scene.add(sun);
  const rimC = new THREE.DirectionalLight('#7fe3ff', 1.6); rimC.position.set(-7, 4, -5); scene.add(rimC);
  const rimW = new THREE.DirectionalLight('#ffb36b', .9); rimW.position.set(7, 3, -6); scene.add(rimW);

  try { await document.fonts.load('600 40px Orbitron'); } catch (e) { /* canvas falls back to Montserrat */ }
  const display = new Display(); display.draw(0);
  const bottle = buildBottle(display); scene.add(bottle);

  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 4.4), new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = .002; scene.add(shadow);

  const camera = new THREE.PerspectiveCamera(28, 1, .1, 100);
  camera.position.set(0, 7.6, 21.5);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 4.55, 0);
  controls.enableZoom = false; controls.enablePan = false; controls.enableDamping = true; controls.dampingFactor = .08;
  controls.rotateSpeed = .8;
  controls.minPolarAngle = controls.maxPolarAngle = Math.atan2(21.5, 7.6 - 4.55);   // spin around the vertical axis only
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  controls.autoRotate = !reduce; controls.autoRotateSpeed = 1.6;
  controls.update();
  canvas.style.touchAction = 'pan-y';        // vertical swipes still scroll the page on phones
  let idleTimer;
  controls.addEventListener('start', () => { controls.autoRotate = false; clearTimeout(idleTimer); host.classList.add('touched'); });
  controls.addEventListener('end', () => { clearTimeout(idleTimer); if (!reduce) idleTimer = setTimeout(() => (controls.autoRotate = true), 3500); });

  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(host); resize();

  let visible = true, t0 = performance.now();
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(host);
  const clock = { t: 0 };
  function frame(now) {
    requestAnimationFrame(frame);
    if (!visible) return;
    clock.t = (now - t0) / 1000;
    display.draw(clock.t);
    controls.update();
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
  host.classList.add('ready');
  return { scene, camera, controls, renderer, bottle, display, setAngle(a) { controls.autoRotate = false; const r = Math.hypot(camera.position.x, camera.position.z);
    camera.position.x = Math.sin(a) * r; camera.position.z = Math.cos(a) * r; controls.update(); renderer.render(scene, camera); } };
}
