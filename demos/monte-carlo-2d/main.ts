/**
 * Monte Carlo integration over a square — spikes under a glass surface.
 *
 * Each sample shoots a line up to the surface at (x, z), wrapped in a cylinder
 * whose base area is that sample's share of the domain,
 *
 *     πr² = area / N     so     r = √(area / πN)
 *
 * which makes the cylinder's *volume* exactly the sample's contribution, the
 * 3D echo of the bar areas in the 1D demo. As samples accumulate the radii
 * shrink together, and you watch the domains each sample claims contract.
 *
 * Cylinders blend additively — overlap reads as brightness, and additive
 * blending is order-independent, which matters when hundreds of transparent
 * cylinders overlap at every camera angle.
 *
 * Shares its duration and ramp with riemann-2d so the two exported videos stay
 * in step and can sit side by side in Keynote.
 */

import * as THREE from 'three';
import { createUI, C, flat } from '@';
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
import { mulberry32 } from '@/sampling';

const stage = createFieldStage();
const ui = createUI(stage);

stage.add(floorPlate());
stage.add(glassSurface(bumps2d));

// ---------------------------------------------------------------------------
// Samples
// ---------------------------------------------------------------------------

const MAX_N = 1500;
const SEED = 20260804;
const DOMAIN_AREA = (2 * FIELD_HALF) * (2 * FIELD_HALF);

// Unit cylinder with caps, base on y = 0. Capped and solid on purpose: these
// are the round counterpart of the Riemann boxes, so they get the same matte
// material and read as the same kind of object — a solid claim on a piece of
// the domain, not a glow.
const cylGeom = new THREE.CylinderGeometry(1, 1, 1, 28);
cylGeom.translate(0, 0.5, 0);

const cylinders = new THREE.InstancedMesh(cylGeom, barMaterial(), MAX_N);
cylinders.frustumCulled = false;
cylinders.count = 0;
stage.add(cylinders);

// A spike drawn only up to the surface would sit entirely inside its own solid
// cylinder and never be seen. Ignoring the depth test to force it through is
// worse — spikes from cylinders at the back then float over ones in front, and
// the picture stops making spatial sense. So each spike overshoots slightly and
// pokes out through the glass like a pin: fully depth-tested, correctly
// occluded, and the tips show where samples landed even from a high angle.
const SPIKE_POKE = 0.22;
const spikeMat = flat(C.bone, { transparent: true, opacity: 0.75 });
const spikes = new THREE.InstancedMesh(cylGeom, spikeMat, MAX_N);
spikes.frustumCulled = false;
spikes.count = 0;
stage.add(spikes);

// ---------------------------------------------------------------------------
// Readout
// ---------------------------------------------------------------------------

const ASPECT = 16 / 9;
const KEYS = ['samples', 'estimate', 'exact', 'error'];
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
  label('Monte Carlo', {
    size: 0.07,
    color: C.ochre,
    position: [-ASPECT + 0.08, -0.94, 0],
  }),
);

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

const params = {
  mode: 'stream' as 'stream' | 'fixed',
  N: 400,
  spikes: true,
  autoOrbit: false,
};
ui.params.add(params, 'mode', ['stream', 'fixed']).name('mode');
ui.params.add(params, 'N', 1, MAX_N, 1).name('N (samples)');
ui.params.add(params, 'spikes').name('spikes');
ui.params.add(params, 'autoOrbit').name('auto-orbit');

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

const dummy = new THREE.Object3D();
const SPIKE_R = 0.012;

stage.frame((t) => {
  // Two clocks: the raw phase, which the orbit rides so it closes its circle
  // over the loop, and the ramp, which finishes HOLD seconds early so the
  // final sample count is on screen long enough to read before the restart.
  const phase = stage.progress(t);
  const u = stage.progress(t, HOLD);
  if (params.autoOrbit) autoOrbit(stage, phase, START_ANGLE);

  let n = Math.round(params.N);
  if (params.mode === 'stream') {
    n = Math.round(Math.exp(Math.log(Math.max(params.N, 1)) * u));
  }
  n = Math.min(Math.max(n, 1), MAX_N);

  // Regenerated from a fixed seed every frame, so the first n samples are
  // always the same ones and a frame-stepped export is reproducible.
  const rng = mulberry32(SEED);
  const radius = Math.sqrt(DOMAIN_AREA / (Math.PI * n));
  const weight = DOMAIN_AREA / n;

  let sum = 0;
  for (let i = 0; i < n; i++) {
    const x = -FIELD_HALF + rng() * 2 * FIELD_HALF;
    const z = -FIELD_HALF + rng() * 2 * FIELD_HALF;
    const fv = bumps2d(x, z);
    sum += fv * weight;

    const h = fv * Z;
    dummy.position.set(x, 0, z);
    dummy.scale.set(radius, Math.max(h, 1e-5), radius);
    dummy.updateMatrix();
    cylinders.setMatrixAt(i, dummy.matrix);

    dummy.scale.set(SPIKE_R, h + SPIKE_POKE, SPIKE_R);
    dummy.updateMatrix();
    spikes.setMatrixAt(i, dummy.matrix);
  }

  cylinders.count = n;
  cylinders.instanceMatrix.needsUpdate = true;
  spikes.count = params.spikes ? n : 0;
  spikes.instanceMatrix.needsUpdate = true;
  // Fade spikes as they crowd, or they turn into a solid pale thicket.
  spikeMat.opacity = Math.max(0.12, 0.75 * Math.min(1, 150 / n));

  setText(values[0], String(n));
  setText(values[1], fixed(sum));
  setText(values[2], fixed(FIELD_VOLUME));
  setText(values[3], fixed(Math.abs(FIELD_VOLUME - sum)));
});

stage.start();
