/**
 * Bidirectional: growing a path from both ends.
 *
 * Part X's move. A walk from p finds the lamp by accident, and accidents get
 * rarer as the lamp gets smaller; a walk from the lamp begins on emission but
 * has to arrive somewhere useful, and almost never does. So grow one subpath
 * from each end and join them up.
 *
 * ## What the demo does, in order
 *
 * Two chains grow at once — one rooted at p, one rooted on the lamp. Once both
 * have their vertices, *every* pairing of a vertex on one with a vertex on the
 * other is tried, in order of the total length of the path it makes. Each
 * pairing is a connection, and each connection is a visibility test:
 *
 *   - blocked, or facing into a surface: the connection is drawn and goes black.
 *     A perfectly good pair of vertices with nothing between them.
 *   - clear: it flares, then settles to a steady glow whose strength is what
 *     that complete path carries.
 *
 * What is left at the end is a web whose strands all share the same prefix from
 * p and the same suffix from the lamp. That sharing is the whole economy of the
 * method: two walks, and then s × t complete paths out of them for the price of
 * a visibility test each.
 *
 * ## Visibility is the domain, not a factor
 *
 * Nothing about a connecting edge is sampled — both its endpoints are already in
 * hand. Whether it is clear is the condition cutting the region out of the
 * product space, which is why a blocked connection is drawn as a real thing that
 * failed rather than quietly skipped. Watching a dozen go black is watching the
 * domain get carved.
 *
 * ## Why the two kinds of connection are blended differently
 *
 * Successful ones add: they are contributions to a sum, they should reinforce
 * where they overlap, and a weak one should fade into the room rather than turn
 * black — black is what *failure* looks like here, and the two must not collide.
 * Failed ones are drawn with ordinary blending so they read as dark strands
 * against the lit room. Additive black would be invisible, which would quietly
 * delete exactly the half of the story worth telling.
 *
 * ## What a connection is worth
 *
 * The albedos along the chain from p, the albedos along the chain from the lamp,
 * the emission at its far end, and the geometry of the joining edge itself —
 * cos at each end over the distance, which is the 2D kernel. So a grazing or
 * long connection really is dimmer, and the brightest strands are the short
 * square-on ones.
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
stage.duration = 30;

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

/**
 * Vertices grown from p, and from the lamp.
 *
 * Six and six is forty-two connections, and the count is what the demo is
 * about: two walks bought at the price of two walks, and then s x t complete
 * paths out of them for a visibility test each. Short chains make that sound
 * like a technicality; long ones make it obvious.
 */
const EYE_N = 6;
const LIGHT_N = 6;

const ROOM_X = PANEL_X[0];

interface Vertex {
  x: number;
  y: number;
  nx: number;
  ny: number;
  mat: number;
  /** Albedo product from the root of that chain up to and including here. */
  tr: number;
  tg: number;
  tb: number;
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
 * Grow both chains.
 *
 * `seed` shifts every direction choice at once, so the control scrubs through
 * whole configurations rather than nudging one vertex — most seeds give a dull
 * pair of chains, and being able to hunt for a good one matters more here than
 * in a demo that averages over hundreds of paths.
 */
function growChains(seed: number): void {
  eyeChain.length = 0;
  lightChain.length = 0;

  {
    const a0 = ALBEDO_RGB[P0.mat];
    let v: Vertex = { x: P0.x, y: P0.y, nx: P0.nx, ny: P0.ny, mat: P0.mat, tr: a0[0], tg: a0[1], tb: a0[2] };
    eyeChain.push(v);
    for (let j = 0; j < EYE_N; j++) {
      // The first bounce is aimed across the room, away from the lamp's side,
      // so the two chains start apart and the connections have to span the
      // room. Left to the sequence they both wandered into the same corner and
      // every connection was a short hop.
      const u = j === 0 ? 0.05 + 0.13 * seed : (vdc(j - 1, 2) + seed) % 1;
      const { dx, dy } = dirFrom(v.nx, v.ny, u);
      const hit = trace(v.x, v.y, dx, dy);
      if (!hit) break;
      const m = ALBEDO_RGB[hit.mat];
      v = {
        x: hit.x, y: hit.y, nx: hit.nx, ny: hit.ny, mat: hit.mat,
        tr: v.tr * m[0], tg: v.tg * m[1], tb: v.tb * m[2],
      };
      eyeChain.push(v);
    }
  }

  {
    // The lamp is the strip on the ceiling; the chain starts somewhere along it,
    // pointing down into the room. Its throughput starts at the emission rather
    // than at an albedo, because this end is where the light comes from.
    const lx = (2 * ((seed * 1.618) % 1) - 1) * EMIT_HALF * 0.85;
    let v: Vertex = {
      x: lx, y: RY, nx: 0, ny: -1, mat: 2,
      tr: EMIT_RGB[0], tg: EMIT_RGB[1], tb: EMIT_RGB[2],
    };
    lightChain.push(v);
    for (let j = 0; j < LIGHT_N - 1; j++) {
      const { dx, dy } = dirFrom(v.nx, v.ny, (vdc(j, 3) + seed * 0.7) % 1);
      const hit = trace(v.x, v.y, dx, dy);
      if (!hit) break;
      const m = ALBEDO_RGB[hit.mat];
      v = {
        x: hit.x, y: hit.y, nx: hit.nx, ny: hit.ny, mat: hit.mat,
        tr: v.tr * m[0], tg: v.tg * m[1], tb: v.tb * m[2],
      };
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
    // Both endpoints sit on surfaces, so the ends are held off — otherwise a
    // vertex on the object reports itself as the thing blocking it.
    if (t > 1e-3 && t < 1 - 1e-3 && u > 1e-6 && u < 1 - 1e-6) return false;
  }
  return true;
}

interface Connection {
  i: number;
  j: number;
  clear: boolean;
}

const connections: Connection[] = [];

function buildConnections(): void {
  connections.length = 0;
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
        // Facing into either surface is as good as blocked: the edge carries
        // nothing, and it should be seen failing rather than quietly dropped.
        clear = ce > 0 && cl > 0 && segmentClear(e.x, e.y, l.x, l.y);
      }
      connections.push({ i, j, clear });
    }
  }
  // Revealed shortest-first: connections sharing a total length come up
  // together, which is the diagonal that Part X's next slide is about.
  connections.sort((a, b) => a.i + a.j - (b.i + b.j) || a.i - b.i);
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

type P3 = [number, number, number];
const roomPt = (x: number, y: number, z = 0.1): P3 => [ROOM_X + x, PANEL_Y + y, z];

/**
 * How solid the standing picture is. The two chains and the surviving
 * connections all sit at this, so nothing in the settled state is louder than
 * anything else — the loudness is spent entirely on whichever connection is
 * being tested right now.
 */
const BASE_ALPHA = 0.5;

const CHAIN_PTS = Math.max(EYE_N, LIGHT_N) + 1;
/** A whole path: the chain from p down to a vertex, the join, and back up. */
const PATH_PTS = EYE_N + 1 + LIGHT_N;

function makeChain(color: number) {
  const line = polyline(
    Array.from({ length: CHAIN_PTS }, () => [0, 0, 0] as P3),
    { color, width: 5, opacity: BASE_ALPHA },
  );
  line.renderOrder = 6;
  stage.add(line);
  const dots = new THREE.InstancedMesh(
    new THREE.CircleGeometry(0.045, 18),
    flat(color),
    CHAIN_PTS,
  );
  dots.frustumCulled = false;
  dots.renderOrder = 7;
  stage.add(dots);
  return { line, dots };
}

// Cold for the chain grown from p, warm for the one from the lamp — and both
// heavier than any connection. Connections are drawn in whatever colour the
// light they carry happens to be, which is often near-white, so the chains
// cannot also be near-white or the picture stops having a skeleton.
const eyeDraw = makeChain(C.blue);
const lightDraw = makeChain(C.ochre);

const dummy = new THREE.Object3D();

/** Draw a chain grown `grown` vertices in, with a partial segment at the tip. */
function drawChain(
  draw: { line: ReturnType<typeof polyline>; dots: THREE.InstancedMesh },
  chain: Vertex[],
  grown: number,
): void {
  const full = Math.min(Math.floor(grown), chain.length - 1);
  const frac = Math.min(Math.max(grown - full, 0), 1);
  const pts: P3[] = [];
  for (let k = 0; k <= full; k++) pts.push(roomPt(chain[k].x, chain[k].y));
  if (full < chain.length - 1 && frac > 0) {
    const a = chain[full];
    const b = chain[full + 1];
    pts.push(roomPt(a.x + (b.x - a.x) * frac, a.y + (b.y - a.y) * frac));
  }
  while (pts.length < CHAIN_PTS) pts.push(pts[pts.length - 1]);
  setPolyline(draw.line, pts);
  draw.line.visible = grown > 0.001;

  let n = 0;
  for (let k = 0; k <= full; k++, n++) {
    dummy.position.set(...roomPt(chain[k].x, chain[k].y, 0.12));
    dummy.updateMatrix();
    draw.dots.setMatrixAt(n, dummy.matrix);
  }
  draw.dots.count = n;
  draw.dots.instanceMatrix.needsUpdate = true;
}

/**
 * One line per connection. There are only s × t of them, so each gets its own
 * object and its own material — which is what lets the clear ones blend
 * additively and the blocked ones not, within the same picture.
 */
const connLines = Array.from({ length: (EYE_N + 1) * LIGHT_N }, () => {
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

/**
 * The flash: the *whole* path lights up, not just the edge being tested.
 *
 * That is the point of the gesture — a connection is not an edge, it is a
 * complete route from p to the lamp, and the edge is only the last thing needed
 * to finish it. Lighting the edge alone would show the test; lighting the path
 * shows what the test was for.
 *
 * A small pool, because the reveals are sequential and a flash outlives its own
 * slot only slightly.
 */
const flashLines = Array.from({ length: 3 }, () => {
  const line = polyline(
    Array.from({ length: PATH_PTS }, () => [0, 0, 0] as P3),
    { color: C.bone, width: 5.5, opacity: 0.999 },
  );
  line.visible = false;
  line.renderOrder = 9;
  stage.add(line);
  return line;
});

/** The points of the complete path a connection closes. */
function pathPoints(conn: Connection, out: P3[]): void {
  let n = 0;
  for (let k = 0; k <= conn.i; k++) out[n++] = roomPt(eyeChain[k].x, eyeChain[k].y, 0.14);
  for (let k = conn.j; k >= 0; k--) out[n++] = roomPt(lightChain[k].x, lightChain[k].y, 0.14);
  while (n < PATH_PTS) {
    out[n] = out[n - 1];
    n++;
  }
}

// ---------------------------------------------------------------------------
// Readout
// ---------------------------------------------------------------------------

const RX_TEXT = 1.0;
stage.add(
  label('from p', { size: 0.16, color: C.blue, position: [RX_TEXT, 1.42, 0] }),
  label('from the lamp', { size: 0.16, color: C.ochre, position: [RX_TEXT, 1.16, 0] }),
);

const triedLabel = label('', { size: 0.17, color: C.ash, position: [RX_TEXT, 0.62, 0] });
const clearLabel = label('', { size: 0.17, color: C.ash, position: [RX_TEXT, 0.34, 0] });
const blockedLabel = label('', { size: 0.17, color: C.ash, position: [RX_TEXT, 0.06, 0] });
stage.add(triedLabel, clearLabel, blockedLabel);

stage.hud.add(
  label('every pairing of a vertex on one chain with a vertex on the other', {
    size: 0.05,
    color: C.slate,
    position: [-(16 / 9) + 0.08, -0.93, 0],
  }),
);

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

const params = {
  run: true,
  step: 0,
  seed: 0.17,
  albedo: 0.82,
  emission: 1.15,
  background: 0.5,
  resolution: 0.4,
};
ui.params.add(params, 'run').name('grow, then connect');
ui.params.add(params, 'step', 0, 1, 0.001).name('step (when held)');
ui.params.add(params, 'seed', 0, 1, 0.001).name('seed (both chains)');
ui.params.add(params, 'albedo', 0.2, 1, 0.01).name('albedo (= c)');
ui.params.add(params, 'emission', 0, 4, 0.05).name('emission');
ui.params.add(params, 'background', 0, 1.2, 0.02).name('room brightness');
ui.params.add(params, 'resolution', 0.15, 1, 0.05).name('render resolution');

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

/** Fractions of the loop: grow, connect, then hold on the finished web. */
const GROW_END = 0.26;
const CONNECT_END = 0.9;
/** How long a connection is lit up, as a fraction of its own slot. */
const FLARE = 0.9;

const bufSize = new THREE.Vector2();
const FLASH_OK = new THREE.Color(0xffffff);
const FLASH_FAIL = new THREE.Color(0x000000);
const pathPts: P3[] = Array.from({ length: PATH_PTS }, () => [0, 0, 0] as P3);

let materialKey = '';
let chainKey = '';

stage.frame((t) => {
  const u = stage.duration > 0 ? (t % stage.duration) / stage.duration : 0;
  const step = params.run ? u : params.step;

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

  const ckey = `${params.seed}`;
  if (ckey !== chainKey) {
    chainKey = ckey;
    growChains(params.seed);
    buildConnections();
  }

  // --- the two chains ------------------------------------------------------
  const grow = Math.min(step / GROW_END, 1);
  drawChain(eyeDraw, eyeChain, grow * (eyeChain.length - 1));
  drawChain(lightDraw, lightChain, grow * (lightChain.length - 1));

  // --- the connections -----------------------------------------------------
  const total = connections.length;
  const phase = Math.min(Math.max((step - GROW_END) / (CONNECT_END - GROW_END), 0), 1);
  const revealed = phase * total;

  let clearCount = 0;
  let blockedCount = 0;
  let flashUsed = 0;

  for (let c = 0; c < connLines.length; c++) {
    const line = connLines[c];
    if (c >= total || revealed <= c) {
      line.visible = false;
      continue;
    }
    const conn = connections[c];
    if (conn.clear) clearCount++;
    else blockedCount++;

    // Age in units of one connection's slot, so the flash reads the same
    // whatever the total count.
    const age = revealed - c;

    // Only a connection that worked leaves anything behind, and what it leaves
    // is the joining edge alone, sitting at the same weight as the chains.
    // A blocked one is drawn while it is being tested and then is simply not
    // there — nothing was added to the picture, because nothing was added to
    // the sum.
    if (conn.clear && age >= FLARE) {
      const e = eyeChain[conn.i];
      const l = lightChain[conn.j];
      setPolyline(line, [roomPt(e.x, e.y, 0.08), roomPt(l.x, l.y, 0.08)]);
      line.visible = true;
    } else {
      line.visible = false;
    }

    // The flash itself: the whole route, white if it carries light and black if
    // it does not, fading out over its slot.
    if (age < FLARE && flashUsed < flashLines.length) {
      const flash = flashLines[flashUsed++];
      pathPoints(conn, pathPts);
      setPolyline(flash, pathPts);
      const fade = 1 - age / FLARE;
      const mat = flash.material as THREE.Material & { color: THREE.Color };
      mat.color.copy(conn.clear ? FLASH_OK : FLASH_FAIL);
      // Successful flashes settle onto the standing weight rather than to
      // nothing, so the edge that survives does not appear from a gap.
      mat.opacity = conn.clear ? BASE_ALPHA + (1 - BASE_ALPHA) * fade : fade;
      flash.visible = true;
    }
  }
  for (let k = flashUsed; k < flashLines.length; k++) flashLines[k].visible = false;

  const tried = Math.min(Math.floor(revealed), total);
  setText(triedLabel, `${tried} of ${total} connections`);
  setText(clearLabel, `${clearCount} carry light`);
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
