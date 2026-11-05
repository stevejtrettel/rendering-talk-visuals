/**
 * The beam room's light, traced: the equilibrium irradiance on every diffuse
 * surface, and the fluence in the room, split by bounce, and T of it. Pure
 * computation (no three.js), so it runs in Node too.
 *
 * It is deterministic (fixed seeds), so it is computed once at build time
 * (scripts/bake-beamroom.mjs, run by `npm run build`) and written to
 * public/beamroom.bin; src/beamroom.ts reads that instead of tracing on every
 * page load (Steve, 2026-11-04: "we use this equilibrium light field a lot
 * and it seems to get re-computed over and over"). The tracing itself is
 * unchanged from when it ran in beamroom.ts; see there for what it means.
 */

import { type Vec, type Seg, v, add, sub, dot, perp, unit, reflect, NS, nmAt, SUN, MIRROR_R, ROOM_HALF, SOURCE, segs, binLength, A, N, hit } from './beamscene';
import { CMF } from './response';

export const GW = 336;
export const GH = 184;
export const CELL = (2 * ROOM_HALF.x) / GW;
/** The fluence is split by how many times the light has interacted since the lamp: [0] is E, [n] is T^n E, the last every bounce from BOUNCES on. */
export const BOUNCES = 8;
export const GRID_SIZE = GW * GH * 3;

export const toXYZw = (w: Float64Array): [number, number, number] => {
  const xyz: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < NS; i++) CMF.forEach((f, c) => (xyz[c] += f(Math.min(nmAt(i), 670)) * w[i]!));
  return xyz;
};
/** Add a photon's track from a to b, power xyz, into a fluence grid. */
export function track(a: Vec, b: Vec, xyz: [number, number, number], into: Float64Array): void {
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

/** Everything the room's demos read from the trace. */
export interface Traced {
  /** Irradiance on each diffuse bin, power per length, per wavelength (bin * NS + i). */
  E: Float64Array;
  /** The power (luminance, Y) of each bounce term. */
  POWER_N: Float64Array;
  /** The fluence (XYZ per cell) of each bounce term, BOUNCES + 1 grids. */
  FLUENCE_N: Float64Array[];
  /** The fluence of T(L), traced on its own. */
  FLUENCE_T: Float64Array;
}

const PHOTONS = 60000;
const TPHOTONS = 60000;

export function traceRoom(): Traced {
  const FLUENCE_N = Array.from({ length: BOUNCES + 1 }, () => new Float64Array(GRID_SIZE));
  const POWER_N = new Float64Array(BOUNCES + 1);
  const MIRROR_OUT: { p: Vec; d: Vec; s: Seg; xyz: [number, number, number] }[] = [];
  const E = new Float64Array(binLength.length * NS);
  let seed = 0x1234567;
  const rand = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  };
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
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
      const xyz = toXYZw(w);
      track(o, h.p, xyz, FLUENCE_N[Math.min(bounce, BOUNCES)]!);
      POWER_N[Math.min(bounce, BOUNCES)]! += xyz[1];
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
  return { E, POWER_N, FLUENCE_N, FLUENCE_T: traceT(E, MIRROR_OUT) };
}

/**
 * The fluence of T(L), computed by its own trace rather than as L minus E: every
 * surface sends on, once, what L delivers to it, and the light is carried to
 * the next surface and stops there. The diffuse walls re-emit from their
 * irradiance (reflectance times what arrives, cosine-distributed, sampled
 * afresh, TPHOTONS in all, by power); the mirrors reflect what arrives at
 * them (the photons of the main trace as they left each mirror). If L is the
 * equilibrium, the result is L - E, up to Monte Carlo noise: a result, not an
 * identity of this code.
 */
function traceT(E: Float64Array, MIRROR_OUT: { p: Vec; d: Vec; s: Seg; xyz: [number, number, number] }[]): Float64Array {
  const F = new Float64Array(GRID_SIZE);
  let sd = 0x7654321;
  const r = () => {
    sd ^= sd << 13;
    sd ^= sd >>> 17;
    sd ^= sd << 5;
    return (sd >>> 0) / 4294967296;
  };
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
  for (const { p, d, s, xyz } of MIRROR_OUT) {
    const h = hit(p, d, s);
    if (h) track(p, h.p, xyz, F);
  }
  return F;
}

// --- The baked file -------------------------------------------------------------------
// A header of six Uint32 (magic, GW, GH, bins, NS, BOUNCES), then POWER_N as
// Float64, then E, the BOUNCES + 1 fluence grids and T(L)'s, as Float32 (plenty
// for drawing; halves the file).
const MAGIC = 0x4245414d; // "BEAM"
const shape = () => [MAGIC, GW, GH, binLength.length, NS, BOUNCES];
export function pack(t: Traced): ArrayBuffer {
  const head = new Uint32Array(shape());
  const n32 = t.E.length + (BOUNCES + 2) * GRID_SIZE;
  const buf = new ArrayBuffer(head.byteLength + 8 * (BOUNCES + 1) + 4 * n32);
  new Uint32Array(buf, 0, head.length).set(head);
  new Float64Array(buf, head.byteLength, BOUNCES + 1).set(t.POWER_N);
  const f = new Float32Array(buf, head.byteLength + 8 * (BOUNCES + 1), n32);
  let o = 0;
  for (const a of [t.E, ...t.FLUENCE_N, t.FLUENCE_T]) {
    f.set(a, o);
    o += a.length;
  }
  return buf;
}
/** The file read back, or null if it was made for a different room (re-bake: npm run build). */
export function unpack(buf: ArrayBuffer): Traced | null {
  const want = shape();
  if (buf.byteLength < 24) return null;
  const head = new Uint32Array(buf, 0, want.length);
  if (want.some((x, i) => head[i] !== x)) return null;
  const POWER_N = Float64Array.from(new Float64Array(buf, head.byteLength, BOUNCES + 1));
  const f = new Float32Array(buf, head.byteLength + 8 * (BOUNCES + 1));
  let o = 0;
  const take = (n: number) => Float64Array.from(f.subarray(o, (o += n)));
  const E = take(binLength.length * NS);
  const FLUENCE_N = Array.from({ length: BOUNCES + 1 }, () => take(GRID_SIZE));
  const FLUENCE_T = take(GRID_SIZE);
  return { E, POWER_N, FLUENCE_N, FLUENCE_T };
}
