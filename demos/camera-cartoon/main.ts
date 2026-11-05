/**
 * A camera, as a cartoon (Steve, 2026-11-04: "just a cartoon that it reaches
 * out into the scene and collects light rays ... a lens camera, but it can
 * have a smallish aperture ... even without a real light field room for it to
 * be in").
 *
 * A box: a row of pixels at the back, a small lens at the front. One pixel at
 * a time lights up and its rays go out: from the pixel through points across
 * the lens, meeting at one point on the plane in focus, and on out into the
 * scene; arrows on them point back toward the camera, the way the light
 * travels. The pixel collects what comes back along them. The pixels it has
 * already been through keep a faint fan. The lens is the camera the matrix
 * slides write down (discrete-room ?show=cmatrix, ?show=camera): 16 pixels,
 * K rays each, a small aperture.
 */

import * as THREE from 'three';
import { createStage, C, flat } from '@';
import { polyline, setPolyline } from '@/lines';
import { label } from '@/text';

const ORTHO_H = 3;
const stage = createStage({ camera: 'ortho', position: [0, 0, 10], target: [0, 0, 0], orthoHeight: ORTHO_H, lights: false, controls: false });

// --- Figure spec -----------------------------------------------------------
const NPIX = 16;
const K = 6; // rays per pixel, across the lens
const SENSOR = { x: -4.5, half: 0.72 };
const LENS = { x: -2.6, half: 0.32 };
const FOCUS_X = 2.2; // the plane in focus
const FAR_X = 5.2; // where the drawn rays end
const PER = 0.55; // seconds per pixel
stage.duration = NPIX * PER + 2;

const pixY = (j: number) => SENSOR.half - ((j + 0.5) * 2 * SENSOR.half) / NPIX;
/** Where pixel j's rays cross: through the lens centre, onto the plane in focus (the image is upside down). */
const focusY = (j: number) => pixY(j) * ((FOCUS_X - LENS.x) / (SENSOR.x - LENS.x));
const lensY = (k: number) => -LENS.half + ((k + 0.5) * 2 * LENS.half) / K;

// The box, the sensor's pixels, the lens.
const BOX = { x0: SENSOR.x - 0.12, x1: LENS.x, half: SENSOR.half + 0.3 };
stage.add(polyline([[BOX.x1, LENS.half + 0.06, 0], [BOX.x1, BOX.half, 0], [BOX.x0, BOX.half, 0], [BOX.x0, -BOX.half, 0], [BOX.x1, -BOX.half, 0], [BOX.x1, -LENS.half - 0.06, 0]], { color: C.bone, width: 3 }));
const pixels = Array.from({ length: NPIX }, (_, j) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.16, ((2 * SENSOR.half) / NPIX) * 0.86), flat(0x2a2a2a));
  m.position.set(SENSOR.x, pixY(j), 0.02);
  stage.add(m);
  return m;
});
{
  const pts: [number, number, number][] = [];
  for (let i = 0; i <= 40; i++) {
    const t = -1 + (2 * i) / 40;
    pts.push([LENS.x + 0.09 * Math.sqrt(1 - t * t), LENS.half * t, 0.03]);
  }
  for (let i = 40; i >= 0; i--) {
    const t = -1 + (2 * i) / 40;
    pts.push([LENS.x - 0.09 * Math.sqrt(1 - t * t), LENS.half * t, 0.03]);
  }
  stage.add(polyline(pts, { color: 0x8fb5d6, width: 2.5 }));
}
stage.add(polyline([[FOCUS_X, -2.2, -0.1], [FOCUS_X, 2.2, -0.1]], { color: C.slateDeep, width: 1.5, dashed: true, dashSize: 0.08, gapSize: 0.08 }));
stage.add(label('pixels', { size: 0.18, color: C.ash, anchorX: 'center', anchorY: 'top', position: [SENSOR.x, -BOX.half - 0.12, 0] }));
stage.add(label('lens', { size: 0.18, color: C.ash, anchorX: 'center', anchorY: 'top', position: [LENS.x, -BOX.half - 0.12, 0] }));
stage.add(label('in focus', { size: 0.16, color: C.slate, anchorX: 'center', anchorY: 'top', position: [FOCUS_X, -2.28, 0] }));
stage.add(label('the scene', { size: 0.2, color: C.ash, anchorX: 'right', anchorY: 'bottom', position: [FAR_X, 2.3, 0] }));

// Each pixel's rays: pixel -> lens point -> its focus point -> out. Light travels the other way: arrowheads point in.
function arrow(color: number): THREE.Mesh {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 0.2, -0.07, 0, 0.2, 0.07, 0], 3)); // counter-clockwise, so it faces the camera
  return new THREE.Mesh(g, flat(color, { transparent: true }));
}
const fans = Array.from({ length: NPIX }, (_, j) => {
  const g = new THREE.Group();
  const lines = Array.from({ length: K }, (_, k) => {
    const a: [number, number] = [LENS.x, lensY(k)];
    const f: [number, number] = [FOCUS_X, focusY(j)];
    const dir = [f[0] - a[0], f[1] - a[1]];
    const far: [number, number] = [FAR_X, a[1] + (dir[1]! * (FAR_X - a[0])) / dir[0]!];
    const line = polyline([[SENSOR.x + 0.08, pixY(j), 0], [a[0], a[1], 0], [far[0], far[1], 0]], { color: C.ochre, width: 1.6, opacity: 1 });
    const head = arrow(C.ochre);
    const hx = 4.3;
    head.position.set(hx, a[1] + (dir[1]! * (hx - a[0])) / dir[0]!, 0.05);
    head.rotation.z = Math.atan2(dir[1]!, dir[0]!);
    g.add(line, head);
    return { line, head };
  });
  stage.add(g);
  return { g, lines };
});
const setFan = (j: number, op: number) => {
  fans[j]!.g.visible = op > 0;
  for (const { line, head } of fans[j]!.lines) {
    (line.material as unknown as { opacity: number; transparent: boolean }).opacity = op;
    (line.material as unknown as { transparent: boolean }).transparent = true;
    head.visible = op === 1; // arrows only on the pixel collecting now
  }
};

// The light each pixel collects: a made-up scene, so the pixels fill with something.
const sceneColour = (j: number) => new THREE.Color().setHSL(0.08 + 0.5 * (j / NPIX), 0.45, 0.35 + 0.25 * Math.sin((j / NPIX) * Math.PI * 2) ** 2);
stage.frame((t) => {
  const cur = Math.min(NPIX, Math.floor(t / PER));
  for (let j = 0; j < NPIX; j++) {
    setFan(j, j < cur ? 0.12 : j === cur ? 1 : 0);
    (pixels[j]!.material as THREE.MeshBasicMaterial).color.copy(j <= cur && cur < NPIX + 1 ? (j < cur || cur === NPIX ? sceneColour(j) : sceneColour(j).clone().lerp(new THREE.Color(0x2a2a2a), 1 - ((t / PER) % 1))) : new THREE.Color(0x2a2a2a));
  }
});
void setPolyline;
stage.start();
