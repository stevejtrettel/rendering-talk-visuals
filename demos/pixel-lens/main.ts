/**
 * Which light reaches a pixel.
 *
 * The other half of the camera. `pixel-response` and `pixel-image` take a
 * spectrum and make a value out of it; this one shows where that spectrum comes
 * from, and it is the half the slide spends its measure-theory on.
 *
 * ## What the picture is claiming
 *
 * A point on the pixel together with a point on the aperture names one ray:
 *
 *     kappa : P_j x A  ->  X
 *
 * Four parameters onto the four dimensions of ray space, which is exactly why
 * a thin lens gives Gamma_j an honest density. The demo runs that map: it walks
 * u over the pixel and a over the aperture, draws the ray each pair names,
 * carries back the spectrum that ray finds, and averages. What accumulates in
 * the panel is
 *
 *     integral over P_j x A of L(kappa(u,a)) w(u,a) dA(u) dA(a)
 *
 * with w uniform — one pixel's spectrum, and the input to everything the other
 * two camera demos do.
 *
 * ## Two deliberate choices
 *
 * **The pairs are enumerated, not sampled.** The aperture is walked on rings and
 * the pixel on a small grid, so the picture reads as "every pairing" rather than
 * "random draws". The pixel value *is* this integral; that it later gets
 * estimated by sampling is Part VI's argument, and making it here would suggest
 * that randomness is part of the definition of a photograph.
 *
 * **No scene is drawn.** Rays leave the aperture and go out into the dark, and
 * spectra come back along them. What they are hitting is the still life of
 * `pixel-image`, sampled through the lens — so the spectrum this pixel
 * accumulates is, to within the blur, one of the 256 cells of that grid. The two
 * demos photograph the same subject; this one just never shows it, because the
 * slide is about the family of rays and a scene would be the thing everyone
 * looked at instead.
 *
 * The focal plane sits slightly in front of the subject rather than on it. Dead
 * in focus, every aperture point sends its ray to the *same* scene point, the
 * fan collapses to a pencil, and the aperture stops mattering at all — which is
 * true, and makes for a demo where nothing happens. Slightly off, the fan lands
 * on a small patch and the aperture control has something to control.
 */

import * as THREE from 'three';
import { createStage, createUI, C, flat, mix } from '@';
import { polyline, setPolyline } from '@/lines';
import { label, setText } from '@/text';
import { WL0, WL1, NS } from '@/room2d';
import { spectrumAt } from '@/still-life';

// ---------------------------------------------------------------------------
// The optical bench
// ---------------------------------------------------------------------------

/** Pixels across the sensor. Matches `pixel-image`, so pixel (i,j) is cell (i,j). */
const N = 16;

const SENSOR_Z = 2.4;
// Small enough that the sensor does not dominate the frame: a 16x16 grid three
// units across sat next to a ray fan one unit across, and the grid read as the
// subject of the picture rather than the rays.
const SENSOR_HALF = 1.0;
const PIXEL = (2 * SENSOR_HALF) / N;

/** The lens sits at the origin; everything is measured from it. */
const FOCUS_Z = -3.8;
const SCENE_Z = -6.0;
/**
 * Half-width of the subject at its own depth. Fixed by the requirement that the
 * whole sensor sees exactly the whole picture — so pixel (i,j) lands on cell
 * (i,j), inverted through the lens as in any real camera.
 */
const SCENE_HALF = SENSOR_HALF * (-SCENE_Z / SENSOR_Z);

// Viewed from the -x side and low down, so the optical axis runs right to left
// across the screen rather than diagonally into a corner: sensor on the right,
// rays heading out into the dark on the left, the bench in the upper half and
// the readout below it with the right-hand third to itself. High enough, still,
// to see the sensor as a grid rather than as a line.
const stage = createStage({
  position: [-6.33, 2.0, 9.39],
  target: [1.5, -1.0, -0.63],
  fov: 28,
  lights: false,
});
stage.duration = 18;

const ui = createUI(stage);

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

// The default pixel straddles the edge of the fruit against the wall. A pixel
// well inside one object gets the same spectrum from every pairing, and then
// the average is the answer after one ray and the demo has nothing to show.
const params = {
  pixelI: 8,
  pixelJ: 7,
  aperture: 0.5,
};
ui.params.add(params, 'pixelI', 0, N - 1, 1).name('pixel across');
ui.params.add(params, 'pixelJ', 0, N - 1, 1).name('pixel down');
ui.params.add(params, 'aperture', 0.04, 0.95, 0.01).name('aperture radius');

// ---------------------------------------------------------------------------
// The pairings
// ---------------------------------------------------------------------------

/** Points across the pixel, per axis. The u half of P_j x A. */
const PU = 3;
/** Rings on the aperture, and points on each. The a half. */
const RINGS = [
  { r: 0.0, n: 1 },
  { r: 0.55, n: 6 },
  { r: 0.9, n: 9 },
];
const NA = RINGS.reduce((s, ring) => s + ring.n, 0);
const NSAMP = PU * PU * NA;

/** Sensor point for the p-th position across the chosen pixel. */
function pixelPoint(p: number, i: number, j: number): THREE.Vector3 {
  const px = p % PU;
  const py = Math.floor(p / PU);
  const x = -SENSOR_HALF + PIXEL * (i + (px + 0.5) / PU);
  const y = SENSOR_HALF - PIXEL * (j + (py + 0.5) / PU);
  return new THREE.Vector3(x, y, SENSOR_Z);
}

/** Aperture point for the q-th position, at the current radius. */
function aperturePoint(q: number, radius: number): THREE.Vector3 {
  let k = q;
  for (const ring of RINGS) {
    if (k < ring.n) {
      // Successive rings start at different angles, so the pattern does not
      // line up into spokes.
      const a = (2 * Math.PI * k) / ring.n + ring.r * 2.1;
      return new THREE.Vector3(radius * ring.r * Math.cos(a), radius * ring.r * Math.sin(a), 0);
    }
    k -= ring.n;
  }
  return new THREE.Vector3(0, 0, 0);
}

interface Sample {
  u: THREE.Vector3;
  a: THREE.Vector3;
  /** Where the ray meets the subject — the far end of the drawn line. */
  far: THREE.Vector3;
  spectrum: Float32Array;
}

let samples: Sample[] = [];
/** Running sums, so the state at any time is a pure function of t. */
let prefix: Float32Array[] = [];
let peak = 1;
let builtKey = '';

/**
 * Rebuild every pairing for the current pixel and aperture.
 *
 * The prefix sums matter more than they look: the exporter sets `t` to
 * arbitrary values and re-runs the update, so the accumulated spectrum has to
 * be computable from `t` alone rather than carried forward frame by frame.
 * Anything incremental would drift under frame-stepped export and come out
 * different from the preview.
 */
function build(i: number, j: number, radius: number): void {
  const key = `${i}|${j}|${radius.toFixed(3)}`;
  if (key === builtKey) return;
  builtKey = key;

  samples = [];
  for (let p = 0; p < PU * PU; p++) {
    const u = pixelPoint(p, i, j);
    // Every ray from u passes through the conjugate point on the focal plane —
    // that is the whole of the thin lens rule, and it is what makes the fan
    // pinch instead of spreading straight through.
    const s = FOCUS_Z / u.z;
    const conj = new THREE.Vector3(u.x * s, u.y * s, FOCUS_Z);

    for (let q = 0; q < NA; q++) {
      const a = aperturePoint(q, radius);
      const d = conj.clone().sub(a).normalize();
      const far = a.clone().addScaledVector(d, (SCENE_Z - a.z) / d.z);

      const uImg = 0.5 - far.x / (2 * SCENE_HALF);
      const vImg = 0.5 - far.y / (2 * SCENE_HALF);
      const spectrum = new Float32Array(NS + 1);
      spectrumAt(uImg, vImg, spectrum);
      samples.push({ u, a, far, spectrum });
    }
  }

  prefix = [];
  const running = new Float32Array(NS + 1);
  peak = 1e-9;
  for (let n = 0; n < samples.length; n++) {
    for (let k = 0; k <= NS; k++) running[k] += samples[n].spectrum[k];
    const snap = new Float32Array(NS + 1);
    for (let k = 0; k <= NS; k++) {
      snap[k] = running[k] / (n + 1);
      peak = Math.max(peak, snap[k]);
    }
    prefix.push(snap);
  }
  // The panel is scaled by the largest thing it will ever have to draw — an
  // individual arrival, not the average — so the average never has to be
  // rescaled mid-loop, which would look like the answer changing when it is not.
  for (const s of samples) for (let k = 0; k <= NS; k++) peak = Math.max(peak, s.spectrum[k]);
}

// ---------------------------------------------------------------------------
// Scenery: the sensor, its grid, and the lens
// ---------------------------------------------------------------------------

// No backing plate behind the grid. An opaque quad there is nearly invisible
// against black and it hides the last stretch of every ray: the rays approach
// the sensor through the space the plate occupies on screen, so they vanish
// just before they arrive — which is precisely the moment the picture is about.
for (let g = 0; g <= N; g++) {
  const at = -SENSOR_HALF + PIXEL * g;
  const w = g % 4 === 0 ? 1.6 : 1;
  stage.add(
    polyline([[at, -SENSOR_HALF, SENSOR_Z], [at, SENSOR_HALF, SENSOR_Z]], {
      color: C.slateDeep,
      width: w,
    }),
    polyline([[-SENSOR_HALF, at, SENSOR_Z], [SENSOR_HALF, at, SENSOR_Z]], {
      color: C.slateDeep,
      width: w,
    }),
  );
}

// The chosen pixel: a filled patch and a bright outline.
const pixelFill = new THREE.Mesh(
  new THREE.PlaneGeometry(PIXEL, PIXEL),
  flat(C.ochreDeep, { transparent: true, opacity: 0.55 }),
);
stage.add(pixelFill);
const pixelRing = polyline(
  Array.from({ length: 5 }, () => [0, 0, 0] as [number, number, number]),
  { color: C.ochre, width: 3 },
);
stage.add(pixelRing);

// The lens: a rim, a faint disc, and a marker running round it.
const APERTURE_PTS = 72;
const lensRim = polyline(
  Array.from({ length: APERTURE_PTS + 1 }, () => [0, 0, 0] as [number, number, number]),
  { color: C.blue, width: 3 },
);
stage.add(lensRim);

const lensDisc = new THREE.Mesh(
  new THREE.CircleGeometry(1, APERTURE_PTS),
  flat(C.blueDeep, { transparent: true, opacity: 0.18, side: THREE.DoubleSide }),
);
stage.add(lensDisc);

// The optical axis, so the geometry is readable even before any ray is drawn.
stage.add(
  polyline([[0, 0, SENSOR_Z], [0, 0, SCENE_Z]], {
    color: C.slateDeep,
    width: 1.5,
    dashed: true,
    dashSize: 0.16,
    gapSize: 0.12,
  }),
);

// ---------------------------------------------------------------------------
// Rays
// ---------------------------------------------------------------------------

/**
 * A pool of reused lines. One line per pairing would be a thousand objects and
 * a thousand draw calls for a picture that only ever shows a couple of dozen at
 * once; recycling the oldest slot keeps the fan dense without the cost, and the
 * fade means the eye reads the newest rays as the live ones.
 */
const POOL = 26;

const rays = Array.from({ length: POOL }, () => {
  const line = polyline(
    [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
    { color: C.ochre, width: 2.5, opacity: 0.5 },
  );
  stage.add(line);
  return line;
});

// The spectra coming back: one small sphere per live ray.
const tokens = new THREE.InstancedMesh(
  new THREE.SphereGeometry(0.055, 12, 8),
  flat(C.bone),
  POOL,
);
tokens.frustumCulled = false;
stage.add(tokens);

const apertureDot = new THREE.Mesh(new THREE.SphereGeometry(0.055, 14, 10), flat(C.blue));
stage.add(apertureDot);

// ---------------------------------------------------------------------------
// The spectrum panel, on the HUD
// ---------------------------------------------------------------------------

// In a 3D scene the readout has to be screen-space: world-space text swings
// with the camera and changes size with distance.
const ASPECT = 16 / 9;
const PX0 = 0.62;
const PX1 = 1.66;
const PY0 = -0.86;
const PY1 = -0.28;

const panelX = (k: number) => PX0 + ((PX1 - PX0) * k) / NS;
const panelY = (v: number) => PY0 + Math.min(Math.max(v, 0), 1) * (PY1 - PY0);

stage.hud.add(
  polyline([[PX0, PY0, 0], [PX1, PY0, 0]], { color: C.slateDeep, width: 2 }),
  polyline([[PX0, PY0, 0], [PX0, PY1, 0]], { color: C.slateDeep, width: 2 }),
);
for (const nm of [400, 500, 600, 700]) {
  const x = PX0 + ((PX1 - PX0) * (nm - WL0)) / (WL1 - WL0);
  stage.hud.add(polyline([[x, PY0 - 0.025, 0], [x, PY0, 0]], { color: C.slateDeep, width: 2 }));
  stage.hud.add(
    label(String(nm), {
      size: 0.045,
      color: C.slate,
      anchorX: 'center',
      anchorY: 'top',
      position: [x, PY0 - 0.045, 0],
    }),
  );
}
stage.hud.add(
  label('wavelength (nm)', {
    size: 0.048,
    color: C.slate,
    anchorX: 'center',
    position: [(PX0 + PX1) / 2, PY0 - 0.14, 0],
  }),
);
stage.hud.add(
  label('the spectrum this pixel measures', {
    size: 0.055,
    color: C.ash,
    position: [PX0, PY1 + 0.19, 0],
  }),
);

// Two curves that mean quite different things, so they get named. Without this
// the bright one reads as the answer, when it is the single ray that has just
// landed and the quiet one is what the pixel has actually measured.
stage.hud.add(
  label('this ray', { size: 0.042, color: C.ochre, position: [PX0 + 0.03, PY1 - 0.075, 0] }),
  label('the average so far', {
    size: 0.042,
    color: C.bone,
    position: [PX0 + 0.03, PY1 - 0.135, 0],
  }),
);

const flatPts = (): [number, number, number][] =>
  Array.from({ length: NS + 1 }, (_, k) => [panelX(k), PY0, 0] as [number, number, number]);

// The spectrum that has just arrived — one sample, drawn in the colour the deck
// uses for light itself.
const arrivingPts = flatPts();
const arriving = polyline(arrivingPts, { color: C.ochre, width: 2.5, opacity: 0.9 });
stage.hud.add(arriving);

// The running average: what the pixel has measured so far.
const averagePts = flatPts();
const average = polyline(averagePts, { color: C.bone, width: 4 });
average.renderOrder = 4;
stage.hud.add(average);

const fillGeom = new THREE.BufferGeometry();
const fillPos = new Float32Array((NS + 1) * 2 * 3);
fillGeom.setAttribute('position', new THREE.BufferAttribute(fillPos, 3));
{
  const index: number[] = [];
  for (let k = 0; k < NS; k++) index.push(2 * k, 2 * k + 1, 2 * k + 2, 2 * k + 1, 2 * k + 3, 2 * k + 2);
  fillGeom.setIndex(index);
}
const fillMesh = new THREE.Mesh(
  fillGeom,
  flat(C.bone, { transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false }),
);
fillMesh.renderOrder = 3;
stage.hud.add(fillMesh);

const countLabel = label('', { size: 0.05, color: C.bone, position: [PX0, PY1 + 0.075, 0] });
stage.hud.add(countLabel);

stage.hud.add(
  label('one point on the pixel and one on the aperture name one ray', {
    size: 0.05,
    color: C.slate,
    position: [-ASPECT + 0.08, -0.93, 0],
  }),
);

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

/** Fraction of the loop before the first ray, and after the last. */
const LEAD = 0.04;
const TAIL = 0.12;
/**
 * How long one ray stays lit, as a multiple of the gap between launches. Long
 * enough that a couple of dozen are on screen at once, because the claim is
 * about the whole family of pairings and a handful of rays looks like a handful
 * of choices. The oldest fade to almost nothing, so the cone builds up without
 * the newest arrivals getting lost in it.
 */
const LIFE = 22;

const dummy = new THREE.Object3D();
const tmp = new THREE.Vector3();

stage.frame((t) => {
  const i = Math.round(params.pixelI);
  const j = Math.round(params.pixelJ);
  build(i, j, params.aperture);

  const u = stage.duration > 0 ? (t % stage.duration) / stage.duration : 0;

  // Launch times are evenly spaced; `fired` is fractional so a ray's own
  // progress is smooth rather than stepping once per launch.
  const span = 1 - LEAD - TAIL;
  const fired = Math.min(Math.max((u - LEAD) / span, 0), 1) * NSAMP;
  const done = Math.min(Math.floor(fired), NSAMP);

  // --- the pixel and the lens ---------------------------------------------
  const cx = -SENSOR_HALF + PIXEL * (i + 0.5);
  const cy = SENSOR_HALF - PIXEL * (j + 0.5);
  pixelFill.position.set(cx, cy, SENSOR_Z + 0.004);
  const h = PIXEL / 2;
  setPolyline(pixelRing, [
    [cx - h, cy - h, SENSOR_Z + 0.008],
    [cx + h, cy - h, SENSOR_Z + 0.008],
    [cx + h, cy + h, SENSOR_Z + 0.008],
    [cx - h, cy + h, SENSOR_Z + 0.008],
    [cx - h, cy - h, SENSOR_Z + 0.008],
  ]);

  const R = params.aperture;
  setPolyline(
    lensRim,
    Array.from({ length: APERTURE_PTS + 1 }, (_, k) => {
      const a = (2 * Math.PI * k) / APERTURE_PTS;
      return [R * Math.cos(a), R * Math.sin(a), 0] as [number, number, number];
    }),
  );
  lensDisc.scale.set(R, R, 1);

  // --- the live rays -------------------------------------------------------
  let shown = 0;
  for (let n = Math.max(0, done - POOL); n < done; n++) {
    const s = samples[n];
    if (!s) continue;
    const age = (fired - n) / LIFE;
    if (age > 1) continue;

    const line = rays[shown];
    setPolyline(line, [
      [s.u.x, s.u.y, s.u.z],
      [s.a.x, s.a.y, s.a.z],
      [s.far.x, s.far.y, s.far.z],
    ]);
    // Bright as it arrives, then settling back into the accumulated fan.
    const mat = line.material as THREE.Material & { color: THREE.Color };
    const glow = Math.max(0, 1 - age * 7);
    mat.opacity = 0.1 * (1 - age) + 0.72 * glow;
    mat.color.setHex(mix(C.ochreDeep, C.ochre, glow));
    line.visible = true;

    // The spectrum travelling home: far end to aperture to pixel, over the
    // first stretch of the ray's life, so several are in flight at once.
    const travel = Math.min(age * 7, 1);
    const leg1 = s.far.distanceTo(s.a);
    const leg2 = s.a.distanceTo(s.u);
    const along = travel * (leg1 + leg2);
    if (along < leg1) tmp.lerpVectors(s.far, s.a, along / Math.max(leg1, 1e-6));
    else tmp.lerpVectors(s.a, s.u, (along - leg1) / Math.max(leg2, 1e-6));
    dummy.position.copy(tmp);
    dummy.scale.setScalar(travel < 1 ? 1 : 0.001);
    dummy.updateMatrix();
    tokens.setMatrixAt(shown, dummy.matrix);

    shown++;
    if (shown >= POOL) break;
  }
  for (let k = shown; k < POOL; k++) {
    rays[k].visible = false;
    dummy.position.set(0, 0, 0);
    dummy.scale.setScalar(0.001);
    dummy.updateMatrix();
    tokens.setMatrixAt(k, dummy.matrix);
  }
  tokens.count = POOL;
  tokens.instanceMatrix.needsUpdate = true;

  // The marker on the rim, showing which aperture point is being paired now.
  const current = samples[Math.min(done, NSAMP - 1)];
  apertureDot.visible = done > 0 && !!current;
  if (current) apertureDot.position.copy(current.a);

  // --- the panel -----------------------------------------------------------
  const avg = done > 0 ? prefix[done - 1] : null;
  for (let k = 0; k <= NS; k++) {
    const y = panelY(avg ? avg[k] / peak : 0);
    averagePts[k][1] = y;
    fillPos[6 * k + 0] = panelX(k);
    fillPos[6 * k + 1] = y;
    fillPos[6 * k + 2] = 0;
    fillPos[6 * k + 3] = panelX(k);
    fillPos[6 * k + 4] = PY0;
    fillPos[6 * k + 5] = 0;
  }
  setPolyline(average, averagePts);
  fillGeom.attributes.position.needsUpdate = true;
  average.visible = done > 0;
  fillMesh.visible = done > 0;

  // The most recent arrival, shown against the average it just joined.
  const last = samples[done - 1];
  for (let k = 0; k <= NS; k++) {
    arrivingPts[k][1] = panelY(last ? last.spectrum[k] / peak : 0);
  }
  setPolyline(arriving, arrivingPts);
  arriving.visible = !!last;

  setText(countLabel, `${done} of ${NSAMP} pairings`);
});

stage.start();
