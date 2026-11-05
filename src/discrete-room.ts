/**
 * The beam room discretized, so T is a matrix and (Id - T)^{-1} E can be
 * computed by actually inverting (Steve, 2026-11-04: "light fields L: (number
 * of pixels we divide the room into x number of angle sectors on the circle x
 * 3 for RGB). Then T is an N x N matrix ... Then we invert (Id - T)").
 *
 * Pure computation (no three.js). Used by demos/discrete-room.
 *
 * The unknowns: light leaving each piece of the boundary in each sector of
 * directions, in each of R, G, B. Nothing changes in the air, so this is the
 * whole light field: the light along any ray is the light leaving the piece
 * it came from, in the sector it left in.
 *
 *   pieces   the walls cut into pieces about PIECE long (each straight, from
 *            the start of its stretch of wall to the end; at the rounded
 *            corners a chord), each mirror cut into MIRROR_PIECES, each side
 *            its own piece (the mirrors reflect on both sides), and the lamp's
 *            source, a small piece in the middle of the lamp's opening (E lives
 *            there; it absorbs what arrives).
 *            The housing is black: it blocks light and sends none.
 *   sectors  the circle of directions in SECTORS sectors; half of them point
 *            into the surface, where nothing leaves, so each piece has
 *            SECTORS / 2 unknowns per colour.
 *
 * T, row by row: the light leaving piece p in sector k is a sum over the light
 * arriving at p, each arriving direction traced back to the piece and sector
 * it left from (QUAD points along p times QUAD directions per sector):
 *   matte    sum over incoming sectors m of albedo / 2 * (integral of cos over
 *            m) times the light arriving from m (the 2D Lambertian; the same
 *            for every outgoing sector)
 *   mirror   MIRROR_R times the light arriving from the mirror direction
 *   source, housing: 0 (absorb)
 * Each colour is its own N x N problem (the colours do not mix), solved by
 * Gaussian elimination with partial pivoting: an honest direct inverse, no
 * series.
 */

import { type Vec, v, add, sub, dot, perp, unit, segs, RED, GREEN, WHITE, MIRROR_R, FLAT, arcPts, HOUSING, SOURCE, toXYZ, spectrum } from './beamscene';

export const PIECE = 0.36;
export const MIRROR_PIECES = 6;
export const SECTORS = 24; // on the whole circle
export const SOURCE_WIDTH = 0.3;
export const HALF = SECTORS / 2; // outgoing sectors per piece
const QUAD = 3;

export type RGB = [number, number, number];
export type Kind = 'matte' | 'mirror' | 'source';
export interface Piece {
  a: Vec;
  b: Vec;
  /** The side light leaves from. */
  n: Vec;
  kind: Kind;
  rgb: RGB;
  name: string;
}
/** A straight piece of geometry: up to two pieces (its sides), -1 for a side that is black. */
interface Geo {
  a: Vec;
  b: Vec;
  n: Vec;
  front: number;
  back: number;
}

// --- RGB multipliers (as room-materials) -------------------------------------------
const lin = ([X, Y, Z]: [number, number, number]): RGB => [3.2406 * X - 1.5372 * Y - 0.4986 * Z, -0.9689 * X + 1.8758 * Y + 0.0415 * Z, 0.0557 * X - 0.204 * Y + 1.057 * Z];
const WHITE_RGB = lin(toXYZ(spectrum(() => 1)));
const rgbOf = (s: ArrayLike<number>): RGB => lin(toXYZ(s)).map((x, c) => Math.max(0, x / WHITE_RGB[c]!)) as RGB;

// --- The pieces ---------------------------------------------------------------------
export const pieces: Piece[] = [];
const geos: Geo[] = [];
{
  // Walls: runs of bins of one colour, cut into pieces about PIECE long.
  const walls = segs.filter((s) => s.kind === 'diffuse');
  let run: typeof walls = [];
  const flush = () => {
    if (!run.length) return;
    const len = run.reduce((t, s) => t + Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y), 0);
    const k = Math.max(1, Math.round(len / PIECE));
    for (let c = 0; c < k; c++) {
      const part = run.slice(Math.round((c * run.length) / k), Math.round(((c + 1) * run.length) / k));
      const a = part[0]!.a;
      const b = part[part.length - 1]!.b;
      let n = perp(unit(sub(b, a)));
      if (dot(n, part[0]!.n) < 0) n = v(-n.x, -n.y);
      const alb = part[0]!.albedo!;
      const name = alb === RED ? 'red wall' : alb === GREEN ? 'green wall' : 'white wall';
      geos.push({ a, b, n, front: pieces.length, back: -1 });
      pieces.push({ a, b, n, kind: 'matte', rgb: rgbOf(alb), name });
    }
    run = [];
  };
  for (const s of walls) {
    if (run.length && run[0]!.albedo !== s.albedo) flush();
    run.push(s);
  }
  flush();
  // Mirrors: both sides.
  const mirror = (pts: Vec[], name: string) => {
    for (let c = 0; c < MIRROR_PIECES; c++) {
      const a = pts[Math.round((c * (pts.length - 1)) / MIRROR_PIECES)]!;
      const b = pts[Math.round(((c + 1) * (pts.length - 1)) / MIRROR_PIECES)]!;
      const n = perp(unit(sub(b, a)));
      const m: RGB = [MIRROR_R, MIRROR_R, MIRROR_R];
      geos.push({ a, b, n, front: pieces.length, back: pieces.length + 1 });
      pieces.push({ a, b, n, kind: 'mirror', rgb: m, name });
      pieces.push({ a, b, n: v(-n.x, -n.y), kind: 'mirror', rgb: m, name });
    }
  };
  const flatPts = Array.from({ length: 31 }, (_, k) => add(FLAT.mid, FLAT.dir, FLAT.half * (-1 + (2 * k) / 30)));
  mirror(flatPts, 'flat mirror');
  mirror(arcPts, 'curved mirror');
  // The lamp: a small piece in the middle of its opening is the source (Steve:
  // "a super bright light source inside the emitter"); the rest of the
  // opening and the housing are black.
  const A = SOURCE.axis;
  const o0 = HOUSING[3]!;
  const o1 = HOUSING[0]!;
  const at = (t: number) => add(o0, sub(o1, o0), t);
  const s0 = at(0.5 - SOURCE_WIDTH / 2 / Math.hypot(o1.x - o0.x, o1.y - o0.y));
  const s1 = at(0.5 + SOURCE_WIDTH / 2 / Math.hypot(o1.x - o0.x, o1.y - o0.y));
  geos.push({ a: o0, b: s0, n: A, front: -1, back: -1 });
  geos.push({ a: s1, b: o1, n: A, front: -1, back: -1 });
  geos.push({ a: s0, b: s1, n: A, front: pieces.length, back: -1 });
  pieces.push({ a: s0, b: s1, n: A, kind: 'source', rgb: [0, 0, 0], name: 'lamp' });
  for (let k = 0; k < 3; k++) geos.push({ a: HOUSING[k]!, b: HOUSING[k + 1]!, n: perp(unit(sub(HOUSING[k + 1]!, HOUSING[k]!))), front: -1, back: -1 });
}
export const SOURCE_PIECE = pieces.length - 1;
/** Unknowns per colour. */
export const N = pieces.length * HALF;
export const index = (p: number, k: number) => p * HALF + k;

// --- Rays --------------------------------------------------------------------------
/** The piece (and side) a ray from o along d meets first, or -1. */
export function castPiece(o: Vec, d: Vec): number {
  let best = -1;
  let bt = Infinity;
  for (const g of geos) {
    const ex = g.b.x - g.a.x;
    const ey = g.b.y - g.a.y;
    const den = d.x * ey - d.y * ex;
    if (Math.abs(den) < 1e-12) continue;
    const rx = g.a.x - o.x;
    const ry = g.a.y - o.y;
    const t = (rx * ey - ry * ex) / den;
    const u = (rx * d.y - ry * d.x) / den;
    if (t > 1e-6 && u >= 0 && u <= 1 && t < bt) {
      bt = t;
      best = dot(d, g.n) < 0 ? g.front : g.back; // the side facing back along the ray
    }
  }
  return bt === Infinity ? -1 : best;
}
/** The outgoing sector at piece p of direction d (d leaving p), or -1 if d points into it. */
export function sectorOf(p: number, d: Vec): number {
  const n = pieces[p]!.n;
  const c = dot(d, n);
  if (c <= 0) return -1;
  const th = Math.atan2(n.x * d.y - n.y * d.x, c); // -pi/2 .. pi/2, from the normal
  return Math.min(HALF - 1, Math.max(0, Math.floor(((th + Math.PI / 2) / Math.PI) * HALF)));
}
/** The direction at angle th (radians, from the normal) at piece p. */
const dirAt = (p: number, th: number): Vec => {
  const n = pieces[p]!.n;
  const t = v(-n.y, n.x);
  return add(v(n.x * Math.cos(th), n.y * Math.cos(th)), t, Math.sin(th));
};
const sectorAngle = (k: number, q: number) => -Math.PI / 2 + (Math.PI * (k + (q + 0.5) / QUAD)) / HALF;

/**
 * T as a sparse matrix, the same pattern for every colour: for each row, a
 * list of (column, weight) with the row's colour factor taken out (the matte
 * albedo or the mirror's MIRROR_R is per colour: rowScale).
 */
export interface SparseT {
  cols: Int32Array[];
  vals: Float64Array[];
  /** The colour factor of each row: weight times rowScale[c][row] is T's entry. */
  rowScale: Float64Array[];
}
export function buildT(): SparseT {
  const cols: Int32Array[] = [];
  const vals: Float64Array[] = [];
  const rowScale = [0, 1, 2].map(() => new Float64Array(N));
  for (let p = 0; p < pieces.length; p++) {
    const pc = pieces[p]!;
    const pts = Array.from({ length: QUAD }, (_, s) => add(add(pc.a, sub(pc.b, pc.a), (s + 0.5) / QUAD), pc.n, 1e-4));
    // Matte: one row shared by every outgoing sector.
    let matteRow: Map<number, number> | null = null;
    if (pc.kind === 'matte') {
      matteRow = new Map();
      for (let m = 0; m < HALF; m++) {
        const th0 = -Math.PI / 2 + (Math.PI * m) / HALF;
        const th1 = th0 + Math.PI / HALF;
        const w = (Math.sin(th1) - Math.sin(th0)) / 2 / (QUAD * QUAD); // (1/2) * integral of cos over the sector, per sample; times albedo
        for (const x of pts)
          for (let q = 0; q < QUAD; q++) {
            const u = dirAt(p, sectorAngle(m, q)); // toward where the light comes from
            const j = castPiece(x, u);
            if (j < 0) continue;
            const k2 = sectorOf(j, v(-u.x, -u.y));
            if (k2 < 0) continue;
            const col = index(j, k2);
            matteRow.set(col, (matteRow.get(col) ?? 0) + w);
          }
      }
    }
    for (let k = 0; k < HALF; k++) {
      const row = index(p, k);
      let entries: Map<number, number>;
      if (pc.kind === 'matte') entries = matteRow!;
      else if (pc.kind === 'mirror') {
        entries = new Map();
        for (const x of pts)
          for (let q = 0; q < QUAD; q++) {
            const u = dirAt(p, -sectorAngle(k, q)); // the light that reflects into sector k arrives from the mirror direction
            const j = castPiece(x, u);
            if (j < 0) continue;
            const k2 = sectorOf(j, v(-u.x, -u.y));
            if (k2 < 0) continue;
            const col = index(j, k2);
            entries.set(col, (entries.get(col) ?? 0) + 1 / (QUAD * QUAD));
          }
      } else entries = new Map();
      cols.push(Int32Array.from(entries.keys()));
      vals.push(Float64Array.from(entries.values()));
      for (let c = 0; c < 3; c++) rowScale[c]![row] = pc.kind === 'source' ? 0 : pc.rgb[c]!;
    }
  }
  return { cols, vals, rowScale };
}

/** E: the source alone, white. `ray`: one sector of the opening (a narrow beam); `patch`: every sector (the opening glowing). */
export function sourceE(kind: 'ray' | 'patch', strength = 1): Float64Array[] {
  const E = [0, 1, 2].map(() => new Float64Array(N));
  for (let k = 0; k < HALF; k++) {
    if (kind === 'ray' && k !== HALF / 2) continue;
    for (let c = 0; c < 3; c++) E[c]![index(SOURCE_PIECE, k)] = strength;
  }
  return E;
}

/** Solve (Id - T) L = E for one colour, by Gaussian elimination with partial pivoting on the dense matrix. */
export function solve(T: SparseT, c: number, E: Float64Array): Float64Array {
  const M = new Float64Array(N * N);
  for (let r = 0; r < N; r++) {
    M[r * N + r] = 1;
    const s = T.rowScale[c]![r]!;
    const cs = T.cols[r]!;
    const vs = T.vals[r]!;
    for (let e = 0; e < cs.length; e++) M[r * N + cs[e]!]! -= s * vs[e]!;
  }
  const b = Float64Array.from(E);
  for (let k = 0; k < N; k++) {
    let piv = k;
    let best = Math.abs(M[k * N + k]!);
    for (let r = k + 1; r < N; r++) {
      const a = Math.abs(M[r * N + k]!);
      if (a > best) {
        best = a;
        piv = r;
      }
    }
    if (piv !== k) {
      for (let j = k; j < N; j++) {
        const t = M[k * N + j]!;
        M[k * N + j] = M[piv * N + j]!;
        M[piv * N + j] = t;
      }
      const t = b[k]!;
      b[k] = b[piv]!;
      b[piv] = t;
    }
    const d = M[k * N + k]!;
    for (let r = k + 1; r < N; r++) {
      const f = M[r * N + k]! / d;
      if (f === 0) continue;
      const ro = r * N;
      const ko = k * N;
      for (let j = k; j < N; j++) M[ro + j]! -= f * M[ko + j]!;
      b[r]! -= f * b[k]!;
    }
  }
  const x = new Float64Array(N);
  for (let k = N - 1; k >= 0; k--) {
    let s = b[k]!;
    for (let j = k + 1; j < N; j++) s -= M[k * N + j]! * x[j]!;
    x[k] = s / M[k * N + k]!;
  }
  return x;
}

/** The light arriving at x from direction d (looking along d): what leaves the piece there, in that sector. */
export function lightAt(L: Float64Array[], x: Vec, d: Vec): RGB {
  const j = castPiece(x, d);
  if (j < 0) return [0, 0, 0];
  const k = sectorOf(j, v(-d.x, -d.y));
  if (k < 0) return [0, 0, 0];
  const i = index(j, k);
  return [L[0]![i]!, L[1]![i]!, L[2]![i]!];
}

/**
 * (Id - T)^{-1} for one colour, every entry (row-major N x N), by Gauss-Jordan
 * elimination with partial pivoting. Dense: light gets from anywhere to
 * anywhere eventually, so unlike T it has almost no zeros.
 */
export function inverse(T: SparseT, c: number): Float64Array {
  const W = 2 * N;
  const M = new Float64Array(N * W);
  for (let r = 0; r < N; r++) {
    M[r * W + r] = 1;
    M[r * W + N + r] = 1;
    const s = T.rowScale[c]![r]!;
    const cs = T.cols[r]!;
    const vs = T.vals[r]!;
    for (let e = 0; e < cs.length; e++) M[r * W + cs[e]!]! -= s * vs[e]!;
  }
  for (let k = 0; k < N; k++) {
    let piv = k;
    let best = Math.abs(M[k * W + k]!);
    for (let r = k + 1; r < N; r++) {
      const a = Math.abs(M[r * W + k]!);
      if (a > best) {
        best = a;
        piv = r;
      }
    }
    if (piv !== k)
      for (let j = 0; j < W; j++) {
        const t = M[k * W + j]!;
        M[k * W + j] = M[piv * W + j]!;
        M[piv * W + j] = t;
      }
    const d = 1 / M[k * W + k]!;
    for (let j = k; j < W; j++) M[k * W + j]! *= d;
    for (let r = 0; r < N; r++) {
      if (r === k) continue;
      const f = M[r * W + k]!;
      if (f === 0) continue;
      const ro = r * W;
      const ko = k * W;
      for (let j = k; j < W; j++) M[ro + j]! -= f * M[ko + j]!;
    }
  }
  const inv = new Float64Array(N * N);
  for (let r = 0; r < N; r++) inv.set(M.subarray(r * W + N, r * W + W), r * N);
  return inv;
}

// --- The baked inverses ------------------------------------------------------------
// (Id - T)^{-1} takes about 2 s a colour, so it is computed at build time
// (scripts/bake-discrete.mjs) into public/discrete-inverse.bin: two Uint32
// (magic, N), then the three N x N inverses, R, G, B, row-major, as Float32.
const INV_MAGIC = 0x494e5631; // "INV1"
export function packInverses(inv: Float64Array[]): ArrayBuffer {
  const buf = new ArrayBuffer(8 + 3 * N * N * 4);
  new Uint32Array(buf, 0, 2).set([INV_MAGIC, N]);
  const f = new Float32Array(buf, 8);
  inv.forEach((m, c) => f.set(m, c * N * N));
  return buf;
}
/** The file read back, or null if it was made for a different discretization. */
export function unpackInverses(buf: ArrayBuffer): Float32Array[] | null {
  if (buf.byteLength !== 8 + 3 * N * N * 4) return null;
  const head = new Uint32Array(buf, 0, 2);
  if (head[0] !== INV_MAGIC || head[1] !== N) return null;
  return [0, 1, 2].map((c) => new Float32Array(buf, 8 + c * N * N * 4, N * N));
}
