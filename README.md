# Rendering Talk — Visuals

Quick-and-dirty visual generator for the talk on the mathematics of path
tracing and 3D rendering. Every demo is a self-contained sketch; the shared
code exists only where several demos genuinely wanted the same thing.

```bash
npm install
npm run dev          # http://localhost:5173 — index page listing every demo
```

## Adding a demo

Create `demos/<name>/main.ts`. That is the whole procedure — it appears on the
index page automatically.

```ts
import { createStage, createUI, C, glossy } from '@';
import { polyline } from '@/lines';

const stage = createStage({ position: [0, 2, 7] });
stage.duration = 8;                 // loop length, and the default export length
const ui = createUI(stage);

const params = { n: 12 };
ui.params.add(params, 'n', 1, 200, 1);

stage.frame((t) => {
  // animate from t, never from performance.now() — see "Time" below
});

stage.start();
```

Optionally add a title and blurb for the index page in `src/registry.ts`.
Without one you get a prettified folder name, which is usually fine.

## Exporting

Everything lands in `out/`, and it is git-ignored.

| Key | Action |
| --- | --- |
| `S` | Save a PNG still → `out/stills/<demo>-<timestamp>.png` |
| `V` | Render exactly one loop → `out/<demo>.mp4` |
| `H` | Hide the control panel (for screen recording) |
| `R` | Restart from t = 0 |
| `space` | Play / pause |

**Video export is one button and ends with a finished movie.** The page steps
`t` frame by frame, POSTs each frame to the dev server, which writes the PNGs
to disk and runs `ffmpeg` when the last one lands. There is nothing to unzip
and no sequence to assemble by hand.

Because it steps time rather than recording in realtime, a frame that takes two
seconds to render is fine — the output is still perfectly even. That matters
once demos start path tracing.

Set the format to `prores` in the Capture folder for a ProRes 4444 `.mov`
instead — bigger, pristine, and what Keynote prefers for anything with fine
gradients.

To re-encode frames you already captured (say, to switch a take to ProRes
without re-rendering it):

```bash
npm run video <demo-name> [fps] [mp4|prores]
```

Export requires the dev server, since the writing-to-disk half lives in vite
middleware. `npm run build` produces a static gallery, but without export.

## Time

Demos animate from the `t` handed to `stage.frame((t, dt) => …)`, **not** from
`performance.now()`. This is what lets the exporter set `t` to any value and
take as long as it likes per frame. Reach for wallclock inside a demo and video
export silently starts stuttering.

**Never call `Math.random()` in a demo.** The exporter renders a frame by
setting `t` and re-running your update, so anything that reseeds per frame
produces different values every frame and the video boils with noise. Draw a
fixed stream once with `uniformStream()` from `src/sampling.ts` and index into
it. In a mode where nothing should move, every exported frame should come out
byte-identical.

`stage.duration` is the loop period. Make a motion complete exactly one cycle
over `duration` and the exported video loops seamlessly.

**Export renders exactly one loop.** It restarts at `t = 0` and captures
`stage.duration` seconds, so the only thing to set is the frame rate. There is
no length control on purpose: stop short and the motion is cut mid-cycle, run
over and the movie repeats itself. Set `stage.duration` to the length you want
and press `V`.

`stage.progress(t)` is the loop phase in [0, 1] — what a motion that returns to
where it started should ride. `stage.progress(t, hold)` finishes `hold` seconds
early and parks at 1, which is what a demo that *ramps to a result* wants: the
answer stays up long enough to read, and it is exactly what the last exported
frame contains. (The capture ends at `duration − 1/fps`, so a ramp reaching 1
only at the very end never quite gets there.) The convergence demos —
`riemann-1d`, `riemann-2d`, `monte-carlo-1d`, `monte-carlo-2d`,
`importance-sampling` — all end on a hold.

`demo.html?d=<name>&t=<seconds>` opens a demo frozen at that instant, which is
how to check what a given moment looks like without waiting for it.

## Framing

The canvas holds a locked 16:9 box, letterboxed in the window, and exports at
1920×1080. What you frame while fiddling is exactly what lands in Keynote — the
export never reframes on you.

Line widths are authored against 1080p and scale automatically, so a `width: 4`
line has the same weight in a small preview window and in the rendered movie.

In a 3D scene, put readouts on `stage.hud` — a flat overlay in fixed screen
coordinates (y from −1 to +1, x from ∓16/9) drawn on top of the 3D image. World
-space text swings around with the camera and changes size with distance, which
is unreadable in a talk. The HUD is part of the canvas, so it exports.

## Comparing two demos side by side

Demos meant to be compared (`riemann-2d` and `monte-carlo-2d`) are separate
demos rather than a split screen or a toggle: each gets the whole frame, and a
toggle is useless in a talk since you cannot click mid-slide. They share a
duration and an N-ramp, so the two exported videos are frame-synchronised —
drop both into Keynote side by side and they stay in step, at full resolution
each, with the option of showing either alone.

## Layout

```
demos/<name>/main.ts   one sketch, self-contained
src/style.ts           the palette and materials — retune here to restyle everything
src/stage.ts           renderer, camera, 16:9 letterbox, the clock
src/lines.ts           thick lines, graphs, axes (THREE.Line is 1px and unusable)
src/text.ts            in-canvas labels, so numbers appear in exports
src/functions.ts       shared integrands, so demos compare like for like
src/response.ts        the CIE observer and the spectrum-to-colour step
src/still-life.ts      the subject the camera demos photograph, as spectra
src/field2d.ts         shared 3D scenery for the surface demos
src/room2d.ts          shared 2D room, spectra and graph panel for the light-field demos
src/bundle2d.ts        the state space over the 2D room's boundary — the two tori, their cells, the unroll
src/sampling.ts        seeded RNG + inverse-CDF densities (importance sampling)
src/capture.ts         stills and frame-stepped video
src/ui.ts              lil-gui panel and keyboard shortcuts
src/registry.ts        demo discovery + optional titles for the index page
vite.config.ts         dev middleware that writes frames and runs ffmpeg
```

## Style

All colours come from `src/style.ts`: a black void and natural mineral
pigments — slate, blue, moss, ochre, rust, bone. Each hue has a `-Deep`
variant for shadowed faces and recessive fills. `CYCLE` / `cycle(i)` give a
contrasting sequence for "N of these, all different" cases; `ramp(t)` maps a
scalar cold→hot.

The control panel is DOM, so it can never appear in an exported PNG or mp4.
Press `H` before a screen recording.

**Computing a colour rather than picking one?** The stage renders through ACES
tone mapping into sRGB, which is what holds the palette together and is right
for anything that is scenery. A swatch showing a *computed* colour is not
scenery — it has to be the colour it says it is. Set `toneMapped = false` on
that material and pass the value with its colour space named
(`color.setRGB(r, g, b, THREE.SRGBColorSpace)`), or three treats an already
encoded colour as linear, encodes it a second time, and every value comes out
washed out. `pixel-response` is the worked example.

Labels use `label()` from `src/text.ts`, which draws real geometry inside the
canvas — DOM text would be invisible in every export. The font (STIX Two Text,
OFL) is vendored in `src/assets/` rather than fetched from a CDN, so renders
work offline. It is a Latin subset, so there is no `∫` or `Σ`; labels spell
things out instead, which reads better projected anyway.

## Requirements

`ffmpeg` on PATH for video export (`brew install ffmpeg`).
