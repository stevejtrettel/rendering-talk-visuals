/**
 * Chopping up the state space.
 *
 * `state-space` grew the two tori; this cuts them into cells. It is the move
 * Part VII opens with, and the geometry does the bookkeeping for us:
 *
 *   > X is a sphere bundle over the surfaces, so the four dimensions come
 *   > already split two and two — chop up the surfaces, chop up the sphere of
 *   > directions at each point.
 *
 * In the plane that is two and two becoming one and one: Σ is cut into the
 * deck's usual patches — sixteen flat facets on the object, thirty-six per wall
 * — and the circle of directions at each point into twelve bins. A cell of the
 * torus is one patch crossed with one bin, and that is a single stored value.
 *
 * ## The wipe
 *
 * The same generator circle that swept each torus out goes round a second time,
 * with cells behind it and the smooth surface still ahead of it. That is a wipe
 * rather than a cross-fade on purpose: two surfaces sitting in the same place
 * and fading through each other reads as a muddle, and at every instant here the
 * smooth part and the cell part are disjoint.
 *
 * **The room discretises because the torus does.** The flat drawing of Σ is
 * built from the same patch list the cells are, so wall patch i grows its seams
 * and facet j goes straight exactly when the circle passes segment i or j. The
 * object's torus is chopped first and the box's follows, which is also the order
 * the eye can follow — the object is the piece with sixteen countable facets.
 *
 * The circle stays a circle throughout: the object's smooth torus is built over
 * the circle and its cell torus over the 16-gon, and the two differ by at most
 * r(1 − cos(π/16)) ≈ 0.012, so the wipe front has nothing to hide.
 *
 * ## Continuity
 *
 * This opens on the frame `state-space` closes on — same camera, same fiber
 * radius, same ghosted near arc — so the two play as one shot. It plays once and
 * holds.
 */

import * as THREE from 'three';
import { createStage, createUI, C } from '@';
import { polyline, setPolyline } from '@/lines';
import {
  R_FIBER,
  NW,
  WALL,
  FAN_SMOOTH,
  FAN_CELLS,
  boxBoundary,
  boxNearSegments,
  circleBoundary,
  polygonBoundary,
  smoothSheet,
  cellSheet,
  fiberPoints,
  aimCamera,
  POSE_FLAT,
  OBJ_RISE,
  type Pose,
} from '@/bundle2d';

const ORTHO_H = 3;

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

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

const BOX_PER_WALL = 60;
const boxSmoothCurve = boxBoundary(BOX_PER_WALL, FAN_SMOOTH);
const discSmoothCurve = circleBoundary(168);
const boxCellCurve = boxBoundary(NW, FAN_CELLS);
const discCellCurve = polygonBoundary();

// No flat drawing of Σ at all: `state-space` lifts the circles off it and lets
// it go, and it never comes back. The wipe here converts only the tori.

const boxSmooth = smoothSheet(boxSmoothCurve, 56, boxNearSegments(BOX_PER_WALL, FAN_SMOOTH));
const discSmooth = smoothSheet(discSmoothCurve, 56);
const boxCells = cellSheet(boxCellCurve, 0.13, boxNearSegments(NW, FAN_CELLS));
const discCells = cellSheet(discCellCurve);
stage.add(boxSmooth.mesh, discSmooth.mesh, boxCells.mesh, discCells.mesh);

// The object's torus is inside the ring, so it is drawn before the near arc of
// the box's that will be ghosted over it.
discSmooth.mesh.renderOrder = 0;
discCells.mesh.renderOrder = 0;
boxSmooth.mesh.renderOrder = 1;
boxCells.mesh.renderOrder = 1;

// ---------------------------------------------------------------------------
// The generator circles
// ---------------------------------------------------------------------------

const GEN_SEGS = 96;
const blank: [number, number, number][] = Array.from({ length: GEN_SEGS + 1 }, () => [0, 0, 0]);
const boxGen = polyline(blank, { color: C.bone, width: 3.5 });
const discGen = polyline(blank, { color: C.bone, width: 3.5 });
boxGen.renderOrder = 6;
discGen.renderOrder = 6;
stage.add(boxGen, discGen);

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

const ease = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The angle `state-space` ends on. */
const ELEV = 32;
const ZOOM = 1.5;

const params = {
  run: true,
  wipeObject: 1,
  wipeBox: 1,
  radius: R_FIBER,
  elevation: ELEV,
  nearFade: 1,
};
ui.params.add(params, 'run').name('play the build');
ui.params.add(params, 'wipeObject', 0, 1, 0.001).name('object wipe (when held)');
ui.params.add(params, 'wipeBox', 0, 1, 0.001).name('box wipe (when held)');
ui.params.add(params, 'radius', 0.08, 0.6, 0.01).name('fiber radius');
ui.params.add(params, 'elevation', 8, 90, 1).name('elevation');
ui.params.add(params, 'nearFade', 0.05, 1, 0.01).name('near arc opacity');

// The tori arrive already lifted and standing off the plane — this demo opens
// on the frame `state-space` ends on.
const pose: Pose = { ...POSE_FLAT, alpha: Math.PI / 2 };
/** The object's torus arrives lifted clear of the box's — see OBJ_RISE. */
const objPose: Pose = { ...POSE_FLAT, alpha: Math.PI / 2, rise: OBJ_RISE };
let lastRadius = -1;

stage.frame((t) => {
  const u = stage.duration > 0 ? Math.min(1, t / stage.duration) : 0;

  // The object first, then the box: sixteen facets are what the eye can count,
  // and the walls follow once the idea has landed. It also keeps the opening of
  // the wipe off the ghosted near arc, where cells would be hard to read.
  const fObj = params.run ? ease(0.1, 0.46, u) : params.wipeObject;
  const fBox = params.run ? ease(0.32, 0.88, u) : params.wipeBox;

  aimCamera(stage.camera as THREE.OrthographicCamera, params.elevation, ZOOM);

  pose.radius = params.radius;
  objPose.radius = params.radius;
  if (params.radius !== lastRadius) {
    lastRadius = params.radius;
    boxSmooth.update(pose);
    discSmooth.update(objPose);
    boxCells.update(pose);
    discCells.update(objPose);
  }

  // Cells behind the generator, smooth surface ahead of it.
  boxCells.revealRange(0, fBox);
  boxSmooth.revealRange(fBox, 1);
  discCells.revealRange(0, fObj);
  discSmooth.revealRange(fObj, 1);

  const genFor = (f: number, a: number, b: number) =>
    ease(a, a + 0.04, u) * (1 - ease(b - 0.05, b, u)) * (params.run ? 1 : f > 0 && f < 1 ? 1 : 0);
  const pairs = [
    [boxGen, boxCellCurve, fBox, genFor(fBox, 0.3, 0.9)],
    [discGen, discCellCurve, fObj, genFor(fObj, 0.08, 0.48)],
  ] as const;
  for (const [line, curve, f, alpha] of pairs) {
    const m = line.material as THREE.Material & { opacity: number };
    m.opacity = alpha;
    m.transparent = true;
    line.visible = alpha > 0.01;
    if (line.visible) setPolyline(line, fiberPoints(curve, Math.min(f, 0.9999), curve === discCellCurve ? objPose : pose, GEN_SEGS));
  }

  // Solid, since the object's torus is lifted clear of the ring and there is
  // nothing behind the near arc to see. Depth writing follows the opacity.
  for (const m of [boxSmooth.nearMaterial, boxCells.nearMaterial]) {
    if (!m) continue;
    m.opacity = params.nearFade;
    m.depthWrite = params.nearFade > 0.99;
  }
});

stage.start();
