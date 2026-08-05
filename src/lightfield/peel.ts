/**
 * Unfolding the room into a net.
 *
 * The net is NOT designed, it is DERIVED. Every chart hangs off a parent
 * by the edge they physically share, and flattening means rotating each
 * child about that shared edge until its normal matches its parent's. So
 * t = 0 reconstructs the actual baked scene rather than approximating it,
 * and t = 1 is whatever net that room unfolds into. Placing sheets by hand
 * and animating toward them can only ever approximate the room it claims
 * to come from.
 *
 * Everything is in TEXEL UNITS (world × texelsPerUnit), so one atlas texel
 * is one unit in the room AND in the net: the peel moves pixels without
 * resizing them, which is the claim the animation makes.
 */

import { CHART_QUAD, type Chart, type LoadedBundle, type V3 } from './bundle';

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const len = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
const norm = (a: V3): V3 => mul(a, 1 / (len(a) || 1));

/** A chart's placement: corner plus the two edges its uv runs along, so
 * |u| ≈ chart.w texels and |v| ≈ chart.h. */
export interface Frame {
  origin: V3;
  u: V3;
  v: V3;
  normal: V3;
}

export function quadFrame(b: LoadedBundle, chart: Chart, texelScale: number): Frame {
  const q = b.scene.quads[chart.prim];
  const u = mul(q.edgeU, texelScale);
  const v = mul(q.edgeV, texelScale);
  return { origin: mul(q.origin, texelScale), u, v, normal: norm(cross(u, v)) };
}

export const frameCorners = (f: Frame): V3[] => [
  f.origin,
  add(f.origin, f.u),
  add(f.origin, f.v),
  add(add(f.origin, f.u), f.v),
];

export const frameCentre = (f: Frame): V3 => add(f.origin, mul(add(f.u, f.v), 0.5));

/** The edge two charts physically share. null if they only meet at a
 * point, or not at all. */
export function sharedEdge(a: Frame, b: Frame, eps = 1e-3): [V3, V3] | null {
  const hits: V3[] = [];
  for (const p of frameCorners(a)) {
    for (const q of frameCorners(b)) {
      if (len(sub(p, q)) < eps) {
        hits.push(p);
        break;
      }
    }
  }
  return hits.length >= 2 ? [hits[0], hits[1]] : null;
}

/** Signed angle from `from` to `to` about `axis` (right-handed). */
export const signedAngle = (from: V3, to: V3, axis: V3): number =>
  Math.atan2(dot(cross(from, to), axis), dot(from, to));

/** Rodrigues: rotate p about a unit axis through the origin. */
export function rotateAbout(p: V3, axis: V3, angle: number): V3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return add(add(mul(p, c), mul(cross(axis, p), s)), mul(axis, dot(axis, p) * (1 - c)));
}

export interface Hinge {
  parent: number | null;
  pivot: V3;
  axis: V3;
  angle: number;
  /** Extra in-plane slide, applied ×t, for sheets that would otherwise
   * land on top of a sibling. */
  offset: V3;
}

/**
 * The hinge that flattens `child` onto `parent`'s plane.
 *
 * The axis SIGN is the subtle part: both signs make the planes parallel,
 * but one folds the child back OVER its parent and stacks sheets. Rather
 * than reason case by case through a dozen charts, try both and keep
 * whichever lands the child farther from the parent's centre.
 */
export function hingeBetween(parent: Frame, child: Frame, eps = 1e-3): Hinge | null {
  const edge = sharedEdge(parent, child, eps);
  if (!edge) return null;
  const pivot = mul(add(edge[0], edge[1]), 0.5);

  let best: { axis: V3; angle: number; far: number } | null = null;
  for (const sign of [1, -1]) {
    const axis = mul(norm(sub(edge[1], edge[0])), sign);
    const angle = signedAngle(parent.normal, child.normal, axis);
    const landed = add(pivot, rotateAbout(sub(frameCentre(child), pivot), axis, -angle));
    const far = len(sub(landed, frameCentre(parent)));
    if (!best || far > best.far) best = { axis, angle, far };
  }
  return { parent: null, pivot, axis: best!.axis, angle: best!.angle, offset: [0, 0, 0] };
}

export interface PeelNode {
  chart: number;
  hinge: Hinge;
}

/**
 * Build the peel tree. `parentOf` returns null for a root (the floor,
 * which never moves). Charts that share no edge with their stated parent
 * get a zero hinge and ride along rigidly — which is what a ceiling
 * emitter wants: it is parallel to the ceiling, not attached to it.
 */
export function buildPeel(
  b: LoadedBundle,
  texelScale: number,
  parentOf: (chartIdx: number) => number | null,
  offsetOf: (chartIdx: number) => V3 = () => [0, 0, 0],
): PeelNode[] {
  const frames = b.charts.map((c) => (c.kind === CHART_QUAD ? quadFrame(b, c, texelScale) : null));
  return b.charts.map((_c, i) => {
    const parent = parentOf(i);
    const offset = offsetOf(i);
    const cf = frames[i];
    const pf = parent === null ? null : frames[parent];
    if (!cf || !pf) {
      return { chart: i, hinge: { parent, pivot: [0, 0, 0], axis: [0, 1, 0], angle: 0, offset } };
    }
    const h = hingeBetween(pf, cf);
    return {
      chart: i,
      hinge: h ? { ...h, parent, offset } : { parent, pivot: frameCentre(cf), axis: [0, 1, 0], angle: 0, offset },
    };
  });
}
