/**
 * Radiance — light per ray, valued in spectra.
 *
 * A flat 2D room, closed on all four sides: floor, two walls, ceiling, a round
 * object, and a lamp. One point p inside is highlighted, and around it the
 * circle of directions — the fibre of T¹M over p. A vector walks that circle,
 * and the panel on the right shows the function attached to *that* direction:
 * the spectrum the ray (p, ω) carries.
 *
 * Convention (easy to get backwards): ω is the direction of travel, so the
 * light passing through p in direction ω left a surface *behind* p. The dim
 * segment running back from p to a marked point is that ray's history, and the
 * spectrum on the panel is the spectrum leaving the surface it came from.
 *
 * The graph changes as ω sweeps mostly because the ray *sees a different
 * surface*, and it jumps discontinuously across a silhouette, which is exactly
 * the behaviour of ℓ on ray space. It also changes while looking at one surface,
 * because the materials are glossy as well as diffuse: see `src/room2d.ts`.
 *
 * The room, the spectra and the graph panel live in `src/room2d.ts`, shared
 * with `radiance-boundary`.
 *
 * Everything is a pure function of t and of the panel parameters — no
 * `Math.random()`, no wallclock — so a frame-stepped export is reproducible.
 */

import * as THREE from 'three';
import { createStage, createUI, C } from '@';
import { polyline, setPolyline } from '@/lines';
import { label } from '@/text';
import {
  NS,
  X0,
  X1,
  Y0,
  Y1,
  arc,
  arrowHead,
  buildRoom,
  createSpectrumPanel,
  filledCircle,
  raySpectrum,
  v,
} from '@/room2d';

const stage = createStage({
  camera: 'ortho',
  position: [0, 0, 10],
  target: [0, 0, 0],
  orthoHeight: 3,
  lights: false,
  controls: false,
});
stage.duration = 14;

const ui = createUI(stage);

buildRoom(stage);
const panel = createSpectrumPanel(stage, 'the spectrum this ray carries');

// ---------------------------------------------------------------------------
// The circle of directions at p
// ---------------------------------------------------------------------------

const RING_R = 0.75;

const ring = arc(v(0, 0), RING_R, 0, Math.PI * 2, { color: C.slate, width: 2, opacity: 0.85 });
stage.add(ring);

const pointDot = filledCircle(v(0, 0), 0.075, C.bone, 0.02);
stage.add(pointDot);

const pLabel = label('p', { size: 0.22, color: C.bone, anchorX: 'center', anchorY: 'top' });
stage.add(pLabel);

// The vector: a shaft to the ring, with a solid head at the tip.
const shaft = polyline([[0, 0, 0], [0, 0, 0]], { color: C.bone, width: 5 });
shaft.renderOrder = 5;
stage.add(shaft);
const head = arrowHead();
stage.add(head);

// Where the ray came from: the segment behind p, and a marker on the surface.
const sourceRay = polyline([[0, 0, 0], [0, 0, 0]], { color: C.slate, width: 2, opacity: 0.55 });
stage.add(sourceRay);
const sourceDot = filledCircle(v(0, 0), 0.09, C.bone, 0.02);
stage.add(sourceDot);

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

const params = {
  px: -1.6,
  py: 0.35,
  sweep: true,
  angle: 40,
  gloss: 1,
  gain: 1,
  sourceRay: true,
};

// Ranges keep the circle of directions inside the room.
ui.params.add(params, 'px', X0 + RING_R + 0.1, X1 - RING_R - 0.1, 0.01).name('p — x');
ui.params.add(params, 'py', Y0 + RING_R + 0.1, Y1 - RING_R - 0.1, 0.01).name('p — y');
// Sweeping is the animation; freezing at one angle is how you get a still of a
// particular ray for a slide.
ui.params.add(params, 'sweep').name('sweep the circle');
ui.params.add(params, 'angle', 0, 360, 1).name('angle (degrees)');
ui.params.add(params, 'gloss', 0, 1.5, 0.05).name('gloss');
ui.params.add(params, 'gain', 0.2, 3, 0.05).name('vertical gain');
ui.params.add(params, 'sourceRay').name('show where it came from');

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

const spectrum = new Float32Array(NS + 1);

stage.frame((t) => {
  const u = stage.duration > 0 ? (t % stage.duration) / stage.duration : 0;
  const angle = params.sweep ? u * Math.PI * 2 : (params.angle * Math.PI) / 180;
  const omega = v(Math.cos(angle), Math.sin(angle));
  const p = v(params.px, params.py);

  // --- the circle of directions -------------------------------------------
  ring.position.set(p.x, p.y, 0);
  pointDot.position.set(p.x, p.y, 0);
  pLabel.position.set(p.x, p.y - 0.14, 0.02);

  const tip = v(p.x + RING_R * omega.x, p.y + RING_R * omega.y);
  setPolyline(shaft, [
    [p.x, p.y, 0],
    [tip.x - 0.12 * omega.x, tip.y - 0.12 * omega.y, 0],
  ]);
  head.position.set(tip.x, tip.y, 0.02);
  head.rotation.z = angle - Math.PI / 2;

  // --- the spectrum on that ray -------------------------------------------
  // The room is closed, so there is always a hit and always a spectrum.
  const hit = raySpectrum(p, omega, spectrum, params.gloss);
  const back = v(-omega.x, -omega.y);
  const from = hit ? v(p.x + hit.t * back.x, p.y + hit.t * back.y) : p;

  // The ray back to its source is tinted by the surface it came from — that
  // link is what colour is for here, and it stays in the scene half of the frame.
  const show = params.sourceRay && !!hit;
  setPolyline(sourceRay, show ? [[from.x, from.y, 0], [p.x, p.y, 0]] : [[0, 0, 0], [0, 0, 0]]);
  if (hit) {
    (sourceRay.material as THREE.Material & { color: THREE.Color }).color.setHex(hit.surf.color);
    (sourceDot.material as THREE.MeshBasicMaterial).color.setHex(hit.surf.color);
  }
  sourceDot.visible = show;
  sourceDot.position.set(from.x, from.y, 0.02);

  panel.update(spectrum, params.gain);
});

stage.start();
