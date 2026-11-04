/**
 * What T does at one point (Steve, 2026-11-03: T is local, so we can do it
 * point by point: light shines into p from all directions, then comes out in
 * all directions; and two ways to break it down: shooting light in one
 * direction scatters it in all sorts of other directions, or light leaving in
 * one direction comes from all other directions).
 *
 * A point p on the floor of the beam room, marked in the room at the top.
 * Below, p twice: at the left the light arriving at p, at the right the light
 * leaving it. Each is a polar plot over the directions above the floor: an
 * arrow per direction, its length the brightness, its colour the colour of
 * that light (brightness taken out of the colour, so dim light still shows its
 * hue), and a curve through the tips.
 *
 * The incoming light is the room's real light field at p (lightAlong, the same
 * reading the cameras do). The outgoing light is what the material does with
 * it, wavelength by wavelength, a grey material of reflectance RHO:
 *
 *     L_out(v) = \int f(u -> v) L_in(u) cos(theta_u) du,
 *
 * u over the incoming directions, theta_u its angle from the normal, f the
 * material (2D): matte f = RHO / 2, the same for every pair of directions;
 * glossy a lobe about the mirror direction, f proportional to
 * cos(theta_u + theta_v)^GLOSS (symmetric in u and v, so reciprocal); mirror
 * all of u's light to its mirror direction, RHO of it.
 *
 * `?mode=`:
 *   all  every direction in, every direction out (the default);
 *   in   one direction in (`angle`), and where it goes: the fan out is f(u -> v)
 *        over v, one row of the material;
 *   out  one direction out (`angle`), and where it comes from: the fan in is
 *        each incoming direction's contribution f(u -> v) L_in(u) cos theta_u,
 *        in that light's colour, and the outgoing arrow is their sum.
 * `material` (also `&material=` in the URL): matte, glossy, mirror. Drag an arrow's tip, or the `angle`
 * slider, to choose the direction (degrees from the normal; negative is to
 * the left).
 *
 * Lengths: a compressed scale, 1 - exp(-x / q) of the radius, q the 60th
 * percentile of the incoming brightnesses (one scale for in and out, so they
 * compare); the beam's one very bright direction would otherwise shrink every
 * other arrow to nothing. In `out` the contributions get their own q. In `in`
 * the fan is scaled to its largest value: it shows the shape of f, not an
 * amount of light.
 */

import * as THREE from 'three';
import { createStage, createUI, C, flat } from '@';
import { polyline, setPolyline } from '@/lines';
import { label } from '@/text';
import { xyzToHex } from '@/response';
import { type Vec, v, NS, toXYZ, ROOM_HALF, lightAlong, drawRoom } from '@/beamroom';

const ORTHO_H = 3;
const HALF_W = (ORTHO_H * 16) / 9;
const stage = createStage({ camera: 'ortho', position: [0, 0, 10], target: [0, 0, 0], orthoHeight: ORTHO_H, lights: false, controls: false });
stage.duration = 1;
const ui = createUI(stage);

// --- Figure spec -----------------------------------------------------------
const MODE = (() => {
  const m = new URLSearchParams(location.search).get('mode');
  return m === 'in' || m === 'out' ? m : 'all';
})();
const P_ROOM = v(1.6, -ROOM_HALF.y); // the point, on the room's floor
const ROOM = { at: v(0, 1.75), scale: 0.27 };
const DISC = { y: -1.95, r: 1.85, left: -2.55, right: 2.55 };
const NDIR = 33; // directions drawn, across the half-circle
const RHO = 0.8;
const GLOSS = 24;
type Material = 'matte' | 'glossy' | 'mirror';
const startMaterial = new URLSearchParams(location.search).get('material');
const params = {
  material: (startMaterial === 'glossy' || startMaterial === 'mirror' ? startMaterial : 'matte') as Material,
  angle: MODE === 'out' ? 25 : -40,
};

// --- The room, and p in it ---------------------------------------------------------
const room = new THREE.Group();
room.scale.setScalar(ROOM.scale);
room.position.set(ROOM.at.x, ROOM.at.y, 0);
stage.add(room);
drawRoom(room);
{
  const ring = Array.from({ length: 41 }, (_, k) => {
    const a = (2 * Math.PI * k) / 40;
    return [P_ROOM.x + 0.5 * Math.cos(a), P_ROOM.y + 0.5 * Math.sin(a), 0.2] as [number, number, number];
  });
  room.add(polyline(ring, { color: C.ochre, width: 3 }));
  const d = new THREE.Mesh(new THREE.CircleGeometry(0.16, 24), flat(C.ochre));
  d.position.set(P_ROOM.x, P_ROOM.y, 0.2);
  room.add(d);
}

// --- The light arriving at p, direction by direction ------------------------------------
const rad = (d: number) => (d * Math.PI) / 180;
/** The direction at angle a (degrees from the normal, up; negative to the left), pointing away from p. */
const dirOf = (a: number): Vec => v(Math.sin(rad(a)), Math.cos(rad(a)));
const angles = Array.from({ length: NDIR }, (_, i) => -88 + (176 * i) / (NDIR - 1));
const FINE = 361; // the integral's quadrature, over (-90, 90)
const fineAngles = Array.from({ length: FINE }, (_, i) => -90 + (180 * (i + 0.5)) / FINE);
/** L_in at p from direction a: the light at p travelling the opposite way. */
function incoming(a: number): Float64Array {
  const out = new Float64Array(NS);
  const d = dirOf(a);
  lightAlong(v(P_ROOM.x, P_ROOM.y + 1e-3), v(-d.x, -d.y), out, []);
  return out;
}
const fineIn = fineAngles.map(incoming);
const shownIn = angles.map(incoming);

// --- The material ---------------------------------------------------------------------
/** The glossy lobe's normalisation, so a lobe sends out RHO of what arrives head-on. */
const GLOSS_K = (() => {
  let s = 0;
  for (const b of fineAngles) s += Math.max(0, Math.cos(rad(b))) ** GLOSS * Math.cos(rad(b)) * (Math.PI / FINE);
  return RHO / s;
})();
/** f(u -> v) for directions at angles a (in) and b (out); the mirror is handled apart. */
function f(a: number, b: number): number {
  if (params.material === 'matte') return RHO / 2;
  return GLOSS_K * Math.max(0, Math.cos(rad(a + b))) ** GLOSS;
}
/** L_out in direction b: the integral over incoming directions, wavelength by wavelength. */
function outgoing(b: number): Float64Array {
  const out = new Float64Array(NS);
  if (params.material === 'mirror') {
    const L = incoming(-b);
    for (let n = 0; n < NS; n++) out[n] = RHO * L[n]!;
    return out;
  }
  fineAngles.forEach((a, i) => {
    const w = f(a, b) * Math.cos(rad(a)) * (Math.PI / FINE);
    const L = fineIn[i]!;
    for (let n = 0; n < NS; n++) out[n]! += w * L[n]!;
  });
  return out;
}

// --- Drawing ------------------------------------------------------------------------
const Yof = (s: Float64Array) => toXYZ(s)[1];
/** The colour of a spectrum with its brightness taken out (its brightest channel at 1). */
function hue(s: Float64Array): number {
  const [X, Y, Z] = toXYZ(s);
  if (Y <= 0) return C.slateDeep;
  const c = new THREE.Color(xyzToHex(X / Y, 1, Z / Y));
  const m = Math.max(c.r, c.g, c.b, 1e-6);
  return c.setRGB(c.r / m, c.g / m, c.b / m).getHex();
}

function arrowHead(color: number): THREE.Mesh {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -0.17, 0.07, 0, -0.17, -0.07, 0], 3));
  return new THREE.Mesh(g, flat(color));
}
interface Plot {
  centre: Vec;
  arrows: { line: ReturnType<typeof polyline>; head: THREE.Mesh }[];
  outline: ReturnType<typeof polyline>;
}
function makePlot(cx: number, name: string): Plot {
  const centre = v(cx, DISC.y);
  stage.add(polyline([[cx - DISC.r - 0.25, DISC.y, 0], [cx + DISC.r + 0.25, DISC.y, 0]], { color: C.moss, width: 7 }));
  stage.add(polyline(Array.from({ length: 49 }, (_, k) => {
    const a = -90 + (180 * k) / 48;
    return [cx + DISC.r * Math.sin(rad(a)), DISC.y + DISC.r * Math.cos(rad(a)), -0.1] as [number, number, number];
  }), { color: C.slateDeep, width: 1.5, dashed: true, dashSize: 0.06, gapSize: 0.06 }));
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.07, 24), flat(C.ochre));
  dot.position.set(cx, DISC.y, 0.3);
  stage.add(dot);
  stage.add(label(name, { size: 0.22, color: C.ash, anchorX: 'center', anchorY: 'top', position: [cx, DISC.y - 0.12, 0] }));
  const arrows = Array.from({ length: NDIR + 1 }, () => {
    const line = polyline([[0, 0, 0], [0, 0, 0]], { color: C.bone, width: 3 });
    const head = arrowHead(C.bone);
    stage.add(line, head);
    return { line, head };
  });
  const outline = polyline(Array.from({ length: NDIR + 2 }, () => [0, 0, 0] as [number, number, number]), { color: C.bone, width: 1.5, opacity: 0.5 });
  stage.add(outline);
  return { centre, arrows, outline };
}
const left = makePlot(DISC.left, 'in');
const right = makePlot(DISC.right, 'out');
stage.add(polyline([[-0.45, DISC.y + 0.9, 0], [0.35, DISC.y + 0.9, 0]], { color: C.bone, width: 3 }));
{
  const h = arrowHead(C.bone);
  h.position.set(0.45, DISC.y + 0.9, 0);
  stage.add(h);
}
stage.add(label('T at p', { size: 0.22, color: C.bone, anchorX: 'center', anchorY: 'bottom', position: [0, DISC.y + 1.05, 0] }));

/** Draw arrow k of a plot at angle a, length len (fraction of the radius), pointing in (toward p) or out. */
function setArrow(plot: Plot, k: number, a: number, len: number, color: number, inward: boolean, width = 3): void {
  const { line, head } = plot.arrows[k]!;
  const shown = len > 0.012;
  line.visible = head.visible = shown;
  if (!shown) return;
  const d = dirOf(a);
  const L = Math.min(1, len) * DISC.r;
  const far = v(plot.centre.x + d.x * L, plot.centre.y + d.y * L);
  const near = v(plot.centre.x + d.x * 0.1, plot.centre.y + d.y * 0.1);
  const [from, to] = inward ? [far, near] : [near, far];
  setPolyline(line, [[from.x, from.y, 0.1], [to.x - (to.x - from.x) * 0.06, to.y - (to.y - from.y) * 0.06, 0.1]]);
  (line.material as unknown as { color: THREE.Color; linewidth: number }).color.setHex(color);
  (line.material as unknown as { linewidth: number }).linewidth = width;
  head.position.set(to.x, to.y, 0.12);
  head.rotation.z = Math.atan2(to.y - from.y, to.x - from.x);
  (head.material as THREE.MeshBasicMaterial).color.setHex(color);
}
function setOutline(plot: Plot, lens: number[] | null): void {
  plot.outline.visible = !!lens;
  if (!lens) return;
  setPolyline(plot.outline, [
    [plot.centre.x, plot.centre.y, 0.05],
    ...angles.map((a, i) => {
      const d = dirOf(a);
      const L = Math.min(1, lens[i]!) * DISC.r;
      return [plot.centre.x + d.x * L, plot.centre.y + d.y * L, 0.05] as [number, number, number];
    }),
    [plot.centre.x, plot.centre.y, 0.05],
  ]);
}
const hideFrom = (plot: Plot, k: number) => plot.arrows.slice(k).forEach(({ line, head }) => (line.visible = head.visible = false));

// Lengths: a compressed scale, 1 - exp(-x / q), q the typical (60th
// percentile) value: the order of brightness is kept, and the beam's one
// very bright direction does not shrink every other arrow to nothing.
const quantile = (xs: number[], t: number) => {
  const ys = xs.filter((x) => x > 0).sort((a, b) => a - b);
  return ys.length ? ys[Math.floor(t * (ys.length - 1))]! : 1;
};
const tone = (x: number, q: number) => 1 - Math.exp(-x / q);
const Q_IN = quantile(shownIn.map(Yof), 0.6);
const snap = (a: number) => Math.max(-88, Math.min(88, a));

function draw(): void {
  const mirror = params.material === 'mirror';
  if (MODE === 'all') {
    const inLens = shownIn.map((s) => tone(Yof(s), Q_IN));
    angles.forEach((a, k) => setArrow(left, k, a, inLens[k]!, hue(shownIn[k]!), true));
    const outs = angles.map((b) => outgoing(b));
    const outLens = outs.map((s) => tone(Yof(s), Q_IN));
    angles.forEach((b, k) => setArrow(right, k, b, outLens[k]!, hue(outs[k]!), false));
    hideFrom(left, NDIR);
    hideFrom(right, NDIR);
    setOutline(left, inLens);
    setOutline(right, outLens);
    return;
  }
  const a0 = snap(params.angle);
  if (MODE === 'in') {
    // One direction in; the fan out is f(u -> v), one row of the material.
    setArrow(left, 0, a0, 1, C.bone, true, 5);
    hideFrom(left, 1);
    setOutline(left, null);
    if (mirror) {
      setArrow(right, 0, -a0, 1, C.bone, false, 5);
      hideFrom(right, 1);
      setOutline(right, null);
      return;
    }
    const row = angles.map((b) => f(a0, b));
    const m = Math.max(...row);
    const lens = row.map((x) => x / m);
    angles.forEach((b, k) => setArrow(right, k, b, lens[k]!, C.bone, false));
    hideFrom(right, NDIR);
    setOutline(right, lens);
    return;
  }
  // One direction out; the fan in is each incoming direction's contribution to it.
  const total = outgoing(a0);
  setArrow(right, 0, a0, Math.max(0.15, tone(Yof(total), Q_IN)), hue(total), false, 5);
  hideFrom(right, 1);
  setOutline(right, null);
  if (mirror) {
    const k = angles.reduce((best, a, i) => (Math.abs(a + a0) < Math.abs(angles[best]! + a0) ? i : best), 0);
    setArrow(left, 0, -a0, tone(Yof(shownIn[k]!), Q_IN), hue(shownIn[k]!), true, 4);
    hideFrom(left, 1);
    setOutline(left, null);
    return;
  }
  const contrib = angles.map((a, k) => f(a, a0) * Math.cos(rad(a)) * Yof(shownIn[k]!));
  const q = quantile(contrib, 0.6);
  const lens = contrib.map((x) => tone(x, q));
  angles.forEach((a, k) => setArrow(left, k, a, lens[k]!, hue(shownIn[k]!), true));
  hideFrom(left, NDIR);
  setOutline(left, lens);
}

draw();
ui.params.add(params, 'material', ['matte', 'glossy', 'mirror']).onChange(draw);
if (MODE !== 'all') ui.params.add(params, 'angle', -88, 88, 1).onChange(draw);

// --- Drag the chosen direction ----------------------------------------------------------
const canvas = stage.renderer.domElement;
const toWorld = (e: PointerEvent) => {
  const r = canvas.getBoundingClientRect();
  return v((((e.clientX - r.left) / r.width) * 2 - 1) * HALF_W, -(((e.clientY - r.top) / r.height) * 2 - 1) * ORTHO_H);
};
let grab = false;
const plotOf = () => (MODE === 'in' ? left : right);
const near = (p: Vec) => {
  const c = plotOf().centre;
  const r = Math.hypot(p.x - c.x, p.y - c.y);
  return MODE !== 'all' && p.y > c.y && r > 0.3 && r < DISC.r + 0.4;
};
canvas.addEventListener('pointerdown', (e) => {
  grab = near(toWorld(e));
  if (grab) canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  const p = toWorld(e);
  if (!grab) {
    canvas.style.cursor = near(p) ? 'grab' : '';
    return;
  }
  const c = plotOf().centre;
  params.angle = Math.round(snap((Math.atan2(p.x - c.x, p.y - c.y) * 180) / Math.PI));
  ui.params.controllers.forEach((cc) => cc.updateDisplay());
  draw();
});
const release = () => (grab = false);
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);

stage.start();
