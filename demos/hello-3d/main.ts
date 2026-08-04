/**
 * Palette and lighting check.
 *
 * Not a talk visual — a reference card. Every mineral colour as a sphere under
 * the standard dark rig, plus one emitter, so you can see how the palette
 * behaves against black before committing to it in a real scene.
 */

import * as THREE from 'three';
import { createStage, createUI, C, CYCLE, glossy, glow } from '@';

const stage = createStage({
  position: [0, 2.2, 8],
  target: [0, 0.2, 0],
  fov: 38,
});
stage.duration = 6;

const ui = createUI(stage);

// A row of spheres, one per palette hue.
const balls = new THREE.Group();
const radius = 0.62;
CYCLE.forEach((color, i) => {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 64, 32),
    glossy(color),
  );
  mesh.position.x = (i - (CYCLE.length - 1) / 2) * 1.65;
  balls.add(mesh);
});
stage.add(balls);

// No ground plane on purpose. A lit floor turns warm brown under this rig and
// starts competing with the spheres; the palette reads truest against pure
// black, which is the default for the talk anyway.

// The emitter — stands in for a light source in the real scenes. Kept small
// and orbiting inside the frame so it never clips the top edge.
const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 32, 16), glow(C.ochre, 2.2));
lamp.position.set(0, 1.9, 2.4);
stage.add(lamp);
lamp.add(new THREE.PointLight(C.ochre, 10, 30, 2));

const params = { bob: 0.22, spin: true };
ui.params.add(params, 'bob', 0, 0.6, 0.01).name('bob height');
ui.params.add(params, 'spin').name('orbit');

stage.frame((t) => {
  // Phase-offset bob, so the row reads as a wave rather than a rigid block.
  balls.children.forEach((m, i) => {
    const phase = (t / stage.duration) * Math.PI * 2 + i * 0.7;
    m.position.y = Math.sin(phase) * params.bob;
  });
  if (params.spin) {
    const a = (t / stage.duration) * Math.PI * 2;
    lamp.position.set(Math.cos(a) * 2.4, 1.9, Math.sin(a) * 2.0 + 0.8);
  }
});

stage.start();
