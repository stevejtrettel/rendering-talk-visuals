/**
 * A material is a measure on directions, valued in multipliers.
 *
 * One frame, four materials. A lamp moves around a surface point; nothing about
 * the light changes as it goes and nothing about the material changes either.
 * Only the *direction* the light arrives from changes, and that is the one thing
 * the measure is a function of. So the outgoing spectrum rising and falling is
 * the measure doing its job.
 *
 * ## Reading the picture
 *
 * At the point p: the circle is every direction at p. The band standing off it
 * is the measure where it has a density; a spike with a blob on the end is an
 * atom, and its blob is the mass. The bright radial mark is where the lamp
 * currently sits.
 *
 * Then three graphs, all against wavelength, and they multiply honestly:
 *   in        the spectrum arriving from the lamp. Never changes.
 *   response  what the material does to light from the direction the lamp is in:
 *             the pigment's multiplier times how much that direction counts.
 *   out       exactly in times response.
 *
 * All on fixed scales, so a shorter curve means less light. `out` has a ceiling
 * line, because a mirror really does send far more light one way than a diffuse
 * surface sends any way, and clipping is more honest than rescaling.
 *
 * ## The four
 *
 *   lambert   a smooth |n·ω| band. `out` changes height, never shape: the
 *             surface changes brightness as the lamp moves, never colour.
 *   mirror    one atom, at the mirror direction of ω_o. `out` is flat zero until
 *             the lamp crosses it, then everything at once. Drawn as a spike
 *             with a mass, deliberately not as a tall narrow bump — no density
 *             represents this.
 *   glass     two atoms: one at the mirror direction, one *below the surface*,
 *             where Snell puts it. This is where the lower half of the circle
 *             earns its keep. Fresnel splits the mass between them and moves it
 *             as ω_o slants.
 *   rough     the atom spread into a lobe. Take `roughness` down and watch the
 *             lobe climb through the ceiling while the mass bar does not move:
 *             the densities blow up, the measure does not. That is the whole
 *             reason for carrying measures.
 *
 * ## Why the lamp has a width
 *
 * A point lamp against an atom gives zero almost everywhere and something
 * undefined at one angle. Giving the lamp a small angular size makes every
 * answer finite, and it is what real lamps are like anyway.
 */

import * as THREE from 'three';
import { createStage, createUI, C, flat } from '@';
import { polyline, setPolyline, type Pt } from '@/lines';
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
stage.duration = 12;

const ui = createUI(stage);

// ---------------------------------------------------------------------------
// Spectra
// ---------------------------------------------------------------------------

const WL0 = 400;
const WL1 = 700;
const NS = 120; // fine enough that the lamp's narrow lines are not aliased
const wavelength = (i: number) => WL0 + ((WL1 - WL0) * i) / NS;
const bell = (l: number, c: number, w: number) => Math.exp(-0.5 * ((l - c) / w) ** 2);

function planck(nm: number, T: number): number {
  const l = nm * 1e-9;
  return 3.7418e-16 / (l ** 5 * (Math.exp(1.4388e-2 / (l * T)) - 1));
}

/**
 * The lamp: a warm continuum with lines on it, normalised so its peak is 1.
 *
 * A smooth Planck curve was the wrong choice — multiplied by a smooth response
 * it gives a smooth bump, and the multiplication is invisible. Lines make it
 * visible: the ones the pigment passes come through, the ones it absorbs are cut
 * down, and the same structure is recognisable in `out` with a different
 * envelope. It is also what a real fluorescent lamp looks like.
 */
const LAMP = (() => {
  const LINES: [number, number, number][] = [
    [436, 0.55, 10],
    [488, 0.38, 11],
    [546, 0.95, 10],
    [585, 0.5, 12],
    [612, 0.7, 11],
  ];
  const out = new Float32Array(NS + 1);
  let peak = 1e-9;
  for (let i = 0; i <= NS; i++) {
    const l = wavelength(i);
    let v = (0.4 * planck(l, 3000)) / planck(700, 3000);
    for (const [c, h, w] of LINES) v += h * bell(l, c, w);
    out[i] = v;
    peak = Math.max(peak, v);
  }
  for (let i = 0; i <= NS; i++) out[i] /= peak;
  return out;
})();

function spectrum(f: (l: number) => number): Float32Array {
  const out = new Float32Array(NS + 1);
  for (let i = 0; i <= NS; i++) out[i] = f(wavelength(i));
  return out;
}

/** A green pigment, a near-neutral metal, and glass's two tints. */
const PIGMENT = spectrum((l) => 0.08 + 0.82 * bell(l, 545, 42));
const METAL = spectrum((l) => 0.72 + 0.16 * bell(l, 640, 120));
const GLASS_R = spectrum(() => 0.95);
const GLASS_T = spectrum((l) => 0.7 + 0.25 * bell(l, 505, 90));

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

const P = { x: -2.85, y: -0.5 };
const R = 1.15;
const LOBE = 0.38;
/** Where the drawing of a density has to stop. Densities are unbounded. */
const CEILING = 2.1 * LOBE;
/** Everything at p has to fit inside this, or the lamp orbits off the frame. */

const SURFACE_X0 = -5.25;
const SURFACE_X1 = -0.6;
const SLAB = 0.4;
const LAMP_R = R + CEILING + 0.35;

/** Half the lamp's angular size. */
const LAMP_HALF = (12 * Math.PI) / 180;
/** Refractive index of the glass. */
const ETA = 1.5;

// ---------------------------------------------------------------------------
// The measure
// ---------------------------------------------------------------------------

type Mode = 'lambert' | 'mirror' | 'glass' | 'rough';

interface Atom {
  a: number;
  mass: number;
  mult: Float32Array;
}
interface Measure {
  /** Density per radian, or null where the measure has no density. */
  density: ((a: number) => number) | null;
  densityMult: Float32Array;
  atoms: Atom[];
  /** Total mass, for the bar. */
  mass: number;
}

const LAMBERT_MASS = 0.85;
const MIRROR_MASS = 0.85;

/** Mirror direction of ω_o, about the normal. */
const mirrorDir = (ao: number) => Math.PI - ao;

/** Schlick, with cos θ measured from the normal. */
function fresnel(ao: number): number {
  const c = Math.max(0, Math.abs(Math.sin(ao)));
  return 0.04 + 0.96 * Math.pow(1 - c, 5);
}

/**
 * Where light has to come from, below the surface, to leave along ω_o. Snell on
 * the tangential component, and then it arrives from the opposite direction to
 * the one it travels.
 */
function transmitDir(ao: number): number {
  const sinT = Math.cos(ao) / ETA;
  const cosT = Math.sqrt(Math.max(0, 1 - sinT * sinT));
  return Math.atan2(-cosT, -sinT);
}

/** Shortest signed angle between two directions. */
function angDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

function measureFor(mode: Mode, ao: number, roughness: number): Measure {
  if (mode === 'lambert') {
    // Normalised so the mass is LAMBERT_MASS: the integral of sin over the
    // hemisphere is 2.
    return {
      density: (a) => (a > 0 && a < Math.PI ? (LAMBERT_MASS * Math.sin(a)) / 2 : 0),
      densityMult: PIGMENT,
      atoms: [],
      mass: LAMBERT_MASS,
    };
  }
  if (mode === 'mirror') {
    return {
      density: null,
      densityMult: METAL,
      atoms: [{ a: mirrorDir(ao), mass: MIRROR_MASS, mult: METAL }],
      mass: MIRROR_MASS,
    };
  }
  if (mode === 'glass') {
    const rf = fresnel(ao);
    return {
      density: null,
      densityMult: GLASS_R,
      atoms: [
        { a: mirrorDir(ao), mass: rf, mult: GLASS_R },
        { a: transmitDir(ao), mass: 1 - rf, mult: GLASS_T },
      ],
      mass: 1,
    };
  }
  // Rough: the atom spread into a lobe of the same mass.
  const m = mirrorDir(ao);
  const s = Math.max(0.02, roughness);
  const norm = MIRROR_MASS / (s * Math.sqrt(2 * Math.PI));
  return {
    density: (a) => norm * Math.exp(-0.5 * (angDiff(a, m) / s) ** 2),
    densityMult: METAL,
    atoms: [],
    mass: MIRROR_MASS,
  };
}

/**
 * The response the material puts on light from the lamp's direction: how much
 * of the measure the lamp covers, times the multiplier. Written this way so
 * `out = in x response` holds exactly, atoms and densities alike.
 */
const DREF = 0.5; // a Lambertian at normal incidence comes out at 1
function responseAt(mu: Measure, lampA: number, out: Float32Array): void {
  out.fill(0);
  const window = 2 * LAMP_HALF;

  if (mu.density) {
    // Integrate the density over the lamp's disc.
    let acc = 0;
    const N = 24;
    for (let k = 0; k < N; k++) {
      const a = lampA - LAMP_HALF + (window * (k + 0.5)) / N;
      acc += mu.density(a) * (window / N);
    }
    const coef = acc / (window * DREF);
    for (let i = 0; i <= NS; i++) out[i] += coef * mu.densityMult[i];
  }

  for (const atom of mu.atoms) {
    if (Math.abs(angDiff(atom.a, lampA)) > LAMP_HALF) continue;
    const coef = atom.mass / (window * DREF);
    for (let i = 0; i <= NS; i++) out[i] += coef * atom.mult[i];
  }
}

// ---------------------------------------------------------------------------
// Scenery
// ---------------------------------------------------------------------------

{
  const g = new THREE.PlaneGeometry(SURFACE_X1 - SURFACE_X0, SLAB);
  g.translate((SURFACE_X0 + SURFACE_X1) / 2, P.y - SLAB / 2, -0.1);
  stage.add(new THREE.Mesh(g, flat(C.mossDeep)));
}
stage.add(
  polyline(
    [
      [SURFACE_X0, P.y, 0],
      [SURFACE_X1, P.y, 0],
    ],
    { color: C.moss, width: 5 },
  ),
);

function arcPts(r: number, a0: number, a1: number, n = 96): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push([P.x + r * Math.cos(a), P.y + r * Math.sin(a), 0]);
  }
  return pts;
}

stage.add(polyline(arcPts(R, 0, Math.PI), { color: C.slate, width: 2, opacity: 0.85 }));
const lowerArc = polyline(arcPts(R, Math.PI, 2 * Math.PI), { color: C.slateDeep, width: 2 });
stage.add(lowerArc);

// The ceiling a drawn density is allowed to reach.
stage.add(
  polyline(arcPts(R + CEILING, 0, Math.PI), { color: C.slateDeep, width: 1, opacity: 0.6 }),
);

// The band, rebuilt each frame: fixed vertex count, positions rewritten.
const BAND_N = 160;
const bandGeom = new THREE.BufferGeometry();
const bandPos = new Float32Array((BAND_N + 1) * 2 * 3);
bandGeom.setAttribute('position', new THREE.BufferAttribute(bandPos, 3));
{
  const idx: number[] = [];
  for (let i = 0; i < BAND_N; i++) {
    const j = 2 * i;
    idx.push(j, j + 1, j + 3, j, j + 3, j + 2);
  }
  bandGeom.setIndex(idx);
}
const bandMesh = new THREE.Mesh(
  bandGeom,
  flat(C.ochreDeep, { transparent: true, opacity: 0.6, side: THREE.DoubleSide }),
);
stage.add(bandMesh);
const bandEdge = polyline(
  Array.from({ length: BAND_N + 1 }, () => [0, 0, 0] as Pt),
  { color: C.ochre, width: 3 },
);
stage.add(bandEdge);

// Atoms: a spike of fixed height with a blob whose size is the mass. Never a
// tall narrow bump — the point of the mirror slide is that no density does this.
const MAX_ATOMS = 2;
const atomSpikes = Array.from({ length: MAX_ATOMS }, () => {
  const l = polyline(
    [
      [0, 0, 0],
      [0, 0, 0],
    ],
    { color: C.ochre, width: 5 },
  );
  l.renderOrder = 4;
  stage.add(l);
  return l;
});
const atomBlobs = Array.from({ length: MAX_ATOMS }, () => {
  const m = new THREE.Mesh(new THREE.CircleGeometry(1, 24), flat(C.ochre));
  m.renderOrder = 5;
  stage.add(m);
  return m;
});

// The point and the normal.
stage.add(
  polyline(
    [
      [P.x, P.y, 0],
      [P.x, P.y + R, 0],
    ],
    { color: C.slateDeep, width: 2 },
  ),
);
{
  const g = new THREE.CircleGeometry(0.07, 32);
  g.translate(P.x, P.y, 0.05);
  const dot = new THREE.Mesh(g, flat(C.bone));
  dot.renderOrder = 6;
  stage.add(dot);
}

// ω_o, which the mirror and glass depend on.
const outShaft = polyline(
  [
    [0, 0, 0],
    [0, 0, 0],
  ],
  { color: C.bone, width: 4 },
);
stage.add(outShaft);
const outHead = new THREE.Mesh(
  (() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, 0.12, 0, -0.075, -0.12, 0, 0.075, -0.12, 0], 3),
    );
    return g;
  })(),
  flat(C.bone),
);
stage.add(outHead);

// The lamp.
const lampRay = polyline(
  [
    [0, 0, 0],
    [0, 0, 0],
  ],
  { color: C.ochre, width: 3, opacity: 0.7 },
);
stage.add(lampRay);
// Drawn at the angular size the model uses, so what it covers is what it looks
// like it covers.
const lampDisc = new THREE.Mesh(
  new THREE.CircleGeometry(LAMP_R * Math.sin(LAMP_HALF), 32),
  flat(0xffdb96),
);
lampDisc.renderOrder = 6;
stage.add(lampDisc);
const weightMark = polyline(
  [
    [0, 0, 0],
    [0, 0, 0],
  ],
  { color: 0xffdb96, width: 9 },
);
weightMark.renderOrder = 5;
stage.add(weightMark);

// The mass bar: the one thing roughness must not change.
const MASS_X0 = P.x - 1.3;
const MASS_Y = -2.5;
const MASS_W = 2.6;
stage.add(
  polyline(
    [
      [MASS_X0, MASS_Y, 0],
      [MASS_X0 + MASS_W, MASS_Y, 0],
    ],
    { color: C.slateDeep, width: 3 },
  ),
);
const massBar = polyline(
  [
    [0, 0, 0],
    [0, 0, 0],
  ],
  { color: C.ochre, width: 9 },
);
stage.add(massBar);

// Labelled in the same register as the graphs. It is the one thing roughness
// must not change, so an unlabelled bar is worse than no bar.
stage.add(
  label('Total Mass', {
    size: 0.16,
    color: C.ash,
    anchorX: 'center',
    anchorY: 'top',
    position: [P.x, MASS_Y - 0.12, 0],
  }),
);

// ---------------------------------------------------------------------------
// The three graphs
// ---------------------------------------------------------------------------

const SX0 = 0.05;
const SX1 = 4.25;
const STRIP_H = 1.0;
const STRIP_GAP = 0.72;
const STRIP_TOP = 2.3;

const stripBase = (k: number) => STRIP_TOP - k * (STRIP_H + STRIP_GAP) - STRIP_H;
const sx = (i: number) => SX0 + ((SX1 - SX0) * i) / NS;

// The only words in the frame, and the same three wherever spectra appear.
const TITLES = ['Spectrum In', 'Material Response', 'Spectrum Out'];
for (let k = 0; k < 3; k++) {
  const base = stripBase(k);
  stage.add(
    polyline(
      [
        [SX0, base, 0],
        [SX1, base, 0],
      ],
      { color: C.slateDeep, width: 2 },
    ),
  );
  stage.add(
    // Centred just under the axis, so a label reads as belonging to the graph
    // above it rather than to the one below.
    label(TITLES[k], {
      size: 0.16,
      color: C.ash,
      anchorX: 'center',
      anchorY: 'top',
      position: [(SX0 + SX1) / 2, base - 0.12, 0],
    }),
  );
  if (k === 2) {
    // The ceiling: `out` is allowed to clip rather than rescale.
    stage.add(
      polyline(
        [
          [SX0, base + STRIP_H, 0],
          [SX1, base + STRIP_H, 0],
        ],
        { color: C.slateDeep, width: 1, opacity: 0.7 },
      ),
    );
  }
  for (const nm of [400, 500, 600, 700]) {
    const x = SX0 + ((SX1 - SX0) * (nm - WL0)) / (WL1 - WL0);
    stage.add(
      polyline(
        [
          [x, base - 0.05, 0],
          [x, base, 0],
        ],
        { color: C.slateDeep, width: 2 },
      ),
    );
  }
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
const inCurve = makeCurve(0xffdb96, 4);
const respCurve = makeCurve(C.moss, 4);
const outCurve = makeCurve(C.bone, 4);

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

const params = {
  material: 'lambert' as Mode,
  move: true,
  lamp: 120,
  omegaO: 52,
  roughness: 0.22,
};
ui.params.add(params, 'material', ['lambert', 'mirror', 'glass', 'rough']).name('material');
ui.params.add(params, 'move').name('move the lamp');
ui.params.add(params, 'lamp', 6, 174, 1).name('lamp direction');
ui.params.add(params, 'omegaO', 12, 168, 1).name('we look from');
ui.params.add(params, 'roughness', 0.02, 0.6, 0.005).name('roughness');

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

const respSpec = new Float32Array(NS + 1);
const outSpec = new Float32Array(NS + 1);
const ptsIn: Pt[] = Array.from({ length: NS + 1 }, () => [0, 0, 0]);
const ptsResp: Pt[] = Array.from({ length: NS + 1 }, () => [0, 0, 0]);
const ptsOut: Pt[] = Array.from({ length: NS + 1 }, () => [0, 0, 0]);
const bandPts: Pt[] = Array.from({ length: BAND_N + 1 }, () => [0, 0, 0]);

stage.frame((t) => {
  const u = stage.duration > 0 ? (t % stage.duration) / stage.duration : 0;
  const mode = params.material;
  const ao = (params.omegaO * Math.PI) / 180;
  const lampA = params.move
    ? (Math.PI / 2) * (1 + 0.92 * Math.sin(u * Math.PI * 2))
    : (params.lamp * Math.PI) / 180;

  const mu = measureFor(mode, ao, params.roughness);

  // --- the band ------------------------------------------------------------
  for (let i = 0; i <= BAND_N; i++) {
    const a = (Math.PI * i) / BAND_N;
    const d = mu.density ? mu.density(a) : 0;
    const outer = R + Math.min(CEILING, (LOBE * d) / DREF);
    const c = Math.cos(a);
    const s = Math.sin(a);
    bandPos[6 * i] = P.x + R * c;
    bandPos[6 * i + 1] = P.y + R * s;
    bandPos[6 * i + 2] = -0.02;
    bandPos[6 * i + 3] = P.x + outer * c;
    bandPos[6 * i + 4] = P.y + outer * s;
    bandPos[6 * i + 5] = -0.02;
    bandPts[i] = [P.x + outer * c, P.y + outer * s, 0];
  }
  bandGeom.attributes.position.needsUpdate = true;
  setPolyline(bandEdge, bandPts);
  bandMesh.visible = mu.density !== null;
  bandEdge.visible = mu.density !== null;

  // --- atoms ---------------------------------------------------------------
  for (let k = 0; k < MAX_ATOMS; k++) {
    const atom = mu.atoms[k];
    atomSpikes[k].visible = !!atom;
    atomBlobs[k].visible = !!atom;
    if (!atom) continue;
    const c = Math.cos(atom.a);
    const s = Math.sin(atom.a);
    const tip = R + CEILING * 0.62;
    setPolyline(atomSpikes[k], [
      [P.x + R * c, P.y + R * s, 0],
      [P.x + tip * c, P.y + tip * s, 0],
    ]);
    atomBlobs[k].position.set(P.x + tip * c, P.y + tip * s, 0.03);
    const r = 0.07 + 0.16 * Math.sqrt(Math.max(0, atom.mass));
    atomBlobs[k].scale.set(r, r, 1);
  }

  // Glass is the one material that takes light from inside, so the lower half
  // of the circle stops being decoration.
  (lowerArc.material as THREE.Material & { opacity: number }).opacity =
    mode === 'glass' ? 0.85 : 0.4;

  // --- ω_o -----------------------------------------------------------------
  {
    const reach = R + CEILING + 0.12;
    const c = Math.cos(ao);
    const s = Math.sin(ao);
    setPolyline(outShaft, [
      [P.x, P.y, 0],
      [P.x + (reach - 0.12) * c, P.y + (reach - 0.12) * s, 0],
    ]);
    outHead.position.set(P.x + reach * c, P.y + reach * s, 0.02);
    outHead.rotation.z = ao - Math.PI / 2;
  }

  // --- the lamp ------------------------------------------------------------
  {
    const c = Math.cos(lampA);
    const s = Math.sin(lampA);
    lampDisc.position.set(P.x + LAMP_R * c, P.y + LAMP_R * s, 0.05);
    setPolyline(lampRay, [
      [P.x + (LAMP_R - LAMP_R * Math.sin(LAMP_HALF)) * c, P.y + (LAMP_R - LAMP_R * Math.sin(LAMP_HALF)) * s, 0],
      [P.x + 0.1 * c, P.y + 0.1 * s, 0],
    ]);
    const d = mu.density ? mu.density(lampA) : 0;
    const mark = Math.min(CEILING, (LOBE * d) / DREF);
    setPolyline(weightMark, [
      [P.x + R * c, P.y + R * s, 0],
      [P.x + (R + mark) * c, P.y + (R + mark) * s, 0],
    ]);
    weightMark.visible = mark > 0.01;
  }

  // --- the mass bar --------------------------------------------------------
  setPolyline(massBar, [
    [MASS_X0, MASS_Y, 0],
    [MASS_X0 + MASS_W * Math.min(1, mu.mass), MASS_Y, 0],
  ]);

  // --- the graphs ----------------------------------------------------------
  responseAt(mu, lampA, respSpec);
  for (let i = 0; i <= NS; i++) outSpec[i] = respSpec[i] * LAMP[i];

  const scaleIn = STRIP_H / 1.15;
  const scaleResp = STRIP_H / 3.3;
  const scaleOut = STRIP_H / 3.3;

  const b0 = stripBase(0);
  const b1 = stripBase(1);
  const b2 = stripBase(2);
  for (let i = 0; i <= NS; i++) {
    const x = sx(i);
    ptsIn[i] = [x, b0 + LAMP[i] * scaleIn, 0];
    ptsResp[i] = [x, b1 + Math.min(STRIP_H, respSpec[i] * scaleResp), 0];
    ptsOut[i] = [x, b2 + Math.min(STRIP_H, outSpec[i] * scaleOut), 0];
  }
  setPolyline(inCurve, ptsIn);
  setPolyline(respCurve, ptsResp);
  setPolyline(outCurve, ptsOut);
});

stage.start();
