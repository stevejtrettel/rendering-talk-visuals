/**
 * The set of paths depends on where you stand.
 *
 * The same construction as `bidirectional` — a chain grown from p, a chain grown
 * from the lamp, and every pairing between them tested for visibility — but with
 * the building taken out. What is on screen is only ever the finished set: the
 * two chains, and the connections that survived.
 *
 * Then p moves, and the set reorganises.
 *
 * ## What that shows that the animated version cannot
 *
 * In `bidirectional` the answer is assembled once and stands still, so the
 * natural reading is that *this* is the set of paths. It is not. It is the set
 * of paths **for that root**, and the root was a choice. Sliding p turns the
 * answer into a function of where you asked, which is what
 *
 *     Omega(p) = the paths rooted at p
 *
 * says and what a single frame can never say.
 *
 * ## Watch the connections snap
 *
 * A connection does not dim as it fails — it is there and then it is not,
 * because visibility is a condition on the domain rather than a factor in the
 * integrand. As p slides behind the object, whole fans of connections go out at
 * once and different ones arrive. The popping is not an artefact to smooth away;
 * it is the boundary of the region being crossed, and it is the clearest look at
 * "visibility is the domain" anywhere in the deck.
 *
 * Nothing else varies. The lamp's chain is held fixed, so everything that
 * changes is attributable to the end that moved.
 */

import * as THREE from 'three';
import { createStage, createUI, C, flat } from '@';
import { polyline, setPolyline } from '@/lines';
import { label, setText } from '@/text';

const ORTHO_H = 2.2;
const HALF_W = (ORTHO_H * 16) / 9;

const stage = createStage({
  camera: 'ortho',
  position: [0, 0, 10],
  target: [0, 0, 0],
  orthoHeight: ORTHO_H,
  lights: false,
  controls: false,
});
stage.duration = 22;

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

/** One room, set left, with the right of the frame kept for the readout. */
const PANEL_X = [-1.28];
const PANEL_Y = 0.06;

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


const solved = new Float32Array(M * 3);

/** Where the paths start: on the floor, left of the object. */
// Clear of the object, which sits at x = -0.55 with radius 0.5 and would
// otherwise be directly overhead — every path would start in its shadow.
// Off to one side instead, so the sweep sends paths past it, onto it, and up
// to the emitter.
const P0 = { x: 0.7, y: -RY, nx: 0, ny: 1, mat: 0 };

/** Sum the series to convergence — only the finished field is wanted here. */
function solveField(): void {
  const a = new Float32Array(M * 3);
  const b = new Float32Array(M * 3);
  a.set(emission);
  solved.set(emission);
  for (let k = 1; k < 120; k++) {
    scatter(a, b);
    a.set(b);
    for (let i = 0; i < M * 3; i++) solved[i] += b[i];
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
    vec2 p = wp - vec2(${PANEL_X[0].toFixed(4)}, ${PANEL_Y.toFixed(4)});

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
// The two chains
// ---------------------------------------------------------------------------

const EYE_N = 6;
const LIGHT_N = 6;
const ROOM_X = PANEL_X[0];

interface Vertex {
  x: number;
  y: number;
  nx: number;
  ny: number;
  mat: number;
}

/** Van der Corput in base b — a deterministic stand-in for a random draw. */
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

/** A direction cosine-distributed about a normal — the Lambertian measure. */
function dirFrom(nx: number, ny: number, u: number): { dx: number; dy: number } {
  const theta = Math.asin(Math.min(1, Math.max(-1, 2 * u - 1)));
  const a = Math.atan2(ny, nx) + theta;
  return { dx: Math.cos(a), dy: Math.sin(a) };
}

const eyeChain: Vertex[] = [];
const lightChain: Vertex[] = [];

/**
 * Grow both chains, from a root that can move.
 *
 * The direction choices are a fixed sequence *relative to each normal*, so as
 * the root slides the whole chain deforms continuously rather than being redrawn
 * — which is what makes the sweep read as one configuration changing instead of
 * a slideshow of unrelated ones. The lamp's chain does not depend on the root at
 * all, so it stands still and everything that moves is attributable to p.
 */
function growChains(rootX: number, aim: number, seed: number): void {
  eyeChain.length = 0;
  lightChain.length = 0;

  {
    let v: Vertex = { x: rootX, y: -RY, nx: 0, ny: 1, mat: 0 };
    eyeChain.push(v);
    for (let j = 0; j < EYE_N; j++) {
      const u = j === 0 ? aim : (vdc(j - 1, 2) + seed) % 1;
      const { dx, dy } = dirFrom(v.nx, v.ny, u);
      const hit = trace(v.x, v.y, dx, dy);
      if (!hit) break;
      v = { x: hit.x, y: hit.y, nx: hit.nx, ny: hit.ny, mat: hit.mat };
      eyeChain.push(v);
    }
  }

  {
    const lx = (2 * ((seed * 1.618) % 1) - 1) * EMIT_HALF * 0.85;
    let v: Vertex = { x: lx, y: RY, nx: 0, ny: -1, mat: 2 };
    lightChain.push(v);
    for (let j = 0; j < LIGHT_N - 1; j++) {
      const { dx, dy } = dirFrom(v.nx, v.ny, (vdc(j, 3) + seed * 0.7) % 1);
      const hit = trace(v.x, v.y, dx, dy);
      if (!hit) break;
      v = { x: hit.x, y: hit.y, nx: hit.nx, ny: hit.ny, mat: hit.mat };
      lightChain.push(v);
    }
  }
}

// ---------------------------------------------------------------------------
// The connections
// ---------------------------------------------------------------------------

/** Is the straight run between two boundary points clear of the object? */
function segmentClear(ax: number, ay: number, bx: number, by: number): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  if (Math.hypot(dx, dy) < 1e-9) return false;
  for (let k = 0; k < ND; k++) {
    const f0 = (2 * Math.PI * k) / ND;
    const f1 = (2 * Math.PI * (k + 1)) / ND;
    const px = DISC.x + DISC.r * Math.cos(f0);
    const py = DISC.y + DISC.r * Math.sin(f0);
    const ex = DISC.r * (Math.cos(f1) - Math.cos(f0));
    const ey = DISC.r * (Math.sin(f1) - Math.sin(f0));
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) continue;
    const rx = px - ax;
    const ry = py - ay;
    const t = (rx * ey - ry * ex) / den;
    const u = (rx * dy - ry * dx) / den;
    if (t > 1e-3 && t < 1 - 1e-3 && u > 1e-6 && u < 1 - 1e-6) return false;
  }
  return true;
}

interface Connection {
  i: number;
  j: number;
}

const clearConnections: Connection[] = [];
let blockedCount = 0;

function buildConnections(): void {
  clearConnections.length = 0;
  blockedCount = 0;
  for (let i = 0; i < eyeChain.length; i++) {
    for (let j = 0; j < lightChain.length; j++) {
      const e = eyeChain[i];
      const l = lightChain[j];
      const dx = l.x - e.x;
      const dy = l.y - e.y;
      const r = Math.hypot(dx, dy);
      let clear = false;
      if (r > 1e-6) {
        const ux = dx / r;
        const uy = dy / r;
        const ce = e.nx * ux + e.ny * uy;
        const cl = -(l.nx * ux + l.ny * uy);
        clear = ce > 0 && cl > 0 && segmentClear(e.x, e.y, l.x, l.y);
      }
      if (clear) clearConnections.push({ i, j });
      else blockedCount++;
    }
  }
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

type P3 = [number, number, number];
const roomPt = (x: number, y: number, z = 0.1): P3 => [ROOM_X + x, PANEL_Y + y, z];

const BASE_ALPHA = 0.5;
const CHAIN_PTS = Math.max(EYE_N, LIGHT_N) + 1;
const MAX_CONN = (EYE_N + 1) * LIGHT_N;

const dummy = new THREE.Object3D();

function makeChain(color: number) {
  const line = polyline(
    Array.from({ length: CHAIN_PTS }, () => [0, 0, 0] as P3),
    { color, width: 5, opacity: BASE_ALPHA },
  );
  line.renderOrder = 6;
  stage.add(line);
  const dots = new THREE.InstancedMesh(new THREE.CircleGeometry(0.045, 18), flat(color), CHAIN_PTS);
  dots.frustumCulled = false;
  dots.renderOrder = 7;
  stage.add(dots);
  return { line, dots };
}

const eyeDraw = makeChain(C.blue);
const lightDraw = makeChain(C.ochre);

const chainPts: P3[] = Array.from({ length: CHAIN_PTS }, () => [0, 0, 0] as P3);

function drawChain(
  draw: { line: ReturnType<typeof polyline>; dots: THREE.InstancedMesh },
  chain: Vertex[],
): void {
  for (let k = 0; k < CHAIN_PTS; k++) {
    const v = chain[Math.min(k, chain.length - 1)];
    chainPts[k] = roomPt(v.x, v.y);
  }
  setPolyline(draw.line, chainPts);
  for (let k = 0; k < chain.length; k++) {
    dummy.position.set(...roomPt(chain[k].x, chain[k].y, 0.12));
    dummy.updateMatrix();
    draw.dots.setMatrixAt(k, dummy.matrix);
  }
  draw.dots.count = chain.length;
  draw.dots.instanceMatrix.needsUpdate = true;
}

const connLines = Array.from({ length: MAX_CONN }, () => {
  const line = polyline([[0, 0, 0], [0, 0, 0]], {
    color: C.bone,
    width: 2.6,
    opacity: BASE_ALPHA,
  });
  line.visible = false;
  line.renderOrder = 5;
  stage.add(line);
  return line;
});

/** The root, drawn large enough to follow while it moves. */
const rootDot = new THREE.Mesh(new THREE.CircleGeometry(0.075, 24), flat(C.bone));
rootDot.renderOrder = 8;
stage.add(rootDot);

// ---------------------------------------------------------------------------
// Readout
// ---------------------------------------------------------------------------

const RX_TEXT = 1.0;
stage.add(
  label('from p', { size: 0.16, color: C.blue, position: [RX_TEXT, 1.42, 0] }),
  label('from the lamp', { size: 0.16, color: C.ochre, position: [RX_TEXT, 1.16, 0] }),
);

const clearLabel = label('', { size: 0.17, color: C.ash, position: [RX_TEXT, 0.72, 0] });
const blockedLabel = label('', { size: 0.17, color: C.ash, position: [RX_TEXT, 0.44, 0] });
stage.add(clearLabel, blockedLabel);

stage.hud.add(
  label('the same construction, with p moving', {
    size: 0.05,
    color: C.slate,
    position: [-(16 / 9) + 0.08, -0.93, 0],
  }),
);

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

const params = {
  motion: 'point' as 'point' | 'ray' | 'held',
  where: 0.6,
  aim: 0.11,
  seed: 0.17,
  albedo: 0.82,
  emission: 1.15,
  background: 0.5,
  resolution: 0.4,
};
ui.params.add(params, 'motion', ['point', 'ray', 'held']).name('what moves');
ui.params.add(params, 'where', 0, 1, 0.001).name('p along the floor');
ui.params.add(params, 'aim', 0, 1, 0.001).name('first direction');
ui.params.add(params, 'seed', 0, 1, 0.001).name('seed (both chains)');
ui.params.add(params, 'albedo', 0.2, 1, 0.01).name('albedo (= c)');
ui.params.add(params, 'emission', 0, 4, 0.05).name('emission');
ui.params.add(params, 'background', 0, 1.2, 0.02).name('room brightness');
ui.params.add(params, 'resolution', 0.15, 1, 0.05).name('render resolution');

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

/**
 * The stretch of floor p is allowed to wander along.
 *
 * Clear of the object's footprint, and derived from it rather than typed in, so
 * moving the object does not silently break the sweep. The object rests on the
 * floor here, so a root inside its footprint has almost no room above it: the
 * chain collapses into a knot beside p, every connection is blocked, and the
 * frame reads as a bug rather than as the deep shadow it actually is.
 *
 * Passing *behind* the object is still the interesting part, and still happens —
 * the connections to the far side of the room wink out as p goes by. What is
 * excluded is only the degenerate strip where the geometry pinches shut.
 */
const P_MARGIN = 0.15;
const P_MIN = Math.min(DISC.x + DISC.r + P_MARGIN, RX - P_MARGIN);
const P_MAX = RX - P_MARGIN;
const bufSize = new THREE.Vector2();
let materialKey = '';

/** There and back over one loop, so the export closes on where it opened. */
const pingPong = (u: number) => 1 - Math.abs(2 * u - 1);

stage.frame((t) => {
  const u = stage.duration > 0 ? (t % stage.duration) / stage.duration : 0;

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

  const where = params.motion === 'point' ? pingPong(u) : params.where;
  const aim = params.motion === 'ray' ? 0.03 + 0.32 * pingPong(u) : params.aim;
  const rootX = P_MIN + (P_MAX - P_MIN) * where;

  // Rebuilt every frame: it is a couple of dozen ray casts and forty-odd
  // visibility tests, and the whole point is that it is different every frame.
  growChains(rootX, aim, params.seed);
  buildConnections();

  drawChain(eyeDraw, eyeChain);
  drawChain(lightDraw, lightChain);
  rootDot.position.set(...roomPt(rootX, -RY, 0.16));

  for (let c = 0; c < connLines.length; c++) {
    const line = connLines[c];
    if (c >= clearConnections.length) {
      line.visible = false;
      continue;
    }
    const { i, j } = clearConnections[c];
    const e = eyeChain[i];
    const l = lightChain[j];
    setPolyline(line, [roomPt(e.x, e.y, 0.08), roomPt(l.x, l.y, 0.08)]);
    line.visible = true;
  }

  setText(clearLabel, `${clearConnections.length} carry light`);
  setText(blockedLabel, `${blockedCount} are blocked`);

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
