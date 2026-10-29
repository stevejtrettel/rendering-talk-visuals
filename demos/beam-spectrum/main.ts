/**
 * Along a ray, light carries a spectrum: the argument, in three steps (Steve,
 * 2026-10-29: the EM wave is some big combination; we decompose it into
 * frequencies to do the equilibrium-brightness argument; then we get the
 * spectrum along the ray).
 *
 * The scene of the slides before (wave-room ?scene=beam, wave-to-ray
 * ?frame=room), smaller, at the top left, in the ray limit; a ring marks a
 * point on the beam.
 *
 *   1. The field there. At the bottom left, the electric field at the ring
 *      against time: a jagged, noise-like signal, the sum of many frequencies
 *      at once (NM modes, amplitudes the square root of the spectrum, fixed
 *      random phases: what a broadband source looks like).
 *   2. Decompose it. It fans out into single frequencies, drawn as pure
 *      sinusoids in their own colours. These are REP representatives of a
 *      continuum (the signal is made of NM of them, not of these), so they are
 *      not drawn summing to it.
 *   3. Each frequency on its own. One at a time, the beam lights in that
 *      colour: the same rays for every wavelength (the mirrors treat them
 *      alike), which is the slide before, done once per frequency. Its
 *      brightness at the ring, the square of its amplitude, drops onto the
 *      graph as a bar at its wavelength.
 *   4. All of them. The rest fill in; brightnesses add across frequencies (the
 *      cross terms average away), so the bars become the spectrum, and the
 *      beam's colours sum to its colour.
 *
 * `lamp` switches between a 5800 K blackbody (sun: a smooth curve, a measure
 * with a density) and neon's emission lines (spikes, a measure with no density;
 * line positions real, heights approximate). For neon the representatives are
 * its strongest lines. The beam's colour is the spectrum through the CIE
 * observer (response.ts). The walls are black, as on the ray slide.
 *
 * Signal scale: optical frequencies are drawn slowed, a sinusoid of wavelength
 * λ completing CYCLES / λ cycles across the trace and drifting at a rate
 * proportional to its frequency. Only the ratios are real.
 */

import * as THREE from 'three';
import { createStage, createUI, C, flat } from '@';
import { polyline, setPolyline } from '@/lines';
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
stage.duration = 24;
const ui = createUI(stage);

/** The room, drawn at this scale and centre; the graph sits to its right. */
const ROOM_SCALE = 0.48;
const ROOM_AT = { x: -2.65, y: 1.4 };
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
  for (let k = 0; k <= 32; k++) ring.push(add(PROBE, fromAngle((360 * k) / 32), 0.3));
  line(ring, C.bone, 4);
}
const probeOnStage = v(ROOM_AT.x + PROBE.x * ROOM_SCALE, ROOM_AT.y + PROBE.y * ROOM_SCALE);

// --- Spectra ---------------------------------------------------------------------
const WL0 = 380;
const WL1 = 720;
const NS = 170;
const nmAt = (i: number) => WL0 + ((WL1 - WL0) * i) / NS;

function planck(nm: number, T: number): number {
  const l = nm * 1e-9;
  return 1 / (l ** 5 * (Math.exp(1.4388e-2 / (l * T)) - 1));
}
const PLANCK_PEAK = Math.max(...Array.from({ length: NS + 1 }, (_, i) => planck(nmAt(i), 5800)));
const sunAt = (nm: number) => planck(nm, 5800) / PLANCK_PEAK;
/** Neon's strong visible lines, nm, with approximate relative heights. */
const NEON: [number, number][] = [
  [585.2, 0.55], [588.2, 0.3], [594.5, 0.5], [597.6, 0.2], [603.0, 0.22], [607.4, 0.4],
  [609.6, 0.35], [614.3, 0.55], [616.4, 0.25], [621.7, 0.3], [626.6, 0.4], [633.4, 0.5],
  [638.3, 0.55], [640.2, 1.0], [650.7, 0.65], [659.9, 0.35], [667.8, 0.3], [671.7, 0.2],
  [692.9, 0.4], [703.2, 0.5],
];
type Lamp = 'sun' | 'neon';

/** The modes the signal is made of, and the representatives shown: [nm, brightness]. */
const NM = 60;
const REP = 5;
function modes(lamp: Lamp): [number, number][] {
  if (lamp === 'neon') return NEON;
  return Array.from({ length: NM }, (_, i) => {
    const nm = WL0 + 10 + ((WL1 - WL0 - 20) * i) / (NM - 1);
    return [nm, sunAt(nm)] as [number, number];
  });
}
function representatives(lamp: Lamp): [number, number][] {
  if (lamp === 'neon') return [...NEON].sort((a, b) => b[1] - a[1]).slice(0, REP).sort((a, b) => a[0] - b[0]);
  return [440, 490, 540, 600, 660].map((nm) => [nm, sunAt(nm)] as [number, number]);
}

/** A wavelength's colour, through the CIE observer, at full brightness. */
function nmColour(nm: number): number {
  const xyz = CMF.map((f) => f(nm));
  const m = Math.max(...xyz) || 1;
  return xyzToHex(xyz[0]! / m, xyz[1]! / m, xyz[2]! / m);
}
/** The colour of a set of [nm, brightness] lines, summed through the observer. */
function mixColour(lines: [number, number][]): number {
  const xyz = [0, 0, 0];
  for (const [nm, h] of lines) CMF.forEach((f, c) => (xyz[c]! += f(nm) * h));
  const m = Math.max(...xyz) || 1;
  return xyzToHex(xyz[0]! / m, xyz[1]! / m, xyz[2]! / m);
}
const fullMix = (lamp: Lamp): [number, number][] =>
  lamp === 'neon' ? NEON : Array.from({ length: NS + 1 }, (_, i) => [nmAt(i), sunAt(nmAt(i))] as [number, number]);

// --- The signal and its frequencies (bottom left) --------------------------------
const S = { x0: -5.0, x1: -0.35, top: -0.72, gap: 0.4, amp: 0.15, samples: 420 };
const CYCLES = 6000; // a sinusoid of wavelength nm completes CYCLES / nm cycles across the trace
const phaseOf = (k: number) => ((Math.imul(k + 7, 0x9e3779b1) >>> 0) / 4294967296) * 2 * Math.PI;
const wave = (nm: number, amp: number, ph: number, t: number) => (x: number) =>
  amp * Math.sin(2 * Math.PI * (CYCLES / nm) * x - 2 * Math.PI * (CYCLES / nm) * 0.12 * t + ph);
const traceLine = polyline(Array.from({ length: S.samples }, () => [0, 0, 0] as [number, number, number]), { color: C.bone, width: 3 });
const repLines = Array.from({ length: REP }, () =>
  polyline(Array.from({ length: S.samples }, () => [0, 0, 0] as [number, number, number]), { color: C.bone, width: 3, opacity: 0.999 }),
);
stage.add(traceLine, ...repLines);
stage.add(label('field at the ring', { size: 0.17, color: C.ash, anchorX: 'left', anchorY: 'bottom', position: [S.x0, S.top + 0.36, 0] }));
// A leader from the ring to the signal, so it is clear where the signal is taken.
stage.add(polyline([[probeOnStage.x, probeOnStage.y - 0.15, 0], [probeOnStage.x, S.top + 0.4, 0]], { color: C.slateDeep, width: 2 }));

// --- The graph (right) --------------------------------------------------------------
const G = { x0: 1.0, x1: 5.05, y0: -1.25, y1: 1.45 };
const gx = (nm: number) => G.x0 + ((nm - WL0) / (WL1 - WL0)) * (G.x1 - G.x0);
const gy = (h: number) => G.y0 + h * (G.y1 - G.y0);
stage.add(polyline([[G.x0, G.y0, 0], [G.x1, G.y0, 0]], { color: C.slateDeep, width: 2 }));
for (const nm of [400, 500, 600, 700]) {
  stage.add(polyline([[gx(nm), G.y0 - 0.08, 0], [gx(nm), G.y0, 0]], { color: C.slateDeep, width: 2 }));
  stage.add(label(String(nm), { size: 0.17, color: C.slate, anchorX: 'center', anchorY: 'top', position: [gx(nm), G.y0 - 0.3, 0] }));
}
{
  const strip = new THREE.Group();
  for (let i = 0; i < NS; i++) {
    const nm = nmAt(i + 0.5);
    const xyz = CMF.map((f) => f(nm));
    const w = gx(nmAt(i + 1)) - gx(nmAt(i));
    const fade = Math.min(1, (xyz[0]! + xyz[1]! + xyz[2]!) * 1.6); // dim toward the ends, where the eye barely sees
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.02, 0.1), flat(nmColour(nm), { transparent: true, opacity: fade }));
    mesh.position.set(gx(nm), G.y0 - 0.16, 0);
    strip.add(mesh);
  }
  stage.add(strip);
}
stage.add(label('Spectrum', { size: 0.2, color: C.ash, anchorX: 'center', anchorY: 'top', position: [(G.x0 + G.x1) / 2, G.y0 - 0.58, 0] }));

// Bars for the representatives, then the full spectrum (curve for sun, stems for neon).
const repBars = Array.from({ length: REP }, () => polyline([[0, 0, 0], [0, 0, 0]], { color: C.bone, width: 7 }));
stage.add(...repBars);
const curve = polyline(Array.from({ length: NS + 1 }, () => [0, 0, 0] as [number, number, number]), { color: C.bone, width: 4, opacity: 0.999 });
const fillGeom = new THREE.BufferGeometry();
fillGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array((NS + 1) * 6), 3));
fillGeom.setIndex(Array.from({ length: NS }, (_, i) => [2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2]).flat());
const fillMat = flat(C.bone, { transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false });
const fill = new THREE.Mesh(fillGeom, fillMat);
fill.position.z = -0.01;
const stems = NEON.map(() => polyline([[0, 0, 0], [0, 0, 0]], { color: C.bone, width: 3, opacity: 0.999 }));
stage.add(curve, fill, ...stems);

// --- Timeline ------------------------------------------------------------------------
const T = {
  signalIn: [0.3, 1.2],
  split: [3.0, 5.0], // the signal fans out into its frequencies
  each: 6.0, // first frequency's beam and bar
  step: 2.0, // per frequency
  fill: [6.0 + REP * 2.0 + 0.5, 6.0 + REP * 2.0 + 3.0], // the rest of the spectrum
};
const ramp = (t: number, [a, b]: number[]) => Math.min(1, Math.max(0, (t - a!) / (b! - a!)));
const smooth = (u: number) => u * u * (3 - 2 * u);
const setOpacity = (l: { material: THREE.Material }, o: number) => {
  (l.material as THREE.Material & { opacity: number }).opacity = o;
  (l as unknown as THREE.Object3D).visible = o > 0.005;
};

const params = { lamp: 'sun' as Lamp };
ui.params.add(params, 'lamp', ['sun', 'neon']);

stage.frame((t) => {
  const lamp = params.lamp;
  const all = modes(lamp);
  const reps = representatives(lamp);
  const peak = Math.max(...all.map(([, h]) => h));

  // 1. The signal: the sum of every mode, amplitude sqrt(brightness), fixed phases.
  const norm = 1 / Math.sqrt(all.reduce((a, [, h]) => a + h, 0));
  const split = smooth(ramp(t, T.split));
  const xs = Array.from({ length: S.samples }, (_, i) => i / (S.samples - 1));
  const sig = xs.map((x) => all.reduce((a, [nm, h], k) => a + wave(nm, Math.sqrt(h), phaseOf(k), t)(x), 0) * norm * 3.2);
  setPolyline(traceLine, xs.map((x, i) => [S.x0 + x * (S.x1 - S.x0), S.top + sig[i]! * S.amp * 1.4, 0] as [number, number, number]));
  setOpacity(traceLine as never, smooth(ramp(t, T.signalIn)));

  // 2. Its frequencies, fanning out below it.
  reps.forEach(([nm, h], r) => {
    const y = S.top - S.gap * (r + 1) * split;
    const amp = Math.sqrt(h / peak);
    setPolyline(repLines[r]!, xs.map((x) => [S.x0 + x * (S.x1 - S.x0), y + wave(nm, amp, phaseOf(r * 13 + 1), t)(x) * S.amp, 0] as [number, number, number]));
    (repLines[r]!.material as unknown as { color: THREE.Color }).color.setHex(nmColour(nm));
    // 3. Highlighted while its beam is lit.
    const on = ramp(t, [T.each + r * T.step, T.each + r * T.step + 0.3]);
    setOpacity(repLines[r] as never, split * (0.5 + 0.5 * (on > 0 && t < T.each + (r + 1) * T.step ? 1 : 0.4)));
  });

  // 3. One frequency at a time: the beam in its colour, its bar on the graph.
  const r = Math.floor((t - T.each) / T.step);
  const lit: [number, number][] = [];
  reps.forEach(([nm, h], k) => {
    const grow = smooth(ramp(t, [T.each + k * T.step + 0.4, T.each + k * T.step + 1.2]));
    setPolyline(repBars[k]!, [[gx(nm), G.y0, 0.02], [gx(nm), gy((h / peak) * grow), 0.02]]);
    (repBars[k]!.material as unknown as { color: THREE.Color }).color.setHex(nmColour(nm));
    repBars[k]!.visible = grow > 0;
    if (grow > 0) lit.push([nm, h]);
  });
  const fillIn = smooth(ramp(t, T.fill));
  let beam: number | null = null;
  if (fillIn > 0) beam = mixColour(fullMix(lamp));
  else if (r >= 0 && r < REP) beam = nmColour(reps[r]![0]);
  else if (r >= REP) beam = mixColour(lit);
  for (const l of rayLines) {
    (l.material as unknown as { color: THREE.Color }).color.setHex(beam ?? 0x666666);
    (l.material as unknown as { opacity: number }).opacity = beam === null ? 0.25 : 0.55;
  }

  // 4. The rest of the spectrum fills in, left to right.
  const edge = WL0 + (WL1 - WL0) * fillIn;
  const pos = fillGeom.attributes.position as THREE.BufferAttribute;
  const pts: [number, number, number][] = [];
  for (let i = 0; i <= NS; i++) {
    const nm = nmAt(i);
    const h = lamp === 'sun' && nm <= edge ? sunAt(nm) / peak : 0;
    pts.push([gx(nm), gy(h), 0]);
    pos.setXYZ(2 * i, gx(nm), gy(h), 0);
    pos.setXYZ(2 * i + 1, gx(nm), G.y0, 0);
  }
  pos.needsUpdate = true;
  setPolyline(curve, pts);
  curve.visible = fill.visible = lamp === 'sun' && fillIn > 0;
  NEON.forEach(([nm, h], k) => {
    stems[k]!.visible = lamp === 'neon' && fillIn > 0 && nm <= edge;
    setPolyline(stems[k]!, [[gx(nm), G.y0, 0], [gx(nm), gy(h / peak), 0]]);
  });
});

stage.start();
