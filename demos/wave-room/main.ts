/**
 * The wave equation, solved.
 *
 * `wave-to-ray` argues the small-wavelength limit with a Huygens–Kirchhoff
 * sum: a closed-form field, no time in it, λ shrinking until rays fall out.
 * This one takes the other road. There is no propagator and no series of
 * bounces — the scalar wave equation
 *
 *     u_tt + 2γ u_t = c² ∇²u + S(x, τ)
 *
 * is stepped forward on a grid, and everything in the picture (the shadow
 * behind a pillar, the fringes through the slit, the focus off the curved
 * wall, the reverberation once the front has been everywhere) is a consequence
 * of that one line rather than something put in by hand. Nothing here knows
 * what a ray is.
 *
 * A short pulse leaves a point in the hall. The front expands, casts shadows
 * behind two pillars and diffracts around them, reflects off a tilted slab, is
 * gathered by a concave wall into a caustic back near the middle of the room,
 * and leaks through a slit two wavelengths wide into the side chamber, which
 * rings on afterwards. By the end everything has bounced enough times that the
 * room holds a diffuse field with no front left in it, which is the state the
 * rest of the deck takes as its starting point.
 *
 * ## The scheme
 *
 * Second-order leapfrog, the textbook one:
 *
 *     u⁺ (1 + a) = 2u − u⁻ (1 − a) + C² (uN + uS + uE + uW − 4u) + dt² S,
 *     C = c dt/dx,  a = γ dt.
 *
 * C = 0.5, comfortably under the 2D stability limit of 1/√2. Walls are
 * Dirichlet: every cell outside the domain is pinned to zero every step, so a
 * boundary cell's five-point stencil already has the right thing in it and
 * there is no separate boundary pass. That makes the walls perfect reflectors
 * with a sign flip, which is what a pressure-release surface does and is fine
 * for a picture about propagation.
 *
 * One texture holds the whole state: r = u at this step, g = u at the last,
 * b = the running sum of u², which is what the *time average* display shows.
 *
 * The physics is parameterised in world units per second rather than in cells:
 * `SPEED` is how far the front travels in a second of demo time, and the step
 * count follows from it and the grid spacing. Change the grid resolution and
 * the number of steps changes but the picture and its timing do not — the
 * coarse grid is the same movie, dispersed.
 *
 * ## Determinism
 *
 * A time-stepped solver is the one thing this repo's "pure function of t" rule
 * does not hand you for free. It is kept anyway: the state after a frame is
 * *always* exactly `floor(t / dt)` steps from a zero start, never "whatever the
 * last frame left". Marching forward reuses what is already there; a t that
 * moves backwards, or any parameter change, clears both buffers and re-runs
 * from zero. Frame-stepped export walks forward, so it pays nothing and gets
 * the same field it would get from a cold start at that instant.
 *
 * ## What it does not claim
 *
 * The grid is ~19 cells per wavelength, so the discrete phase velocity is
 * about a third of a percent slow and slightly direction-dependent. Over the
 * hundred-odd world units a front covers in a run that is a wavelength or so of
 * accumulated phase error: the geometry of what you are watching is right, the
 * fringe count far from the source is not to be trusted to the last fringe.
 * Curved walls are staircased at the cell size, and γ is a flat damping on the
 * whole domain, standing in for the losses of a real room rather than modelling
 * any of them.
 *
 * `auto gain` lifts the exposure as the front spreads out and the room quietens,
 * so the late field stays visible. It is a readability choice and nothing else
 * — it multiplies the whole frame by a number that depends only on τ, so
 * relative brightness within any one frame is exactly what the solver produced.
 * Turn it off to see the amplitudes as they are.
 *
 * ## The two displays
 *
 * **field** is u itself, signed: ochre positive, blue negative. It is what is
 * being solved for, and at this wavelength it is all fringes.
 *
 * **time average** is the mean of u² at each point since the run began. It is
 * the same data with the oscillation integrated out, and it is the bridge to
 * the rest of the deck: the smooth thing that comes out — bright near the
 * source, dark in the shadows, hot along the caustic — is what every later demo
 * calls the light in the room. Nothing in this demo computes it; it falls out
 * of a wave that is only ever asked to obey one PDE.
 */

import * as THREE from 'three';
import { createStage, createUI, C } from '@';
import { label } from '@/text';

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
// A time evolution, not a cycle: it starts at rest and ends with the room
// ringing. Deliberately *not* loopable — `stage.progress` is never used here,
// and an export is the whole run from silence.
//
// Fourteen seconds is about two and a half crossings of the room, which is the
// whole story: the front goes out, meets everything in the room once, and the
// reflections start to pile up into a diffuse field. Run it much longer and
// every frame after is the same featureless speckle — true, and not worth
// footage.
stage.duration = new URLSearchParams(location.search).get('scene') === 'beam' ? 20 : 14; // the beam scene takes longer to fill the room

const ui = createUI(stage);

// ---------------------------------------------------------------------------
// The domain
// ---------------------------------------------------------------------------

/**
 * The room, as a signed distance function: negative in the air, positive in
 * the solid. One definition, used three ways — it masks the solver, it draws
 * the walls, and it is what makes the walls in the picture exactly the walls
 * the wave equation was solved in. There is no second copy of the geometry to
 * drift out of agreement with this one.
 *
 * The pieces, left to right: a rounded outer shell; a divider with a slit in
 * it, closing off a side chamber; two pillars; a tilted slab along the bottom;
 * and a concave arc of radius 3.4 about (−0.9, 0.35). The arc is what makes the
 * middle of the room interesting — the source sits 4.35 from its vertex and its
 * focal length is 1.7, so the front comes back to a caustic around x ≈ −0.3,
 * inverted across the axis. It is a fast mirror (half-angle 0.55 on R = 3.4),
 * so that is a cusp with visible spherical aberration rather than a point,
 * which is the more honest picture anyway.
 *
 * `sdArc` is an approximate distance near the ends of the arc — the wedge cut
 * is a cone rather than a rounded cap. Inside/outside is exact, which is what
 * the solver needs; the drawn edge is off by a hair at two points nobody looks
 * at.
 */
const SDF = /* glsl */ `
  float sdBox(vec2 p, vec2 b) {
    vec2 d = abs(p) - b;
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
  }
  float sdRoundBox(vec2 p, vec2 b, float r) { return sdBox(p, b - r) - r; }
  float sdDisc(vec2 p, vec2 c, float r) { return length(p - c) - r; }
  float sdArc(vec2 p, vec2 c, float R, float th, vec2 axis, float cosHalf) {
    vec2 q = p - c;
    float ring = abs(length(q) - R) - th;
    float wedge = cosHalf * length(q) - dot(q, axis);
    return max(ring, wedge);
  }
  vec2 rot(vec2 p, float a) {
    float s = sin(a), c = cos(a);
    return vec2(c * p.x + s * p.y, -s * p.x + c * p.y);
  }

  /** Negative in the air the wave lives in, positive in the walls. */
  float air(vec2 p) {
#ifdef BEAM
    // wave-to-ray's scene, in a room: the lamp in its housing, the flat
    // mirror, the concave one, all at that demo's coordinates.
    float d = sdRoundBox(p, vec2(5.25, 2.88), 0.55);
    vec2 A = vec2(cos(radians(-24.0)), sin(radians(-24.0)));
    vec2 N = vec2(-A.y, A.x);
    vec2 q = vec2(dot(p - vec2(-4.55, 1.75), A), dot(p - vec2(-4.55, 1.75), N));
    d = max(d, -sdBox(q - vec2(-0.3, 0.0), vec2(0.04, 0.99)));
    d = max(d, -sdBox(q - vec2(-0.08, 0.95), vec2(0.26, 0.04)));
    d = max(d, -sdBox(q - vec2(-0.08, -0.95), vec2(0.26, 0.04)));
    d = max(d, -sdBox(rot(p - vec2(1.29, -0.85), radians(18.0)), vec2(1.15, 0.05)));
    d = max(d, -sdArc(p, vec2(-0.104, 0.135), 3.4, 0.05, vec2(cos(radians(30.0)), sin(radians(30.0))), cos(radians(17.0))));
    return d;
#else
    float d = sdRoundBox(p, vec2(5.05, 2.72), 0.55);

    // The divider, with its slit.
    float wall = sdBox(p - vec2(-2.55, 0.0), vec2(0.085, 3.2));
    float slit = sdBox(p - vec2(-2.55, 0.45), vec2(0.35, 0.26));
    d = max(d, -max(wall, -slit));

    d = max(d, -sdDisc(p, vec2(0.35, -1.25), 0.52));
    d = max(d, -sdDisc(p, vec2(-0.75, 1.95), 0.26));
    d = max(d, -sdBox(rot(p - vec2(-0.9, -2.15), 0.42), vec2(1.15, 0.09)));
    d = max(d, -sdArc(p, vec2(-0.9, 0.35), 3.4, 0.1, vec2(1.0, 0.0), cos(0.55)));

    return d;
#endif
  }
`;

// ---------------------------------------------------------------------------
// Physics constants
// ---------------------------------------------------------------------------

/**
 * Courant number, c dt/dx. The 2D five-point scheme is stable up to 1/√2;
 * 0.5 leaves room and keeps the dispersion mild.
 */
const COURANT = 0.5;

/**
 * How far the front travels in one second of demo time. This, not the grid, is
 * what sets the pace: it crosses the room in a little over five seconds, slow
 * enough to watch a wavefront arrive somewhere rather than find it already
 * there. It also sets the frequency the source oscillates at, SPEED/λ, so the
 * fringes crawl at the same rate the front does.
 */
const SPEED = 2.0;

const GRIDS = [320, 480, 640, 960];

/** How much of the damping the auto exposure undoes. See the frame callback. */
const GAIN_COMP = 0.45;

/**
 * The time-average display shows a mean of u², which for a pulse that has
 * spread over a whole room is a couple of orders below the field's own scale.
 * This puts the two displays at comparable brightness so `exposure` means the
 * same kind of thing in both.
 */
const AVG_GAIN = 45;

// ---------------------------------------------------------------------------
// The solver
// ---------------------------------------------------------------------------

const QUAD_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const STEP_FRAG = /* glsl */ `
  precision highp float;

  // GLSL3 in three defines \`varying\` but not \`gl_FragColor\`; a missing output
  // declaration fails to compile silently and everything renders black.
  layout(location = 0) out vec4 fragColor;

  uniform sampler2D uState;
  uniform vec2 uSize;
  uniform vec2 uMin;
  uniform vec2 uMax;
  uniform float uC2;      // Courant squared
  uniform float uDamp;    // gamma * dt
  uniform vec2 uSrcPos;
  uniform float uSrcSigma;
  uniform float uDrive;   // the source's time profile, this step
  uniform vec2 uSrcAxis;  // a line source's facing direction
  uniform float uSrcWaist; // its Gaussian half-width across the beam; 0 = a point
  uniform float uEma;     // 0: b accumulates u-squared; > 0: b is a running average with this weight per step

  varying vec2 vUv;

  ${SDF}

  void main() {
    ivec2 c = ivec2(gl_FragCoord.xy);
    ivec2 hi = ivec2(uSize) - 1;
    vec4 s = texelFetch(uState, c, 0);
    float acc = s.b;

    vec2 p = mix(uMin, uMax, vUv);
    // A wall cell is pinned to zero, every step. Its neighbours then read the
    // right thing out of the same texture, so the Dirichlet condition needs no
    // pass of its own — and the sum of u-squared is kept, so switching the
    // display does not depend on where the walls are.
    if (air(p) >= 0.0) {
      fragColor = vec4(0.0, 0.0, acc, 1.0);
      return;
    }

    float u = s.r;
    float up = s.g;
    float lap =
      texelFetch(uState, clamp(c + ivec2(1, 0), ivec2(0), hi), 0).r +
      texelFetch(uState, clamp(c - ivec2(1, 0), ivec2(0), hi), 0).r +
      texelFetch(uState, clamp(c + ivec2(0, 1), ivec2(0), hi), 0).r +
      texelFetch(uState, clamp(c - ivec2(0, 1), ivec2(0), hi), 0).r -
      4.0 * u;

    float un = (2.0 * u - (1.0 - uDamp) * up + uC2 * lap) / (1.0 + uDamp);

    // A soft (additive) source, so it drives the field without also acting as a
    // scatterer. Gaussian over a few cells: a single-cell source would radiate
    // the grid's own corner frequencies as much as the wave's.
    if (uSrcWaist > 0.0) {
      // A Gaussian-tapered line across the beam, all in phase: it launches a
      // beam along uSrcAxis (and back into the housing, which returns it).
      vec2 rel = p - uSrcPos;
      float across = dot(rel, uSrcAxis);
      float along = dot(rel, vec2(-uSrcAxis.y, uSrcAxis.x));
      un += uDrive * (uSrcSigma / uSrcWaist) * exp(-(across * across) / (2.0 * uSrcSigma * uSrcSigma))
        * exp(-(along * along) / (2.0 * uSrcWaist * uSrcWaist));
    } else {
      float r = length(p - uSrcPos);
      un += uDrive * exp(-(r * r) / (2.0 * uSrcSigma * uSrcSigma));
    }

    fragColor = vec4(un, u, uEma > 0.0 ? mix(acc, un * un, uEma) : acc + un * un, 1.0);
  }
`;

const DISPLAY_FRAG = /* glsl */ `
  precision highp float;
  layout(location = 0) out vec4 fragColor;

  uniform sampler2D uState;
  uniform vec2 uSize;
  uniform vec2 uMin;
  uniform vec2 uMax;
  uniform int uMode;       // 0 = field, 1 = time average
  uniform float uMix;     // 0 = field, 1 = time average, between = a crossfade
  uniform float uAvgGain;
  uniform float uGain;
  uniform float uSteps;
  uniform vec3 uWarm;
  uniform vec3 uCool;
  uniform vec3 uRamp[5];
  uniform vec3 uEdge;
  uniform vec3 uInk;
  uniform vec2 uSrcPos;
  uniform float uShowSrc;
  uniform float uSplit;    // 1 = two panels: the field at the left, the brightness at the right
  uniform float uPanel;    // a panel's scale against the whole frame

  varying vec2 vUv;

  ${SDF}

  /**
   * Smooth bilinear read of the state grid. The state texture is nearest-only
   * (a float target that has to be texelFetch-able on every machine), so the
   * interpolation is done here; the Hermite weights keep the diamond pattern a
   * plain bilinear leaves at this magnification off the fringes.
   */
  vec4 sampleState(vec2 p) {
    vec2 g = (p - uMin) / (uMax - uMin) * uSize - 0.5;
    vec2 i = floor(g);
    vec2 f = g - i;
    f = f * f * (3.0 - 2.0 * f);
    ivec2 b = ivec2(i);
    ivec2 hi = ivec2(uSize) - 1;
    vec4 s00 = texelFetch(uState, clamp(b, ivec2(0), hi), 0);
    vec4 s10 = texelFetch(uState, clamp(b + ivec2(1, 0), ivec2(0), hi), 0);
    vec4 s01 = texelFetch(uState, clamp(b + ivec2(0, 1), ivec2(0), hi), 0);
    vec4 s11 = texelFetch(uState, clamp(b + ivec2(1, 1), ivec2(0), hi), 0);
    return mix(mix(s00, s10, f.x), mix(s01, s11, f.x), f.y);
  }

  vec3 rampCol(float x) {
    x = clamp(x, 0.0, 1.0) * 4.0;
    int i = int(min(floor(x), 3.0));
    return mix(uRamp[i], uRamp[i + 1], x - float(i));
  }

  void main() {
    vec2 p = mix(uMin, uMax, vUv);
    float mixv = uMix;
    float outside = 0.0;
    if (uSplit > 0.5) {
      // Both panels read the same state: one solve, drawn twice.
      bool right = p.x > 0.0;
      p = (p - vec2((right ? 0.5 : -0.5) * uMax.x, 0.0)) / uPanel;
      outside = (abs(p.x) > uMax.x || abs(p.y) > uMax.y) ? 1.0 : 0.0;
      mixv = right ? 1.0 : 0.0;
    }
    float d = air(p);
    vec4 s = sampleState(p);

    vec3 col;
    // The time average of u-squared: what a detector sitting in the room for
    // the whole run would report, which is the quantity the rest of the deck
    // calls brightness.
    vec3 avg = rampCol(pow(s.b / max(uSteps, 1.0) * uAvgGain, 0.5));
    if (uMode == 1) {
      col = avg;
    } else {
      // The field itself, signed — the thing being solved for. The shoulder is
      // soft rather than a clamp: near the source the amplitude is a couple of
      // orders above the reverberant tail, and a hard clip turns every fringe
      // within a room-width of it into a flat band of pure ochre.
      float a = s.r * uGain;
      float m = 1.0 - exp(-abs(a));
      col = (a > 0.0 ? uWarm : uCool) * m;
      col = mix(col, avg, mixv);
    }

    // The walls, straight off the same SDF: a lit rim on the surface falling to
    // black inside the solid. The falloff has *finite* support — smoothstep,
    // not an exponential — so everything more than RIM from a surface is
    // exactly zero rather than nearly zero. That is what keeps the border of
    // the frame pure black instead of the faint slate an exponential tail
    // leaves there, and it puts the solids in the same black the deck's void
    // is, with only their glowing boundary drawn.
    const float RIM = 0.12;
    float aa = max(fwidth(d), 1e-5);
    float e = 1.0 - smoothstep(0.0, RIM, max(d, 0.0));
    vec3 wall = uEdge * e * e;
    col = mix(col, wall, smoothstep(-aa, aa, d));

    if (uShowSrc > 0.5) {
      float ring = abs(length(p - uSrcPos) - 0.1) - 0.008;
      col = mix(col, uInk, 1.0 - smoothstep(0.0, max(fwidth(ring), 1e-5), ring));
    }

    fragColor = vec4(col * (1.0 - outside), 1.0);
  }
`;

/**
 * `?scene=beam`: wave-to-ray's geometry, so this slide and that one show the
 * same scene (Steve, 2026-10-29): a lamp in a housing, open on one side, sends
 * a continuous beam at a flat mirror and then the concave one, all inside a
 * closed room, so after the mirrors the light keeps bouncing round the room.
 * The lamp is a Gaussian-tapered line of in-phase sources across the opening
 * (wave-to-ray's aperture, SOURCE there), so what leaves it is a beam; the
 * default scene keeps its point source.
 */
const BEAM = new URLSearchParams(location.search).get('scene') === 'beam';
const SCENE_DEFINES: Record<string, string> = BEAM ? { BEAM: '' } : {};
const BEAM_AXIS = new THREE.Vector2(Math.cos((-24 * Math.PI) / 180), Math.sin((-24 * Math.PI) / 180));
const BEAM_WAIST = 0.42;
/**
 * The beam scene has a `view` toggle (Steve, 2026-10-29): the electric field
 * itself, oscillating, or its brightness, the time average of its square,
 * which is what an eye or a camera records and what wave-to-ray, the next
 * slide, computes directly; a label in the frame says which. In the steady
 * state the brightness stands still while the field goes on oscillating
 * under it. The average is a running one over the last AVG_WINDOW seconds,
 * so it is the light now, from any moment the toggle is pressed; switching
 * crossfades over SWITCH seconds.
 */
const AVG_WINDOW = 1.0;
const SWITCH = 0.6;
/**
 * `?scene=beam&split`: the two views side by side instead of a toggle (Steve,
 * 2026-10-29), so the field oscillating and the brightness settling are seen
 * at once. One solve, drawn twice: the right panel is the left one's running
 * average, not a second simulation.
 */
const SPLIT = BEAM && new URLSearchParams(location.search).has('split');
const PANEL = 0.48;

const simScene = new THREE.Scene();
const simCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const simMat = new THREE.ShaderMaterial({
  glslVersion: THREE.GLSL3,
  uniforms: {
    uState: { value: null },
    uSize: { value: new THREE.Vector2() },
    uMin: { value: new THREE.Vector2(-HALF_W, -ORTHO_H) },
    uMax: { value: new THREE.Vector2(HALF_W, ORTHO_H) },
    uC2: { value: COURANT * COURANT },
    uDamp: { value: 0 },
    uSrcPos: { value: new THREE.Vector2() },
    uSrcSigma: { value: 0.05 },
    uDrive: { value: 0 },
    uSrcAxis: { value: new THREE.Vector2(1, 0) },
    uSrcWaist: { value: 0 },
    uEma: { value: 0 },
  },
  defines: SCENE_DEFINES,
  vertexShader: QUAD_VERT,
  fragmentShader: STEP_FRAG,
});
simScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), simMat));

const RAMP = [C.slateDeep, C.rustDeep, C.ochreDeep, C.ochre, C.bone];

const displayScene = new THREE.Scene();
const displayCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const displayMat = new THREE.ShaderMaterial({
  glslVersion: THREE.GLSL3,
  uniforms: {
    uState: { value: null },
    uSize: { value: new THREE.Vector2() },
    uMin: { value: new THREE.Vector2(-HALF_W, -ORTHO_H) },
    uMax: { value: new THREE.Vector2(HALF_W, ORTHO_H) },
    uMode: { value: 0 },
    uMix: { value: 0 },
    uAvgGain: { value: 1 },
    uGain: { value: 1 },
    uSteps: { value: 1 },
    uWarm: { value: new THREE.Color(C.ochre) },
    uCool: { value: new THREE.Color(C.blue) },
    // Black first, so an unlit room is black rather than slate.
    uRamp: { value: [new THREE.Color(0x000000), ...RAMP.slice(1).map((c) => new THREE.Color(c))] },
    uEdge: { value: new THREE.Color(C.slate) },
    uInk: { value: new THREE.Color(C.bone) },
    uSrcPos: { value: new THREE.Vector2() },
    uShowSrc: { value: 1 },
    uSplit: { value: SPLIT ? 1 : 0 },
    uPanel: { value: PANEL },
  },
  defines: SCENE_DEFINES,
  vertexShader: QUAD_VERT,
  fragmentShader: DISPLAY_FRAG,
});
displayScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), displayMat));

if (!stage.renderer.extensions.has('EXT_color_buffer_float')) {
  console.warn('wave-room: float render targets are unavailable; the solver will not run.');
}

function makeTarget(w: number, h: number): THREE.WebGLRenderTarget {
  return new THREE.WebGLRenderTarget(w, h, {
    type: THREE.FloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: false,
    stencilBuffer: false,
  });
}

let gridW = 640;
let gridH = 360;
let read = makeTarget(gridW, gridH);
let write = makeTarget(gridW, gridH);

/** What the display target draws onto, in the room's own coordinates. */
const displayTarget = new THREE.WebGLRenderTarget(64, 64, {
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
  depthBuffer: false,
});

// The picture reaches the canvas through a plain textured quad, the same way
// `wave-to-ray`'s field does, so it goes through the deck's tone mapping and
// colour handling rather than around it.
const screen = new THREE.Mesh(
  new THREE.PlaneGeometry(2 * HALF_W, 2 * ORTHO_H),
  new THREE.MeshBasicMaterial({ map: displayTarget.texture }),
);
screen.position.z = -1;
stage.add(screen);

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

const params = {
  source: (BEAM ? 'continuous' : 'pulse') as 'pulse' | 'train' | 'continuous',
  wavelength: 0.32,
  amplitude: 1.0,
  // Per second, so it halves alongside SPEED: the loss the wave takes per
  // bounce is what the picture reads, and that should not change when the
  // whole thing is slowed down.
  damping: 0.12,
  // In the beam scene, the lamp sits just in front of the back of its housing.
  sourceX: BEAM ? -4.55 - 0.12 * BEAM_AXIS.x : -1.85,
  sourceY: BEAM ? 1.75 - 0.12 * BEAM_AXIS.y : -0.9,
  display: 'field' as 'field' | 'time average',
  exposure: BEAM ? 1.2 : 0.5, // a driven beam is not compensated by auto gain (see the frame callback)
  autoGain: true,
  grid: 640,
  marker: !BEAM,
  view: 'wave' as 'wave' | 'brightness',
};
let viewMix = 0;
let lastFrameT = 0;
ui.params.add(params, 'source', ['pulse', 'train', 'continuous']).name('source');
ui.params.add(params, 'wavelength', 0.15, 0.9, 0.01).name('wavelength');
ui.params.add(params, 'amplitude', 0.1, 4, 0.05).name('amplitude');
ui.params.add(params, 'damping', 0, 2, 0.01).name('damping');
ui.params.add(params, 'sourceX', -5, 5, 0.05).name('source x');
ui.params.add(params, 'sourceY', -2.6, 2.6, 0.05).name('source y');
ui.params.add(params, 'display', ['field', 'time average']).name('display');
ui.params.add(params, 'exposure', 0.05, 8, 0.05).name('exposure');
ui.params.add(params, 'autoGain').name('auto gain');
ui.params.add(params, 'grid', GRIDS).name('grid width');
ui.params.add(params, 'marker').name('source marker');
if (BEAM && !SPLIT) ui.params.add(params, 'view', ['wave', 'brightness']);

// What is being plotted, in the frame (beam scene only).
const viewLabel = (text: string) => {
  const l = label(text, { size: 0.22, color: C.bone, anchorX: 'right', anchorY: 'bottom', position: [4.95, -2.62, 1] });
  l.outlineWidth = '14%';
  l.outlineColor = 0x000000;
  l.visible = BEAM;
  stage.add(l);
  return l;
};
const fieldLabel = viewLabel('electric field');
const brightLabel = viewLabel('brightness (time average)');
// In the split view each panel is named under it instead.
const panelLabel = (text: string, x: number) => {
  const l = label(text, { size: 0.2, color: C.bone, anchorX: 'center', anchorY: 'top', position: [x, -PANEL * ORTHO_H - 0.14, 1] });
  l.visible = SPLIT;
  stage.add(l);
  return l;
};
panelLabel('electric field', -HALF_W / 2);
panelLabel('brightness (time average)', HALF_W / 2);
// ---------------------------------------------------------------------------
// Marching
// ---------------------------------------------------------------------------

let stepsDone = 0;
let signature = '';
let dx = (2 * HALF_W) / gridW;
let dt = (COURANT * dx) / SPEED;

/** Clear both buffers. The room starts at rest, every time. */
function resetSim(): void {
  const prev = stage.renderer.getRenderTarget();
  for (const rt of [read, write]) {
    stage.renderer.setRenderTarget(rt);
    stage.renderer.clear(true, false, false);
  }
  stage.renderer.setRenderTarget(prev);
  stepsDone = 0;
}

function setGrid(w: number): void {
  if (w === gridW) return;
  gridW = w;
  gridH = Math.round((w * 9) / 16);
  read.dispose();
  write.dispose();
  read = makeTarget(gridW, gridH);
  write = makeTarget(gridW, gridH);
}

/**
 * The source's time profile at τ, already carrying the factors that make
 * `amplitude` mean roughly "displacement at the source": the injection is a
 * rate, so it is multiplied by ω dt and accumulates to an amplitude of order
 * `amplitude` over a quarter cycle, independent of the grid.
 */
function drive(tau: number, omega: number, mode: string): number {
  const width = 1.2 / (omega / (2 * Math.PI));
  const rate = params.amplitude * omega * dt;
  if (mode === 'continuous') {
    // Ramped on over a couple of cycles, or the step at τ = 0 rings the room
    // with every frequency the grid can hold.
    const on = 1 - Math.exp(-tau * omega * 0.08);
    return rate * on * Math.sin(omega * tau);
  }
  const period = 3.2;
  const t0 = 3 * width;
  const local = mode === 'train' ? tau - Math.floor(tau / period) * period : tau;
  const x = (local - t0) / width;
  if (Math.abs(x) > 4) return 0;
  return rate * Math.exp(-x * x) * Math.sin(omega * (local - t0));
}

function stepOnce(n: number, omega: number): void {
  const tau = (n + 1) * dt;
  simMat.uniforms.uState.value = read.texture;
  simMat.uniforms.uDrive.value = drive(tau, omega, params.source);
  stage.renderer.setRenderTarget(write);
  stage.renderer.render(simScene, simCam);
  const swap = read;
  read = write;
  write = swap;
  stepsDone = n + 1;
}

const bufSize = new THREE.Vector2();

stage.frame((t) => {
  // Everything that changes the equation being solved forces a cold restart,
  // so the state on screen is always exactly `floor(t/dt)` steps from silence
  // and never a mixture of two settings.
  const sig = [
    params.grid,
    params.wavelength,
    params.amplitude,
    params.damping,
    params.source,
    params.sourceX,
    params.sourceY,
  ].join('|');
  if (sig !== signature) {
    signature = sig;
    setGrid(params.grid);
    dx = (2 * HALF_W) / gridW;
    dt = (COURANT * dx) / SPEED;
    resetSim();
  }
  simMat.uniforms.uEma.value = BEAM ? Math.min(1, dt / AVG_WINDOW) : 0;

  const omega = (2 * Math.PI * SPEED) / params.wavelength;
  simMat.uniforms.uSize.value.set(gridW, gridH);
  simMat.uniforms.uDamp.value = params.damping * dt;
  simMat.uniforms.uSrcPos.value.set(params.sourceX, params.sourceY);
  simMat.uniforms.uSrcAxis.value.copy(BEAM_AXIS);
  simMat.uniforms.uSrcWaist.value = BEAM ? BEAM_WAIST : 0;
  // Band-limit the source to well under a wavelength, so what leaves it is the
  // wave and not the grid.
  simMat.uniforms.uSrcSigma.value = Math.max(1.5 * dx, params.wavelength / 6);

  const target = Math.max(0, Math.floor((t % stage.duration) / dt));
  if (target < stepsDone) resetSim();
  const prev = stage.renderer.getRenderTarget();
  while (stepsDone < target) stepOnce(stepsDone, omega);

  // --- draw ----------------------------------------------------------------
  stage.renderer.getDrawingBufferSize(bufSize);
  const dw = Math.max(64, Math.round(bufSize.x));
  const dh = Math.max(36, Math.round(bufSize.y));
  if (displayTarget.width !== dw || displayTarget.height !== dh) displayTarget.setSize(dw, dh);

  const tau = stepsDone * dt;
  const uni = displayMat.uniforms;
  uni.uState.value = read.texture;
  uni.uSize.value.set(gridW, gridH);
  uni.uMode.value = params.display === 'time average' ? 1 : 0;
  uni.uSteps.value = BEAM ? 1 : Math.max(1, stepsDone); // the running average is already a mean
  // The toggle crossfades: toward its target at 1 / SWITCH per second of stage time.
  const want = params.view === 'brightness' ? 1 : 0;
  const step = Math.max(0, t - lastFrameT) / SWITCH;
  lastFrameT = t;
  viewMix = want > viewMix ? Math.min(want, viewMix + step) : Math.max(want, viewMix - step);
  if (!BEAM) viewMix = 0;
  uni.uMix.value = THREE.MathUtils.smoothstep(viewMix, 0, 1);
  // troika fades by fillOpacity / outlineOpacity, not the material's opacity.
  for (const [l, o] of [[fieldLabel, 1 - uni.uMix.value], [brightLabel, uni.uMix.value]] as const) {
    l.fillOpacity = o;
    l.outlineOpacity = o;
    l.visible = BEAM && !SPLIT && o > 0.01;
  }
  // The beam scene's steady state is bright (a driven beam, nothing decaying): a quarter of the gain.
  uni.uAvgGain.value = params.exposure * AVG_GAIN * (BEAM ? 0.25 : 1);
  // The front spreads as 1/√r and the room is damped, so by the end the field
  // is a small fraction of what it started as and a fixed exposure shows a
  // black room. `auto gain` pushes back against both — √τ for the spreading,
  // and part of an e^{γτ} for the damping. Only part: undo the damping exactly
  // and the late field, which is a statistically uniform speckle, comes up to
  // full saturation everywhere and the last third of the run is mush. At
  // GAIN_COMP the room still visibly quietens while staying readable.
  //
  // It is one scalar over the whole frame, so nothing within a frame is
  // reweighted against anything else; turn it off to see the actual amplitudes.
  //
  // A continuous source is exempt: it is driven, so the field climbs to a
  // steady state instead of decaying, and compensating a decay that is not
  // happening just blows the late frames out.
  const decaying = params.source !== 'continuous';
  const auto =
    params.autoGain && params.display === 'field' && decaying
      ? Math.min(12, Math.exp(GAIN_COMP * params.damping * tau) * Math.sqrt(1 + tau / 2))
      : 1;
  uni.uGain.value = params.exposure * auto * (params.display === 'time average' ? AVG_GAIN : 1);
  uni.uSrcPos.value.set(params.sourceX, params.sourceY);
  uni.uShowSrc.value = params.marker ? 1 : 0;

  stage.renderer.setRenderTarget(displayTarget);
  stage.renderer.render(displayScene, displayCam);
  stage.renderer.setRenderTarget(prev);
});

stage.start();
