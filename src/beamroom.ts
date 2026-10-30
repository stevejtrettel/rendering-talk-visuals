/**
 * The beam room, shared by the Part II demos that look at its light: the room of
 * wave-room ?scene=beam and wave-to-ray ?frame=room, with walls that reflect in
 * colour (left red, right green, floor and ceiling white), the lamp in its
 * housing, the flat mirror and the concave one.
 *
 * Importing this runs the light tracing once: the equilibrium light in the room,
 * in the ray limit, spectrally, by Monte Carlo from the lamp. See
 * demos/light-field-room for what is computed and the readability choices.
 * `lightAlong` reads the light field back; `drawRoom` draws the room coloured by
 * its light.
 */

import * as THREE from 'three';
import { C } from '@';
import { polyline } from '@/lines';
import { CMF, xyzToHex } from '@/response';

// --- Vectors ---------------------------------------------------------------
export interface Vec {
  x: number;
  y: number;
}
export const v = (x: number, y: number): Vec => ({ x, y });
export const add = (a: Vec, b: Vec, s = 1): Vec => v(a.x + b.x * s, a.y + b.y * s);
export const sub = (a: Vec, b: Vec): Vec => v(a.x - b.x, a.y - b.y);
export const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y;
export const perp = (a: Vec): Vec => v(-a.y, a.x);
export const unit = (a: Vec): Vec => {
  const m = Math.hypot(a.x, a.y) || 1;
  return v(a.x / m, a.y / m);
};
export const fromAngle = (deg: number): Vec => v(Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180));
export const reflect = (d: Vec, n: Vec): Vec => add(d, n, -2 * dot(d, n));

// --- Spectra ---------------------------------------------------------------
export const WL0 = 380;
export const WL1 = 720;
export const NS = 35;
export const nmAt = (i: number) => WL0 + ((WL1 - WL0) * i) / (NS - 1);
export const spectrum = (f: (nm: number) => number) => Float64Array.from({ length: NS }, (_, i) => f(nmAt(i)));
export function planck(nm: number, T: number): number {
  const l = nm * 1e-9;
  return 1 / (l ** 5 * (Math.exp(1.4388e-2 / (l * T)) - 1));
}
export const SUN = (() => {
  const s = spectrum((nm) => planck(nm, 5800));
  const m = Math.max(...s);
  return s.map((x) => x / m);
})();
const WHITE = spectrum(() => 0.75);
const RED = spectrum((nm) => 0.06 + 0.7 / (1 + Math.exp(-(nm - 600) / 12)));
const GREEN = spectrum((nm) => 0.06 + 0.55 * Math.exp(-(((nm - 535) / 38) ** 2)));
export const MIRROR_R = 0.95;

export function nmColour(nm: number): number {
  nm = Math.min(Math.max(nm, 400), 670);
  const xyz = CMF.map((f) => f(nm));
  const m = Math.max(...xyz) || 1;
  return xyzToHex(xyz[0]! / m, xyz[1]! / m, xyz[2]! / m);
}
export function toXYZ(s: ArrayLike<number>): [number, number, number] {
  const xyz: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < NS; i++) CMF.forEach((f, c) => (xyz[c] += f(Math.min(nmAt(i), 670)) * s[i]!));
  return xyz;
}

// --- The scene ---------------------------------------------------------------
export type Kind = 'diffuse' | 'mirror' | 'black';
export interface Seg {
  a: Vec;
  b: Vec;
  kind: Kind;
  /** Unit normal on the side that reflects (diffuse) — mirrors reflect on both sides. */
  n: Vec;
  albedo?: Float64Array;
  /** Index of its irradiance bin (diffuse). */
  bin: number;
}
export const segs: Seg[] = [];
export const ROOM_HALF = v(5.25, 2.88);
export const ROOM_R = 0.55;
export const SOURCE = { center: v(-4.55, 1.75), axis: fromAngle(-24), waist: 0.42, sigma: (4 * Math.PI) / 180 };

/** Add a diffuse polyline, split into bins of about BIN long, normal toward `inward` side. */
const BIN = 0.12;
let bins = 0;
function addDiffuse(a: Vec, b: Vec, albedo: Float64Array, n: Vec): void {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const k = Math.max(1, Math.round(len / BIN));
  for (let i = 0; i < k; i++) {
    const p = add(a, sub(b, a), i / k);
    const q = add(a, sub(b, a), (i + 1) / k);
    segs.push({ a: p, b: q, kind: 'diffuse', n, albedo, bin: bins++ });
  }
}
// The room: a rounded rectangle, walls coloured by side, normals inward.
{
  const hx = ROOM_HALF.x - ROOM_R;
  const hy = ROOM_HALF.y - ROOM_R;
  const pts: Vec[] = [];
  const corners: [number, number, number][] = [
    [hx, hy, 0],
    [-hx, hy, 90],
    [-hx, -hy, 180],
    [hx, -hy, 270],
  ];
  for (const [cx, cy, a0] of corners) for (let k = 0; k <= 6; k++) pts.push(add(v(cx, cy), fromAngle(a0 + (90 * k) / 6), ROOM_R));
  pts.push(pts[0]!);
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const mid = add(a, sub(b, a), 0.5);
    const albedo = mid.x < -ROOM_HALF.x + 0.3 ? RED : mid.x > ROOM_HALF.x - 0.3 ? GREEN : WHITE;
    addDiffuse(a, b, albedo, v(0, 0)); // normals set just below
  }
  // Inward normal for each wall piece: perpendicular, pointing at the room's centre.
  for (const s of segs) {
    const t = unit(sub(s.b, s.a));
    let n = perp(t);
    const mid = add(s.a, sub(s.b, s.a), 0.5);
    if (dot(n, mid) > 0) n = v(-n.x, -n.y);
    s.n = n;
  }
}
// The mirrors (both sides) and the housing (black).
export const FLAT = { mid: v(1.29, -0.85), dir: fromAngle(18), half: 1.15 };
segs.push({ a: add(FLAT.mid, FLAT.dir, -FLAT.half), b: add(FLAT.mid, FLAT.dir, FLAT.half), kind: 'mirror', n: perp(FLAT.dir), bin: -1 });
export const ARC = { c: v(-0.104, 0.135), r: 3.4, a0: 13, a1: 47 };
export const arcPts: Vec[] = [];
for (let k = 0; k <= 30; k++) arcPts.push(add(ARC.c, fromAngle(ARC.a0 + ((ARC.a1 - ARC.a0) * k) / 30), ARC.r));
for (let k = 0; k < 30; k++) {
  const a = arcPts[k]!;
  const b = arcPts[k + 1]!;
  segs.push({ a, b, kind: 'mirror', n: unit(sub(ARC.c, add(a, sub(b, a), 0.5))), bin: -1 });
}
export const A = SOURCE.axis;
export const N = perp(A);
const at = (x: number, y: number) => add(add(SOURCE.center, A, x), N, y);
export const HOUSING = [at(0.18, 0.95), at(-0.3, 0.95), at(-0.3, -0.95), at(0.18, -0.95)];
for (let k = 0; k < 3; k++) segs.push({ a: HOUSING[k]!, b: HOUSING[k + 1]!, kind: 'black', n: v(0, 0), bin: -1 });
const binLength = new Float64Array(bins);
for (const s of segs) if (s.bin >= 0) binLength[s.bin] = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);

/** Nearest segment hit along o + t d, t > EPS. */
export const EPS = 1e-6;
export function hit(o: Vec, d: Vec, skip: Seg | null): { t: number; s: Seg; p: Vec } | null {
  let best: { t: number; s: Seg; p: Vec } | null = null;
  for (const s of segs) {
    if (s === skip) continue;
    const ex = s.b.x - s.a.x;
    const ey = s.b.y - s.a.y;
    const den = d.x * ey - d.y * ex;
    if (Math.abs(den) < 1e-12) continue;
    const rx = s.a.x - o.x;
    const ry = s.a.y - o.y;
    const t = (rx * ey - ry * ex) / den;
    const u = (rx * d.y - ry * d.x) / den;
    if (t > EPS && u >= 0 && u <= 1 && (!best || t < best.t)) best = { t, s, p: add(o, d, t) };
  }
  return best;
}

// --- Light tracing: the equilibrium irradiance on every diffuse surface, and the
// fluence in the room (for colouring it) -------------------------------------------
const GW = 336;
const GH = 184;
const CELL = (2 * ROOM_HALF.x) / GW;
const FLUENCE = new Float64Array(GW * GH * 3); // XYZ
/** The same, of the lamp's light alone: each photon's track before it first meets anything (E). */
const FLUENCE_E = new Float64Array(GW * GH * 3);
/** Every photon a mirror sent on, as it left the mirror (for T, below). */
const MIRROR_OUT: { p: Vec; d: Vec; s: Seg; xyz: [number, number, number] }[] = [];
const toXYZw = (w: Float64Array): [number, number, number] => {
  const xyz: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < NS; i++) CMF.forEach((f, c) => (xyz[c] += f(Math.min(nmAt(i), 670)) * w[i]!));
  return xyz;
};
/** Add a photon's track from a to b, power xyz, into a fluence grid. */
function track(a: Vec, b: Vec, xyz: [number, number, number], into = FLUENCE): void {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const n = Math.max(1, Math.ceil(len / (CELL * 0.6)));
  const step = len / n;
  for (let k = 0; k < n; k++) {
    const p = add(a, sub(b, a), (k + 0.5) / n);
    const gx = Math.floor((p.x + ROOM_HALF.x) / CELL);
    const gy = Math.floor((p.y + ROOM_HALF.y) / CELL);
    if (gx < 0 || gy < 0 || gx >= GW || gy >= GH) continue;
    const o = (gy * GW + gx) * 3;
    into[o]! += xyz[0] * step;
    into[o + 1]! += xyz[1] * step;
    into[o + 2]! += xyz[2] * step;
  }
}
const PHOTONS = 60000;
const E = new Float64Array(bins * NS); // irradiance, power per length, per wavelength
let seed = 0x1234567;
const rand = () => {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return (seed >>> 0) / 4294967296;
};
const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
{
  const w = new Float64Array(NS);
  for (let k = 0; k < PHOTONS; k++) {
    // From the opening, across it Gaussian, in angle Gaussian about the axis.
    let s = gauss() * SOURCE.waist;
    while (Math.abs(s) > 0.9) s = gauss() * SOURCE.waist;
    let o = add(SOURCE.center, N, s);
    let d = unit(add(A, N, Math.tan(gauss() * SOURCE.sigma)));
    for (let i = 0; i < NS; i++) w[i] = SUN[i]! / PHOTONS;
    let skip: Seg | null = null;
    for (let bounce = 0; bounce < 40; bounce++) {
      const h = hit(o, d, skip);
      if (!h) break;
      track(o, h.p, toXYZw(w));
      if (bounce === 0) track(o, h.p, toXYZw(w), FLUENCE_E);
      if (h.s.kind === 'black') break;
      if (h.s.kind === 'mirror') {
        for (let i = 0; i < NS; i++) w[i]! *= MIRROR_R;
        d = reflect(d, h.s.n);
        MIRROR_OUT.push({ p: h.p, d, s: h.s, xyz: toXYZw(w) });
      } else {
        if (dot(d, h.s.n) >= 0) break; // the back of a surface
        const b = h.s.bin * NS;
        const len = binLength[h.s.bin]!;
        for (let i = 0; i < NS; i++) E[b + i]! += w[i]! / len;
        // Diffuse bounce, Russian roulette on the mean reflectance.
        const alb = h.s.albedo!;
        const p = alb.reduce((x, y) => x + y, 0) / NS;
        if (rand() > p) break;
        for (let i = 0; i < NS; i++) w[i]! *= alb[i]! / p;
        // Cosine-weighted in 2D: sin θ uniform on [-1, 1].
        const st = 2 * rand() - 1;
        d = unit(add(add(v(0, 0), h.s.n, Math.sqrt(1 - st * st)), perp(h.s.n), st));
      }
      o = h.p;
      skip = h.s;
    }
  }
}
/** Light leaving a diffuse bin (Lambertian, 2D: reflectance × irradiance / 2). */
export const outgoing = (s: Seg, out: Float64Array) => {
  const b = s.bin * NS;
  for (let i = 0; i < NS; i++) out[i] = (s.albedo![i]! * E[b + i]!) / 2;
};

// --- T(L): the room acting once on its own light ------------------------------------
/**
 * The fluence of T(L), computed by its own trace rather than as L minus E: every
 * surface sends on, once, what L delivers to it, and the light is carried to
 * the next surface and stops there. The diffuse walls re-emit from their
 * irradiance (reflectance times what arrives, cosine-distributed, sampled
 * afresh, TPHOTONS in all, by power); the mirrors reflect what arrives at
 * them (the photons of the main trace as they left each mirror). If L is the
 * equilibrium, the result is L - E, up to Monte Carlo noise: a result, not an
 * identity of this code. Computed on first use.
 */
let FLUENCE_T: Float64Array | null = null;
const TPHOTONS = 60000;
function traceT(): Float64Array {
  const F = new Float64Array(GW * GH * 3);
  let sd = 0x7654321;
  const r = () => {
    sd ^= sd << 13;
    sd ^= sd >>> 17;
    sd ^= sd << 5;
    return (sd >>> 0) / 4294967296;
  };
  // The diffuse walls: each bin's outgoing power, reflectance times what arrives.
  const power: { s: Seg; xyz: [number, number, number] }[] = [];
  const w = new Float64Array(NS);
  let total = 0;
  for (const s of segs) {
    if (s.bin < 0) continue;
    const b = s.bin * NS;
    for (let i = 0; i < NS; i++) w[i] = s.albedo![i]! * E[b + i]! * binLength[s.bin]!;
    const xyz = toXYZw(w);
    power.push({ s, xyz });
    total += xyz[1];
  }
  for (const { s, xyz } of power) {
    const x = (TPHOTONS * xyz[1]) / total; // expected photons from this bin
    const n = Math.floor(x) + (r() < x - Math.floor(x) ? 1 : 0);
    const each: [number, number, number] = [xyz[0] / x, xyz[1] / x, xyz[2] / x];
    for (let k = 0; k < n; k++) {
      const p = add(s.a, sub(s.b, s.a), r());
      const st = 2 * r() - 1;
      const d = unit(add(add(v(0, 0), s.n, Math.sqrt(1 - st * st)), perp(s.n), st));
      const h = hit(p, d, s);
      if (h) track(p, h.p, each, F);
    }
  }
  // The mirrors: what arrives, reflected.
  for (const { p, d, s, xyz } of MIRROR_OUT) {
    const h = hit(p, d, s);
    if (h) track(p, h.p, xyz, F);
  }
  return F;
}
/** The room's light as fluence (XYZ per cell): L, the lamp's alone E, or T(L). */
export function fluenceOf(which: 'L' | 'E' | 'T'): Float64Array {
  if (which === 'L') return FLUENCE;
  if (which === 'E') return FLUENCE_E;
  return (FLUENCE_T ??= traceT());
}

// --- Any light field, and T of it ------------------------------------------------
/**
 * A light field given by the light leaving surfaces: the lamp's beam (if
 * `lamp`) and, from each diffuse wall piece, a Lambertian glow of radiance
 * `wall(s)` (a spectrum, or null for none). Light fields of this kind can be
 * written down without solving anything, and T of them computed: the
 * equilibrium is the one that cannot (Steve, 2026-10-29).
 */
export interface Candidate {
  lamp: boolean;
  wall?: (s: Seg) => Float64Array | null;
}
/**
 * The fluence of a candidate L and of T(L), by tracing: photons leave the
 * candidate's surfaces (the lamp as in the main trace; the walls by power,
 * cosine-distributed) and fly to the first thing they meet (L); there they
 * interact once, a mirror reflecting (MIRROR_R), a diffuse wall reflecting
 * diffusely (its reflectance), the housing or a wall's back absorbing, and
 * fly on to the next thing they meet (T(L)).
 */
export function traceCandidate(c: Candidate, photons = 60000): { L: Float64Array; T: Float64Array } {
  const FL = new Float64Array(GW * GH * 3);
  const FT = new Float64Array(GW * GH * 3);
  let sd = 0x2468ace;
  const r = () => {
    sd ^= sd << 13;
    sd ^= sd >>> 17;
    sd ^= sd << 5;
    return (sd >>> 0) / 4294967296;
  };
  const g = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  const fly = (o: Vec, d: Vec, from: Seg | null, w: Float64Array) => {
    const h = hit(o, d, from);
    if (!h) return;
    track(o, h.p, toXYZw(w), FL);
    let d2: Vec;
    if (h.s.kind === 'black') return;
    if (h.s.kind === 'mirror') {
      for (let i = 0; i < NS; i++) w[i]! *= MIRROR_R;
      d2 = reflect(d, h.s.n);
    } else {
      if (dot(d, h.s.n) >= 0) return;
      for (let i = 0; i < NS; i++) w[i]! *= h.s.albedo![i]!;
      const st = 2 * r() - 1;
      d2 = unit(add(add(v(0, 0), h.s.n, Math.sqrt(1 - st * st)), perp(h.s.n), st));
    }
    const h2 = hit(h.p, d2, h.s);
    if (h2) track(h.p, h2.p, toXYZw(w), FT);
  };
  const w = new Float64Array(NS);
  if (c.lamp) {
    for (let k = 0; k < photons; k++) {
      let s = g() * SOURCE.waist;
      while (Math.abs(s) > 0.9) s = g() * SOURCE.waist;
      const o = add(SOURCE.center, N, s);
      const d = unit(add(A, N, Math.tan(g() * SOURCE.sigma)));
      for (let i = 0; i < NS; i++) w[i] = SUN[i]! / photons;
      fly(o, d, null, w);
    }
  }
  if (c.wall) {
    // Power leaving a piece: radiance times 2 (the cosine over a half circle) times its length.
    const glow: { s: Seg; P: Float64Array; Y: number }[] = [];
    let total = 0;
    for (const s of segs) {
      if (s.bin < 0) continue;
      const Lo = c.wall(s);
      if (!Lo) continue;
      const P = Lo.map((x) => 2 * x * binLength[s.bin]!);
      const Y = toXYZw(P)[1];
      glow.push({ s, P, Y });
      total += Y;
    }
    for (const { s, P, Y } of glow) {
      const x = (photons * Y) / total;
      const n = Math.floor(x) + (r() < x - Math.floor(x) ? 1 : 0);
      for (let k = 0; k < n; k++) {
        for (let i = 0; i < NS; i++) w[i] = P[i]! / x;
        const st = 2 * r() - 1;
        fly(add(s.a, sub(s.b, s.a), r()), unit(add(add(v(0, 0), s.n, Math.sqrt(1 - st * st)), perp(s.n), st)), s, w);
      }
    }
  }
  return { L: FL, T: FT };
}

// --- Reading the light field back: L(x, ω) ---------------------------------------
// The lamp's emission, normalised to total power 1 per unit of SUN.
export const EMIT_NORM = 1 / (SOURCE.waist * Math.sqrt(2 * Math.PI) * SOURCE.sigma * Math.sqrt(2 * Math.PI));
/** The spectrum of the light at x travelling in direction w, into out. Returns the surface it came from. */
export function lightAlong(x: Vec, w: Vec, out: Float64Array, path: Vec[], depth = 0): void {
  out.fill(0);
  path.push(x);
  if (depth > 12) return;
  const back = v(-w.x, -w.y);
  // Through the lamp's opening, if the ray comes out of the housing.
  const h = hit(x, back, null);
  // The lamp's opening, a segment C + N s, |s| < 0.9: solve x + back t = C + N s.
  const opening = (() => {
    const cross = (p: Vec, q: Vec) => p.x * q.y - p.y * q.x;
    const den = cross(back, N);
    if (Math.abs(den) < 1e-12) return null;
    const r = sub(SOURCE.center, x);
    const t = cross(r, N) / den;
    const s = cross(r, back) / den;
    return t > EPS && Math.abs(s) < 0.9 ? { t, s } : null;
  })();
  if (opening && (!h || opening.t < h.t) && dot(w, A) > 0) {
    path.push(add(x, back, opening.t));
    const ang = Math.atan2(dot(w, N), dot(w, A));
    const g = Math.exp(-(opening.s ** 2) / (2 * SOURCE.waist ** 2)) * Math.exp(-(ang ** 2) / (2 * SOURCE.sigma ** 2));
    for (let i = 0; i < NS; i++) out[i] = SUN[i]! * g * EMIT_NORM;
    return;
  }
  if (!h) return;
  if (h.s.kind === 'black') {
    path.push(h.p);
    return;
  }
  if (h.s.kind === 'mirror') {
    const wIn = reflect(w, h.s.n);
    lightAlong(h.p, wIn, out, path, depth + 1);
    for (let i = 0; i < NS; i++) out[i]! *= MIRROR_R;
    return;
  }
  path.push(h.p);
  if (dot(w, h.s.n) <= 0) return; // its back: nothing leaves that way
  outgoing(h.s, out);
}

// --- Drawing ------------------------------------------------------------------------
// The reference brightness: a bright-but-ordinary wall (the 90th percentile of
// the diffuse surfaces), not the spot the beam lands on, which is far brighter.
export const L_REF = (() => {
  const tmp = new Float64Array(NS);
  const peaks: number[] = [];
  for (const s of segs) if (s.bin >= 0) {
    outgoing(s, tmp);
    peaks.push(Math.max(...tmp));
  }
  peaks.sort((a, b) => a - b);
  return peaks[Math.floor(peaks.length * 0.9)]!;
})();

/** Blur a fluence grid twice, 3 x 3, against Monte Carlo grain. */
function blurred(F: Float64Array): Float64Array {
  let f = F;
  for (let pass = 0; pass < 2; pass++) {
    const g = new Float64Array(f.length);
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) for (let c = 0; c < 3; c++) {
      let sum = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= GW || yy >= GH) continue;
        sum += f[(yy * GW + xx) * 3 + c]!;
        n++;
      }
      g[(y * GW + x) * 3 + c] = sum / n;
    }
    f = g;
  }
  return f;
}
/**
 * The exposure of a fluence grid: the 90th percentile of the lit cells (inside
 * the beam the light is far brighter, and saturates; the bounced light sits low
 * and dark).
 */
export function exposureOf(F: Float64Array): number {
  const f = blurred(F);
  const Ys: number[] = [];
  for (let i = 0; i < GW * GH; i++) if (f[i * 3 + 1]! > 0) Ys.push(f[i * 3 + 1]!);
  Ys.sort((a, b) => a - b);
  return Ys[Math.floor(Ys.length * 0.9)]! * 1.2;
}

/**
 * The walls, in the colour of the light leaving them; the outlines; the room
 * coloured by its light. Options: another fluence to colour the room by (E or
 * T(L) from fluenceOf), its exposure (to share one between panels), and
 * `walls: false` to draw the walls as a plain outline instead (for E, where no
 * light leaves them).
 */
export function drawRoom(room: THREE.Group, opts: { fluence?: Float64Array; exposure?: number; walls?: boolean } = {}): void {
  const { fluence = FLUENCE, walls = true } = opts;
  // The walls, in the colour and brightness of the light leaving them.
  if (!walls) {
    const hx = ROOM_HALF.x - ROOM_R;
    const hy = ROOM_HALF.y - ROOM_R;
    const pts: [number, number, number][] = [];
    for (const [cx, cy, a0] of [[hx, hy, 0], [-hx, hy, 90], [-hx, -hy, 180], [hx, -hy, 270]] as const)
      for (let k = 0; k <= 6; k++) {
        const q = add(v(cx, cy), fromAngle(a0 + (90 * k) / 6), ROOM_R);
        pts.push([q.x, q.y, 0]);
      }
    pts.push(pts[0]!);
    room.add(polyline(pts, { color: C.slateDeep, width: 5 }));
  } else {
    const tmp = new Float64Array(NS);
    const Yref = toXYZ(spectrum(() => L_REF))[1];
    for (const s of segs) {
      if (s.kind !== 'diffuse') continue;
      outgoing(s, tmp);
      const [X, Y, Z] = toXYZ(tmp);
      const k = 1.0 / Yref;
      const inset = (p: Vec) => [add(p, s.n, 0.04).x, add(p, s.n, 0.04).y, 0] as [number, number, number];
      room.add(polyline([inset(s.a), inset(s.b)], { color: xyzToHex(X * k, Y * k, Z * k), width: 7 }));
    }
  }
  // Outlines: the room's edge, the mirrors, the housing.
  {
    const lineIn = (pts: Vec[], color: number, width: number) => room.add(polyline(pts.map((p) => [p.x, p.y, 0.01] as [number, number, number]), { color, width }));
    lineIn([add(FLAT.mid, FLAT.dir, -FLAT.half), add(FLAT.mid, FLAT.dir, FLAT.half)], C.slate, 5);
    lineIn(arcPts, C.slate, 5);
    lineIn(HOUSING, C.slate, 5);
  }
  // The room, coloured by the light in it: the fluence image, tone-mapped.
  room.add(fluenceMesh(fluence, opts.exposure));
}

/** A fluence grid as an image of the room (blurred, tone-mapped 1 - exp about `exposure`). */
export function fluenceMesh(fluence: Float64Array, exposure?: number): THREE.Mesh {
  const f = blurred(fluence);
  const Yref = exposure ?? exposureOf(fluence);
  const data = new Uint8Array(GW * GH * 4);
  const hx = ROOM_HALF.x - ROOM_R;
  const hy = ROOM_HALF.y - ROOM_R;
  for (let y = 0; y < GH; y++) {
    for (let x = 0; x < GW; x++) {
      const i = y * GW + x;
      const px = -ROOM_HALF.x + (x + 0.5) * CELL;
      const py = -ROOM_HALF.y + (y + 0.5) * CELL;
      const qx = Math.max(Math.abs(px) - hx, 0);
      const qy = Math.max(Math.abs(py) - hy, 0);
      const inRoom = Math.hypot(qx, qy) < ROOM_R;
      const Y = f[i * 3 + 1]! / Yref;
      const k = Y > 0 ? (1 - Math.exp(-Y)) / Y / Yref : 0;
      const hex = xyzToHex(f[i * 3]! * k, f[i * 3 + 1]! * k, f[i * 3 + 2]! * k);
      data[i * 4] = (hex >> 16) & 255;
      data[i * 4 + 1] = (hex >> 8) & 255;
      data[i * 4 + 2] = hex & 255;
      data[i * 4 + 3] = inRoom ? 255 : 0;
    }
  }
  const tex = new THREE.DataTexture(data, GW, GH, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  const image = new THREE.Mesh(new THREE.PlaneGeometry(2 * ROOM_HALF.x, 2 * ROOM_HALF.y), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }));
  image.position.z = -0.02;
  return image;
}
