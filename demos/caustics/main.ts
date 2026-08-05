/**
 * Caustics: what the ray map does when it stops being injective.
 *
 * A parallel beam falls on a moving, complicated water surface, refracts into
 * the medium, and lands on the floor. The picture underneath is the light
 * density there — the bright web that anyone who has stood in a swimming pool
 * has seen, computed rather than drawn.
 *
 * ## The mathematics on screen
 *
 * Everything here is one map. A ray is named by where it meets the surface, and
 * refraction plus a straight run to the floor sends that to where it lands:
 *
 *   R : x  ↦  x_floor.
 *
 * The floor density is what R does to a uniform beam, so it is the reciprocal
 * Jacobian, summed over every ray that arrives at a point:
 *
 *   E(y)  =  Σ  1 / |R′(x)|   over the x with R(x) = y.
 *
 * **The caustics are exactly where R′ = 0** — the critical points of the ray
 * map, and the bright lines are their critical *values*. That is the same
 * sentence as the Fermat demo one slide earlier, moved from the critical points
 * of path length to the critical points of the map, and it is why the arcs are
 * arcs: by Whitney only folds and cusps are stable, so a caustic is made of
 * smooth pieces meeting at cusps and is never a point.
 *
 * The marked lines are found by bracketing sign changes of R′ and bisecting, so
 * they are the actual roots. Watch the count as the water moves: folds sweep in
 * from the edges and annihilate in pairs, each annihilation a cusp passing
 * through.
 *
 * ## The density is measured, not modelled
 *
 * Rather than evaluating that sum, the demo *does* the experiment: a fine comb
 * of rays is refracted and binned on the floor. That is a Riemann sum over the
 * beam, and near a caustic it is exactly the estimator that struggles — the
 * bins that straddle a fold are the ones the slide about singular integrands is
 * about. Nothing is smoothed afterwards; the spikes are as tall as the binning
 * lets them be, and they run off the top of the panel because the true value
 * there is infinite.
 *
 * Each ray is weighted by the flux it actually carries. Parametrising by the
 * surface rather than by the sky means equal steps in x are not equal steps of
 * beam once the surface tilts, and the Jacobian for that is |cos θ + h′ sin θ|.
 * At θ = 0 it is 1, which is why it is easy to forget.
 *
 * ## It loops
 *
 * The two wave trains have angular frequencies that are whole multiples of
 * 2π/duration, so the surface at t = duration is the surface at t = 0 to
 * machine precision and the exported clip loops seamlessly — unlike most of the
 * deck, this one is a true cycle rather than a one-shot.
 */

import * as THREE from 'three';
import { createStage, createUI, BACKGROUND, C, flat, mix } from '@';
import { polyline, setPolyline, type Pt } from '@/lines';
import { label, setText } from '@/text';

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
stage.duration = 12;

const ui = createUI(stage);

/** Where the drawn rays come in from, and the mean water level. */
const TOP = 2.75;
const H0 = 1.3;

/** The floor, and the strip of it we light up. */
const FLOOR_Y = -0.85;
const FLOOR_H = 0.2;

/** Half-width of the floor we account for. */
const FX = 4.75;

/** Source rays are cast over a wider span, so the floor is lit to its edges. */
const SRC0 = -5.9;
const SRC1 = 5.9;

/** How much surface is drawn — past the frame, so it reads as an expanse. */
const SURF0 = -5.5;
const SURF1 = 5.5;

/** The density panel below the floor. */
const DENS_BASE = -2.42;
const DENS_TOP = -1.25;
/** Density, in multiples of the floor average, that reaches the top of it. */
const DENS_MAX = 4;

const BINS = 300;
/** Rays in the comb that measures the density. */
const PROBES = 9000;
/** Rays actually drawn. */
const DRAWN = 80;
/** Samples of the surface, and of the fold scan. */
const SURF_N = 300;
const FOLD_N = 900;
const MAX_FOLDS = 14;

const fx = (x: number): number => (x / FX) * 4.75;

// ---------------------------------------------------------------------------
// The water
// ---------------------------------------------------------------------------

const K1 = 1.9;
const K2 = 3.1;
const A1 = 1.0;
const A2 = 0.45;
const PHI = 0.8;
/** Whole multiples of 2π/duration, which is what makes the loop close. */
const W1 = (2 * Math.PI * 2) / 12;
const W2 = (2 * Math.PI * 3) / 12;

const params = {
  waves: 0.3,
  index: 1.33,
  tilt: 0,
  showRays: true,
  showFolds: true,
};

let now = 0;

const height = (x: number): number =>
  H0 + params.waves * (A1 * Math.sin(K1 * x - W1 * now) + A2 * Math.sin(K2 * x + W2 * now + PHI));

const slope = (x: number): number =>
  params.waves *
  (A1 * K1 * Math.cos(K1 * x - W1 * now) + A2 * K2 * Math.cos(K2 * x + W2 * now + PHI));

// ---------------------------------------------------------------------------
// The ray map
// ---------------------------------------------------------------------------

/**
 * Refract at the surface point above x and run to the floor. Snell in vector
 * form, so nothing here knows about angles. Returns where it lands, or null if
 * the ray never gets there.
 */
function rayMap(x: number): number | null {
  const th = (params.tilt * Math.PI) / 180;
  const dx = Math.sin(th);
  const dy = -Math.cos(th);
  const hp = slope(x);
  const nl = Math.hypot(-hp, 1);
  const nx = -hp / nl;
  const ny = 1 / nl;
  const ci = -(dx * nx + dy * ny);
  if (ci <= 0) return null;
  const r = 1 / params.index;
  const k = 1 - r * r * (1 - ci * ci);
  if (k < 0) return null;
  const c2 = Math.sqrt(k);
  const tx = r * dx + (r * ci - c2) * nx;
  const ty = r * dy + (r * ci - c2) * ny;
  if (ty >= -1e-6) return null;
  return x + ((FLOOR_Y - height(x)) / ty) * tx;
}

/** The flux one unit of surface intercepts: |cos θ + h′ sin θ|. */
function fluxWeight(x: number): number {
  const th = (params.tilt * Math.PI) / 180;
  return Math.abs(Math.cos(th) + slope(x) * Math.sin(th));
}

const DR = 1e-4;
function rayMapSlope(x: number): number | null {
  const a = rayMap(x - DR);
  const b = rayMap(x + DR);
  if (a === null || b === null) return null;
  return (b - a) / (2 * DR);
}

/** Critical values of the ray map: the caustics, bracketed and bisected. */
function folds(): number[] {
  const out: number[] = [];
  let prev = rayMapSlope(SRC0);
  for (let i = 1; i <= FOLD_N; i++) {
    const x = SRC0 + ((SRC1 - SRC0) * i) / FOLD_N;
    const cur = rayMapSlope(x);
    if (prev !== null && cur !== null && prev * cur < 0) {
      let lo = SRC0 + ((SRC1 - SRC0) * (i - 1)) / FOLD_N;
      let hi = x;
      for (let k = 0; k < 40; k++) {
        const mid = (lo + hi) / 2;
        const dl = rayMapSlope(lo);
        const dm = rayMapSlope(mid);
        if (dl === null || dm === null) break;
        if (dl * dm <= 0) hi = mid;
        else lo = mid;
      }
      const v = rayMap((lo + hi) / 2);
      if (v !== null && v >= -FX && v <= FX) out.push(v);
      if (out.length >= MAX_FOLDS) break;
    }
    prev = cur;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Scenery
// ---------------------------------------------------------------------------

/** The water body: a ribbon from the surface down to the floor. */
const bodyPos = new Float32Array((SURF_N + 1) * 2 * 3);
const bodyGeom = new THREE.BufferGeometry();
bodyGeom.setAttribute('position', new THREE.BufferAttribute(bodyPos, 3));
{
  const idx: number[] = [];
  for (let i = 0; i < SURF_N; i++) {
    const a = 2 * i;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  bodyGeom.setIndex(idx);
}
const body = new THREE.Mesh(
  bodyGeom,
  flat(C.blueDeep, { transparent: true, opacity: 0.4, side: THREE.DoubleSide }),
);
body.position.z = -0.4;
stage.add(body);

const surfPts: Pt[] = [];
for (let i = 0; i <= SURF_N; i++) surfPts.push([0, 0, 0]);
const surface = polyline(surfPts, { color: C.blue, width: 3.5 });
surface.position.z = 0.2;
stage.add(surface);

/** The rays. One polyline each: in from the sky, bend, down to the floor. */
const RAY_COLOR = mix(BACKGROUND, C.ochre, 0.62);
const rays = Array.from({ length: DRAWN }, () => {
  const l = polyline([[0, 0, 0], [0, 0, 0], [0, 0, 0]], { color: RAY_COLOR, width: 1.4 });
  l.position.z = -0.1;
  stage.add(l);
  return l;
});

/** The lit floor: one quad per bin, coloured by the density that landed in it. */
const floorPos = new Float32Array((BINS + 1) * 2 * 3);
const floorCol = new Float32Array((BINS + 1) * 2 * 3);
const floorGeom = new THREE.BufferGeometry();
floorGeom.setAttribute('position', new THREE.BufferAttribute(floorPos, 3));
floorGeom.setAttribute('color', new THREE.BufferAttribute(floorCol, 3));
{
  const idx: number[] = [];
  for (let i = 0; i < BINS; i++) {
    const a = 2 * i;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  floorGeom.setIndex(idx);
  for (let i = 0; i <= BINS; i++) {
    const x = fx(-FX + ((2 * FX) * i) / BINS);
    const o = i * 6;
    floorPos[o] = x;
    floorPos[o + 1] = FLOOR_Y;
    floorPos[o + 3] = x;
    floorPos[o + 4] = FLOOR_Y - FLOOR_H;
  }
  floorGeom.attributes.position.needsUpdate = true;
}
const floorMesh = new THREE.Mesh(floorGeom, flat(0xffffff, { vertexColors: true }));
floorMesh.position.z = 0.1;
stage.add(floorMesh);

// A hairline along the top of the floor, so it reads as a surface even where
// no light lands.
stage.add(
  polyline([[fx(-FX), FLOOR_Y, 0], [fx(FX), FLOOR_Y, 0]], { color: C.slateDeep, width: 1.6 }),
);

// ---------------------------------------------------------------------------
// The density panel
// ---------------------------------------------------------------------------

/** Where the caustics are, drawn behind the profile. */
const foldLines = Array.from({ length: MAX_FOLDS }, () => {
  const l = polyline([[0, 0, 0], [0, 0, 0]], { color: C.rustDeep, width: 1.6 });
  l.position.z = -0.2;
  l.visible = false;
  stage.add(l);
  return l;
});

const fillPos = new Float32Array((BINS + 1) * 2 * 3);
const fillGeom = new THREE.BufferGeometry();
fillGeom.setAttribute('position', new THREE.BufferAttribute(fillPos, 3));
{
  const idx: number[] = [];
  for (let i = 0; i < BINS; i++) {
    const a = 2 * i;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  fillGeom.setIndex(idx);
  for (let i = 0; i <= BINS; i++) {
    fillPos[i * 6] = fx(-FX + ((2 * FX) * i) / BINS);
    fillPos[i * 6 + 1] = DENS_BASE;
    fillPos[i * 6 + 3] = fx(-FX + ((2 * FX) * i) / BINS);
  }
}
const fill = new THREE.Mesh(fillGeom, flat(C.ochreDeep, { transparent: true, opacity: 0.55 }));
fill.position.z = 0;
stage.add(fill);

const profilePts: Pt[] = [];
for (let i = 0; i <= BINS; i++) profilePts.push([0, 0, 0]);
const profile = polyline(profilePts, { color: C.ochre, width: 2.6 });
profile.position.z = 0.1;
stage.add(profile);

stage.add(
  polyline([[fx(-FX), DENS_BASE, 0], [fx(FX), DENS_BASE, 0]], { color: C.slate, width: 2 }),
);

/** The average, so the spikes have something to be multiples of. */
const AVG_Y = DENS_BASE + ((DENS_TOP - DENS_BASE) * 1) / DENS_MAX;
stage.add(
  polyline([[fx(-FX), AVG_Y, 0], [fx(FX), AVG_Y, 0]], {
    color: C.slateDeep,
    width: 1.4,
    dashed: true,
    dashSize: 0.1,
    gapSize: 0.08,
  }),
  label('average', {
    size: 0.16,
    color: C.slateDeep,
    anchorX: 'right',
    anchorY: 'middle',
    position: [fx(FX) - 0.08, AVG_Y + 0.14, 0],
  }),
  label('light density on the floor', {
    size: 0.2,
    color: C.ash,
    position: [fx(-FX), DENS_BASE - 0.32, 0],
  }),
);

const foldReadout = label('', {
  size: 0.2,
  color: C.rust,
  anchorX: 'right',
  position: [fx(FX), DENS_BASE - 0.32, 0],
});
stage.add(foldReadout);

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

ui.params.add(params, 'waves', 0, 0.45, 0.005).name('wave height');
ui.params.add(params, 'index', 1.02, 1.8, 0.01).name('index of the medium');
ui.params.add(params, 'tilt', -35, 35, 0.5).name('sun tilt');
ui.params.add(params, 'showRays').name('draw the rays');
ui.params.add(params, 'showFolds').name('mark the caustics');

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

const bins = new Float64Array(BINS);
const tmpColor = new THREE.Color();

stage.frame((t) => {
  now = t;

  const th = (params.tilt * Math.PI) / 180;
  const backX = -Math.sin(th);
  const backY = Math.cos(th);

  // --- the water ----------------------------------------------------------
  const sp: Pt[] = [];
  for (let i = 0; i <= SURF_N; i++) {
    const x = SURF0 + ((SURF1 - SURF0) * i) / SURF_N;
    const y = height(x);
    sp.push([x, y, 0]);
    const o = i * 6;
    bodyPos[o] = x;
    bodyPos[o + 1] = y;
    bodyPos[o + 3] = x;
    bodyPos[o + 4] = FLOOR_Y;
  }
  setPolyline(surface, sp);
  bodyGeom.attributes.position.needsUpdate = true;
  bodyGeom.computeBoundingSphere();

  // --- the measurement ----------------------------------------------------
  bins.fill(0);
  const step = (SRC1 - SRC0) / PROBES;
  let landed = 0;
  for (let i = 0; i < PROBES; i++) {
    const x = SRC0 + (i + 0.5) * step;
    const w = fluxWeight(x);
    const xf = rayMap(x);
    if (xf === null || xf < -FX || xf >= FX) continue;
    bins[Math.floor(((xf + FX) / (2 * FX)) * BINS)] += w;
    landed += w;
  }
  // In multiples of the average over the floor, so "1" means "as bright as if
  // the surface were flat" and the numbers do not depend on the ray count.
  const norm = landed > 0 ? BINS / landed : 0;

  // --- the lit floor ------------------------------------------------------
  for (let i = 0; i <= BINS; i++) {
    const d = bins[Math.min(BINS - 1, i)] * norm;
    // Saturating, because a caustic is unbounded and a floor is not.
    const v = d / (d + 2.5);
    tmpColor.setHex(mix(BACKGROUND, C.ochre, Math.min(1, v * 1.35)));
    if (v > 0.6) tmpColor.lerp(new THREE.Color(C.bone), Math.min(1, (v - 0.6) / 0.28));
    const o = i * 6;
    floorCol[o] = tmpColor.r;
    floorCol[o + 1] = tmpColor.g;
    floorCol[o + 2] = tmpColor.b;
    floorCol[o + 3] = tmpColor.r * 0.55;
    floorCol[o + 4] = tmpColor.g * 0.55;
    floorCol[o + 5] = tmpColor.b * 0.55;
  }
  floorGeom.attributes.color.needsUpdate = true;

  // --- the profile --------------------------------------------------------
  const pp: Pt[] = [];
  for (let i = 0; i <= BINS; i++) {
    const d = bins[Math.min(BINS - 1, i)] * norm;
    const y = Math.min(
      DENS_TOP,
      DENS_BASE + ((DENS_TOP - DENS_BASE) * d) / DENS_MAX,
    );
    pp.push([fx(-FX + ((2 * FX) * i) / BINS), y, 0]);
    fillPos[i * 6 + 4] = y;
  }
  setPolyline(profile, pp);
  fillGeom.attributes.position.needsUpdate = true;
  fillGeom.computeBoundingSphere();

  // --- the caustics -------------------------------------------------------
  const f = params.showFolds ? folds() : [];
  for (let i = 0; i < MAX_FOLDS; i++) {
    const on = i < f.length;
    foldLines[i].visible = on;
    if (on) {
      setPolyline(foldLines[i], [
        [fx(f[i]), DENS_BASE, 0],
        [fx(f[i]), FLOOR_Y - FLOOR_H, 0],
      ]);
    }
  }
  setText(foldReadout, params.showFolds ? `${f.length} caustic lines` : '');

  // --- the drawn rays -----------------------------------------------------
  for (let i = 0; i < DRAWN; i++) {
    const line = rays[i];
    if (!params.showRays) {
      line.visible = false;
      continue;
    }
    const x = SRC0 + ((SRC1 - SRC0) * (i + 0.5)) / DRAWN;
    const y = height(x);
    const xf = rayMap(x);
    if (xf === null) {
      line.visible = false;
      continue;
    }
    line.visible = true;
    const up = (TOP - y) / backY;
    setPolyline(line, [
      [x + backX * up, TOP, 0],
      [x, y, 0],
      [xf, FLOOR_Y, 0],
    ]);
  }
});

stage.start();
