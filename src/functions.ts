/**
 * Test integrands shared across demos.
 *
 * The Riemann and Monte Carlo demos integrate the *same* function over the
 * same interval, so the two can sit side by side on a slide and their numbers
 * are directly comparable. That only holds if there is one definition, here.
 */

/** Domain of the standard test integrand. */
export const A = -3;
export const B = 3;

/**
 * Deliberately lumpy: four incommensurate frequencies, so no partition ever
 * lines up neatly with the features and no sampling pattern gets lucky.
 * Stays in roughly [0.3, 2.8] on [A, B] — strictly positive, which matters
 * because the Monte Carlo demo uses it as an importance-sampling density.
 */
export function lumpy(x: number): number {
  return (
    1.5 +
    0.55 * Math.sin(1.3 * x) +
    0.35 * Math.sin(3.05 * x) +
    0.2 * Math.cos(5.6 * x) +
    0.15 * Math.sin(0.6 * x)
  );
}

// ---------------------------------------------------------------------------
// A bump with tails — the integrand for the importance-sampling story
// ---------------------------------------------------------------------------

/** Domain of the bumpy-normal integrand. Wide enough that the tails are dead. */
export const BUMPY_A = -5;
export const BUMPY_B = 5;

/** Width of the Gaussian envelope. A proposal near this sigma is well matched. */
export const BUMPY_SIGMA = 1.1;

/**
 * Roughly normal-shaped, but lumpy: a Gaussian envelope times a ripple. The
 * envelope means most of the area sits in the middle fifth of the domain, so
 * uniform sampling throws most of its samples at near-empty tails — which is
 * exactly the waste importance sampling fixes.
 *
 * The ripple stays in [0.3, 1.7], so the product is strictly positive and can
 * safely be used as a sampling density itself.
 */
export function bumpy(x: number): number {
  const envelope = Math.exp(-(x * x) / (2 * BUMPY_SIGMA * BUMPY_SIGMA));
  const ripple = 1 + 0.45 * Math.sin(2.6 * x) + 0.25 * Math.cos(4.4 * x);
  return envelope * ripple;
}

// ---------------------------------------------------------------------------
// A 2D landscape — the integrand for the surface demos
// ---------------------------------------------------------------------------

/** The 2D demos integrate over the square [-FIELD_HALF, FIELD_HALF]². */
export const FIELD_HALF = 3;

/** A small floor value, so the surface never collapses flat at the edges. */
const FIELD_BASE = 0.12;

/** Gaussian bumps: [centreX, centreY, sigmaX, sigmaY, height]. */
const BUMPS: [number, number, number, number, number][] = [
  [-0.9, -0.7, 0.9, 0.8, 1.55], // the tall peak
  [1.35, 0.9, 1.25, 1.05, 0.95], // broad and medium
  [0.5, -1.75, 0.7, 0.6, 0.62], // small and sharp
  [-1.8, 1.5, 1.0, 0.9, 0.45], // low and wide
];

/**
 * A landscape of Gaussian bumps at differing heights. Strictly positive, and
 * smooth enough that a glass surface over it reads as elegant rather than
 * noisy, while still varying enough that the bars underneath differ visibly.
 */
export function bumps2d(x: number, y: number): number {
  let v = FIELD_BASE;
  for (const [cx, cy, sx, sy, h] of BUMPS) {
    const dx = (x - cx) / sx;
    const dy = (y - cy) / sy;
    v += h * Math.exp(-0.5 * (dx * dx + dy * dy));
  }
  return v;
}

/**
 * The exact volume under `bumps2d` over the square.
 *
 * Each bump is separable — g(x,y) = h·gx(x)·gy(y) — so the double integral is
 * a product of two 1D integrals rather than a brute-force grid. That is both
 * far more accurate than a sampled reference and instant, which matters when
 * the whole point of the demo is comparing estimates against it.
 */
export const FIELD_VOLUME = (() => {
  const side = 2 * FIELD_HALF;
  // ∫ exp(-((t-c)/s)²/2) dt over the domain, by Simpson on a fine grid.
  const axis = (c: number, s: number) =>
    simpson((t) => Math.exp(-0.5 * Math.pow((t - c) / s, 2)), -FIELD_HALF, FIELD_HALF, 4000);
  let v = FIELD_BASE * side * side;
  for (const [cx, cy, sx, sy, h] of BUMPS) v += h * axis(cx, sx) * axis(cy, sy);
  return v;
})();

/** Definite integral by Simpson's rule. `n` must be even. */
export function simpson(f: (x: number) => number, a: number, b: number, n = 20000): number {
  const h = (b - a) / n;
  let s = f(a) + f(b);
  for (let i = 1; i < n; i++) s += f(a + i * h) * (i % 2 ? 4 : 2);
  return (s * h) / 3;
}

/** The reference value every demo compares itself against. */
export const LUMPY_AREA = simpson(lumpy, A, B);
export const BUMPY_AREA = simpson(bumpy, BUMPY_A, BUMPY_B);
