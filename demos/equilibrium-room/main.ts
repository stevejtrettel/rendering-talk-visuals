/**
 * The equilibrium, as pictures: L = E + T(L).
 *
 * The beam room of light-field-room three times over (Steve, 2026-10-29: describe
 * the equilibrium light field as quickly and intuitively as possible). Left, L:
 * the room's light, as on the light-field slide. Then E: the lamp's light
 * alone, the beam from the opening to the first thing it meets, everything
 * else dark (no light leaves the walls, so they are drawn as a plain outline).
 * Then T(L): the room acting once on L, every wall and mirror sending on what
 * arrives at it, carried to the next surface. Read aloud: the light in the room
 * is the lamp's light plus the room's reflection of the light in the room.
 *
 * Honest, in the sense of linear-scene: T(L) is not L minus E. It is its own
 * trace (src/beamroom.ts, traceT): the walls re-emit from the irradiance L
 * gives them, sampled afresh; the mirrors reflect what arrives at them. That
 * the left panel is the sum of the other two is then what the physics says,
 * up to Monte Carlo noise, not an identity of the code.
 *
 * All three panels share one exposure, L's, so they compare: E's beam is the
 * same brightness as in L, and T(L) is everything else.
 *
 * ?panels=question: L and E only, larger, without the symbols: the lamp's
 * light alone, and what the room actually holds (posing which light fields
 * are equilibria).
 */

import * as THREE from 'three';
import { createStage, createUI, C } from '@';
import { label } from '@/text';
import { ROOM_HALF, drawRoom, fluenceOf, exposureOf } from '@/beamroom';

const ORTHO_H = 3;
const stage = createStage({ camera: 'ortho', position: [0, 0, 10], target: [0, 0, 0], orthoHeight: ORTHO_H, lights: false, controls: false });
stage.duration = 1;
createUI(stage);

const QUESTION = new URLSearchParams(location.search).get('panels') === 'question';
const exposure = exposureOf(fluenceOf('L'));

interface Panel {
  which: 'L' | 'E' | 'T';
  name: string;
  x: number;
}
const SCALE = QUESTION ? 0.46 : 0.295;
const PANELS: Panel[] = QUESTION
  ? [
      { which: 'E', name: 'E', x: -2.55 },
      { which: 'L', name: 'L', x: 2.55 },
    ]
  : [
      { which: 'L', name: 'L', x: -3.62 },
      { which: 'E', name: 'E', x: 0 },
      { which: 'T', name: 'T(L)', x: 3.62 },
    ];
const NAME_Y = -ROOM_HALF.y * SCALE - 0.25;
for (const p of PANELS) {
  const room = new THREE.Group();
  room.scale.setScalar(SCALE);
  room.position.set(p.x, 0, 0);
  drawRoom(room, { fluence: fluenceOf(p.which), exposure, walls: p.which !== 'E' });
  stage.add(room);
  stage.add(label(p.name, { size: 0.3, color: C.bone, anchorX: 'center', anchorY: 'top', position: [p.x, NAME_Y, 0] }));
}
if (!QUESTION) {
  for (const [sym, x] of [['=', -1.81], ['+', 1.81]] as const) {
    stage.add(label(sym, { size: 0.42, color: C.bone, anchorX: 'center', anchorY: 'middle', position: [x, 0, 0] }));
  }
}

stage.start();
