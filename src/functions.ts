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
