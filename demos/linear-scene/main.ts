/**
 * The scene is a linear map: one lamp, then the other, then both.
 *
 * Three copies of the same room, lit by lamp A, by lamp B, and by both. The
 * third picture is the sum of the first two — not by construction, but as a
 * result: every panel is simulated on its own, with no arithmetic between them.
 * The lamps orbit as the loop runs, so the identity is seen holding across a
 * whole family of configurations rather than in one lucky arrangement.
 *
 * ## What is drawn
 *
 * For a point inside the room, how much light arrives there: direct light from
 * whichever lamps that panel has, with a real visibility test against the
 * object, plus one bounce gathered over the surrounding surfaces so the walls
 * bleed their colour into the air. Surfaces are shaded by what reaches them.
 * There is no camera in a 2D room, so this field *is* the photograph, and it is
 * a linear functional of the light field — superposing pictures is superposing
 * light fields.
 *
 * ## Spectra, and the RGB proxy
 *
 * The pictures are computed in three channels, because a per-pixel spectral
 * render of three rooms is not worth what it costs here. But the three channels
 * are integrated from the same spectral data as everything else in the deck —
 * each surface's reflectance and each lamp's Planck curve, averaged over three
 * bands — rather than invented as colours.
 *
 * The spectral claim is made spectrally, at the probe. That point is marked in
 * all three rooms and its full spectrum is computed at 64 wavelengths, three
 * times over: with lamp A alone, with lamp B alone, and with both. Each goes
 * under the room it belongs to, on one shared scale, so the plots say what the
 * pictures above them say. The third carries all three curves: A and B thin,
 * and the *separately computed* both-lamps spectrum over them. It runs exactly
 * where their sum would be. If it ever did not, the gap would be the
 * interference term, and it would be visible.
 */

import * as THREE from 'three';
import { createStage, createUI, C, flat, css } from '@';
import { polyline, setPolyline, type Pt } from '@/lines';
import { label, setText, fixed } from '@/text';
import { room } from '@/scene2d';

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
// The room, in room coordinates. Each panel is this room, offset.
// ---------------------------------------------------------------------------

// The continuous version of the shared room, at the scale that fits three
// across the frame. Same shape as the discretised demos, smooth object.
const ROOM = room(1.35);
const RX = ROOM.rx; // half width
const RY = ROOM.ry; // half height
const WALL = ROOM.wall; // drawn thickness of the walls

const DISC = { x: ROOM.disc.x, y: ROOM.disc.y, r: ROOM.disc.r };
const LAMP_R = 0.1;
// Placed where lamp A's shadow sweeps over it for about half the orbit, while
// lamp B always sees it: the interesting case, where one contribution nearly
// vanishes and the total drops to match.
const PROBE = { x: 0.25, y: -0.95 };

const PANEL_X = [-3.55, 0, 3.55];
const PANEL_Y = 0.95;

/** Lamp positions at loop fraction u, in room coordinates. */
function lampA(u: number): { x: number; y: number } {
  const a = u * Math.PI * 2;
  return { x: -0.62 + 0.34 * Math.sin(a), y: 0.74 + 0.13 * Math.cos(a) };
}
function lampB(u: number): { x: number; y: number } {
  const a = u * Math.PI * 2 + 1.9;
  return { x: 0.72 + 0.32 * Math.cos(a), y: 0.5 + 0.26 * Math.sin(a) };
}

// ---------------------------------------------------------------------------
// Spectra
// ---------------------------------------------------------------------------

const WL0 = 400;
const WL1 = 700;
const NS = 64;
const wavelength = (i: number) => WL0 + ((WL1 - WL0) * i) / NS;

const bell = (l: number, c: number, w: number) => Math.exp(-0.5 * ((l - c) / w) ** 2);

/** Same pigments as the radiance demos, so the rooms are recognisably the same. */
const REFL = [
  (l: number) => 0.05 + 0.85 * bell(l, 545, 40), // 0 floor, moss
  (l: number) => 0.05 + 0.9 * bell(l, 640, 48), // 1 left wall, rust
  (l: number) => 0.16 + 0.4 * bell(l, 485, 65), // 2 right wall, slate
  (l: number) => 0.5 + 0.15 * bell(l, 600, 120), // 3 ceiling, bone
  (l: number) => 0.04 + 0.85 * bell(l, 462, 40), // 4 the object, blue
];

function planck(nm: number, T: number): number {
  const l = nm * 1e-9;
  return 3.7418e-16 / (l ** 5 * (Math.exp(1.4388e-2 / (l * T)) - 1));
}

/** A lamp spectrum at temperature T, normalised to peak 1 in the visible band. */
function lampSpectrum(T: number): Float32Array {
  const out = new Float32Array(NS + 1);
  let peak = 1e-9;
  for (let i = 0; i <= NS; i++) {
    out[i] = planck(wavelength(i), T);
    peak = Math.max(peak, out[i]);
  }
  for (let i = 0; i <= NS; i++) out[i] /= peak;
  return out;
}

// One warm lamp and one cool one, so the two panels are told apart at a glance
// and the third shows where each of them reaches.
const SPEC_A = lampSpectrum(2900);
const SPEC_B = lampSpectrum(9000);

const REFL_TABLE = REFL.map((f) => {
  const t = new Float32Array(NS + 1);
  for (let i = 0; i <= NS; i++) t[i] = f(wavelength(i));
  return t;
});

/**
 * Three broad bands, so the shader's colours come out of the same spectra the
 * probe panel plots rather than being chosen by hand.
 */
function toRGB(spec: Float32Array): [number, number, number] {
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
        sum += spec[i];
        n++;
      }
    }
    return n > 0 ? sum / n : 0;
  }) as [number, number, number];
}

const RGB_REFL = REFL_TABLE.map(toRGB);
const RGB_A = toRGB(SPEC_A);
const RGB_B = toRGB(SPEC_B);

// ---------------------------------------------------------------------------
// The lighting model, shared by the shader and the probe
// ---------------------------------------------------------------------------

/** Radiant power of a lamp. Arbitrary units; sets the exposure. */
const POWER = 0.42;
/** A small floor standing in for the bounces past the first. */
/**
 * How much of the gathered light the open air shows. The air is not actually
 * luminous — this whole field is a visualisation — and at full strength the
 * gather is near-uniform and turns every room into milk. Held well down, the
 * direct term keeps its shadows and the bounce only tints them.
 */
const AIR_FILL = 0.2;
const AMBIENT = 0.035;
/** Directions in the one-bounce gather. Must match the shader. */
const GATHER = 20;

// ---------------------------------------------------------------------------
// The shader
// ---------------------------------------------------------------------------

const FRAG = /* glsl */ `
  precision highp float;
  layout(location = 0) out vec4 fragColor;

  uniform vec2 uMin;
  uniform vec2 uMax;
  uniform vec2 uLampA;
  uniform vec2 uLampB;
  uniform vec3 uColA;
  uniform vec3 uColB;
  uniform vec3 uRefl[5];
  uniform float uExposure;

  varying vec2 vUv;

  const float RX = ${RX.toFixed(4)};
  const float RY = ${RY.toFixed(4)};
  const float WALL = ${WALL.toFixed(4)};
  const vec2 DISC = vec2(${DISC.x.toFixed(4)}, ${DISC.y.toFixed(4)});
  const float DISC_R = ${DISC.r.toFixed(4)};
  const float LAMP_R = ${LAMP_R.toFixed(4)};
  const float POWER = ${POWER.toFixed(4)};
  const float AMBIENT = ${AMBIENT.toFixed(4)};
  const float AIR_FILL = ${AIR_FILL.toFixed(4)};
  const int GATHER = ${GATHER};
  const float PANEL_Y = ${PANEL_Y.toFixed(4)};

  /** Does the segment from a to b pass through the object? */
  bool hitsDisc(vec2 a, vec2 b) {
    vec2 d = b - a;
    float len = length(d);
    if (len < 1e-6) return false;
    vec2 dir = d / len;
    vec2 oc = a - DISC;
    float t = -dot(oc, dir);
    if (t < 0.0 || t > len) return dot(oc, oc) < DISC_R * DISC_R;
    return length(oc + dir * t) < DISC_R;
  }

  /**
   * Nearest surface along the ray from p in direction dir. Returns the hit
   * point, its inward normal and which reflectance it carries. The room is
   * closed, so from anywhere inside there is always a hit.
   */
  void traceRoom(vec2 p, vec2 dir, out vec2 q, out vec2 n, out int id) {
    // The object first, then whichever wall the ray would reach.
    float best = 1e9;
    id = -1;

    vec2 oc = p - DISC;
    float b = dot(oc, dir);
    float c = dot(oc, oc) - DISC_R * DISC_R;
    float disc = b * b - c;
    if (disc > 0.0) {
      float t = -b - sqrt(disc);
      if (t > 1e-4) {
        best = t;
        id = 4;
        q = p + dir * t;
        n = normalize(q - DISC);
      }
    }

    // Walls: x = ±RX, y = ±RY, with the inward normal.
    float tx = dir.x > 1e-6 ? (RX - p.x) / dir.x : (dir.x < -1e-6 ? (-RX - p.x) / dir.x : 1e9);
    float ty = dir.y > 1e-6 ? (RY - p.y) / dir.y : (dir.y < -1e-6 ? (-RY - p.y) / dir.y : 1e9);
    float tw = min(tx, ty);
    if (tw < best) {
      q = p + dir * tw;
      if (tx < ty) {
        n = vec2(dir.x > 0.0 ? -1.0 : 1.0, 0.0);
        id = dir.x > 0.0 ? 2 : 1; // right wall slate, left wall rust
      } else {
        n = vec2(0.0, dir.y > 0.0 ? -1.0 : 1.0);
        id = dir.y > 0.0 ? 3 : 0; // ceiling bone, floor moss
      }
    }
  }

  /** Irradiance arriving at a surface point q with normal n, per channel. */
  vec3 surfaceIrradiance(vec2 q, vec2 n, vec2 w) {
    vec3 e = vec3(AMBIENT);
    if (w.x > 0.0) {
      vec2 d = uLampA - q;
      float dist = length(d);
      float cosT = max(0.0, dot(n, d / dist));
      if (cosT > 0.0 && !hitsDisc(q + n * 1e-3, uLampA)) {
        e += uColA * (w.x * POWER * cosT / dist);
      }
    }
    if (w.y > 0.0) {
      vec2 d = uLampB - q;
      float dist = length(d);
      float cosT = max(0.0, dot(n, d / dist));
      if (cosT > 0.0 && !hitsDisc(q + n * 1e-3, uLampB)) {
        e += uColB * (w.y * POWER * cosT / dist);
      }
    }
    return e;
  }

  /** What a surface point sends back into the room. */
  vec3 surfaceRadiance(vec2 q, vec2 n, int id, vec2 w) {
    return uRefl[id] * surfaceIrradiance(q, n, w);
  }

  /** Light arriving at a point in the open air of the room. */
  vec3 airRadiance(vec2 p, vec2 w) {
    vec3 e = vec3(0.0);

    // Direct, with a real shadow test against the object.
    if (w.x > 0.0 && !hitsDisc(p, uLampA)) {
      e += uColA * (w.x * POWER / max(length(uLampA - p), 0.05));
    }
    if (w.y > 0.0 && !hitsDisc(p, uLampB)) {
      e += uColB * (w.y * POWER / max(length(uLampB - p), 0.05));
    }

    // One bounce: what the surrounding surfaces are sending back.
    vec3 g = vec3(0.0);
    for (int k = 0; k < GATHER; k++) {
      float a = 6.2831853 * (float(k) + 0.5) / float(GATHER);
      vec2 dir = vec2(cos(a), sin(a));
      vec2 q; vec2 n; int id;
      traceRoom(p, dir, q, n, id);
      if (id >= 0) g += surfaceRadiance(q, n, id, w);
    }
    e += AIR_FILL * g / float(GATHER);
    return e;
  }

  void main() {
    vec2 wp = mix(uMin, uMax, vUv);

    // Which of the three rooms this pixel belongs to, and which lamps it has.
    int idx = wp.x < -1.775 ? 0 : (wp.x < 1.775 ? 1 : 2);
    float px = idx == 0 ? ${PANEL_X[0].toFixed(4)} : (idx == 1 ? ${PANEL_X[1].toFixed(4)} : ${PANEL_X[2].toFixed(4)});
    vec2 w = idx == 0 ? vec2(1.0, 0.0) : (idx == 1 ? vec2(0.0, 1.0) : vec2(1.0, 1.0));
    vec2 p = wp - vec2(px, PANEL_Y);

    // Outside the room entirely.
    if (abs(p.x) > RX + WALL || abs(p.y) > RY + WALL) {
      fragColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }

    vec3 col;

    if (abs(p.x) > RX || abs(p.y) > RY) {
      // In the wall band: shade by the wall surface just inside it.
      vec2 q = vec2(clamp(p.x, -RX, RX), clamp(p.y, -RY, RY));
      vec2 n;
      int id;
      if (abs(p.x) > RX) {
        n = vec2(p.x > 0.0 ? -1.0 : 1.0, 0.0);
        id = p.x > 0.0 ? 2 : 1;
      } else {
        n = vec2(0.0, p.y > 0.0 ? -1.0 : 1.0);
        id = p.y > 0.0 ? 3 : 0;
      }
      col = surfaceRadiance(q, n, id, w);
    } else if (length(p - DISC) < DISC_R) {
      // Inside the object: shade by the nearest point of its surface, which is
      // what makes it read as a lit solid rather than a hole.
      vec2 n = normalize(p - DISC);
      // Fading towards the centre kills the seam where the nearest-boundary
      // direction flips, and reads as a rounded solid rather than a flat disc.
      float shade = 0.3 + 0.7 * length(p - DISC) / DISC_R;
      col = surfaceRadiance(DISC + n * DISC_R, n, 4, w) * shade;
    } else if (w.x > 0.0 && length(p - uLampA) < LAMP_R) {
      col = uColA * 1.7;
    } else if (w.y > 0.0 && length(p - uLampB) < LAMP_R) {
      col = uColB * 1.7;
    } else if ((w.x < 0.5 && length(p - uLampA) < LAMP_R) ||
               (w.y < 0.5 && length(p - uLampB) < LAMP_R)) {
      // A lamp this panel does not have: drawn as a dark fixture, so the setup
      // is legible without a caption.
      col = vec3(0.06);
    } else {
      col = airRadiance(p, w);
    }

    col *= uExposure;
    fragColor = vec4(pow(col, vec3(0.75)), 1.0);
  }
`;

const fieldMat = new THREE.ShaderMaterial({
  glslVersion: THREE.GLSL3,
  uniforms: {
    uMin: { value: new THREE.Vector2(-HALF_W, -ORTHO_H) },
    uMax: { value: new THREE.Vector2(HALF_W, ORTHO_H) },
    uLampA: { value: new THREE.Vector2() },
    uLampB: { value: new THREE.Vector2() },
    uColA: { value: new THREE.Vector3(...RGB_A) },
    uColB: { value: new THREE.Vector3(...RGB_B) },
    uRefl: { value: RGB_REFL.map((c) => new THREE.Vector3(...c)) },
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
// The probe, computed spectrally
// ---------------------------------------------------------------------------

interface Hit {
  qx: number;
  qy: number;
  nx: number;
  ny: number;
  id: number;
}

/** The JS twin of `traceRoom`. Kept deliberately in step with it. */
function traceRoom(px: number, py: number, dx: number, dy: number): Hit {
  let best = 1e9;
  let hit: Hit = { qx: px, qy: py, nx: 0, ny: 1, id: 0 };

  const ox = px - DISC.x;
  const oy = py - DISC.y;
  const b = ox * dx + oy * dy;
  const c = ox * ox + oy * oy - DISC.r * DISC.r;
  const disc = b * b - c;
  if (disc > 0) {
    const t = -b - Math.sqrt(disc);
    if (t > 1e-4) {
      best = t;
      const qx = px + dx * t;
      const qy = py + dy * t;
      hit = { qx, qy, nx: (qx - DISC.x) / DISC.r, ny: (qy - DISC.y) / DISC.r, id: 4 };
    }
  }

  const tx = dx > 1e-6 ? (RX - px) / dx : dx < -1e-6 ? (-RX - px) / dx : 1e9;
  const ty = dy > 1e-6 ? (RY - py) / dy : dy < -1e-6 ? (-RY - py) / dy : 1e9;
  const tw = Math.min(tx, ty);
  if (tw < best) {
    const qx = px + dx * tw;
    const qy = py + dy * tw;
    hit =
      tx < ty
        ? { qx, qy, nx: dx > 0 ? -1 : 1, ny: 0, id: dx > 0 ? 2 : 1 }
        : { qx, qy, nx: 0, ny: dy > 0 ? -1 : 1, id: dy > 0 ? 3 : 0 };
  }
  return hit;
}

function hitsDisc(ax: number, ay: number, bx: number, by: number): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return false;
  const ux = dx / len;
  const uy = dy / len;
  const ox = ax - DISC.x;
  const oy = ay - DISC.y;
  const t = -(ox * ux + oy * uy);
  if (t < 0 || t > len) return ox * ox + oy * oy < DISC.r * DISC.r;
  return Math.hypot(ox + ux * t, oy + uy * t) < DISC.r;
}

interface LampState {
  x: number;
  y: number;
  spec: Float32Array;
  w: number;
}

/**
 * The spectrum of the light arriving at the probe: direct from whichever lamps
 * are on, plus one bounce off the surrounding surfaces. The same model as the
 * shader, at 64 wavelengths instead of three channels.
 */
function probeSpectrum(lamps: LampState[], out: Float32Array): void {
  out.fill(0);

  for (const l of lamps) {
    if (l.w <= 0) continue;
    if (hitsDisc(PROBE.x, PROBE.y, l.x, l.y)) continue;
    const f = (l.w * POWER) / Math.max(Math.hypot(l.x - PROBE.x, l.y - PROBE.y), 0.05);
    for (let i = 0; i <= NS; i++) out[i] += f * l.spec[i];
  }

  for (let k = 0; k < GATHER; k++) {
    const a = (2 * Math.PI * (k + 0.5)) / GATHER;
    const hit = traceRoom(PROBE.x, PROBE.y, Math.cos(a), Math.sin(a));
    const refl = REFL_TABLE[hit.id];

    // Irradiance on that surface patch, per lamp, then reflected.
    let ambient = AMBIENT;
    for (const l of lamps) {
      if (l.w <= 0) continue;
      const dx = l.x - hit.qx;
      const dy = l.y - hit.qy;
      const dist = Math.hypot(dx, dy);
      const cosT = (hit.nx * dx + hit.ny * dy) / dist;
      if (cosT <= 0) continue;
      if (hitsDisc(hit.qx + hit.nx * 1e-3, hit.qy + hit.ny * 1e-3, l.x, l.y)) continue;
      const f = (l.w * POWER * cosT) / dist / GATHER;
      for (let i = 0; i <= NS; i++) out[i] += AIR_FILL * f * refl[i] * l.spec[i];
    }
    ambient /= GATHER;
    for (let i = 0; i <= NS; i++) out[i] += AIR_FILL * ambient * refl[i];
  }
}

// ---------------------------------------------------------------------------
// Scenery: probe rings, labels, the spectrum panel
// ---------------------------------------------------------------------------

function ring(cx: number, cy: number, r: number, color: number) {
  const pts: Pt[] = [];
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a), 0]);
  }
  return polyline(pts, { color, width: 3 });
}

for (const px of PANEL_X) {
  const r = ring(px + PROBE.x, PANEL_Y + PROBE.y, 0.075, C.bone);
  r.renderOrder = 5;
  stage.add(r);
}

const CAPTIONS = ['lamp A', 'lamp B', 'both'];
PANEL_X.forEach((px, i) => {
  stage.add(
    label(CAPTIONS[i], {
      size: 0.2,
      color: C.bone,
      anchorX: 'center',
      position: [px, PANEL_Y + RY + 0.22, 0],
    }),
  );
});

for (const [x, sym] of [
  [(PANEL_X[0] + PANEL_X[1]) / 2, '+'],
  [(PANEL_X[1] + PANEL_X[2]) / 2, '='],
] as [number, string][]) {
  stage.add(
    label(sym, {
      size: 0.42,
      color: C.slate,
      anchorX: 'center',
      anchorY: 'middle',
      position: [x, PANEL_Y, 0],
    }),
  );
}

// --- three spectrum plots, one under each room -----------------------------
//
// One stacked chart was the wrong idiom: in a stack, the upper band's top edge
// is the *total*, so lamp B's own spectrum never appears as a curve and the eye
// reads the boundary between the colours as B. Three plots on one scale,
// aligned under the rooms they belong to, say the same thing as the pictures
// above them — and the third can carry the check on its own.

const PLOT_HALF_W = 1.25;
const PLOT_Y0 = -2.45; // baseline
const PLOT_H = 1.45; // world height of the tallest curve

const plotX = (panel: number, i: number) =>
  PANEL_X[panel] - PLOT_HALF_W + (2 * PLOT_HALF_W * i) / NS;

let sScale = 1; // world height per unit of spectral radiance, set on the fly

for (let p = 0; p < 3; p++) {
  stage.add(
    polyline(
      [
        [PANEL_X[p] - PLOT_HALF_W, PLOT_Y0, 0],
        [PANEL_X[p] + PLOT_HALF_W, PLOT_Y0, 0],
      ],
      { color: C.slateDeep, width: 2 },
    ),
  );
  // Ticks on every plot so the axes are visibly the same, numbers on the first
  // one only — three copies of "400 500 600 700" is noise.
  for (const nm of [400, 500, 600, 700]) {
    const x = plotX(p, ((nm - WL0) / (WL1 - WL0)) * NS);
    stage.add(
      polyline(
        [
          [x, PLOT_Y0 - 0.06, 0],
          [x, PLOT_Y0, 0],
        ],
        { color: C.slateDeep, width: 2 },
      ),
    );
    if (p === 0) {
      stage.add(
        label(String(nm), {
          size: 0.14,
          color: C.slate,
          anchorX: 'center',
          anchorY: 'top',
          position: [x, PLOT_Y0 - 0.1, 0],
        }),
      );
    }
  }
}

stage.add(
  label('the spectrum at the marked point', {
    size: 0.18,
    color: C.slate,
    anchorX: 'center',
    position: [PANEL_X[1], PLOT_Y0 - 0.5, 0],
  }),
);

/** A filled area under a curve, rebuilt in place each frame. */
function makeBand(color: number, opacity: number) {
  const geom = new THREE.BufferGeometry();
  const pos = new Float32Array((NS + 1) * 2 * 3);
  geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const index: number[] = [];
  for (let i = 0; i < NS; i++) {
    index.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
  }
  geom.setIndex(index);
  const mesh = new THREE.Mesh(
    geom,
    flat(color, { transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false }),
  );
  mesh.renderOrder = 3;
  stage.add(mesh);
  return { geom, pos };
}

function makeCurve(color: number, width: number) {
  const line = polyline(
    Array.from({ length: NS + 1 }, () => [0, 0, 0] as Pt),
    { color, width },
  );
  line.renderOrder = 4;
  stage.add(line);
  return line;
}

const OCHRE = 0xd4a63f;
const COOL = 0x6f9ec4;

// Plot 0: lamp A alone. Plot 1: lamp B alone. Plot 2: both, with A and B shown
// underneath as the two shapes that make it up.
const bandPlotA = makeBand(OCHRE, 0.3);
const bandPlotB = makeBand(COOL, 0.3);
const bandSumA = makeBand(OCHRE, 0.3);
const bandSumB = makeBand(COOL, 0.3);

const curveA = makeCurve(OCHRE, 3);
const curveB = makeCurve(COOL, 3);
const curveSumA = makeCurve(OCHRE, 2);
const curveSumB = makeCurve(COOL, 2);
const totalLine = makeCurve(C.bone, 4);

// Only the third plot needs a key, since it is the one carrying three curves.
stage.add(
  label('both', {
    size: 0.14,
    color: C.bone,
    position: [PANEL_X[2] - PLOT_HALF_W + 0.06, PLOT_Y0 + PLOT_H + 0.06, 0],
  }),
  label('A and B alone', {
    size: 0.14,
    color: C.slate,
    position: [PANEL_X[2] - PLOT_HALF_W + 0.06, PLOT_Y0 + PLOT_H - 0.14, 0],
  }),
);

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

const params = {
  move: true,
  phase: 0,
  exposure: 1.1,
  resolution: 0.5,
};
ui.params.add(params, 'move').name('move the lamps');
ui.params.add(params, 'phase', 0, 1, 0.001).name('lamp positions');
ui.params.add(params, 'exposure', 0.2, 3, 0.05).name('exposure');
ui.params.add(params, 'resolution', 0.15, 1, 0.05).name('render resolution');

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

const specA = new Float32Array(NS + 1);
const specB = new Float32Array(NS + 1);
const specBoth = new Float32Array(NS + 1);
const mkPts = () => Array.from({ length: NS + 1 }, () => [0, 0, 0] as Pt);
const ptsA = mkPts();
const ptsB = mkPts();
const ptsSumA = mkPts();
const ptsSumB = mkPts();
const totalPts = mkPts();
const bufSize = new THREE.Vector2();

stage.frame((t) => {
  const u = stage.duration > 0 ? (t % stage.duration) / stage.duration : 0;
  const phase = params.move ? u : params.phase;

  const A = lampA(phase);
  const B = lampB(phase);

  fieldMat.uniforms.uLampA.value.set(A.x, A.y);
  fieldMat.uniforms.uLampB.value.set(B.x, B.y);
  fieldMat.uniforms.uExposure.value = params.exposure;

  stage.renderer.getDrawingBufferSize(bufSize);
  const fw = Math.max(64, Math.round(bufSize.x * params.resolution));
  const fh = Math.max(36, Math.round(bufSize.y * params.resolution));
  if (target.width !== fw || target.height !== fh) target.setSize(fw, fh);

  const prev = stage.renderer.getRenderTarget();
  stage.renderer.setRenderTarget(target);
  stage.renderer.render(fieldScene, fieldCam);
  stage.renderer.setRenderTarget(prev);

  // --- the probe, three independent computations ---------------------------
  const lampsA: LampState[] = [
    { x: A.x, y: A.y, spec: SPEC_A, w: 1 },
    { x: B.x, y: B.y, spec: SPEC_B, w: 0 },
  ];
  const lampsB: LampState[] = [
    { x: A.x, y: A.y, spec: SPEC_A, w: 0 },
    { x: B.x, y: B.y, spec: SPEC_B, w: 1 },
  ];
  const lampsBoth: LampState[] = [
    { x: A.x, y: A.y, spec: SPEC_A, w: 1 },
    { x: B.x, y: B.y, spec: SPEC_B, w: 1 },
  ];
  probeSpectrum(lampsA, specA);
  probeSpectrum(lampsB, specB);
  probeSpectrum(lampsBoth, specBoth);

  // One scale for all three plots — the whole point is that heights compare —
  // set by the largest total seen, and allowed to relax slowly so the curves
  // settle rather than breathing as the lamps move.
  let peak = 1e-6;
  for (let i = 0; i <= NS; i++) peak = Math.max(peak, specBoth[i]);
  sScale = Math.max(sScale * 0.995, PLOT_H / (peak * 1.1));

  const setBand = (
    band: { geom: THREE.BufferGeometry; pos: Float32Array },
    panel: number,
    i: number,
    top: number,
    bottom: number,
  ) => {
    const x = plotX(panel, i);
    band.pos[6 * i] = x;
    band.pos[6 * i + 1] = top;
    band.pos[6 * i + 3] = x;
    band.pos[6 * i + 4] = bottom;
  };

  for (let i = 0; i <= NS; i++) {
    const hA = specA[i] * sScale;
    const hB = specB[i] * sScale;
    const hT = specBoth[i] * sScale;

    setBand(bandPlotA, 0, i, PLOT_Y0 + hA, PLOT_Y0);
    setBand(bandPlotB, 1, i, PLOT_Y0 + hB, PLOT_Y0);
    // In the third plot the two contributions sit on the same baseline rather
    // than stacked, so each is its own shape and the total rides above both.
    setBand(bandSumA, 2, i, PLOT_Y0 + hA, PLOT_Y0);
    setBand(bandSumB, 2, i, PLOT_Y0 + hB, PLOT_Y0);

    ptsA[i] = [plotX(0, i), PLOT_Y0 + hA, 0];
    ptsB[i] = [plotX(1, i), PLOT_Y0 + hB, 0];
    ptsSumA[i] = [plotX(2, i), PLOT_Y0 + hA, 0];
    ptsSumB[i] = [plotX(2, i), PLOT_Y0 + hB, 0];
    totalPts[i] = [plotX(2, i), PLOT_Y0 + hT, 0];
  }

  for (const b of [bandPlotA, bandPlotB, bandSumA, bandSumB]) {
    b.geom.attributes.position.needsUpdate = true;
  }
  setPolyline(curveA, ptsA);
  setPolyline(curveB, ptsB);
  setPolyline(curveSumA, ptsSumA);
  setPolyline(curveSumB, ptsSumB);
  setPolyline(totalLine, totalPts);
});

stage.start();
