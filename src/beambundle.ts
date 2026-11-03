/**
 * The beam room's state space: its boundary as framed curves for `bundle2d`,
 * and the light actually stored over it.
 *
 * Shared by `state-space-beam` (the bundle grows out of the room) and
 * `state-space-beam-stored` (it is chopped into cells and unrolled into the
 * grids a renderer keeps). The room is `beamscene`'s, scaled by K to the framing
 * of the state-space demos.
 *
 * - **The walls**: one closed curve, the rounded rectangle, counter-clockwise so
 *   the left normal n points into the room. Over it, a torus. It comes apart at
 *   the middle of each rounded corner into four panels: floor, right wall,
 *   ceiling, left wall.
 * - **The two mirrors**: open curves. A mirror reflects on both sides, but what
 *   is stored is outgoing light, and the front's outgoing hemisphere and the
 *   back's are complementary halves of one circle, each direction once. So over
 *   a mirror the stored field lives on a **cylinder**, curve × circle (Steve,
 *   2026-10-30: "one single circle, so they are cylinders").
 *
 * These demos draw the **domain** of a stored light field, not its values:
 * every piece is coloured by what it is made of (Steve, 2026-10-30: "we aren't
 * trying to show a light field right now, we are just trying to show the
 * domain of a discretized light field map"). On a wall the half of the circle
 * pointing out of the surface (the outgoing hemisphere, ω·n > 0) is bright; the
 * half pointing into the wall is dim, since nothing leaves that way.
 */

import * as THREE from 'three';
import type { Boundary } from './bundle2d';
import { ROOM_HALF, ROOM_R, FLAT, ARC, RED, GREEN, WHITE, spectrum, toXYZ } from './beamscene';
import { hemisphereTint } from './bundle2d';
import { C } from './style';
import { xyzToHex } from './response';

export const HALF_WIDTH = 2.6;
export const K = HALF_WIDTH / ROOM_HALF.x;
export const R_FIBER = 0.15;
/** The mirrors' cylinders stand clear of the walls' torus: the curved mirror ends close to the ceiling. */
export const MIRROR_RISE = 2.6 * R_FIBER;

type P = [number, number];

/** Frame a polyline: tangent angle unwrapped, arclength accumulated. Closed loops wrap. */
function frame(pts: P[], closed: boolean, panels: number[]): Boundary {
  const n = pts.length;
  const b: Boundary = { nodes: [], segMat: [], segCell: [], segPanel: [], length: 0, cells: 0, turn: 0 };
  let s = 0;
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const a = closed ? pts[(i - 1 + n) % n]! : pts[Math.max(0, i - 1)]!;
    const c = closed ? pts[(i + 1) % n]! : pts[Math.min(n - 1, i + 1)]!;
    let th = Math.atan2(c[1] - a[1], c[0] - a[0]);
    if (i > 0) {
      while (th - prev > Math.PI) th -= 2 * Math.PI;
      while (th - prev < -Math.PI) th += 2 * Math.PI;
    }
    prev = th;
    b.nodes.push({ x: pts[i]![0], y: pts[i]![1], th, s });
    b.segMat.push(0);
    b.segCell.push(b.cells++);
    b.segPanel.push(panels[i]!);
    if (closed || i < n - 1) {
      const q = pts[(i + 1) % n]!;
      s += Math.hypot(q[0] - pts[i]![0], q[1] - pts[i]![1]);
    }
  }
  b.length = s;
  if (closed) {
    const turn = b.nodes[n - 1]!.th - b.nodes[0]!.th;
    b.turn = Math.sign(turn) * 2 * Math.PI;
  }
  return b;
}

/** Arclength of each wall panel, floor, right, ceiling, left: a straight run and two half corners. */
const HX = (ROOM_HALF.x - ROOM_R) * K;
const HY = (ROOM_HALF.y - ROOM_R) * K;
const RC = ROOM_R * K;
const HALF_CORNER = (Math.PI / 4) * RC;
export const WALL_W = [2 * HX + 2 * HALF_CORNER, 2 * HY + 2 * HALF_CORNER, 2 * HX + 2 * HALF_CORNER, 2 * HY + 2 * HALF_CORNER];

/**
 * The walls, counter-clockwise from the middle of the bottom-left corner, about
 * `step` apart. Each panel is half a corner, a wall, half a corner.
 */
export function wallBoundary(step: number): Boundary {
  const pts: P[] = [];
  const panels: number[] = [];
  const arc = (cx: number, cy: number, a0: number, a1: number, panel: number) => {
    const m = Math.max(1, Math.round(((Math.abs(a1 - a0) * Math.PI) / 180) * RC / step));
    for (let k = 0; k < m; k++) {
      const a = ((a0 + ((a1 - a0) * k) / m) * Math.PI) / 180;
      pts.push([cx + RC * Math.cos(a), cy + RC * Math.sin(a)]);
      panels.push(panel);
    }
  };
  const run = (x0: number, y0: number, x1: number, y1: number, panel: number) => {
    const m = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / step));
    for (let k = 0; k < m; k++) {
      pts.push([x0 + ((x1 - x0) * k) / m, y0 + ((y1 - y0) * k) / m]);
      panels.push(panel);
    }
  };
  arc(-HX, -HY, 225, 270, 0);
  run(-HX, -HY - RC, HX, -HY - RC, 0);
  arc(HX, -HY, 270, 315, 0);
  arc(HX, -HY, 315, 360, 1);
  run(HX + RC, -HY, HX + RC, HY, 1);
  arc(HX, HY, 0, 45, 1);
  arc(HX, HY, 45, 90, 2);
  run(HX, HY + RC, -HX, HY + RC, 2);
  arc(-HX, HY, 90, 135, 2);
  arc(-HX, HY, 135, 180, 3);
  run(-HX - RC, HY, -HX - RC, -HY, 3);
  arc(-HX, -HY, 180, 225, 3);
  return frame(pts, true, panels);
}

/** A mirror as an open curve of `cells` segments. */
export function mirrorBoundary(which: 'flat' | 'arc', cells: number): Boundary {
  const pts: P[] = [];
  for (let k = 0; k <= cells; k++) {
    if (which === 'flat') {
      const t = -FLAT.half + (2 * FLAT.half * k) / cells;
      pts.push([(FLAT.mid.x + FLAT.dir.x * t) * K, (FLAT.mid.y + FLAT.dir.y * t) * K]);
    } else {
      const a = ((ARC.a0 + ((ARC.a1 - ARC.a0) * k) / cells) * Math.PI) / 180;
      pts.push([(ARC.c.x + ARC.r * Math.cos(a)) * K, (ARC.c.y + ARC.r * Math.sin(a)) * K]);
    }
  }
  return frame(pts, false, pts.map(() => 0));
}

export const mirrorLength = (which: 'flat' | 'arc') =>
  which === 'flat' ? 2 * FLAT.half * K : (((ARC.a1 - ARC.a0) * Math.PI) / 180) * ARC.r * K;

// --- Colour: what each piece is made of -------------------------------------------------

const tmp = new THREE.Color();
const ONE_Y = toXYZ(spectrum(() => 1))[1];
/** A reflectance spectrum's colour under white light, linear RGB. */
function albedoRGB(a: Float64Array): [number, number, number] {
  const [X, Y, Z] = toXYZ(a);
  tmp.setHex(xyzToHex(X / ONE_Y, Y / ONE_Y, Z / ONE_Y));
  return [tmp.r, tmp.g, tmp.b];
}
const RED_RGB = albedoRGB(RED);
const GREEN_RGB = albedoRGB(GREEN);
const WHITE_RGB = albedoRGB(WHITE);
const MIRROR_RGB = (() => {
  tmp.setHex(C.slate);
  return [tmp.r, tmp.g, tmp.b] as [number, number, number];
})();
const EDGE = 0.3 * K;
/** The wall's material at x, as `beamscene` assigns it: left red, right green, floor and ceiling white. */
const wallRGB = (x: number) => (x < -ROOM_HALF.x * K + EDGE ? RED_RGB : x > ROOM_HALF.x * K - EDGE ? GREEN_RGB : WHITE_RGB);

/**
 * Colours over a boundary at fiber angle φ_k = −π/2 + 2π(k + off)/count from the
 * left normal, per segment midpoint (`mid`) or per node: the piece's material,
 * with `hemisphereTint` marking the outgoing half on a wall. A mirror's circle is
 * outgoing all round (front half and back half), so it is not tinted. Nothing
 * here is light: these demos draw the domain of a light field, not one.
 */
export function colourOver(b: Boundary, count: number, opts: { mid: boolean; off: number; wall: boolean }): Float32Array {
  const N = b.nodes.length;
  const out = new Float32Array(N * count * 3);
  for (let i = 0; i < N; i++) {
    const a = b.nodes[i]!;
    const c = b.nodes[(i + 1) % N]!;
    const x = opts.mid ? (a.x + c.x) / 2 : a.x;
    const mat = opts.wall ? wallRGB(x) : MIRROR_RGB;
    for (let k = 0; k < count; k++) {
      const phi = -Math.PI / 2 + (2 * Math.PI * (k + opts.off)) / count;
      const tint = opts.wall ? hemisphereTint(Math.cos(phi)) : 1;
      out.set([mat[0] * tint, mat[1] * tint, mat[2] * tint], (i * count + k) * 3);
    }
  }
  return out;
}
