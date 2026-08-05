/**
 * Banach in the plane, before Banach in a room.
 *
 * A square of the plane, drawn as a grid, slides into its image under a
 * contraction. Then the image slides into *its* image, and so on. Every
 * generation stays behind as a ghost, so what builds up is the nested sequence
 * f(X) ⊃ f²(X) ⊃ f³(X) ⊃ … winding onto the one point the map holds still.
 *
 * This is the warm-up for `fixed-point`, which runs the same argument on light
 * fields. Here the space is two-dimensional and you can watch the whole thing;
 * there it is infinite-dimensional and you cannot. The theorem does not notice
 * the difference, which is why this one goes first.
 *
 * ## The map
 *
 * Complicated enough that nobody mistakes it for a similarity, and still a
 * genuine contraction:
 *
 *   f(p) = q + s·R(θ + w·r²/(1 + r²/2))·p + a·(sin(k·p_y + 0.9), sin(k·p_x − 0.6))
 *
 * A shrinking rotation whose angle grows with radius — so the grid winds up —
 * plus a sinusoidal shear that bends the lines. The swirl *saturates* rather
 * than growing with r², which is what keeps ‖Df‖ bounded on the whole plane
 * instead of only on the square.
 *
 * There is a budget here worth knowing about: to first order ‖Df‖ ≲ s(1 + w) +
 * a·k, so shrinking slowly and distorting a lot are in direct competition. The
 * defaults spend it at roughly two thirds shrink, one third distortion.
 *
 * ## c is measured, not asserted
 *
 * The readout is the largest singular value of Df found over a grid of points,
 * by central differences — the actual Lipschitz constant, recomputed whenever a
 * slider moves. It is attained in the interior (near r ≈ 1.7), so it is the
 * constant on all of ℝ², and ℝ² is complete: Banach applies as written, and the
 * square is along for the ride rather than being the space. Push a slider until
 * c ≥ 1 and the readout goes rust and the iterates stop crunching — the honest
 * failure mode, and the two-mirror room of the talk.
 *
 * ## The fixed point is exact
 *
 * Rather than iterating to find p⋆, we pick where we want it and solve for the
 * constant term: q = p⋆ − g(p⋆) makes p⋆ a fixed point by construction, at any
 * parameters. So the marker is not an estimate the animation converges near —
 * it is the fixed point, drawn from the first frame, and the grid lands on it.
 *
 * ## Sliding, not stepping
 *
 * `fixed-point` jumps between iterates on purpose: nothing there evolves in
 * time, and a smooth fade would quietly claim otherwise. Here the sliding *is*
 * the subject — each vertex travels a straight line to its image, so you watch
 * what the map does to a point rather than only what the picture looks like
 * afterwards. The counter still advances only when a generation lands.
 *
 * The loop ends held on the crunched state instead of returning to the square:
 * a contraction does not run backwards, and the exported clip is a one-shot.
 */

import * as THREE from 'three';
import { createStage, createUI, BACKGROUND, C, ramp, mix } from '@';
import { polyline, setPolyline, type Pt } from '@/lines';
import { label, setText } from '@/text';
import type { Line2 } from 'three/examples/jsm/lines/Line2.js';
import type { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';

// ---------------------------------------------------------------------------
// Shape of the piece
// ---------------------------------------------------------------------------

/** Half-width of the square of plane we watch. */
const R = 2;
/** Grid lines per family, so 2·NL polylines per generation. */
const NL = 11;
/** Samples along each grid line — enough that the bending reads as curvature. */
const S = 90;
const NLINES = 2 * NL;

/** How many times the map is applied over one loop. */
const MAX_N = 8;

/** Where we want the fixed point to sit. Chosen so f(square) ⊂ square. */
const FIXED: [number, number] = [0.5, -0.2];

/** A beat of undisturbed square before anything moves. */
const LEAD = 1.2;
/** Seconds per application, of which the first MORPH fraction is the slide. */
const STEP = 1.5;
const MORPH = 0.72;
/** Held on the crunched state at the end. */
const TAIL = 2.6;

const stage = createStage({
  camera: 'ortho',
  position: [0, 0, 10],
  target: [0, 0, 0],
  orthoHeight: 2.8,
  lights: false,
  controls: false,
});
stage.duration = LEAD + MAX_N * STEP + TAIL;

const ui = createUI(stage);

// ---------------------------------------------------------------------------
// The map
// ---------------------------------------------------------------------------

const params = {
  animate: true,
  iteration: 3,
  scale: 0.62,
  turn: 0.9,
  swirl: 0.5,
  wave: 0.15,
  frequency: 1.2,
};

/** Everything but the constant term: shrink, swirl, bend. */
function g(x: number, y: number, out: [number, number]): [number, number] {
  const r2 = x * x + y * y;
  // Saturating, so the angle stops growing in r and ‖Dg‖ stays bounded.
  const a = params.turn + params.swirl * (r2 / (1 + 0.5 * r2));
  const c = Math.cos(a);
  const s = Math.sin(a);
  out[0] = params.scale * (c * x - s * y) + params.wave * Math.sin(params.frequency * y + 0.9);
  out[1] = params.scale * (s * x + c * y) + params.wave * Math.sin(params.frequency * x - 0.6);
  return out;
}

/** The constant term, solved for so that FIXED is exactly the fixed point. */
const q: [number, number] = [0, 0];

function refreshConstant(): void {
  const v: [number, number] = [0, 0];
  g(FIXED[0], FIXED[1], v);
  q[0] = FIXED[0] - v[0];
  q[1] = FIXED[1] - v[1];
}

function f(x: number, y: number, out: [number, number]): [number, number] {
  g(x, y, out);
  out[0] += q[0];
  out[1] += q[1];
  return out;
}

/**
 * The Lipschitz constant: the largest singular value of Df over a grid, by
 * central differences. Measured on a box wider than the square we draw, since
 * the claim we want is about the plane.
 */
function lipschitz(): number {
  const h = 1e-4;
  const N = 90;
  const box = 1.6 * R;
  const xm: [number, number] = [0, 0];
  const xp: [number, number] = [0, 0];
  const ym: [number, number] = [0, 0];
  const yp: [number, number] = [0, 0];
  let worst = 0;
  for (let i = 0; i <= N; i++) {
    const x = -box + (2 * box * i) / N;
    for (let j = 0; j <= N; j++) {
      const y = -box + (2 * box * j) / N;
      g(x - h, y, xm);
      g(x + h, y, xp);
      g(x, y - h, ym);
      g(x, y + h, yp);
      const a = (xp[0] - xm[0]) / (2 * h);
      const c = (xp[1] - xm[1]) / (2 * h);
      const b = (yp[0] - ym[0]) / (2 * h);
      const d = (yp[1] - ym[1]) / (2 * h);
      // Largest singular value of [[a, b], [c, d]], in closed form.
      const E = a * a + b * b + c * c + d * d;
      const det = a * d - b * c;
      const sig = Math.sqrt((E + Math.sqrt(Math.max(0, E * E - 4 * det * det))) / 2);
      if (sig > worst) worst = sig;
    }
  }
  return worst;
}

// ---------------------------------------------------------------------------
// The orbit of the grid
// ---------------------------------------------------------------------------

/** orbit[k][l] is the l-th grid line after k applications, as xy pairs. */
const orbit: Float32Array[][] = [];
for (let k = 0; k <= MAX_N; k++) {
  const gen: Float32Array[] = [];
  for (let l = 0; l < NLINES; l++) gen.push(new Float32Array(2 * (S + 1)));
  orbit.push(gen);
}

function buildOrbit(): void {
  const base = orbit[0];
  for (let i = 0; i < NL; i++) {
    const u = -R + (2 * R * i) / (NL - 1);
    const a = base[2 * i];
    const b = base[2 * i + 1];
    for (let s = 0; s <= S; s++) {
      const v = -R + (2 * R * s) / S;
      a[2 * s] = u;
      a[2 * s + 1] = v;
      b[2 * s] = v;
      b[2 * s + 1] = u;
    }
  }

  const p: [number, number] = [0, 0];
  for (let k = 1; k <= MAX_N; k++) {
    for (let l = 0; l < NLINES; l++) {
      const src = orbit[k - 1][l];
      const dst = orbit[k][l];
      for (let s = 0; s <= S; s++) {
        f(src[2 * s], src[2 * s + 1], p);
        dst[2 * s] = p[0];
        dst[2 * s + 1] = p[1];
      }
    }
  }
}

refreshConstant();
buildOrbit();

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/** Reused, so a frame of morphing allocates nothing. */
const scratch: Pt[] = [];
for (let s = 0; s <= S; s++) scratch.push([0, 0, 0]);

function pointsOf(gen: Float32Array[], l: number, z: number): Pt[] {
  const src = gen[l];
  for (let s = 0; s <= S; s++) {
    const p = scratch[s] as [number, number, number];
    p[0] = src[2 * s];
    p[1] = src[2 * s + 1];
    p[2] = z;
  }
  return scratch;
}

/** The outermost line of each family is the boundary of the square. */
const isEdge = (l: number): boolean => l < 2 || l >= 2 * (NL - 1);
const widthOf = (l: number): number => (isEdge(l) ? 3.2 : 1.5);
/** Older generations sit further back, so the stack draws in order. */
const depthOf = (k: number): number => -0.01 * (MAX_N - k);

/**
 * How far back a landed generation sits. Applied as a *colour*, not as opacity:
 * a transparent Line2 double-blends where its round caps overlap, which turns a
 * dense polyline into a dotted one. Over a black background, dimming the colour
 * is the same picture with none of that.
 */
const GHOST = 0.38;

/**
 * One static copy per generation — the trail the animation leaves behind. Only
 * up to MAX_N − 1: the last generation is always the one the mover is holding,
 * so a ghost for it would never be drawn.
 */
const ghosts: Line2[][] = [];
for (let k = 0; k < MAX_N; k++) {
  const gen: Line2[] = [];
  for (let l = 0; l < NLINES; l++) {
    const line = polyline(pointsOf(orbit[k], l, depthOf(k)), {
      color: mix(BACKGROUND, ramp(k / MAX_N), GHOST),
      width: widthOf(l),
    });
    gen.push(line);
    stage.add(line);
  }
  ghosts.push(gen);
}

/** The one that moves: generation n sliding into generation n + 1. */
const moving: Line2[] = [];
for (let l = 0; l < NLINES; l++) {
  const line = polyline(pointsOf(orbit[0], l, 0.05), { color: ramp(0), width: widthOf(l) });
  moving.push(line);
  stage.add(line);
}

// ---------------------------------------------------------------------------
// Annotation
// ---------------------------------------------------------------------------

const RING = 0.13;
const ringPts: Pt[] = [];
for (let i = 0; i <= 64; i++) {
  const a = (2 * Math.PI * i) / 64;
  ringPts.push([FIXED[0] + RING * Math.cos(a), FIXED[1] + RING * Math.sin(a), 0.2]);
}
stage.add(polyline(ringPts, { color: C.bone, width: 2.2 }));

// The naming sits out in the margin on a leader, because the centre is exactly
// where the picture gets busiest — everything ends up on top of this point.
const LEAD_ANGLE = -0.7;
stage.add(
  polyline(
    [
      [FIXED[0] + (RING + 0.05) * Math.cos(LEAD_ANGLE), FIXED[1] + (RING + 0.05) * Math.sin(LEAD_ANGLE), 0.2],
      [2.55, -1.45, 0.2],
    ],
    { color: C.slate, width: 1.4 },
  ),
  label('the fixed point', {
    size: 0.19,
    color: C.bone,
    anchorY: 'middle',
    position: [2.68, -1.45, 0.2],
  }),
);

const iterLabel = label('', {
  size: 0.3,
  color: C.ochre,
  anchorX: 'center',
  position: [0, -2.55, 0.2],
});

const cLabel = label('', {
  size: 0.2,
  color: C.ash,
  lineHeight: 1.5,
  anchorY: 'top',
  position: [-4.75, 2.55, 0.2],
});

stage.add(iterLabel, cLabel);

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

ui.params.add(params, 'animate').name('slide through iterations');
ui.params.add(params, 'iteration', 0, MAX_N, 0.01).name('iteration');
ui.params.add(params, 'scale', 0.2, 1.1, 0.01).name('shrink');
ui.params.add(params, 'turn', 0, Math.PI, 0.01).name('turn');
ui.params.add(params, 'swirl', 0, 1.5, 0.01).name('swirl');
ui.params.add(params, 'wave', 0, 0.6, 0.01).name('bend');
ui.params.add(params, 'frequency', 0.4, 2.5, 0.05).name('bend frequency');

// ---------------------------------------------------------------------------
// Timing
// ---------------------------------------------------------------------------

const smoothstep = (x: number): number => x * x * (3 - 2 * x);

/** Fractional orbit position: 3.4 means 40% of the way from f³ to f⁴. */
function positionAt(t: number): number {
  const u = t % stage.duration;
  if (u <= LEAD) return 0;
  const v = u - LEAD;
  if (v >= MAX_N * STEP) return MAX_N;
  const k = Math.floor(v / STEP);
  const s = (v - k * STEP) / STEP;
  return k + smoothstep(Math.min(1, s / MORPH));
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

let mapKey = '';
let lastC = 0;

/** Rebuild the orbit when the map itself changed. Never once per frame. */
function rebuildIfNeeded(): void {
  const key = `${params.scale}|${params.turn}|${params.swirl}|${params.wave}|${params.frequency}`;
  if (key === mapKey) return;
  mapKey = key;

  refreshConstant();
  buildOrbit();
  for (let k = 0; k < MAX_N; k++) {
    for (let l = 0; l < NLINES; l++) setPolyline(ghosts[k][l], pointsOf(orbit[k], l, depthOf(k)));
  }

  lastC = lipschitz();
  // A map that no longer contracts should say so rather than quietly failing.
  cLabel.color = lastC < 1 ? C.ash : C.rust;
  setText(cLabel, `contraction constant\nc = ${lastC.toFixed(2)}`);
}

const tint = new THREE.Color();

stage.frame((t) => {
  rebuildIfNeeded();

  const pos = params.animate ? positionAt(t) : params.iteration;
  const n = Math.min(MAX_N - 1, Math.floor(pos));
  const u = Math.min(1, Math.max(0, pos - n));

  // The trail: every generation that has already landed.
  for (let k = 0; k < MAX_N; k++) {
    for (const line of ghosts[k]) line.visible = k <= n;
  }

  // The mover: every vertex travels a straight line to its image.
  const from = orbit[n];
  const to = orbit[n + 1];
  tint.setHex(mix(ramp(n / MAX_N), ramp((n + 1) / MAX_N), u));
  for (let l = 0; l < NLINES; l++) {
    const a = from[l];
    const b = to[l];
    for (let s = 0; s <= S; s++) {
      const p = scratch[s] as [number, number, number];
      p[0] = a[2 * s] + (b[2 * s] - a[2 * s]) * u;
      p[1] = a[2 * s + 1] + (b[2 * s + 1] - a[2 * s + 1]) * u;
      p[2] = 0.05;
    }
    setPolyline(moving[l], scratch);
    (moving[l].material as LineMaterial).color.copy(tint);
  }

  // A generation is only counted once it has arrived.
  const done = u >= 1 ? n + 1 : n;
  setText(iterLabel, done === 1 ? '1 iteration' : `${done} iterations`);
});

rebuildIfNeeded();
stage.start();

// A sanity line in the console rather than on the slide: the constant the
// defaults actually achieve, and confirmation of where the fixed point is.
console.info(
  `contraction-2d: Lipschitz constant c = ${lastC.toFixed(4)}, ` +
    `fixed point pinned at (${FIXED[0]}, ${FIXED[1]})`,
);
