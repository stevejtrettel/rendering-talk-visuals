/**
 * A pinhole camera, in 3D, photographing a stored light field.
 *
 * `light-field-image` with the camera made a camera: a box, a pinhole in its
 * front at the eye, the sensor on its back wall. Pixel j sees exactly one ray,
 * the one from the room through the pinhole onto it, and its value is the light
 * field read there: hit the first surface, read the radiance stored there in
 * the direction back toward the pinhole. The 2D `pinhole-camera` in the 3D
 * room (Steve, 2026-10-29). The light field is the baked one from the
 * `light-field` repo, used here before the talk has said how it is stored.
 *
 * The sensor sits behind the pinhole, so the image on it is turned half round,
 * as a pinhole's is: seen from behind the camera, as here, upside down and left
 * for right (the red wall on the right). Everything else — the image, the hero rays, the sweep,
 * the framing logic, the tone curve — is `light-field-image`'s; see its header
 * for the choices behind them. The point reflection through the pinhole
 * (`sensorPos`) is the only geometry added: the ray through a pixel is the same
 * ray, it is just drawn arriving at the back instead of leaving through the
 * front.
 */

import * as THREE from 'three';
import { createStage, createUI, C, flat } from '@';
import { polyline, setPolyline } from '@/lines';
import { applyShot, cellMaterial, createUnwrap, frameBox } from '@/lightfield/unwrap';
import { renderImage, type PinholeCamera } from '@/lightfield/image';

const stage = createStage({ controls: false, lights: false });
stage.duration = 22;
createUI(stage);

const u = await createUnwrap(stage);
const camera = stage.camera as THREE.PerspectiveCamera;

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
// Behind the pinhole: the image plane reflected through the eye, which turns it
// half round about the axis.
gridMesh.position.copy(scaled(img.plane.centre)).multiplyScalar(-1).addScaledVector(scaled(CAM.eye), 2);
gridMesh.rotation.z = Math.PI;
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

// The pinhole.
const eyeDot = new THREE.Mesh(new THREE.SphereGeometry(0.22 * S * 0.12, 20, 14), flat(C.bone));
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

/** The point reflection through the pinhole: image plane to sensor. */
const through = (p: THREE.Vector3) => eyePos.clone().multiplyScalar(2).sub(p);
const SENSOR_CORNERS = PLANE_CORNERS.map(through);

// The box: the sensor at the back, a face of the same size round the pinhole at
// the front, a little larger than the sensor so the pixels sit inside it.
{
  const MARGIN = 1.08;
  const back = SENSOR_CORNERS.map((c) => {
    const m = scaled(img.plane.centre).multiplyScalar(-1).addScaledVector(eyePos, 2);
    return m.clone().lerp(c, MARGIN).addScaledVector(eyePos.clone().sub(m).normalize(), -0.02 * S);
  });
  const front = back.map((c) => c.clone().add(eyePos.clone().sub(scaled(img.plane.centre)).multiplyScalar(-1)));
  const P = (v: THREE.Vector3) => [v.x, v.y, v.z] as [number, number, number];
  const edge = (pts: THREE.Vector3[]) => stage.add(polyline(pts.map(P), { color: C.bone, width: 2.5 }));
  edge([...back, back[0]]);
  edge([...front, front[0]]);
  for (let k = 0; k < 4; k++) edge([back[k], front[k]]);
}

// ---------------------------------------------------------------------------
// Rays
// ---------------------------------------------------------------------------

/** Where a pixel's ray lands, in scene-graph units. */
function hitOf(px: number, py: number): THREE.Vector3 {
  const o = (py * RES + px) * 3;
  return new THREE.Vector3(img.hit[o] * S, img.hit[o + 1] * S, img.hit[o + 2] * S);
}

/** Where a pixel sits on the sensor, in scene-graph units. */
const sensorPos = (px: number, py: number) => through(pixelPos(px, py));

/** Where a pixel would sit on the image plane in front, in scene-graph units. */
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
// Framing — one static shot holding eye, plane and room together
// ---------------------------------------------------------------------------

// The actual points, not a box around them. Eye, image plane and room are three
// separated things with air between, and the box that contains all three has
// corners nothing occupies — the room's left edge at the eye's depth — which
// fitting duly reserved room for, leaving the diagram in the top third of the
// frame.
const roomBox = u.boxes.room;
const view: THREE.Vector3[] = [eyePos, ...SENSOR_CORNERS];
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
    const a = sensorPos(px, py);
    const b = hitOf(px, py);
    const tip = eyePos.clone().lerp(b, Math.min(1, Math.max(0.001, grow)));
    setPolyline(l, [
      [a.x, a.y, a.z],
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
});

stage.start();
