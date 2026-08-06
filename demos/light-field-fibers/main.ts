/**
 * What one pixel of a light field actually holds.
 *
 * Picking up where `light-field-unfold` leaves off — the room already
 * flat, its light stored in these textures — spheres rise over pixel
 * after pixel, each tethered to the pixel it belongs to. That is the
 * claim: over every point of every surface there is a whole S² of
 * directions light can leave in, and a light field stores a value for
 * each of them. Each ball is tinted by its own surface, so the one over
 * the red wall is red and the one over the green wall is green.
 *
 * Then all but one fade, and the survivor unwraps into the 8×8 grid the
 * field actually keeps. And the punchline is what the grid looks like:
 * on a diffuse surface every one of those directions holds the SAME
 * number. The demo is the setup for the collapse — a whole sphere of
 * directions, and the sphere turns out to be constant.
 *
 * ## The values are measured, not asserted
 *
 * Normally a diffuse surface stores one number per point, precisely
 * because its fiber is constant. The scene behind this demo was baked
 * *without* that shortcut: 64 independent random walks per pixel, one per
 * direction bin. So when the tile comes out flat, that is 64 independent
 * estimators agreeing — evidence, not a definition.
 *
 * ## Why the tile is a bright middle in a dark rim
 *
 * The stored tile is parameterized in world space, so its square's centre
 * is world +z, which has nothing to do with the surface. Drawn that way
 * every tile is half-bright/half-dark and a sheet of them stripes. Here
 * each fiber is re-indexed for display so the surface's own NORMAL is at
 * the centre: the outward hemisphere becomes the central diamond and the
 * directions pointing into the surface become the four corners. It is a
 * re-index and never a re-computation — every displayed value is a stored
 * value — and it makes the unwrap keep the bright part in the middle
 * instead of sliding it to one side.
 *
 * The unwrap itself is the two lines of the octahedral map: radial
 * projection onto the L1 ball, then the fold that sends the lower four
 * triangles into the corners. Same map the sphere's own surface used in
 * demo 1, one level down.
 *
 * Click any pixel to move the surviving fiber there.
 */

import * as THREE from 'three';
import { createStage, createUI } from '@';
import { applyShot, createUnwrap, frameBox, ramp, smootherstep } from '@/lightfield/unwrap';

const stage = createStage({ controls: false, lights: false });
stage.duration = 24;

// For the Capture panel and the `V` key — see light-field-unfold.
createUI(stage);

const u = await createUnwrap(stage);
const camera = stage.camera as THREE.PerspectiveCamera;
u.setPeel(1); // this demo opens on the sheets; the unfolding is demo 1
applyShot(stage, frameBox(camera, u.boxes.net, new THREE.Vector3(0, 1.0, 0.72), 1.06));

const SIZE = 7;
const HEIGHT = 9;

const HOLD = 0.8;
const POP = 2.6;
const DWELL = 2.0;
const FADE = 1.3;
const UNWRAP = 3.0;
const POP_END = HOLD + POP + DWELL;
const FADE_END = POP_END + FADE;
const UNWRAP_END = FADE_END + UNWRAP;

// Scattered across different sheets, so the picture is "every pixel has
// one of these" rather than "this pixel is special". Index 0 is the one
// that survives the fade and then tours: a FLOOR pixel, because from this
// overhead shot you look straight into its outward hemisphere. Over a
// wall pixel two thirds of the ball is directions pointing into the wall,
// and the beat would open on a mostly dark sphere.
const STOPS: { chart: number; fx: number; fy: number }[] = [
  { chart: u.qc(0), fx: 0.35, fy: 0.45 },
  { chart: u.qc(0), fx: 0.78, fy: 0.22 },
  { chart: u.qc(2), fx: 0.35, fy: 0.62 },
  { chart: u.qc(3), fx: 0.55, fy: 0.42 },
  { chart: u.qc(4), fx: 0.42, fy: 0.6 },
  { chart: u.qc(6), fx: 0.5, fy: 0.5 },
  ...(u.sphereChart >= 0 ? [{ chart: u.sphereChart, fx: 0.5, fy: 0.45 }] : []),
];

const fibers = STOPS.map((s) => {
  const l = u.createLoupe(SIZE, HEIGHT);
  const c = u.charts[s.chart];
  l.setCell(
    s.chart,
    Math.min(c.w - 1, Math.round(s.fx * (c.w - 1))),
    Math.min(c.h - 1, Math.round(s.fy * (c.h - 1))),
  );
  l.visible(false);
  return l;
});

// The tour the survivor walks, and which pixels it visits is the
// argument: a plain wall, then the colour-bleed corner where the pixel
// underneath changes fast while all 64 cells above change together and
// stay flat, then the glossy sphere, where they finally disagree.
const TOUR: { chart: number; fx: number; fy: number }[] = [
  { chart: u.qc(0), fx: 0.35, fy: 0.45 },
  { chart: u.qc(0), fx: 0.2, fy: 0.35 },
  { chart: u.qc(0), fx: 0.75, fy: 0.6 },
  { chart: u.qc(3), fx: 0.5, fy: 0.5 },
  { chart: u.qc(4), fx: 0.5, fy: 0.5 },
  ...(u.sphereChart >= 0
    ? [
        { chart: u.sphereChart, fx: 0.45, fy: 0.45 },
        { chart: u.sphereChart, fx: 0.62, fy: 0.58 },
      ]
    : []),
];
const DWELL_T = 1.0;
const TRAVEL = 1.4;

function tourAt(time: number): THREE.Vector3 {
  const period = DWELL_T + TRAVEL;
  const total = TOUR.length * period;
  const x = ((time % total) + total) % total;
  const k = Math.floor(x / period);
  const local = x - k * period;
  const a = u.stopPos(TOUR[k].chart, TOUR[k].fx, TOUR[k].fy);
  if (local < DWELL_T) return a;
  const nb = TOUR[(k + 1) % TOUR.length];
  return a.lerp(u.stopPos(nb.chart, nb.fx, nb.fy), smootherstep((local - DWELL_T) / TRAVEL));
}

let manual: THREE.Vector3 | null = null;

stage.frame((t) => {
  const fade = ramp(t, POP_END, FADE);
  const bloom = manual ? 1 : ramp(t, FADE_END, UNWRAP);

  STOPS.forEach((s, i) => {
    const lead = i === 0;
    const rise = smootherstep(ramp(t, HOLD + (i / STOPS.length) * POP * 0.7, POP * 0.5));
    const alpha = lead ? rise : rise * (1 - fade);
    fibers[i].visible(alpha > 0.01);
    if (alpha <= 0.01) return;

    if (lead && (manual || t >= UNWRAP_END)) {
      const p = manual ?? tourAt(t - UNWRAP_END);
      const under = u.cellUnder(p.x, p.z);
      if (under) {
        fibers[0].setCell(under.chart, under.lx, under.ly);
        u.highlight(under.chart, under.lx, under.ly);
      }
      fibers[0].place(p.x, p.z, 1, under ? 1 : 0.22);
      return;
    }
    const p = u.stopPos(s.chart, s.fx, s.fy);
    fibers[i].place(p.x, p.z, lead ? bloom : 0, alpha, HEIGHT * rise);
    if (lead) {
      const c = u.charts[s.chart];
      u.highlight(
        s.chart,
        Math.min(c.w - 1, Math.round(s.fx * (c.w - 1))),
        Math.min(c.h - 1, Math.round(s.fy * (c.h - 1))),
      );
    }
  });
});

// Clicking takes over the surviving fiber — the timeline would otherwise
// walk away from the pixel you just asked about.
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
stage.canvas.addEventListener('pointerup', (e) => {
  const r = stage.canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, stage.camera);
  const hit = ray.intersectObjects(u.pickTargets, false)[0];
  if (hit) manual = hit.point.clone();
});

stage.start();
