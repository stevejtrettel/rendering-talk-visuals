/**
 * Monte Carlo integration of the same function the Riemann demo uses.
 *
 * Each sample shoots a spike up to the curve at x_i, and carries a
 * semi-transparent bar of height f(x_i) and width equal to its weight,
 *
 *     w_i = 1 / (N · p(x_i))
 *
 * so the bar's *area* is exactly that sample's contribution and the total
 * inked area is the estimate. Under a uniform density every weight is
 * (B−A)/N, so the bars all shrink together as samples accumulate.
 *
 * The payoff is the `matched` density: sampling proportional to f makes every
 * bar the same area — tall and thin where f is large, short and wide where it
 * is small — and the estimate is exact at any N. That is importance sampling,
 * and it is why a path tracer aims its rays at the light.
 *
 * Bars blend additively, so overlap reads as brightness: sample density shows
 * up as glow, the way accumulated light does in a render.
 */

import * as THREE from 'three';
import { createStage, createUI, C, flat } from '@';
import { axes2d, graph2d, polyline } from '@/lines';
import { label, setText, fixed } from '@/text';
import { A, B, lumpy as f, LUMPY_AREA as EXACT, simpson } from '@/functions';
import { Distribution1D, uniformStream } from '@/sampling';

// ---------------------------------------------------------------------------
// Stage — matched to the Riemann demo so the two cut together on a slide
// ---------------------------------------------------------------------------

const ORTHO_H = 1.9;
const HALF_W = ORTHO_H * (16 / 9);
const CAM_Y = 1.2;

const stage = createStage({
  camera: 'ortho',
  position: [0, CAM_Y, 10],
  target: [0, CAM_Y, 0],
  orthoHeight: ORTHO_H,
  lights: false,
  controls: false,
});
stage.duration = 10;
// The converged estimate is the point, so the ramp completes early and the
// picture sits on its final N before the loop restarts.
const HOLD = 2.0;

const ui = createUI(stage);
const VIEW_LEFT = -HALF_W;

// ---------------------------------------------------------------------------
// Densities
// ---------------------------------------------------------------------------

/** A deliberately bad density: piles samples into one corner of the domain. */
const skewed = (x: number) => 0.05 + Math.exp(-Math.pow((x - A - 0.9) / 0.75, 2));

const DENSITIES = {
  // Flat: every weight is (B - A) / N, the textbook case.
  uniform: new Distribution1D(() => 1, A, B),
  // Proportional to f: every sample contributes the same, variance is zero.
  matched: new Distribution1D(f, A, B),
  // Badly mismatched: most samples land where f contributes little, and the
  // few that stray into the rest of the domain carry enormous weight.
  skewed: new Distribution1D(skewed, A, B),
};
type DensityName = keyof typeof DENSITIES;

// ---------------------------------------------------------------------------
// Samples — a fixed stream, so frame-stepped export is reproducible
// ---------------------------------------------------------------------------

const MAX_N = 2000;
const U = uniformStream(MAX_N, 1234);

// ---------------------------------------------------------------------------
// Static scenery
// ---------------------------------------------------------------------------

const axes = axes2d({ xRange: [-HALF_W + 0.08, HALF_W - 0.08], yRange: [-0.28, 3.0], tick: 1 });
axes.position.z = -0.05;
stage.add(axes);

for (const x of [A, B]) {
  stage.add(polyline([[x, -0.14, 0], [x, 2.95, 0]], { color: C.slateDeep, width: 2, opacity: 0.8 }));
}

const curve = graph2d(f, A, B, { samples: 900, color: C.ochre, width: 5 });
curve.position.z = 0.03;
stage.add(curve);

// The density being sampled from, drawn faintly so you can see where samples
// are being aimed. Scaled to a fixed height — it is a shape, not a quantity.
const PDF_PLOT_H = 0.85;
let pdfPlot: ReturnType<typeof polyline> | null = null;

// ---------------------------------------------------------------------------
// Bars and spikes
// ---------------------------------------------------------------------------

const barGeom = new THREE.PlaneGeometry(1, 1);
barGeom.translate(0, 0.5, 0);

// Additive blending: overlapping bars sum toward bright, so sample density
// reads as luminance. depthWrite off, or bars would occlude each other and
// defeat the whole point.
const barMat = flat(C.moss, {
  transparent: true,
  opacity: 0.4,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});
const bars = new THREE.InstancedMesh(barGeom, barMat, MAX_N);
bars.position.z = -0.02;
bars.frustumCulled = false;
bars.count = 0;
stage.add(bars);

const spikeMat = flat(C.bone, { transparent: true, opacity: 0.55 });
const spikes = new THREE.InstancedMesh(barGeom, spikeMat, MAX_N);
spikes.position.z = 0.01;
spikes.frustumCulled = false;
spikes.count = 0;
stage.add(spikes);

// ---------------------------------------------------------------------------
// Readout
// ---------------------------------------------------------------------------

const CELL_X = [-3.2, -1.45, 0.3, 2.05];
const CELL_KEYS = ['N', 'estimate', 'exact', 'error'];
const ROW_Y = -0.42;

const values = CELL_KEYS.map((key, i) => {
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
    position: [CELL_X[i] + 0.72, ROW_Y, 0.05],
  });
  stage.add(v);
  return v;
});

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

const params = {
  mode: 'stream' as 'stream' | 'fixed',
  density: 'uniform' as DensityName,
  N: 400,
  spikes: true,
  showPdf: true,
  glow: 0.4,
};
ui.params.add(params, 'mode', ['stream', 'fixed']).name('mode');
ui.params.add(params, 'density', Object.keys(DENSITIES)).name('sample from').onChange(rebuildPdfPlot);
ui.params.add(params, 'N', 1, MAX_N, 1).name('N (samples)');
ui.params.add(params, 'spikes').name('spikes');
ui.params.add(params, 'showPdf').name('show density').onChange(rebuildPdfPlot);
ui.params.add(params, 'glow', 0.05, 1, 0.01).name('bar glow').onChange((v: number) => {
  barMat.opacity = v;
});

/** Redraw the faint density curve when the density or its visibility changes. */
function rebuildPdfPlot(): void {
  if (pdfPlot) {
    stage.scene.remove(pdfPlot);
    pdfPlot.geometry.dispose();
    pdfPlot = null;
  }
  if (!params.showPdf) return;

  const dist = DENSITIES[params.density];
  // Normalise by the peak so every density is drawn at the same height.
  let peak = 0;
  for (let i = 0; i <= 400; i++) peak = Math.max(peak, dist.pdf(A + ((B - A) * i) / 400));
  if (peak <= 0) return;

  const pts: [number, number, number][] = [];
  for (let i = 0; i <= 400; i++) {
    const x = A + ((B - A) * i) / 400;
    pts.push([x, (dist.pdf(x) / peak) * PDF_PLOT_H, 0]);
  }
  // Dashed, so it reads as "the density we are sampling from" rather than as a
  // second graph — a solid flat line for the uniform case looks like a stray rule.
  pdfPlot = polyline(pts, {
    color: C.blue,
    width: 2,
    opacity: 0.5,
    dashed: true,
    dashSize: 0.1,
    gapSize: 0.07,
  });
  pdfPlot.position.z = -0.03;
  stage.add(pdfPlot);
}
rebuildPdfPlot();

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

const dummy = new THREE.Object3D();
// Spike width in world units — thin enough to read as a line at any N.
const SPIKE_W = 0.006;

stage.frame((t) => {
  const u = stage.progress(t, HOLD);

  let n = Math.round(params.N);
  if (params.mode === 'stream') {
    // Geometric ramp from 1: early samples are where the estimate lurches
    // around, and a linear ramp would blur straight past them.
    n = Math.round(Math.exp(Math.log(1) + Math.log(Math.max(params.N, 1)) * u));
  }
  n = Math.min(Math.max(n, 1), MAX_N);

  const dist = DENSITIES[params.density];
  let sum = 0;

  for (let i = 0; i < n; i++) {
    const x = dist.sample(U[i]);
    const h = f(x);
    const p = dist.pdf(x);
    // Weight of this sample. A vanishing pdf would mean an unbounded weight;
    // clamp so one unlucky sample cannot blow the geometry off the screen.
    const w = p > 1e-9 ? 1 / (n * p) : 0;
    sum += h * w;

    dummy.position.set(x, 0, 0);
    dummy.scale.set(Math.min(w, (B - A) * 1.5), h, 1);
    dummy.updateMatrix();
    bars.setMatrixAt(i, dummy.matrix);

    dummy.scale.set(SPIKE_W, h, 1);
    dummy.updateMatrix();
    spikes.setMatrixAt(i, dummy.matrix);
  }

  bars.count = n;
  bars.instanceMatrix.needsUpdate = true;
  spikes.count = params.spikes ? n : 0;
  spikes.instanceMatrix.needsUpdate = true;

  // Fade the spikes as samples pile up. At N in the hundreds they sit closer
  // together than they are wide, and at full strength they turn into a solid
  // pale comb that hides the very accumulation the bars are there to show.
  spikeMat.opacity = Math.max(0.05, 0.55 * Math.min(1, 50 / n));

  setText(values[0], String(n));
  setText(values[1], fixed(sum));
  setText(values[2], fixed(EXACT));
  setText(values[3], fixed(Math.abs(EXACT - sum)));
});

stage.start();
