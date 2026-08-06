/**
 * Imaging a stored light field: ray casting, and reading radiance off the bake.
 *
 * This is the payoff of having solved the field. Rendering an image from it is
 * not a recursion — no bounces, no paths, no shading model. Hit the first
 * surface along a ray and *read* the radiance the bundle already records leaving
 * that point back toward the eye. The whole of `shade()` is an intersection and
 * an array index.
 *
 * ## World units, not texel units
 *
 * Everything here works in the `SceneDef`'s own world units, because that is
 * what the geometry in the bundle is expressed in. The unwrap *display* layer
 * draws at `texelsPerUnit` (×8), so anything handed to three needs multiplying
 * by `bundle.atlas.texelsPerUnit` on the way out. Mixing the two silently puts
 * the camera inside the room.
 *
 * ## No specular path, deliberately
 *
 * `quadChart`/`sphereChart` mark chartless primitives with 0xffffffff, and a
 * chartless primitive stores no field, so imaging one would have to bounce to
 * the first charted surface. **This bundle has none** — eleven diffuse quads
 * and one glossy sphere, all charted — so that branch would be untestable dead
 * code and is not written. `intersectScene` returns the chart index it found;
 * if a future re-bake introduces a mirror, the lookup will return null there and
 * the missing case will be loud rather than silent.
 */

import type { Chart, LoadedBundle, V3 } from './bundle';
import { CHART_QUAD } from './bundle';
import { octEncode } from './tiles';

const CHARTLESS = 0xffffffff;

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

export interface Hit {
  /** Distance along the ray. */
  t: number;
  point: V3;
  normal: V3;
  /** Index into `bundle.charts`, or -1 for a chartless (specular) primitive. */
  chart: number;
  /** Chart-local texel. Meaningless when `chart` is -1. */
  lx: number;
  ly: number;
}

/**
 * Nearest surface along `o + t·d`, with the chart texel it lands in.
 *
 * A quad's texel comes straight from its edge parameters — `chart.w` is
 * `texelsPerUnit × |edgeU|`, so the chart grid and the quad's own
 * parameterization are the same grid. A sphere's texel *is* a direction under
 * the octahedral map (see `texelNormal` in `tiles.ts`), so the normal indexes
 * the chart directly.
 */
export function intersectScene(b: LoadedBundle, o: V3, d: V3): Hit | null {
  let best: Hit | null = null;

  b.scene.quads.forEach((q, i) => {
    const n = cross(q.edgeU, q.edgeV);
    const den = dot(d, n);
    if (Math.abs(den) < 1e-9) return;
    const t = dot(sub(q.origin, o), n) / den;
    if (t <= 1e-4 || (best && t >= best.t)) return;

    const p: V3 = [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t];
    const r = sub(p, q.origin);
    // Solve r = s·edgeU + v·edgeV in the (generally non-orthogonal) edge basis.
    const uu = dot(q.edgeU, q.edgeU);
    const vv = dot(q.edgeV, q.edgeV);
    const uv = dot(q.edgeU, q.edgeV);
    const det = uu * vv - uv * uv;
    if (Math.abs(det) < 1e-12) return;
    const s = (dot(r, q.edgeU) * vv - dot(r, q.edgeV) * uv) / det;
    const v = (dot(r, q.edgeV) * uu - dot(r, q.edgeU) * uv) / det;
    if (s < 0 || s > 1 || v < 0 || v > 1) return;

    const ci = b.quadChart[i];
    const chart = ci === CHARTLESS ? -1 : ci;
    let lx = 0;
    let ly = 0;
    if (chart >= 0) {
      const c = b.charts[chart];
      lx = Math.min(c.w - 1, Math.max(0, Math.floor(s * c.w)));
      ly = Math.min(c.h - 1, Math.max(0, Math.floor(v * c.h)));
    }
    best = { t, point: p, normal: unit(n), chart, lx, ly };
  });

  b.scene.spheres.forEach((sp, i) => {
    const oc = sub(o, sp.center);
    const bq = dot(oc, d);
    const cq = dot(oc, oc) - sp.radius * sp.radius;
    const disc = bq * bq - cq;
    if (disc < 0) return;
    const sq = Math.sqrt(disc);
    let t = -bq - sq;
    if (t <= 1e-4) t = -bq + sq;
    if (t <= 1e-4 || (best && t >= best.t)) return;

    const p: V3 = [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t];
    const n = unit(sub(p, sp.center));
    const ci = b.sphereChart[i];
    const chart = ci === CHARTLESS ? -1 : ci;
    let lx = 0;
    let ly = 0;
    if (chart >= 0) {
      const c = b.charts[chart];
      const [u, v] = octEncode(n);
      lx = Math.min(c.w - 1, Math.max(0, Math.floor(u * c.w)));
      ly = Math.min(c.h - 1, Math.max(0, Math.floor(v * c.h)));
    }
    best = { t, point: p, normal: n, chart, lx, ly };
  });

  return best;
}

/**
 * Radiance leaving texel (lx, ly) of `chart` in direction `dir`.
 *
 * `dir` is in world space and points *away* from the surface — for imaging it
 * is the direction back toward the eye, which is why `shade` negates the ray.
 * The bin is nearest-neighbour in the stored octahedral tile: this is a lookup,
 * and interpolating would invent values between the ones actually baked.
 */
export function sampleField(b: LoadedBundle, chart: Chart, lx: number, ly: number, dir: V3): V3 {
  const n = chart.dbins;
  const [u, v] = octEncode(dir);
  const bx = Math.min(n - 1, Math.max(0, Math.floor(u * n)));
  const by = Math.min(n - 1, Math.max(0, Math.floor(v * n)));
  const o = (chart.dirOffset + (ly * chart.w + lx) * n * n + by * n + bx) * 4;
  return [b.data[o], b.data[o + 1], b.data[o + 2]];
}

/** Sample count behind a lookup — 0 means that direction was never baked. */
export function sampleCount(b: LoadedBundle, chart: Chart, lx: number, ly: number, dir: V3): number {
  const n = chart.dbins;
  const [u, v] = octEncode(dir);
  const bx = Math.min(n - 1, Math.max(0, Math.floor(u * n)));
  const by = Math.min(n - 1, Math.max(0, Math.floor(v * n)));
  return b.data[(chart.dirOffset + (ly * chart.w + lx) * n * n + by * n + bx) * 4 + 3];
}

/** What one ray sees: the field at the first surface, read back toward the eye. */
export function shade(b: LoadedBundle, o: V3, d: V3): { rgb: V3; hit: Hit | null } {
  const hit = intersectScene(b, o, d);
  if (!hit || hit.chart < 0) return { rgb: [0, 0, 0], hit };
  const rgb = sampleField(b, b.charts[hit.chart], hit.lx, hit.ly, [-d[0], -d[1], -d[2]]);
  return { rgb, hit };
}

// ---------------------------------------------------------------------------
// A whole image
// ---------------------------------------------------------------------------

export interface PinholeCamera {
  eye: V3;
  target: V3;
  /** Vertical field of view, radians. */
  fov: number;
  /** Distance from the eye to the image plane, in world units. */
  planeDist: number;
}

export interface RenderedImage {
  width: number;
  height: number;
  /** Averaged radiance, 3 floats per pixel, row 0 at the TOP of the image. */
  rgb: Float32Array;
  /** Where the pixel's first sample landed, 3 floats per pixel. */
  hit: Float32Array;
  /** Chart the first sample landed on, -1 for a miss or a chartless surface. */
  chart: Int32Array;
  /** Pixels whose first sample hit nothing at all. */
  misses: number;
  /** Lookups that landed in a direction bin with no samples behind it. */
  emptyBins: number;
  /** Image-plane basis, for placing the grid in the scene. */
  plane: { centre: V3; right: V3; up: V3; halfW: number; halfH: number };
}

/**
 * Render the whole image once, up front.
 *
 * Precomputed rather than traced per frame, for the reason every demo here
 * precomputes: the exporter re-runs the update for each frame, so anything
 * recomputed per frame has to be bit-identical anyway. Doing it once makes the
 * animation a pure reveal and keeps a frame cheap. `spp` samples per pixel are
 * placed on a jittered stratified grid inside the pixel — a fixed pattern, not
 * a random one, so there is nothing to reseed.
 */
export function renderImage(
  b: LoadedBundle,
  cam: PinholeCamera,
  width: number,
  height: number,
  spp = 4,
): RenderedImage {
  const fwd = unit(sub(cam.target, cam.eye));
  const right = unit(cross(fwd, [0, 1, 0]));
  const up = cross(right, fwd);

  const halfH = Math.tan(cam.fov / 2) * cam.planeDist;
  const halfW = (halfH * width) / height;
  const centre: V3 = [
    cam.eye[0] + fwd[0] * cam.planeDist,
    cam.eye[1] + fwd[1] * cam.planeDist,
    cam.eye[2] + fwd[2] * cam.planeDist,
  ];

  const rgb = new Float32Array(width * height * 3);
  const hitBuf = new Float32Array(width * height * 3);
  const chartBuf = new Int32Array(width * height).fill(-1);
  let misses = 0;
  let emptyBins = 0;

  // A stratified k×k pattern inside each pixel, offset off the centre so no
  // sample sits exactly on a texel boundary.
  const k = Math.max(1, Math.round(Math.sqrt(spp)));
  const jitter = 0.5 / k;

  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      let r = 0;
      let g = 0;
      let bl = 0;
      let n = 0;
      let first: V3 | null = null;

      for (let sy = 0; sy < k; sy++) {
        for (let sx = 0; sx < k; sx++) {
          const fx = (px + (sx + 0.5) / k + (sx % 2 ? jitter : -jitter) * 0.5) / width;
          const fy = (py + (sy + 0.5) / k + (sy % 2 ? -jitter : jitter) * 0.5) / height;
          const su = (fx * 2 - 1) * halfW;
          const sv = (1 - fy * 2) * halfH;
          const d = unit([
            fwd[0] * cam.planeDist + right[0] * su + up[0] * sv,
            fwd[1] * cam.planeDist + right[1] * su + up[1] * sv,
            fwd[2] * cam.planeDist + right[2] * su + up[2] * sv,
          ]);
          const { rgb: c, hit } = shade(b, cam.eye, d);
          if (!hit) {
            if (!first) misses++;
            continue;
          }
          if (hit.chart >= 0) {
            const cnt = sampleCount(b, b.charts[hit.chart], hit.lx, hit.ly, [-d[0], -d[1], -d[2]]);
            if (cnt === 0) emptyBins++;
          }
          if (!first) {
            first = hit.point;
            chartBuf[py * width + px] = hit.chart;
          }
          r += c[0];
          g += c[1];
          bl += c[2];
          n++;
        }
      }

      const o = (py * width + px) * 3;
      if (n > 0) {
        rgb[o] = r / n;
        rgb[o + 1] = g / n;
        rgb[o + 2] = bl / n;
      }
      if (first) {
        hitBuf[o] = first[0];
        hitBuf[o + 1] = first[1];
        hitBuf[o + 2] = first[2];
      }
    }
  }

  return {
    width,
    height,
    rgb,
    hit: hitBuf,
    chart: chartBuf,
    misses,
    emptyBins,
    plane: { centre, right, up, halfW, halfH },
  };
}
