/**
 * Reflection is not a law here. It is a derivative.
 *
 * Fix the ends and fix the combinatorics — one bounce, off this mirror — and
 * what is left free is a single coordinate: where along the surface the vertex
 * sits. Optical path length is then an ordinary function of that one number,
 *
 *   ℓ(t) = η₁ |P(t) − A| + η₂ |B − P(t)|,
 *
 * and the physical paths are its **critical points**. Nothing about reflection
 * is assumed anywhere in this demo. The mirror is a curve, the vertex slides
 * along it, ℓ is plotted, and wherever the graph goes flat the two angles come
 * out equal — because that is what ℓ′(t) = 0 says.
 *
 * ## Why flat means equal angles
 *
 * P(t) traces the surface, so P′(t) is tangent to it, and
 *
 *   ℓ′(t) = (η₁ d̂_A + η₂ d̂_B) · P′(t),
 *
 * with d̂ the unit vectors from the vertex out along each leg. Vanishing means
 * that combination has no tangential part — it is **normal to the surface**.
 * With η₁ = η₂ that is the law of reflection; with η₁ ≠ η₂ it is Snell's. One
 * derivative, both laws, and the slide's line about the vertex being confined
 * to a surface is the entire content of "no tangential part".
 *
 * The readout checks it numerically as the vertex sweeps: the two angles, or
 * the two sides of η sin θ, printed side by side. They agree to the digits
 * shown exactly where the tangent line on the graph is horizontal, and nowhere
 * else.
 *
 * ## Stationary, not shortest
 *
 * At the default curvature this mirror has three physical paths, and the middle
 * one is a **local maximum** of ℓ — the longest of the nearby paths, and every
 * bit as physical as the other two. "Least time" is the version of Fermat that
 * is taught and it is wrong; the correct statement is stationary time, which is
 * exactly what a critical point is. The graph makes the maximum impossible to
 * miss, so the demo argues the point rather than asserting it.
 *
 * Wind `curvature` down to zero and two of the three annihilate, leaving the
 * one path a flat mirror has. That merging is the beginning of the caustic
 * story — where the second derivative degenerates, chains merge and vanish.
 *
 * ## The critical points are solved for, not eyeballed
 *
 * ℓ′ is evaluated in closed form and its sign changes are bracketed and
 * bisected, so the marked paths are the actual roots rather than the finest
 * point of a scan. Everything is recomputed when the shape changes, which is
 * why the curvature slider is live rather than a rebuild button.
 */

import * as THREE from 'three';
import { createStage, createUI, BACKGROUND, C, flat, mix } from '@';
import { polyline, setPolyline, type Pt } from '@/lines';
import { label, setText, fixed } from '@/text';

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

const stage = createStage({
  camera: 'ortho',
  position: [0, 0, 10],
  target: [0, 0, 0],
  orthoHeight: 3.0,
  lights: false,
  controls: false,
});

const ui = createUI(stage);

/** The stretch of mirror the vertex is allowed to visit, and the graph's x-axis. */
const T0 = -2.4;
const T1 = 2.4;

/**
 * How much surface is *drawn*. Wider than the sweep, and out to the edges of
 * the left-hand panel, so a glass body reads as a half-space rather than as a
 * block floating in the corner.
 */
const TD0 = -3.05;
const TD1 = 2.95;

/** Samples along the mirror and along the graph. */
const SAMPLES = 360;

/** Room for as many physical paths as the shape can produce. */
const MAX_CRIT = 7;

/** Scene-to-world for the left-hand picture. */
const GS = 0.92;
const PANEL_X = -2.55;
const PANEL_Y = 0.15;
const gx = (x: number): number => PANEL_X + x * GS;
const gy = (y: number): number => PANEL_Y + y * GS;

/** The graph box on the right. */
const GX0 = 0.85;
const GX1 = 5.05;
const GY0 = -1.35;
const GY1 = 1.75;

const qx = (t: number): number => GX0 + ((t - T0) / (T1 - T0)) * (GX1 - GX0);

/** Set on every rebuild, from the range ℓ actually takes on this shape. */
let lMin = 0;
let lMax = 1;
const qy = (l: number): number => GY0 + ((l - lMin) / (lMax - lMin)) * (GY1 - GY0);

// ---------------------------------------------------------------------------
// The scene: two points and a mirror
// ---------------------------------------------------------------------------

const A: [number, number] = [-1.5, 1.5];
/** Where the light is going. Above the surface to reflect, below it to refract. */
const B_REFLECT: [number, number] = [1.6, 1.25];
const B_REFRACT: [number, number] = [1.5, -2.4];

const MY = -1.5;
const AMP = 0.28;
const FREQ = 2.3;
const PHASE = -0.6;

const params = {
  mode: 'mirror' as 'mirror' | 'glass',
  curvature: 1,
  index: 1.5,
  animate: true,
  position: 0,
};

const M = (t: number): number => MY + params.curvature * AMP * Math.sin(FREQ * t + PHASE);
const dM = (t: number): number =>
  params.curvature * AMP * FREQ * Math.cos(FREQ * t + PHASE);

const targetB = (): [number, number] => (params.mode === 'glass' ? B_REFRACT : B_REFLECT);
const eta2 = (): number => (params.mode === 'glass' ? params.index : 1);

/** Optical path length: the one function this whole demo is about. */
function pathLength(t: number): number {
  const b = targetB();
  const px = t;
  const py = M(t);
  return (
    Math.hypot(px - A[0], py - A[1]) + eta2() * Math.hypot(b[0] - px, b[1] - py)
  );
}

/**
 * Its derivative, in closed form: (η₁ d̂_A + η₂ d̂_B) · P′. Vanishes exactly
 * when that combination is normal to the surface.
 */
function dPathLength(t: number): number {
  const b = targetB();
  const px = t;
  const py = M(t);
  const tx = 1;
  const ty = dM(t);
  const ax = px - A[0];
  const ay = py - A[1];
  const la = Math.hypot(ax, ay);
  const bx = px - b[0];
  const by = py - b[1];
  const lb = Math.hypot(bx, by);
  return (ax * tx + ay * ty) / la + (eta2() * (bx * tx + by * ty)) / lb;
}

/** Sign changes of ℓ′, bracketed on a fine scan and then bisected. */
function criticalPoints(): number[] {
  const out: number[] = [];
  const N = 2000;
  let prev = dPathLength(T0);
  for (let i = 1; i <= N; i++) {
    const t = T0 + ((T1 - T0) * i) / N;
    const cur = dPathLength(t);
    if (prev * cur < 0) {
      let lo = T0 + ((T1 - T0) * (i - 1)) / N;
      let hi = t;
      for (let k = 0; k < 60; k++) {
        const mid = (lo + hi) / 2;
        if (dPathLength(lo) * dPathLength(mid) <= 0) hi = mid;
        else lo = mid;
      }
      out.push((lo + hi) / 2);
      if (out.length >= MAX_CRIT) break;
    }
    prev = cur;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

const mirrorPts: Pt[] = [];
for (let i = 0; i <= SAMPLES; i++) mirrorPts.push([0, 0, 0]);
const mirror = polyline(mirrorPts, { color: C.slate, width: 5 });

/** Filled body under the interface — only meaningful when it is glass. */
const bodyGeom = new THREE.BufferGeometry();
const bodyPos = new Float32Array((SAMPLES + 1) * 2 * 3);
bodyGeom.setAttribute('position', new THREE.BufferAttribute(bodyPos, 3));
{
  const idx: number[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    const a = 2 * i;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  bodyGeom.setIndex(idx);
}
const body = new THREE.Mesh(
  bodyGeom,
  flat(C.blueDeep, { transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
);
body.position.z = -0.3;

const dot = (color: number, r = 0.075) =>
  new THREE.Mesh(new THREE.CircleGeometry(r, 24), flat(color));

const markA = dot(C.ochre, 0.085);
markA.position.set(gx(A[0]), gy(A[1]), 0.3);
const markB = dot(C.bone, 0.085);

stage.add(
  mirror,
  body,
  markA,
  markB,
  label('A', { size: 0.24, color: C.ochre, anchorX: 'center', position: [gx(A[0]), gy(A[1]) + 0.16, 0.3] }),
);

const labelB = label('B', { size: 0.24, color: C.bone, anchorX: 'center' });
stage.add(labelB);

/**
 * The physical paths, revealed as the sweep reaches each one. Held back from
 * full ochre by colour rather than opacity — over black they read the same, and
 * a transparent Line2 double-blends at its joins — so the white path under
 * inspection still comes forward once three of these are on screen.
 */
const FOUND = mix(BACKGROUND, C.ochre, 0.78);
const critPaths = Array.from({ length: MAX_CRIT }, () => {
  const l = polyline([[0, 0, 0], [0, 0, 0], [0, 0, 0]], { color: FOUND, width: 3.2 });
  l.position.z = 0.1;
  l.visible = false;
  stage.add(l);
  return l;
});

/** The path currently under inspection. */
const sweepPath = polyline([[0, 0, 0], [0, 0, 0], [0, 0, 0]], { color: C.bone, width: 2.6 });
sweepPath.position.z = 0.2;
stage.add(sweepPath);

const vertexDot = dot(C.bone, 0.07);
vertexDot.position.z = 0.35;
stage.add(vertexDot);

/** The surface normal at the vertex — the direction criticality points along. */
const normalLine = polyline([[0, 0, 0], [0, 0, 0]], {
  color: C.slate,
  width: 2,
  dashed: true,
  dashSize: 0.09,
  gapSize: 0.07,
});
normalLine.position.z = 0.15;
stage.add(normalLine);

const ARC_N = 28;
function arc(color: number) {
  const pts: Pt[] = [];
  for (let i = 0; i <= ARC_N; i++) pts.push([0, 0, 0]);
  const l = polyline(pts, { color, width: 3 });
  l.position.z = 0.25;
  stage.add(l);
  return l;
}
const arcIn = arc(C.blue);
const arcOut = arc(C.moss);

// ---------------------------------------------------------------------------
// The graph
// ---------------------------------------------------------------------------

stage.add(
  polyline([[GX0, GY1, 0], [GX0, GY0, 0], [GX1, GY0, 0]], { color: C.slate, width: 2.4 }),
);

const graphPts: Pt[] = [];
for (let i = 0; i <= SAMPLES; i++) graphPts.push([0, 0, 0]);
const graphCurve = polyline(graphPts, { color: C.bone, width: 3.5 });
graphCurve.position.z = 0.1;
stage.add(graphCurve);

/** Where the graph is flat, and therefore where the physics is. */
const critMarks = Array.from({ length: MAX_CRIT }, () => {
  const g = new THREE.Group();
  const stem = polyline([[0, 0, 0], [0, 0, 0]], {
    color: C.ochreDeep,
    width: 1.6,
    dashed: true,
    dashSize: 0.1,
    gapSize: 0.08,
  });
  const d = dot(C.ochre, 0.075);
  d.position.z = 0.2;
  g.add(stem, d);
  g.visible = false;
  stage.add(g);
  return { group: g, stem, dot: d };
});

const graphDot = dot(C.bone, 0.075);
graphDot.position.z = 0.3;
stage.add(graphDot);

/** The tangent whose going flat *is* the physical condition. */
const tangent = polyline([[0, 0, 0], [0, 0, 0]], { color: C.rust, width: 3.2 });
tangent.position.z = 0.25;
stage.add(tangent);

stage.add(
  label('optical path length', {
    size: 0.22,
    color: C.bone,
    position: [GX0, GY1 + 0.22, 0],
  }),
  label('where the path meets the surface', {
    size: 0.2,
    color: C.ash,
    anchorX: 'center',
    position: [(GX0 + GX1) / 2, GY0 - 0.42, 0],
  }),
);

const slopeReadout = label('', {
  size: 0.26,
  color: C.rust,
  anchorX: 'center',
  position: [(GX0 + GX1) / 2, GY0 - 1.0, 0],
});
const lawReadout = label('', {
  size: 0.22,
  color: C.ash,
  anchorX: 'center',
  position: [gx(0), 2.35, 0],
});
stage.add(slopeReadout, lawReadout);

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

ui.params.add(params, 'mode', ['mirror', 'glass']).name('surface');
ui.params.add(params, 'curvature', 0, 1.6, 0.01).name('curvature');
ui.params.add(params, 'index', 1.05, 2.2, 0.01).name('index (glass)');
ui.params.add(params, 'animate').name('sweep the vertex');
ui.params.add(params, 'position', T0, T1, 0.001).name('vertex position');

// ---------------------------------------------------------------------------
// Rebuild when the shape changes
// ---------------------------------------------------------------------------

let crit: number[] = [];
let shapeKey = '';

function rebuild(): void {
  const key = `${params.mode}|${params.curvature}|${params.index}`;
  if (key === shapeKey) return;
  shapeKey = key;

  const b = targetB();
  markB.position.set(gx(b[0]), gy(b[1]), 0.3);
  labelB.position.set(gx(b[0]), gy(b[1]) + (params.mode === 'glass' ? -0.42 : 0.16), 0.3);

  // The surface itself.
  const mp: Pt[] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const t = TD0 + ((TD1 - TD0) * i) / SAMPLES;
    mp.push([gx(t), gy(M(t)), 0]);
  }
  setPolyline(mirror, mp);

  // The body below it, as a ribbon down past the bottom of the frame.
  for (let i = 0; i <= SAMPLES; i++) {
    const t = TD0 + ((TD1 - TD0) * i) / SAMPLES;
    const o = i * 6;
    bodyPos[o] = gx(t);
    bodyPos[o + 1] = gy(M(t));
    bodyPos[o + 2] = 0;
    bodyPos[o + 3] = gx(t);
    bodyPos[o + 4] = -3.1;
    bodyPos[o + 5] = 0;
  }
  bodyGeom.attributes.position.needsUpdate = true;
  bodyGeom.computeBoundingSphere();
  body.visible = params.mode === 'glass';

  // The graph, scaled to whatever range ℓ takes on this shape.
  const vals: number[] = [];
  lMin = Infinity;
  lMax = -Infinity;
  for (let i = 0; i <= SAMPLES; i++) {
    const v = pathLength(T0 + ((T1 - T0) * i) / SAMPLES);
    vals.push(v);
    lMin = Math.min(lMin, v);
    lMax = Math.max(lMax, v);
  }
  // A little air, so the extremes are not welded to the box.
  const pad = 0.08 * (lMax - lMin || 1);
  lMin -= pad;
  lMax += pad;

  const gp: Pt[] = vals.map((v, i) => [qx(T0 + ((T1 - T0) * i) / SAMPLES), qy(v), 0]);
  setPolyline(graphCurve, gp);

  crit = criticalPoints();
  for (let i = 0; i < MAX_CRIT; i++) {
    const mark = critMarks[i];
    if (i >= crit.length) {
      mark.group.visible = false;
      continue;
    }
    const t = crit[i];
    const y = qy(pathLength(t));
    setPolyline(mark.stem, [[qx(t), GY0, 0], [qx(t), y, 0]]);
    mark.dot.position.set(qx(t), y, 0.2);
    mark.group.visible = false; // revealed by the sweep
  }
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

const LEAD = 0.6;
const SWEEP = 9.0;
const TAIL = 2.4;
stage.duration = LEAD + SWEEP + TAIL;

/** Angle between two unit vectors, in degrees. */
const angleBetween = (ux: number, uy: number, vx: number, vy: number): number =>
  (Math.acos(Math.max(-1, Math.min(1, ux * vx + uy * vy))) * 180) / Math.PI;

function setArc(
  line: ReturnType<typeof polyline>,
  cx: number,
  cy: number,
  a0: number,
  a1: number,
  r: number,
): void {
  let d = a1 - a0;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  const pts: Pt[] = [];
  for (let i = 0; i <= ARC_N; i++) {
    const a = a0 + (d * i) / ARC_N;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a), 0]);
  }
  setPolyline(line, pts);
}

stage.frame((t) => {
  rebuild();

  const u = t % stage.duration;
  const swept = Math.min(1, Math.max(0, (u - LEAD) / SWEEP));
  const tv = params.animate ? T0 + (T1 - T0) * swept : params.position;

  const b = targetB();
  const px = tv;
  const py = M(tv);
  const wx = gx(px);
  const wy = gy(py);

  vertexDot.position.set(wx, wy, 0.35);
  setPolyline(sweepPath, [
    [gx(A[0]), gy(A[1]), 0],
    [wx, wy, 0],
    [gx(b[0]), gy(b[1]), 0],
  ]);

  // The surface normal, and the two legs, as unit vectors in scene coordinates.
  const nl = Math.hypot(-dM(tv), 1);
  const nx = -dM(tv) / nl;
  const ny = 1 / nl;
  setPolyline(normalLine, [
    [wx - nx * 0.35 * GS, wy - ny * 0.35 * GS, 0],
    [wx + nx * 1.0 * GS, wy + ny * 1.0 * GS, 0],
  ]);

  const ax = A[0] - px;
  const ay = A[1] - py;
  const la = Math.hypot(ax, ay);
  const bx = b[0] - px;
  const by = b[1] - py;
  const lb = Math.hypot(bx, by);

  // On the far side of a refracting surface the relevant reference is −n.
  const outSign = params.mode === 'glass' ? -1 : 1;
  const thetaIn = angleBetween(ax / la, ay / la, nx, ny);
  const thetaOut = angleBetween(bx / lb, by / lb, outSign * nx, outSign * ny);

  const R = 0.5 * GS;
  const nAng = Math.atan2(ny, nx);
  setArc(arcIn, wx, wy, nAng, Math.atan2(ay, ax), R);
  setArc(arcOut, wx, wy, outSign > 0 ? nAng : nAng + Math.PI, Math.atan2(by, bx), R * 0.82);

  if (params.mode === 'glass') {
    const si = Math.sin((thetaIn * Math.PI) / 180);
    const st = Math.sin((thetaOut * Math.PI) / 180);
    setText(
      lawReadout,
      `sin in  ${fixed(si, 3)}          ${fixed(params.index, 2)} x sin out  ${fixed(params.index * st, 3)}`,
    );
  } else {
    setText(lawReadout, `angle in  ${fixed(thetaIn, 1)}          angle out  ${fixed(thetaOut, 1)}`);
  }

  // The graph: the marker, and the tangent whose flatness is the whole point.
  const lv = pathLength(tv);
  const slope = dPathLength(tv);
  graphDot.position.set(qx(tv), qy(lv), 0.3);

  // The tangent, in the graph's own aspect. Drawn at a fixed *length* rather
  // than a fixed run, so a steep part of the curve does not throw it out of the
  // box and across the axis label.
  const sx = (GX1 - GX0) / (T1 - T0);
  const sy = (GY1 - GY0) / (lMax - lMin);
  const dirX = sx;
  const dirY = sy * slope;
  const dl = Math.hypot(dirX, dirY) || 1;
  const half = 0.62;
  const dxw = (dirX / dl) * half;
  const dyw = (dirY / dl) * half;
  setPolyline(tangent, [
    [qx(tv) - dxw, qy(lv) - dyw, 0],
    [qx(tv) + dxw, qy(lv) + dyw, 0],
  ]);

  const flatEnough = Math.abs(slope) < 0.02;
  (tangent.material as THREE.Material & { color: THREE.Color }).color.setHex(
    flatEnough ? C.ochre : C.rust,
  );
  setText(slopeReadout, `slope  ${fixed(slope, 3)}`);
  (slopeReadout as unknown as { color: number }).color = flatEnough ? C.ochre : C.rust;
  (lawReadout as unknown as { color: number }).color = flatEnough ? C.ochre : C.ash;

  // Physical paths stay behind, once the sweep has passed them.
  for (let i = 0; i < MAX_CRIT; i++) {
    const found = i < crit.length && tv >= crit[i];
    critPaths[i].visible = found;
    critMarks[i].group.visible = found;
    if (found) {
      setPolyline(critPaths[i], [
        [gx(A[0]), gy(A[1]), 0],
        [gx(crit[i]), gy(M(crit[i])), 0],
        [gx(b[0]), gy(b[1]), 0],
      ]);
    }
  }
});

stage.start();

rebuild();
console.info(
  `fermat-critical: ${crit.length} critical points at ` +
    `${crit.map((c) => c.toFixed(3)).join(', ')}`,
);
