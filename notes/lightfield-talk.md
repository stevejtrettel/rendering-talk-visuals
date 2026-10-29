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
   it is fast, and you can move around essentially in real time. Shown
   piece by piece:
   - unrolling the objects (`light-field-unfold`);
   - storing the direction bundle over the surface as textures
     (`light-field-fibers`, `-forest`, `-atlas`, `-spectra`);
   - running the computation (light-field's lab Neumann stepper, its
     `unwrap-bake` page);
   - the integral that calls up pixels and reads their values into an image
     (`light-field-image`, `light-field-scan`);
   - and then the real-time program (the room, the lab).

7. **Building it.** The challenges of designing this from a software
   perspective, and how AI helped (and did help) code it up, so that Steve
   could focus on the mathematics and on understanding the story.

## Open decisions

**Part 2, the theory.**
- How far down to start: Maxwell → rays (`wave-to-ray`,
  `notes/maxwell-to-spectra-memo.md`), or with radiance taken as given.
- Spectral or RGB. The light-field bake stores RGB.
- How much material: diffuse, glossy, mirror.
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

**Part 6, how much storage theory.** Storage is shown in Part 6. Still open:
whether it includes the storage-dimension argument (diffuse collapses to
2D, exactly $N^2$ smaller; glossy stays 4D; mirrors are a Schur complement),
or only the diffuse case.

**The close.** Not yet discussed.

## Live material already available

- Path tracing converging, and restarting when the camera moves: the lab in
  reference mode (key `9`).
- The stored field, steady under camera motion: the lab in lit mode (`8`),
  the room with deck sliders for aperture and focus.
- 2D theory demos in this repo: `radiance-2d`, `radiance-boundary`,
  `fixed-point`, `bounce-series`, `path-space`, `pixel-lens`, the
  `monte-carlo-*` and `riemann-*` demos, and the `light-field-*` demos.
