/**
 * How much a light field actually is.
 *
 * Demo 2 showed the fiber over one pixel. This one gives every pixel its
 * own, at once — 1,575 of them fly in and shrink until each lands exactly
 * on the pixel it belongs to. And that is the whole argument: at rest a
 * tile is precisely its pixel's size, so the sheet has *become* a nested
 * grid, 8×8 cells inside every cell, in the same physical space. Sixty-
 * four times the numbers, not one millimetre more room.
 *
 * ## The camera pulls in as the tiles shrink
 *
 * If the tiles merely got small the beat would read as things receding.
 * Instead the camera closes in while they land, so the grid *grows*
 * underneath them and what you feel is subdivision. The net running off
 * the edges of frame is the point rather than a framing bug: the field
 * does not fit, and that is what it is like.
 *
 * ## Reading the dark
 *
 * Every fiber is drawn normal-outward — the light a pixel sends into the
 * room is the bright middle of its tile, the directions pointing into the
 * surface are the dark rim. So the field reads as bright lozenges on
 * dark, and the dark is not empty: on a wall those corner cells hold the
 * radiance leaving its *back*, which in a closed room is nothing. It is
 * stored either way. That is a real cost of keeping light on ray space,
 * and the demo shows it rather than cropping it out.
 *
 * ## Where it ends
 *
 * On the grid of grids. There is a collapse beat in the shader — each
 * tile fading to its own hemisphere mean, 100,800 cells becoming the
 * 1,575-pixel texture a diffuse scene really keeps — but resolving the
 * field back to a flat texture undoes the thing this demo just showed.
 * `COLLAPSE` turns it back on if a slide ever wants it.
 */

import * as THREE from 'three';
import { createStage } from '@';
import { applyShot, createUnwrap, frameBox, lerpShot, ramp, smootherstep } from '@/lightfield/unwrap';

const stage = createStage({ controls: false, lights: false });
stage.duration = 11;

const u = await createUnwrap(stage);
const camera = stage.camera as THREE.PerspectiveCamera;
u.setPeel(1); // opens on the sheets; the unfolding is demo 1

const COLLAPSE = false;
const HOLD = 0.8;
const RISE = 4.8;
const PAUSE = 1.4;
const COLLAPSE_TIME = 3.2;

const OVERHEAD = new THREE.Vector3(0, 1.0, 0.72);
const WIDE = frameBox(camera, u.boxes.net, OVERHEAD, 1.06);
// In close on the floor, with a margin so neighbouring sheets stay in
// frame at the edges — you should be able to see that it continues.
const CLOSE = (() => {
  const box = u.boxes.floor.clone();
  box.expandByScalar(5);
  return frameBox(camera, box, OVERHEAD, 1.0);
})();
applyShot(stage, WIDE);

stage.frame((t) => {
  const rise = smootherstep(ramp(t, HOLD, RISE));
  const collapse = COLLAPSE ? ramp(t, HOLD + RISE + PAUSE, COLLAPSE_TIME) : 0;
  u.setForest(rise, collapse);
  lerpShot(stage, WIDE, CLOSE, rise);
});

stage.start();
