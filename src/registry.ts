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
  'iterate-from-black': {
    title: 'Iterating from Nothing',
    blurb:
      'One dark room with E + TL applied ten times, and under it the composition that produced each picture — 0, then E + T0, then E + T(E + T0), written out in full the whole way rather than giving up and counting. The single room is what buys the room for it.',
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
  'path-splits': {
    title: 'The Same Path, Many Ways',
    blurb: 'One complete path, recoloured by every split of it: t vertices from p, s from the lamp, and the connection sliding along. Add the strategies up and it is counted once per row.',
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
  // Part VII's "Storing a light field", in 3D — the same argument the
  // state-space demos make about the 2D room, carried out on a real baked
  // field imported as data from the light-field repo. One continuous shot
  // in three parts, so the titles are numbered: the folder names sort
  // fibers, forest, unfold, which is not playing order.
  // See notes/light-field-demos.md before changing these.
  'light-field-density': {
    title: 'Storing a Light Field: the Real Density',
    blurb: 'The unfolded net at the demos\' 8 texels per unit, then every cell splits (16, 32, 64) down to the light-field repo\'s actual bake of this room, until the grid is too fine to see. Every level is the real bake averaged to that grid.',
    section: 'Light Fields in 3D',
  },
  'light-field-camera': {
    title: 'A Thin-Lens Camera Pointed at the Stored Light Field',
    blurb: 'The stored field unfolded, every texel showing its tile of directions, and a thin-lens camera aimed at it: each pixel averages rays through points of the lens, each ray lighting the direction cell it reads, and the photograph fills in.',
    section: 'Light Fields in 3D',
  },
  'gallery-scene': {
    title: 'The Gallery, in Plain three.js',
    blurb: "The light-field repo's gallery scene (corridor, colour bays, pedestals, 29 balls, five ceiling lights) drawn with three.js's ordinary materials and lights: the objects, with none of their light computed. Drag to orbit.",
    section: 'Light Fields in 3D',
  },
  'light-field-unfold': {
    title: 'Storing a Light Field — 1. The Room Unfolds',
    blurb:
      'A lit Cornell room comes apart into the flat textures its light is kept in — walls hinging open, the cube unfolding like cardboard, the sphere opening octahedrally. The light is a baked equilibrium field rather than a shading model, and every chart hangs off the edge it physically shares, so the first frame is the actual scene and the net is whatever that room unfolds into.',
    section: 'Light Fields in 3D',
  },
  'light-field-fibers': {
    title: 'Storing a Light Field — 2. The Fiber Over a Pixel',
    blurb:
      'Spheres rise over pixel after pixel, each tinted by its own surface: over every point there is a whole S-squared of directions light can leave in. All but one fade, and the survivor unwraps into the 8x8 grid actually stored — which on a diffuse surface is constant. It was baked without that shortcut, one random walk per direction bin, so the flat tile is 64 estimators agreeing rather than a definition.',
    section: 'Light Fields in 3D',
  },
  'light-field-forest': {
    title: 'Storing a Light Field — 3. Every Pixel At Once',
    blurb:
      'All 1,575 fibers at the same time, flying in and shrinking until each lands exactly on the pixel it belongs to. The sheet becomes a nested grid, 8x8 cells inside every cell, in the same physical space — sixty-four times the numbers and not one millimetre more room. The camera closes in as the tiles land, so the grid grows underneath them and it reads as subdivision.',
    section: 'Light Fields in 3D',
  },
  'light-field-atlas': {
    title: 'Storing a Light Field — 4. The Room and Its Atlas',
    blurb:
      'The lit room on the right, and on the left every chart of its light field packed flat — the same texels, off the surfaces and in the arrangement a renderer keeps them in. A marker walks the room and the matching cell lights in the panel. The net of demo 1 is derived from the geometry; a packing is not, and charts that sit side by side here are not neighbours in the room.',
    section: 'Light Fields in 3D',
  },
  'light-field-spectra': {
    title: 'Storing a Light Field — 5. Every Pixel Holds a Spectrum',
    blurb:
      'Over every texel of the flat net a curve stands up: wavelength across, radiance up. Not a colour per pixel but a function per pixel — the spectral factor, where demo 3 showed the directional one. The bake is RGB, so each curve is a reconstructed metamer in the deck\'s own basis rather than stored data, which the demo header states and a slide should too.',
    section: 'Light Fields in 3D',
  },
  'light-field-image': {
    title: 'Storing a Light Field — 6. Photographing It',
    blurb:
      'A camera outside the open front, a grid of pixels on its image plane, and every pixel filled by one ray and one lookup: hit the first surface, read the radiance already stored there in the direction back to the eye. Nothing bounces — not even on the glossy sphere, whose stored fiber is view-dependent and answers the question directly. 4,096 pixels, 16,384 rays, zero bounces.',
    section: 'Light Fields in 3D',
  },
  'light-field-pinhole': {
    title: 'A Pinhole Camera in 3D',
    blurb: 'light-field-image with the camera made a box: a pinhole at the eye, the sensor behind it. Each pixel reads the stored light field along the one ray through the pinhole onto it; the image lands on the sensor upside down.',
    section: 'Modeling Light',
  },
  'light-field-scan': {
    title: 'Storing a Light Field — 7. Watching the Memory Get Read',
    blurb:
      'The demo before it, split: the same exposure on the right, and on the left the field\'s charts packed flat. Every pixel the camera measures flares the texel it read — brightly in the panel, faintly on the surface in the room. The sweep crosses the image in neat rows; the glow does nothing of the kind, jumping charts the instant a ray crosses a silhouette. Viewing order and storage order have nothing to do with each other.',
    section: 'Light Fields in 3D',
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
  'wave-room': {
    title: 'The Wave Equation, Solved',
    blurb:
      'A pulse from a point in a room of pillars, slabs, a slit and a concave wall, with the 2D wave equation stepped forward on a grid — shadows, diffraction, a caustic and reverberation all falling out of the one PDE. Switch the display to the time average and the oscillation integrates out into something that looks like a rendered image.',
    section: 'Modeling Light',
  },
  'light-field-room': {
    title: 'A Spectrum on Every Ray',
    blurb: "The beam room with coloured walls, its equilibrium light computed by light tracing (spectral, in the ray limit). Drag a probe ray anywhere and the graph shows the spectrum travelling along it, read back from the surface it left.",
    section: 'Modeling Light',
  },
  'phong-highlight': {
    title: 'The Phong Highlight',
    blurb: 'The Phong pass\'s number on its own: a surface edge-on, its normal n, the sun\'s direction l mirrored to R, and an eye along v; R · v = cos α and (R · v)^30, read out with the grey the pass paints. The eye sweeps through R; drag it or the sun, or the eye and sun sliders.',
    section: 'Modeling Light',
  },
  'cos-theta': {
    title: 'cos θ = n · l',
    blurb: 'The brightness pass\'s number on its own: a surface edge-on, its normal n, the sun and its direction l; the projection of l onto n is cos θ, read out with the grey the pass paints, max(0, cos θ). The sun sweeps; drag it, or the sun slider.',
    section: 'Modeling Light',
  },
  'brdf-fan': {
    title: 'What T Is Made Of',
    blurb: 'One ray of white light meets the red wall, the green wall and a mirror of the beam room; what leaves is drawn as rays, the surface\'s BRDF: the walls the same in every direction in their colour (white times the Material Response below), the mirror one way.',
    section: 'Modeling Light',
  },
  'beam-bounce': {
    title: 'The Lamp, and One Bounce',
    blurb: 'The beam room twice, as rays: E, the lamp\'s light to the first thing it meets; and T(E), the room acting once: the mirror sends the beam on, the walls send light out in every direction in their colour.',
    section: 'Modeling Light',
  },
  'geometric-series': {
    title: '1/(1 - x) and its Taylor Polynomials',
    blurb: 'The partial sums 1 + x + ... + x^N appear one at a time and close in on 1/(1 - x) inside |x| < 1.',
    section: 'Solving for the Light Field',
  },
  'path-terms': {
    title: 'A Sum over Paths',
    blurb: 'C E + C T E + C T² E + C T³ E + ⋯ with a small beam room under each term: one real light path of that length, from the camera through n surfaces to the lamp.',
    section: 'Solving for the Light Field',
  },
  'camera-terms': {
    title: 'Path Tracing from a Camera, Term by Term',
    blurb: 'Three beam rooms, one per path length from the film to the lamp (2, 3, 4): the camera, a few of its sampled paths of that length, and that term\'s image on the film as a strip. ?mc: sampled live.',
    section: 'Solving for the Light Field',
  },
  'term-rooms': {
    title: 'The Rooms We Are Adding Up',
    blurb: 'E + TE + T²E + ⋯ as three glowing beam rooms in a row, each lit only by light that has interacted exactly n times. ?mc: each fills in live by sampling paths.',
    section: 'Solving for the Light Field',
  },
  'title-caustic': {
    title: 'A Caustic, for the Title',
    blurb: 'Rays from one point on a circular mirror, reflecting inside it, added a few at a time until the cardioid caustic builds up.',
    section: 'Modeling Light',
  },
  'state-space-beam': {
    title: 'The Space of States, in the Beam Room',
    blurb: 'state-space for the beam room: the circle of directions at every point of the boundary stands up and sweeps out a torus over the walls and a cylinder over each two-sided mirror (outgoing light: its front and back hemispheres make one circle).',
    section: 'Modeling Light',
  },
  'state-space-beam-stored': {
    title: 'Storing the Beam Room\'s Light Field',
    blurb: 'state-space-beam chopped into cells (patch × direction bin) and unrolled into flat grids: four for the walls, which keep only their outgoing half, and two for the mirrors, which keep both.',
    section: 'Modeling Light',
  },
  'sample-interpolate-2d': {
    title: 'Store Samples, Interpolate Between Them (2D)',
    blurb: 'A complicated function of two variables as a surface, a uniform grid under it, its values kept at the grid points, the surface gone, and the bilinear interpolant built cell by cell; then the function back as a faint mesh to compare. ?n= sets the grid.',
    section: 'Modeling Light',
  },
  'sample-interpolate': {
    title: 'Store Samples, Interpolate Between Them',
    blurb: 'A function, a uniform grid under it, its values kept at the grid points, the function gone, and the straight-line interpolant drawn between the kept values; then the function back, faint, to compare. ?n= sets the grid.',
    section: 'Modeling Light',
  },
  'beam-series': {
    title: 'The Equilibrium as a Series',
    blurb: 'The beam room as glow: one term T^n E at a time, the lamp\'s light after exactly n interactions, beside the running sum, which climbs to the equilibrium (Id - T)^-1 E.',
    section: 'Modeling Light',
  },
  'equilibrium-room': {
    title: 'Which Light Fields Are Equilibria?',
    blurb: 'Guesses at the light in the beam room (darkness, the lamp alone, glowing walls): each drawn as L, then T(L), then E + T(L), and none comes back to itself. The equilibrium is the one that would. ?panels=three: L = E + T(L) for the computed equilibrium; ?panels=question: E and L.',
    section: 'Modeling Light',
  },
  'pinhole-camera': {
    title: 'A Pinhole Camera',
    blurb: 'A box with a pinhole in the beam room: each pixel reads the one spectrum on the ray through the pinhole onto it, and turns it into a colour. A 2D room makes a 1D image. Drag the camera after the scan and the image is read again at once.',
    section: 'Modeling Light',
  },
  'beam-spectrum': {
    title: 'Along a Ray, a Spectrum',
    blurb: "wave-to-ray's lamp and mirrors in the ray limit, and at a point on the beam the light arriving along that ray: a smooth curve for a sun-like lamp, spikes for neon. A spectrum is a positive measure on wavelengths.",
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
    blurb:
      'A lobed region with a hole through it, sitting inside the usual square plate, with the graph drawn only above it. Points are thrown uniformly into the region and each carries a cylinder whose volume is its contribution — the method working somewhere a grid is awkward, with no claim about how fast it gets there.',
    section: 'Integration',
  },
  'importance-intro': {
    title: 'Where the Weight Comes From',
    blurb:
      'One integrand, one estimator, and a density that slides from uniform toward the bump. The same random numbers are remapped rather than redrawn, so the samples crowd inward and each one\'s rectangle narrows to pay for it — the weight 1/(Np) is the width of the domain that sample stands in for.',
    section: 'Integration',
  },
  'importance-2d': {
    title: 'Importance Sampling in 2D',
    blurb:
      'A narrow diagonal ridge, estimated twice with the same number of samples: uniformly over the square, and from a normal with the ridge\'s own oval shape. Each sample\'s cylinder has the volume it contributes, so the reweighting is visible as discs that shrink where the samples crowd.',
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
