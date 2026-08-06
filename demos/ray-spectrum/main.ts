/**
 * Every ray carries a spectrum.
 *
 * A scalar wave runs along a ray. It slides apart into sinusoids, one per
 * wavelength, which move out along an axis perpendicular to the ray; and as
 * they go, the curve of their amplitudes is drawn through their crests. That
 * curve is the spectrum the ray carries.
 *
 * ## What the sinusoids are, exactly
 *
 * The wave has finite energy, so its transform is *absolutely continuous*:
 * there is a component at every
 * wavelength, and no wavelength carries a nonzero share on its own. The
 * sinusoids drawn here are therefore **representative samples of a continuum**,
 * not a decomposition into countably many pieces. Two consequences, and the
 * demo is built so neither can be mistaken:
 *
 *   - They do not sum to the packet, and nothing on screen suggests they do.
 *     No partial sum is drawn.
 *   - Turning `samples` up fills in the same curve more finely and never
 *     changes it. The curve is the object; the sinusoids are a way of looking
 *     at it. The readout says so.
 *
 * A genuine decomposition into countably many terms needs a window, and then
 * the components are series terms whose amplitudes fall like 1/L as the window
 * widens — they survive only as a density, which is the same statement from the
 * other side.
 *
 * ## What the curve is
 *
 * It is |Â(λ)|, the amplitude of the component at that wavelength, and each
 * stem marks that height. The sinusoid drawn beside a stem carries its own true
 * phase, so it is the actual component of this wave rather than a tidied-up
 * stand-in, and the height it reaches across its span is the height of its stem.
 *
 * `scatter` is what buys that realism. Shifting a bump along the ray is a linear
 * phase on it, which leaves |Â| untouched — so the spectrum is unchanged while
 * the wave breaks into several bursts instead of one, and stops looking like a
 * textbook packet. At `scatter = 0` the transform is real and positive again,
 * every component crests at the section, and the curve becomes a literal
 * section through the crests: prettier as geometry, but the wave is then always
 * a single burst, because "all components in phase here" is what a packet *is*.
 *
 * With `travel` on, all components move at one speed, so the whole picture
 * slides rigidly down the ray. The spectrum travels unchanged — which is the
 * point of the slide.
 */

import * as THREE from 'three';
import { createStage, createUI, C, ramp } from '@';
import { polyline, setPolyline, type Pt } from '@/lines';
import { mulberry32 } from '@/sampling';

// ---------------------------------------------------------------------------
// The wave and its transform
// ---------------------------------------------------------------------------

const S_MIN = -5.2;
const S_MAX = 5.2;
const S_PTS = 220;

const LAM_MIN = 0.6;
const LAM_MAX = 1.8;

/** Where the section through the packet sits when it is not travelling. */
const SECTION_S = -1.0;
/** How far downstream of the section the component sinusoids are drawn. */
const COMP_SPAN = 4.6;

const DEPTH = 8; // world length of the wavelength axis
const SIGNAL_Z = 1.8; // the packet sits in front of the components
const AMP = 1.35; // world height of unit amplitude
const MAX_SAMPLES = 120;

/** Wavelength to depth. The packet is in front; longer waves lie further back. */
const lamToZ = (lam: number) => -(DEPTH * (lam - LAM_MIN)) / (LAM_MAX - LAM_MIN);

// ---------------------------------------------------------------------------
// The signal, built from its spectrum rather than the other way round
// ---------------------------------------------------------------------------

/**
 * The spectrum is a handful of Gaussian bumps in frequency, at seeded random
 * positions, widths and heights. That direction of construction is what makes
 * the demo exact: a Gaussian bump transforms analytically,
 *
 *     ∫ h e^{−(ν−c)²/2w²} cos(2πνd) dν = h w √(2π) e^{−2π²w²d²} cos(2πcd),
 *
 * so the wave is a sum of packets with different carriers — irregular to look
 * at, but decaying at both ends and symmetric about its centre, with no
 * quadrature anywhere and no chance of the curve and the wave disagreeing.
 *
 * Symmetry is not decoration: it is what puts every component at its crest at
 * the centre, which is what lets the curve be a section through the crests
 * rather than a graph drawn nearby.
 */
interface Bump {
  c: number; // centre frequency
  w: number; // width in frequency
  h: number; // height
  d: number; // shift along the ray — a linear phase on this bump
}

const NU_MIN = 1 / LAM_MAX;
const NU_MAX = 1 / LAM_MIN;

function makeBumps(seed: number, length: number, scatter: number): Bump[] {
  const rng = mulberry32(Math.round(seed) * 7919 + 13);
  const out: Bump[] = [];
  for (let j = 0; j < 8; j++) {
    // Kept clear of the ends of the range so the spectrum has somewhere to fall
    // away to and the axis is not cut off mid-feature.
    const c = NU_MIN + (NU_MAX - NU_MIN) * (0.14 + 0.72 * rng());
    // A longer wave means a narrower spectrum, so width goes as 1/length.
    // A wide spread of widths on purpose: narrow bumps ring across the whole
    // window at low amplitude (a narrow bump contributes h·w, so it is quiet),
    // broad ones give the sharp central burst. The mix is what stops the wave
    // reading as one clean packet.
    const w = ((0.035 + 0.115 * rng()) * 2) / length;
    const h = 0.35 + 0.65 * rng();
    // The shift is a linear phase on this bump. It moves that packet along the
    // ray without touching how much energy it carries, so the wave scatters
    // into several bursts while the amplitude spectrum is unmoved.
    const d = scatter * (rng() * 2 - 1);
    out.push({ c, w, h, d });
  }
  return out;
}

let bumps: Bump[] = makeBumps(1, 2, 0);
let bumpPeak = 1; // max |Â| over the drawn range, so the curve peaks at 1
let wavePeak = 1; // max |u| over the window, so the wave peaks at 1

/**
 * The spectrum at a frequency, as a complex number.
 *
 * Once the bumps carry shifts this has to be summed as a complex quantity and
 * only then have its magnitude taken: where two shifted bumps overlap, their
 * phases interfere, and |Â| is genuinely not the sum of the individual heights.
 * Summing magnitudes instead would draw a curve the wave does not have.
 */
function spectrumAt(nu: number): { re: number; im: number } {
  let re = 0;
  let im = 0;
  for (const b of bumps) {
    const g = b.h * Math.exp(-((nu - b.c) ** 2) / (2 * b.w * b.w));
    const ph = -2 * Math.PI * nu * b.d;
    re += g * Math.cos(ph);
    im += g * Math.sin(ph);
  }
  return { re, im };
}

function refreshBumps(seed: number, length: number, scatter: number): void {
  bumps = makeBumps(seed, length, scatter);

  bumpPeak = 1e-9;
  for (let i = 0; i <= 400; i++) {
    const { re, im } = spectrumAt(NU_MIN + ((NU_MAX - NU_MIN) * i) / 400);
    bumpPeak = Math.max(bumpPeak, Math.hypot(re, im));
  }

  // With the bursts scattered the maximum is no longer at the centre, so find
  // it rather than assuming it.
  wavePeak = 1e-9;
  for (let i = 0; i <= 600; i++) {
    const d = S_MIN + ((S_MAX - S_MIN) * i) / 600;
    let u = 0;
    for (const b of bumps) {
      const dd = d - b.d;
      u +=
        b.h *
        b.w *
        Math.sqrt(2 * Math.PI) *
        Math.exp(-2 * Math.PI * Math.PI * b.w * b.w * dd * dd) *
        Math.cos(2 * Math.PI * b.c * dd);
    }
    wavePeak = Math.max(wavePeak, Math.abs(u));
  }
}

/** Amplitude of the component at a wavelength, normalised to peak 1. */
const ampAt = (lam: number) => {
  const { re, im } = spectrumAt(1 / lam);
  return Math.hypot(re, im) / bumpPeak;
};

/** Phase of that component, which is what scatters the wave along the ray. */
const phaseAt = (lam: number) => {
  const { re, im } = spectrumAt(1 / lam);
  return Math.atan2(im, re);
};

/** The wave: the exact transform of that spectrum, normalised to peak 1. */
const wave = (s: number, centre: number) => {
  const d = s - centre;
  let u = 0;
  for (const b of bumps) {
    const dd = d - b.d;
    u +=
      b.h *
      b.w *
      Math.sqrt(2 * Math.PI) *
      Math.exp(-2 * Math.PI * Math.PI * b.w * b.w * dd * dd) *
      Math.cos(2 * Math.PI * b.c * dd);
  }
  return u / wavePeak;
};

// ---------------------------------------------------------------------------
// Stage
// ---------------------------------------------------------------------------

const TARGET = new THREE.Vector3(0, 0.35, -3.4);

/**
 * Two camera stations about TARGET.
 *
 * The start is a true three-quarter view. Sitting square on the +z axis — the
 * obvious choice, and what the older demos did — puts the eye *along* the
 * wavelength axis, so the components stack up behind one another and the
 * amplitude curve is edge-on and useless. Swinging round to 62° opens the depth
 * out while keeping the ray running across the screen.
 *
 * The end looks down the ray itself, where each sinusoid foreshortens into a
 * vertical segment of its own amplitude and the picture becomes an ordinary
 * spectrum plot.
 */
const CAM_START = { r: 17, az: (58 * Math.PI) / 180, el: (28 * Math.PI) / 180 };
const CAM_END = { r: 11, az: 0, el: (5 * Math.PI) / 180 };

const stage = createStage({
  position: [
    TARGET.x + CAM_START.r * Math.cos(CAM_START.el) * Math.cos(CAM_START.az),
    TARGET.y + CAM_START.r * Math.sin(CAM_START.el),
    TARGET.z + CAM_START.r * Math.cos(CAM_START.el) * Math.sin(CAM_START.az),
  ],
  target: [TARGET.x, TARGET.y, TARGET.z],
  fov: 38,
  lights: false,
});
stage.duration = 16;

const ui = createUI(stage);

function placeCamera(reveal: number): void {
  const t = reveal * reveal * (3 - 2 * reveal);
  const r = CAM_START.r + (CAM_END.r - CAM_START.r) * t;
  const az = CAM_START.az + (CAM_END.az - CAM_START.az) * t;
  const el = CAM_START.el + (CAM_END.el - CAM_START.el) * t;
  stage.camera.position.set(
    TARGET.x + r * Math.cos(el) * Math.cos(az),
    TARGET.y + r * Math.sin(el),
    TARGET.z + r * Math.cos(el) * Math.sin(az),
  );
  stage.camera.lookAt(TARGET);
  stage.controls?.target.copy(TARGET);
}

// ---------------------------------------------------------------------------
// Scenery
// ---------------------------------------------------------------------------

// The ray: the line the wave runs along, with the direction of travel marked.
stage.add(
  polyline(
    [
      [S_MIN - 0.6, 0, SIGNAL_Z],
      [S_MAX + 0.6, 0, SIGNAL_Z],
    ],
    { color: C.slateDeep, width: 2 },
  ),
);
{
  const head = new THREE.BufferGeometry();
  head.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [S_MAX + 0.6, 0, SIGNAL_Z, S_MAX + 0.24, 0.11, SIGNAL_Z, S_MAX + 0.24, -0.11, SIGNAL_Z],
      3,
    ),
  );
  stage.add(new THREE.Mesh(head, new THREE.MeshBasicMaterial({ color: C.slate })));
}

// The wavelength axis, which is the baseline of the spectrum. It sits in the
// plane through the packet centre, so it moves with the packet when travelling.
const spectrumPlane = new THREE.Group();
stage.add(spectrumPlane);

spectrumPlane.add(
  polyline(
    [
      [0, 0, lamToZ(LAM_MIN)],
      [0, 0, lamToZ(LAM_MAX)],
    ],
    { color: C.slateDeep, width: 2 },
  ),
);
for (let lam = 0.6; lam <= LAM_MAX + 1e-9; lam += 0.2) {
  const z = lamToZ(lam);
  spectrumPlane.add(
    polyline(
      [
        [0, -0.07, z],
        [0, 0.07, z],
      ],
      { color: C.slateDeep, width: 2 },
    ),
  );
}
// The ticks carry the axis on their own — no numbers, no axis word. The slide
// and the speaker say which way wavelength runs, and the picture is about the
// shape of the curve rather than about reading a value off it.

// The packet.
const signal = polyline(
  Array.from({ length: S_PTS + 1 }, (_, i) => {
    const s = S_MIN + ((S_MAX - S_MIN) * i) / S_PTS;
    return [s, 0, SIGNAL_Z] as Pt;
  }),
  { color: C.bone, width: 5 },
);
stage.add(signal);

// The components. Preallocated: their shape only changes when the packet or the
// sample set changes, so the spread animation just moves them in depth.
interface Component {
  line: ReturnType<typeof polyline>;
  lam: number;
  amp: number;
}
const comps: Component[] = Array.from({ length: MAX_SAMPLES }, () => {
  const line = polyline(
    Array.from({ length: S_PTS + 1 }, () => [0, 0, 0] as Pt),
    { color: C.blue, width: 2, opacity: 0.9 },
  );
  stage.add(line);
  return { line, lam: (LAM_MIN + LAM_MAX) / 2, amp: 0 };
});

// A stem from each component's crest down to the wavelength axis. These are
// what make the picture read as a graph: without them the sinusoids are a
// thicket and the curve floats over it with nothing tying the two together.
const stems = comps.map(() => {
  const line = polyline(
    [
      [0, 0, 0],
      [0, 0, 0],
    ],
    { color: C.bone, width: 4, opacity: 0.75 },
  );
  stage.add(line);
  return line;
});

// The spectrum itself: the curve through the crests. Ochre, because in this
// deck that is the colour of light, and because it has to win against the
// thicket of components behind it.
const CURVE_PTS = 240;
const curve = polyline(
  Array.from({ length: CURVE_PTS + 1 }, () => [0, 0, 0] as Pt),
  { color: C.ochre, width: 7 },
);
curve.renderOrder = 5;
stage.add(curve);

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

const params = {
  mode: 'spread' as 'spread' | 'held',
  spread: 1,
  samples: 16,
  length: 2,
  seed: 1,
  scatter: 2.2,
  travel: false,
  reveal: 0,
  curve: true,
};
ui.params.add(params, 'mode', ['spread', 'held']).name('mode');
ui.params.add(params, 'spread', 0, 1, 0.001).name('spread');
ui.params.add(params, 'samples', 4, MAX_SAMPLES, 1).name('components');
ui.params.add(params, 'length', 0.8, 4, 0.05).name('wave length (spread)');
ui.params.add(params, 'seed', 1, 24, 1).name('seed');
ui.params.add(params, 'scatter', 0, 3.5, 0.05).name('scatter along the ray');
ui.params.add(params, 'travel').name('travel along the ray');
ui.params.add(params, 'reveal', 0, 1, 0.001).name('turn down the ray');
ui.params.add(params, 'curve').name('spectrum curve');

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

const sPts: Pt[] = Array.from({ length: S_PTS + 1 }, () => [0, 0, 0]);
const curvePts: Pt[] = Array.from({ length: CURVE_PTS + 1 }, () => [0, 0, 0]);

// Rebuilding 120 sinusoids every frame is wasted work — their shape only
// depends on these. The spread animation moves them without touching geometry.
let shapeKey = '';

stage.frame((t) => {
  const u = stage.duration > 0 ? (t % stage.duration) / stage.duration : 0;

  // The packet crosses the window once over the loop when travelling. Parked
  // left of centre otherwise, so the components have room to fan out to its
  // right and the spectrum has empty frame on its left.
  const centre = params.travel ? S_MIN + (S_MAX - S_MIN) * u : SECTION_S;

  // The wave is alone for the first stretch — the components do not exist yet,
  // rather than sitting squashed against it — then they appear and spread, and
  // the picture holds on the spectrum for the rest of the loop.
  const HOLD = 0.16;
  const raw =
    params.mode === 'spread'
      ? Math.min(1, Math.max(0, (u - HOLD) / 0.54))
      : params.spread;
  const spread = raw * raw * (3 - 2 * raw);

  placeCamera(params.reveal);

  const n = Math.round(params.samples);
  const length = params.length;

  // --- geometry, only when it actually changed ----------------------------
  const key = `${n}|${length}|${params.seed}|${params.scatter}|${centre.toFixed(4)}`;
  if (key !== shapeKey) {
    shapeKey = key;
    refreshBumps(params.seed, length, params.scatter);

    for (let i = 0; i <= S_PTS; i++) {
      const s = S_MIN + ((S_MAX - S_MIN) * i) / S_PTS;
      sPts[i] = [s, AMP * wave(s, centre), SIGNAL_Z];
    }
    setPolyline(signal, sPts);

    for (let c = 0; c < MAX_SAMPLES; c++) {
      const comp = comps[c];
      if (c >= n) {
        comp.line.visible = false;
        continue;
      }
      comp.line.visible = true;
      // Sampled uniformly in wavelength, which is the axis being plotted, so
      // the drawn sinusoids sit evenly along it.
      const lam = LAM_MIN + ((LAM_MAX - LAM_MIN) * (c + 0.5)) / n;
      const amp = ampAt(lam);
      // Its true phase, so the drawn sinusoid is the actual component of this
      // wave rather than a crest-aligned stand-in.
      const phase = phaseAt(lam);
      comp.lam = lam;
      comp.amp = amp;
      // Drawn only downstream of the section plane. A component really does run
      // the whole length of the ray, but drawing it that way buries the curve
      // and its stems inside the thicket; starting them at the plane leaves the
      // spectrum standing clear, and each sinusoid still begins on its own crest.
      for (let i = 0; i <= S_PTS; i++) {
        const s = centre + (COMP_SPAN * i) / S_PTS;
        // Phase measured from the packet centre: every component crests there.
        sPts[i] = [s, AMP * amp * Math.cos((2 * Math.PI * (s - centre)) / lam + phase), 0];
      }
      setPolyline(comp.line, sPts);
      (comp.line.material as THREE.Material & { color: THREE.Color }).color.setHex(
        ramp((lam - LAM_MIN) / (LAM_MAX - LAM_MIN)),
      );
    }
  }

  // --- the spread ----------------------------------------------------------
  // A stagger by wavelength, so they peel off in order and the curve is drawn
  // through them as they arrive rather than all at once.
  let reached = SIGNAL_Z;
  for (let c = 0; c < n; c++) {
    const comp = comps[c];
    const order = n > 1 ? c / (n - 1) : 0;
    const local = Math.min(1, Math.max(0, (spread - 0.3 * order) / 0.7));
    const eased = local * local * (3 - 2 * local);
    // The sinusoid is built in absolute s coordinates, so only its depth moves.
    const z = SIGNAL_Z + (lamToZ(comp.lam) - SIGNAL_Z) * eased;
    comp.line.position.set(0, 0, z);
    reached = Math.min(reached, z);

    // Fade in over the first part of its own travel. Stacked on top of each
    // other at the start they read as a smear on the wave; appearing as they
    // leave means the eye only ever sees them separated.
    const fade = Math.min(1, Math.max(0, (eased - 0.04) / 0.3));
    const mat = comp.line.material as THREE.Material;
    mat.opacity = 0.9 * fade * fade * (3 - 2 * fade);
    comp.line.visible = fade > 0.01;

    // The stem grows with the component, and only once it has left the packet.
    setPolyline(stems[c], [
      [centre, 0, z],
      [centre, AMP * comp.amp * eased, z],
    ]);
    stems[c].visible = params.curve && eased > 0.05;
  }
  for (let c = n; c < MAX_SAMPLES; c++) stems[c].visible = false;

  spectrumPlane.position.x = centre;

  // --- the spectrum curve, revealed as far as the components have got ------
  // Points past the leading component are held at it, so the curve grows
  // outwards behind the explosion rather than appearing all at once.
  const zEnd = Math.min(0, reached);
  const lamEnd = LAM_MIN + ((LAM_MAX - LAM_MIN) * zEnd) / -DEPTH;
  for (let i = 0; i <= CURVE_PTS; i++) {
    const lam = Math.min(LAM_MIN + ((LAM_MAX - LAM_MIN) * i) / CURVE_PTS, lamEnd);
    curvePts[i] = [centre, AMP * ampAt(lam), lamToZ(lam)];
  }
  setPolyline(curve, curvePts);
  curve.visible = params.curve && spread > 0.02;
});

stage.start();
