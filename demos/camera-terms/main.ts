/**
 * Path tracing from a camera, term by term, in the beam room.
 *
 * For the light-field deck (Steve, 2026-10-30): we are literally trying to show
 * the path-tracing algorithm, where paths start from a camera; in our 2D room,
 * with a 2D camera. Three rooms in a row, one per term of
 * C(Id - T)^-1 E = Σ C T^n E: paths from the film to the light of length 2, 3
 * and 4 (film -> lens -> light is 2). In each room, the camera (its film and
 * pinhole, blue), a few of the sampled paths of that length that reached the
 * lamp, and under the room the term's image: the film is a row of pixels, so
 * a term's photograph is a strip.
 *
 * The tracer is plain path tracing, as in Part I: a sample picks a point on
 * the film, goes through the pinhole into the room, and walks: a mirror
 * reflects; a wall scatters, cosine-weighted, with Russian roulette on its
 * reflectance. Before each step it checks whether the ray reaches the lamp's
 * opening first; if so, and the lamp sends light back along that ray (inside
 * its beam), the sample adds the lamp's radiance that way, times what the
 * walk carried, to its pixel, under the term for the number of interactions so
 * far, and stops. Nothing aims at the lamp: a path finds it by luck, which is
 * why so many samples give nothing.
 *
 * ?mc: the same, sampled live: the count of samples grows from a handful to
 * ~200,000, each room shows the most recent paths of its length that reached
 * the lamp, and each strip fills in from them. Without it, the converged
 * strips and a few representative paths.
 *
 * The deck sets the integrals and words around the rooms, at the same panel
 * centres as term-rooms (x = -3.9, -0.5, 2.9; y = 0; scale 0.26).
 */

import * as THREE from 'three';
import { createStage, createUI, C } from '@';
import { polyline, type Pt } from '@/lines';
import { label, setText } from '@/text';
import { xyzToHex } from '@/response';
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
  SUN,
  MIRROR_R,
  ROOM_HALF,
  ROOM_R,
  SOURCE,
  A,
  N,
  FLAT,
  arcPts,
  HOUSING,
  EPS,
  hit,
  toXYZ,
} from '@/beamscene';

const stage = createStage({ camera: 'ortho', position: [0, 0, 10], target: [0, 0, 0], orthoHeight: 3, lights: false, controls: false });
const MC = new URLSearchParams(location.search).has('mc');
stage.duration = MC ? 20 : 1;
const ui = createUI(stage);

const S = 0.26;
const X = [-3.9, -0.5, 2.9];
const TERMS = X.length;

// --- The camera -------------------------------------------------------------
const params = { camX: 3.6, camY: -1.75, camAngle: 162, fov: 70 };
ui.params.add(params, 'camX', -5, 5, 0.05).onChange(restart);
ui.params.add(params, 'camY', -2.8, 2.8, 0.05).onChange(restart);
ui.params.add(params, 'camAngle', -180, 180, 1).name('looks toward (deg)').onChange(restart);
ui.params.add(params, 'fov', 20, 140, 1).onChange(restart);
const PIX = 40;
const FILM_D = 0.45; // pinhole to film

let PIN = v(0, 0);
let LOOK = v(1, 0);
let FILM_HALF = 0.3;
function setCamera(): void {
  PIN = v(params.camX, params.camY);
  LOOK = fromAngle(params.camAngle);
  FILM_HALF = FILM_D * Math.tan((params.fov * Math.PI) / 360);
}
/** Film point for film coordinate u in [-1, 1] (behind the pinhole, mirrored, as a pinhole's is). */
const filmPoint = (u: number) => add(add(PIN, LOOK, -FILM_D), perp(LOOK), -u * FILM_HALF);

// --- The lamp, seen along a ray -------------------------------------------------
const cross = (p: Vec, q: Vec) => p.x * q.y - p.y * q.x;
/** If the ray x + d t reaches the lamp's opening before distance tMax, the lamp's weight that way (else 0). */
function lampAlong(x: Vec, d: Vec, tMax: number): number {
  const den = cross(d, N);
  if (Math.abs(den) < 1e-12) return 0;
  const r = sub(SOURCE.center, x);
  const t = cross(r, N) / den;
  const s = cross(r, d) / den;
  if (!(t > EPS && t < tMax && Math.abs(s) < 0.9)) return 0;
  const w = v(-d.x, -d.y); // the light's direction: out of the lamp, toward x
  if (dot(w, A) <= 0) return 0;
  const ang = Math.atan2(dot(w, N), dot(w, A));
  return Math.exp(-(s * s) / (2 * SOURCE.waist ** 2)) * Math.exp(-(ang * ang) / (2 * SOURCE.sigma ** 2));
}

// --- The tracer -----------------------------------------------------------------
let seed = 0x2545f491;
const rand = () => {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return (seed >>> 0) / 4294967296;
};

interface Found {
  term: number;
  pix: number;
  pts: Vec[];
  w: number;
}
const sums = Array.from({ length: TERMS }, () => new Float64Array(PIX * 3));
const counts = new Float64Array(PIX);
let samples = 0;
const recent: Found[][] = Array.from({ length: TERMS }, () => []);
const KEEP = 8;

function sampleOnce(): void {
  const u = 2 * rand() - 1;
  const pix = Math.min(PIX - 1, Math.floor(((u + 1) / 2) * PIX));
  counts[pix]! += 1;
  samples++;
  const f = filmPoint(u);
  let o = PIN;
  let d = unit(sub(PIN, f));
  const thr = Float64Array.from(SUN);
  const pts: Vec[] = [f, PIN];
  let skip: Seg | null = null;
  for (let n = 0; n < TERMS; n++) {
    const h = hit(o, d, skip);
    const g = lampAlong(o, d, h ? h.t : Infinity);
    if (g > 0) {
      const [X_, Y_, Z_] = toXYZ(thr);
      const o3 = pix * 3;
      sums[n]![o3]! += X_ * g;
      sums[n]![o3 + 1]! += Y_ * g;
      sums[n]![o3 + 2]! += Z_ * g;
      const lampPt = add(o, d, (() => {
        const r = sub(SOURCE.center, o);
        return cross(r, N) / cross(d, N);
      })());
      const list = recent[n]!;
      list.push({ term: n, pix, pts: [...pts, lampPt], w: Y_ * g });
      if (list.length > KEEP) list.shift();
      return;
    }
    if (!h || h.s.kind === 'black') return;
    pts.push(h.p);
    if (h.s.kind === 'mirror') {
      for (let i = 0; i < NS; i++) thr[i]! *= MIRROR_R;
      d = reflect(d, h.s.n);
    } else {
      if (dot(d, h.s.n) >= 0) return;
      const alb = h.s.albedo!;
      const p = alb.reduce((x, y) => x + y, 0) / NS;
      if (rand() > p) return;
      for (let i = 0; i < NS; i++) thr[i]! *= alb[i]! / p;
      const st = 2 * rand() - 1;
      d = unit(add(add(v(0, 0), h.s.n, Math.sqrt(1 - st * st)), perp(h.s.n), st));
    }
    o = h.p;
    skip = h.s;
  }
}

// --- Drawing --------------------------------------------------------------------
const P3 = (p: Vec, z = 0): Pt => [p.x, p.y, z];
const rooms = X.map((x) => {
  const g = new THREE.Group();
  g.scale.setScalar(S);
  g.position.set(x, 0, 0);
  const hx = ROOM_HALF.x - ROOM_R;
  const hy = ROOM_HALF.y - ROOM_R;
  const edge: Pt[] = [];
  for (const [cx, cy, a0] of [[hx, hy, 0], [-hx, hy, 90], [-hx, -hy, 180], [hx, -hy, 270]] as const)
    for (let k = 0; k <= 6; k++) edge.push(P3(add(v(cx, cy), fromAngle(a0 + (90 * k) / 6), ROOM_R)));
  edge.push(edge[0]!);
  g.add(polyline(edge, { color: C.slateDeep, width: 3 }));
  g.add(polyline([P3(add(FLAT.mid, FLAT.dir, -FLAT.half)), P3(add(FLAT.mid, FLAT.dir, FLAT.half))], { color: C.slate, width: 3 }));
  g.add(polyline(arcPts.map((p) => P3(p)), { color: C.slate, width: 3 }));
  g.add(polyline(HOUSING.map((p) => P3(p)), { color: C.slate, width: 3 }));
  stage.add(g);
  return g;
});
const BLUE = 0x8fb5d6;
let cameraParts: THREE.Object3D[] = [];
function drawCameras(): void {
  for (const o of cameraParts) o.removeFromParent();
  cameraParts = [];
  for (const g of rooms) {
    const a = filmPoint(-1);
    const b = filmPoint(1);
    const parts = [
      polyline([P3(a, 0.06), P3(b, 0.06)], { color: BLUE, width: 6 }),
      polyline([P3(a, 0.06), P3(PIN, 0.06), P3(b, 0.06)], { color: BLUE, width: 2.5 }),
    ];
    for (const p of parts) {
      g.add(p);
      cameraParts.push(p);
    }
  }
}

let pathLines: THREE.Object3D[][] = rooms.map(() => []);
function drawPaths(): void {
  rooms.forEach((g, n) => {
    for (const o of pathLines[n]!) o.removeFromParent();
    pathLines[n] = recent[n]!.map((f) => {
      const line = polyline(f.pts.map((p) => P3(p, 0.03)), { color: C.bone, width: 2, opacity: 0.75 });
      g.add(line);
      return line;
    });
  });
}

// The strips: one row of PIX cells under each room.
const STRIP_H = 0.2;
const stripY = -ROOM_HALF.y * S - 0.12 - STRIP_H / 2;
const cellW = (2 * ROOM_HALF.x * S) / PIX;
const strips = X.map((x) =>
  Array.from({ length: PIX }, (_, i) => {
    // The film is mirrored behind the pinhole; show the image the right way round.
    const m = new THREE.Mesh(new THREE.PlaneGeometry(cellW * 0.96, STRIP_H), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    m.position.set(x - ROOM_HALF.x * S + (PIX - 1 - i + 0.5) * cellW, stripY, 0);
    stage.add(m);
    return m;
  }),
);
let EXPOSURE = 1;
function paintStrips(): void {
  strips.forEach((cells, n) => {
    cells.forEach((m, i) => {
      const c = Math.max(1, counts[i]!);
      const o3 = i * 3;
      const k = 1 / (c * EXPOSURE);
      const hex = xyzToHex(sums[n]![o3]! * k, sums[n]![o3 + 1]! * k, sums[n]![o3 + 2]! * k);
      (m.material as THREE.MeshBasicMaterial).color.setHex(hex);
    });
  });
}
/** One exposure for all strips: the brightest pixel of the length-3 term (the lamp itself, length 2, burns out). */
function setExposure(): void {
  let best = 1e-12;
  for (let i = 0; i < PIX; i++) best = Math.max(best, sums[1]![i * 3 + 1]! / Math.max(1, counts[i]!));
  EXPOSURE = best;
}

const countLabel = label('', { size: 0.24, color: C.ash, anchorX: 'center', anchorY: 'top', position: [0, -2.5, 0] });
if (MC) stage.add(countLabel);

function reset(): void {
  for (const s of sums) s.fill(0);
  counts.fill(0);
  samples = 0;
  seed = 0x2545f491;
  for (const r of recent) r.length = 0;
}
let built = false;
function restart(): void {
  setCamera();
  drawCameras();
  reset();
  built = false;
  lastU = -1;
}
setCamera();
drawCameras();

const STATIC_SAMPLES = 400000;
const MC_MAX = 200000;
let lastU = -1;
let lastPaint = -1;
stage.frame((t) => {
  if (!MC) {
    if (built) return;
    built = true;
    for (let k = 0; k < STATIC_SAMPLES; k++) sampleOnce();
    setExposure();
    paintStrips();
    drawPaths();
    return;
  }
  const u = t % stage.duration;
  if (u < lastU) reset();
  lastU = u;
  const HOLD = 3;
  const want = Math.round(Math.min(MC_MAX, 20 * Math.pow(MC_MAX / 20, Math.min(1, u / (stage.duration - HOLD)))));
  while (samples < want) sampleOnce();
  if (u - lastPaint < 0.1 && samples < MC_MAX) return;
  lastPaint = u;
  setExposure();
  paintStrips();
  drawPaths();
  setText(countLabel, `${samples.toLocaleString('en-US')} samples`);
});

stage.start();
