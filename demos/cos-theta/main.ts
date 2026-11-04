/**
 * The brightness pass's number, on its own (Steve, 2026-11-03: a slide
 * between albedo and brightness which just shows cos(theta) as a quantity
 * between the normal vector and the sun direction; he used to do this in his
 * hand-drawn slides, to show a dot product for students).
 *
 * A surface seen edge-on, a point on it, its unit normal n, and the sun: the
 * unit vector l points from the point to the sun, theta is the angle between
 * n and l. The dot product is drawn as what it is, the projection of l onto
 * n: drop a perpendicular from l's tip to n, and the piece of n it cuts off
 * has length n . l = cos theta (n and l both unit). The readout gives the
 * number, and the swatch the grey the brightness pass paints, max(0, cos
 * theta): past 90 degrees the sun is behind the surface, the projection points
 * the wrong way (drawn in rust), and the pass paints black.
 *
 * The sun sweeps slowly back and forth, a pure function of t; dragging the
 * sun or the `sun` slider (degrees from the normal) stops the sweep and puts
 * it there.
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
const P = new THREE.Vector2(-1.5, -1.55); // the point on the surface
const SURFACE = [-4.0, 0.9]; // the surface's drawn extent in x
const L = 2.3; // n and l, drawn at this length (both unit vectors)
const SUN_AT = 3.75; // the sun's distance from the point
const ARC = 0.62; // the angle's arc
const SWEEP = 78; // the sweep's reach either side of the normal, degrees
const READ = { x: 2.15, y: 0.55 };
const SWATCH = { x: 3.35, y: -1.1, size: 1.1 };

const params = { sun: 35, sweep: true };
ui.params
  .add(params, 'sun', -100, 100, 1)
  .name('sun (degrees from normal)')
  .onChange(() => (params.sweep = false));
ui.params.add(params, 'sweep');

// --- Pieces ----------------------------------------------------------------
const v3 = (p: THREE.Vector2, z = 0): [number, number, number] => [p.x, p.y, z];
function arrowHead(color: number): THREE.Mesh {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -0.24, 0.1, 0, -0.24, -0.1, 0], 3));
  return new THREE.Mesh(g, flat(color));
}
function placeHead(head: THREE.Mesh, from: THREE.Vector2, to: THREE.Vector2, z: number): void {
  head.position.set(to.x, to.y, z);
  head.rotation.z = Math.atan2(to.y - from.y, to.x - from.x);
}

// The surface, and its point.
stage.add(polyline([[SURFACE[0]!, P.y, 0], [SURFACE[1]!, P.y, 0]], { color: C.moss, width: 8 }));
const dot = new THREE.Mesh(new THREE.CircleGeometry(0.075, 32), flat(C.bone));
dot.position.set(P.x, P.y, 0.5);
stage.add(dot);

// The sun: a disc and a soft halo, and its light falling on the point.
const sun = new THREE.Group();
sun.add(new THREE.Mesh(new THREE.CircleGeometry(0.62, 48), flat(C.ochre, { transparent: true, opacity: 0.16 })));
sun.add(new THREE.Mesh(new THREE.CircleGeometry(0.4, 48), flat(C.ochre, { transparent: true, opacity: 0.3 })));
sun.add(new THREE.Mesh(new THREE.CircleGeometry(0.26, 48), flat(C.ochre)));
stage.add(sun);
const sunlight = polyline([[0, 0, 0], [0, 1, 0]], { color: C.ochre, width: 2, opacity: 0.45 });
stage.add(sunlight);

// The angle between n and l.
const ARC_STEPS = 48;
const wedge = new THREE.Mesh(
  (() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array((ARC_STEPS + 2) * 3), 3));
    g.setIndex(Array.from({ length: ARC_STEPS }, (_, i) => [0, i + 1, i + 2]).flat());
    return g;
  })(),
  flat(C.ochre, { transparent: true, opacity: 0.22, side: THREE.DoubleSide }),
);
stage.add(wedge);
const arc = polyline(Array.from({ length: ARC_STEPS + 1 }, () => [0, 0, 0] as [number, number, number]), { color: C.ochre, width: 2.5 });
stage.add(arc);
const thetaLabel = label('θ', { size: 0.3, color: C.ochre, anchorX: 'center', anchorY: 'middle' });
stage.add(thetaLabel);

// The projection of l onto n: the perpendicular from l's tip, and the piece of n it cuts off.
const drop = polyline([[0, 0, 0], [1, 0, 0]], { color: C.slate, width: 2, dashed: true, dashSize: 0.09, gapSize: 0.07 });
const proj = polyline([[0, 0, 0], [0, 1, 0]], { color: C.ochre, width: 9 });
const footTick = polyline([[0, 0, 0], [1, 0, 0]], { color: C.ochre, width: 3 });
stage.add(drop, proj, footTick);
const cosLabel = label('cos θ', { size: 0.24, color: C.ochre, anchorY: 'middle' });
stage.add(cosLabel);

// n and l.
const nLine = polyline([v3(P), [P.x, P.y + L - 0.2, 0]], { color: C.bone, width: 4.5 });
const nHead = arrowHead(C.bone);
placeHead(nHead, P, new THREE.Vector2(P.x, P.y + L), 0.3);
stage.add(nLine, nHead);
const nLabel = label('n', { size: 0.3, color: C.bone, anchorX: 'center', anchorY: 'bottom', position: [P.x, P.y + L + 0.08, 0] });
stage.add(nLabel);
const lLine = polyline([[0, 0, 0], [0, 1, 0]], { color: C.ochre, width: 4.5 });
const lHead = arrowHead(C.ochre);
stage.add(lLine, lHead);
const lLabel = label('l', { size: 0.3, color: C.ochre, anchorX: 'center', anchorY: 'middle' });
stage.add(lLabel);

// The readout, and the grey the brightness pass paints.
const formula = label('n · l  =  cos θ', { size: 0.3, color: C.bone, anchorX: 'left', anchorY: 'bottom', position: [READ.x, READ.y, 0] });
const value = label('', { size: 0.56, color: C.bone, anchorX: 'left', anchorY: 'top', position: [READ.x, READ.y - 0.12, 0] });
stage.add(formula, value);
const swatch = new THREE.Mesh(new THREE.PlaneGeometry(SWATCH.size, SWATCH.size), new THREE.MeshBasicMaterial({ color: 0x000000 }));
swatch.position.set(SWATCH.x, SWATCH.y, 0);
const swatchEdge = polyline(
  [
    [SWATCH.x - SWATCH.size / 2, SWATCH.y - SWATCH.size / 2, 0.01],
    [SWATCH.x + SWATCH.size / 2, SWATCH.y - SWATCH.size / 2, 0.01],
    [SWATCH.x + SWATCH.size / 2, SWATCH.y + SWATCH.size / 2, 0.01],
    [SWATCH.x - SWATCH.size / 2, SWATCH.y + SWATCH.size / 2, 0.01],
    [SWATCH.x - SWATCH.size / 2, SWATCH.y - SWATCH.size / 2, 0.01],
  ],
  { color: C.slate, width: 2 },
);
const swatchLabel = label('brightness', { size: 0.2, color: C.ash, anchorX: 'center', anchorY: 'top', position: [SWATCH.x, SWATCH.y - SWATCH.size / 2 - 0.1, 0] });
stage.add(swatch, swatchEdge, swatchLabel);

// --- Each frame ----------------------------------------------------------------
const rad = (d: number) => (d * Math.PI) / 180;
/** The sun's angle from the normal now: the sweep, or where it was put. */
const sunAngle = (t: number) => (params.sweep ? SWEEP * Math.sin((2 * Math.PI * t) / stage.duration) : params.sun);
const fmt = (x: number) => (x < -0.005 ? `−${(-x).toFixed(2)}` : Math.abs(x).toFixed(2));

let shown = '';
stage.frame((t) => {
  const deg = sunAngle(t);
  const th = rad(deg);
  const dir = new THREE.Vector2(Math.sin(th), Math.cos(th)); // l, unit; n is (0, 1)
  const tip = P.clone().addScaledVector(dir, L);
  const cos = dir.y;
  const behind = cos < 0;

  sun.position.set(P.x + SUN_AT * dir.x, P.y + SUN_AT * dir.y, 0.1);
  setPolyline(sunlight, [v3(P.clone().addScaledVector(dir, L + 0.15)), v3(P.clone().addScaledVector(dir, SUN_AT - 0.3))]);
  setPolyline(lLine, [v3(P, 0.2), v3(P.clone().addScaledVector(dir, L - 0.2), 0.2)]);
  placeHead(lHead, P, tip, 0.3);
  const side = Math.sign(dir.x) || 1;
  // l's name sits beside its tip, on the side away from n.
  const away = side > 0 ? new THREE.Vector2(dir.y, -dir.x) : new THREE.Vector2(-dir.y, dir.x);
  lLabel.position.set(tip.x + 0.3 * away.x, tip.y + 0.3 * away.y, 0);

  // The angle, from n round to l.
  const pos = wedge.geometry.getAttribute('position') as THREE.BufferAttribute;
  pos.setXYZ(0, P.x, P.y, -0.1);
  const pts: [number, number, number][] = [];
  for (let i = 0; i <= ARC_STEPS; i++) {
    const a = (th * i) / ARC_STEPS;
    const q: [number, number, number] = [P.x + ARC * Math.sin(a), P.y + ARC * Math.cos(a), -0.1];
    pos.setXYZ(i + 1, ...q);
    pts.push(q);
  }
  pos.needsUpdate = true;
  setPolyline(arc, pts);
  const mid = th / 2;
  const showTheta = Math.abs(deg) > 9;
  thetaLabel.visible = showTheta;
  thetaLabel.position.set(P.x + (ARC + 0.24) * Math.sin(mid), P.y + (ARC + 0.24) * Math.cos(mid), 0);

  // The projection onto n.
  const foot = new THREE.Vector2(P.x, P.y + L * cos);
  const tone = behind ? C.rust : C.ochre;
  setPolyline(drop, [v3(tip, 0.05), v3(foot, 0.05)]);
  setPolyline(proj, [v3(P, 0.15), v3(foot, 0.15)]);
  setPolyline(footTick, [[foot.x - 0.13, foot.y, 0.15], [foot.x + 0.13, foot.y, 0.15]]);
  for (const o of [proj, footTick]) (o.material as unknown as { color: THREE.Color }).color.setHex(tone);
  cosLabel.color = tone;
  cosLabel.anchorX = side > 0 ? 'right' : 'left';
  cosLabel.position.set(P.x - 0.2 * side, P.y + (L * cos) / 2, 0);
  cosLabel.visible = Math.abs(cos) > 0.12;

  // The readout and the grey.
  const b = Math.max(0, cos);
  (swatch.material as THREE.MeshBasicMaterial).color.setRGB(b, b, b);
  const text = fmt(cos);
  if (text !== shown) {
    shown = text;
    setText(value, `=  ${text}`);
  }
});

// --- Drag the sun ----------------------------------------------------------------
const canvas = stage.renderer.domElement;
const HALF_W = (ORTHO_H * 16) / 9;
const toWorld = (e: PointerEvent) => {
  const r = canvas.getBoundingClientRect();
  return new THREE.Vector2((((e.clientX - r.left) / r.width) * 2 - 1) * HALF_W, -(((e.clientY - r.top) / r.height) * 2 - 1) * ORTHO_H);
};
let grab = false;
const nearSun = (p: THREE.Vector2) => p.distanceTo(new THREE.Vector2(sun.position.x, sun.position.y)) < 0.7;
canvas.addEventListener('pointerdown', (e) => {
  grab = nearSun(toWorld(e));
  if (grab) canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  const p = toWorld(e);
  if (!grab) {
    canvas.style.cursor = nearSun(p) ? 'grab' : '';
    return;
  }
  const deg = (Math.atan2(p.x - P.x, p.y - P.y) * 180) / Math.PI;
  params.sun = Math.round(Math.max(-100, Math.min(100, deg)));
  params.sweep = false;
  ui.params.controllers.forEach((c) => c.updateDisplay());
});
const release = () => (grab = false);
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);

stage.start();
