/**
 * The room, in two versions: continuous and discretised.
 *
 * Every 2D demo is set in the same room — a box with a coloured wall on each
 * side, one object on the floor, a strip of ceiling that emits. Which version
 * it uses says what kind of mathematics the demo is doing, and that is the
 * whole point of having two:
 *
 *   continuous   a smooth circle, intersected analytically. Used wherever the
 *                demo is about the continuous theory: radiance on a ray, the
 *                light field on the boundary, superposition.
 *   discrete     a 16-facet polygon whose boundary is cut into patches, so a
 *                light field is a vector and transport is a matrix. Used
 *                wherever the demo has reduced the problem to linear algebra.
 *
 * The shapes are deliberately the same room, so the audience recognises it
 * across the deck and the difference they notice is the discretisation: the
 * object goes faceted, the walls go tiled, and the picture itself is drawn on a
 * visible grid.
 *
 * ## Proportions rather than sizes
 *
 * The scene is defined in fractions of the room's half-width, and each demo
 * picks its own scale. That lets `linear-scene` fit three rooms across the
 * frame and the radiance demos give the room half the frame with a spectrum
 * panel beside it, while every one of them stays the same room.
 *
 * Someday the discrete version should be *derived* from the continuous one by a
 * `discretise()` step, so there is nothing to keep in sync by hand. Today they
 * are two functions agreeing by construction, which is honest about what it is.
 */

/** Half-height, as a fraction of half-width. */
export const RATIO = 0.861;
/** Object centre, as fractions of the half-width and half-height. */
export const OBJ_X = -0.306;
export const OBJ_Y = -0.387;
/** Object radius — the circle's radius, and the polygon's circumradius. */
export const OBJ_R = 0.278;
/** Emitting strip in the ceiling, as a fraction of half-width. */
export const EMIT_HALF = 0.306;
/** Drawn thickness of the walls, as a fraction of half-width. */
export const WALL = 0.078;

/** Facets around the object in the discrete version. Coarse enough to count. */
export const FACETS = 16;

export interface Room {
  /** Half-extents of the interior. */
  rx: number;
  ry: number;
  wall: number;
  /** The object: centre, and radius or circumradius. */
  disc: { x: number; y: number; r: number };
  /** Half-width of the emitting strip in the ceiling. */
  emitHalf: number;
}

/** The room at a given scale — the same geometry for both versions. */
export function room(halfWidth: number): Room {
  const rx = halfWidth;
  const ry = +(halfWidth * RATIO).toFixed(3);
  return {
    rx,
    ry,
    wall: +(halfWidth * WALL).toFixed(3),
    disc: {
      x: +(rx * OBJ_X).toFixed(3),
      y: +(ry * OBJ_Y).toFixed(3),
      r: +(rx * OBJ_R).toFixed(3),
    },
    emitHalf: +(rx * EMIT_HALF).toFixed(3),
  };
}

/** Distance from the polygon's centre to the middle of a facet. */
export const apothem = (r: number) => r * Math.cos(Math.PI / FACETS);

/** The k-th facet's outward normal direction, in radians. */
export const facetAngle = (k: number) => (2 * Math.PI * (k + 0.5)) / FACETS;

/** Length of one facet. */
export const facetLength = (r: number) => 2 * r * Math.sin(Math.PI / FACETS);

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

/**
 * One pigment per surface, as a reflectance curve. Both versions of the room
 * use these, so a wall is the same colour whichever mathematics is running.
 * Index order is the one the patch layouts use: floor, right, ceiling, left,
 * object.
 */
const bell = (l: number, c: number, w: number) => Math.exp(-0.5 * ((l - c) / w) ** 2);

export const PIGMENT: ((l: number) => number)[] = [
  (l) => 0.05 + 0.85 * bell(l, 545, 40), // floor, moss
  (l) => 0.16 + 0.4 * bell(l, 485, 65), // right wall, slate
  (l) => 0.5 + 0.15 * bell(l, 600, 120), // ceiling, bone
  (l) => 0.05 + 0.9 * bell(l, 640, 48), // left wall, rust
  (l) => 0.04 + 0.85 * bell(l, 462, 40), // object, blue
];

// ---------------------------------------------------------------------------
// The continuous version
// ---------------------------------------------------------------------------

/** Does the segment a→b pass through the smooth object? */
export function circleBlocks(
  r: Room,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return false;
  const ux = dx / len;
  const uy = dy / len;
  const ox = ax - r.disc.x;
  const oy = ay - r.disc.y;
  const t = -(ox * ux + oy * uy);
  if (t <= 0 || t >= len) return ox * ox + oy * oy < r.disc.r * r.disc.r;
  return Math.hypot(ox + ux * t, oy + uy * t) < r.disc.r;
}

/** GLSL for the smooth object: nearest hit along a ray, or t < 0. */
export const CIRCLE_GLSL = /* glsl */ `
  float hitCircle(vec2 p, vec2 dir, vec2 c, float rad) {
    vec2 oc = p - c;
    float b = dot(oc, dir);
    float q = dot(oc, oc) - rad * rad;
    float d = b * b - q;
    if (d <= 0.0) return -1.0;
    float t = -b - sqrt(d);
    return t > 1e-4 ? t : -1.0;
  }
`;

// ---------------------------------------------------------------------------
// The discrete version
// ---------------------------------------------------------------------------

export interface Patch {
  x: number;
  y: number;
  nx: number;
  ny: number;
  ds: number;
  /** Index into PIGMENT. */
  mat: number;
  emits: boolean;
}

/**
 * The boundary cut into patches: `nw` along each wall, then one per facet of
 * the object. The order is the one every shader in the deck indexes by —
 * floor, right, ceiling, left, then facets — so do not reorder it.
 */
export function patches(r: Room, nw: number): Patch[] {
  const out: Patch[] = [];

  for (let side = 0; side < 4; side++) {
    const len = side % 2 === 0 ? 2 * r.rx : 2 * r.ry;
    const ds = len / nw;
    for (let k = 0; k < nw; k++) {
      const t = (k + 0.5) / nw;
      let x = 0;
      let y = 0;
      let nx = 0;
      let ny = 0;
      if (side === 0) {
        x = -r.rx + 2 * r.rx * t;
        y = -r.ry;
        ny = 1;
      } else if (side === 1) {
        x = r.rx;
        y = -r.ry + 2 * r.ry * t;
        nx = -1;
      } else if (side === 2) {
        x = r.rx - 2 * r.rx * t;
        y = r.ry;
        ny = -1;
      } else {
        x = -r.rx;
        y = r.ry - 2 * r.ry * t;
        nx = 1;
      }
      out.push({ x, y, nx, ny, ds, mat: side, emits: side === 2 && Math.abs(x) < r.emitHalf });
    }
  }

  // The object: one patch per flat facet, its midpoint at the apothem.
  const ap = apothem(r.disc.r);
  for (let k = 0; k < FACETS; k++) {
    const a = facetAngle(k);
    const nx = Math.cos(a);
    const ny = Math.sin(a);
    out.push({
      x: r.disc.x + ap * nx,
      y: r.disc.y + ap * ny,
      nx,
      ny,
      ds: facetLength(r.disc.r),
      mat: 4,
      emits: false,
    });
  }

  return out;
}

/**
 * Does the segment a→b cross the polygon?
 *
 * Both endpoints usually sit *on* the boundary, so both parameters are kept off
 * their ends — otherwise every facet blocks itself and the room goes black.
 */
export function polygonBlocks(
  r: Room,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  if (Math.hypot(dx, dy) < 1e-9) return true;
  for (let k = 0; k < FACETS; k++) {
    const f0 = (2 * Math.PI * k) / FACETS;
    const f1 = (2 * Math.PI * (k + 1)) / FACETS;
    const vx = r.disc.x + r.disc.r * Math.cos(f0);
    const vy = r.disc.y + r.disc.r * Math.sin(f0);
    const ex = r.disc.r * (Math.cos(f1) - Math.cos(f0));
    const ey = r.disc.r * (Math.sin(f1) - Math.sin(f0));
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) continue;
    const rx = vx - ax;
    const ry = vy - ay;
    const t = (rx * ey - ry * ex) / den;
    const u = (rx * dy - ry * dx) / den;
    if (t > 1e-3 && t < 1 - 1e-3 && u > 1e-6 && u < 1 - 1e-6) return true;
  }
  return false;
}

/**
 * GLSL for the faceted object: which facet a direction falls in, whether a
 * point is inside, and the nearest facet along a ray. Needs `DISC`, `DISC_R`,
 * `ND` and `APOTHEM` declared by the caller.
 */
export const POLYGON_GLSL = /* glsl */ `
  int facetOf(vec2 d) {
    float a = atan(d.y, d.x);
    if (a < 0.0) a += 6.2831853;
    return int(clamp(floor(a / 6.2831853 * float(ND)), 0.0, float(ND - 1)));
  }

  bool insidePoly(vec2 p) {
    vec2 d = p - DISC;
    if (dot(d, d) > DISC_R * DISC_R) return false;
    float mid = 6.2831853 * (float(facetOf(d)) + 0.5) / float(ND);
    return dot(d, vec2(cos(mid), sin(mid))) < APOTHEM;
  }

  void hitPoly(vec2 p, vec2 dir, out float bestT, out int bestK) {
    bestT = 1e9;
    bestK = -1;
    vec2 oc = p - DISC;
    float b = dot(oc, dir);
    float c = dot(oc, oc) - DISC_R * DISC_R;
    if (c > 0.0 && (b > 0.0 || b * b - c < 0.0)) return;
    for (int k = 0; k < ND; k++) {
      float f0 = 6.2831853 * float(k) / float(ND);
      float f1 = 6.2831853 * float(k + 1) / float(ND);
      vec2 a = DISC + DISC_R * vec2(cos(f0), sin(f0));
      vec2 e = DISC_R * (vec2(cos(f1), sin(f1)) - vec2(cos(f0), sin(f0)));
      float den = dir.x * e.y - dir.y * e.x;
      if (abs(den) < 1e-9) continue;
      vec2 r = a - p;
      float t = (r.x * e.y - r.y * e.x) / den;
      float u = (r.x * dir.y - r.y * dir.x) / den;
      if (t <= 1e-4 || u < 0.0 || u > 1.0) continue;
      if (t < bestT) {
        bestT = t;
        bestK = k;
      }
    }
  }
`;

/** GLSL seams, so a tiled boundary reads as tiled. */
export const SEAM_GLSL = /* glsl */ `
  float seam(float f) {
    return 0.45 + 0.55 * smoothstep(0.0, 0.09, min(f, 1.0 - f));
  }
  float seamDisc(vec2 n) {
    float a = atan(n.y, n.x);
    if (a < 0.0) a += 6.2831853;
    return seam(fract(a / 6.2831853 * float(ND)));
  }
  float seamWall(vec2 q) {
    if (q.y <= -RY + 1e-3) return seam(fract((q.x + RX) / (2.0 * RX) * float(NW)));
    if (q.x >= RX - 1e-3) return seam(fract((q.y + RY) / (2.0 * RY) * float(NW)));
    if (q.y >= RY - 1e-3) return seam(fract((RX - q.x) / (2.0 * RX) * float(NW)));
    return seam(fract((RY - q.y) / (2.0 * RY) * float(NW)));
  }
`;
