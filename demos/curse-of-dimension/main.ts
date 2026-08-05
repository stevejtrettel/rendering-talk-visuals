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
 * ## The budget is the control
 *
 * The one slider that matters is the budget: how many evaluations either method
 * is allowed. Everything is recomputed from it, and it is what makes the
 * argument arguable rather than asserted — wind it down and watch the grids
 * disappear one dimension at a time. At 65 536 evaluations, sixteen dimensions
 * affords exactly one grid, the coarsest one there is. Below that it affords
 * none at all, and the rust curve for d = 16 simply is not there while the blue
 * one carries on unbothered. That state is the slide.
 *
 * Cost is held roughly constant instead of the run count: the replicate count
 * moves inversely with the budget, so a small budget buys smoother sampled
 * curves and a large one buys noisier ones. That trade is real and is shown in
 * the readout rather than hidden — averaging fewer runs is exactly what you do
 * when each run costs more.
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
 * ## The Monte Carlo values are simulated
 *
 * No shortcut is available or wanted: the curves are what a sampler actually
 * did. Each is the RMS error over the replicate runs, which is the quantity the
 * talk names — √(Var/N). The wobble is real and is left in; an RMS from R runs
 * is itself uncertain by about 1/√(2R), and smoothing it would be drawing
 * rather than measuring.
 *
 * Nothing calls Math.random(): every run is a seeded stream, keyed by dimension
 * and replicate, so the chart is identical on every reload and every exported
 * frame.
 *
 * ## Aspect
 *
 * At the default budget the box is laid out so a decade across equals a decade
 * up, and the slopes can be read off with a ruler. Change the budget and the
 * horizontal decade stretches or squashes to keep the box put; the fan and the
 * bundle survive it, but the printed −1/2 guide is the thing to read against.
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

/**
 * replicates × budget, held fixed, so a rebuild costs about the same however
 * the budget is set. The default budget lands on twelve runs.
 */
const TARGET_WORK = 12 * 65536;

/**
 * One smooth bump, off-centre so nothing lines up with a cell boundary and no
 * symmetry hands the midpoint rule an accidentally exact answer.
 */
const bump = (x: number): number => Math.exp(-Math.pow((x - 0.5) / 2.1, 2) / 2);

/** Mean of the bump over its interval, so the normalised factor averages 1. */
const MEAN = simpson(bump, A, B) / (B - A);

/** One factor of the integrand: average 1 over [A, B], by construction. */
const g = (x: number): number => bump(x) / MEAN;

/** Midpoint average of g over m cells. The 1D building block. */
function midpointMean(m: number): number {
  let s = 0;
  for (let i = 0; i < m; i++) s += g(A + ((i + 0.5) * (B - A)) / m);
  return s / m;
}

/** Grid resolutions worth plotting for dimension d, log-spaced when there are many. */
function resolutions(d: number, budget: number): number[] {
  const mMax = Math.floor(Math.pow(budget, 1 / d) + 1e-9);
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
function riemannCurve(d: number, budget: number): [number, number][] {
  return resolutions(d, budget).map((m) => {
    const est = Math.pow(midpointMean(m), d);
    return [d * Math.log10(m), Math.log10(Math.abs(est - 1))] as [number, number];
  });
}

/** Sample counts the error is recorded at — every half-power of two. */
function ladder(budget: number): number[] {
  const out: number[] = [];
  // Starts at sixteen samples: below that the "error" is a handful of draws'
  // distance from the answer, a fact about a few numbers rather than a rate.
  for (let k = 8; k <= 2 * Math.log2(budget) + 1e-9; k++) {
    const n = Math.round(Math.pow(2, k / 2));
    if (n <= budget && out[out.length - 1] !== n) out.push(n);
  }
  return out;
}

/** [log10 cost, log10 RMS relative error] for uniform sampling in d dimensions. */
function monteCarloCurve(d: number, steps: number[], replicates: number): [number, number][] {
  const sq = new Float64Array(steps.length);
  for (let r = 0; r < replicates; r++) {
    const rng = mulberry32(0x9e3779b9 ^ (d * 977 + r));
    let acc = 0;
    let n = 0;
    for (let li = 0; li < steps.length; li++) {
      while (n < steps[li]) {
        let p = 1;
        for (let j = 0; j < d; j++) p *= g(A + (B - A) * rng());
        acc += p;
        n++;
      }
      const err = acc / n - 1;
      sq[li] += err * err;
    }
  }
  return steps.map(
    (n, i) => [Math.log10(n), Math.log10(Math.sqrt(sq[i] / replicates))] as [number, number],
  );
}

// ---------------------------------------------------------------------------
// The plot box — fixed, so changing the budget never moves the furniture
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

const X0 = 0;
const Y0 = -4;
const Y1 = 0;

const BOX_X = -4.1;
const BOX_Y = -1.75;
const BOX_W = 4.58;
const BOX_H = 3.8;
const BOX_R = BOX_X + BOX_W;
const BOX_T = BOX_Y + BOX_H;

const DECY = BOX_H / (Y1 - Y0);

/** Set by every rebuild: the right-hand end of the cost axis, and its scale. */
let X1 = 1;
let DECX = 1;

const px = (lx: number): number => BOX_X + (lx - X0) * DECX;
const py = (ly: number): number => BOX_Y + (ly - Y0) * DECY;

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
      const [xp, yp] = out[out.length - 1];
      const edge = y < Y0 ? Y0 : Y1;
      const t = (edge - yp) / (y - yp);
      out.push([xp + (x - xp) * t, edge]);
      break;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Static furniture
// ---------------------------------------------------------------------------

const yGrid = new THREE.Group();
yGrid.position.z = -0.2;
for (let e = Y0; e <= Y1; e++) {
  yGrid.add(polyline([[BOX_X, py(e), 0], [BOX_R, py(e), 0]], { color: C.slateDeep, width: 1.2 }));
}
stage.add(yGrid);

stage.add(
  polyline([[BOX_X, BOX_T, 0], [BOX_X, BOX_Y, 0], [BOX_R, BOX_Y, 0]], {
    color: C.slate,
    width: 2.4,
  }),
);

// Error ticks, as percentages — "1% error" lands with an audience in a way that
// "ten to the minus two" does not.
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
      position: [BOX_X - 0.16, py(e), 0],
    }),
  );
}

stage.add(
  label('evaluations of the integrand', {
    size: 0.22,
    color: C.bone,
    anchorX: 'center',
    position: [(BOX_X + BOX_R) / 2, BOX_Y - 0.82, 0],
  }),
);

const yTitle = label('relative error', {
  size: 0.22,
  color: C.bone,
  anchorX: 'center',
  position: [BOX_X - 1.02, (BOX_Y + BOX_T) / 2, 0],
});
yTitle.rotation.z = Math.PI / 2;
stage.add(yTitle);

const RIEMANN_COLOR = C.rust;
const MONTE_COLOR = C.blue;

// Clear of the strip just outside the box where the dimension names sit.
const LEG_X = BOX_R + 1.55;

function legendRow(y: number, color: number, width: number, text: string): void {
  stage.add(
    polyline([[LEG_X, y, 0], [LEG_X + 0.52, y, 0]], { color, width }),
    label(text, { size: 0.22, color: C.bone, anchorY: 'middle', position: [LEG_X + 0.68, y, 0] }),
  );
}

legendRow(BOX_T - 0.15, RIEMANN_COLOR, 4.5, 'Riemann sums');
legendRow(BOX_T - 0.58, MONTE_COLOR, 2.8, 'Monte Carlo');

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

const budgetReadout = label('', {
  size: 0.185,
  color: C.slate,
  lineHeight: 1.45,
  anchorY: 'top',
  position: [LEG_X, BOX_T - 3.0, 0],
});

stage.add(dimReadout, noteReadout, budgetReadout);

// ---------------------------------------------------------------------------
// Everything that depends on the budget
// ---------------------------------------------------------------------------

const dynamic = new THREE.Group();
stage.add(dynamic);

let rCurves: [number, number][][] = [];
let mCurves: [number, number][][] = [];
let rLines: ReturnType<typeof polyline>[] = [];
let mLines: ReturnType<typeof polyline>[] = [];
let rSeed: [number, number][][] = [];
let mSeed: [number, number][][] = [];
let dots: THREE.InstancedMesh[] = [];
let dimLabels: ReturnType<typeof label>[] = [];
let dimEnd: [number, number][] = [];
let sweepFrom: number[] = [];
let guide: ReturnType<typeof polyline> | null = null;
let guideLabel: ReturnType<typeof label> | null = null;
let replicates = 12;

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
      if (i > 0 && pts[i - 1][0] <= xr) {
        const [xp, yp] = pts[i - 1];
        const t = (xr - xp) / (x - xp);
        last = [xr, yp + (y - yp) * t];
      }
      out.push([px(last[0]), py(last[1]), z]);
    }
  }
  return out;
}

/** Thousands separators, matching the cost ticks. */
function grouped(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/**
 * Empty the dynamic group and release its GPU resources. The line materials
 * stay registered in lines.ts — a handful of dead entries there is harmless,
 * and leaving the buffers on the card across a dozen rebuilds would not be.
 */
function clearDynamic(): void {
  for (const child of [...dynamic.children]) {
    dynamic.remove(child);
    const c = child as unknown as {
      geometry?: { dispose?: () => void };
      material?: { dispose?: () => void } | { dispose?: () => void }[];
      dispose?: () => void;
    };
    c.geometry?.dispose?.();
    if (Array.isArray(c.material)) for (const m of c.material) m.dispose?.();
    else c.material?.dispose?.();
    c.dispose?.();
  }
}

function rebuild(): void {
  const budget = Math.round(Math.pow(2, params.budget));
  replicates = Math.max(4, Math.min(32, Math.round(TARGET_WORK / budget)));

  const started = performance.now();
  const steps = ladder(budget);
  rCurves = DIMS.map((d) => clip(riemannCurve(d, budget)));
  mCurves = DIMS.map((d) => clip(monteCarloCurve(d, steps, replicates)));
  const buildMs = performance.now() - started;

  X1 = Math.log10(budget);
  DECX = BOX_W / (X1 - X0);

  clearDynamic();

  // Cost gridlines and ticks. Every decade if they fit, otherwise every other.
  const stride = DECX >= 0.7 ? 1 : 2;
  for (let e = Math.ceil(X0); e <= X1 + 1e-9; e += stride) {
    const line = polyline([[px(e), py(Y0), 0], [px(e), py(Y1), 0]], {
      color: C.slateDeep,
      width: 1.2,
    });
    line.position.z = -0.2;
    dynamic.add(
      line,
      label(grouped(Math.round(Math.pow(10, e))), {
        size: 0.19,
        color: C.ash,
        anchorX: 'center',
        position: [px(e), py(Y0) - 0.34, 0],
      }),
    );
  }

  // The guide: what slope −1/2 looks like on this box, at this budget.
  const GUIDE_Y0 = -0.3;
  guide = polyline([[px(X0), py(GUIDE_Y0), 0], [px(X1), py(GUIDE_Y0 - X1 / 2), 0]], {
    color: C.slateDeep,
    width: 2,
    dashed: true,
    dashSize: 0.13,
    gapSize: 0.09,
  });
  guide.position.z = -0.1;
  guideLabel = label('slope -1/2', {
    size: 0.19,
    color: C.slate,
    anchorX: 'right',
    position: [px(X1) - 0.05, py(GUIDE_Y0 - X1 / 2 - 0.45), 0],
  });
  dynamic.add(guide, guideLabel);

  // Line2 needs two vertices; a dimension with a single affordable grid is
  // carried by its dot, and one with none is not drawn at all.
  const pad = (pts: [number, number][]): [number, number][] =>
    pts.length >= 2 ? pts : pts.length === 1 ? [pts[0], pts[0]] : [[X0, Y0], [X0, Y0]];

  rSeed = rCurves.map(pad);
  mSeed = mCurves.map(pad);

  rLines = rSeed.map((pts) => {
    const line = polyline(revealed(pts, X1, 0.1), { color: RIEMANN_COLOR, width: 4.5 });
    dynamic.add(line);
    return line;
  });
  // Thinner than the grid curves: five sampled runs overlap, and the point is
  // that they are one line up to noise rather than five things to tell apart.
  mLines = mSeed.map((pts) => {
    const line = polyline(revealed(pts, X1, 0.05), { color: MONTE_COLOR, width: 2.8 });
    dynamic.add(line);
    return line;
  });

  /** A dot per affordable grid — the only resolutions that fit in the budget. */
  dots = rCurves.map((pts) => {
    const mesh = new THREE.InstancedMesh(
      new THREE.CircleGeometry(0.055, 20),
      flat(RIEMANN_COLOR),
      Math.max(1, pts.length),
    );
    mesh.frustumCulled = false;
    mesh.position.z = 0.15;
    mesh.count = 0;
    const m = new THREE.Matrix4();
    pts.forEach((p, i) => mesh.setMatrixAt(i, m.makeTranslation(px(p[0]), py(p[1]), 0)));
    mesh.instanceMatrix.needsUpdate = true;
    dynamic.add(mesh);
    return mesh;
  });

  /**
   * Name each dimension where its grid curve *ends* — the one place the five
   * are reliably far apart. When the budget affords no grid at all, the name
   * moves onto the sampled curve, which is the only one left to label.
   */
  dimEnd = DIMS.map((_, i) => {
    const src = rCurves[i].length > 0 ? rCurves[i] : mCurves[i];
    return src[src.length - 1] ?? [X1, Y1];
  });

  const onRightEdge: boolean[] = [];
  dimLabels = DIMS.map((d, i) => {
    const [ex, ey] = dimEnd[i];
    onRightEdge[i] = ex > X1 - 1e-6;
    // Outside the box on the right: inside, these land on the sampled bundle.
    // Always middle-anchored, so the de-collision pass below is comparing like
    // with like; the ones that end short of the edge just sit a little higher.
    const t = label(`d = ${d}`, {
      size: 0.22,
      color: rCurves[i].length > 0 ? RIEMANN_COLOR : MONTE_COLOR,
      anchorY: 'middle',
      position: [px(ex) + 0.14, py(ey) + (onRightEdge[i] ? 0 : 0.16), 0.2],
    });
    t.visible = false;
    dynamic.add(t);
    return t;
  });

  // Curves can finish within a few percent of each other — at a small budget
  // d = 4 and d = 16 land almost on top of one another. Walk the names in
  // height order and push any that crowd a neighbour upwards; there is nothing
  // above the stack but empty margin.
  const MIN_GAP = 0.34; // centre to centre, against a cap height of 0.22
  const NEAR_X = 0.85; // about one label wide
  const order = DIMS.map((_, i) => i).sort(
    (a, b) => dimLabels[a].position.y - dimLabels[b].position.y,
  );
  for (let k = 1; k < order.length; k++) {
    const here = dimLabels[order[k]];
    for (let j = 0; j < k; j++) {
      const other = dimLabels[order[j]];
      if (Math.abs(other.position.x - here.position.x) > NEAR_X) continue;
      if (here.position.y < other.position.y + MIN_GAP) {
        here.position.y = other.position.y + MIN_GAP;
      }
    }
  }

  sweepFrom = DIMS.map((_, i) =>
    Math.min(rCurves[i][0]?.[0] ?? X1, mCurves[i][0]?.[0] ?? X1),
  );

  setText(
    budgetReadout,
    `budget: ${grouped(budget)} evaluations\n${replicates} runs averaged`,
  );

  // Start the sweep over, so the slider reads as "re-run from here".
  stage.t = 0;

  console.info(
    `curse-of-dimension: budget ${budget}, ${replicates} replicates, built in ` +
      `${buildMs.toFixed(0)} ms; grids affordable: ` +
      `${rCurves.map((c, i) => `d=${DIMS[i]}:${c.length}`).join(' ')}`,
  );
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

const params = { animate: true, step: DIMS.length, guide: true, budget: 16 };

ui.params.add(params, 'animate').name('sweep through dimensions');
ui.params.add(params, 'step', 0, DIMS.length, 0.01).name('progress');
ui.params.add(params, 'guide').name('show the -1/2 guide');
// Rebuilt on release, not during the drag: one rebuild is about a second of
// honest sampling, and doing that per mouse-move would lock the page up.
ui.params
  .add(params, 'budget', 8, 18, 1)
  .name('budget (2 to the n)')
  .onFinishChange(() => rebuild());

// ---------------------------------------------------------------------------
// Timing
// ---------------------------------------------------------------------------

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
  const finest = Math.floor(Math.pow(Math.pow(10, X1), 1 / DIMS[i]) + 1e-9);
  return `${n} grids fit in the budget,\nup to ${finest} points per axis`;
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

rebuild();

stage.frame((t) => {
  const p = params.animate ? progressAt(t) : params.step;
  if (guide) guide.visible = params.guide;
  if (guideLabel) guideLabel.visible = params.guide;

  for (let i = 0; i < DIMS.length; i++) {
    // How far this dimension's sweep has travelled, in log-cost. It starts at
    // the cheapest thing this dimension has to show rather than at the left
    // edge, or a quarter of every sweep is spent crossing empty box.
    const local = Math.min(1, Math.max(0, p - i));
    const xr = sweepFrom[i] + (X1 - sweepFrom[i]) * local;
    const shown = local > 0;

    rLines[i].visible = shown && rCurves[i].length >= 2;
    mLines[i].visible = shown && mCurves[i].length >= 2;
    // The name lands as the curve reaches the place it is parked.
    dimLabels[i].visible = shown && xr >= dimEnd[i][0] - 1e-9;

    if (!shown) {
      dots[i].count = 0;
      continue;
    }

    setPolyline(rLines[i], revealed(rSeed[i], xr, 0.1));
    setPolyline(mLines[i], revealed(mSeed[i], xr, 0.05));

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
