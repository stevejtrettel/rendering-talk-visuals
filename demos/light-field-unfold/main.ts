/**
 * A room's stored light, unfolded into the textures it is kept in.
 *
 * A Cornell-ish room sits fully lit — and the light on its walls is not a
 * shading model, it is a *baked light field*: the equilibrium radiance
 * L* = (I−K)⁻¹E, solved once on the GPU in the `light-field` repo and
 * loaded here as data. Then the room comes apart. The walls hinge open,
 * the cube unfolds like cardboard, the sphere opens octahedrally, and
 * what is left is the set of flat textures the light actually lives in.
 *
 * ## The unfolding is real, not staged
 *
 * The net is DERIVED, never designed. Every chart hangs off a parent by
 * the edge they physically share, and flattening means rotating each
 * child about that shared edge until its normal matches its parent's. So
 * the first frame reconstructs the actual baked scene rather than
 * approximating it, and the final arrangement — floor at the centre, red
 * and green walls hinged off its sides, back wall up with the ceiling
 * folded above — is whatever that room unfolds into. Placing sheets by
 * hand and animating toward them could only ever approximate the room it
 * claims to come from.
 *
 * ## A pixel never changes size
 *
 * Everything is drawn in TEXEL units: one atlas texel is one world unit
 * in the room and one world unit in the net. So the peel moves pixels and
 * never resizes them. That is what makes the animation a claim about
 * storage — the light is attached to the surface, and the surface is
 * merely moving — rather than a dissolve between two pictures.
 *
 * ## Why it opens close
 *
 * The first shot is tight on the sphere and cube, where the texels are
 * big enough to read as pixels before anything moves, and the colour
 * bleeding is plainly visible (red floor by the red wall, green light on
 * the cube's right face). The camera then pulls back through the whole
 * room and out to the net, so the widening IS the unfolding.
 *
 * The sphere cannot hinge, and that is the point: its chart IS the
 * octahedral map, so its surface unfolds by exactly the map each pixel's
 * own directional tile unfolds by, one level up. Demo 2 spends that map
 * again at the smaller scale.
 */

import * as THREE from 'three';
import { createStage, createUI } from '@';
import { createUnwrap, frameBox, lerpShot, ramp, smootherstep, type Shot } from '@/lightfield/unwrap';

const stage = createStage({ controls: false, lights: false });
stage.duration = 11;

// This demo drives its own camera and has nothing to tweak, but it still wants
// the Capture panel: without `createUI` there is no render button and no `V`,
// so the only way to get a file out is a screen recording.
createUI(stage);

const u = await createUnwrap(stage);
const camera = stage.camera as THREE.PerspectiveCamera;

const HOLD = 1.6; // on the room, before anything moves
const PEEL = 6.0;

// Three shots, not two. Opening tight makes the texels read as pixels
// before the motion starts; the whole room arrives as the peel begins;
// the net is where it lands. A single room→net move either opens too wide
// or ends too close.
const FRONT = new THREE.Vector3(0.12, 0.42, 1);
const SHOTS: { at: number; shot: Shot }[] = [
  { at: 0.0, shot: frameBox(camera, u.boxes.close, FRONT, 1.0) },
  { at: 0.28, shot: frameBox(camera, u.boxes.room, FRONT, 1.0) },
  { at: 1.0, shot: frameBox(camera, u.boxes.net, new THREE.Vector3(0, 1.0, 0.72), 1.06) },
];

stage.frame((t) => {
  const peel = smootherstep(ramp(t, HOLD, PEEL));
  u.setPeel(peel);

  let k = 0;
  while (k < SHOTS.length - 2 && peel > SHOTS[k + 1].at) k++;
  const a = SHOTS[k];
  const b = SHOTS[k + 1];
  lerpShot(stage, a.shot, b.shot, smootherstep((peel - a.at) / (b.at - a.at)));
});

stage.start();
