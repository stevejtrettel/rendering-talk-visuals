/**
 * One example of T: the lamp's light E, and T(E).
 *
 * The beam room (src/beamscene.ts), twice. Left, E: the lamp's own light,
 * drawn as rays, each from the lamp's opening to the first thing it meets.
 * Right, T(E): the room acting on E once (Steve, 2026-10-29: T is travel to
 * the surface, then respond there). Where a ray of E meets the mirror, it goes
 * on, reflected; where it meets a wall, the wall sends light out in every
 * direction (its BRDF: the same in every direction, in the wall's colour);
 * where it meets the lamp's housing, it is absorbed. Each of those is drawn
 * to the next thing it meets.
 *
 * Rays, not a glow: a light field is light on rays, so this draws rays, each
 * in the colour and brightness of the light it carries (spectrum through the
 * CIE observer; the lamp's spectrum is light-field-room's 5800 K), blended
 * additively so where rays cross they add, as light does. E has RAYS rays,
 * deterministic (stratified across the opening and in angle); a wall sends
 * FAN rays out of each point it is hit, stratified over the cosine, each
 * carrying 1/FAN of the reflected power.
 *
 * Cheap: a few thousand segments, computed at load. The walls are drawn dim,
 * in their material colour (they hold no light of their own in either panel).
 */

import * as THREE from 'three';
import { createStage, createUI, C } from '@';
import { polyline, segments } from '@/lines';
import { label } from '@/text';
import { xyzToHex } from '@/response';
import {
  type Vec,
  type Seg,
  v,
  add,
  dot,
  perp,
  unit,
  reflect,
  NS,
  SUN,
  MIRROR_R,
  ROOM_HALF,
  SOURCE,
  A,
  N,
  segs,
  FLAT,
  arcPts,
  HOUSING,
  hit,
  toXYZ,
} from '@/beamscene';

const stage = createStage({ camera: 'ortho', position: [0, 0, 10], target: [0, 0, 0], orthoHeight: 3, lights: false, controls: false });
stage.duration = 1;
createUI(stage);

const SCALE = 0.46;
const PANELS = { E: -2.55, T: 2.55 };
const RAYS = 160;
const FAN = 9;
/** Brightness of one ray of E, as drawn. */
const GAIN = 0.28;

// --- The rays ---------------------------------------------------------------------
const Y_SUN = toXYZ(SUN)[1];
type Ray = { a: Vec; b: Vec; w: Float64Array };
const E: Ray[] = [];
const TE: Ray[] = [];
// The inverse normal CDF, for stratifying the beam's Gaussians.
const probit = (p: number) => {
  // Acklam's rational approximation, central region is enough here (p in [0.02, 0.98]).
  const q = p - 0.5;
  const r = q * q;
  return (q * (((((-39.6968302866538 * r + 220.946098424521) * r - 275.928510446969) * r + 138.357751867269) * r - 30.6647980661472) * r + 2.50662827745924)) /
    (((((-54.4760987982241 * r + 161.585836858041) * r - 155.698979859887) * r + 66.8013118877197) * r - 13.2806815528857) * r + 1);
};
const ACROSS = 16; // RAYS = ACROSS × ALONG, stratified
const ALONG = RAYS / ACROSS;
for (let i = 0; i < ACROSS; i++) {
  for (let j = 0; j < ALONG; j++) {
    const s = Math.max(-0.85, Math.min(0.85, SOURCE.waist * probit(0.03 + (0.94 * (i + 0.5)) / ACROSS)));
    const ang = SOURCE.sigma * probit(0.03 + (0.94 * (j + 0.5)) / ALONG);
    const o = add(SOURCE.center, N, s);
    const d = unit(add(A, N, Math.tan(ang)));
    const w = SUN.map((x) => x / RAYS);
    const h = hit(o, d, null);
    if (!h) continue;
    E.push({ a: o, b: h.p, w });
    // T: respond at the surface, then travel to the next.
    if (h.s.kind === 'black') continue;
    const goOn = (from: Seg, p: Vec, d2: Vec, w2: Float64Array) => {
      const h2 = hit(p, d2, from);
      if (h2) TE.push({ a: p, b: h2.p, w: w2 });
    };
    if (h.s.kind === 'mirror') {
      goOn(h.s, h.p, reflect(d, h.s.n), w.map((x) => x * MIRROR_R));
    } else if (dot(d, h.s.n) < 0) {
      for (let k = 0; k < FAN; k++) {
        const st = -1 + (2 * (k + 0.5)) / FAN; // sin θ, uniform: cosine-distributed in 2D
        const d2 = unit(add(add(v(0, 0), h.s.n, Math.sqrt(1 - st * st)), perp(h.s.n), st));
        goOn(h.s, h.p, d2, w.map((x, i) => (x * h.s.albedo![i]!) / FAN));
      }
    }
  }
}

function drawPanel(x: number, rays: Ray[], name: string): void {
  const room = new THREE.Group();
  room.scale.setScalar(SCALE);
  room.position.set(x, 0, 0);
  stage.add(room);
  // The room: its walls dim in their material colour, the mirrors and housing in slate.
  const P = (p: Vec, z = 0) => [p.x, p.y, z] as [number, number, number];
  for (const s of segs) {
    if (s.kind !== 'diffuse') continue;
    const [X, Y, Z] = toXYZ(s.albedo!);
    room.add(polyline([P(s.a), P(s.b)], { color: xyzToHex(X * 0.45, Y * 0.45, Z * 0.45), width: 4 }));
  }
  room.add(polyline([P(add(FLAT.mid, FLAT.dir, -FLAT.half)), P(add(FLAT.mid, FLAT.dir, FLAT.half))], { color: C.slate, width: 4 }));
  room.add(polyline(arcPts.map((p) => P(p)), { color: C.slate, width: 4 }));
  room.add(polyline(HOUSING.map((p) => P(p)), { color: C.slate, width: 4 }));
  // The rays, additive.
  const pos: number[] = [];
  const col: number[] = [];
  const c = new THREE.Color();
  for (const r of rays) {
    const [X, Y, Z] = toXYZ(r.w);
    const k = (GAIN * RAYS) / Y_SUN;
    c.setHex(xyzToHex(X * k, Y * k, Z * k));
    pos.push(r.a.x, r.a.y, 0.01, r.b.x, r.b.y, 0.01);
    for (let e = 0; e < 2; e++) col.push(c.r, c.g, c.b);
  }
  room.add(segments(pos, col, { width: 1.6, additive: true }));
  stage.add(label(name, { size: 0.3, color: C.bone, anchorX: 'center', anchorY: 'top', position: [x, -ROOM_HALF.y * SCALE - 0.25, 0] }));
}
drawPanel(PANELS.E, E, 'E');
drawPanel(PANELS.T, TE, 'T(E)');

stage.start();
