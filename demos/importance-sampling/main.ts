/**
 * Uniform vs normal sampling, side by side — why path tracers aim their rays.
 *
 * The same integrand in both panels, the same N, and *the same underlying
 * random numbers*: both panels draw u_1, u_2, … from one seeded stream and
 * differ only in how those uniforms are mapped onto the domain. So any
 * difference you see is the aiming, not luck.
 *
 * The integrand is a bump with dead tails, so uniform sampling spends most of
 * its samples where there is nothing to find. A normal proposal of roughly the
 * right width puts them where the area is.
 *
 * Three modes:
 *   stream   N ramps up over the loop — watch both estimates settle
 *   fixed    N on the slider, static
 *   reroll   N held fixed while the *seed* advances, so the uniform estimate
 *            visibly jitters and the normal one barely moves. Variance as
 *            motion rather than as a number.
 *
 * Everything stays a pure function of t, so exports are reproducible.
 */

import * as THREE from 'three';
import { createStage, createUI, C, flat } from '@';
import { axes2d, graph2d, polyline } from '@/lines';
import { label, setText } from '@/text';
import { BUMPY_A as A, BUMPY_B as B, BUMPY_SIGMA, bumpy as f, BUMPY_AREA as EXACT } from '@/functions';
import { Distribution1D, mulberry32 } from '@/sampling';
import type { Line2 } from 'three/examples/jsm/lines/Line2.js';

// ---------------------------------------------------------------------------
// Stage — one frame, two stacked panels
// ---------------------------------------------------------------------------

const HALF_W = 5.4; // domain is 10 wide, so this leaves a small margin
const ORTHO_H = (HALF_W * 9) / 16; // 3.04 — half-height of the whole frame

const stage = createStage({
  camera: 'ortho',
  position: [0, 0, 10],
  target: [0, 0, 0],
  orthoHeight: ORTHO_H,
  lights: false,
  controls: false,
});
stage.duration = 12;
/** Seconds at the end of the loop spent parked on the converged panels. */
const HOLD = 2.4;

const ui = createUI(stage);

// Peak of the integrand, used to scale it to a fixed height on screen. The
// y axis is in arbitrary display units — only relative bar areas matter.
let peakF = 0;
for (let i = 0; i <= 2000; i++) peakF = Math.max(peakF, f(A + ((B - A) * i) / 2000));
const PLOT_H = 2.1;
const Y = PLOT_H / peakF; // world units per unit of f

const MAX_N = 2000;
const SEED = 20260804;
const REROLLS = 20;

// ---------------------------------------------------------------------------
// Panels
// ---------------------------------------------------------------------------

const barGeom = new THREE.PlaneGeometry(1, 1);
barGeom.translate(0, 0.5, 0);

const CELL_X = [-5.2, -2.6, 0.05, 2.7];
const CELL_KEYS = ['N', 'estimate', 'exact', 'error'];

interface Panel {
  bars: THREE.InstancedMesh;
  spikes: THREE.InstancedMesh;
  rug: THREE.InstancedMesh;
  barMat: THREE.MeshBasicMaterial;
  spikeMat: THREE.MeshBasicMaterial;
  rugMat: THREE.MeshBasicMaterial;
  values: ReturnType<typeof label>[];
  group: THREE.Group;
  dist: Distribution1D;
  pdfPlot: Line2 | null;
}

/**
 * Build one panel. Local coordinates put the graph's x axis at y = 0, so the
 * whole thing can be dropped at any height in the frame.
 */
function makePanel(title: string, baselineY: number, dist: Distribution1D): Panel {
  const group = new THREE.Group();
  group.position.y = baselineY;

  const axes = axes2d({ xRange: [-HALF_W + 0.1, HALF_W - 0.1], yRange: [-0.12, PLOT_H + 0.1], tick: 1 });
  axes.position.z = -0.05;
  group.add(axes);

  for (const x of [A, B]) {
    group.add(
      polyline([[x, -0.1, 0], [x, PLOT_H + 0.05, 0]], {
        color: C.slateDeep,
        width: 2,
        opacity: 0.8,
      }),
    );
  }

  const curve = graph2d((x) => f(x) * Y, A, B, { samples: 900, color: C.ochre, width: 4 });
  curve.position.z = 0.03;
  group.add(curve);

  group.add(
    label(title, {
      size: 0.17,
      color: C.bone,
      position: [-HALF_W + 0.15, PLOT_H - 0.12, 0.05],
    }),
  );

  // Additive blending so overlapping samples read as brightness.
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
  group.add(bars);

  const spikeMat = flat(C.bone, { transparent: true, opacity: 0.5 });
  const spikes = new THREE.InstancedMesh(barGeom, spikeMat, MAX_N);
  spikes.position.z = 0.01;
  spikes.frustumCulled = false;
  spikes.count = 0;
  group.add(spikes);

  // A rug of marks on the axis, one per sample, drawn at full height whatever
  // the integrand does there. Without this the story is invisible: a uniform
  // sample landing in a dead tail has a zero-height bar and a zero-height
  // spike, so the waste that importance sampling exists to fix leaves no trace
  // on screen. The rug is where you actually see uniform spreading itself thin
  // across the whole domain while the normal piles up under the bump.
  const rugMat = flat(C.bone, { transparent: true, opacity: 0.6 });
  const rug = new THREE.InstancedMesh(barGeom, rugMat, MAX_N);
  rug.position.set(0, -0.16, 0.02);
  rug.frustumCulled = false;
  rug.count = 0;
  group.add(rug);

  const values = CELL_KEYS.map((key, i) => {
    group.add(
      label(key, {
        size: 0.13,
        color: C.slate,
        anchorY: 'middle',
        position: [CELL_X[i], -0.33, 0.05],
      }),
    );
    const v = label('', {
      size: 0.13,
      color: C.bone,
      anchorY: 'middle',
      position: [CELL_X[i] + 0.75, -0.33, 0.05],
    });
    group.add(v);
    return v;
  });

  stage.add(group);
  return { bars, spikes, rug, barMat, spikeMat, rugMat, values, group, dist, pdfPlot: null };
}

/** Draw (or redraw) the faint dashed density a panel is sampling from. */
function setPdfPlot(panel: Panel, show: boolean): void {
  if (panel.pdfPlot) {
    panel.group.remove(panel.pdfPlot);
    panel.pdfPlot.geometry.dispose();
    panel.pdfPlot = null;
  }
  if (!show) return;

  const { dist } = panel;
  let peak = 0;
  for (let i = 0; i <= 400; i++) peak = Math.max(peak, dist.pdf(A + ((B - A) * i) / 400));
  if (peak <= 0) return;

  const pts: [number, number, number][] = [];
  for (let i = 0; i <= 400; i++) {
    const x = A + ((B - A) * i) / 400;
    pts.push([x, (dist.pdf(x) / peak) * (PLOT_H * 0.42), 0]);
  }
  const line = polyline(pts, {
    color: C.blue,
    width: 2,
    opacity: 0.55,
    dashed: true,
    dashSize: 0.12,
    gapSize: 0.08,
  });
  line.position.z = -0.03;
  panel.group.add(line);
  panel.pdfPlot = line;
}

const gaussian = (mean: number, sigma: number) => (x: number) =>
  Math.exp(-0.5 * Math.pow((x - mean) / sigma, 2));

const top = makePanel('uniform', 0.5, new Distribution1D(() => 1, A, B));
const bottom = makePanel('normal', -2.6, new Distribution1D(gaussian(0, BUMPY_SIGMA), A, B));

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

const params = {
  mode: 'stream' as 'stream' | 'fixed' | 'reroll',
  N: 400,
  mean: 0,
  sigma: BUMPY_SIGMA,
  spikes: true,
  rug: true,
  showPdf: true,
  glow: 0.4,
};

ui.params.add(params, 'mode', ['stream', 'fixed', 'reroll']).name('mode');
ui.params.add(params, 'N', 1, MAX_N, 1).name('N (samples)');
ui.params.add(params, 'mean', -3, 3, 0.05).name('normal mean').onChange(rebuildNormal);
ui.params.add(params, 'sigma', 0.3, 4, 0.05).name('normal sigma').onChange(rebuildNormal);
ui.params.add(params, 'spikes').name('spikes');
ui.params.add(params, 'rug').name('sample marks');
ui.params.add(params, 'showPdf').name('show density').onChange(refreshPdfPlots);
ui.params.add(params, 'glow', 0.05, 1, 0.01).name('bar glow').onChange((v: number) => {
  top.barMat.opacity = v;
  bottom.barMat.opacity = v;
});

function rebuildNormal(): void {
  bottom.dist = new Distribution1D(gaussian(params.mean, params.sigma), A, B);
  setPdfPlot(bottom, params.showPdf);
}
function refreshPdfPlots(): void {
  setPdfPlot(top, params.showPdf);
  setPdfPlot(bottom, params.showPdf);
}
refreshPdfPlots();

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

const dummy = new THREE.Object3D();
const SPIKE_W = 0.006;
const RUG_W = 0.009;
const RUG_H = 0.1;
const MAX_BAR_W = (B - A) * 1.5;

/** Keep the readout a stable width even if a weight blows the estimate up. */
function fmt(v: number): string {
  const a = Math.abs(v);
  if (a >= 1000) return v.toExponential(2);
  if (a >= 100) return v.toFixed(1);
  if (a >= 10) return v.toFixed(2);
  return v.toFixed(3);
}

/** Draw one panel's samples and return its estimate. */
function updatePanel(panel: Panel, n: number, seed: number): number {
  const rng = mulberry32(seed);
  const { dist } = panel;
  let sum = 0;

  for (let i = 0; i < n; i++) {
    const x = dist.sample(rng());
    const h = f(x) * Y;
    const p = dist.pdf(x);
    const w = p > 1e-12 ? 1 / (n * p) : 0;
    sum += f(x) * w;

    dummy.position.set(x, 0, 0);
    dummy.scale.set(Math.min(w, MAX_BAR_W), Math.max(h, 1e-6), 1);
    dummy.updateMatrix();
    panel.bars.setMatrixAt(i, dummy.matrix);

    dummy.scale.set(SPIKE_W, Math.max(h, 1e-6), 1);
    dummy.updateMatrix();
    panel.spikes.setMatrixAt(i, dummy.matrix);

    // Rug mark: fixed height, so every sample shows up wherever it landed.
    dummy.position.set(x, 0, 0);
    dummy.scale.set(RUG_W, RUG_H, 1);
    dummy.updateMatrix();
    panel.rug.setMatrixAt(i, dummy.matrix);
  }

  panel.bars.count = n;
  panel.bars.instanceMatrix.needsUpdate = true;
  panel.spikes.count = params.spikes ? n : 0;
  panel.spikes.instanceMatrix.needsUpdate = true;
  // Fade spikes as they crowd together, or they become a solid pale comb.
  panel.spikeMat.opacity = Math.max(0.05, 0.5 * Math.min(1, 50 / n));

  panel.rug.count = params.rug ? n : 0;
  panel.rug.instanceMatrix.needsUpdate = true;
  // Fades more slowly than the spikes: where the marks crowd is the whole
  // point, so density here should stay legible well past where spikes stop.
  panel.rugMat.opacity = Math.max(0.12, 0.7 * Math.min(1, 120 / n));

  setText(panel.values[0], String(n));
  setText(panel.values[1], fmt(sum));
  setText(panel.values[2], fmt(EXACT));
  setText(panel.values[3], fmt(Math.abs(EXACT - sum)));
  return sum;
}

stage.frame((t) => {
  const u = stage.duration > 0 ? (t % stage.duration) / stage.duration : 0;

  let n = Math.round(params.N);
  let seed = SEED;

  if (params.mode === 'stream') {
    // Geometric ramp: the early samples are where the estimates lurch about.
    // It finishes HOLD seconds early and parks, so the two converged panels can
    // actually be compared before the loop restarts. Reroll keeps the raw phase
    // — each roll already gets a full slot, and a held phase would run the
    // seed one past the end.
    n = Math.round(Math.exp(Math.log(Math.max(params.N, 1)) * stage.progress(t, HOLD)));
  } else if (params.mode === 'reroll') {
    // Hold N and step the seed, so each roll is an independent experiment.
    // Quantised rather than continuous, so each one is legible before it goes.
    seed = SEED + Math.floor(u * REROLLS);
  }
  n = Math.min(Math.max(n, 1), MAX_N);

  // Both panels get the same seed, so they consume identical uniforms and
  // differ only in how those are mapped onto the domain.
  updatePanel(top, n, seed);
  updatePanel(bottom, n, seed);
});

stage.start();
