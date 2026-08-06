/**
 * Importance sampling in 2D: where you look decides how much you learn.
 *
 * The integrand is a narrow diagonal ridge — nearly all of its mass in a thin
 * strip, numerically zero over most of the square. Two panels estimate the same
 * volume with the same number of samples, differing only in where the samples
 * come from:
 *
 *   uniform      points spread over the square. Most land in the dead region,
 *                cost an evaluation of f and learn nothing.
 *   importance   points drawn from a normal with the ridge's own oval shape,
 *                so they land where the mass is.
 *
 * Both are unbiased estimators of the same number:
 *
 *     uniform      (1/N) Σ f(xᵢ) · A            xᵢ ~ uniform on the square
 *     importance   (1/N) Σ f(xᵢ) / p(xᵢ)        xᵢ ~ p
 *
 * and both are drawn the same way: every sample gets a cylinder standing on the
 * domain whose *volume is that sample's contribution*. Its base is the area the
 * sample claims — A/N under uniform, 1/(N p) under importance — so in the right
 * panel the discs are tiny where samples crowd the ridge and wide out in the
 * tails, which is the reweighting made visible. Nothing is drawn that is not
 * also computed.
 *
 * The proposal is a *little wider* than the ridge (PROPOSAL_WIDEN), which is
 * not a fudge: a proposal with lighter tails than the target gives f/p an
 * unbounded ratio and an estimator with infinite variance. Widening is what
 * you actually do.
 *
 * p is the normal *truncated to the square* — samples that fall outside are
 * rejected, and p is divided by the Gaussian's mass inside the square, computed
 * by the same Simpson rule as the reference. Skipping that normalisation is the
 * standard way to get a plausible, wrong answer here.
 *
 * The exact value is a tensor-product Simpson rule, not a huge sample: a
 * reference estimated by sampling would be comparing these methods against a
 * worse version of one of them.
 *
 * Deterministic: the streams are regenerated from fixed seeds every frame, so
 * sample i is always the same point and a frame-stepped export is exact.
 */

import * as THREE from 'three';
import { createUI, C, flat, matte, mix } from '@';
import { polyline } from '@/lines';
import {
  FIELD_HALF,
  RIDGE_ANGLE,
  RIDGE_SX,
  RIDGE_SY,
  RIDGE_VOLUME,
  ridge2d,
  ridgeFrame,
  simpson2d,
} from '@/functions';
import { Z, HOLD, autoOrbit } from '@/field2d';
import { createComparison } from '@/compare2d';
import { mulberry32 } from '@/sampling';

const MAX_N = 8000;

/** Seconds at the head of the loop showing the integrand with no samples yet. */
const PRE_ROLL = 0.6;
const DOMAIN_AREA = 2 * FIELD_HALF * (2 * FIELD_HALF);

// ---------------------------------------------------------------------------
// The proposal density
// ---------------------------------------------------------------------------

/**
 * How much wider than the ridge the proposal is. Above 1 so f/p decays in the
 * tails; a proposal narrower than the target has unbounded f/p and infinite
 * variance, which is the classic way importance sampling goes wrong.
 */
const PROPOSAL_WIDEN = 1.3;
const PX = RIDGE_SX * PROPOSAL_WIDEN;
const PY = RIDGE_SY * PROPOSAL_WIDEN;

/** The unnormalised proposal: a normal with the ridge's oval shape. */
function gaussian(x: number, y: number): number {
  const [u, v] = ridgeFrame(x, y);
  return Math.exp(-0.5 * ((u / PX) ** 2 + (v / PY) ** 2)) / (2 * Math.PI * PX * PY);
}

/**
 * The mass of that normal inside the square. Samples landing outside are
 * rejected, so the density the accepted ones actually follow is gaussian / Zg
 * — and using the untruncated density instead would bias every estimate by
 * this factor.
 */
const Zg = simpson2d(gaussian, -FIELD_HALF, FIELD_HALF);

/** The proposal, as a probability density on the square. */
const proposal = (x: number, y: number) => gaussian(x, y) / Zg;

// ---------------------------------------------------------------------------
// Frame
// ---------------------------------------------------------------------------

const { stage, panels, startAngle } = createComparison(
  [
    // barKey names what the *end* of the track is; mark 1 puts a bright cap
    // there, so "full bar = the right answer" is stated twice and cannot be
    // misread as some part-way milestone.
    { title: 'Uniform', countKey: 'samples', barKey: 'exact', mark: 1 },
    { title: 'Importance', countKey: 'samples', barKey: 'exact', mark: 1 },
  ],
  RIDGE_VOLUME,
  ridge2d,
  {
    // The ridge is narrower than a cell of the default wireframe, which would
    // cut the crest off the surface it is drawn over — but only just: at 72 the
    // mesh is dense enough to read as a solid grey sheet in its own right, and
    // the extra opacity below makes that worse rather than better.
    wire: 44,
    // Held toward blue rather than the shared default's lift toward bone. That
    // lift exists so the glass stays legible over green bars; here the sheet is
    // mostly *not* over bars, and at this opacity the bone reads as white.
    color: mix(C.blue, C.bone, 0.28),
    // This is a slide whose whole argument is "one of these bars is longer".
    // The full readout band is a table to be read; the compact one keeps the
    // estimate, the error and a bar at twice the height.
    compact: true,
    // More opaque than the other 2D demos, and rimmed. The ridge is a thin
    // crest over a nearly flat sheet, so at the default 0.46 the graph reads as
    // a haze with no edge and no extent — and the picture opens on the graph
    // alone, which has to hold the frame by itself for half a second.
    opacity: 0.62,
    rim: true,
  },
);
const ui = createUI(stage);

// What each panel is drawing from, marked on its floor: the whole square on the
// left, the proposal's one- and two-sigma ovals on the right.
//
// Both are drawn as overlays — depth test off, on top of everything. A curve on
// the floor is the one thing that may do this: the samples it describes stand
// exactly on it, so a depth-tested oval is buried under its own cloud and the
// panels lose the marking that makes them a pair. Read it as a plan view laid
// over the picture, which is what it is. Nothing else in the frame does this;
// the spikes, which would genuinely lie about which cylinder is in front, do
// not.
function markRegion(scene: THREE.Scene, pts: [number, number, number][], opacity: number): void {
  const line = polyline(pts, { color: C.ochre, width: 3, opacity });
  line.material.depthTest = false;
  line.renderOrder = 40;
  scene.add(line);
}

// The uniform panel gets no ochre marking of its own. It used to carry a square
// on the domain boundary, as the counterpart to these ovals — but the domain now
// has a real border and a rim tube, and an ochre square laid over both was three
// lines saying one thing. Uniform sampling has no preferred region, and the
// absence of any ochre inside its square is the honest way to say so.
{
  const c = Math.cos(RIDGE_ANGLE);
  const s = Math.sin(RIDGE_ANGLE);
  for (const k of [1, 2]) {
    const pts: [number, number, number][] = [];
    for (let i = 0; i <= 128; i++) {
      const a = (i / 128) * Math.PI * 2;
      const u = k * PX * Math.cos(a);
      const v = k * PY * Math.sin(a);
      // Back out of the ridge frame: the ovals are the proposal's own level
      // sets, so they tilt with it rather than being drawn on by eye.
      pts.push([u * c - v * s, 0.006, u * s + v * c]);
    }
    markRegion(panels[1].scene, pts, k === 1 ? 0.9 : 0.5);
  }
}

// ---------------------------------------------------------------------------
// Samples
// ---------------------------------------------------------------------------

const SPIKE_POKE = 0.22;
const SPIKE_R = 0.012;

const cylGeom = new THREE.CylinderGeometry(1, 1, 1, 24);
cylGeom.translate(0, 0.5, 0);

interface Cloud {
  cylinders: THREE.InstancedMesh;
  spikes: THREE.InstancedMesh;
  spikeMat: THREE.MeshBasicMaterial;
}

function cloud(scene: THREE.Scene): Cloud {
  const cylinders = new THREE.InstancedMesh(
    cylGeom,
    matte(C.moss, { roughness: 0.75 }),
    MAX_N,
  );
  cylinders.frustumCulled = false;
  cylinders.count = 0;
  scene.add(cylinders);

  const spikeMat = flat(C.bone, { transparent: true, opacity: 0.75 });
  const spikes = new THREE.InstancedMesh(cylGeom, spikeMat, MAX_N);
  spikes.frustumCulled = false;
  spikes.count = 0;
  scene.add(spikes);

  return { cylinders, spikes, spikeMat };
}

const clouds = [cloud(panels[0].scene), cloud(panels[1].scene)];

/** A point, and the area of the domain it claims. Volume = f × area. */
type Sample = { x: number; z: number; area: number };

/** Uniform on the square: every sample claims the same slice. */
function uniformSample(rng: () => number, n: number): Sample {
  return {
    x: -FIELD_HALF + rng() * 2 * FIELD_HALF,
    z: -FIELD_HALF + rng() * 2 * FIELD_HALF,
    area: DOMAIN_AREA / n,
  };
}

/**
 * From the proposal, by Box–Muller in the ridge's frame, rejecting anything
 * outside the square. A sample where p is high claims a small piece of the
 * domain and one out in the tail claims a large one — which is exactly the
 * 1/p weight, and is what makes the two panels' cylinders mean the same thing.
 */
function importanceSample(rng: () => number, n: number): Sample {
  const c = Math.cos(RIDGE_ANGLE);
  const s = Math.sin(RIDGE_ANGLE);
  for (let guard = 0; guard < 100; guard++) {
    const u1 = Math.max(rng(), 1e-12);
    const u2 = rng();
    const r = Math.sqrt(-2 * Math.log(u1));
    const zu = r * Math.cos(2 * Math.PI * u2) * PX;
    const zv = r * Math.sin(2 * Math.PI * u2) * PY;
    const x = zu * c - zv * s;
    const z = zu * s + zv * c;
    if (Math.abs(x) <= FIELD_HALF && Math.abs(z) <= FIELD_HALF) {
      return { x, z, area: 1 / (n * proposal(x, z)) };
    }
  }
  // Unreachable in practice — the proposal keeps almost all of its mass inside
  // the square — but a sampler that can loop forever has no place in a demo
  // that must render a frame.
  return { x: 0, z: 0, area: 1 / (n * proposal(0, 0)) };
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

const params = {
  N: MAX_N,
  // Off by default. At a few hundred samples the spikes are what shows where
  // the points landed; at four thousand they are a grey stubble over the whole
  // square that hides the discs, which are the thing worth looking at here.
  spikes: false,
  autoOrbit: false,
};
ui.params.add(params, 'N', 10, MAX_N, 1).name('final samples');
ui.params.add(params, 'spikes').name('spikes');
ui.params.add(params, 'autoOrbit').name('auto-orbit');

/**
 * The bar runs from "nothing" to *the exact answer*, and nowhere else.
 *
 * It used to read correct digits, log10(exact / |error|), against a ceiling of
 * four. That put the right answer at some arbitrary spot part-way along — an
 * estimate good to three digits looked three-quarters done, and a bar that is
 * only ever three-quarters full while the numbers beside it say the answer is
 * right is worse than no bar. A log scale also cannot reach the truth at all:
 * zero error is infinitely far to the right, so there is no place to *put* the
 * end.
 *
 * Linear closeness has an end. Full means the estimate equals the truth, and
 * being symmetric in the error it treats an overshoot as what it is — a first
 * sample landing on the crest sends the uniform estimate twenty times too high,
 * and this reads as an empty bar rather than an overflowing one, which a bar
 * showing the raw estimate would have shown as a perfect score.
 *
 * The cost is honest and worth naming: near the end both bars are close to
 * full, so the difference between the two methods is carried by the *motion* —
 * uniform's lurching while importance locks on — and by the error readout,
 * rather than by two very different final lengths.
 */
const closeness = (sum: number) =>
  Math.min(1, Math.max(0, 1 - Math.abs(RIDGE_VOLUME - sum) / RIDGE_VOLUME));
const SEEDS = [20260805, 71133157];

const dummy = new THREE.Object3D();

/**
 * Draw one panel's samples, and return its estimate. Both panels run this same
 * code with different samplers, so a difference between them is a difference
 * between the two ways of choosing points and nothing else.
 */
function run(cloudIdx: number, n: number, draw: (rng: () => number, n: number) => Sample): number {
  const { cylinders, spikes, spikeMat } = clouds[cloudIdx];
  const rng = mulberry32(SEEDS[cloudIdx]);
  let sum = 0;

  for (let i = 0; i < n; i++) {
    const { x, z, area } = draw(rng, n);
    const fv = ridge2d(x, z);
    sum += fv * area;

    const radius = Math.sqrt(area / Math.PI);
    const h = fv * Z;
    dummy.position.set(x, 0, z);
    dummy.scale.set(radius, Math.max(h, 1e-5), radius);
    dummy.updateMatrix();
    cylinders.setMatrixAt(i, dummy.matrix);

    dummy.scale.set(SPIKE_R, h + SPIKE_POKE, SPIKE_R);
    dummy.updateMatrix();
    spikes.setMatrixAt(i, dummy.matrix);
  }

  cylinders.count = n;
  cylinders.instanceMatrix.needsUpdate = true;
  spikes.count = params.spikes ? n : 0;
  spikes.instanceMatrix.needsUpdate = true;
  // Fade spikes as they crowd, or they turn into a solid pale thicket.
  spikeMat.opacity = Math.max(0.1, 0.75 * Math.min(1, 150 / n));

  return sum;
}

stage.frame((t) => {
  const phase = stage.progress(t);
  if (params.autoOrbit) autoOrbit(stage, phase, startAngle);
  // Auto-orbit is a returning motion: with it on the export has to run the full
  // loop or the circle is cut mid-turn. With it off the export stops the instant
  // the ramp lands on its final N, and preview still parks on the answer.
  const rampEnd = stage.duration - HOLD;
  stage.captureEnd = params.autoOrbit ? undefined : rampEnd;

  // The picture opens on the integrand alone. Without the pause the first
  // sample lands on frame one and the audience never sees what is being
  // integrated — the ridge, and how much of the square is empty — which is the
  // whole reason the two samplers differ. Hand-rolled rather than
  // stage.progress, which has no notion of a late start.
  const u = Math.min(1, Math.max(0, (t % stage.duration) - PRE_ROLL) / (rampEnd - PRE_ROLL));
  const started = u > 0;

  // Both panels get the same N at every instant: equal evaluations of f, so
  // the only thing being compared is where the points went.
  const n = started
    ? Math.min(MAX_N, Math.max(1, Math.round(Math.exp(Math.log(params.N) * u))))
    : 0;

  const uSum = run(0, n, uniformSample);
  const iSum = run(1, n, importanceSample);

  if (!started) {
    for (const p of panels) {
      p.readout('0', null, null);
      p.bar(0);
    }
    return;
  }

  panels[0].readout(String(n), uSum, Math.abs(RIDGE_VOLUME - uSum));
  panels[0].bar(closeness(uSum));

  panels[1].readout(String(n), iSum, Math.abs(RIDGE_VOLUME - iSum));
  panels[1].bar(closeness(iSum));
});

stage.start();
