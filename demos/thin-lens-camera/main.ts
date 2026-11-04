/**
 * A thin-lens camera: each pixel is an integral over the lens.
 *
 * The partner of pinhole-camera (Steve, 2026-11-03: for the camera we do
 * essentially only the thin lens; maybe one slide of the pinhole, where each
 * pixel is directly assigned a light-field spectrum, then the lens, where each
 * pixel is an integral). The same room, its light already there
 * (src/beamroom.ts), and the same box, with a lens across its front instead
 * of a pinhole.
 *
 * Pixel j does not see one ray but a fan of them, one through every point a
 * of the lens. A thin lens sends all the light leaving one point F_j of the
 * focus plane, and reaching the lens, onto pixel j: F_j is where the ray from
 * the pixel through the lens's centre meets the focus plane (at `focus` in
 * front of the lens). So the ray through lens point a is the line from F_j to
 * a, and the pixel's spectrum is the average of the light field along those
 * rays,
 *
 *     L_j = (1/|A|) \int_A L(a, unit(a - F_j)) da,
 *
 * computed here at K points spread evenly across the lens. The graph draws the
 * K spectra faintly and their average, the pixel's spectrum, boldly. What the
 * focus plane meets, the fan meets in one point: sharp. Elsewhere the fan
 * spreads and the pixel averages different things: blur. As `aperture` closes
 * to 0 every fan shrinks to the one ray through the centre: the pinhole.
 *
 * The scan reads the pixels one at a time; after it, drag the camera (body
 * moves it, the ring turns it) or change `focus` and `aperture`, and the image
 * is read again at once. Click a pixel in the image to see its fan.
 *
 * Idealisation, as pinhole-camera: the camera reads the light field and does
 * not change it. Exposure as pinhole-camera, so the two images compare.
 */

import * as THREE from 'three';
import { createStage, createUI, C, flat } from '@';
import { polyline, setPolyline } from '@/lines';
import { label } from '@/text';
import { CMF, xyzToHex } from '@/response';
import { type Vec, v, add, sub, perp, unit, fromAngle, WL0, WL1, NS, nmAt, spectrum, nmColour, toXYZ, ROOM_HALF, L_REF, lightAlong, drawRoom } from '@/beamroom';

// --- Frame -----------------------------------------------------------------
const ORTHO_H = 3;
const HALF_W = (ORTHO_H * 16) / 9;
const stage = createStage({ camera: 'ortho', position: [0, 0, 10], target: [0, 0, 0], orthoHeight: ORTHO_H, lights: false, controls: false });
const NPIX = 16;
const PER_PIXEL = 1.0;
const HOLD = 3;
stage.duration = NPIX * PER_PIXEL + 1 + HOLD;
const ui = createUI(stage);

const ROOM_SCALE = 0.66;
const ROOM_AT = { x: -1.75, y: 0.0 };
const room = new THREE.Group();
room.scale.setScalar(ROOM_SCALE);
room.position.set(ROOM_AT.x, ROOM_AT.y, 0);
stage.add(room);
drawRoom(room);

// --- The camera ----------------------------------------------------------------
const DEPTH = 0.8; // lens to sensor
const WIDTH = 1.6; // the sensor
const RING = 1.4; // the ring that turns it
const K = 24; // points across the lens
const params = { aim: 22, focus: 3.2, aperture: 1.0 };
let cam = v(-3.5, -1.3);
const pt = (p: Vec, z = 0): [number, number, number] => [p.x, p.y, z];

const box = [polyline(Array.from({ length: 6 }, () => [0, 0, 0] as [number, number, number]), { color: C.bone, width: 4 })];
const ring = polyline(Array.from({ length: 65 }, () => [0, 0, 0] as [number, number, number]), { color: C.bone, width: 2, opacity: 0.35 });
const sensor = Array.from({ length: NPIX }, () => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), flat(0x000000));
  m.position.z = 0.04;
  return m;
});
// The lens, and the active pixel's fan: one ray per lens point, pixel -> lens -> room.
const lens = polyline(Array.from({ length: 49 }, () => [0, 0, 0] as [number, number, number]), { color: C.blue, width: 4 });
const fan = Array.from({ length: K }, () => polyline([[0, 0, 0], [0, 0, 0], [0, 0, 0]], { color: C.bone, width: 2, opacity: 0.55 }));
const focusPlane = polyline([[0, 0, 0], [0, 0, 0]], { color: C.ochre, width: 2, dashed: true, dashSize: 0.12, gapSize: 0.1, opacity: 0.8 });
const focusDot = new THREE.Mesh(new THREE.CircleGeometry(0.07, 24), flat(C.ochre));
focusDot.position.z = 0.06;
room.add(ring, ...box, lens, focusPlane, ...sensor, ...fan, focusDot);

/** Pixel k from the left of the image: its centre on the sensor and the direction light arrives in. */
function pixel(k: number): { at: Vec; w: Vec } {
  const f = fromAngle(params.aim);
  const s = perp(f);
  const u = -WIDTH / 2 + ((k + 0.5) * WIDTH) / NPIX; // u < 0 looks left (toward +s)
  const at = add(add(cam, f, -DEPTH), s, u);
  return { at, w: unit(sub(at, cam)) };
}

// --- The graph and the image ------------------------------------------------------
/** `&rgb` (Steve): no spectrum graph; each ray drawn in the colour of the light it brings back. */
const RGB_MODE = new URLSearchParams(location.search).has('rgb');
const graph = new THREE.Group();
graph.visible = !RGB_MODE;
stage.add(graph);
const G = { x0: 2.0, x1: 5.05, y0: 0.45, y1: 2.35 };
const gx = (nm: number) => G.x0 + ((nm - WL0) / (WL1 - WL0)) * (G.x1 - G.x0);
const gy = (h: number) => G.y0 + Math.min(h, 1) * (G.y1 - G.y0);
graph.add(polyline([[G.x0, G.y0, 0], [G.x1, G.y0, 0]], { color: C.slateDeep, width: 2 }));
for (const nm of [400, 500, 600, 700]) {
  graph.add(polyline([[gx(nm), G.y0 - 0.08, 0], [gx(nm), G.y0, 0]], { color: C.slateDeep, width: 2 }));
  graph.add(label(String(nm), { size: 0.15, color: C.slate, anchorX: 'center', anchorY: 'top', position: [gx(nm), G.y0 - 0.28, 0] }));
}
for (let i = 0; i < 120; i++) {
  const nm = WL0 + ((WL1 - WL0) * (i + 0.5)) / 120;
  const xyz = CMF.map((f) => f(Math.min(nm, 670)));
  const strip = new THREE.Mesh(
    new THREE.PlaneGeometry(((G.x1 - G.x0) / 120) * 1.03, 0.08),
    flat(nmColour(nm), { transparent: true, opacity: Math.min(1, (xyz[0]! + xyz[1]! + xyz[2]!) * 1.6) }),
  );
  strip.position.set(gx(nm), G.y0 - 0.14, 0);
  graph.add(strip);
}
graph.add(label('Spectrum', { size: 0.18, color: C.ash, anchorX: 'center', anchorY: 'top', position: [(G.x0 + G.x1) / 2, G.y0 - 0.52, 0] }));
const curve = polyline(Array.from({ length: NS }, () => [0, 0, 0] as [number, number, number]), { color: C.bone, width: 4 });
// The K spectra the pixel averages, faint under the average.
const parts = Array.from({ length: K }, () => polyline(Array.from({ length: NS }, () => [0, 0, 0] as [number, number, number]), { color: C.slate, width: 1.5, opacity: 0.45 }));
graph.add(...parts);
const fillGeom = new THREE.BufferGeometry();
fillGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NS * 6), 3));
fillGeom.setIndex(Array.from({ length: NS - 1 }, (_, i) => [2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2]).flat());
const fillMesh = new THREE.Mesh(fillGeom, flat(C.bone, { transparent: true, opacity: 0.15, side: THREE.DoubleSide, depthWrite: false }));
fillMesh.position.z = -0.01;
const offScale = label('off the top', { size: 0.15, color: C.ash, anchorX: 'left', anchorY: 'bottom', position: [G.x0, G.y1 + 0.08, 0] });
graph.add(curve, fillMesh, offScale);

const IMG = RGB_MODE ? { x0: 2.05, x1: 5.15, y: 0 } : { x0: 2.0, x1: 5.05, y: -1.25 };
const CELL = (IMG.x1 - IMG.x0) / NPIX;
const image = Array.from({ length: NPIX }, (_, k) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(CELL * 0.92, CELL * 0.92), flat(0x000000));
  m.position.set(IMG.x0 + (k + 0.5) * CELL, IMG.y, 0);
  return m;
});
const frame = polyline([[IMG.x0 - 0.04, IMG.y - CELL / 2 - 0.04, 0], [IMG.x1 + 0.04, IMG.y - CELL / 2 - 0.04, 0], [IMG.x1 + 0.04, IMG.y + CELL / 2 + 0.04, 0], [IMG.x0 - 0.04, IMG.y + CELL / 2 + 0.04, 0], [IMG.x0 - 0.04, IMG.y - CELL / 2 - 0.04, 0]], { color: C.slateDeep, width: 2 });
const mark = polyline(Array.from({ length: 5 }, () => [0, 0, 0] as [number, number, number]), { color: C.bone, width: 3 });
stage.add(frame, ...image, mark);
stage.add(label('Image', { size: 0.18, color: C.ash, anchorX: 'center', anchorY: 'top', position: [(IMG.x0 + IMG.x1) / 2, IMG.y - CELL / 2 - 0.2, 0] }));

// --- Reading ------------------------------------------------------------------------
const Yref = toXYZ(spectrum(() => L_REF))[1];
const GAIN = 1.6;
const spectra = Array.from({ length: NPIX }, () => new Float64Array(NS));
const each = Array.from({ length: NPIX }, () => Array.from({ length: K }, () => new Float64Array(NS)));
const colours = new Array<number>(NPIX).fill(0);
/** Per pixel, per lens point: the point on the lens and where its ray meets the room. */
const fans: { a: Vec; hit: Vec; colour: number }[][] = Array.from({ length: NPIX }, () => []);
const focusOf: Vec[] = new Array(NPIX).fill(v(0, 0));
/** Lens point i, evenly across the aperture. */
const lensPoint = (i: number): Vec => add(cam, perp(fromAngle(params.aim)), -params.aperture / 2 + ((i + 0.5) * params.aperture) / K);
/** Read every pixel: the average of the light field along its fan. */
function read(): void {
  const f = fromAngle(params.aim);
  for (let k = 0; k < NPIX; k++) {
    const { at } = pixel(k);
    const chief = unit(sub(cam, at)); // out through the lens's centre
    const F = add(cam, chief, params.focus / Math.max(0.2, chief.x * f.x + chief.y * f.y));
    focusOf[k] = F;
    const L = spectra[k]!;
    L.fill(0);
    fans[k] = [];
    for (let i = 0; i < K; i++) {
      const a = lensPoint(i);
      const path: Vec[] = [];
      lightAlong(a, unit(sub(a, F)), each[k]![i]!, path);
      const [x, y, z] = toXYZ(each[k]![i]!);
      fans[k]!.push({ a, hit: path[1] ?? a, colour: xyzToHex((x / Yref) * GAIN, (y / Yref) * GAIN, (z / Yref) * GAIN) });
      for (let n = 0; n < NS; n++) L[n]! += each[k]![i]![n]! / K;
    }
    const [X, Y, Z] = toXYZ(L);
    colours[k] = xyzToHex((X / Yref) * GAIN, (Y / Yref) * GAIN, (Z / Yref) * GAIN);
  }
}

function drawCamera(): void {
  const f = fromAngle(params.aim);
  const s = perp(f);
  const h = Math.max(WIDTH, params.aperture) / 2 + 0.08;
  const back = add(cam, f, -(DEPTH + 0.1));
  const A2 = params.aperture / 2;
  setPolyline(box[0]!, [pt(add(cam, s, A2 + 0.02)), pt(add(cam, s, h)), pt(add(back, s, h)), pt(add(back, s, -h)), pt(add(cam, s, -h)), pt(add(cam, s, -A2 - 0.02))]);
  // The lens: a thin biconvex outline across the opening.
  setPolyline(lens, Array.from({ length: 49 }, (_, i) => {
    const th = (2 * Math.PI * i) / 48;
    return pt(add(add(cam, s, Math.max(A2, 0.01) * Math.sin(th)), f, 0.07 * Math.cos(th)), 0.05);
  }));
  // The focus plane, across the camera's view at `focus`.
  const c = add(cam, f, params.focus);
  setPolyline(focusPlane, [pt(add(c, s, 1.4)), pt(add(c, s, -1.4))]);
  setPolyline(ring, Array.from({ length: 65 }, (_, k) => pt(add(cam, fromAngle((360 * k) / 64), RING))));
  for (let k = 0; k < NPIX; k++) {
    const m = sensor[k]!;
    const { at } = pixel(k);
    m.position.set(at.x, at.y, 0.04);
    m.rotation.z = Math.atan2(s.y, s.x);
    m.scale.set((WIDTH / NPIX) * 0.88, 0.16, 1);
  }
}

// --- Update ---------------------------------------------------------------------------
let manual = false; // once the camera is moved, or a pixel clicked, the scan is over
let chosen = NPIX - 1;
function setGraph(k: number | null): void {
  if (RGB_MODE) return;
  curve.visible = fillMesh.visible = k !== null;
  for (const p of parts) p.visible = k !== null;
  offScale.visible = false;
  if (k === null) return;
  each[k]!.forEach((S, i) => setPolyline(parts[i]!, Array.from({ length: NS }, (_, n) => [gx(nmAt(n)), gy(S[n]! / L_REF), -0.005] as [number, number, number])));
  const L = spectra[k]!;
  const pos = fillGeom.attributes.position as THREE.BufferAttribute;
  const cpts: [number, number, number][] = [];
  for (let i = 0; i < NS; i++) {
    const hh = L[i]! / L_REF;
    offScale.visible ||= hh > 1;
    cpts.push([gx(nmAt(i)), gy(hh), 0]);
    pos.setXYZ(2 * i, gx(nmAt(i)), gy(hh), 0);
    pos.setXYZ(2 * i + 1, gx(nmAt(i)), G.y0, 0);
  }
  pos.needsUpdate = true;
  setPolyline(curve, cpts);
}
function setMark(k: number | null): void {
  mark.visible = k !== null;
  if (k === null) return;
  const x = IMG.x0 + (k + 0.5) * CELL;
  const r = CELL / 2 + 0.03;
  setPolyline(mark, [[x - r, IMG.y - r, 0.01], [x + r, IMG.y - r, 0.01], [x + r, IMG.y + r, 0.01], [x - r, IMG.y + r, 0.01], [x - r, IMG.y - r, 0.01]]);
}
/** Pixel k's fan, drawn out to fraction g of the way to the surfaces it sees. */
function drawFan(k: number | null, g: number): void {
  focusDot.visible = k !== null;
  fan.forEach((line, i) => {
    line.visible = k !== null;
    if (k === null) return;
    const { at } = pixel(k);
    const { a, hit, colour } = fans[k]![i]!;
    setPolyline(line, [pt(at, 0.03), pt(a, 0.03), pt(add(a, sub(hit, a), g), 0.03)]);
    // `&rgb`: each ray in the colour of the light it brings back.
    (line.material as unknown as { color: THREE.Color; opacity: number }).color.setHex(RGB_MODE ? colour : C.bone);
    (line.material as unknown as { opacity: number }).opacity = RGB_MODE ? 0.85 : 0.55;
  });
  if (k !== null) focusDot.position.set(focusOf[k]!.x, focusOf[k]!.y, 0.06);
}

function show(t: number): void {
  // The scan: pixel k is read over [1 + k PER_PIXEL, 1 + (k + 1) PER_PIXEL).
  const u = manual ? Infinity : (t % stage.duration) - 1;
  const k = Math.floor(u / PER_PIXEL);
  const f = u / PER_PIXEL - k;
  const active = manual ? chosen : k >= 0 && k < NPIX ? k : k >= NPIX ? NPIX - 1 : null;
  for (let j = 0; j < NPIX; j++) {
    const read = manual || j < k || (j === k && f > 0.5);
    const c = read ? colours[j]! : 0x000000;
    (sensor[j]!.material as THREE.MeshBasicMaterial).color.setHex(c);
    (image[j]!.material as THREE.MeshBasicMaterial).color.setHex(c);
  }
  drawFan(active, active === null ? 0 : manual || active < k ? 1 : Math.min(1, f / 0.45));
  setGraph(active !== null && (manual || active < k || f > 0.45) ? active : null);
  setMark(active);
}

read();
drawCamera();
stage.frame((t) => show(t));
const reread = () => {
  manual = true;
  read();
  drawCamera();
  show(stage.t);
};
ui.params.add(params, 'aim', 0, 360, 1).onChange(reread);
ui.params.add(params, 'focus', 0.8, 9, 0.05).onChange(reread);
ui.params.add(params, 'aperture', 0, 1.6, 0.01).onChange(reread);

// --- Dragging the camera, clicking a pixel ----------------------------------------------
const canvas = stage.renderer.domElement;
const toWorld = (e: PointerEvent): Vec => {
  const r = canvas.getBoundingClientRect();
  return v((((e.clientX - r.left) / r.width) * 2 - 1) * HALF_W, -(((e.clientY - r.top) / r.height) * 2 - 1) * ORTHO_H);
};
const toRoom = (p: Vec): Vec => v((p.x - ROOM_AT.x) / ROOM_SCALE, (p.y - ROOM_AT.y) / ROOM_SCALE);
const inside = (p: Vec) => Math.abs(p.x) < ROOM_HALF.x - 0.6 && Math.abs(p.y) < ROOM_HALF.y - 0.6;
let grab: { kind: 'move'; off: Vec } | { kind: 'turn' } | null = null;
function nearWhat(p: Vec): 'move' | 'turn' | null {
  const c = add(cam, fromAngle(params.aim), -DEPTH / 2);
  if (Math.hypot(p.x - c.x, p.y - c.y) < 0.85) return 'move';
  if (Math.abs(Math.hypot(p.x - cam.x, p.y - cam.y) - RING) < 0.2) return 'turn';
  return null;
}
canvas.addEventListener('pointerdown', (e) => {
  const w = toWorld(e);
  if (Math.abs(w.y - IMG.y) < CELL / 2 && w.x > IMG.x0 && w.x < IMG.x1) {
    manual = true;
    chosen = Math.min(NPIX - 1, Math.floor((w.x - IMG.x0) / CELL));
    show(stage.t);
    return;
  }
  const p = toRoom(w);
  const what = nearWhat(p);
  grab = what === 'move' ? { kind: 'move', off: sub(cam, p) } : what === 'turn' ? { kind: 'turn' } : null;
  if (grab) canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  const p = toRoom(toWorld(e));
  if (!grab) {
    canvas.style.cursor = nearWhat(p) ? 'grab' : '';
    return;
  }
  manual = true;
  if (grab.kind === 'move') {
    const q = add(p, grab.off);
    if (inside(q)) cam = q;
  } else {
    params.aim = Math.round(((Math.atan2(p.y - cam.y, p.x - cam.x) * 180) / Math.PI + 360) % 360);
    ui.params.controllers.forEach((c) => c.updateDisplay());
  }
  read();
  drawCamera();
  show(stage.t);
});
const release = () => (grab = null);
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);

stage.start();
