/**
 * The eye records a spectrum as three numbers (Steve, 2026-11-04: "we could
 * have a spectrum, then arrows pointed at 3 response curves, then three bars?
 * And the equations below?"; pixel-response was too busy, "with the
 * multiplying and the integration").
 *
 * Left, a spectrum s(lambda). Arrows to the three cones' response curves (long,
 * medium, short), each one row; an arrow from each curve to its bar, the
 * number that cone reports: the spectrum integrated against its curve. The
 * equations go below, in the deck.
 *
 * The cone curves are the Hunt-Pointer-Estevez cone fundamentals: a fixed
 * linear change of the CIE x, y, z curves (src/response.ts), clipped at 0,
 * each drawn to peak 1. A bar is scaled so that a flat spectrum of height 1
 * gives 1 in each, so white light gives three equal bars. The spectra are the
 * beam room's (src/beamscene.ts): its lamp, and the lamp's light off each wall
 * (lamp times the wall's reflectance), drawn to peak 1.
 *
 * `spectrum` switches (also `&spectrum=` in the URL: lamp, red, green, white).
 */

import * as THREE from 'three';
import { createStage, createUI, C } from '@';
import { polyline, setPolyline } from '@/lines';
import { label, setText } from '@/text';
import { CMF } from '@/response';
import { SUN, RED, GREEN, WHITE, NS, WL0, WL1 } from '@/beamscene';

const ORTHO_H = 3;
const stage = createStage({ camera: 'ortho', position: [0, 0, 10], target: [0, 0, 0], orthoHeight: ORTHO_H, lights: false, controls: false });
stage.duration = 1;
const ui = createUI(stage);

// --- Figure spec -----------------------------------------------------------
const SPEC = { x0: -5.1, x1: -3.05, yb: -0.55, h: 1.6 }; // the spectrum's panel
const CURVE = { x0: -0.95, x1: 1.55, h: 0.72 };
const ROWS = [1.3, 0.2, -0.9]; // each row's baseline: long, medium, short
const BAR = { x0: 2.55, max: 2.2, h: 0.42 };
const M = 220; // samples across the band, for drawing and integrating
const SPECTRA = { lamp: 'lamp', red: 'off the red wall', green: 'off the green wall', white: 'off the white wall' } as const;
type Which = keyof typeof SPECTRA;
const start = new URLSearchParams(location.search).get('spectrum');
const params = { spectrum: (start && start in SPECTRA ? start : 'red') as Which };

// --- Curves on [WL0, WL1] ----------------------------------------------------
const nm = (k: number) => WL0 + ((WL1 - WL0) * k) / (M - 1);
/** A spectrum sampled on the room's grid, read at any wavelength (linear between samples). */
const at = (s: ArrayLike<number>, l: number) => {
  const t = ((l - WL0) / (WL1 - WL0)) * (NS - 1);
  const i = Math.max(0, Math.min(NS - 2, Math.floor(t)));
  return s[i]! + (s[i + 1]! - s[i]!) * (t - i);
};
const xyz = (l: number) => CMF.map((f) => f(l)) as [number, number, number];
const CONES = [
  { name: 'long', color: 0xd9654b, f: (l: number) => { const [X, Y, Z] = xyz(l); return Math.max(0, 0.38971 * X + 0.68898 * Y - 0.07868 * Z); } },
  { name: 'medium', color: 0x7cb565, f: (l: number) => { const [X, Y, Z] = xyz(l); return Math.max(0, -0.22981 * X + 1.1834 * Y + 0.04641 * Z); } },
  { name: 'short', color: 0x6d9fd4, f: (l: number) => xyz(l)[2] },
].map((c) => {
  const ys = Array.from({ length: M }, (_, k) => c.f(nm(k)));
  const peak = Math.max(...ys);
  const area = ys.reduce((a, b) => a + b, 0);
  return { ...c, ys: ys.map((y) => y / peak), area: area / peak };
});
function spectrumOf(w: Which): number[] {
  const ys = Array.from({ length: M }, (_, k) => at(SUN, nm(k)) * (w === 'lamp' ? 1 : at(w === 'red' ? RED : w === 'green' ? GREEN : WHITE, nm(k))));
  const peak = Math.max(...ys);
  return ys.map((y) => y / peak);
}

// --- Drawing ------------------------------------------------------------------------
const brighter = (hex: number) => hex;
function panel(x0: number, x1: number, yb: number, h: number, ys: number[], color: number) {
  const pts = ys.map((y, k) => [x0 + ((x1 - x0) * k) / (M - 1), yb + y * h, 0.1] as [number, number, number]);
  stage.add(polyline([[x0, yb, 0], [x1, yb, 0]], { color: C.slate, width: 1.5 }));
  const line = polyline(pts, { color, width: 3 });
  const shape = new THREE.Shape();
  shape.moveTo(x0, yb);
  pts.forEach(([x, y]) => shape.lineTo(x, y));
  shape.lineTo(x1, yb);
  const fill = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18 }));
  stage.add(fill, line);
  return { line, fill };
}
function arrow(from: [number, number], to: [number, number], color: number): void {
  const d = new THREE.Vector2(to[0] - from[0], to[1] - from[1]);
  const back = new THREE.Vector2(to[0], to[1]).sub(d.clone().setLength(0.16));
  stage.add(polyline([[from[0], from[1], 0], [back.x, back.y, 0]], { color, width: 2.5 }));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -0.2, 0.08, 0, -0.2, -0.08, 0], 3));
  const head = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color }));
  head.position.set(to[0], to[1], 0);
  head.rotation.z = Math.atan2(d.y, d.x);
  stage.add(head);
}

// The spectrum.
const spec = panel(SPEC.x0, SPEC.x1, SPEC.yb, SPEC.h, spectrumOf(params.spectrum), C.bone);
stage.add(label('spectrum', { size: 0.2, color: C.bone, anchorX: 'center', anchorY: 'bottom', position: [(SPEC.x0 + SPEC.x1) / 2, SPEC.yb + SPEC.h + 0.15, 0] }));
const specName = label('', { size: 0.16, color: C.ash, anchorX: 'center', anchorY: 'top', position: [(SPEC.x0 + SPEC.x1) / 2, SPEC.yb - 0.32, 0] });
stage.add(specName);
for (const l of [400, 700]) stage.add(label(`${l} nm`, { size: 0.12, color: C.slate, anchorX: 'center', anchorY: 'top', position: [SPEC.x0 + ((SPEC.x1 - SPEC.x0) * (l - WL0)) / (WL1 - WL0), SPEC.yb - 0.06, 0] }));

// The cones, one row each, and their bars.
const bars = CONES.map((c, r) => {
  const yb = ROWS[r]!;
  panel(CURVE.x0, CURVE.x1, yb, CURVE.h, c.ys, brighter(c.color));
  stage.add(label(c.name, { size: 0.17, color: brighter(c.color), anchorX: 'right', anchorY: 'middle', position: [CURVE.x0 - 0.12, yb + CURVE.h * 0.45, 0] }));
  arrow([SPEC.x1 + 0.15, SPEC.yb + SPEC.h * 0.5], [CURVE.x0 - 1.05, yb + CURVE.h * 0.45], C.slate);
  arrow([CURVE.x1 + 0.15, yb + CURVE.h * 0.45], [BAR.x0 - 0.12, yb + CURVE.h * 0.45], C.slate);
  const bar = new THREE.Mesh(new THREE.PlaneGeometry(1, BAR.h), new THREE.MeshBasicMaterial({ color: brighter(c.color) }));
  bar.position.set(BAR.x0, yb + CURVE.h * 0.45, 0);
  stage.add(bar);
  stage.add(polyline([[BAR.x0, yb + CURVE.h * 0.45 - 0.3, 0], [BAR.x0, yb + CURVE.h * 0.45 + 0.3, 0]], { color: C.slate, width: 1.5 }));
  const value = label('', { size: 0.17, color: C.bone, anchorX: 'left', anchorY: 'middle', position: [0, yb + CURVE.h * 0.45, 0] });
  stage.add(value);
  return { bar, value, c, y: yb + CURVE.h * 0.45 };
});

function show(): void {
  const ys = spectrumOf(params.spectrum);
  const pts = ys.map((y, k) => [SPEC.x0 + ((SPEC.x1 - SPEC.x0) * k) / (M - 1), SPEC.yb + y * SPEC.h, 0.1] as [number, number, number]);
  setPolyline(spec.line, pts);
  const shape = new THREE.Shape();
  shape.moveTo(SPEC.x0, SPEC.yb);
  pts.forEach(([x, y]) => shape.lineTo(x, y));
  shape.lineTo(SPEC.x1, SPEC.yb);
  spec.fill.geometry.dispose();
  spec.fill.geometry = new THREE.ShapeGeometry(shape);
  setText(specName, SPECTRA[params.spectrum]);
  for (const b of bars) {
    const v = ys.reduce((a, y, k) => a + y * b.c.ys[k]!, 0) / b.c.area; // a flat spectrum of height 1 gives 1
    const len = Math.max(1e-3, v * BAR.max);
    b.bar.scale.x = len;
    b.bar.position.x = BAR.x0 + len / 2;
    b.value.position.x = BAR.x0 + len + 0.1;
    setText(b.value, v.toFixed(2));
  }
}
show();
ui.params.add(params, 'spectrum', Object.keys(SPECTRA)).onChange(show);
stage.start();
