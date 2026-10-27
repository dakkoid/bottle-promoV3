// Interactive 3D model of the smart bottle, built procedurally from the poster's proportions.
// Units: 1 = 100 px of the 1024x1536 poster. The bottle stands on y = 0, its front faces +z.
import * as THREE from './three.module.min.js';
import { RoomEnvironment } from './RoomEnvironment.js';
import { EffectComposer } from './pp/EffectComposer.js';
import { RenderPass } from './pp/RenderPass.js';
import { UnrealBloomPass } from './pp/UnrealBloomPass.js';
import { OutputPass } from './pp/OutputPass.js';

const R = 1.13;                       // body radius
const TAU = Math.PI * 2;
const SEG = 160;                      // radial segments

// ------------------------------------------------------------------ helpers
function canvasTex(w, h, draw, { srgb = true } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// polyline [[r, y, filletRadius], ...] -> smooth lathe profile with rounded corners
function filleted(pts, steps = 10) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const [x, y, f = 0] = pts[i];
    if (!f || i === 0 || i === pts.length - 1) { out.push(new THREE.Vector2(x, y)); continue; }
    const p = new THREE.Vector2(x, y), a = new THREE.Vector2(pts[i - 1][0], pts[i - 1][1]), b = new THREE.Vector2(pts[i + 1][0], pts[i + 1][1]);
    const da = a.clone().sub(p).normalize(), db = b.clone().sub(p).normalize();
    const ang = Math.acos(THREE.MathUtils.clamp(da.dot(db), -1, 1));
    const t = Math.min(f / Math.tan(ang / 2), a.distanceTo(p) * .49, b.distanceTo(p) * .49);
    const p0 = p.clone().add(da.clone().multiplyScalar(t)), p1 = p.clone().add(db.clone().multiplyScalar(t));
    for (let k = 0; k <= steps; k++) {           // quadratic bezier through the corner
      const q = k / steps, u = 1 - q;
      out.push(new THREE.Vector2(u * u * p0.x + 2 * u * q * p.x + q * q * p1.x, u * u * p0.y + 2 * u * q * p.y + q * q * p1.y));
    }
  }
  return out;
}
const lathe = (pts, seg = SEG) => new THREE.LatheGeometry(filleted(pts), seg);

// closed rounded-rectangle loop lying on a cylinder of radius rad, centred at angle th, height y0..y1
function rimCurve(rad, th, arc, y0, y1, corner) {
  const w = rad * arc, h = y1 - y0, c = Math.min(corner, w / 2, h / 2), P = [];
  const push = (x, y) => { const a = th + x / rad; P.push(new THREE.Vector3(Math.sin(a) * rad, y, Math.cos(a) * rad)); };
  const n = 10, xs = -w / 2, ys = y0;
  const cornerArc = (cx, cy, a0) => { for (let k = 0; k <= n; k++) { const a = a0 + (k / n) * Math.PI / 2; push(cx + Math.cos(a) * c, cy + Math.sin(a) * c); } };
  cornerArc(xs + w - c, ys + c, -Math.PI / 2); cornerArc(xs + w - c, ys + h - c, 0);
  cornerArc(xs + c, ys + h - c, Math.PI / 2); cornerArc(xs + c, ys + c, Math.PI);
  return new THREE.CatmullRomCurve3(P, true, 'centripetal');
}

// ------------------------------------------------------------------ textures
function bodyTexture() {
  // powder-coated forest green with the engraved mountain mark on the front (u = 0.5 is the front)
  return canvasTex(2048, 1024, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#33433a'); grd.addColorStop(1, '#2c3a32');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    const cx = w * 0.515, cy = h * ((1030 - 585) / 520), s = 34;
    const pts = [[-2.2, .9], [-1.1, -.55], [-.55, .15], [.35, -1], [1.45, .5], [2.2, .9]];
    const path = () => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo : g.moveTo).call(g, cx + x * s, cy + y * s)); };
    g.lineJoin = 'miter';
    path(); g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 7; g.translate(0, 2.5); g.stroke(); g.setTransform(1, 0, 0, 1, 0, 0);
    path(); g.strokeStyle = 'rgba(6,10,8,.9)'; g.lineWidth = 6; g.stroke();
  });
}
function noiseNormal(size = 512, strength = 1.2, seed = 9) {
  // tangent-space normal map from value noise: the fine orange-peel of powder coat
  const r = rng(seed), hgt = new Float32Array(size * size);
  for (let i = 0; i < hgt.length; i++) hgt[i] = r();
  const blur = (src) => { const d = new Float32Array(src.length);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { let s = 0;
      for (let k = -2; k <= 2; k++) s += src[y * size + ((x + k + size) % size)] + src[((y + k + size) % size) * size + x];
      d[y * size + x] = s / 10; } return d; };
  const H = blur(blur(hgt));
  return canvasTex(size, size, (g) => {
    const img = g.createImageData(size, size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const dx = (H[y * size + (x + 1) % size] - H[y * size + (x - 1 + size) % size]) * strength * 8;
      const dy = (H[((y + 1) % size) * size + x] - H[((y - 1 + size) % size) * size + x]) * strength * 8;
      const l = Math.hypot(dx, dy, 1), i = (y * size + x) * 4;
      img.data[i] = (-dx / l * .5 + .5) * 255; img.data[i + 1] = (-dy / l * .5 + .5) * 255; img.data[i + 2] = (1 / l * .5 + .5) * 255; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, { srgb: false });
}
function meshMaps() {
  // perforated stainless sheet: colour + alpha (holes)
  const W = 2048, H = 300, step = 19, rad = 5.4;
  const holes = (g, fill) => { for (let y = 20; y < H - 12; y += step) for (let x = 9; x < W; x += step) { g.beginPath(); g.arc(x, y, rad, 0, TAU); fill(g, x, y); } };
  const map = canvasTex(W, H, (g) => {
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, '#9aa1a7'); grd.addColorStop(.5, '#d9dee2'); grd.addColorStop(1, '#8d949a');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    holes(g, (g) => { g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1.5; g.stroke(); });
  });
  const alpha = canvasTex(W, H, (g) => { g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.fillStyle = '#000'; holes(g, (g) => g.fill()); }, { srgb: false });
  map.wrapS = alpha.wrapS = THREE.RepeatWrapping;
  return { map, alpha };
}
function panelTexture() {
  return canvasTex(256, 1024, (g, w, h) => {
    g.fillStyle = '#0b1830'; g.fillRect(0, 0, w, h);
    const r = rng(3), cw = w / 3, ch = h / 12;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 12; j++) {
      const grd = g.createLinearGradient(i * cw, j * ch, (i + 1) * cw, (j + 1) * ch);
      grd.addColorStop(0, '#203c70'); grd.addColorStop(1, '#0f2044');
      g.fillStyle = grd; g.fillRect(i * cw + 3, j * ch + 3, cw - 6, ch - 6);
      g.strokeStyle = 'rgba(170,200,245,.22)'; g.lineWidth = 1;
      for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(i * cw + 3, j * ch + k * ch / 4); g.lineTo((i + 1) * cw - 3, j * ch + k * ch / 4); g.stroke(); }
      g.strokeStyle = 'rgba(200,215,240,.35)'; g.beginPath(); g.moveTo(i * cw + cw / 2, j * ch + 3); g.lineTo(i * cw + cw / 2, (j + 1) * ch - 3); g.stroke();
    }
    for (let k = 0; k < 900; k++) { g.fillStyle = `rgba(200,220,255,${r() * .10})`; g.fillRect(r() * w, r() * h, 1, 1); }
  });
}
function roundedAlpha(w, h, rad) {
  return canvasTex(w, h, (g) => { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; roundRect(g, 2, 2, w - 4, h - 4, rad); g.fill(); }, { srgb: false });
}
function bottomTexture() {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#20262a'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,.06)';
    for (let r = 40; r < 250; r += 6) { g.beginPath(); g.arc(w / 2, h / 2, r, 0, TAU); g.lineWidth = 1; g.stroke(); }
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
    if (key === this.last) return false; this.last = key;
    const g = this.g, w = this.c.width, h = this.c.height, cx = w / 2;
    const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#070b0e'); bg.addColorStop(1, '#030507');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.textBaseline = 'alphabetic'; g.textAlign = 'center';
    g.font = '600 104px Orbitron, Montserrat, sans-serif';
    const tw = g.measureText(String(s.temp)).width, x = cx - 14;
    g.shadowColor = s.col; g.shadowBlur = 22; g.fillStyle = s.col;
    g.fillText(String(s.temp), x, 236); g.shadowBlur = 0;
    g.font = '600 30px Orbitron, Montserrat, sans-serif'; g.textAlign = 'left';
    g.fillText('°', x + tw / 2 + 4, 170); g.fillText('C', x + tw / 2 + 6, 236);
    g.fillStyle = '#7fe3ff'; g.beginPath();
    const dy = 340, r = 24; g.moveTo(cx, dy - r * 1.4);
    g.bezierCurveTo(cx + r * .6, dy - r * .5, cx + r, dy, cx + r, dy + r * .3);
    g.arc(cx, dy + r * .3, r, 0, Math.PI); g.bezierCurveTo(cx - r, dy, cx - r * .6, dy - r * .5, cx, dy - r * 1.4); g.fill();
    const bw = 92, bh = 42, bx = cx - bw / 2 - 5, by = 432;
    g.strokeStyle = '#7fe3ff'; g.lineWidth = 5; roundRect(g, bx, by, bw, bh, 8); g.stroke();
    g.fillStyle = '#7fe3ff'; g.fillRect(bx + bw + 3, by + 13, 8, 16);
    for (let k = 0; k < 4; k++) { const on = k < s.bat || (k === s.bat && s.blink); g.globalAlpha = on ? 1 : .14; g.fillRect(bx + 10 + k * 19.5, by + 9, 14, bh - 18); }
    g.globalAlpha = 1;
    const sy = 580; g.strokeStyle = '#ffd23f'; g.lineWidth = 6; g.lineCap = 'round'; g.shadowColor = '#ffd23f'; g.shadowBlur = 14;
    g.beginPath(); g.arc(cx, sy, 18, 0, TAU); g.stroke();
    for (let a = 0; a < 8; a++) { const q = a * Math.PI / 4; g.beginPath(); g.moveTo(cx + Math.cos(q) * 30, sy + Math.sin(q) * 30); g.lineTo(cx + Math.cos(q) * 42, sy + Math.sin(q) * 42); g.stroke(); }
    g.shadowBlur = 0;
    this.tex.needsUpdate = true;
    return true;
  }
}

// ------------------------------------------------------------------ model
function buildBottle(display) {
  const grp = new THREE.Group();
  const add = (geo, mat, y = 0) => { const m = new THREE.Mesh(geo, mat); m.position.y = y; grp.add(m); return m; };
  const peel = noiseNormal(512, 1.1, 9); peel.wrapS = peel.wrapT = THREE.RepeatWrapping; peel.repeat.set(6, 6);
  const peelBody = peel.clone(); peelBody.needsUpdate = true; peelBody.repeat.set(8, 4);

  const coat = { roughness: .55, clearcoat: .3, clearcoatRoughness: .42, normalScale: new THREE.Vector2(.14, .14) };
  const green = new THREE.MeshPhysicalMaterial({ map: bodyTexture(), normalMap: peelBody, ...coat });
  const greenPlain = new THREE.MeshPhysicalMaterial({ color: '#2f3d34', normalMap: peel, ...coat });
  const dark = new THREE.MeshPhysicalMaterial({ color: '#1f2722', normalMap: peel, ...coat, roughness: .5 });
  const black = new THREE.MeshPhysicalMaterial({ color: '#121417', roughness: .38, clearcoat: .5, clearcoatRoughness: .28, normalMap: peel, normalScale: new THREE.Vector2(.15, .15) });
  const rubber = new THREE.MeshPhysicalMaterial({ color: '#0d0f11', roughness: .75 });
  const steel = new THREE.MeshStandardMaterial({ color: '#dfe3e6', metalness: 1, roughness: .22 });
  const glow = new THREE.MeshStandardMaterial({ color: '#0b2a33', emissive: '#53dcff', emissiveIntensity: 2.0, roughness: .25 });
  const glass = new THREE.MeshPhysicalMaterial({ color: '#dff3f8', roughness: .04, metalness: 0, clearcoat: 1, clearcoatRoughness: .02, transparent: true, opacity: .16, depthWrite: false, envMapIntensity: 1.6, side: THREE.DoubleSide });

  // base cup: rounded bottom edge, recessed underside with a stand ring
  add(lathe([[0, .045], [.78, .045, .03], [.84, 0, .04], [1.0, 0, .08], [1.105, .1, .1], [1.11, .5, .03], [1.098, .545]]), dark);
  const under = new THREE.Mesh(new THREE.CircleGeometry(.79, 96), new THREE.MeshPhysicalMaterial({ map: bottomTexture(), roughness: .6, side: THREE.DoubleSide }));
  under.rotation.x = Math.PI / 2; under.position.y = .047; grp.add(under);
  // seam groove between base and body
  add(lathe([[1.098, .545], [1.07, .56, .01], [1.07, .585, .01], [R, .6]]), rubber);
  // body: straight cylinder (uniform UVs for the logo) + steel ring + shoulder
  add(new THREE.CylinderGeometry(R, R, 5.15, SEG, 1, true, -Math.PI, TAU), green, .6 + 5.15 / 2);
  add(new THREE.TorusGeometry(R + .002, .02, 16, SEG).rotateX(Math.PI / 2), steel, 5.77);
  add(lathe([[R, 5.75], [R, 6.0], [1.12, 6.1, .06], [1.075, 6.2, .05], [1.072, 6.25]]), greenPlain);
  // glowing ring with soft rounded edges
  add(lathe([[1.06, 6.245], [1.076, 6.26, .015], [1.076, 6.4, .015], [1.06, 6.415]]), glow);
  // filter window: dark core, perforated steel sleeve, thick clear wall, black gaskets
  const mm = meshMaps();
  add(new THREE.CylinderGeometry(.8, .8, .8, 96, 1, false), new THREE.MeshStandardMaterial({ color: '#07090a', roughness: 1 }), 6.84);
  add(new THREE.CylinderGeometry(.86, .86, .78, SEG, 1, true), new THREE.MeshStandardMaterial({ map: mm.map, alphaMap: mm.alpha, alphaTest: .5,
    metalness: .9, roughness: .3, side: THREE.DoubleSide }), 6.84);
  add(lathe([[.82, 6.43], [1.05, 6.43, .02], [1.05, 6.47, .02], [.82, 6.47]]), black);
  add(lathe([[.82, 7.22], [1.05, 7.22, .02], [1.05, 7.27, .02], [.82, 7.27]]), black);
  add(lathe([[1.0, 6.46], [1.058, 6.46, .02], [1.058, 7.24, .02], [1.0, 7.24], [1.0, 6.46]]), glass);
  // cap: smooth lid with a seam and generous fillets
  add(lathe([[1.0, 7.26], [1.088, 7.28, .03], [1.09, 7.55, .01], [1.072, 7.58, .008], [1.09, 7.61, .01],
             [1.09, 7.9, .05], [1.03, 8.03, .08], [.45, 8.05, .02], [0, 8.05]]), black);
  // central boss
  add(lathe([[.46, 8.0], [.44, 8.06, .03], [.42, 8.2, .05], [.34, 8.27, .05], [0, 8.28]], 96), black);
  // flat carry handle swept along a curve with a rounded-rectangle section
  const hp = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-.12, 8.1, 0), new THREE.Vector3(.0, 8.48, 0), new THREE.Vector3(.4, 8.72, 0),
    new THREE.Vector3(.95, 8.68, 0), new THREE.Vector3(1.3, 8.35, 0), new THREE.Vector3(1.36, 7.95, 0), new THREE.Vector3(1.18, 7.66, 0)], false, 'centripetal');
  const sec = new THREE.Shape(); { const w = .2, t = .085, r = .07;
    sec.moveTo(-t + r, -w); sec.lineTo(t - r, -w); sec.quadraticCurveTo(t, -w, t, -w + r); sec.lineTo(t, w - r); sec.quadraticCurveTo(t, w, t - r, w);
    sec.lineTo(-t + r, w); sec.quadraticCurveTo(-t, w, -t, w - r); sec.lineTo(-t, -w + r); sec.quadraticCurveTo(-t, -w, -t + r, -w); }
  const hg = new THREE.ExtrudeGeometry(sec, { steps: 160, extrudePath: hp, bevelEnabled: false, curveSegments: 6 });
  hg.computeVertexNormals();
  const hgrp = new THREE.Group(); hgrp.rotation.y = -.75; grp.add(hgrp);
  hgrp.add(new THREE.Mesh(hg, black));
  const lug = new THREE.Mesh(new THREE.CapsuleGeometry(.11, .26, 8, 24), black); lug.position.set(1.12, 7.68, 0); hgrp.add(lug);
  const lug2 = new THREE.Mesh(new THREE.CapsuleGeometry(.06, .22, 8, 16), black); lug2.position.set(-1.105, 7.48, 0); hgrp.add(lug2);

  // front display: dark bezel plate, raised rim, glossy screen
  const dTheta = -0.17, dArc = 1.02, dY0 = (1160 - 893) / 100, dY1 = (1160 - 652) / 100, dMid = (dY0 + dY1) / 2;
  add(new THREE.CylinderGeometry(R + .006, R + .006, dY1 - dY0 + .12, 64, 1, true, dTheta - dArc / 2 - .055, dArc + .11),
      new THREE.MeshPhysicalMaterial({ color: '#141b21', roughness: .32, clearcoat: .6, alphaMap: roundedAlpha(256, 512, 50), alphaTest: .5 }), dMid);
  grp.add(new THREE.Mesh(new THREE.TubeGeometry(rimCurve(R + .012, dTheta, dArc + .1, dY0 - .055, dY1 + .055, .2), 220, .018, 10, true),
      new THREE.MeshStandardMaterial({ color: '#2a353d', metalness: .6, roughness: .35 })));
  const screenMat = new THREE.MeshPhysicalMaterial({ color: '#000000', emissive: '#ffffff', emissiveMap: display.tex, emissiveIntensity: 1.3,
    roughness: .06, clearcoat: 1, clearcoatRoughness: .03, alphaMap: roundedAlpha(256, 532, 40), alphaTest: .5 });
  add(new THREE.CylinderGeometry(R + .018, R + .018, dY1 - dY0, 96, 1, true, dTheta - dArc / 2, dArc), screenMat, dMid);
  // solar strip on the right side
  const pTheta = 0.9, pArc = .42, pY0 = (1160 - 1058) / 100, pY1 = (1160 - 648) / 100, pMid = (pY0 + pY1) / 2;
  add(new THREE.CylinderGeometry(R + .006, R + .006, pY1 - pY0 + .1, 48, 1, true, pTheta - pArc / 2 - .05, pArc + .1),
      new THREE.MeshPhysicalMaterial({ color: '#141b21', roughness: .35, alphaMap: roundedAlpha(128, 512, 56), alphaTest: .5 }), pMid);
  grp.add(new THREE.Mesh(new THREE.TubeGeometry(rimCurve(R + .012, pTheta, pArc + .08, pY0 - .045, pY1 + .045, .2), 200, .016, 10, true),
      new THREE.MeshStandardMaterial({ color: '#2a353d', metalness: .6, roughness: .35 })));
  add(new THREE.CylinderGeometry(R + .016, R + .016, pY1 - pY0, 48, 1, true, pTheta - pArc / 2, pArc), new THREE.MeshPhysicalMaterial({
    map: panelTexture(), roughness: .12, metalness: .3, clearcoat: 1, clearcoatRoughness: .05, alphaMap: roundedAlpha(128, 512, 50), alphaTest: .5 }), pMid);

  grp.position.y = -4.25;              // pivot at the bottle's middle so it tumbles around its centre
  const pivot = new THREE.Group(); pivot.add(grp);
  return pivot;
}

// ------------------------------------------------------------------ free rotation (arcball-like, with inertia)
function makeSpinner(obj, el, { reduce }) {
  const q = new THREE.Quaternion(), vel = new THREE.Vector2(), upright = new THREE.Quaternion();
  let dragging = false, last = null, idle = 0, spin = 0;
  const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0);
  const rotate = (dx, dy) => {
    q.setFromAxisAngle(Y, dx); obj.quaternion.premultiply(q);
    q.setFromAxisAngle(X, dy); obj.quaternion.premultiply(q);
  };
  el.addEventListener('pointerdown', (e) => { dragging = true; last = [e.clientX, e.clientY]; vel.set(0, 0); el.setPointerCapture(e.pointerId); el.dispatchEvent(new Event('touched', { bubbles: true })); });
  el.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const s = 4.2 / Math.max(el.clientWidth, 1);
    const dx = (e.clientX - last[0]) * s, dy = (e.clientY - last[1]) * s;
    last = [e.clientX, e.clientY]; rotate(dx, dy); vel.set(dx, dy); idle = 0;
  });
  const end = () => { dragging = false; };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end); el.addEventListener('lostpointercapture', end);
  // keyboard: arrows rotate, Home resets
  el.addEventListener('keydown', (e) => {
    const k = { ArrowLeft: [-.15, 0], ArrowRight: [.15, 0], ArrowUp: [0, -.15], ArrowDown: [0, .15] }[e.key];
    if (k) { rotate(k[0], k[1]); idle = 0; e.preventDefault(); }
    if (e.key === 'Home') { obj.quaternion.identity(); e.preventDefault(); }
  });
  return function step(dt) {
    if (!dragging) {
      if (vel.lengthSq() > 1e-7) { rotate(vel.x, vel.y); vel.multiplyScalar(Math.pow(.05, dt)); }
      idle += dt;
      if (idle > 2.5 && !reduce) {
        // ease back to upright (keep the current heading), then spin slowly around the vertical axis
        const e = new THREE.Euler().setFromQuaternion(obj.quaternion, 'YXZ');
        upright.setFromEuler(new THREE.Euler(0, e.y, 0, 'YXZ'));
        obj.quaternion.slerp(upright, 1 - Math.pow(.25, dt));
        spin = Math.min(spin + dt * .2, .35);
        q.setFromAxisAngle(Y, spin * dt); obj.quaternion.premultiply(q);
      } else spin = 0;
    }
  };
}

// ------------------------------------------------------------------ viewer
export async function mountBottle(host) {
  const canvas = host.querySelector('canvas');
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' }); }
  catch (e) { host.classList.add('no-webgl'); return null; }
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  scene.background = canvasTex(512, 640, (g, w, h) => {
    const r = g.createRadialGradient(w / 2, h * .32, 10, w / 2, h * .4, h * .8);
    r.addColorStop(0, '#1b2b34'); r.addColorStop(.55, '#0f181e'); r.addColorStop(1, '#0a1015');
    g.fillStyle = r; g.fillRect(0, 0, w, h);
  });
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture;
  scene.environmentIntensity = .8;
  const key = new THREE.DirectionalLight('#fff1d6', 2.6); key.position.set(6, 8, 7); scene.add(key);
  const fill = new THREE.DirectionalLight('#cfe6ff', .5); fill.position.set(-6, 2, 6); scene.add(fill);
  const rimC = new THREE.DirectionalLight('#7fe3ff', 1.1); rimC.position.set(-7, 4, -6); scene.add(rimC);
  const rimW = new THREE.DirectionalLight('#ffb36b', 1.1); rimW.position.set(7, 2, -7); scene.add(rimW);

  try { await document.fonts.load('600 40px Orbitron'); } catch (e) { /* fallback fonts */ }
  const display = new Display(); display.draw(0);
  const bottle = buildBottle(display); scene.add(bottle);

  const camera = new THREE.PerspectiveCamera(28, 1, .1, 100);
  camera.position.set(0, 1.4, 21); camera.lookAt(0, 0, 0);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), .32, .35, .92);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  canvas.tabIndex = 0;
  canvas.style.touchAction = 'none';
  const step = makeSpinner(bottle, canvas, { reduce });
  host.addEventListener('touched', () => host.classList.add('touched'));
  if (!reduce) bottle.rotation.y = -.5;

  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    renderer.setSize(w, h, false); composer.setPixelRatio(dpr); composer.setSize(w, h);
    camera.aspect = w / h;
    camera.position.z = 21 * Math.max(1, .8 / camera.aspect);   // keep the whole bottle in frame
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(host); resize();

  let visible = true, prev = performance.now(), t = 0;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(host);
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - prev) / 1000, .05); prev = now;
    if (!visible || document.hidden) return;
    t += dt; display.draw(t); if (!api.frozen) step(dt);
    composer.render();
  }
  const api = { scene, camera, renderer, bottle, display, frozen: false,
    setPose(yaw, pitch = 0) { this.frozen = true; bottle.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ')); composer.render(); } };
  requestAnimationFrame(frame);
  host.classList.add('ready');
  return api;
}
