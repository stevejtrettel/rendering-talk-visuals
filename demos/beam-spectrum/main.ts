/**
 * Along a ray, light carries a spectrum.
 *
 * The scene of the two slides before (wave-room ?scene=beam, wave-to-ray
 * ?frame=room): the lamp in its housing, the flat mirror, the concave one, in
 * the same room, now in the ray limit: the beam is drawn as rays. At a point on
 * the beam (the ring), the graph at the right is the light arriving along that
 * ray, brightness against wavelength.
 *
 * Why that is the right object (Steve, 2026-10-29): the ray-optics argument
 * works for each Fourier mode separately, and brightness adds across modes,
 * since the cross terms between different frequencies average away. So along a
 * ray the light is "how much brightness at each wavelength": a positive measure
 * on wavelengths, the spectrum.
 *
 * `lamp` switches the source between:
 *
 *   sun   a 5800 K blackbody: a smooth curve, a measure with a density;
 *   neon  a neon lamp's emission lines: spikes, a measure with no density at
 *         all. Line positions are neon's strongest visible lines; relative
 *         heights are approximate. Each line is drawn as a stem whose height is
 *         its share of the light (an atom), not a density.
 *
 * The mirrors reflect every wavelength alike, so the spectrum is the same
 * everywhere along the beam, and the rays are the same for every wavelength.
 * The beam's colour on screen is the spectrum's colour through the CIE
 * observer (response.ts). As on the ray slide, the walls are black: the rays
 * stop there.
 */

import * as THREE from 'three';
import { createStage, createUI, C, flat } from '@';
import { polyline } from '@/lines';
import { label } from '@/text';
import { CMF, xyzToHex } from '@/response';

// --- Frame -----------------------------------------------------------------
const ORTHO_H = 3;
const stage = createStage({
  camera: 'ortho',
  position: [0, 0, 10],
  target: [0, 0, 0],
  orthoHeight: ORTHO_H,
  lights: false,
  controls: false,
});
stage.duration = 8;
const ui = createUI(stage);

/** The room, drawn at this scale and centre; the graph sits to its right. */
const ROOM_SCALE = 0.6;
const ROOM_AT = { x: -2.1, y: 0.15 };
const room = new THREE.Group();
room.scale.setScalar(ROOM_SCALE);
room.position.set(ROOM_AT.x, ROOM_AT.y, 0);
stage.add(room);

// --- Geometry: wave-to-ray's, at its coordinates ------------------------------
interface Vec {
  x: number;
  y: number;
}
const v = (x: number, y: number): Vec => ({ x, y });
const fromAngle = (deg: number): Vec => v(Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180));
const add = (a: Vec, b: Vec, s = 1): Vec => v(a.x + b.x * s, a.y + b.y * s);
const perp = (a: Vec): Vec => v(-a.y, a.x);
const unit = (a: Vec): Vec => {
  const m = Math.hypot(a.x, a.y) || 1;
  return v(a.x / m, a.y / m);
};

const SOURCE = { center: v(-4.55, 1.75), axis: fromAngle(-24), waist: 0.42 };
const ROOM_HALF = v(5.25, 2.88);
const ROOM_R = 0.55;
const FLAT = { mid: v(1.29, -0.85), dir: fromAngle(18), half: 1.15 };
const ARC = { c: v(-0.104, 0.135), r: 3.4, a0: (13 * Math.PI) / 180, a1: (47 * Math.PI) / 180 };

const inRoom = (pts: Vec[]) => pts.map((p) => [p.x, p.y, 0] as [number, number, number]);
const line = (pts: Vec[], color: number, width: number, opacity = 1) => {
  const l = polyline(inRoom(pts), { color, width, opacity });
  room.add(l);
  return l;
};

// The room, the mirrors and the housing, drawn as on the ray slide.
{
  const outline: Vec[] = [];
  const corners: [number, number, number][] = [
    [ROOM_HALF.x - ROOM_R, ROOM_HALF.y - ROOM_R, 0],
    [-(ROOM_HALF.x - ROOM_R), ROOM_HALF.y - ROOM_R, 90],
    [-(ROOM_HALF.x - ROOM_R), -(ROOM_HALF.y - ROOM_R), 180],
    [ROOM_HALF.x - ROOM_R, -(ROOM_HALF.y - ROOM_R), 270],
  ];
  for (const [cx, cy, a0] of corners) {
    for (let k = 0; k <= 8; k++) {
      const a = ((a0 + (90 * k) / 8) * Math.PI) / 180;
      outline.push(v(cx + ROOM_R * Math.cos(a), cy + ROOM_R * Math.sin(a)));
    }
  }
  outline.push(outline[0]!);
  line(outline, C.slate, 4);
  line([add(FLAT.mid, FLAT.dir, -FLAT.half), add(FLAT.mid, FLAT.dir, FLAT.half)], C.slate, 5);
  const arc: Vec[] = [];
  for (let k = 0; k <= 40; k++) {
    const a = ARC.a0 + ((ARC.a1 - ARC.a0) * k) / 40;
    arc.push(v(ARC.c.x + ARC.r * Math.cos(a), ARC.c.y + ARC.r * Math.sin(a)));
  }
  line(arc, C.slate, 5);
  const A = SOURCE.axis;
  const N = perp(A);
  const at = (x: number, y: number) => add(add(SOURCE.center, A, x), N, y);
  line([at(0.18, 0.95), at(-0.3, 0.95), at(-0.3, -0.95), at(0.18, -0.95)], C.slate, 5);
}

// --- The rays ------------------------------------------------------------------
/** Nearest mirror hit along o + t d: the flat one (0) or the arc (1), skipping `skip`. */
function hit(o: Vec, d: Vec, skip: number): { t: number; p: Vec; n: Vec; index: number } | null {
  let best: { t: number; p: Vec; n: Vec; index: number } | null = null;
  if (skip !== 0) {
    const a = add(FLAT.mid, FLAT.dir, -FLAT.half);
    const ex = FLAT.dir.x * 2 * FLAT.half;
    const ey = FLAT.dir.y * 2 * FLAT.half;
    const den = d.x * ey - d.y * ex;
    if (Math.abs(den) > 1e-12) {
      const rx = a.x - o.x;
      const ry = a.y - o.y;
      const t = (rx * ey - ry * ex) / den;
      const u = (rx * d.y - ry * d.x) / den;
      if (t > 1e-4 && u >= 0 && u <= 1) best = { t, p: add(o, d, t), n: perp(FLAT.dir), index: 0 };
    }
  }
  if (skip !== 1) {
    const ox = o.x - ARC.c.x;
    const oy = o.y - ARC.c.y;
    const b = ox * d.x + oy * d.y;
    const disc = b * b - (ox * ox + oy * oy - ARC.r * ARC.r);
    if (disc >= 0) {
      for (const t of [-b - Math.sqrt(disc), -b + Math.sqrt(disc)]) {
        if (t <= 1e-4 || (best && t >= best.t)) continue;
        const p = add(o, d, t);
        const ang = Math.atan2(p.y - ARC.c.y, p.x - ARC.c.x);
        if (ang < ARC.a0 || ang > ARC.a1) continue;
        const rad = unit(v(p.x - ARC.c.x, p.y - ARC.c.y));
        best = { t, p, n: v(-rad.x, -rad.y), index: 1 };
      }
    }
  }
  return best;
}

/** A ray from the lamp, through the mirrors, to the (black) wall. */
function trace(start: Vec): Vec[] {
  const pts = [start];
  let o = start;
  let d = SOURCE.axis;
  let skip = -1;
  for (let i = 0; i < 4; i++) {
    const h = hit(o, d, skip);
    if (!h) {
      const tx = d.x > 1e-9 ? (ROOM_HALF.x - o.x) / d.x : d.x < -1e-9 ? (-ROOM_HALF.x - o.x) / d.x : 1e9;
      const ty = d.y > 1e-9 ? (ROOM_HALF.y - o.y) / d.y : d.y < -1e-9 ? (-ROOM_HALF.y - o.y) / d.y : 1e9;
      pts.push(add(o, d, Math.max(0, Math.min(tx, ty))));
      break;
    }
    pts.push(h.p);
    const c = d.x * h.n.x + d.y * h.n.y;
    d = unit(v(d.x - 2 * c * h.n.x, d.y - 2 * c * h.n.y));
    o = h.p;
    skip = h.index;
  }
  return pts;
}

const RAYS = 21;
const SPREAD = 0.85; // of the waist, as wave-to-ray's overlay
const rayLines: ReturnType<typeof line>[] = [];
let central: Vec[] = [];
for (let i = 0; i < RAYS; i++) {
  const s = ((i / (RAYS - 1)) * 2 - 1) * SPREAD * SOURCE.waist;
  const path = trace(add(SOURCE.center, perp(SOURCE.axis), s));
  if (i === (RAYS - 1) / 2) central = path;
  rayLines.push(line(path, 0xffffff, 3, 0.5));
}

// The probe: halfway between the flat mirror and the arc, on the central ray.
const PROBE = add(central[1]!, v(central[2]!.x - central[1]!.x, central[2]!.y - central[1]!.y), 0.5);
{
  const ring: Vec[] = [];
  for (let k = 0; k <= 32; k++) ring.push(add(PROBE, fromAngle((360 * k) / 32), 0.22));
  line(ring, C.bone, 4);
}

// --- Spectra ---------------------------------------------------------------------
const WL0 = 380;
const WL1 = 720;
const NS = 170;
const nmAt = (i: number) => WL0 + ((WL1 - WL0) * i) / NS;

function planck(nm: number, T: number): number {
  const l = nm * 1e-9;
  return 1 / (l ** 5 * (Math.exp(1.4388e-2 / (l * T)) - 1));
}
const SUN = (() => {
  const vals = Array.from({ length: NS + 1 }, (_, i) => planck(nmAt(i), 5800));
  const m = Math.max(...vals);
  return vals.map((x) => x / m);
})();
/** Neon's strong visible lines, nm, with approximate relative heights. */
const NEON: [number, number][] = [
  [585.2, 0.55], [588.2, 0.3], [594.5, 0.5], [597.6, 0.2], [603.0, 0.22], [607.4, 0.4],
  [609.6, 0.35], [614.3, 0.55], [616.4, 0.25], [621.7, 0.3], [626.6, 0.4], [633.4, 0.5],
  [638.3, 0.55], [640.2, 1.0], [650.7, 0.65], [659.9, 0.35], [667.8, 0.3], [671.7, 0.2],
  [692.9, 0.4], [703.2, 0.5],
];

/** A spectrum's colour, through the CIE observer, at full brightness. */
function colourOf(lamp: 'sun' | 'neon'): number {
  const xyz = [0, 0, 0];
  if (lamp === 'sun') {
    for (let i = 0; i <= NS; i++) CMF.forEach((f, c) => (xyz[c]! += f(nmAt(i)) * SUN[i]!));
  } else {
    for (const [nm, h] of NEON) CMF.forEach((f, c) => (xyz[c]! += f(nm) * h));
  }
  const m = Math.max(...xyz);
  return xyzToHex(xyz[0]! / m, xyz[1]! / m, xyz[2]! / m);
}

// --- The graph -------------------------------------------------------------------
const G = { x0: 1.75, x1: 5.05, y0: -1.0, y1: 1.3 };
const gx = (nm: number) => G.x0 + ((nm - WL0) / (WL1 - WL0)) * (G.x1 - G.x0);
const gy = (h: number) => G.y0 + h * (G.y1 - G.y0);
stage.add(polyline([[G.x0, G.y0, 0], [G.x1, G.y0, 0]], { color: C.slateDeep, width: 2 }));
for (const nm of [400, 500, 600, 700]) {
  stage.add(polyline([[gx(nm), G.y0 - 0.08, 0], [gx(nm), G.y0, 0]], { color: C.slateDeep, width: 2 }));
  stage.add(label(String(nm), { size: 0.17, color: C.slate, anchorX: 'center', anchorY: 'top', position: [gx(nm), G.y0 - 0.3, 0] }));
}
// A strip of the spectral colours under the axis, so wavelength reads as colour.
{
  const strip = new THREE.Group();
  for (let i = 0; i < NS; i++) {
    const nm = nmAt(i + 0.5);
    const xyz = CMF.map((f) => f(nm));
    const m = Math.max(...xyz) || 1;
    const w = gx(nmAt(i + 1)) - gx(nmAt(i));
    const fade = Math.min(1, (xyz[0]! + xyz[1]! + xyz[2]!) * 1.6); // dim toward the ends, where the eye barely sees
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 1.02, 0.1),
      flat(xyzToHex(xyz[0]! / m, xyz[1]! / m, xyz[2]! / m), { transparent: true, opacity: fade }),
    );
    mesh.position.set(gx(nm), G.y0 - 0.16, 0);
    strip.add(mesh);
  }
  stage.add(strip);
}
stage.add(label('Spectrum', { size: 0.2, color: C.ash, anchorX: 'center', anchorY: 'top', position: [(G.x0 + G.x1) / 2, G.y0 - 0.58, 0] }));

// The curve (sun) and the stems (neon), in the graph's ink.
const sunGroup = new THREE.Group();
{
  const pts = SUN.map((h, i) => [gx(nmAt(i)), gy(h), 0] as [number, number, number]);
  sunGroup.add(polyline(pts, { color: C.bone, width: 4 }));
  const pos: number[] = [];
  const idx: number[] = [];
  SUN.forEach((h, i) => {
    pos.push(gx(nmAt(i)), gy(h), -0.01, gx(nmAt(i)), G.y0, -0.01);
    if (i < NS) idx.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  sunGroup.add(new THREE.Mesh(g, flat(C.bone, { transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false })));
}
const neonGroup = new THREE.Group();
for (const [nm, h] of NEON) {
  neonGroup.add(polyline([[gx(nm), G.y0, 0], [gx(nm), gy(h), 0]], { color: C.bone, width: 3 }));
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.045, 16), flat(C.bone));
  dot.position.set(gx(nm), gy(h), 0.01);
  neonGroup.add(dot);
}
stage.add(sunGroup, neonGroup);

// --- Controls --------------------------------------------------------------------
const params = { lamp: 'sun' as 'sun' | 'neon' };
function show(): void {
  sunGroup.visible = params.lamp === 'sun';
  neonGroup.visible = params.lamp === 'neon';
  const c = new THREE.Color(colourOf(params.lamp));
  for (const l of rayLines) (l.material as THREE.Material & { color: THREE.Color }).color.copy(c);
}
ui.params.add(params, 'lamp', ['sun', 'neon']).onChange(show);
show();

stage.start();
