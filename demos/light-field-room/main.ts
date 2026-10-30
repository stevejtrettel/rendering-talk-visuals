/**
 * A light field: a spectrum on every ray.
 *
 * The room of the slides before (wave-room ?scene=beam, wave-to-ray
 * ?frame=room, beam-spectrum): the lamp in its housing, the flat mirror, the
 * concave one; now with walls that reflect, in colour (left red, right green,
 * floor and ceiling white) (Steve, 2026-10-29). The room is coloured by the
 * light in it: at every point, the light arriving from all directions, in its
 * colour, so the beam and the lit walls show and the colour bleeds.
 *
 * The probe is a point with a dial round it and an arrow out of it: the arrow
 * is a direction, pointing the way the light travels. The graph is the spectrum
 * of the light travelling through the point in that direction. Drag the arrow
 * to turn it, the point to move it (the `direction` slider turns it too).
 *
 * What is computed, honestly: the equilibrium light in the room, in the ray
 * limit, spectrally, by Monte Carlo from the lamp (light tracing). PHOTONS
 * paths leave the lamp with the sun's spectrum, reflect off the mirrors
 * (MIRROR_R at every wavelength), and at the walls deposit their
 * power into the irradiance of that piece of surface and bounce on diffusely,
 * multiplied by the surface's reflectance (Russian roulette on its mean). The
 * diffuse surfaces are Lambertian, so the light leaving one is the same in
 * every direction: its reflectance times its irradiance, over 2 in 2D.
 *
 * The probe reads it back exactly as a light field is read: follow the ray
 * backwards to the surface it left. Off a wall, that surface's
 * outgoing light; off a mirror, the light arriving at the mirror from the
 * reflected direction, times MIRROR_R, followed on; out of the lamp, the lamp's
 * emission in that direction (a beam: a Gaussian across the opening and in
 * angle); off the housing, nothing.
 *
 * Readability: the graph has a fixed vertical scale set by the brightest wall,
 * so looking at the walls compares them; the lamp and the mirrors' views of it
 * are far brighter and run off the top (marked). Walls are drawn in the colour
 * and brightness of the light leaving them (the light field on the boundary),
 * exposure set by the brightest wall. The room's colouring is the scalar
 * fluence of the same light tracing (each photon's track length in a cell,
 * times its power, in XYZ), lightly blurred against Monte Carlo grain, and
 * tone-mapped 1 - exp(-s) about a typical lit level: a readability choice,
 * which lets the dim bounced light show beside the far brighter beam.
 * Colours through the CIE observer
 * (response.ts), clamped past 670 nm where its analytic tails fail.
 */

import * as THREE from 'three';
import { createStage, createUI, C, flat } from '@';
import { polyline, setPolyline } from '@/lines';
import { label } from '@/text';
import { CMF, xyzToHex } from '@/response';
import { type Vec, v, add, fromAngle, WL0, WL1, NS, nmAt, spectrum, nmColour, toXYZ, ROOM_HALF, L_REF, lightAlong, drawRoom } from '@/beamroom';

// --- Frame -----------------------------------------------------------------
const ORTHO_H = 3;
const HALF_W = (ORTHO_H * 16) / 9;
const stage = createStage({ camera: 'ortho', position: [0, 0, 10], target: [0, 0, 0], orthoHeight: ORTHO_H, lights: false, controls: false });
stage.duration = 8;
const ui = createUI(stage);

const ROOM_SCALE = 0.66;
const ROOM_AT = { x: -1.75, y: 0.0 };
const room = new THREE.Group();
room.scale.setScalar(ROOM_SCALE);
room.position.set(ROOM_AT.x, ROOM_AT.y, 0);
stage.add(room);
drawRoom(room);

// The probe: a point, a dial round it, and an arrow out of it.
const params = { direction: 20 };
let probe = v(-2.4, -1.15);
const DIAL = 0.42;
const ARROW = 1.0;
const probeDot = new THREE.Mesh(new THREE.CircleGeometry(0.09, 24), flat(C.bone));
const dial = polyline(Array.from({ length: 49 }, () => [0, 0, 0] as [number, number, number]), { color: C.bone, width: 3 });
const arrowShaft = polyline([[0, 0, 0], [0, 0, 0]], { color: C.bone, width: 5 });
const arrowHead = new THREE.Mesh(
  (() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.26, 0, -0.15, -0.05, 0, 0.15, -0.05, 0], 3));
    return g;
  })(),
  flat(C.bone),
);
probeDot.position.z = arrowHead.position.z = 0.03;
room.add(dial, arrowShaft, arrowHead, probeDot);


// --- The graph ---------------------------------------------------------------------
const G = { x0: 2.0, x1: 5.05, y0: -1.05, y1: 1.35 };
const gx = (nm: number) => G.x0 + ((nm - WL0) / (WL1 - WL0)) * (G.x1 - G.x0);
const gy = (h: number) => G.y0 + Math.min(h, 1) * (G.y1 - G.y0);
stage.add(polyline([[G.x0, G.y0, 0], [G.x1, G.y0, 0]], { color: C.slateDeep, width: 2 }));
for (const nm of [400, 500, 600, 700]) {
  stage.add(polyline([[gx(nm), G.y0 - 0.08, 0], [gx(nm), G.y0, 0]], { color: C.slateDeep, width: 2 }));
  stage.add(label(String(nm), { size: 0.15, color: C.slate, anchorX: 'center', anchorY: 'top', position: [gx(nm), G.y0 - 0.28, 0] }));
}
for (let i = 0; i < 120; i++) {
  const nm = WL0 + ((WL1 - WL0) * (i + 0.5)) / 120;
  const xyz = CMF.map((f) => f(Math.min(nm, 670)));
  const strip = new THREE.Mesh(
    new THREE.PlaneGeometry(((G.x1 - G.x0) / 120) * 1.03, 0.08),
    flat(nmColour(nm), { transparent: true, opacity: Math.min(1, (xyz[0]! + xyz[1]! + xyz[2]!) * 1.6) }),
  );
  strip.position.set(gx(nm), G.y0 - 0.14, 0);
  stage.add(strip);
}
stage.add(label('Spectrum', { size: 0.18, color: C.ash, anchorX: 'center', anchorY: 'top', position: [(G.x0 + G.x1) / 2, G.y0 - 0.52, 0] }));
const curve = polyline(Array.from({ length: NS }, () => [0, 0, 0] as [number, number, number]), { color: C.bone, width: 4 });
const fillGeom = new THREE.BufferGeometry();
fillGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NS * 6), 3));
fillGeom.setIndex(Array.from({ length: NS - 1 }, (_, i) => [2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2]).flat());
const fillMesh = new THREE.Mesh(fillGeom, flat(C.bone, { transparent: true, opacity: 0.15, side: THREE.DoubleSide, depthWrite: false }));
fillMesh.position.z = -0.01;
const swatch = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), flat(0x000000));
swatch.position.set(G.x1 - 0.21, G.y1 + 0.42, 0);
const offScale = label('off the top', { size: 0.15, color: C.ash, anchorX: 'left', anchorY: 'bottom', position: [G.x0, G.y1 + 0.08, 0] });
stage.add(curve, fillMesh, swatch, offScale);

// --- Update -----------------------------------------------------------------------
const L = new Float64Array(NS);
function update(): void {
  const w = fromAngle(params.direction);
  const path: Vec[] = [];
  lightAlong(probe, w, L, path);
  // The point, its dial and the arrow.
  probeDot.position.set(probe.x, probe.y, 0.03);
  const tip = add(probe, w, ARROW);
  setPolyline(arrowShaft, [[probe.x, probe.y, 0.02], [tip.x, tip.y, 0.02]]);
  arrowHead.position.set(tip.x, tip.y, 0.03);
  arrowHead.rotation.z = Math.atan2(w.y, w.x) - Math.PI / 2;
  setPolyline(dial, Array.from({ length: 49 }, (_, k) => {
    const q = add(probe, fromAngle((360 * k) / 48), DIAL);
    return [q.x, q.y, 0.02] as [number, number, number];
  }));
  // The graph.
  const pos = fillGeom.attributes.position as THREE.BufferAttribute;
  let over = false;
  const cpts: [number, number, number][] = [];
  for (let i = 0; i < NS; i++) {
    const h = L[i]! / L_REF;
    over ||= h > 1;
    cpts.push([gx(nmAt(i)), gy(h), 0]);
    pos.setXYZ(2 * i, gx(nmAt(i)), gy(h), 0);
    pos.setXYZ(2 * i + 1, gx(nmAt(i)), G.y0, 0);
  }
  pos.needsUpdate = true;
  setPolyline(curve, cpts);
  offScale.visible = over;
  const [X, Y, Z] = toXYZ(L);
  const Yref = toXYZ(spectrum(() => L_REF))[1];
  (swatch.material as THREE.MeshBasicMaterial).color.setHex(xyzToHex((X / Yref) * 1.6, (Y / Yref) * 1.6, (Z / Yref) * 1.6));
}
ui.params.add(params, 'direction', 0, 360, 1).onChange(update);
update();

// --- Dragging the probe -----------------------------------------------------------------
const canvas = stage.renderer.domElement;
const toRoom = (e: PointerEvent): Vec => {
  const r = canvas.getBoundingClientRect();
  const wx = (((e.clientX - r.left) / r.width) * 2 - 1) * HALF_W;
  const wy = -(((e.clientY - r.top) / r.height) * 2 - 1) * ORTHO_H;
  return v((wx - ROOM_AT.x) / ROOM_SCALE, (wy - ROOM_AT.y) / ROOM_SCALE);
};
const inside = (p: Vec) => Math.abs(p.x) < ROOM_HALF.x - 0.15 && Math.abs(p.y) < ROOM_HALF.y - 0.15;
let grab: 'point' | 'tip' | null = null;
/** The arrow (its tip, or anywhere on the dial) turns it; the middle moves it. */
function nearWhat(p: Vec): 'point' | 'tip' | null {
  const tip = add(probe, fromAngle(params.direction), ARROW);
  const r = Math.hypot(p.x - probe.x, p.y - probe.y);
  if (Math.hypot(p.x - tip.x, p.y - tip.y) < 0.35 || Math.abs(r - DIAL) < 0.14) return 'tip';
  if (r < DIAL - 0.14) return 'point';
  return null;
}
canvas.addEventListener('pointerdown', (e) => {
  const p = toRoom(e);
  grab = nearWhat(p);
  if (grab) canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  const p = toRoom(e);
  if (!grab) {
    canvas.style.cursor = nearWhat(p) ? 'grab' : '';
    return;
  }
  if (grab === 'point' && inside(p)) probe = p;
  if (grab === 'tip') params.direction = Math.round((((Math.atan2(p.y - probe.y, p.x - probe.x) * 180) / Math.PI) + 360) % 360);
  ui.params.controllers.forEach((c) => c.updateDisplay());
  update();
});
const release = () => (grab = null);
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);

stage.start();
