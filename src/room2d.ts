/**
 * Shared scenery for the 2D light-field demos.
 *
 * `radiance-2d` (a point in the room, the whole circle of directions) and
 * `radiance-boundary` (a point walking the boundary, the hemisphere pointing
 * into the room) are separate demos so each gets the whole frame — but they are
 * the same picture twice, so the room, the spectra and the graph panel all come
 * from here and the two look identical apart from the thing being shown.
 *
 * The room is closed on all four sides on purpose: every direction then lands
 * on a surface, so there is a spectrum for every ray and no graph blanks out.
 */

import * as THREE from 'three';
import type { Stage } from './stage';
import { C, flat } from './style';
import { polyline } from './lines';
import { label } from './text';

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

export interface Vec {
  x: number;
  y: number;
}

export const v = (x: number, y: number): Vec => ({ x, y });

/** Interior corners of the box. Walls are drawn as slabs outside these lines. */
export const X0 = -5.0;
export const X1 = 0.45;
export const Y0 = -2.5;
export const Y1 = 2.4;
export const SLAB = 0.22;

/** The object in the room. Sits exactly tangent to the floor. */
export const DISC = { c: v(-3.2, -1.3), r: 1.2 };
export const LAMP = { c: v(-0.9, 1.55), r: 0.32 };

// ---------------------------------------------------------------------------
// Reflectance spectra
// ---------------------------------------------------------------------------

// A low base level plus a strong Gaussian lobe. Saturated on purpose: the red
// wall has to peak red, the green floor green and the blue object blue, plainly
// enough to read from the back of the room, and strong pigments also make the
// colour they bleed onto their neighbours unmistakable.
const bell = (l: number, c: number, w: number) => Math.exp(-0.5 * ((l - c) / w) ** 2);
const mossRefl = (l: number) => 0.05 + 0.85 * bell(l, 545, 40);
const rustRefl = (l: number) => 0.05 + 0.9 * bell(l, 640, 48);
const blueRefl = (l: number) => 0.04 + 0.85 * bell(l, 462, 40);
const slateRefl = (l: number) => 0.16 + 0.4 * bell(l, 485, 65);
// The ceiling is the near-neutral one: a broad, almost flat reflectance that
// leaves the lamp's own Planck curve nearly untouched, which is worth seeing
// next to the strongly tinted surfaces.
const boneRefl = (l: number) => 0.5 + 0.15 * bell(l, 600, 120);

/** Deep tone for the ceiling slab — off the palette, since bone has no Deep. */
const BONE_DEEP = 0x2a2a26;

export interface Surface {
  kind: 'segment' | 'circle';
  a?: Vec;
  b?: Vec;
  c?: Vec;
  r?: number;
  color: number;
  fill: number;
  refl?: (l: number) => number;
  emissive?: boolean;
}

export const FLOOR: Surface = {
  kind: 'segment',
  a: v(X0, Y0),
  b: v(X1, Y0),
  color: C.moss,
  fill: C.mossDeep,
  refl: mossRefl,
};
export const LEFT_WALL: Surface = {
  kind: 'segment',
  a: v(X0, Y0),
  b: v(X0, Y1),
  color: C.rust,
  fill: C.rustDeep,
  refl: rustRefl,
};
export const RIGHT_WALL: Surface = {
  kind: 'segment',
  a: v(X1, Y0),
  b: v(X1, Y1),
  color: C.slate,
  fill: C.slateDeep,
  refl: slateRefl,
};
export const CEILING: Surface = {
  kind: 'segment',
  a: v(X0, Y1),
  b: v(X1, Y1),
  color: C.ash,
  fill: BONE_DEEP,
  refl: boneRefl,
};
export const OBJECT: Surface = {
  kind: 'circle',
  c: DISC.c,
  r: DISC.r,
  color: C.blue,
  fill: C.blueDeep,
  refl: blueRefl,
};
export const EMITTER: Surface = {
  kind: 'circle',
  c: LAMP.c,
  r: LAMP.r,
  color: C.ochre,
  fill: C.ochreDeep,
  emissive: true,
};

export const SURFACES: Surface[] = [FLOOR, LEFT_WALL, RIGHT_WALL, CEILING, OBJECT, EMITTER];

// ---------------------------------------------------------------------------
// Ray casting
// ---------------------------------------------------------------------------

export interface Hit {
  t: number;
  p: Vec;
  n: Vec;
  surf: Surface;
}

const EPS = 1e-4;

export function norm(a: Vec): Vec {
  const m = Math.hypot(a.x, a.y) || 1;
  return v(a.x / m, a.y / m);
}

/** Nearest hit along the ray o + t d, t > EPS. Null if the ray escapes. */
export function trace(o: Vec, d: Vec, skip?: Surface): Hit | null {
  let best: Hit | null = null;

  for (const s of SURFACES) {
    if (s === skip) continue;

    if (s.kind === 'segment') {
      const a = s.a!;
      const b = s.b!;
      const ex = b.x - a.x;
      const ey = b.y - a.y;
      const denom = d.x * ey - d.y * ex;
      if (Math.abs(denom) < 1e-9) continue;
      const rx = a.x - o.x;
      const ry = a.y - o.y;
      // Solving o + t d = a + u e by taking cross products with e and with d.
      const t = (rx * ey - ry * ex) / denom;
      const u = (rx * d.y - ry * d.x) / denom;
      if (t <= EPS || u < 0 || u > 1) continue;
      if (best && t >= best.t) continue;
      // Orient the normal towards the side the ray came from: that is the face
      // we are looking at, and the face whose outgoing light we want.
      let n = norm(v(-ey, ex));
      if (n.x * d.x + n.y * d.y > 0) n = v(-n.x, -n.y);
      best = { t, p: v(o.x + t * d.x, o.y + t * d.y), n, surf: s };
    } else {
      const c = s.c!;
      const r = s.r!;
      const ox = o.x - c.x;
      const oy = o.y - c.y;
      const bq = ox * d.x + oy * d.y;
      const cq = ox * ox + oy * oy - r * r;
      const disc = bq * bq - cq;
      if (disc < 0) continue;
      const sq = Math.sqrt(disc);
      let t = -bq - sq;
      if (t <= EPS) t = -bq + sq;
      if (t <= EPS) continue;
      if (best && t >= best.t) continue;
      const p = v(o.x + t * d.x, o.y + t * d.y);
      best = { t, p, n: norm(v(p.x - c.x, p.y - c.y)), surf: s };
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Spectra
// ---------------------------------------------------------------------------

export const WL0 = 400;
export const WL1 = 700;
export const NS = 96;

// Kelvin. Near daylight on purpose: a 3000 K lamp puts four times as much
// energy at 700 nm as at 460, so a blue pigment under it can only ever draw a
// low bump and the "blue peaks blue" reading is lost. At 5200 K the source is
// nearly flat across the visible band, so what the graph shows is the *pigment*,
// and the lamp's own Planck curve is still what a mirror direction reveals.
const LAMP_T = 5200;

function planck(nm: number, T: number): number {
  const l = nm * 1e-9;
  return 3.7418e-16 / (l ** 5 * (Math.exp(1.4388e-2 / (l * T)) - 1));
}

const PLANCK_MAX = (() => {
  let m = 0;
  for (let i = 0; i <= NS; i++) m = Math.max(m, planck(WL0 + ((WL1 - WL0) * i) / NS, LAMP_T));
  return m;
})();

/** The lamp's spectrum, normalised to peak 1 over the visible band. */
export const lampSpectrum = (nm: number) => planck(nm, LAMP_T) / PLANCK_MAX;

/** Wavelength at sample i. */
export const wavelength = (i: number) => WL0 + ((WL1 - WL0) * i) / NS;

/** Radiance units are arbitrary; this sets a directly lit surface to mid-height. */
const LAMP_POWER = 1.35;

/**
 * A constant floor on every patch's brightness, standing in for the bounces
 * past the first. One bounce alone leaves a shadowed spot at a few percent of a
 * lit one, which is honest and unreadable on a projector: the curve flattens
 * onto the axis and its shape — which is the entire point — disappears. This
 * lifts the floor so a shadowed spot stays clearly dimmer but still shows what
 * colour of light is reaching it.
 */
const AMBIENT = 0.5;

/** Radiance of the lamp itself, seen directly or in a mirror direction. */
const EMIT = 1;

/** How many directions the one-bounce gather samples over the hemisphere. */
const GATHER_RAYS = 26;

/**
 * Weight on the gathered light. One bounce is the whole of the rest of the
 * series here, and a real room's later bounces roughly double the indirect
 * term, so this stands in for them — and it is what makes colour bleeding read
 * on a projector rather than sitting at a few percent of the plot.
 */
const INDIRECT = 1.2;

/** Strength of the glossy reflection, and the half-width of its cone. */
const SPEC = 0.18;
const MIRROR_RAYS = 5;
const MIRROR_SPREAD = (9 * Math.PI) / 180;

// Sampled once per surface and cached: reflectance, and reflectance × the lamp
// spectrum, which is what a directly lit patch of that material sends out. Both
// are fixed, and the gather touches them thousands of times a frame.
const LAMP_TABLE = (() => {
  const t = new Float32Array(NS + 1);
  for (let i = 0; i <= NS; i++) t[i] = lampSpectrum(wavelength(i));
  return t;
})();

const reflTables = new Map<Surface, Float32Array>();
const emitTables = new Map<Surface, Float32Array>();

function reflTable(s: Surface): Float32Array {
  let t = reflTables.get(s);
  if (!t) {
    t = new Float32Array(NS + 1);
    for (let i = 0; i <= NS; i++) t[i] = s.refl ? s.refl(wavelength(i)) : 0;
    reflTables.set(s, t);
  }
  return t;
}

/** The spectral shape a lit patch of this surface sends out, before scaling. */
function emitTable(s: Surface): Float32Array {
  let t = emitTables.get(s);
  if (!t) {
    t = new Float32Array(NS + 1);
    const refl = reflTable(s);
    for (let i = 0; i <= NS; i++) t[i] = s.emissive ? LAMP_TABLE[i] : refl[i] * LAMP_TABLE[i];
    emitTables.set(s, t);
  }
  return t;
}

/**
 * Shadow-tested irradiance from the lamp at q. In the plane the falloff is 1/d
 * rather than 1/d².
 */
function directIrradiance(q: Vec, n: Vec, surf: Surface): number {
  const toLamp = v(LAMP.c.x - q.x, LAMP.c.y - q.y);
  const dist = Math.hypot(toLamp.x, toLamp.y);
  const l = v(toLamp.x / dist, toLamp.y / dist);
  const cosL = n.x * l.x + n.y * l.y;
  if (cosL <= 0) return 0;
  const block = trace(v(q.x + n.x * 1e-3, q.y + n.y * 1e-3), l, surf);
  if (block && !block.surf.emissive && block.t < dist - LAMP.r) return 0;
  return (LAMP_POWER * cosL) / dist;
}

/**
 * How bright a hit patch is, and with what spectral shape — one bounce only,
 * so the gather terminates. Emitters ignore the lighting and just emit.
 */
function patchRadiance(hit: Hit): { table: Float32Array; scale: number } {
  if (hit.surf.emissive) return { table: emitTable(hit.surf), scale: EMIT };
  return {
    table: emitTable(hit.surf),
    scale: directIrradiance(hit.p, hit.n, hit.surf) + AMBIENT,
  };
}

// Scratch buffers, so the per-frame work allocates nothing.
const gather = new Float32Array(NS + 1);
const specular = new Float32Array(NS + 1);

/** Rotate the unit vector n by `a`, towards its own tangent (−n.y, n.x). */
function turn(n: Vec, a: number): Vec {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return v(n.x * c - n.y * s, n.y * c + n.x * s);
}

/**
 * The spectrum leaving the surface point q, with normal n, in direction ω.
 *
 * Two parts, and they vary for different reasons:
 *
 *   diffuse — this surface's reflectance times all the light reaching it: the
 *             lamp directly, plus a cosine-weighted gather over the hemisphere
 *             of what every other surface is sending back. That gather is why
 *             the spectrum keeps changing as p moves — a spot near the red wall
 *             is lit partly by red light, one tucked behind the object loses
 *             whole arcs of its hemisphere to shadow — while the reflectance in
 *             front of it keeps the peak where the material's colour says it is.
 *             It does not depend on ω at all: that is what Lambertian means.
 *
 *   glossy  — the mirror direction of ω, traced into the room and softened over
 *             a small cone. This is the part that swings as ω sweeps: point it
 *             at the lamp and the curve leaps to the lamp's own Planck shape,
 *             at the red wall and a red shoulder appears. Spectrally neutral,
 *             as a dielectric highlight is — the tint belongs to what is being
 *             reflected, not to the highlight.
 *
 * `gloss` scales the second part; at 0 the graph freezes while ω sweeps.
 */
export function outgoingSpectrum(
  q: Vec,
  n: Vec,
  surf: Surface,
  omega: Vec,
  out: Float32Array,
  gloss = 1,
): void {
  if (surf.emissive) {
    const t = emitTable(surf);
    for (let i = 0; i <= NS; i++) out[i] = t[i] * EMIT;
    return;
  }

  const origin = v(q.x + n.x * 1e-3, q.y + n.y * 1e-3);

  // --- one-bounce gather over the hemisphere -------------------------------
  gather.fill(0);
  for (let k = 0; k < GATHER_RAYS; k++) {
    // Midpoint samples of the angle from the normal, cosine-weighted. The 2 is
    // ∫cos over the hemisphere, so a uniform environment of radiance 1 gathers
    // to exactly 1.
    const a = -Math.PI / 2 + ((k + 0.5) / GATHER_RAYS) * Math.PI;
    const hit = trace(origin, turn(n, a), surf);
    if (!hit) continue;
    const { table, scale } = patchRadiance(hit);
    const w = ((Math.cos(a) * Math.PI) / GATHER_RAYS / 2) * scale;
    for (let i = 0; i <= NS; i++) gather[i] += w * table[i];
  }

  // --- the glossy reflection of the room -----------------------------------
  specular.fill(0);
  if (gloss > 0) {
    const cosO = n.x * omega.x + n.y * omega.y;
    const mirror = v(2 * cosO * n.x - omega.x, 2 * cosO * n.y - omega.y);
    for (let j = 0; j < MIRROR_RAYS; j++) {
      const off = MIRROR_SPREAD * (j / (MIRROR_RAYS - 1) - 0.5) * 2;
      const dir = turn(mirror, off);
      // A cone ray that has swung past the surface contributes nothing.
      if (dir.x * n.x + dir.y * n.y <= 0) continue;
      const hit = trace(origin, dir, surf);
      if (!hit) continue;
      const { table, scale } = patchRadiance(hit);
      const w = (scale / MIRROR_RAYS) * SPEC * gloss;
      for (let i = 0; i <= NS; i++) specular[i] += w * table[i];
    }
  }

  const direct = directIrradiance(q, n, surf);
  const refl = reflTable(surf);
  for (let i = 0; i <= NS; i++) {
    out[i] = refl[i] * (LAMP_TABLE[i] * direct + INDIRECT * gather[i]) + specular[i];
  }
}

/**
 * The spectrum carried by the ray through p travelling in direction ω.
 *
 * ω is the direction of travel, so the light passing through p left a surface
 * *behind* p — trace backwards to find it. Returns that hit, so a demo can draw
 * where the light came from.
 */
export function raySpectrum(
  p: Vec,
  omega: Vec,
  out: Float32Array,
  gloss = 0,
): Hit | null {
  const hit = trace(p, v(-omega.x, -omega.y));
  if (!hit) {
    out.fill(0);
    return null;
  }
  outgoingSpectrum(hit.p, hit.n, hit.surf, omega, out, gloss);
  return hit;
}

// ---------------------------------------------------------------------------
// Drawing the room
// ---------------------------------------------------------------------------

export function filledRect(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: number,
): THREE.Mesh {
  const g = new THREE.PlaneGeometry(x1 - x0, y1 - y0);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, -0.05);
  return new THREE.Mesh(g, flat(color));
}

export function filledCircle(c: Vec, r: number, color: number, z = -0.05): THREE.Mesh {
  const g = new THREE.CircleGeometry(r, 96);
  g.translate(c.x, c.y, z);
  return new THREE.Mesh(g, flat(color));
}

/** An arc (or full circle) as a thick line. Angles in radians. */
export function arc(
  c: Vec,
  r: number,
  a0: number,
  a1: number,
  opts: { color?: number; width?: number; opacity?: number; segments?: number } = {},
) {
  const { color = C.slate, width = 2, opacity = 1, segments = 128 } = opts;
  const pts: [number, number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const a = a0 + ((a1 - a0) * i) / segments;
    pts.push([c.x + r * Math.cos(a), c.y + r * Math.sin(a), 0]);
  }
  return polyline(pts, { color, width, opacity });
}

/** The whole room: four walls as slabs with a lit inner edge, object, lamp. */
export function buildRoom(stage: Stage): void {
  stage.add(filledRect(X0 - SLAB, Y0 - SLAB, X1 + SLAB, Y0, C.mossDeep));
  stage.add(polyline([[X0, Y0, 0], [X1, Y0, 0]], { color: C.moss, width: 5 }));

  stage.add(filledRect(X0 - SLAB, Y0, X0, Y1, C.rustDeep));
  stage.add(polyline([[X0, Y0, 0], [X0, Y1, 0]], { color: C.rust, width: 5 }));

  stage.add(filledRect(X1, Y0, X1 + SLAB, Y1, C.slateDeep));
  stage.add(polyline([[X1, Y0, 0], [X1, Y1, 0]], { color: C.slate, width: 5 }));

  stage.add(filledRect(X0 - SLAB, Y1, X1 + SLAB, Y1 + SLAB, BONE_DEEP));
  stage.add(polyline([[X0, Y1, 0], [X1, Y1, 0]], { color: C.ash, width: 5 }));

  stage.add(filledCircle(DISC.c, DISC.r, C.blueDeep));
  stage.add(arc(DISC.c, DISC.r, 0, Math.PI * 2, { color: C.blue, width: 4 }));

  // The lamp: a bright disc inside a few fading rings of deep ochre, which
  // reads as glow rather than as one more solid object.
  for (let i = 4; i >= 1; i--) {
    const halo = filledCircle(LAMP.c, LAMP.r * (1 + 0.42 * i), C.ochreDeep, -0.06 - i * 0.002);
    const m = halo.material as THREE.MeshBasicMaterial;
    m.transparent = true;
    m.opacity = 0.18;
    stage.add(halo);
  }
  stage.add(filledCircle(LAMP.c, LAMP.r, C.ochre, -0.04));
}

// ---------------------------------------------------------------------------
// The spectrum panel
// ---------------------------------------------------------------------------

const PX0 = 1.25;
const PX1 = 5.05;
const PY0 = -1.2;
const PY1 = 1.35;

export interface SpectrumPanel {
  /** Redraw the curve. Values are radiance samples indexed like `wavelength`. */
  update(values: Float32Array, gain: number): void;
}

/**
 * The graph on the right of the frame: wavelength across, radiance up.
 *
 * Fixed colours, deliberately. Tinting the curve by whichever surface the light
 * came from made it read as one more object in the scene; the palette belongs
 * to the room, and the spectrum is ink.
 */
export function createSpectrumPanel(stage: Stage, title: string): SpectrumPanel {
  const xOfIndex = (i: number) => PX0 + ((PX1 - PX0) * i) / NS;
  const yOfValue = (val: number) => PY0 + Math.min(Math.max(val, 0), 1) * (PY1 - PY0);

  stage.add(polyline([[PX0, PY0, 0], [PX1, PY0, 0]], { color: C.slateDeep, width: 2 }));
  stage.add(polyline([[PX0, PY0, 0], [PX0, PY1, 0]], { color: C.slateDeep, width: 2 }));

  for (const nm of [400, 500, 600, 700]) {
    const x = PX0 + ((PX1 - PX0) * (nm - WL0)) / (WL1 - WL0);
    stage.add(polyline([[x, PY0 - 0.08, 0], [x, PY0, 0]], { color: C.slateDeep, width: 2 }));
    stage.add(
      label(String(nm), {
        size: 0.17,
        color: C.slate,
        anchorX: 'center',
        anchorY: 'top',
        position: [x, PY0 - 0.14, 0],
      }),
    );
  }

  // One label, centred under the axis, so it reads as belonging to this graph.
  // The axes used to be named too ("radiance", "wavelength (nm)"); they went
  // with the rest of the words in the frame — the deck says it once and the
  // ticks carry the rest.
  stage.add(
    label(title, {
      size: 0.2,
      color: C.ash,
      anchorX: 'center',
      anchorY: 'top',
      position: [(PX0 + PX1) / 2, PY0 - 0.42, 0],
    }),
  );

  // Curve and a wash of the same ink under it. Both keep a fixed vertex count
  // so they can be updated in place.
  const pts: [number, number, number][] = Array.from(
    { length: NS + 1 },
    (_, i) => [xOfIndex(i), PY0, 0] as [number, number, number],
  );
  const curve = polyline(pts, { color: C.bone, width: 4 });
  curve.renderOrder = 4;
  stage.add(curve);

  const fillGeom = new THREE.BufferGeometry();
  const fillPos = new Float32Array((NS + 1) * 2 * 3);
  fillGeom.setAttribute('position', new THREE.BufferAttribute(fillPos, 3));
  const index: number[] = [];
  for (let i = 0; i < NS; i++) {
    index.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
  }
  fillGeom.setIndex(index);
  const fillMesh = new THREE.Mesh(
    fillGeom,
    flat(C.bone, { transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
  );
  fillMesh.renderOrder = 3;
  stage.add(fillMesh);

  return {
    update(values: Float32Array, gain: number): void {
      for (let i = 0; i <= NS; i++) {
        const y = yOfValue(values[i] * gain);
        pts[i][1] = y;
        fillPos[6 * i + 0] = xOfIndex(i);
        fillPos[6 * i + 1] = y;
        fillPos[6 * i + 2] = 0;
        fillPos[6 * i + 3] = xOfIndex(i);
        fillPos[6 * i + 4] = PY0;
        fillPos[6 * i + 5] = 0;
      }
      (curve.geometry as any).setPositions(pts.flat());
      curve.computeLineDistances();
      fillGeom.attributes.position.needsUpdate = true;
    },
  };
}

// ---------------------------------------------------------------------------
// The direction vector
// ---------------------------------------------------------------------------

/** A solid arrowhead, pointing along +y before rotation. */
export function arrowHead(color = C.bone, w = 0.075, h = 0.21): THREE.Mesh {
  const g = new THREE.BufferGeometry();
  g.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([0, h * 0.48, 0, -w, -h * 0.52, 0, w, -h * 0.52, 0], 3),
  );
  const m = new THREE.Mesh(g, flat(color));
  m.renderOrder = 5;
  return m;
}
