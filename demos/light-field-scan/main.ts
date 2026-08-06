/**
 * Photographing a stored light field, beside the memory being read.
 *
 * `light-field-image` split in two: that demo on the right, unchanged in
 * everything it does, and on the left the same field's charts packed flat.
 * Every pixel the camera measures flares the texel it read — brightly in the
 * panel, faintly on the surface in the room. The timeline, the camera, the
 * hero rays and the sweep are all that demo's; this file is a copy of it plus
 * a second panel, so a change worth having in one is worth copying to the
 * other.
 *
 * ## Storage order is not viewing order
 *
 * The sweep crosses the image in neat rows. Watch the panel and it does
 * nothing of the kind: the glow runs along a chart, jumps to another the
 * instant a ray crosses a silhouette, and comes back. A photograph is a walk
 * through the light field, and the walk does not respect the way the field is
 * packed. That is what the second panel is for.
 *
 * ## The glow means READ, not lit
 *
 * A camera does not illuminate what it points at, and a bloom on a surface is
 * the easiest thing in the world to misread as light. It is a cursor — the
 * convention `state-space-room` uses when its reading head runs along the
 * store and the patch each column stands for lights up with it — and the
 * room's copy is drawn fainter than the panel's so the panel reads as the
 * subject. On the slide: "this is the slot being read", never "the camera
 * lights it up".
 *
 * The lookup really reads one *cell of the fiber* over that texel —
 * `sampleField` indexes the direction bin pointing back at the eye. So the
 * flaring square is the pixel whose fiber is consulted, not the single number
 * that comes back.
 *
 * ## Two flattenings, and this is the packing one
 *
 * The panel is `atlas.ts`, not the net of `light-field-unfold`. Charts sitting
 * side by side there are NOT adjacent in the room — a packer put them where
 * they fit — so never narrate the left half as the room opening up.
 *
 * The other demos in this section answer "how is a light field stored". This
 * one answers why bother. A camera sits outside the open front of the room, a
 * grid of pixels on its image plane in front of it, and every pixel's colour
 * arrives by a single ray and a single **lookup**:
 *
 *     hit the first surface, read the radiance already stored there,
 *     in the direction back toward the eye.
 *
 * That is the whole renderer. No bounces, no paths, no recursion, no shading
 * model — the equilibrium field L* = (I−K)⁻¹E was solved once, in the
 * `light-field` repo, and imaging it is an array index. `src/lightfield/image.ts`
 * is thirty lines of intersection and one line of lookup.
 *
 * ## Not even the glossy sphere bounces
 *
 * The obvious objection is that a shiny surface must surely need a reflected
 * ray. It does not, because the stored fiber over a point on the sphere is
 * genuinely different in every direction, and the lookup asks for the one
 * direction the camera is standing in. Measured on this bundle, over the
 * outward hemisphere:
 *
 *   red wall (diffuse)     radiance varies by a factor of 1.5   CV 0.11
 *   floor (diffuse)                                5.0          CV 0.33
 *   glossy sphere                             unbounded         CV 1.05
 *
 * So on the walls the direction barely matters and on the sphere it is the
 * entire answer — which is exactly why a light field is stored directionally
 * at all, and it is a measurement rather than an assertion.
 *
 * (Restricting that comparison to the *outward* hemisphere matters: counting
 * the into-the-surface bins as well, a diffuse wall looks every bit as
 * view-dependent as the sphere, because those bins are near zero. They are
 * real baked data, and imaging never reads them.)
 *
 * ## The blockiness is the store, and it is two different stores
 *
 * The walls are chunky because a wall chart is 16×16 texels. The sphere's
 * highlight is chunky in a different way — banded rather than tiled — because
 * its directional tile is 8×8, so there are 64 directions to choose between.
 * Neither is the renderer being coarse; both are the field being finite, which
 * is the honest thing for the picture to say.
 *
 * ## Choices worth naming
 *
 * - **64×64 pixels, not the 48×36 first sketched.** At 40 pixels across, the
 *   sphere is seven pixels wide and the room stops being recognisable as the
 *   room, which loses the whole point. 64 keeps pixels reading as squares and
 *   the scene readable.
 * - **The image plane is square** because the room's opening is. A 4:3 grid
 *   over a 2×2 opening either wastes a sixth of its pixels on rays that sail
 *   past into the void, or crops the ceiling light away. Framed as it is, every
 *   one of the 4,096 pixels lands on a surface and every lookup hits a
 *   direction bin with samples behind it — both checked, not hoped.
 * - **The grid reuses `cellMaterial`**, so its pixels are tone-mapped through
 *   the same ACES curve as the room's own walls. The claim is "this picture is
 *   of that room", and it is only checkable if both go through one curve. An
 *   unfilled pixel uses that material's existing "no data" grey rather than
 *   black, for its usual reason: real darkness is common here, and absence must
 *   not look like it.
 * - **The image is traced once, at load** (~45 ms for 4,096 pixels × 4 samples).
 *   The animation is a pure reveal, so a frame is cheap and a frame-stepped
 *   export is exact.
 */

import * as THREE from 'three';
import { createStage, createUI, ASPECT, C, flat } from '@';
import { polyline, setPolyline } from '@/lines';
import { applyShot, cellMaterial, createUnwrap, frameBox } from '@/lightfield/unwrap';
import { createAtlasPanel } from '@/lightfield/atlas';
import { intersectScene, renderImage, type PinholeCamera } from '@/lightfield/image';

const stage = createStage({ controls: false, lights: false });
stage.duration = 22;
createUI(stage);

const u = await createUnwrap(stage);
const camera = stage.camera as THREE.PerspectiveCamera;

// Each half of a 16:9 frame is 8:9, and frameBox fits to `camera.aspect` —
// leave it at full width and the framing solved below is for a viewport twice
// as wide as the one it lands in.
const HALF_ASPECT = ASPECT / 2;
camera.aspect = HALF_ASPECT;
camera.updateProjectionMatrix();

// The room stays assembled: this demo is about reading the field, not the
// charts it is kept in.
u.setPeel(0);

// ---------------------------------------------------------------------------
// The simulated camera
// ---------------------------------------------------------------------------

/** World units, as the bundle's SceneDef gives them. The room is 2×2×2. */
const CAM: PinholeCamera = {
  eye: [0, 1, 3.2],
  target: [0, 1, 0],
  fov: (48 * Math.PI) / 180,
  // Near the eye on purpose. The plane sits in the line of sight, so a large
  // one parked halfway to the room covers the sphere it is photographing; a
  // small card close to the eye reads as the sensor and leaves the subject
  // visible. It changes nothing about the image — only where the pixels are
  // drawn — since the ray through a pixel is the same ray at any plane distance.
  planeDist: 0.8,
};
const RES = 64;
const SPP = 4;

const img = renderImage(u.bundle, CAM, RES, RES, SPP);

// Everything the unwrap demos draw is in TEXEL units — world × texelsPerUnit.
// The tracer above works in world units, because that is what the geometry in
// the bundle is in, so every point crossing into the scene graph is scaled here
// and nowhere else.
const S = u.texel;
const scaled = (p: readonly [number, number, number]) =>
  new THREE.Vector3(p[0] * S, p[1] * S, p[2] * S);

const eyePos = scaled(CAM.eye);

// ---------------------------------------------------------------------------
// The memory, packed flat
// ---------------------------------------------------------------------------

const panel = createAtlasPanel(u.bundle, { targetAspect: HALF_ASPECT });
const panelScene = new THREE.Scene();
panelScene.add(panel.group);

const PANEL_MARGIN = 1.12;
const panelHalfH = Math.max(
  (panel.size.h / 2) * PANEL_MARGIN,
  (panel.size.w / 2 / HALF_ASPECT) * PANEL_MARGIN,
);
const panelCam = new THREE.OrthographicCamera(
  -panelHalfH * HALF_ASPECT,
  panelHalfH * HALF_ASPECT,
  panelHalfH,
  -panelHalfH,
  -1000,
  1000,
);
panelCam.position.set(0, 0, 100);
panelCam.lookAt(0, 0, 0);

/**
 * Which texel each pixel read.
 *
 * `renderImage` reports the chart a pixel landed on but not the texel inside
 * it, so the centre ray is cast once more per pixel to recover (lx, ly).
 * 4,096 extra intersections at load, nothing per frame — the same bargain the
 * image itself takes.
 */
const reads: ({ chart: number; lx: number; ly: number } | null)[] = new Array(RES * RES).fill(null);
for (let py = 0; py < RES; py++) {
  for (let px = 0; px < RES; px++) {
    const fx = ((px + 0.5) / RES) * 2 - 1;
    const fy = 1 - ((py + 0.5) / RES) * 2;
    const d: [number, number, number] = [0, 1, 2].map(
      (a) =>
        img.plane.centre[a] +
        img.plane.right[a] * fx * img.plane.halfW +
        img.plane.up[a] * fy * img.plane.halfH -
        CAM.eye[a],
    ) as [number, number, number];
    const l = Math.hypot(d[0], d[1], d[2]) || 1;
    const h = intersectScene(u.bundle, CAM.eye, [d[0] / l, d[1] / l, d[2] / l]);
    if (h && h.chart >= 0) reads[py * RES + px] = { chart: h.chart, lx: h.lx, ly: h.ly };
  }
}

/**
 * One glow array per chart, handed to BOTH the room's copy of that chart and
 * the panel's. Two pictures of one texture driven from one array cannot fall
 * out of step; two arrays kept in agreement by hand eventually would.
 */
const ROOM_GAIN = 0.45; // the index
const PANEL_GAIN = 1.35; // the subject

const glowData = u.charts.map((c) => new Float32Array(c.w * c.h * 4));
const glowTex = u.charts.map((c, i) => {
  const t = new THREE.DataTexture(glowData[i], c.w, c.h, THREE.RGBAFormat, THREE.FloatType);
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
});
u.charts.forEach((_c, i) => {
  const inRoom = u.chartMaterial(i);
  if (inRoom) {
    inRoom.uniforms.glow.value = glowTex[i];
    inRoom.uniforms.glowGain.value = ROOM_GAIN;
  }
  const inPanel = panel.material(i);
  if (inPanel) {
    inPanel.uniforms.glow.value = glowTex[i];
    inPanel.uniforms.glowGain.value = PANEL_GAIN;
  }
});

/** Pixels still glowing behind the sweep head. Well under a row (RES): a
 * longer trail lights everything a row covers at once, and the sweep becomes
 * a band wiping down the chart instead of a head moving through texels. */
const TRAIL = 30;

function setGlow(idx: number, w: number): void {
  const r = reads[idx];
  if (!r) return;
  const c = u.charts[r.chart];
  glowData[r.chart][(r.ly * c.w + r.lx) * 4] += w;
}

// ---------------------------------------------------------------------------
// The pixel grid
// ---------------------------------------------------------------------------

/**
 * RGBA per pixel: the radiance the lookup returned, and alpha as "has this
 * pixel been measured yet". `cellMaterial` draws alpha < 0.5 in its own grey,
 * and rules the cell borders in screen pixels, so the grid reads as a grid at
 * any distance without a second mesh.
 */
const pix = new Float32Array(RES * RES * 4);
const gridMat = cellMaterial(pix, RES, RES, 0.6);
const gridMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(2 * img.plane.halfW * S, 2 * img.plane.halfH * S),
  gridMat,
);
gridMesh.position.copy(scaled(img.plane.centre));
stage.add(gridMesh);

/**
 * Row 0 of the image is the top; row 0 of a DataTexture is v = 0, the bottom of
 * the quad. Flipping here rather than at the texture keeps the image array in
 * the natural reading order everywhere else.
 */
const texRow = (py: number) => RES - 1 - py;

function reveal(px: number, py: number): void {
  const src = (py * RES + px) * 3;
  const dst = (texRow(py) * RES + px) * 4;
  pix[dst] = img.rgb[src];
  pix[dst + 1] = img.rgb[src + 1];
  pix[dst + 2] = img.rgb[src + 2];
  pix[dst + 3] = 1;
}

// The eye itself, and the frustum edges out to the corners of the plane.
const eyeDot = new THREE.Mesh(new THREE.SphereGeometry(0.22 * S * 0.25, 20, 14), flat(C.bone));
eyeDot.position.copy(eyePos);
stage.add(eyeDot);

const PLANE_CORNERS = ([
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
] as [number, number][]).map(([sx, sy]) =>
  scaled([
    img.plane.centre[0] + img.plane.right[0] * sx * img.plane.halfW + img.plane.up[0] * sy * img.plane.halfH,
    img.plane.centre[1] + img.plane.right[1] * sx * img.plane.halfW + img.plane.up[1] * sy * img.plane.halfH,
    img.plane.centre[2] + img.plane.right[2] * sx * img.plane.halfW + img.plane.up[2] * sy * img.plane.halfH,
  ]),
);

for (const corner of PLANE_CORNERS) {
  stage.add(
    polyline(
      [
        [eyePos.x, eyePos.y, eyePos.z],
        [corner.x, corner.y, corner.z],
      ],
      { color: C.slateDeep, width: 1.5, opacity: 0.55 },
    ),
  );
}

// ---------------------------------------------------------------------------
// Rays
// ---------------------------------------------------------------------------

/** Where a pixel's ray lands, in scene-graph units. */
function hitOf(px: number, py: number): THREE.Vector3 {
  const o = (py * RES + px) * 3;
  return new THREE.Vector3(img.hit[o] * S, img.hit[o + 1] * S, img.hit[o + 2] * S);
}

/** Where a pixel sits on the image plane, in scene-graph units. */
function pixelPos(px: number, py: number): THREE.Vector3 {
  const fx = ((px + 0.5) / RES) * 2 - 1;
  const fy = 1 - ((py + 0.5) / RES) * 2;
  return new THREE.Vector3(
    (img.plane.centre[0] + img.plane.right[0] * fx * img.plane.halfW + img.plane.up[0] * fy * img.plane.halfH) * S,
    (img.plane.centre[1] + img.plane.right[1] * fx * img.plane.halfW + img.plane.up[1] * fy * img.plane.halfH) * S,
    (img.plane.centre[2] + img.plane.right[2] * fx * img.plane.halfW + img.plane.up[2] * fy * img.plane.halfH) * S,
  );
}

/** Colour a ray is carrying back, clamped into something drawable. */
function rayColour(px: number, py: number): THREE.Color {
  const o = (py * RES + px) * 3;
  const c = new THREE.Color(img.rgb[o], img.rgb[o + 1], img.rgb[o + 2]);
  const m = Math.max(c.r, c.g, c.b, 1e-4);
  return c.multiplyScalar(Math.min(1, 1.1 / m));
}

const RAY_POOL = 56;
const rays = Array.from({ length: RAY_POOL }, () => {
  const l = polyline(
    [
      [0, 0, 0],
      [0, 0, 0],
    ],
    { color: C.bone, width: 2, opacity: 0.9 },
  );
  l.visible = false;
  stage.add(l);
  return l;
});

// ---------------------------------------------------------------------------
// Hero pixels — one per surface worth naming
// ---------------------------------------------------------------------------

/**
 * A representative pixel on each of four charts, chosen as the one closest to
 * the centroid of every pixel that landed on that chart. Picked from the traced
 * image rather than hardcoded, so re-framing the camera cannot silently leave a
 * hero ray pointing at nothing.
 */
function heroOn(chart: number): { px: number; py: number } | null {
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let py = 0; py < RES; py++) {
    for (let px = 0; px < RES; px++) {
      if (img.chart[py * RES + px] === chart) {
        sx += px;
        sy += py;
        n++;
      }
    }
  }
  if (!n) return null;
  const cx = sx / n;
  const cy = sy / n;
  let best: { px: number; py: number } | null = null;
  let bestD = Infinity;
  for (let py = 0; py < RES; py++) {
    for (let px = 0; px < RES; px++) {
      if (img.chart[py * RES + px] !== chart) continue;
      const d = (px - cx) ** 2 + (py - cy) ** 2;
      if (d < bestD) {
        bestD = d;
        best = { px, py };
      }
    }
  }
  return best;
}

// Red wall, the glossy sphere, the ceiling light, the green wall: four charts
// whose returned colours are unmistakably different, so the rays read as
// carrying back what they found.
const HERO_CHARTS = [3, u.sphereChart, 5, 4];
const HEROES = HERO_CHARTS.map(heroOn).filter(
  (h): h is { px: number; py: number } => h !== null,
);

// ---------------------------------------------------------------------------
// The split
// ---------------------------------------------------------------------------

const hud = stage.hud;
const hudCam = new THREE.OrthographicCamera(-ASPECT, ASPECT, 1, -1, -100, 100);
hudCam.position.z = 10;
hud.add(
  polyline(
    [
      [0, -0.94, 0],
      [0, 0.94, 0],
    ],
    { color: C.slateDeep, width: 2 },
  ),
);

// Shadowing Stage.render rather than changing it: two viewports are wanted
// here and in `light-field-atlas` and nowhere else, and the exporter goes
// through stage.render(), so a shadowed method exports correctly.
const renderer = stage.renderer;
const viewSize = new THREE.Vector2();
stage.render = function splitRender(): void {
  renderer.getSize(viewSize);
  const w = Math.floor(viewSize.x / 2);

  renderer.setScissorTest(false);
  renderer.autoClear = false;
  renderer.clear();

  renderer.setScissorTest(true);
  renderer.setViewport(0, 0, w, viewSize.y);
  renderer.setScissor(0, 0, w, viewSize.y);
  renderer.render(panelScene, panelCam);

  renderer.setViewport(w, 0, viewSize.x - w, viewSize.y);
  renderer.setScissor(w, 0, viewSize.x - w, viewSize.y);
  renderer.render(stage.scene, camera);

  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, viewSize.x, viewSize.y);

  renderer.clearDepth();
  renderer.render(hud, hudCam);
  renderer.autoClear = true;
};

// ---------------------------------------------------------------------------
// Framing — one static shot holding eye, plane and room together
// ---------------------------------------------------------------------------

// The actual points, not a box around them. Eye, image plane and room are three
// separated things with air between, and the box that contains all three has
// corners nothing occupies — the room's left edge at the eye's depth — which
// fitting duly reserved room for, leaving the diagram in the top third of the
// frame.
const roomBox = u.boxes.room;
const view: THREE.Vector3[] = [eyePos, ...PLANE_CORNERS];
for (let i = 0; i < 8; i++) {
  view.push(
    new THREE.Vector3(
      i & 1 ? roomBox.max.x : roomBox.min.x,
      i & 2 ? roomBox.max.y : roomBox.min.y,
      i & 4 ? roomBox.max.z : roomBox.min.z,
    ),
  );
}

/**
 * Over the photographer's shoulder, and the angle is constrained from both
 * sides.
 *
 * Too far round and the room presents its outside: the walls are solid, so from
 * 58° off the axis — where this first sat — you are looking at the *back* of
 * the green wall, the interior is hidden and the rays disappear into it. Too
 * near the axis and eye, image plane and room stack up on top of each other and
 * the chain that is the whole diagram is foreshortened away. The opening is as
 * wide as the room is deep, so seeing the far corners needs under 45°; this is
 * about 28°, which keeps the interior open and still separates the three
 * things along the line of sight.
 */
applyShot(stage, frameBox(camera, view, new THREE.Vector3(0.55, 0.34, 1.0), 1.2));

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

const LEAD = 1.6;
const HERO_T = 1.3;
const HERO_END = LEAD + HEROES.length * HERO_T;
const SWEEP_END = 18;
/** The rays clear away once the last pixel has landed. */
const RAY_FADE = 1.4;
const TOTAL = RES * RES;

// Nothing returns to where it started, so the export can stop as soon as the
// picture is finished — which is after the rays have cleared, not the moment
// the last pixel lands, or the movie would end on a frame still crossed with
// working lines. Preview runs on and holds.
stage.captureEnd = SWEEP_END + RAY_FADE;

const smooth = (x: number) => {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
};

/** Sweep order: rows top to bottom, each left to right. */
const orderOf = (i: number) => ({ px: i % RES, py: Math.floor(i / RES) });

let lastCount = -1;

stage.frame((t) => {
  const tt = stage.duration > 0 ? t % stage.duration : 0;

  // --- how much of the image exists yet ------------------------------------
  const heroDone = Math.min(
    HEROES.length,
    Math.max(0, Math.floor((tt - LEAD) / HERO_T + 0.3)),
  );
  const swept =
    tt <= HERO_END ? 0 : Math.round(smooth((tt - HERO_END) / (SWEEP_END - HERO_END)) * TOTAL);

  // Rebuilt from scratch whenever the count changes: 4,096 pixels is nothing,
  // and recomputing beats carrying reveal state that could drift out of step
  // with `t` and break a frame-stepped export.
  const key = heroDone * 1e7 + swept;
  if (key !== lastCount) {
    lastCount = key;
    pix.fill(0);
    for (let k = 0; k < heroDone; k++) reveal(HEROES[k].px, HEROES[k].py);
    for (let i = 0; i < swept; i++) {
      const { px, py } = orderOf(i);
      reveal(px, py);
    }
    (gridMat.uniforms.map.value as THREE.DataTexture).needsUpdate = true;
  }

  // --- rays -----------------------------------------------------------------
  // Everything the rays do is scaled by this, so they clear off the finished
  // picture instead of leaving it permanently hatched.
  const rayFade = 1 - smooth((tt - SWEEP_END) / RAY_FADE);

  for (const r of rays) r.visible = false;
  let slot = 0;
  const showRay = (px: number, py: number, grow: number, alpha: number) => {
    if (slot >= RAY_POOL || rayFade <= 0.002) return;
    const l = rays[slot++];
    const a = pixelPos(px, py);
    const b = hitOf(px, py);
    const tip = a.clone().lerp(b, Math.min(1, Math.max(0.001, grow)));
    setPolyline(l, [
      [eyePos.x, eyePos.y, eyePos.z],
      [tip.x, tip.y, tip.z],
    ]);
    const m = l.material as THREE.Material & { opacity: number; color: THREE.Color };
    m.color.copy(rayColour(px, py));
    m.opacity = alpha * rayFade;
    l.visible = true;
  };

  if (tt > LEAD && tt <= HERO_END) {
    // One ray at a time, slow enough to follow out and land.
    const k = Math.min(HEROES.length - 1, Math.floor((tt - LEAD) / HERO_T));
    const local = (tt - LEAD - k * HERO_T) / HERO_T;
    const h = HEROES[k];
    showRay(h.px, h.py, smooth(local / 0.62), 0.95);
    // Highlight the pixel the ray is filling — the material already draws a
    // selected cell, so this costs a uniform.
    gridMat.uniforms.sel.value.set(h.px, texRow(h.py));
  } else if (tt > HERO_END && swept > 0) {
    gridMat.uniforms.sel.value.set(-1, -1);
    // The most recently landed rays, fading with age, so the sweep reads as a
    // front moving over the image rather than a wall of lines.
    const shown = Math.min(RAY_POOL, swept);
    for (let j = 0; j < shown; j++) {
      const i = swept - 1 - j;
      if (i < 0) break;
      const { px, py } = orderOf(i);
      showRay(px, py, 1, 0.85 * (1 - j / shown) ** 1.6);
    }
  } else {
    gridMat.uniforms.sel.value.set(-1, -1);
  }

  // --- the memory being read ------------------------------------------------
  // Rebuilt from `tt` every frame like everything else here. Scaled by the
  // same rayFade as the rays, so the demo ends on a finished photograph and a
  // panel at rest rather than a stray cell left burning.
  for (const g of glowData) g.fill(0);

  if (rayFade > 0.002) {
    if (tt > LEAD && tt <= HERO_END) {
      // One hero pixel at a time, held while its ray flies out — the slow
      // version of the same event the sweep does 4,096 times.
      const k = Math.min(HEROES.length - 1, Math.floor((tt - LEAD) / HERO_T));
      const h = HEROES[k];
      setGlow(h.py * RES + h.px, rayFade);
    } else if (swept > 0) {
      for (let j = 0; j < TRAIL; j++) {
        const i = swept - 1 - j;
        if (i < 0) break;
        // Quadratic falloff: a linear tail reads as an even smear, and the
        // point is where the head IS.
        const age = j / TRAIL;
        setGlow(i, (1 - age) * (1 - age) * rayFade);
      }
    }
  }

  // Saturate rather than clip: a texel the sweep crosses several times inside
  // one trail would otherwise blow past everything else in the frame.
  for (const g of glowData) {
    for (let i = 0; i < g.length; i += 4) g[i] = 1 - Math.exp(-g[i] * 0.5);
  }
  for (const tex of glowTex) tex.needsUpdate = true;
});

stage.start();
