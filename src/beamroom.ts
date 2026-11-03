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
 * its light. The room itself (geometry, materials, ray hits) is
 * src/beamscene.ts, re-exported here; a demo that needs only the room imports
 * that and skips the tracing.
 */

import * as THREE from 'three';
import { C } from '@';
import { polyline } from '@/lines';
import { CMF, xyzToHex } from '@/response';
import {
  type Vec,
  type Seg,
  v,
  add,
  sub,
  dot,
  perp,
  unit,
  fromAngle,
  reflect,
  NS,
  nmAt,
  spectrum,
  SUN,
  MIRROR_R,
  ROOM_HALF,
  ROOM_R,
  SOURCE,
  segs,
  binLength,
  FLAT,
  arcPts,
  A,
  N,
  HOUSING,
  EPS,
  hit,
  toXYZ,
} from './beamscene';
export * from './beamscene';

// --- Light tracing: the equilibrium irradiance on every diffuse surface, and the
// fluence in the room (for colouring it) -------------------------------------------
const GW = 336;
const GH = 184;
const CELL = (2 * ROOM_HALF.x) / GW;
const FLUENCE = new Float64Array(GW * GH * 3); // XYZ
/** The same, of the lamp's light alone: each photon's track before it first meets anything (E). */
const FLUENCE_E = new Float64Array(GW * GH * 3);
/**
 * The same, split by how many times the light has interacted (a mirror or a
 * wall) since it left the lamp: [0] is E, [n] is T^n E, the last holds every
 * bounce from BOUNCES on. Their sum is FLUENCE exactly: the equilibrium is the
 * series, term by term (beam-series).
 */
export const BOUNCES = 8;
const FLUENCE_N = Array.from({ length: BOUNCES + 1 }, () => new Float64Array(GW * GH * 3));
/** The power (luminance, Y) of each term: the light as it sets out after n interactions. */
const POWER_N = new Float64Array(BOUNCES + 1);
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
const E = new Float64Array(binLength.length * NS); // irradiance, power per length, per wavelength
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
      const xyz = toXYZw(w);
      track(o, h.p, xyz);
      track(o, h.p, xyz, FLUENCE_N[Math.min(bounce, BOUNCES)]);
      POWER_N[Math.min(bounce, BOUNCES)]! += xyz[1];
      if (bounce === 0) track(o, h.p, xyz, FLUENCE_E);
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

/** T^n E as fluence, n < BOUNCES; n = BOUNCES is the rest of the series, every term from there on. */
export function fluenceOfBounce(n: number): Float64Array {
  return FLUENCE_N[Math.min(n, BOUNCES)]!;
}
/**
 * Sample `count` more lamp paths, exactly as the main trace does but from the
 * caller's random stream, and add each stretch of flight to `into[n]`, n its
 * number of interactions so far (n < into.length; later ones dropped). Each
 * photon carries the lamp's whole spectrum: divide a grid by the number of
 * photons sampled so far to get the same scale as fluenceOfBounce (term-rooms
 * ?mc, the terms filling in by Monte Carlo).
 */
export function sampleBounces(count: number, rng: () => number, into: Float64Array[]): void {
  const g = () => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
  const w = new Float64Array(NS);
  for (let k = 0; k < count; k++) {
    let s = g() * SOURCE.waist;
    while (Math.abs(s) > 0.9) s = g() * SOURCE.waist;
    let o = add(SOURCE.center, N, s);
    let d = unit(add(A, N, Math.tan(g() * SOURCE.sigma)));
    for (let i = 0; i < NS; i++) w[i] = SUN[i]!;
    let skip: Seg | null = null;
    for (let bounce = 0; bounce < into.length; bounce++) {
      const h = hit(o, d, skip);
      if (!h) break;
      track(o, h.p, toXYZw(w), into[bounce] as typeof FLUENCE);
      if (h.s.kind === 'black') break;
      if (h.s.kind === 'mirror') {
        for (let i = 0; i < NS; i++) w[i]! *= MIRROR_R;
        d = reflect(d, h.s.n);
      } else {
        if (dot(d, h.s.n) >= 0) break;
        const alb = h.s.albedo!;
        const p = alb.reduce((x, y) => x + y, 0) / NS;
        if (rng() > p) break;
        for (let i = 0; i < NS; i++) w[i]! *= alb[i]! / p;
        const st = 2 * rng() - 1;
        d = unit(add(add(v(0, 0), h.s.n, Math.sqrt(1 - st * st)), perp(h.s.n), st));
      }
      o = h.p;
      skip = h.s;
    }
  }
}
export const GRID_SIZE = GW * GH * 3;
/** Add a stretch of flight from a to b, carrying xyz, into a fluence grid (any grid of GRID_SIZE). */
export function trackInto(a: Vec, b: Vec, xyz: [number, number, number], grid: Float64Array): void {
  track(a, b, xyz, grid as typeof FLUENCE);
}

/** The power of T^n E (n = BOUNCES: of the rest of the series), the norm the slides use. */
export function powerOfBounce(n: number): number {
  return POWER_N[Math.min(n, BOUNCES)]!;
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
