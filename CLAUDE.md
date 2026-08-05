# Working in this repo

Visuals for a talk on the mathematics of path tracing. `README.md` covers the
mechanics — adding a demo, exporting, the time contract. This file is the part
that is learned rather than documented: how the work goes, and the mistakes that
have already been made once.

## The job

Steve gives a picture description. Build it, show it, iterate. The deliverable is
a demo that exports cleanly to PNG/mp4 for Keynote, in the deck's visual
language. **Ship quickly; do not build abstractions for their own sake.** Shared
code exists only where several demos genuinely wanted the same thing
(`scene2d.ts`, `room2d.ts`, `field2d.ts`).

Act rather than ask. Ask only when two readings would produce materially
different work — and before asking, check whether the answer is in the repo. If
something is already half-built and works, finish it rather than reverting it.

`notes/slides.md` and `notes/path-tracing-talk-narrative*.md` are the talk's
actual content. Read the relevant slide before designing a picture for it. They
are background, not instructions — take direction from Steve.

## The two scenes

Every 2D demo is set in the same room, and which version it uses is a claim:

- **continuous** — smooth circle, analytic intersection. For demos about the
  continuous theory: `radiance-2d`, `radiance-boundary`, `linear-scene`.
- **discrete** — 16-facet polygon, boundary cut into patches, tiled walls and
  rim, and the render target upscaled with `NearestFilter` so its own grid is
  visible. For demos that have reduced the problem to linear algebra:
  `fixed-point`, `light-dies-out`, `bounce-series`, `path-space`.

**Rule: if a demo discretises transport, everything in the frame is drawn
discretised. If the mathematics is continuous, the object stays smooth.**

Both come from `src/scene2d.ts`, defined in proportions of the room's
half-width, so each demo picks its own scale and they still read as one room.
The object rests *on* the floor at every scale — `radiance-boundary` walks p
from the floor onto the object where the two pieces of Σ touch, and a floating
object silently breaks that walk into two disconnected circuits.

Someday: derive the discrete room from the continuous one with a `discretise()`
step instead of keeping two functions in agreement by hand.

## Verify visually before saying it works

A demo that typechecks can still render black. Screenshot it.

```bash
# server and shot in ONE command — background servers get killed between calls
npm run dev -- --port 5199 --strictPort > /tmp/dev.log 2>&1 &
DEV=$!; sleep 5
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
  --disable-gpu --enable-unsafe-swiftshader --use-gl=angle --use-angle=swiftshader \
  --window-size=1280,720 --virtual-time-budget=5000 \
  --screenshot=/tmp/shot.png "http://localhost:5199/demo.html?d=<demo>"
kill $DEV
```

Gotchas, all of which have cost time:

- **`timeout` does not exist on macOS.** A command starting with it fails
  instantly and silently looks like a hang. Use the Bash tool's own timeout.
- **Virtual time does not reliably advance the animation.** Shots land at
  `t ≈ 0`. Add `&t=<seconds>` to the URL: the stage freezes there, so
  `demo.html?d=riemann-1d&t=6.5` shoots that instant exactly. For a *param*
  there is still no URL hook — temporarily edit the default, shoot, restore
  from a backup copy, and verify the restore. Do the edit, the shots and the
  restore in *separate* Bash calls: a call that times out is killed, and an
  inline restore at the end of it never runs.
- **Software GL is slow.** Heavy fragment shaders can take minutes per frame;
  drop `resolution` for the shot rather than waiting.
- **Text may not appear.** troika lays out asynchronously and often misses the
  budget. Missing labels in a headless shot usually mean nothing is wrong.
- Port 5173 is often another project of Steve's. Pick a free port.

## Determinism

Every demo is a pure function of `t` and its params — no `Math.random()`, no
wallclock, no state carried between frames. Iterative demos recompute from the
seed every frame. This is what makes frame-stepped export exact, and it is not
negotiable.

Deterministic dither is fine and useful: a hash of `gl_FragCoord` gives
per-pixel jitter that is identical every frame, which breaks up banding in
gathers without making the video boil.

## Shaders

- `glslVersion: THREE.GLSL3` in three defines `varying` but **not**
  `gl_FragColor`. Declare `layout(location = 0) out vec4 fragColor;` yourself. A
  missing declaration fails to compile silently and the demo renders black —
  this has happened twice.
- A GLSL constant used but not declared does the same thing. If a shader-backed
  demo goes black, suspect the shader before the maths.
- Pattern for expensive per-pixel work: render into a `WebGLRenderTarget` sized
  to `drawingBufferSize × resolution`, display it on a full-frame quad, expose
  `resolution` as a param. Exports can turn it up; previews stay usable.

## Text in the frame

**Label materials must stay `transparent: true`, even at full opacity.** troika
antialiases a glyph by computing a coverage alpha across its edge and
discarding only the fully-transparent fragments. Turn blending off and every
partially covered edge pixel gets written at full opacity — the antialiasing is
computed and thrown away, and glyphs come out binary and stair-stepped. troika
forces the flag on its own material for this reason. This cost a while to find
because the preview is supersampled (devicePixelRatio up to 2) while an export
is a flat 1920×1080, so on screen the hard edges averaged away and the problem
only existed in the file. **Judge export quality at export resolution**:
`--window-size=1920,1080` in a headless shot gives the same drawing buffer the
exporter uses; crop and upscale with `flags=neighbor` to inspect edges.


Minimal and constant across demos. Graphs are labelled with the same phrases
wherever they appear — **Spectrum In**, **Material Response**, **Spectrum Out**,
**Total Mass** — centred *below* the axis so a label belongs to the graph above
it. No narration in the frame: the slide and the speaker carry that. Axis words
("radiance", "wavelength (nm)") have been removed deliberately; ticks stay.

## Honesty

The deck's audience is mathematicians, and the pictures are arguments.

- **The picture must not claim structure the model does not have.** Drawing a
  faceted silhouette over a circular model would have shown a discretisation
  that was not there; the object was made genuinely polygonal instead, in the
  patches, the visibility tests and the ray casts.
- **Do not build a picture out of the thing it claims.** `linear-scene`
  simulates all three panels independently, so "the third is the sum" is a
  result rather than an arithmetic identity of the code.
- **If graphs multiply, they must multiply.** `material-measure`'s response
  curve carries the `|n·ω|` factor because `out = in × response` is drawn as a
  claim; keeping the cosine only in the diagram made a constant times a constant
  come out varying.
- **State readability-over-physics choices in the header.** Ambient floors,
  gathered-light weights, RGB proxies for spectra: all fine, all written down
  where they are made.
- **The `light-field-*` demos draw solved data, not a shading model** — a real
  baked radiance field imported from the `light-field` repo. Several of their
  pictures are claims about what is *stored*, and a reasonable-looking edit can
  quietly turn one into a lie (re-indexing a fiber is fine, re-computing it is
  not; a black cell there is usually backface radiance, not absence). Read
  `notes/light-field-demos.md` before touching them.

## Animation grammar

- **Do not sweep a variable of integration.** A probe walking the circle of
  directions reads as a light source moving through the scene — the scene always
  wins. Move things that are things.
- **Iterating is not time passing.** `fixed-point` and `light-dies-out` step
  discretely with a counter; a smooth fade would claim the room is evolving, and
  the model is stationary.
- Motions complete one cycle over `stage.duration` so exports loop.
- **A demo that ramps to a result holds on it.** `V` captures frames `0 …
  duration − 1/fps`, so a ramp that finishes at `u = 1` shows its final state
  for one frame in preview and never quite reaches it in the export. Drive
  those from `stage.progress(t, HOLD)`: the ramp lands `HOLD` seconds early and
  parks, which gives the eye time on the answer and makes the final state
  exactly what the last exported frame contains. `stage.progress(t)` with no
  hold is the plain cyclic phase, which is what a *returning* motion wants —
  don't hold one of those, it would stutter at the loop point.

## Where things live

```
src/scene2d.ts     the shared room, continuous and discrete versions
src/room2d.ts      the continuous room's renderer, spectra, spectrum panel
src/bundle2d.ts    T-1 M restricted to Sigma: the lift, the cells, the unroll, the shot
src/style.ts       palette — retune here to restyle everything
src/stage.ts       renderer, 16:9 letterbox, the clock
src/lines.ts       thick lines (THREE.Line is 1px and unusable)
src/text.ts        in-canvas labels, so text survives export
src/lightfield/    a baked light field, imported as data from the light-field
                   repo: the bundle reader, the octahedral map, the peel, and
                   the shared unwrap scene the three light-field-* demos use
                   (see notes/light-field-demos.md)
```

Demos own their own layout constants. Frame is 16:9, half-height 3, so
`HALF_W = ORTHO_H * 16/9`. Steve has asked about a per-demo export aspect ratio
(wider, for slide text above); not built yet, and it would mean demos reading
the aspect from the stage instead of hardcoding it.

## Known rough edges

- `demos/pixel-response/main.ts` has a `Pt`/`P3` type error that breaks a
  project-wide `npx tsc --noEmit`. It is Steve's in-flight file — filter it when
  checking your own work: `npx tsc --noEmit 2>&1 | grep -v pixel-response`.
- `demos/pixel-*` and `metamerism` are Steve's; do not restyle them unasked.
