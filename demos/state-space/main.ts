/**
 * The space of states.
 *
 * Part I finishes by throwing away everything about ray space except the part
 * where the scene acts. Radiance does not change along a geodesic, so it is
 * enough to know it on the boundary of the objects:
 *
 *     X = T¹M|_Σ = ⊔_{p∈Σ} S¹_p ,      L = ℓ|_X .
 *
 * This draws that object for the room the deck is set in. Σ has two components,
 * the box's boundary and the object's, each a circle; over each point sits the
 * circle of directions. Both bundles are trivial, so X is **two tori**, and the
 * demo grows them out of the picture the audience already has.
 *
 * ## How the circles stand up
 *
 * One circle of directions appears where `radiance-2d` draws it — flat in the
 * scene plane, at a point of Σ. It then rotates by 90° about its own **normal
 * line**, and travels round the boundary, sweeping the surface out behind it.
 * The lift is the whole trick and it is `src/bundle2d.ts`'s doing:
 *
 *     x(s, φ, α) = p(s) + r·( cos φ · n + sin φ · (cos α · t + sin α · ẑ) ).
 *
 * ±n stay pinned in the plane and the grazing directions ±t lift to ±ẑ, so the
 * family sweeps out the tube around the curve. Rotating about the tangent
 * instead would put every circle in a plane containing the curve and the sweep
 * would be a self-intersecting mess rather than a torus.
 *
 * ## What is true in the picture
 *
 * - **The object's torus is lifted, and that is the one thing here that is not
 *   where it belongs.** The object rests on the floor — `scene2d` picks its
 *   centre so that it does, exactly — so Σ's two components are tangent. Tubes
 *   of radius r around curves that *touch* do not touch: they overlap wherever
 *   the curves are closer than 2r, which is a 144° arc of the object's boundary.
 *   That interpenetration is a true consequence of the tangency and it reads as
 *   a mistake, so the small torus climbs clear of the ring as it stands up. What
 *   it costs is the fiber circle the two components genuinely share over the
 *   contact point; what it buys is two tori you can see.
 * - **The bright half of each tube is the half pointing into the room.** φ is
 *   measured from the outward normal, so cos φ > 0 is the outgoing hemisphere.
 *   Nothing is being measured; it marks which half is which, and it is what
 *   makes the split legible once the fibers are unrolled two demos later.
 * - **The corners of the box carry a fan.** n jumps 90° there, and the fan of
 *   frames sweeps a lune of the sphere about the corner — the honest limit of a
 *   rounded join. Over a corner point there is one circle of directions, drawn
 *   many times; it carries no arclength and survives into no data.
 *
 * ## Staging
 *
 * The camera swings from straight down — the framing of every other 2D demo, so
 * the room is recognised before anything happens to it — to an oblique view,
 * zooming in to make up for the foreshortening. `state-space-discrete` opens on
 * the angle this one ends at.
 *
 * Nothing else on screen is staged. There is no flat drawing of the room behind
 * the tori — Σ is drawn as Σ, one bright segment per patch, and it goes as soon
 * as the circles have lifted off it, so the finished frame is two surfaces in
 * black and nothing else.
 *
 * The animation plays once and holds. It is a build, not a cycle, so it does not
 * loop — the exported clip ends on the finished pair of tori.
 */

import * as THREE from 'three';
import { createStage, createUI, C } from '@';
import { polyline, setPolyline } from '@/lines';
import {
  R_FIBER,
  OBJ_RISE,
  NW,
  WALL,
  FAN_SMOOTH,
  FAN_CELLS,
  boxBoundary,
  boxNearSegments,
  circleBoundary,
  polygonBoundary,
  smoothSheet,
  buildRoomView,
  fiberPoints,
  aimCamera,
  POSE_FLAT,
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
stage.duration = 16;

const ui = createUI(stage);

// ---------------------------------------------------------------------------
// The room, and the two bundles over its boundary
// ---------------------------------------------------------------------------

/**
 * Σ itself, and nothing else: one bright segment per patch of the boundary, with
 * no wall slabs and no filled object behind it. Flat scenery lying in z = 0 under
 * a pair of tori reads as a second, competing picture rather than as the room
 * the bundle sits on.
 *
 * It is there to be lifted off, so it goes as the lift finishes — by the time
 * there are tori there is no flat drawing behind them.
 */
const sigmaView = buildRoomView(boxBoundary(NW, FAN_CELLS), polygonBoundary());
sigmaView.setWipe(0, 0);
stage.add(sigmaView.group);

/**
 * The smooth torus is sampled far finer than the discretisation that follows —
 * this demo is doing continuous mathematics, and the surface has to read as a
 * surface. The corner fans get their own count, since they carry no arclength
 * and so cannot inherit a spacing from one.
 */
const BOX_PER_WALL = 60;
const boxCurve = boxBoundary(BOX_PER_WALL, FAN_SMOOTH);
const discCurve = circleBoundary(168);

const boxSheet = smoothSheet(boxCurve, 56, boxNearSegments(BOX_PER_WALL, FAN_SMOOTH));
const discSheet = smoothSheet(discCurve, 56);
stage.add(boxSheet.mesh, discSheet.mesh);

// The object's torus sits inside the box's ring, so it has to be drawn before
// the near arc that will be faded over it.
discSheet.mesh.renderOrder = 0;
boxSheet.mesh.renderOrder = 1;

// ---------------------------------------------------------------------------
// The generator circles
// ---------------------------------------------------------------------------

/**
 * One circle of directions per component of Σ, drawn as a bright line: the
 * fiber the surface is being swept out by. The object's starts at the contact
 * point with the floor, which is where its boundary curve is defined to start.
 */
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

const ELEV_HIGH = 90;
const ELEV_LOW = 32;
const ZOOM_HIGH = 1.15;
const ZOOM_LOW = 1.5;

const params = {
  run: true,
  lift: 1,
  sweep: 1,
  radius: R_FIBER,
  objRise: OBJ_RISE,
  elevation: ELEV_LOW,
  nearFade: 1,
};
ui.params.add(params, 'run').name('play the build');
ui.params.add(params, 'lift', 0, 1, 0.001).name('lift (when held)');
ui.params.add(params, 'sweep', 0, 1, 0.001).name('sweep (when held)');
ui.params.add(params, 'radius', 0.08, 0.6, 0.01).name('fiber radius');
ui.params.add(params, 'objRise', 0, 1.5, 0.01).name('object torus lift');
ui.params.add(params, 'elevation', 8, 90, 1).name('elevation (when held)');
ui.params.add(params, 'nearFade', 0.05, 1, 0.01).name('near arc opacity');

const pose: Pose = { ...POSE_FLAT };
/**
 * The object's torus gets its own pose, because it is lifted clear of the box's
 * — see OBJ_RISE. Everything else about it is identical.
 */
const objPose: Pose = { ...POSE_FLAT };
let lastKey = '';

stage.frame((t) => {
  const u = stage.duration > 0 ? Math.min(1, t / stage.duration) : 0;

  // The build, as fractions of the clip. It plays once and holds: the last
  // fifth is the finished picture, which is what the slide sits on.
  const genIn = ease(0.05, 0.13, u);
  const lift = params.run ? ease(0.15, 0.4, u) : params.lift;
  const sweep = params.run ? ease(0.4, 0.82, u) : params.sweep;
  const settle = ease(0.84, 0.97, u);

  const elev = params.run ? ELEV_HIGH + (ELEV_LOW - ELEV_HIGH) * lift : params.elevation;
  const zoom = ZOOM_HIGH + (ZOOM_LOW - ZOOM_HIGH) * ease(0.15, 0.45, params.run ? u : 1);
  aimCamera(stage.camera as THREE.OrthographicCamera, elev, zoom);

  pose.alpha = (lift * Math.PI) / 2;
  pose.radius = params.radius;
  // The box's torus stays centred on Σ, where it belongs. The object's climbs
  // clear of it as it stands up, because Σ's two components are tangent and
  // tubes around tangent curves overlap rather than touch — see OBJ_RISE.
  objPose.alpha = pose.alpha;
  objPose.radius = params.radius;
  objPose.rise = lift * params.objRise;

  // Rebuilding 26 000 vertices is not free, so it only happens when something
  // the geometry depends on has actually changed.
  const key = `${pose.alpha.toFixed(4)}|${pose.radius}|${objPose.rise.toFixed(4)}`;
  if (key !== lastKey) {
    lastKey = key;
    boxSheet.update(pose);
    discSheet.update(objPose);
  }

  // The surface exists only where the generator has already been.
  boxSheet.reveal(sweep);
  discSheet.reveal(sweep);

  // The generator rides the leading edge, and steps off at the end.
  const genAlpha = genIn * (1 - ease(0.86, 0.96, u));
  for (const [line, curve] of [
    [boxGen, boxCurve],
    [discGen, discCurve],
  ] as const) {
    const m = line.material as THREE.Material & { opacity: number };
    m.opacity = genAlpha;
    m.transparent = true;
    line.visible = genAlpha > 0.01;
    if (line.visible)
      setPolyline(
        line,
        fiberPoints(curve, Math.min(sweep, 0.9999), curve === discCurve ? objPose : pose, GEN_SEGS),
      );
  }

  // Σ has been lifted off, so the flat drawing of it goes.
  const sigmaGone = ease(0.3, 0.62, u);
  sigmaView.setOpacity(1 - sigmaGone);
  sigmaView.group.visible = sigmaGone < 1;

  // The near arc of the ring is kept separable in case it ever has to be seen
  // past, but with the object's torus lifted clear there is nothing behind it,
  // so it stays solid. Depth writing has to follow the opacity: a group that is
  // see-through must not occlude, and one that is not must sort against itself.
  if (boxSheet.nearMaterial) {
    const a = 1 - (1 - params.nearFade) * settle;
    boxSheet.nearMaterial.opacity = a;
    boxSheet.nearMaterial.depthWrite = a > 0.99;
  }
});

stage.start();
