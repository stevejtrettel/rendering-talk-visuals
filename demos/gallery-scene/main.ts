/**
 * The gallery, as plain three.js.
 *
 * Steve, 2026-10-30: before the light-field hallway itself, "a simple three.js
 * scene showing the same objects". The geometry is the light-field repo's
 * `gallery` scene, exported verbatim (src/assets/lightfield/gallery-scene.json):
 * the 3.2 × 2.6 × 12 corridor, its colour bays and carpet, the pedestals, the
 * 29 balls (22 matte, 3 mirror, 4 glass) and the five ceiling lights. Drawn
 * in plain matte grey with three.js's ordinary materials and a few lights: what the
 * scene IS, with none of its light (or colour) computed. Drag to orbit.
 */

import * as THREE from 'three';
import { createStage, createUI } from '@';
import SCENE from '@/assets/lightfield/gallery-scene.json';

type V3 = [number, number, number];
interface Mat { kind: string; albedo: V3; emission: V3; ior: number }

const stage = createStage({ position: [0.25, 1.45, 5.4], target: [0, 1.0, -0.5], fov: 50, lights: false });
createUI(stage);

function material(m: Mat): THREE.Material {
  // No colours and no mirrors or glass (Steve, 2026-10-30: "just white or
  // grey, to show the scene we will render"; "all opaque, so we don't see
  // mirrors or glass until we get to the final scene"). Lights white,
  // everything else one matte grey.
  if (m.emission.some((x) => x > 0)) return new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  return new THREE.MeshStandardMaterial({ color: 0xb4b4b4, roughness: 0.9, side: THREE.DoubleSide });
}

// The wall behind the camera (the corridor's end at z = 6) is left out, so
// the view can pull back out of the box (Steve, 2026-10-30).
const isNearWall = (q: { origin: V3; edgeU: V3; edgeV: V3 }) => q.origin[2] === 6 && q.edgeU[2] === 0 && q.edgeV[2] === 0;
for (const q of SCENE.quads as { origin: V3; edgeU: V3; edgeV: V3; material: Mat }[]) {
  if (isNearWall(q)) continue;
  const o = new THREE.Vector3(...q.origin);
  const eu = new THREE.Vector3(...q.edgeU);
  const ev = new THREE.Vector3(...q.edgeV);
  const g = new THREE.BufferGeometry();
  const p = [o, o.clone().add(eu), o.clone().add(eu).add(ev), o.clone().add(ev)];
  g.setAttribute('position', new THREE.Float32BufferAttribute(p.flatMap((v) => [v.x, v.y, v.z]), 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.computeVertexNormals();
  stage.add(new THREE.Mesh(g, material(q.material)));
}
for (const s of SCENE.spheres as { center: V3; radius: number; material: Mat }[]) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(s.radius, 48, 32), material(s.material));
  m.position.set(...s.center);
  stage.add(m);
}

// Lights: one soft point light under each ceiling light, and a dim fill.
stage.add(new THREE.HemisphereLight(0xffffff, 0x302820, 0.6));
for (const q of SCENE.quads as { origin: V3; edgeU: V3; edgeV: V3; material: Mat }[]) {
  if (!q.material.emission.some((x) => x > 0)) continue;
  const c = new THREE.Vector3(...q.origin).addScaledVector(new THREE.Vector3(...q.edgeU), 0.5).addScaledVector(new THREE.Vector3(...q.edgeV), 0.5);
  const l = new THREE.PointLight(0xfff2e0, 4, 0, 1.6);
  l.position.copy(c).add(new THREE.Vector3(0, -0.15, 0));
  stage.add(l);
}

stage.start();
