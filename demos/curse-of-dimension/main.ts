/**
 * Why the grid loses: error against cost, as the dimension climbs.
 *
 * Both methods estimate the *same* number — the mean of one integrand over a
 * d-dimensional cube — and both are charged the same way: one unit of cost is
 * one evaluation of the integrand. Plotted log-log, the picture is the whole of
 * Part VI in one frame:
 *
 *   - the **Riemann** curves fan out and flatten. Their slope is −2/d, so every
 *     dimension you add costs you rate.
 *   - the **Monte Carlo** curves stay parallel. Slope −1/2 in every dimension —
 *     the constant out front grows, the exponent does not.
 *
 * "No dimension in the exponent" stops being a sentence and becomes the two
 * shapes on this chart.
 *
 * ## The integrand
 *
 * A product of one smooth bump per axis, each normalised to average 1 over its
 * interval:
 *
 *   F(x_1 … x_d) = g(x_1) g(x_2) ⋯ g(x_d).
 *
 * So the average of F over the cube is exactly 1 in every dimension, the error
 * plotted is |estimate − 1|, and the dimensions are directly comparable.
 *
 * This is the *kindest possible* integrand for a grid — smooth, separable, no
 * discontinuity anywhere — which makes the grid's collapse the strongest form
 * of the claim rather than the weakest. Path space, as the next slide says,
 * offers none of these courtesies.
 *
 * Deliberately **not** the deck's `lumpy`. That one is built to defeat a
 * partition, and it does: with two, three and four points per axis its own
 * wobble gets raised to the eighth power and swamps the trend, so the plot
 * shows noise where the slide wants a rate. Handing the grid a friendly
 * integrand costs the argument nothing and buys a legible chart.
 *
 * ## The Riemann values are exact
 *
 * Separability means the d-dimensional midpoint average over m^d cells is
 * exactly (M_m)^d, where M_m is the one-dimensional midpoint average over m
 * cells. So the plotted value *is* the m^d-point Riemann sum — computed in m
 * evaluations instead of m^d, the same trick `src/functions.ts` uses for
 * `FIELD_VOLUME`. The cost on the x-axis is the honest m^d; only the arithmetic
 * is short-cut. Nothing here is a fitted curve or a drawn slope.
 *
 * This is what makes the dots matter. In eight dimensions only three grids fit
 * inside the budget, and in sixteen there is exactly one — a single dot, at
 * 2^16 evaluations, for the coarsest grid that exists. That dot is the slide.
 *
 * ## The Monte Carlo values are simulated
 *
 * No shortcut is available or wanted: the curves are what a sampler actually
 * did. Each is the RMS error over REPLICATES independent runs, which is the
 * quantity the talk names — √(Var/N). The wobble is real and is left in; it is
 * an estimate of a standard deviation from six runs, and smoothing it would be
 * drawing rather than measuring.
 *
 * One stream of uniforms is drawn once from a fixed seed. Dimension d reads it
 * d numbers at a time — the same random numbers cut into different-length
 * blocks, which is exactly what a longer path does to the same stream. Nothing
 * calls Math.random(), so every exported frame is reproducible.
 */

import * as THREE from 'three';
import { createStage, createUI, C, flat } from '@';
import { polyline, setPolyline, type Pt } from '@/lines';
import { label, setText } from '@/text';
import { mulberry32 } from '@/sampling';
import { A, B, simpson } from '@/functions';

// ---------------------------------------------------------------------------
// The experiment
// ---------------------------------------------------------------------------

/** The dimensions we run. 16 is there for the single-dot moment. */
const DIMS = [1, 2, 4, 8, 16];

/** Cost ceiling, in evaluations of the integrand. 2^16, so d = 16 just fits. */
const NMAX = 65536;

/**
 * Independent runs the Monte Carlo error is an RMS over. An RMS from R runs is
 * itself uncertain by about 1/√(2R), so this is the knob that decides how much
 * the sampled curves wobble — and it is the whole build cost, since every extra
 * run is another NMAX samples in every dimension.
 */
const REPLICATES = 12;

/**
 * One smooth bump, off-centre so nothing lines up with a cell boundary and no
 * symmetry hands the midpoint rule an accidentally exact answer.
 */
const bump = (x: number): number => Math.exp(-Math.pow((x - 0.5) / 2.1, 2) / 2);

/** Mean of the bump over its interval, so the normalised factor averages 1. */
const MEAN = simpson(bump, A, B) / (B - A);

/** One factor of the integrand: average 1 over [A, B], by construction. */
const g = (x: number): number => bump(x) / MEAN;

// ---------------------------------------------------------------------------
// Riemann
// ---------------------------------------------------------------------------

/** Midpoint average of g over m cells. The 1D building block. */
function midpointMean(m: number): number {
  let s = 0;
  for (let i = 0; i < m; i++) s += g(A + ((i + 0.5) * (B - A)) / m);
  return s / m;
}

/** Grid resolutions worth plotting for dimension d, log-spaced when there are many. */
function resolutions(d: number): number[] {
  const mMax = Math.floor(Math.pow(NMAX, 1 / d) + 1e-9);
  if (mMax < 2) return [];
  if (mMax <= 40) return Array.from({ length: mMax - 1 }, (_, i) => i + 2);
  const out: number[] = [];
  for (let i = 0; i <= 40; i++) {
    const m = Math.round(2 * Math.pow(mMax / 2, i / 40));
    if (out[out.length - 1] !== m) out.push(m);
  }
  return out;
}

/** [log10 cost, log10 relative error] for the midpoint rule in d dimensions. */
function riemannCurve(d: number): [number, number][] {
  return resolutions(d).map((m) => {
    const est = Math.pow(midpointMean(m), d);
    return [d * Math.log10(m), Math.log10(Math.abs(est - 1))] as [number, number];
  });
}

// ---------------------------------------------------------------------------
// Monte Carlo
// ---------------------------------------------------------------------------

/** Sample counts the error is recorded at — every half-power of two. */
const LADDER = (() => {
  const out: number[] = [];
  // Starts at sixteen samples: below that the "error" is a handful of draws'
  // distance from the answer, a fact about a few numbers rather than a rate.
  for (let k = 8; k <= 2 * Math.log2(NMAX); k++) {
    const n = Math.round(Math.pow(2, k / 2));
    if (out[out.length - 1] !== n) out.push(n);
  }
  return out;
})();

/** [log10 cost, log10 RMS relative error] for uniform sampling in d dimensions. */
function monteCarloCurve(d: number): [number, number][] {
  const sq = new Float64Array(LADDER.length);
  for (let r = 0; r < REPLICATES; r++) {
    // A fresh cut of the same stream per (dimension, replicate).
    const rng = mulberry32(0x9e3779b9 ^ (d * 977 + r));
    let acc = 0;
    let n = 0;
    for (let li = 0; li < LADDER.length; li++) {
      while (n < LADDER[li]) {
        let p = 1;
        for (let j = 0; j < d; j++) p *= g(A + (B - A) * rng());
        acc += p;
        n++;
      }
      const err = acc / n - 1;
      sq[li] += err * err;
    }
  }
  return LADDER.map(
    (n, i) => [Math.log10(n), Math.log10(Math.sqrt(sq[i] / REPLICATES))] as [number, number],
  );
}

const buildStart = performance.now();
const RIEMANN = DIMS.map(riemannCurve);
const MONTE = DIMS.map(monteCarloCurve);
const buildMs = performance.now() - buildStart;

// ---------------------------------------------------------------------------
// The plot box
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

/** Axis ranges, as log10. x is cost, y is relative error. */
const X0 = 0;
const X1 = Math.log10(NMAX);
const Y0 = -4;
const Y1 = 0;

/**
 * World units per decade — the same in both directions, so a slope of −1/2 is
 * drawn at a true −1/2 and the fan can be read off the picture with a ruler.
 */
const DEC = 0.95;
const DECX = DEC;
const DECY = DEC;

/** Bottom-left corner of the box, in world units. */
const BOX_X = -4.1;
const BOX_Y = -1.75;

const px = (lx: number): number => BOX_X + (lx - X0) * DECX;
const py = (ly: number): number => BOX_Y + (ly - Y0) * DECY;

const BOX_R = px(X1);
const BOX_T = py(Y1);

/**
 * Keep the leading run of a curve that lies inside the box. Only the
 * low-dimension Riemann curves leave it, and they leave once, downwards.
 */
function clip(pts: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = pts[i];
    if (y <= Y1 && y >= Y0) {
      out.push([x, y]);
      continue;
    }
    if (out.length > 0) {
      // Crossed a horizontal edge — walk to it and stop.
      const [xp, yp] = out[out.length - 1];
      const edge = y < Y0 ? Y0 : Y1;
      const t = (edge - yp) / (y - yp);
      out.push([xp + (x - xp) * t, edge]);
      break;
    }
  }
  return out;
}

const rCurves = RIEMANN.map(clip);
const mCurves = MONTE.map(clip);

// ---------------------------------------------------------------------------
// Scenery: box, decade grid, ticks
// ---------------------------------------------------------------------------

const grid = new THREE.Group();
grid.position.z = -0.2;
for (let e = Math.ceil(X0); e <= X1; e++) {
  grid.add(polyline([[px(e), py(Y0), 0], [px(e), py(Y1), 0]], { color: C.slateDeep, width: 1.2 }));
}
for (let e = Y0; e <= Y1; e++) {
  grid.add(polyline([[px(X0), py(e), 0], [px(X1), py(e), 0]], { color: C.slateDeep, width: 1.2 }));
}
stage.add(grid);

stage.add(
  polyline(
    [[px(X0), py(Y1), 0], [px(X0), py(Y0), 0], [px(X1), py(Y0), 0]],
    { color: C.slate, width: 2.4 },
  ),
);

// Cost ticks. Spelled out rather than as powers, which reads better projected.
const COST_TICK = ['1', '10', '100', '1 000', '10 000'];
COST_TICK.forEach((text, e) => {
  stage.add(
    label(text, { size: 0.19, color: C.ash, anchorX: 'center', position: [px(e), py(Y0) - 0.34, 0] }),
  );
});

// Error ticks, as percentages — "1% error" lands with an audience in a way that
// "10 to the minus two" does not.
const ERR_TICK: Record<number, string> = {
  0: '100%',
  [-1]: '10%',
  [-2]: '1%',
  [-3]: '0.1%',
  [-4]: '0.01%',
};
for (let e = Y0; e <= Y1; e++) {
  stage.add(
    label(ERR_TICK[e], {
      size: 0.19,
      color: C.ash,
      anchorX: 'right',
      anchorY: 'middle',
      position: [px(X0) - 0.16, py(e), 0],
    }),
  );
}

stage.add(
  label('evaluations of the integrand', {
    size: 0.22,
    color: C.bone,
    anchorX: 'center',
    position: [(px(X0) + px(X1)) / 2, py(Y0) - 0.82, 0],
  }),
);

const yTitle = label('relative error', {
  size: 0.22,
  color: C.bone,
  anchorX: 'center',
  position: [px(X0) - 1.02, (py(Y0) + py(Y1)) / 2, 0],
});
yTitle.rotation.z = Math.PI / 2;
stage.add(yTitle);

// ---------------------------------------------------------------------------
// The guide: what slope −1/2 looks like on this box
// ---------------------------------------------------------------------------

/** Anchored where the sampled curves live, so the bundle can be read against it. */
const GUIDE_Y0 = -0.3;
const guide = polyline(
  [[px(X0), py(GUIDE_Y0), 0], [px(X1), py(GUIDE_Y0 - X1 / 2), 0]],
  { color: C.slateDeep, width: 2, dashed: true, dashSize: 0.13, gapSize: 0.09 },
);
guide.position.z = -0.1;
// Parked under the right end, in the wedge the data leaves empty.
const guideLabel = label('slope -1/2', {
  size: 0.19,
  color: C.slate,
  anchorX: 'right',
  position: [px(X1) - 0.05, py(GUIDE_Y0 - X1 / 2 - 0.45), 0],
});
stage.add(guide, guideLabel);

// ---------------------------------------------------------------------------
// The curves
// ---------------------------------------------------------------------------

const RIEMANN_COLOR = C.rust;
const MONTE_COLOR = C.blue;

/** Points clamped to a reveal position, keeping the vertex count fixed. */
function revealed(pts: [number, number][], xr: number, z: number): Pt[] {
  const out: Pt[] = [];
  let last: [number, number] = pts[0];
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = pts[i];
    if (x <= xr) {
      last = [x, y];
      out.push([px(x), py(y), z]);
    } else {
      if (i > 0 && last[0] <= xr && pts[i - 1][0] <= xr) {
        // Interpolate up to the sweep line, then hold there.
        const [xp, yp] = pts[i - 1];
        const t = (xr - xp) / (x - xp);
        last = [xr, yp + (y - yp) * t];
      }
      out.push([px(last[0]), py(last[1]), z]);
    }
  }
  return out;
}

interface Series {
  line: ReturnType<typeof polyline>;
  pts: [number, number][];
}

function makeSeries(pts: [number, number][], color: number, width: number, z: number): Series {
  // Line2 needs two vertices; d = 16 has a single grid, carried by its dot.
  const seed = pts.length >= 2 ? pts : [pts[0] ?? [X0, Y0], pts[0] ?? [X0, Y0]];
  const line = polyline(revealed(seed, X1, z), { color, width });
  stage.add(line);
  return { line, pts: seed };
}

const rSeries = rCurves.map((pts) => makeSeries(pts, RIEMANN_COLOR, 4.5, 0.1));
// Thinner than the grid curves: five sampled runs overlap, and the point is
// that they are one line up to noise rather than five things to tell apart.
const mSeries = mCurves.map((pts) => makeSeries(pts, MONTE_COLOR, 2.8, 0.05));

/** A dot per affordable grid — the only resolutions that fit in the budget. */
const dotGeom = new THREE.CircleGeometry(0.055, 20);
const dots = rCurves.map((pts) => {
  const mesh = new THREE.InstancedMesh(dotGeom, flat(RIEMANN_COLOR), Math.max(1, pts.length));
  mesh.frustumCulled = false;
  mesh.position.z = 0.15;
  mesh.count = 0;
  const m = new THREE.Matrix4();
  pts.forEach((p, i) => mesh.setMatrixAt(i, m.makeTranslation(px(p[0]), py(p[1]), 0)));
  mesh.instanceMatrix.needsUpdate = true;
  stage.add(mesh);
  return mesh;
});

/**
 * Names the dimension where its grid curve *ends*, which is the one place the
 * five are reliably far apart: the two fast ones run off the bottom of the box
 * at very different costs, and the three slow ones stack up the right-hand edge
 * more than a decade apart. At the start they are all crowded into one corner.
 */
const dimEnd = rCurves.map((pts) => pts[pts.length - 1] ?? [X1, Y1]);

/** The cheapest point either method has in this dimension — where a sweep begins. */
const SWEEP_FROM = DIMS.map((_, i) =>
  Math.min(rCurves[i][0]?.[0] ?? X1, mCurves[i][0]?.[0] ?? X1),
);

const dimLabels = DIMS.map((d, i) => {
  const [ex, ey] = dimEnd[i];
  const onRightEdge = ex > X1 - 1e-6;
  // The ones that run to the right-hand edge are named just outside the box —
  // inside, they would land on top of the Monte Carlo bundle.
  const t = label(`d = ${d}`, {
    size: 0.22,
    color: RIEMANN_COLOR,
    anchorY: onRightEdge ? 'middle' : 'bottom',
    position: onRightEdge
      ? [px(ex) + 0.14, py(ey), 0.2]
      : [px(ex) + 0.14, py(ey) + 0.06, 0.2],
  });
  t.visible = false;
  stage.add(t);
  return t;
});

// ---------------------------------------------------------------------------
// Legend and readout
// ---------------------------------------------------------------------------

// Clear of the strip just outside the box where the dimension names sit.
const LEG_X = BOX_R + 1.55;

function legendRow(y: number, color: number, width: number, text: string): void {
  stage.add(
    polyline([[LEG_X, y, 0], [LEG_X + 0.52, y, 0]], { color, width }),
    label(text, { size: 0.22, color: C.bone, anchorY: 'middle', position: [LEG_X + 0.68, y, 0] }),
  );
}

legendRow(BOX_T - 0.15, RIEMANN_COLOR, 4.5, 'Riemann sums');
legendRow(BOX_T - 0.58, MONTE_COLOR, 3.5, 'Monte Carlo');

const dimReadout = label('', {
  size: 0.42,
  color: C.ochre,
  position: [LEG_X, BOX_T - 1.55, 0],
});

const noteReadout = label('', {
  size: 0.2,
  color: C.ash,
  lineHeight: 1.45,
  anchorY: 'top',
  position: [LEG_X, BOX_T - 2.05, 0],
});

stage.add(dimReadout, noteReadout);

// ---------------------------------------------------------------------------
// Controls and timing
// ---------------------------------------------------------------------------

const params = { animate: true, step: DIMS.length, guide: true };
ui.params.add(params, 'animate').name('sweep through dimensions');
ui.params.add(params, 'step', 0, DIMS.length, 0.01).name('progress');
ui.params.add(params, 'guide').name('show the -1/2 guide');

const LEAD = 0.9;
const SWEEP = 1.6;
const HOLD = 0.55;
const TAIL = 2.6;

stage.duration = LEAD + DIMS.length * (SWEEP + HOLD) + TAIL;

const smoothstep = (x: number): number => x * x * (3 - 2 * x);

/** Fractional progress: 2.4 means dimension index 2 is 40% swept. */
function progressAt(t: number): number {
  const u = t % stage.duration;
  if (u <= LEAD) return 0;
  const v = u - LEAD;
  const span = SWEEP + HOLD;
  if (v >= DIMS.length * span) return DIMS.length;
  const k = Math.floor(v / span);
  return k + smoothstep(Math.min(1, (v - k * span) / SWEEP));
}

/** How many grids fit inside the budget, said plainly. */
function note(i: number): string {
  const n = rCurves[i].length;
  if (n === 0) return 'no grid at all fits\nin the budget';
  if (n === 1) return 'one grid fits in the budget:\ntwo points per axis';
  return `${n} grids fit in the budget,\nup to ${Math.floor(Math.pow(NMAX, 1 / DIMS[i]) + 1e-9)} points per axis`;
}

stage.frame((t) => {
  const p = params.animate ? progressAt(t) : params.step;
  guide.visible = params.guide;
  guideLabel.visible = params.guide;

  for (let i = 0; i < DIMS.length; i++) {
    // How far this dimension's sweep has travelled, in log-cost. It starts at
    // the cheapest thing this dimension has to show rather than at the left
    // edge, or a quarter of every sweep is spent crossing empty box.
    const local = Math.min(1, Math.max(0, p - i));
    const xr = SWEEP_FROM[i] + (X1 - SWEEP_FROM[i]) * local;

    const shown = local > 0;
    rSeries[i].line.visible = shown;
    mSeries[i].line.visible = shown;
    // The name lands as the curve reaches the place it is parked.
    dimLabels[i].visible = shown && xr >= dimEnd[i][0] - 1e-9;

    if (!shown) {
      dots[i].count = 0;
      continue;
    }

    setPolyline(rSeries[i].line, revealed(rSeries[i].pts, xr, 0.1));
    setPolyline(mSeries[i].line, revealed(mSeries[i].pts, xr, 0.05));

    let visible = 0;
    for (const q of rCurves[i]) if (q[0] <= xr + 1e-9) visible++;
    dots[i].count = visible;
  }

  const cur = Math.min(DIMS.length - 1, Math.floor(p > 0 ? p - 1e-9 : 0));
  if (p <= 0) {
    setText(dimReadout, '');
    setText(noteReadout, '');
  } else {
    setText(dimReadout, `d = ${DIMS[cur]}`);
    setText(noteReadout, note(cur));
  }
});

stage.start();

console.info(
  `curse-of-dimension: built ${DIMS.length} dimensions in ${buildMs.toFixed(0)} ms ` +
    `(${REPLICATES} replicates, cost ceiling ${NMAX}); ` +
    `grids affordable per dimension: ${rCurves.map((c, i) => `d=${DIMS[i]}:${c.length}`).join(' ')}`,
);
