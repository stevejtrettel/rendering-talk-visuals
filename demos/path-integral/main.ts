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
 */

import * as THREE from 'three';
import { createStage, C, matte, glossy, glow, flat } from '@';
import { polyline } from '@/lines';
import { label } from '@/text';

const q = new URLSearchParams(location.search);
const N = Math.max(0, Math.min(2, Number(q.get('n') ?? 0)));

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

// --- The path -----------------------------------------------------------------
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
const dot = (p: THREE.Vector3, color: number, r = 0.07) => {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 12), flat(color, { depthTest: false }));
  m.position.copy(p);
  m.renderOrder = 5;
  scene.add(m);
};
dot(A, 0x8fb5d6, 0.06);
xs.forEach((p, i) => dot(p, i === xs.length - 1 ? 0xfff3e0 : C.bone));

// The sphere of directions at each surface point: its open half, a hemisphere.
const HEMI = 0.55;
xs.slice(0, -1).forEach((p) => {
  const n = normalAt(p);
  const g = new THREE.Group();
  g.position.copy(p);
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
  g.add(new THREE.Mesh(new THREE.SphereGeometry(HEMI, 48, 16, 0, 2 * Math.PI, 0, Math.PI / 2), flat(0x8fb5d6, { transparent: true, opacity: 0.24, side: THREE.DoubleSide, depthWrite: false })));
  g.add(polyline(Array.from({ length: 65 }, (_, i) => [HEMI * Math.cos((i / 64) * 2 * Math.PI), 0.002, HEMI * Math.sin((i / 64) * 2 * Math.PI)] as [number, number, number]), { color: 0x8fb5d6, width: 2, opacity: 0.8 }));
  scene.add(g);
});

// --- Labels, facing the viewer --------------------------------------------------
const bill = stage.camera.quaternion.clone();
const SIZE = 0.3;
/** A letter with an optional subscript digit, centred near p, nudged by (dx, dy) on screen. */
function name(text: string, sub: string, p: THREE.Vector3, dx: number, dy: number, color: number = C.bone, size = SIZE) {
  const SIZE_ = size;
  const g = new THREE.Group();
  g.quaternion.copy(bill);
  const off = new THREE.Vector3(dx, dy, 0).applyQuaternion(bill);
  g.position.copy(p).add(off);
  g.add(label(text, { size: SIZE_, color, anchorX: sub ? 'right' : 'center', anchorY: 'middle' }));
  if (sub) g.add(label(sub, { size: SIZE_ * 0.62, color, anchorX: 'left', anchorY: 'middle', position: [0.01, -SIZE_ * 0.28, 0] }));
  scene.add(g);
}
const mid = (p: THREE.Vector3, r: THREE.Vector3, t: number) => p.clone().lerp(r, t);
name('a', '', A, 0.0, 0.26, 0x8fb5d6, 0.26);
name('A', '', lensC, -0.25, -0.62, 0x8fb5d6, 0.26);
name('pixel i', '', pixWorld, -0.2, -0.75, C.ash, 0.2);
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
xs.slice(0, -1).forEach((p, i) => {
  const r = xs[i + 1]!;
  name('u', String(i + 1), mid(p, r, 0.3), 0.32, 0.05, C.ochre);
});

stage.start();
