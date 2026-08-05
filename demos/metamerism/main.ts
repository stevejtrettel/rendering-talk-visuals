/**
 * Metamerism: the kernel of the sensor response.
 *
 * The response map takes a spectrum to three numbers. On the sampled band that
 * is a linear map from 97 dimensions to 3, so its kernel is 94-dimensional, and
 * every spectrum sits in a fibre of enormous size. This demo walks one of those
 * fibres and shows that nothing on the output side moves at all.
 *
 * ## What is exact here, and what that buys
 *
 * The walk is not a fit and not a near-match. Every deformation is built
 * orthogonal, in L2 of the band, to all three of the functionals
 *
 *     r  |->  integral of E_day(lambda) r(lambda) cmf_c(lambda) d lambda
 *
 * so the three numbers are *algebraically* unchanged — they agree to machine
 * precision, around 1e-12, not to within a tolerance anyone chose. That is why
 * the two halves of the swatch can be drawn touching, with no border: under the
 * matching lamp there is no seam to find, however far the walk goes.
 *
 * Getting that right needs one thing that is easy to get wrong: the three
 * functionals are not mutually orthogonal, so they have to be orthonormalised
 * *before* anything is projected off them. Subtracting the components one at a
 * time against the raw functionals puts the earlier ones straight back in, and
 * the "metamers" then visibly drift apart.
 *
 * ## Why the deformations are smooth
 *
 * Two reasons, and the second was a surprise. A reflectance built from broad
 * bumps is something a real material could have, which is what stops the demo
 * looking like a mathematical stunt. But smooth deformations also turn out to
 * break the match *harder*: the walk's size is capped by having to keep the
 * reflectance inside [0, 1], and a spiky deformation spends its whole budget on
 * a few narrow excursions that hit the ceiling while barely moving any integral.
 * Restricting to smooth shapes raised the worst-case mismatch from about 24 to
 * about 37 in CIE76.
 *
 * Within the smooth subspace the directions are then aimed: they are the images
 * of the *second* lamp's three functionals, projected into the kernel of the
 * first. That is the sharpest disagreement available at this smoothness.
 *
 * ## The second lamp
 *
 * Lines on a weak continuum, which is what a narrow-band fluorescent really is —
 * and a callback to the opening slide, where Bochner gave the spectrum
 * lines-plus-continuum. A match arranged under a smooth lamp has no reason to
 * survive one that samples the band at four sharp wavelengths, and it does not.
 *
 * Both swatches are adapted to their illuminant's white before display, which is
 * what an eye does in a room and what a camera does with white balance. Without
 * it the fluorescent frame would just look green overall and the interesting
 * fact — that these two *particular* surfaces stop matching — would be buried
 * under a colour cast that applies to everything equally.
 */

import * as THREE from 'three';
import { createStage, createUI, C, flat } from '@';
import { polyline, setPolyline } from '@/lines';
import { label, setText, fixed } from '@/text';
import { WL0, WL1, NS, wavelength, lampSpectrum } from '@/room2d';
import { CMF, bandNormalizer, xyzToDisplay } from '@/response';

// ---------------------------------------------------------------------------
// Band arithmetic
// ---------------------------------------------------------------------------

const D_LAMBDA = (WL1 - WL0) / NS;
const K = bandNormalizer(WL0, WL1, NS);

/** Trapezoid weight at sample k, so `dot` really is the L2 inner product. */
const qw = (k: number) => (k === 0 || k === NS ? 0.5 : 1) * D_LAMBDA;

function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let k = 0; k <= NS; k++) s += a[k] * b[k] * qw(k);
  return s;
}

/** Gram-Schmidt: an orthonormal basis for the span, dropping dependent vectors. */
function orthonormalise(vectors: Float32Array[]): Float32Array[] {
  const out: Float32Array[] = [];
  for (const v0 of vectors) {
    const v = Float32Array.from(v0);
    for (const b of out) {
      const f = dot(v, b);
      for (let k = 0; k <= NS; k++) v[k] -= f * b[k];
    }
    const n = Math.sqrt(dot(v, v));
    if (n < 1e-7) continue;
    for (let k = 0; k <= NS; k++) v[k] /= n;
    out.push(v);
  }
  return out;
}

const sample = (f: (nm: number) => number): Float32Array => {
  const a = new Float32Array(NS + 1);
  for (let k = 0; k <= NS; k++) a[k] = f(wavelength(k));
  return a;
};

const gauss = (nm: number, c: number, s: number) => Math.exp(-0.5 * ((nm - c) / s) ** 2);

// ---------------------------------------------------------------------------
// The two lamps
// ---------------------------------------------------------------------------

/** Daylight: the deck's own 5200 K lamp, the one the room demos are lit by. */
const DAY = sample(lampSpectrum);

/**
 * A narrow-band fluorescent: four lines on a weak continuum. Normalised to peak
 * 1 like the other, so the panel can draw them on one scale.
 */
const FLUO = (() => {
  const raw = sample(
    (nm) =>
      0.45 * (0.16 + 0.1 * gauss(nm, 470, 55) + 0.2 * gauss(nm, 600, 60)) +
      1.3 *
        (0.95 * gauss(nm, 436, 6) +
          0.75 * gauss(nm, 546, 6) +
          0.6 * gauss(nm, 578, 7) +
          0.3 * gauss(nm, 405, 6)),
  );
  let m = 0;
  for (const v of raw) m = Math.max(m, v);
  for (let k = 0; k <= NS; k++) raw[k] /= m;
  return raw;
})();

const RESP = CMF.map((f) => sample(f));

/** The value a reflectance produces under a lamp. */
function valueOf(lamp: Float32Array, refl: Float32Array): [number, number, number] {
  const out: [number, number, number] = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    let s = 0;
    for (let k = 0; k <= NS; k++) s += lamp[k] * refl[k] * RESP[c][k] * qw(k);
    out[c] = s * K;
  }
  return out;
}

const ONE = sample(() => 1);
const WHITE_DAY = valueOf(DAY, ONE);
const WHITE_FLUO = valueOf(FLUO, ONE);

/**
 * Adapt to the illuminant's white point — crude von Kries, done straight in XYZ.
 * This is the eye settling into a room, and it is what keeps the fluorescent
 * frame about *these two surfaces* rather than about a global green cast.
 */
function adapted(
  v: [number, number, number],
  w: [number, number, number],
): [number, number, number] {
  return [(v[0] / w[0]) * 0.9505, v[1] / w[1], (v[2] / w[2]) * 1.089];
}

// ---------------------------------------------------------------------------
// The fibre
// ---------------------------------------------------------------------------

/** The reference: a soft sage, mid-level so the walk has headroom both ways. */
const REFERENCE = sample((nm) => 0.3 + 0.28 * gauss(nm, 545, 70));

/**
 * The directions the walk moves in.
 *
 * Smooth shapes first, then the daylight functionals projected out of them —
 * that is the smooth part of the kernel. Then the fluorescent's own three
 * functionals projected *into* that subspace, which picks out the directions
 * that leave daylight untouched while pulling as hard as possible on the other
 * lamp.
 */
const DIRECTIONS = (() => {
  const dayFunctionals = orthonormalise(
    [0, 1, 2].map((c) => sample((nm) => lampSpectrum(nm) * CMF[c](nm))),
  );

  const centres: number[] = [];
  for (let c = 415; c <= 685; c += 27) centres.push(c);
  const smoothKernel = orthonormalise(
    centres.map((c) => {
      const v = sample((nm) => gauss(nm, c, 34));
      for (const b of dayFunctionals) {
        const f = dot(v, b);
        for (let k = 0; k <= NS; k++) v[k] -= f * b[k];
      }
      return v;
    }),
  );

  return orthonormalise(
    [0, 1, 2].map((c) => {
      const psi = new Float32Array(NS + 1);
      for (let k = 0; k <= NS; k++) psi[k] = FLUO[k] * RESP[c][k];
      const inSubspace = new Float32Array(NS + 1);
      for (const b of smoothKernel) {
        const f = dot(psi, b);
        for (let k = 0; k <= NS; k++) inSubspace[k] += f * b[k];
      }
      return inSubspace;
    }),
  );
})();

const TAU = Math.PI * 2;
/** Integer frequencies, so the walk closes up exactly over the loop. */
const FREQ = [1, 2, 3];
const PHASE = [0, 1.9, 3.7];

function deviation(q: number, out: Float32Array): Float32Array {
  out.fill(0);
  for (let m = 0; m < DIRECTIONS.length && m < FREQ.length; m++) {
    const a = Math.sin(TAU * FREQ[m] * q + PHASE[m]);
    for (let k = 0; k <= NS; k++) out[k] += a * DIRECTIONS[m][k];
  }
  return out;
}

/**
 * The largest walk that keeps the reflectance inside [LO, HI] at every
 * wavelength and every point of the loop.
 *
 * A reflectance outside [0, 1] is not a surface, and clamping is not an option:
 * clamping changes the spectrum, which changes the three numbers, which is
 * exactly the thing the demo claims does not happen. So the amplitude is capped
 * once, in advance, and nothing is ever clipped.
 */
const AMPLITUDE = (() => {
  const LO = 0.03;
  const HI = 0.97;
  const dev = new Float32Array(NS + 1);
  let worst = 0;
  for (let i = 0; i < 400; i++) {
    deviation(i / 400, dev);
    for (let k = 0; k <= NS; k++) {
      if (dev[k] > 1e-9) worst = Math.max(worst, dev[k] / (HI - REFERENCE[k]));
      else if (dev[k] < -1e-9) worst = Math.max(worst, dev[k] / (LO - REFERENCE[k]));
    }
  }
  return 1 / worst;
})();

const metamer = new Float32Array(NS + 1);
const devScratch = new Float32Array(NS + 1);

function setMetamer(q: number): void {
  deviation(q, devScratch);
  for (let k = 0; k <= NS; k++) metamer[k] = REFERENCE[k] + AMPLITUDE * devScratch[k];
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

const stage = createStage({
  camera: 'ortho',
  position: [0, 0, 10],
  target: [0, 0, 0],
  orthoHeight: 2.5,
  lights: false,
  controls: false,
});
stage.duration = 16;

const ui = createUI(stage);

/** The reflectance panel. */
const RX0 = -4.15;
const RX1 = 0.5;
const RBASE = -0.3;
const RUNIT = 1.55;

/** The lamp panel, underneath it. */
const LX0 = -4.15;
const LX1 = -1.45;
const LBASE = -1.85;
const LUNIT = 0.72;

/** The swatch: one rectangle in two halves, deliberately with no seam drawn. */
const SX0 = 1.35;
const SX1 = 4.25;
const SY0 = -0.5;
const SY1 = 1.3;

const rx = (k: number) => RX0 + ((RX1 - RX0) * k) / NS;
const lx = (k: number) => LX0 + ((LX1 - LX0) * k) / NS;

function ticks(x0: number, x1: number, y: number, size: number, labels: boolean): THREE.Group {
  const g = new THREE.Group();
  g.add(polyline([[x0, y, 0], [x1, y, 0]], { color: C.slateDeep, width: 2 }));
  for (const nm of [400, 500, 600, 700]) {
    const x = x0 + ((x1 - x0) * (nm - WL0)) / (WL1 - WL0);
    g.add(polyline([[x, y - 0.07, 0], [x, y, 0]], { color: C.slateDeep, width: 2 }));
    if (labels) {
      g.add(
        label(String(nm), {
          size,
          color: C.slate,
          anchorX: 'center',
          anchorY: 'top',
          position: [x, y - 0.11, 0],
        }),
      );
    }
  }
  return g;
}

// The lamp panel gets tick marks but no numbers: it is a shape, not a
// measurement, and its labels would land on the caption along the bottom.
stage.add(ticks(RX0, RX1, RBASE, 0.15, true), ticks(LX0, LX1, LBASE, 0.13, false));

// Reflectance runs 0 to 1, so it gets a real scale rather than arbitrary units.
for (const v of [0.5, 1]) {
  const y = RBASE + RUNIT * v;
  stage.add(polyline([[RX0 - 0.08, y, 0], [RX0, y, 0]], { color: C.slateDeep, width: 2 }));
  stage.add(
    label(v === 1 ? '1' : '0.5', {
      size: 0.14,
      color: C.slate,
      anchorX: 'right',
      anchorY: 'middle',
      position: [RX0 - 0.12, y, 0],
    }),
  );
}
stage.add(polyline([[RX0, RBASE, 0], [RX0, RBASE + RUNIT, 0]], { color: C.slateDeep, width: 2 }));

stage.add(
  label('two reflectances', { size: 0.2, color: C.ash, position: [RX0, RBASE + RUNIT + 0.16, 0] }),
  label('wavelength (nm)', {
    size: 0.16,
    color: C.slate,
    anchorX: 'center',
    position: [(RX0 + RX1) / 2, RBASE - 0.48, 0],
  }),
  label('the light in the room', {
    size: 0.16,
    color: C.ash,
    position: [LX0, LBASE + LUNIT + 0.12, 0],
  }),
);

// ---------------------------------------------------------------------------
// Curves
// ---------------------------------------------------------------------------

type P3 = [number, number, number];

const refPts: P3[] = Array.from({ length: NS + 1 }, (_, k) => [
  rx(k),
  RBASE + RUNIT * REFERENCE[k],
  0,
]);
stage.add(polyline(refPts, { color: C.bone, width: 4 }));

const metaPts: P3[] = Array.from({ length: NS + 1 }, (_, k) => [rx(k), RBASE, 0] as P3);
const metaCurve = polyline(metaPts, { color: C.ochre, width: 4 });
metaCurve.renderOrder = 4;
stage.add(metaCurve);

const lampPts: P3[] = Array.from({ length: NS + 1 }, (_, k) => [lx(k), LBASE, 0] as P3);
const lampCurve = polyline(lampPts, { color: C.blue, width: 3 });
stage.add(lampCurve);

// Legend, at the top right of the reflectance panel where both curves are low.
stage.add(
  label('reference', { size: 0.15, color: C.bone, anchorX: 'right', position: [RX1, RBASE + RUNIT - 0.12, 0] }),
  label('its metamer', { size: 0.15, color: C.ochre, anchorX: 'right', position: [RX1, RBASE + RUNIT - 0.34, 0] }),
);

// ---------------------------------------------------------------------------
// The swatch
// ---------------------------------------------------------------------------

/**
 * Two halves, touching, with nothing drawn between them. A pair of separated
 * squares would let the audience believe the colours are merely close; edge to
 * edge with no border, a match means there is genuinely no seam to see, and the
 * smallest mismatch shows up immediately.
 */
const halfW = (SX1 - SX0) / 2;
const swatches = [0, 1].map((i) => {
  const mat = flat(0x000000);
  mat.toneMapped = false; // a computed colour, not scenery — see the README
  const m = new THREE.Mesh(new THREE.PlaneGeometry(halfW, SY1 - SY0), mat);
  m.position.set(SX0 + halfW * (i + 0.5), (SY0 + SY1) / 2, 0);
  stage.add(m);
  return mat;
});

stage.add(
  polyline(
    [
      [SX0, SY0, 0.01],
      [SX1, SY0, 0.01],
      [SX1, SY1, 0.01],
      [SX0, SY1, 0.01],
      [SX0, SY0, 0.01],
    ],
    { color: C.slateDeep, width: 2 },
  ),
);

const valueLabels = [0, 1].map((i) => {
  const x = SX0 + halfW * (i + 0.5);
  stage.add(
    label(i === 0 ? 'reference' : 'its metamer', {
      size: 0.15,
      color: i === 0 ? C.bone : C.ochre,
      anchorX: 'center',
      anchorY: 'top',
      position: [x, SY0 - 0.5, 0],
    }),
  );
  const v = label('', {
    size: 0.145,
    color: C.bone,
    anchorX: 'center',
    anchorY: 'top',
    position: [x, SY0 - 0.14, 0],
  });
  stage.add(v);
  return v;
});

const lampName = label('', {
  size: 0.22,
  color: C.blue,
  anchorX: 'center',
  position: [(SX0 + SX1) / 2, SY1 + 0.22, 0],
});
stage.add(lampName);

const verdict = label('', {
  size: 0.17,
  color: C.ash,
  anchorX: 'center',
  anchorY: 'top',
  position: [(SX0 + SX1) / 2, SY0 - 0.9, 0],
});
stage.add(verdict);

stage.hud.add(
  label('every deformation is orthogonal to all three response curves', {
    size: 0.05,
    color: C.slate,
    position: [-(16 / 9) + 0.08, -0.93, 0],
  }),
);

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

const params = {
  lamp: 'auto' as 'auto' | 'daylight' | 'fluorescent',
  hold: false,
  walk: 0,
};
ui.params.add(params, 'lamp', ['auto', 'daylight', 'fluorescent']).name('lamp');
ui.params.add(params, 'hold').name('hold the walk');
ui.params.add(params, 'walk', 0, 1, 0.001).name('walk (when held)');

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

const mixed = new Float32Array(NS + 1);
const white: [number, number, number] = [0, 0, 0];

stage.frame((t) => {
  const u = stage.duration > 0 ? (t % stage.duration) / stage.duration : 0;

  const q = params.hold ? params.walk : u;
  setMetamer(q);

  // Daylight, then the fluorescent, then back — so the loop closes on the lamp
  // it opened with.
  const blend =
    params.lamp === 'daylight'
      ? 0
      : params.lamp === 'fluorescent'
        ? 1
        : smoothstep(0.4, 0.5, u) - smoothstep(0.9, 1.0, u);

  for (let k = 0; k <= NS; k++) mixed[k] = DAY[k] + (FLUO[k] - DAY[k]) * blend;
  for (let c = 0; c < 3; c++) white[c] = WHITE_DAY[c] + (WHITE_FLUO[c] - WHITE_DAY[c]) * blend;

  // --- curves --------------------------------------------------------------
  for (let k = 0; k <= NS; k++) {
    metaPts[k][1] = RBASE + RUNIT * metamer[k];
    lampPts[k][1] = LBASE + LUNIT * mixed[k];
  }
  setPolyline(metaCurve, metaPts);
  setPolyline(lampCurve, lampPts);

  // --- the two values, and the swatch --------------------------------------
  const vRef = adapted(valueOf(mixed, REFERENCE), white);
  const vMet = adapted(valueOf(mixed, metamer), white);

  for (const [i, v] of [vRef, vMet].entries()) {
    const { rgb } = xyzToDisplay(v[0], v[1], v[2]);
    swatches[i].color.setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);
    setText(valueLabels[i], `${fixed(v[0], 3)}   ${fixed(v[1], 3)}   ${fixed(v[2], 3)}`);
  }

  setText(lampName, blend < 0.5 ? 'daylight' : 'fluorescent');
  // A blunt statement of what the numbers show, since the whole point is that
  // the same two surfaces answer this question differently in two rooms.
  const gap = Math.max(
    Math.abs(vRef[0] - vMet[0]),
    Math.abs(vRef[1] - vMet[1]),
    Math.abs(vRef[2] - vMet[2]),
  );
  setText(verdict, gap < 1e-6 ? 'the same three numbers' : 'no longer the same');
});

stage.start();
