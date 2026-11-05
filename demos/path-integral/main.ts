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
 */

import * as THREE from 'three';
import { createStage, C, matte, glossy, glow, flat } from '@';
import { polyline, setPolyline } from '@/lines';
import { label, setText } from '@/text';

const q = new URLSearchParams(location.search);
const N = Math.max(0, Math.min(2, Number(q.get('n') ?? 0)));
const WALK = q.has('walk');

const stage = createStage({ camera: 'persp', position: [-0.4, 3.0, 15.5], target: [-1.5, 1.05, 1.5], fov: 31, lights: false, controls: false });
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
function wall(c: [number, number, number], n: THREE.Vector3, color: number) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), matte(color, { side: THREE.FrontSide }));
  m.position.set(...c);
  m.lookAt(m.position.clone().add(n));
  scene.add(m);
}
wall([0, 0, 0], new THREE.Vector3(0, 1, 0), WHITE);
wall([0, 4, 0], new THREE.Vector3(0, -1, 0), WHITE);
wall([0, 2, -2], new THREE.Vector3(0, 0, 1), WHITE);
wall([-2, 2, 0], new THREE.Vector3(1, 0, 0), RED);
wall([2, 2, 0], new THREE.Vector3(-1, 0, 0), GREEN);
// The open front's rim, so the box reads as a box.
scene.add(polyline([[-2, 0, 2], [-2, 4, 2], [2, 4, 2], [2, 0, 2], [-2, 0, 2]], { color: C.slate, width: 2 }));
scene.add(polyline([[-2, 0, -2], [-2, 4, -2], [2, 4, -2], [2, 0, -2], [-2, 0, -2]], { color: C.slateDeep, width: 1.5 }));
for (const [x, y] of [[-2, 0], [-2, 4], [2, 4], [2, 0]] as const) scene.add(polyline([[x, y, -2], [x, y, 2]], { color: C.slateDeep, width: 1.5 }));

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
  scene.add(g);
  return main;
}
const mid = (p: THREE.Vector3, r: THREE.Vector3, t: number) => p.clone().lerp(r, t);
name('A', '', lensC, -0.25, -0.62, 0x8fb5d6, 0.26);
name('pixel i', '', pixWorld, -0.2, -0.75, C.ash, 0.2);

if (WALK) walkMode();
else fixedPath();

// --- One fixed path, labelled ------------------------------------------------------
function fixedPath() {
  const PATHS: [number, number, number][][] = [
    [[0.15, 3.99, -0.1]],
    [[1.2, 1.2, -1.99], [-0.2, 3.99, 0.25]],
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
    [[0.38, -0.2], [0.2, 0.42]],
    [[0.12, -0.38], [-0.3, 0.3], [0.2, 0.42]],
  ];
  xs.forEach((p, i) => {
    const [dx, dy] = XOFF[N]![i]!;
    name('x', String(i + 1), p, dx, dy);
  });
  xs.slice(0, -1).forEach((p, i) => name('u', String(i + 1), mid(p, xs[i + 1]!, 0.3), 0.32, 0.05, C.ochre));
}

// --- Random walks ----------------------------------------------------------------
function walkMode() {
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
  const COUNT = 40;
  let seed = 1;
  for (; seed < 10000; seed++) {
    const rnd = rng32(seed);
    if ([0, 1, 2].some(() => walk(rnd).end === 'lamp')) break;
  }
  const rnd = rng32(seed);
  const walks = Array.from({ length: COUNT }, () => walk(rnd));

  // Timing: each segment grows in SEG seconds; each walk then holds.
  const SEG = 0.4;
  const HOLD = 1.6;
  const starts: number[] = [];
  let total = 0.6;
  for (const w of walks) {
    starts.push(total);
    total += (w.pts.length - 1) * SEG + HOLD;
  }
  stage.duration = total;

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
  const termName = (n: number) => (n === 0 ? 'C E' : n === 1 ? 'C T E' : n <= 3 ? `C T${n === 2 ? '²' : '³'} E` : `C T^${n} E`);
  const readout = name('', '', lensC, 0.2, 2.1, C.bone, 0.26);
  readout.anchorX = 'left';

  let shownWalk = -1;
  stage.frame((t) => {
    const u = t % stage.duration;
    let w = 0;
    while (w + 1 < walks.length && starts[w + 1]! <= u) w++;
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
    const grown = Math.min(segs, local / SEG);
    const k = Math.floor(grown);
    const pts = W.pts.slice(0, k + 1);
    if (k < segs) pts.push(W.pts[k]!.clone().lerp(W.pts[k + 1]!, grown - k));
    while (pts.length < MAXP) pts.push(pts[pts.length - 1]!.clone()); // setPolyline keeps a fixed vertex count
    setPolyline(live, pts);
    const done = grown >= segs;
    const lit = done && W.end === 'lamp';
    (live.material as unknown as { color: THREE.Color }).color.set(lit ? C.ochre : C.slate);
    // The hemisphere where the walk is choosing its next direction.
    hemis.forEach((h, i) => (h.visible = !done && i + 1 <= grown && i + 1 > grown - 1));
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
    setText(readout, text);
  });
}

stage.start();
