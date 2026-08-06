/**
 * Where the weight comes from: sample wherever you like, and pay for it.
 *
 * The introduction to importance sampling, before the 2D ridge makes the case
 * at scale. There is no race here and no second panel — one integrand, one
 * estimator, and one normal density that narrows onto the bump.
 *
 * Each sample owns a rectangle: height f(x), width 1/(N p(x)), so its area is
 * exactly that sample's contribution and the rectangles together are the
 * estimate. The demo runs in discrete steps: at each step the normal is
 * narrower than the last, and a completely fresh set of samples is drawn from
 * it. Nothing carries over between steps — new density, new draw, new sum. A
 * normal thirty units wide, seen through an interval only twenty across, is
 * flat, so the first step is uniform sampling without having to be a mixture of
 * anything, and the last is a proposal aimed squarely at the mass.
 *
 * Stepping rather than sliding is the point. An earlier version held one set of
 * uniform numbers and pushed them through each new inverse CDF, so the points
 * appeared to slide continuously inward. Every frame of that was a valid sample
 * from its density, but consecutive frames were coupled, and it read as though
 * changing the density *transports* the samples you already had. It does not.
 * You throw them away and draw again, which is what this does.
 *
 * Under the axis, each sample's claim is drawn again as a plain interval at a
 * constant height, with a bright tick at the sample itself. That is where the
 * widths are readable: in the plot above they are rectangles under a curve and
 * their height dominates, so a sample out on the flats — claiming a large
 * stretch of the domain and reporting nothing about it — is invisible. The
 * intervals are translucent and one colour, so overlaps brighten and gaps show
 * bare axis. They are trying to tile the interval, and their widths sum to its
 * length in expectation; where the strip is patchy is where that step's draw is
 * wrong.
 *
 * p is drawn as p × ∫f, which puts it on the integrand's own scale: the two
 * curves then enclose the same area, so "matched" is something you watch happen
 * rather than something asserted.
 *
 * **The bar bounces, and that is not a bug.** Each step is an independent
 * experiment, so its estimate is a fresh draw from a distribution that is
 * merely getting *tighter* — it is not a quantity that improves monotonically.
 * Across the ten base seeds tried, the first three steps average about 75% and
 * the last three about 90%, but single steps swing thirty points either way.
 * The reliable signal here is the picture, not the number: the samples visibly
 * abandon the dead flats. Showing the variance itself would take several draws
 * at each width rather than one, which is a different demo.
 *
 * The seed is chosen so the opening step is near the typical uniform error
 * rather than a flattering or a disastrous one, and so no claim in the strip is
 * wide enough to run off the frame. Both are stated rather than tuned in
 * silence.
 *
 * The density is truncated to [A, B] and normalised there, so the weights are
 * right at the ends of the interval rather than approximately right.
 *
 * No error readout: the bar is the error, and a number for it as well would be
 * a third figure to decode in a picture whose point is to be looked at.
 */

import * as THREE from 'three';
import { createStage, createUI, C, flat, mix } from '@';
import { axes2d, graph2d, polyline, setPolyline } from '@/lines';
import { label, setText, fixed } from '@/text';
import { PEAKED_A as A, PEAKED_B as B, PEAKED_AREA as EXACT, peaked as f } from '@/functions';
import { Distribution1D, uniformStream } from '@/sampling';

// ---------------------------------------------------------------------------
// Stage
// ---------------------------------------------------------------------------

const HALF_W = 10.6; // the domain is 20 wide, leaving a small margin
const ORTHO_H = (HALF_W * 9) / 16; // 5.96

const stage = createStage({
  camera: 'ortho',
  position: [0, 0, 10],
  target: [0, 0, 0],
  orthoHeight: ORTHO_H,
  lights: false,
  controls: false,
});
stage.duration = 10;
/** Seconds at the end parked on the matched density, so it can be read. */
const HOLD = 2.0;

const ui = createUI(stage);

// The axis sits low, leaving the upper two thirds of the frame for the bump and
// the lower third for the readout and the bar.
const BASE_Y = -1.0;
const PLOT_H = 5.0;

let peakF = 0;
for (let i = 0; i <= 4000; i++) peakF = Math.max(peakF, f(A + ((B - A) * i) / 4000));
/** World units per unit of f. */
const Y = PLOT_H / peakF;

const root = new THREE.Group();
root.position.y = BASE_Y;
stage.add(root);

// ---------------------------------------------------------------------------
// Static scenery
// ---------------------------------------------------------------------------

const axes = axes2d({
  xRange: [-HALF_W + 0.2, HALF_W - 0.2],
  yRange: [-0.6, PLOT_H + 0.4],
  tick: 2,
});
axes.position.z = -0.05;
root.add(axes);

for (const x of [A, B]) {
  root.add(
    polyline([[x, -0.5, 0], [x, PLOT_H + 0.25, 0]], {
      color: C.slateDeep,
      width: 2,
      opacity: 0.8,
    }),
  );
}

const curve = graph2d((x) => f(x) * Y, A, B, { samples: 1400, color: C.ochre, width: 5 });
curve.position.z = 0.06;
root.add(curve);

// ---------------------------------------------------------------------------
// The density being sampled from
// ---------------------------------------------------------------------------

const PDF_SAMPLES = 700;

const pdfCurve = polyline(
  Array.from({ length: PDF_SAMPLES + 1 }, () => [0, 0, 0] as [number, number, number]),
  { color: C.blue, width: 3.5, opacity: 0.95, dashed: true, dashSize: 0.3, gapSize: 0.19 },
);
pdfCurve.position.z = 0.09; // over the integrand, so the final overlap is visible
root.add(pdfCurve);

function drawPdf(dist: Distribution1D): void {
  const pts: [number, number, number][] = [];
  for (let i = 0; i <= PDF_SAMPLES; i++) {
    const x = A + ((B - A) * i) / PDF_SAMPLES;
    // p × ∫f, so the density is on the integrand's own scale and the two
    // curves enclose the same area.
    pts.push([x, dist.pdf(x) * EXACT * Y, 0]);
  }
  setPolyline(pdfCurve, pts);
}

root.add(
  label('Integrand', {
    size: 0.34,
    color: C.ochre,
    position: [-HALF_W + 0.35, PLOT_H - 0.1, 0.1],
  }),
);
root.add(
  label('Density', {
    size: 0.34,
    color: C.blue,
    position: [-HALF_W + 0.35, PLOT_H - 0.68, 0.1],
  }),
);

// ---------------------------------------------------------------------------
// Rectangles
// ---------------------------------------------------------------------------

const MAX_N = 120;
/**
 * Thirty-two samples: enough that the crowding onto the bump reads as a crowd,
 * few enough that a single interval in the strip is still wide enough to look
 * at. See the header for why this base seed.
 */
const SEED = 4242;

/** Number of widths visited, each with its own independent draw. */
const STEPS = 10;

/**
 * A step's samples, sorted. Every step gets its own seed, so the draws are
 * independent of each other — but they are a pure function of the step index,
 * so the whole demo is still a pure function of t and a frame-stepped export is
 * exact. Sorting cannot touch the estimate; it is a sum over the same multiset,
 * and it puts neighbouring rectangles next to each other so the alternating
 * shades read as a run.
 */
function drawStep(step: number, n: number): Float64Array {
  const u = uniformStream(n, SEED + step * 104729);
  u.sort();
  return u;
}

const cellGeom = new THREE.PlaneGeometry(1, 1);
cellGeom.translate(0, 0.5, 0);

// White material, so the per-instance colours come through unmultiplied.
const cellMat = flat(0xffffff, { transparent: true, opacity: 0.85 });
const cells = new THREE.InstancedMesh(cellGeom, cellMat, MAX_N);
cells.position.z = -0.02;
cells.frustumCulled = false;
cells.count = 0;
root.add(cells);

// Neighbours alternate between two shades of the same green: widths are the
// thing to read, and a run of identical solid rectangles side by side merges
// into one block with no visible divisions.
const SHADE_A = new THREE.Color(C.moss);
const SHADE_B = new THREE.Color(mix(C.moss, C.bone, 0.3));
for (let i = 0; i < MAX_N; i++) cells.setColorAt(i, i % 2 ? SHADE_B : SHADE_A);
cells.instanceColor!.needsUpdate = true;

/**
 * The claim strip: the same widths again, at a constant height, under the axis.
 * One colour and translucent, so overlaps brighten and gaps show bare axis; a
 * bright tick marks where the sample itself landed inside its claim.
 */
const STRIP_Y = -0.58;
const STRIP_H = 0.26;
const TICK_W = 0.035;

const stripMat = flat(C.bone, { transparent: true, opacity: 0.3 });
const strip = new THREE.InstancedMesh(cellGeom, stripMat, MAX_N);
strip.position.z = 0.02;
strip.frustumCulled = false;
strip.count = 0;
root.add(strip);

const ticks = new THREE.InstancedMesh(cellGeom, flat(C.bone, { transparent: true, opacity: 0.9 }), MAX_N);
ticks.position.z = 0.03;
ticks.frustumCulled = false;
ticks.count = 0;
root.add(ticks);

// ---------------------------------------------------------------------------
// Readout, and the bar
// ---------------------------------------------------------------------------

const ROW_Y = -1.4;
const CELL_X = [-4.2, 1.0];
const CELL_KEYS = ['samples', 'estimate'];

const values = CELL_KEYS.map((key, i) => {
  root.add(
    label(key, {
      size: 0.3,
      color: C.slate,
      anchorY: 'middle',
      position: [CELL_X[i], ROW_Y, 0.05],
    }),
  );
  const v = label('', {
    size: 0.3,
    color: C.bone,
    anchorY: 'middle',
    position: [CELL_X[i] + 2.2, ROW_Y, 0.05],
  });
  root.add(v);
  return v;
});

/**
 * How close the estimate is to the truth, as a fraction: full is the exact
 * answer and nowhere else. Same reading as the bars in `importance-2d`, and the
 * same reason — a scale whose end is some arbitrary milestone puts the right
 * answer part-way along, which is worse than no bar.
 */
const BAR_Y = -2.65;
const BAR_HW = 6.6;
const BAR_H = 0.44;

{
  const track = new THREE.Mesh(
    new THREE.PlaneGeometry(2 * BAR_HW, BAR_H),
    flat(C.slateDeep, { transparent: true, opacity: 0.55 }),
  );
  track.position.set(0, BAR_Y, 0);
  root.add(track);

  for (let q = 1; q <= 3; q++) {
    const x = -BAR_HW + (q / 4) * 2 * BAR_HW;
    root.add(
      polyline(
        [
          [x, BAR_Y - BAR_H / 2, 0.02],
          [x, BAR_Y + BAR_H / 2, 0.02],
        ],
        { color: C.bone, width: 1.5, opacity: 0.25 },
      ),
    );
  }

  root.add(
    polyline(
      [
        [-BAR_HW, BAR_Y - BAR_H / 2, 0.03],
        [BAR_HW, BAR_Y - BAR_H / 2, 0.03],
        [BAR_HW, BAR_Y + BAR_H / 2, 0.03],
        [-BAR_HW, BAR_Y + BAR_H / 2, 0.03],
        [-BAR_HW, BAR_Y - BAR_H / 2, 0.03],
      ],
      { color: C.slate, width: 1.5, opacity: 0.5 },
    ),
  );

  // Bright cap on the end, plus the word, so "full means correct" is stated
  // twice and cannot be read as some milestone part-way along.
  root.add(
    polyline(
      [
        [BAR_HW, BAR_Y - BAR_H * 0.85, 0.04],
        [BAR_HW, BAR_Y + BAR_H * 0.85, 0.04],
      ],
      { color: C.bone, width: 2.5, opacity: 0.95 },
    ),
  );
  root.add(
    label('exact', {
      size: 0.28,
      color: C.slate,
      anchorX: 'right',
      anchorY: 'middle',
      position: [BAR_HW, BAR_Y - 0.62, 0.05],
    }),
  );
}

const fillGeom = new THREE.PlaneGeometry(1, BAR_H);
fillGeom.translate(0.5, 0, 0); // left edge at x = 0, so scale.x grows rightward
const barFill = new THREE.Mesh(fillGeom, flat(C.ochre, { transparent: true, opacity: 0.95 }));
barFill.position.set(-BAR_HW, BAR_Y, 0.01);
root.add(barFill);

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

/**
 * The normal's width at the two ends of the sweep. The start is wide enough
 * that its variation across the interval is a few percent, which reads as flat;
 * the end is the width of the integrand's own envelope.
 */
const SIGMA_START = 30;
const SIGMA_END = 0.75;

const params = {
  mode: 'steps' as 'steps' | 'fixed',
  sigma: SIGMA_END,
  N: 32,
};
ui.params.add(params, 'mode', ['steps', 'fixed']).name('mode');
ui.params.add(params, 'sigma', 0.3, SIGMA_START, 0.01).name('density width');
ui.params.add(params, 'N', 2, MAX_N, 1).name('N (samples)');

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

const dummy = new THREE.Object3D();

stage.frame((t) => {
  const u = stage.progress(t, HOLD);
  // The ramp lands on the matched density and parks, so export ends on it.
  stage.captureEnd = stage.duration - HOLD;

  const n = Math.min(MAX_N, Math.max(1, Math.round(params.N)));

  // Which step we are on, and how wide its normal is. Geometric in sigma, not
  // linear: the sweep spans a factor of forty, and equal linear increments
  // would spend most of the steps among widths that all look flat.
  const step = Math.min(STEPS - 1, Math.floor(u * STEPS));
  const sigma =
    params.mode === 'steps'
      ? SIGMA_START * Math.pow(SIGMA_END / SIGMA_START, step / (STEPS - 1))
      : params.sigma;

  // A normal of this width, truncated to [A, B]. Distribution1D normalises over
  // the interval it is given, so the truncation is exact rather than ignored —
  // dividing by the untruncated normal's constant would bias every weight.
  const dist = new Distribution1D((x) => Math.exp(-(x * x) / (2 * sigma * sigma)), A, B, 2048);
  drawPdf(dist);

  // A fresh draw for this step. Nothing carries over from the last one.
  const view = drawStep(params.mode === 'steps' ? step : 0, n);

  let sum = 0;
  for (let i = 0; i < n; i++) {
    const x = dist.sample(view[i]);
    const p = dist.pdf(x);
    const w = p > 1e-12 ? 1 / (n * p) : 0;
    const h = f(x);
    sum += h * w;

    dummy.position.set(x, 0, 0);
    dummy.scale.set(w, Math.max(h * Y, 1e-6), 1);
    dummy.updateMatrix();
    cells.setMatrixAt(i, dummy.matrix);

    dummy.position.set(x, STRIP_Y, 0);
    dummy.scale.set(w, STRIP_H, 1);
    dummy.updateMatrix();
    strip.setMatrixAt(i, dummy.matrix);

    dummy.scale.set(TICK_W, STRIP_H, 1);
    dummy.updateMatrix();
    ticks.setMatrixAt(i, dummy.matrix);
  }

  cells.count = n;
  cells.instanceMatrix.needsUpdate = true;
  strip.count = n;
  strip.instanceMatrix.needsUpdate = true;
  ticks.count = n;
  ticks.instanceMatrix.needsUpdate = true;

  const closeness = Math.min(1, Math.max(0, 1 - Math.abs(EXACT - sum) / EXACT));
  barFill.scale.x = Math.max(closeness, 1e-4) * 2 * BAR_HW;

  setText(values[0], String(n));
  setText(values[1], fixed(sum));
});

stage.start();
