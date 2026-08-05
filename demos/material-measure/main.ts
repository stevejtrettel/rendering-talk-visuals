/**
 * A material is a measure on directions, valued in multipliers.
 *
 * A lamp moves around a surface point. Nothing about the light changes as it
 * goes — same spectrum, same strength — and nothing about the material changes
 * either. Only the *direction* the light arrives from changes, and that is the
 * one thing the measure is a function of. So watching the outgoing spectrum
 * rise and fall is watching the measure do its job.
 *
 * ## Reading the picture
 *
 * At the point p: the circle is every direction at p, the band standing off it
 * is the measure — how heavily light from that direction counts, |n·ω| for a
 * Lambertian — and the bright radial mark is where the lamp currently sits on
 * that band. Overhead it lands on the fat part of the band; near grazing, on
 * almost nothing.
 *
 * Then three graphs, all against wavelength:
 *   in        the spectrum arriving from the lamp. It never changes.
 *   response  the multiplier the material puts on it. It never changes either,
 *             and for a Lambertian it is the same in every direction — that is
 *             what it means for the surface to have a colour.
 *   out       the spectrum leaving. This one moves.
 *
 * All three are on fixed scales, so a shorter curve means less light rather
 * than a rescaled axis.
 *
 * ## What the picture is for
 *
 * The out curve changes *height* and never *shape*. Height, because the measure
 * weights the lamp's direction by |n·ω|; shape never, because the multiplier is
 * the same operator whichever direction the light came from. A Lambertian
 * surface therefore does not change colour when the lamp moves, only
 * brightness — and it looks the same from every ω_o, which is why the pale
 * arrow can sit there doing nothing.
 *
 * The mirror slide is this same animation with one thing changed: the band
 * collapses to a single atom, and out is zero except at the instant the lamp
 * crosses one exact direction.
 *
 * ## An earlier version, and why it went
 *
 * The first attempt swept a probe direction around the circle and accumulated
 * the integral as it went. It was read — reasonably — as a moving light source,
 * and under that reading an accumulating output is nonsense. Sweeping a variable
 * of integration looks exactly like moving something in the scene, and the scene
 * always wins.
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
const NS = 64;
const wavelength = (i: number) => WL0 + ((WL1 - WL0) * i) / NS;
const bell = (l: number, c: number, w: number) => Math.exp(-0.5 * ((l - c) / w) ** 2);

function planck(nm: number, T: number): number {
  const l = nm * 1e-9;
  return 3.7418e-16 / (l ** 5 * (Math.exp(1.4388e-2 / (l * T)) - 1));
}

/** The lamp: a warm source, normalised so its peak is 1. */
const LAMP = (() => {
  const out = new Float32Array(NS + 1);
  let peak = 1e-9;
  for (let i = 0; i <= NS; i++) {
    out[i] = planck(wavelength(i), 3200);
    peak = Math.max(peak, out[i]);
  }
  for (let i = 0; i <= NS; i++) out[i] /= peak;
  return out;
})();

/** The response: this surface's reflectance. A green pigment. */
const RESPONSE = (() => {
  const out = new Float32Array(NS + 1);
  for (let i = 0; i <= NS; i++) out[i] = 0.08 + 0.82 * bell(wavelength(i), 545, 42);
  return out;
})();

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

const P = { x: -3.0, y: -0.75 };
const R = 1.45;
const LOBE = 0.75;

const SURFACE_X0 = -5.25;
const SURFACE_X1 = -0.6;
const SLAB = 0.45;

/** ω_o, fixed — for a Lambertian the answer does not depend on it. */
const OMEGA_O = (52 * Math.PI) / 180;
/** How far out the lamp orbits. */
const LAMP_R = R + LOBE + 0.55;

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
stage.add(polyline(arcPts(R, Math.PI, 2 * Math.PI), { color: C.slateDeep, width: 2, opacity: 0.4 }));

/** Lambertian weight: |n · ω|. */
const weight = (a: number) => Math.max(0, Math.sin(a));

// The band: how heavily each direction counts.
{
  const N = 128;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= N; i++) {
    const a = (Math.PI * i) / N;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const outer = R + LOBE * weight(a);
    pos.push(P.x + R * c, P.y + R * s, -0.02, P.x + outer * c, P.y + outer * s, -0.02);
    if (i < N) {
      const j = 2 * i;
      idx.push(j, j + 1, j + 3, j, j + 3, j + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  stage.add(new THREE.Mesh(g, flat(C.ochreDeep, { transparent: true, opacity: 0.6 })));

  const edge: Pt[] = [];
  for (let i = 0; i <= N; i++) {
    const a = (Math.PI * i) / N;
    const outer = R + LOBE * weight(a);
    edge.push([P.x + outer * Math.cos(a), P.y + outer * Math.sin(a), 0]);
  }
  stage.add(polyline(edge, { color: C.ochre, width: 3, opacity: 0.9 }));
}

stage.add(
  label('the measure: how much light\nfrom each direction counts', {
    size: 0.155,
    color: C.ochre,
    lineHeight: 1.4,
    anchorX: 'center',
    position: [P.x, P.y + R + LOBE + 0.95, 0],
  }),
);

// The point, the normal, ω_o.
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
  const g = new THREE.CircleGeometry(0.075, 32);
  g.translate(P.x, P.y, 0.05);
  const dot = new THREE.Mesh(g, flat(C.bone));
  dot.renderOrder = 6;
  stage.add(dot);
}
{
  const reach = R + LOBE + 0.25;
  const c = Math.cos(OMEGA_O);
  const s = Math.sin(OMEGA_O);
  stage.add(
    polyline(
      [
        [P.x, P.y, 0],
        [P.x + (reach - 0.12) * c, P.y + (reach - 0.12) * s, 0],
      ],
      { color: C.bone, width: 4 },
    ),
  );
  const head = new THREE.BufferGeometry();
  head.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([0, 0.12, 0, -0.075, -0.12, 0, 0.075, -0.12, 0], 3),
  );
  const mesh = new THREE.Mesh(head, flat(C.bone));
  mesh.position.set(P.x + reach * c, P.y + reach * s, 0.02);
  mesh.rotation.z = OMEGA_O - Math.PI / 2;
  stage.add(mesh);
  stage.add(
    label('we look from here', {
      size: 0.15,
      color: C.bone,
      anchorY: 'middle',
      position: [P.x + (reach + 0.14) * c, P.y + (reach + 0.14) * s, 0],
    }),
  );
}

// ---------------------------------------------------------------------------
// The lamp, which moves
// ---------------------------------------------------------------------------

const lampRay = polyline(
  [
    [0, 0, 0],
    [0, 0, 0],
  ],
  { color: C.ochre, width: 3, opacity: 0.75 },
);
stage.add(lampRay);

const lampDisc = new THREE.Mesh(new THREE.CircleGeometry(0.14, 32), flat(0xffdb96));
lampDisc.renderOrder = 6;
stage.add(lampDisc);

const lampLabel = label('the lamp', {
  size: 0.16,
  color: 0xffdb96,
  anchorX: 'center',
  anchorY: 'bottom',
});
stage.add(lampLabel);

// Where the lamp lands on the band — the whole mechanism, in one segment.
const weightMark = polyline(
  [
    [0, 0, 0],
    [0, 0, 0],
  ],
  { color: 0xffdb96, width: 9 },
);
weightMark.renderOrder = 5;
stage.add(weightMark);

// ---------------------------------------------------------------------------
// The three graphs
// ---------------------------------------------------------------------------

const SX0 = 0.0;
const SX1 = 4.3;
const STRIP_H = 1.0;
const STRIP_GAP = 0.72;
const STRIP_TOP = 2.3;

const stripBase = (k: number) => STRIP_TOP - k * (STRIP_H + STRIP_GAP) - STRIP_H;
const sx = (i: number) => SX0 + ((SX1 - SX0) * i) / NS;

const TITLES = [
  'in — the light arriving',
  'response — what the material multiplies by',
  'out — the light leaving',
];
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
    label(TITLES[k], { size: 0.165, color: C.ash, position: [SX0, base + STRIP_H + 0.08, 0] }),
  );
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
    if (k === 2) {
      stage.add(
        label(String(nm), {
          size: 0.13,
          color: C.slate,
          anchorX: 'center',
          anchorY: 'top',
          position: [x, base - 0.09, 0],
        }),
      );
    }
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

stage.add(
  label('never changes — the lamp is the lamp', {
    size: 0.13,
    color: C.slate,
    position: [SX0, stripBase(0) - 0.26, 0],
  }),
  label('never changes — and it is the same in every direction', {
    size: 0.13,
    color: C.slate,
    position: [SX0, stripBase(1) - 0.26, 0],
  }),
  label('height moves, shape does not', {
    size: 0.13,
    color: C.slate,
    position: [SX0, stripBase(2) - 0.44, 0],
  }),
);

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

const params = {
  move: true,
  lamp: 120,
};
ui.params.add(params, 'move').name('move the lamp');
ui.params.add(params, 'lamp', 6, 174, 1).name('lamp direction');

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

const outSpec = new Float32Array(NS + 1);
const ptsIn: Pt[] = Array.from({ length: NS + 1 }, () => [0, 0, 0]);
const ptsResp: Pt[] = Array.from({ length: NS + 1 }, () => [0, 0, 0]);
const ptsOut: Pt[] = Array.from({ length: NS + 1 }, () => [0, 0, 0]);

stage.frame((t) => {
  const u = stage.duration > 0 ? (t % stage.duration) / stage.duration : 0;
  // Back and forth across the sky, so the loop closes.
  const a = params.move
    ? (Math.PI / 2) * (1 + 0.92 * Math.sin(u * Math.PI * 2))
    : (params.lamp * Math.PI) / 180;

  const c = Math.cos(a);
  const s = Math.sin(a);
  const w = weight(a);

  lampDisc.position.set(P.x + LAMP_R * c, P.y + LAMP_R * s, 0.05);
  lampLabel.position.set(P.x + (LAMP_R + 0.2) * c, P.y + (LAMP_R + 0.2) * s, 0);
  setPolyline(lampRay, [
    [P.x + (LAMP_R - 0.16) * c, P.y + (LAMP_R - 0.16) * s, 0],
    [P.x + 0.1 * c, P.y + 0.1 * s, 0],
  ]);
  setPolyline(weightMark, [
    [P.x + R * c, P.y + R * s, 0],
    [P.x + (R + LOBE * w) * c, P.y + (R + LOBE * w) * s, 0],
  ]);

  // The whole computation: the arriving light, weighted by the measure at the
  // direction it comes from, with the material's multiplier applied.
  for (let i = 0; i <= NS; i++) outSpec[i] = w * RESPONSE[i] * LAMP[i];

  // Fixed scales. `out` is scaled by the largest it can ever be, at w = 1.
  const scaleIn = STRIP_H / 1.15;
  const scaleResp = STRIP_H / 1.05;
  const scaleOut = STRIP_H / 0.95;

  const b0 = stripBase(0);
  const b1 = stripBase(1);
  const b2 = stripBase(2);
  for (let i = 0; i <= NS; i++) {
    const x = sx(i);
    ptsIn[i] = [x, b0 + LAMP[i] * scaleIn, 0];
    ptsResp[i] = [x, b1 + RESPONSE[i] * scaleResp, 0];
    ptsOut[i] = [x, b2 + outSpec[i] * scaleOut, 0];
  }
  setPolyline(inCurve, ptsIn);
  setPolyline(respCurve, ptsResp);
  setPolyline(outCurve, ptsOut);
});

stage.start();
