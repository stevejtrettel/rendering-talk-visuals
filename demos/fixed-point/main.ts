/**
 * Whichever light field you start with, the room washes it out.
 *
 * Two rooms, iterating the same map L ↦ E + TL. The left one starts black. The
 * right one starts with a light field the room could never produce — a magenta
 * floor and a green wall, put there by hand. After a couple of iterations they
 * are close; after eight you cannot tell them apart.
 *
 * That convergence is both halves of the slide at once. The difference of two iterates
 * obeys L_n − L'_n = Tⁿ(L_0 − L'_0) with no emission in it at all, so "light
 * fields die out under T" and "the starting field is forgotten" are the same
 * statement — which is exactly why the fixed point is unique.
 *
 * ## The operator is real
 *
 * The boundary is cut into patches, each carrying a radiance, so a light field
 * on Σ is a vector and T is a matrix: patch-to-patch transport with a real
 * visibility test, scaled by albedo. Iterating is a matrix–vector product, and
 * the pictures are renders of whatever the current iterate is. Nothing here is
 * an animation standing in for a computation.
 *
 * In 2D the kernel between boundary elements is cos θᵢ cos θⱼ / (2r) ds. Its row
 * sums should be 1 — from anywhere on the boundary, every direction hits
 * something — and they come out within a percent of it, which is a decent check
 * on the geometry. They are then normalised to exactly 1, the standard
 * correction, so that no energy is created or destroyed by the discretisation.
 *
 * That normalisation buys the sharp statement: with rows summing to one,
 * ‖T‖∞ is exactly the largest albedo in the room. So the `albedo` control *is*
 * the contraction constant c: at 0.7 the two rooms agree within a few iterations,
 * at 0.95 it takes a while, and at 1 the room never settles — nothing is
 * absorbed, c = 1, and Banach has nothing to say.
 *
 * ## Iterations, not seconds
 *
 * The picture jumps from iterate to iterate. Each application of the map is also
 * one more scattering event, but what the slide is doing is iterating, not
 * watching. Solving for the equilibrium field is how it is *found*, not
 * something the room does over time. A smooth fade would quietly claim the room
 * is evolving, and it isn't — the model is stationary.
 *
 * ## The composition, written out
 *
 * Under each room is the expression that produced it, not a count:
 *
 *     A                B
 *     E + TA           E + TB
 *     E + T(E + TA)    E + T(E + TB)
 *     ...
 *
 * The two columns differ in one letter and nowhere else, which is the whole
 * argument on screen at once: the same operator is applied to both, so whatever
 * survives of A and B is buried under an ever-deeper stack of identical E's and
 * T's. A count would have said how many times; this says what was done.
 *
 * It grows by seven characters a step, so after five levels the line stops being
 * readable projected and a single count takes over in the middle. By then the
 * expression has done its work — the stack has been seen to build, and all that
 * is left to report is how tall it is. So the demo still runs out to twelve.
 */

import * as THREE from 'three';
import { createStage, createUI, C, flat } from '@';
import { polyline, setPolyline, type Pt } from '@/lines';
import { label, setText } from '@/text';

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
stage.duration = 14;

const ui = createUI(stage);

// ---------------------------------------------------------------------------
// The room
// ---------------------------------------------------------------------------

const RX = 1.8;
const RY = 1.55;
const WALL = 0.14;
const DISC = { x: -0.551, y: -1.049, r: 0.5 };

/** Patches per wall, and around the object. */
const NW = 36;
/**
 * Facets around the object. Coarse on purpose: it is a polygon, not a circle
 * drawn coarsely, and at 16 you can count them. The form factors, the visibility
 * tests and the ray casts all use these same flat facets, so the hard-edged look
 * is the truth rather than a drawing trick.
 */
const ND = 16;
const M = 4 * NW + ND;
const DISC_BASE = 4 * NW;

/** The emitting strip in the ceiling. */
const EMIT_HALF = 0.55;

const PANEL_X = [-2.1, 2.1];
const PANEL_Y = 0.15;

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

const ALBEDO_RGB = [
  toRGB((l) => 0.05 + 0.85 * bell(l, 545, 40)), // 0 floor, moss
  toRGB((l) => 0.16 + 0.4 * bell(l, 485, 65)), // 1 right wall, slate
  toRGB((l) => 0.5 + 0.15 * bell(l, 600, 120)), // 2 ceiling, bone
  toRGB((l) => 0.05 + 0.9 * bell(l, 640, 48)), // 3 left wall, rust
  toRGB((l) => 0.04 + 0.85 * bell(l, 462, 40)), // 4 the object, blue
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
  mat: number; // index into ALBEDO_RGB
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
    patches.push({
      x,
      y,
      nx,
      ny,
      ds,
      mat: side,
      emits: side === 2 && Math.abs(x) < EMIT_HALF,
    });
  }
}

// The object, whose outward normal points into the room.
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

/** Does the segment between two boundary points cross the object? */
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

/**
 * Form factors. F[i * M + j] is the fraction of what leaves patch j that lands
 * on patch i, using the 2D kernel cos θᵢ cos θⱼ / (2r) ds.
 */
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
    // Normalise the row to exactly one: from any boundary point, every
    // direction lands somewhere, and the discretisation should not invent or
    // lose energy. This is what makes ‖T‖∞ exactly the largest albedo.
    if (sum > 1e-9) {
      for (let j = 0; j < M; j++) F[i * M + j] /= sum;
    }
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

/** One application of L ↦ E + TL. */
function applyOperator(src: Float32Array, dst: Float32Array): void {
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
    dst[3 * i] = emission[3 * i] + albedo[3 * i] * r;
    dst[3 * i + 1] = emission[3 * i + 1] + albedo[3 * i + 1] * g;
    dst[3 * i + 2] = emission[3 * i + 2] + albedo[3 * i + 2] * b;
  }
}

/** The two starting fields. The second is deliberately not anything physical. */
function seed(which: number, out: Float32Array): void {
  out.fill(0);
  if (which === 0) return;
  for (let i = 0; i < M; i++) {
    const p = patches[i];
    const wave = 0.5 + 0.5 * Math.sin(i * 0.31);
    if (p.mat === 0) {
      out[3 * i] = 1.4 * wave; // magenta floor
      out[3 * i + 2] = 1.1 * wave;
    } else if (p.mat === 1) {
      out[3 * i + 1] = 1.3 * wave; // green right wall
    } else if (p.mat === 4) {
      out[3 * i] = 0.8;
      out[3 * i + 1] = 0.8;
    }
  }
}

// Scratch buffers: the iteration is recomputed from the seed every frame, so
// the demo stays a pure function of t and exports frame by frame exactly.
const bufs = [
  [new Float32Array(M * 3), new Float32Array(M * 3)],
  [new Float32Array(M * 3), new Float32Array(M * 3)],
];
const current = [new Float32Array(M * 3), new Float32Array(M * 3)];

/** Iterate room `which` n times from its seed, into `current[which]`. */
function iterate(which: number, n: number): void {
  let a = bufs[which][0];
  let b = bufs[which][1];
  seed(which, a);
  for (let k = 0; k < n; k++) {
    applyOperator(a, b);
    const t = a;
    a = b;
    b = t;
  }
  current[which].set(a);
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
  const int GATHER = 64;

  /** Which patch a boundary point belongs to. Must match the JS ordering. */
  int patchOfWall(vec2 q) {
    if (q.y <= -RY + 1e-3) return int(clamp(floor((q.x + RX) / (2.0 * RX) * float(NW)), 0.0, float(NW - 1)));
    if (q.x >= RX - 1e-3) return NW + int(clamp(floor((q.y + RY) / (2.0 * RY) * float(NW)), 0.0, float(NW - 1)));
    if (q.y >= RY - 1e-3) return 2 * NW + int(clamp(floor((RX - q.x) / (2.0 * RX) * float(NW)), 0.0, float(NW - 1)));
    return 3 * NW + int(clamp(floor((RY - q.y) / (2.0 * RY) * float(NW)), 0.0, float(NW - 1)));
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
   * Nearest facet along the ray. The bounding circle is tested first, so the
   * rays that miss the object — most of them — cost one test rather than ND.
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

  /** Darken the last sliver of a patch, so the tiling is visible. */
  float seam(float f) {
    // Near-black and wide: the gaps between patches are the point, so they are
    // drawn as gaps rather than as a hint of shading.
    return 0.12 + 0.88 * smoothstep(0.0, 0.15, min(f, 1.0 - f));
  }
  float seamDisc(vec2 n) {
    float a = atan(n.y, n.x) + 3.14159265;
    return seam(fract(a / 6.2831853 * float(ND)));
  }
  float seamWall(vec2 q) {
    if (q.y <= -RY + 1e-3) return seam(fract((q.x + RX) / (2.0 * RX) * float(NW)));
    if (q.x >= RX - 1e-3) return seam(fract((q.y + RY) / (2.0 * RY) * float(NW)));
    if (q.y >= RY - 1e-3) return seam(fract((RX - q.x) / (2.0 * RX) * float(NW)));
    return seam(fract((RY - q.y) / (2.0 * RY) * float(NW)));
  }

  vec3 radianceOf(int idx, float row) {
    return texture(uRad, vec2((float(idx) + 0.5) / float(M), row)).rgb;
  }

  /** Radiance arriving along the ray from p in direction dir. */
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
    vec2 p = wp - vec2(px, ${PANEL_Y.toFixed(4)});

    if (abs(p.x) > RX + WALL || abs(p.y) > RY + WALL) {
      fragColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }

    vec3 col;
    if (abs(p.x) > RX || abs(p.y) > RY) {
      // In the wall band: show that patch's own radiance, which is the light
      // field itself rather than a render of it.
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
      // In the air: gather what arrives from all around. The offset is a hash of
      // the pixel, so the directions differ from neighbour to neighbour and the
      // emitter stops throwing hard spokes — and it depends only on position, so
      // every frame of an export is identical.
      float jit = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
      vec3 g = vec3(0.0);
      for (int k = 0; k < GATHER; k++) {
        float a = 6.2831853 * (float(k) + jit) / float(GATHER);
        g += alongRay(p, vec2(cos(a), sin(a)), row);
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
    uExposure: { value: 1 },
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
// Labels and the convergence plot
// ---------------------------------------------------------------------------

stage.add(
  label('A: started black', {
    size: 0.19,
    color: C.bone,
    anchorX: 'center',
    position: [PANEL_X[0], PANEL_Y + RY + 0.26, 0],
  }),
  label('B: started with nonsense', {
    size: 0.19,
    color: C.bone,
    anchorX: 'center',
    position: [PANEL_X[1], PANEL_Y + RY + 0.26, 0],
  }),
);

/** How many iterations the loop steps through. */
const MAX_N = 12;

/**
 * How deep the nesting is written out before the label gives up and counts.
 *
 * Five is where a projected line stops being readable — every iteration adds
 * `E + T(` and a closing paren, so the string grows by seven characters a step
 * and the type has to shrink to match. Past that the expression has made its
 * point anyway: the reader has seen the stack build, and what matters from then
 * on is only how tall it is.
 */
const WRITTEN_OUT = 5;

/**
 * The expression that produced the n-th iterate, from a seed.
 *
 *   n = 0   A
 *   n = 1   E + TA
 *   n = 2   E + T(E + TA)
 */
function composition(seed: string, n: number): string {
  if (n <= 0) return seed;
  let out = `E + T${seed}`;
  for (let k = 1; k < n; k++) out = `E + T(${out})`;
  return out;
}

/**
 * Rough advances in ems for the handful of glyphs these strings use, so the type
 * can be sized to fit before troika has laid it out. Measuring properly would
 * mean waiting a frame for the sync, and a frame late is exactly what the
 * exporter cannot have.
 */
const ADV: Record<string, number> = { E: 0.61, T: 0.61, A: 0.72, B: 0.67, '+': 0.56, '(': 0.33, ')': 0.33, ' ': 0.25 };
const emWidth = (str: string) => [...str].reduce((w, c) => w + (ADV[c] ?? 0.55), 0);

/**
 * How wide a composition may be, and how big its type may get.
 *
 * The panels are 4.2 apart, so 3.4 leaves a clear channel between the two
 * expressions at full depth — they are meant to be read as two columns, and at
 * 3.9 the deepest pair very nearly touched in the middle.
 */
const TEXT_W = 3.4;
const TEXT_MAX = 0.26;

const TEXT_Y = PANEL_Y - RY - 0.8;

/** Past `WRITTEN_OUT` the two expressions are identical but for one letter and
 * both illegible, so one count in the middle replaces the pair. */
const countLabel = label('', {
  size: 0.3,
  color: C.ochre,
  anchorX: 'center',
  anchorY: 'middle',
  position: [(PANEL_X[0] + PANEL_X[1]) / 2, TEXT_Y, 0],
});
stage.add(countLabel);

const compLabels = PANEL_X.map((x) => {
  const l = label('', {
    size: TEXT_MAX,
    color: C.ochre,
    anchorX: 'center',
    anchorY: 'middle',
    position: [x, TEXT_Y, 0],
  });
  stage.add(l);
  return l;
});

/** Set a composition and size it so it always fits its panel. */
function setComposition(l: ReturnType<typeof label>, str: string): void {
  setText(l, str);
  l.fontSize = Math.min(TEXT_MAX, TEXT_W / emWidth(str));
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

const params = {
  run: true,
  iteration: 3,
  depth: MAX_N,
  albedo: 0.72,
  emission: 1.6,
  exposure: 1.1,
  resolution: 0.45,
};
ui.params.add(params, 'run').name('step through iterations');
ui.params.add(params, 'iteration', 0, 12, 1).name('iteration (when held)');
ui.params.add(params, 'depth', 1, 12, 1).name('how many iterations');
ui.params.add(params, 'albedo', 0.2, 1, 0.01).name('albedo (= c)');
ui.params.add(params, 'emission', 0, 4, 0.05).name('emission');
ui.params.add(params, 'exposure', 0.2, 3, 0.05).name('exposure');
ui.params.add(params, 'resolution', 0.15, 1, 0.05).name('render resolution');

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

const bufSize = new THREE.Vector2();

let lastKey = '';

stage.frame((t) => {
  const u = stage.duration > 0 ? (t % stage.duration) / stage.duration : 0;

  // Discrete steps, held: the counter is an iteration index, not a clock.
  const top = Math.round(params.depth);
  const n = params.run ? Math.min(top, Math.floor(u * (top + 1))) : Math.round(params.iteration);

  const key = `${n}|${params.albedo}|${params.emission}`;
  if (key !== lastKey) {
    lastKey = key;
    refreshMaterials(params.albedo, params.emission);

    iterate(0, n);
    iterate(1, n);

    for (let which = 0; which < 2; which++) {
      const src = current[which];
      for (let i = 0; i < M; i++) {
        const o = (which * M + i) * 4;
        radianceData[o] = src[3 * i];
        radianceData[o + 1] = src[3 * i + 1];
        radianceData[o + 2] = src[3 * i + 2];
        radianceData[o + 3] = 1;
      }
    }
    radianceTex.needsUpdate = true;

    // The composition that produced each picture, rather than a count of them —
    // until the nesting outgrows the line, at which point a count takes over.
    const spelled = n <= WRITTEN_OUT;
    countLabel.visible = !spelled;
    for (const l of compLabels) l.visible = spelled;
    if (spelled) {
      setComposition(compLabels[0], composition('A', n));
      setComposition(compLabels[1], composition('B', n));
    } else {
      setText(countLabel, `${n} iterations`);
    }
  }

  fieldMat.uniforms.uExposure.value = params.exposure;

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

// A sanity line in the console rather than on the slide: how far the row sums
// were from 1 before normalising, which is the discretisation's own error.
console.info(`fixed-point: worst row-sum error before normalising ${rowSumError.toFixed(4)}`);
