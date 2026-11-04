/**
 * The Phong pass's number, on its own (Steve, 2026-11-03: as for cos theta,
 * a slide where we look at the reflection direction and compare it to the eye
 * direction; he used to do this in his hand-drawn slides). The companion of
 * cos-theta, same layout.
 *
 * A surface edge-on, a point on it, its unit normal n, the sun's direction l.
 * The sun's direction mirrored about the normal is R = 2 (n . l) n - l: where a
 * mirror would send the sunlight. The eye looks at the point along v (from
 * the point to the eye). The highlight is bright when the eye sits where the
 * mirror would send the light: R . v = cos alpha, alpha the angle between R
 * and v, raised to the power SHININESS (30, as the rasterize slides), which
 * keeps it near 1 only in a narrow cone around R. The readout gives both
 * numbers, and the swatch the grey the Phong pass paints, max(0, R . v)^30
 * (0 too when the sun is behind the surface).
 *
 * The eye sweeps slowly back and forth through R, a pure function of t;
 * dragging the eye or the sun, or the `eye` / `sun` sliders (degrees from the
 * normal), stops the sweep.
 */

import * as THREE from 'three';
import { createStage, createUI, C, flat } from '@';
import { polyline, setPolyline } from '@/lines';
import { label, setText } from '@/text';

const ORTHO_H = 3;
const stage = createStage({ camera: 'ortho', position: [0, 0, 10], target: [0, 0, 0], orthoHeight: ORTHO_H, lights: false, controls: false });
stage.duration = 16;
const ui = createUI(stage);

// --- Figure spec -----------------------------------------------------------
const P = new THREE.Vector2(-2.0, -1.45); // the point on the surface
const SURFACE = [-4.6, 0.6];
const L = 1.95; // n, l, R and v, drawn at this length (all unit vectors)
const AWAY = 2.75; // the sun's and the eye's distance from the point
const ARC = 0.85; // the angle between R and v
const SHININESS = 30;
const SWEEP = { mid: 35, reach: 50 }; // the eye's sweep, degrees from the normal
const READ = { x: 2.25, y: 1.15 };
const SWATCH = { x: 3.65, y: -1.25, size: 1.1 };

const params = { sun: -35, eye: 20, sweep: true };
/** Stop the sweep, the eye staying where it is (unless it is the eye being moved). */
function stop(keepEye: boolean): void {
  if (params.sweep && keepEye) params.eye = Math.round(eyeAngle(stage.t));
  params.sweep = false;
  ui.params.controllers.forEach((c) => c.updateDisplay());
}
ui.params.add(params, 'sun', -100, 100, 1).onChange(() => stop(true));
ui.params.add(params, 'eye', -100, 100, 1).onChange(() => stop(false));
ui.params.add(params, 'sweep');

// --- Pieces ----------------------------------------------------------------
const v3 = (p: THREE.Vector2, z = 0): [number, number, number] => [p.x, p.y, z];
const at = (deg: number, r: number) => {
  const a = (deg * Math.PI) / 180;
  return P.clone().add(new THREE.Vector2(r * Math.sin(a), r * Math.cos(a)));
};
function arrowHead(color: number): THREE.Mesh {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -0.24, 0.1, 0, -0.24, -0.1, 0], 3));
  return new THREE.Mesh(g, flat(color));
}
function arrow(color: number, opts: { dashed?: boolean } = {}) {
  const line = polyline([[0, 0, 0], [0, 1, 0]], { color, width: 4.5, ...(opts.dashed ? { dashed: true, dashSize: 0.12, gapSize: 0.08 } : {}) });
  const head = arrowHead(color);
  stage.add(line, head);
  /** Point it `deg` from the normal; `shown` false hides it. */
  return (deg: number, z = 0.2, shown = true) => {
    const tip = at(deg, L);
    setPolyline(line, [v3(P, z), v3(at(deg, L - 0.2), z)]);
    head.position.set(tip.x, tip.y, z + 0.1);
    head.rotation.z = Math.atan2(tip.y - P.y, tip.x - P.x);
    line.visible = head.visible = shown;
  };
}
/** A name beside a unit vector's tip: clockwise of it (side 1) or anticlockwise (-1); by default away from the normal. */
function nameAt(t: THREE.Object3D, deg: number, side = Math.sign(Math.sin((deg * Math.PI) / 180)) || 1, r = 0.3) {
  const tip = at(deg, L);
  const a = (deg * Math.PI) / 180;
  t.position.set(tip.x + r * side * Math.cos(a), tip.y - r * side * Math.sin(a), 0);
}

// The surface, and its point.
stage.add(polyline([[SURFACE[0]!, P.y, 0], [SURFACE[1]!, P.y, 0]], { color: C.moss, width: 8 }));
const dot = new THREE.Mesh(new THREE.CircleGeometry(0.075, 32), flat(C.bone));
dot.position.set(P.x, P.y, 0.5);
stage.add(dot);

// The sun.
const sun = new THREE.Group();
sun.add(new THREE.Mesh(new THREE.CircleGeometry(0.62, 48), flat(C.ochre, { transparent: true, opacity: 0.16 })));
sun.add(new THREE.Mesh(new THREE.CircleGeometry(0.4, 48), flat(C.ochre, { transparent: true, opacity: 0.3 })));
sun.add(new THREE.Mesh(new THREE.CircleGeometry(0.26, 48), flat(C.ochre)));
stage.add(sun);

// The eye: an almond and its pupil, looking at the point.
const eye = new THREE.Group();
{
  const almond: [number, number, number][] = [];
  for (let i = 0; i <= 48; i++) {
    const s = (i / 48) * 2 * Math.PI;
    almond.push([0.42 * Math.cos(s), 0.2 * Math.sin(s) * Math.abs(Math.sin(s)) ** 0.2, 0]);
  }
  eye.add(polyline(almond, { color: C.blue, width: 3.5 }));
  const iris = new THREE.Mesh(new THREE.CircleGeometry(0.15, 32), flat(C.blue));
  eye.add(iris);
  const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.065, 24), flat(0x000000));
  pupil.position.set(0, 0, 0.01);
  eye.add(pupil);
}
stage.add(eye);

// The angle between R and v.
const ARC_STEPS = 48;
const wedge = new THREE.Mesh(
  (() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array((ARC_STEPS + 2) * 3), 3));
    g.setIndex(Array.from({ length: ARC_STEPS }, (_, i) => [0, i + 1, i + 2]).flat());
    return g;
  })(),
  flat(C.blue, { transparent: true, opacity: 0.25, side: THREE.DoubleSide }),
);
const arc = polyline(Array.from({ length: ARC_STEPS + 1 }, () => [0, 0, 0] as [number, number, number]), { color: C.blue, width: 2.5 });
const alphaLabel = label('α', { size: 0.3, color: C.blue, anchorX: 'center', anchorY: 'middle' });
stage.add(wedge, arc, alphaLabel);

// n, l, R, v.
const nArrow = arrow(C.bone);
const lArrow = arrow(C.ochre);
const rArrow = arrow(C.ochre, { dashed: true });
const vArrow = arrow(C.blue);
const nLabel = label('n', { size: 0.3, color: C.bone, anchorX: 'center', anchorY: 'bottom' });
const lLabel = label('l', { size: 0.3, color: C.ochre, anchorX: 'center', anchorY: 'middle' });
const rLabel = label('R', { size: 0.3, color: C.ochre, anchorX: 'center', anchorY: 'middle' });
const vLabel = label('v', { size: 0.3, color: C.blue, anchorX: 'center', anchorY: 'middle' });
stage.add(nLabel, lLabel, rLabel, vLabel);
nArrow(0);
nLabel.position.set(P.x, P.y + L + 0.08, 0);

// The readout, and the grey the Phong pass paints.
const line1 = label('R · v  =  cos α', { size: 0.3, color: C.bone, anchorX: 'left', anchorY: 'bottom', position: [READ.x, READ.y, 0] });
const value1 = label('', { size: 0.4, color: C.bone, anchorX: 'left', anchorY: 'top', position: [READ.x, READ.y - 0.1, 0] });
const line2 = label('(R · v)', { size: 0.3, color: C.bone, anchorX: 'left', anchorY: 'bottom', position: [READ.x, READ.y - 1.05, 0] });
const value2 = label('', { size: 0.4, color: C.bone, anchorX: 'left', anchorY: 'top', position: [READ.x, READ.y - 1.15, 0] });
// The exponent, a superscript placed after "(R · v)" once troika has laid it out (see each frame).
const power = label(String(SHININESS), { size: 0.19, color: C.bone, anchorX: 'left', anchorY: 'bottom' });
power.visible = false;
stage.add(line1, value1, line2, value2, power);
const swatch = new THREE.Mesh(new THREE.PlaneGeometry(SWATCH.size, SWATCH.size), new THREE.MeshBasicMaterial({ color: 0x000000 }));
swatch.position.set(SWATCH.x, SWATCH.y, 0);
const h = SWATCH.size / 2;
const swatchEdge = polyline(
  [
    [SWATCH.x - h, SWATCH.y - h, 0.01],
    [SWATCH.x + h, SWATCH.y - h, 0.01],
    [SWATCH.x + h, SWATCH.y + h, 0.01],
    [SWATCH.x - h, SWATCH.y + h, 0.01],
    [SWATCH.x - h, SWATCH.y - h, 0.01],
  ],
  { color: C.slate, width: 2 },
);
const swatchLabel = label('phong', { size: 0.2, color: C.ash, anchorX: 'center', anchorY: 'top', position: [SWATCH.x, SWATCH.y - h - 0.1, 0] });
stage.add(swatch, swatchEdge, swatchLabel);

// --- Each frame ----------------------------------------------------------------
const eyeAngle = (t: number) => (params.sweep ? SWEEP.mid + SWEEP.reach * Math.sin((2 * Math.PI * t) / stage.duration) : params.eye);
const fmt = (x: number) => (x < -0.005 ? `−${(-x).toFixed(2)}` : Math.abs(x).toFixed(2));

let shown = '';
stage.frame((t) => {
  const bounds = (line2 as unknown as { textRenderInfo?: { blockBounds: number[] } }).textRenderInfo?.blockBounds;
  if (bounds) {
    power.position.set(READ.x + bounds[2]! + 0.03, READ.y - 1.05 + 0.17, 0);
    power.visible = true;
  }
  const sunDeg = params.sun;
  const eyeDeg = eyeAngle(t);
  const rDeg = -sunDeg; // l mirrored about n
  const lit = Math.cos((sunDeg * Math.PI) / 180) > 0;

  const sp = at(sunDeg, AWAY);
  sun.position.set(sp.x, sp.y, 0.1);
  lArrow(sunDeg);
  nameAt(lLabel, sunDeg);
  rArrow(rDeg, 0.25, lit); // R exists only while the sun is in front of the surface
  // R's and v's names on their far sides from each other, so they never collide.
  const apart = eyeDeg >= rDeg ? 1 : -1;
  nameAt(rLabel, rDeg, -apart);
  const ep = at(eyeDeg, AWAY);
  eye.position.set(ep.x, ep.y, 0.1);
  eye.rotation.z = Math.atan2(ep.y - P.y, ep.x - P.x) + Math.PI / 2; // the almond across the line of sight, facing the point
  vArrow(eyeDeg, 0.3);
  nameAt(vLabel, eyeDeg, apart);
  rLabel.visible = lit;

  // The angle from R round to v.
  const pos = wedge.geometry.getAttribute('position') as THREE.BufferAttribute;
  pos.setXYZ(0, P.x, P.y, -0.1);
  const pts: [number, number, number][] = [];
  for (let i = 0; i <= ARC_STEPS; i++) {
    const q = at(rDeg + ((eyeDeg - rDeg) * i) / ARC_STEPS, ARC);
    pos.setXYZ(i + 1, q.x, q.y, -0.1);
    pts.push(v3(q, -0.1));
  }
  pos.needsUpdate = true;
  setPolyline(arc, pts);
  const mid = at((rDeg + eyeDeg) / 2, ARC + 0.26);
  alphaLabel.position.set(mid.x, mid.y, 0);
  alphaLabel.visible = lit && Math.abs(eyeDeg - rDeg) > 12;
  wedge.visible = arc.visible = lit; // no R, no angle to it

  const rv = Math.cos(((eyeDeg - rDeg) * Math.PI) / 180);
  const hi = lit ? Math.max(0, rv) ** SHININESS : 0;
  (swatch.material as THREE.MeshBasicMaterial).color.setRGB(hi, hi, hi);
  const text = `${fmt(rv)} ${fmt(hi)}`;
  if (text !== shown) {
    shown = text;
    setText(value1, `=  ${fmt(rv)}`);
    setText(value2, `=  ${fmt(hi)}`);
  }
});

// --- Drag the sun or the eye --------------------------------------------------
const canvas = stage.renderer.domElement;
const HALF_W = (ORTHO_H * 16) / 9;
const toWorld = (e: PointerEvent) => {
  const r = canvas.getBoundingClientRect();
  return new THREE.Vector2((((e.clientX - r.left) / r.width) * 2 - 1) * HALF_W, -(((e.clientY - r.top) / r.height) * 2 - 1) * ORTHO_H);
};
let grab: 'sun' | 'eye' | null = null;
const near = (p: THREE.Vector2): 'sun' | 'eye' | null => {
  const ds = p.distanceTo(new THREE.Vector2(sun.position.x, sun.position.y));
  const de = p.distanceTo(new THREE.Vector2(eye.position.x, eye.position.y));
  if (Math.min(ds, de) > 0.7) return null;
  return ds < de ? 'sun' : 'eye';
};
canvas.addEventListener('pointerdown', (e) => {
  grab = near(toWorld(e));
  if (grab) canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  const p = toWorld(e);
  if (!grab) {
    canvas.style.cursor = near(p) ? 'grab' : '';
    return;
  }
  const deg = Math.round(Math.max(-100, Math.min(100, (Math.atan2(p.x - P.x, p.y - P.y) * 180) / Math.PI)));
  stop(grab === 'sun');
  if (grab === 'eye') params.eye = deg;
  else params.sun = deg;
  ui.params.controllers.forEach((c) => c.updateDisplay());
});
const release = () => (grab = null);
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);

stage.start();
