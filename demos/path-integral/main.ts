/**
 * One term of the photograph, C T^n E, as an integral: its cartoon.
 *
 * Steve, 2026-11-04: "use the fact that the camera is an integral, and that T
 * is an integral, and actually write stuff out to get big old integrals here
 * ... CE on a slide with a cartoon and the integral, then CTE, then CT^2E";
 * "a lens camera", "3D the whole time"; "my goal now is to actually write down
 * for each CT^nE an explicit integral, so that the problem we are solving is a
 * sum of integrals".
 *
 * The talk's 3D room, the short box (rendering-visualizer's CORNELL_SHORT, as
 * in light-field docs/24): interior [-2,2] x [0,4] x [-2,2], open front,
 * white floor, ceiling and back, red left wall, green right wall, the lamp a
 * 1.2 square on the ceiling, a matte white ball and a glossy blue one. In
 * front of it a lens camera. ?n=0, 1, 2: one path of the integral for C T^n E,
 * the variables of the integral marked on it:
 *
 *   a     a point of the lens A (the lens is drawn as the disc it integrates over)
 *   d     the direction of pixel i's ray through a
 *   x_1   where that ray first lands; x_{k+1} where u_k from x_k first lands
 *   u_k   a direction at x_k: the hemisphere at x_k is the S^2 integrated over
 *         (its other half is zero: the surfaces are opaque)
 *
 * The last point is on the lamp, where E is not zero. The paths are fixed
 * points chosen by hand, checked to be real: each segment's first hit is the
 * next point (no ball in the way).
 *
 * ?walk (Steve, 2026-11-04: "is it legit to say we bounce a path around all
 * over until it hits a light, then we figure out how many bounces it had, and
 * have it contribute to that integral, and add them all up?"; "I'm just trying
 * to derive it from the current story"): a random point of A x (S^2)^n is a
 * random walk. One walk after another: a uniform on the lens, d through pixel
 * i's point of focus, then at each surface a direction drawn from the
 * hemisphere (cosine-weighted), ray-cast in the box, until the walk lands on
 * the lamp (it counts, for the term with that many bounces), leaves through
 * the open front, or gives up after CAP bounces (both add 0). Drawn dark while
 * it walks, ochre if it reaches the light (rendering-visualizer pixel-bounce's
 * colours). The walks are seeded, so the sequence is the same every time; the
 * seed is the first whose first three walks include one that reaches the lamp.
 *
 * ?space (Steve, 2026-11-05: "interpret its domain as the space of paths ...
 * show paths in the scene, then we lay a bunch of them out in the plane, and
 * draw a graph above them, of the integrand"; "for the lens maybe we do the
 * literal one"): the space of paths of C E is the lens A itself, each lens point
 * a one path a -> x_1. Rays from points spread over the lens (ochre if they land
 * on the lamp), then a copy of the lens disc lifts out of the camera and is laid
 * out large beside the box, the same points on it, and over it the integrand
 * E(x_1, -d): a spike of height E over each point whose ray reached the lamp,
 * then the whole graph, flat-topped over the region of the lens that sees the
 * lamp and zero elsewhere. That region is exact: the disc clipped by the
 * preimage of the lamp square under a -> (where a's ray through the focus
 * lands), a quadrilateral, since the map is projective. Pixel i is focused short
 * of the ceiling, so its cone of rays straddles a corner of the lamp and only
 * part of the lens sees the light (in focus, the region would be all of A or
 * none of it).
 *
 * ?space=1 (Steve, 2026-11-05: "I'd go with the second approach of things laid
 * out together, as long as the integrand looks a bit complicated still"; "show a
 * little schematic of paths, and then path space with a function over it"): the
 * paths of C T E. First some of them in the room (lens -> one bounce at x_1 ->
 * a point of the lamp; ochre if the line to the lamp is clear). Then the room
 * unfolds into a net about its floor (back wall behind, red and green to the
 * sides, the ceiling with the lamp past the red wall), the viewer rising above
 * it: the paths grouped by the surface they bounce off. Then a graph rises over
 * the net: at each point the lamp's light arriving there times the surface's
 * colour (36 lamp points, each checked for a clear line), with the heights
 * compressed by a power 0.6 so the walls show beside the bright floor. A
 * schematic, not the literal 4-dimensional domain; the balls' own bounce points
 * are left out. (Shown, then set aside: Steve found the unfolding confusing.)
 *
 * ?space=2 (Steve, 2026-11-05: "I'd rather just have a small grid or schematic
 * region A x S^2 where we draw a function over it"): the integrand of C T E on
 * a true 2D slice of A x S^2, drawn like the Riemann and Monte Carlo surfaces
 * (field2d's plate and glass). Across: lens points on a line through the
 * cartoon's a. In depth: directions u_1 at x_1 on the half-circle in the
 * vertical plane of the cartoon's u_1. Height: f cos(theta_1) E(x_2), each
 * point two ray casts in the box. Pixel i (the cartoon's: its path now bounces
 * on the floor) is focused 0.4 of the way to x_1 (?focus=), so the lens points
 * land across the floor and the balls' shadows cut the ridge at both ends. The
 * cartoon's path is the ochre spike.
 */

import * as THREE from 'three';
import { createStage, C, matte, glossy, glow, flat } from '@';
import { polyline, setPolyline } from '@/lines';
import { label, setText } from '@/text';
import { CAM_POS, CAM_TARGET, Z, floorPlate, glassSurface, surfaceRim } from '@/field2d';
import { FIELD_HALF } from '@/functions';

const q = new URLSearchParams(location.search);
const N = q.get('space') === '3' ? 1 : Math.max(0, Math.min(2, Number(q.get('n') ?? 0)));
const WALK = q.has('walk');
const BUCKETS = q.has('buckets');
const SPACE = q.has('space');
const SPACE_N = Number(q.get('space') || 0);
// ?space=3: where the plate sits beside the box, its tilt toward the viewer, its yaw, its size.
const PAIR_AT: [number, number, number] = [5.5, 1.1, 1.2];
const PAIR_TILT = 0.72;
const PAIR_YAW = -0.42;
const PAIR_SCALE = 0.62;
const FOCUS = Number(q.get('focus') ?? 0.4); // ?space=2: where pixel i is focused, as a fraction of the way from a to the cartoon's x_1

const stage = WALK && BUCKETS
  ? createStage({ camera: 'persp', position: [-0.6, 2.4, 16.5], target: [-1.4, 0.75, 1.5], fov: 43, lights: false, controls: false })
  : SPACE && SPACE_N === 3
  ? createStage({ camera: 'persp', position: [1.7, 3.3, 19.5], target: [1.8, 1.8, 1.5], fov: 34, lights: false, controls: false })
  : SPACE && SPACE_N === 2
  ? createStage({ camera: 'persp', position: CAM_POS, target: CAM_TARGET, fov: 38, lights: false, controls: false })
  : SPACE && SPACE_N === 0
  ? createStage({ camera: 'persp', position: [0.9, 3.1, 17.5], target: [1.0, 2.3, 1.5], fov: 35, lights: false, controls: false })
  : createStage({ camera: 'persp', position: [-0.4, 3.0, 15.5], target: [-1.5, 2.0, 1.5], fov: 43, lights: false, controls: false });
const scene = stage.scene;

// --- Light: soft, so the room reads; the lamp is the one bright thing. -------
scene.add(new THREE.AmbientLight(0xffffff, 0.55));
const bulb = new THREE.PointLight(0xfff1dc, 14, 0, 1.4);
bulb.position.set(0, 3.6, 0);
scene.add(bulb);
const key = new THREE.DirectionalLight(0xfff4e2, 0.6);
key.position.set(3, 6, 9);
scene.add(key);

// --- The short box ------------------------------------------------------------
const WHITE = 0xc2b9af;
const RED = 0xa61a14;
const GREEN = 0x2a7a30;
/** A wall seen only from inside the box: a plane centred at c, normal n into the room. */
const roomParts: THREE.Object3D[] = []; // the box as drawn (?space=1 unfolds its own copy)
function wall(c: [number, number, number], n: THREE.Vector3, color: number) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), matte(color, { side: THREE.FrontSide }));
  m.position.set(...c);
  m.lookAt(m.position.clone().add(n));
  scene.add(m);
  roomParts.push(m);
}
wall([0, 0, 0], new THREE.Vector3(0, 1, 0), WHITE);
wall([0, 4, 0], new THREE.Vector3(0, -1, 0), WHITE);
wall([0, 2, -2], new THREE.Vector3(0, 0, 1), WHITE);
wall([-2, 2, 0], new THREE.Vector3(1, 0, 0), RED);
wall([2, 2, 0], new THREE.Vector3(-1, 0, 0), GREEN);
// The open front's rim, so the box reads as a box.
for (const pts of [
  [[-2, 0, 2], [-2, 4, 2], [2, 4, 2], [2, 0, 2], [-2, 0, 2]],
  [[-2, 0, -2], [-2, 4, -2], [2, 4, -2], [2, 0, -2], [-2, 0, -2]],
  ...([[-2, 0], [-2, 4], [2, 4], [2, 0]] as const).map(([x, y]) => [[x, y, -2], [x, y, 2]]),
] as [number, number, number][][]) {
  const l = polyline(pts, { color: pts.length === 5 && pts[0]![2] === 2 ? C.slate : C.slateDeep, width: pts.length === 5 && pts[0]![2] === 2 ? 2 : 1.5 });
  scene.add(l);
  roomParts.push(l);
}

const lamp = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), glow(0xfff3e0, 2.2));
lamp.rotation.x = Math.PI / 2;
lamp.position.set(0, 3.99, 0);
scene.add(lamp);

const white = new THREE.Mesh(new THREE.SphereGeometry(0.8, 64, 32), matte(0xd8d4cc));
white.position.set(-0.9, 0.8, -0.6);
scene.add(white);
const blue = new THREE.Mesh(new THREE.SphereGeometry(0.55, 64, 32), glossy(0x5a72c8, { metalness: 0.5, roughness: 0.25 }));
blue.position.set(0.9, 0.55, 0.6);
scene.add(blue);

// --- The lens camera ----------------------------------------------------------
const A = new THREE.Vector3(-4.2, 2.1, 4.9); // the lens point a
const axis = new THREE.Vector3(0, 1.7, 0).sub(A).normalize(); // the camera looks into the box
const right = new THREE.Vector3().crossVectors(axis, new THREE.Vector3(0, 1, 0)).normalize();
const up = new THREE.Vector3().crossVectors(right, axis).normalize();
const LENS_R = 0.42;
const lensC = A.clone().addScaledVector(right, -0.2).addScaledVector(up, -0.16); // a sits off the lens centre
const BACK = 0.85; // lens to film

const cam = new THREE.Group();
cam.position.copy(lensC);
cam.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, axis.clone().negate()));
scene.add(cam);
// Body: a box behind the lens (local -z is the view direction, so the body is at +z).
const body = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.0, BACK), new THREE.MeshStandardMaterial({ color: 0x2b3238, roughness: 0.8, transparent: true, opacity: 0.55, depthWrite: false }));
body.position.z = BACK / 2;
cam.add(body);
const bodyEdges = new THREE.LineSegments(new THREE.EdgesGeometry(body.geometry), new THREE.LineBasicMaterial({ color: C.slate }));
bodyEdges.position.copy(body.position);
cam.add(bodyEdges);
// The lens: the disc A, in the deck's camera blue.
const lens = new THREE.Mesh(new THREE.CircleGeometry(LENS_R, 64), flat(0x8fb5d6, { transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
cam.add(lens);
cam.add(polyline(Array.from({ length: 65 }, (_, i) => [LENS_R * Math.cos((i / 64) * 2 * Math.PI), LENS_R * Math.sin((i / 64) * 2 * Math.PI), 0] as [number, number, number]), { color: 0x8fb5d6, width: 2.5 }));
// The film, a grid of pixels at the back, pixel i lit.
const FILM = 0.7;
const GRID = 6;
const film = new THREE.Group();
film.position.z = BACK - 0.01;
cam.add(film);
film.add(new THREE.Mesh(new THREE.PlaneGeometry(FILM, FILM), flat(0x1a1f24, { side: THREE.DoubleSide })));
for (let k = 0; k <= GRID; k++) {
  const s = -FILM / 2 + (k * FILM) / GRID;
  film.add(polyline([[s, -FILM / 2, 0.001], [s, FILM / 2, 0.001]], { color: C.slateDeep, width: 1 }));
  film.add(polyline([[-FILM / 2, s, 0.001], [FILM / 2, s, 0.001]], { color: C.slateDeep, width: 1 }));
}
const PIX = [3, 2]; // pixel i: column, row (from the left, from the bottom, as seen from behind)
const cell = FILM / GRID;
const pixLocal = new THREE.Vector3(-FILM / 2 + (PIX[0]! + 0.5) * cell, -FILM / 2 + (PIX[1]! + 0.5) * cell, 0.002);
const pix = new THREE.Mesh(new THREE.PlaneGeometry(cell * 0.92, cell * 0.92), flat(C.ochre, { side: THREE.DoubleSide }));
pix.position.copy(pixLocal);
film.add(pix);
scene.updateMatrixWorld(true);
const pixWorld = film.localToWorld(pixLocal.clone());

// --- Shared drawing -------------------------------------------------------------
const dot = (p: THREE.Vector3, color: number, r = 0.07) => {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 12), flat(color, { depthTest: false }));
  m.position.copy(p);
  m.renderOrder = 5;
  scene.add(m);
  return m;
};
// The sphere of directions at a surface point: its open half, a hemisphere.
const HEMI = 0.55;
function hemisphere(p: THREE.Vector3, n: THREE.Vector3) {
  const g = new THREE.Group();
  g.position.copy(p);
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
  g.add(new THREE.Mesh(new THREE.SphereGeometry(HEMI, 48, 16, 0, 2 * Math.PI, 0, Math.PI / 2), flat(0x8fb5d6, { transparent: true, opacity: 0.24, side: THREE.DoubleSide, depthWrite: false })));
  g.add(polyline(Array.from({ length: 65 }, (_, i) => [HEMI * Math.cos((i / 64) * 2 * Math.PI), 0.002, HEMI * Math.sin((i / 64) * 2 * Math.PI)] as [number, number, number]), { color: 0x8fb5d6, width: 2, opacity: 0.8 }));
  scene.add(g);
  return g;
}

// --- Labels, facing the viewer --------------------------------------------------
const bill = stage.camera.quaternion.clone();
const SIZE = 0.3;
/** A letter with an optional subscript digit, centred near p, nudged by (dx, dy) on screen. */
function name(text: string, sub: string, p: THREE.Vector3, dx: number, dy: number, color: number = C.bone, size = SIZE) {
  const g = new THREE.Group();
  g.quaternion.copy(bill);
  const off = new THREE.Vector3(dx, dy, 0).applyQuaternion(bill);
  g.position.copy(p).add(off);
  const main = label(text, { size, color, anchorX: sub ? 'right' : 'center', anchorY: 'middle' });
  g.add(main);
  if (sub) g.add(label(sub, { size: size * 0.62, color, anchorX: 'left', anchorY: 'middle', position: [0.01, -size * 0.28, 0] }));
  g.userData.label = true;
  scene.add(g);
  return main;
}
const mid = (p: THREE.Vector3, r: THREE.Vector3, t: number) => p.clone().lerp(r, t);
name('A', '', lensC, -0.25, -0.62, 0x8fb5d6, 0.26);
name('pixel i', '', pixWorld, -0.2, -0.75, C.ash, 0.2);

// --- The ray caster: the short box, exactly (walls, balls, lamp) ---------------
type V = THREE.Vector3;
const BALLS: [V, number][] = [[white.position.clone(), 0.8], [blue.position.clone(), 0.55]];
const PLANES: { axis: 0 | 1 | 2; at: number }[] = [
  { axis: 1, at: 0 }, { axis: 1, at: 4 }, { axis: 2, at: -2 }, { axis: 0, at: -2 }, { axis: 0, at: 2 },
];
const LO = [-2, 0, -2];
const HI = [2, 4, 2];
/** The first thing a ray hits in the short box, or null if it leaves. */
function cast(o: V, d: V): { p: V; n: V; lamp: boolean } | null {
  let best = Infinity;
  let n: V | null = null;
  let lampHit = false;
  for (const [c, r] of BALLS) {
    const oc = o.clone().sub(c);
    const b = oc.dot(d);
    const disc = b * b - (oc.dot(oc) - r * r);
    if (disc <= 0) continue;
    const t = -b - Math.sqrt(disc);
    if (t > 1e-5 && t < best) {
      best = t;
      n = o.clone().addScaledVector(d, t).sub(c).normalize();
      lampHit = false;
    }
  }
  for (const { axis, at } of PLANES) {
    const dd = d.getComponent(axis);
    if (Math.abs(dd) < 1e-9) continue;
    const t = (at - o.getComponent(axis)) / dd;
    if (!(t > 1e-5 && t < best)) continue;
    const p = o.clone().addScaledVector(d, t);
    let inside = true;
    for (let k = 0; k < 3; k++) if (k !== axis && (p.getComponent(k) < LO[k]! - 1e-6 || p.getComponent(k) > HI[k]! + 1e-6)) inside = false;
    if (!inside) continue;
    best = t;
    n = new THREE.Vector3().setComponent(axis, -Math.sign(dd)); // facing the ray
    lampHit = axis === 1 && at === 4 && Math.abs(p.x) <= 0.6 && Math.abs(p.z) <= 0.6;
  }
  if (!n) return null;
  if (n.dot(d) > 0) n.negate();
  return { p: o.clone().addScaledVector(d, best), n, lamp: lampHit };
}
function rng32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

if (WALK) walkMode();
else if (SPACE && SPACE_N === 3) pairMode();
else if (SPACE && SPACE_N === 2) sliceMode();
else if (SPACE && SPACE_N === 1) netMode();
else if (SPACE) spaceMode();
else fixedPath();

// --- One fixed path, labelled ------------------------------------------------------
function fixedPath() {
  const PATHS: [number, number, number][][] = [
    [[0.15, 3.99, -0.1]],
    [[-0.2, 0.01, -0.1], [0.2, 3.99, 0.1]],
    [[-0.5, 0.01, 1.5], [-1.99, 2.3, 1.0], [0.3, 3.99, -0.2]],
  ];
  const normalAt = (p: THREE.Vector3) =>
    p.y < 0.05 ? new THREE.Vector3(0, 1, 0) : p.x < -1.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
  const xs = PATHS[N]!.map((p) => new THREE.Vector3(...p));
  const pts = [A, ...xs];
  // Inside the camera: pixel i to a, faint. Then the path, in the colour of light.
  scene.add(polyline([pixWorld, A], { color: C.ochre, width: 2, opacity: 0.55 }));
  scene.add(polyline(pts, { color: C.ochre, width: 4 }));
  dot(A, 0x8fb5d6, 0.06);
  xs.forEach((p, i) => dot(p, i === xs.length - 1 ? 0xfff3e0 : C.bone));
  xs.slice(0, -1).forEach((p) => hemisphere(p, normalAt(p)));
  name('a', '', A, 0.0, 0.26, 0x8fb5d6, 0.26);
  name('d', '', mid(A, xs[0]!, 0.22), 0.05, 0.28, C.ochre);
  const XOFF: [number, number][][] = [
    [[0.2, 0.42]],
    [[0.3, -0.32], [0.2, 0.42]],
    [[0.12, -0.38], [-0.3, 0.3], [0.2, 0.42]],
  ];
  xs.forEach((p, i) => {
    const [dx, dy] = XOFF[N]![i]!;
    name('x', String(i + 1), p, dx, dy);
  });
  xs.slice(0, -1).forEach((p, i) => name('u', String(i + 1), mid(p, xs[i + 1]!, 0.3), 0.32, 0.05, C.ochre));
}

// --- The space of paths of C E: the lens, laid out, the integrand over it ------------
function spaceMode() {
  // Pixel i's point of focus. Out of focus at the ceiling on purpose: the cone of
  // pixel i's rays lands on a patch of ceiling that straddles a corner of the lamp,
  // so only part of the lens sees the light.
  const CORNER = new THREE.Vector3(-0.42, 4, 0.42); // the cone's centre on the ceiling
  const F = lensC.clone().lerp(CORNER, 0.72);
  // Lens coordinates (s, t) along (right, up), and back.
  const onLens = (s: number, t: number) => lensC.clone().addScaledVector(right, s).addScaledVector(up, t);
  const lensST = (a: V): [number, number] => [a.clone().sub(lensC).dot(right), a.clone().sub(lensC).dot(up)];
  /** The lens point whose ray through F lands at X (the line X F, met with the lens plane). */
  const preimage = (X: V): [number, number] => {
    const dir = F.clone().sub(X);
    const lam = lensC.clone().sub(F).dot(axis) / dir.dot(axis);
    return lensST(F.clone().addScaledVector(dir, lam));
  };

  // The region of the lens whose rays reach the lamp: the disc, clipped by the
  // preimage of the lamp square (a quadrilateral: the map is projective).
  const quad = ([[-0.6, -0.6], [0.6, -0.6], [0.6, 0.6], [-0.6, 0.6]] as const).map(([x, z]) => preimage(new THREE.Vector3(x, 4, z)));
  let region: [number, number][] = Array.from({ length: 160 }, (_, i) => {
    const th = (i / 160) * 2 * Math.PI;
    return [LENS_R * Math.cos(th), LENS_R * Math.sin(th)];
  });
  const cx = quad.reduce((m, p) => m + p[0] / 4, 0);
  const cy = quad.reduce((m, p) => m + p[1] / 4, 0);
  for (let k = 0; k < 4; k++) {
    const [ax, ay] = quad[k]!;
    const [bx, by] = quad[(k + 1) % 4]!;
    const side = (x: number, y: number) => (bx - ax) * (y - ay) - (by - ay) * (x - ax);
    const sg = Math.sign(side(cx, cy));
    const inside = (p: [number, number]) => side(p[0], p[1]) * sg >= 0;
    const out: [number, number][] = [];
    region.forEach((P, i) => {
      const Q = region[(i + 1) % region.length]!;
      const pi = inside(P);
      const qi = inside(Q);
      if (pi) out.push(P);
      if (pi !== qi) {
        const sp = side(P[0], P[1]);
        const sq = side(Q[0], Q[1]);
        const u = sp / (sp - sq);
        out.push([P[0] + u * (Q[0] - P[0]), P[1] + u * (Q[1] - P[1])]);
      }
    });
    region = out;
  }

  // The paths: lens points spread over the disc (a sunflower), each ray through F.
  const COUNT = 34;
  const GOLD = Math.PI * (3 - Math.sqrt(5));
  const order = Array.from({ length: COUNT }, (_, i) => i);
  const rnd = rng32(7);
  for (let i = COUNT - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  const rays = order.map((i) => {
    const r = LENS_R * 0.94 * Math.sqrt((i + 0.5) / COUNT);
    const th = i * GOLD;
    const st: [number, number] = [r * Math.cos(th), r * Math.sin(th)];
    const a = onLens(...st);
    const h = cast(a, F.clone().sub(a).normalize());
    const end = h ? h.p : a.clone().addScaledVector(F.clone().sub(a).normalize(), 12);
    return { st, a, end, lamp: !!h?.lamp };
  });
  console.log('rays reaching the lamp:', rays.filter((r) => r.lamp).length, 'of', COUNT);

  // The lens laid out: where the copy of the disc lands, flat, and how big.
  const LAND = new THREE.Vector3(4.5, 0.15, 2.6);
  const R_FLAT = 1.75;
  const S = R_FLAT / LENS_R;
  const H = 1.25; // the height of E on the lamp, in world units
  const qStart = cam.quaternion.clone();
  const qEnd = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2 + 0.6, 0, 0));

  const copy = new THREE.Group(); // lens-local: the disc in xy, height along +z
  scene.add(copy);
  const discFill = new THREE.Mesh(new THREE.CircleGeometry(LENS_R, 96), flat(0x8fb5d6, { transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
  copy.add(discFill);
  copy.add(polyline(Array.from({ length: 97 }, (_, i) => [LENS_R * Math.cos((i / 96) * 2 * Math.PI), LENS_R * Math.sin((i / 96) * 2 * Math.PI), 0] as [number, number, number]), { color: 0x8fb5d6, width: 2.5 }));
  // The integrand: E on the region, 0 off it. A flat-topped block.
  const shape = new THREE.Shape(region.map(([x, y]) => new THREE.Vector2(x, y)));
  const block = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, { depth: H / S, bevelEnabled: false, curveSegments: 1 }),
    new THREE.MeshStandardMaterial({ color: C.ochre, roughness: 0.6, transparent: true, opacity: 0.0, depthWrite: false }),
  );
  copy.add(block);
  const rim = polyline([...region, region[0]!].map(([x, y]) => [x, y, H / S] as [number, number, number]), { color: 0xffd58a, width: 2.5, opacity: 0 });
  copy.add(rim);

  // Rays in the scene, and the lens points, and their copies on the laid-out disc.
  const ends = rays.map((r) => dot(r.end, r.lamp ? 0xfff3e0 : C.ash, 0.035));
  const rayLines = rays.map((r) => {
    const l = polyline([r.a, r.end], { color: r.lamp ? C.ochre : C.slate, width: r.lamp ? 2.5 : 1.8, opacity: r.lamp ? 0.85 : 0.5 });
    scene.add(l);
    return l;
  });
  const lensDots = rays.map((r) => dot(r.a, r.lamp ? C.ochre : C.ash, 0.028));
  const flatDots = rays.map((r) => dot(r.a, r.lamp ? C.ochre : C.ash, 0.05));
  const spikes = rays.map((r) => {
    const l = polyline([r.a, r.a], { color: C.ochre, width: 2.5 });
    l.visible = r.lamp;
    scene.add(l);
    return l;
  });
  const tops = rays.map((r) => {
    const m = dot(r.a, 0xffd58a, 0.05);
    m.visible = false;
    return m;
  });
  const aLabel = name('A', '', LAND, -R_FLAT - 0.2, 0.15, 0x8fb5d6, 0.32);
  aLabel.visible = false;
  scene.add(polyline([pixWorld, lensC], { color: C.ochre, width: 1.5, opacity: 0.4 }));

  // Timeline.
  const T_RAY = 0.11; // one ray after another
  const T0 = 0.5;
  const T1 = T0 + COUNT * T_RAY + 0.8; // the copy leaves the lens
  const T2 = T1 + 2.2; // and lands, flat
  const T3 = T2 + 1.4; // the spikes are up
  const T4 = T3 + 1.2; // the whole graph is in
  stage.duration = T4 + 4.5;
  const ease = (x: number) => {
    const u = Math.min(Math.max(x, 0), 1);
    return u * u * (3 - 2 * u);
  };
  const local = new THREE.Vector3();

  stage.frame((t) => {
    const u = t % stage.duration;
    rays.forEach((_, i) => {
      const on = u >= T0 + i * T_RAY;
      rayLines[i]!.visible = on;
      ends[i]!.visible = on;
      lensDots[i]!.visible = on;
    });
    const m = ease((u - T1) / (T2 - T1));
    copy.visible = u >= T1;
    copy.position.copy(lensC).lerp(LAND, m);
    copy.position.y += Math.sin(Math.PI * m) * 1.6; // lift, then set down
    copy.position.z += Math.sin(Math.PI * m) * 3.2; // in front of the box, not through it
    copy.quaternion.copy(qStart).slerp(qEnd, m);
    copy.scale.setScalar(1 + (S - 1) * m);
    copy.updateMatrixWorld(true);
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(copy.quaternion);
    const rise = ease((u - T2) / (T3 - T2));
    rays.forEach((r, i) => {
      local.set(r.st[0], r.st[1], 0);
      const base = copy.localToWorld(local.clone());
      flatDots[i]!.visible = u >= T1;
      flatDots[i]!.position.copy(base);
      flatDots[i]!.scale.setScalar(0.55 + 0.45 * m);
      if (r.lamp) {
        const topP = base.clone().add(normal.clone().multiplyScalar(H * rise));
        spikes[i]!.visible = u >= T2;
        setPolyline(spikes[i]!, [base, topP]);
        tops[i]!.visible = u >= T2 + 0.05;
        tops[i]!.position.copy(topP);
      }
    });
    const g = ease((u - T3) / (T4 - T3));
    (block.material as THREE.MeshStandardMaterial).opacity = 0.55 * g;
    (rim.material as unknown as { opacity: number }).opacity = g;
    aLabel.visible = u >= T2;
  });
}

// --- The space of paths of C T E: the room unfolded, paths grouped by where they bounce ---
function netMode() {
  // The box's five faces, unfolded about the floor into a net on the plane y = 0:
  // the floor in the middle, the back wall behind it, the red and green walls to
  // either side, the ceiling (and the lamp) beyond the red wall. Each face is a
  // pivot on its hinge; folded, they are the room.
  type Face = {
    name: string; color: number; albedo: number;
    x0: number; x1: number; z0: number; z1: number; // its rectangle in the net
    room: (x: number, z: number) => V; n: V; // the net point's place in the room, and the normal there
    pivot: THREE.Group; hinge: V; axis: 'x' | 'z'; fold: number; parent?: string;
  };
  const lum = (c: number) => {
    const col = new THREE.Color(c);
    return 0.2126 * col.r + 0.7152 * col.g + 0.0722 * col.b;
  };
  const faces: Face[] = [
    { name: 'floor', color: WHITE, albedo: lum(WHITE), x0: -2, x1: 2, z0: -2, z1: 2, room: (x, z) => new THREE.Vector3(x, 0, z), n: new THREE.Vector3(0, 1, 0), pivot: new THREE.Group(), hinge: new THREE.Vector3(0, 0, 0), axis: 'x', fold: 0 },
    { name: 'back', color: WHITE, albedo: lum(WHITE), x0: -2, x1: 2, z0: -6, z1: -2, room: (x, z) => new THREE.Vector3(x, -2 - z, -2), n: new THREE.Vector3(0, 0, 1), pivot: new THREE.Group(), hinge: new THREE.Vector3(0, 0, -2), axis: 'x', fold: Math.PI / 2 },
    { name: 'red', color: RED, albedo: lum(RED), x0: -6, x1: -2, z0: -2, z1: 2, room: (x, z) => new THREE.Vector3(-2, -2 - x, z), n: new THREE.Vector3(1, 0, 0), pivot: new THREE.Group(), hinge: new THREE.Vector3(-2, 0, 0), axis: 'z', fold: -Math.PI / 2 },
    { name: 'green', color: GREEN, albedo: lum(GREEN), x0: 2, x1: 6, z0: -2, z1: 2, room: (x, z) => new THREE.Vector3(2, x - 2, z), n: new THREE.Vector3(-1, 0, 0), pivot: new THREE.Group(), hinge: new THREE.Vector3(2, 0, 0), axis: 'z', fold: Math.PI / 2 },
    { name: 'ceiling', color: WHITE, albedo: lum(WHITE), x0: -10, x1: -6, z0: -2, z1: 2, room: (x, z) => new THREE.Vector3(-8 - x, 4, z), n: new THREE.Vector3(0, -1, 0), pivot: new THREE.Group(), hinge: new THREE.Vector3(-6, 0, 0), axis: 'z', fold: -Math.PI / 2, parent: 'red' },
  ];
  const byName = Object.fromEntries(faces.map((f) => [f.name, f]));
  for (const f of faces) {
    const par = f.parent ? byName[f.parent]! : null;
    f.pivot.position.copy(par ? f.hinge.clone().sub(par.hinge) : f.hinge);
    (par ? par.pivot : scene).add(f.pivot);
  }

  // The integrand, for the picture: the lamp's light arriving at the bounce point
  // x_1, times the surface's colour (summed over where on the lamp the path
  // ends, by a 6 x 6 grid of lamp points, each checked for a clear line).
  const LS = 6;
  const lampPts: V[] = [];
  for (let i = 0; i < LS; i++) for (let j = 0; j < LS; j++) lampPts.push(new THREE.Vector3(-0.6 + (1.2 * (i + 0.5)) / LS, 4, -0.6 + (1.2 * (j + 0.5)) / LS));
  function light(p: V, n: V): number {
    let sum = 0;
    const o = p.clone().addScaledVector(n, 1e-3);
    for (const L of lampPts) {
      const w = L.clone().sub(p);
      const r2 = w.lengthSq();
      w.normalize();
      const c1 = w.dot(n);
      const cL = w.y; // the lamp faces down
      if (c1 <= 0 || cL <= 0) continue;
      const h = cast(o, w);
      if (!h || !h.lamp) continue;
      sum += (c1 * cL) / r2;
    }
    return (sum * 1.44) / lampPts.length / Math.PI;
  }
  const insideBall = (p: V) => [white, blue].some((b) => p.distanceTo(b.position) < (b === white ? 0.8 : 0.55));
  const G = 72;
  const heights = faces.map((f) => {
    const hs = new Float32Array((G + 1) * (G + 1));
    for (let i = 0; i <= G; i++)
      for (let j = 0; j <= G; j++) {
        const x = f.x0 + ((f.x1 - f.x0) * j) / G;
        const z = f.z0 + ((f.z1 - f.z0) * i) / G;
        const p = f.room(x, z);
        hs[i * (G + 1) + j] = insideBall(p) ? 0 : f.albedo * light(p, f.n);
      }
    return hs;
  });
  const MAXH = Math.max(...heights.map((h) => Math.max(...h)));
  const HWORLD = 1.7; // the tallest point of the graph, in world units
  // Drawn with its heights compressed (a power 0.6), so the dim walls still show
  // their shape beside the bright floor: a schematic, not to scale.
  const shape = (h: number) => Math.pow(h / MAXH, 0.6) * HWORLD;
  const meshes = faces.map((f, k) => {
    const geo = new THREE.PlaneGeometry(f.x1 - f.x0, f.z1 - f.z0, G, G);
    geo.rotateX(-Math.PI / 2); // into the plane, facing up
    const pos = geo.attributes.position as THREE.BufferAttribute;
    // PlaneGeometry rows run from +z to -z after the rotation; index by position instead.
    for (let v = 0; v < pos.count; v++) {
      const lx = pos.getX(v) + (f.x0 + f.x1) / 2;
      const lz = pos.getZ(v) + (f.z0 + f.z1) / 2;
      const j = Math.round(((lx - f.x0) / (f.x1 - f.x0)) * G);
      const i = Math.round(((lz - f.z0) / (f.z1 - f.z0)) * G);
      pos.setY(v, shape(heights[k]![i * (G + 1) + j]!));
    }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, matte(f.color, { side: THREE.DoubleSide }));
    const par = f.parent ? byName[f.parent]! : null;
    const origin = par ? par.hinge.clone().add(f.pivot.position) : f.hinge;
    m.position.set((f.x0 + f.x1) / 2 - origin.x, 0, (f.z0 + f.z1) / 2 - origin.z);
    m.scale.y = 0.001;
    f.pivot.add(m);
    // Its edge, so the faces read as separate groups once flat.
    const e = polyline([[f.x0, 0.01, f.z0], [f.x1, 0.01, f.z0], [f.x1, 0.01, f.z1], [f.x0, 0.01, f.z1], [f.x0, 0.01, f.z0]].map(([x, y, z]) => [x! - origin.x, y!, z! - origin.z] as [number, number, number]), { color: C.slate, width: 1.5 });
    f.pivot.add(e);
    return m;
  });
  // The lamp rides on the ceiling.
  const ceil = byName.ceiling!;
  const ceilOrigin = byName.red!.hinge.clone().add(ceil.pivot.position);
  const lampFlat = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), glow(0xfff3e0, 2.2));
  lampFlat.rotation.x = -Math.PI / 2;
  lampFlat.position.set(-8 - ceilOrigin.x, 0.02, 0 - ceilOrigin.z);
  ceil.pivot.add(lampFlat);
  for (const o of roomParts) o.visible = false;
  lamp.visible = false;

  // Paths from the camera that bounce once: a on the lens, a ray into the box to
  // x_1 (on a wall or the floor), then on toward a point of the lamp.
  const rnd = rng32(11);
  const toNet = (p: V): { f: Face; x: number; z: number } | null => {
    if (p.y < 1e-3) return { f: byName.floor!, x: p.x, z: p.z };
    if (p.z < -2 + 1e-3) return { f: byName.back!, x: p.x, z: -2 - p.y };
    if (p.x < -2 + 1e-3) return { f: byName.red!, x: -2 - p.y, z: p.z };
    if (p.x > 2 - 1e-3) return { f: byName.green!, x: p.y + 2, z: p.z };
    return null;
  };
  type Path = { a: V; x1: V; end: V; lamp: boolean; net: { f: Face; x: number; z: number } };
  const paths: Path[] = [];
  while (paths.length < 16) {
    const r = LENS_R * Math.sqrt(rnd());
    const phi = 2 * Math.PI * rnd();
    const a = lensC.clone().addScaledVector(right, r * Math.cos(phi)).addScaledVector(up, r * Math.sin(phi));
    const target = new THREE.Vector3(-1.9 + 3.8 * rnd(), 0.1 + 3.8 * rnd(), -1.9 + 3.8 * rnd());
    const h = cast(a, target.clone().sub(a).normalize());
    if (!h || h.lamp) continue;
    const net = toNet(h.p);
    if (!net) continue; // a ball, or the ceiling: left out of this picture
    if (net.f.n.dot(target.clone().sub(a)) >= 0) continue; // the outside of a wall
    const L = new THREE.Vector3(-0.6 + 1.2 * rnd(), 4, -0.6 + 1.2 * rnd());
    const w = L.clone().sub(h.p).normalize();
    const h2 = cast(h.p.clone().addScaledVector(h.n, 1e-3), w);
    paths.push({ a, x1: h.p, end: h2 ? h2.p : L, lamp: !!h2?.lamp, net });
  }
  const pathLines = paths.map((p) => {
    const l = polyline([p.a, p.x1, p.end], { color: p.lamp ? C.ochre : C.slate, width: p.lamp ? 3 : 2, opacity: p.lamp ? 0.95 : 0.6 });
    scene.add(l);
    return l;
  });
  // Each path's bounce point, riding on its face; it rises with the graph.
  const pathDots = paths.map((p) => {
    const f = p.net.f;
    const par = f.parent ? byName[f.parent]! : null;
    const origin = par ? par.hinge.clone().add(f.pivot.position) : f.hinge;
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.09, 20, 10), flat(p.lamp ? C.ochre : C.ash));
    m.renderOrder = 6;
    m.position.set(p.net.x - origin.x, 0.03, p.net.z - origin.z);
    f.pivot.add(m);
    const k = faces.indexOf(f);
    const i = Math.round(((p.net.z - f.z0) / (f.z1 - f.z0)) * G);
    const j = Math.round(((p.net.x - f.x0) / (f.x1 - f.x0)) * G);
    return { m, h: shape(heights[k]![i * (G + 1) + j]!) };
  });

  // Timeline, and the viewer's move from the room to above the net.
  const T_P = 0.22;
  const T0 = 0.5;
  const T1 = T0 + paths.length * T_P + 1.2; // unfold
  const T2 = T1 + 3.2;
  const T3 = T2 + 2.2; // the graph is up
  stage.duration = T3 + 5;
  const ease = (x: number) => {
    const u = Math.min(Math.max(x, 0), 1);
    return u * u * (3 - 2 * u);
  };
  const P1 = stage.camera.position.clone();
  const L1 = new THREE.Vector3(-1.5, 2.0, 1.5);
  const P2 = new THREE.Vector3(-2, 13.5, 9.5);
  const L2 = new THREE.Vector3(-2, 0.2, -1.4);
  const look = new THREE.Vector3();
  stage.frame((t) => {
    const u = t % stage.duration;
    pathLines.forEach((l, i) => (l.visible = u >= T0 + i * T_P && u < T1 + 0.4));
    pathDots.forEach((d, i) => (d.m.visible = u >= T0 + i * T_P));
    const m = ease((u - T1) / (T2 - T1));
    for (const f of faces) f.pivot.rotation[f.axis] = f.fold * (1 - m);
    const hide = u >= T1;
    cam.visible = !hide;
    white.visible = blue.visible = !hide;
    for (const o of scene.children) if ((o as { userData: { label?: boolean } }).userData.label) o.visible = !hide;
    stage.camera.position.copy(P1).lerp(P2, m);
    look.copy(L1).lerp(L2, m);
    stage.camera.lookAt(look);
    const rise = ease((u - T2) / (T3 - T2));
    for (const mesh of meshes) mesh.scale.y = Math.max(0.001, rise);
    pathDots.forEach((d) => (d.m.position.y = 0.03 + d.h * rise));
  });
}

// --- The space of paths of C T E as a region, with the integrand over it ------------
function sliceMode() {
  for (const o of roomParts) o.visible = false;
  lamp.visible = white.visible = blue.visible = cam.visible = false;
  for (const o of scene.children) if ((o as { userData: { label?: boolean } }).userData.label) o.visible = false;
  const holder = new THREE.Group();
  scene.add(holder);
  slice(holder, 0.5);
  stage.duration = 10;
}

// --- The box with the cartoon's path, and its space of paths right beside it -----------
function pairMode() {
  fixedPath();
  const holder = new THREE.Group();
  holder.position.set(PAIR_AT[0], PAIR_AT[1], PAIR_AT[2]);
  holder.rotation.set(PAIR_TILT, PAIR_YAW, 0, 'YXZ');
  holder.scale.setScalar(PAIR_SCALE);
  scene.add(holder);
  slice(holder, 0.32);
  stage.duration = 10;
}

/** The slice of A x S^2 with the integrand over it, built into `holder` (plate coordinates). */
function slice(holder: THREE.Group, labelSize: number) {
  holder.updateMatrixWorld(true);
  const W = (v: THREE.Vector3) => holder.localToWorld(v.clone());

  // A x S^2 is four-dimensional; the region drawn is a true two-dimensional
  // slice of it: one line across the lens (through the cartoon's lens point a,
  // along the camera's horizontal), by one half-circle of directions u_1 at x_1
  // (in the vertical plane of the cartoon's u_1). Pixel i is the cartoon's: its
  // ray from a lands on the floor at the cartoon's x_1, and it is focused 0.4 of
  // the way there, so other lens points land elsewhere on the floor, some of
  // them in a ball's shadow (all on the floor). The cartoon's own path is one point of the
  // slice, marked.
  const X1 = new THREE.Vector3(-0.2, 0, -0.1);
  const X2 = new THREE.Vector3(0.2, 4, 0.1);
  const F = A.clone().lerp(X1, FOCUS);
  const HALF = Math.sqrt(LENS_R * LENS_R - 0.16 * 0.16); // the half-length of the line across the lens
  const lensAt = (r: number) => lensC.clone().addScaledVector(up, 0.16).addScaledVector(right, r);
  const TDIR = X2.clone().sub(X1).setY(0).normalize(); // horizontal, in the plane of the cartoon's u_1
  const albedoAt = (p: V) => {
    const lumOf = (c: number) => {
      const col = new THREE.Color(c);
      return 0.2126 * col.r + 0.7152 * col.g + 0.0722 * col.b;
    };
    if (Math.abs(p.distanceTo(white.position) - 0.8) < 1e-3) return lumOf(0xd8d4cc);
    if (Math.abs(p.distanceTo(blue.position) - 0.55) < 1e-3) return lumOf(0x5a72c8);
    if (p.x < -2 + 1e-3) return lumOf(RED);
    if (p.x > 2 - 1e-3) return lumOf(GREEN);
    return lumOf(WHITE);
  };
  /** The integrand of C T E at (a, u_1): f cos(theta_1) E(x_2), for a matte surface f = albedo / pi. */
  function integrand(s: number, alpha: number): number {
    const a = lensAt(s);
    const h = cast(a, F.clone().sub(a).normalize());
    if (!h || h.lamp) return 0;
    const n = h.n;
    const t = TDIR.clone().addScaledVector(n, -TDIR.dot(n)).normalize();
    const u = n.clone().multiplyScalar(Math.cos(alpha)).addScaledVector(t, Math.sin(alpha));
    const h2 = cast(h.p.clone().addScaledVector(n, 1e-3), u);
    return h2?.lamp ? (albedoAt(h.p) * Math.cos(alpha)) / Math.PI : 0;
  }
  const toS = (x: number) => (x / FIELD_HALF) * HALF * 0.98;
  const toAlpha = (z: number) => (z / FIELD_HALF) * (Math.PI / 2) * 0.995;
  let max = 0;
  for (let i = 0; i <= 80; i++) for (let j = 0; j <= 80; j++) max = Math.max(max, integrand(toS(-3 + (6 * i) / 80), toAlpha(-3 + (6 * j) / 80)));
  const K = 1.25 / (Z * Math.max(max, 1e-9));
  const f = (x: number, z: number) => K * integrand(toS(x), toAlpha(z));
  holder.add(floorPlate(12));
  holder.add(glassSurface(f, { res: 220, wire: 44 }));
  holder.add(surfaceRim(f));
  // The axes: A across, S^2 in depth.
  name('A', '', W(new THREE.Vector3(0, 0, FIELD_HALF + 0.55)), 0, 0, 0x8fb5d6, labelSize);
  name('S²', '', W(new THREE.Vector3(FIELD_HALF + 0.65, 0, 0)), 0, 0, 0x8fb5d6, labelSize);
  // The cartoon's path: a is 0.2 to the right of the lens centre, u_1 points at X2.
  const u1 = X2.clone().sub(X1).normalize();
  const alpha1 = Math.atan2(u1.dot(TDIR), u1.y);
  const px = (0.2 / (HALF * 0.98)) * FIELD_HALF;
  const pz = (alpha1 / ((Math.PI / 2) * 0.995)) * FIELD_HALF;
  const top = new THREE.Vector3(px, f(px, pz) * Z, pz);
  holder.add(polyline([new THREE.Vector3(px, 0.01, pz), top], { color: C.ochre, width: 3 }));
  dot(W(new THREE.Vector3(px, 0.01, pz)), C.ochre, 0.08 * holder.scale.x);
  dot(W(top), C.ochre, 0.08 * holder.scale.x);
}

// --- Random walks ----------------------------------------------------------------
function walkMode() {
  const CAP = 6;
  // Pixel i's point of focus: every ray from pixel i through the lens passes it.
  // Inside the box, so the rays go in through the open front.
  const F = new THREE.Vector3(0.6, 1.5, -0.2);
  type Walk = { pts: V[]; normals: V[]; end: 'lamp' | 'escape' | 'cap' };
  function walk(rnd: () => number): Walk {
    const r = LENS_R * Math.sqrt(rnd());
    const phi = 2 * Math.PI * rnd();
    const a = lensC.clone().addScaledVector(right, r * Math.cos(phi)).addScaledVector(up, r * Math.sin(phi));
    const pts = [a];
    const normals: V[] = [];
    let o = a;
    let d = F.clone().sub(a).normalize();
    for (let k = 0; ; k++) {
      const h = cast(o, d);
      if (!h) {
        pts.push(o.clone().addScaledVector(d, 2));
        return { pts, normals, end: 'escape' };
      }
      pts.push(h.p);
      if (h.lamp) return { pts, normals, end: 'lamp' };
      if (k === CAP) return { pts, normals, end: 'cap' };
      normals.push(h.n);
      // A cosine-weighted direction about the normal.
      const u1 = rnd();
      const u2 = 2 * Math.PI * rnd();
      const s = Math.sqrt(u1);
      const t1 = new THREE.Vector3(1, 0, 0);
      if (Math.abs(h.n.x) > 0.9) t1.set(0, 1, 0);
      const tx = t1.sub(h.n.clone().multiplyScalar(t1.dot(h.n))).normalize();
      const ty = new THREE.Vector3().crossVectors(h.n, tx);
      d = tx.multiplyScalar(s * Math.cos(u2)).add(ty.multiplyScalar(s * Math.sin(u2))).addScaledVector(h.n, Math.sqrt(1 - u1)).normalize();
      o = h.p;
    }
  }
  // ?buckets: N1 walks one at a time (slow, then faster), then RAPID walks fired at
  // RATE a second, each flashing whole for LIFE seconds.
  const N1 = 30;
  const RAPID = 1800;
  const RATE = 60;
  const LIFE = 0.22;
  const COUNT = BUCKETS ? N1 + RAPID : 40;
  let seed = 1;
  for (; seed < 10000; seed++) {
    const rnd = rng32(seed);
    if ([0, 1, 2].some(() => walk(rnd).end === 'lamp')) break;
  }
  const rnd = rng32(seed);
  const walks = Array.from({ length: COUNT }, () => walk(rnd));
  console.log('walks reaching the lamp:', walks.filter((w) => w.end === 'lamp').length, 'of', COUNT);

  // Timing: each segment of walk w grows in seg[w] seconds; the walk then holds
  // hold[w]. With ?buckets the first few are slow, then they speed up.
  const SLOW = 6;
  const seg = walks.map((_, i) => (BUCKETS ? Math.max(0.016, 0.4 * Math.pow(0.84, Math.max(0, i - SLOW))) : 0.4));
  const hold = walks.map((_, i) => (BUCKETS ? Math.max(0.03, 1.6 * Math.pow(0.8, Math.max(0, i - SLOW))) : 1.6));
  const starts: number[] = [];
  const doneAt: number[] = [];
  const ONE = BUCKETS ? N1 : COUNT; // walks shown one at a time
  let total = 0.6;
  walks.slice(0, ONE).forEach((w, i) => {
    starts.push(total);
    doneAt.push(total + (w.pts.length - 1) * seg[i]!);
    total += (w.pts.length - 1) * seg[i]! + hold[i]!;
  });
  const T2 = total; // rapid fire starts
  for (let i = ONE; i < COUNT; i++) {
    starts.push(T2 + (i - ONE) / RATE);
    doneAt.push(T2 + (i - ONE) / RATE);
  }
  stage.duration = BUCKETS ? T2 + RAPID / RATE + 5 : total;

  // Earlier walks stay, faint, in their outcome's colour (the last KEEP of them).
  const KEEP = 12;
  const ghosts = walks.map((w) => {
    const l = polyline(w.pts, { color: w.end === 'lamp' ? C.ochre : C.slate, width: 2, opacity: w.end === 'lamp' ? 0.55 : 0.3 });
    l.visible = false;
    scene.add(l);
    return l;
  });
  const MAXP = CAP + 3;
  const live = polyline(Array.from({ length: MAXP }, () => A), { color: C.slate, width: 4 });
  scene.add(live);
  const lensDot = dot(A, 0x8fb5d6, 0.06);
  const hemis: THREE.Group[] = [];
  const SUP = ['', '', '²', '³', '⁴', '⁵', '⁶'];
  const termName = (n: number) => (n === 0 ? 'C E' : n === 1 ? 'C T E' : `C T${SUP[n]} E`);
  const readout = name('', '', lensC, 0.2, 2.1, C.bone, 0.26);
  readout.anchorX = 'left';

  // ?buckets: a row of buckets under the box, one per term C T^n E. A walk that
  // reaches the lamp after n bounces flies, shrunk, into bucket n and leaves a
  // tally there.
  const NB = 6; // buckets for n = 0 .. 4, and one for every longer path (n >= 5)
  // Level on screen: each bucket's name sits at a fixed point of the frame, at a fixed distance.
  const bucketAt = (n: number) => {
    const ndc = new THREE.Vector3(-0.66 + 0.262 * Math.min(n, NB - 1), -0.5, 0.5).unproject(stage.camera);
    const dir = ndc.sub(stage.camera.position).normalize();
    return stage.camera.position.clone().addScaledVector(dir, 11.5);
  };
  const FLY = walks.map(() => 0.6);
  const tallies: THREE.Mesh[][] = [];
  const flyers: THREE.Object3D[] = [];
  const rapid: THREE.Object3D[] = [];
  if (BUCKETS) {
    for (let n = 0; n < NB; n++) {
      const c = bucketAt(n);
      const g = new THREE.Group();
      g.quaternion.copy(bill);
      g.position.copy(c);
      const lab = label(n === NB - 1 ? '⋯' : termName(n), { size: 0.36, color: C.bone, anchorX: 'center', anchorY: 'middle' });
      g.add(lab);
      // The bucket: an open-topped tray under the name.
      const W2 = 0.85;
      g.add(polyline([[-W2, -0.32, 0], [-W2, -1.55, 0], [W2, -1.55, 0], [W2, -0.32, 0]], { color: C.slate, width: 2 }));
      scene.add(g);
      const row: THREE.Mesh[] = [];
      for (let k = 0; k < 40; k++) {
        const m = new THREE.Mesh(new THREE.CircleGeometry(0.075, 16), flat(C.ochre));
        m.position.set(-W2 + 0.2 + (k % 8) * 0.2, -1.4 + Math.floor(k / 8) * 0.2, 0.01);
        m.visible = false;
        g.add(m);
        row.push(m);
      }
      tallies.push(row);
    }
    for (let k = 0; k < Math.ceil(RATE * LIFE) + 3; k++) {
      const l = polyline(Array.from({ length: MAXP }, () => A), { color: C.slate, width: 1.5, opacity: 0.6 });
      l.visible = false;
      scene.add(l);
      rapid.push(l);
    }
    for (let k = 0; k < 12; k++) {
      const l = polyline(Array.from({ length: MAXP }, () => A), { color: C.ochre, width: 2.5 });
      l.visible = false;
      scene.add(l);
      flyers.push(l);
    }
  }

  let shownWalk = -1;
  stage.frame((t) => {
    const u = t % stage.duration;
    let w = 0;
    while (w + 1 < ONE && starts[w + 1]! <= u) w++;
    const inRapid = BUCKETS && u >= T2;
    live.visible = lensDot.visible = !inRapid;
    if (inRapid) ghosts.forEach((g) => (g.visible = false));
    const W = walks[w]!;
    if (w !== shownWalk) {
      shownWalk = w;
      ghosts.forEach((g, i) => (g.visible = i < w && i >= w - KEEP));
      for (const h of hemis) scene.remove(h);
      hemis.length = 0;
      W.normals.forEach((n, i) => {
        const h = hemisphere(W.pts[i + 1]!, n);
        h.visible = false;
        hemis.push(h);
      });
      lensDot.position.copy(W.pts[0]!);
    }
    const local = Math.max(0, u - starts[w]!);
    const segs = W.pts.length - 1;
    const grown = Math.min(segs, local / seg[w]!);
    const k = Math.floor(grown);
    const pts = W.pts.slice(0, k + 1);
    if (k < segs) pts.push(W.pts[k]!.clone().lerp(W.pts[k + 1]!, grown - k));
    while (pts.length < MAXP) pts.push(pts[pts.length - 1]!.clone()); // setPolyline keeps a fixed vertex count
    setPolyline(live, pts);
    const done = grown >= segs;
    const lit = done && W.end === 'lamp';
    (live.material as unknown as { color: THREE.Color }).color.set(lit ? C.ochre : C.slate);
    // The hemisphere where the walk is choosing its next direction.
    hemis.forEach((h, i) => (h.visible = seg[w]! > 0.15 && !done && i + 1 <= grown && i + 1 > grown - 1));
    const bounces = Math.min(k, W.normals.length);
    let text = `walk ${w + 1}: ${bounces} bounce${bounces === 1 ? '' : 's'}`;
    if (done) {
      const n = W.pts.length - 2;
      text =
        W.end === 'lamp'
          ? `walk ${w + 1}: reached the light after ${n} bounce${n === 1 ? '' : 's'}: a sample of ${termName(n)}`
          : W.end === 'escape'
            ? `walk ${w + 1}: left the box: adds 0`
            : `walk ${w + 1}: gave up after ${CAP} bounces: adds 0`;
    }
    if (inRapid) {
      const fired = Math.min(RAPID, Math.floor((u - T2) * RATE) + 1);
      const hits = walks.slice(0, ONE + fired).filter((x) => x.end === 'lamp').length;
      text = `${ONE + fired} walks: ${hits} reached the light`;
      hemis.forEach((h) => (h.visible = false));
      shownWalk = -1;
      // The walks in flight right now, each shown whole for LIFE seconds.
      rapid.forEach((l) => (l.visible = false));
      let r = 0;
      for (let i = Math.max(ONE, ONE + fired - Math.ceil(RATE * LIFE) - 1); i < ONE + fired && r < rapid.length; i++) {
        if (u - starts[i]! > LIFE) continue;
        const ps = walks[i]!.pts.slice();
        while (ps.length < MAXP) ps.push(ps[ps.length - 1]!.clone());
        const l = rapid[r++]!;
        setPolyline(l as never, ps);
        ((l as unknown as { material: { color: THREE.Color } }).material).color.set(walks[i]!.end === 'lamp' ? C.ochre : C.slate);
        l.visible = true;
      }
    }
    setText(readout, text);

    if (!BUCKETS) return;
    // Tallies: every lamp walk whose flight has landed.
    const counts = new Array(NB).fill(0);
    let fl = 0;
    flyers.forEach((f) => (f.visible = false));
    walks.forEach((wk, i) => {
      if (wk.end !== 'lamp') return;
      const n = Math.min(wk.pts.length - 2, NB - 1);
      const t0 = doneAt[i]!;
      const t1 = t0 + FLY[i]!;
      if (u >= t1) counts[n]++;
      else if (u >= t0 && fl < flyers.length) {
        // In flight: the path shrinks toward its bucket.
        const e = (u - t0) / (t1 - t0);
        const ee = e * e * (3 - 2 * e);
        const cen = wk.pts.reduce((m, p) => m.add(p), new THREE.Vector3()).multiplyScalar(1 / wk.pts.length);
        const target = bucketAt(n).clone().add(new THREE.Vector3(0, -0.9, 0).applyQuaternion(bill));
        const sc = 1 - 0.88 * ee;
        const ps = wk.pts.map((p) => p.clone().sub(cen).multiplyScalar(sc).add(cen.clone().lerp(target, ee)));
        while (ps.length < MAXP) ps.push(ps[ps.length - 1]!.clone());
        const f = flyers[fl++]!;
        setPolyline(f as never, ps);
        f.visible = true;
      }
    });
    tallies.forEach((row, n) => row.forEach((m, j) => (m.visible = j < counts[n])));
  });
}

stage.start();
