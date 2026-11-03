/**
 * Store samples, interpolate between them.
 *
 * For the light-field deck (Steve, 2026-10-30): "take a grid of points and a
 * function, then we save discretized values, then we produce the linear
 * interpolated function between them." The discretization step of storing a
 * light field, in one dimension.
 *
 * 1. A function.
 * 2. A uniform grid of points under it.
 * 3. Its value at each grid point is kept: a dot on the curve.
 * 4. The function goes. What is stored is only the dots.
 * 5. Reconstruction: straight lines between neighbouring dots, the linear
 *    interpolant.
 * 6. The function comes back, faint, to compare: close where it is gentle,
 *    off where it bends faster than the grid.
 *
 * `?n=` sets the number of grid intervals (default 10). One cycle, then it
 * holds.
 *
 * Everything is cream: amber is the deck's colour for the equilibrium L⋆ only.
 * The function ends faint and the interpolant solid, so the two can be told apart.
 */

import * as THREE from 'three';
import { createStage, createUI, C } from '@';
import { polyline, setPolyline, type Pt } from '@/lines';

const stage = createStage({ camera: 'ortho', position: [0, 0, 10], target: [0, 0, 0], orthoHeight: 3, lights: false, controls: false });
createUI(stage);
stage.duration = 18; // the build takes 10 s; the rest holds the finished picture

const W = 4.2;
const H = 2.1;
const px = (x: number) => -W + 2 * W * x;
const py = (y: number) => -H + 2 * H * y;

/** A smooth function on [0, 1] with gentle and quick stretches. */
const f = (x: number) => 0.5 + 0.22 * Math.sin(2 * Math.PI * 1.3 * x + 0.4) + 0.12 * Math.sin(2 * Math.PI * 3.1 * x + 1.1) * Math.exp(-2 * x);

const N = Math.max(2, +(new URLSearchParams(location.search).get('n') ?? 10));
const xs = Array.from({ length: N + 1 }, (_, i) => i / N);

// Axis.
stage.add(polyline([[px(0), py(0), 0], [px(1), py(0), 0]], { color: C.slate, width: 1.5 }));

// The function.
const curvePts: Pt[] = Array.from({ length: 401 }, (_, i) => [px(i / 400), py(f(i / 400)), 0.01]);
const fn = polyline(curvePts, { color: C.bone, width: 3.5 });
stage.add(fn);

// The grid: a tick and a dashed riser at each point.
const ticks = xs.map((x) => {
  const t = polyline([[px(x), py(0), 0], [px(x), py(f(x)), 0]], { color: C.slateDeep, width: 1.5, dashed: true, dashSize: 0.06, gapSize: 0.05 });
  stage.add(t);
  return t;
});
const gridDots = xs.map((x) => {
  const d = new THREE.Mesh(new THREE.CircleGeometry(0.05, 20), new THREE.MeshBasicMaterial({ color: C.slate, transparent: true }));
  d.position.set(px(x), py(0), 0.02);
  stage.add(d);
  return d;
});

// The stored values.
const dots = xs.map((x) => {
  const d = new THREE.Mesh(new THREE.CircleGeometry(0.075, 24), new THREE.MeshBasicMaterial({ color: C.bone, transparent: true }));
  d.position.set(px(x), py(f(x)), 0.04);
  stage.add(d);
  return d;
});

// The linear interpolant, drawn left to right.
const interp = polyline(xs.map((x) => [px(x), py(f(x)), 0.03] as Pt), { color: C.bone, width: 3 });
stage.add(interp);

const ease = (a: number, b: number, t: number) => {
  const u = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return u * u * (3 - 2 * u);
};
const fade = (o: THREE.Object3D, a: number) => {
  const m = (o as THREE.Mesh).material as THREE.Material & { opacity: number };
  m.transparent = true;
  m.opacity = a;
  o.visible = a > 0.01;
};

stage.frame((t) => {
  const grid = ease(1.0, 2.0, t);
  const keep = ease(2.4, 3.6, t);
  const gone = ease(4.4, 5.4, t);
  const draw = ease(5.8, 7.8, t);
  const back = ease(8.6, 9.6, t);

  fade(fn, 1 - gone + 0.3 * back);
  gridDots.forEach((d) => fade(d, grid));
  ticks.forEach((tk) => fade(tk, grid * (1 - gone)));
  // The values land one after another, left to right.
  dots.forEach((d, i) => fade(d, ease(2.4 + (1.2 * i) / (N + 1), 2.4 + (1.2 * (i + 1)) / (N + 1), t) * Math.max(keep, 0.001)));

  // The interpolant grows from the left. The line always carries all N + 1
  // points (a three.js line cannot grow past the count it was last given);
  // the ones not reached yet sit on the moving tip.
  const reach = draw * N;
  const k = Math.min(N - 1, Math.floor(reach));
  const s = Math.min(1, reach - k);
  const tip: Pt = [px(xs[k]! + (xs[k + 1]! - xs[k]!) * s), py(f(xs[k]!) + (f(xs[k + 1]!) - f(xs[k]!)) * s), 0.03];
  const pts: Pt[] = xs.map((x, i) => (i <= k ? ([px(x), py(f(x)), 0.03] as Pt) : tip));
  interp.visible = draw > 0;
  if (interp.visible) setPolyline(interp, pts);
});

stage.start();
