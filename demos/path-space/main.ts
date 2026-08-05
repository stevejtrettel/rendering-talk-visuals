/**
 * The same series, reinterpreted as paths.
 *
 * `bounce-series` draws the n-th term of E + TE + T²E + ⋯ as a rendered room.
 * This draws the *same terms* in the *same room*, as sets of paths. Nothing
 * about the light has changed between the two demos — only what we have chosen
 * to look at. That is the move Part V makes: paths were not part of the
 * definition of light, and they appear when the equilibrium operator is
 * inverted.
 *
 * Left: the paths of length exactly k. Right: every path swept so far, of every
 * length so far — which is the graded union
 *
 *     Ω(p₀) = ⊔ₙ Ωₙ(p₀)
 *
 * filling in. The two panels stand in the same relation as the two rooms of
 * `bounce-series`: one term, and the sum.
 *
 * ## Drawing a continuum
 *
 * Ωₖ(p₀) has dimension 2k and no finite picture covers it. Drawing a few dozen
 * paths would misrepresent that badly — it would look like light takes a handful
 * of routes. So each frame draws a couple of hundred, and the family *sweeps*:
 * the outgoing direction runs continuously round the circle of directions at p₀,
 * carrying every path with it. What the eye integrates over the sweep is a solid
 * region, which is the honest impression, and the accumulating panel makes it
 * literal — by the end of a length it is a mat rather than a set of lines.
 *
 * The sweep is a rigid drift of the whole fan, not a re-draw: each path keeps
 * its identity and slides, so the motion reads as one family moving through its
 * space rather than as flicker.
 *
 * ## What a path is worth
 *
 * A path is drawn dark if its last vertex does not emit — a perfectly good
 * chain, worth nothing — and lit if it ends on the lamp, tinted by the product
 * of the albedos it touched. That tint is the throughput
 *
 *     albedo(p₀) · albedo(x₁) ⋯ albedo(x_{k-1}) · E(x_k),
 *
 * the integrand of the k-th term, drawn instead of written. **Most paths report
 * nothing**, and it is visible from the first length — the observation Part X
 * opens with, arrived at here for free.
 *
 * Directions are cosine-distributed about each normal, which is the Lambertian
 * measure itself, so no correcting weight is needed and the tint really is the
 * whole of what the path carries. They come from a deterministic
 * low-discrepancy sequence rather than a generator: Part V has not introduced
 * sampling and should not appear to depend on it, and nothing here may call
 * Math.random or every exported frame would differ.
 *
 * ## The bars are exact, the paths are not
 *
 * The bars are the true term magnitudes at p₀, from the same patch-and-form-
 * factor operator `bounce-series` uses — not a total over the drawn paths. A few
 * hundred paths is a picture, not a quadrature, and a chart that claimed
 * otherwise would be the one dishonest thing on screen.
 */

import * as THREE from 'three';
import { createStage, createUI, C, flat } from '@';
import { polyline } from '@/lines';
import { label, setText } from '@/text';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
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
// The room — the same one bounce-series lights
// ---------------------------------------------------------------------------

const RX = 1.8;
const RY = 1.55;
const WALL = 0.14;
const DISC = { x: -0.551, y: -1.049, r: 0.5 };
const EMIT_HALF = 0.45;

const NW = 36;
/**
 * Facets around the object. Coarse on purpose: it is a polygon, not a circle
 * drawn coarsely, and at 16 you can count them. The form factors, the visibility
 * tests and the ray casts all use these same flat facets, so the hard-edged look
 * is the truth rather than a drawing trick.
 */
const ND = 16;
const M = 4 * NW + ND;

const PANEL_X = [-2.1, 2.1];
const PANEL_Y = 0.42;

const bell = (l: number, c: number, w: number) => Math.exp(-0.5 * ((l - c) / w) ** 2);
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

/**
 * Bright walls, and a lamp turned down to compensate.
 *
 * The point of both demos is the light that has bounced, and at a low albedo it
 * is gone by the third term — there is nothing left to look at. Raising the
 * walls makes each term survive further, so the series has visible tail; the
 * emission comes down so the room is not blown out by the first term. The
 * coloured walls also keep a floor of 0.16 across the band rather than 0.05, so
 * they reflect *something* at every wavelength and the deep bounces stay
 * coloured instead of collapsing to a single hue.
 *
 * This is a slower contraction on purpose, which is the honest trade: more
 * terms matter, and the sum takes longer to settle.
 */
const ALBEDO_RGB = [
  toRGB(() => 0.82),
  toRGB((l) => 0.16 + 0.84 * bell(l, 645, 46)),
  toRGB(() => 0.82),
  toRGB((l) => 0.16 + 0.8 * bell(l, 545, 42)),
  toRGB(() => 0.84),
];

const peakPlanck = (() => {
  let p = 1e-9;
  for (let i = 0; i <= NS; i++) p = Math.max(p, planck(wavelength(i), 3400));
  return p;
})();
const EMIT_RGB = toRGB((l) => planck(l, 3400) / peakPlanck);

// ---------------------------------------------------------------------------
// Tracing
// ---------------------------------------------------------------------------

interface Hit {
  x: number;
  y: number;
  nx: number;
  ny: number;
  mat: number;
  emits: boolean;
}

const hitScratch: Hit = { x: 0, y: 0, nx: 0, ny: 0, mat: 0, emits: false };

/** The first thing a ray from (px, py) in direction (dx, dy) meets. */
function trace(px: number, py: number, dx: number, dy: number): Hit | null {
  let best = Infinity;
  let found = false;

  // The object, facet by facet — the same polygon the form factors and the
  // shader use. Intersecting the circumscribed circle instead would put every
  // bounce up to r(1 − cos(π/ND)) off the surface actually drawn, and the paths
  // would visibly float away from the object at the facet midpoints.
  const ox = px - DISC.x;
  const oy = py - DISC.y;
  {
    // Cheap reject on the bounding circle first: most rays miss the object
    // entirely, and those should cost one test rather than ND.
    const b = ox * dx + oy * dy;
    const c = ox * ox + oy * oy - DISC.r * DISC.r;
    if (c <= 0 || (b < 0 && b * b - c >= 0)) {
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
        const uu = (rx * dy - ry * dx) / den;
        if (t <= 1e-4 || t >= best || uu < 0 || uu > 1) continue;
        best = t;
        const mid = (2 * Math.PI * (k + 0.5)) / ND;
        hitScratch.x = px + dx * t;
        hitScratch.y = py + dy * t;
        hitScratch.nx = Math.cos(mid);
        hitScratch.ny = Math.sin(mid);
        hitScratch.mat = 4;
        hitScratch.emits = false;
        found = true;
      }
    }
  }

  const tx = dx > 1e-9 ? (RX - px) / dx : dx < -1e-9 ? (-RX - px) / dx : Infinity;
  const ty = dy > 1e-9 ? (RY - py) / dy : dy < -1e-9 ? (-RY - py) / dy : Infinity;
  const tw = Math.min(tx, ty);
  if (tw > 1e-4 && tw < best) {
    const hx = px + dx * tw;
    const hy = py + dy * tw;
    hitScratch.x = hx;
    hitScratch.y = hy;
    if (tx < ty) {
      const right = dx > 0;
      hitScratch.nx = right ? -1 : 1;
      hitScratch.ny = 0;
      hitScratch.mat = right ? 1 : 3;
      hitScratch.emits = false;
    } else {
      const up = dy > 0;
      hitScratch.nx = 0;
      hitScratch.ny = up ? -1 : 1;
      hitScratch.mat = up ? 2 : 0;
      hitScratch.emits = up && Math.abs(hx) < EMIT_HALF;
    }
    found = true;
  }
  return found ? hitScratch : null;
}

// ---------------------------------------------------------------------------
// The operator, for the exact terms and the background render
// ---------------------------------------------------------------------------

interface Patch {
  x: number;
  y: number;
  nx: number;
  ny: number;
  ds: number;
  mat: number;
  emits: boolean;
}

const patches: Patch[] = [];
for (let side = 0; side < 4; side++) {
  const len = side % 2 === 0 ? 2 * RX : 2 * RY;
  const ds = len / NW;
  for (let k = 0; k < NW; k++) {
    const t = (k + 0.5) / NW;
    let x = 0;
    let y = 0;
    let nx = 0;
    let ny = 0;
    if (side === 0) {
      x = -RX + 2 * RX * t;
      y = -RY;
      ny = 1;
    } else if (side === 1) {
      x = RX;
      y = -RY + 2 * RY * t;
      nx = -1;
    } else if (side === 2) {
      x = RX - 2 * RX * t;
      y = RY;
      ny = -1;
    } else {
      x = -RX;
      y = RY - 2 * RY * t;
      nx = 1;
    }
    patches.push({ x, y, nx, ny, ds, mat: side, emits: side === 2 && Math.abs(x) < EMIT_HALF });
  }
}
// The object: a regular polygon. DISC.r is the circumradius, so its vertices
// sit where the old circle was, and each patch is one flat facet.
const APOTHEM = DISC.r * Math.cos(Math.PI / ND);
for (let k = 0; k < ND; k++) {
  const mid = (2 * Math.PI * (k + 0.5)) / ND;
  const nx = Math.cos(mid);
  const ny = Math.sin(mid);
  patches.push({
    x: DISC.x + APOTHEM * nx,
    y: DISC.y + APOTHEM * ny,
    nx,
    ny,
    ds: 2 * DISC.r * Math.sin(Math.PI / ND),
    mat: 4,
    emits: false,
  });
}

function blockedBetween(a: Patch, b: Patch): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.hypot(dx, dy) < 1e-9) return true;
  for (let k = 0; k < ND; k++) {
    const f0 = (2 * Math.PI * k) / ND;
    const f1 = (2 * Math.PI * (k + 1)) / ND;
    const ax = DISC.x + DISC.r * Math.cos(f0);
    const ay = DISC.y + DISC.r * Math.sin(f0);
    const ex = DISC.r * (Math.cos(f1) - Math.cos(f0));
    const ey = DISC.r * (Math.sin(f1) - Math.sin(f0));
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) continue;
    const rx = ax - a.x;
    const ry = ay - a.y;
    const t = (rx * ey - ry * ex) / den;
    const u = (rx * dy - ry * dx) / den;
    // Both endpoints sit *on* the boundary, so both parameters are kept off
    // their ends — otherwise every facet blocks itself.
    if (t > 1e-3 && t < 1 - 1e-3 && u > 1e-6 && u < 1 - 1e-6) return true;
  }
  return false;
}

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
      if (blockedBetween(a, b)) continue;
      const f = (ci * cj * b.ds) / (2 * r);
      F[i * M + j] = f;
      sum += f;
    }
    if (sum > 1e-9) for (let j = 0; j < M; j++) F[i * M + j] /= sum;
  }
})();

const emission = new Float32Array(M * 3);
const albedo = new Float32Array(M * 3);

function refreshMaterials(albedoScale: number, emitStrength: number): void {
  for (let i = 0; i < M; i++) {
    const p = patches[i];
    const a = ALBEDO_RGB[p.mat];
    for (let c = 0; c < 3; c++) {
      albedo[3 * i + c] = a[c] * albedoScale;
      emission[3 * i + c] = p.emits ? EMIT_RGB[c] * emitStrength : 0;
    }
  }
}

function scatter(src: Float32Array, dst: Float32Array): void {
  for (let i = 0; i < M; i++) {
    let r = 0;
    let g = 0;
    let b = 0;
    const row = i * M;
    for (let j = 0; j < M; j++) {
      const f = F[row + j];
      if (f === 0) continue;
      r += f * src[3 * j];
      g += f * src[3 * j + 1];
      b += f * src[3 * j + 2];
    }
    dst[3 * i] = albedo[3 * i] * r;
    dst[3 * i + 1] = albedo[3 * i + 1] * g;
    dst[3 * i + 2] = albedo[3 * i + 2] * b;
  }
}

/** Paths run out to four vertices; past that the room is a solid mat. */
const MAX_K = 4;

const solved = new Float32Array(M * 3);
const termSize: number[] = [];

/** Where the paths start: on the floor, left of the object. */
// Clear of the object, which sits at x = -0.55 with radius 0.5 and would
// otherwise be directly overhead — every path would start in its shadow.
// Off to one side instead, so the sweep sends paths past it, onto it, and up
// to the emitter.
const P0 = { x: 0.7, y: -RY, nx: 0, ny: 1, mat: 0 };
const P0_PATCH = Math.min(NW - 1, Math.max(0, Math.floor(((P0.x + RX) / (2 * RX)) * NW)));

function solveField(): void {
  const a = new Float32Array(M * 3);
  const b = new Float32Array(M * 3);
  a.set(emission);
  solved.set(emission);
  termSize.length = 0;
  const lum = (v: Float32Array) =>
    (v[3 * P0_PATCH] + v[3 * P0_PATCH + 1] + v[3 * P0_PATCH + 2]) / 3;
  termSize.push(lum(a));
  for (let k = 1; k < 120; k++) {
    scatter(a, b);
    a.set(b);
    for (let i = 0; i < M * 3; i++) solved[i] += b[i];
    if (k <= MAX_K) termSize.push(lum(a));
  }
}

// ---------------------------------------------------------------------------
// The background render
// ---------------------------------------------------------------------------

const radianceData = new Float32Array(M * 4);
const radianceTex = new THREE.DataTexture(radianceData, M, 1, THREE.RGBAFormat, THREE.FloatType);
radianceTex.minFilter = THREE.NearestFilter;
radianceTex.magFilter = THREE.NearestFilter;
radianceTex.needsUpdate = true;

const FRAG = /* glsl */ `
  precision highp float;
  layout(location = 0) out vec4 fragColor;

  uniform sampler2D uRad;
  uniform vec2 uMin;
  uniform vec2 uMax;
  uniform float uExposure;

  varying vec2 vUv;

  const float RX = ${RX.toFixed(4)};
  const float RY = ${RY.toFixed(4)};
  const float WALL = ${WALL.toFixed(4)};
  const vec2 DISC = vec2(${DISC.x.toFixed(4)}, ${DISC.y.toFixed(4)});
  const float DISC_R = ${DISC.r.toFixed(4)};
  const int NW = ${NW};
  const int ND = ${ND};
  const float APOTHEM = ${APOTHEM.toFixed(5)};
  const int M = ${M};
  const int GATHER = 48;

  int patchOfWall(vec2 q) {
    if (q.y <= -RY + 1e-3) return int(clamp(floor((q.x + RX) / (2.0 * RX) * float(NW)), 0.0, float(NW - 1)));
    if (q.x >= RX - 1e-3) return NW + int(clamp(floor((q.y + RY) / (2.0 * RY) * float(NW)), 0.0, float(NW - 1)));
    if (q.y >= RY - 1e-3) return 2 * NW + int(clamp(floor((RX - q.x) / (2.0 * RX) * float(NW)), 0.0, float(NW - 1)));
    return 3 * NW + int(clamp(floor((RY - q.y) / (2.0 * RY) * float(NW)), 0.0, float(NW - 1)));
  }

  /** Darken the last sliver of a patch, so the tiling is visible. */
  float seam(float f) {
    // Near-black and wide: the gaps between patches are the point, so they are
    // drawn as gaps rather than as a hint of shading.
    return 0.12 + 0.88 * smoothstep(0.0, 0.15, min(f, 1.0 - f));
  }
  float seamDisc(vec2 n) {
    float a = atan(n.y, n.x);
    if (a < 0.0) a += 6.2831853;
    return seam(fract(a / 6.2831853 * float(ND)));
  }
  float seamWall(vec2 q) {
    if (q.y <= -RY + 1e-3) return seam(fract((q.x + RX) / (2.0 * RX) * float(NW)));
    if (q.x >= RX - 1e-3) return seam(fract((q.y + RY) / (2.0 * RY) * float(NW)));
    if (q.y >= RY - 1e-3) return seam(fract((RX - q.x) / (2.0 * RX) * float(NW)));
    return seam(fract((RY - q.y) / (2.0 * RY) * float(NW)));
  }

  /** Which facet a direction from the centre falls in. */
  int facetOf(vec2 d) {
    float a = atan(d.y, d.x);
    if (a < 0.0) a += 6.2831853;
    return int(clamp(floor(a / 6.2831853 * float(ND)), 0.0, float(ND - 1)));
  }

  /** Inside the polygon? For a regular one, only the facet facing p can bind. */
  bool insidePoly(vec2 p) {
    vec2 d = p - DISC;
    if (dot(d, d) > DISC_R * DISC_R) return false;
    float mid = 6.2831853 * (float(facetOf(d)) + 0.5) / float(ND);
    return dot(d, vec2(cos(mid), sin(mid))) < APOTHEM;
  }

  /**
   * Nearest facet along the ray. The bounding circle is tested first, so rays
   * that miss the object — most of them — cost one test rather than ND.
   */
  void hitPoly(vec2 p, vec2 dir, out float bestT, out int bestK) {
    bestT = 1e9;
    bestK = -1;
    vec2 oc = p - DISC;
    float b = dot(oc, dir);
    float c = dot(oc, oc) - DISC_R * DISC_R;
    if (c > 0.0 && (b > 0.0 || b * b - c < 0.0)) return;
    for (int k = 0; k < ND; k++) {
      float f0 = 6.2831853 * float(k) / float(ND);
      float f1 = 6.2831853 * float(k + 1) / float(ND);
      vec2 a = DISC + DISC_R * vec2(cos(f0), sin(f0));
      vec2 e = DISC_R * (vec2(cos(f1), sin(f1)) - vec2(cos(f0), sin(f0)));
      float den = dir.x * e.y - dir.y * e.x;
      if (abs(den) < 1e-9) continue;
      vec2 r = a - p;
      float t = (r.x * e.y - r.y * e.x) / den;
      float u = (r.x * dir.y - r.y * dir.x) / den;
      if (t <= 1e-4 || u < 0.0 || u > 1.0) continue;
      if (t < bestT) {
        bestT = t;
        bestK = k;
      }
    }
  }

  vec3 radianceOf(int idx) {
    return texture(uRad, vec2((float(idx) + 0.5) / float(M), 0.5)).rgb;
  }

  vec3 alongRay(vec2 p, vec2 dir) {
    float best = 1e9;
    int idx = -1;
    float polyT;
    int polyK;
    hitPoly(p, dir, polyT, polyK);
    if (polyK >= 0) {
      best = polyT;
      idx = 4 * NW + polyK;
    }
    float tx = dir.x > 1e-6 ? (RX - p.x) / dir.x : (dir.x < -1e-6 ? (-RX - p.x) / dir.x : 1e9);
    float ty = dir.y > 1e-6 ? (RY - p.y) / dir.y : (dir.y < -1e-6 ? (-RY - p.y) / dir.y : 1e9);
    float tw = min(tx, ty);
    if (tw < best) idx = patchOfWall(p + dir * tw);
    return idx < 0 ? vec3(0.0) : radianceOf(idx);
  }

  void main() {
    vec2 wp = mix(uMin, uMax, vUv);
    float px = wp.x < 0.0 ? ${PANEL_X[0].toFixed(4)} : ${PANEL_X[1].toFixed(4)};
    vec2 p = wp - vec2(px, ${PANEL_Y.toFixed(4)});

    if (abs(p.x) > RX + WALL || abs(p.y) > RY + WALL) {
      fragColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }

    vec3 col;
    if (abs(p.x) > RX || abs(p.y) > RY) {
      vec2 q = vec2(clamp(p.x, -RX, RX), clamp(p.y, -RY, RY));
      col = radianceOf(patchOfWall(q)) * seamWall(q);
    } else if (insidePoly(p)) {
      // A tiled rim over a dark body: what is discretised is the light field on
      // the boundary, one radiance per facet, so the boundary is what is lit.
      vec2 d = p - DISC;
      int k = facetOf(d);
      float mid = 6.2831853 * (float(k) + 0.5) / float(ND);
      float depth = APOTHEM - dot(d, vec2(cos(mid), sin(mid)));
      float rim = 1.0 - smoothstep(0.05, 0.15, depth);
      col = radianceOf(4 * NW + k) * seamDisc(normalize(d)) * rim;
    } else {
      float jit = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
      vec3 g = vec3(0.0);
      for (int k = 0; k < GATHER; k++) {
        float a = 6.2831853 * (float(k) + jit) / float(GATHER);
        g += alongRay(p, vec2(cos(a), sin(a)));
      }
      col = g / float(GATHER);
    }
    fragColor = vec4(pow(col * uExposure, vec3(0.7)), 1.0);
  }
`;

const fieldMat = new THREE.ShaderMaterial({
  glslVersion: THREE.GLSL3,
  uniforms: {
    uRad: { value: radianceTex },
    uMin: { value: new THREE.Vector2(-HALF_W, -ORTHO_H) },
    uMax: { value: new THREE.Vector2(HALF_W, ORTHO_H) },
    uExposure: { value: 0.62 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
  `,
  fragmentShader: FRAG,
});

const fieldScene = new THREE.Scene();
const fieldCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
fieldScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), fieldMat));

const target = new THREE.WebGLRenderTarget(64, 64, {
  // Nearest, not linear: this demo has discretised the transport to linear
  // algebra, so the grid it is computed on should be visible rather than
  // smoothed away.
  minFilter: THREE.NearestFilter,
  magFilter: THREE.NearestFilter,
  depthBuffer: false,
});

const screen = new THREE.Mesh(
  new THREE.PlaneGeometry(2 * HALF_W, 2 * ORTHO_H),
  new THREE.MeshBasicMaterial({ map: target.texture }),
);
screen.position.z = -1;
stage.add(screen);

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/** How many paths are in the live fan, and how densely the union is filled. */
const LIVE_N = 220;
/**
 * Sweep positions and paths per position, in the accumulating panel.
 *
 * These two must not share a factor with each other in a way that lines the
 * sweep up with the spacing of the fan. At 10 steps of 70 paths, each step's
 * offset of 1/10 is exactly seven spacings, so all ten steps redraw the *same*
 * seventy directions and the panel stays a thin fan no matter how long it runs.
 * 18 and 50 interleave to 450 distinct directions, which fills in.
 */
const ACC_STEPS = 40;
const ACC_N = 180;

const LIVE_SEG = LIVE_N * MAX_K;
/**
 * Only the contributing paths are kept on the right, and they are a small
 * fraction of those tried — roughly a tenth, being the share of directions that
 * find the lamp. So the buffer is sized by measurement rather than by the walk
 * count, with headroom.
 */
const ACC_SEG = 24000;

/** Van der Corput in base b — the deterministic stand-in for a random draw. */
function vdc(i: number, b: number): number {
  let f = 1;
  let r = 0;
  let n = i + 1;
  while (n > 0) {
    f /= b;
    r += f * (n % b);
    n = Math.floor(n / b);
  }
  return r;
}
const BASES = [2, 3, 5, 7];

/**
 * A path that reaches nothing emitting is worth nothing, so it is drawn as
 * nothing: black. It stays visible because the room behind it is lit — the
 * background is not decoration, it is what these lines are read against, and it
 * is why the room is rendered at all rather than outlined.
 */
const DARK: [number, number, number] = [0.015, 0.015, 0.02];

interface Buffer {
  pos: Float32Array;
  col: Float32Array;
  count: number;
  geom: LineSegmentsGeometry;
  lines: LineSegments2;
  /** The interleaved buffers three uploads from, so contents can be refreshed. */
  posBuf: THREE.InstancedInterleavedBuffer;
  colBuf: THREE.InstancedInterleavedBuffer;
}

/**
 * Allocated once at full size, then only ever rewritten in place.
 *
 * Calling `setPositions` every frame with a longer array does not work: it
 * swaps in fresh attribute buffers, and three caches `_maxInstanceCount` from
 * the first set-up it saw. A buffer that *grows* therefore stays clamped to
 * whatever it was on the first frame — the accumulating panel drew fifty
 * segments out of eight thousand and looked like a bare fan. The live panel is
 * a constant size, so it never showed the problem.
 *
 * Allocating the whole thing up front and moving only `instanceCount` avoids
 * the reallocation entirely, and is what the buffers are for.
 */
function makeBuffer(maxSeg: number, panelX: number, width: number, opacity: number): Buffer {
  const pos = new Float32Array(maxSeg * 6);
  const col = new Float32Array(maxSeg * 6);
  const geom = new LineSegmentsGeometry();
  geom.setPositions(pos);
  geom.setColors(col);
  const mat = new LineMaterial({ linewidth: width, vertexColors: true, transparent: true, opacity });
  mat.resolution.set(EXPORT_W, EXPORT_H);
  const lines = new LineSegments2(geom, mat);
  lines.frustumCulled = false;
  lines.position.set(panelX, PANEL_Y, 0.05);
  stage.add(lines);
  return {
    pos,
    col,
    count: 0,
    geom,
    lines,
    posBuf: (geom.attributes.instanceStart as THREE.InterleavedBufferAttribute)
      .data as THREE.InstancedInterleavedBuffer,
    colBuf: (geom.attributes.instanceColorStart as THREE.InterleavedBufferAttribute)
      .data as THREE.InstancedInterleavedBuffer,
  };
}

/** Push the written range to the GPU and limit the draw to it. */
function commit(buf: Buffer): void {
  buf.posBuf.needsUpdate = true;
  buf.colBuf.needsUpdate = true;
  buf.geom.instanceCount = buf.count;
}

const live = makeBuffer(LIVE_SEG, PANEL_X[0], 1.5, 0.95);
const accum = makeBuffer(ACC_SEG, PANEL_X[1], 1.4, 1);
// Contributions add. Overlapping paths reinforcing is the sum being drawn, not
// an artefact — and it is what makes a weak path fade into the room instead of
// turning black, which is the wrong reading entirely.
accum.lines.material.blending = THREE.AdditiveBlending;
accum.lines.material.depthWrite = false;

function push(buf: Buffer, x1: number, y1: number, x2: number, y2: number, c: number[]): void {
  if (buf.count * 6 + 5 >= buf.pos.length) return;
  const o = buf.count * 6;
  buf.pos[o] = x1;
  buf.pos[o + 1] = y1;
  buf.pos[o + 2] = 0;
  buf.pos[o + 3] = x2;
  buf.pos[o + 4] = y2;
  buf.pos[o + 5] = 0;
  buf.col[o] = c[0];
  buf.col[o + 1] = c[1];
  buf.col[o + 2] = c[2];
  buf.col[o + 3] = c[0];
  buf.col[o + 4] = c[1];
  buf.col[o + 5] = c[2];
  buf.count++;
}

const chainX = new Float64Array(MAX_K + 1);
const chainY = new Float64Array(MAX_K + 1);
const litCol: [number, number, number] = [0, 0, 0];

/**
 * One path of length k, from p₀, with direction choices `u`.
 *
 * Cosine-distributed about each normal: in the plane that is θ = asin(2u − 1)
 * from the normal, which is the Lambertian measure itself. Sampling it means the
 * path's weight is just the product of albedos, with no correcting factor — so
 * the colour on screen really is everything the path carries.
 */
function walk(
  buf: Buffer,
  k: number,
  u: (j: number) => number,
  gain: number,
  litOnly: boolean,
  weightByLight = false,
): void {
  let px = P0.x;
  let py = P0.y;
  let nx = P0.nx;
  let ny = P0.ny;
  const a0 = ALBEDO_RGB[P0.mat];
  let tr = a0[0];
  let tg = a0[1];
  let tb = a0[2];
  chainX[0] = px;
  chainY[0] = py;

  for (let j = 0; j < k; j++) {
    const theta = Math.asin(Math.min(1, Math.max(-1, 2 * u(j) - 1)));
    const base = Math.atan2(ny, nx);
    const a = base + theta;
    const hit = trace(px, py, Math.cos(a), Math.sin(a));
    if (!hit) return;
    chainX[j + 1] = hit.x;
    chainY[j + 1] = hit.y;

    if (j + 1 === k) {
      // The accumulating panel keeps only what contributes. A chain that ends
      // anywhere but the lamp is worth exactly zero, so it is not part of the
      // sum — drawing it there would show the space rather than the measure,
      // and the space is the other panel's job.
      if (litOnly && !hit.emits) return;
      let col: number[] = DARK;
      if (hit.emits) {
        const r = tr * EMIT_RGB[0];
        const g = tg * EMIT_RGB[1];
        const b = tb * EMIT_RGB[2];
        if (weightByLight) {
          // Drawn additively, so a path's strength *is* how much it adds. A
          // faint one contributes almost nothing to the pixel and disappears
          // into the room; a strong one glows; and where many overlap they build
          // up — which is the sum this panel is drawing, done by the blend
          // rather than asserted.
          //
          // Divided by the number of sweep positions so the panel's brightness
          // reports the light rather than how finely the sweep was sampled:
          // without it, doubling the sampling doubles the glow.
          litCol[0] = (r * gain) / ACC_STEPS;
          litCol[1] = (g * gain) / ACC_STEPS;
          litCol[2] = (b * gain) / ACC_STEPS;
        } else {
          litCol[0] = Math.min(r * gain, 1);
          litCol[1] = Math.min(g * gain, 1);
          litCol[2] = Math.min(b * gain, 1);
        }
        col = litCol;
      }
      for (let s = 0; s < k; s++) {
        push(buf, chainX[s], chainY[s], chainX[s + 1], chainY[s + 1], col);
      }
      return;
    }

    const m = ALBEDO_RGB[hit.mat];
    tr *= m[0];
    tg *= m[1];
    tb *= m[2];
    px = hit.x;
    py = hit.y;
    nx = hit.nx;
    ny = hit.ny;
  }
}

/**
 * The live fan at sweep position s, and everything swept so far.
 *
 * The first direction carries the sweep — it is the point of p₀'s circle of
 * directions that the whole family is hanging from — while the later choices are
 * fixed per path index, so the fan drifts rigidly instead of reshuffling.
 *
 * The accumulation is recomputed from (k, s) rather than carried across frames.
 * It has to be: the exporter sets t to arbitrary values, and anything
 * incremental would come out different from the preview.
 */
function buildPaths(k: number, s: number, gain: number): void {
  live.count = 0;
  for (let i = 0; i < LIVE_N; i++) {
    walk(
      live,
      k,
      (j) => (j === 0 ? ((i + 0.5) / LIVE_N + s) % 1 : vdc(i, BASES[j % BASES.length])),
      gain,
      false,
    );
  }
  commit(live);

  accum.count = 0;
  for (let kk = 1; kk <= k; kk++) {
    const steps = kk < k ? ACC_STEPS : Math.max(1, Math.ceil(s * ACC_STEPS));
    for (let st = 0; st < steps; st++) {
      const ss = st / ACC_STEPS;
      for (let i = 0; i < ACC_N; i++) {
        walk(
          accum,
          kk,
          (j) => (j === 0 ? ((i + 0.5) / ACC_N + ss) % 1 : vdc(i, BASES[j % BASES.length])),
          gain,
          true,
          true,
        );
      }
    }
  }
  commit(accum);
}

// p₀, marked on both panels.
for (const px of PANEL_X) {
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.055, 20), flat(C.bone));
  dot.position.set(px + P0.x, PANEL_Y + P0.y, 0.1);
  stage.add(dot);
}

// ---------------------------------------------------------------------------
// Formulas, bars
// ---------------------------------------------------------------------------

const ADV: Record<string, number> = { T: 0.61, E: 0.64, '+': 0.7, '.': 0.27 };
const advance = (s: string) => [...s].reduce((w, c) => w + (ADV[c] ?? 0.5), 0);
const SUP_SCALE = 0.62;
const SUP_RISE = 0.42;
const OP_PAD = 0.18;
const FORMULA_Y = PANEL_Y + RY + 0.42;

interface Piece {
  text: string;
  sup?: boolean;
  op?: boolean;
}

function termPieces(k: number): Piece[] {
  if (k === 0) return [{ text: 'E' }];
  if (k === 1) return [{ text: 'TE' }];
  return [{ text: 'T' }, { text: String(k), sup: true }, { text: 'E' }];
}

function formulaRow(centreX: number, size: number, color: number, slots: number) {
  const pool = Array.from({ length: slots }, () => {
    const base = label('', { size, color, anchorY: 'middle' });
    const sup = label('', { size: size * SUP_SCALE, color, anchorY: 'middle' });
    base.visible = false;
    sup.visible = false;
    stage.add(base, sup);
    return { base, sup };
  });
  return {
    set(pieces: Piece[]): void {
      const pad = pieces.map((p) => (p.op ? OP_PAD * size : 0));
      const widths = pieces.map(
        (p, i) => advance(p.text) * size * (p.sup ? SUP_SCALE : 1) + 2 * pad[i],
      );
      let x = centreX - widths.reduce((a, b) => a + b, 0) / 2;
      pieces.forEach((p, i) => {
        const slot = pool[i];
        if (!slot) return;
        const t = p.sup ? slot.sup : slot.base;
        const other = p.sup ? slot.base : slot.sup;
        setText(t, p.text);
        t.position.set(x + pad[i], FORMULA_Y + (p.sup ? size * SUP_RISE : 0), 0);
        t.visible = true;
        other.visible = false;
        x += widths[i];
      });
      for (let i = pieces.length; i < pool.length; i++) {
        pool[i].base.visible = false;
        pool[i].sup.visible = false;
      }
    },
  };
}

const leftFormula = formulaRow(PANEL_X[0], 0.32, C.ochre, 4);
const rightFormula = formulaRow(PANEL_X[1], 0.28, C.bone, 24);

const BAR_X0 = -1.5;
const BAR_X1 = 1.5;
const BAR_BASE = -2.5;
const BAR_H = 0.55;
const barW = ((BAR_X1 - BAR_X0) / MAX_K) * 0.55;

stage.add(
  polyline([[BAR_X0 - 0.15, BAR_BASE, 0], [BAR_X1 + 0.15, BAR_BASE, 0]], {
    color: C.slateDeep,
    width: 2,
  }),
  label('the terms', {
    size: 0.16,
    color: C.slate,
    anchorX: 'right',
    anchorY: 'middle',
    position: [BAR_X0 - 0.28, BAR_BASE + 0.18, 0],
  }),
);

const barGeom = new THREE.PlaneGeometry(barW, 1);
barGeom.translate(0, 0.5, 0);
const bars = Array.from({ length: MAX_K }, (_, k) => {
  const m = new THREE.Mesh(barGeom, flat(C.ochre));
  m.position.set(BAR_X0 + ((BAR_X1 - BAR_X0) * (k + 0.5)) / MAX_K, BAR_BASE, 0);
  m.scale.set(1, 1e-6, 1);
  stage.add(m);
  return m;
});

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

const params = {
  run: true,
  k: 2,
  sweep: 0.5,
  albedo: 0.78,
  emission: 1.15,
  gain: 2.6,
  background: 0.62,
  resolution: 0.4,
};
ui.params.add(params, 'run').name('step through lengths');
ui.params.add(params, 'k', 1, MAX_K, 1).name('path length');
ui.params.add(params, 'sweep', 0, 1, 0.001).name('sweep (when held)');
ui.params.add(params, 'albedo', 0.2, 1, 0.01).name('albedo (= c)');
ui.params.add(params, 'emission', 0, 4, 0.05).name('emission');
ui.params.add(params, 'gain', 0.5, 8, 0.1).name('brightness of lit paths');
ui.params.add(params, 'background', 0, 1.2, 0.02).name('room brightness');
ui.params.add(params, 'resolution', 0.15, 1, 0.05).name('render resolution');

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

const bufSize = new THREE.Vector2();
let materialKey = '';
let lastKey = '';

stage.frame((t) => {
  const u = stage.duration > 0 ? (t % stage.duration) / stage.duration : 0;

  const k = params.run ? Math.min(MAX_K, 1 + Math.floor(u * MAX_K)) : Math.round(params.k);
  const s = params.run ? (u * MAX_K) % 1 : params.sweep;

  const mkey = `${params.albedo}|${params.emission}`;
  if (mkey !== materialKey) {
    materialKey = mkey;
    refreshMaterials(params.albedo, params.emission);
    solveField();
    for (let i = 0; i < M; i++) {
      const o = i * 4;
      radianceData[o] = solved[3 * i];
      radianceData[o + 1] = solved[3 * i + 1];
      radianceData[o + 2] = solved[3 * i + 2];
      radianceData[o + 3] = 1;
    }
    radianceTex.needsUpdate = true;
  }

  // The sweep is quantised, or the deep buffer would be rebuilt every frame for
  // a motion finer than a line width.
  const sq = Math.round(s * 40) / 40;
  const key = `${k}|${sq}|${mkey}|${params.gain}`;
  if (key !== lastKey) {
    lastKey = key;
    buildPaths(k, sq, params.gain);
    leftFormula.set(termPieces(k));

    const sum: Piece[] = [];
    for (let j = 0; j <= k; j++) {
      if (j > 0) sum.push({ text: '+', op: true });
      sum.push(...termPieces(j));
    }
    rightFormula.set(sum);

    const top = Math.max(termSize[1], 1e-12);
    for (let j = 0; j < MAX_K; j++) {
      const v = j + 1 <= k ? termSize[j + 1] / top : 0;
      bars[j].scale.set(1, Math.max(v * BAR_H, 1e-6), 1);
      bars[j].visible = j + 1 <= k;
    }
  }

  fieldMat.uniforms.uExposure.value = params.background;

  stage.renderer.getDrawingBufferSize(bufSize);
  const fw = Math.max(64, Math.round(bufSize.x * params.resolution));
  const fh = Math.max(36, Math.round(bufSize.y * params.resolution));
  if (target.width !== fw || target.height !== fh) target.setSize(fw, fh);

  const prev = stage.renderer.getRenderTarget();
  stage.renderer.setRenderTarget(target);
  stage.renderer.render(fieldScene, fieldCam);
  stage.renderer.setRenderTarget(prev);
});

stage.start();
