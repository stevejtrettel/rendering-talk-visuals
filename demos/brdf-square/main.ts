/**
 * The material is a function of two directions (Part III: the integrand is
 * light from one direction to another, and that is the material property;
 * Steve, 2026-11-03).
 *
 * In 2D a direction above the surface is an angle in (-90, 90) degrees from
 * the normal, so the material f(u -> v) is a function on a square: incoming
 * angle across, outgoing angle up, drawn as a heatmap (brighter is more
 * light sent from u to v). The same three materials as local-response:
 *
 *   matte   f = RHO / 2 everywhere: a flat square;
 *   glossy  a band about the anti-diagonal v = -u (the mirror direction),
 *           f proportional to cos(theta_u + theta_v)^GLOSS;
 *   mirror  only the anti-diagonal itself (all of u's light to -u): a line.
 *
 * Both breakdowns of local-response are slices of the square. Fix the
 * incoming direction (the ochre vertical line): f along it, over every v, is
 * where light from u goes, drawn as the fan at the top right. Fix the
 * outgoing direction (the blue horizontal line): f along it, over every u, is
 * where light leaving in v comes from, the fan at the bottom right. The
 * square is symmetric about its diagonal u = v (f(u -> v) = f(v -> u),
 * Helmholtz reciprocity): fixing a direction in, or the same direction out,
 * gives the same fan.
 *
 * Drag on the square to move both lines (the nearer one), or the `in` / `out`
 * sliders; `material` switches.
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
const SQ = { cx: -1.55, cy: -0.25, half: 1.85 };
const FAN = { x: 3.35, r: 1.15, yTop: 0.55, yBottom: -2.15 };
const RHO = 0.8;
const GLOSS = 24;
const N = 256; // the heatmap's texels a side
const NDIR = 33;
type Material = 'matte' | 'glossy' | 'mirror';
const startMaterial = new URLSearchParams(location.search).get('material');
const params = { material: (startMaterial === 'glossy' || startMaterial === 'mirror' ? startMaterial : 'matte') as Material, in: -40, out: 25 };

const rad = (d: number) => (d * Math.PI) / 180;
const GLOSS_K = (() => {
  let s = 0;
  for (let i = 0; i < 721; i++) {
    const b = -90 + (180 * (i + 0.5)) / 721;
    s += Math.max(0, Math.cos(rad(b))) ** GLOSS * Math.cos(rad(b)) * (Math.PI / 721);
  }
  return RHO / s;
})();
/** f(u -> v), angles in degrees; the mirror is drawn apart (its f is a line, not a function). */
const f = (a: number, b: number) => (params.material === 'matte' ? RHO / 2 : params.material === 'glossy' ? GLOSS_K * Math.max(0, Math.cos(rad(a + b))) ** GLOSS : 0);
/** Brightness on the square: one compressed scale for every material, so matte reads as a mid grey and the glossy band as bright. */
const tone = (x: number) => 1 - Math.exp(-x / 0.9);

// --- The square --------------------------------------------------------------------
const toX = (a: number) => SQ.cx + (a / 90) * SQ.half;
const toY = (b: number) => SQ.cy + (b / 90) * SQ.half;
const data = new Uint8Array(N * N * 4);
const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
tex.colorSpace = THREE.SRGBColorSpace;
tex.magFilter = THREE.LinearFilter;
const heat = new THREE.Mesh(new THREE.PlaneGeometry(2 * SQ.half, 2 * SQ.half), new THREE.MeshBasicMaterial({ map: tex }));
heat.position.set(SQ.cx, SQ.cy, 0);
stage.add(heat);
const frameSq = (h: number): [number, number, number][] => [
  [SQ.cx - h, SQ.cy - h, 0.02],
  [SQ.cx + h, SQ.cy - h, 0.02],
  [SQ.cx + h, SQ.cy + h, 0.02],
  [SQ.cx - h, SQ.cy + h, 0.02],
  [SQ.cx - h, SQ.cy - h, 0.02],
];
stage.add(polyline(frameSq(SQ.half), { color: C.slate, width: 2 }));
const mirrorLine = polyline([[toX(-90), toY(90), 0.03], [toX(90), toY(-90), 0.03]], { color: C.bone, width: 4 });
stage.add(mirrorLine);
// Axes: ticks and names.
for (const a of [-90, 0, 90]) {
  stage.add(label(String(a), { size: 0.15, color: C.slate, anchorX: 'center', anchorY: 'top', position: [toX(a), SQ.cy - SQ.half - 0.06, 0] }));
  stage.add(label(String(a), { size: 0.15, color: C.slate, anchorX: 'right', anchorY: 'middle', position: [SQ.cx - SQ.half - 0.08, toY(a), 0] }));
}
stage.add(label('incoming direction', { size: 0.2, color: C.ochre, anchorX: 'center', anchorY: 'top', position: [SQ.cx, SQ.cy - SQ.half - 0.3, 0] }));
const outName = label('outgoing direction', { size: 0.2, color: C.blue, anchorX: 'center', anchorY: 'bottom', position: [SQ.cx - SQ.half - 0.5, SQ.cy, 0] });
outName.rotation.z = Math.PI / 2;
stage.add(outName);

// The two slices.
const inLine = polyline([[0, 0, 0], [0, 0, 0]], { color: C.ochre, width: 3.5 });
const outLine = polyline([[0, 0, 0], [0, 0, 0]], { color: C.blue, width: 3.5 });
const meet = new THREE.Mesh(new THREE.CircleGeometry(0.07, 24), flat(C.bone));
stage.add(inLine, outLine, meet);

// --- The two fans --------------------------------------------------------------------
function arrowHead(color: number): THREE.Mesh {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -0.13, 0.055, 0, -0.13, -0.055, 0], 3));
  return new THREE.Mesh(g, flat(color));
}
interface Fan {
  cx: number;
  cy: number;
  arrows: { line: ReturnType<typeof polyline>; head: THREE.Mesh }[];
  given: { line: ReturnType<typeof polyline>; head: THREE.Mesh };
  outline: ReturnType<typeof polyline>;
}
function makeFan(cy: number, color: number, givenColor: number): Fan {
  const cx = FAN.x;
  stage.add(polyline([[cx - FAN.r - 0.2, cy, 0], [cx + FAN.r + 0.2, cy, 0]], { color: C.moss, width: 6 }));
  stage.add(polyline(Array.from({ length: 49 }, (_, k) => {
    const a = -90 + (180 * k) / 48;
    return [cx + FAN.r * Math.sin(rad(a)), cy + FAN.r * Math.cos(rad(a)), -0.1] as [number, number, number];
  }), { color: C.slateDeep, width: 1.5, dashed: true, dashSize: 0.05, gapSize: 0.05 }));
  const arrows = Array.from({ length: NDIR }, () => {
    const line = polyline([[0, 0, 0], [0, 0, 0]], { color, width: 2.5 });
    const head = arrowHead(color);
    stage.add(line, head);
    return { line, head };
  });
  const gl = polyline([[0, 0, 0], [0, 0, 0]], { color: givenColor, width: 5 });
  const gh = arrowHead(givenColor);
  stage.add(gl, gh);
  const outline = polyline(Array.from({ length: NDIR + 2 }, () => [0, 0, 0] as [number, number, number]), { color, width: 1.5, opacity: 0.5 });
  stage.add(outline);
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.05, 20), flat(C.bone));
  dot.position.set(cx, cy, 0.3);
  stage.add(dot);
  return { cx, cy, arrows, given: { line: gl, head: gh }, outline };
}
// Top: one direction in (ochre), where it goes (blue). Bottom: one direction out (blue), where it comes from (ochre).
const fanOut = makeFan(FAN.yTop, C.blue, C.ochre);
const fanIn = makeFan(FAN.yBottom, C.ochre, C.blue);

const angles = Array.from({ length: NDIR }, (_, i) => -88 + (176 * i) / (NDIR - 1));
const dirOf = (a: number) => new THREE.Vector2(Math.sin(rad(a)), Math.cos(rad(a)));
function placeArrow(fan: Fan, line: ReturnType<typeof polyline>, head: THREE.Mesh, a: number, len: number, inward: boolean): void {
  const shown = len > 0.015;
  line.visible = head.visible = shown;
  if (!shown) return;
  const d = dirOf(a);
  const L = Math.min(1, len) * FAN.r;
  const far = new THREE.Vector2(fan.cx + d.x * L, fan.cy + d.y * L);
  const near = new THREE.Vector2(fan.cx + d.x * 0.07, fan.cy + d.y * 0.07);
  const [from, to] = inward ? [far, near] : [near, far];
  setPolyline(line, [[from.x, from.y, 0.1], [to.x - (to.x - from.x) * 0.08, to.y - (to.y - from.y) * 0.08, 0.1]]);
  head.position.set(to.x, to.y, 0.12);
  head.rotation.z = Math.atan2(to.y - from.y, to.x - from.x);
}
/** A fan: the given direction, and lens over all the others (arrows inward if gathering). */
function setFan(fan: Fan, given: number, givenInward: boolean, lens: number[] | null, mirrorTo: number | null, inward: boolean): void {
  placeArrow(fan, fan.given.line, fan.given.head, given, 1, givenInward);
  fan.arrows.forEach(({ line, head }, k) => {
    if (lens) placeArrow(fan, line, head, angles[k]!, lens[k]!, inward);
    else if (k === 0 && mirrorTo !== null) placeArrow(fan, line, head, mirrorTo, 1, inward);
    else line.visible = head.visible = false;
  });
  fan.outline.visible = !!lens;
  if (lens)
    setPolyline(fan.outline, [
      [fan.cx, fan.cy, 0.05],
      ...angles.map((a, k) => {
        const d = dirOf(a);
        const L = Math.min(1, lens[k]!) * FAN.r;
        return [fan.cx + d.x * L, fan.cy + d.y * L, 0.05] as [number, number, number];
      }),
      [fan.cx, fan.cy, 0.05],
    ]);
}

// --- Draw ---------------------------------------------------------------------------
let shownMaterial = '';
function draw(): void {
  if (params.material !== shownMaterial) {
    shownMaterial = params.material;
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const a = -90 + (180 * (i + 0.5)) / N;
        const b = -90 + (180 * (j + 0.5)) / N;
        const g = Math.round(255 * tone(f(a, b)));
        const o = (j * N + i) * 4;
        data[o] = g;
        data[o + 1] = Math.round(g * 0.96);
        data[o + 2] = Math.round(g * 0.9);
        data[o + 3] = 255;
      }
    tex.needsUpdate = true;
    mirrorLine.visible = params.material === 'mirror';
  }
  const a0 = params.in;
  const b0 = params.out;
  setPolyline(inLine, [[toX(a0), toY(-90), 0.04], [toX(a0), toY(90), 0.04]]);
  setPolyline(outLine, [[toX(-90), toY(b0), 0.04], [toX(90), toY(b0), 0.04]]);
  meet.position.set(toX(a0), toY(b0), 0.05);
  const mirror = params.material === 'mirror';
  // Top fan: the incoming direction a0 given; where it goes, f(a0 -> v) over v (the vertical line).
  const row = angles.map((b) => f(a0, b));
  const rowMax = Math.max(...row, 1e-9);
  setFan(fanOut, a0, true, mirror ? null : row.map((x) => x / rowMax), mirror ? -a0 : null, false);
  // Bottom fan: the outgoing direction b0 given; where it comes from, f(u -> b0) over u (the horizontal line).
  const col = angles.map((a) => f(a, b0));
  const colMax = Math.max(...col, 1e-9);
  setFan(fanIn, b0, false, mirror ? null : col.map((x) => x / colMax), mirror ? -b0 : null, true);
}
draw();
ui.params.add(params, 'material', ['matte', 'glossy', 'mirror']).onChange(draw);
ui.params.add(params, 'in', -88, 88, 1).onChange(draw);
ui.params.add(params, 'out', -88, 88, 1).onChange(draw);

// --- Drag on the square ------------------------------------------------------------------
const canvas = stage.renderer.domElement;
const toWorld = (e: PointerEvent) => {
  const r = canvas.getBoundingClientRect();
  return new THREE.Vector2((((e.clientX - r.left) / r.width) * 2 - 1) * HALF_W, -(((e.clientY - r.top) / r.height) * 2 - 1) * ORTHO_H);
};
const onSquare = (p: THREE.Vector2) => Math.abs(p.x - SQ.cx) < SQ.half && Math.abs(p.y - SQ.cy) < SQ.half;
let grab: 'in' | 'out' | null = null;
canvas.addEventListener('pointerdown', (e) => {
  const p = toWorld(e);
  if (!onSquare(p)) return;
  grab = Math.abs(p.x - toX(params.in)) < Math.abs(p.y - toY(params.out)) ? 'in' : 'out';
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  const p = toWorld(e);
  canvas.style.cursor = onSquare(p) ? 'crosshair' : '';
  if (!grab) return;
  const clamp = (x: number) => Math.round(Math.max(-88, Math.min(88, x)));
  if (grab === 'in') params.in = clamp(((p.x - SQ.cx) / SQ.half) * 90);
  else params.out = clamp(((p.y - SQ.cy) / SQ.half) * 90);
  ui.params.controllers.forEach((c) => c.updateDisplay());
  draw();
});
const release = () => (grab = null);
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);

stage.start();
