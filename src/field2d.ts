/**
 * Shared scenery for the 2D-integration demos.
 *
 * Each demo gets the whole frame, and they share this stage, camera, surface
 * and floor so that the plate, the viewpoint and the glass read as the same
 * scenery wherever they appear.
 *
 * They were once a matched pair meant to be cut together, and the shared
 * `DURATION` is left over from that. `monte-carlo-2d` now integrates over a
 * region inside the plate rather than the whole square, so the two are no
 * longer the same picture twice and nothing depends on their being in step.
 */

import * as THREE from 'three';
import { Stage, createStage } from './stage';
import { C, matte, mix } from './style';
import { polyline } from './lines';
import { FIELD_HALF, bumps2d } from './functions';

/** Vertical exaggeration: world height per unit of f. */
export const Z = 1.35;

/** Loop length for every demo built on this stage. */
export const DURATION = 14;

/**
 * Seconds at the end of the loop spent parked on the finished estimate, so the
 * answer is on screen long enough to read before the loop restarts. The camera
 * orbit runs off the raw loop phase, not this one — it keeps turning through
 * the hold and still closes its circle at the loop point.
 */
export const HOLD = 2.6;

/**
 * Standard three-quarter view. The distance is set so the whole 6×6 plate and
 * the tallest bump fit inside a 38° vertical field — closer than this and the
 * near corner of the plate falls out of frame.
 */
export const CAM_POS: [number, number, number] = [7.0, 7.4, 9.0];
export const CAM_TARGET: [number, number, number] = [0, 0.85, 0];

/** Azimuth the camera starts at, so auto-orbit begins from the default view. */
export const START_ANGLE = Math.atan2(CAM_POS[2], CAM_POS[0]);

export function createFieldStage(): Stage {
  const stage = createStage({
    position: CAM_POS,
    target: CAM_TARGET,
    fov: 38,
    lights: true,
  });
  stage.duration = DURATION;
  return stage;
}

/**
 * The graph of f as a pane of glass.
 *
 * `depthWrite: false` plus a high `renderOrder` is what lets the bars show
 * through: the surface is drawn last and blends over whatever is already in
 * the depth buffer, instead of hiding it. A faint wireframe rides on top —
 * without it a smooth transparent surface reads as a vague haze in 3D, and the
 * grid lines are what make the shape legible.
 */
export function glassSurface(
  f: (x: number, y: number) => number,
  opts: {
    res?: number;
    wire?: number;
    color?: number;
    opacity?: number;
    /**
     * Clip the surface to a sub-region of the plate: a mask whose green channel
     * crosses `maskThreshold` on the region's boundary trims both the surface
     * and its wireframe, with no custom shader — see `monte-carlo-2d`.
     */
    alphaMap?: THREE.Texture;
    /**
     * Mask value at the boundary, default 0.5.
     *
     * Note this is *not* three's `alphaTest`, and the difference bit once: the
     * shader tests `opacity × mask < alphaTest`, so passing the mask threshold
     * straight through as `alphaTest` compares 0.46 × 1 against 0.5 and
     * discards the surface everywhere — it simply vanishes, with no error. Each
     * material's `alphaTest` is therefore scaled by its own opacity here, which
     * also keeps the surface and its much fainter wireframe cutting at the same
     * place.
     */
    maskThreshold?: number;
  } = {},
): THREE.Group {
  // A saturated blue goes near-black where it overlaps the green bars, and the
  // surface disappears. Lifting it toward bone keeps it legible as glass over
  // whatever is underneath.
  // `wire` needs raising for an integrand with features narrower than a cell of
  // it: the wireframe is the same shape sampled coarsely, so on a sharp ridge a
  // 30×30 grid visibly cuts the crest off the surface it is drawn over.
  const {
    res = 160,
    wire: wireRes = 30,
    color = mix(C.blue, C.bone, 0.45),
    opacity = 0.46,
    alphaMap,
    maskThreshold = 0.5,
  } = opts;
  /** Clip settings for a material at a given opacity — see `maskThreshold`. */
  const clipAt = (o: number) => (alphaMap ? { alphaMap, alphaTest: o * maskThreshold } : {});

  const geom = new THREE.PlaneGeometry(2 * FIELD_HALF, 2 * FIELD_HALF, res, res);
  // PlaneGeometry lies in xy; lay it flat and lift each vertex to f(x, z).
  geom.rotateX(-Math.PI / 2);
  const pos = geom.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, f(pos.getX(i), pos.getZ(i)) * Z);
  }
  geom.computeVertexNormals();

  const group = new THREE.Group();

  const mat = new THREE.MeshPhysicalMaterial({
    color,
    transparent: true,
    opacity,
    roughness: 0.12,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.15,
    side: THREE.DoubleSide,
    depthWrite: false,
    ...clipAt(opacity),
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.renderOrder = 20;
  group.add(mesh);

  // A coarse wireframe over the same shape, to give the glass structure.
  const wireGeom = new THREE.PlaneGeometry(2 * FIELD_HALF, 2 * FIELD_HALF, wireRes, wireRes);
  wireGeom.rotateX(-Math.PI / 2);
  const wpos = wireGeom.attributes.position;
  for (let i = 0; i < wpos.count; i++) {
    wpos.setY(i, f(wpos.getX(i), wpos.getZ(i)) * Z);
  }
  const wire = new THREE.Mesh(
    wireGeom,
    new THREE.MeshBasicMaterial({
      color: C.bone,
      wireframe: true,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      ...clipAt(0.18),
    }),
  );
  wire.renderOrder = 21;
  group.add(wire);

  return group;
}

/** The domain square on the ground: a grid, plus a brighter boundary. */
export function floorPlate(divisions = 12): THREE.Group {
  const g = new THREE.Group();
  const side = 2 * FIELD_HALF;

  const grid = new THREE.GridHelper(side, divisions, C.slateDeep, C.slateDeep);
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.5;
  g.add(grid);

  // A thick border, not a one-pixel LineLoop: this is the edge of the region
  // being integrated over, and at a distance a hairline reads as an artefact of
  // the grid rather than as the boundary of the domain.
  const h = FIELD_HALF;
  g.add(
    polyline(
      [
        [-h, 0.004, -h],
        [h, 0.004, -h],
        [h, 0.004, h],
        [-h, 0.004, h],
        [-h, 0.004, -h],
      ],
      { color: C.slate, width: 3.5, opacity: 0.9 },
    ),
  );

  return g;
}

/**
 * A tube following the four boundary curves of the graph of `f`.
 *
 * A transparent sheet whose edge is also transparent has no silhouette — where
 * the integrand goes flat the pane dissolves into the floor and you cannot tell
 * how far it extends. A solid, lit rim gives it one, and being real geometry it
 * occludes and is occluded correctly, so it also says which parts of the sheet
 * are in front of which samples.
 */
export function surfaceRim(
  f: (x: number, y: number) => number,
  opts: { radius?: number; color?: number; samples?: number } = {},
): THREE.Mesh {
  const { radius = 0.045, color = mix(C.blue, C.bone, 0.55), samples = 120 } = opts;
  const h = FIELD_HALF;

  // Walk the square once, so the four edges come out as one closed curve.
  const pts: THREE.Vector3[] = [];
  const at = (x: number, z: number) => pts.push(new THREE.Vector3(x, f(x, z) * Z, z));
  for (let i = 0; i < samples; i++) at(-h + (2 * h * i) / samples, -h);
  for (let i = 0; i < samples; i++) at(h, -h + (2 * h * i) / samples);
  for (let i = 0; i < samples; i++) at(h - (2 * h * i) / samples, h);
  for (let i = 0; i < samples; i++) at(-h, h - (2 * h * i) / samples);

  const curve = new THREE.CatmullRomCurve3(pts, true);
  const geom = new THREE.TubeGeometry(curve, pts.length, radius, 10, true);
  return new THREE.Mesh(geom, matte(color, { roughness: 0.4 }));
}

/**
 * Spin the camera around its target, completing exactly one turn per loop so an
 * exported video cuts back to its first frame seamlessly.
 *
 * Radius and height are read from wherever the camera currently is, so dragging
 * to reframe still works — you set the angle and distance, this drives the
 * azimuth.
 */
export function autoOrbit(stage: Stage, u: number, startAngle: number): void {
  const target = stage.controls?.target ?? new THREE.Vector3();
  const off = stage.camera.position.clone().sub(target);
  const radius = Math.hypot(off.x, off.z);
  const a = startAngle + u * Math.PI * 2;
  stage.camera.position.set(
    target.x + radius * Math.cos(a),
    target.y + off.y,
    target.z + radius * Math.sin(a),
  );
  stage.camera.lookAt(target);
}

/** The default integrand, already scaled into world units. */
export const height = (x: number, z: number) => bumps2d(x, z) * Z;

/** Matte material for the solid bars. */
export const barMaterial = () => matte(C.moss, { roughness: 0.75 });
