/**
 * Small wavelength → ray optics.
 *
 * A beam leaves an aperture on the left, bounces off a flat mirror, and is
 * folded back and focused by a concave one. The picture is a *wave*
 * calculation, and the only thing that changes over the loop is the wavelength:
 * it opens at a λ comparable to the mirror itself, where there is no beam at
 * all and the frame is chaotic, and as λ shrinks the beam gathers, its edges
 * harden, and the blur at the focus contracts onto a caustic. Nothing about the
 * geometry changes; the limit does all the work.
 *
 * The tail is the argument. The rays ray optics predicts are held back for the
 * whole ramp and only faded in once the wavelength has bottomed out; the two
 * run together for a beat; then the wave field fades away and the rays are left
 * holding the frame — three seconds for the whole handover, since the ramp has
 * already made the case and a slow crossfade only delays the conclusion.
 * Wave, then wave and rays, then rays — which is the limit, said in the order
 * it should be said. Shown throughout, the lines
 * would give the answer away and invite the eye to read the field as being
 * built out of them; it is not, and the overlay never touches it.
 *
 * ## How the field is computed
 *
 * Huygens–Kirchhoff, done twice. Every emitting surface is a line of point
 * sources with complex amplitudes, and the field anywhere is
 *
 *     u(x) = Σ_j A_j (n̂_j · r̂_j) e^{i k r_j} / √r_j ,     r_j = |x − q_j|
 *
 * the 2D free-space kernel in its short-wave form, with the Rayleigh–Sommerfeld
 * obliquity factor. In JS, the aperture is sampled, then each mirror in turn has
 * the incident field evaluated on it (with a real line-of-sight test between
 * sample pairs) and becomes a fresh line of sources. In the shader, every pixel
 * sums over all of them. Sample spacing tracks λ, so the sample count climbs as
 * the wavelength falls.
 *
 * Nothing is stored between frames — no grid, no ping-pong, no time stepping —
 * so `t` can be set to any value and a frame-stepped export is exact. It also
 * means λ has no floor from a grid; the floor is the screen, see below.
 *
 * ## What this is and is not
 *
 * It is a wave calculation: the field is built from Huygens sources and every
 * bright and dark band on screen is interference. It is **not** built out of
 * rays — the ray overlay is computed separately and never feeds the field.
 *
 * It is also not an exact Helmholtz solve. Physical optics takes the field on a
 * mirror to be the incident field, which ignores multiple scattering along the
 * surface and the edge currents at the rims. For a mirror many wavelengths
 * across — exactly the regime this demo lives in — that is a good approximation
 * and a standard one.
 *
 * Phases are exact, and so are the k-dependent constants — the √(1/8πk) in the
 * 2D Green's function and the 2ik in the physical-optics source strength, folded
 * together into `stageGain`. They are not cosmetic: without them each successive
 * stage fades as k^{−1/2}, so a twice-bounced beam vanishes exactly when the
 * wavelength gets small enough to be interesting. With them, brightness is
 * independent of λ and only the *shape* of the field changes down the ramp,
 * which is the point of the demo.
 *
 * ## The floor on λ
 *
 * Where two waves cross, the fringes are λ/2 apart, so a short enough λ puts
 * them under a pixel and the picture turns to moiré. That used to be what set
 * the bottom of the ramp; it no longer is. The ramp now stops where the *image*
 * stops changing, at λ = 0.035, which leaves the fringes about three pixels
 * apart at 1920 wide — comfortably resolved, with the shader's supersampling
 * and the intensity display in hand besides. The limit being argued is a limit,
 * not a race to the smallest number the screen will hold.
 */

import * as THREE from 'three';
import { createStage, createUI, C, flat } from '@';
import { polyline, setPolyline } from '@/lines';

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
// The ramp gets 11.7 seconds — frame 700 of a 60 fps export, which is where the
// picture stops changing (see LAMBDA_MIN) — and the closing argument is appended
// after it rather than carved out of it.
stage.duration = 16.5;

// The tail, in seconds, beat by beat. The whole demo is one sentence — a wave
// calculation, then the rays it converges to, then the rays alone — and this is
// where it is said.
//
// The handover is deliberately quick: three seconds flat from the first ray
// appearing to the last of the wave field going. By then the limit has already
// been argued for fifteen seconds and the audience is ahead of the picture —
// dwelling on the crossfade only makes them wait for a conclusion they have
// drawn. The three beats are equal so none of them reads as the point.
/** The rays come up over the top, the wavelength already at its smallest. */
const RAY_FADE = 1.0;
/** Both together: the claim and the thing it is a claim about. */
const BOTH_HOLD = 1.0;
/** The wave field goes, having made its point. */
const WAVE_FADE = 1.0;
/** Ray optics alone, which is where the rest of the talk starts. */
const END_HOLD = 1.8;
const TAIL = RAY_FADE + BOTH_HOLD + WAVE_FADE + END_HOLD;

const ui = createUI(stage);

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

interface Vec {
  x: number;
  y: number;
}
const v = (x: number, y: number): Vec => ({ x, y });
const fromAngle = (deg: number): Vec =>
  v(Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180));
const add = (a: Vec, b: Vec, s = 1): Vec => v(a.x + b.x * s, a.y + b.y * s);
const sub = (a: Vec, b: Vec): Vec => v(a.x - b.x, a.y - b.y);
const dot = (a: Vec, b: Vec): number => a.x * b.x + a.y * b.y;
const len = (a: Vec): number => Math.hypot(a.x, a.y);
const unit = (a: Vec): Vec => {
  const m = len(a) || 1;
  return v(a.x / m, a.y / m);
};
const perp = (a: Vec): Vec => v(-a.y, a.x);

/** The aperture: a Gaussian-tapered slit, launching along `axis`. */
const SOURCE = {
  center: v(-4.55, 1.75),
  axis: fromAngle(-24),
  // Comfortably wider than the waist: at 0.75 the Gaussian was still at 4% of
  // its peak where the jaws cut it off, and that truncation sprayed cylindrical
  // edge waves across the whole frame, which the tone curve then lifted into a
  // permanent haze. At 1.1 the taper reaches 0.1% and the aperture stops
  // diffracting off its own rims. The mirror rims still do, which is real.
  halfLen: 1.1,
  waist: 0.42,
};

/**
 * The mirrors, in the order the beam meets them.
 *
 * The flat one turns the beam up; the arc folds it back horizontally and
 * focuses it. The arc is deliberately fast (a 2-unit aperture on R = 3.4), so
 * it has visible spherical aberration and the ray overlay ends in a caustic
 * cusp rather than a point — a much better thing to converge onto.
 */
type Mirror =
  | { kind: 'flat'; mid: Vec; dir: Vec; half: number; normal: Vec }
  | { kind: 'arc'; c: Vec; r: number; a0: number; a1: number };

function flatMirror(mid: Vec, faceAngle: number, half: number): Mirror {
  const dir = fromAngle(faceAngle);
  return { kind: 'flat', mid, dir, half, normal: perp(dir) };
}

const MIRRORS: Mirror[] = [
  // Hit at (1.29, −0.85); normal at 108° sends the beam from −24° up to 60°.
  flatMirror(v(1.29, -0.85), 18, 1.15),
  // Vertex at (2.84, 1.835), centre of curvature down-left on the beam axis.
  { kind: 'arc', c: v(-0.104, 0.135), r: 3.4, a0: (13 * Math.PI) / 180, a1: (47 * Math.PI) / 180 },
];

function mirrorLength(m: Mirror): number {
  return m.kind === 'flat' ? 2 * m.half : m.r * (m.a1 - m.a0);
}

/** Point and inward normal at parameter s ∈ [0, 1] along the mirror. */
function mirrorAt(m: Mirror, s: number): { p: Vec; n: Vec } {
  if (m.kind === 'flat') {
    const t = (s * 2 - 1) * m.half;
    return { p: add(m.mid, m.dir, t), n: m.normal };
  }
  const a = m.a0 + (m.a1 - m.a0) * s;
  const n = v(Math.cos(a), Math.sin(a));
  return { p: add(m.c, n, m.r), n: v(-n.x, -n.y) };
}

/** Polyline approximation, used for line-of-sight tests and for drawing. */
function mirrorPoly(m: Mirror, n = 24): Vec[] {
  if (m.kind === 'flat') return [add(m.mid, m.dir, -m.half), add(m.mid, m.dir, m.half)];
  const pts: Vec[] = [];
  for (let i = 0; i <= n; i++) pts.push(mirrorAt(m, i / n).p);
  return pts;
}

const POLYS = MIRRORS.map((m) => mirrorPoly(m));

/**
 * The mirrors as a handful of straight blockers, for the shader's line-of-sight
 * test. Kept coarse deliberately — it runs per source per pixel, so it is the
 * most expensive thing in the demo. The arc's sagitta is only 0.15, so three
 * chords track it closely enough to shadow with.
 */
const BLOCKERS: { a: Vec; b: Vec; owner: number }[] = [];
MIRRORS.forEach((m, i) => {
  const poly = mirrorPoly(m, 3);
  for (let j = 0; j + 1 < poly.length; j++) BLOCKERS.push({ a: poly[j], b: poly[j + 1], owner: i });
});

/**
 * `?frame=room` also has the disc the room carries on every slide of this run
 * (wave-room ?scene=beam, beam-spectrum, light-field-room): off to the side,
 * clipping the top of the light coming back off the concave mirror. Here it is
 * black, like the walls (this computation has nothing to reflect off it), and
 * opaque: an octagon of blockers in the line-of-sight test, owner 2 (never a
 * source), and the field black inside it.
 */
const DISC = { c: v(-2.3, 2.42), r: 0.3 };
const DISC_ON = new URLSearchParams(location.search).get('frame') === 'room';
const DISC_POLY: Vec[] = Array.from({ length: 9 }, (_, k) => add(DISC.c, fromAngle((360 * k) / 8), DISC.r / Math.cos(Math.PI / 8)));
if (DISC_ON) for (let j = 0; j < 8; j++) BLOCKERS.push({ a: DISC_POLY[j], b: DISC_POLY[j + 1], owner: 2 });

/** Does the segment a→b cross any mirror other than the ones being connected (or the disc)? */
function blocked(a: Vec, b: Vec, skip0: number, skip1: number): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const polys = DISC_ON ? [...POLYS, DISC_POLY] : POLYS;
  for (let k = 0; k < polys.length; k++) {
    if (k === skip0 || k === skip1) continue;
    const poly = polys[k];
    for (let i = 0; i + 1 < poly.length; i++) {
      const p = poly[i];
      const q = poly[i + 1];
      const ex = q.x - p.x;
      const ey = q.y - p.y;
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-12) continue;
      const rx = p.x - a.x;
      const ry = p.y - a.y;
      const t = (rx * ey - ry * ex) / den;
      const u = (rx * dy - ry * dx) / den;
      if (t > 1e-4 && t < 1 - 1e-4 && u > 0 && u < 1) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Drawing the room
// ---------------------------------------------------------------------------

/** A mirror as an opaque block: a bright face over a slab of the deep tone. */
function drawMirror(m: Mirror): void {
  const poly = mirrorPoly(m, 40);
  const back: Vec[] = [];
  const THICK = 0.3;
  for (let i = 0; i < poly.length; i++) {
    const { n } = mirrorAt(m, i / (poly.length - 1));
    back.push(add(poly[i], n, -THICK));
  }

  // The slab, as a strip between the face and the offset back edge.
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    pos.push(poly[i].x, poly[i].y, -0.02, back[i].x, back[i].y, -0.02);
    if (i + 1 < poly.length) {
      const j = 2 * i;
      idx.push(j, j + 1, j + 2, j + 1, j + 3, j + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const slab = new THREE.Mesh(g, flat(C.slateDeep));
  slab.renderOrder = 6;
  stage.add(slab);

  const face = polyline(
    poly.map((p) => [p.x, p.y, 0] as [number, number, number]),
    { color: C.slate, width: 4 },
  );
  face.renderOrder = 7;
  stage.add(face);
}

/**
 * `?frame=room` draws the scene the way wave-room's beam scene does (Steve,
 * 2026-10-29: the same box, things drawn the same): a rounded room round it,
 * thin mirrors, the lamp in its housing, and the field black outside the room.
 * The computation is unchanged. It is open space, which is a room whose walls
 * are perfectly black: light reaching them is absorbed, nothing comes back, and
 * the rays stop there. (In wave-room the walls reflect.)
 */
const ROOM = new URLSearchParams(location.search).get('frame') === 'room';
const ROOM_HALF = v(5.25, 2.88);
const ROOM_R = 0.55;

if (ROOM) {
  const line = (pts: Vec[], width: number) => {
    const l = polyline(pts.map((p) => [p.x, p.y, 0] as [number, number, number]), { color: C.slate, width });
    l.renderOrder = 7;
    stage.add(l);
  };
  // The room: a rounded rectangle.
  const outline: Vec[] = [];
  const corners: [number, number, number][] = [
    [ROOM_HALF.x - ROOM_R, ROOM_HALF.y - ROOM_R, 0],
    [-(ROOM_HALF.x - ROOM_R), ROOM_HALF.y - ROOM_R, 90],
    [-(ROOM_HALF.x - ROOM_R), -(ROOM_HALF.y - ROOM_R), 180],
    [ROOM_HALF.x - ROOM_R, -(ROOM_HALF.y - ROOM_R), 270],
  ];
  for (const [cx, cy, a0] of corners) {
    for (let k = 0; k <= 8; k++) {
      const a = ((a0 + (90 * k) / 8) * Math.PI) / 180;
      outline.push(v(cx + ROOM_R * Math.cos(a), cy + ROOM_R * Math.sin(a)));
    }
  }
  outline.push(outline[0]);
  line(outline, 5);
  // The mirrors, thin.
  for (const m of MIRRORS) line(mirrorPoly(m, 40), 6);
  // The lamp's housing, at wave-room's coordinates: a back plate and two sides.
  const A = SOURCE.axis;
  const N = perp(A);
  const at = (x: number, y: number) => add(add(SOURCE.center, A, x), N, y);
  line([at(0.18, 0.95), at(-0.3, 0.95), at(-0.3, -0.95), at(0.18, -0.95)], 6);
  line(Array.from({ length: 41 }, (_, k) => add(DISC.c, fromAngle((360 * k) / 40), DISC.r)), 5);
} else {
  MIRRORS.forEach(drawMirror);
}

// The aperture itself, drawn as two jaws with the slit between them.
if (!ROOM) {
  const t = perp(SOURCE.axis);
  const a = add(SOURCE.center, t, SOURCE.halfLen);
  const b = add(SOURCE.center, t, -SOURCE.halfLen);
  for (const [end, sign] of [
    [a, 1],
    [b, -1],
  ] as [Vec, number][]) {
    const far = add(end, t, sign * 1.4);
    const jaw = polyline(
      [
        [end.x, end.y, 0],
        [far.x, far.y, 0],
      ],
      { color: C.slate, width: 7 },
    );
    jaw.renderOrder = 7;
    stage.add(jaw);
  }
}

// ---------------------------------------------------------------------------
// The wave field
// ---------------------------------------------------------------------------

const MAX_SRC = 1600;

// Two texels per source: (x, y, nx, ny) and (Re A, Im A, ·, ·).
const srcData = new Float32Array(MAX_SRC * 2 * 4);
const srcTex = new THREE.DataTexture(srcData, MAX_SRC, 2, THREE.RGBAFormat, THREE.FloatType);
srcTex.minFilter = THREE.NearestFilter;
srcTex.magFilter = THREE.NearestFilter;
srcTex.needsUpdate = true;

const FIELD_FRAG = /* glsl */ `
  precision highp float;

  // GLSL3 in three: \`varying\` is defined for us, but \`gl_FragColor\` is not —
  // the output has to be declared by hand or the shader silently fails to
  // compile and the field renders black.
  layout(location = 0) out vec4 fragColor;

  uniform sampler2D uSrc;
  uniform int uCount;
  uniform float uK;
  uniform vec2 uMin;
  uniform vec2 uMax;
  uniform float uExposure;
  uniform float uPhase;
  uniform int uMode;   // 0 = intensity, 1 = signed field
  uniform float uRoom; // 1: black outside the room (frame=room)
  uniform int uSS;     // supersamples per axis
  uniform vec2 uTexel; // world size of one output pixel
  uniform vec4 uBlock[16];
  uniform float uBlockOwner[16];
  uniform int uBlockCount;

  varying vec2 vUv;

  // Kirchhoff's screen condition: a source contributes only where it can be
  // seen. Doing this per source rather than per beam is what makes the shadow
  // edge diffract — the pixels just inside the edge see part of the source line
  // and not the rest, and the partial sum rings exactly as Fresnel says.
  bool shadowed(vec2 a, vec2 p, float owner) {
    vec2 d = p - a;
    for (int i = 0; i < uBlockCount; i++) {
      if (abs(uBlockOwner[i] - owner) < 0.5) continue; // never self-shadow
      vec4 s = uBlock[i];
      vec2 e = s.zw - s.xy;
      float den = d.x * e.y - d.y * e.x;
      if (abs(den) < 1e-9) continue;
      vec2 r = s.xy - a;
      float t = (r.x * e.y - r.y * e.x) / den;
      float u = (r.x * d.y - r.y * d.x) / den;
      if (t > 1e-3 && t < 0.999 && u > 0.0 && u < 1.0) return true;
    }
    return false;
  }

  vec2 fieldAt(vec2 p) {
    vec2 acc = vec2(0.0);
    for (int i = 0; i < uCount; i++) {
      vec4 a = texelFetch(uSrc, ivec2(i, 0), 0);
      vec4 b = texelFetch(uSrc, ivec2(i, 1), 0);
      vec2 d = p - a.xy;
      float r = length(d);
      if (r < 2e-3) continue;
      // Rayleigh–Sommerfeld obliquity: a source only radiates forwards.
      float ob = dot(d / r, a.zw);
      if (ob <= 0.0) continue;
      if (shadowed(a.xy, p, b.z)) continue;
      float ph = uK * r + uPhase;
      float s = sin(ph);
      float c = cos(ph);
      acc += (ob / sqrt(r)) * vec2(b.x * c - b.y * s, b.x * s + b.y * c);
    }
    return acc;
  }

  // Black through ember and ochre to bone — light, in the palette of the deck.
  vec3 hot(float t) {
    t = clamp(t, 0.0, 1.0);
    vec3 c0 = vec3(0.0, 0.0, 0.0);
    vec3 c1 = vec3(0.22, 0.10, 0.05);
    vec3 c2 = vec3(0.54, 0.42, 0.13);
    vec3 c3 = vec3(0.83, 0.65, 0.25);
    vec3 c4 = vec3(0.95, 0.93, 0.86);
    if (t < 0.25) return mix(c0, c1, t / 0.25);
    if (t < 0.5) return mix(c1, c2, (t - 0.25) / 0.25);
    if (t < 0.75) return mix(c2, c3, (t - 0.5) / 0.25);
    return mix(c3, c4, (t - 0.75) / 0.25);
  }

  void main() {
    vec2 p0 = mix(uMin, uMax, vUv);
    float n = float(uSS);
    if (uRoom > 0.5 && length(p0 - vec2(${DISC.c.x}, ${DISC.c.y})) < ${DISC.r}) {
      fragColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }
    if (uRoom > 0.5) {
      vec2 q = abs(p0) - vec2(${ROOM_HALF.x - ROOM_R}, ${ROOM_HALF.y - ROOM_R});
      if (length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) > ${ROOM_R}) {
        fragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
      }
    }

    if (uMode == 1) {
      // The field is linear, so averaging it over the pixel is the right filter.
      vec2 acc = vec2(0.0);
      for (int sy = 0; sy < uSS; sy++) {
        for (int sx = 0; sx < uSS; sx++) {
          vec2 off = (vec2(float(sx), float(sy)) + 0.5) / n - 0.5;
          acc += fieldAt(p0 + off * uTexel);
        }
      }
      float re = acc.x * uExposure / (n * n);
      vec3 warm = vec3(0.83, 0.65, 0.25);
      vec3 cool = vec3(0.30, 0.51, 0.68);
      vec3 col = re > 0.0 ? warm * min(re, 1.0) : cool * min(-re, 1.0);
      fragColor = vec4(col, 1.0);
      return;
    }

    // Intensity averages after squaring, which is what a detector does and what
    // keeps sub-pixel fringes from turning into moiré.
    float acc = 0.0;
    for (int sy = 0; sy < uSS; sy++) {
      for (int sx = 0; sx < uSS; sx++) {
        vec2 off = (vec2(float(sx), float(sy)) + 0.5) / n - 0.5;
        vec2 u = fieldAt(p0 + off * uTexel);
        acc += dot(u, u);
      }
    }
    float I = acc / (n * n) * uExposure;
    fragColor = vec4(hot(pow(I, 0.55)), 1.0);
  }
`;

const fieldMat = new THREE.ShaderMaterial({
  glslVersion: THREE.GLSL3,
  uniforms: {
    uSrc: { value: srcTex },
    uCount: { value: 0 },
    uK: { value: 1 },
    uMin: { value: new THREE.Vector2(-HALF_W, -ORTHO_H) },
    uMax: { value: new THREE.Vector2(HALF_W, ORTHO_H) },
    uExposure: { value: 1 },
    uPhase: { value: 0 },
    uMode: { value: 0 },
    uRoom: { value: ROOM ? 1 : 0 },
    uSS: { value: 2 },
    uTexel: { value: new THREE.Vector2() },
    uBlock: {
      value: Array.from({ length: 16 }, (_, i) =>
        i < BLOCKERS.length
          ? new THREE.Vector4(BLOCKERS[i].a.x, BLOCKERS[i].a.y, BLOCKERS[i].b.x, BLOCKERS[i].b.y)
          : new THREE.Vector4(),
      ),
    },
    uBlockOwner: {
      value: Float32Array.from({ length: 16 }, (_, i) =>
        i < BLOCKERS.length ? BLOCKERS[i].owner : -99,
      ),
    },
    uBlockCount: { value: Math.min(16, BLOCKERS.length) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `,
  fragmentShader: FIELD_FRAG,
});

// The field is rendered once into an offscreen target, at a resolution the
// preview can afford, and then shown as a texture. Every pixel costs a sum over
// every source, so this is the one dial that decides whether the demo is
// interactive; exports can turn it up.
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
  // Transparent from the start so the closing fade is a change of opacity and
  // nothing else — the field it is showing is computed identically throughout.
  new THREE.MeshBasicMaterial({ map: target.texture, transparent: true }),
);
screen.position.z = -1;
stage.add(screen);

// ---------------------------------------------------------------------------
// Building the sources
// ---------------------------------------------------------------------------

interface Src {
  x: number;
  y: number;
  nx: number;
  ny: number;
  re: number;
  im: number;
}

/** One stage of the propagation: a line of sources with complex amplitudes. */
interface Stage {
  /** Index into MIRRORS, or −1 for the aperture. */
  mirror: number;
  srcs: Src[];
}

/** Samples per unit length, so the sampling stays fine compared with λ. */
function sampleCount(length: number, lambda: number): number {
  return Math.max(24, Math.min(700, Math.ceil(length / (lambda * 0.4))));
}

/** Field and its normal derivative at q, summed over earlier stages. */
function incident(
  q: Vec,
  n: Vec,
  stages: Stage[],
  self: number,
  k: number,
): { re: number; im: number; dir: Vec } {
  let re = 0;
  let im = 0;
  let dx = 0;
  let dy = 0;
  for (const st of stages) {
    for (const s of st.srcs) {
      const ex = q.x - s.x;
      const ey = q.y - s.y;
      const r = Math.hypot(ex, ey);
      if (r < 1e-3) continue;
      const ob = (ex * s.nx + ey * s.ny) / r;
      if (ob <= 0) continue;
      if (blocked(v(s.x, s.y), q, st.mirror, self)) continue;
      const ph = k * r;
      const c = Math.cos(ph);
      const sn = Math.sin(ph);
      const w = ob / Math.sqrt(r);
      const cre = w * (s.re * c - s.im * sn);
      const cim = w * (s.re * sn + s.im * c);
      re += cre;
      im += cim;
      // Energy-weighted mean direction of arrival — the local ray direction,
      // which is what the reflection obliquity needs.
      const mag = Math.hypot(cre, cim);
      dx += (mag * ex) / r;
      dy += (mag * ey) / r;
    }
  }
  const m = Math.hypot(dx, dy);
  return { re, im, dir: m > 1e-12 ? v(dx / m, dy / m) : v(-n.x, -n.y) };
}

/**
 * The one constant that every emitting surface carries.
 *
 * The 2D Green's function is G = C_k e^{ikr}/√r with |C_k| = √(1/8πk), and
 * physical optics gives each surface a source strength 2ik times the field on
 * it. Folding both into the stored amplitude leaves the bare kernel
 * e^{ikr}/√r for the shader, and the surviving factor is
 *
 *     g = 2k · √(1/8πk) · e^{i3π/4} = √(k/2π) · e^{i3π/4}.
 *
 * It is worth keeping rather than absorbing into an exposure slider. Propagating
 * a beam of extent D over a distance L contributes a stationary-phase factor of
 * order √(L/k), so g·√(L/k) is independent of k and the picture holds the same
 * brightness at every wavelength. Drop g and each successive stage instead fades
 * as k^{−1/2}, so the twice-bounced beam disappears just as the ramp gets
 * interesting.
 */
function stageGain(k: number): { re: number; im: number } {
  const g = Math.sqrt(k / (2 * Math.PI));
  return { re: g * Math.cos((3 * Math.PI) / 4), im: g * Math.sin((3 * Math.PI) / 4) };
}

/** Rebuild every stage for the current wavelength. */
function buildStages(lambda: number): Stage[] {
  const k = (2 * Math.PI) / lambda;
  const g = stageGain(k);
  const stages: Stage[] = [];

  // The aperture.
  const t = perp(SOURCE.axis);
  const nAp = sampleCount(2 * SOURCE.halfLen, lambda);
  const dsAp = (2 * SOURCE.halfLen) / nAp;
  const apSrcs: Src[] = [];
  for (let i = 0; i < nAp; i++) {
    const s = -SOURCE.halfLen + (i + 0.5) * dsAp;
    const p = add(SOURCE.center, t, s);
    const a = Math.exp(-(s * s) / (SOURCE.waist * SOURCE.waist)) * dsAp;
    apSrcs.push({
      x: p.x,
      y: p.y,
      nx: SOURCE.axis.x,
      ny: SOURCE.axis.y,
      re: a * g.re,
      im: a * g.im,
    });
  }
  stages.push({ mirror: -1, srcs: apSrcs });

  // Each mirror in turn, lit by everything before it.
  for (let mi = 0; mi < MIRRORS.length; mi++) {
    const m = MIRRORS[mi];
    const L = mirrorLength(m);
    const nM = sampleCount(L, lambda);
    const ds = L / nM;
    const srcs: Src[] = [];
    for (let i = 0; i < nM; i++) {
      const { p, n } = mirrorAt(m, (i + 0.5) / nM);
      const inc = incident(p, n, stages, mi, k);
      // Physical optics: the surface re-radiates the incident field, weighted
      // by how squarely it arrives. The factor of 2 lives inside g.
      const w = Math.max(0, -dot(inc.dir, n)) * ds;
      if (w <= 0) continue;
      srcs.push({
        x: p.x,
        y: p.y,
        nx: n.x,
        ny: n.y,
        re: w * (inc.re * g.re - inc.im * g.im),
        im: w * (inc.re * g.im + inc.im * g.re),
      });
    }
    stages.push({ mirror: mi, srcs });
  }

  return stages;
}

let warnedTruncation = false;

/** Pack the stages into the data texture. Returns how many sources went in. */
function packSources(stages: Stage[]): number {
  const wanted = stages.reduce((n, st) => n + st.srcs.length, 0);
  if (wanted > MAX_SRC && !warnedTruncation) {
    warnedTruncation = true;
    // Silently dropping sources would quietly delete a whole late stage — the
    // twice-bounced beam would just stop existing at small λ. Say so.
    console.warn(
      `wave-to-ray: ${wanted} sources needed but only ${MAX_SRC} fit; ` +
        `the last stages are being truncated. Raise MAX_SRC or stop the ramp sooner.`,
    );
  }
  let i = 0;
  for (const st of stages) {
    for (const s of st.srcs) {
      if (i >= MAX_SRC) break;
      const a = i * 4;
      const b = (MAX_SRC + i) * 4;
      srcData[a] = s.x;
      srcData[a + 1] = s.y;
      srcData[a + 2] = s.nx;
      srcData[a + 3] = s.ny;
      srcData[b] = s.re;
      srcData[b + 1] = s.im;
      // Which mirror this source sits on, so the shader's line-of-sight test
      // can skip that blocker. −1 is the aperture, which nothing owns.
      srcData[b + 2] = st.mirror;
      i++;
    }
  }
  srcTex.needsUpdate = true;
  return i;
}

// ---------------------------------------------------------------------------
// The rays that the field should converge onto
// ---------------------------------------------------------------------------

const RAY_COUNT = 9;
const RAY_POINTS = 5; // start + up to three bounces + exit
/** Weight of the overlay once it is fully up — it annotates, it does not shout. */
const RAY_ALPHA = 0.75;
/**
 * Half-width of the ray fan, as a fraction of the aperture's Gaussian waist.
 * Launched across the full waist the outermost rays sit where the Gaussian is
 * already well down, so the fan read wider than the bright core it is meant to
 * be annotating; 0.85 pulls them onto it. Symmetric about `SOURCE.center`, so
 * the beam narrows about its own axis and stays on the same line.
 *
 * This is the overlay only. `SOURCE.waist` itself is untouched — it sets the
 * aperture the wave calculation actually uses, and narrowing that would change
 * the field rather than the annotation drawn over it.
 */
const RAY_SPREAD = 0.85;

const rayLines = Array.from({ length: RAY_COUNT }, () => {
  const l = polyline(
    Array.from({ length: RAY_POINTS }, () => [0, 0, 0] as [number, number, number]),
    { color: C.bone, width: 2, opacity: RAY_ALPHA },
  );
  l.renderOrder = 8;
  stage.add(l);
  return l;
});

/** Nearest mirror hit along the ray o + t d, ignoring `skip`. */
function hitMirror(
  o: Vec,
  d: Vec,
  skip: number,
): { t: number; p: Vec; n: Vec; index: number } | null {
  let best: { t: number; p: Vec; n: Vec; index: number } | null = null;
  for (let mi = 0; mi < MIRRORS.length; mi++) {
    if (mi === skip) continue;
    const m = MIRRORS[mi];
    if (m.kind === 'flat') {
      const a = add(m.mid, m.dir, -m.half);
      const ex = m.dir.x * 2 * m.half;
      const ey = m.dir.y * 2 * m.half;
      const den = d.x * ey - d.y * ex;
      if (Math.abs(den) < 1e-12) continue;
      const rx = a.x - o.x;
      const ry = a.y - o.y;
      const t = (rx * ey - ry * ex) / den;
      const u = (rx * d.y - ry * d.x) / den;
      if (t <= 1e-4 || u < 0 || u > 1) continue;
      if (best && t >= best.t) continue;
      best = { t, p: add(o, d, t), n: m.normal, index: mi };
    } else {
      const ox = o.x - m.c.x;
      const oy = o.y - m.c.y;
      const b = ox * d.x + oy * d.y;
      const cq = ox * ox + oy * oy - m.r * m.r;
      const disc = b * b - cq;
      if (disc < 0) continue;
      const sq = Math.sqrt(disc);
      for (const t of [-b - sq, -b + sq]) {
        if (t <= 1e-4) continue;
        const p = add(o, d, t);
        const ang = Math.atan2(p.y - m.c.y, p.x - m.c.x);
        if (ang < m.a0 || ang > m.a1) continue;
        if (best && t >= best.t) continue;
        const rad = unit(sub(p, m.c));
        best = { t, p, n: v(-rad.x, -rad.y), index: mi };
      }
    }
  }
  return best;
}

/** March a ray through the mirrors and write its polyline. */
function traceRay(start: Vec, dir: Vec, out: [number, number, number][]): void {
  let o = start;
  let d = dir;
  let skip = -1;
  out[0] = [o.x, o.y, 0];
  let i = 1;
  for (; i < RAY_POINTS; i++) {
    const hit = hitMirror(o, d, skip);
    if (DISC_ON) {
      const ox = o.x - DISC.c.x;
      const oy = o.y - DISC.c.y;
      const b = ox * d.x + oy * d.y;
      const disc = b * b - (ox * ox + oy * oy - DISC.r * DISC.r);
      const tc = disc >= 0 ? -b - Math.sqrt(disc) : -1;
      if (tc > 1e-4 && (!hit || tc < hit.t)) {
        const e = add(o, d, tc);
        out[i] = [e.x, e.y, 0];
        i++;
        break;
      }
    }
    if (!hit || i === RAY_POINTS - 1) {
      // Run out to the edge of the frame.
      // To the edge of the frame, or to the room's (black) walls.
      const hx = ROOM ? ROOM_HALF.x : HALF_W;
      const hy = ROOM ? ROOM_HALF.y : ORTHO_H;
      const tx = d.x > 1e-9 ? (hx - o.x) / d.x : d.x < -1e-9 ? (-hx - o.x) / d.x : 1e9;
      const ty = d.y > 1e-9 ? (hy - o.y) / d.y : d.y < -1e-9 ? (-hy - o.y) / d.y : 1e9;
      const t = Math.max(0, Math.min(tx, ty));
      const e = add(o, d, t);
      out[i] = [e.x, e.y, 0];
      i++;
      break;
    }
    out[i] = [hit.p.x, hit.p.y, 0];
    const c = dot(d, hit.n);
    d = unit(v(d.x - 2 * c * hit.n.x, d.y - 2 * c * hit.n.y));
    o = hit.p;
    skip = hit.index;
  }
  for (; i < RAY_POINTS; i++) out[i] = out[i - 1];
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

/**
 * The ramp runs from a wavelength comparable to the mirror itself down to one
 * some thirty-five times smaller — about sixty wavelengths across the arc.
 *
 * It used to run on to λ = 0.012 and 170 wavelengths across, and that was time
 * spent for nothing: the beam has finished gathering and the caustic has
 * finished contracting well before then, so the last few seconds were a picture
 * that had already stopped changing. The rate of the sweep is unchanged — it is
 * the same log ramp, cut where it stops saying anything new, which lands at
 * frame 700 of a 60 fps export. Everything before that point is frame for frame
 * what it always was.
 *
 * Stopping earlier is also what makes the demo cheap: sample spacing tracks λ,
 * so the source count at the small end falls from ~1350 to ~470 and the shader
 * sums a third as many terms per pixel.
 *
 * Starting this long is a deliberate choice about what the opening frame should
 * say: at λ ≈ 1.2 the mirror is barely one wavelength across, there is no beam
 * to speak of, and the frame is a chaotic spray of interference — which is the
 * honest "before" for a limit argument. Be aware what it costs: physical optics
 * takes the field on a mirror to be the incident field, and that approximation
 * is only good for a mirror many wavelengths across. At the top of the ramp it
 * is not quantitatively trustworthy. The qualitative claim it is making there —
 * no beam, no rays, only spreading interference — is right, and the argument
 * this demo exists to make lives at the *other* end of the ramp, where the
 * approximation is excellent.
 */
const LAMBDA_MAX = 1.2;
const LAMBDA_MIN = 0.035;

const params = {
  ramp: true,
  wavelength: 0.12,
  display: 'intensity' as 'intensity' | 'field',
  exposure: 0.5,
  rays: true,
  resolution: 0.35,
  supersample: 2,
};
ui.params.add(params, 'ramp').name('shrink wavelength');
ui.params.add(params, 'wavelength', LAMBDA_MIN, LAMBDA_MAX, 0.001).name('wavelength');
ui.params.add(params, 'display', ['intensity', 'field']).name('display');
ui.params.add(params, 'exposure', 0.1, 8, 0.05).name('exposure');
ui.params.add(params, 'rays').name('ray overlay');
ui.params.add(params, 'resolution', 0.15, 1, 0.05).name('field resolution');
ui.params.add(params, 'supersample', 1, 3, 1).name('supersamples');

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

const rayPts: [number, number, number][][] = Array.from({ length: RAY_COUNT }, () =>
  Array.from({ length: RAY_POINTS }, () => [0, 0, 0] as [number, number, number]),
);

const bufSize = new THREE.Vector2();

stage.frame((t) => {
  // The ramp finishes TAIL seconds early and parks at the smallest wavelength;
  // the tail is where the rays come up and the finished picture runs.
  const u = stage.progress(t, TAIL);

  // Log ramp: equal steps in "wavelengths across the mirror", which is the
  // number that actually matters, rather than in λ itself.
  const lambda = params.ramp
    ? LAMBDA_MAX * Math.pow(LAMBDA_MIN / LAMBDA_MAX, u)
    : params.wavelength;
  const k = (2 * Math.PI) / lambda;

  const stages = buildStages(lambda);
  const count = packSources(stages);

  // Size the offscreen field to the current drawing buffer, so an export at
  // 1920×1080 gets a proportionally sharper field than the preview window.
  stage.renderer.getDrawingBufferSize(bufSize);
  const fw = Math.max(64, Math.round(bufSize.x * params.resolution));
  const fh = Math.max(36, Math.round(bufSize.y * params.resolution));
  if (target.width !== fw || target.height !== fh) target.setSize(fw, fh);

  const uni = fieldMat.uniforms;
  uni.uCount.value = count;
  uni.uK.value = k;
  uni.uExposure.value = params.exposure;
  uni.uMode.value = params.display === 'field' ? 1 : 0;
  uni.uSS.value = Math.round(params.supersample);
  uni.uPhase.value = params.display === 'field' ? -u * Math.PI * 2 * 6 : 0;
  uni.uTexel.value.set((2 * HALF_W) / fw, (2 * ORTHO_H) / fh);

  const prev = stage.renderer.getRenderTarget();
  stage.renderer.setRenderTarget(target);
  stage.renderer.render(fieldScene, fieldCam);
  stage.renderer.setRenderTarget(prev);

  // --- the ray prediction --------------------------------------------------
  //
  // Held back for the whole ramp, then faded in over the top. Drawing them from
  // the start would give the answer away and, worse, would invite the eye to
  // read the field as being *made* of them — it is not; the overlay is computed
  // separately and never touches the field. Withheld, the picture argues in the
  // right order: watch the wave field contract onto a caustic on its own, and
  // only then see the lines ray optics predicts laid over where it landed.
  //
  // `held` is seconds since the wavelength bottomed out; the tail is read off
  // it directly, in seconds, so retiming a beat is editing one number.
  const held = Math.max(0, (t % stage.duration) - (stage.duration - TAIL));
  const smooth = (x: number) => {
    const c = Math.min(1, Math.max(0, x));
    return c * c * (3 - 2 * c);
  };

  const rayAlpha = params.ramp ? smooth(held / RAY_FADE) : params.rays ? 1 : 0;

  // ...and then the field itself goes, leaving ray optics holding the frame.
  // Opacity, not exposure: the field being drawn is the same field throughout,
  // and dimming it through the tone curve would look like the physics changing.
  const waveAlpha = params.ramp
    ? 1 - smooth((held - (RAY_FADE + BOTH_HOLD)) / WAVE_FADE)
    : 1;
  (screen.material as THREE.MeshBasicMaterial).opacity = waveAlpha;
  screen.visible = waveAlpha > 0.002;

  const tan = perp(SOURCE.axis);
  for (let i = 0; i < RAY_COUNT; i++) {
    const s = ((i / (RAY_COUNT - 1)) * 2 - 1) * SOURCE.waist * RAY_SPREAD;
    traceRay(add(SOURCE.center, tan, s), SOURCE.axis, rayPts[i]);
    setPolyline(rayLines[i], rayPts[i]);
    (rayLines[i].material as THREE.Material & { opacity: number }).opacity = RAY_ALPHA * rayAlpha;
    rayLines[i].visible = rayAlpha > 0.002;
  }
});

stage.start();
