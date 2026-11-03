/**
 * The rooms we are adding up.
 *
 * For the light-field deck (Steve, 2026-10-30: "we want to literally draw the
 * rooms we are adding up, with an integral above them and words underneath").
 * Three beam rooms in a row with + between them and + ⋯ after: the light of E,
 * of TE and of T²E, each the room lit only by light that has interacted
 * exactly n times since the lamp, drawn as glow like beam-series (the same
 * terms, from the same light tracing), at one shared exposure, the
 * equilibrium's, so the later terms are dimmer, as they are.
 *
 * ?mc (Steve: "the next slide keeps almost everything the same but we replace
 * the static pictures with Monte Carlo pictures sampling paths"): each room
 * starts dark and fills in live from sampled lamp paths, the same sampling as
 * the static picture's tracing (sampleBounces), so the noisy early estimates
 * settle onto exactly the static rooms. The number of paths grows
 * geometrically, from a handful (single streaks you can see) to ~100,000, and
 * the count shows under the row. The paths here start at the lamp: light
 * tracing, which estimates the glow of each term; a camera's C T^n E would be
 * sampled from the film, the same integral read from the other end.
 *
 * No text in the frame: the deck sets the integrals over the rooms and the
 * words under them in its own type. It relies on the panel centres below
 * (x = -3.9, -0.5, 2.9; rooms centred on y = 0, scale 0.26).
 */

import * as THREE from 'three';
import { createStage, createUI, C } from '@';
import { label, setText } from '@/text';
import { ROOM_HALF, drawRoom, fluenceOf, fluenceOfBounce, exposureOf, fluenceMesh, sampleBounces, GRID_SIZE } from '@/beamroom';

const stage = createStage({ camera: 'ortho', position: [0, 0, 10], target: [0, 0, 0], orthoHeight: 3, lights: false, controls: false });
const MC = new URLSearchParams(location.search).has('mc');
stage.duration = MC ? 18 : 1;
createUI(stage);

const S = 0.26;
const X = [-3.9, -0.5, 2.9];
const exposure = exposureOf(fluenceOf('L'));
const blank = new Float64Array(fluenceOf('L').length);

const glows = X.map((x, n) => {
  const outline = new THREE.Group();
  outline.scale.setScalar(S);
  outline.position.set(x, 0, 0);
  drawRoom(outline, { fluence: blank, exposure, walls: false });
  stage.add(outline);
  const glow = new THREE.Group();
  glow.scale.setScalar(S);
  glow.position.set(x, 0, 0);
  if (!MC) {
    const m = fluenceMesh(fluenceOfBounce(n), exposure);
    m.position.z = -0.01;
    glow.add(m);
  }
  stage.add(glow);
  return glow;
});

const half = ROOM_HALF.x * S;
for (let n = 0; n < X.length; n++) {
  const xPlus = n < X.length - 1 ? (X[n]! + half + X[n + 1]! - half) / 2 : X[n]! + half + 0.3;
  stage.add(label('+', { size: 0.42, color: C.bone, anchorX: 'center', anchorY: 'middle', position: [xPlus, 0, 0] }));
}
stage.add(label('⋯', { size: 0.42, color: C.bone, anchorX: 'left', anchorY: 'middle', position: [X[2]! + half + 0.6, 0, 0] }));

if (MC) {
  // Paths so far, as a function of t: a handful at first, ~100,000 by the end.
  const HOLD = 3;
  const K_MAX = 100000;
  const target = (t: number) => Math.round(Math.min(K_MAX, 6 * Math.pow(K_MAX / 6, Math.min(1, t / (stage.duration - HOLD)))));
  let grids = X.map(() => new Float64Array(GRID_SIZE));
  let seed = 0x9e3779b9;
  const rng = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  };
  let K = 0;
  let lastT = -1;
  let shownK = -1;
  let lastDraw = -1;
  const count = label('', { size: 0.26, color: C.ash, anchorX: 'center', anchorY: 'top', position: [0, -2.45, 0] });
  stage.add(count);
  stage.frame((t) => {
    const u = t % stage.duration;
    if (u < lastT) {
      grids = X.map(() => new Float64Array(GRID_SIZE));
      seed = 0x9e3779b9;
      K = 0;
      shownK = -1;
      lastDraw = -1;
    }
    lastT = u;
    const want = target(u);
    if (want > K) {
      sampleBounces(want - K, rng, grids);
      K = want;
    }
    // Redraw at most ~8 times a second (the blur in fluenceMesh is not free).
    if (K === shownK || (u - lastDraw < 0.12 && K < K_MAX)) return;
    shownK = K;
    lastDraw = u;
    glows.forEach((glow, n) => {
      for (const c of [...glow.children]) {
        glow.remove(c);
        const m = c as THREE.Mesh;
        m.geometry.dispose();
        const mat = m.material as THREE.MeshBasicMaterial;
        mat.map?.dispose();
        mat.dispose();
      }
      const scaled = grids[n]!.map((x) => x / K);
      const m = fluenceMesh(scaled, exposure);
      m.position.z = -0.01;
      glow.add(m);
    });
    setText(count, `${K.toLocaleString('en-US')} paths`);
  });
}

stage.start();
