/**
 * Reading a baked light field: the octahedral map, and the fiber over a
 * point.
 *
 * The octahedral map is the ONE piece of the light-field repo that has to
 * be duplicated here rather than shipped as data — it is how a direction
 * becomes a cell of a square tile, so both sides must agree on it exactly.
 * It is a port of `oct_encode` / `oct_decode` from that repo's
 * `shaders/charts.wgsl`, and it has been frozen since that project's
 * second milestone. If it ever changes there, the bundle version bumps and
 * this file is where the change lands.
 *
 * ## Drawing a fiber: the normal at the centre
 *
 * The stored tile is parameterized in WORLD space, deliberately: that is
 * what makes neighbouring texels commensurable, and on a sphere no
 * continuous surface-aligned frame exists to use instead. But world space
 * means the square's centre is world +z, which has nothing to do with the
 * surface — so the hemisphere a point actually radiates into lands as an
 * arbitrary HALF of its square, and a sheet full of such tiles stripes.
 *
 * For DISPLAY, every fiber here is re-indexed so the surface's own normal
 * is the pole. Then the outward hemisphere is the central diamond and the
 * directions pointing into the surface are the four corners: a bright
 * middle in a dark rim, which is also what the ball looks like from
 * outside — so an unwrap keeps the bright part in the middle instead of
 * sliding it to one side.
 *
 * This is a re-index, never a re-computation. Every displayed value is a
 * stored value, and sampling is NEAREST so a cell is one number and never
 * a blend. Storage is untouched; only which cell a number is drawn in
 * changes. Worth saying out loud in the talk, since the demos claim to be
 * showing what is stored.
 */

import { CHART_QUAD, type Chart, type LoadedBundle, type V3 } from './bundle';

// --- small vector helpers (kept local; three.js Vector3 allocates) -------

const norm = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const crossV = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const dotV = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// --- the octahedral map (port of charts.wgsl) ---------------------------

const signNotZero = (x: number): number => (x >= 0 ? 1 : -1);

/** Unit direction → oct uv in [0,1]². */
export function octEncode(d: V3): readonly [number, number] {
  const a = Math.abs(d[0]) + Math.abs(d[1]) + Math.abs(d[2]);
  let px = d[0] / a;
  let py = d[1] / a;
  if (d[2] < 0) {
    const qx = (1 - Math.abs(py)) * signNotZero(px);
    const qy = (1 - Math.abs(px)) * signNotZero(py);
    px = qx;
    py = qy;
  }
  return [px * 0.5 + 0.5, py * 0.5 + 0.5];
}

/** Oct uv → unit direction. */
export function octDecode(u: number, v: number): V3 {
  const fx = u * 2 - 1;
  const fy = v * 2 - 1;
  let nx = fx;
  let ny = fy;
  const nz = 1 - Math.abs(fx) - Math.abs(fy);
  const t = Math.max(0, Math.min(1, -nz));
  nx += nx >= 0 ? -t : t;
  ny += ny >= 0 ? -t : t;
  return norm([nx, ny, nz]);
}

// --- the field ----------------------------------------------------------

/** Surface normal at a chart-local texel. Quads have a constant normal;
 * a sphere chart's texel IS a direction, by the same octahedral map. */
export function texelNormal(b: LoadedBundle, chart: Chart, lx: number, ly: number): V3 {
  if (chart.kind === CHART_QUAD) {
    const q = b.scene.quads[chart.prim];
    return norm(crossV(q.edgeU, q.edgeV));
  }
  return octDecode((lx + 0.5) / chart.w, (ly + 0.5) / chart.h);
}

/** The stored N×N tile of one texel, in the bundle's own (world) order. */
export function tileAt(
  b: LoadedBundle,
  chart: Chart,
  lx: number,
  ly: number,
): { rgb: Float32Array; counts: Float32Array } {
  const n = chart.dbins;
  const start = chart.dirOffset + (ly * chart.w + lx) * n * n;
  const rgb = new Float32Array(n * n * 3);
  const counts = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) {
    const o = (start + i) * 4;
    rgb[i * 3] = b.data[o];
    rgb[i * 3 + 1] = b.data[o + 1];
    rgb[i * 3 + 2] = b.data[o + 2];
    counts[i] = b.data[o + 3];
  }
  return { rgb, counts };
}

/** Orthonormal frame with `n` as its third axis (Duff et al., branchless).
 * The in-plane rotation is arbitrary; only "the normal is the pole" matters. */
export function normalFrame(n: V3): readonly [V3, V3, V3] {
  const s = n[2] >= 0 ? 1 : -1;
  const a = -1 / (s + n[2]);
  const b = n[0] * n[1] * a;
  return [
    [1 + s * n[0] * n[0] * a, s * b, -s * n[0]],
    [b, s + n[1] * n[1] * a, -n[1]],
    n,
  ];
}

/** A texel's fiber re-indexed so the surface normal sits at the centre. */
export function tileDisplay(
  b: LoadedBundle,
  chart: Chart,
  lx: number,
  ly: number,
): { rgb: Float32Array; counts: Float32Array } {
  const n = chart.dbins;
  const [tx, ty, tz] = normalFrame(texelNormal(b, chart, lx, ly));
  const stored = tileAt(b, chart, lx, ly);
  const rgb = new Float32Array(n * n * 3);
  const counts = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const d = octDecode((i + 0.5) / n, (j + 0.5) / n);
      const world: V3 = [
        tx[0] * d[0] + ty[0] * d[1] + tz[0] * d[2],
        tx[1] * d[0] + ty[1] * d[1] + tz[1] * d[2],
        tx[2] * d[0] + ty[2] * d[1] + tz[2] * d[2],
      ];
      const [u, v] = octEncode(world);
      const src =
        Math.min(n - 1, Math.max(0, Math.floor(v * n))) * n +
        Math.min(n - 1, Math.max(0, Math.floor(u * n)));
      const dst = j * n + i;
      rgb[dst * 3] = stored.rgb[src * 3];
      rgb[dst * 3 + 1] = stored.rgb[src * 3 + 1];
      rgb[dst * 3 + 2] = stored.rgb[src * 3 + 2];
      counts[dst] = stored.counts[src];
    }
  }
  return { rgb, counts };
}

/** Which display cells are outward-facing in the normal-centred layout:
 * exactly the central diamond. No dot products — the parameterization has
 * already sorted them. */
export function displayMask(n: number): Uint8Array {
  const mask = new Uint8Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      mask[j * n + i] = octDecode((i + 0.5) / n, (j + 0.5) / n)[2] > 0 ? 1 : 0;
    }
  }
  return mask;
}

/**
 * The collapsed value: the fiber's mean over the outward hemisphere. On a
 * diffuse texel every outward bin holds the same number, so this IS that
 * number — and being an average of N² independent estimates it is less
 * noisy than any one of them. The collapse, as one function.
 */
export function hemisphereMean(rgb: Float32Array, n: number): V3 {
  const mask = displayMask(n);
  let r = 0;
  let g = 0;
  let b = 0;
  let k = 0;
  for (let i = 0; i < n * n; i++) {
    if (!mask[i]) continue;
    r += rgb[i * 3];
    g += rgb[i * 3 + 1];
    b += rgb[i * 3 + 2];
    k++;
  }
  return k === 0 ? [0, 0, 0] : [r / k, g / k, b / k];
}

/** RGBA data for one texel's fiber, ready for an N×N DataTexture. Alpha
 * marks the outward cells: the corners are not part of THIS point's fiber. */
export function fiberTexture(b: LoadedBundle, chart: Chart, lx: number, ly: number): Float32Array {
  const n = chart.dbins;
  const { rgb, counts } = tileDisplay(b, chart, lx, ly);
  const mask = displayMask(n);
  const out = new Float32Array(n * n * 4);
  for (let i = 0; i < n * n; i++) {
    out[i * 4] = rgb[i * 3];
    out[i * 4 + 1] = rgb[i * 3 + 1];
    out[i * 4 + 2] = rgb[i * 3 + 2];
    out[i * 4 + 3] = mask[i] && counts[i] > 0 ? 1 : 0;
  }
  return out;
}

/** One RGBA texel per chart texel, holding its collapsed value. */
export function chartSurface(b: LoadedBundle, chart: Chart): Float32Array {
  const out = new Float32Array(chart.w * chart.h * 4);
  for (let ly = 0; ly < chart.h; ly++) {
    for (let lx = 0; lx < chart.w; lx++) {
      const { rgb, counts } = tileDisplay(b, chart, lx, ly);
      const mean = hemisphereMean(rgb, chart.dbins);
      const o = (ly * chart.w + lx) * 4;
      out[o] = mean[0];
      out[o + 1] = mean[1];
      out[o + 2] = mean[2];
      out[o + 3] = counts.some((c) => c > 0) ? 1 : 0;
    }
  }
  return out;
}

/**
 * The whole chart as a NESTED image, (w·N) × (h·N): every texel replaced
 * by its fiber. The grid of grids.
 *
 * Alpha here flags cells that were BAKED, deliberately not the outward
 * mask `fiberTexture` uses — the two ask different questions. A loupe asks
 * "what is the fiber over this point", where directions into the surface
 * are not part of the answer. The nested image asks "what do we store",
 * and on a quad the inward half is the BACKFACE: real, baked radiance,
 * which in a closed room happens to be near zero. Drawing it as an empty
 * slot would report stored data as absent.
 */
export function chartNested(b: LoadedBundle, chart: Chart): Float32Array {
  const n = chart.dbins;
  const W = chart.w * n;
  const out = new Float32Array(W * chart.h * n * 4);
  for (let ly = 0; ly < chart.h; ly++) {
    for (let lx = 0; lx < chart.w; lx++) {
      const { rgb, counts } = tileDisplay(b, chart, lx, ly);
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          const s = j * n + i;
          const o = ((ly * n + j) * W + lx * n + i) * 4;
          out[o] = rgb[s * 3];
          out[o + 1] = rgb[s * 3 + 1];
          out[o + 2] = rgb[s * 3 + 2];
          out[o + 3] = counts[s] > 0 ? 1 : 0;
        }
      }
    }
  }
  return out;
}
