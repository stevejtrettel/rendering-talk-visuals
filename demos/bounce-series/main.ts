/**
 * The light field is a geometric series.
 *
 * Part V inverts the equilibrium equation. Once the source is separated the
 * problem is linear, (Id − T)L = E, and every round loses energy, so ‖T‖ ≤ c < 1
 * and the inverse is a series:
 *
 *     L = (Id − T)^{-1} E = E + TE + T²E + T³E + ⋯
 *
 * This demo is that line, rendered. The left room shows one term on its own; the
 * right room shows the sum so far. Step the index and the left room goes dark
 * while the right room stops changing — which is what convergence looks like
 * when you can see it.
 *
 * ## Why the terms are the interesting panel
 *
 * The n-th term is the light that has scattered exactly n times, so the series
 * is not a numerical trick laid over the physics — it is the physics sorted by
 * bounce count. Term 0 is the lamp alone, a black room with a glowing strip.
 * Term 1 is everything the lamp can see. Term 2 is the first light that has
 * touched a wall on the way, which is where the coloured walls bleed onto the
 * neutral floor and the shadow behind the object stops being black.
 *
 * **This is where paths come from.** Nothing in Parts I–IV mentions a path;
 * expanding the inverse into powers of T is what produces them, and the n-th
 * term is an integral over chains of n vertices. The demo is the last picture
 * before that becomes a space.
 *
 * ## Honest exposure
 *
 * Both rooms are rendered at the *same* exposure, so the term panel really does
 * fade towards black as n grows. That fading is the argument — turn on
 * `normalise the term` to see the shape of a late bounce instead, but then the
 * decay is hidden and only the bar chart still shows it.
 *
 * The bars are the term magnitudes, and they fall geometrically. Their ratio
 * settles to the operator's spectral radius, which is *strictly below* the
 * albedo rather than equal to it — with the row sums normalised to one, ‖T‖∞ is
 * exactly the largest albedo in the room, so the `albedo` slider is an upper
 * bound on the rate and the contraction constant c of the slide. The observed
 * ratio is smaller because energy also escapes into the darker materials on the
 * way round. At c = 1 nothing is absorbed, the series stops converging, and the
 * sum readout climbs without settling.
 *
 * ## The room is a real operator
 *
 * As in `fixed-point` and `light-dies-out`, the boundary is cut into patches, a
 * light field is a vector, and T is a matrix — patch-to-patch transport with a
 * real visibility test, scaled by albedo. In 2D the kernel between boundary
 * elements is cos θᵢ cos θⱼ / (2r) ds. Row sums should be 1, come out within a
 * percent of it, and are then normalised to exactly 1 so the discretisation
 * neither creates nor destroys energy. Nothing here is an animation standing in
 * for a computation.
 *
 * Those three demos each keep their own copy of this machinery, deliberately:
 * each wants a differently tuned room, and a shared one would have to be
 * parameterised into something harder to read than the duplication.
 *
 * ## Iterations, not seconds
 *
 * The counter steps and the picture jumps. The index counts scatterings, not
 * time — the model is stationary, and summing the series is how the field is
 * *found*, not something the room does.
 */

import * as THREE from 'three';
import { createStage, createUI, C, flat } from '@';
import { polyline } from '@/lines';
import { label, setText, fixed } from '@/text';

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
stage.duration = 18;

const ui = createUI(stage);

// ---------------------------------------------------------------------------
// The room
// ---------------------------------------------------------------------------

const RX = 1.8;
const RY = 1.55;
const WALL = 0.14;
/**
 * Set low and to the right, so it casts a clear shadow into the left corner.
 * That corner is black at term 1 and only fills in at term 2 — the single
 * clearest reading of "this light has bounced".
 */
const DISC = { x: -0.551, y: -0.6, r: 0.5 };

const NW = 36;
/**
 * Facets around the object. Coarse on purpose: it is a polygon, not a circle
 * drawn coarsely, and at 16 you can count them. The form factors, the visibility
 * tests and the ray casts all use these same flat facets, so the hard-edged look
 * is the truth rather than a drawing trick.
 */
const ND = 16;
const M = 4 * NW + ND;

/** Half-width of the emitting strip on the ceiling. */
const EMIT_HALF = 0.45;

const PANEL_X = [-2.1, 2.1];
const PANEL_Y = 0.45;

// ---------------------------------------------------------------------------
// Colours, from the same spectra as the rest of the deck
// ---------------------------------------------------------------------------

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
 * Saturated side walls against a neutral floor and ceiling. The bleeding is the
 * whole point of the second term, and a coloured floor would hide it — you
 * cannot see red light landing on a red floor.
 */
const ALBEDO_RGB = [
  toRGB(() => 0.62), // 0 floor, neutral
  toRGB((l) => 0.05 + 0.92 * bell(l, 645, 46)), // 1 right wall, rust
  toRGB(() => 0.6), // 2 ceiling, neutral
  toRGB((l) => 0.05 + 0.88 * bell(l, 545, 42)), // 3 left wall, moss
  toRGB(() => 0.66), // 4 the object, neutral
];

const peakPlanck = (() => {
  let p = 1e-9;
  for (let i = 0; i <= NS; i++) p = Math.max(p, planck(wavelength(i), 3400));
  return p;
})();
const EMIT_RGB = toRGB((l) => planck(l, 3400) / peakPlanck);

// ---------------------------------------------------------------------------
// Patches
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

// Walls, in the order the shader indexes them: floor, right, ceiling, left.
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

/** Does the segment between two boundary points pass through the object? */
function blocked(a: Patch, b: Patch): boolean {
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

// ---------------------------------------------------------------------------
// The operator
// ---------------------------------------------------------------------------

const F = new Float32Array(M * M);
let rowSumError = 0;

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
      if (blocked(a, b)) continue;
      const f = (ci * cj * b.ds) / (2 * r);
      F[i * M + j] = f;
      sum += f;
    }
    rowSumError = Math.max(rowSumError, Math.abs(sum - 1));
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

/**
 * One application of T alone — travel and scatter, with no emission added.
 *
 * This is the difference between this demo and `fixed-point`, which iterates
 * the affine map L ↦ E + TL. The series wants the pure operator: its n-th term
 * is TⁿE, so E is applied once at the start and never again.
 */
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

/** How many terms the loop steps through. */
const MAX_N = 8;

const term = new Float32Array(M * 3);
const scratch = new Float32Array(M * 3);
const partial = new Float32Array(M * 3);
const limit = new Float32Array(M * 3);
/** Mean radiance of each term, for the bar chart. */
const termSize: number[] = [];

const meanOf = (v: Float32Array) => {
  let s = 0;
  for (let i = 0; i < M; i++) s += (v[3 * i] + v[3 * i + 1] + v[3 * i + 2]) / 3;
  return s / M;
};

/**
 * The same average over everything that is *not* the lamp.
 *
 * This is what the "of the limit" readout uses, and the distinction matters at
 * term 0: the emitting patches are by far the brightest thing in the room, so
 * including them would score the lamp on its own at better than half the answer.
 * What the reader wants to know is how much of the room's *illumination* is in
 * hand, and by that measure the lamp alone is worth nothing at all — which is
 * both true and the reason there is a series to sum.
 */
const REFLECTING = patches.reduce((n, p) => n + (p.emits ? 0 : 1), 0);
const meanReflected = (v: Float32Array) => {
  let s = 0;
  for (let i = 0; i < M; i++) {
    if (patches[i].emits) continue;
    s += (v[3 * i] + v[3 * i + 1] + v[3 * i + 2]) / 3;
  }
  return s / REFLECTING;
};

/**
 * Sum the series up to n, from scratch.
 *
 * Recomputed rather than carried forward, so the state is a pure function of
 * the controls and of t — which is what lets the exporter jump to any frame and
 * get the same picture as the preview.
 */
function sumTo(n: number): void {
  term.set(emission);
  partial.set(emission);
  termSize.length = 0;
  termSize.push(meanOf(term));
  for (let k = 1; k <= n; k++) {
    scatter(term, scratch);
    term.set(scratch);
    for (let i = 0; i < M * 3; i++) partial[i] += term[i];
    termSize.push(meanOf(term));
  }
}

/** The limit of the series, for the "how far along" readout. */
function solveLimit(): void {
  limit.set(emission);
  const a = new Float32Array(M * 3);
  const b = new Float32Array(M * 3);
  a.set(emission);
  // Far past anything the demo displays; at any albedo below 1 this is settled.
  for (let k = 0; k < 160; k++) {
    scatter(a, b);
    for (let i = 0; i < M * 3; i++) limit[i] += b[i];
    a.set(b);
  }
}

// ---------------------------------------------------------------------------
// The renderer
// ---------------------------------------------------------------------------

const radianceData = new Float32Array(M * 2 * 4);
const radianceTex = new THREE.DataTexture(radianceData, M, 2, THREE.RGBAFormat, THREE.FloatType);
radianceTex.minFilter = THREE.NearestFilter;
radianceTex.magFilter = THREE.NearestFilter;
radianceTex.needsUpdate = true;

const FRAG = /* glsl */ `
  precision highp float;
  layout(location = 0) out vec4 fragColor;

  uniform sampler2D uRad;
  uniform vec2 uMin;
  uniform vec2 uMax;
  uniform vec2 uExposure;

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
  const int GATHER = 64;

  int patchOfWall(vec2 q) {
    if (q.y <= -RY + 1e-3) return int(clamp(floor((q.x + RX) / (2.0 * RX) * float(NW)), 0.0, float(NW - 1)));
    if (q.x >= RX - 1e-3) return NW + int(clamp(floor((q.y + RY) / (2.0 * RY) * float(NW)), 0.0, float(NW - 1)));
    if (q.y >= RY - 1e-3) return 2 * NW + int(clamp(floor((RX - q.x) / (2.0 * RX) * float(NW)), 0.0, float(NW - 1)));
    return 3 * NW + int(clamp(floor((RY - q.y) / (2.0 * RY) * float(NW)), 0.0, float(NW - 1)));
  }

  /** Darken the last sliver of a patch, so the tiling is visible. */
  float seam(float f) {
    return 0.45 + 0.55 * smoothstep(0.0, 0.09, min(f, 1.0 - f));
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

  vec3 radianceOf(int idx, float row) {
    return texture(uRad, vec2((float(idx) + 0.5) / float(M), row)).rgb;
  }

  vec3 alongRay(vec2 p, vec2 dir, float row) {
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

    return idx < 0 ? vec3(0.0) : radianceOf(idx, row);
  }

  void main() {
    vec2 wp = mix(uMin, uMax, vUv);
    int idx = wp.x < ${((PANEL_X[0] + PANEL_X[1]) / 2).toFixed(4)} ? 0 : 1;
    float px = idx == 0 ? ${PANEL_X[0].toFixed(4)} : ${PANEL_X[1].toFixed(4)};
    float row = idx == 0 ? 0.25 : 0.75;
    float expo = idx == 0 ? uExposure.x : uExposure.y;
    vec2 p = wp - vec2(px, ${PANEL_Y.toFixed(4)});

    if (abs(p.x) > RX + WALL || abs(p.y) > RY + WALL) {
      fragColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }

    vec3 col;
    if (abs(p.x) > RX || abs(p.y) > RY) {
      vec2 q = vec2(clamp(p.x, -RX, RX), clamp(p.y, -RY, RY));
      col = radianceOf(patchOfWall(q), row) * seamWall(q);
    } else if (insidePoly(p)) {
      // A tiled rim over a dark body: what is discretised is the light field on
      // the boundary, one radiance per facet, so the boundary is what is lit.
      vec2 d = p - DISC;
      int k = facetOf(d);
      float mid = 6.2831853 * (float(k) + 0.5) / float(ND);
      float depth = APOTHEM - dot(d, vec2(cos(mid), sin(mid)));
      float rim = 1.0 - smoothstep(0.05, 0.15, depth);
      col = radianceOf(4 * NW + k, row) * seamDisc(normalize(d)) * rim;
    } else {
      float jit = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
      vec3 g = vec3(0.0);
      for (int k = 0; k < GATHER; k++) {
        float a = 6.2831853 * (float(k) + jit) / float(GATHER);
        g += alongRay(p, vec2(cos(a), sin(a)), row);
      }
      col = g / float(GATHER);
    }

    fragColor = vec4(pow(col * expo, vec3(0.7)), 1.0);
  }
`;

const fieldMat = new THREE.ShaderMaterial({
  glslVersion: THREE.GLSL3,
  uniforms: {
    uRad: { value: radianceTex },
    uMin: { value: new THREE.Vector2(-HALF_W, -ORTHO_H) },
    uMax: { value: new THREE.Vector2(HALF_W, ORTHO_H) },
    uExposure: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
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
// Labels and the bar chart
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Formulas
// ---------------------------------------------------------------------------

/**
 * Exponents, set as real raised type.
 *
 * The vendored font is a Latin subset with no superscript glyphs, so `T²E`
 * would come out with a hole in it. Each exponent is therefore its own label at
 * a smaller size, lifted off the baseline — which is what a typesetter would do
 * anyway, and it means any exponent works rather than just the handful Unicode
 * happens to provide.
 *
 * Laying that out needs advance widths, and troika only knows them after an
 * async sync. So the widths are tabulated here for the dozen characters a
 * formula in this demo can contain. They are in em, measured against the
 * rendered text; a few percent of drift would only shift a centred formula by a
 * hair, and nothing here is set solid against anything else.
 */
const ADV: Record<string, number> = {
  T: 0.61,
  E: 0.64,
  // Wide, as maths-set plus signs are. Under-measuring it is visible: the glyph
  // overruns its box and the row reads "E +TE", with the space piling up on one
  // side of the operator and none on the other.
  '+': 0.7,
  ' ': 0.25,
  '.': 0.27,
};
const advance = (s: string) => [...s].reduce((w, c) => w + (ADV[c] ?? 0.5), 0);

const SUP_SCALE = 0.62;
const SUP_RISE = 0.42;
/**
 * Space either side of an operator, in em.
 *
 * Padding rather than spaces inside the string: troika trims whitespace at the
 * edges of a run, so ' + ' comes out hugging whatever follows it and the row
 * reads "E +TE". Reserving the space in the layout instead puts it where it was
 * asked for, on both sides.
 */
const OP_PAD = 0.18;

interface Piece {
  text: string;
  sup?: boolean;
  /** An operator: gets breathing room either side. */
  op?: boolean;
}

/** T to the k, applied to E — written the way it is said. */
function termPieces(k: number): Piece[] {
  if (k === 0) return [{ text: 'E' }];
  if (k === 1) return [{ text: 'TE' }];
  return [{ text: 'T' }, { text: String(k), sup: true }, { text: 'E' }];
}

/**
 * A row of pieces, centred, drawn from a pool so the labels are made once.
 * Anything unused is parked invisible rather than rebuilt.
 */
function formulaRow(centreX: number, y: number, size: number, color: number, slots: number) {
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
        t.position.set(x + pad[i], y + (p.sup ? size * SUP_RISE : 0), 0);
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

/** The equations title their own rooms, from above. */
const FORMULA_Y = PANEL_Y + RY + 0.42;

const termFormula = formulaRow(PANEL_X[0], FORMULA_Y, 0.32, C.ochre, 4);
const sumFormula = formulaRow(PANEL_X[1], FORMULA_Y, 0.28, C.bone, 40);

// The only words left: how far along the sum has got. The left room needs no
// caption — its equation says which term it is, and that is the whole label.
const sumCaption = label('', {
  size: 0.19,
  color: C.ash,
  anchorX: 'center',
  position: [PANEL_X[1], -RY - 0.06, 0],
});
stage.add(sumCaption);

// The bar chart: the term magnitudes, falling like c^n.
const BAR_X0 = -2.35;
const BAR_X1 = 2.35;
const BAR_BASE = -2.36;
const BAR_H = 0.7;
const barW = ((BAR_X1 - BAR_X0) / (MAX_N + 1)) * 0.62;

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
    position: [BAR_X0 - 0.28, BAR_BASE + 0.2, 0],
  }),
);

const barGeom = new THREE.PlaneGeometry(barW, 1);
barGeom.translate(0, 0.5, 0);
const bars = Array.from({ length: MAX_N + 1 }, (_, k) => {
  const m = new THREE.Mesh(barGeom, flat(C.ochre));
  m.position.set(BAR_X0 + ((BAR_X1 - BAR_X0) * (k + 0.5)) / (MAX_N + 1), BAR_BASE, 0);
  m.scale.set(1, 1e-6, 1);
  stage.add(m);
  return m;
});

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

const params = {
  run: true,
  n: 3,
  albedo: 0.78,
  emission: 1.7,
  exposure: 1.15,
  normalise: false,
  resolution: 0.45,
};
ui.params.add(params, 'run').name('step through terms');
ui.params.add(params, 'n', 0, MAX_N, 1).name('term');
ui.params.add(params, 'albedo', 0.2, 1, 0.01).name('albedo (= c)');
ui.params.add(params, 'emission', 0, 4, 0.05).name('emission');
ui.params.add(params, 'exposure', 0.2, 3, 0.05).name('exposure');
ui.params.add(params, 'normalise').name('normalise the term');
ui.params.add(params, 'resolution', 0.15, 1, 0.05).name('render resolution');

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

const bufSize = new THREE.Vector2();
let lastKey = '';
let termExposure = 1;

stage.frame((t) => {
  const u = stage.duration > 0 ? (t % stage.duration) / stage.duration : 0;

  // Discrete steps, held: the counter is a term index, not a clock.
  const n = params.run ? Math.min(MAX_N, Math.floor(u * (MAX_N + 1))) : Math.round(params.n);

  const key = `${n}|${params.albedo}|${params.emission}|${params.normalise}`;
  if (key !== lastKey) {
    lastKey = key;
    refreshMaterials(params.albedo, params.emission);
    solveLimit();
    sumTo(n);

    for (let i = 0; i < M; i++) {
      const o = i * 4;
      radianceData[o] = term[3 * i];
      radianceData[o + 1] = term[3 * i + 1];
      radianceData[o + 2] = term[3 * i + 2];
      radianceData[o + 3] = 1;
      const p = (M + i) * 4;
      radianceData[p] = partial[3 * i];
      radianceData[p + 1] = partial[3 * i + 1];
      radianceData[p + 2] = partial[3 * i + 2];
      radianceData[p + 3] = 1;
    }
    radianceTex.needsUpdate = true;

    // Lifting a late term back to a readable brightness, when asked. Off by
    // default: the term panel going dark is the argument.
    termExposure = params.normalise ? Math.min(termSize[0] / Math.max(termSize[n], 1e-6), 400) : 1;

    termFormula.set(termPieces(n));

    // Written out in full while it fits, then elided in the middle. Five terms
    // is where the row starts reaching past its own panel.
    const sum: Piece[] = [];
    if (n <= 4) {
      for (let k = 0; k <= n; k++) {
        if (k > 0) sum.push({ text: '+', op: true });
        sum.push(...termPieces(k));
      }
    } else {
      for (let k = 0; k <= 2; k++) {
        if (k > 0) sum.push({ text: '+', op: true });
        sum.push(...termPieces(k));
      }
      sum.push({ text: '+', op: true }, { text: '...' }, { text: '+', op: true });
      sum.push(...termPieces(n));
    }
    sumFormula.set(sum);

    const reached = meanReflected(partial) / Math.max(meanReflected(limit), 1e-9);
    setText(sumCaption, `${fixed(100 * reached, 1)}% of the limit`);

    const top = Math.max(termSize[0], 1e-9);
    for (let k = 0; k <= MAX_N; k++) {
      const v = k <= n ? termSize[k] / top : 0;
      bars[k].scale.set(1, Math.max(v * BAR_H, 1e-6), 1);
      bars[k].visible = k <= n;
    }
  }

  fieldMat.uniforms.uExposure.value.set(params.exposure * termExposure, params.exposure);

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

console.info(`bounce-series: worst row-sum error before normalising ${rowSumError.toFixed(4)}`);
