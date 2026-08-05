/**
 * Riemann sums for a 1D function, midpoint rule.
 *
 * Three modes:
 *   sum       the whole sum at once, N on a slider
 *   sweep     bars rise one at a time, left to right, behind a sweep line
 *   converge  N ramps geometrically over the loop — the convergence shot,
 *             which a slider cannot produce in an exported video
 *
 * Bars are one instanced mesh, so N in the hundreds costs nothing. The gap
 * between them is a constant *fraction* of the bar width, which means it is a
 * visible seam at small N and falls below a pixel at large N — the bars merge
 * into a solid region exactly as the sum converges.
 */

import * as THREE from 'three';
import { createStage, createUI, C, flat } from '@';
import { axes2d, graph2d, polyline } from '@/lines';
import { label, setText, fixed } from '@/text';
// Shared with the Monte Carlo demo, so the two integrate provably the same
// thing and their numbers are directly comparable on a slide.
import { A, B, lumpy as f, LUMPY_AREA as EXACT } from '@/functions';

// ---------------------------------------------------------------------------
// Stage
// ---------------------------------------------------------------------------

// The domain sets the minimum half-width, and 16:9 then fixes the half-height.
// Kept just wide enough for [A, B] so the graph fills the frame instead of
// floating in a sea of black.
const ORTHO_H = 1.9;
const HALF_W = ORTHO_H * (16 / 9); // 3.38, against a domain half-width of 3
const CAM_Y = 1.2;

const stage = createStage({
  camera: 'ortho',
  position: [0, CAM_Y, 10],
  target: [0, CAM_Y, 0],
  orthoHeight: ORTHO_H,
  lights: false,
  controls: false,
});
stage.duration = 8;
// The finished sum is the point of both animated modes, so the ramp completes
// early and the picture sits on its last subdivision before the loop restarts.
const HOLD = 1.6;

const ui = createUI(stage);

const VIEW_LEFT = -HALF_W;

// ---------------------------------------------------------------------------
// Static scenery
// ---------------------------------------------------------------------------

const axes = axes2d({ xRange: [-HALF_W + 0.08, HALF_W - 0.08], yRange: [-0.28, 3.0], tick: 1 });
axes.position.z = -0.05;
stage.add(axes);

const curve = graph2d(f, A, B, { samples: 900, color: C.ochre, width: 5 });
stage.add(curve);

// Domain boundaries — makes the interval being integrated explicit.
for (const x of [A, B]) {
  stage.add(polyline([[x, -0.14, 0], [x, 2.95, 0]], { color: C.slateDeep, width: 2, opacity: 0.8 }));
}

// ---------------------------------------------------------------------------
// Bars
// ---------------------------------------------------------------------------

const MAX_N = 400;

// Unit square with its bottom edge on the origin, so an instance's y-scale is
// directly its height and it always grows upward from the axis.
const barGeom = new THREE.PlaneGeometry(1, 1);
barGeom.translate(0, 0.5, 0);

const bars = new THREE.InstancedMesh(
  barGeom,
  flat(C.moss, { transparent: true, opacity: 0.9 }),
  MAX_N,
);
bars.position.z = -0.02;
bars.frustumCulled = false;
bars.count = 0;
stage.add(bars);

// The midpoint sample on each bar, where it touches the curve.
const dots = new THREE.InstancedMesh(new THREE.CircleGeometry(0.028, 16), flat(C.bone), MAX_N);
dots.position.z = 0.01;
dots.frustumCulled = false;
dots.count = 0;
stage.add(dots);

const sweepLine = polyline([[0, -0.22, 0], [0, 2.95, 0]], {
  color: C.bone,
  width: 2,
  opacity: 0.65,
});
sweepLine.position.z = 0.02;
stage.add(sweepLine);

// ---------------------------------------------------------------------------
// Readout
// ---------------------------------------------------------------------------

// A single row under the axis, in fixed cells. Cells matter: with one long
// string, N going 9 -> 10 would shove every later number sideways, and a
// jittering readout is very visible in a video.
const CELL_X = [-3.2, -1.45, 0.3, 2.05];
const CELL_KEYS = ['N', 'sum', 'exact', 'error'];
const ROW_Y = -0.42;

const values: ReturnType<typeof label>[] = CELL_KEYS.map((key, i) => {
  stage.add(
    label(key, {
      size: 0.13,
      color: C.slate,
      anchorY: 'middle',
      position: [CELL_X[i], ROW_Y, 0.05],
    }),
  );
  const v = label('', {
    size: 0.13,
    color: C.bone,
    anchorY: 'middle',
    position: [CELL_X[i] + 0.5, ROW_Y, 0.05],
  });
  stage.add(v);
  return v;
});

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

const params = {
  mode: 'sum' as 'sum' | 'sweep' | 'converge',
  N: 16,
  samples: true,
};
ui.params.add(params, 'mode', ['sum', 'sweep', 'converge']).name('mode');
ui.params.add(params, 'N', 1, 300, 1).name('N (bars)');
ui.params.add(params, 'samples').name('midpoint dots');

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

const dummy = new THREE.Object3D();
const smoothstep = (x: number) => {
  const u = Math.min(Math.max(x, 0), 1);
  return u * u * (3 - 2 * u);
};

stage.frame((t) => {
  const u = stage.progress(t, HOLD);

  let n = Math.round(params.N);
  if (params.mode === 'converge') {
    // Geometric ramp from 2 up to N: the early subdivisions are the
    // interesting ones, and a linear ramp would rush straight past them.
    n = Math.round(Math.exp(Math.log(2) + (Math.log(Math.max(params.N, 2)) - Math.log(2)) * u));
  }
  n = Math.min(Math.max(n, 1), MAX_N);

  const dx = (B - A) / n;
  const sweeping = params.mode === 'sweep';
  const sweepX = sweeping ? A + (B - A) * u : B;
  // Rise window spans a few bars, so a small wave of them is mid-growth.
  const rise = Math.max(dx * 2.5, 1e-6);

  let sum = 0;
  let visibleDots = 0;

  for (let i = 0; i < n; i++) {
    const left = A + i * dx;
    const mid = left + dx / 2;
    const h = f(mid);
    const p = sweeping ? smoothstep((sweepX - left) / rise) : 1;

    sum += h * dx * p;

    dummy.position.set(mid, 0, 0);
    dummy.scale.set(dx * 0.95, Math.max(h * p, 1e-6), 1);
    dummy.updateMatrix();
    bars.setMatrixAt(i, dummy.matrix);

    if (params.samples && p > 0.999) {
      dummy.position.set(mid, h, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      dots.setMatrixAt(visibleDots++, dummy.matrix);
    }
  }

  bars.count = n;
  bars.instanceMatrix.needsUpdate = true;
  dots.count = visibleDots;
  dots.instanceMatrix.needsUpdate = true;

  sweepLine.visible = sweeping;
  sweepLine.position.x = sweepX;

  // Mid-sweep the sum covers only part of [A, B], so comparing it against the
  // whole area would show a huge "error" and read as the method failing. It is
  // only a meaningful number once every bar is up.
  const complete = !sweeping || sweepX >= B - 1e-9;
  setText(values[0], String(n));
  setText(values[1], fixed(sum));
  setText(values[2], fixed(EXACT));
  setText(values[3], complete ? fixed(Math.abs(EXACT - sum)) : '-');
});

stage.start();
