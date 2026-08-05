/**
 * The state space of the 2D room, and the machinery for drawing it.
 *
 * Part I ends by restricting radiance to the boundary of the scene:
 *
 *     X = T¹M|_Σ = ⊔_{p∈Σ} S¹_p ,      L = ℓ|_X .
 *
 * In this room Σ has two components — the box's boundary and the object's —
 * each a circle. Over each sits a circle of directions, and both bundles are
 * trivial, so X is two tori. `state-space` grows them, `state-space-discrete`
 * chops them into cells, `state-space-stored` unrolls the cells into the five
 * flat arrays a renderer actually holds — one per wall, plus the object's. The
 * three are meant to play as one unbroken shot, so everything they share lives
 * here.
 *
 * ## The lift
 *
 * At p the circle of directions is drawn where the rest of the deck draws it:
 * flat in the scene plane, radius r about p. The bundle appears by rotating that
 * circle by α about p's own **normal line**,
 *
 *     x(s, φ, α) = p(s) + r·( cos φ · n(s) + sin φ · (cos α · t(s) + sin α · ẑ) ),
 *
 * with φ measured from the outward normal n. At α = 0 this is the flat circle of
 * `radiance-2d`; at α = π/2 the circles have swept out the tube around the
 * curve, which is the torus. The directions ±n stay pinned in the plane the
 * whole way, and the grazing directions ±t lift to ±ẑ.
 *
 * It has to be the normal line. Rotating about the tangent instead puts every
 * circle in a plane *containing* the curve, and the family sweeps out a
 * self-intersecting mess rather than a tube.
 *
 * A useful consequence: the surface normal of the lifted sheet is exactly
 * cos φ · n + sin φ · w, with no correction from the curvature of the base —
 * ∂x/∂s stays parallel to t for a straight wall, a circle and a corner alike.
 * So the shading is analytic everywhere.
 *
 * ## Corners
 *
 * The box is sharp, and n jumps by 90° at each corner. The corner therefore
 * carries a *fan* of frames turning n through the right angle, sweeping out a
 * lune of the sphere of radius r about the corner — the honest limit of a
 * rounded join. Outside the turn it fills the gap; inside it overlaps the two
 * arms, which is what a tube around a sharp corner does.
 *
 * The fan is a drawing device, not part of Σ: over a corner point there is one
 * circle of directions, drawn many times. It carries zero arclength, so it opens
 * as the circles lift and closes again as they unroll, and it occupies no
 * columns at all in the flat array. Nothing false survives into the data.
 *
 * ## The cut
 *
 * Unrolling a fiber needs somewhere to cut it, and that choice is the layout of
 * the stored array. The cut is at a **grazing** direction, φ = −π/2, which is
 * the underside of the tube. The array's vertical coordinate is then
 * v = (φ + π/2)/2π, so the outgoing hemisphere ω·n > 0 is exactly the bottom
 * half of the texture and the incoming hemisphere exactly the top half. The tube
 * splits along its underside and peels upward.
 */

import * as THREE from 'three';
import { C } from './style';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { EXPORT_W, EXPORT_H } from './stage';
import { room, FACETS, apothem, facetAngle } from './scene2d';

// ---------------------------------------------------------------------------
// The room these three demos are set in
// ---------------------------------------------------------------------------

/**
 * Half-width. Larger than the radiance demos use: the tori have to read as
 * solid bodies, and the camera tilts away from square-on, which foreshortens
 * everything vertically. The camera zooms in as it tilts to compensate.
 */
export const HALF_WIDTH = 2.2;
export const ROOM = room(HALF_WIDTH);
export const RX = ROOM.rx;
export const RY = ROOM.ry;
export const DISC = ROOM.disc;
export const WALL = ROOM.wall;
export const EMIT_HALF = ROOM.emitHalf;

/** Patches per wall, and facets on the object — the deck's discrete room. */
export const NW = 36;
export const ND = FACETS;
/** Direction bins. Coarse enough to count. */
export const NDIR = 12;

/**
 * Fiber radius.
 *
 * Two things pull on it. Cells should come out about square, which ties it to
 * the patch spacing: a wall patch is 2·RX/NW ≈ 0.122 long, and a direction bin
 * is 2πr/NDIR ≈ 0.110 tall at this radius, so they agree. And the tube has to
 * stay *thin against the room* — at r = 0.3 it swallowed the walls entirely and
 * the room stopped being recognisable, which defeats the whole point of growing
 * the bundle out of a picture the audience already knows.
 *
 * The object's cells come out about twice as wide as the walls'. That is not a
 * drawing error: it is chopped into 16 facets against the walls' 144 patches,
 * so its share of Σ really is sampled coarser.
 */
export const R_FIBER = 0.21;

/**
 * How far the object's torus floats above the box's.
 *
 * The object rests on the floor, so Σ's two components are *tangent* — and two
 * tubes of radius r around curves that touch do not merely touch: they overlap
 * wherever the curves are closer than 2r, which here is a 144° arc of the
 * object's boundary. The interpenetration is a true consequence of the tangency
 * and it looks like a mistake, so the object's torus is lifted clear.
 *
 * This is the one place these demos move a piece of X away from where it sits.
 * What it costs is the shared fiber circle over the contact point; what it buys
 * is two tori you can actually see. 2.6r puts the underside of the small one
 * comfortably above the top of the large one.
 */
export const OBJ_RISE = 2.6 * R_FIBER;

/** Fan columns at each box corner, smooth and discretised. */
export const FAN_SMOOTH = 20;
export const FAN_CELLS = 5;

// ---------------------------------------------------------------------------
// The boundary, as a framed closed curve
// ---------------------------------------------------------------------------

export interface Node {
  /** Base point on Σ. */
  x: number;
  y: number;
  /** Tangent angle, accumulated without wrapping so the curve can be straightened. */
  th: number;
  /** Arclength from the start of the loop. Fan nodes repeat their predecessor's. */
  s: number;
}

export interface Boundary {
  nodes: Node[];
  /** Material of the segment node i → node i+1, indexed into MAT_HEX. */
  segMat: number[];
  /** Data cell of that segment, or −1 if it is a corner fan. */
  segCell: number[];
  /**
   * Which flat rectangle the segment ends up in. The box unrolls into four
   * panels, one per wall, rather than one long strip: the corners are where the
   * fans live and the fans hold no data, so cutting there discards nothing and
   * the result is the five arrays a renderer would actually keep. Fans are −1.
   */
  segPanel: number[];
  /** Total arclength of the loop. */
  length: number;
  /** Number of data cells — segments that are genuinely patches of Σ. */
  cells: number;
  /**
   * Total turning: +2π traversed counter-clockwise, −2π clockwise.
   *
   * This is not bookkeeping, it is the orientation. n is the *left* normal of
   * the direction of travel and it has to point away from the solid — into the
   * room. The room is inside the box, so the box runs counter-clockwise; the
   * room is outside the object, so the object runs **clockwise**. Get this wrong
   * on the object and n points into it: the bright half of the fiber faces the
   * wrong way, every form factor from the object is culled by cos < 0, and its
   * array comes out black.
   */
  turn: number;
}

/** Outward normal from the tangent angle: n is the left normal of travel. */
export const normalOf = (th: number): [number, number] => [-Math.sin(th), Math.cos(th)];

function pushRun(
  b: Boundary,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  th: number,
  mat: number,
  count: number,
  panel = 0,
): void {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const s0 = b.length;
  for (let k = 0; k < count; k++) {
    const u = k / count;
    b.nodes.push({ x: x0 + (x1 - x0) * u, y: y0 + (y1 - y0) * u, th, s: s0 + len * u });
    b.segMat.push(mat);
    b.segCell.push(b.cells++);
    b.segPanel.push(panel);
  }
  b.length = s0 + len;
}

/**
 * A corner: the same point, with the frame turning through 90°, carrying no
 * arclength. Split at its midpoint between the two walls that meet there, since
 * the corner belongs to the closure of both.
 */
function pushFan(
  b: Boundary,
  x: number,
  y: number,
  th0: number,
  matBefore: number,
  matAfter: number,
  count: number,
): void {
  for (let k = 0; k < count; k++) {
    b.nodes.push({ x, y, th: th0 + (Math.PI / 2) * (k / count), s: b.length });
    b.segMat.push(k < count / 2 ? matBefore : matAfter);
    b.segCell.push(-1);
    b.segPanel.push(-1);
  }
}

/**
 * The box's boundary, traversed counter-clockwise so the left normal points into
 * the room. Material order matches `patches()` in scene2d: floor, right,
 * ceiling, left.
 *
 * The loop *starts at the bottom-left corner* rather than at the floor's left
 * end, which looks arbitrary and is not: the camera views the room from below,
 * so the near side of the box torus is the bottom corner, the floor, and the
 * other bottom corner. Starting here makes that near side one contiguous run of
 * segments, which is what lets it be split off and faded so the object's torus
 * is visible inside the ring. Tangent angles then run −π/2 → 3π/2.
 */
export function boxBoundary(perWall: number, fan: number): Boundary {
  const b: Boundary = { nodes: [], segMat: [], segCell: [], segPanel: [], length: 0, cells: 0, turn: 2 * Math.PI };
  const nx = Math.max(2, Math.round(perWall));
  const ny = Math.max(2, Math.round((perWall * RY) / RX));
  const H = Math.PI / 2;

  pushFan(b, -RX, -RY, -H, 3, 0, fan);
  pushRun(b, -RX, -RY, RX, -RY, 0, 0, nx, 0);
  pushFan(b, RX, -RY, 0, 0, 1, fan);
  pushRun(b, RX, -RY, RX, RY, H, 1, ny, 1);
  pushFan(b, RX, RY, H, 1, 2, fan);
  pushRun(b, RX, RY, -RX, RY, 2 * H, 2, nx, 2);
  pushFan(b, -RX, RY, 2 * H, 2, 3, fan);
  pushRun(b, -RX, RY, -RX, -RY, 3 * H, 3, ny, 3);

  // The emitting strip is part of Σ like anything else, so the state space over
  // it is coloured by what it is: the one stretch of boundary that emits. It
  // shows as an ochre band on the ceiling's torus and carries all the way
  // through to a band of columns in the stored array.
  for (let i = 0; i < b.nodes.length; i++) {
    if (b.segMat[i] === 2 && Math.abs(b.nodes[i].x) < EMIT_HALF) b.segMat[i] = 5;
  }
  return b;
}

/** Segments of `boxBoundary` making up the near side: corner, floor, corner. */
export function boxNearSegments(perWall: number, fan: number): number {
  return 2 * fan + Math.max(2, Math.round(perWall));
}

/**
 * The object as a smooth circle. The loop starts at the contact point with the
 * floor, so the generator circle that sweeps this torus begins where the two
 * components of Σ meet.
 */
export function circleBoundary(count: number): Boundary {
  const b: Boundary = { nodes: [], segMat: [], segCell: [], segPanel: [], length: 0, cells: 0, turn: -2 * Math.PI };
  // Clockwise from the contact point with the floor, so the left normal points
  // out into the room and the loop starts where the two components of Σ meet.
  const start = -Math.PI / 2;
  for (let k = 0; k < count; k++) {
    const a = start - (2 * Math.PI * k) / count;
    b.nodes.push({
      x: DISC.x + DISC.r * Math.cos(a),
      y: DISC.y + DISC.r * Math.sin(a),
      th: a - Math.PI / 2,
      s: DISC.r * (start - a),
    });
    b.segMat.push(4);
    b.segCell.push(b.cells++);
    b.segPanel.push(0);
  }
  b.length = 2 * Math.PI * DISC.r;
  return b;
}

/**
 * The object as the deck's 16-gon: one node per facet, each carrying that
 * facet's own constant normal. DISC.r is the circumradius, so the vertices sit
 * where the circle was and the two versions differ by at most
 * r(1 − cos(π/16)) ≈ 0.012 — invisible, which is what lets the smooth torus and
 * the cell torus cross-fade in place.
 */
export function polygonBoundary(): Boundary {
  const b: Boundary = { nodes: [], segMat: [], segCell: [], segPanel: [], length: 0, cells: 0, turn: -2 * Math.PI };
  const ap = apothem(DISC.r);
  const side = 2 * DISC.r * Math.sin(Math.PI / ND);
  // Clockwise, starting at the facet whose midpoint is lowest — the contact
  // point with the floor.
  const k0 = (Math.round((3 * ND) / 4) + ND - 1) % ND;
  for (let j = 0; j < ND; j++) {
    const a = facetAngle((k0 - j + ND) % ND);
    const th = a - Math.PI / 2;
    // Travelling clockwise, the facet is entered at its far vertex.
    b.nodes.push({
      x: DISC.x + ap * Math.cos(a) - (side / 2) * Math.cos(th),
      y: DISC.y + ap * Math.sin(a) - (side / 2) * Math.sin(th),
      th,
      s: side * j,
    });
    b.segMat.push(4);
    b.segCell.push(b.cells++);
    b.segPanel.push(0);
  }
  // Unwrap downwards, so straightening opens the polygon instead of winding it
  // back the other way.
  for (let j = 1; j < ND; j++) {
    while (b.nodes[j].th > b.nodes[j - 1].th) b.nodes[j].th -= 2 * Math.PI;
  }
  b.length = side * ND;
  return b;
}

/** Interpolated frame at parameter u through segment i. */
function sampleAt(b: Boundary, i: number, u: number, out: { x: number; y: number; th: number }) {
  const n = b.nodes.length;
  const a = b.nodes[i];
  const wrap = i === n - 1;
  const c = b.nodes[wrap ? 0 : i + 1];
  const cth = wrap ? b.nodes[0].th + b.turn : c.th;
  out.x = a.x + (c.x - a.x) * u;
  out.y = a.y + (c.y - a.y) * u;
  out.th = a.th + (cth - a.th) * u;
}

/** Arclength of segment i. */
function segLen(b: Boundary, i: number): number {
  const n = b.nodes.length;
  return (i === n - 1 ? b.length : b.nodes[i + 1].s) - b.nodes[i].s;
}

// ---------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------

/**
 * One colour per surface, in the index order patches() uses, with the emitting
 * stretch of the ceiling added at the end.
 */
export const MAT_HEX = [C.moss, C.slate, C.ash, C.rust, C.blue, C.ochre];
const MAT_RGB = MAT_HEX.map((h) => {
  const c = new THREE.Color(h);
  return [c.r, c.g, c.b] as [number, number, number];
});

/** Fixed key direction for the baked shading. */
const LX = 0.34;
const LY = -0.52;
const LZ = 0.78;

/**
 * Shading is baked into the vertex colours rather than lit by a rig.
 *
 * These surfaces are drawn unlit so they hold exact palette values, and an unlit
 * torus has no form at all — so a fixed Lambert term against one direction is
 * multiplied in. It is a readability choice, and the only thing in these demos
 * that is neither geometry nor data. It is switched off once the arrays carry
 * real radiance, where a colour has to be the value it claims to be; by then the
 * arrays are flat and need no form.
 */
export function shade(nx: number, ny: number, nz: number): number {
  return 0.42 + 0.58 * Math.max(0, nx * LX + ny * LY + nz * LZ);
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Brightness by direction: the half of the fiber pointing into the room is
 * bright, the half pointing into the solid is dark. Nothing is being measured —
 * it marks which hemisphere is which, so the split reads on the torus and lands
 * as a clean horizontal line once the fiber is unrolled.
 */
export function hemisphereTint(cosPhi: number): number {
  return 0.24 + 0.76 * smoothstep(-0.18, 0.3, cosPhi);
}

// ---------------------------------------------------------------------------
// Placing a point of the bundle
// ---------------------------------------------------------------------------

export interface Pose {
  /** The lift: 0 = flat circle in the scene plane, π/2 = tube. */
  alpha: number;
  /** Fiber radius. */
  radius: number;
  /**
   * How far the whole bundle stands off the scene plane.
   *
   * At 0 the tube is centred on Σ, which is where it belongs — and which buries
   * half of it in the wall it sits on, so the room underneath stops reading.
   * Driven up to the fiber radius as the circles lift, the finished tube rests
   * *on* the plane instead of through it, and the room stays visible beneath.
   * A staging offset, nothing more: the circle of directions at p is still the
   * circle of directions at p.
   */
  rise: number;
  /** 0 = fiber is a circle, 1 = unrolled into a straight segment. */
  open: number;
  /** 0 = boundary curve as it is, 1 = straightened into a line. */
  flatten: number;
  /**
   * How far the panels have separated into their stack, 0..1.
   *
   * Straightening alone would give the box one strip sixteen units long and one
   * cell tall, which is a true picture of the array and an unreadable one. The
   * four walls are four separate runs of patches with a corner between them, so
   * they are shown as four separate arrays — which is also how a renderer would
   * keep them.
   */
  split: number;
  /**
   * Per-panel offset once split: two numbers per panel, the first along the
   * straightened base line and the second up the ribbon.
   */
  panels: Float64Array | null;
}

export const POSE_FLAT: Pose = {
  alpha: 0,
  radius: R_FIBER,
  rise: 0,
  open: 0,
  flatten: 0,
  split: 0,
  panels: null,
};

/**
 * Straightened base points, one per node, cached per (boundary, flatten).
 *
 * Scaling the accumulated turning down to zero and re-integrating the tangent is
 * what keeps this an isometry of the base curve: the corners open, the circle
 * unbends, and arclength is preserved throughout.
 */
function straighten(b: Boundary, flat: number, out: Float64Array): void {
  const target = b.nodes[0].th;
  let x = b.nodes[0].x;
  let y = b.nodes[0].y;
  for (let i = 0; i < b.nodes.length; i++) {
    out[2 * i] = x;
    out[2 * i + 1] = y;
    const th = b.nodes[i].th + flat * (target - b.nodes[i].th);
    const ds = segLen(b, i);
    x += ds * Math.cos(th);
    y += ds * Math.sin(th);
  }
}

/**
 * A point of the bundle, through every stage.
 *
 *   alpha    the lift — flat circle in the plane (0) to tube (π/2)
 *   open     the fiber unrolling — circle (0) to straight segment (1), hinged at
 *            the cut so the tube splits along its underside and peels upward
 *   flatten  the base straightening — the corners open and the loop becomes a
 *            line, carrying the standing ribbon with it
 *
 * The finished object at open = flatten = 1 is a flat rectangle standing in a
 * vertical plane; laying it into the frame is a rigid transform on the mesh, so
 * nothing here has to know about layout.
 */
const scratch = { x: 0, y: 0, th: 0 };

function place(
  out: Float32Array,
  o: number,
  b: Boundary,
  straightPts: Float64Array | null,
  i: number,
  u: number,
  phi: number,
  pose: Pose,
  normal: Float32Array | null,
  no: number,
): void {
  sampleAt(b, i, u, scratch);
  let px = scratch.x;
  let py = scratch.y;
  let pz = pose.rise;
  let th = scratch.th;

  if (straightPts) {
    th += pose.flatten * (b.nodes[0].th - th);
    px = straightPts[2 * i] + u * segLen(b, i) * Math.cos(th);
    py = straightPts[2 * i + 1] + u * segLen(b, i) * Math.sin(th);
  }

  // Once straight, each panel slides into its own row of the stack. The fans
  // have collapsed to nothing by then — their turning is what straightening
  // takes to zero — so it does not matter which panel carries them.
  if (pose.split > 0 && pose.panels) {
    // Fans are −1 and have collapsed to nothing by now — straightening is what
    // takes their turning to zero — so they can ride with panel 0 unseen.
    const o2 = 2 * Math.max(0, b.segPanel[i]);
    const d = pose.split * pose.panels[o2];
    const th0 = b.nodes[0].th;
    px += d * Math.cos(th0);
    py += d * Math.sin(th0);
    pz += pose.split * pose.panels[o2 + 1];
  }

  const tx = Math.cos(th);
  const ty = Math.sin(th);
  const nx = -ty;
  const ny = tx;

  // w = cos α · t + sin α · ẑ
  const ca = Math.cos(pose.alpha);
  const wx = tx * ca;
  const wy = ty * ca;
  const wz = Math.sin(pose.alpha);

  const r = pose.radius;

  // The surface normal is exactly cos φ · n + sin φ · w, curvature and all.
  if (normal) {
    const cp = Math.cos(phi);
    const sp = Math.sin(phi);
    normal[no] = cp * nx + sp * wx;
    normal[no + 1] = cp * ny + sp * wy;
    normal[no + 2] = sp * wz;
  }

  // The cut, at φ = −π/2: p − r·w. The sheet is hinged here and peels off it.
  const qx = px - r * wx;
  const qy = py - r * wy;
  const qz = pz - r * wz;

  // Frame at the cut. At open = 0 the fiber's tangent there is n and it bends
  // towards w; as it opens, that frame turns through a right angle so the
  // unrolled segment ends up along w — which is ẑ once the circles are lifted.
  const beta = pose.open * (Math.PI / 2);
  const cb = Math.cos(beta);
  const sb = Math.sin(beta);
  const ux = nx * cb + wx * sb;
  const uy = ny * cb + wy * sb;
  const uz = wz * sb;
  const vx = -nx * sb + wx * cb;
  const vy = -ny * sb + wy * cb;
  const vz = wz * cb;

  const sigma = r * (phi + Math.PI / 2);
  const kappa = (1 - pose.open) / r;
  let ox: number;
  let oy: number;
  let oz: number;
  if (kappa > 1e-6) {
    const rad = 1 / kappa;
    const a = kappa * sigma;
    const sa = Math.sin(a);
    const cc = 1 - Math.cos(a);
    ox = rad * (sa * ux + cc * vx);
    oy = rad * (sa * uy + cc * vy);
    oz = rad * (sa * uz + cc * vz);
  } else {
    ox = sigma * ux;
    oy = sigma * uy;
    oz = sigma * uz;
  }

  out[o] = qx + ox;
  out[o + 1] = qy + oy;
  out[o + 2] = qz + oz;
}

// ---------------------------------------------------------------------------
// Sheets
// ---------------------------------------------------------------------------

export interface SheetOpts {
  /** Per-cell RGB to display instead of the structural colouring. */
  data?: Float32Array | null;
  /** Cross-fade towards `data`, 0..1. Also fades the baked shading out. */
  dataMix?: number;
  /** Overall multiplier on the colours. */
  gain?: number;
}

export interface Sheet {
  readonly mesh: THREE.Mesh;
  /** The bulk of the surface. */
  readonly material: THREE.MeshBasicMaterial;
  /**
   * The near run, if the sheet was built with one — the arc between the camera
   * and everything else. Fading this is what lets the object's torus be seen
   * inside the ring of the box's, and it is the one piece of staging in these
   * demos that trades a physical fact (the ring is opaque) for legibility.
   */
  readonly nearMaterial?: THREE.MeshBasicMaterial;
  readonly boundary: Boundary;
  update(pose: Pose, opts?: SheetOpts): void;
  /** Draw only the first fraction of the loop — the generator sweeping it out. */
  reveal(f: number): void;
  /**
   * Draw only the arc between two fractions of the loop.
   *
   * This is how the smooth torus is replaced by the cell torus: rather than
   * cross-fading two surfaces sitting in the same place — which reads as a
   * muddle and needs transparency to sort itself out correctly — the generator
   * circle goes round a second time, with cells behind it and the smooth
   * surface still ahead of it. At every instant the two are disjoint.
   */
  revealRange(a: number, b: number): void;
}

/** Direction angle at fiber sample k of K, measured from the outward normal. */
const phiOf = (k: number, K: number) => -Math.PI / 2 + (2 * Math.PI * k) / K;

/**
 * Split the index buffer into a near run and the rest, each with its own
 * material — the near one drawn last, without writing depth, so lowering its
 * opacity actually reveals what is behind it.
 */
function splitGroups(
  geom: THREE.BufferGeometry,
  perSeg: number,
  near: number,
  far: THREE.MeshBasicMaterial,
): THREE.MeshBasicMaterial | undefined {
  if (near <= 0) return undefined;
  const nearMat = far.clone();
  nearMat.depthWrite = false;
  geom.clearGroups();
  geom.addGroup(near * perSeg, geom.index!.count - near * perSeg, 0);
  geom.addGroup(0, near * perSeg, 1);
  return nearMat;
}

/**
 * The smooth torus: one shared vertex per (node, fiber sample), so the surface
 * reads as a surface. Colour varies continuously along the fiber and jumps
 * between walls.
 */
export function smoothSheet(b: Boundary, fiberSamples = 72, near = 0): Sheet {
  const N = b.nodes.length;
  const K = fiberSamples;
  const pos = new Float32Array(N * K * 3);
  const nrm = new Float32Array(N * K * 3);
  const col = new Float32Array(N * K * 3);
  const idx = new Uint32Array(N * K * 6);
  for (let i = 0; i < N; i++) {
    const i1 = (i + 1) % N;
    for (let k = 0; k < K; k++) {
      const k1 = (k + 1) % K;
      const o = (i * K + k) * 6;
      const a = i * K + k;
      const bb = i * K + k1;
      const c = i1 * K + k1;
      const d = i1 * K + k;
      idx[o] = a;
      idx[o + 1] = bb;
      idx[o + 2] = c;
      idx[o + 3] = a;
      idx[o + 4] = c;
      idx[o + 5] = d;
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geom.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geom.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geom.setIndex(new THREE.BufferAttribute(idx, 1));
  geom.setDrawRange(0, idx.length);

  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    transparent: true,
  });
  const nearMaterial = splitGroups(geom, K * 6, near, material);
  const mesh = new THREE.Mesh(geom, nearMaterial ? [material, nearMaterial] : material);
  mesh.frustumCulled = false;

  const straightPts = new Float64Array(N * 2);

  return {
    mesh,
    material,
    nearMaterial,
    boundary: b,
    update(pose, opts = {}) {
      const gain = opts.gain ?? 1;
      if (pose.flatten > 0) straighten(b, pose.flatten, straightPts);
      const sp = pose.flatten > 0 ? straightPts : null;
      for (let i = 0; i < N; i++) {
        const mat = MAT_RGB[b.segMat[i]];
        for (let k = 0; k < K; k++) {
          const o = (i * K + k) * 3;
          const phi = phiOf(k, K);
          place(pos, o, b, sp, i, 0, phi, pose, nrm, o);
          const tint = hemisphereTint(Math.cos(phi)) * shade(nrm[o], nrm[o + 1], nrm[o + 2]) * gain;
          col[o] = mat[0] * tint;
          col[o + 1] = mat[1] * tint;
          col[o + 2] = mat[2] * tint;
        }
      }
      geom.attributes.position.needsUpdate = true;
      geom.attributes.normal.needsUpdate = true;
      geom.attributes.color.needsUpdate = true;
      geom.computeBoundingSphere();
    },
    reveal(f) {
      this.revealRange(0, f);
    },
    revealRange(a, b2) {
      const i0 = Math.max(0, Math.min(N, Math.round(a * N)));
      const i1 = Math.max(i0, Math.min(N, Math.round(b2 * N)));
      geom.setDrawRange(i0 * K * 6, (i1 - i0) * K * 6);
    },
  };
}

/**
 * The discretised torus: one independent flat-shaded quad per cell, inset so the
 * gaps between cells are visible. The inset is the same device the discrete room
 * uses for its wall patches — the gaps between patches are the point, so they
 * are drawn as gaps.
 */
export function cellSheet(b: Boundary, inset = 0.13, near = 0): Sheet {
  const N = b.nodes.length;
  const K = NDIR;
  const quads = N * K;
  const pos = new Float32Array(quads * 4 * 3);
  const nrm = new Float32Array(quads * 4 * 3);
  const col = new Float32Array(quads * 4 * 3);
  const idx = new Uint32Array(quads * 6);
  for (let q = 0; q < quads; q++) {
    const v = q * 4;
    const o = q * 6;
    idx[o] = v;
    idx[o + 1] = v + 1;
    idx[o + 2] = v + 2;
    idx[o + 3] = v;
    idx[o + 4] = v + 2;
    idx[o + 5] = v + 3;
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geom.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geom.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geom.setIndex(new THREE.BufferAttribute(idx, 1));
  geom.setDrawRange(0, idx.length);

  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    transparent: true,
  });
  const nearMaterial = splitGroups(geom, K * 6, near, material);
  const mesh = new THREE.Mesh(geom, nearMaterial ? [material, nearMaterial] : material);
  mesh.frustumCulled = false;

  const straightPts = new Float64Array(N * 2);
  const e = inset / 2;

  return {
    mesh,
    material,
    nearMaterial,
    boundary: b,
    update(pose, opts = {}) {
      const gain = opts.gain ?? 1;
      const data = opts.data ?? null;
      const mix = data ? Math.min(1, Math.max(0, opts.dataMix ?? 0)) : 0;
      if (pose.flatten > 0) straighten(b, pose.flatten, straightPts);
      const sp = pose.flatten > 0 ? straightPts : null;

      for (let i = 0; i < N; i++) {
        const mat = MAT_RGB[b.segMat[i]];
        const cell = b.segCell[i];
        for (let k = 0; k < K; k++) {
          const q = (i * K + k) * 12;
          const phi0 = phiOf(k + e, K);
          const phi1 = phiOf(k + 1 - e, K);
          place(pos, q, b, sp, i, e, phi0, pose, nrm, q);
          place(pos, q + 3, b, sp, i, e, phi1, pose, null, 0);
          place(pos, q + 6, b, sp, i, 1 - e, phi1, pose, null, 0);
          place(pos, q + 9, b, sp, i, 1 - e, phi0, pose, null, 0);

          // One normal and one colour for the whole cell: it is a cell, not a
          // sample of a surface, so it is shaded flat.
          const nX = nrm[q];
          const nY = nrm[q + 1];
          const nZ = nrm[q + 2];
          const phi = phiOf(k + 0.5, K);
          const lit = shade(nX, nY, nZ);
          const struct = hemisphereTint(Math.cos(phi)) * lit;
          let r: number;
          let g: number;
          let bl: number;
          if (mix > 0 && cell >= 0) {
            // The baked shading fades out with the structural colouring, so a
            // cell showing radiance shows only the radiance.
            const d = (cell * K + k) * 3;
            r = (mat[0] * struct * (1 - mix) + data![d] * mix) * gain;
            g = (mat[1] * struct * (1 - mix) + data![d + 1] * mix) * gain;
            bl = (mat[2] * struct * (1 - mix) + data![d + 2] * mix) * gain;
          } else {
            r = mat[0] * struct * gain;
            g = mat[1] * struct * gain;
            bl = mat[2] * struct * gain;
          }
          for (let v = 0; v < 4; v++) {
            nrm[q + v * 3] = nX;
            nrm[q + v * 3 + 1] = nY;
            nrm[q + v * 3 + 2] = nZ;
            col[q + v * 3] = r;
            col[q + v * 3 + 1] = g;
            col[q + v * 3 + 2] = bl;
          }
        }
      }
      geom.attributes.position.needsUpdate = true;
      geom.attributes.normal.needsUpdate = true;
      geom.attributes.color.needsUpdate = true;
      geom.computeBoundingSphere();
    },
    reveal(f) {
      this.revealRange(0, f);
    },
    revealRange(a, b2) {
      const i0 = Math.max(0, Math.min(N, Math.round(a * N)));
      const i1 = Math.max(i0, Math.min(N, Math.round(b2 * N)));
      geom.setDrawRange(i0 * K * 6, (i1 - i0) * K * 6);
    },
  };
}

// ---------------------------------------------------------------------------
// The generator circle
// ---------------------------------------------------------------------------

/**
 * The fiber over the point a fraction `f` of the way round the loop, as a closed
 * polyline — the circle of directions that sweeps the torus out.
 */
export function fiberPoints(
  b: Boundary,
  f: number,
  pose: Pose,
  segments = 96,
): [number, number, number][] {
  const N = b.nodes.length;
  const x = Math.min(N - 1e-6, Math.max(0, f * N));
  const i = Math.floor(x);
  const u = x - i;
  const buf = new Float32Array(3);
  const out: [number, number, number][] = [];
  for (let k = 0; k <= segments; k++) {
    place(buf, 0, b, null, i, u, phiOf(k, segments), pose, null, 0);
    out.push([buf[0], buf[1], buf[2]]);
  }
  return out;
}

/** Where on the loop the fiber over fraction `f` sits, in the scene plane. */
export function basePoint(b: Boundary, f: number): [number, number] {
  const N = b.nodes.length;
  const x = Math.min(N - 1e-6, Math.max(0, f * N));
  const i = Math.floor(x);
  sampleAt(b, i, x - i, scratch);
  return [scratch.x, scratch.y];
}

// ---------------------------------------------------------------------------
// The room, drawn flat in the scene plane
// ---------------------------------------------------------------------------

/** Deep tone for the ceiling slab — off the palette, since bone has no Deep. */
const BONE_DEEP = 0x2a2a26;

export interface RoomView {
  group: THREE.Group;
  /**
   * Discretise everything the wipe has already passed.
   *
   * The two arguments are how far round each component of Σ the generator has
   * travelled. A wall patch grows its seams, and a facet of the object goes
   * straight, exactly when the circle sweeping that component passes over it —
   * so the room does not discretise on its own schedule beside the tori, it
   * discretises *because* they do.
   */
  setWipe(fBox: number, fObj: number): void;
  /**
   * How far the wall slabs stand out beyond Σ.
   *
   * The slabs are how wall *thickness* is drawn — they are not part of Σ, which
   * is the inner edge — and they have a job to do that changes during the shot.
   * Square-on at the start they should be the deck's WALL, so the room is the
   * room. Once a tube of radius r is sitting on the boundary, WALL of wall would
   * be entirely covered and the room would stop being recognisable, so they grow
   * to WALL + r and keep the same sliver visible past the tube.
   */
  setWallThickness(s: number): void;
  /**
   * Show the wall slabs and the object's interior.
   *
   * Off by default. Drawn flat in z = 0 while the tori stand over them, they
   * read as a second, competing picture rather than as the room the bundle sits
   * on — so what these demos keep of Σ is Σ itself, one bright segment per
   * patch, and nothing behind it.
   */
  setScenery(on: boolean): void;
  setOpacity(a: number): void;
}

/**
 * The same room the rest of the deck is set in, lying in z = 0 — which is where
 * Σ genuinely is, so the tori pass through the wall slabs rather than floating
 * above them. Half of each tube is inside the solid, and that is the truth: the
 * directions on that side of the fiber point into the wall.
 *
 * The boundary is drawn from the *cell* boundaries, one bright segment per patch
 * of Σ. That is what lets the room discretise in lockstep with the tori: patch i
 * grows its seams when the generator circle passes segment i, because they are
 * the same segment i.
 */
export function buildRoomView(box: Boundary, obj: Boundary): RoomView {
  const group = new THREE.Group();
  const mats: LineMaterialLike[] = [];
  const track = <T extends THREE.Object3D>(o: T): T => {
    const m = (o as unknown as { material?: unknown }).material;
    if (m) mats.push(m as LineMaterialLike);
    group.add(o);
    return o;
  };

  const unit = new THREE.PlaneGeometry(1, 1);
  const slab = (color: number) =>
    track(new THREE.Mesh(unit, new THREE.MeshBasicMaterial({ color, transparent: true })));
  const floorSlab = slab(C.mossDeep);
  const rightSlab = slab(C.slateDeep);
  const ceilSlab = slab(BONE_DEEP);
  const leftSlab = slab(C.rustDeep);

  const setWallThickness = (S: number) => {
    floorSlab.position.set(0, -RY - S / 2, -0.002);
    floorSlab.scale.set(2 * RX + 2 * S, S, 1);
    ceilSlab.position.set(0, RY + S / 2, -0.002);
    ceilSlab.scale.set(2 * RX + 2 * S, S, 1);
    rightSlab.position.set(RX + S / 2, 0, -0.002);
    rightSlab.scale.set(S, 2 * RY, 1);
    leftSlab.position.set(-RX - S / 2, 0, -0.002);
    leftSlab.scale.set(S, 2 * RY, 1);
  };
  setWallThickness(WALL);

  // --- the object's interior ------------------------------------------------
  // Sampled at SUB points per facet, so it is a circle before the wipe and the
  // 16-gon after it, with each facet flattening as the wipe reaches it.
  const SUB = 6;
  const NPT = ND * SUB;
  const fillPos = new Float32Array((NPT + 2) * 3);
  const fillGeom = new THREE.BufferGeometry();
  fillGeom.setAttribute('position', new THREE.BufferAttribute(fillPos, 3));
  const fillIdx: number[] = [];
  for (let i = 0; i < NPT; i++) fillIdx.push(0, i + 1, i + 2);
  fillGeom.setIndex(fillIdx);
  const fill = new THREE.Mesh(
    fillGeom,
    new THREE.MeshBasicMaterial({ color: C.blueDeep, transparent: true, side: THREE.DoubleSide }),
  );
  fill.position.z = -0.001;
  track(fill);

  // --- the boundary, one segment per patch ----------------------------------
  // A single LineSegments2 rather than two hundred separate lines: the whole
  // boundary is rewritten every frame during the wipe, and this is one buffer
  // and one draw call.
  const boxSegs = box.segCell.filter((c) => c >= 0).length;
  const SEGS = boxSegs + ND * SUB;
  const epos = new Float32Array(SEGS * 6);
  const ecol = new Float32Array(SEGS * 6);
  const egeom = new LineSegmentsGeometry();
  egeom.setPositions(epos);
  egeom.setColors(ecol);
  const emat = new LineMaterial({ linewidth: 5, vertexColors: true, transparent: true, opacity: 1 });
  emat.resolution.set(EXPORT_W, EXPORT_H);
  const edges = new LineSegments2(egeom, emat);
  edges.frustumCulled = false;
  edges.renderOrder = 4;
  group.add(edges);
  mats.push(emat as unknown as LineMaterialLike);
  const eposBuf = (egeom.attributes.instanceStart as THREE.InterleavedBufferAttribute)
    .data as THREE.InstancedInterleavedBuffer;
  const ecolBuf = (egeom.attributes.instanceColorStart as THREE.InterleavedBufferAttribute)
    .data as THREE.InstancedInterleavedBuffer;

  /** Fraction of a patch eaten by the seam at each end, once discretised. */
  const GAP = 0.11;
  const cosHalf = Math.cos(Math.PI / ND);
  const wedgeOf = (a: number) => {
    const w = 2 * Math.PI / ND;
    return (((a % w) + w) % w) - w / 2;
  };
  /** Radius of the object's outline at angle a, morphed by m towards the polygon. */
  const radiusAt = (a: number, m: number) => {
    const rp = (DISC.r * cosHalf) / Math.cos(wedgeOf(a));
    return DISC.r + (rp - DISC.r) * m;
  };

  const put = (n: number, x0: number, y0: number, x1: number, y1: number, c: readonly number[]) => {
    const o = n * 6;
    epos[o] = x0;
    epos[o + 1] = y0;
    epos[o + 2] = 0;
    epos[o + 3] = x1;
    epos[o + 4] = y1;
    epos[o + 5] = 0;
    for (let j = 0; j < 3; j++) {
      ecol[o + j] = c[j];
      ecol[o + 3 + j] = c[j];
    }
  };

  const setWipe = (fBox: number, fObj: number) => {
    // --- walls -------------------------------------------------------------
    const N = box.nodes.length;
    let n = 0;
    for (let i = 0; i < N; i++) {
      if (box.segCell[i] < 0) continue;
      const a = box.nodes[i];
      const c = box.nodes[(i + 1) % N];
      // The passed-ness of this patch: 1 once the generator has gone by.
      const m = smoothstep(0, 1.6 / N, fBox - i / N);
      const g = GAP * m;
      put(
        n++,
        a.x + (c.x - a.x) * g,
        a.y + (c.y - a.y) * g,
        a.x + (c.x - a.x) * (1 - g),
        a.y + (c.y - a.y) * (1 - g),
        MAT_RGB[box.segMat[i]],
      );
    }

    // --- the object --------------------------------------------------------
    // Facet j of the polygon spans vertex angles; the wipe runs round obj's own
    // loop, which starts at the contact point with the floor.
    const objN = obj.nodes.length;
    // The object's loop runs clockwise, so its facets are swept by *decreasing*
    // angle — the room has to tile in the same order the generator travels.
    const a0 = Math.atan2(obj.nodes[0].y - DISC.y, obj.nodes[0].x - DISC.x);
    for (let j = 0; j < ND; j++) {
      const m = smoothstep(0, 1.6 / objN, fObj - j / objN);
      for (let k = 0; k < SUB; k++) {
        const lo = (k + (k === 0 ? GAP : 0)) / SUB;
        const hi = (k + 1 - (k === SUB - 1 ? GAP : 0)) / SUB;
        const t0 = a0 - (2 * Math.PI * (j + lo)) / ND;
        const t1 = a0 - (2 * Math.PI * (j + hi)) / ND;
        const r0 = radiusAt(t0, m);
        const r1 = radiusAt(t1, m);
        put(
          n++,
          DISC.x + r0 * Math.cos(t0),
          DISC.y + r0 * Math.sin(t0),
          DISC.x + r1 * Math.cos(t1),
          DISC.y + r1 * Math.sin(t1),
          MAT_RGB[4],
        );
      }
    }
    eposBuf.needsUpdate = true;
    ecolBuf.needsUpdate = true;
    egeom.instanceCount = n;

    // --- the object's fill --------------------------------------------------
    fillPos[0] = DISC.x;
    fillPos[1] = DISC.y;
    fillPos[2] = 0;
    for (let i = 0; i <= NPT; i++) {
      const j = Math.min(ND - 1, Math.floor(i / SUB));
      const m = smoothstep(0, 1.6 / objN, fObj - j / objN);
      const a = a0 - (2 * Math.PI * i) / NPT;
      const r = radiusAt(a, m);
      fillPos[3 * (i + 1)] = DISC.x + r * Math.cos(a);
      fillPos[3 * (i + 1) + 1] = DISC.y + r * Math.sin(a);
      fillPos[3 * (i + 1) + 2] = 0;
    }
    fillGeom.attributes.position.needsUpdate = true;
  };
  setWipe(0, 0);

  const scenery = [floorSlab, rightSlab, ceilSlab, leftSlab, fill];
  const setScenery = (on: boolean) => {
    for (const o of scenery) o.visible = on;
  };
  setScenery(false);

  return {
    group,
    setWipe,
    setWallThickness,
    setScenery,
    setOpacity(a: number) {
      for (const m of mats) {
        m.transparent = true;
        m.opacity = a;
      }
    },
  };
}

type LineMaterialLike = { opacity: number; transparent: boolean };

// ---------------------------------------------------------------------------
// The camera
// ---------------------------------------------------------------------------

/**
 * The shot: an orthographic camera swinging from straight down to an oblique
 * view, zooming in as it goes because tilting foreshortens the room away.
 *
 * The up vector is (0, sin e, cos e), which is orthogonal to the view direction
 * at every elevation and hands over cleanly at both ends: at e = 90° the screen's
 * up is world +y, exactly the framing every other 2D demo uses, and at low e it
 * is world +z.
 */
export function aimCamera(cam: THREE.OrthographicCamera, elevDeg: number, zoom: number): void {
  const e = (elevDeg * Math.PI) / 180;
  const D = 60;
  cam.position.set(0, -D * Math.cos(e), D * Math.sin(e));
  cam.up.set(0, Math.sin(e), Math.cos(e));
  cam.lookAt(0, 0, 0);
  cam.zoom = zoom;
  cam.updateProjectionMatrix();
}
