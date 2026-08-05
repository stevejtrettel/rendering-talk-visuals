/**
 * The array is the room.
 *
 * The five arrays of `state-space-stored` on the left; the room on the right.
 * A cursor reads the arrays like text — floor, right wall, ceiling, left wall,
 * object — and as each column is written, the patch it stands for lights up.
 * Both flash together, so every column is seen matched to its patch.
 *
 * This is the dictionary, and it is here so that the demos that follow can spend
 * their time on what changes rather than on what the picture means. **Nothing
 * converges here.** The field is solved once, up front; what the clip animates is
 * how much of it has been written into the store.
 *
 * ## The room is computed only from the arrays
 *
 * This is the whole point, and it is not a figure of speech. Every pixel on the
 * right is a lookup into the five arrays on the left and nothing else:
 *
 *   a pixel on a surface   the patch it lies in, read at the direction bin
 *                          containing φ = 0 — the outward normal.
 *   a pixel in the room    thirty-two directions ω; each traced backwards to the
 *                          boundary point q it came from; the bin containing the
 *                          angle of ω in q's own frame; averaged.
 *
 * There is no second solve behind the right-hand panel and no lighting model in
 * it. Blank a column and that patch goes dark, and so does everything it was
 * lighting — which is exactly the claim the picture is making. `state-space` and
 * `state-space-discrete` earned the geometry; this earns the indexing.
 *
 * ## What the two halves of a column do
 *
 * A photograph only ever reads the **bottom** half of a column, the outgoing
 * hemisphere ω·n > 0 — and for Lambertian materials that half is one value
 * repeated, which is why the bottom of every row is flat bands. The top half is
 * the incoming hemisphere: what that patch *sees*. It is not redundant, it is
 * simply not what a camera in the room asks for. The cursor draws the twelve
 * directions of the column it is on, so the correspondence is per-cell and not
 * just per-column.
 *
 * ## Written and unwritten
 *
 * An unwritten cell and an unlit patch are drawn the same near-black slate in
 * both panels, so the two pictures agree about what is missing as well as about
 * what is there. An unwritten patch contributes nothing to the gather, so the
 * room's interior stays dark until there is something stored to light it.
 *
 * The solve is the deck's usual one — patch midpoints, form factors with a
 * visibility test, the pigments of `scene2d`, iterated to equilibrium — and the
 * spectra are collapsed to RGB by the three-band average `path-space` uses. The
 * display transform is the deck's exposure and 0.7 gamma.
 */

import * as THREE from 'three';
import { createStage, createUI, C } from '@';
import {
  R_FIBER,
  OBJ_RISE,
  NW,
  NDIR,
  ND,
  RX,
  RY,
  WALL,
  DISC,
  FAN_CELLS,
  boxBoundary,
  boxNearSegments,
  polygonBoundary,
  cellSheet,
  normalOf,
  POSE_FLAT,
  type Boundary,
  type Pose,
} from '@/bundle2d';
import { PIGMENT, apothem } from '@/scene2d';
import { EXPORT_W, EXPORT_H } from '@/stage';

const ORTHO_H = 3;
const HALF_W = (ORTHO_H * 16) / 9;

const stage = createStage({
  camera: 'ortho',
  position: [0, 0, 10],
  target: [0, 0, 0],
  orthoHeight: ORTHO_H,
  lights: false,
  controls: false,
});
stage.duration = 20;

const ui = createUI(stage);

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

const boxCurve = boxBoundary(NW, FAN_CELLS);
const objCurve = polygonBoundary();

const boxCells = cellSheet(boxCurve, 0.13, boxNearSegments(NW, FAN_CELLS));
const objCells = cellSheet(objCurve);

const boxHolder = new THREE.Group();
const objHolder = new THREE.Group();
boxHolder.add(boxCells.mesh);
objHolder.add(objCells.mesh);
stage.add(boxHolder, objHolder);

// ---------------------------------------------------------------------------
// The light field
// ---------------------------------------------------------------------------

interface Patch {
  x: number;
  y: number;
  nx: number;
  ny: number;
  ds: number;
  mat: number;
  emits: boolean;
  sheet: 0 | 1;
  cell: number;
}

function collect(b: Boundary, sheet: 0 | 1, out: Patch[]): void {
  const N = b.nodes.length;
  for (let i = 0; i < N; i++) {
    const cell = b.segCell[i];
    if (cell < 0) continue;
    const a = b.nodes[i];
    const c = b.nodes[(i + 1) % N];
    const [nx, ny] = normalOf(a.th);
    out.push({
      x: (a.x + c.x) / 2,
      y: (a.y + c.y) / 2,
      nx,
      ny,
      ds: Math.hypot(c.x - a.x, c.y - a.y),
      mat: b.segMat[i],
      emits: b.segMat[i] === 5,
      sheet,
      cell,
    });
  }
}

const patches: Patch[] = [];
collect(boxCurve, 0, patches);
collect(objCurve, 1, patches);
const M = patches.length;
const BOX_CELLS = boxCurve.cells;

// --- pigments, as RGB -------------------------------------------------------
// The same three-band average `path-space` uses. A talk about spectra drawing
// them in RGB is a compression, and it is stated rather than smuggled.
const NS = 48;
const wavelength = (i: number) => 400 + (300 * i) / NS;

function toRGB(f: (l: number) => number): [number, number, number] {
  const bands: [number, number][] = [
    [590, 700],
    [490, 590],
    [400, 490],
  ];
  return bands.map(([a, b]) => {
    let sum = 0;
    let n = 0;
    for (let i = 0; i <= NS; i++) {
      const l = wavelength(i);
      if (l >= a && l <= b) {
        sum += f(l);
        n++;
      }
    }
    return n > 0 ? sum / n : 0;
  }) as [number, number, number];
}

function planck(nm: number, T: number): number {
  const l = nm * 1e-9;
  return 3.7418e-16 / (l ** 5 * (Math.exp(1.4388e-2 / (l * T)) - 1));
}

/** scene2d's pigments, plus the emitting stretch of ceiling, which is ceiling. */
const ALBEDO = [...PIGMENT.map(toRGB), toRGB(PIGMENT[2])];

const peakPlanck = (() => {
  let p = 1e-9;
  for (let i = 0; i <= NS; i++) p = Math.max(p, planck(wavelength(i), 3600));
  return p;
})();
const EMIT_RGB = toRGB((l) => planck(l, 3600) / peakPlanck);

// --- visibility and tracing -------------------------------------------------

const APOTHEM = apothem(DISC.r);

/** Does the segment a→b cross the object? Both ends usually sit on Σ. */
function blocked(ax: number, ay: number, bx: number, by: number): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  if (Math.hypot(dx, dy) < 1e-9) return true;
  for (let k = 0; k < ND; k++) {
    const f0 = (2 * Math.PI * k) / ND;
    const f1 = (2 * Math.PI * (k + 1)) / ND;
    const vx = DISC.x + DISC.r * Math.cos(f0);
    const vy = DISC.y + DISC.r * Math.sin(f0);
    const ex = DISC.r * (Math.cos(f1) - Math.cos(f0));
    const ey = DISC.r * (Math.sin(f1) - Math.sin(f0));
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) continue;
    const rx = vx - ax;
    const ry = vy - ay;
    const t = (rx * ey - ry * ex) / den;
    const u = (rx * dy - ry * dx) / den;
    if (t > 1e-3 && t < 1 - 1e-3 && u > 1e-6 && u < 1 - 1e-6) return true;
  }
  return false;
}

/** Object patch whose outward normal is closest to (nx, ny). */
function facetPatch(nx: number, ny: number): number {
  let best = -1;
  let bestDot = -2;
  for (let i = 0; i < objCurve.nodes.length; i++) {
    const cell = objCurve.segCell[i];
    if (cell < 0) continue;
    const [ax, ay] = normalOf(objCurve.nodes[i].th);
    const d = ax * nx + ay * ny;
    if (d > bestDot) {
      bestDot = d;
      best = cell;
    }
  }
  return best;
}

/** Box patch containing a point on the walls. */
function wallPatch(x: number, y: number): number {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < boxCurve.nodes.length; i++) {
    const cell = boxCurve.segCell[i];
    if (cell < 0) continue;
    const p = patches[cell];
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < bestD) {
      bestD = d;
      best = cell;
    }
  }
  return best;
}

/** The patch a ray from (px, py) in direction (dx, dy) lands on, or −1. */
function traceIndex(px: number, py: number, dx: number, dy: number): number {
  let best = Infinity;
  let hit = -1;

  const ox = px - DISC.x;
  const oy = py - DISC.y;
  const bq = ox * dx + oy * dy;
  const cq = ox * ox + oy * oy - DISC.r * DISC.r;
  if (cq <= 0 || (bq < 0 && bq * bq - cq >= 0)) {
    for (let k = 0; k < ND; k++) {
      const f0 = (2 * Math.PI * k) / ND;
      const f1 = (2 * Math.PI * (k + 1)) / ND;
      const ax = DISC.x + DISC.r * Math.cos(f0);
      const ay = DISC.y + DISC.r * Math.sin(f0);
      const ex = DISC.r * (Math.cos(f1) - Math.cos(f0));
      const ey = DISC.r * (Math.sin(f1) - Math.sin(f0));
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-12) continue;
      const rx = ax - px;
      const ry = ay - py;
      const t = (rx * ey - ry * ex) / den;
      const u = (rx * dy - ry * dx) / den;
      if (t <= 1e-4 || t >= best || u < 0 || u > 1) continue;
      best = t;
      const mid = (2 * Math.PI * (k + 0.5)) / ND;
      hit = BOX_CELLS + facetPatch(Math.cos(mid), Math.sin(mid));
    }
  }

  const tx = dx > 1e-9 ? (RX - px) / dx : dx < -1e-9 ? (-RX - px) / dx : Infinity;
  const ty = dy > 1e-9 ? (RY - py) / dy : dy < -1e-9 ? (-RY - py) / dy : Infinity;
  const tw = Math.min(tx, ty);
  if (tw > 1e-4 && tw < best) hit = wallPatch(px + dx * tw, py + dy * tw);
  return hit;
}

// --- the operator and the solve ---------------------------------------------

const F = new Float32Array(M * M);
(function buildOperator() {
  for (let i = 0; i < M; i++) {
    const a = patches[i];
    let sum = 0;
    for (let j = 0; j < M; j++) {
      if (i === j) continue;
      const b = patches[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const r = Math.hypot(dx, dy);
      if (r < 1e-6) continue;
      const ux = dx / r;
      const uy = dy / r;
      const ci = a.nx * ux + a.ny * uy;
      const cj = -(b.nx * ux + b.ny * uy);
      if (ci <= 0 || cj <= 0) continue;
      if (blocked(a.x, a.y, b.x, b.y)) continue;
      const f = (ci * cj * b.ds) / (2 * r);
      F[i * M + j] = f;
      sum += f;
    }
    if (sum > 1e-9) for (let j = 0; j < M; j++) F[i * M + j] /= sum;
  }
})();

/** Outgoing radiance per patch, RGB — the equilibrium field on Σ. */
const radiosity = new Float32Array(M * 3);

function solve(albedoScale: number, emitStrength: number): void {
  const emission = new Float32Array(M * 3);
  const albedo = new Float32Array(M * 3);
  for (let i = 0; i < M; i++) {
    const p = patches[i];
    for (let c = 0; c < 3; c++) {
      albedo[3 * i + c] = ALBEDO[p.mat][c] * albedoScale;
      emission[3 * i + c] = p.emits ? EMIT_RGB[c] * emitStrength : 0;
    }
  }
  const a = new Float32Array(emission);
  const b = new Float32Array(M * 3);
  radiosity.set(emission);
  for (let it = 0; it < 80; it++) {
    for (let i = 0; i < M; i++) {
      let r = 0;
      let g = 0;
      let bl = 0;
      const row = i * M;
      for (let j = 0; j < M; j++) {
        const f = F[row + j];
        if (f === 0) continue;
        r += f * a[3 * j];
        g += f * a[3 * j + 1];
        bl += f * a[3 * j + 2];
      }
      b[3 * i] = albedo[3 * i] * r;
      b[3 * i + 1] = albedo[3 * i + 1] * g;
      b[3 * i + 2] = albedo[3 * i + 2] * bl;
    }
    a.set(b);
    for (let i = 0; i < M * 3; i++) radiosity[i] += b[i];
  }
}

// ---------------------------------------------------------------------------
// The store
// ---------------------------------------------------------------------------

/**
 * Every cell of every array, in one buffer indexed [patch][bin].
 *
 * It holds **radiance**, not pixels. Each panel applies the deck's display
 * transform — exposure, then a 0.7 gamma — once, on its way to the screen. The
 * first cut of this demo baked the transform into the store, and the room then
 * gathered already-compressed values and compressed them again, which turned its
 * interior into milk.
 *
 * The arrays on the left read it through the sheets, and the room on the right
 * reads it as a texture. One buffer for both is not a convenience — it is the
 * demo's whole claim, so there had better not be two copies of the numbers.
 */
const store = new Float32Array(M * NDIR * 3);

const storeTex = new THREE.DataTexture(
  new Float32Array(M * NDIR * 4),
  M,
  NDIR,
  THREE.RGBAFormat,
  THREE.FloatType,
);
storeTex.minFilter = THREE.NearestFilter;
storeTex.magFilter = THREE.NearestFilter;

/**
 * What an unwritten slot looks like: the structural colouring the arrays already
 * carry at the end of `state-space-stored` — the patch's own material, tinted by
 * which hemisphere the bin is in.
 *
 * So this demo opens on exactly the frame the last one ends on, and "unwritten"
 * says the useful thing rather than nothing: the geometry and the material are
 * known, the light is not. It is captured from the sheets rather than
 * recomputed, so the two demos cannot drift apart.
 */
const structural = new Float32Array(M * NDIR * 3);

/** Height of the write pulse, in display units. */
const FLASH = 0.55;

function fillStore(): void {
  for (let i = 0; i < M; i++) {
    const p = patches[i];
    const [tx, ty] = [p.ny, -p.nx];
    for (let k = 0; k < NDIR; k++) {
      const phi = -Math.PI / 2 + (2 * Math.PI * (k + 0.5)) / NDIR;
      const cp = Math.cos(phi);
      const sp = Math.sin(phi);
      const wx = cp * p.nx + sp * tx;
      const wy = cp * p.ny + sp * ty;
      // Below the halfway line ω leaves the surface, so the value is this
      // patch's own outgoing radiance. Above it ω arrives, so cast backwards and
      // take the radiance of whatever it came from.
      let src = i;
      if (cp < 0) {
        const hit = traceIndex(p.x + p.nx * 1e-4, p.y + p.ny * 1e-4, -wx, -wy);
        src = hit >= 0 ? hit : i;
      }
      const o = (i * NDIR + k) * 3;
      for (let c = 0; c < 3; c++) store[o + c] = Math.max(0, radiosity[3 * src + c]);
    }
  }
}

// Per-sheet views the cell sheets read, rewritten from `store` each frame with
// the cursor applied.
const boxData = new Float32Array(BOX_CELLS * NDIR * 3);
const objData = new Float32Array(objCurve.cells * NDIR * 3);

/**
 * Copy the store into the two sheet buffers and into the texture, masked by the
 * cursor: everything behind it is written, everything ahead is an empty slot,
 * and the column it is on is flashed.
 */
function applyCursor(cursor: number, flashWidth: number, exposure: number): void {
  const texData = storeTex.image.data as Float32Array;
  for (let i = 0; i < M; i++) {
    const behind = cursor - i;
    const on = behind > 0;
    // A short bright pulse as the column is written. The room gets the identical
    // pulse on the identical patch from the identical formula, so the two
    // flashes are one event rather than two things that happen to line up.
    const flash = on ? FLASH * Math.exp(-((behind / flashWidth) ** 2)) : 0;
    const dst = i < BOX_CELLS ? boxData : objData;
    const base = i < BOX_CELLS ? i : i - BOX_CELLS;
    for (let k = 0; k < NDIR; k++) {
      const s = (i * NDIR + k) * 3;
      const d = (base * NDIR + k) * 3;
      const t = (k * M + i) * 4;
      for (let c = 0; c < 3; c++) {
        dst[d + c] = on ? Math.pow(store[s + c] * exposure, 0.7) + flash : structural[s + c];
        // The texture carries radiance; the shader gates on the cursor, so
        // exactly one place decides what counts as written.
        texData[t + c] = store[s + c];
      }
      texData[t + 3] = 1;
    }
  }
  storeTex.needsUpdate = true;
}

/**
 * Read the structural colouring straight out of a sheet's vertex colours, so it
 * is byte-for-byte what `state-space-stored` leaves on screen.
 */
function captureStructural(sheet: { mesh: THREE.Mesh }, b: Boundary, offset: number): void {
  const col = (sheet.mesh.geometry.attributes.color as THREE.BufferAttribute).array as Float32Array;
  for (let i = 0; i < b.nodes.length; i++) {
    const cell = b.segCell[i];
    if (cell < 0) continue;
    for (let k = 0; k < NDIR; k++) {
      const q = (i * NDIR + k) * 12;
      const o = ((offset + cell) * NDIR + k) * 3;
      structural[o] = col[q];
      structural[o + 1] = col[q + 1];
      structural[o + 2] = col[q + 2];
    }
  }
}

/** The same values the shader reads for a patch it has not been given yet. */
const structTex = new THREE.DataTexture(
  new Float32Array(M * NDIR * 4),
  M,
  NDIR,
  THREE.RGBAFormat,
  THREE.FloatType,
);
structTex.minFilter = THREE.NearestFilter;
structTex.magFilter = THREE.NearestFilter;

function uploadStructural(): void {
  const d = structTex.image.data as Float32Array;
  for (let i = 0; i < M; i++) {
    for (let k = 0; k < NDIR; k++) {
      const o = (i * NDIR + k) * 3;
      const t = (k * M + i) * 4;
      d[t] = structural[o];
      d[t + 1] = structural[o + 1];
      d[t + 2] = structural[o + 2];
      d[t + 3] = 1;
    }
  }
  structTex.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// Where the arrays go
// ---------------------------------------------------------------------------

const FIBER_H = 2 * Math.PI * R_FIBER;
const ROW_GAP = 0.3;
const ROW_PITCH = FIBER_H * (1 + ROW_GAP);
const WALL_W = [2 * RX, 2 * RY, 2 * RX, 2 * RY];
const OBJ_W = objCurve.length;

const WALL_S: number[] = [];
{
  let acc = 0;
  for (const w of WALL_W) {
    WALL_S.push(acc);
    acc += w;
  }
}

const STACK_H = FIBER_H + 4 * ROW_PITCH;
/**
 * The same scale `state-space-stored` leaves the arrays at, so this demo opens
 * on that exact frame and then slides them aside to make room for the room.
 */
const ARR_SCALE = (2 * ORTHO_H * 0.93) / STACK_H;
/** Where they start — centred, as the last demo left them — and where they go. */
const ARR_X0 = 0;
const ARR_X1 = -3.55;
const rowY = (r: number) =>
  (STACK_H * ARR_SCALE) / 2 - (FIBER_H * ARR_SCALE) / 2 - r * ROW_PITCH * ARR_SCALE;

const boxPanels = new Float64Array(8);
for (let k = 0; k < 4; k++) {
  boxPanels[2 * k] = (WALL_W[0] - WALL_W[k]) / 2 - WALL_S[k];
  boxPanels[2 * k + 1] = -k * ROW_PITCH;
}

function place(
  holder: THREE.Group,
  b: Boundary,
  cx: number,
  cy: number,
  width: number,
  rise: number,
): void {
  const th0 = b.nodes[0].th;
  const q = new THREE.Quaternion()
    .setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2)
    .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -th0));
  const q0 = new THREE.Vector3(b.nodes[0].x, b.nodes[0].y, rise - R_FIBER);
  holder.quaternion.copy(q);
  holder.scale.setScalar(ARR_SCALE);
  const v = q0.clone().applyQuaternion(q).multiplyScalar(ARR_SCALE);
  holder.position.set(
    cx - (width * ARR_SCALE) / 2 - v.x,
    cy - (FIBER_H * ARR_SCALE) / 2 - v.y,
    -v.z,
  );
}

function placeArrays(x: number): void {
  place(boxHolder, boxCurve, x, rowY(0), WALL_W[0], 0);
  place(objHolder, objCurve, x, rowY(4), OBJ_W, OBJ_RISE);
}
placeArrays(ARR_X0);

// ---------------------------------------------------------------------------
// The room, read out of the store
// ---------------------------------------------------------------------------

const ROOM_S = 1.15;
const ROOM_X = 2.42;

/** Cell offsets down the box loop: floor, right, ceiling, left, then object. */
const NWX = Math.max(2, Math.round(NW));
const NWY = Math.max(2, Math.round((NW * RY) / RX));
const FLOOR0 = 0;
const RIGHT0 = NWX;
const CEIL0 = NWX + NWY;
const LEFT0 = 2 * NWX + NWY;
/**
 * The object's loop runs clockwise from the facet whose midpoint is lowest, so
 * scene facet k is its cell (K0 − k) mod ND. Getting this backwards puts the
 * object's shading on the wrong side and is invisible until you look for it.
 */
const OBJ_K0 = (Math.round((3 * ND) / 4) + ND - 1) % ND;

const FRAG = /* glsl */ `
  precision highp float;
  layout(location = 0) out vec4 fragColor;

  uniform sampler2D uStore;
  uniform sampler2D uStruct;
  uniform vec2 uMin;
  uniform vec2 uMax;
  uniform float uCursor;
  uniform float uExposure;
  uniform float uFlashW;

  varying vec2 vUv;

  const float RX = ${RX.toFixed(4)};
  const float RY = ${RY.toFixed(4)};
  const float WALL = ${WALL.toFixed(4)};
  const vec2 DISC = vec2(${DISC.x.toFixed(4)}, ${DISC.y.toFixed(4)});
  const float DISC_R = ${DISC.r.toFixed(4)};
  const float APOTHEM = ${APOTHEM.toFixed(5)};
  const int ND = ${ND};
  const int NWX = ${NWX};
  const int NWY = ${NWY};
  const int NDIR = ${NDIR};
  const int M = ${M};
  const int BOX_CELLS = ${BOX_CELLS};
  const int FLOOR0 = ${FLOOR0};
  const int RIGHT0 = ${RIGHT0};
  const int CEIL0 = ${CEIL0};
  const int LEFT0 = ${LEFT0};
  const int OBJ_K0 = ${OBJ_K0};
  const int GATHER = 64;
  const float FLASH = ${FLASH.toFixed(3)};
  const vec2 ROOM_C = vec2(${ROOM_X.toFixed(4)}, 0.0);
  const float ROOM_S = ${ROOM_S.toFixed(4)};
  const float TWO_PI = 6.28318530718;

  /** Which patch a point on the walls belongs to, in loop order. */
  int wallCell(vec2 q) {
    if (q.y <= -RY + 1e-3)
      return FLOOR0 + int(clamp(floor((q.x + RX) / (2.0 * RX) * float(NWX)), 0.0, float(NWX - 1)));
    if (q.x >= RX - 1e-3)
      return RIGHT0 + int(clamp(floor((q.y + RY) / (2.0 * RY) * float(NWY)), 0.0, float(NWY - 1)));
    if (q.y >= RY - 1e-3)
      return CEIL0 + int(clamp(floor((RX - q.x) / (2.0 * RX) * float(NWX)), 0.0, float(NWX - 1)));
    return LEFT0 + int(clamp(floor((RY - q.y) / (2.0 * RY) * float(NWY)), 0.0, float(NWY - 1)));
  }

  /** Outward normal of a wall patch, from the point on it. */
  vec2 wallNormal(vec2 q) {
    if (q.y <= -RY + 1e-3) return vec2(0.0, 1.0);
    if (q.x >= RX - 1e-3) return vec2(-1.0, 0.0);
    if (q.y >= RY - 1e-3) return vec2(0.0, -1.0);
    return vec2(1.0, 0.0);
  }

  int facetOf(vec2 d) {
    float a = atan(d.y, d.x);
    if (a < 0.0) a += TWO_PI;
    return int(clamp(floor(a / TWO_PI * float(ND)), 0.0, float(ND - 1)));
  }

  bool insidePoly(vec2 p) {
    vec2 d = p - DISC;
    if (dot(d, d) > DISC_R * DISC_R) return false;
    float mid = TWO_PI * (float(facetOf(d)) + 0.5) / float(ND);
    return dot(d, vec2(cos(mid), sin(mid))) < APOTHEM;
  }

  void hitPoly(vec2 p, vec2 dir, out float bestT, out int bestK) {
    bestT = 1e9;
    bestK = -1;
    vec2 oc = p - DISC;
    float b = dot(oc, dir);
    float c = dot(oc, oc) - DISC_R * DISC_R;
    if (c > 0.0 && (b > 0.0 || b * b - c < 0.0)) return;
    for (int k = 0; k < ND; k++) {
      float f0 = TWO_PI * float(k) / float(ND);
      float f1 = TWO_PI * float(k + 1) / float(ND);
      vec2 a = DISC + DISC_R * vec2(cos(f0), sin(f0));
      vec2 e = DISC_R * (vec2(cos(f1), sin(f1)) - vec2(cos(f0), sin(f0)));
      float den = dir.x * e.y - dir.y * e.x;
      if (abs(den) < 1e-9) continue;
      vec2 r = a - p;
      float t = (r.x * e.y - r.y * e.x) / den;
      float u = (r.x * dir.y - r.y * dir.x) / den;
      if (t <= 1e-4 || u < 0.0 || u > 1.0) continue;
      if (t < bestT) { bestT = t; bestK = k; }
    }
  }

  /** The object's cell for scene facet k — its loop runs clockwise. */
  int facetCell(int k) {
    int j = OBJ_K0 - k;
    j = j - ND * int(floor(float(j) / float(ND)));
    return BOX_CELLS + j;
  }

  /**
   * The bin of direction w in the frame of a patch: φ measured from the outward
   * normal towards the tangent, cut at grazing so bin 0 starts at φ = −π/2.
   */
  int binOf(vec2 w, vec2 n) {
    vec2 tg = vec2(n.y, -n.x);
    float phi = atan(dot(w, tg), dot(w, n));
    float v = (phi + 1.5707963) / TWO_PI;
    v = v - floor(v);
    return int(clamp(floor(v * float(NDIR)), 0.0, float(NDIR - 1)));
  }

  /** A cell of the store, or a negative red channel if it is not written yet. */
  vec2 cellUv(int cell, int bin) {
    return vec2((float(cell) + 0.5) / float(M), (float(bin) + 0.5) / float(NDIR));
  }
  vec3 fetch(int cell, int bin) { return texture(uStore, cellUv(cell, bin)).rgb; }
  vec3 fetchStruct(int cell, int bin) { return texture(uStruct, cellUv(cell, bin)).rgb; }
  bool written(int cell) {
    return float(cell) < uCursor;
  }

  /** The write pulse on a patch — the same formula the arrays use. */
  float flashOf(int cell) {
    float behind = uCursor - float(cell);
    if (behind <= 0.0) return 0.0;
    float x = behind / uFlashW;
    return FLASH * exp(-x * x);
  }

  /** Radiance to pixels: the deck's exposure and 0.7 gamma, applied once. */
  vec3 show(vec3 L) {
    return pow(max(L, vec3(0.0)) * uExposure, vec3(0.7));
  }

  /**
   * The radiance arriving at p from direction ω.
   *
   * The light travelling in direction ω left a surface *behind* p, so trace
   * backwards to find it; at that point ω is outgoing, which is the bottom half
   * of its column.
   */
  vec3 alongDir(vec2 p, vec2 omega) {
    vec2 dir = -omega;
    float bestT;
    int polyK;
    hitPoly(p, dir, bestT, polyK);
    float tx = dir.x > 1e-6 ? (RX - p.x) / dir.x : (dir.x < -1e-6 ? (-RX - p.x) / dir.x : 1e9);
    float ty = dir.y > 1e-6 ? (RY - p.y) / dir.y : (dir.y < -1e-6 ? (-RY - p.y) / dir.y : 1e9);
    float tw = min(tx, ty);

    int cell;
    vec2 n;
    if (polyK >= 0 && bestT < tw) {
      float mid = TWO_PI * (float(polyK) + 0.5) / float(ND);
      n = vec2(cos(mid), sin(mid));
      cell = facetCell(polyK);
    } else {
      vec2 q = p + dir * tw;
      n = wallNormal(q);
      cell = wallCell(q);
    }
    if (!written(cell)) return vec3(0.0);
    return fetch(cell, binOf(omega, n));
  }

  void main() {
    vec2 wp = mix(uMin, uMax, vUv);
    vec2 p = (wp - ROOM_C) / ROOM_S;

    if (abs(p.x) > RX + WALL || abs(p.y) > RY + WALL) {
      fragColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }

    vec3 col;
    if (abs(p.x) > RX || abs(p.y) > RY) {
      // On a wall: that patch, read at the bin containing the outward normal.
      vec2 q = vec2(clamp(p.x, -RX, RX), clamp(p.y, -RY, RY));
      int cell = wallCell(q);
      vec2 n = wallNormal(q);
      int bin = binOf(n, n);
      col = written(cell) ? show(fetch(cell, bin)) + flashOf(cell) : fetchStruct(cell, bin);
    } else if (insidePoly(p)) {
      vec2 d = p - DISC;
      int k = facetOf(d);
      float mid = TWO_PI * (float(k) + 0.5) / float(ND);
      // A lit rim over a dark body: what is stored is the field on the boundary,
      // so the boundary is what carries a value.
      float depth = APOTHEM - dot(d, vec2(cos(mid), sin(mid)));
      float rim = 1.0 - smoothstep(0.04, 0.13, depth);
      int cell = facetCell(k);
      vec2 n = vec2(cos(mid), sin(mid));
      int bin = binOf(n, n);
      col = (written(cell) ? show(fetch(cell, bin)) + flashOf(cell) : fetchStruct(cell, bin)) * rim;
    } else {
      // In the room: gather over directions and read the cell each one lands on.
      // A deterministic per-pixel jitter breaks the banding without making the
      // exported video boil, since it is the same every frame.
      float jit = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
      vec3 g = vec3(0.0);
      for (int k = 0; k < GATHER; k++) {
        float a = TWO_PI * (float(k) + jit) / float(GATHER);
        g += alongDir(p, vec2(cos(a), sin(a)));
      }
      // The interior is transformed after the gather, not before it: what is
      // averaged is radiance. The write pulse is deliberately *not* added here —
      // it marks which patch is being written, and the room shows that on the
      // boundary. What the interior does is simply get brighter, because there
      // is now something stored for it to gather.
      col = show(g / float(GATHER));
    }
    fragColor = vec4(col, 1.0);
  }
`;

const roomMat = new THREE.ShaderMaterial({
  glslVersion: THREE.GLSL3,
  uniforms: {
    uStore: { value: storeTex },
    uStruct: { value: structTex },
    uMin: { value: new THREE.Vector2(-HALF_W, -ORTHO_H) },
    uMax: { value: new THREE.Vector2(HALF_W, ORTHO_H) },
    uCursor: { value: 0 },
    uExposure: { value: 0.6 },
    uFlashW: { value: 2.5 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
  `,
  fragmentShader: FRAG,
});

const roomScene = new THREE.Scene();
const roomCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
roomScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), roomMat));

const target = new THREE.WebGLRenderTarget(64, 64, {
  minFilter: THREE.NearestFilter,
  magFilter: THREE.NearestFilter,
  depthBuffer: false,
});
const screen = new THREE.Mesh(
  new THREE.PlaneGeometry(2 * HALF_W, 2 * ORTHO_H),
  new THREE.MeshBasicMaterial({ map: target.texture, transparent: true, opacity: 0 }),
);
screen.position.z = -1;
stage.add(screen);

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

const params = {
  run: true,
  cursor: 1,
  albedo: 0.72,
  emission: 1.8,
  exposure: 0.62,
  flash: 2.5,
  resolution: 0.7,
};
ui.params.add(params, 'run').name('play the build');
ui.params.add(params, 'cursor', 0, 1, 0.001).name('written (when held)');
ui.params.add(params, 'albedo', 0.2, 1, 0.01).name('albedo');
ui.params.add(params, 'emission', 0, 6, 0.05).name('emission');
ui.params.add(params, 'exposure', 0.1, 3, 0.01).name('exposure');
ui.params.add(params, 'flash', 0.5, 12, 0.1).name('write pulse width');
ui.params.add(params, 'resolution', 0.15, 1, 0.05).name('render resolution');

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

const ease = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Fully unrolled and laid out — this demo opens on the frame
// `state-space-stored` ends on.
const pose: Pose = {
  ...POSE_FLAT,
  alpha: Math.PI / 2,
  open: 1,
  flatten: 1,
  split: 1,
  panels: boxPanels,
};
const objPose: Pose = { ...pose, rise: OBJ_RISE, panels: null };

// Draw both sheets once with their own structural colouring and read it back,
// so "unwritten" is literally the previous demo's final frame.
boxCells.update(pose);
objCells.update(objPose);
captureStructural(boxCells, boxCurve, 0);
captureStructural(objCells, objCurve, BOX_CELLS);
uploadStructural();

const bufSize = new THREE.Vector2();
let matKey = '';
let lastCursor = '';

stage.frame((t) => {
  const u = stage.duration > 0 ? Math.min(1, t / stage.duration) : 0;

  const mkey = `${params.albedo}|${params.emission}`;
  if (mkey !== matKey) {
    matKey = mkey;
    solve(params.albedo, params.emission);
    fillStore();
    lastCursor = '';
  }

  // The arrays start centred, where `state-space-stored` left them, and slide
  // aside while the room fades up beside them. Only then does the cursor start.
  const slide = params.run ? ease(0.02, 0.16, u) : 1;
  placeArrays(ARR_X0 + (ARR_X1 - ARR_X0) * slide);
  (screen.material as THREE.MeshBasicMaterial).opacity = params.run
    ? ease(0.08, 0.22, u)
    : 1;

  // The cursor reads the arrays like text: floor, right wall, ceiling, left
  // wall, object — which is exactly the order the cells are numbered in.
  const frac = params.run ? ease(0.24, 0.9, u) : params.cursor;
  const cursor = frac * M;

  const ckey = `${cursor.toFixed(2)}|${params.exposure}|${params.flash}`;
  if (ckey !== lastCursor) {
    lastCursor = ckey;
    applyCursor(cursor, params.flash, params.exposure);
    boxCells.update(pose, { data: boxData, dataMix: 1 });
    objCells.update(objPose, { data: objData, dataMix: 1 });
    roomMat.uniforms.uCursor.value = cursor;
    roomMat.uniforms.uExposure.value = params.exposure;
    roomMat.uniforms.uFlashW.value = params.flash;
  }

  stage.renderer.getDrawingBufferSize(bufSize);
  const fw = Math.max(64, Math.round(bufSize.x * params.resolution));
  const fh = Math.max(36, Math.round(bufSize.y * params.resolution));
  if (target.width !== fw || target.height !== fh) target.setSize(fw, fh);

  const prev = stage.renderer.getRenderTarget();
  stage.renderer.setRenderTarget(target);
  stage.renderer.render(roomScene, roomCam);
  stage.renderer.setRenderTarget(prev);
});

stage.start();
