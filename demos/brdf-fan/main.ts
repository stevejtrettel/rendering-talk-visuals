/**
 * What T is made of: at each point, a rule taking light in to light out.
 *
 * Three surfaces of the beam room (src/beamscene.ts): the red wall, the green
 * wall, a mirror. One ray of white light (equal at every wavelength) arrives
 * at a point of each; what leaves is drawn as rays. The rule is the surface's
 * BRDF, and two properties of T show in it (Steve, 2026-10-29: the properties
 * of T, then an example):
 *
 *   - local: what leaves the point depends only on what arrives there;
 *   - wavelength by wavelength: each wavelength is reflected in its own
 *     proportion, none turned into another (no fluorescence).
 *
 * The walls are matte (Lambertian): the outgoing light is the same in every
 * direction, so the fan's rays are all the same length, and its colour is the
 * white light times the wall's reflectance at each wavelength, drawn below as
 * Material Response. The mirror sends everything one way, MIRROR_R at every
 * wavelength. The fan is a sample of directions; the BRDF is the whole
 * half-circle of them.
 *
 * Static. The bottom of the frame is left empty for the slide's line of maths.
 */

import * as THREE from 'three';
import { createStage, createUI, C, flat } from '@';
import { polyline } from '@/lines';
import { label } from '@/text';
import { CMF, xyzToHex } from '@/response';
import { NS, nmAt, nmColour, toXYZ, RED, GREEN, MIRROR_R, WL0, WL1 } from '@/beamscene';

const stage = createStage({ camera: 'ortho', position: [0, 0, 10], target: [0, 0, 0], orthoHeight: 3, lights: false, controls: false });
stage.duration = 1;
createUI(stage);

const SURF_Y = 0.75;
const HALF = 1.25; // half a surface's drawn length
const IN_ANGLE = 48; // the incoming ray, degrees from the normal
const IN_LEN = 1.65;
const OUT_LEN = 1.25;
const FAN = 13;
const G = { w: 2.3, y0: -1.15, h: 0.75 }; // each Material Response graph

const white = Float64Array.from({ length: NS }, () => 1);
const Y_WHITE = toXYZ(white)[1];
/** The colour of a spectrum, white light at full brightness. */
const colourOf = (s: ArrayLike<number>) => {
  const [X, Y, Z] = toXYZ(s);
  return xyzToHex(X / Y_WHITE, Y / Y_WHITE, Z / Y_WHITE);
};
const rad = (d: number) => (d * Math.PI) / 180;

function arrowHead(x: number, y: number, angle: number, color: number): THREE.Mesh {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -0.17, 0.075, 0, -0.17, -0.075, 0], 3));
  const m = new THREE.Mesh(g, flat(color));
  m.position.set(x, y, 0.01);
  m.rotation.z = angle;
  return m;
}
/** A ray from (x0, y0) to (x1, y1), with a head at its end. */
function ray(x0: number, y0: number, x1: number, y1: number, color: number, width = 3): THREE.Object3D[] {
  return [polyline([[x0, y0, 0], [x1, y1, 0]], { color, width }), arrowHead(x1, y1, Math.atan2(y1 - y0, x1 - x0), color)];
}

const SURFACES: { x: number; kind: 'matte' | 'mirror'; reflectance: ArrayLike<number>; surface: number }[] = [
  { x: -3.45, kind: 'matte', reflectance: RED, surface: colourOf(RED) },
  { x: 0, kind: 'matte', reflectance: GREEN, surface: colourOf(GREEN) },
  { x: 3.45, kind: 'mirror', reflectance: Float64Array.from({ length: NS }, () => MIRROR_R), surface: C.slate },
];

for (const s of SURFACES) {
  const px = s.x;
  const py = SURF_Y;
  // The surface, and the point on it.
  stage.add(polyline([[px - HALF, py, 0], [px + HALF, py, 0]], { color: s.surface, width: 7 }));
  // In: white light, from up and to the left.
  const ix = px - IN_LEN * Math.sin(rad(IN_ANGLE));
  const iy = py + IN_LEN * Math.cos(rad(IN_ANGLE));
  stage.add(...ray(ix, iy, px - 0.04 * Math.sin(rad(IN_ANGLE)), py + 0.04 * Math.cos(rad(IN_ANGLE)), C.bone, 3.5));
  // Out: the white light times the reflectance, in its colour.
  const out = colourOf(Array.from({ length: NS }, (_, i) => s.reflectance[i]!));
  if (s.kind === 'mirror') {
    stage.add(...ray(px, py, px + IN_LEN * Math.sin(rad(IN_ANGLE)), py + IN_LEN * Math.cos(rad(IN_ANGLE)), out, 3.5));
  } else {
    for (let k = 0; k < FAN; k++) {
      const a = rad(-80 + (160 * k) / (FAN - 1));
      stage.add(...ray(px, py, px + OUT_LEN * Math.sin(a), py + OUT_LEN * Math.cos(a), out, 2.5));
    }
  }
  stage.add(new THREE.Mesh(new THREE.CircleGeometry(0.06, 24), flat(C.bone)).translateX(px).translateY(py).translateZ(0.02));

  // Its Material Response: reflectance against wavelength, 0 to 1.
  const gx = (nm: number) => px - G.w / 2 + ((nm - WL0) / (WL1 - WL0)) * G.w;
  const gy = (r: number) => G.y0 + r * G.h;
  stage.add(polyline([[px - G.w / 2, G.y0, 0], [px + G.w / 2, G.y0, 0]], { color: C.slateDeep, width: 2 }));
  stage.add(polyline([[px - G.w / 2, gy(1), 0], [px + G.w / 2, gy(1), 0]], { color: C.slateDeep, width: 1.5, opacity: 0.6 }));
  stage.add(polyline(Array.from({ length: NS }, (_, i) => [gx(nmAt(i)), gy(s.reflectance[i]!), 0] as [number, number, number]), { color: C.bone, width: 3.5 }));
  for (let i = 0; i < 80; i++) {
    const nm = WL0 + ((WL1 - WL0) * (i + 0.5)) / 80;
    const xyz = CMF.map((f) => f(Math.min(nm, 670)));
    const strip = new THREE.Mesh(new THREE.PlaneGeometry((G.w / 80) * 1.03, 0.06), flat(nmColour(nm), { transparent: true, opacity: Math.min(1, (xyz[0]! + xyz[1]! + xyz[2]!) * 1.6) }));
    strip.position.set(gx(nm), G.y0 - 0.1, 0);
    stage.add(strip);
  }
  stage.add(label('Material Response', { size: 0.15, color: C.ash, anchorX: 'center', anchorY: 'top', position: [px, G.y0 - 0.2, 0] }));
}

stage.start();
