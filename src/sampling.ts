/**
 * Random sampling, and piecewise-constant 1D densities.
 *
 * IMPORTANT: nothing here uses `Math.random()`. The exporter renders a frame
 * by setting `t` and re-running the demo's update, so anything that reseeds per
 * frame would give a different set of samples every frame and the exported
 * video would boil with noise instead of showing samples accumulate. Draw a
 * fixed stream of uniforms once with a seeded generator, then index into it.
 *
 * `Distribution1D` is the standard inverse-CDF sampler over a tabulated
 * density — the same construction a path tracer uses to importance-sample.
 */

/** Small, fast, seedable PRNG (mulberry32). Deterministic across runs. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A fixed stream of uniforms in [0, 1). Generate once, reuse every frame. */
export function uniformStream(count: number, seed = 12345): Float64Array {
  const rng = mulberry32(seed);
  const out = new Float64Array(count);
  for (let i = 0; i < count; i++) out[i] = rng();
  return out;
}

/**
 * A normalised piecewise-constant density over [a, b], built by tabulating an
 * arbitrary non-negative function.
 *
 * Sampling is by inverse CDF: a binary search for the bin, then a linear step
 * inside it. `pdf()` returns the *normalised* density, so
 * `1 / (N * pdf(x))` is exactly the Monte Carlo weight of one sample.
 */
export class Distribution1D {
  readonly a: number;
  readonly b: number;
  /** Integral of the un-normalised function over [a, b]. */
  readonly integral: number;

  private readonly density: Float64Array; // un-normalised, per bin
  private readonly cdf: Float64Array; // length bins + 1, cdf[0] = 0, last = 1
  private readonly dx: number;

  constructor(fn: (x: number) => number, a: number, b: number, bins = 1024) {
    this.a = a;
    this.b = b;
    this.dx = (b - a) / bins;
    this.density = new Float64Array(bins);

    let total = 0;
    for (let i = 0; i < bins; i++) {
      // Midpoint of the bin — the density is constant across it.
      const v = Math.max(fn(a + (i + 0.5) * this.dx), 0);
      this.density[i] = v;
      total += v * this.dx;
    }
    this.integral = total;

    this.cdf = new Float64Array(bins + 1);
    if (total > 0) {
      let acc = 0;
      for (let i = 0; i < bins; i++) {
        acc += (this.density[i] * this.dx) / total;
        this.cdf[i + 1] = acc;
      }
    } else {
      // Degenerate function: fall back to uniform rather than dividing by zero.
      for (let i = 0; i <= bins; i++) this.cdf[i] = i / bins;
    }
    this.cdf[bins] = 1;
  }

  /** Normalised density at x. Integrates to 1 over [a, b]. */
  pdf(x: number): number {
    if (x < this.a || x > this.b || this.integral <= 0) return 0;
    const i = Math.min(Math.floor((x - this.a) / this.dx), this.density.length - 1);
    return this.density[i] / this.integral;
  }

  /** Map a uniform u in [0, 1) to a sample from this density. */
  sample(u: number): number {
    const cdf = this.cdf;
    // Binary search for the last index with cdf[i] <= u.
    let lo = 0;
    let hi = cdf.length - 1;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (cdf[mid] <= u) lo = mid;
      else hi = mid;
    }
    const span = cdf[lo + 1] - cdf[lo];
    const t = span > 0 ? (u - cdf[lo]) / span : 0;
    return this.a + (lo + t) * this.dx;
  }
}
