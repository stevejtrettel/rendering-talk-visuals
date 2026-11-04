/**
 * The data of T at one point, in the 2D room: the material f(u, v) as a
 * function on circle x circle, unwrapped to a square (Steve, 2026-11-03:
 * "draw each of these materials as a graph for 2D over circle x circle
 * (unwrapped to a square) ... glass and foggy glass etc too so we see some are
 * dark in whole hemisphere halves and some are not").
 *
 * u (across) is the direction the light comes from, v (up) the direction it
 * leaves in, both as angles from the surface's normal. Each axis runs from -90
 * to 270 so that "above the surface" (-90..90) and "below" (90..270) are each
 * one half: the square falls into four quadrants, in and out above
 * (reflection off the front), in above and out below (through, downward), in
 * below and out above (through, upward), in and out below (reflection off the
 * back). The square's opposite edges are the same directions (it is a torus).
 *
 * Brightness is f on one compressed scale. A perfect mirror's or clear
 * glass's f is a spike, not a function; it is drawn as a line whose
 * brightness is its share of the light.
 *
 *   matte        opaque: f = RHO / 2, in and out above only
 *   glossy       opaque: a blurred mirror, a band about v = -u, above only
 *   mirror       opaque: the line v = -u, above only
 *   glass        the surface of a glass object (index 1.5, glass below):
 *                Snell's law bends the through-lines, Fresnel's law sets each
 *                line's share; from inside, past the critical angle, all of
 *                it reflects (total internal reflection)
 *   foggy glass  the same, every line blurred into a band
 *   paper        thin and translucent: dim everywhere, all four quadrants
 *
 * On the left, the object and a point p on its surface, a circle about p,
 * and one pair of directions: the incoming ray (ochre) and the outgoing ray
 * (blue). That pair is one point of the square, the marker; drag it (or the
 * `in` / `out` sliders) and the rays turn with it, the outgoing ray as
 * bright as f is there (Steve, 2026-11-03: "move it around and see the rays
 * where the response is high"). On a mirror's or clear glass's line the
 * marker snaps on, since a line is hard to land on by hand.
 *
 * `material` switches (and `&material=` in the URL).
 */

import * as THREE from 'three';
import { createStage, createUI, C, flat } from '@';
import { polyline, setPolyline } from '@/lines';
import { label } from '@/text';

const ORTHO_H = 3;
const HALF_W = (ORTHO_H * 16) / 9;
const stage = createStage({ camera: 'ortho', position: [0, 0, 10], target: [0, 0, 0], orthoHeight: ORTHO_H, lights: false, controls: false });
stage.duration = 1;
const ui = createUI(stage);

// --- Figure spec -----------------------------------------------------------
const SQ = { cx: 2.1, cy: -0.1, half: 1.8 }; // clear of the deck's buttons
const P = { x: -3.0, y: 0.15 }; // the point on the object's surface
const RING = 1.3; // the circle about it
const OBJ = { x0: -5.0, x1: -1.0, y0: -2.75 }; // the object, its top at P.y
const SNAP = 4; // degrees
const MATERIALS = ['matte', 'glossy', 'mirror', 'glass', 'foggy glass', 'paper'] as const;
type Material = (typeof MATERIALS)[number];
const RHO = 0.8;
const MIRROR_RHO = 0.9;
const IOR = 1.5;
const GLOSS_SIGMA = 9; // degrees
const FOG_SIGMA = 12;
const N = 720; // texels a side, half a degree each
const LINE_R = 1.6; // a spike's line, half-width in texels
/** One scale for every material: matte a mid grey, the bands bright but not white. */
const tone = (x: number) => x / (x + 0.6);
const startMaterial = new URLSearchParams(location.search).get('material')?.replace(/[+_-]/g, ' ');
const params = { material: (MATERIALS as readonly string[]).includes(startMaterial ?? '') ? (startMaterial as Material) : 'matte', in: -40, out: 40 };

// --- Directions --------------------------------------------------------------
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const A0 = -90; // the axes run A0 .. A0 + 360
const angleAt = (i: number) => A0 + (360 * (i + 0.5)) / N;
const texelOf = (a: number) => (((a - A0) % 360) + 360) % 360 / (360 / N) - 0.5;
const above = (a: number) => a > -90 && a < 90;
/** Unpolarised Fresnel reflectance at a dielectric boundary; cosI on the side the light comes from, eta = n_from / n_to. */
function fresnel(cosI: number, eta: number): number {
  const sinT2 = eta * eta * (1 - cosI * cosI);
  if (sinT2 >= 1) return 1;
  const cosT = Math.sqrt(1 - sinT2);
  const rs = (eta * cosI - cosT) / (eta * cosI + cosT);
  const rp = (cosI - eta * cosT) / (cosI + eta * cosT);
  return (rs * rs + rp * rp) / 2;
}
/** The glass side's angle for an air-side angle a (Snell's law), both from the normal on their own side. */
const bent = (a: number) => deg(Math.asin(Math.sin(rad(a)) / IOR));

/**
 * Where light from u goes at the glass surface: a list of (direction, share).
 * Above (in air): reflected to -u, bent through to 180 + bent(u). Below (in
 * glass, angle g from the downward normal): reflected to 180 - g, and, inside
 * the critical angle, bent out to the air angle a with bent(a) = g.
 */
function glassTargets(u: number): [number, number][] {
  if (above(u)) {
    const F = fresnel(Math.cos(rad(u)), 1 / IOR);
    return [[-u, F], [180 + bent(u), 1 - F]];
  }
  const g = ((u - 180 + 540) % 360) - 180; // -90..90
  const F = fresnel(Math.cos(rad(g)), IOR);
  const out: [number, number][] = [[180 - g, F]];
  if (F < 1) out.push([deg(Math.asin(Math.sin(rad(g)) * IOR)), 1 - F]);
  return out;
}

// --- The heatmap -----------------------------------------------------------------
const data = new Uint8Array(N * N * 4);
const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
tex.colorSpace = THREE.SRGBColorSpace;
tex.magFilter = THREE.LinearFilter;
tex.minFilter = THREE.LinearFilter;
const heat = new THREE.Mesh(new THREE.PlaneGeometry(2 * SQ.half, 2 * SQ.half), new THREE.MeshBasicMaterial({ map: tex }));
heat.position.set(SQ.cx, SQ.cy, 0);
stage.add(heat);
const value = new Float32Array(N * N); // display brightness, 0..1, texel (i = u, j = v)

/** A band of the given share about each target, as a density: normalised so its integral against |cos v| is the share. */
function lobes(targetsOf: (u: number) => [number, number][], sigma: number): void {
  const col = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const u = angleAt(i);
    for (const [t, share] of targetsOf(u)) {
      const side = above(t);
      let norm = 0;
      for (let j = 0; j < N; j++) {
        const v = angleAt(j);
        if (above(v) !== side) {
          col[j] = 0;
          continue;
        }
        const d = ((v - t + 540) % 360) - 180;
        col[j] = Math.exp((-d * d) / (2 * sigma * sigma));
        norm += col[j]! * Math.abs(Math.cos(rad(v))) * rad(360 / N);
      }
      for (let j = 0; j < N; j++) if (col[j]) value[j * N + i] = Math.max(value[j * N + i]!, tone((share * col[j]!) / norm));
    }
  }
}
/** A spike drawn as a line through the points (u, v) of `curve` over a parameter, its brightness the share. */
function line(curve: (s: number) => [number, number, number] | null): void {
  const STEPS = 6000;
  for (let k = 0; k <= STEPS; k++) {
    const p = curve(-90 + (180 * k) / STEPS);
    if (!p) continue;
    const [u, v, share] = p;
    const x = texelOf(u);
    const y = texelOf(v);
    for (let j = Math.floor(y - LINE_R - 1); j <= Math.ceil(y + LINE_R + 1); j++)
      for (let i = Math.floor(x - LINE_R - 1); i <= Math.ceil(x + LINE_R + 1); i++) {
        if (i < 0 || j < 0 || i >= N || j >= N) continue;
        const r = Math.hypot(i - x, j - y);
        const w = Math.max(0, Math.min(1, LINE_R + 0.5 - r));
        value[j * N + i] = Math.max(value[j * N + i]!, share * w);
      }
  }
}
/** The four glass lines, each over the air-side angle a (or the glass-side angle, for the reflection inside). */
function glassLines(): void {
  line((a) => [a, -a, fresnel(Math.cos(rad(a)), 1 / IOR)]); // reflected, front
  line((a) => [a, 180 + bent(a), 1 - fresnel(Math.cos(rad(a)), 1 / IOR)]); // through, downward
  line((a) => [180 + bent(a), a, 1 - fresnel(Math.cos(rad(a)), 1 / IOR)]); // through, upward (the same pairs, reversed)
  line((g) => [180 + g, 180 - g, fresnel(Math.cos(rad(g)), IOR)]); // reflected inside
}

function fill(m: Material): void {
  value.fill(0);
  if (m === 'matte' || m === 'paper') {
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const same = above(angleAt(i)) === above(angleAt(j));
        const f = m === 'matte' ? (above(angleAt(i)) && above(angleAt(j)) ? RHO / 2 : 0) : same ? 0.5 / 2 : 0.3 / 2;
        value[j * N + i] = tone(f);
      }
  } else if (m === 'glossy') lobes((u) => (above(u) ? [[-u, RHO]] : []), GLOSS_SIGMA);
  else if (m === 'mirror') line((a) => [a, -a, MIRROR_RHO]);
  else if (m === 'glass') glassLines();
  else lobes(glassTargets, FOG_SIGMA);
  for (let k = 0; k < N * N; k++) {
    const g = Math.round(255 * value[k]!);
    data[k * 4] = g;
    data[k * 4 + 1] = Math.round(g * 0.96);
    data[k * 4 + 2] = Math.round(g * 0.9);
    data[k * 4 + 3] = 255;
  }
  tex.needsUpdate = true;
}

// --- Frame, the halves, the axes ---------------------------------------------------
const toX = (a: number) => SQ.cx + ((a - A0) / 360 - 0.5) * 2 * SQ.half;
const toY = (a: number) => SQ.cy + ((a - A0) / 360 - 0.5) * 2 * SQ.half;
const L = SQ.cx - SQ.half;
const R = SQ.cx + SQ.half;
const B = SQ.cy - SQ.half;
const T = SQ.cy + SQ.half;
stage.add(polyline([[L, B, 0.02], [R, B, 0.02], [R, T, 0.02], [L, T, 0.02], [L, B, 0.02]], { color: C.slate, width: 2 }));
stage.add(polyline([[toX(90), B, 0.03], [toX(90), T, 0.03]], { color: C.slate, width: 1.5, dashed: true, dashSize: 0.06, gapSize: 0.06 }));
stage.add(polyline([[L, toY(90), 0.03], [R, toY(90), 0.03]], { color: C.slate, width: 1.5, dashed: true, dashSize: 0.06, gapSize: 0.06 }));
for (const a of [-90, 0, 90, 180, 270]) {
  stage.add(label(`${a}°`, { size: 0.14, color: C.slate, anchorX: 'center', anchorY: 'top', position: [toX(a), B - 0.06, 0] }));
  stage.add(label(`${a}°`, { size: 0.14, color: C.slate, anchorX: 'right', anchorY: 'middle', position: [L - 0.08, toY(a), 0] }));
}
for (const [a, name] of [[0, 'above'], [180, 'below']] as const) {
  stage.add(label(name, { size: 0.17, color: C.ash, anchorX: 'center', anchorY: 'top', position: [toX(a), B - 0.3, 0] }));
  const side = label(name, { size: 0.17, color: C.ash, anchorX: 'center', anchorY: 'bottom', position: [L - 0.55, toY(a), 0] });
  side.rotation.z = Math.PI / 2;
  stage.add(side);
}
stage.add(label('incoming direction', { size: 0.2, color: C.ochre, anchorX: 'center', anchorY: 'top', position: [SQ.cx, B - 0.58, 0] }));
const outName = label('outgoing direction', { size: 0.2, color: C.blue, anchorX: 'center', anchorY: 'bottom', position: [L - 0.85, SQ.cy, 0] });
outName.rotation.z = Math.PI / 2;
stage.add(outName);

// --- The object, the circle at p, the two rays ------------------------------------
const object = new THREE.Mesh(new THREE.PlaneGeometry(OBJ.x1 - OBJ.x0, P.y - OBJ.y0), flat(C.moss, { transparent: true }));
object.position.set((OBJ.x0 + OBJ.x1) / 2, (P.y + OBJ.y0) / 2, -0.2);
stage.add(object);
stage.add(polyline([[OBJ.x0, P.y, 0], [OBJ.x1, P.y, 0]], { color: C.bone, width: 2.5 }));
stage.add(polyline(Array.from({ length: 121 }, (_, k) => [P.x + RING * Math.cos((2 * Math.PI * k) / 120), P.y + RING * Math.sin((2 * Math.PI * k) / 120), 0.05] as [number, number, number]), { color: C.slate, width: 1.5, dashed: true, dashSize: 0.06, gapSize: 0.05 }));
const pDot = new THREE.Mesh(new THREE.CircleGeometry(0.06, 24), flat(C.bone));
pDot.position.set(P.x, P.y, 0.3);
stage.add(pDot);
stage.add(label('p', { size: 0.22, color: C.bone, anchorX: 'left', anchorY: 'top', position: [P.x + 0.1, P.y - 0.08, 0.3] }));
function arrowHead(color: number): THREE.Mesh {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -0.2, 0.08, 0, -0.2, -0.08, 0], 3));
  return new THREE.Mesh(g, flat(color));
}
const inRay = polyline([[0, 0, 0], [0, 0, 0]], { color: C.ochre, width: 4 });
const inHead = arrowHead(C.ochre);
const outRay = polyline([[0, 0, 0], [0, 0, 0]], { color: C.blue, width: 4 });
const outHead = arrowHead(C.blue);
stage.add(inRay, inHead, outRay, outHead);
const dirOf = (a: number) => new THREE.Vector2(Math.sin(rad(a)), Math.cos(rad(a)));
/** From `from` to `to`, the head at `to`. */
function ray(line: ReturnType<typeof polyline>, head: THREE.Mesh, from: THREE.Vector2, to: THREE.Vector2): void {
  const d = to.clone().sub(from);
  const back = to.clone().sub(d.clone().setLength(0.12));
  setPolyline(line, [[from.x, from.y, 0.2], [back.x, back.y, 0.2]]);
  head.position.set(to.x, to.y, 0.22);
  head.rotation.z = Math.atan2(d.y, d.x);
}

// --- The marker on the square ------------------------------------------------------
const marker = new THREE.Mesh(new THREE.RingGeometry(0.07, 0.11, 32), flat(C.rust));
stage.add(marker);
const BRIGHT = new THREE.Color(C.blue).lerp(new THREE.Color(0xffffff), 0.35);
const DIM = new THREE.Color(C.slateDeep);
const wrap = (a: number) => ((((a - A0) % 360) + 360) % 360) + A0;
function update(): void {
  const u = wrap(params.in);
  const v = wrap(params.out);
  const p = new THREE.Vector2(P.x, P.y);
  ray(inRay, inHead, p.clone().add(dirOf(u).multiplyScalar(RING)), p.clone().add(dirOf(u).multiplyScalar(0.09)));
  ray(outRay, outHead, p.clone().add(dirOf(v).multiplyScalar(0.09)), p.clone().add(dirOf(v).multiplyScalar(RING)));
  const i = Math.max(0, Math.min(N - 1, Math.round(texelOf(u))));
  const j = Math.max(0, Math.min(N - 1, Math.round(texelOf(v))));
  const c = DIM.clone().lerp(BRIGHT, value[j * N + i]!);
  (outRay.material as unknown as { color: THREE.Color }).color.copy(c);
  (outHead.material as THREE.MeshBasicMaterial).color.copy(c);
  marker.position.set(toX(u), toY(v), 0.3);
}
function setMaterial(): void {
  fill(params.material);
  const glassy = params.material === 'glass' || params.material === 'foggy glass';
  (object.material as THREE.MeshBasicMaterial).color.setHex(glassy ? C.blue : params.material === 'paper' ? C.bone : C.moss);
  (object.material as THREE.MeshBasicMaterial).opacity = glassy ? 0.3 : params.material === 'paper' ? 0.18 : 0.55;
  update();
}

// --- Drag on the square --------------------------------------------------------------
const canvas = stage.renderer.domElement;
const toWorld = (e: PointerEvent) => {
  const r = canvas.getBoundingClientRect();
  return new THREE.Vector2((((e.clientX - r.left) / r.width) * 2 - 1) * HALF_W, -(((e.clientY - r.top) / r.height) * 2 - 1) * ORTHO_H);
};
const onSquare = (q: THREE.Vector2) => Math.abs(q.x - SQ.cx) < SQ.half && Math.abs(q.y - SQ.cy) < SQ.half;
const angleOfX = (x: number) => A0 + ((x - L) / (R - L)) * 360;
const angleOfY = (y: number) => A0 + ((y - B) / (T - B)) * 360;
/** On a spike material, a pair near one of its lines snaps onto it. */
function snapped(u: number, v: number): number {
  const targets = params.material === 'mirror' ? (above(u) ? [-u] : []) : params.material === 'glass' ? glassTargets(u).map(([t]) => t) : [];
  for (const t of targets) {
    const d = ((v - t + 540) % 360) - 180;
    if (Math.abs(d) < SNAP) return wrap(t);
  }
  return v;
}
let dragging = false;
function moveTo(q: THREE.Vector2): void {
  const u = Math.round(angleOfX(Math.max(L, Math.min(R - 1e-6, q.x))));
  const v = angleOfY(Math.max(B, Math.min(T - 1e-6, q.y)));
  params.in = u;
  params.out = Math.round(snapped(u, v) * 10) / 10;
  ui.params.controllers.forEach((c) => c.updateDisplay());
  update();
}
canvas.addEventListener('pointerdown', (e) => {
  const q = toWorld(e);
  if (!onSquare(q)) return;
  dragging = true;
  canvas.setPointerCapture(e.pointerId);
  moveTo(q);
});
canvas.addEventListener('pointermove', (e) => {
  const q = toWorld(e);
  canvas.style.cursor = onSquare(q) ? 'crosshair' : '';
  if (dragging) moveTo(q);
});
const release = () => (dragging = false);
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);

setMaterial();
ui.params.add(params, 'material', [...MATERIALS]).onChange(setMaterial);
ui.params.add(params, 'in', A0, A0 + 359, 1).onChange(update);
ui.params.add(params, 'out', A0, A0 + 359, 1).onChange(update);
stage.start();
