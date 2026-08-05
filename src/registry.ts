/**
 * Demo discovery for the gallery.
 *
 * Folders under demos/ are found automatically — drop in a new
 * demos/<name>/main.ts and it appears on the index page with no bookkeeping.
 * The INFO table below is purely optional polish: a nicer title, a one-line
 * blurb, and a section so the gallery groups sensibly. Anything missing falls
 * back to a prettified folder name.
 */

export interface DemoInfo {
  title?: string;
  blurb?: string;
  /** Gallery grouping — roughly the section of the talk it belongs to. */
  section?: string;
}

/** Optional metadata, keyed by folder name. */
export const INFO: Record<string, DemoInfo> = {
  'flatten-room': {
    title: 'From the Cornell Box to the Room',
    blurb:
      'A 3D Cornell box, and a copy of it that slides clear, turns to face you and has its depth squeezed out — leaving the 2D room the rest of the deck is set in. Both are built from the same room(), so the flat one is the box\'s cross-section rather than a lookalike.',
    section: 'Modeling Light',
  },
  'radiance-2d': {
    title: 'Radiance',
    blurb: 'A 2D room, the circle of directions at a point, and the spectrum carried by the ray in each direction.',
    section: 'Modeling Light',
  },
  'contraction-2d': {
    title: 'A Contraction in the Plane',
    blurb: 'A grid slides into its image under a swirling contraction, then into its image again. Every generation stays behind, and the nest winds onto the fixed point.',
    section: 'Modeling the Light Field',
  },
  'light-dies-out': {
    title: 'Without Emitters, Light Dies Out',
    blurb: 'A brightly lit room with nothing emitting, iterating T alone. Everything decays, but the pale walls let their corridor linger.',
    section: 'Modeling the Light Field',
  },
  'fixed-point': {
    title: 'The Equilibrium Light Field',
    blurb: 'Two rooms iterating E + TL from wildly different starts, converging to the same field. The operator is a real matrix on boundary patches.',
    section: 'Modeling the Light Field',
  },
  'bounce-series': {
    title: 'The Light Field is a Geometric Series',
    blurb: 'E + TE + T-squared E + ... one term at a time, with the sum beside it. The terms are sorted by bounce count, and this is where paths come from.',
    section: 'Solving for the Light Field',
  },
  'path-set': {
    title: 'The Set of Paths Varies',
    blurb: 'The finished bidirectional web, with p sliding along the floor. Connections snap in and out as the visibility region is crossed.',
    section: 'Solving for the Light Field',
  },
  bidirectional: {
    title: 'Starting at Both Ends',
    blurb: 'Two chains grow, one from p and one from the lamp, then every pairing is tried. Blocked connections go black; clear ones flare and settle into a web.',
    section: 'Solving for the Light Field',
  },
  caustics: {
    title: 'Caustics are Critical Values',
    blurb: 'A moving water surface refracts a parallel beam onto the floor, with the light density measured underneath. The bright lines are exactly where the ray map has a fold.',
    section: 'Solving for the Light Field',
  },
  'fermat-critical': {
    title: 'Reflection is a Derivative',
    blurb: 'Fix the ends and slide the vertex along the surface. Optical path length becomes a function of one number, and wherever its graph goes flat the angles come out equal — reflection, and Snell, with no law assumed.',
    section: 'Solving for the Light Field',
  },
  'path-space': {
    title: 'The Space of Paths',
    blurb: 'The same series drawn as paths: length k on the left, every path so far on the right, sweeping to fill in the continuum.',
    section: 'Solving for the Light Field',
  },
  // One continuous shot in three parts, so they share a section and sort into
  // playing order. They straddle the deck — the first is Part I's Objects slide,
  // the last is Part VII's Storing a Light Field — and filing them apart put the
  // opening demo on the other side of the index page from its own sequel.
  'state-space': {
    title: 'The Space of States — 1. Two Tori',
    blurb: 'Part I. The circle of directions at every point of the boundary stands up out of the plane and sweeps out two tori: the state space the light field lives on.',
    section: 'The State Space',
  },
  'state-space-discrete': {
    title: 'The Space of States — 2. Chopped Into Cells',
    blurb: 'A second sweep cuts both tori into cells: sixteen facets and thirty-six patches per wall, crossed with twelve directions. Chop up the surfaces, chop up the sphere of directions at each point.',
    section: 'The State Space',
  },
  'state-space-room': {
    title: 'The Space of States — 4. The Array Is the Room',
    blurb: 'The five arrays on the left, the room on the right, and the room computed from nothing but those arrays. A cursor reads the store column by column and the patch each column stands for lights up with it.',
    section: 'The State Space',
  },
  'state-space-stored': {
    title: 'The Space of States — 3. Storing a Light Field',
    blurb: 'Part VII. The tori split along their undersides, unroll and flatten into the five arrays a renderer holds — one per wall plus the object — then fill with a solved field. The bottom half of each is flat because the materials are Lambertian; the top half is a panorama of the room.',
    section: 'The State Space',
  },
  'linear-scene': {
    title: 'The Scene is a Linear Map',
    blurb: 'One lamp, then the other, then both — three rooms simulated independently, with the spectrum at a shared probe stacking exactly.',
    section: 'Modeling the Light Field',
  },
  'material-measure': {
    title: 'A Material is a Measure on Directions',
    blurb: 'Lambertian, read at one point: the circle of directions, the measure standing off it, and an outgoing direction that sweeps while the measure stays put.',
    section: 'Modeling Materials',
  },
  metamerism: {
    title: 'The Kernel of the Sensor',
    blurb: 'One reflectance walks the fibre of rho while the three numbers hold exactly. Change the lamp and the match falls apart.',
    section: 'Modeling the Camera',
  },
  'pixel-lens': {
    title: 'Which Light Reaches a Pixel',
    blurb: 'A point on the pixel and a point on the aperture name one ray. Walk every pairing, carry back what each ray finds, and average.',
    section: 'Modeling the Camera',
  },
  'pixel-image': {
    title: 'An Image is One Value per Pixel',
    blurb: 'A square array of spectra that looks like nothing, one linear map applied at every cell, and a photograph falls out.',
    section: 'Modeling the Camera',
  },
  'pixel-response': {
    title: 'From a Spectrum to a Value',
    blurb: 'A spectrum splits into three, meets the CIE standard observer, and the three areas become a value and then a colour.',
    section: 'Modeling the Camera',
  },
  'ray-spectrum': {
    title: 'Every Ray Carries a Spectrum',
    blurb: 'A wave on a ray slides apart into sinusoids, and the curve through their crests is the spectrum it carries.',
    section: 'Modeling Light',
  },
  'wave-to-ray': {
    title: 'Small Wavelength Limit',
    blurb: 'A Huygens–Kirchhoff wave field bouncing off two mirrors, with the wavelength shrinking until it collapses onto the ray paths drawn over it.',
    section: 'Modeling Light',
  },
  'radiance-boundary': {
    title: 'Radiance on the Boundary',
    blurb: 'The same room, with p walking the scene boundary and a vector sweeping the hemisphere that points into it.',
    section: 'Modeling Light',
  },
  'roulette-rooms': {
    title: 'The Same Walks, Scored Twice',
    blurb: 'Two rooms holding the identical set of paths, at identical cost. On the left only the vertex a walk finished on may count; on the right every vertex counts. The right room finds the lamp several times as often, for nothing.',
    section: 'Integration',
  },
  'curse-of-dimension': {
    title: 'Riemann Sums, and Dimension',
    blurb: 'Error against cost, log-log, as the dimension climbs. The grid curves fan out and flatten at slope -2/d; the sampled ones stay parallel at -1/2 in every dimension.',
    section: 'Integration',
  },
  'riemann-2d': {
    title: 'Riemann Sums (2D)',
    blurb: 'A grid of boxes under a glass surface, filling in serpentine order.',
    section: 'Integration',
  },
  'monte-carlo-2d': {
    title: 'Monte Carlo (2D)',
    blurb: 'Spikes under a glass surface, each wrapped in a cylinder whose volume is its contribution.',
    section: 'Integration',
  },
  'importance-sampling': {
    title: 'Importance Sampling',
    blurb: 'Uniform vs normal sampling on a bump with dead tails, stacked. Same random numbers, aimed differently.',
    section: 'Integration',
  },
  'monte-carlo-1d': {
    title: 'Monte Carlo (1D)',
    blurb: 'Random samples, each carrying a bar whose area is its contribution. Uniform vs importance sampling.',
    section: 'Integration',
  },
  'riemann-1d': {
    title: 'Riemann Sums (1D)',
    blurb: 'Midpoint bars under a lumpy function. Full sum, left-to-right sweep, or a convergence ramp.',
    section: 'Integration',
  },
  'hello-3d': {
    title: 'Hello 3D',
    blurb: 'Palette and lighting check — mineral colours against the void.',
    section: 'Scaffolding',
  },
  'hello-graph': {
    title: 'Hello Graph',
    blurb: 'A 1D function drawn in the flat 2D stage. Starting point for Riemann sums.',
    section: 'Scaffolding',
  },
};

export interface DemoEntry extends DemoInfo {
  name: string;
  load: () => Promise<unknown>;
}

/** Turn "monte-carlo-2d" into "Monte Carlo 2d". */
function prettify(slug: string): string {
  return slug.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Every demo in the repo. Vite resolves this glob at build time, so it works
 * identically in `npm run dev` and in a production build.
 */
export function allDemos(): DemoEntry[] {
  const mods = import.meta.glob('../demos/*/main.ts');
  return Object.entries(mods)
    .map(([path, load]) => {
      const name = path.split('/')[2];
      const info = INFO[name] ?? {};
      return {
        name,
        load,
        title: info.title ?? prettify(name),
        blurb: info.blurb,
        section: info.section ?? 'Unsorted',
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
