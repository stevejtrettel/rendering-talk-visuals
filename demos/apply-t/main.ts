/**
 * Applying T to a light field (Steve, 2026-11-04: "take a light field in the
 * room, and then apply T to it to see a new light field. It doesn't have to be
 * the realistic light field, but just a light field, say, if the room is
 * constantly bright in all directions").
 *
 * The beam room twice (src/beamscene.ts; no light traced). Left, L: the same
 * white light, 1 in each of R, G, B, along every ray in every direction. Right,
 * TL: what the room's materials (room-materials) do with it, one interaction.
 * Nothing changes in the air, so TL along a ray is TL leaving the surface the
 * ray came from, and with L the same from every direction:
 *
 *   wall     its albedo (f = albedo / 2 against cos over the directions above
 *            gives the albedo), seen from the front; 0 from the back
 *   mirror   0.95, untinted, either side (L from the mirror direction, 0.95 of it)
 *   housing  0
 *
 * The lamp's light is E, not T: the lamp's opening is dark in TL.
 *
 * Each room is filled with its light: at each place the average over all
 * directions of the light arriving there. The probe (follow the pointer, in
 * either room; both move together) shows the light field at one place: a ring,
 * each piece the colour of the light arriving from that direction. Walls are
 * drawn in the colour of the light leaving them, with a thin line of the
 * wall's own pigment outside.
 */

import * as THREE from 'three';
import { createStage, C } from '@';
import { polyline } from '@/lines';
import { label } from '@/text';
import { type Vec, type Seg, v, add, dot, segs, RED, GREEN, WHITE, MIRROR_R, ROOM_HALF, ROOM_R, HOUSING, toXYZ, spectrum } from '@/beamscene';

const ORTHO_H = 3;
const HALF_W = (ORTHO_H * 16) / 9;
const stage = createStage({ camera: 'ortho', position: [0, 0, 10], target: [0, 0, 0], orthoHeight: ORTHO_H, lights: false, controls: false });
stage.duration = 1;

// --- Figure spec -----------------------------------------------------------
const SCALE = 0.44;
const PANELS = [
  { x: -2.72, y: -0.25, name: 'L' },
  { x: 2.72, y: -0.25, name: 'TL' },
] as const;
const GW = 168; // the fill's cells across the room
const GH = Math.round((GW * ROOM_HALF.y) / ROOM_HALF.x);
const NDIR = 96; // directions averaged per cell
const RING = { r: 0.55, w: 0.32, n: 48 }; // the probe, in room units
const EXPOSE = 0.85; // displayed brightness of light 1

// --- RGB multipliers (as room-materials) ----------------------------------------------
type RGB = [number, number, number];
const lin = ([X, Y, Z]: [number, number, number]): RGB => [3.2406 * X - 1.5372 * Y - 0.4986 * Z, -0.9689 * X + 1.8758 * Y + 0.0415 * Z, 0.0557 * X - 0.204 * Y + 1.057 * Z];
const WHITE_RGB = lin(toXYZ(spectrum(() => 1)));
const rgbOf = (s: ArrayLike<number>): RGB => lin(toXYZ(s)).map((x, c) => Math.max(0, x / WHITE_RGB[c]!)) as RGB;
const ALB = new Map<Float64Array, RGB>([[RED, rgbOf(RED)], [GREEN, rgbOf(GREEN)], [WHITE, rgbOf(WHITE)]]);
const ONE: RGB = [1, 1, 1];
const ZERO: RGB = [0, 0, 0];

// --- The room for tracing: the wall bins merged into whole straight pieces (same answers, far fewer tests) ---
type Piece = { a: Vec; b: Vec; kind: Seg['kind']; n: Vec; alb: RGB };
const pieces: Piece[] = [];
for (const s of segs) {
  const last = pieces[pieces.length - 1];
  const alb = s.kind === 'diffuse' ? ALB.get(s.albedo!)! : ZERO;
  if (last && s.kind === 'diffuse' && last.kind === 'diffuse' && last.alb === alb && Math.abs(last.n.x - s.n.x) + Math.abs(last.n.y - s.n.y) < 1e-9 && Math.hypot(last.b.x - s.a.x, last.b.y - s.a.y) < 1e-9) last.b = s.b;
  else pieces.push({ a: s.a, b: s.b, kind: s.kind, n: s.n, alb });
}
function hit(o: Vec, d: Vec): Piece | null {
  let best: Piece | null = null;
  let bt = Infinity;
  for (const s of pieces) {
    const ex = s.b.x - s.a.x;
    const ey = s.b.y - s.a.y;
    const den = d.x * ey - d.y * ex;
    if (Math.abs(den) < 1e-12) continue;
    const rx = s.a.x - o.x;
    const ry = s.a.y - o.y;
    const t = (rx * ey - ry * ex) / den;
    const u = (rx * d.y - ry * d.x) / den;
    if (t > 1e-6 && u >= 0 && u <= 1 && t < bt) {
      bt = t;
      best = s;
    }
  }
  return best;
}
/** TL arriving at x from direction d (looking along d): the light leaving the piece there toward x. */
function tlAlong(x: Vec, d: Vec): RGB {
  const s = hit(x, d);
  if (!s) return ZERO;
  if (s.kind === 'mirror') return [MIRROR_R, MIRROR_R, MIRROR_R];
  if (s.kind === 'diffuse') return dot(d, s.n) < 0 ? s.alb : ZERO;
  return ZERO;
}
const lAlong = (): RGB => ONE;
/** Light leaving a wall piece (for drawing the wall): L is 1, TL the albedo. */
const leaving = (s: Piece, which: 'L' | 'TL'): RGB => (which === 'L' ? ONE : s.kind === 'diffuse' ? s.alb : ZERO);

// --- Drawing ---------------------------------------------------------------------------
const toSrgb = (x: number) => Math.round(255 * new THREE.Color(Math.min(1, x * EXPOSE), 0, 0).convertLinearToSRGB().r);
const hexOf = (rgb: RGB) => new THREE.Color().setRGB(...(rgb.map((x) => Math.min(1, x * EXPOSE)) as RGB), THREE.LinearSRGBColorSpace).getHex();
const inside = (p: Vec) => {
  const dx = Math.max(Math.abs(p.x) - (ROOM_HALF.x - ROOM_R), 0);
  const dy = Math.max(Math.abs(p.y) - (ROOM_HALF.y - ROOM_R), 0);
  return Math.hypot(dx, dy) < ROOM_R;
};
const dirs = Array.from({ length: NDIR }, (_, k) => v(Math.cos((2 * Math.PI * (k + 0.5)) / NDIR), Math.sin((2 * Math.PI * (k + 0.5)) / NDIR)));
function fillTexture(which: 'L' | 'TL'): THREE.DataTexture {
  const data = new Uint8Array(GW * GH * 4);
  for (let j = 0; j < GH; j++)
    for (let i = 0; i < GW; i++) {
      const x = v(-ROOM_HALF.x + ((i + 0.5) / GW) * 2 * ROOM_HALF.x, -ROOM_HALF.y + ((j + 0.5) / GH) * 2 * ROOM_HALF.y);
      const o = (j * GW + i) * 4;
      if (!inside(x)) continue;
      const sum = [0, 0, 0];
      for (const d of dirs) {
        const c = which === 'L' ? lAlong() : tlAlong(x, d);
        for (let ch = 0; ch < 3; ch++) sum[ch]! += c[ch]! / NDIR;
      }
      // The fill is dimmer than the walls and the probe, so they read over it.
      for (let ch = 0; ch < 3; ch++) data[o + ch] = toSrgb(0.45 * sum[ch]!);
      data[o + 3] = 255;
    }
  const tex = new THREE.DataTexture(data, GW, GH, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}
const P3 = (p: Vec, z = 0): [number, number, number] => [p.x, p.y, z];
const probes: { group: THREE.Group; arcs: ReturnType<typeof polyline>[]; which: 'L' | 'TL' }[] = [];
for (const panel of PANELS) {
  const which = panel.name;
  const room = new THREE.Group();
  room.position.set(panel.x, panel.y, 0);
  room.scale.setScalar(SCALE);
  stage.add(room);
  const fill = new THREE.Mesh(new THREE.PlaneGeometry(2 * ROOM_HALF.x, 2 * ROOM_HALF.y), new THREE.MeshBasicMaterial({ map: fillTexture(which), transparent: true }));
  fill.position.z = -0.1;
  room.add(fill);
  for (const s of pieces) {
    if (s.kind === 'diffuse') {
      room.add(polyline([P3(add(s.a, s.n, -0.1)), P3(add(s.b, s.n, -0.1))], { color: new THREE.Color(...s.alb).getHex(), width: 2.5 }));
      room.add(polyline([P3(add(s.a, s.n, 0.06), 0.01), P3(add(s.b, s.n, 0.06), 0.01)], { color: hexOf(leaving(s, which)), width: 6 }));
    } else room.add(polyline([P3(s.a, 0.01), P3(s.b, 0.01)], { color: s.kind === 'mirror' ? C.bone : C.slateDeep, width: 4 }));
  }
  room.add(polyline([P3(HOUSING[0]!, 0.01), P3(HOUSING[3]!, 0.01)], { color: C.slateDeep, width: 2, dashed: true, dashSize: 0.1, gapSize: 0.08 })); // the lamp's opening: E, not here
  // The probe.
  const group = new THREE.Group();
  const arcs = Array.from({ length: RING.n }, (_, k) => {
    const a0 = (2 * Math.PI * k) / RING.n;
    const a1 = (2 * Math.PI * (k + 1)) / RING.n;
    const pts = [0, 0.5, 1].map((t) => {
      const a = a0 + (a1 - a0) * t;
      return [RING.r * Math.cos(a), RING.r * Math.sin(a), 0.3] as [number, number, number];
    });
    const line = polyline(pts, { color: C.bone, width: 9 });
    group.add(line);
    return line;
  });
  const dot0 = new THREE.Mesh(new THREE.CircleGeometry(0.07, 20), new THREE.MeshBasicMaterial({ color: C.rust }));
  dot0.position.z = 0.35;
  group.add(dot0);
  room.add(group);
  probes.push({ group, arcs, which });
  const head = which === 'L' ? 'L' : 'TL';
  stage.add(label(head, { size: 0.32, color: C.bone, anchorX: 'center', anchorY: 'bottom', position: [panel.x, panel.y + ROOM_HALF.y * SCALE + 0.2, 0] }));
}
stage.add(label('T', { size: 0.3, color: 0x8fb5d6, anchorX: 'center', anchorY: 'bottom', position: [0, PANELS[0].y + 0.08, 0] }));
stage.add(polyline([[-0.22, PANELS[0].y, 0], [0.22, PANELS[0].y, 0]], { color: 0x8fb5d6, width: 3 }));
const arrowHead = new THREE.Mesh(
  (() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0.3, 0, 0, 0.16, 0.07, 0, 0.16, -0.07, 0], 3));
    return g;
  })(),
  new THREE.MeshBasicMaterial({ color: 0x8fb5d6 }),
);
arrowHead.position.set(0, PANELS[0].y, 0);
stage.add(arrowHead);

/** Move both probes to x (room units): each piece of the ring, the light arriving from that direction. */
function probe(x: Vec): void {
  for (const pr of probes) {
    pr.group.position.set(x.x, x.y, 0);
    pr.arcs.forEach((line, k) => {
      const a = (2 * Math.PI * (k + 0.5)) / RING.n;
      const c = pr.which === 'L' ? lAlong() : tlAlong(x, v(Math.cos(a), Math.sin(a)));
      (line.material as unknown as { color: THREE.Color }).color.setHex(hexOf(c));
    });
  }
}

const canvas = stage.renderer.domElement;
canvas.addEventListener('pointermove', (e) => {
  const r = canvas.getBoundingClientRect();
  const wx = (((e.clientX - r.left) / r.width) * 2 - 1) * HALF_W;
  const wy = -(((e.clientY - r.top) / r.height) * 2 - 1) * ORTHO_H;
  for (const panel of PANELS) {
    const x = v((wx - panel.x) / SCALE, (wy - panel.y) / SCALE);
    const margin = RING.r + 0.1;
    const inner = v(Math.sign(x.x) * Math.max(0, Math.abs(x.x) - margin), Math.sign(x.y) * Math.max(0, Math.abs(x.y) - margin));
    if (inside(x) && inside(inner)) {
      probe(x);
      break;
    }
  }
});
probe(v(2.4, -1.6)); // between the flat mirror and the green wall
stage.start();
