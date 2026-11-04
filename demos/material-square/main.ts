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
 * `material` switches (and `&material=` in the URL).
 */

import * as THREE from 'three';
import { createStage, createUI, C } from '@';
import { polyline } from '@/lines';
import { label } from '@/text';

const ORTHO_H = 3;
const stage = createStage({ camera: 'ortho', position: [0, 0, 10], target: [0, 0, 0], orthoHeight: ORTHO_H, lights: false, controls: false });
stage.duration = 1;
const ui = createUI(stage);

// --- Figure spec -----------------------------------------------------------
const SQ = { cx: 0.3, cy: 0.2, half: 2.3 };
const MATERIALS = ['matte', 'glossy', 'mirror', 'glass', 'foggy glass', 'paper'] as const;
type Material = (typeof MATERIALS)[number];
const RHO = 0.8;
const MIRROR_RHO = 0.9;
const IOR = 1.5;
const GLOSS_SIGMA = 9; // degrees
const FOG_SIGMA = 12;
const N = 720; // texels a side, half a degree each
const LINE_R = 1.6; // a spike's line, half-width in texels
const tone = (x: number) => 1 - Math.exp(-x / 1.6);
const startMaterial = new URLSearchParams(location.search).get('material')?.replace(/[+_-]/g, ' ');
const params = { material: (MATERIALS as readonly string[]).includes(startMaterial ?? '') ? (startMaterial as Material) : 'matte' };

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

fill(params.material);
ui.params.add(params, 'material', [...MATERIALS]).onChange(() => fill(params.material));
stage.start();
