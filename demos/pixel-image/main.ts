/**
 * An image is one value per pixel.
 *
 * The camera slide says a camera produces a finite set of pixels each holding a
 * value, so an image lives in V^J. This is that sentence as a picture: a square
 * array of spectra, the same response map applied at every cell, and a
 * photograph falling out.
 *
 * ## The beat the demo exists for
 *
 * What the sensor is handed is the grid you see first — 256 wavelength curves,
 * all drawn in the same grey, differing only in shape. It looks like nothing. No
 * amount of staring at it resolves into a still life, and that is the honest
 * situation: the picture is not in the spectra in any form the eye can reach.
 * Then one linear map runs over the grid and the photograph appears. The map is
 * not extracting a hidden image; it *is* what makes an image out of light.
 *
 * `pixel-response` shows that map once, slowly, on one spectrum. This shows the
 * same map 256 times at once, and never shows the intermediate stages at
 * readable size — the mechanism was the previous slide's job.
 *
 * ## Where the spectra come from
 *
 * From `src/still-life.ts`, which holds the subject so that `pixel-lens` can
 * photograph the same one — its accumulated spectrum is then literally one of
 * the cells here rather than a similar-looking curve. Every spectrum is a lit
 * combination of three broad positive reflectances: the kind of thing a real
 * surface returns, with nothing fitted to the CIE curves.
 */

import * as THREE from 'three';
import { createStage, createUI, C, flat } from '@';
import { polyline } from '@/lines';
import { label } from '@/text';
import { NS } from '@/room2d';
import { CHANNEL_NAMES, xyzToDisplay } from '@/response';
import { RESP, spectrumAt, project } from '@/still-life';

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

const N = 16;

const stage = createStage({
  camera: 'ortho',
  position: [0, 0, 10],
  target: [0, 0, 0],
  orthoHeight: 2.5,
  lights: false,
  controls: false,
});
stage.duration = 12;

const ui = createUI(stage);

/** The grid. Square, and as large as the frame height allows. */
const GRID = 4.5;
const CELL = GRID / N;
const GRID_CX = 1.0;
const GRID_CY = 0.0;

/** Centre of cell (i, j), with j counted downward from the top row. */
const cellX = (i: number) => GRID_CX - GRID / 2 + CELL * (i + 0.5);
const cellY = (j: number) => GRID_CY + GRID / 2 - CELL * (j + 0.5);

/** The reminder of the map, on the left. */
const MX0 = -4.02;
const MX1 = -2.05;
const MROW = [1.15, 0.0, -1.15];
const MUNIT = 0.3;

// ---------------------------------------------------------------------------
// Precompute every cell
// ---------------------------------------------------------------------------

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

/** Samples per drawn mini-curve. Enough shape at a quarter of an inch. */
const SAMP = 28;

interface Cell {
  /** The drawn silhouette, normalised across the whole grid so relative
   *  brightness is visible rather than each cell filling its own box. */
  curve: Float32Array;
  value: [number, number, number];
  color: THREE.Color;
}

const cells: Cell[] = [];
let curveMax = 1e-9;

{
  const spec = new Float32Array(NS + 1);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      // The cell's spectrum, on the shared grid, and the value it produces.
      spectrumAt((i + 0.5) / N, 1 - (j + 0.5) / N, spec);
      const value = project(spec);

      // A coarser copy for drawing.
      const curve = new Float32Array(SAMP + 1);
      for (let q = 0; q <= SAMP; q++) {
        const k = (q / SAMP) * NS;
        const k0 = Math.min(Math.floor(k), NS - 1);
        const f = k - k0;
        curve[q] = spec[k0] + (spec[k0 + 1] - spec[k0]) * f;
        curveMax = Math.max(curveMax, curve[q]);
      }

      const { rgb } = xyzToDisplay(value[0], value[1], value[2]);
      const color = new THREE.Color().setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);
      cells.push({ curve, value, color });
    }
  }
}
for (const cell of cells) for (let q = 0; q <= SAMP; q++) cell.curve[q] /= curveMax;

/** The tallest value anywhere in the picture, so bars share one scale. */
const VMAX = cells.reduce((m, c) => Math.max(m, c.value[0], c.value[1], c.value[2]), 1e-9);

// ---------------------------------------------------------------------------
// The mini spectra — one mesh for all 256
// ---------------------------------------------------------------------------

/**
 * Every cell's silhouette lives in one buffer geometry, rewritten in place each
 * frame. Two hundred and fifty-six separate thick polylines would be 256 draw
 * calls and 256 geometry uploads a frame; this is one of each.
 *
 * Fading is done by driving the vertex colour toward black rather than by
 * transparency. The background *is* black, so the two are indistinguishable on
 * screen, and it keeps every mesh in the demo opaque — no sorting, no blend
 * order to get wrong when 256 things fade at 256 different times.
 */
const specGeom = new THREE.BufferGeometry();
const specPos = new Float32Array(N * N * (SAMP + 1) * 2 * 3);
const specCol = new Float32Array(N * N * (SAMP + 1) * 2 * 3);
specGeom.setAttribute('position', new THREE.BufferAttribute(specPos, 3));
specGeom.setAttribute('color', new THREE.BufferAttribute(specCol, 3));
{
  const index: number[] = [];
  for (let c = 0; c < N * N; c++) {
    const base = c * (SAMP + 1) * 2;
    for (let q = 0; q < SAMP; q++) {
      const a = base + 2 * q;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  specGeom.setIndex(index);
}
const specMesh = new THREE.Mesh(
  specGeom,
  new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }),
);
stage.add(specMesh);

// ---------------------------------------------------------------------------
// The bars, which become the picture
// ---------------------------------------------------------------------------

/**
 * The three bars per cell are also the finished pixel: they slide together,
 * widen to the whole cell, and take the value's colour, so the photograph is
 * literally made of the bars that measured it. A separate square fading in over
 * them would have been two objects claiming to be one number.
 *
 * They are given a hair of z separation so the three coincident quads at the
 * end cannot z-fight — which would show up as flicker in an exported video and
 * nowhere else.
 */
const barGeom = new THREE.PlaneGeometry(1, 1);
barGeom.translate(0, 0.5, 0);

const bars = new THREE.InstancedMesh(barGeom, flat(0xffffff), N * N * 3);
// The finished cells are computed colours, not palette colours: they have to be
// exactly what the value says, so the tone curve comes off. See the README.
bars.material.toneMapped = false;
bars.frustumCulled = false;
stage.add(bars);

const CHAN = [C.rust, C.moss, C.blue].map((h) => new THREE.Color(h));

// ---------------------------------------------------------------------------
// The map, small, on the left
// ---------------------------------------------------------------------------

const mapGroup = new THREE.Group();
stage.add(mapGroup);

for (let c = 0; c < 3; c++) {
  const pts: [number, number, number][] = [];
  for (let k = 0; k <= NS; k++) {
    pts.push([MX0 + ((MX1 - MX0) * k) / NS, MROW[c] + MUNIT * RESP[c][k], 0]);
  }
  mapGroup.add(polyline([[MX0, MROW[c], 0], [MX1, MROW[c], 0]], { color: C.slateDeep, width: 2 }));
  mapGroup.add(polyline(pts, { color: CHAN[c].getHex(), width: 3, opacity: 0.85 }));
  mapGroup.add(
    label(CHANNEL_NAMES[c], {
      size: 0.19,
      color: CHAN[c].getHex(),
      anchorX: 'right',
      anchorY: 'middle',
      position: [MX0 - 0.12, MROW[c] + 0.2, 0],
    }),
  );
}

mapGroup.add(
  label('one map, at every pixel', {
    size: 0.17,
    color: C.ash,
    anchorX: 'center',
    position: [(MX0 + MX1) / 2, MROW[0] + 0.78, 0],
  }),
);
mapGroup.add(
  label('wavelength', {
    size: 0.15,
    color: C.slate,
    anchorX: 'center',
    anchorY: 'top',
    position: [(MX0 + MX1) / 2, MROW[2] - 0.2, 0],
  }),
);

stage.hud.add(
  label('256 spectra, one linear map, one photograph', {
    size: 0.05,
    color: C.slate,
    position: [-(16 / 9) + 0.08, -0.93, 0],
  }),
);

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

const params = {
  mode: 'wave' as 'wave' | 'spectra' | 'image',
  map: true,
};
ui.params.add(params, 'mode', ['wave', 'spectra', 'image']).name('mode');
ui.params.add(params, 'map').name('show the map');

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

/** Fractions of the loop: a settle, the wave crossing, and one cell's squeeze. */
const START = 0.05;
const SWEEP = 0.55;
const CELL_LEN = 0.25;

const dummy = new THREE.Object3D();
const tint = new THREE.Color();
const ASH = new THREE.Color(C.ash);

stage.frame((t) => {
  const u = stage.duration > 0 ? (t % stage.duration) / stage.duration : 0;

  mapGroup.visible = params.map;

  let b = 0;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const cell = cells[j * N + i];
      const cx = cellX(i);
      const cy = cellY(j);
      const base = cy - CELL / 2;

      // A diagonal wave, so at any moment there are spectra ahead of it, bars
      // inside it, and finished picture behind it — all three legible at once.
      const delay = (i + j) / (2 * N - 2);
      const p =
        params.mode === 'spectra'
          ? 0
          : params.mode === 'image'
            ? 1
            : Math.min(Math.max((u - START - SWEEP * delay) / CELL_LEN, 0), 1);

      // The spectrum is crushed horizontally and fades as it goes.
      const squeeze = smoothstep(0, 0.5, p);
      const half = (CELL * 0.44) * (1 - 0.95 * squeeze);
      const fade = 1 - smoothstep(0.15, 0.62, p);
      const h = CELL * 0.84;

      const vBase = (j * N + i) * (SAMP + 1) * 2;
      for (let q = 0; q <= SAMP; q++) {
        const x = cx - half + 2 * half * (q / SAMP);
        const top = base + h * cell.curve[q];
        const o = (vBase + 2 * q) * 3;
        specPos[o] = x;
        specPos[o + 1] = top;
        specPos[o + 2] = 0;
        specPos[o + 3] = x;
        specPos[o + 4] = base;
        specPos[o + 5] = 0;
        for (let s = 0; s < 2; s++) {
          const co = o + s * 3;
          specCol[co] = ASH.r * fade;
          specCol[co + 1] = ASH.g * fade;
          specCol[co + 2] = ASH.b * fade;
        }
      }

      // The bars rise, then converge into the finished pixel.
      const rise = smoothstep(0.34, 0.78, p);
      const merge = smoothstep(0.78, 1, p);

      for (let c = 0; c < 3; c++, b++) {
        const barX = cx + (c - 1) * CELL * 0.29;
        const barW = CELL * 0.2;
        const barH = Math.max((cell.value[c] / VMAX) * CELL * 0.84 * rise, 1e-5);

        // Bars grow from the cell's baseline and stay on it as they merge, so
        // the finished pixel fills the cell from the bottom up.
        dummy.position.set(
          barX + (cx - barX) * merge,
          base,
          // A hair apart, so the three coincident quads cannot z-fight.
          0.001 * c,
        );
        dummy.scale.set(
          barW + (CELL - barW) * merge,
          barH + (CELL - barH) * merge,
          1,
        );
        dummy.updateMatrix();
        bars.setMatrixAt(b, dummy.matrix);

        tint.copy(CHAN[c]).lerp(cell.color, merge).multiplyScalar(rise);
        bars.setColorAt(b, tint);
      }
    }
  }

  specGeom.attributes.position.needsUpdate = true;
  specGeom.attributes.color.needsUpdate = true;
  bars.instanceMatrix.needsUpdate = true;
  if (bars.instanceColor) bars.instanceColor.needsUpdate = true;
});

stage.start();
