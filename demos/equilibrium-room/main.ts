/**
 * Which light fields are equilibria? Try some.
 *
 * The beam room of light-field-room (Steve, 2026-10-29). We can write down all
 * sorts of light fields L and draw T(L) for each, the room acting on it once;
 * what we cannot draw is T(L) for the equilibrium, because that is the
 * unknown. So the default view tries guesses, one after another: a guess L,
 * then T(L), then E + T(L), the lamp's light added. For every guess the last
 * panel is not the first: none of them is an equilibrium, which is the light
 * field with L = E + T(L).
 *
 * The guesses (src/beamroom.ts, Candidate): darkness; the lamp's light alone,
 * E; every wall glowing evenly white. T of each is computed by tracing
 * (traceCandidate): its light flies to the first thing it meets, interacts
 * once there (a mirror reflects, a wall reflects diffusely by its reflectance,
 * the housing absorbs), and flies on. All panels share one exposure, the
 * equilibrium's (light-field-room's), so they compare. Each guess steps in
 * discretely, panel by panel: nothing here is time passing.
 *
 * ?panels=invert (the light-field deck, Steve 2026-10-30): E and the
 * equilibrium with an arrow between them, the map E -> (Id - T)^-1 E; no labels
 * in the frame, the deck sets them (KaTeX) over the picture.
 *
 * Other modes, kept: ?panels=three draws L = E + T(L) for the equilibrium
 * computed by light tracing, T(L) by its own trace (a check that the computed
 * L satisfies it, to Monte Carlo noise); ?panels=question draws E and that L
 * side by side.
 */

import * as THREE from 'three';
import { createStage, createUI, C } from '@';
import { polyline } from '@/lines';
import { label, setText } from '@/text';
import { NS, ROOM_HALF, L_REF, drawRoom, fluenceOf, exposureOf, fluenceMesh, traceCandidate, type Candidate } from '@/beamroom';

const ORTHO_H = 3;
const stage = createStage({ camera: 'ortho', position: [0, 0, 10], target: [0, 0, 0], orthoHeight: ORTHO_H, lights: false, controls: false });
const ui = createUI(stage);

const MODE = new URLSearchParams(location.search).get('panels') ?? 'guesses';
const exposure = exposureOf(fluenceOf('L'));

/** A room outline and a slot for its light, at x, scale s. */
function roomAt(x: number, s: number, fluence: Float64Array | null, walls: boolean): THREE.Group {
  const room = new THREE.Group();
  room.scale.setScalar(s);
  room.position.set(x, 0, 0);
  if (fluence) drawRoom(room, { fluence, exposure, walls });
  stage.add(room);
  return room;
}
const nameUnder = (x: number, s: number, text: string) =>
  label(text, { size: 0.3, color: C.bone, anchorX: 'center', anchorY: 'top', position: [x, -ROOM_HALF.y * s - 0.25, 0] });

if (MODE === 'invert') {
  stage.duration = 1;
  const S = 0.38;
  for (const [which, x] of [['E', -2.75], ['L', 2.75]] as const) roomAt(x, S, fluenceOf(which), which !== 'E');
  const x0 = -2.75 + ROOM_HALF.x * S + 0.18;
  const x1 = 2.75 - ROOM_HALF.x * S - 0.18;
  stage.add(polyline([[x0, 0, 0], [x1, 0, 0]], { color: C.bone, width: 3 }));
  stage.add(polyline([[x1 - 0.14, 0.11, 0], [x1, 0, 0], [x1 - 0.14, -0.11, 0]], { color: C.bone, width: 3 }));
} else if (MODE === 'question' || MODE === 'three') {
  stage.duration = 1;
  const S = MODE === 'question' ? 0.46 : 0.295;
  const panels: [string, 'L' | 'E' | 'T', number][] =
    MODE === 'question'
      ? [['E', 'E', -2.55], ['L', 'L', 2.55]]
      : [['L', 'L', -3.62], ['E', 'E', 0], ['T(L)', 'T', 3.62]];
  for (const [name, which, x] of panels) {
    roomAt(x, S, fluenceOf(which), which !== 'E');
    stage.add(nameUnder(x, S, name));
  }
  if (MODE === 'three') for (const [sym, x] of [['=', -1.81], ['+', 1.81]] as const) stage.add(label(sym, { size: 0.42, color: C.bone, anchorX: 'center', anchorY: 'middle', position: [x, 0, 0] }));
} else {
  // --- Guesses -------------------------------------------------------------------------
  const glow = Float64Array.from({ length: NS }, () => 0.8 * L_REF);
  const GUESSES: { name: string; c: Candidate }[] = [
    { name: 'darkness', c: { lamp: false } },
    { name: 'the lamp alone', c: { lamp: true } },
    { name: 'glowing walls', c: { lamp: false, wall: () => glow } },
  ];
  const E = fluenceOf('E');
  const S = 0.295;
  const X = [-3.62, 0, 3.62];
  // The empty rooms (outlines, mirrors, housing), once per panel.
  const blank = new Float64Array(E.length);
  for (const x of X) roomAt(x, S, blank, false);
  // Each guess's three images, made once, shown in turn.
  const images = GUESSES.map(({ c }) => {
    const { L, T } = traceCandidate(c);
    const ET = T.map((t, i) => t + E[i]!);
    return [L, T, ET].map((F, k) => {
      const m = fluenceMesh(F, exposure);
      m.position.z = -0.01;
      const holder = new THREE.Group();
      holder.scale.setScalar(S);
      holder.position.set(X[k]!, 0, 0);
      holder.add(m);
      holder.visible = false;
      stage.add(holder);
      return holder;
    });
  });
  ['L', 'T(L)', 'E + T(L)'].forEach((n, k) => stage.add(nameUnder(X[k]!, S, n)));
  // Arrows between the panels, named by what they do.
  for (const [k, name] of [[0, 'T'], [1, '+ E']] as const) {
    const x0 = X[k]! + ROOM_HALF.x * S + 0.12;
    const x1 = X[k + 1]! - ROOM_HALF.x * S - 0.12;
    stage.add(polyline([[x0, 0, 0], [x1, 0, 0]], { color: C.bone, width: 3 }));
    stage.add(polyline([[x1 - 0.1, 0.08, 0], [x1, 0, 0], [x1 - 0.1, -0.08, 0]], { color: C.bone, width: 3 }));
    stage.add(label(name, { size: 0.22, color: C.bone, anchorX: 'center', anchorY: 'bottom', position: [(x0 + x1) / 2, 0.08, 0] }));
  }
  const guessName = label('', { size: 0.26, color: C.ash, anchorX: 'center', anchorY: 'bottom', position: [X[0]!, ROOM_HALF.y * S + 0.2, 0] });
  stage.add(guessName);

  const PER = 6; // seconds a guess
  const STEP = [0, 1.4, 2.8]; // when each panel appears
  stage.duration = PER * GUESSES.length;
  const params = { guess: 'cycle' };
  ui.params.add(params, 'guess', ['cycle', ...GUESSES.map((g) => g.name)]);
  let shownName = '';
  stage.frame((t) => {
    const tt = t % stage.duration;
    const pinned = GUESSES.findIndex((g) => g.name === params.guess);
    const gi = pinned >= 0 ? pinned : Math.floor(tt / PER);
    const local = pinned >= 0 ? Infinity : tt - gi * PER;
    images.forEach((set, i) => set.forEach((h, k) => (h.visible = i === gi && local >= STEP[k]!)));
    const name = GUESSES[gi]!.name;
    if (name !== shownName) {
      setText(guessName, name);
      shownName = name;
    }
  });
}

stage.start();
