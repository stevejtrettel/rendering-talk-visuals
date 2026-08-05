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
  'radiance-2d': {
    title: 'Radiance',
    blurb: 'A 2D room, the circle of directions at a point, and the spectrum carried by the ray in each direction.',
    section: 'Modeling Light',
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
