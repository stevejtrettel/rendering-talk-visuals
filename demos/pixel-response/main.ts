/**
 * A pixel is a linear map from spectra to values.
 *
 * The camera slide factors into measurement and response; this is the response
 * half, run end to end. A spectrum arrives on the left, splits into three
 * copies, each is multiplied by one of the sensor's response curves, the area
 * under each product accumulates into a bar, and the three bars — the value —
 * become a colour.
 *
 * ## Why the curves are the CIE observer and the bars are X, Y, Z
 *
 * Three tidy positive bumps whose integrals are R, G and B would be simpler to
 * look at and would not exist: the colour-matching functions of any real set of
 * display primaries go negative in the blue-green, which is why a screen cannot
 * show every colour. So the honest map is the 1931 standard observer, the three
 * integrals are X, Y and Z, and everything needed to turn those into light
 * coming off a screen — a linear map onto the primaries, then a nonlinear
 * encoding — is quarantined in the last step and captioned as *display*. See
 * `src/response.ts`.
 *
 * The whole picture is drawn on one vertical scale, which is what makes it
 * argue rather than merely illustrate: `z` really is nearly twice as tall as
 * the others and much narrower, and the three areas really do come out equal on
 * a flat spectrum. Normalising each row to a tidy peak of 1 would have thrown
 * that away, and with it any reason to believe the bars.
 *
 * ## The two halves of the loop
 *
 * *Build* assembles the machine once, slowly, with each stage waiting for the
 * one before it. *Run* keeps it assembled and morphs the incoming spectrum,
 * everything downstream tracking live. The `mode` control gives either alone,
 * for a slide that only wants one.
 *
 * The morphing family is three Gaussian bumps whose centres, widths and heights
 * oscillate at integer multiples of the loop frequency, so it returns exactly
 * to where it started and the exported video loops seamlessly. Its heights are
 * phased a third of a cycle apart, which walks the value once around the hue
 * circle instead of wandering about near white.
 *
 * The spectrum is drawn normalised to peak 1 throughout. Its *total* energy
 * therefore varies as it morphs, and the bars shrink and grow partly for that
 * reason — which is correct, and is the same statement as the slide's footnote
 * that a perfectly narrow filter passes no power.
 */

import * as THREE from 'three';
import { createStage, createUI, C, flat, mix } from '@';
import { polyline, setPolyline } from '@/lines';
import { label, setText, fixed } from '@/text';
// The same spectral grid the light-field demos sample on, so a spectrum from
// the room could be dropped straight into this pixel.
import { WL0, WL1, NS, wavelength } from '@/room2d';
import { CMF, CHANNEL_NAMES, bandNormalizer, xyzToDisplay } from '@/response';

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

const ORTHO_H = 2.5;

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

/**
 * The incoming spectrum's panel. Drawn large: it is the input, and it is the
 * one curve the audience has to read before anything else happens to it.
 */
const LX0 = -4.15;
const LX1 = -2.75;
// Its baseline is the bottom row's and the bars', so one horizontal runs the
// width of the frame and the four columns read as one machine.
const LBASE = -1.55;
const LUNIT = 1.9;

/** The three response panels, sharing a wavelength scale. */
const RX0 = -2.15;
const RX1 = 0.75;
/**
 * World height of one unit of response. Sized for `z`, which peaks at 1.78 —
 * everything is on this one scale, so the tallest thing on it sets it.
 */
const RUNIT = 0.44;
const ROW_Y = [1.05, -0.25, -1.55];

/** The bars. Their baseline is shared with the bottom row, which lines the
 *  right half of the frame up with the left. */
const BAR_X = [1.25, 1.72, 2.19];
const BAR_W = 0.36;
const BAR_BASE = -1.55;
/** Value at the top of the bar axis. Bars carry their number as well as a length. */
const BAR_FULL = 0.7;
const BAR_H = 2.2;

/** The colour square. */
const SQ_X = 2.78;
const SQ_X1 = 4.18;
const SQ_Y = -0.2;
const SQ_H = 1.25;

/**
 * Column labels sit just above the thing they name rather than on one shared
 * band across the top. The four columns are different heights, and a shared
 * band left each label floating a long way from its own object.
 */
const HEADER_SIZE = 0.16;

/** X = rust, Y = moss, Z = blue — the palette's own desaturated RGB triple. */
const CHAN = [C.rust, C.moss, C.blue];
const CHAN_DEEP = [C.rustDeep, C.mossDeep, C.blueDeep];

const rowX = (i: number) => RX0 + ((RX1 - RX0) * i) / NS;
const leftX = (i: number) => LX0 + ((LX1 - LX0) * i) / NS;

// ---------------------------------------------------------------------------
// The spectrum family
// ---------------------------------------------------------------------------

const TAU = Math.PI * 2;

/**
 * Three bumps, each parameter an integer number of cycles over the loop so the
 * family closes up exactly. The heights run at one cycle each, a third of a
 * turn apart, so the bumps take turns dominating and the value walks once round
 * the hue circle. Widths run at two cycles, which keeps the shape from ever
 * settling into something that looks static.
 */
interface Bump {
  c0: number; ca: number; cn: number; cp: number;
  w0: number; wa: number; wn: number; wp: number;
  h0: number; ha: number; hn: number; hp: number;
}

const BUMPS: Bump[] = [
  { c0: 455, ca: 22, cn: 1, cp: 0.0, w0: 18, wa: 6, wn: 2, wp: 0.0, h0: 0.52, ha: 0.48, hn: 1, hp: 1.6 },
  { c0: 545, ca: 28, cn: 1, cp: 2.4, w0: 20, wa: 7, wn: 2, wp: 0.9, h0: 0.55, ha: 0.45, hn: 1, hp: 3.6 },
  { c0: 635, ca: 24, cn: 1, cp: 4.5, w0: 19, wa: 6, wn: 2, wp: 2.1, h0: 0.52, ha: 0.48, hn: 1, hp: 5.4 },
];

const spectrum = new Float32Array(NS + 1);

/** Fill `spectrum` at phase q, normalised to peak 1. */
function setSpectrum(q: number): void {
  let peak = 1e-9;
  for (let i = 0; i <= NS; i++) {
    const nm = wavelength(i);
    let v = 0;
    for (const b of BUMPS) {
      const c = b.c0 + b.ca * Math.sin(TAU * b.cn * q + b.cp);
      const w = b.w0 + b.wa * Math.sin(TAU * b.wn * q + b.wp);
      const h = Math.max(b.h0 + b.ha * Math.sin(TAU * b.hn * q + b.hp), 0);
      const t = (nm - c) / w;
      v += h * Math.exp(-0.5 * t * t);
    }
    spectrum[i] = v;
    peak = Math.max(peak, v);
  }
  for (let i = 0; i <= NS; i++) spectrum[i] /= peak;
}

// The response curves, sampled once on the shared grid.
const resp = CMF.map((f) => {
  const t = new Float32Array(NS + 1);
  for (let i = 0; i <= NS; i++) t[i] = f(wavelength(i));
  return t;
});

const D_LAMBDA = (WL1 - WL0) / NS;
/** One shared constant, never one per channel — see `bandNormalizer`. */
const K = bandNormalizer(WL0, WL1, NS);

/**
 * The channel's integral, taken only as far as `sw` along the band.
 *
 * Fractional, so the bar rises smoothly rather than in 96 steps as the fill
 * sweeps — the bar and the shaded area are meant to be visibly the same
 * quantity, and a bar that ticks while the area glides breaks that.
 */
function partialIntegral(c: number, sw: number): number {
  const r = resp[c];
  const i0 = Math.floor(sw);
  let sum = 0;
  for (let i = 0; i < Math.min(i0, NS); i++) {
    sum += 0.5 * (spectrum[i] * r[i] + spectrum[i + 1] * r[i + 1]) * D_LAMBDA;
  }
  const frac = sw - i0;
  if (i0 < NS && frac > 0) {
    const a = spectrum[i0] * r[i0];
    const b = spectrum[i0 + 1] * r[i0 + 1];
    const mid = a + (b - a) * frac;
    sum += 0.5 * (a + mid) * frac * D_LAMBDA;
  }
  return sum * K;
}

// ---------------------------------------------------------------------------
// Scenery — panels, axes, headers
// ---------------------------------------------------------------------------

function tickedAxis(
  x0: number,
  x1: number,
  y: number,
  size: number,
  labels: boolean,
): THREE.Group {
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

stage.add(tickedAxis(LX0, LX1, LBASE, 0.15, true));
stage.add(tickedAxis(RX0, RX1, ROW_Y[0], 0.15, false));
stage.add(tickedAxis(RX0, RX1, ROW_Y[1], 0.15, false));
stage.add(tickedAxis(RX0, RX1, ROW_Y[2], 0.15, true));

stage.add(
  label('wavelength (nm)', {
    size: 0.17,
    color: C.slate,
    anchorX: 'center',
    position: [(RX0 + RX1) / 2, ROW_Y[2] - 0.52, 0],
  }),
);

// Four labels, which are the whole narrative in four phrases.
const headers: [string, number, number][] = [
  ['the spectrum arriving', (LX0 + LX1) / 2, LBASE + LUNIT + 0.22],
  ['the sensor response', (RX0 + RX1) / 2, ROW_Y[0] + 1.02],
  ['the value', (BAR_X[0] + BAR_X[2]) / 2, BAR_BASE + BAR_H + 0.22],
  ['what a display shows', (SQ_X + SQ_X1) / 2, SQ_Y + SQ_H / 2 + 0.16],
];
for (const [text, x, y] of headers) {
  stage.add(
    label(text, { size: HEADER_SIZE, color: C.ash, anchorX: 'center', position: [x, y, 0] }),
  );
}

// ---------------------------------------------------------------------------
// The incoming spectrum, and the three copies of it
// ---------------------------------------------------------------------------

/**
 * The spectrum is authored once in unit coordinates — wavelength across [0, 1],
 * value up — and every copy of it is that same curve under a different group
 * transform. The copies then land on their rows *exactly*, with no separate
 * geometry to keep in step, and the split is a lerp between two transforms
 * rather than a shape being rebuilt every frame.
 */
type P3 = [number, number, number];

const local: P3[] = Array.from({ length: NS + 1 }, (_, i) => [i / NS, 0, 0] as P3);

function unitCurve(color: number, width: number, opacity = 1) {
  const line = polyline(local, { color, width, opacity });
  const g = new THREE.Group();
  g.add(line);
  stage.add(g);
  return { line, group: g };
}

const source = unitCurve(C.bone, 4);
source.group.position.set(LX0, LBASE, 0);
source.group.scale.set(LX1 - LX0, LUNIT, 1);

// Dimmer than the source, and dimmer than the product they help make. Drawn in
// bone at full strength they were the loudest thing in each row, and the row
// read as a tangle of three curves rather than as one multiplication.
const ghosts = [0, 1, 2].map(() => unitCurve(C.ash, 2.5, 0.5));
// Over the response curve, under the shaded product.
for (const g of ghosts) g.line.renderOrder = 2;

// ---------------------------------------------------------------------------
// Per-row response curve, product curve, and the shaded area
// ---------------------------------------------------------------------------

const rows = ROW_Y.map((base, c) => {
  // The response curve. Recessive: it is the fixed property of the sensor, and
  // the eye should land on the product.
  const rpts: P3[] = Array.from({ length: NS + 1 }, (_, i) => [
    rowX(i),
    base + RUNIT * resp[c][i],
    0,
  ]);
  const curve = polyline(rpts, { color: CHAN[c], width: 3, opacity: 0.6 });
  curve.renderOrder = 1;
  stage.add(curve);

  // The product, and a wash under it. Same triangle-strip trick as the room's
  // spectrum panel: fixed vertex count, rewritten in place every frame.
  const ppts: P3[] = Array.from({ length: NS + 1 }, (_, i) => [rowX(i), base, 0] as P3);
  const product = polyline(ppts, { color: CHAN[c], width: 4.5 });
  product.renderOrder = 6;
  stage.add(product);

  const fillGeom = new THREE.BufferGeometry();
  const fillPos = new Float32Array((NS + 1) * 2 * 3);
  fillGeom.setAttribute('position', new THREE.BufferAttribute(fillPos, 3));
  const index: number[] = [];
  for (let i = 0; i < NS; i++) {
    index.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
  }
  fillGeom.setIndex(index);
  const fill = new THREE.Mesh(
    fillGeom,
    flat(mix(CHAN[c], CHAN_DEEP[c], 0.35), {
      transparent: true,
      opacity: 0.62,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  fill.renderOrder = 5;
  stage.add(fill);

  stage.add(
    label(CHANNEL_NAMES[c], {
      size: 0.26,
      color: CHAN[c],
      anchorX: 'right',
      anchorY: 'middle',
      position: [RX0 - 0.12, base + 0.32, 0],
    }),
  );

  return { base, curve, product, ppts, fillGeom, fillPos };
});

// ---------------------------------------------------------------------------
// The bars
// ---------------------------------------------------------------------------

const GRID_X0 = BAR_X[0] - 0.3;
const GRID_X1 = BAR_X[2] + 0.3;

stage.add(
  polyline([[GRID_X0, BAR_BASE, 0], [GRID_X1, BAR_BASE, 0]], { color: C.slateDeep, width: 2 }),
);

// A scale for the bars as faint gridlines rather than a spine up the side. A
// spine would have to stand within a couple of tenths of the response panels,
// where it reads as a border round them; the gridlines sit inside the bar group
// and touch nothing. Unnumbered, since every bar already carries its own value
// — what these add is the thing the number cannot, which is how full the bar is.
for (let v = 0.2; v < BAR_FULL - 1e-9; v += 0.2) {
  const y = BAR_BASE + (v / BAR_FULL) * BAR_H;
  // Behind the bars, so a bar crossing a line hides it rather than being ruled
  // through.
  stage.add(
    polyline([[GRID_X0, y, -0.03], [GRID_X1, y, -0.03]], {
      color: C.slateDeep,
      width: 1.5,
      opacity: 0.55,
    }),
  );
}

// Unit square sitting on the origin, so a y-scale is directly the bar height.
const barGeom = new THREE.PlaneGeometry(BAR_W, 1);
barGeom.translate(0, 0.5, 0);

const bars = BAR_X.map((x, c) => {
  const m = new THREE.Mesh(barGeom, flat(CHAN[c]));
  m.position.set(x, BAR_BASE, -0.01);
  stage.add(m);

  stage.add(
    label(CHANNEL_NAMES[c], {
      size: 0.2,
      color: CHAN[c],
      anchorX: 'center',
      anchorY: 'top',
      position: [x, BAR_BASE - 0.1, 0],
    }),
  );

  const readout = label('', { size: 0.17, color: C.bone, anchorX: 'center', position: [x, 0, 0] });
  stage.add(readout);
  return { mesh: m, readout };
});

// Deliberately no connectors from the rows to the bars. Every route from a row
// to its bar crosses the other two bars, and three dashed diagonals through the
// readout turn it into a wiring diagram. The association is already carried
// twice over — each row and its bar share a colour and share a letter.

// ---------------------------------------------------------------------------
// The colour square
// ---------------------------------------------------------------------------

const arrow = new THREE.Group();
// Built with an opacity just under 1 so `polyline` gives it a transparent
// material — otherwise the fade-in below silently does nothing.
const arrowShaft = polyline([[2.44, SQ_Y, 0], [2.62, SQ_Y, 0]], {
  color: C.ash,
  width: 3,
  opacity: 0.999,
});
arrow.add(arrowShaft);
const arrowHeadMat = flat(C.ash, { transparent: true });
{
  const head = new THREE.BufferGeometry();
  head.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [2.7, SQ_Y, 0, 2.58, SQ_Y + 0.075, 0, 2.58, SQ_Y - 0.075, 0],
      3,
    ),
  );
  arrow.add(new THREE.Mesh(head, arrowHeadMat));
}
stage.add(arrow);

/**
 * The one material in the deck that opts out of the look.
 *
 * The stage renders through ACES tone mapping into sRGB, which is right for
 * everything that is *scenery* — it is what keeps the mineral palette sitting
 * together. This square is not scenery, it is a readout: it has to be the
 * colour the value actually is, so the tone curve has to come off. The colour
 * is then handed over already sRGB-encoded (`xyzToDisplay` did the encoding, on
 * purpose, since that step belongs to display), and telling three which space
 * it is in makes the round trip through the renderer exact instead of encoding
 * it a second time and washing every value out.
 */
const squareMat = flat(0x000000);
squareMat.toneMapped = false;
const square = new THREE.Mesh(new THREE.PlaneGeometry(SQ_X1 - SQ_X, SQ_H), squareMat);
square.position.set((SQ_X + SQ_X1) / 2, SQ_Y, 0);
stage.add(square);

// A frame, so a dark value still reads as a square rather than a hole.
stage.add(
  polyline(
    [
      [SQ_X, SQ_Y - SQ_H / 2, 0.01],
      [SQ_X1, SQ_Y - SQ_H / 2, 0.01],
      [SQ_X1, SQ_Y + SQ_H / 2, 0.01],
      [SQ_X, SQ_Y + SQ_H / 2, 0.01],
      [SQ_X, SQ_Y - SQ_H / 2, 0.01],
    ],
    { color: C.slateDeep, width: 2 },
  ),
);

// The one caption that has to be there: everything in this step is display, not
// measurement, and the talk is careful about that boundary.
stage.add(
  label('a linear map onto the\ndisplay primaries, then\nthe transfer curve', {
    size: 0.125,
    color: C.slate,
    anchorX: 'center',
    anchorY: 'top',
    position: [(SQ_X + SQ_X1) / 2, SQ_Y - SQ_H / 2 - 0.14, 0],
  }),
);

const gamutNote = label('outside what the screen can show', {
  size: 0.13,
  color: C.ochre,
  anchorX: 'center',
  anchorY: 'bottom',
  position: [(SQ_X + SQ_X1) / 2, SQ_Y + SQ_H / 2 + 0.1, 0],
});
stage.add(gamutNote);

stage.hud.add(
  label('CIE 1931 standard observer - the value is three integrals', {
    size: 0.05,
    color: C.slate,
    position: [-(16 / 9) + 0.08, -0.93, 0],
  }),
);

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

const params = {
  mode: 'build' as 'build' | 'run',
  hold: false,
  phase: 0,
  responses: true,
};
ui.params.add(params, 'mode', ['build', 'run']).name('mode');
ui.params.add(params, 'hold').name('hold the spectrum');
ui.params.add(params, 'phase', 0, 1, 0.001).name('spectrum (when held)');
ui.params.add(params, 'responses').name('response curves');

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

// Fractions of the loop. Build assembles the machine; run morphs the input.
const DRAW_END = 0.07;
const TRAVEL_0 = 0.1;
const TRAVEL_LEN = 0.1;
const TRAVEL_STAGGER = 0.022;
const SWEEP_0 = 0.25;
const SWEEP_LEN = 0.13;
const SWEEP_STAGGER = 0.028;
const SQUARE_0 = 0.44;
const SQUARE_LEN = 0.06;
const RUN_0 = 0.5;

const clamp01 = (x: number) => Math.min(Math.max(x, 0), 1);
const smoothstep = (x: number) => {
  const u = clamp01(x);
  return u * u * (3 - 2 * u);
};

const xyz: [number, number, number] = [0, 0, 0];

stage.frame((t) => {
  const u = stage.duration > 0 ? (t % stage.duration) / stage.duration : 0;
  const building = params.mode === 'build';

  // In build mode the spectrum is held at the family's start while the machine
  // assembles, then morphs once, all the way round, over the second half — so
  // the loop closes on the shape it opened with.
  const q = params.hold ? params.phase : building ? Math.max(0, (u - RUN_0) / (1 - RUN_0)) : u;
  setSpectrum(q);

  // How far the source curve has drawn itself in, and how far each copy has
  // travelled and swept. Outside build mode everything is simply finished.
  const draw = building ? smoothstep(u / DRAW_END) : 1;
  const travel = ROW_Y.map((_, c) =>
    building ? smoothstep((u - (TRAVEL_0 + TRAVEL_STAGGER * c)) / TRAVEL_LEN) : 1,
  );
  const sweep = ROW_Y.map((_, c) =>
    building ? smoothstep((u - (SWEEP_0 + SWEEP_STAGGER * c)) / SWEEP_LEN) : 1,
  );
  const shown = building ? smoothstep((u - SQUARE_0) / SQUARE_LEN) : 1;

  // --- the source curve, revealed left to right ---------------------------
  const drawn = draw * NS;
  for (let i = 0; i <= NS; i++) {
    const j = Math.min(i, drawn);
    const i0 = Math.floor(j);
    const f = j - i0;
    const v = i0 >= NS ? spectrum[NS] : spectrum[i0] + (spectrum[i0 + 1] - spectrum[i0]) * f;
    local[i][0] = j / NS;
    local[i][1] = v;
  }
  setPolyline(source.line, local);
  source.group.visible = draw > 0.001;

  // --- the three copies, each lerping from the source panel to its row -----
  for (let c = 0; c < 3; c++) {
    setPolyline(ghosts[c].line, local);
    const e = travel[c];
    const g = ghosts[c].group;
    g.position.set(
      LX0 + (RX0 - LX0) * e,
      LBASE + (rows[c].base - LBASE) * e,
      0,
    );
    g.scale.set(
      LX1 - LX0 + (RX1 - RX0 - (LX1 - LX0)) * e,
      LUNIT + (RUNIT - LUNIT) * e,
      1,
    );
    // Hidden until it departs: three copies stacked exactly on the source read
    // as the source having gone slightly bold, not as three of anything.
    g.visible = e > 0.004;
    (ghosts[c].line.material as THREE.Material).opacity = 0.35 + 0.4 * e;
  }

  // --- products, shaded areas, bars ---------------------------------------
  for (let c = 0; c < 3; c++) {
    const row = rows[c];
    const sw = sweep[c] * NS;
    const i0 = Math.floor(sw);
    const f = sw - i0;

    // The leading edge sits at the exact fractional sample, so the shaded
    // region ends in a clean vertical rather than stepping sample by sample.
    const edgeX = rowX(Math.min(sw, NS));
    const a = spectrum[Math.min(i0, NS)] * resp[c][Math.min(i0, NS)];
    const b = spectrum[Math.min(i0 + 1, NS)] * resp[c][Math.min(i0 + 1, NS)];
    const edgeV = i0 >= NS ? a : a + (b - a) * f;

    // Past the edge every remaining sample is parked on the edge point, so the
    // curve stops there and the wash collapses to zero width — nothing is drawn
    // ahead of the sweep, and the region ends in a clean vertical.
    for (let i = 0; i <= NS; i++) {
      const inside = i <= i0;
      const x = inside ? rowX(i) : edgeX;
      const top = row.base + RUNIT * (inside ? spectrum[i] * resp[c][i] : edgeV);

      row.ppts[i][0] = x;
      row.ppts[i][1] = top;

      row.fillPos[6 * i + 0] = x;
      row.fillPos[6 * i + 1] = top;
      row.fillPos[6 * i + 2] = 0;
      row.fillPos[6 * i + 3] = x;
      row.fillPos[6 * i + 4] = row.base;
      row.fillPos[6 * i + 5] = 0;
    }
    setPolyline(row.product, row.ppts);
    row.fillGeom.attributes.position.needsUpdate = true;
    row.product.visible = sweep[c] > 0.002;
    row.curve.visible = params.responses;

    const value = partialIntegral(c, sw);
    xyz[c] = value;

    const h = Math.max((value / BAR_FULL) * BAR_H, 1e-6);
    bars[c].mesh.scale.set(1, h, 1);
    bars[c].mesh.visible = sweep[c] > 0.002;
    bars[c].readout.position.y = BAR_BASE + h + 0.08;
    bars[c].readout.visible = sweep[c] > 0.05;
    setText(bars[c].readout, fixed(value, 3));
  }

  // --- the value as a colour ----------------------------------------------
  const { rgb, outOfGamut } = xyzToDisplay(xyz[0], xyz[1], xyz[2]);
  squareMat.color.setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);
  // Faded up from black rather than cut in, so the square arrives with the rest
  // of the picture instead of popping. Scaled after the conversion, so the fade
  // runs on linear values and the colour does not drift on the way in.
  squareMat.color.multiplyScalar(shown);
  arrow.visible = shown > 0.02;
  (arrowShaft.material as THREE.Material).opacity = shown;
  arrowHeadMat.opacity = shown;
  gamutNote.visible = outOfGamut && shown > 0.5;
});

stage.start();
