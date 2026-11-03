/**
 * A thin-lens camera pointed at the stored light field.
 *
 * Steve, 2026-10-30: "I would rather just actually have the camera 'pointed
 * at' the data set, and light up what it reads", and "it's supposed to be
 * imaging via a thin lens camera so that we actually do the integral at each
 * point". So: the room's stored field, unfolded flat (the 8 texels per unit
 * net of `light-field-unfold`), and a camera, a lens and a sensor, aimed at
 * it. Each pixel is the integral over the lens: K rays from the pixel, one
 * through each of K points of the aperture, each ray one lookup in the store,
 * and the pixel is their average. The cells each ray reads light up on the
 * net, and lines run from the pixel through its lens point to the cell.
 *
 * What is computed, honestly: the photograph is the real thin-lens image of
 * the room (eye [0, 1, 3.2], focused on the sphere, aperture radius 0.18,
 * world units), every ray traced through the actual scene geometry to the
 * surface it meets and read from the stored field there (`shade`, as
 * `light-field-scan` does). Only the drawing is schematic: the camera is
 * drawn above the net instead of in the room, so the line from a lens point
 * to the cell it reads stands for "this ray looks up this cell", not for the
 * ray's path in the room.
 *
 * The glow means READ, not lit (see `light-field-scan`).
 *
 * The opening pixels go one at a time, slowly, with their fans of rays; then
 * the rest of the image is swept row by row, each pixel's cells flaring as it
 * is measured. One cycle, then it holds on the finished photograph.
 */

import * as THREE from 'three';
import { createStage, createUI, C } from '@';
import { createUnwrap, frameBox, applyShot, lerpShot, smootherstep, type Shot } from '@/lightfield/unwrap';
import { shade, intersectScene } from '@/lightfield/image';
import fineJson from '@/assets/lightfield/room-3dbe68db.json?url';
import fineBin from '@/assets/lightfield/room-3dbe68db.bin?url';
import fineDirsBin from '@/assets/lightfield/room-3dbe68db-dirs.bin?url';
import { normalFrame, octEncode, texelNormal } from '@/lightfield/tiles';
import { polyline, setPolyline } from '@/lines';
import type { V3 } from '@/lightfield/bundle';

const stage = createStage({ controls: false, lights: false });
stage.duration = 40;
createUI(stage);

const u = await createUnwrap(stage);
const camera = stage.camera as THREE.PerspectiveCamera;
u.setPeel(1);
// Every texel shows its whole sphere of directions, unwrapped to an N × N tile
// (the forest, landed): Steve, "show the unfolded data as a bunch of the
// tangent spheres (even if these are constant for our diffuse surfaces), so
// that we see we are sampling the right directions".
// `?real` (Steve, 2026-10-30): the same camera on the real data, all at
// once: the full-density field (64 texels per unit, as computed) with the
// camera on the left, and its photograph, at a real resolution, on the right.
// No tiles, no animation.
const REAL = new URLSearchParams(location.search).has('real');
if (!REAL) u.setForest(1, 0);
const b = u.bundle;

// --- The full-density field, for ?real ------------------------------------------------------
interface FineChart { x: number; y: number; w: number; h: number; dbins: number; offset: number; dirOffset?: number }
const fine = REAL
  ? await Promise.all([fetch(fineJson).then((r) => r.json()), fetch(fineBin).then((r) => r.arrayBuffer()), fetch(fineDirsBin).then((r) => r.arrayBuffer())])
  : null;
const fineCharts: FineChart[] = fine ? fine[0].charts : [];
const fineRGB = fine ? new Float32Array(fine[1]) : new Float32Array(0);
const fineDirs = fine ? new Float32Array(fine[2]) : new Float32Array(0);
/** The real field read along one ray: the texel it lands in at full density; on the glossy sphere, its direction bin. */
const fineBundle = fine ? ({ ...b, charts: fineCharts, quadChart: fine[0].quadChart, sphereChart: fine[0].sphereChart } as unknown as typeof b) : b;
let lastHit: { chart: number; lx: number; ly: number } | null = null;
function lookFine(o: V3, d: V3): V3 {
  const hit = intersectScene(fineBundle, o, d);
  lastHit = hit && hit.chart >= 0 ? { chart: hit.chart, lx: hit.lx, ly: hit.ly } : null;
  if (!hit || hit.chart < 0) return [0, 0, 0];
  const c = fineCharts[hit.chart]!;
  if (c.dbins > 0 && c.dirOffset !== undefined) {
    const n = c.dbins;
    const [uu, vv] = octEncode([-d[0], -d[1], -d[2]]);
    const bx = Math.min(n - 1, Math.max(0, Math.floor(uu * n)));
    const by = Math.min(n - 1, Math.max(0, Math.floor(vv * n)));
    const q = (c.dirOffset + (hit.ly * c.w + hit.lx) * n * n + by * n + bx) * 3;
    return [fineDirs[q]!, fineDirs[q + 1]!, fineDirs[q + 2]!];
  }
  const q = (c.offset + hit.ly * c.w + hit.lx) * 3;
  return [fineRGB[q]!, fineRGB[q + 1]!, fineRGB[q + 2]!];
}

// --- The imaging camera, in the room's world units ----------------------------------------
const EYE: V3 = [0, 1, 3.2];
const TARGET: V3 = [0, 1, 0];
const FOV = (48 * Math.PI) / 180;
const LENS_R = 0.18;
const FOCUS = 3.05; // the sphere's distance along the axis
const RES = REAL ? 200 : 32;
const K = REAL ? 8 : 16; // lens points per pixel

const sub = (a: V3, c: V3): V3 => [a[0] - c[0], a[1] - c[1], a[2] - c[2]];
const unit = (a: V3): V3 => {
  const m = Math.hypot(a[0], a[1], a[2]);
  return [a[0] / m, a[1] / m, a[2] / m];
};
const cross = (a: V3, c: V3): V3 => [a[1] * c[2] - a[2] * c[1], a[2] * c[0] - a[0] * c[2], a[0] * c[1] - a[1] * c[0]];
const fwd = unit(sub(TARGET, EYE));
const right = unit(cross(fwd, [0, 1, 0]));
const up = cross(right, fwd);
const halfH = Math.tan(FOV / 2);

/** Lens point k of K: a sunflower spiral, even over the disk, in units of the radius. */
const lensPt = (k: number): [number, number] => {
  const r = Math.sqrt((k + 0.5) / K);
  const a = k * 2.399963;
  return [r * Math.cos(a), r * Math.sin(a)];
};

/** One ray's lookup: the texel it lands in, and the display cell (i, j) of
 * that texel's direction tile it reads, in the forest's normal-centred layout. */
interface Sample { chart: number; lx: number; ly: number; k: number; i: number; j: number }

/** The display cell of texel (lx, ly)'s tile holding world direction w. */
function binOf(chart: number, lx: number, ly: number, w: V3): [number, number] {
  const c = b.charts[chart]!;
  const n = c.dbins;
  const [tx, ty, tz] = normalFrame(texelNormal(b, c, lx, ly));
  const local: V3 = [
    w[0] * tx[0] + w[1] * tx[1] + w[2] * tx[2],
    w[0] * ty[0] + w[1] * ty[1] + w[2] * ty[2],
    w[0] * tz[0] + w[1] * tz[1] + w[2] * tz[2],
  ];
  const [uu, vv] = octEncode(local);
  return [Math.min(n - 1, Math.max(0, Math.floor(uu * n))), Math.min(n - 1, Math.max(0, Math.floor(vv * n)))];
}
const samples: Sample[][] = [];
const image = new Float32Array(RES * RES * 4);
for (let py = 0; py < RES; py++) {
  for (let px = 0; px < RES; px++) {
    const su = ((px + 0.5) / RES) * 2 - 1;
    const sv = 1 - ((py + 0.5) / RES) * 2;
    const d0 = unit([
      fwd[0] + right[0] * su * halfH + up[0] * sv * halfH,
      fwd[1] + right[1] * su * halfH + up[1] * sv * halfH,
      fwd[2] + right[2] * su * halfH + up[2] * sv * halfH,
    ]);
    const t = FOCUS / (d0[0] * fwd[0] + d0[1] * fwd[1] + d0[2] * fwd[2]);
    const focal: V3 = [EYE[0] + d0[0] * t, EYE[1] + d0[1] * t, EYE[2] + d0[2] * t];
    const list: Sample[] = [];
    let r = 0;
    let g = 0;
    let bl = 0;
    for (let k = 0; k < K; k++) {
      const [ax, ay] = lensPt(k);
      const o: V3 = [
        EYE[0] + (right[0] * ax + up[0] * ay) * LENS_R,
        EYE[1] + (right[1] * ax + up[1] * ay) * LENS_R,
        EYE[2] + (right[2] * ax + up[2] * ay) * LENS_R,
      ];
      const d = unit(sub(focal, o));
      if (REAL) {
        const c = lookFine(o, d);
        r += c[0];
        g += c[1];
        bl += c[2];
        continue;
      }
      const { rgb, hit } = shade(b, o, d);
      r += rgb[0];
      g += rgb[1];
      bl += rgb[2];
      if (hit && hit.chart >= 0) {
        // The lookup reads the direction back toward the eye.
        const [i, j] = binOf(hit.chart, hit.lx, hit.ly, [-d[0], -d[1], -d[2]]);
        list.push({ chart: hit.chart, lx: hit.lx, ly: hit.ly, k, i, j });
      }
    }
    samples.push(list);
    const o4 = (py * RES + px) * 4;
    image[o4] = r / K;
    image[o4 + 1] = g / K;
    image[o4 + 2] = bl / K;
    image[o4 + 3] = 1;
  }
}

// --- The drawn camera, above the net, aimed at it ----------------------------------------------
const net = u.boxes.net.clone();
const netC = net.getCenter(new THREE.Vector3());
const netSize = net.getSize(new THREE.Vector3());
const W = Math.max(netSize.x, netSize.z);
// In front of the net and above it, looking down onto it, like a camera over
// a sheet on a table; the viewer stands further back, so the sensor's back
// (the photograph) faces them.
const lensC = netC.clone().add(new THREE.Vector3(0, 0.5 * W, -0.22 * W));
const aim = netC.clone().sub(lensC).normalize();
const cR = new THREE.Vector3().crossVectors(aim, new THREE.Vector3(0, 1, 0)).normalize();
const cU = new THREE.Vector3().crossVectors(cR, aim).normalize();
const LENS_DRAWN = 0.05 * W;
const SENSOR_HALF = 0.05 * W;
const sensorC = lensC.clone().addScaledVector(aim, -0.1 * W);

const beforeCam = new Set(stage.scene.children);
const lensDisk = new THREE.Mesh(
  new THREE.CircleGeometry(LENS_DRAWN, 48),
  new THREE.MeshBasicMaterial({ color: C.bone, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }),
);
lensDisk.position.copy(lensC);
lensDisk.lookAt(netC);
stage.add(lensDisk);
stage.add(polyline(Array.from({ length: 65 }, (_, i) => {
  const a = (2 * Math.PI * i) / 64;
  const p = lensC.clone().addScaledVector(cR, LENS_DRAWN * Math.cos(a)).addScaledVector(cU, LENS_DRAWN * Math.sin(a));
  return [p.x, p.y, p.z] as [number, number, number];
}), { color: C.bone, width: 2.5 }));

// The sensor shows the photograph as it is measured.
const shown = new Float32Array(RES * RES * 4);
const imgTex = new THREE.DataTexture(shown, RES, RES, THREE.RGBAFormat, THREE.FloatType);
imgTex.magFilter = THREE.NearestFilter;
imgTex.flipY = true;
imgTex.needsUpdate = true;
const sensor = new THREE.Mesh(
  new THREE.PlaneGeometry(2 * SENSOR_HALF, 2 * SENSOR_HALF),
  new THREE.MeshBasicMaterial({ map: imgTex, side: THREE.DoubleSide }),
);
sensor.position.copy(sensorC);
sensor.lookAt(sensorC.clone().addScaledVector(aim, -1)); // faces the viewer, behind the lens
stage.add(sensor);
// The photograph, large, on a panel beside the pile, facing the viewer: the
// same texture as the sensor's.
const PANEL = REAL ? 0.95 * W : 0.36 * W;
const panel = new THREE.Mesh(new THREE.PlaneGeometry(PANEL, PANEL), new THREE.MeshBasicMaterial({ map: imgTex, side: THREE.DoubleSide }));
const panelC = REAL
  ? netC.clone().add(new THREE.Vector3(0.5 * netSize.x + 0.62 * W, 0.3 * W, 0))
  : netC.clone().add(new THREE.Vector3(0.5 * netSize.x + 0.28 * W, 0.22 * W, 0));
panel.position.copy(panelC);
stage.add(panel);
const corner = (sx: number, sy: number) => sensorC.clone().addScaledVector(cR, sx * SENSOR_HALF).addScaledVector(cU, sy * SENSOR_HALF);
stage.add(polyline([corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1), corner(-1, -1)].map((p) => [p.x, p.y, p.z] as [number, number, number]), { color: C.slate, width: 1.5 }));
// The box joining sensor and lens.
for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
  const p = corner(sx, sy);
  const q = lensC.clone().addScaledVector(cR, sx * LENS_DRAWN * 0.75).addScaledVector(cU, sy * LENS_DRAWN * 0.75);
  stage.add(polyline([[p.x, p.y, p.z], [q.x, q.y, q.z]], { color: C.slateDeep, width: 1.2 }));
}
// The drawn camera as one group pivoting at the lens, so it can be turned.
const camGroup = new THREE.Group();
camGroup.position.copy(lensC);
stage.add(camGroup);
for (const o of [...stage.scene.children]) if (!beforeCam.has(o) && o !== panel && o !== camGroup) camGroup.attach(o);

/** Where pixel (px, py) sits on the drawn sensor (image upright as seen from the viewer). */
const pixelPos = (px: number, py: number) => corner(((px + 0.5) / RES) * 2 - 1, 1 - ((py + 0.5) / RES) * 2);
const lensPos = (k: number) => {
  const [ax, ay] = lensPt(k);
  return lensC.clone().addScaledVector(cR, ax * LENS_DRAWN).addScaledVector(cU, ay * LENS_DRAWN);
};

/** Where bin (i, j) of a texel's tile sits on the net. */
function binPos(s: Sample): THREE.Vector3 {
  const c = u.charts[s.chart]!;
  const n = c.dbins;
  const o = u.cellCentre(s.chart, s.lx, s.ly);
  // One texel's step along the chart's two axes, from its neighbours.
  const eu = s.lx + 1 < c.w ? u.cellCentre(s.chart, s.lx + 1, s.ly).sub(o) : o.clone().sub(u.cellCentre(s.chart, s.lx - 1, s.ly));
  const ev = s.ly + 1 < c.h ? u.cellCentre(s.chart, s.lx, s.ly + 1).sub(o) : o.clone().sub(u.cellCentre(s.chart, s.lx, s.ly - 1));
  return o.clone().addScaledVector(eu, (s.i + 0.5) / n - 0.5).addScaledVector(ev, (s.j + 0.5) / n - 0.5);
}

// --- The fan of rays for the pixel being measured ----------------------------------------------
const blank: [number, number, number][] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
const rays = Array.from({ length: K }, () => {
  const l = polyline(blank, { color: C.bone, width: 1.6, opacity: 0.85 });
  l.renderOrder = 5;
  stage.add(l);
  return l;
});
function showFan(idx: number, alpha: number): void {
  const px = idx % RES;
  const py = Math.floor(idx / RES);
  const from = pixelPos(px, py);
  const list = samples[idx]!;
  rays.forEach((l, k) => {
    const s = list[k];
    l.visible = !!s && alpha > 0.01;
    if (!s || !l.visible) return;
    const via = lensPos(s.k);
    const to = binPos(s);
    setPolyline(l, [[from.x, from.y, from.z], [via.x, via.y, via.z], [to.x, to.y + 0.1, to.z]]);
    (l.material as THREE.Material & { opacity: number }).opacity = 0.85 * alpha;
  });
}

// --- The glow: which direction cells have just been read -------------------------------------
const glowData = u.charts.map((c) => new Float32Array(c.w * c.dbins * c.h * c.dbins * 4));
const glowTex = u.charts.map((c, i) => {
  const t = new THREE.DataTexture(glowData[i]!, c.w * c.dbins, c.h * c.dbins, THREE.RGBAFormat, THREE.FloatType);
  t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  const m = u.forestMaterial(i);
  if (m) {
    m.uniforms.glowN.value = t;
    m.uniforms.glowGain.value = 3.0;
  }
  return t;
});
function glowPixel(idx: number, w: number): void {
  for (const s of samples[idx]!) {
    const c = u.charts[s.chart]!;
    const W = c.w * c.dbins;
    glowData[s.chart]![((s.ly * c.dbins + s.j) * W + s.lx * c.dbins + s.i) * 4] += w;
  }
}

// --- The order: a few pixels slowly, then the sweep -------------------------------------------------
/** Opening pixels: ones whose rays spread over different surfaces, the sphere first. */
const HEROES = (() => {
  const picks: number[] = [];
  const want = [u.sphereChart, u.qc(3), u.qc(0)];
  for (const ch of want) {
    let best = -1;
    let bestSpread = -1;
    samples.forEach((list, i) => {
      if (!list.length || picks.includes(i)) return;
      const charts = new Set(list.map((s) => s.chart));
      if (!charts.has(ch)) return;
      if (charts.size > bestSpread) {
        bestSpread = charts.size;
        best = i;
      }
    });
    if (best >= 0) picks.push(best);
  }
  return picks;
})();
// A pause on the whole set-up first, then each opening pixel: the zoom in,
// a hold on the cells it reads, then the next (Steve: pause before the zoom,
// and stay in long enough to see what is happening).
const LEAD = 3.0;
const HERO_T = 5.0; // seconds each
const SWEEP_AT = LEAD + HEROES.length * HERO_T;
const SWEEP = 14;
const TRAIL = 24; // pixels still glowing behind the head

const order = [...HEROES, ...Array.from({ length: RES * RES }, (_, i) => i).filter((i) => !HEROES.includes(i))];

// The stage view: the net and the camera together, square-on to the net.
const VIEW = new THREE.Vector3(0, 1, 0.5);
const box = net.clone().expandByPoint(lensC).expandByPoint(corner(1, 1)).expandByPoint(corner(-1, -1))
  .expandByPoint(panelC.clone().add(new THREE.Vector3(PANEL / 2, PANEL / 2, 0)))
  .expandByPoint(panelC.clone().add(new THREE.Vector3(-PANEL / 2, -PANEL / 2, 0)));
const WIDE = frameBox(camera, box, VIEW, 0.98);
/** In close on the direction cells an opening pixel reads, so single bins can be seen. */
const CLOSE = HEROES.map((idx) => {
  // Around the texel most of its rays land in, a few texels wide, so the
  // direction cells inside each tile are big enough to see light up.
  const list = samples[idx]!;
  const count = new Map<string, number>();
  for (const s of list) count.set(`${s.chart},${s.lx},${s.ly}`, (count.get(`${s.chart},${s.lx},${s.ly}`) ?? 0) + 1);
  const [key] = [...count.entries()].sort((a, c) => c[1] - a[1])[0]!;
  const [ch, lx, ly] = key.split(',').map(Number) as [number, number, number];
  const c0 = u.cellCentre(ch, lx, ly);
  const bx = new THREE.Box3().setFromCenterAndSize(c0, new THREE.Vector3(5, 0.5, 5));
  return frameBox(camera, bx, VIEW, 1.0);
});
applyShot(stage, WIDE);
// The panel turns to face the shot's camera.
panel.lookAt(stage.camera.position);

let lastDone = -1;
if (REAL) {
  // The net at the computed density: each chart's texture swapped for the
  // full-density field, no outlines (a texel is about a pixel here).
  u.charts.forEach((_, i) => {
    const m = u.chartMaterial(i);
    const c = fineCharts[i];
    if (!m || !c) return;
    const data = new Float32Array(c.w * c.h * 4);
    let k = 1;
    // One brightness factor for the whole net, matching the coarse field's
    // display (the two exports differ by a constant; see light-field-density).
    k = 0.5;
    for (let t = 0; t < c.w * c.h; t++) {
      data[t * 4] = fineRGB[(c.offset + t) * 3]! * k;
      data[t * 4 + 1] = fineRGB[(c.offset + t) * 3 + 1]! * k;
      data[t * 4 + 2] = fineRGB[(c.offset + t) * 3 + 2]! * k;
      data[t * 4 + 3] = 1;
    }
    const tex = new THREE.DataTexture(data, c.w, c.h, THREE.RGBAFormat, THREE.FloatType);
    tex.needsUpdate = true;
    m.uniforms.map.value = tex;
    m.uniforms.cells.value.set(c.w, c.h);
    m.uniforms.border.value = -1;
  });
  shown.set(image);
  imgTex.needsUpdate = true;
  showFan(0, 0);
}

// --- ?real: turn the camera, and it measures again --------------------------------------------
// Drag to turn the camera (Steve: "reorient the camera and then see it shoot
// out a burst of lines to sample, and then draw the new image"). On release
// it shoots a burst: a sample of its rays, drawn from the lens to the stored
// cells they read; then the photograph is the new one, every pixel again a
// lens integral of stored values.
let yaw = 0;
let pitch = 0;
const BURST = 140;
const burst = Array.from({ length: BURST }, () => {
  const l = polyline([[0, 0, 0], [0, 0, 0]], { color: C.bone, width: 1.4, opacity: 0.8 });
  l.visible = false;
  l.renderOrder = 6;
  stage.add(l);
  return l;
});
const burstEnds: THREE.Vector3[] = [];
let burstAt = -1;
let pending: Float32Array | null = null;

/** The photograph from the turned camera, and where a sample of its rays landed on the net. */
function measure(): Float32Array {
  const rot = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
  const turn = (v: V3): V3 => {
    const w = new THREE.Vector3(...v).applyQuaternion(rot);
    return [w.x, w.y, w.z];
  };
  const F = turn(fwd);
  const R = turn(right);
  const U = turn(up);
  const out = new Float32Array(RES * RES * 4);
  burstEnds.length = 0;
  const every = Math.floor((RES * RES) / BURST);
  for (let py = 0; py < RES; py++) {
    for (let px = 0; px < RES; px++) {
      const su = ((px + 0.5) / RES) * 2 - 1;
      const sv = 1 - ((py + 0.5) / RES) * 2;
      const d0 = unit([F[0] + R[0] * su * halfH + U[0] * sv * halfH, F[1] + R[1] * su * halfH + U[1] * sv * halfH, F[2] + R[2] * su * halfH + U[2] * sv * halfH]);
      const tt = FOCUS / (d0[0] * F[0] + d0[1] * F[1] + d0[2] * F[2]);
      const focal: V3 = [EYE[0] + d0[0] * tt, EYE[1] + d0[1] * tt, EYE[2] + d0[2] * tt];
      let r = 0;
      let g = 0;
      let bl = 0;
      const pick = (py * RES + px) % every === 0;
      for (let k = 0; k < K; k++) {
        const [ax, ay] = lensPt(k);
        const o: V3 = [EYE[0] + (R[0] * ax + U[0] * ay) * LENS_R, EYE[1] + (R[1] * ax + U[1] * ay) * LENS_R, EYE[2] + (R[2] * ax + U[2] * ay) * LENS_R];
        const c = lookFine(o, unit(sub(focal, o)));
        r += c[0];
        g += c[1];
        bl += c[2];
        if (pick && k === 0 && lastHit && burstEnds.length < BURST) {
          // The fine texel, as a (fractional) cell of the drawn net.
          const fc = fineCharts[lastHit.chart]!;
          const cc = u.charts[lastHit.chart]!;
          burstEnds.push(u.cellCentre(lastHit.chart, ((lastHit.lx + 0.5) * cc.w) / fc.w - 0.5, ((lastHit.ly + 0.5) * cc.h) / fc.h - 0.5));
        }
      }
      const o4 = (py * RES + px) * 4;
      out[o4] = r / K;
      out[o4 + 1] = g / K;
      out[o4 + 2] = bl / K;
      out[o4 + 3] = 1;
    }
  }
  return out;
}

if (REAL) {
  const canvas = stage.renderer.domElement;
  let drag: { x: number; y: number; yaw: number; pitch: number } | null = null;
  canvas.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, yaw, pitch };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    yaw = drag.yaw - (e.clientX - drag.x) * 0.0025;
    pitch = Math.max(-0.6, Math.min(0.6, drag.pitch - (e.clientY - drag.y) * 0.0025));
    camGroup.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
  });
  const release = () => {
    if (!drag) return;
    drag = null;
    pending = measure();
    burstAt = -2; // start on the next frame
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
}

stage.frame((t) => {
  if (REAL) {
    panel.quaternion.copy(stage.camera.quaternion);
    // The burst: lines grow from the lens to the cells, the new photograph
    // lands as they arrive, and they fade.
    if (burstAt === -2) burstAt = t;
    if (burstAt >= 0) {
      const a = (t - burstAt) / 0.5;
      const lens = camGroup.position;
      burst.forEach((l, i) => {
        const end = burstEnds[i];
        l.visible = !!end && a < 2.6;
        if (!l.visible) return;
        const f = Math.min(1, a);
        const p = lens.clone().lerp(end!, f);
        setPolyline(l, [[lens.x, lens.y, lens.z], [p.x, p.y + 0.05, p.z]]);
        (l.material as THREE.Material & { opacity: number }).opacity = 0.8 * Math.min(1, Math.max(0, 2.6 - a));
      });
      if (a >= 1 && pending) {
        shown.set(pending);
        imgTex.needsUpdate = true;
        pending = null;
      }
      if (a >= 2.6) burstAt = -1;
    }
    return;
  }
  // How many pixels are measured, and where the head is.
  let done: number;
  let head = -1;
  let fanAlpha = 0;
  if (t < LEAD) done = 0;
  else if (t < SWEEP_AT) {
    const h = Math.floor((t - LEAD) / HERO_T);
    const f = (t - LEAD) / HERO_T - h;
    head = h;
    // The zoom takes the first quarter; the rays then fan out and hold.
    done = h + (f > 0.6 ? 1 : 0);
    fanAlpha = f < 0.25 ? 0 : Math.min(1, (f - 0.25) / 0.1) * (f > 0.9 ? (1 - f) / 0.1 : 1);
  } else {
    const f = Math.min(1, (t - SWEEP_AT) / SWEEP);
    done = HEROES.length + Math.floor(f * (order.length - HEROES.length));
    head = done - 1;
    fanAlpha = f < 1 ? 0.6 : 0;
  }

  // The shot: in to each opening pixel's cells in turn, back out for the sweep.
  let shot: [Shot, Shot, number];
  if (t < LEAD) shot = [WIDE, WIDE, 0];
  else if (t < SWEEP_AT) {
    const h = Math.min(HEROES.length - 1, Math.floor((t - LEAD) / HERO_T));
    const f = (t - LEAD) / HERO_T - h;
    shot = [h === 0 ? WIDE : CLOSE[h - 1]!, CLOSE[h]!, smootherstep(Math.min(1, f / 0.25))];
  } else shot = [CLOSE[CLOSE.length - 1] ?? WIDE, WIDE, smootherstep(Math.min(1, (t - SWEEP_AT) / 1.6))];
  lerpShot(stage, shot[0], shot[1], shot[2]);
  panel.quaternion.copy(stage.camera.quaternion);

  if (done !== lastDone) {
    shown.fill(0);
    for (let n = 0; n < done; n++) {
      const i = order[n]!;
      for (let c = 0; c < 4; c++) shown[i * 4 + c] = image[i * 4 + c]!;
    }
    imgTex.needsUpdate = true;
    lastDone = done;
  }

  for (const g of glowData) g.fill(0);
  if (head >= 0 && head < order.length) {
    if (t < SWEEP_AT) glowPixel(order[head]!, fanAlpha);
    else for (let n = Math.max(0, head - TRAIL); n <= head; n++) glowPixel(order[n]!, 1 - (head - n) / TRAIL);
    showFan(order[head]!, fanAlpha);
  } else showFan(0, 0);
  for (const tex of glowTex) tex.needsUpdate = true;
});

stage.start();
