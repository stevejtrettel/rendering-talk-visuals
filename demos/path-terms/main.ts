/**
 * The photograph as a sum over paths, one little room per term.
 *
 * For the light-field deck (Steve, 2026-10-30): "sums of different-length
 * paths from camera to light (little scenes below each term)", in our
 * standard 2D room, the beam room. A row of terms C E + C T E + C T² E +
 * C T³ E + ⋯, and under each a small copy of the room with one path of that
 * length: from the camera, n surfaces, then the lamp.
 *
 * The paths are real light paths, not drawn by hand. Each is a photon from the
 * lamp, sampled as the beam room's light tracing samples them (src/beamroom.ts:
 * Gaussian across the opening and in angle; a mirror reflects; a wall
 * scatters, cosine-weighted), followed through n interactions to a wall point
 * that the camera can see; the camera's ray to that point closes the path.
 * The last interaction is a wall, never a mirror, because only a diffuse wall
 * sends light toward an arbitrary point. For n = 0 the camera sits in the
 * lamp's beam and sees the lamp itself. Among the candidates the search finds,
 * it keeps the one whose shortest segment is longest, so every bounce reads.
 * Deterministic: a fixed seed, so the same paths every time.
 *
 * Still: nothing here moves.
 */

import * as THREE from 'three';
import { createStage, createUI, C } from '@';
import { polyline, type Pt } from '@/lines';
import { label } from '@/text';
import {
  type Vec,
  type Seg,
  v,
  add,
  sub,
  dot,
  perp,
  unit,
  fromAngle,
  reflect,
  ROOM_HALF,
  ROOM_R,
  SOURCE,
  A,
  N,
  FLAT,
  arcPts,
  HOUSING,
  hit,
} from '@/beamscene';

const stage = createStage({ camera: 'ortho', position: [0, 0, 10], target: [0, 0, 0], orthoHeight: 3, lights: false, controls: false });
stage.duration = 1;
createUI(stage);

const TERMS = 4; // C E, C T E, C T² E, C T³ E
const S = 0.18;
const GAP = 0.62;
const PANEL_W = 2 * ROOM_HALF.x * S;
const X0 = -((TERMS * PANEL_W + (TERMS - 1) * GAP + 0.7) / 2) + PANEL_W / 2;
const panelX = (k: number) => X0 + k * (PANEL_W + GAP);
const Y0 = -0.35;

/** The camera: in the lamp's beam, so that it sees the lamp (the n = 0 term). */
const CAM = add(add(SOURCE.center, A, 3.3), N, -0.22);

// --- The search ----------------------------------------------------------------
let seed = 0x5eed1;
const rand = () => {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return (seed >>> 0) / 4294967296;
};
const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
const visible = (a: Vec, b: Vec, skip: Seg | null) => {
  const d = sub(b, a);
  const len = Math.hypot(d.x, d.y);
  const h = hit(a, unit(d), skip);
  return !h || h.t >= len - 1e-4;
};

/** The vertices of a path from the lamp's opening to the camera, n interactions between. */
function findPath(n: number): Vec[] {
  if (n === 0) {
    // The point of the opening the camera looks straight back at.
    const s = dot(sub(CAM, SOURCE.center), N);
    return [add(SOURCE.center, N, s), CAM];
  }
  let best: Vec[] | null = null;
  let bestScore = -1;
  for (let tries = 0; tries < 40000 && bestScore < 1.4; tries++) {
    let s = gauss() * SOURCE.waist;
    while (Math.abs(s) > 0.9) s = gauss() * SOURCE.waist;
    let o = add(SOURCE.center, N, s);
    let d = unit(add(A, N, Math.tan(gauss() * SOURCE.sigma)));
    const verts: Vec[] = [o];
    let skip: Seg | null = null;
    let ok = true;
    for (let k = 0; k < n; k++) {
      const h = hit(o, d, skip);
      if (!h || h.s.kind === 'black') {
        ok = false;
        break;
      }
      verts.push(h.p);
      if (k === n - 1) {
        // The last interaction must be a wall the camera can see, on its lit side.
        if (h.s.kind !== 'diffuse' || dot(d, h.s.n) >= 0 || dot(sub(CAM, h.p), h.s.n) <= 0 || !visible(h.p, CAM, h.s)) ok = false;
        break;
      }
      if (h.s.kind === 'mirror') d = reflect(d, h.s.n);
      else {
        if (dot(d, h.s.n) >= 0) {
          ok = false;
          break;
        }
        const st = 2 * rand() - 1;
        d = unit(add(add(v(0, 0), h.s.n, Math.sqrt(1 - st * st)), perp(h.s.n), st));
      }
      o = h.p;
      skip = h.s;
    }
    if (!ok) continue;
    verts.push(CAM);
    let minSeg = Infinity;
    for (let i = 1; i < verts.length; i++) minSeg = Math.min(minSeg, Math.hypot(verts[i]!.x - verts[i - 1]!.x, verts[i]!.y - verts[i - 1]!.y));
    if (minSeg > bestScore) {
      bestScore = minSeg;
      best = verts;
    }
  }
  return best ?? [SOURCE.center, CAM];
}

// --- Drawing -------------------------------------------------------------------
function room(x: number): THREE.Group {
  const g = new THREE.Group();
  g.scale.setScalar(S);
  g.position.set(x, Y0, 0);
  const P = (p: Vec, z = 0): Pt => [p.x, p.y, z];
  const hx = ROOM_HALF.x - ROOM_R;
  const hy = ROOM_HALF.y - ROOM_R;
  const edge: Pt[] = [];
  for (const [cx, cy, a0] of [[hx, hy, 0], [-hx, hy, 90], [-hx, -hy, 180], [hx, -hy, 270]] as const)
    for (let k = 0; k <= 6; k++) edge.push(P(add(v(cx, cy), fromAngle(a0 + (90 * k) / 6), ROOM_R)));
  edge.push(edge[0]!);
  g.add(polyline(edge, { color: C.slateDeep, width: 2.5 }));
  g.add(polyline([P(add(FLAT.mid, FLAT.dir, -FLAT.half)), P(add(FLAT.mid, FLAT.dir, FLAT.half))], { color: C.slate, width: 2.5 }));
  g.add(polyline(arcPts.map((p) => P(p)), { color: C.slate, width: 2.5 }));
  g.add(polyline(HOUSING.map((p) => P(p)), { color: C.slate, width: 2.5 }));
  return g;
}
const dot2 = (g: THREE.Group, p: Vec, r: number, color: number) => {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 24), new THREE.MeshBasicMaterial({ color }));
  m.position.set(p.x, p.y, 0.05);
  g.add(m);
};

const BLUE = 0x8fb5d6; // the deck's colour for C and T
for (let n = 0; n < TERMS; n++) {
  const x = panelX(n);
  const g = room(x);
  const path = findPath(n);
  g.add(polyline(path.map((p) => [p.x, p.y, 0.03] as Pt), { color: C.bone, width: 3 }));
  for (const p of path.slice(1, -1)) dot2(g, p, 0.13, C.bone);
  dot2(g, CAM, 0.22, BLUE);
  stage.add(g);

  // The term over its room: C, then T^n, then E, C and T in the deck's blue.
  const top = Y0 + ROOM_HALF.y * S + 0.3;
  const parts: [string, number, number][] = [['C', BLUE, 0.42]];
  if (n >= 1) parts.push(['T', BLUE, 0.42]);
  if (n >= 2) parts.push([String(n), BLUE, 0.27]);
  parts.push(['E', C.bone, 0.42]);
  const row = new THREE.Group();
  row.position.set(x, top, 0);
  const pieces = parts.map(([t, color, size]) => label(t, { size, color, anchorX: 'left', anchorY: 'bottom-baseline' }));
  pieces.forEach((p) => {
    p.visible = false;
    row.add(p);
  });
  stage.add(row);
  let laid = false;
  stage.frame(() => {
    if (laid) return;
    const info = pieces.map((q) => (q as unknown as { textRenderInfo?: { blockBounds: number[] } }).textRenderInfo);
    if (info.some((i) => !i)) return;
    laid = true;
    const w = info.map((i) => i!.blockBounds[2]! - i!.blockBounds[0]!);
    const total = w.reduce((a, b) => a + b + 0.03, -0.03);
    let cx = -total / 2;
    pieces.forEach((q, i) => {
      q.position.set(cx, parts[i]![2] < 0.4 ? 0.2 : 0, 0);
      q.visible = true;
      cx += w[i]! + 0.03;
    });
  });

  // The path's length under its room, and a + between the rooms.
  stage.add(label(`length ${n + 1}`, { size: 0.22, color: C.ash, anchorX: 'center', anchorY: 'top', position: [x, Y0 - ROOM_HALF.y * S - 0.18, 0] }));
  stage.add(label('+', { size: 0.42, color: C.bone, anchorX: 'center', anchorY: 'middle', position: [x + PANEL_W / 2 + GAP / 2, Y0, 0] }));
}
stage.add(label('⋯', { size: 0.42, color: C.bone, anchorX: 'left', anchorY: 'middle', position: [panelX(TERMS - 1) + PANEL_W / 2 + GAP - 0.05, Y0, 0] }));

stage.start();
