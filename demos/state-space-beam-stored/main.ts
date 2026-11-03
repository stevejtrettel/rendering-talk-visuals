/**
 * Storing the beam room's light field: the bundle chopped into cells and
 * unrolled into the grids a renderer keeps.
 *
 * Opens on the frame `state-space-beam` ends on: a torus over the walls and a
 * cylinder over each mirror, coloured by what each piece is made of. Then, as
 * `state-space-discrete` and `state-space-stored` do for the ball room:
 *
 * 1. **Chopped into cells.** A wipe round each piece replaces the smooth surface
 *    by cells: a patch of boundary × a bin of directions (NDIR bins round the
 *    circle). A cell is where one stored value would go; this demo draws the
 *    domain, not values, so a cell is coloured by its piece's material.
 * 2. **Cut open and flattened.** Each fiber is cut at a grazing direction and
 *    unrolled, the walls' loop is cut at the middle of each rounded corner and
 *    straightened, and the pieces are laid out flat: four wall grids on the
 *    left (floor, right wall, ceiling, left wall), the two mirrors' on the right
 *    (flat, curved). Position along the surface across, direction up. Both
 *    unrollings are isometries, so every cell is the same size and a grid's
 *    width is its piece's length.
 * 3. **Only the outgoing half is kept on the walls.** The bottom half of each
 *    grid is the directions pointing out of the surface; on a wall the top half
 *    points into the wall, holds nothing, and goes. A mirror keeps both halves:
 *    the bottom is its front's outgoing light, the top its back's.
 *
 * What is on screen at the end is the shape of the store: one grid per piece
 * of boundary, indexed by patch across and direction up, and nothing in them
 * yet (Steve, 2026-10-30: "we are just trying to show the domain of a
 * discretized light field map").
 *
 * The animation plays once and holds.
 */

import * as THREE from 'three';
import { createStage, createUI } from '@';
import { smoothSheet, cellSheet, aimCamera, shade, NDIR, POSE_FLAT, type Pose, type Boundary, type Sheet } from '@/bundle2d';
import { R_FIBER, MIRROR_RISE, WALL_W, wallBoundary, mirrorBoundary, mirrorLength, colourOver } from '@/beambundle';

const ORTHO_H = 3;
const stage = createStage({ camera: 'ortho', position: [0, 0, 10], target: [0, 0, 0], orthoHeight: ORTHO_H, lights: false, controls: false });
stage.duration = 20;
const ui = createUI(stage);

// --- The smooth bundle, as `state-space-beam` leaves it ------------------------------------
const smoothB = [wallBoundary(0.04), mirrorBoundary('flat', 40), mirrorBoundary('arc', 40)];
const FIBER = 56;
const smooth = smoothB.map((b) => smoothSheet(b, FIBER));
const smoothVals = smoothB.map((b, i) => colourOver(b, FIBER, { mid: false, off: 0, wall: i === 0 }));

// --- The cells --------------------------------------------------------------------------
const CELL = 0.08;
const cellB: Boundary[] = [
  wallBoundary(CELL),
  mirrorBoundary('flat', Math.round(mirrorLength('flat') / CELL)),
  mirrorBoundary('arc', Math.round(mirrorLength('arc') / CELL)),
];
const cells = cellB.map((b) => cellSheet(b, 0.13));
const cellVals = cellB.map((b, i) => colourOver(b, NDIR, { mid: true, off: 0.5, wall: i === 0 }));

// Each piece is rigidly placed at the end, so each gets its own frame to move in.
const holders = [0, 1, 2].map((i) => {
  const h = new THREE.Group();
  h.add(smooth[i]!.mesh, cells[i]!.mesh);
  stage.add(h);
  return h;
});

/** Colour a smooth sheet by its material, with `amt` of the baked shading. */
function paintSmooth(s: Sheet, values: Float32Array, amt: number): void {
  const geom = s.mesh.geometry as THREE.BufferGeometry;
  const col = geom.attributes.color!.array as Float32Array;
  const nrm = geom.attributes.normal!.array as Float32Array;
  for (let o = 0; o < col.length; o += 3) {
    const lit = 1 + (shade(nrm[o]!, nrm[o + 1]!, nrm[o + 2]!) - 1) * amt;
    col[o] = values[o]! * lit;
    col[o + 1] = values[o + 1]! * lit;
    col[o + 2] = values[o + 2]! * lit;
  }
  geom.attributes.color!.needsUpdate = true;
}

/**
 * Colour a cell sheet: each cell its piece's material, with `amt` of the shading.
 * On the walls the unstored bins (the top half once unrolled) fade by `drop`.
 */
function paintCells(s: Sheet, b: Boundary, values: Float32Array, amt: number, wall: boolean, drop: number): void {
  const geom = s.mesh.geometry as THREE.BufferGeometry;
  const col = geom.attributes.color!.array as Float32Array;
  const nrm = geom.attributes.normal!.array as Float32Array;
  const N = b.nodes.length;
  for (let i = 0; i < N; i++) {
    for (let k = 0; k < NDIR; k++) {
      const q = (i * NDIR + k) * 12;
      const d = (b.segCell[i]! * NDIR + k) * 3;
      const lit = 1 + (shade(nrm[q]!, nrm[q + 1]!, nrm[q + 2]!) - 1) * amt;
      const out = wall && Math.cos(-Math.PI / 2 + (2 * Math.PI * (k + 0.5)) / NDIR) <= 0 ? 1 - drop : 1;
      for (let vv = 0; vv < 4; vv++) {
        col[q + vv * 3] = values[d]! * lit * out;
        col[q + vv * 3 + 1] = values[d + 1]! * lit * out;
        col[q + vv * 3 + 2] = values[d + 2]! * lit * out;
      }
    }
  }
  geom.attributes.color!.needsUpdate = true;
}

// --- Where the finished grids go --------------------------------------------------------------
const FIBER_H = 2 * Math.PI * R_FIBER;
const ROW_PITCH = FIBER_H * 1.3;
const STACK_H = FIBER_H + 3 * ROW_PITCH;
const LAYOUT_SCALE = (2 * ORTHO_H * 0.86) / STACK_H;
const rowY = (r: number) => (STACK_H * LAYOUT_SCALE) / 2 - (FIBER_H * LAYOUT_SCALE) / 2 - r * ROW_PITCH * LAYOUT_SCALE;
const WALL_X = -1.45;
const MIRROR_X = 3.35;

/** The four wall panels slide along the straightened strip and drop into their rows. */
const WALL_S: number[] = [];
{
  let acc = 0;
  for (const w of WALL_W) {
    WALL_S.push(acc);
    acc += w;
  }
}
const wallPanels = new Float64Array(8);
for (let k = 0; k < 4; k++) {
  wallPanels[2 * k] = (WALL_W[0]! - WALL_W[k]!) / 2 - WALL_S[k]!;
  wallPanels[2 * k + 1] = -k * ROW_PITCH;
}

/** Rigid placement of a finished grid: base along +x, fiber up, cut at the origin. */
function targetPose(b: Boundary, cx: number, cy: number, width: number, rise: number) {
  const th0 = b.nodes[0]!.th;
  const q = new THREE.Quaternion()
    .setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2)
    .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -th0));
  const q0 = new THREE.Vector3(b.nodes[0]!.x, b.nodes[0]!.y, rise - R_FIBER);
  const corner = new THREE.Vector3(cx - (width * LAYOUT_SCALE) / 2, cy - (FIBER_H * LAYOUT_SCALE) / 2, 0);
  return { q, q0, corner };
}
const targets = [
  targetPose(cellB[0]!, WALL_X, rowY(0), WALL_W[0]!, 0),
  targetPose(cellB[1]!, MIRROR_X, rowY(1), mirrorLength('flat'), MIRROR_RISE),
  targetPose(cellB[2]!, MIRROR_X, rowY(2), mirrorLength('arc'), MIRROR_RISE),
];

const tmpQ = new THREE.Quaternion();
const tmpV = new THREE.Vector3();
const ident = new THREE.Quaternion();
function placeHolder(holder: THREE.Group, t: { q: THREE.Quaternion; q0: THREE.Vector3; corner: THREE.Vector3 }, lambda: number): void {
  const s = 1 + (LAYOUT_SCALE - 1) * lambda;
  tmpQ.copy(ident).slerp(t.q, lambda);
  holder.quaternion.copy(tmpQ);
  holder.scale.setScalar(s);
  tmpV.copy(t.q0).applyQuaternion(tmpQ).multiplyScalar(s);
  holder.position.set(
    t.q0.x + (t.corner.x - t.q0.x) * lambda - tmpV.x,
    t.q0.y + (t.corner.y - t.q0.y) * lambda - tmpV.y,
    (t.corner.z - t.q0.z) * lambda + t.q0.z - tmpV.z,
  );
}

// --- Timeline -----------------------------------------------------------------------------
const ease = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const ELEV_LOW = 32;
const ZOOM_LOW = 1.3;

const params = { run: true, chop: 1, open: 1, flatten: 1, split: 1, layout: 1, drop: 1 };
ui.params.add(params, 'run').name('play the build');
ui.params.add(params, 'chop', 0, 1, 0.001).name('chop into cells (when held)');
ui.params.add(params, 'open', 0, 1, 0.001).name('fiber unroll (when held)');
ui.params.add(params, 'flatten', 0, 1, 0.001).name('base unroll (when held)');
ui.params.add(params, 'split', 0, 1, 0.001).name('split into rows (when held)');
ui.params.add(params, 'layout', 0, 1, 0.001).name('lay out (when held)');
ui.params.add(params, 'drop', 0, 1, 0.001).name('drop unstored half (when held)');

const poses: Pose[] = [
  { ...POSE_FLAT, alpha: Math.PI / 2, radius: R_FIBER, panels: wallPanels },
  { ...POSE_FLAT, alpha: Math.PI / 2, radius: R_FIBER, rise: MIRROR_RISE },
  { ...POSE_FLAT, alpha: Math.PI / 2, radius: R_FIBER, rise: MIRROR_RISE },
];
smooth.forEach((s, i) => {
  s.update(poses[i]!);
  paintSmooth(s, smoothVals[i]!, 1);
});

/** A mirror is open: its closing segment (last node back to the first) is never drawn. */
const span = (s: Sheet, i: number, a: number, b: number) => {
  const f = i === 0 ? 1 : (s.boundary.nodes.length - 1) / s.boundary.nodes.length;
  s.revealRange(a * f, b * f);
};

let key = '';
stage.frame((t) => {
  const u = stage.duration > 0 ? Math.min(1, t / stage.duration) : 0;
  const chop = params.run ? ease(0.04, 0.24, u) : params.chop;
  const open = params.run ? ease(0.28, 0.48, u) : params.open;
  const flatten = params.run ? ease(0.46, 0.7, u) : params.flatten;
  const lambda = params.run ? ease(0.45, 0.74, u) : params.layout;
  const split = params.run ? ease(0.52, 0.76, u) : params.split;
  const drop = params.run ? ease(0.8, 0.9, u) : params.drop;
  // The shading gives the tubes their form; the flat grids show the values as they are.
  const amt = 1 - ease(0.3, 0.6, params.run ? u : open);

  // The wipe: cells behind it, the smooth surface still ahead of it.
  smooth.forEach((s, i) => span(s, i, chop, 1));
  cells.forEach((s, i) => span(s, i, 0, chop));
  smooth.forEach((s) => (s.mesh.visible = chop < 1));

  const k = `${open.toFixed(4)}|${flatten.toFixed(4)}|${split.toFixed(4)}|${drop.toFixed(3)}|${amt.toFixed(3)}`;
  if (k !== key) {
    key = k;
    poses.forEach((p, i) => {
      p.open = open;
      p.flatten = flatten;
      p.split = i === 0 ? split : 0;
      cells[i]!.update(p);
      paintCells(cells[i]!, cellB[i]!, cellVals[i]!, amt, i === 0, drop);
    });
  }
  holders.forEach((h, i) => placeHolder(h, targets[i]!, lambda));

  aimCamera(stage.camera as THREE.OrthographicCamera, ELEV_LOW + (90 - ELEV_LOW) * lambda, ZOOM_LOW + (1 - ZOOM_LOW) * lambda);
});

stage.start();
