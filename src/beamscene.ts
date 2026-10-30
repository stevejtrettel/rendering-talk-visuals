/**
 * The beam room's geometry and materials, without its light: the room of
 * wave-room ?scene=beam and wave-to-ray ?frame=room, with walls that reflect in
 * colour (left red, right green, floor and ceiling white), the lamp in its
 * housing, the flat mirror and the concave one; vectors, spectra, ray hits.
 *
 * Cheap to import. The equilibrium light in the room is src/beamroom.ts, which
 * re-exports all of this and runs the light tracing when it is imported.
 */

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
export const WHITE = spectrum(() => 0.75);
export const RED = spectrum((nm) => 0.06 + 0.7 / (1 + Math.exp(-(nm - 600) / 12)));
export const GREEN = spectrum((nm) => 0.06 + 0.55 * Math.exp(-(((nm - 535) / 38) ** 2)));
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
export const binLength = new Float64Array(bins);
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

