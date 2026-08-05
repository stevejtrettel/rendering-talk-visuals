/**
 * With nothing emitting, the room forgets: iterating T alone runs to black.
 *
 * One room, brightly lit to begin with and no emitters anywhere. Each step
 * applies T — travel and scatter, once. Every round some light is absorbed, so
 * ‖T‖ ≤ c < 1 and the whole field goes to zero. This is the hypothesis behind
 * the fixed point: it is why the starting field in `fixed-point` is forgotten,
 * and why iterating E + T· converges at all.
 *
 * ## Why some of it lingers
 *
 * The two side walls are near-white and absorb almost nothing; the floor,
 * ceiling and object are dark. So light bouncing across the room between the
 * bright walls survives many rounds, while everything else is gone in two or
 * three. The room does not fade uniformly — it fades to a *shape*, the corridor
 * between the two pale walls, and only then dies.
 *
 * That shape is not arbitrary: iterating any operator drives whatever you
 * started with towards its slowest-decaying mode, and here that mode lives
 * where the least is absorbed. The starting field was flat white, so nothing
 * about the pattern you end up watching came from the seed — it is the room's.
 *
 * A specular mirror would be the natural thing to reach for, and it is not
 * available: this operator moves light patch to patch diffusely, and a mirror
 * needs a direction. But what makes light persist is not being absorbed, which
 * is exactly what a high albedo gives, so the near-white walls do the job the
 * mirror was wanted for.
 *
 * ## Iterations, not seconds
 *
 * The counter steps and the picture jumps. Nothing here is happening over time;
 * the model is stationary, and iterating is a way of computing.
 */

import * as THREE from 'three';
import { createStage, createUI, C } from '@';
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

const RX = 2.55;
const RY = 2.0;
const WALL = 0.16;
const DISC = { x: -0.7, y: -0.75, r: 0.62 };
const ROOM_Y = 0.15;

const NW = 40;
const ND = 52;
const M = 4 * NW + ND;

/**
 * Material per side, in the order the patches are laid out: floor, right wall,
 * ceiling, left wall, object. The two side walls are the pale ones.
 */
const MAT_COLOR = [
  0x6f8f5c, // floor, moss — the absorber
  0xd9d1c2, // right wall, bone
  0xd9d1c2, // ceiling, bone
  0xd9d1c2, // left wall, bone
  0x4c82ad, // object, blue
];

/** How much each material keeps. The pale walls are the slow ones. */
const MAT_ALBEDO = [0.15, 1, 1, 1, 0.12];
/**
 * Which materials the `albedo` control drives. Only the floor and the object
 * absorb: with a larger share of the room dark, light bouncing between the pale
 * walls keeps landing on something absorbing, the dominant eigenvalue drops far
 * below the pale albedo, and the whole room is black in three steps with no
 * lingering to see.
 */
const PALE = [false, true, true, true, false];

function rgbOf(hex: number): [number, number, number] {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}
const MAT_RGB = MAT_COLOR.map(rgbOf);

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
    patches.push({ x, y, nx, ny, ds, mat: side });
  }
}

for (let k = 0; k < ND; k++) {
  const a = (2 * Math.PI * (k + 0.5)) / ND - Math.PI;
  const nx = Math.cos(a);
  const ny = Math.sin(a);
  patches.push({
    x: DISC.x + DISC.r * nx,
    y: DISC.y + DISC.r * ny,
    nx,
    ny,
    ds: (2 * Math.PI * DISC.r) / ND,
    mat: 4,
  });
}

function blocked(a: Patch, b: Patch): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return true;
  const ux = dx / len;
  const uy = dy / len;
  const ox = a.x - DISC.x;
  const oy = a.y - DISC.y;
  const t = -(ox * ux + oy * uy);
  if (t <= 0 || t >= len) return false;
  return Math.hypot(ox + ux * t, oy + uy * t) < DISC.r - 1e-3;
}

// ---------------------------------------------------------------------------
// The operator — the same 2D kernel as `fixed-point`, with no emission term
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

const albedo = new Float32Array(M * 3);

function refreshMaterials(paleAlbedo: number): void {
  for (let i = 0; i < M; i++) {
    const m = patches[i].mat;
    const scale = PALE[m] ? paleAlbedo : MAT_ALBEDO[m];
    for (let c = 0; c < 3; c++) albedo[3 * i + c] = MAT_RGB[m][c] * scale;
  }
}

/** One application of T: travel, then scatter. No emission anywhere. */
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
    dst[3 * i] = albedo[3 * i] * r;
    dst[3 * i + 1] = albedo[3 * i + 1] * g;
    dst[3 * i + 2] = albedo[3 * i + 2] * b;
  }
}

/** Flat white: the room starts uniformly bright, so the pattern that survives
 *  cannot have come from the starting field. */
function seed(out: Float32Array): void {
  out.fill(1);
}

const bufA = new Float32Array(M * 3);
const bufB = new Float32Array(M * 3);
const currentField = new Float32Array(M * 3);

function iterate(n: number): void {
  let a = bufA;
  let b = bufB;
  seed(a);
  for (let k = 0; k < n; k++) {
    applyOperator(a, b);
    const t = a;
    a = b;
    b = t;
  }
  currentField.set(a);
}

// ---------------------------------------------------------------------------
// The renderer
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
  const float ROOM_Y = ${ROOM_Y.toFixed(4)};
  const int NW = ${NW};
  const int ND = ${ND};
  const int M = ${M};
  const int GATHER = 64;

  int patchOfWall(vec2 q) {
    if (q.y <= -RY + 1e-3) return int(clamp(floor((q.x + RX) / (2.0 * RX) * float(NW)), 0.0, float(NW - 1)));
    if (q.x >= RX - 1e-3) return NW + int(clamp(floor((q.y + RY) / (2.0 * RY) * float(NW)), 0.0, float(NW - 1)));
    if (q.y >= RY - 1e-3) return 2 * NW + int(clamp(floor((RX - q.x) / (2.0 * RX) * float(NW)), 0.0, float(NW - 1)));
    return 3 * NW + int(clamp(floor((RY - q.y) / (2.0 * RY) * float(NW)), 0.0, float(NW - 1)));
  }

  int patchOfDisc(vec2 n) {
    float a = atan(n.y, n.x) + 3.14159265;
    return 4 * NW + int(clamp(floor(a / 6.2831853 * float(ND)), 0.0, float(ND - 1)));
  }

  vec3 radianceOf(int idx) {
    return texture(uRad, vec2((float(idx) + 0.5) / float(M), 0.5)).rgb;
  }

  vec3 alongRay(vec2 p, vec2 dir) {
    float best = 1e9;
    int idx = -1;

    vec2 oc = p - DISC;
    float b = dot(oc, dir);
    float c = dot(oc, oc) - DISC_R * DISC_R;
    float d = b * b - c;
    if (d > 0.0) {
      float t = -b - sqrt(d);
      if (t > 1e-4) {
        best = t;
        idx = patchOfDisc(normalize(p + dir * t - DISC));
      }
    }

    float tx = dir.x > 1e-6 ? (RX - p.x) / dir.x : (dir.x < -1e-6 ? (-RX - p.x) / dir.x : 1e9);
    float ty = dir.y > 1e-6 ? (RY - p.y) / dir.y : (dir.y < -1e-6 ? (-RY - p.y) / dir.y : 1e9);
    float tw = min(tx, ty);
    if (tw < best) idx = patchOfWall(p + dir * tw);

    return idx < 0 ? vec3(0.0) : radianceOf(idx);
  }

  void main() {
    vec2 wp = mix(uMin, uMax, vUv);
    vec2 p = wp - vec2(0.0, ROOM_Y);

    if (abs(p.x) > RX + WALL || abs(p.y) > RY + WALL) {
      fragColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }

    vec3 col;
    if (abs(p.x) > RX || abs(p.y) > RY) {
      col = radianceOf(patchOfWall(vec2(clamp(p.x, -RX, RX), clamp(p.y, -RY, RY))));
    } else if (length(p - DISC) < DISC_R) {
      vec2 n = normalize(p - DISC);
      col = radianceOf(patchOfDisc(n)) * (0.35 + 0.65 * length(p - DISC) / DISC_R);
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
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
  depthBuffer: false,
});

const screen = new THREE.Mesh(
  new THREE.PlaneGeometry(2 * HALF_W, 2 * ORTHO_H),
  new THREE.MeshBasicMaterial({ map: target.texture }),
);
screen.position.z = -1;
stage.add(screen);

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

stage.add(
  label('no emitters', {
    size: 0.22,
    color: C.bone,
    anchorX: 'center',
    position: [0, ROOM_Y + RY + 0.3, 0],
  }),
);

const MAX_N = 16;
const iterLabel = label('', {
  size: 0.3,
  color: C.ochre,
  anchorX: 'center',
  position: [0, ROOM_Y - RY - 0.75, 0],
});
stage.add(iterLabel);

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

const params = {
  run: true,
  iteration: 4,
  albedo: 0.9,
  exposure: 1.3,
  resolution: 0.45,
};
ui.params.add(params, 'run').name('step through iterations');
ui.params.add(params, 'iteration', 0, MAX_N, 1).name('iteration');
ui.params.add(params, 'albedo', 0.5, 1, 0.01).name('pale wall albedo');
ui.params.add(params, 'exposure', 0.2, 3, 0.05).name('exposure');
ui.params.add(params, 'resolution', 0.15, 1, 0.05).name('render resolution');

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

const bufSize = new THREE.Vector2();
let lastKey = '';

stage.frame((t) => {
  const u = stage.duration > 0 ? (t % stage.duration) / stage.duration : 0;
  const n = params.run ? Math.min(MAX_N, Math.floor(u * (MAX_N + 1))) : Math.round(params.iteration);

  const key = `${n}|${params.albedo}`;
  if (key !== lastKey) {
    lastKey = key;
    refreshMaterials(params.albedo);
    iterate(n);
    for (let i = 0; i < M; i++) {
      radianceData[4 * i] = currentField[3 * i];
      radianceData[4 * i + 1] = currentField[3 * i + 1];
      radianceData[4 * i + 2] = currentField[3 * i + 2];
      radianceData[4 * i + 3] = 1;
    }
    radianceTex.needsUpdate = true;
    setText(iterLabel, n === 1 ? '1 iteration' : `${n} iterations`);
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

console.info(`light-dies-out: worst row-sum error before normalising ${rowSumError.toFixed(4)}`);
