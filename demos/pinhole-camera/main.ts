/**
 * A pinhole camera: each pixel reads one spectrum and turns it into a colour.
 *
 * The room of light-field-room, its light already there (src/beamroom.ts).
 * A box with a pinhole in its front and a row of pixels on its back wall. Pixel
 * j sees exactly one ray: the one from the room through the pinhole onto it. Its
 * value is the light field read there, the spectrum of the light at the pinhole
 * travelling toward the pixel, taken through the CIE observer to a colour. The
 * scan reads the pixels one at a time: the ray goes out from the pixel through
 * the pinhole, the graph shows its spectrum, the pixel takes its colour, on the
 * sensor and in the image beside it. A 2D room makes a 1D image.
 *
 * Idealisation, stated: the camera is not in the scene. It reads the light
 * field and does not change it (a real box would cast a shadow and block the
 * light behind it).
 *
 * After the scan the camera can be dragged (the body moves it, the ring turns
 * it about the pinhole; `aim` turns it too) and the image is read again at once: reading a light
 * field that is already there is cheap. Click a pixel in the image to see its
 * ray and spectrum.
 *
 * Readability, as in light-field-room: the graph has the fixed scale of the
 * brightest walls, so the lamp and the mirrors' views of it run off the top;
 * pixel colours are the same exposure, and saturate there.
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
const PER_PIXEL = 0.7;
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
const DEPTH = 0.8; // pinhole to sensor
const WIDTH = 1.6; // the sensor
const GAP = 0.06; // half the pinhole
const RING = 1.4; // the ring that turns it
const params = { aim: 22 };
let cam = v(-3.5, -1.3);
const pt = (p: Vec, z = 0): [number, number, number] => [p.x, p.y, z];

const box = [polyline(Array.from({ length: 6 }, () => [0, 0, 0] as [number, number, number]), { color: C.bone, width: 4 })];
const ring = polyline(Array.from({ length: 65 }, () => [0, 0, 0] as [number, number, number]), { color: C.bone, width: 2, opacity: 0.35 });
const sensor = Array.from({ length: NPIX }, () => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), flat(0x000000));
  m.position.z = 0.04;
  return m;
});
const rays = Array.from({ length: NPIX }, () => polyline([[0, 0, 0], [0, 0, 0], [0, 0, 0]], { color: C.bone, width: 2, opacity: 0.3 }));
const current = polyline([[0, 0, 0], [0, 0, 0], [0, 0, 0]], { color: C.bone, width: 4 });
room.add(ring, ...box, ...sensor, ...rays, current);

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
const colours = new Array<number>(NPIX).fill(0);
const hits: Vec[] = new Array(NPIX).fill(v(0, 0));
/** Read every pixel: the light field at the pinhole, toward the pixel. */
function read(): void {
  for (let k = 0; k < NPIX; k++) {
    const path: Vec[] = [];
    lightAlong(cam, pixel(k).w, spectra[k]!, path);
    hits[k] = path[1] ?? cam;
    const [X, Y, Z] = toXYZ(spectra[k]!);
    colours[k] = xyzToHex((X / Yref) * GAIN, (Y / Yref) * GAIN, (Z / Yref) * GAIN);
  }
}

function drawCamera(): void {
  const f = fromAngle(params.aim);
  const s = perp(f);
  const h = WIDTH / 2 + 0.08;
  const back = add(cam, f, -(DEPTH + 0.1));
  setPolyline(box[0]!, [pt(add(cam, s, GAP)), pt(add(cam, s, h)), pt(add(back, s, h)), pt(add(back, s, -h)), pt(add(cam, s, -h)), pt(add(cam, s, -GAP))]);
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
/** `&rgb`: a ray drawn in the colour of the light it brings back. */
const tint = (line: { material: unknown }, hex: number) => (line.material as { color: THREE.Color }).color.setHex(hex);
function setGraph(k: number | null): void {
  if (RGB_MODE) return;
  curve.visible = fillMesh.visible = k !== null;
  offScale.visible = false;
  if (k === null) return;
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
/** The ray of pixel k, from the pixel through the pinhole, drawn out to fraction g of the way to the surface it sees. */
function rayPoints(k: number, g: number): [number, number, number][] {
  const { at } = pixel(k);
  const end = add(cam, sub(hits[k]!, cam), g);
  return [pt(at, 0.03), pt(cam, 0.03), pt(end, 0.03)];
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
    rays[j]!.visible = (manual || j < k) && j !== active;
    if (rays[j]!.visible) setPolyline(rays[j]!, rayPoints(j, 1));
    if (RGB_MODE) tint(rays[j]!, colours[j]!);
  }
  current.visible = active !== null;
  if (RGB_MODE && active !== null) tint(current, colours[active]!);
  if (active !== null) setPolyline(current, rayPoints(active, manual || active < k ? 1 : Math.min(1, f / 0.45)));
  setGraph(active !== null && (manual || active < k || f > 0.45) ? active : null);
  setMark(active);
}

read();
drawCamera();
stage.frame((t) => show(t));
ui.params.add(params, 'aim', 0, 360, 1).onChange(() => {
  manual = true;
  read();
  drawCamera();
  show(stage.t);
});

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
