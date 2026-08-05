/**
 * The light field on the boundary — L on X = T¹M restricted to Σ.
 *
 * Same room, same spectra, same graph as `radiance-2d`. What changes is where
 * the point lives and which directions it gets: p walks the boundary of the
 * scene, and at each position it carries the hemisphere of directions pointing
 * *into* the room. A vector sweeps back and forth across that hemisphere, and
 * the panel shows the spectrum leaving the material in that direction.
 *
 * Σ is the walls *and* the object, so the walk is one circuit of both: along
 * the floor, once around the object where it touches the floor, then on round
 * the walls.
 *
 * Two things are moving, and they carry different information:
 *
 *   p moving      — the material changes, and so does the light reaching it: the
 *                   hemisphere gather picks up whatever the neighbouring walls
 *                   are sending back, so a spot near the red wall is lit partly
 *                   by red light and one tucked behind the object loses whole
 *                   arcs of its hemisphere to shadow
 *   ω sweeping    — the diffuse part does not move at all, which is the point:
 *                   Lambertian means the same spectrum in every direction. What
 *                   moves is the glossy part, the mirror direction of ω traced
 *                   into the room — swing it onto the lamp and the curve leaps
 *                   to the lamp's own Planck shape, onto the red wall and a red
 *                   shoulder appears. Turn `gloss` to zero and the graph freezes
 *                   while ω sweeps.
 *
 * The dim ochre line to the lamp is the light arriving; it is drawn only when
 * the lamp is actually visible from p, so the shadow behind the object shows up
 * as the line cutting out and the highlight dying with it.
 *
 * Everything is a pure function of t and of the panel parameters — no
 * `Math.random()`, no wallclock — so a frame-stepped export is reproducible.
 */

import { createStage, createUI, C } from '@';
import { polyline, setPolyline } from '@/lines';
import { label } from '@/text';
import {
  CEILING,
  DISC,
  FLOOR,
  LAMP,
  LEFT_WALL,
  NS,
  RIGHT_WALL,
  OBJECT,
  X0,
  X1,
  Y0,
  Y1,
  arc,
  arrowHead,
  buildRoom,
  createSpectrumPanel,
  filledCircle,
  outgoingSpectrum,
  trace,
  v,
  type Surface,
  type Vec,
} from '@/room2d';

const stage = createStage({
  camera: 'ortho',
  position: [0, 0, 10],
  target: [0, 0, 0],
  orthoHeight: 3,
  lights: false,
  controls: false,
});
stage.duration = 18;

const ui = createUI(stage);

buildRoom(stage);
const panel = createSpectrumPanel(stage, 'Spectrum');

// ---------------------------------------------------------------------------
// Walking the boundary
// ---------------------------------------------------------------------------

interface Station {
  p: Vec;
  /** Unit normal pointing away from the material, into the room. */
  n: Vec;
  surf: Surface;
}

interface Segment {
  /** Arc length, so p travels at constant speed over the whole circuit. */
  len: number;
  at(d: number): Station;
}

/** A straight run from a to b with a fixed normal. */
function run(a: Vec, b: Vec, n: Vec, surf: Surface): Segment {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  return {
    len,
    at: (d) => ({ p: v(a.x + (dx * d) / len, a.y + (dy * d) / len), n, surf }),
  };
}

/**
 * The whole scene boundary Σ as one circuit: along the floor, once around the
 * object, on along the floor, up the right wall, back along the ceiling, down
 * the left wall.
 *
 * The object is tangent to the floor, so the two pieces of Σ meet — p can step
 * from one onto the other where they touch. A small arc either side of the
 * contact point is skipped, so p hops on and off just clear of the floor rather
 * than passing through the one place where the object's outward normal points
 * straight down into it.
 */
const GAP = (12 * Math.PI) / 180;
const CONTACT = -Math.PI / 2; // angle on the disc where it meets the floor

const PATH: Segment[] = [
  run(v(X0, Y0), v(DISC.c.x, Y0), v(0, 1), FLOOR),
  {
    len: DISC.r * (Math.PI * 2 - 2 * GAP),
    at: (d) => {
      const a = CONTACT + GAP + d / DISC.r;
      const n = v(Math.cos(a), Math.sin(a));
      return { p: v(DISC.c.x + DISC.r * n.x, DISC.c.y + DISC.r * n.y), n, surf: OBJECT };
    },
  },
  run(v(DISC.c.x, Y0), v(X1, Y0), v(0, 1), FLOOR),
  run(v(X1, Y0), v(X1, Y1), v(-1, 0), RIGHT_WALL),
  run(v(X1, Y1), v(X0, Y1), v(0, -1), CEILING),
  run(v(X0, Y1), v(X0, Y0), v(1, 0), LEFT_WALL),
];

const CIRCUIT = PATH.reduce((t, s) => t + s.len, 0);

/** Position along the whole circuit, `s` running 0 → 1. */
function station(s: number): Station {
  let d = (((s % 1) + 1) % 1) * CIRCUIT;
  for (const seg of PATH) {
    if (d < seg.len) return seg.at(d);
    d -= seg.len;
  }
  return PATH[0].at(0);
}

// ---------------------------------------------------------------------------
// The hemisphere at p
// ---------------------------------------------------------------------------

const HEMI_R = 0.9;
const SEGMENTS = 96;

// Rebuilt every frame, so it keeps a fixed vertex count and can be moved and
// rotated in place: the arc is authored around the +x axis and then turned to
// face along the normal.
const hemi = arc(v(0, 0), HEMI_R, -Math.PI / 2, Math.PI / 2, {
  color: C.slate,
  width: 2,
  opacity: 0.85,
  segments: SEGMENTS,
});
stage.add(hemi);

// The surface's tangent line at p, so the hemisphere reads as sitting on the
// material rather than floating over it.
const tangentLine = polyline([[0, 0, 0], [0, 0, 0]], {
  color: C.slateDeep,
  width: 2,
  opacity: 0.9,
});
stage.add(tangentLine);

const pointDot = filledCircle(v(0, 0), 0.075, C.bone, 0.02);
stage.add(pointDot);

const pLabel = label('p', { size: 0.2, color: C.bone, anchorX: 'center', anchorY: 'middle' });
stage.add(pLabel);

const shaft = polyline([[0, 0, 0], [0, 0, 0]], { color: C.bone, width: 5 });
shaft.renderOrder = 5;
stage.add(shaft);
const head = arrowHead();
stage.add(head);

// The light arriving from the lamp — drawn only when the lamp is visible.
const incoming = polyline([[0, 0, 0], [0, 0, 0]], { color: C.ochre, width: 2, opacity: 0.5 });
stage.add(incoming);

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

const params = {
  travel: true,
  position: 0,
  sweep: true,
  sweeps: 8,
  phi: 0,
  gloss: 1,
  gain: 1,
  incoming: true,
};
// Travelling and sweeping are the animation; freezing either is how you get a
// still of one particular (point, direction) for a slide.
ui.params.add(params, 'travel').name('walk the boundary');
ui.params.add(params, 'position', 0, 1, 0.001).name('position along it');
ui.params.add(params, 'sweep').name('sweep the hemisphere');
ui.params.add(params, 'sweeps', 1, 12, 1).name('sweeps per loop');
ui.params.add(params, 'phi', -88, 88, 1).name('angle from normal');
ui.params.add(params, 'gloss', 0, 1.5, 0.05).name('gloss');
ui.params.add(params, 'gain', 0.2, 3, 0.05).name('vertical gain');
ui.params.add(params, 'incoming').name('show light arriving');

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

const spectrum = new Float32Array(NS + 1);
const MAX_PHI = (88 * Math.PI) / 180;

stage.frame((t) => {
  const u = stage.duration > 0 ? (t % stage.duration) / stage.duration : 0;

  const s = params.travel ? u : params.position;
  const st = station(s);
  const { p, n } = st;
  const tangent = v(-n.y, n.x);

  // Back and forth over the hemisphere. A sine closes exactly on the loop, and
  // it lingers at the grazing angles, which is where the highlight dies.
  const phi = params.sweep
    ? MAX_PHI * Math.sin(u * Math.PI * 2 * Math.round(params.sweeps))
    : (params.phi * Math.PI) / 180;
  const omega = v(
    n.x * Math.cos(phi) + tangent.x * Math.sin(phi),
    n.y * Math.cos(phi) + tangent.y * Math.sin(phi),
  );

  // --- the hemisphere ------------------------------------------------------
  hemi.position.set(p.x, p.y, 0);
  hemi.rotation.z = Math.atan2(n.y, n.x);
  setPolyline(tangentLine, [
    [p.x - HEMI_R * tangent.x, p.y - HEMI_R * tangent.y, 0],
    [p.x + HEMI_R * tangent.x, p.y + HEMI_R * tangent.y, 0],
  ]);
  pointDot.position.set(p.x, p.y, 0.02);
  pLabel.position.set(p.x + 0.32 * tangent.x + 0.2 * n.x, p.y + 0.32 * tangent.y + 0.2 * n.y, 0.02);

  const tip = v(p.x + HEMI_R * omega.x, p.y + HEMI_R * omega.y);
  setPolyline(shaft, [
    [p.x, p.y, 0],
    [tip.x - 0.12 * omega.x, tip.y - 0.12 * omega.y, 0],
  ]);
  head.position.set(tip.x, tip.y, 0.02);
  head.rotation.z = Math.atan2(omega.y, omega.x) - Math.PI / 2;

  // --- the light arriving --------------------------------------------------
  const toLamp = v(LAMP.c.x - p.x, LAMP.c.y - p.y);
  const dist = Math.hypot(toLamp.x, toLamp.y);
  const l = v(toLamp.x / dist, toLamp.y / dist);
  const cosL = n.x * l.x + n.y * l.y;
  let lit = cosL > 0;
  if (lit) {
    const block = trace(v(p.x + n.x * 1e-3, p.y + n.y * 1e-3), l, st.surf);
    lit = !(block && !block.surf.emissive && block.t < dist - LAMP.r);
  }
  setPolyline(
    incoming,
    params.incoming && lit
      ? [[LAMP.c.x, LAMP.c.y, 0], [p.x, p.y, 0]]
      : [[0, 0, 0], [0, 0, 0]],
  );

  // --- the spectrum leaving in that direction ------------------------------
  outgoingSpectrum(p, n, st.surf, omega, spectrum, params.gloss);
  panel.update(spectrum, params.gain);
});

stage.start();
