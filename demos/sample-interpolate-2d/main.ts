/**
 * Store samples, interpolate between them: in two dimensions.
 *
 * For the light-field deck (Steve, 2026-10-30: "a 2D interpolation plot of a
 * complicated function"). The discretization step of storing a light field,
 * on a square instead of a line, with the interpolation the light-field
 * baker actually uses across a surface: bilinear.
 *
 * 1. A complicated function of two variables, as a surface over a square.
 * 2. A uniform grid of points on the square.
 * 3. Its value at each grid point is kept: a dot on the surface.
 * 4. The surface goes. What is stored is only the dots.
 * 5. Reconstruction: over each grid cell, the bilinear interpolant of its four
 *    corner values, cell by cell.
 *
 * Greys, lit: the function cool, the reconstruction warm (amber is the deck's
 * colour for L⋆ only). Drag to orbit.
 * `?n=` sets the grid (default 20 cells a side; Steve: "make it a finer grid"). One cycle, then it holds.
 */

import * as THREE from 'three';
import { createStage, createUI, C } from '@';
import { polyline } from '@/lines';

const stage = createStage({ camera: 'persp', position: [1.15, 4.6, 7.6], target: [1.15, -0.3, 0], fov: 38 }); // lit by the stage's rig; drag to orbit. Framed left of centre: the deck sets a column of text on the right.
createUI(stage);
stage.duration = 20; // the build takes 12 s; the rest holds the finished picture

const S = 2.3; // half-side of the square
const HSCALE = 0.75;
/** A complicated function on [0,1]²: waves, a ridge and two bumps. */
const f = (u: number, v: number) =>
  0.42 * Math.sin(2 * Math.PI * (1.2 * u + 0.4 * v)) * Math.cos(2 * Math.PI * 0.9 * v) +
  0.55 * Math.exp(-((u - 0.7) ** 2 + (v - 0.3) ** 2) / 0.012) +
  0.35 * Math.exp(-((u - 0.25) ** 2 + (v - 0.72) ** 2) / 0.03) +
  0.18 * Math.sin(2 * Math.PI * 3.3 * u * v);
const X = (u: number) => -S + 2 * S * u;
const Z = (v: number) => -S + 2 * S * v;
const Y = (h: number) => HSCALE * h;

const N = Math.max(2, +(new URLSearchParams(location.search).get('n') ?? 20));
const grid = Array.from({ length: N + 1 }, (_, i) => i / N);
const val = grid.map((u) => grid.map((v) => f(u, v)));
/** The bilinear interpolant of the stored values. */
const bil = (u: number, v: number) => {
  const i = Math.min(N - 1, Math.floor(u * N));
  const j = Math.min(N - 1, Math.floor(v * N));
  const a = u * N - i;
  const b = v * N - j;
  return (1 - a) * (1 - b) * val[i]![j]! + a * (1 - b) * val[i + 1]![j]! + (1 - a) * b * val[i]![j + 1]! + a * b * val[i + 1]![j + 1]!;
};

/** A height-field mesh of g over the square, lit by the stage's rig. */
function surface(g: (u: number, v: number) => number, res: number, color: number): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(1, 1, res, res);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let k = 0; k < pos.count; k++) {
    const u = pos.getX(k) + 0.5;
    const v = 0.5 - pos.getY(k);
    pos.setXYZ(k, X(u), Y(g(u, v)), Z(v));
  }
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0, side: THREE.DoubleSide, transparent: true }));
}

// The function.
const fnSurf = surface(f, 160, C.slate);
stage.add(fnSurf);


// The square and its grid.
const floorY = Y(-1.0);
const square = polyline(
  [[X(0), floorY, Z(0)], [X(1), floorY, Z(0)], [X(1), floorY, Z(1)], [X(0), floorY, Z(1)], [X(0), floorY, Z(0)]],
  { color: C.slate, width: 1.5 },
);
stage.add(square);
const gridLines: THREE.Object3D[] = [];
for (const t of grid) {
  for (const l of [
    polyline([[X(t), floorY, Z(0)], [X(t), floorY, Z(1)]], { color: C.slateDeep, width: 1.2 }),
    polyline([[X(0), floorY, Z(t)], [X(1), floorY, Z(t)]], { color: C.slateDeep, width: 1.2 }),
  ]) {
    stage.add(l);
    gridLines.push(l);
  }
}
const footGeo = new THREE.SphereGeometry(Math.min(0.03, 0.24 / N), 8, 6);
const dotGeo = new THREE.SphereGeometry(Math.min(0.055, 0.5 / N), 10, 8);
const feet: THREE.Mesh[] = [];
const risers: THREE.Object3D[] = [];
const dots: THREE.Mesh[] = [];
grid.forEach((u, i) =>
  grid.forEach((v, j) => {
    const foot = new THREE.Mesh(footGeo, new THREE.MeshBasicMaterial({ color: C.slate, transparent: true }));
    foot.position.set(X(u), floorY, Z(v));
    stage.add(foot);
    feet.push(foot);
    const r = polyline([[X(u), floorY, Z(v)], [X(u), Y(val[i]![j]!), Z(v)]], { color: C.slateDeep, width: 1, dashed: true, dashSize: 0.05, gapSize: 0.05 });
    stage.add(r);
    risers.push(r);
    const d = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({ color: C.bone, transparent: true }));
    d.position.set(X(u), Y(val[i]![j]!), Z(v));
    stage.add(d);
    dots.push(d);
  }),
);

// The bilinear interpolant, one patch per cell, revealed cell by cell, in a
// warm grey against the function's cool one.
const RECON = 0xb8ad9a;
const patches: THREE.Mesh[] = [];
for (let i = 0; i < N; i++)
  for (let j = 0; j < N; j++) {
    const m = surface((a, b) => bil((i + a) / N, (j + b) / N), 4, RECON);
    // Re-place the patch over its own cell: `surface` spans the whole square.
    const pos = m.geometry.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < pos.count; k++) {
      const a = (pos.getX(k) + S) / (2 * S);
      const b = (pos.getZ(k) + S) / (2 * S);
      pos.setXYZ(k, X((i + a) / N), pos.getY(k), Z((j + b) / N));
    }
    pos.needsUpdate = true;
    m.geometry.computeVertexNormals();
    stage.add(m);
    patches.push(m);
  }

// --- Timeline -----------------------------------------------------------------------------
const ease = (a: number, b: number, t: number) => {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
};
const fade = (o: THREE.Object3D, a: number) => {
  const m = (o as THREE.Mesh).material as THREE.Material & { opacity: number };
  m.transparent = true;
  m.opacity = a;
  o.visible = a > 0.01;
};
const order = (k: number, count: number, a: number, b: number, t: number) => ease(a + ((b - a) * k) / count, a + ((b - a) * (k + 1)) / count, t);

stage.frame((t) => {
  const g = ease(1.2, 2.2, t);
  const gone = ease(5.0, 6.0, t);
  gridLines.forEach((l) => fade(l, g));
  fade(square, 1);
  feet.forEach((o) => fade(o, g));
  risers.forEach((o, k) => fade(o, order(k, risers.length, 2.4, 4.2, t) * (1 - gone)));
  dots.forEach((o, k) => fade(o, order(k, dots.length, 2.4, 4.2, t)));
  fade(fnSurf, 1 - gone);
  patches.forEach((o, k) => fade(o, order(k, patches.length, 6.4, 10.0, t)));
});

stage.start();
