/**
 * The space of states, in the beam room.
 *
 * `state-space` for the room Part II of the light-field talk is set in (the
 * lamp, the flat mirror, the curved one; Steve, 2026-10-30: "we had that in the
 * previous animations for a box with a ball in it, but now we have a box with
 * two mirrors, maybe we can do the same"). The light field is stored on the
 * boundary, T¹M|_∂M, and the circle of directions over each of its points
 * stands up out of the room and sweeps out the bundle, exactly as in
 * `state-space` (the lift is `src/bundle2d.ts`'s): a **torus** over the walls
 * and a **cylinder** over each mirror (`src/beambundle.ts` says why).
 *
 * ## Coloured by what each piece is
 *
 * This draws the domain of a light field, not a light field: every piece is
 * coloured by its material (left wall red, right green, floor and ceiling
 * white, mirrors grey), with the outgoing half of the walls' torus bright and
 * the half pointing into the wall dim. A mirror's circle is outgoing all round
 * (its front's half and its back's), so it is not dimmed. A fixed shading term
 * is multiplied in so the surfaces have form.
 *
 * ## What is staged
 *
 * - **The mirrors' cylinders float above the walls' torus.** The curved mirror
 *   ends close to the ceiling, and tubes round nearby curves overlap, so (as
 *   `state-space` does for its object) the cylinders climb clear as they stand
 *   up.
 *
 * Not drawn: the lamp's housing and its opening. They are boundary as well (the
 * opening is where E lives); this version leaves them out.
 *
 * The animation plays once and holds. `state-space-beam-stored` opens on its
 * last frame.
 */

import * as THREE from 'three';
import { createStage, createUI, C } from '@';
import { polyline, setPolyline } from '@/lines';
import { smoothSheet, fiberPoints, aimCamera, shade, POSE_FLAT, type Pose, type Boundary, type Sheet } from '@/bundle2d';
import { R_FIBER, MIRROR_RISE, wallBoundary, mirrorBoundary, colourOver } from '@/beambundle';

const ORTHO_H = 3;
const stage = createStage({ camera: 'ortho', position: [0, 0, 10], target: [0, 0, 0], orthoHeight: ORTHO_H, lights: false, controls: false });
stage.duration = 16;
const ui = createUI(stage);

const walls = wallBoundary(0.04);
const flat = mirrorBoundary('flat', 40);
const arc = mirrorBoundary('arc', 40);

// --- The flat room underneath, to be lifted off -------------------------------------
const base = new THREE.Group();
const lineOf = (b: Boundary, closed: boolean, color: number, width: number) =>
  polyline((closed ? [...b.nodes, b.nodes[0]!] : b.nodes).map((n) => [n.x, n.y, 0] as [number, number, number]), { color, width });
base.add(lineOf(walls, true, C.bone, 3), lineOf(flat, false, C.slate, 4), lineOf(arc, false, C.slate, 4));
stage.add(base);

// --- The torus and the cylinders, coloured by material ----------------------------
const FIBER = 56;
const sheets = [walls, flat, arc].map((b) => smoothSheet(b, FIBER));
const colours = [walls, flat, arc].map((b, i) => colourOver(b, FIBER, { mid: false, off: 0, wall: i === 0 }));
for (const s of sheets) stage.add(s.mesh);

/** Colour a sheet by its material, shaded for form. */
function paint(s: Sheet, values: Float32Array): void {
  const geom = s.mesh.geometry as THREE.BufferGeometry;
  const col = geom.attributes.color!.array as Float32Array;
  const nrm = geom.attributes.normal!.array as Float32Array;
  for (let o = 0; o < col.length; o += 3) {
    const lit = shade(nrm[o]!, nrm[o + 1]!, nrm[o + 2]!);
    col[o] = values[o]! * lit;
    col[o + 1] = values[o + 1]! * lit;
    col[o + 2] = values[o + 2]! * lit;
  }
  geom.attributes.color!.needsUpdate = true;
}

const GEN_SEGS = 96;
const blank: [number, number, number][] = Array.from({ length: GEN_SEGS + 1 }, () => [0, 0, 0]);
const gens = sheets.map(() => {
  const g = polyline(blank, { color: C.bone, width: 3.5 });
  g.renderOrder = 6;
  stage.add(g);
  return g;
});

// --- Timeline -----------------------------------------------------------------------------
const ease = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const ELEV_HIGH = 90;
const ELEV_LOW = 32;
const ZOOM_HIGH = 1.0;
const ZOOM_LOW = 1.3;

const params = { run: true, lift: 1, sweep: 1, elevation: ELEV_LOW };
ui.params.add(params, 'run').name('play the build');
ui.params.add(params, 'lift', 0, 1, 0.001).name('lift (when held)');
ui.params.add(params, 'sweep', 0, 1, 0.001).name('sweep (when held)');
ui.params.add(params, 'elevation', 8, 90, 1).name('elevation (when held)');

const wallPose: Pose = { ...POSE_FLAT, radius: R_FIBER };
const mirrorPose: Pose = { ...POSE_FLAT, radius: R_FIBER };
let lastKey = '';

/** A mirror is open: its last node does not join its first, so the closing segment is never drawn. */
const reach = (i: number, f: number) => (i === 0 ? f : (f * (sheets[i]!.boundary.nodes.length - 1)) / sheets[i]!.boundary.nodes.length);

stage.frame((t) => {
  const u = stage.duration > 0 ? Math.min(1, t / stage.duration) : 0;
  const genIn = ease(0.05, 0.13, u);
  const lift = params.run ? ease(0.15, 0.4, u) : params.lift;
  const sweep = params.run ? ease(0.4, 0.82, u) : params.sweep;

  const elev = params.run ? ELEV_HIGH + (ELEV_LOW - ELEV_HIGH) * lift : params.elevation;
  const zoom = ZOOM_HIGH + (ZOOM_LOW - ZOOM_HIGH) * ease(0.15, 0.45, params.run ? u : 1);
  aimCamera(stage.camera as THREE.OrthographicCamera, elev, zoom);

  wallPose.alpha = mirrorPose.alpha = (lift * Math.PI) / 2;
  mirrorPose.rise = lift * MIRROR_RISE;
  const key = `${wallPose.alpha.toFixed(4)}|${mirrorPose.rise.toFixed(4)}`;
  if (key !== lastKey) {
    lastKey = key;
    sheets.forEach((s, i) => {
      s.update(i === 0 ? wallPose : mirrorPose);
      paint(s, colours[i]!);
    });
  }
  sheets.forEach((s, i) => s.reveal(reach(i, sweep)));

  const genAlpha = genIn * (1 - ease(0.86, 0.96, u));
  gens.forEach((g, i) => {
    const m = g.material as THREE.Material & { opacity: number };
    m.opacity = genAlpha;
    m.transparent = true;
    g.visible = genAlpha > 0.01;
    if (g.visible) setPolyline(g, fiberPoints(sheets[i]!.boundary, reach(i, Math.min(sweep, 0.9999)), i === 0 ? wallPose : mirrorPose, GEN_SEGS));
  });

  // The room has been lifted off, so the flat drawing of it goes.
  const gone = ease(0.3, 0.62, u);
  base.traverse((o) => {
    const m = (o as THREE.Mesh).material as (THREE.Material & { opacity: number }) | undefined;
    if (m) {
      m.transparent = true;
      m.opacity = 1 - gone;
    }
  });
  base.visible = gone < 1;
});

stage.start();
