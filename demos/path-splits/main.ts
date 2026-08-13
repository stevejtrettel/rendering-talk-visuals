/**
 * The same path, many ways: one chain, and every split of it.
 *
 * Part X's next move after `bidirectional`. That demo grew two chains and
 * joined every vertex of one to every vertex of the other. This one runs the
 * argument backwards: fix a single complete path from p to the lamp, and ask
 * which of those strategies could have produced it.
 *
 * ## The picture
 *
 * A path with V vertices — p, some bounces, and a point on the emitter — is
 * drawn once and then left standing. It never changes; what changes is only
 * how it is *coloured*. Split it after t vertices and the first t came from the
 * walk rooted at p (blue), the remaining s = V − t came from the walk rooted on
 * the lamp (ochre), and the one edge between them is the connection (dashed,
 * because nothing about it was sampled — both its endpoints were already in
 * hand). Stepping t from V down to 0 slides that dashed edge along the path.
 *
 * The two ends of the range are the degenerate strategies, and they belong:
 *
 *   - t = V: the whole thing came from p and found the lamp by accident. No
 *     connection — this is ordinary path tracing.
 *   - t = 0: the whole thing came from the lamp and arrived at p. Also no
 *     connection — this is the light trace.
 *
 * So a path with V vertices is produced by V + 1 different strategies, and the
 * table on the right is that list: one row per split, each row a bar divided
 * blue-then-ochre in the proportion that split uses. Every row draws the same
 * path. Add the strategies up naively and this path is counted V + 1 times,
 * which is the slide the demo is for.
 *
 * ## The path is a real path
 *
 * Grown from p by a seeded cosine walk against the same faceted room the other
 * 2D demos use — every interior vertex is a traced hit, so every edge is
 * genuinely unoccluded. The last edge is a connection to the emitter: the
 * candidate points on the strip are tested for visibility and for facing, and
 * the one with the largest geometry factor wins. That is exactly the move the
 * (t = V − 1, s = 1) strategy makes, so the path is one the method could really
 * have built, rather than a shape drawn over the room.
 *
 * Because every surface here is diffuse, every split on the diagonal really can
 * produce this path. The slide's caveat — that a specular vertex kills the
 * splits whose edge would land inside it — is a claim about a scene this room
 * does not contain, and the demo does not pretend to make it.
 *
 * ## Readability choices
 *
 * The room is rendered dimmer than in `bidirectional` (the light there was the
 * subject; here it is the backdrop for a diagram), and the standing path is
 * kept visible under the colouring as a faint bone ghost so the eye can see
 * that the *same* chain is being recoloured rather than redrawn.
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

const ui = createUI(stage);

// ---------------------------------------------------------------------------
// The room — the same one `bidirectional` and `bounce-series` light
// ---------------------------------------------------------------------------

const RX = 1.8;
const RY = 1.55;
const WALL = 0.14;
const DISC = { x: -0.551, y: -1.049, r: 0.5 };
const EMIT_HALF = 0.45;

const NW = 36;
/** Facets around the object — coarse on purpose, and countable. */
const ND = 16;
const M = 4 * NW + ND;

/** One room, set left, with the right of the frame kept for the table. */
const PANEL_X = -1.28;
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

  const ox = px - DISC.x;
  const oy = py - DISC.y;
  {
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
// The operator, for the background render
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

/** Is the straight run between two points clear of the object? */
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
      if (!segmentClear(a.x, a.y, b.x, b.y)) continue;
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

  float seam(float f) {
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

  int facetOf(vec2 d) {
    float a = atan(d.y, d.x);
    if (a < 0.0) a += 6.2831853;
    return int(clamp(floor(a / 6.2831853 * float(ND)), 0.0, float(ND - 1)));
  }

  bool insidePoly(vec2 p) {
    vec2 d = p - DISC;
    if (dot(d, d) > DISC_R * DISC_R) return false;
    float mid = 6.2831853 * (float(facetOf(d)) + 0.5) / float(ND);
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
    vec2 p = wp - vec2(${PANEL_X.toFixed(4)}, ${PANEL_Y.toFixed(4)});

    if (abs(p.x) > RX + WALL || abs(p.y) > RY + WALL) {
      fragColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }

    vec3 col;
    if (abs(p.x) > RX || abs(p.y) > RY) {
      vec2 q = vec2(clamp(p.x, -RX, RX), clamp(p.y, -RY, RY));
      col = radianceOf(patchOfWall(q)) * seamWall(q);
    } else if (insidePoly(p)) {
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
    uExposure: { value: 0.46 },
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
// The path
// ---------------------------------------------------------------------------

/** Where the path starts: on the floor, right of the object, as elsewhere. */
const P0 = { x: 0.7, y: -RY, nx: 0, ny: 1, mat: 0 };

/** Most bounces the demo will ever draw, so the table can be built once. */
const MAX_BOUNCES = 5;
/** Vertices at the widest: p, the bounces, and the point on the lamp. */
const MAX_V = MAX_BOUNCES + 2;

interface Vertex {
  x: number;
  y: number;
  nx: number;
  ny: number;
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

const path: Vertex[] = [];

/**
 * Grow the one path the demo is about.
 *
 * `bounces` interior vertices from a cosine walk out of p, then a connection to
 * the emitter. The lamp point is chosen from candidates along the strip: the
 * clear, front-facing one with the largest geometry factor wins, which is the
 * brightest connection available — the same choice the (V − 1, 1) strategy
 * would make. If nothing on the strip is visible from the last bounce the walk
 * is shortened until something is, so the drawn chain is always a real path.
 */
function growPath(seed: number, bounces: number): void {
  path.length = 0;
  let v: Vertex = { x: P0.x, y: P0.y, nx: P0.nx, ny: P0.ny };
  path.push(v);

  for (let j = 0; j < bounces; j++) {
    // The first bounce is aimed across the room rather than left to the
    // sequence, so the path spans the frame instead of folding into one corner.
    const u = j === 0 ? 0.06 + 0.16 * seed : (vdc(j - 1, 2) + seed) % 1;
    const { dx, dy } = dirFrom(v.nx, v.ny, u);
    const hit = trace(v.x, v.y, dx, dy);
    if (!hit) break;
    v = { x: hit.x, y: hit.y, nx: hit.nx, ny: hit.ny };
    path.push(v);
  }

  // Close onto the lamp, dropping bounces from the tail if the last one cannot
  // see it. A path that ends anywhere but the emitter carries nothing, and this
  // demo is about a path that carries something.
  const NC = 9;
  while (path.length > 1) {
    const last = path[path.length - 1];
    let bestG = 0;
    let bestX = 0;
    for (let k = 0; k < NC; k++) {
      const lx = (2 * ((k + 0.5) / NC) - 1) * EMIT_HALF * 0.9;
      const dx = lx - last.x;
      const dy = RY - last.y;
      const r = Math.hypot(dx, dy);
      if (r < 1e-6) continue;
      const ce = (last.nx * dx + last.ny * dy) / r;
      const cl = dy / r;
      if (ce <= 0.02 || cl <= 0.02) continue;
      if (!segmentClear(last.x, last.y, lx, RY)) continue;
      const g = (ce * cl) / r;
      if (g > bestG) {
        bestG = g;
        bestX = lx;
      }
    }
    if (bestG > 0) {
      path.push({ x: bestX, y: RY, nx: 0, ny: -1 });
      return;
    }
    path.pop();
  }
  // Unreachable in practice: p is on the open floor and sees the whole strip.
  path.push({ x: 0, y: RY, nx: 0, ny: -1 });
}

// ---------------------------------------------------------------------------
// Drawing the path
// ---------------------------------------------------------------------------

type P3 = [number, number, number];
const roomPt = (x: number, y: number, z = 0.1): P3 => [PANEL_X + x, PANEL_Y + y, z];

/** Pad a run of points out to a fixed count, which `setPolyline` requires. */
function padded(pts: P3[], n: number): P3[] {
  const out = pts.slice();
  while (out.length < n) out.push(out.length ? out[out.length - 1] : [0, 0, 0]);
  return out;
}

/**
 * The chain itself, drawn once and left standing. Faint, because it is the
 * thing that does not change: the argument is entirely in the colouring laid
 * over it, and a bright ghost would compete with its own subpaths.
 */
const ghost = polyline(Array.from({ length: MAX_V }, () => [0, 0, 0] as P3), {
  color: C.bone,
  width: 6,
  opacity: 0.16,
});
ghost.renderOrder = 4;
stage.add(ghost);

const eyeLine = polyline(Array.from({ length: MAX_V }, () => [0, 0, 0] as P3), {
  color: C.blue,
  width: 6,
  opacity: 0.999,
});
eyeLine.renderOrder = 6;
const lightLine = polyline(Array.from({ length: MAX_V }, () => [0, 0, 0] as P3), {
  color: C.ochre,
  width: 6,
  opacity: 0.999,
});
lightLine.renderOrder = 6;
/**
 * The join, dashed: nothing about this edge was sampled. Both its endpoints
 * were already in hand and all that was asked of it was whether it is clear —
 * so it is drawn as a test rather than as a step of a walk.
 */
const joinLine = polyline([[0, 0, 0], [0, 0, 0]], {
  color: C.bone,
  width: 3.4,
  opacity: 0.999,
  dashed: true,
  dashSize: 0.075,
  gapSize: 0.055,
});
joinLine.renderOrder = 8;
stage.add(eyeLine, lightLine, joinLine);

const eyeDots = new THREE.InstancedMesh(new THREE.CircleGeometry(0.05, 20), flat(C.blue), MAX_V);
const lightDots = new THREE.InstancedMesh(new THREE.CircleGeometry(0.05, 20), flat(C.ochre), MAX_V);
/** The vertices before either end has claimed any — so they can be counted. */
const bareDots = new THREE.InstancedMesh(new THREE.CircleGeometry(0.05, 20), flat(C.bone), MAX_V);
for (const d of [eyeDots, lightDots, bareDots]) {
  d.frustumCulled = false;
  d.renderOrder = 9;
  stage.add(d);
}

const dummy = new THREE.Object3D();

function setDots(mesh: THREE.InstancedMesh, verts: Vertex[]): void {
  verts.forEach((v, i) => {
    dummy.position.set(...roomPt(v.x, v.y, 0.16));
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.count = verts.length;
  mesh.instanceMatrix.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// The table of splits
// ---------------------------------------------------------------------------

const TAB_X = 0.98;
const TAB_LEN = 1.5;
const ROW_H = 0.235;
const BAR_GAP = 0.035;

stage.add(
  label('from p', { size: 0.155, color: C.blue, position: [TAB_X, 1.5, 0] }),
  label('from the lamp', { size: 0.155, color: C.ochre, position: [TAB_X, 1.24, 0] }),
);

interface Row {
  eye: ReturnType<typeof polyline>;
  light: ReturnType<typeof polyline>;
  text: ReturnType<typeof label>;
}

/** One row per split, allocated for the widest path and hidden when unused. */
const rows: Row[] = Array.from({ length: MAX_V + 1 }, () => {
  const eye = polyline([[0, 0, 0], [0, 0, 0]], { color: C.blue, width: 7, opacity: 0.999 });
  const light = polyline([[0, 0, 0], [0, 0, 0]], { color: C.ochre, width: 7, opacity: 0.999 });
  const text = label('', {
    size: 0.15,
    color: C.bone,
    anchorX: 'left',
    anchorY: 'middle',
    position: [TAB_X + TAB_LEN + 0.14, 0, 0],
  });
  stage.add(eye, light, text);
  return { eye, light, text };
});

/** Where row k of a V-vertex path sits — the block stays centred as V changes. */
const rowY = (k: number, V: number) => (V * ROW_H) / 2 + 0.06 - k * ROW_H;

/**
 * Lay the table out for a path with V vertices. Row k is the split that takes
 * t = V − k vertices from p, so the top row is the pure camera walk and the
 * bottom row the pure light walk.
 */
function layoutTable(V: number): void {
  rows.forEach((row, k) => {
    const used = k <= V;
    row.eye.visible = used;
    row.light.visible = used;
    row.text.visible = used;
    if (!used) return;

    const t = V - k;
    const y = rowY(k, V);
    const split = TAB_X + (TAB_LEN * t) / V;
    const half = t > 0 && t < V ? BAR_GAP / 2 : 0;
    setPolyline(row.eye, [[TAB_X, y, 0.1], [split - half, y, 0.1]]);
    setPolyline(row.light, [[split + half, y, 0.1], [TAB_X + TAB_LEN, y, 0.1]]);
    row.eye.visible = t > 0;
    row.light.visible = t < V;
    row.text.position.set(TAB_X + TAB_LEN + 0.14, y, 0.1);
    setText(row.text, `${t} + ${V - t}`);
  });
}

/**
 * The tally, and the reason for the demo: each split is a fine estimator on its
 * own, so adding them up reports this one path once for every row above.
 */
const tally = label('', {
  size: 0.17,
  color: C.bone,
  anchorX: 'left',
  anchorY: 'middle',
  position: [TAB_X, -1.2, 0],
});
stage.add(tally);

stage.hud.add(
  label('one path, and every split of it that could have produced it', {
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
  split: 0,
  bounces: 5,
  seed: 0.86,
  albedo: 0.82,
  emission: 1.15,
  background: 0.46,
  resolution: 0.4,
};
ui.params.add(params, 'run').name('step through the splits');
ui.params.add(params, 'split', 0, MAX_V, 1).name('split (when held)');
ui.params.add(params, 'bounces', 2, MAX_BOUNCES, 1).name('bounces');
ui.params.add(params, 'seed', 0, 1, 0.001).name('seed (the path)');
ui.params.add(params, 'albedo', 0.2, 1, 0.01).name('albedo (= c)');
ui.params.add(params, 'emission', 0, 4, 0.05).name('emission');
ui.params.add(params, 'background', 0, 1.2, 0.02).name('room brightness');
ui.params.add(params, 'resolution', 0.15, 1, 0.05).name('render resolution');

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

/** A beat on the bare path before it is taken apart, in seconds. */
const INTRO = 2.4;
/** How long one split is held, in seconds. */
const SLOT = 2.3;
/** The share of a slot spent flaring, so the eye catches the join moving. */
const FLARE = 0.22;

const bufSize = new THREE.Vector2();

let materialKey = '';
let pathKey = '';
let vertexCount = 0;

/**
 * Grow the path and lay the table out for it.
 *
 * Called once at setup rather than only from the frame callback, because
 * `stage.duration` has to be right *before* the first frame: opening the demo
 * at `?t=` wraps t by whatever duration the stage is carrying at seek time, and
 * a duration still sitting at its default would put every frozen shot in the
 * wrong place in the sequence.
 */
function rebuildPath(): void {
  growPath(params.seed, Math.round(params.bounces));
  vertexCount = path.length;
  setPolyline(ghost, padded(path.map((v) => roomPt(v.x, v.y, 0.06)), MAX_V));
  layoutTable(vertexCount);
  // The loop is the intro plus one slot per split, so changing the length of
  // the path changes the length of the movie rather than the pace of it.
  stage.duration = INTRO + (vertexCount + 1) * SLOT;
}

pathKey = `${params.seed}|${params.bounces}`;
rebuildPath();

stage.frame((t) => {
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

  const pkey = `${params.seed}|${params.bounces}`;
  if (pkey !== pathKey) {
    pathKey = pkey;
    rebuildPath();
  }

  const V = vertexCount;

  // --- which split, and how far into its slot -------------------------------
  let k: number;
  let age = 1;
  if (params.run) {
    const u = (t % stage.duration) - INTRO;
    if (u < 0) {
      k = -1;
    } else {
      k = Math.min(Math.floor(u / SLOT), V);
      age = Math.min((u - k * SLOT) / (SLOT * FLARE), 1);
    }
  } else {
    k = Math.min(Math.round(params.split), V);
  }

  if (k < 0) {
    // The bare path: nothing has been claimed by either end yet.
    eyeLine.visible = false;
    lightLine.visible = false;
    joinLine.visible = false;
    eyeDots.count = 0;
    lightDots.count = 0;
    setDots(bareDots, path);
    (ghost.material as THREE.Material & { opacity: number }).opacity = 0.85;
  } else {
    bareDots.count = 0;
    (ghost.material as THREE.Material & { opacity: number }).opacity = 0.16;

    const tCount = V - k;
    const eyeVerts = path.slice(0, tCount);
    const lightVerts = path.slice(tCount);

    eyeLine.visible = eyeVerts.length > 1;
    if (eyeLine.visible) {
      setPolyline(eyeLine, padded(eyeVerts.map((v) => roomPt(v.x, v.y)), MAX_V));
    }
    lightLine.visible = lightVerts.length > 1;
    if (lightLine.visible) {
      setPolyline(lightLine, padded(lightVerts.map((v) => roomPt(v.x, v.y)), MAX_V));
    }

    // The join exists only for the splits that use both ends.
    joinLine.visible = tCount > 0 && tCount < V;
    if (joinLine.visible) {
      const a = path[tCount - 1];
      const b = path[tCount];
      setPolyline(joinLine, [roomPt(a.x, a.y, 0.12), roomPt(b.x, b.y, 0.12)]);
      const mat = joinLine.material as THREE.Material & { linewidth: number };
      // Thick on arrival, settling to its standing weight: the connection is
      // what moved, and the eye should be told where it went.
      mat.linewidth = 3.4 + 3.6 * (1 - age);
    }

    setDots(eyeDots, eyeVerts);
    setDots(lightDots, lightVerts);
  }

  // --- the table -----------------------------------------------------------
  const counted = k + 1;
  setText(tally, counted <= 0 ? '' : counted === 1 ? 'counted once' : `counted ${counted} times`);
  tally.position.y = rowY(V, V) - 0.42;

  // Rows already visited stay half-lit rather than going back down: the table
  // fills in as the sequence runs, so what is on screen at the end is the whole
  // list of strategies that produced this one path — which is the tally.
  rows.forEach((row, i) => {
    const a = i === k ? 0.999 : i < k ? 0.45 : 0.16;
    (row.eye.material as THREE.Material & { opacity: number }).opacity = a;
    (row.light.material as THREE.Material & { opacity: number }).opacity = a;
    row.text.material.opacity = i === k ? 1 : i < k ? 0.5 : 0.22;
  });

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
