/**
 * Riemann sums for a 2D function — a grid of boxes under a glass surface.
 *
 * Midpoint rule on an N×N grid: each box stands on its cell and rises to
 * f(centre), so its volume is that cell's contribution and the whole block
 * field sums to the estimate.
 *
 * Modes:
 *   sum       the whole grid at once, N on a slider
 *   sweep     boxes rise in serpentine order, snaking row by row
 *   converge  N ramps over the loop — the convergence shot
 *
 * Shares its duration and N-ramp with the monte-carlo-2d demo, so the two
 * exported videos stay in step and can sit side by side in Keynote.
 */

import * as THREE from 'three';
import { createUI, C } from '@';
import { label, setText, fixed } from '@/text';
import { FIELD_HALF, FIELD_VOLUME, bumps2d } from '@/functions';
import {
  Z,
  HOLD,
  START_ANGLE,
  autoOrbit,
  barMaterial,
  createFieldStage,
  floorPlate,
  glassSurface,
} from '@/field2d';

const stage = createFieldStage();
const ui = createUI(stage);

stage.add(floorPlate());
stage.add(glassSurface(bumps2d));

// ---------------------------------------------------------------------------
// Boxes
// ---------------------------------------------------------------------------

const MAX_SIDE = 56; // 56 x 56 = 3136 boxes, comfortable for one instanced mesh
const MAX_BOXES = MAX_SIDE * MAX_SIDE;

// Unit box with its base on y = 0, so an instance's y-scale is its height.
const boxGeom = new THREE.BoxGeometry(1, 1, 1);
boxGeom.translate(0, 0.5, 0);

const boxes = new THREE.InstancedMesh(boxGeom, barMaterial(), MAX_BOXES);
boxes.frustumCulled = false;
boxes.count = 0;
stage.add(boxes);

// ---------------------------------------------------------------------------
// Readout — on the HUD, so it stays put while the camera orbits
// ---------------------------------------------------------------------------

const ASPECT = 16 / 9;
const KEYS = ['cells', 'sum', 'exact', 'error'];
const values = KEYS.map((key, i) => {
  const y = 0.88 - i * 0.115;
  stage.hud.add(
    label(key, { size: 0.055, color: C.slate, anchorY: 'middle', position: [-ASPECT + 0.08, y, 0] }),
  );
  const v = label('', {
    size: 0.055,
    color: C.bone,
    anchorY: 'middle',
    position: [-ASPECT + 0.42, y, 0],
  });
  stage.hud.add(v);
  return v;
});

stage.hud.add(
  label('Riemann sum', {
    size: 0.07,
    color: C.ochre,
    position: [-ASPECT + 0.08, -0.94, 0],
  }),
);

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

const params = {
  mode: 'sum' as 'sum' | 'sweep' | 'converge',
  N: 16,
  autoOrbit: false,
};
ui.params.add(params, 'mode', ['sum', 'sweep', 'converge']).name('mode');
ui.params.add(params, 'N', 1, MAX_SIDE, 1).name('N (per side)');
ui.params.add(params, 'autoOrbit').name('auto-orbit');

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

const dummy = new THREE.Object3D();
const smoothstep = (x: number) => {
  const u = Math.min(Math.max(x, 0), 1);
  return u * u * (3 - 2 * u);
};

stage.frame((t) => {
  // Two clocks: the raw phase, which the orbit rides so it closes its circle
  // over the loop, and the ramp, which finishes HOLD seconds early so the
  // completed grid is on screen long enough to read before the loop restarts.
  const phase = stage.progress(t);
  const u = stage.progress(t, HOLD);
  if (params.autoOrbit) autoOrbit(stage, phase, START_ANGLE);

  let n = Math.round(params.N);
  if (params.mode === 'converge') {
    n = Math.round(Math.exp(Math.log(2) + (Math.log(Math.max(params.N, 2)) - Math.log(2)) * u));
  }
  n = Math.min(Math.max(n, 1), MAX_SIDE);

  const side = 2 * FIELD_HALF;
  const d = side / n;
  const cellArea = d * d;
  const total = n * n;

  // Serpentine: every other row runs backwards, so the fill front never jumps
  // back across the grid. Continuous motion reads far better on video.
  const revealed = params.mode === 'sweep' ? u * total : total;
  // Rise window spans a few cells, so a small wave of boxes is mid-growth.
  const rise = Math.max(n * 0.6, 2);

  let sum = 0;
  let k = 0;

  // Walk in sweep order and only write boxes that have actually started
  // rising, packing them at the front of the instance buffer. Leaving the rest
  // in at zero height would carpet the untouched part of the domain in a flat
  // green sheet, which reads as "the floor is green" rather than "nothing here
  // yet" — the empty region should show bare grid with the glass floating over it.
  for (let order = 0; order < total; order++) {
    const p = params.mode === 'sweep' ? smoothstep((revealed - order) / rise) : 1;
    if (p <= 0.001) continue;

    const row = Math.floor(order / n);
    const col = order % n;
    // Serpentine: odd rows run backwards, so the fill front never jumps.
    const i = row % 2 === 0 ? col : n - 1 - col;

    const x = -FIELD_HALF + (i + 0.5) * d;
    const z = -FIELD_HALF + (row + 0.5) * d;
    const fv = bumps2d(x, z);
    sum += fv * cellArea * p;

    dummy.position.set(x, 0, z);
    // A hair under the full cell size, so neighbours read as separate boxes.
    dummy.scale.set(d * 0.92, Math.max(fv * Z * p, 1e-5), d * 0.92);
    dummy.updateMatrix();
    boxes.setMatrixAt(k++, dummy.matrix);
  }

  boxes.count = k;
  boxes.instanceMatrix.needsUpdate = true;

  const complete = params.mode !== 'sweep' || revealed >= total;
  setText(values[0], `${n}x${n}`);
  setText(values[1], fixed(sum));
  setText(values[2], fixed(FIELD_VOLUME));
  setText(values[3], complete ? fixed(Math.abs(FIELD_VOLUME - sum)) : '-');
});

stage.start();
