/**
 * Storing a light field.
 *
 * The two tori of `state-space-discrete` are cut open and flattened, and what is
 * left is what a renderer actually holds: a stack of five rectangular arrays,
 * indexed by patch across and direction up.
 *
 * Five, not two. The box's boundary is four runs of patches with a corner
 * between each pair, and the corners carry no data, so cutting there loses
 * nothing and the ring comes apart into one array per wall — floor, right wall,
 * ceiling, left wall — with the object's beneath them. That is both the more
 * legible picture and the more honest one: sixteen units of strip one cell tall
 * is what a single array would be.
 *
 *   > A light field assigns a spectrum to every state — a point of Σ together
 *   > with a direction — and no computer holds that. So discretise the domain
 *   > and store values on it.
 *
 * ## The unroll is an isometry, twice
 *
 * The fiber goes first. Each circle of directions is cut at a **grazing**
 * direction, φ = −π/2, which is the underside of the tube, and its curvature is
 * taken to zero with the cut pinned — so the tube splits along its bottom and
 * peels upward into a ribbon standing on Σ. Cutting at grazing is what puts the
 * outgoing hemisphere ω·n > 0 in the bottom half of the finished array and the
 * incoming hemisphere in the top half, split by a straight line.
 *
 * Then the base. The accumulated turning of the boundary curve is scaled to zero
 * and the tangent re-integrated, so the corners of the box open out and the
 * object's sixteen facets unbend, with arclength preserved the whole way. The
 * corner fans carry no arclength, so they close up as this runs and take up no
 * columns at all: what they were was a picture of one circle drawn many times,
 * and the array holds it once.
 *
 * The camera comes back to square-on as the arrays flatten, which is where the
 * shot started three demos ago. The room is not here at all: it faded out at the
 * end of `state-space-discrete`, having said which room this is and been chopped
 * up, so the arrays have the frame to themselves.
 *
 * ## It stops at the empty arrays
 *
 * The cells keep the structural colouring they had as cells of a torus — the
 * patch's material, tinted by which hemisphere the bin is in. What is on screen
 * at the end is the *shape* of the store: five arrays, indexed by patch across
 * and direction up, and nothing in them yet.
 *
 * Filling them is the next demo's job. `state-space-room` puts the room beside
 * these arrays and writes them column by column, so that the light arriving in
 * the room is visibly the light that was just written down — which is a claim
 * worth its own slide, and one this demo cannot make on its own with no room in
 * the frame to check it against.
 */

import * as THREE from 'three';
import { createStage, createUI } from '@';
import {
  R_FIBER,
  NW,
  NDIR,
  ND,
  RX,
  RY,
  DISC,
  FAN_CELLS,
  boxBoundary,
  boxNearSegments,
  polygonBoundary,
  cellSheet,
  aimCamera,
  normalOf,
  POSE_FLAT,
  OBJ_RISE,
  type Boundary,
  type Pose,
} from '@/bundle2d';
import { PIGMENT, apothem } from '@/scene2d';

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
stage.duration = 18;

const ui = createUI(stage);

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

const boxCurve = boxBoundary(NW, FAN_CELLS);
const objCurve = polygonBoundary();

const boxCells = cellSheet(boxCurve, 0.13, boxNearSegments(NW, FAN_CELLS));
const objCells = cellSheet(objCurve);

// Each array is rigidly placed at the end, so each sheet gets its own frame to
// be moved in; the unrolling itself happens in the sheet's own coordinates.
const boxHolder = new THREE.Group();
const objHolder = new THREE.Group();
boxHolder.add(boxCells.mesh);
objHolder.add(objCells.mesh);
objHolder.renderOrder = 0;
boxHolder.renderOrder = 1;
stage.add(boxHolder, objHolder);

// ---------------------------------------------------------------------------
// Where the finished arrays go
// ---------------------------------------------------------------------------

/**
 * Five arrays, stacked.
 *
 * An array's width is its run's arclength and its height is 2πr, because both
 * unrollings are isometries — nothing here is scaled to taste. The box does not
 * become one strip sixteen units long: its boundary is four runs of patches with
 * a corner between each pair, and the corners hold no data, so it comes apart
 * into **four** arrays. With the object's, that is five, stacked in the order
 * the deck indexes patches — floor, right wall, ceiling, left wall, object.
 *
 * The rows are genuinely different widths, and they should be: the floor is 36
 * patches and the object is 16. Every cell in the stack is the same size.
 */
const FIBER_H = 2 * Math.PI * R_FIBER;
/** Gap between rows, as a fraction of a row's height. */
const ROW_GAP = 0.3;
const ROW_PITCH = FIBER_H * (1 + ROW_GAP);

/** Arclength of each wall run, in loop order, and of the object's loop. */
const WALL_W = [2 * RX, 2 * RY, 2 * RX, 2 * RY];
const OBJ_W = objCurve.length;

/** Where each run starts along the straightened box strip. */
const WALL_S: number[] = [];
{
  let acc = 0;
  for (const w of WALL_W) {
    WALL_S.push(acc);
    acc += w;
  }
}

const STACK_H = FIBER_H + 4 * ROW_PITCH;
const LAYOUT_SCALE = (2 * ORTHO_H * 0.93) / STACK_H;
/** Centre height of row r, r = 0..4, top to bottom. */
const rowY = (r: number) =>
  (STACK_H * LAYOUT_SCALE) / 2 - (FIBER_H * LAYOUT_SCALE) / 2 - r * ROW_PITCH * LAYOUT_SCALE;

/**
 * Per-panel offsets, in the sheet's own units: how far along the straightened
 * strip to slide the run back so it starts under row 0's start, and how far down
 * the ribbon direction to drop it into its row.
 *
 * Row 0 is anchored by the holder, so panel 0's offset is zero and the other
 * three are measured from it. Each row is centred on its own width, which is why
 * the along-strip term carries the half-width difference as well as the run's
 * own start.
 */
const boxPanels = new Float64Array(8);
for (let k = 0; k < 4; k++) {
  boxPanels[2 * k] = (WALL_W[0] - WALL_W[k]) / 2 - WALL_S[k];
  boxPanels[2 * k + 1] = -k * ROW_PITCH;
}

/** Rigid placement of a finished array: base along +x, fiber up, cut at the origin. */
function targetPose(b: Boundary, cx: number, cy: number, width: number, rise: number) {
  const th0 = b.nodes[0].th;
  const q = new THREE.Quaternion()
    .setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2)
    .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -th0));
  // The cut point at full unroll: the loop's start, dropped by the fiber radius
  // along ẑ from the height the bundle stands at — that is where the tube split.
  const q0 = new THREE.Vector3(b.nodes[0].x, b.nodes[0].y, rise - R_FIBER);
  const corner = new THREE.Vector3(
    cx - (width * LAYOUT_SCALE) / 2,
    cy - (FIBER_H * LAYOUT_SCALE) / 2,
    0,
  );
  return { q, q0, corner };
}

const boxTarget = targetPose(boxCurve, 0, rowY(0), WALL_W[0], 0);
const objTarget = targetPose(objCurve, 0, rowY(4), OBJ_W, OBJ_RISE);

const tmpQ = new THREE.Quaternion();
const tmpV = new THREE.Vector3();
const ident = new THREE.Quaternion();

/** Slide a sheet from where it stands in the room to its place in the layout. */
function placeHolder(
  holder: THREE.Group,
  t: { q: THREE.Quaternion; q0: THREE.Vector3; corner: THREE.Vector3 },
  lambda: number,
): void {
  const s = 1 + (LAYOUT_SCALE - 1) * lambda;
  tmpQ.copy(ident).slerp(t.q, lambda);
  holder.quaternion.copy(tmpQ);
  holder.scale.setScalar(s);
  // Keep the cut point on a straight line between where it is and where it goes,
  // so the motion is a rigid slide rather than a drift.
  tmpV.copy(t.q0).applyQuaternion(tmpQ).multiplyScalar(s);
  holder.position.set(
    t.q0.x + (t.corner.x - t.q0.x) * lambda - tmpV.x,
    t.q0.y + (t.corner.y - t.q0.y) * lambda - tmpV.y,
    (t.corner.z - t.q0.z) * lambda + t.q0.z - tmpV.z,
  );
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

const ease = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The angle `state-space-discrete` ends on. */
const ELEV_LOW = 32;
const ZOOM_LOW = 1.5;

const params = {
  run: true,
  open: 1,
  flatten: 1,
  split: 1,
  layout: 1,
  nearFade: 1,
};
ui.params.add(params, 'run').name('play the build');
ui.params.add(params, 'open', 0, 1, 0.001).name('fiber unroll (when held)');
ui.params.add(params, 'flatten', 0, 1, 0.001).name('base unroll (when held)');
ui.params.add(params, 'split', 0, 1, 0.001).name('split into rows (when held)');
ui.params.add(params, 'layout', 0, 1, 0.001).name('lay out (when held)');
ui.params.add(params, 'nearFade', 0.05, 1, 0.01).name('near arc opacity');

// Opens on the frame `state-space-discrete` ends on: lifted, standing off the
// plane, cells already drawn.
const pose: Pose = {
  ...POSE_FLAT,
  alpha: Math.PI / 2,
  panels: boxPanels,
};
/**
 * The object is one run, so it has no rows to come apart into — and it arrives
 * lifted clear of the box's torus, which is where `state-space` left it.
 */
const objPose: Pose = { ...pose, rise: OBJ_RISE, panels: null };
let poseKey = '';

stage.frame((t) => {
  const u = stage.duration > 0 ? Math.min(1, t / stage.duration) : 0;

  const open = params.run ? ease(0.07, 0.36, u) : params.open;
  const flatten = params.run ? ease(0.34, 0.66, u) : params.flatten;
  // The layout runs in step with the straightening, not after it: as the loop
  // opens out its width grows from about five units to sixteen, and if the
  // shrink lagged the unbending the strip would swing clear out of the frame
  // before being brought back.
  const lambda = params.run ? ease(0.33, 0.7, u) : params.layout;
  // The walls come apart *while* the ring is straightening, not after it. Run
  // late, the fully-unbent strip is sixteen units long — wider than the frame
  // even at the final scale — so it swings off both edges before folding into
  // rows. Overlapped, the corners opening and the runs falling into their rows
  // are one gesture, and nothing ever leaves the frame.
  const split = params.run ? ease(0.44, 0.74, u) : params.split;

  pose.open = open;
  pose.flatten = flatten;
  pose.split = split;
  objPose.open = open;
  objPose.flatten = flatten;
  const pkey = `${open.toFixed(4)}|${flatten.toFixed(4)}|${split.toFixed(4)}`;
  if (pkey !== poseKey) {
    poseKey = pkey;
    boxCells.update(pose);
    objCells.update(objPose);
  }

  placeHolder(boxHolder, boxTarget, lambda);
  placeHolder(objHolder, objTarget, lambda);

  // The ghosted near arc is only there to see past; once the ring has been cut
  // open there is nothing behind it, so it comes back to full strength.
  const near = params.nearFade + (1 - params.nearFade) * ease(0.1, 0.34, u);
  if (boxCells.nearMaterial) {
    boxCells.nearMaterial.opacity = near;
    boxCells.nearMaterial.depthWrite = near > 0.99;
  }

  aimCamera(
    stage.camera as THREE.OrthographicCamera,
    ELEV_LOW + (90 - ELEV_LOW) * lambda,
    ZOOM_LOW + (1 - ZOOM_LOW) * lambda,
  );
});

stage.start();
