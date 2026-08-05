/**
 * From the Cornell box to the room we actually work in.
 *
 * A 3D Cornell box sits on the left. A copy lifts out of it, turns to face the
 * viewer, and has its depth squeezed out of it — and what is left, on the
 * right, is the 2D room every other demo in the deck is set in.
 *
 * ## The copy is the real room, not a picture of one
 *
 * The whole demo is built from one call to `room()` in `src/scene2d.ts`. The 3D
 * box is that room *extruded* in z: interior half-extents `rx` and `ry`, wall
 * slabs of thickness `wall`, the sphere centred on `disc` with radius `disc.r`,
 * the ceiling panel spanning `emitHalf`. So the box's cross-section at z = 0 is
 * not merely similar to the 2D room — it is the same numbers, and the flat copy
 * that lands on the right is drawn from the same `room()` too. The claim the
 * animation makes ("that is where the 2D room comes from") is one the code
 * actually honours.
 *
 * ## Why the camera is orthographic
 *
 * Every 2D demo in the deck is drawn orthographically. Under perspective, a
 * flattened copy would land foreshortened — a trapezoid, not the room. With an
 * ortho camera, "collapse z and face the viewer" produces exactly the picture
 * `radiance-2d` and `fixed-point` are drawn in, so the end of this animation is
 * the start of those. The 3D box reads as an axonometric drawing, which is the
 * right register for a diagram anyway.
 *
 * ## What the flattening does to each wall
 *
 * Four of the box's walls have a 2D counterpart and squash straight onto it:
 * floor, ceiling, left, right. The back wall does not — 2D has no depth for it
 * to bound — so it fades out as the collapse begins rather than smearing across
 * the room. The front is open throughout, which is how a Cornell box is always
 * shown and is what lets you see in.
 *
 * ## Choices worth naming
 *
 * - The box is lit by the deck's standard three-point rig, *not* by its own
 *   ceiling panel. This demo is about where the geometry comes from; the
 *   transport demos are where the light in the ceiling does any work.
 * - The ceiling panel is inset just below the ceiling slab rather than cut into
 *   it. Its cross-section is still the emitting strip `patches()` describes; a
 *   boolean cut would be four more meshes for the same picture.
 * - The lit copy cross-fades into the flat diagram over the last of the
 *   collapse. At that moment both are the same flat silhouette in the same
 *   plane, so the swap has nothing to hide — it is the moment the scene stops
 *   being a body and becomes a drawing.
 */

import * as THREE from 'three';
import { createStage, createUI, C, flat, matte, glossy, glow } from '@';
import { polyline } from '@/lines';
import { room } from '@/scene2d';

// ---------------------------------------------------------------------------
// Stage
// ---------------------------------------------------------------------------

const ORTHO_H = 3;

const stage = createStage({
  camera: 'ortho',
  position: [0, 0, 40],
  target: [0, 0, 0],
  orthoHeight: ORTHO_H,
  controls: false,
});
stage.duration = 15;
/** Seconds parked on the finished side-by-side, which is what the slide sits on. */
const HOLD = 3.4;

const ui = createUI(stage);

// ---------------------------------------------------------------------------
// The room, once
// ---------------------------------------------------------------------------

// Sized so the axonometric box and the flat room sit side by side with air
// around both: the box projects wider than its cross-section, since its depth
// leans into screen x as well as y.
const R = room(1.62);
const RX = R.rx;
const RY = R.ry;
/** Depth. A square footprint, like the real Cornell box. */
const RZ = R.rx;
const W = R.wall;
const EMIT = R.emitHalf;

/** Where each half ends up. */
const BOX_X = -2.55;
const FLAT_X = 2.6;

/** The axonometric the box is drawn in, and holds throughout. */
const YAW = (27 * Math.PI) / 180;
const PITCH = (15 * Math.PI) / 180;

// ---------------------------------------------------------------------------
// Building the box
// ---------------------------------------------------------------------------

/** An axis-aligned slab from one corner to the other. */
function slab(
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  mat: THREE.Material,
): THREE.Mesh {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return new THREE.Mesh(g, mat);
}

/** Deep tone for the ceiling — off the palette, since bone has no Deep. */
const BONE_DEEP = 0x2a2a26;

interface Box {
  group: THREE.Group;
  /** The pieces with a 2D counterpart: they squash onto it. */
  keep: THREE.Mesh[];
  /**
   * The pieces that exist only because the box has depth, and so have nowhere
   * to land: the back wall, and the strips of ceiling in front of and behind
   * the light panel. Left in, they would smear across the room as it collapses
   * — the ceiling strips would close over the light, which in 2D *is* the
   * ceiling wherever it emits. They fade out as the depth goes instead.
   */
  depthOnly: THREE.Mesh[];
}

/** A material and the opacity it sits at when fully faded in. */
interface Faded {
  m: THREE.Material & { opacity: number };
  base: number;
}

/**
 * The Cornell box: five walls, an object on the floor, a panel in the ceiling.
 *
 * The slab extents are written so that setting z = 0 in every one of them
 * reproduces `buildRoom`'s layout exactly — floor from -RX-W to RX+W across and
 * -RY-W to -RY up, and so on around the room.
 */
function buildBox(): Box {
  const group = new THREE.Group();
  const keep: THREE.Mesh[] = [];
  const depthOnly: THREE.Mesh[] = [];

  const add = (m: THREE.Mesh) => {
    group.add(m);
    keep.push(m);
    return m;
  };
  const addDepthOnly = (m: THREE.Mesh) => {
    group.add(m);
    depthOnly.push(m);
    return m;
  };

  // The four walls that survive the flattening.
  add(slab(-RX - W, -RY - W, -RZ - W, RX + W, -RY, RZ + W, matte(C.moss)));
  add(slab(-RX - W, -RY, -RZ - W, -RX, RY, RZ + W, matte(C.rust)));
  add(slab(RX, -RY, -RZ - W, RX + W, RY, RZ + W, matte(C.slate)));

  // The ceiling, in four pieces around a rectangular opening. An inset panel
  // would have been one mesh, but the view looks *down* into the room through
  // its open front — the ceiling's underside is never visible, so a light stuck
  // to it could not be seen at all, and the one thing everybody recognises a
  // Cornell box by would be missing. Set into an opening, the panel reads as a
  // light fixture from above as well as below.
  const ceil = matte(C.ash);
  add(slab(-RX - W, RY, -RZ - W, -EMIT, RY + W, RZ + W, ceil));
  add(slab(EMIT, RY, -RZ - W, RX + W, RY + W, RZ + W, ceil));
  // The strips bridging the opening front and back are depth-only: at z = 0
  // there is no ceiling over the light, there *is* light.
  addDepthOnly(slab(-EMIT, RY, -RZ - W, EMIT, RY + W, -EMIT, ceil));
  addDepthOnly(slab(-EMIT, RY, EMIT, EMIT, RY + W, RZ + W, ceil));

  // The wall with no 2D counterpart at all.
  addDepthOnly(slab(-RX - W, -RY, -RZ - W, RX + W, RY, -RZ, matte(C.ash)));

  // The object, resting on the floor. Centred on z = 0, so the cross-section
  // through it is a great circle — the 2D room's disc at full radius, not a
  // shrunken chord.
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(R.disc.r, 48, 32),
    glossy(C.blue),
  );
  ball.position.set(R.disc.x, R.disc.y, 0);
  add(ball);

  // The panel filling that opening, hanging a little proud of the ceiling's
  // inner face so it glows into the room as well as reading from above.
  add(slab(-EMIT, RY - 0.03, -EMIT, EMIT, RY + W, EMIT, glow(C.ochre, 1.4)));

  return { group, keep, depthOnly };
}

// ---------------------------------------------------------------------------
// Building the flat room
// ---------------------------------------------------------------------------

/** A flat rectangle in the z = 0 plane. */
function rect(x0: number, y0: number, x1: number, y1: number, color: number, z: number) {
  const g = new THREE.PlaneGeometry(x1 - x0, y1 - y0);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, z);
  return new THREE.Mesh(g, flat(color));
}

/**
 * The 2D room, in the deck's usual language: wall slabs in the deep tones with
 * a bright line along the inner face, a filled disc with a bright rim, and the
 * emitting stretch of ceiling in ochre.
 *
 * Same numbers as the box above, so this is what the box's cross-section looks
 * like once it is drawn as a diagram rather than lit as a body.
 */
function buildFlat(): { group: THREE.Group; mats: Faded[] } {
  const group = new THREE.Group();
  const mats: Faded[] = [];

  const add = (o: THREE.Mesh | ReturnType<typeof polyline>, base = 1) => {
    group.add(o);
    const m = o.material as THREE.Material & { opacity: number };
    m.transparent = true;
    m.depthWrite = false;
    m.opacity = base;
    mats.push({ m, base });
  };

  const line = (pts: [number, number, number][], color: number) =>
    add(polyline(pts, { color, width: 5 }));

  // Walls: slab, then the lit inner edge.
  add(rect(-RX - W, -RY - W, RX + W, -RY, C.mossDeep, 0));
  line([[-RX, -RY, 0.01], [RX, -RY, 0.01]], C.moss);

  add(rect(-RX - W, -RY, -RX, RY, C.rustDeep, 0));
  line([[-RX, -RY, 0.01], [-RX, RY, 0.01]], C.rust);

  add(rect(RX, -RY, RX + W, RY, C.slateDeep, 0));
  line([[RX, -RY, 0.01], [RX, RY, 0.01]], C.slate);

  add(rect(-RX - W, RY, RX + W, RY + W, BONE_DEEP, 0));
  line([[-RX, RY, 0.01], [RX, RY, 0.01]], C.ash);

  // The emitting stretch of ceiling: the same span of the same slab, in ochre.
  // No painted glow underneath it — stacked translucent rectangles read as
  // stacked rectangles, and the demos that care about the light leaving this
  // strip compute what it does rather than illustrating it.
  add(rect(-EMIT, RY, EMIT, RY + W, C.ochre, 0.005));
  line([[-EMIT, RY, 0.02], [EMIT, RY, 0.02]], C.ochre);

  // The object.
  const disc = new THREE.Mesh(new THREE.CircleGeometry(R.disc.r, 96), flat(C.blueDeep));
  disc.position.set(R.disc.x, R.disc.y, 0.02);
  add(disc);
  const rim: [number, number, number][] = [];
  for (let i = 0; i <= 128; i++) {
    const a = (Math.PI * 2 * i) / 128;
    rim.push([R.disc.x + R.disc.r * Math.cos(a), R.disc.y + R.disc.r * Math.sin(a), 0.03]);
  }
  add(polyline(rim, { color: C.blue, width: 4 }));

  return { group, mats };
}

// ---------------------------------------------------------------------------
// The three pieces in the scene
// ---------------------------------------------------------------------------

// The original, which stays a body and slides left.
const original = buildBox();
stage.add(original.group);

// The copy, which turns, flattens, and becomes a drawing. Its own materials, so
// it can fade without taking the original with it.
const ghost = buildBox();

/** Give a mesh its own fadeable material and return it. */
function ownMaterial(m: THREE.Mesh): THREE.Material & { opacity: number } {
  const mat = (m.material as THREE.Material).clone() as THREE.Material & { opacity: number };
  mat.transparent = true;
  m.material = mat;
  return mat;
}

const ghostMats: Faded[] = ghost.keep.map((m) => ({ m: ownMaterial(m), base: 1 }));
const depthMats: Faded[] = ghost.depthOnly.map((m) => ({ m: ownMaterial(m), base: 1 }));

const flatRoom = buildFlat();
flatRoom.group.renderOrder = 5;

// One group carries where the copy is and which way it faces; the ghost inside
// it carries the collapse, so the depth is squeezed out along the *room's* own
// z axis rather than the world's.
const copy = new THREE.Group();
copy.add(ghost.group);
copy.add(flatRoom.group);
stage.add(copy);

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

const params = {
  run: true,
  step: 0.5,
  yaw: 27,
  pitch: 15,
};
ui.params.add(params, 'run').name('run');
ui.params.add(params, 'step', 0, 1, 0.001).name('step (when not running)');
ui.params.add(params, 'yaw', -60, 60, 1).name('box yaw');
ui.params.add(params, 'pitch', -40, 40, 1).name('box pitch');

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

const ease = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const AXIS_Y = new THREE.Vector3(0, 1, 0);
const AXIS_X = new THREE.Vector3(1, 0, 0);
const qYaw = new THREE.Quaternion();
const qPitch = new THREE.Quaternion();

/** Yaw about world Y, then pitch about world X — a fixed-camera axonometric. */
function orient(o: THREE.Object3D, yaw: number, pitch: number): void {
  qYaw.setFromAxisAngle(AXIS_Y, yaw);
  qPitch.setFromAxisAngle(AXIS_X, pitch);
  o.quaternion.copy(qPitch).multiply(qYaw);
}

function setOpacity(mats: Faded[], v: number): void {
  for (const f of mats) f.m.opacity = f.base * v;
}

stage.frame((t) => {
  const u = params.run ? stage.progress(t, HOLD) : params.step;

  const yaw = (params.yaw * Math.PI) / 180;
  const pitch = (params.pitch * Math.PI) / 180;

  // The copy separates, travels, turns square-on and loses its depth. The turn
  // leads the collapse a little: a box that flattens while still angled reads
  // as being crushed, where one that squares up first reads as being *seen*
  // flat, which is the claim.
  // Three beats, deliberately sequential: a copy slides clear, it turns to face
  // you, its depth is squeezed out. Overlapping the slide with the turn read as
  // one room passing through the other — at half separation the two boxes are
  // wider than the gap between them, and the copy's near wall cuts through the
  // original's interior. Letting the slide finish first costs a second and
  // makes each beat a separate, legible claim.
  const travel = ease(0.12, 0.46, u);
  const emerge = ease(0.14, 0.28, u);
  const turn = ease(0.48, 0.68, u);
  const collapse = ease(0.6, 0.8, u);
  const depthGone = ease(0.56, 0.74, u);
  const become = ease(0.78, 0.9, u);

  // The original slides left out of the copy's way.
  original.group.position.x = BOX_X * travel;
  orient(original.group, yaw, pitch);

  copy.position.x = FLAT_X * travel;
  // Lifted toward the camera as it emerges. Under an orthographic camera this
  // changes nothing about where it is drawn — only that it is drawn in front,
  // which is what stops the copy z-fighting the original it is still sitting
  // inside during the first moments of the separation.
  copy.position.z = 3 * emerge;
  orient(copy, yaw * (1 - turn), pitch * (1 - turn));

  ghost.group.scale.z = Math.max(1 - collapse, 1e-3);

  // Fades. The ghost is solid while it is a body, and hands over only once it
  // is flat and facing us. The back wall goes early and separately: it is the
  // one piece with nowhere to land.
  setOpacity(ghostMats, emerge * (1 - become));
  setOpacity(depthMats, emerge * (1 - become) * (1 - depthGone));
  for (const m of ghost.depthOnly) m.visible = depthGone < 0.999;
  ghost.group.visible = emerge > 0.001 && become < 0.999;

  setOpacity(flatRoom.mats, become);
  flatRoom.group.visible = become > 0.001;
});

stage.start();
