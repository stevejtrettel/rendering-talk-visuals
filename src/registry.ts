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
