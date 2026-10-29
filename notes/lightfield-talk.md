# The light-field talk: narrative

*Hour-long talk; slides in `talk/slides.md`, deck design in `notes/deck.md`.
This file records the arc as Steve has laid it out. Nothing enters it without
his approval. Audience and date: not yet given.*

## The arc

1. **Beautiful path-traced images.** Steve's own and from films. No cold
   open.

2. **The theory of realistic image rendering.** Many decisions to make here
   (see below).

3. **A basic unidirectional path tracer.** Written down, not derived
   rigorously, and then watched as it converges.

4. **The cost.** Move the camera a little and the image has to be rebuilt
   from scratch. Thinking this through mathematically leads to another,
   crazier way to make an image.

5. **Back to the beginning: the whole picture.** Light fields; realistic
   light fields; cameras.

6. **The idea.** Store an entire equilibrium light field (a fixed point of
   an enormous operator) on disk, call it up, and integrate it through a
   lens/camera model. That last integral is low-dimensional (2D or 4D), so
   it is fast, and you can move around essentially in real time.
   **The real story, for real materials:** the stored object is the full
   field $L(p,\omega)$ on the direction bundle, not the diffuse special case
   $L(p)$, which appears at most in passing. Shown piece by piece:
   - unrolling the objects (`light-field-unfold`);
   - storing the direction bundle over the surface as textures
     (`light-field-fibers`, `-forest`, `-atlas`, `-spectra`);
   - running the computation (light-field's lab Neumann stepper, its
     `unwrap-bake` page);
   - the integral that calls up pixels and reads their values into an image
     (`light-field-image`, `light-field-scan`);
   - and then the real-time program: light-field's `4d` page, which stores
     $L(p,\omega)$ for glossy surfaces. The room stores the diffuse
     collapse, so it must not stand in for the 4D claim.

7. **Building it.** The challenges of designing this from a software
   perspective, and how AI helped (and did help) code it up, so that Steve
   could focus on the mathematics and on understanding the story.

## Open decisions

**Part 2, the theory.**
- How far down to start: Maxwell → rays (`wave-to-ray`,
  `notes/maxwell-to-spectra-memo.md`), or with radiance taken as given.
- **Spectrum → RGB is in the talk** (Steve): what we do with a spectrum to
  get to RGB or whatever. Natural home: the camera as a measurement, where a
  pixel integrates the spectrum against response curves (`ray-spectrum`,
  `material-measure`, `pixel-response`, `metamerism`). Placement open:
  Part 2, Part 5, or both.
- **Decided: option A.** The talk tells the spectral story as the true
  object and says plainly that the stored field is RGB, then talks through
  the tradeoffs and the non-exactness of the model. light-field stays RGB.
  The content:
  - the true field is $L(p,\omega,\lambda)$, and the camera integrates it
    against response curves;
  - transport is diagonal in wavelength (no fluorescence), so the equation
    decouples into $L_\lambda = E_\lambda + K_\lambda L_\lambda$; this is what
    makes rendering in a few channels conceivable;
  - RGB keeps three channels with three-number reflectances, which is exact
    only if projection commuted with reflection's pointwise product, and
    $P(\rho s) \ne P(\rho)P(s)$; the error grows with bounces ($\rho^n$)
    and with saturation;
  - so the approximation is made before transport, not at the camera;
  - the tradeoff: a spectral field costs storage and bake time per
    coefficient on top of an already large 4D field, and a small spectral
    basis is not closed under multiplication either, so it reduces the error
    without removing it.
  `light-field-spectra` draws reconstructed metamers for this reason.
- How much material: **decided, real materials** (general reflectance, not
  only diffuse), since Part 6 stores the general field.
- The form of the equation: integral, operator, or both.
- Camera: pinhole, or thin lens (needed if focus/aperture return in Part 6).
- Level of rigour.

**Splitting Parts 2 and 5.** Both introduce the theory. A possible split
(proposed, not agreed): Part 2 local, as practitioners tell it (one pixel,
an integral over paths, random walks); Part 5 global (the field on all rays
as one object, transport as an operator, realistic fields as its fixed
points, the camera as a linear measurement).

**Parts 4 → 6, the turn.** Candidate framing (proposed, not agreed): the
image is $C(I-K)^{-1}E$. Path tracing brackets it from the camera's side;
the stored field brackets it from the light's side. Path space has
unbounded dimension; the camera integral over a stored field is at most 4D.

**Part 6, storage.** Decided: the general 4D field for real materials;
the diffuse collapse at most in passing. The `light-field-*` demos already
store full fibers everywhere (`COLLAPSE = false` in `light-field-forest`),
and their glossy sphere's fibers genuinely vary. Still open: whether mirrors
(a Schur complement, chartless) get mentioned. Deck sliders on the `4d` page
need light-field's lab to publish `__lens` as the film page does (light-field
docs/23).

**The close.** Not yet discussed.

## Live material already available

- Path tracing converging, and restarting when the camera moves: the lab in
  reference mode (key `9`).
- The stored field, steady under camera motion: the lab in lit mode (`8`),
  the room with deck sliders for aperture and focus.
- 2D theory demos in this repo: `radiance-2d`, `radiance-boundary`,
  `fixed-point`, `bounce-series`, `path-space`, `pixel-lens`, the
  `monte-carlo-*` and `riemann-*` demos, and the `light-field-*` demos.
