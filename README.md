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
| `V` | Render a video → `out/<demo>.mp4` |
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

`stage.duration` is the loop period. Make a motion complete exactly one cycle
over `duration` and the exported video loops seamlessly.

## Framing

The canvas holds a locked 16:9 box, letterboxed in the window, and exports at
1920×1080. What you frame while fiddling is exactly what lands in Keynote — the
export never reframes on you.

Line widths are authored against 1080p and scale automatically, so a `width: 4`
line has the same weight in a small preview window and in the rendered movie.

## Layout

```
demos/<name>/main.ts   one sketch, self-contained
src/style.ts           the palette and materials — retune here to restyle everything
src/stage.ts           renderer, camera, 16:9 letterbox, the clock
src/lines.ts           thick lines, graphs, axes (THREE.Line is 1px and unusable)
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

## Requirements

`ffmpeg` on PATH for video export (`brew install ffmpeg`).
