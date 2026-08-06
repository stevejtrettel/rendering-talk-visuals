/**
 * The room, and the memory its light lives in, side by side.
 *
 * On the right, the baked Cornell room, whole and lit. On the left, every
 * chart of its light field laid out flat and packed tight — the same
 * texels, off the surfaces and in the arrangement a renderer actually
 * keeps them in. A marker walks the room and the matching cell lights up
 * in the panel, so the picture is a correspondence rather than two images
 * that happen to share a frame.
 *
 * ## Two flattenings, and this is the other one
 *
 * `light-field-unfold` opens the room into a NET: every chart hinged to
 * the edge it physically shares, so where a sheet lands is a fact about
 * the room. This panel is the opposite claim. An atlas is a set of
 * rectangles and a packer puts them wherever they fit, so charts sitting
 * next to each other here are NOT neighbours in the room, and shuffling
 * the layout would lose nothing. That is the point worth making: storage
 * throws the geometry away and keeps only the texel counts.
 *
 * ## What is drawn honestly, and what is a framing choice
 *
 * Every texel is drawn at its true size relative to every other texel, in
 * both panels — the invariant the whole light-field family rests on. What
 * is NOT preserved across the divider is absolute scale: the left panel
 * is orthographic and the right is perspective, so a texel on the back
 * wall is smaller on screen than its cell in the panel. There is no way
 * around that in a side-by-side, and it is the reason the marker exists —
 * the correspondence is asserted by the highlight, not by size.
 *
 * The packing is chosen to fit the half-frame it is drawn in, not taken
 * from the bundle: the baker's own layout is a single row 173 texels wide
 * and 16 tall, which is right for a texture and unreadable here. See
 * `src/lightfield/atlas.ts` — a packing is arbitrary, so choosing one
 * costs no claim.
 *
 * ## The motion
 *
 * The room rocks through a shallow arc rather than orbiting: a full turn
 * would take the camera behind the back wall, and the beat is "this is a
 * solid" not "look all the way round". Rock and tour both complete one
 * cycle over `duration` and return, so the export loops — which is why
 * there is no `captureEnd` here.
 */

import * as THREE from 'three';
import { createStage, createUI, ASPECT, C } from '@';
import { createUnwrap, frameBox } from '@/lightfield/unwrap';
import { createAtlasPanel } from '@/lightfield/atlas';
import { polyline } from '@/lines';

const stage = createStage({ controls: false, lights: false });
stage.duration = 16;

// For the Capture panel and the `V` key — see light-field-unfold.
createUI(stage);

const u = await createUnwrap(stage);
u.setPeel(0); // the room stays whole; the unfolding is demo 1

// --- the two halves ------------------------------------------------------
// Each panel is half of a 16:9 frame, so each is 8:9. The perspective
// camera has to be told that or frameBox fits to the wrong shape.
const HALF_ASPECT = ASPECT / 2;

const camera = stage.camera as THREE.PerspectiveCamera;
camera.aspect = HALF_ASPECT;
camera.updateProjectionMatrix();

const panel = createAtlasPanel(u.bundle, { targetAspect: HALF_ASPECT });
const panelScene = new THREE.Scene();
panelScene.background = null;
panelScene.add(panel.group);

// Frame the packing with a margin. Fit by whichever axis is tighter, so
// the panel never crops however the pack came out.
const MARGIN = 1.12;
const panelHalfH = Math.max((panel.size.h / 2) * MARGIN, (panel.size.w / 2 / HALF_ASPECT) * MARGIN);
const panelCam = new THREE.OrthographicCamera(
  -panelHalfH * HALF_ASPECT,
  panelHalfH * HALF_ASPECT,
  panelHalfH,
  -panelHalfH,
  -1000,
  1000,
);
panelCam.position.set(0, 0, 100);
panelCam.lookAt(0, 0, 0);

// --- the marker's tour ---------------------------------------------------
// One stop per kind of surface: the floor under the red bleed, both
// coloured walls, the back wall, the sphere, and the cube's top face.
//
// The ORDER is tied to the rock. A marked cell you cannot see teaches
// nothing, and from inside a box a wall that has swung edge-on is a few
// pixels wide. The rock is a sine over the loop, so it is furthest one
// way at phase 1/4 and the other at 3/4; with six stops those are slices
// 1 and 4, and that is where the two coloured walls go. Everything else
// faces the camera from any angle. Reorder these and check the shot.
const TOUR: { chart: number; fx: number; fy: number }[] = [
  { chart: u.qc(0), fx: 0.3, fy: 0.4 }, //  floor, in the red bleed
  { chart: u.qc(3), fx: 0.35, fy: 0.55 }, // red wall  — rock is toward it
  { chart: u.qc(2), fx: 0.5, fy: 0.65 }, // back wall
  ...(u.sphereChart >= 0 ? [{ chart: u.sphereChart, fx: 0.5, fy: 0.45 }] : []),
  { chart: u.qc(4), fx: 0.6, fy: 0.5 }, //  green wall — rock is toward it
  { chart: u.qc(6), fx: 0.5, fy: 0.5 }, //  cube's top face, never hidden
];

function stopCell(s: { chart: number; fx: number; fy: number }): { lx: number; ly: number } {
  const c = u.charts[s.chart];
  return {
    lx: Math.min(c.w - 1, Math.round(s.fx * (c.w - 1))),
    ly: Math.min(c.h - 1, Math.round(s.fy * (c.h - 1))),
  };
}

// --- the divider ---------------------------------------------------------
// Drawn on the HUD, so it sits in fixed screen coordinates and does not
// belong to either camera. Dim: it separates, it should not be read.
const hud = stage.hud;
const hudCam = new THREE.OrthographicCamera(-ASPECT, ASPECT, 1, -1, -100, 100);
hudCam.position.z = 10;
hud.add(
  polyline(
    [
      [0, -0.94, 0],
      [0, 0.94, 0],
    ],
    { color: C.slateDeep, width: 2 },
  ),
);

// --- the split render ----------------------------------------------------
// Shadowing Stage.render rather than changing it: this is the only demo in
// the repo that wants two viewports, and the exporter goes through
// stage.render() so a shadowed method exports correctly.
const renderer = stage.renderer;
const size = new THREE.Vector2();

stage.render = function splitRender(): void {
  renderer.getSize(size);
  const w = Math.floor(size.x / 2);

  renderer.setScissorTest(false);
  renderer.autoClear = false;
  renderer.clear();

  renderer.setScissorTest(true);
  renderer.setViewport(0, 0, w, size.y);
  renderer.setScissor(0, 0, w, size.y);
  renderer.render(panelScene, panelCam);

  renderer.setViewport(w, 0, size.x - w, size.y);
  renderer.setScissor(w, 0, size.x - w, size.y);
  renderer.render(stage.scene, camera);

  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, size.x, size.y);

  renderer.clearDepth();
  renderer.render(hud, hudCam);
  renderer.autoClear = true;
};

// --- framing the room ----------------------------------------------------
// Solved once from the front, then the rock is applied as a rotation of
// the eye about the target, so the room never drifts out of its half.
const FRONT = new THREE.Vector3(0.1, 0.4, 1);
// The margin has to cover the rock as well as the box: the shot is solved
// square-on, and swinging the eye pushes the far wall toward the edge.
const base = frameBox(camera, u.boxes.room, FRONT, 1.16);
const ROCK = 0.11; // radians either side. Enough to read as a solid, not
//                    so much that a side wall goes edge-on.

stage.frame((t) => {
  const phase = stage.progress(t); // returning motion: no hold

  const rock = Math.sin(phase * Math.PI * 2) * ROCK;
  const eye = base.pos.clone().sub(base.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), rock);
  camera.position.copy(base.target).add(eye);
  camera.lookAt(base.target);

  // One stop per equal slice of the loop, and it STEPS. A cell is a
  // discrete thing and there is nothing between two of them to draw, so
  // easing the marker would claim a continuum the storage does not have.
  const stop = TOUR[Math.min(TOUR.length - 1, Math.floor(phase * TOUR.length))];
  const { lx, ly } = stopCell(stop);

  u.highlight(stop.chart, lx, ly);
  panel.highlight(stop.chart, lx, ly);
});

stage.start();
