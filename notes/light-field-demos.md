# The light-field demos — onboarding

`light-field-unfold`, `light-field-fibers`, `light-field-forest`. Read this
before changing them. The design rationale lives in the header comments of
each `main.ts` and of `src/lightfield/unwrap.ts`; this file is the part that
is *not* visible from the code — where the data comes from, and which
claims the pictures are making that a plausible-looking edit would break.

## What they are

Three slides about how a light field is stored. The light on the walls is
not a shading model: it is a **baked equilibrium radiance field**,
L\* = (I−K)⁻¹E, solved on the GPU in a separate repo and loaded here as
data. Nothing in this repo computes light; it draws a solved field.

1. **unfold** — the room comes apart into the flat textures its light is
   kept in.
2. **fibers** — over pixel after pixel, the whole sphere of directions light
   could leave in; one unwraps into the 8×8 grid actually stored.
3. **forest** — every pixel's grid at once: 64× the numbers in the same
   space, camera pulling in so the grid grows as the tiles shrink.

## Where the data comes from

The generating repo is **`../light-field`** (raw WebGPU, no framework). The
entire interface is two files in `src/assets/lightfield/`:

| file | what |
|---|---|
| `unwrap-<hash>.json` | SceneDef verbatim, atlas params, chart table. 3.5 KB, inlined by Vite as a data URI at build time. |
| `unwrap-<hash>.bin` | Float32 payload, chart-cropped: directional blocks only. 1.54 MiB. |

No shared code in either direction. `src/lightfield/` reads them and owes
that repo nothing at runtime.

**`<hash>` is the scene hash.** If the scene or its atlas params change over
there, the hash changes and the old bundle is invalid. To refresh:

```bash
# in ../light-field, after re-baking in demos/unwrap-bake and "save field"
npm run bundle
cp public/data/bundles/unwrap-*.{json,bin} \
   ../rendering-talk-visuals/src/assets/lightfield/
# then update the two ?url imports at the top of src/lightfield/unwrap.ts
```

Nothing automatically notices a stale bundle — that is the manual step. The
`lightfieldBundle` version field catches a *format* mismatch (loader throws);
the hash in the filename is what stops a stale bake masquerading as fresh.

## Five claims not to break

These are the reasons the animations are arguments rather than effects. Each
one is easy to "improve" into something false.

1. **A pixel is the same size in the room and in the net.** Everything is
   drawn in TEXEL units (world × `texelsPerUnit`). The peel *moves* pixels
   and never resizes them; the forest subdivides *inside* them. Rescaling
   anything to make a shot fit better destroys the claim — move the camera
   instead.

2. **The net is derived, not designed.** Charts hinge about the edges they
   physically share, so `setPeel(0)` reconstructs the actual baked scene.
   Do not hand-place sheets and animate toward them: that can only ever
   approximate the room it claims to come from. If a sheet lands somewhere
   awkward, adjust its `OFFSET` slide (applied ×t), not its geometry.
   The hinge axis *sign* is chosen empirically — both signs flatten a
   child, but one folds it back over its parent and stacks sheets, so
   `hingeBetween` tries both and keeps whichever lands farther away.

3. **Fibers are drawn normal-centred, and that is a re-index only.** The
   stored tile is world-space parameterized (deliberately: it is what makes
   neighbouring texels commensurable, and no continuous surface-aligned
   frame exists on a sphere). For display each fiber is re-indexed so the
   surface normal is the pole — outward hemisphere in the central diamond,
   into-the-surface directions in the corners. **Every displayed value is a
   stored value**, sampling is nearest, and storage is untouched. If a slide
   says "this is what we store", it should say the grid is *drawn*
   normal-outward.

4. **The dark corners are data, not absence.** In the forest, a cell of a
   tile that looks black is usually the radiance leaving the *back* of that
   surface — real, baked, and near zero in a closed room. Do not render it
   as an empty slot: that reports stored data as missing. Note that
   `fiberTexture` (the loupe) and `chartNested` (the forest) **deliberately
   disagree** about these cells, because they ask different questions — "what
   is the fiber over this point" versus "what do we store". That asymmetry
   is intentional; don't unify them.

5. **The octahedral unfold is not a rigid hinge.** Stage ② sends each lower
   triangle (equilateral) to a right isoceles half-square — it distorts
   them, so no isometric unfolding exists. The animation shows *the map*
   opening out. Never narrate it as unfolding cardboard.

Bonus, less philosophical but bites immediately:

- Grid borders are measured in **pixels** via `fwidth`, not in cell
  fractions. A fixed fraction moires the moment cells get small, and these
  demos fly from a whole room down to one texel.
- Landed forest tiles sit `landY = 0.09` above their sheet. Coplanar they
  z-fight, which reads as banding across the entire net.
- The forest's arrival wave is a hash of the cell index. Never
  `Math.random()` — the exporter re-runs your update per frame and the
  video would boil.

## Why the tiles are constant, and why that is evidence

A diffuse surface normally stores *one* number per point, precisely because
its fiber is constant. The scene behind these demos was baked **without**
that shortcut: 64 independent random walks per pixel, one per direction bin.
So when a tile comes out flat, that is 64 independent estimators agreeing —
a measurement, not a definition. It is the whole reason the bundle is 1.5 MB
rather than 25 KB, and it is worth saying out loud on the slide.

## Known unfinished

- **Timings are guesses.** `stage.duration` is 11 / 24 / 11 s. Nobody has
  watched these against the actual narration. `light-field-fibers` is much
  the longest, mostly the tour at the end — the obvious first cut.
- **Not in `src/registry.ts`.** They show with prettified folder names. That
  file had uncommitted work in it when these landed, so it was left alone;
  add titles and blurbs when convenient.
- **A collapse beat exists but is off.** `COLLAPSE = false` in
  `light-field-forest`. It fades every tile to its hemisphere mean —
  100,800 cells becoming the 1,575-pixel texture a diffuse scene really
  keeps. It was built, then retired: resolving the field back to a flat
  texture undoes what the demo just showed. One constant brings it back.
- The scene has a **glossy sphere** whose fibers genuinely are *not*
  constant. Demo 2's tour ends on it, but no slide yet makes the
  diffuse-vs-glossy contrast its subject. That is the natural fourth demo.

## Checking a change

Standard house method, plus `&t=` to land on a beat:

```bash
npm run dev -- --port 5199 --strictPort > /tmp/dev.log 2>&1 &
DEV=$!; sleep 5
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
  --disable-gpu --enable-unsafe-swiftshader --use-gl=angle --use-angle=swiftshader \
  --window-size=1280,720 --virtual-time-budget=12000 \
  --screenshot=/tmp/shot.png \
  "http://localhost:5199/demo.html?d=light-field-unfold&t=0.6"
kill $DEV
```

Useful instants:

| demo | `t` | what you should see |
|---|---|---|
| unfold | 0.6 | the lit room, close on sphere and cube, texels readable |
| unfold | 4.0 | mid-peel, walls hinging open |
| unfold | 9.5 | the net, centred |
| fibers | 4.5 | seven balls up, each tinted by its own surface |
| fibers | 9.5 | six faded, one mid-unwrap |
| fibers | 16 | the survivor touring the sheets |
| forest | 3.5 | tiles flying in |
| forest | 8.0 | landed: bright diamonds in dark rims, camera close |

Software rendering (swiftshader) is fine for all of it — nothing here needs
a real GPU, since the expensive part already happened in the other repo.
