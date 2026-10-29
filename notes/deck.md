# The deck: design

*For the hour-long talk on computing the stationary light field, separate from
the MAA path-tracing talk in `notes/slides.md`. Status: proposed 2026-10-28.*

The deck is an HTML page in this repo. It builds into one static folder that
holds the slides, this repo's three.js demos, and light-field's built pages,
and runs from any static server indefinitely. Three decisions shape it: how a
slide is written, how a live page sits inside a slide, and how the folder is
assembled.

## Everything is same-origin

The deck, `demo.html`, and `lightfield/demo.html` are served from one folder,
so every embedded page is a **same-origin iframe**. The deck can therefore
reach into an embed's `window` and `document` directly: no `postMessage`
protocol, and no code added to the embedded page. The rest of the design
depends on this.

An iframe is still the right container, even though same-origin would allow
inlining. Each light-field page owns a WebGPU device, a field buffer of
16–23 MB, a `window` keydown handler and a full-window canvas. An iframe gives
it its own window and document to assume, and removing the iframe tears all
of that down without the page having to clean up after itself.

## Writing a slide

All slides live in one file, **`talk/slides.md`**. It is Markdown with `$…$` /
`$$…$$` math, the same dialect as `notes/slides.md`, so material moves between
the two files unchanged.

- A line containing only `---` starts a new slide.
- **An embed is an image.** Markdown already has syntax for "put this picture
  here", and an embed is the picture for its slide. The URL's scheme says
  what kind:

  | Written | Becomes |
  | --- | --- |
  | `![](demo:radiance-2d)` | this repo's `demo.html?d=radiance-2d&embed`, live |
  | `![](demo:riemann-1d?t=6.5)` | extra parameters pass through |
  | `![](lightfield:lab)` | `lightfield/demo.html?d=lab`, live WebGPU |
  | `![](media/hero-rack.mp4)` | `<video>`, autoplaying, muted, looping |
  | `![](media/room.png)` | `<img>` |

- **Layout comes from content, not from markup.** A slide containing only a
  heading is a section title. A `#` heading followed only by a `##` subtitle is
  the title slide. A slide containing only an embed is full-bleed.
  A heading plus an embed puts the heading above the embed and gives the
  embed the remaining space. Everything else is a text slide. CSS `:has()`
  makes these choices, so there is no layout syntax to learn or forget.
- A blockquote (`> …`) is a placeholder: a note, in the author's words,
  about a slide still to be made. It is drawn in pink, like the to-build
  notes in Steve's Keynote outline.
- Lines after a line reading `Note:` are speaker notes. They are parsed and
  kept out of the slide. A presenter view that shows them comes later.

The parser is `markdown-it` with raw HTML enabled, so anything the format
cannot express can be written as HTML in place. Math is typeset by KaTeX at
load time. Both are bundled, including KaTeX's fonts, so the deck never
touches a CDN. The look is dark mode: a warm near-black gray, slightly warm white type,
Libertinus Sans for headings and controls and Libertinus Serif for the body.
Two accents come from the demos' palette, lightened for text on gray:
amber for **strong** and blue for *emphasis*. The fonts are bundled from
`@fontsource`, so the built deck never fetches one.

**Sizing.** The slide is a 16:9 box letterboxed in the window, the same frame
`stage.ts` gives a demo. Type is sized in container-query units (`cqh`), so the
slide looks the same on a laptop and on a projector. I chose this over a fixed
1920×1080 canvas scaled by a CSS transform because a transform scales iframes
as bitmaps: a WebGPU canvas would render at 1920 wide and be resampled, blurry
on a 4K projector and wasteful on a laptop. With container units, an embed's
canvas has real pixel dimensions and renders at native resolution.

The URL hash is the slide number (`index.html#12`). A reload keeps your place,
and a headless screenshot can target any single slide.

## Keys

The rule is that **the deck owns paging, and the embed owns everything else.**

- **Deck, always:** `→` `PageDown` next, `←` `PageUp` previous. These are the
  keys a presentation clicker sends.
- **Deck, only when focus is in the deck itself:** `F` fullscreen, `Home` /
  `End`. A live embed takes focus as it loads, so these work only on slides
  without one. Go fullscreen on the title slide.
- **Embed:** everything else, so the lab's `8` `9` `0` `[` `]` `h`, the films'
  `space` `r` `f`, and the demos' `space` `r`.

The rule is enforced from outside the embed. When an iframe loads, the deck
attaches a **capture-phase** keydown listener to the iframe's `window`. Capture
on `window` runs before any handler the page registered, so the listener
takes the paging keys, stops their propagation, and moves the deck. The
embedded page never sees them, and it needs no changes. The deck focuses each embed as it loads, so a live
slide's keys work on arrival with no click first (otherwise the film's `f`
for free camera would hit the deck's fullscreen), and the clicker still
pages. When a slide is
left, its iframe is removed and focus falls back to the deck.

What this costs: the films use `←` `→` to step frames while paused. That is an
authoring control, and inside the deck it goes to the deck instead.

## Embeds have a lifecycle

An embed is **mounted when its slide is entered and removed when its slide is
left.** There is never more than one live page, and each visit starts from
that page's clean initial state. This is the demo contract applied to the
deck: the slide shows the same thing every time it comes up.

Mounting on entry costs load time on every visit. Light-field pages autoload a
converged field, so the wait is a fetch plus device setup and no baking.
Measured 2026-10-28 (M-series, headless Chrome, files on local disk): the
lab's field was autoloaded 0.24 s after the deck page loaded, and the room
film had drawn a converged frame by 1.5 s. No preloading is needed. If a
slower machine ever shows the wait on stage, the fix is to preload the next
slide's embed while the current slide has none. It is not to keep two WebGPU
pages alive at once.

**Chrome off by default.** A three.js demo is loaded with `&embed`, which hides
the lil-gui panel, the key hint and the "all demos" link, all of which
currently only `&t=` or `H` hides. A light-field page gets its `talk-mode` body
class set by the deck when it loads. That is exactly what its `h` key toggles,
so `h` still brings the chrome back on stage. No light-field code changes for
this.

**Sliders on the slide.** A slide can ask for lens sliders through the image
title: `![](lightfield:room "aperture focus")`. The deck draws them under
the page in its own style and wires them to `window.__lens`. That is the
small interface the film page publishes for the deck (light-field
`docs/23`): `ready`, `free()`, and `aperture` / `focus` as
`{min, max, get, set}`. The deck does not set the page's own inputs through
its DOM, because an edit to light-field's control bar would then break the
talk silently. With the interface, the connection is explicit and its
ranges are the page's own. On arrival the deck waits for `ready` and puts the
page in free camera. The sliders follow the page every frame, so the focus
slider tracks autofocus while you fly, and each drag hands the keyboard back
to the page. Only controls a slide actually uses get drawn, and only
controls the talk uses get added to `__lens`.

**Not covered here: scripted initial state for light-field pages,** e.g.
"open the lab already in split view". The lab reads no URL parameters, and
synthesised key events race its async WebGPU init. For now the speaker presses
`0`, which is a natural "watch this" beat anyway. Note that the lab opens in
its **normals** view, so a lit lab slide needs `8` pressed on arrival. That is
the strongest argument for `?keys=`. If that turns out to be
wrong, the fix belongs in light-field: a `?keys=` parameter that its demo host
replays once the demo is ready.

## The standalone build

`npm run build:deck` runs `scripts/build-deck.mjs`, which produces
**`dist-deck/`**:

```
dist-deck/
  index.html        the deck (built from deck.html)
  demo.html         this repo's demo host; demos load as lazy chunks
  assets/           bundled JS/CSS, KaTeX and STIX fonts
  lightfield/       ../light-field/dist, copied verbatim
    SOURCE.txt      light-field commit, dirty flag, copy time
  media/            talk/media/, copied verbatim
  README.txt        how to serve it
```

1. One Vite build with two inputs, `deck.html` and `demo.html`, using
   `base: './'`, so the folder works at any path: the root of
   `python3 -m http.server`, or a GitHub Pages subpath.
2. `deck.html` is renamed to `index.html`, so opening the folder opens the
   talk.
3. light-field's `dist/` is **copied, never built**, from `LIGHTFIELD_DIST`
   (default `../light-field/dist`). If it is missing, the script fails and
   says to run `npm run build` in light-field. Data flows one way and no code
   crosses, as today. `SOURCE.txt` records which light-field commit the copy
   came from, so the frozen folder says what it contains.
4. `talk/media/` is copied verbatim. Its mp4s are exporter output and are
   reproducible, so it is git-ignored like `out/`. The archive is the built
   folder, not the repo.

**In dev,** `npm run dev` serves the deck at `/deck.html`, and a dev-only Vite
middleware serves `/lightfield/*` from the same `LIGHTFIELD_DIST`. The deck in
dev embeds exactly the light-field pages it will ship with. Pointing dev at
light-field's own dev server would make the two disagree.

The existing builds are untouched. `npm run build` and `build:all` still
produce the gallery and do not include the deck or 133 MB of fields.

## Build order

Each step is committed separately and screenshotted before the next.

1. This document.
2. The deck shell: `deck.html`, `src/deck/`, `talk/slides.md` holding the
   draft outline as section titles; Markdown, KaTeX, layout, paging, hash.
3. `demo:` embeds: `&embed` in the demo host, the iframe, capture-phase key
   interception, mount/unmount.
4. `lightfield:` embeds: the dev middleware, `talk-mode`, a WebGPU screenshot
   of the lab inside a slide, and the load time measured.
5. `build-deck.mjs`, then `dist-deck/` served by `python3 -m http.server` and
   screenshotted from there, not from the dev server.
6. README and CLAUDE.md updated.

Later, once there is content to need them: presenter view with notes and a
timer, incremental reveals within a slide, and `media:` exports for anything
too risky to run live.
