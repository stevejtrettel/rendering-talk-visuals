/**
 * T stored in the 2D room (Steve, 2026-11-04: "write down our 2D scene with
 * mirrors and walls, and then have it so you can hover over each piece of the
 * boundary and see one of these data points, coloured in (red, green, blue, by
 * whatever the multiplier stored there is)").
 *
 * Left: the beam room (src/beamscene.ts, the Part II room; no light traced):
 * red left wall, green right wall, white floor and ceiling, the flat and the
 * curved mirror, the lamp's black housing. Hover over any piece of the
 * boundary: it is marked, with its normal (the side called "above").
 *
 * Right: the material stored at that point, f_p(u, v) on circle x circle
 * unwrapped to a square, as in material-square (incoming across, outgoing up,
 * each -90..270 degrees from the normal, above the surface one half), each
 * texel coloured by the RGB multiplier there, channel by channel: a wall's
 * square is painted its albedo (the share of each colour it sends back, spread
 * evenly over the directions, f = albedo / 2), a mirror's line its share; the
 * title prints the multiplier.
 *
 *   walls    matte, opaque, one-sided: f = albedo / 2 in and out above, the
 *            albedo the wall's reflectance spectrum taken to RGB (under
 *            equal-energy white, so the white wall is grey, untinted)
 *   mirrors  both sides reflect (as in the room's light tracing): the line
 *            v = -u above and its twin below, MIRROR_R of the light, untinted
 *   housing  black: f = 0 everywhere
 *
 * The lamp's opening is the light's source (E), not part of T; it is drawn but
 * not hoverable.
 */

import * as THREE from 'three';
import { createStage, C, flat } from '@';
import { polyline, setPolyline } from '@/lines';
import { label, setText } from '@/text';
import { type Vec, type Seg, v, add, sub, dot, perp, unit, segs, RED, GREEN, WHITE, MIRROR_R, FLAT, HOUSING, toXYZ, spectrum } from '@/beamscene';

const ORTHO_H = 3;
const HALF_W = (ORTHO_H * 16) / 9;
const stage = createStage({ camera: 'ortho', position: [0, 0, 10], target: [0, 0, 0], orthoHeight: ORTHO_H, lights: false, controls: false });
stage.duration = 1;

// --- Figure spec -----------------------------------------------------------
const ROOM_AT = { x: -2.45, y: -0.1, scale: 0.53 };
const SQ = { cx: 3.35, cy: -0.25, half: 1.6 };
const N = 360; // texels a side
const LINE_R = 1.3;
const HOVER = 0.35; // room units: how near a piece the pointer must be

// --- RGB multipliers -----------------------------------------------------------
/** A reflectance spectrum as an RGB multiplier: its colour under equal-energy white, linear sRGB, white = (1, 1, 1). */
const ONE = spectrum(() => 1);
const lin = ([X, Y, Z]: [number, number, number]): [number, number, number] => [
  3.2406 * X - 1.5372 * Y - 0.4986 * Z,
  -0.9689 * X + 1.8758 * Y + 0.0415 * Z,
  0.0557 * X - 0.204 * Y + 1.057 * Z,
];
const WHITE_RGB = lin(toXYZ(ONE));
const rgbOf = (s: ArrayLike<number>): [number, number, number] => lin(toXYZ(s)).map((x, c) => Math.max(0, x / WHITE_RGB[c]!)) as [number, number, number];
const MULT = new Map<Float64Array, [number, number, number]>([[RED, rgbOf(RED)], [GREEN, rgbOf(GREEN)], [WHITE, rgbOf(WHITE)]]);

// --- The pieces: each segment's name and material -----------------------------------
type Piece = { s: Seg; name: string; kind: 'matte' | 'mirror' | 'black'; rgb: [number, number, number]; n: Vec };
const pieces: Piece[] = segs.map((s) => {
  const mid = add(s.a, sub(s.b, s.a), 0.5);
  if (s.kind === 'diffuse') {
    const name = s.albedo === RED ? 'red wall' : s.albedo === GREEN ? 'green wall' : mid.y > 0 ? 'ceiling' : 'floor';
    return { s, name, kind: 'matte', rgb: MULT.get(s.albedo!)!, n: s.n };
  }
  if (s.kind === 'mirror') {
    const flatOne = Math.abs(dot(sub(mid, FLAT.mid), perp(FLAT.dir))) < 1e-6;
    return { s, name: flatOne ? 'flat mirror' : 'curved mirror', kind: 'mirror', rgb: [MIRROR_R, MIRROR_R, MIRROR_R], n: s.n };
  }
  // The housing: its normal facing out of the lamp.
  let n = perp(unit(sub(s.b, s.a)));
  const hc = HOUSING.reduce((acc, p) => add(acc, p, 0.25), v(0, 0));
  if (dot(n, sub(mid, hc)) < 0) n = v(-n.x, -n.y);
  return { s, name: 'lamp housing', kind: 'black', rgb: [0, 0, 0], n };
});

// --- The room ------------------------------------------------------------------------
const room = new THREE.Group();
room.position.set(ROOM_AT.x, ROOM_AT.y, 0);
room.scale.setScalar(ROOM_AT.scale);
stage.add(room);
const P3 = (p: Vec, z = 0): [number, number, number] => [p.x, p.y, z];
const hexOf = (rgb: [number, number, number]) => new THREE.Color(...rgb.map((x) => Math.min(1, x * 1.15))).getHex();
for (const pc of pieces) {
  const inset = (p: Vec) => (pc.kind === 'matte' ? add(p, pc.n, 0.05) : p);
  const color = pc.kind === 'matte' ? hexOf(pc.rgb) : pc.kind === 'mirror' ? C.bone : C.slateDeep;
  room.add(polyline([P3(inset(pc.s.a)), P3(inset(pc.s.b))], { color, width: pc.kind === 'matte' ? 7 : 5 }));
}
room.add(polyline([P3(HOUSING[0]!, 0.01), P3(HOUSING[3]!, 0.01)], { color: C.ochre, width: 5 })); // the lamp's opening
// The hovered point: a dot, its normal, the piece's name.
const pick = new THREE.Mesh(new THREE.CircleGeometry(0.13, 24), flat(C.rust));
const normal = polyline([[0, 0, 0], [0, 0, 0]], { color: C.rust, width: 3 });
const normalHead = (() => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -0.28, 0.12, 0, -0.28, -0.12, 0], 3));
  return new THREE.Mesh(g, flat(C.rust));
})();
room.add(pick, normal, normalHead);

// --- The square -----------------------------------------------------------------------
const data = new Uint8Array(N * N * 4);
const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
tex.colorSpace = THREE.SRGBColorSpace;
tex.magFilter = THREE.LinearFilter;
tex.minFilter = THREE.LinearFilter;
const heat = new THREE.Mesh(new THREE.PlaneGeometry(2 * SQ.half, 2 * SQ.half), new THREE.MeshBasicMaterial({ map: tex }));
heat.position.set(SQ.cx, SQ.cy, 0);
stage.add(heat);
const A0 = -90;
const angleAt = (i: number) => A0 + (360 * (i + 0.5)) / N;
const texelOf = (a: number) => ((((a - A0) % 360) + 360) % 360) / (360 / N) - 0.5;
const above = (a: number) => a > -90 && a < 90;
const L = SQ.cx - SQ.half;
const R = SQ.cx + SQ.half;
const B = SQ.cy - SQ.half;
const T = SQ.cy + SQ.half;
const toX = (a: number) => L + ((a - A0) / 360) * (R - L);
const toY = (a: number) => B + ((a - A0) / 360) * (T - B);
stage.add(polyline([[L, B, 0.02], [R, B, 0.02], [R, T, 0.02], [L, T, 0.02], [L, B, 0.02]], { color: C.slate, width: 2 }));
stage.add(polyline([[toX(90), B, 0.03], [toX(90), T, 0.03]], { color: C.slate, width: 1.5, dashed: true, dashSize: 0.06, gapSize: 0.06 }));
stage.add(polyline([[L, toY(90), 0.03], [R, toY(90), 0.03]], { color: C.slate, width: 1.5, dashed: true, dashSize: 0.06, gapSize: 0.06 }));
for (const a of [-90, 0, 90, 180, 270]) {
  stage.add(label(`${a}°`, { size: 0.12, color: C.slate, anchorX: 'center', anchorY: 'top', position: [toX(a), B - 0.05, 0] }));
  stage.add(label(`${a}°`, { size: 0.12, color: C.slate, anchorX: 'right', anchorY: 'middle', position: [L - 0.07, toY(a), 0] }));
}
for (const [a, name] of [[0, 'above'], [180, 'below']] as const) {
  stage.add(label(name, { size: 0.15, color: C.ash, anchorX: 'center', anchorY: 'top', position: [toX(a), B - 0.26, 0] }));
  const side = label(name, { size: 0.15, color: C.ash, anchorX: 'center', anchorY: 'bottom', position: [L - 0.48, toY(a), 0] });
  side.rotation.z = Math.PI / 2;
  stage.add(side);
}
stage.add(label('incoming direction', { size: 0.18, color: C.ochre, anchorX: 'center', anchorY: 'top', position: [SQ.cx, B - 0.52, 0] }));
const outName = label('outgoing direction', { size: 0.18, color: C.blue, anchorX: 'center', anchorY: 'bottom', position: [L - 0.75, SQ.cy, 0] });
outName.rotation.z = Math.PI / 2;
stage.add(outName);
const title = label('', { size: 0.24, color: C.bone, anchorX: 'center', anchorY: 'bottom', position: [SQ.cx, T + 0.42, 0] });
const sub2 = label('', { size: 0.17, color: C.ash, anchorX: 'center', anchorY: 'bottom', position: [SQ.cx, T + 0.12, 0] });
stage.add(title, sub2);

const value = new Float32Array(N * N * 3);
function fill(pc: Piece): void {
  value.fill(0);
  if (pc.kind === 'matte')
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++)
        if (above(angleAt(i)) && above(angleAt(j))) for (let c = 0; c < 3; c++) value[(j * N + i) * 3 + c] = pc.rgb[c]!;
  if (pc.kind === 'mirror') {
    // The line v = -u above, and its twin below (u = 180 + g goes to 180 - g): a spike, drawn at its share.
    const STEPS = 3000;
    for (const off of [0, 180])
      for (let k = 0; k <= STEPS; k++) {
        const g = -90 + (180 * k) / STEPS;
        const x = texelOf(off + g);
        const y = texelOf(off - g);
        for (let jj = Math.floor(y - LINE_R - 1); jj <= Math.ceil(y + LINE_R + 1); jj++)
          for (let ii = Math.floor(x - LINE_R - 1); ii <= Math.ceil(x + LINE_R + 1); ii++) {
            if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue;
            const w = Math.max(0, Math.min(1, LINE_R + 0.5 - Math.hypot(ii - x, jj - y)));
            for (let c = 0; c < 3; c++) value[(jj * N + ii) * 3 + c] = Math.max(value[(jj * N + ii) * 3 + c]!, pc.rgb[c]! * w);
          }
      }
  }
  for (let k = 0; k < N * N; k++) {
    for (let c = 0; c < 3; c++) data[k * 4 + c] = Math.round(255 * Math.min(1, value[k * 3 + c]!));
    data[k * 4 + 3] = 255;
  }
  tex.needsUpdate = true;
  const [r, g, b] = pc.rgb;
  setText(title, pc.name);
  setText(sub2, pc.kind === 'black' ? 'absorbs everything: (0, 0, 0)' : `RGB multiplier (${r.toFixed(2)}, ${g.toFixed(2)}, ${b.toFixed(2)})`);
}

// --- Hover --------------------------------------------------------------------------------
let current: Piece | null = null;
function show(pc: Piece, p: Vec): void {
  pick.position.set(p.x, p.y, 0.3);
  const tip = add(p, pc.n, 0.9);
  setPolyline(normal, [P3(p, 0.25), P3(add(p, pc.n, 0.7), 0.25)]);
  normalHead.position.set(tip.x, tip.y, 0.26);
  normalHead.rotation.z = Math.atan2(pc.n.y, pc.n.x);
  if (pc.name !== current?.name) fill(pc);
  current = pc;
}
const canvas = stage.renderer.domElement;
canvas.addEventListener('pointermove', (e) => {
  const r = canvas.getBoundingClientRect();
  const wx = (((e.clientX - r.left) / r.width) * 2 - 1) * HALF_W;
  const wy = -(((e.clientY - r.top) / r.height) * 2 - 1) * ORTHO_H;
  const q = v((wx - ROOM_AT.x) / ROOM_AT.scale, (wy - ROOM_AT.y) / ROOM_AT.scale);
  let best: { pc: Piece; d: number; p: Vec } | null = null;
  for (const pc of pieces) {
    const ab = sub(pc.s.b, pc.s.a);
    const t = Math.max(0, Math.min(1, dot(sub(q, pc.s.a), ab) / dot(ab, ab)));
    const p = add(pc.s.a, ab, t);
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (!best || d < best.d) best = { pc, d, p };
  }
  canvas.style.cursor = best && best.d < HOVER ? 'pointer' : '';
  if (best && best.d < HOVER) show(best.pc, best.p);
});

// Start on the red wall, halfway up.
{
  const start = pieces.filter((pc) => pc.name === 'red wall');
  const pc = start[Math.floor(start.length / 2)]!;
  show(pc, add(pc.s.a, sub(pc.s.b, pc.s.a), 0.5));
}
stage.start();
