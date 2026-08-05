/**
 * The subject the camera demos photograph.
 *
 * A fruit and a bottle on a table, against a wall — held here rather than in a
 * demo because two demos now need the *same* photograph. `pixel-image` maps the
 * whole picture over a grid of pixels; `pixel-lens` sends one pixel's fan of
 * rays out into it and averages what comes back. Sharing the definition is what
 * makes the second demo's accumulated spectrum literally one of the first
 * demo's cells, rather than a similar-looking curve.
 *
 * ## How a colour is made here, and why in this direction
 *
 * Backwards from the picture, and honestly. Each point carries a positive
 * combination of three broad smooth reflectances lit by the room demos' 5200 K
 * lamp, so every spectrum is the kind of thing a real surface returns — nothing
 * is a delta, nothing is negative, and none of it was fitted to the CIE curves.
 * The picture is designed in the *weights*, and the colour at a point is then
 * whatever the physics says it is.
 *
 * The three reflectances are scaled once so that equal weights give D65 white.
 * Without that the basis is skewed and every weight triple reads yellow-green,
 * which makes designing in weight space a fight rather than a convenience. It
 * is a choice of units on three fixed curves and changes no colour relationship
 * in the picture.
 */

import { WL0, WL1, NS, wavelength, lampSpectrum } from './room2d';
import { CMF, bandNormalizer } from './response';

export const D_LAMBDA = (WL1 - WL0) / NS;
/** The shared constant that puts a flat spectrum of height 1 at Y = 1. */
export const K = bandNormalizer(WL0, WL1, NS);

/**
 * Three broad, smooth, strictly positive reflectances. Deliberately wide: real
 * pigments are, and a narrow basis would make every colour implausibly
 * saturated — the still life would look like stained glass.
 */
const BASIS: ((nm: number) => number)[] = [
  (nm) => 0.04 + 0.96 / (1 + Math.exp(-(nm - 608) / 22)), // long
  (nm) => 0.04 + 0.96 * Math.exp(-0.5 * ((nm - 540) / 42) ** 2), // middle
  (nm) => 0.04 + 0.96 / (1 + Math.exp((nm - 489) / 24)), // short
];

/** The lamp, sampled on the shared grid. */
export const LAMP = new Float32Array(NS + 1);
/** The three response curves, sampled on the shared grid. */
export const RESP = CMF.map(() => new Float32Array(NS + 1));
/** The three reflectances, sampled and then white-balanced (see below). */
export const BASE = BASIS.map(() => new Float32Array(NS + 1));

for (let k = 0; k <= NS; k++) {
  const nm = wavelength(k);
  LAMP[k] = lampSpectrum(nm);
  for (let c = 0; c < 3; c++) RESP[c][k] = CMF[c](nm);
  for (let b = 0; b < 3; b++) BASE[b][k] = BASIS[b](nm);
}

/** Solve a 3x3 system by Gaussian elimination with partial pivoting. */
function solve3(A: number[][], rhs: number[]): number[] {
  const m = A.map((row, i) => [...row, rhs[i]]);
  for (let i = 0; i < 3; i++) {
    let p = i;
    for (let k = i + 1; k < 3; k++) if (Math.abs(m[k][i]) > Math.abs(m[p][i])) p = k;
    [m[i], m[p]] = [m[p], m[i]];
    for (let k = 0; k < 3; k++) {
      if (k === i) continue;
      const f = m[k][i] / m[i][i];
      for (let j = i; j < 4; j++) m[k][j] -= f * m[i][j];
    }
  }
  return [0, 1, 2].map((i) => m[i][3] / m[i][i]);
}

/** What one unit of reflectance `b` returns as a value, under the lamp. */
function basisValue(b: number): [number, number, number] {
  const out: [number, number, number] = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    let s = 0;
    for (let k = 0; k <= NS; k++) {
      s += LAMP[k] * BASE[b][k] * RESP[c][k] * (k === 0 || k === NS ? 0.5 : 1) * D_LAMBDA;
    }
    out[c] = s * K;
  }
  return out;
}

{
  // Gains that put equal weights exactly on D65 white. Rows are X, Y, Z; the
  // columns are the three basis curves.
  const raw = [0, 1, 2].map(basisValue);
  const gain = solve3(
    [0, 1, 2].map((c) => [0, 1, 2].map((b) => raw[b][c])),
    [0.9505, 1.0, 1.089],
  );
  for (let b = 0; b < 3; b++) for (let k = 0; k <= NS; k++) BASE[b][k] *= gain[b];
}

// ---------------------------------------------------------------------------
// The picture
// ---------------------------------------------------------------------------

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};
export type W3 = [number, number, number];
const mixw = (a: W3, b: W3, t: number): W3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/**
 * The pigment weights at a point, with u across and v up, both in [0, 1].
 *
 * Everything is a smooth primitive, so a coarse grid samples it cleanly instead
 * of aliasing on hard edges — and the shading ramps are gentler than looks right
 * at full resolution, because at sixteen pixels across the bottle's body is
 * three cells and a strong ramp turns those three into stripes.
 *
 * Outside the unit square it returns the wall, so a ray that leaves the picture
 * still comes back with a perfectly good spectrum.
 */
export function stillLife(u: number, v: number): W3 {
  let w = mixw([0.3, 0.33, 0.42], [0.09, 0.11, 0.2], smoothstep(0.32, 1.0, v));
  // a pool of light on the wall behind the objects
  w = mixw(w, [0.42, 0.43, 0.48], 0.4 * Math.exp(-(((u - 0.44) / 0.3) ** 2 + ((v - 0.6) / 0.26) ** 2)));

  const table = smoothstep(0.38, 0.34, v);
  w = mixw(w, mixw([0.6, 0.27, 0.08], [0.24, 0.1, 0.03], smoothstep(0.34, 0.0, v)), table);

  const shadow =
    0.85 * Math.exp(-(((u - 0.33) / 0.155) ** 2 + ((v - 0.285) / 0.05) ** 2)) +
    0.75 * Math.exp(-(((u - 0.69) / 0.115) ** 2 + ((v - 0.295) / 0.045) ** 2));
  w = mixw(w, [0.13, 0.05, 0.02], Math.min(shadow, 0.9) * table);

  const fruit = Math.hypot((u - 0.33) / 0.195, (v - 0.505) / 0.195);
  if (fruit < 1) {
    const lit = smoothstep(1.0, 0.1, Math.hypot((u - 0.26) / 0.9, (v - 0.6) / 0.9) * 1.6);
    w = mixw(w, mixw([0.26, 0.04, 0.02], [1.0, 0.32, 0.05], lit), smoothstep(1.0, 0.84, fruit));
  }

  const body = Math.abs(u - 0.685) < 0.115 && v > 0.35 && v < 0.68;
  const neck = Math.abs(u - 0.685) < 0.042 && v >= 0.68 && v < 0.84;
  if (body || neck) {
    const lit = smoothstep(0.14, 0.01, Math.abs(u - 0.645));
    w = mixw(w, mixw([0.09, 0.38, 0.15], [0.15, 0.62, 0.22], lit), 0.95);
  }

  return w.map((x) => Math.min(Math.max(x, 0.015), 1)) as W3;
}

/** The spectrum leaving the picture at (u, v): the lamp times the reflectance. */
export function spectrumAt(u: number, v: number, out: Float32Array): Float32Array {
  const w = stillLife(u, v);
  for (let k = 0; k <= NS; k++) {
    out[k] = LAMP[k] * (w[0] * BASE[0][k] + w[1] * BASE[1][k] + w[2] * BASE[2][k]);
  }
  return out;
}

/** The value a sampled spectrum produces under the standard observer. */
export function project(spec: Float32Array): [number, number, number] {
  const out: [number, number, number] = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    let s = 0;
    for (let k = 0; k <= NS; k++) {
      s += spec[k] * RESP[c][k] * (k === 0 || k === NS ? 0.5 : 1) * D_LAMBDA;
    }
    out[c] = s * K;
  }
  return out;
}
