/**
 * The sensor response — how a spectrum becomes a value.
 *
 * Part IV of the talk factors a camera into measurement (which light reaches
 * which pixel) and response (what colour that light counts as). This file is
 * the second half: rho : S -> V, a positive linear map from spectra to a
 * finite-dimensional value space, realised as integration against three fixed
 * curves.
 *
 * ## Why the CIE curves and not three tidy bumps
 *
 * It is tempting to draw three clean positive bumps near 600 / 540 / 450 nm and
 * call their integrals R, G and B. That would be a lie, and an instructive one:
 * there is *no* set of three positive functions whose integrals against a
 * spectrum are that spectrum's sRGB coordinates. The colour-matching functions
 * for any real set of display primaries go **negative** over part of the band —
 * which is exactly why a display cannot show every colour.
 *
 * So the honest map is the CIE 1931 standard observer. Its three curves are
 * positive, and the three integrals are X, Y, Z. Getting from there to a colour
 * on a screen is a further linear map onto the display's primaries, plus a
 * nonlinear encoding — and both of those belong to *display*, not to
 * measurement. `xyzToDisplay` is where they live, kept deliberately separate
 * from the curves themselves.
 *
 * ## The curves
 *
 * Wyman, Sloan & Shirley, "Simple Analytic Approximations to the CIE XYZ Color
 * Matching Functions" (JCGT 2013): each curve is a sum of piecewise-Gaussian
 * lobes, within about 1% of the tabulated 1931 2-degree observer across the
 * visible band. A few lines of arithmetic instead of a 471-row table, and
 * accurate far past anything a projected slide can resolve.
 */

/**
 * A Gaussian allowed a different width on each side of its centre. The CIE
 * curves are conspicuously lopsided — this is what captures that.
 */
function lobe(x: number, mu: number, s1: number, s2: number): number {
  const t = (x - mu) / (x < mu ? s1 : s2);
  return Math.exp(-0.5 * t * t);
}

/**
 * The long-wavelength curve. Two lobes and a notch: the big one in the orange,
 * and a genuine **second lobe in the blue**, because the response it is built
 * from is a linear image of the cone responses rather than a filter anyone
 * designed. This is the shape that makes the standard observer look strange the
 * first time you see it, and it is worth leaving visible.
 */
export const xbar = (nm: number): number =>
  1.056 * lobe(nm, 599.8, 37.9, 31.0) +
  0.362 * lobe(nm, 442.0, 16.0, 26.7) -
  0.065 * lobe(nm, 501.1, 20.4, 26.2);

/** The middle curve, chosen so that Y is luminance. */
export const ybar = (nm: number): number =>
  0.821 * lobe(nm, 568.8, 46.9, 40.5) + 0.286 * lobe(nm, 530.9, 16.3, 31.1);

/**
 * The short-wavelength curve. Tall and narrow where the others are broad — and
 * the CIE normalisation makes all three integrate to the same total anyway,
 * which is the whole reason the three bars agree on a flat spectrum.
 */
export const zbar = (nm: number): number =>
  1.217 * lobe(nm, 437.0, 11.8, 36.0) + 0.681 * lobe(nm, 459.0, 26.0, 13.8);

/** The three curves in X, Y, Z order, so a demo can loop over channels. */
export const CMF = [xbar, ybar, zbar] as const;

export const CHANNEL_NAMES = ['X', 'Y', 'Z'] as const;

/**
 * The scale that makes a flat spectrum of height 1 come out at Y = 1.
 *
 * The CIE functions carry no absolute units — only a common factor is ever
 * fixed, and it is fixed once for all three channels, never per channel. One
 * shared constant is therefore the only honest normalisation, and it is what
 * lets the relative heights of the three bars mean something.
 */
export function bandNormalizer(wl0: number, wl1: number, n: number): number {
  const d = (wl1 - wl0) / n;
  let sum = 0;
  for (let i = 0; i <= n; i++) sum += ybar(wl0 + i * d) * (i === 0 || i === n ? 0.5 : 1) * d;
  return 1 / sum;
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

/** XYZ to linear sRGB (Rec. 709 primaries, D65 white). */
const M = [
  [3.2406, -1.5372, -0.4986],
  [-0.9689, 1.8758, 0.0415],
  [0.0557, -0.204, 1.057],
];

/** The sRGB transfer curve. Nonlinear, and it belongs to display, not measurement. */
function encode(u: number): number {
  return u <= 0.0031308 ? 12.92 * u : 1.055 * Math.pow(u, 1 / 2.4) - 0.055;
}

export interface DisplayColor {
  /** Display-encoded RGB in [0, 1]. */
  rgb: [number, number, number];
  /** True when the colour lay outside what the primaries can reach. */
  outOfGamut: boolean;
}

/**
 * What a screen makes of a value in XYZ.
 *
 * Two things happen here that are *not* part of the measurement, and the
 * separation is the point: a linear map onto the display's primaries, and a
 * nonlinear encoding for the display's transfer curve.
 *
 * Out-of-gamut colours — anything near the spectral locus, which includes every
 * narrow spectrum this demo can produce — come out with a negative component.
 * They are desaturated toward the achromatic axis rather than clipped per
 * channel: clipping bends the hue, and a swept narrow spectrum then turns into
 * a sequence of flat blobs instead of a hue sweep. Desaturating keeps the hue
 * and gives up only the saturation the screen could never have shown.
 */
export function xyzToDisplay(X: number, Y: number, Z: number): DisplayColor {
  let r = M[0][0] * X + M[0][1] * Y + M[0][2] * Z;
  let g = M[1][0] * X + M[1][1] * Y + M[1][2] * Z;
  let b = M[2][0] * X + M[2][1] * Y + M[2][2] * Z;

  const lo = Math.min(r, g, b);
  const outOfGamut = lo < -1e-6;
  if (lo < 0) {
    r -= lo;
    g -= lo;
    b -= lo;
  }

  const hi = Math.max(r, g, b);
  if (hi > 1) {
    r /= hi;
    g /= hi;
    b /= hi;
  }

  return {
    rgb: [encode(Math.max(r, 0)), encode(Math.max(g, 0)), encode(Math.max(b, 0))],
    outOfGamut,
  };
}

/** The same colour packed for three.js. */
export function xyzToHex(X: number, Y: number, Z: number): number {
  const [r, g, b] = xyzToDisplay(X, Y, Z).rgb;
  return (
    (Math.round(Math.min(Math.max(r, 0), 1) * 255) << 16) |
    (Math.round(Math.min(Math.max(g, 0), 1) * 255) << 8) |
    Math.round(Math.min(Math.max(b, 0), 1) * 255)
  );
}
