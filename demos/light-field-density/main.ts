/**
 * The real density.
 *
 * The room unfolds into its charts (exactly `light-field-unfold`), at 8
 * texels per unit, coarse on purpose so a texel can be seen. The light-field
 * repo's actual bake of this room (its `room` scene, the same geometry) is at
 * 64 texels per unit, eight times finer each way. So every cell splits, in
 * steps of two (8 → 16 → 32 → 64 texels per unit), until the grid is too fine
 * to see and the net is the stored field as it really is (Steve, 2026-10-30:
 * "a final animation from what we have to the true density"). Then it steps
 * back to the coarse net: the actual grids are fine, but the talk works from
 * a low-res example after (Steve). One slide for the surfaces.
 *
 * Every level is real data: the full-density bake, averaged down to that
 * level's grid. The last level is the bake itself, one value per texel (the
 * walls are matte, so a texel's light is the same in every direction; the
 * glossy sphere's tile is averaged to one value for the picture). The file is
 * `src/assets/lightfield/room-3dbe68db.*`, exported from the light-field repo's
 * `public/data/3dbe68db.lightfield`.
 */

import * as THREE from 'three';
import { createStage, createUI } from '@';
import { createUnwrap, frameBox, lerpShot, ramp, smootherstep, type Shot } from '@/lightfield/unwrap';
import { label, setText } from '@/text';
import fineJson from '@/assets/lightfield/room-3dbe68db.json?url';
import fineBin from '@/assets/lightfield/room-3dbe68db.bin?url';

const stage = createStage({ controls: false, lights: false });
stage.duration = 22; // the build takes 18 s; the rest holds the coarse net
createUI(stage);

const u = await createUnwrap(stage);
const camera = stage.camera as THREE.PerspectiveCamera;

// The unfold, exactly as `light-field-unfold` does it: the room, then the net.
const PEEL_AT = 1.6;
const PEEL = 6.0;
const FRONT = new THREE.Vector3(0.12, 0.42, 1);
const SHOTS: { at: number; shot: Shot }[] = [
  { at: 0.0, shot: frameBox(camera, u.boxes.close, FRONT, 1.0) },
  { at: 0.28, shot: frameBox(camera, u.boxes.room, FRONT, 1.0) },
  { at: 1.0, shot: frameBox(camera, u.boxes.net, new THREE.Vector3(0, 1.0, 0.72), 1.06) },
];

// --- The full-density bake ------------------------------------------------------------------
interface FineChart { w: number; h: number; offset: number }
const [meta, bin] = await Promise.all([fetch(fineJson).then((r) => r.json()), fetch(fineBin).then((r) => r.arrayBuffer())]);
const fine = new Float32Array(bin);
const fineCharts: FineChart[] = meta.charts;
const mats = u.charts.map((_, i) => u.chartMaterial(i));
/** The coarse net as the unfold draws it, to come back to at the end. */
const originals = mats.map((m) => (m ? { tex: m.uniforms.map.value as THREE.Texture, cells: (m.uniforms.cells.value as THREE.Vector2).clone(), border: m.uniforms.border.value as number } : null));

/** Chart i's fine data averaged onto a W × H grid, as an RGBA float texture. */
function level(i: number, W: number, H: number): THREE.DataTexture {
  const c = fineCharts[i]!;
  const out = new Float32Array(W * H * 4);
  const n = new Float32Array(W * H);
  for (let y = 0; y < c.h; y++)
    for (let x = 0; x < c.w; x++) {
      const X = Math.min(W - 1, Math.floor(((x + 0.5) * W) / c.w));
      const Y = Math.min(H - 1, Math.floor(((y + 0.5) * H) / c.h));
      const q = (c.offset + y * c.w + x) * 3;
      const o = Y * W + X;
      out[o * 4] += fine[q]!;
      out[o * 4 + 1] += fine[q + 1]!;
      out[o * 4 + 2] += fine[q + 2]!;
      n[o]! += 1;
    }
  for (let o = 0; o < W * H; o++) {
    const k = Math.max(1, n[o]!);
    out[o * 4] /= k;
    out[o * 4 + 1] /= k;
    out[o * 4 + 2] /= k;
    out[o * 4 + 3] = 1;
  }
  const t = new THREE.DataTexture(out, W, H, THREE.RGBAFormat, THREE.FloatType);
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}

/**
 * One exposure for the whole net. The two bakes come out of different
 * exports (the coarse one's display value is a hemisphere mean of its
 * direction tiles, the fine one stores L(p) directly) and differ by a
 * constant factor, so the fine data is scaled once, globally, to the coarse
 * net's brightness: the split must not read as the lights dimming. One factor
 * for every chart, so nothing about the picture's relative brightness changes.
 */
{
  let coarse = 0;
  let fineSum = 0;
  mats.forEach((m, i) => {
    if (!m || u.charts[i]!.kind === 1) return;
    const d = (m.uniforms.map.value as THREE.DataTexture).image.data as Float32Array;
    for (let o = 0; o < d.length; o += 4) coarse += (d[o]! + d[o + 1]! + d[o + 2]!) / (d.length / 4);
    const c = fineCharts[i]!;
    let s = 0;
    for (let q = c.offset * 3; q < (c.offset + c.w * c.h) * 3; q++) s += fine[q]!;
    fineSum += s / (c.w * c.h);
  });
  const k = coarse / fineSum;
  for (let q = 0; q < fine.length; q++) fine[q]! *= k;
}

/** Four levels per chart: the coarse grid, ×2, ×4, and the bake itself. */
const LEVELS = 4;
const textures = u.charts.map((c, i) =>
  Array.from({ length: LEVELS }, (_, k) => {
    const f = fineCharts[i]!;
    if (k === LEVELS - 1) return { tex: level(i, f.w, f.h), w: f.w, h: f.h };
    const W = Math.round(f.w / 2 ** (LEVELS - 1 - k));
    const H = Math.round(f.h / 2 ** (LEVELS - 1 - k));
    return { tex: level(i, W, H), w: W, h: H };
  }),
);

// --- The count ---------------------------------------------------------------------------------
const PER_UNIT = [8, 16, 32, 64];
const totals = Array.from({ length: LEVELS }, (_, k) => textures.reduce((s, t) => s + t[k]!.w * t[k]!.h, 0));
const readout = label('', { size: 0.42, color: 0xe8e2d6, anchorX: 'left', anchorY: 'top' });
stage.add(readout);
function placeReadout(): void {
  // Pinned to the upper left of the frame, in front of the camera.
  const d = 6;
  const h = Math.tan(((camera.fov / 2) * Math.PI) / 180) * d;
  const w = h * camera.aspect;
  readout.position.set(-w * 0.9, h * 0.86, -d).applyMatrix4(camera.matrixWorld);
  readout.quaternion.copy(camera.quaternion);
  readout.scale.setScalar(d * 0.06);
}

// --- Timeline -----------------------------------------------------------------------------
// The room unfolds; then every cell splits, one level per STEP, down to the
// real bake; it holds there; then it steps back to the coarse net, which is
// the picture the rest of the talk works from.
const SPLIT_AT = PEEL_AT + PEEL + 0.8;
const STEP = 2.0;
const BACK_AT = SPLIT_AT + (LEVELS - 1) * STEP + 3.0;
const BORDER = [0.75, 0.45, -0.2, -1];
let shown = NaN;
// `?still=room` / `?still=net`: no animation, the real bake at full density
// with no grid, as the lit room or as the unfolded net (Steve, 2026-10-30:
// the scene slide, and "show the stored light field in the unrolled data").
const STILL = new URLSearchParams(location.search).get('still');

stage.frame((t) => {
  if (STILL) {
    const net = STILL === 'net';
    u.setPeel(net ? 1 : 0);
    lerpShot(stage, SHOTS[net ? 1 : 0]!.shot, SHOTS[net ? 2 : 1]!.shot, net ? 1 : 0);
    if (shown !== 99) {
      shown = 99;
      mats.forEach((m, i) => {
        if (!m) return;
        const L = textures[i]![LEVELS - 1]!;
        m.uniforms.map.value = L.tex;
        m.uniforms.cells.value.set(L.w, L.h);
        m.uniforms.border.value = -1;
      });
    }
    readout.visible = false;
    return;
  }
  const peel = smootherstep(ramp(t, PEEL_AT, PEEL));
  u.setPeel(peel);
  let s = 0;
  while (s < SHOTS.length - 2 && peel > SHOTS[s + 1]!.at) s++;
  const a = SHOTS[s]!;
  const b = SHOTS[s + 1]!;
  lerpShot(stage, a.shot, b.shot, smootherstep((peel - a.at) / (b.at - a.at)));

  // -1: the coarse net as the unfold drew it. 1..3: the splits.
  const k = t < SPLIT_AT || t >= BACK_AT ? -1 : Math.min(LEVELS - 1, Math.floor((t - SPLIT_AT) / STEP) + 1);
  if (k !== shown) {
    shown = k;
    mats.forEach((m, i) => {
      if (!m) return;
      if (k < 0) {
        const o = originals[i]!;
        m.uniforms.map.value = o.tex;
        m.uniforms.cells.value.copy(o.cells);
        m.uniforms.border.value = o.border;
      } else {
        const L = textures[i]![k]!;
        m.uniforms.map.value = L.tex;
        m.uniforms.cells.value.set(L.w, L.h);
        // The outlines thin as the texels shrink; at the bake's density a
        // texel is about a pixel, and they retire.
        m.uniforms.border.value = BORDER[k]!;
      }
    });
    const lvl = k < 0 ? 0 : k;
    setText(readout, `${PER_UNIT[lvl]} texels per unit  ·  ${totals[lvl]!.toLocaleString()} texels`);
  }
  readout.visible = peel >= 1;
  placeReadout();
});

stage.start();
