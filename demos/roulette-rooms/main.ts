/**
 * The same walks, scored two ways.
 *
 * Two rooms, side by side, containing **the identical set of paths** — same
 * geometry, same vertices, same cost. Nothing about the sampling differs. What
 * differs is which vertices are allowed to count:
 *
 *   left   a length is drawn first, the walk is taken, and only the vertex it
 *          finished on is scored
 *   right  the walk is scored at every vertex it passed
 *
 * The left room is what the naive algorithm does: pick how long the path will
 * be, trace it, report the term of that length. The right room is roulette:
 * keep every prefix, each divided by the chance of having got that far.
 *
 * ## Why the paths can be identical
 *
 * With a constant survival probability s, "draw N from the geometric law and
 * walk N bounces" and "walk, killing with probability 1 − s at each vertex"
 * are the same distribution. So there is no sleight of hand in drawing one set
 * of walks and using it twice — the two rooms are not merely comparable, they
 * are the same experiment read differently, at exactly the same price.
 *
 * That is the whole argument. The right room finds the lamp far more often
 * than the left one, out of the same walks, for no extra work at all.
 *
 * ## What is actually computed
 *
 * The room is the deck's room cut into boundary patches, with form factors
 * carrying a real visibility test and rows normalised to one — which makes each
 * row the law of where the light arriving there came from. So the walk is a
 * genuine path trace of the same operator `fixed-point` iterates as a matrix,
 * and the estimates below the rooms are what those visible paths actually give.
 *
 * Writing Δ_k = T_k e_k for the k-bounce term, with T_k the product of the
 * albedos so far and e the emission where the walk landed:
 *
 *   left    Δ_J / Pr(N = J)   =  T_J e_J / ((1 − s) s^J)
 *   right   Σ_{k≤J} Δ_k / Pr(J ≥ k)  =  Σ_{k≤J} T_k e_k / s^k
 *
 * Both are unbiased. The exact answer is available too — solve L = E + T L on
 * the discretised room — so both are drawn against the truth rather than
 * against each other.
 *
 * ## Honest about the sample size
 *
 * The numbers under each room come from *the paths on screen*, not from a
 * larger hidden ensemble. A hundred-odd walks is far too few to converge, and
 * the left estimate lurching about while the right one holds still is the
 * variance difference itself, not a defect of the drawing.
 *
 * The lamp is deliberately a wide strip. With a small emitter almost no walk
 * finds it at all and both rooms sit empty, which demonstrates nothing.
 *
 * The room operator is built here rather than shared: `fixed-point` and
 * `bounce-series` each build their own too, and none of the three wants quite
 * the same thing out of it.
 */

import * as THREE from 'three';
import { createStage, createUI, BACKGROUND, C, flat, mix } from '@';
import { polyline, setPolyline, type Pt } from '@/lines';
import { label, setText, fixed } from '@/text';
import { mulberry32 } from '@/sampling';

// ---------------------------------------------------------------------------
// The room, as patches
// ---------------------------------------------------------------------------

const RX = 1.8;
const RY = 1.55;
const DISC = { x: -0.55, y: -0.6, r: 0.5 };
/** A wide lamp: with a narrow one, hardly any walk ever finds it. */
const EMIT_HALF = 1.0;

const NW = 28;
const ND = 24;
const M = 4 * NW + ND;

interface Patch {
  x: number;
  y: number;
  nx: number;
  ny: number;
  ds: number;
  mat: number;
  emits: boolean;
}

const patches: Patch[] = [];

for (let side = 0; side < 4; side++) {
  const len = side % 2 === 0 ? 2 * RX : 2 * RY;
  const ds = len / NW;
  for (let k = 0; k < NW; k++) {
    const f = (k + 0.5) / NW;
    let x = 0;
    let y = 0;
    let nx = 0;
    let ny = 0;
    if (side === 0) {
      x = -RX + 2 * RX * f;
      y = -RY;
      ny = 1;
    } else if (side === 1) {
      x = RX;
      y = -RY + 2 * RY * f;
      nx = -1;
    } else if (side === 2) {
      x = RX - 2 * RX * f;
      y = RY;
      ny = -1;
    } else {
      x = -RX;
      y = RY - 2 * RY * f;
      nx = 1;
    }
    patches.push({ x, y, nx, ny, ds, mat: side, emits: side === 2 && Math.abs(x) < EMIT_HALF });
  }
}

for (let k = 0; k < ND; k++) {
  const a = (2 * Math.PI * (k + 0.5)) / ND - Math.PI;
  const nx = Math.cos(a);
  const ny = Math.sin(a);
  patches.push({
    x: DISC.x + DISC.r * nx,
    y: DISC.y + DISC.r * ny,
    nx,
    ny,
    ds: (2 * Math.PI * DISC.r) / ND,
    mat: 4,
    emits: false,
  });
}

function blocked(a: Patch, b: Patch): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return true;
  const ux = dx / len;
  const uy = dy / len;
  const ox = a.x - DISC.x;
  const oy = a.y - DISC.y;
  const t = -(ox * ux + oy * uy);
  if (t <= 0 || t >= len) return false;
  return Math.hypot(ox + ux * t, oy + uy * t) < DISC.r - 1e-3;
}

/** Row-normalised form factors, stored as CDFs so a walk can sample them. */
const CDF = new Float32Array(M * M);

(function buildOperator() {
  const row = new Float64Array(M);
  for (let i = 0; i < M; i++) {
    const a = patches[i];
    let sum = 0;
    row.fill(0);
    for (let j = 0; j < M; j++) {
      if (i === j) continue;
      const b = patches[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const r = Math.hypot(dx, dy);
      if (r < 1e-6) continue;
      const ux = dx / r;
      const uy = dy / r;
      const ci = a.nx * ux + a.ny * uy;
      const cj = -(b.nx * ux + b.ny * uy);
      if (ci <= 0 || cj <= 0) continue;
      if (blocked(a, b)) continue;
      const f = (ci * cj * b.ds) / (2 * r);
      row[j] = f;
      sum += f;
    }
    let acc = 0;
    for (let j = 0; j < M; j++) {
      acc += sum > 1e-9 ? row[j] / sum : 1 / M;
      CDF[i * M + j] = acc;
    }
    CDF[i * M + M - 1] = 1;
  }
})();

function nextVertex(i: number, u: number): number {
  const base = i * M;
  let lo = 0;
  let hi = M - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (CDF[base + mid] < u) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// ---------------------------------------------------------------------------
// Materials, and the answer
// ---------------------------------------------------------------------------

const MAT_ALBEDO = [0.78, 0.7, 0.86, 0.74, 0.7];

const albedo = new Float64Array(M);
const emission = new Float64Array(M);

/** The patch whose brightness is being estimated. */
const I0 = (() => {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < NW; i++) {
    const d = Math.abs(patches[i].x - 0.95);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
})();

let exactValue = 0;

function solveExact(): void {
  for (let i = 0; i < M; i++) {
    albedo[i] = MAT_ALBEDO[patches[i].mat];
    emission[i] = patches[i].emits ? 1 : 0;
  }
  const cur = new Float64Array(M);
  const nxt = new Float64Array(M);
  cur.set(emission);
  for (let step = 0; step < 300; step++) {
    for (let i = 0; i < M; i++) {
      let s = 0;
      let prev = 0;
      const base = i * M;
      for (let j = 0; j < M; j++) {
        const w = CDF[base + j] - prev;
        prev = CDF[base + j];
        if (w > 0) s += w * cur[j];
      }
      nxt[i] = emission[i] + albedo[i] * s;
    }
    cur.set(nxt);
  }
  exactValue = cur[I0];
}
solveExact();

// ---------------------------------------------------------------------------
// The walks
// ---------------------------------------------------------------------------

const MAX_PATHS = 46;
/** A walk longer than this is vanishingly rare; the cap keeps memory bounded. */
const MAX_LEN = 60;

interface Walk {
  /** Patch indices, starting at the probe. */
  verts: number[];
  /** Indices into `verts` that sit on the lamp. */
  lampAt: number[];
  /** What each room scores from this walk. */
  lastValue: number;
  everyValue: number;
  /** True when the walk's final vertex is on the lamp. */
  lastScores: boolean;
}

let walks: Walk[] = [];
/** Running sums, so a frame's estimate is a lookup rather than a loop. */
let cumLast = new Float64Array(MAX_PATHS + 1);
let cumEvery = new Float64Array(MAX_PATHS + 1);
let cumLastHits = new Int32Array(MAX_PATHS + 1);
let cumEveryHits = new Int32Array(MAX_PATHS + 1);

function buildWalks(s: number): void {
  const rng = mulberry32(0x2f6d3b);
  walks = [];
  cumLast = new Float64Array(MAX_PATHS + 1);
  cumEvery = new Float64Array(MAX_PATHS + 1);
  cumLastHits = new Int32Array(MAX_PATHS + 1);
  cumEveryHits = new Int32Array(MAX_PATHS + 1);

  for (let i = 0; i < MAX_PATHS; i++) {
    // The length, drawn up front: Pr(N = n) = (1 − s) s^n. Counting survivals
    // is the same draw the roulette makes as it goes — which is exactly why
    // one set of walks can serve both rooms.
    let J = 0;
    while (rng() < s && J < MAX_LEN) J++;

    const verts = [I0];
    const lampAt: number[] = [];
    let p = I0;
    let through = 1;
    let every = 0;

    if (emission[p] > 0) {
      every += through;
      lampAt.push(0);
    }
    for (let k = 1; k <= J; k++) {
      through *= albedo[p];
      p = nextVertex(p, rng());
      verts.push(p);
      if (emission[p] > 0) {
        every += (through * emission[p]) / Math.pow(s, k);
        lampAt.push(k);
      }
    }

    const lastScores = emission[p] > 0;
    const lastValue = lastScores ? (through * emission[p]) / ((1 - s) * Math.pow(s, J)) : 0;

    walks.push({ verts, lampAt, lastValue, everyValue: every, lastScores });
    cumLast[i + 1] = cumLast[i] + lastValue;
    cumEvery[i + 1] = cumEvery[i] + every;
    cumLastHits[i + 1] = cumLastHits[i] + (lastScores ? 1 : 0);
    cumEveryHits[i + 1] = cumEveryHits[i] + (lampAt.length > 0 ? 1 : 0);
  }
}

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
stage.duration = 15;

const ui = createUI(stage);

const ROOM_CX = [-2.62, 2.62];
const ROOM_CY = 0.78;

const rx = (side: number, x: number): number => ROOM_CX[side] + x;
const ry = (y: number): number => ROOM_CY + y;

// ---------------------------------------------------------------------------
// Static scenery
// ---------------------------------------------------------------------------

for (let side = 0; side < 2; side++) {
  stage.add(
    polyline(
      [
        [rx(side, -RX), ry(-RY), 0],
        [rx(side, RX), ry(-RY), 0],
        [rx(side, RX), ry(RY), 0],
        [rx(side, -RX), ry(RY), 0],
        [rx(side, -RX), ry(-RY), 0],
      ],
      { color: C.slate, width: 3 },
    ),
    polyline([[rx(side, -EMIT_HALF), ry(RY), 0], [rx(side, EMIT_HALF), ry(RY), 0]], {
      color: C.ochre,
      width: 8,
    }),
  );

  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(DISC.r, 48),
    flat(mix(BACKGROUND, C.blue, 0.3)),
  );
  disc.position.set(rx(side, DISC.x), ry(DISC.y), -0.1);
  stage.add(disc);

  const ring: Pt[] = [];
  for (let i = 0; i <= 48; i++) {
    const a = (2 * Math.PI * i) / 48;
    ring.push([rx(side, DISC.x + DISC.r * Math.cos(a)), ry(DISC.y + DISC.r * Math.sin(a)), 0]);
  }
  stage.add(polyline(ring, { color: C.blue, width: 2 }));

  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.08, 20), flat(C.bone));
  dot.position.set(rx(side, patches[I0].x), ry(patches[I0].y), 0.4);
  stage.add(dot);
}

stage.add(
  label('the same walks in both rooms', {
    size: 0.19,
    color: C.slate,
    anchorX: 'center',
    position: [0, ry(RY) + 0.34, 0],
  }),
);

const TITLES = ['score only the last vertex', 'score every vertex'];
for (let side = 0; side < 2; side++) {
  stage.add(
    label(TITLES[side], {
      size: 0.24,
      color: side === 0 ? C.slate : C.ochre,
      anchorX: 'center',
      position: [ROOM_CX[side], ry(-RY) - 0.48, 0],
    }),
  );
}

// ---------------------------------------------------------------------------
// The estimate bars
// ---------------------------------------------------------------------------

const BAR_Y = -2.18;
const BAR_HALF = 1.55;
/** The bar runs from zero to twice the exact answer, with the truth at centre. */
const bx = (side: number, v: number): number =>
  ROOM_CX[side] - BAR_HALF + Math.min(2, Math.max(0, v / exactValue)) * BAR_HALF;

const bars: THREE.Mesh[] = [];
const hitReadouts: ReturnType<typeof label>[] = [];
const valueReadouts: ReturnType<typeof label>[] = [];

for (let side = 0; side < 2; side++) {
  stage.add(
    polyline(
      [
        [ROOM_CX[side] - BAR_HALF, BAR_Y - 0.15, 0],
        [ROOM_CX[side] - BAR_HALF, BAR_Y + 0.15, 0],
      ],
      { color: C.slateDeep, width: 2 },
    ),
    // The truth, as a tick the bar is trying to reach.
    polyline(
      [
        [ROOM_CX[side], BAR_Y - 0.22, 0],
        [ROOM_CX[side], BAR_Y + 0.22, 0],
      ],
      { color: C.bone, width: 2.5 },
    ),
    label('exact', {
      size: 0.17,
      color: C.bone,
      anchorX: 'center',
      position: [ROOM_CX[side], BAR_Y + 0.3, 0],
    }),
  );

  const bar = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 0.2),
    flat(side === 0 ? C.slate : C.ochre),
  );
  bar.position.z = 0.05;
  stage.add(bar);
  bars.push(bar);

  hitReadouts.push(
    label('', {
      size: 0.2,
      color: C.ash,
      anchorX: 'center',
      position: [ROOM_CX[side], ry(-RY) - 0.82, 0],
    }),
  );
  valueReadouts.push(
    label('', {
      size: 0.2,
      color: C.ash,
      anchorX: 'center',
      position: [ROOM_CX[side], BAR_Y - 0.62, 0],
    }),
  );
}
stage.add(...hitReadouts, ...valueReadouts);

// ---------------------------------------------------------------------------
// The paths
// ---------------------------------------------------------------------------

const DIM_MISS = mix(BACKGROUND, C.slate, 0.34);
const DIM_HIT = mix(BACKGROUND, C.ochre, 0.8);

const pathLines: ReturnType<typeof polyline>[][] = [[], []];
/** Lamp touches this room banks. Filled. */
const kept: THREE.InstancedMesh[] = [];
/** Lamp touches this room found and threw away. Hollow, so the waste shows. */
const binned: THREE.InstancedMesh[] = [];
const keptOffset: number[][] = [[], []];
const binnedOffset: number[][] = [[], []];

/**
 * Which vertices of a walk each room marks. The left room may only bank the
 * vertex the walk finished on, so every *other* lamp touch it made is drawn as
 * an empty ring: found, and discarded. Without that ring a wasted hit looks
 * exactly like a walk that never found the lamp at all, and the whole strategy
 * becomes invisible.
 */
function marks(w: Walk, side: number): { keep: number[]; bin: number[] } {
  if (side === 1) return { keep: w.lampAt, bin: [] };
  const last = w.verts.length - 1;
  return {
    keep: w.lastScores ? [last] : [],
    bin: w.lampAt.filter((k) => k !== last),
  };
}

const dynamic = new THREE.Group();
stage.add(dynamic);

function clearDynamic(): void {
  for (const child of [...dynamic.children]) {
    dynamic.remove(child);
    const c = child as unknown as {
      geometry?: { dispose?: () => void };
      material?: { dispose?: () => void };
      dispose?: () => void;
    };
    c.geometry?.dispose?.();
    c.material?.dispose?.();
    c.dispose?.();
  }
}

function buildPaths(): void {
  clearDynamic();
  pathLines[0] = [];
  pathLines[1] = [];
  kept.length = 0;
  binned.length = 0;

  for (let side = 0; side < 2; side++) {
    keptOffset[side] = [];
    binnedOffset[side] = [];
    let nKeep = 0;
    let nBin = 0;
    for (const w of walks) {
      keptOffset[side].push(nKeep);
      binnedOffset[side].push(nBin);
      const mk = marks(w, side);
      nKeep += mk.keep.length;
      nBin += mk.bin.length;
    }
    keptOffset[side].push(nKeep);
    binnedOffset[side].push(nBin);

    const keepMesh = new THREE.InstancedMesh(
      new THREE.CircleGeometry(0.075, 18),
      flat(C.ochre),
      Math.max(1, nKeep),
    );
    const binMesh = new THREE.InstancedMesh(
      new THREE.RingGeometry(0.055, 0.085, 18),
      flat(C.slate),
      Math.max(1, nBin),
    );
    for (const mesh of [keepMesh, binMesh]) {
      mesh.frustumCulled = false;
      mesh.position.z = 0.35;
      mesh.count = 0;
      dynamic.add(mesh);
    }

    const m = new THREE.Matrix4();
    let a = 0;
    let b = 0;
    for (const w of walks) {
      const mk = marks(w, side);
      for (const k of mk.keep) {
        const q = patches[w.verts[k]];
        keepMesh.setMatrixAt(a++, m.makeTranslation(rx(side, q.x), ry(q.y), 0));
      }
      for (const k of mk.bin) {
        const q = patches[w.verts[k]];
        binMesh.setMatrixAt(b++, m.makeTranslation(rx(side, q.x), ry(q.y), 0));
      }
    }
    keepMesh.instanceMatrix.needsUpdate = true;
    binMesh.instanceMatrix.needsUpdate = true;
    kept.push(keepMesh);
    binned.push(binMesh);

    for (const w of walks) {
      const scores = side === 0 ? w.lastScores : w.lampAt.length > 0;
      const pts: Pt[] = w.verts.map((v) => [rx(side, patches[v].x), ry(patches[v].y), 0]);
      if (pts.length < 2) pts.push(pts[0]);
      const line = polyline(pts, {
        color: scores ? DIM_HIT : DIM_MISS,
        width: scores ? 1.8 : 1.2,
      });
      line.position.z = scores ? 0.2 : 0.1;
      line.visible = false;
      dynamic.add(line);
      pathLines[side].push(line);
    }
  }
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

const params = { survival: 0.78, animate: true, paths: MAX_PATHS };
ui.params.add(params, 'survival', 0.4, 0.9, 0.01).name('survival probability');
ui.params.add(params, 'animate').name('accumulate walks');
ui.params.add(params, 'paths', 1, MAX_PATHS, 1).name('walks shown');

let builtFor = -1;

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

const scratch: Pt[] = [];

stage.frame((t) => {
  if (params.survival !== builtFor) {
    builtFor = params.survival;
    buildWalks(params.survival);
    buildPaths();
  }

  // Slow at first, so single walks can be followed, then piling up.
  const u = Math.min(1, t / (stage.duration - 1.2));
  const progress = params.animate ? 1 + (MAX_PATHS - 1) * Math.pow(u, 2.1) : params.paths;
  const n = Math.min(MAX_PATHS, Math.max(1, Math.floor(progress)));
  const frac = params.animate ? Math.min(1, progress - n) : 1;

  for (let side = 0; side < 2; side++) {
    const lines = pathLines[side];
    // Colour every visible walk from scratch. Restoring only the previously
    // highlighted one leaves a trail of white paths behind, because once the
    // ramp accelerates `n` climbs by several between frames.
    for (let i = 0; i < MAX_PATHS; i++) {
      const on = i < n;
      lines[i].visible = on;
      if (!on) continue;
      const wi = walks[i];
      const scores = side === 0 ? wi.lastScores : wi.lampAt.length > 0;
      const newest = i === n - 1;
      (lines[i].material as { color: THREE.Color }).color.setHex(
        newest ? C.bone : scores ? DIM_HIT : DIM_MISS,
      );
      lines[i].position.z = newest ? 0.3 : scores ? 0.2 : 0.1;
    }

    // The newest walk draws itself in, so early on there is something to watch.
    const w = walks[n - 1];
    const reveal = Math.max(2, Math.ceil(frac * w.verts.length) + 1);
    scratch.length = 0;
    for (let k = 0; k < w.verts.length; k++) {
      const v = w.verts[Math.min(k, reveal - 1)];
      scratch.push([rx(side, patches[v].x), ry(patches[v].y), 0]);
    }
    if (scratch.length < 2) scratch.push(scratch[0]);
    setPolyline(lines[n - 1], scratch);

    // Markers for the walks on screen, minus any on the newest walk the reveal
    // has not reached yet.
    const mk = marks(w, side);
    let showKeep = keptOffset[side][n];
    let showBin = binnedOffset[side][n];
    if (frac < 1) {
      for (const k of mk.keep) if (k > reveal - 1) showKeep--;
      for (const k of mk.bin) if (k > reveal - 1) showBin--;
    }
    kept[side].count = Math.max(0, showKeep);
    binned[side].count = Math.max(0, showBin);
  }

  // --- the estimates ------------------------------------------------------
  const estLast = cumLast[n] / n;
  const estEvery = cumEvery[n] / n;

  for (let side = 0; side < 2; side++) {
    const est = side === 0 ? estLast : estEvery;
    const left = ROOM_CX[side] - BAR_HALF;
    const right = bx(side, est);
    const w = Math.max(0.001, right - left);
    bars[side].scale.x = w;
    bars[side].position.set(left + w / 2, BAR_Y, 0.05);
  }

  setText(
    hitReadouts[0],
    `${cumLastHits[n]} of ${n} walks scored`,
  );
  setText(
    hitReadouts[1],
    `${cumEveryHits[n]} of ${n} walks scored`,
  );
  setText(valueReadouts[0], `${fixed(estLast, 3)}`);
  setText(valueReadouts[1], `${fixed(estEvery, 3)}`);
});

stage.start();

/**
 * A sanity line, not a display: both estimators are supposed to be unbiased, so
 * over a large ensemble both means must land on the exact value. Only a few
 * dozen walks are ever on screen, and at that size either number can be a long
 * way off — this is how we know that is variance and not a mistake.
 */
(function checkUnbiased(): void {
  const N = 120000;
  const s = 0.78;
  const rng = mulberry32(0x1234abc);
  let sumLast = 0;
  let sumEvery = 0;
  let vertices = 0;
  for (let i = 0; i < N; i++) {
    let J = 0;
    while (rng() < s && J < MAX_LEN) J++;
    let p = I0;
    let through = 1;
    let every = emission[p];
    for (let k = 1; k <= J; k++) {
      through *= albedo[p];
      p = nextVertex(p, rng());
      if (emission[p] > 0) every += (through * emission[p]) / Math.pow(s, k);
    }
    vertices += J + 1;
    sumEvery += every;
    if (emission[p] > 0) sumLast += (through * emission[p]) / ((1 - s) * Math.pow(s, J));
  }
  const pct = (v: number) => `${((100 * (v - exactValue)) / exactValue).toFixed(2)}%`;
  console.info(
    `roulette-rooms: exact ${exactValue.toFixed(5)}; over ${N} walks ` +
      `(${(vertices / N).toFixed(2)} vertices each, identical for both) ` +
      `last-vertex gives ${(sumLast / N).toFixed(5)} (${pct(sumLast / N)}), ` +
      `every-vertex gives ${(sumEvery / N).toFixed(5)} (${pct(sumEvery / N)})`,
  );
})();
