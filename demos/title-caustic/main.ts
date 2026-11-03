/**
 * A title-slide picture for the light-field deck (Steve, 2026-10-30: "a
 * simple, easy-to-compute, schematic, artistic, beautiful thing").
 *
 * Rays from one point on a circular mirror, reflecting inside it: the
 * envelope of the once-reflected rays is a cardioid, the bright curve in a
 * coffee cup. Rays are added a few at a time, in a shuffled order of angle, so
 * the caustic emerges out of a haze of lines rather than sweeping round; each
 * ray is drawn through three reflections, dimmer after each. Thin lines,
 * additive, so where rays bunch the light builds up, as it does.
 *
 * Cheap: one LineSegments of ~2,000 rays, computed once; the animation only
 * moves its draw range. Builds for BUILD seconds, holds, fades, loops.
 * Sits right of centre, leaving the lower left for the title.
 */

import * as THREE from 'three';
import { createStage, createUI, C } from '@';
import { polyline, type Pt } from '@/lines';

const stage = createStage({ camera: 'ortho', position: [0, 0, 10], target: [0, 0, 0], orthoHeight: 3, lights: false, controls: false });
const BUILD = 12;
const HOLD = 6;
const FADE = 1.2;
stage.duration = BUILD + HOLD + FADE;
createUI(stage);

const CX = 2.2;
const CY = 0.05;
const R = 2.55;
const RAYS = 2200;
const REFLECTIONS = 3;
const SRC_ANGLE = Math.PI * 0.82; // the source, on the ring, upper left of it

// The ring, faint.
const ring: Pt[] = [];
for (let i = 0; i <= 256; i++) {
  const a = (2 * Math.PI * i) / 256;
  ring.push([CX + R * Math.cos(a), CY + R * Math.sin(a), 0]);
}
stage.add(polyline(ring, { color: C.slateDeep, width: 2 }));

// The rays: from the source, every inward direction, reflected inside the ring.
const sx = CX + R * Math.cos(SRC_ANGLE);
const sy = CY + R * Math.sin(SRC_ANGLE);
const order = Array.from({ length: RAYS }, (_, i) => i);
let seed = 0x1234567;
const rand = () => {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return (seed >>> 0) / 4294967296;
};
for (let i = order.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1));
  [order[i], order[j]] = [order[j]!, order[i]!];
}
const segs = RAYS * (REFLECTIONS + 1);
const pos = new Float32Array(segs * 6);
const col = new Float32Array(segs * 6);
const warm = new THREE.Color(C.ochre);
const bright = [0.5, 0.42, 0.22, 0.12]; // per segment: before the first reflection, after it, …
let k = 0;
for (const r of order) {
  // Inward directions: the inward normal at the source, ± almost 90°.
  const inward = SRC_ANGLE + Math.PI;
  const a = inward + (((r + 0.5) / RAYS) * 2 - 1) * (Math.PI / 2) * 0.985;
  let px = sx;
  let py = sy;
  let dx = Math.cos(a);
  let dy = Math.sin(a);
  for (let b = 0; b <= REFLECTIONS; b++) {
    // Next hit with the circle: |p + t d - c| = R, the far root.
    const ox = px - CX;
    const oy = py - CY;
    const B = ox * dx + oy * dy;
    const Cc = ox * ox + oy * oy - R * R;
    const t = -B + Math.sqrt(Math.max(0, B * B - Cc));
    const qx = px + t * dx;
    const qy = py + t * dy;
    pos.set([px, py, 0, qx, qy, 0], k * 6);
    const s = bright[b]!;
    col.set([warm.r * s, warm.g * s, warm.b * s, warm.r * s, warm.g * s, warm.b * s], k * 6);
    k++;
    // Reflect about the normal at q.
    const nx = (qx - CX) / R;
    const ny = (qy - CY) / R;
    const dn = dx * nx + dy * ny;
    dx -= 2 * dn * nx;
    dy -= 2 * dn * ny;
    px = qx;
    py = qy;
  }
}
const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
const mat = new THREE.LineBasicMaterial({
  vertexColors: true,
  transparent: true,
  opacity: 0.07,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});
const lines = new THREE.LineSegments(geo, mat);
stage.add(lines);

// The source, a small warm dot.
const dot = new THREE.Mesh(new THREE.CircleGeometry(0.05, 24), new THREE.MeshBasicMaterial({ color: C.bone }));
dot.position.set(sx, sy, 0.1);
stage.add(dot);

const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 2);
stage.frame((t) => {
  const u = t % stage.duration;
  const n = Math.round(RAYS * ease(u / BUILD));
  geo.setDrawRange(0, n * (REFLECTIONS + 1) * 2);
  const fade = u > BUILD + HOLD ? 1 - (u - BUILD - HOLD) / FADE : 1;
  mat.opacity = 0.07 * fade;
});

stage.start();
