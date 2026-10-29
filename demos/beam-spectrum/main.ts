/**
 * Along a ray, light carries a spectrum (Steve, 2026-10-29: the time-dependent
 * wave, then its Fourier decomposition into waves below it, drawing the
 * spectrum sideways next to them as it goes; then slide a bar along the
 * spectrum and change the colour and brightness of the rays with it).
 *
 * Left: at the top, the electric field at the ring (a point on the beam)
 * against time. Below it, its decomposition: one sinusoid per wavelength, in
 * that wavelength's colour, stacked by wavelength (380 nm at the top, 720 at
 * the bottom), appearing one after another down the stack. The signal is
 * exactly the sum of the rows drawn; the amplitudes are the square roots of
 * the spectrum, the phases fixed and random (what a broadband lamp gives).
 * Beside the stack, sharing its wavelength axis, the spectrum is drawn
 * sideways as the rows appear: each row's brightness, its amplitude squared.
 *
 * Right: the scene of the slides before (wave-room ?scene=beam, wave-to-ray
 * ?frame=room) in the ray limit. Once the decomposition is done, a bar slides
 * down the spectrum, and the rays take the colour of the wavelength under it,
 * at its brightness: one frequency's steady state at a time, the same rays for
 * every wavelength (the mirrors treat them alike). The `wavelength` slider
 * moves the bar by hand.
 *
 * `lamp`: a 5800 K blackbody (sun: a smooth curve, a measure with a density),
 * or neon's emission lines (spikes, a measure with no density; line positions
 * real, heights approximate). Under neon the rays go dark between the lines.
 *
 * Scales: optical frequencies are drawn slowed, a sinusoid of wavelength λ
 * completing CYCLES / λ cycles across its row and drifting at a rate
 * proportional to its frequency; only the ratios are real. The signal is drawn
 * at a fixed scale per lamp, for the whole timeline. Colours through the CIE
 * observer (response.ts). Walls black, as on the ray slide.
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
const ROOM_SCALE = 0.5;
const ROOM_AT = { x: 2.62, y: 0.6 };
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
/** The disc every slide of this run carries (see wave-to-ray, DISC). */
const DISC = { c: v(-2.3, 2.42), r: 0.3 };
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
  line(Array.from({ length: 41 }, (_, k) => add(DISC.c, fromAngle((360 * k) / 40), DISC.r)), C.slate, 5);
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
    // The disc (see wave-to-ray, DISC): rays that reach it stop there.
    const ox = o.x - DISC.c.x;
    const oy = o.y - DISC.c.y;
    const b = ox * d.x + oy * d.y;
    const dd = b * b - (ox * ox + oy * oy - DISC.r * DISC.r);
    const tc = dd >= 0 ? -b - Math.sqrt(dd) : -1;
    if (tc > 1e-4 && (!h || tc < h.t)) {
      pts.push(add(o, d, tc));
      break;
    }
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
const PROBE = add(central[1]!, v(central[2]!.x - central[1]!.x, central[2]!.y - central[1]!.y), 0.5);
{
  const ring: Vec[] = [];
  for (let k = 0; k <= 32; k++) ring.push(add(PROBE, fromAngle((360 * k) / 32), 0.3));
  line(ring, C.bone, 4);
}

// --- Spectra ---------------------------------------------------------------------
const WL0 = 380;
const WL1 = 720;
function planck(nm: number, T: number): number {
  const l = nm * 1e-9;
  return 1 / (l ** 5 * (Math.exp(1.4388e-2 / (l * T)) - 1));
}
const PLANCK_PEAK = (() => {
  let m = 0;
  for (let nm = WL0; nm <= WL1; nm += 1) m = Math.max(m, planck(nm, 5800));
  return m;
})();
const sunAt = (nm: number) => planck(nm, 5800) / PLANCK_PEAK;
/** Neon's strong visible lines, nm, with approximate relative heights. */
const NEON: [number, number][] = [
  [585.2, 0.55], [588.2, 0.3], [594.5, 0.5], [597.6, 0.2], [603.0, 0.22], [607.4, 0.4],
  [609.6, 0.35], [614.3, 0.55], [616.4, 0.25], [621.7, 0.3], [626.6, 0.4], [633.4, 0.5],
  [638.3, 0.55], [640.2, 1.0], [650.7, 0.65], [659.9, 0.35], [667.8, 0.3], [671.7, 0.2],
  [692.9, 0.4], [703.2, 0.5],
];
type Lamp = 'sun' | 'neon';
const ROWS = 30;
/** The rows of the decomposition: [nm, brightness]. */
const rowsOf = (lamp: Lamp): [number, number][] =>
  lamp === 'neon'
    ? NEON
    : Array.from({ length: ROWS }, (_, i) => {
        const nm = WL0 + 6 + ((WL1 - WL0 - 12) * i) / (ROWS - 1);
        return [nm, sunAt(nm)] as [number, number];
      });
/** Brightness at a wavelength, for the rays: the curve (sun) or the nearest line within a nanometre (neon). */
const brightnessAt = (lamp: Lamp, nm: number) =>
  lamp === 'sun' ? sunAt(nm) : NEON.reduce((m, [l, h]) => (Math.abs(l - nm) < 1.2 ? Math.max(m, h) : m), 0);

function nmColour(nm: number): number {
  // Clamped: the analytic CIE fit's tails are poor past ~680 nm, where its x
  // and y fall off together and deep red would come out yellow.
  nm = Math.min(Math.max(nm, 400), 670);
  const xyz = CMF.map((f) => f(nm));
  const m = Math.max(...xyz) || 1;
  return xyzToHex(xyz[0]! / m, xyz[1]! / m, xyz[2]! / m);
}

// --- Left: the signal, its rows, and the spectrum sideways ---------------------
const L = { x0: -5.05, x1: -1.95, sigY: 2.35, top: 1.75, bottom: -2.55, rowAmp: 0.055, samples: 360 };
const SPEC = { x0: -1.45, x1: -0.3 }; // brightness 0 .. 1, sideways
const yOf = (nm: number) => L.top + ((nm - WL0) / (WL1 - WL0)) * (L.bottom - L.top);
const CYCLES = 4000;
// A real mixing hash. A golden-ratio step gave phases nearly linear in k, and
// with frequencies nearly linear in k too the sum re-phased into a tall pulse
// partway through: the signal grew for no reason (Steve, 2026-10-29).
const phaseOf = (k: number) => {
  let h = Math.imul(k + 0x2c1b3c6d, 0x297a2d39);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return ((h >>> 0) / 4294967296) * 2 * Math.PI;
};
const sinusoid = (nm: number, amp: number, ph: number, t: number, x: number) =>
  amp * Math.sin(2 * Math.PI * (CYCLES / nm) * (x - 0.1 * t) + ph);
const xs = Array.from({ length: L.samples }, (_, i) => i / (L.samples - 1));
const X = (x: number) => L.x0 + x * (L.x1 - L.x0);

const signal = polyline(Array.from({ length: L.samples }, () => [0, 0, 0] as [number, number, number]), { color: C.bone, width: 3 });
stage.add(signal);
stage.add(label('field at the ring', { size: 0.17, color: C.ash, anchorX: 'left', anchorY: 'bottom', position: [L.x0, L.sigY + 0.32, 0] }));
const MAX_ROWS = Math.max(ROWS, NEON.length);
const rowLines = Array.from({ length: MAX_ROWS }, () =>
  polyline(Array.from({ length: L.samples }, () => [0, 0, 0] as [number, number, number]), { color: C.bone, width: 2, opacity: 0.999 }),
);
stage.add(...rowLines);

// The sideways spectrum: axis down the side, wavelength ticks, a curve or stems.
stage.add(polyline([[SPEC.x0, L.top, 0], [SPEC.x0, L.bottom, 0]], { color: C.slateDeep, width: 2 }));
for (const nm of [400, 500, 600, 700]) {
  stage.add(polyline([[SPEC.x0 - 0.07, yOf(nm), 0], [SPEC.x0, yOf(nm), 0]], { color: C.slateDeep, width: 2 }));
  stage.add(label(String(nm), { size: 0.13, color: C.slate, anchorX: 'right', anchorY: 'middle', position: [SPEC.x0 - 0.1, yOf(nm), 0] }));
}
stage.add(label('Spectrum', { size: 0.17, color: C.ash, anchorX: 'center', anchorY: 'top', position: [(SPEC.x0 + SPEC.x1) / 2, L.bottom - 0.12, 0] }));
const SAMPLES = 170;
const specCurve = polyline(Array.from({ length: SAMPLES + 1 }, () => [0, 0, 0] as [number, number, number]), { color: C.bone, width: 3 });
const specFill = new THREE.Mesh(
  (() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((SAMPLES + 1) * 6), 3));
    g.setIndex(Array.from({ length: SAMPLES }, (_, i) => [2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2]).flat());
    return g;
  })(),
  flat(C.bone, { transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }),
);
const stems = NEON.map(() => polyline([[0, 0, 0], [0, 0, 0]], { color: C.bone, width: 3 }));
stage.add(specCurve, specFill, ...stems);

// The bar that slides down the spectrum, across the rows.
const bar = polyline([[L.x0, 0, 0.05], [SPEC.x1 + 0.1, 0, 0.05]], { color: C.bone, width: 3, opacity: 0.999 });
stage.add(bar);

// --- Timeline and controls ------------------------------------------------------------
const T = { decompose: [1.2, 9.5], sweep: [10.5, 21.5] };
const ramp = (t: number, [a, b]: number[]) => Math.min(1, Math.max(0, (t - a!) / (b! - a!)));
const smooth = (u: number) => u * u * (3 - 2 * u);

const params = { lamp: 'sun' as Lamp, wavelength: 550 };
let manual = false;
ui.params.add(params, 'lamp', ['sun', 'neon']);
ui.params.add(params, 'wavelength', WL0, WL1, 1).onChange(() => (manual = true));

stage.frame((t) => {
  const lamp = params.lamp;
  const rows = rowsOf(lamp);
  // Fixed per lamp: the signal's scale does not move over the timeline.
  const sigScale = 0.13 / Math.sqrt(rows.reduce((a, [, h]) => a + h, 0) / 2);

  // The signal: exactly the sum of the rows.
  setPolyline(
    signal,
    xs.map((x) => [X(x), L.sigY + rows.reduce((a, [nm, h], k) => a + sinusoid(nm, Math.sqrt(h), phaseOf(k), t, x), 0) * sigScale, 0] as [number, number, number]),
  );

  // The rows appear down the stack; the sideways spectrum grows with them.
  const front = WL0 + (WL1 - WL0) * ramp(t, T.decompose); // wavelengths above this are decomposed
  rowLines.forEach((l, k) => {
    const row = rows[k];
    l.visible = !!row && row[0] <= front;
    if (!row || !l.visible) return;
    const [nm, h] = row;
    const y = yOf(nm);
    setPolyline(l, xs.map((x) => [X(x), y + sinusoid(nm, Math.sqrt(h), phaseOf(k), t, x) * L.rowAmp * (lamp === 'neon' ? 0.6 : 1), 0] as [number, number, number]));
    (l.material as unknown as { color: THREE.Color }).color.setHex(nmColour(nm));
  });
  const pts: [number, number, number][] = [];
  const pos = specFill.geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i <= SAMPLES; i++) {
    const nm = Math.min(front, WL0 + ((WL1 - WL0) * i) / SAMPLES);
    const h = lamp === 'sun' ? sunAt(nm) : 0;
    const x = SPEC.x0 + h * (SPEC.x1 - SPEC.x0);
    pts.push([x, yOf(nm), 0]);
    pos.setXYZ(2 * i, x, yOf(nm), -0.01);
    pos.setXYZ(2 * i + 1, SPEC.x0, yOf(nm), -0.01);
  }
  pos.needsUpdate = true;
  setPolyline(specCurve, pts);
  specCurve.visible = specFill.visible = lamp === 'sun' && front > WL0;
  NEON.forEach(([nm, h], k) => {
    stems[k]!.visible = lamp === 'neon' && nm <= front;
    setPolyline(stems[k]!, [[SPEC.x0, yOf(nm), 0], [SPEC.x0 + h * (SPEC.x1 - SPEC.x0), yOf(nm), 0]]);
  });

  // The bar: swept down the spectrum once the decomposition is done, or by hand.
  const sweeping = t >= T.sweep[0]!;
  const nm = manual ? params.wavelength : WL0 + (WL1 - WL0) * ramp(t, T.sweep);
  bar.visible = manual || sweeping;
  setPolyline(bar, [[L.x0, yOf(nm), 0.05], [SPEC.x1 + 0.1, yOf(nm), 0.05]]);

  // The rays: faint while decomposing; then the wavelength under the bar, at its brightness.
  const on = manual || sweeping;
  const b = on ? brightnessAt(lamp, nm) : 0;
  const colour = on ? nmColour(nm) : 0x888888;
  for (const l of rayLines) {
    (l.material as unknown as { color: THREE.Color }).color.setHex(colour);
    (l.material as unknown as { opacity: number }).opacity = on ? 0.08 + 0.72 * b : 0.25;
  }
});

stage.start();
