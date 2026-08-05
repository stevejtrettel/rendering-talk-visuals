/**
 * Shared scenery for the 2D-integration demos.
 *
 * The Riemann and Monte Carlo surface demos are separate demos on purpose —
 * each gets the whole frame, and their exported videos can sit side by side in
 * Keynote at full resolution. That only works if they look identical apart from
 * the method being shown, so the stage, camera, surface and floor all come from
 * here, and both use the same loop duration so the two videos stay in step.
 */

import * as THREE from 'three';
import { Stage, createStage } from './stage';
import { C, matte, mix } from './style';
import { FIELD_HALF, bumps2d } from './functions';

/** Vertical exaggeration: world height per unit of f. */
export const Z = 1.35;

/** Both demos share this, so exported videos are frame-synchronised. */
export const DURATION = 14;

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
  opts: { res?: number; color?: number; opacity?: number } = {},
): THREE.Group {
  // A saturated blue goes near-black where it overlaps the green bars, and the
  // surface disappears. Lifting it toward bone keeps it legible as glass over
  // whatever is underneath.
  const { res = 160, color = mix(C.blue, C.bone, 0.45), opacity = 0.34 } = opts;

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
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.renderOrder = 20;
  group.add(mesh);

  // A coarse wireframe over the same shape, to give the glass structure.
  const wireGeom = new THREE.PlaneGeometry(2 * FIELD_HALF, 2 * FIELD_HALF, 30, 30);
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

  const h = FIELD_HALF;
  const edge = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-h, 0.002, -h),
      new THREE.Vector3(h, 0.002, -h),
      new THREE.Vector3(h, 0.002, h),
      new THREE.Vector3(-h, 0.002, h),
    ]),
    new THREE.LineBasicMaterial({ color: C.slate, transparent: true, opacity: 0.8 }),
  );
  g.add(edge);

  return g;
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
