/**
 * Two 3D panels side by side in one 16:9 frame, with readouts and a progress
 * bar under each.
 *
 * Built for the two Riemann-against-Monte-Carlo comparisons, which have since
 * been retired: the deck no longer races the two methods, because on a smooth
 * low-dimensional integrand the grid wins and the argument for sampling is the
 * dimension count, which `curse-of-dimension` makes on its own. `importance-2d`
 * still wants this frame — two estimators of the same number differing only in
 * where they look — so it stays.
 *
 * Both panels are drawn through *one* camera into scissored halves of the
 * frame, so the viewpoint is identical by construction and orbiting turns both
 * together. Each panel gets its own scene: nothing is shared between them but
 * the scenery, so a difference on screen is a difference between the methods.
 */

import * as THREE from 'three';
import type { Text } from 'troika-three-text';
import { Stage, ASPECT } from './stage';
import { C, flat, darkRig } from './style';
import { label, setText, fixed } from './text';
import { polyline } from './lines';
import {
  CAM_POS,
  CAM_TARGET,
  createFieldStage,
  floorPlate,
  glassSurface,
  surfaceRim,
} from './field2d';
import { bumps2d } from './functions';

// ---------------------------------------------------------------------------
// Layout, in fractions of the frame measured from the bottom left
// ---------------------------------------------------------------------------

/** Bottom band, left to the readouts and the bars. */
const BAND = 0.33;
/** Gutter between the two panels and at the frame edges. */
const GUTTER = 0.008;

const PANEL_X: [number, number][] = [
  [GUTTER, 0.5 - GUTTER],
  [0.5 + GUTTER, 1 - GUTTER],
];

/** HUD x of each panel's centre. The HUD spans ∓16/9 across the frame. */
const CX = PANEL_X.map(([a, b]) => ((a + b) / 2 - 0.5) * 2 * ASPECT);
/** HUD y of the top of the readout band. */
const BAND_TOP = -1 + 2 * BAND;

/** Half-width of a readout block, and of the bar. */
const HW = 0.75;
const TEXT = 0.055;
const BAR_H = 0.075;

/**
 * The compact band: two numbers and a bar twice the height, all of it larger.
 *
 * A demo whose point *is* the comparison should say it in one glance from the
 * back of a room, and four rows of key-value pairs under each panel is a table
 * to be read rather than a picture to be seen. So the compact band drops the
 * two readouts that carry least — the sample count, and the exact value, which
 * is the same number printed twice and never moves — and spends the room on
 * the estimate, the error, and the bar.
 */
const COMPACT_TEXT = 0.078;
const COMPACT_BAR_H = 0.135;

/**
 * Each panel is narrower than the full frame, so the camera pulls in from the
 * standalone demos' distance to keep the plate filling its share of the width.
 */
const PULL = 0.86;

export interface PanelOptions {
  /** Heading over the panel. */
  title: string;
  /** Name of the left-hand count: 'cells', 'samples'. */
  countKey: string;
  /**
   * In the full band, the name of the quantity the bar shows. In the compact
   * band, the one word printed under the *right end* of the track, naming what
   * a full bar means — normally 'exact'.
   */
  barKey: string;
  /** Name of the gap from the truth. 'error' once the estimate is complete. */
  errorKey?: string;
  /**
   * Fraction of the track to mark with a bright line — where the bar sits when
   * the estimate is exactly right. Omit for a bar that simply fills.
   */
  mark?: number;
}

export interface ComparePanel {
  /** The panel's own scene; add the estimator's geometry to it. */
  readonly scene: THREE.Scene;
  /**
   * Count, running estimate and its distance from the truth. Pass null for a
   * demo that has not started estimating yet — a dash says "nothing computed",
   * where a zero would read as a genuine estimate of zero.
   */
  readout(count: string, estimate: number | null, error: number | null): void;
  /** Bar fill in [0, 1]. `text` is a reading printed beside it, full band only. */
  bar(frac: number, text?: string): void;
  /** Rename the bar, for demos that let you switch what it measures. */
  rename(barKey: string): void;
}

export interface Comparison {
  readonly stage: Stage;
  readonly panels: [ComparePanel, ComparePanel];
  /** Azimuth the camera starts at, for `autoOrbit`. */
  readonly startAngle: number;
}

/**
 * Build the stage, the two scenes with their shared scenery, and the HUD.
 * `truth` is the exact value of the integral, printed under both panels, and
 * `f` is the integrand both panels put under glass.
 */
export function createComparison(
  options: [PanelOptions, PanelOptions],
  truth: number,
  f: (x: number, z: number) => number = bumps2d,
  surface: {
    res?: number;
    wire?: number;
    color?: number;
    opacity?: number;
    /** Draw a solid tube along the graph's boundary, so the sheet has an edge. */
    rim?: boolean;
    compact?: boolean;
  } = {},
): Comparison {
  const stage = createFieldStage();

  const cam = stage.camera as THREE.PerspectiveCamera;
  cam.aspect = ((0.5 - 2 * GUTTER) * 16) / ((1 - BAND) * 9);
  cam.updateProjectionMatrix();
  cam.position.set(
    CAM_TARGET[0] + (CAM_POS[0] - CAM_TARGET[0]) * PULL,
    CAM_TARGET[1] + (CAM_POS[1] - CAM_TARGET[1]) * PULL,
    CAM_TARGET[2] + (CAM_POS[2] - CAM_TARGET[2]) * PULL,
  );
  cam.lookAt(...CAM_TARGET);
  stage.controls?.update();
  const startAngle = Math.atan2(cam.position.z, cam.position.x);

  // The frame is cleared once, by hand, before either panel is drawn. Leaving
  // a background colour on a scene would have it clear the whole canvas
  // mid-frame and wipe the panel already drawn beside it.
  const left = stage.scene;
  left.background = null;
  const right = new THREE.Scene();
  darkRig(right);

  for (const s of [left, right]) {
    s.add(floorPlate());
    s.add(glassSurface(f, surface));
    // Built per scene rather than shared: an Object3D can only sit in one
    // parent, so one rim added to both would silently appear in the second
    // panel only.
    if (surface.rim) s.add(surfaceRim(f));
  }

  const hud = new THREE.Scene();
  const hudCam = new THREE.OrthographicCamera(-ASPECT, ASPECT, 1, -1, -100, 100);
  hudCam.position.z = 10;

  // Divider, stopping at the readout band.
  hud.add(
    polyline(
      [
        [0, BAND_TOP - 0.02, 0],
        [0, 0.99, 0],
      ],
      { color: C.slateDeep, width: 2, opacity: 0.7 },
    ),
  );

  const scenes: [THREE.Scene, THREE.Scene] = [left, right];
  const panels = [0, 1].map((i) =>
    surface.compact
      ? buildCompactPanel(hud, scenes[i], CX[i], options[i])
      : buildPanel(hud, scenes[i], CX[i], options[i], truth),
  ) as [ComparePanel, ComparePanel];

  installSplitRender(stage, scenes, cam, hud, hudCam);

  return { stage, panels, startAngle };
}

// ---------------------------------------------------------------------------
// One panel's HUD block
// ---------------------------------------------------------------------------

function key(text: string, x: number, y: number): Text {
  return label(text, { size: TEXT, color: C.slate, anchorY: 'middle', position: [x, y, 0] });
}

function value(x: number, y: number, anchorX: 'left' | 'right' = 'left'): Text {
  return label('', { size: TEXT, color: C.bone, anchorX, anchorY: 'middle', position: [x, y, 0] });
}

function buildPanel(
  hud: THREE.Scene,
  scene: THREE.Scene,
  cx: number,
  opts: PanelOptions,
  truth: number,
): ComparePanel {
  hud.add(
    label(opts.title, { size: 0.075, color: C.ochre, anchorX: 'center', position: [cx, 0.86, 0] }),
  );

  const rowA = BAND_TOP - 0.13;
  hud.add(key(opts.countKey, cx - HW, rowA), key('estimate', cx + 0.1, rowA));
  const count = value(cx - HW + 0.34, rowA);
  const estimate = value(cx + HW, rowA, 'right');
  hud.add(count, estimate);

  // The exact value is the same number on both sides, and it is repeated
  // rather than shown once between them: the comparison a viewer makes is
  // estimate-against-exact *within* a column, so the target belongs in each.
  const rowB = BAND_TOP - 0.28;
  hud.add(key('exact', cx - HW, rowB), key(opts.errorKey ?? 'error', cx + 0.1, rowB));
  const exact = value(cx - HW + 0.34, rowB);
  setText(exact, fixed(truth));
  const error = value(cx + HW, rowB, 'right');
  hud.add(exact, error);

  const setBar = buildBar(hud, cx, BAND_TOP - 0.44, opts.mark);

  const rowC = BAND_TOP - 0.58;
  const barKey = key(opts.barKey, cx - HW, rowC);
  const barValue = value(cx + HW, rowC, 'right');
  hud.add(barKey, barValue);

  return {
    scene,
    readout(c, e, err) {
      setText(count, c);
      setText(estimate, e === null ? '-' : fixed(e));
      setText(error, err === null ? '-' : fixed(err));
    },
    bar(frac, text) {
      setBar(frac);
      setText(barValue, text ?? '');
    },
    rename(s) {
      setText(barKey, s);
    },
  };
}

/**
 * The compact block: estimate and error on one row, then the bar, then the
 * bar's name and reading centred beneath it — the deck's rule that a label
 * belongs under the graph it names.
 */
function buildCompactPanel(
  hud: THREE.Scene,
  scene: THREE.Scene,
  cx: number,
  opts: PanelOptions,
): ComparePanel {
  hud.add(
    label(opts.title, { size: 0.075, color: C.ochre, anchorX: 'center', position: [cx, 0.86, 0] }),
  );

  const big = (text: string, x: number, y: number, anchorX: 'left' | 'right' = 'left') =>
    label(text, {
      size: COMPACT_TEXT,
      color: C.slate,
      anchorX,
      anchorY: 'middle',
      position: [x, y, 0],
    });
  const bigValue = (x: number, y: number, anchorX: 'left' | 'right' = 'left') =>
    label('', {
      size: COMPACT_TEXT,
      color: C.bone,
      anchorX,
      anchorY: 'middle',
      position: [x, y, 0],
    });

  const rowA = BAND_TOP - 0.16;
  hud.add(big('estimate', cx - HW, rowA), big(opts.errorKey ?? 'error', cx + 0.14, rowA));
  const estimate = bigValue(cx - HW + 0.46, rowA);
  const error = bigValue(cx + HW, rowA, 'right');
  hud.add(estimate, error);

  const setBar = buildBar(hud, cx, BAND_TOP - 0.42, opts.mark, COMPACT_BAR_H);

  // One word, under the right end of the track, naming what the end *is*.
  //
  // No reading beside it. A bar carrying its own number invites reading the
  // number instead of the bar, and the estimate and the error are already on
  // the row above — a third figure derived from them is a thing to decode. The
  // bar's whole job is to be looked at, and for that the only thing it needs to
  // say is where "correct" sits.
  const endLabel = label(opts.barKey, {
    size: 0.062,
    color: C.slate,
    anchorX: 'right',
    anchorY: 'middle',
    position: [cx + HW, BAND_TOP - 0.62, 0],
  });
  hud.add(endLabel);

  return {
    scene,
    readout(_count, e, err) {
      setText(estimate, e === null ? '-' : fixed(e));
      setText(error, err === null ? '-' : fixed(err));
    },
    bar(frac) {
      setBar(frac);
    },
    rename(s) {
      setText(endLabel, s);
    },
  };
}

/** Track, fill, quarter ticks and an optional truth mark. */
function buildBar(
  hud: THREE.Scene,
  cx: number,
  y: number,
  mark?: number,
  barH: number = BAR_H,
): (frac: number) => void {
  const track = new THREE.Mesh(
    new THREE.PlaneGeometry(2 * HW, barH),
    flat(C.slateDeep, { transparent: true, opacity: 0.55 }),
  );
  track.position.set(cx, y, 0);
  hud.add(track);

  // Geometry shifted so x = 0 is its left edge: scaling then grows it rightward
  // from the start of the track instead of from the middle.
  const fillGeom = new THREE.PlaneGeometry(1, barH);
  fillGeom.translate(0.5, 0, 0);
  const fill = new THREE.Mesh(fillGeom, flat(C.ochre, { transparent: true, opacity: 0.95 }));
  fill.position.set(cx - HW, y, 0.01);
  hud.add(fill);

  for (let q = 1; q <= 3; q++) {
    const x = cx - HW + (q / 4) * 2 * HW;
    hud.add(
      polyline(
        [
          [x, y - barH / 2, 0.02],
          [x, y + barH / 2, 0.02],
        ],
        { color: C.bone, width: 1.5, opacity: 0.25 },
      ),
    );
  }

  hud.add(
    polyline(
      [
        [cx - HW, y - barH / 2, 0.03],
        [cx + HW, y - barH / 2, 0.03],
        [cx + HW, y + barH / 2, 0.03],
        [cx - HW, y + barH / 2, 0.03],
        [cx - HW, y - barH / 2, 0.03],
      ],
      { color: C.slate, width: 1.5, opacity: 0.5 },
    ),
  );

  // Where the bar would stand if the estimate were exactly right. Drawn taller
  // than the track and in bone, so it reads as the target rather than as
  // another tick, and stays visible once the fill has passed it.
  if (mark !== undefined) {
    const x = cx - HW + mark * 2 * HW;
    hud.add(
      polyline(
        [
          [x, y - barH * 0.85, 0.04],
          [x, y + barH * 0.85, 0.04],
        ],
        { color: C.bone, width: 2.5, opacity: 0.95 },
      ),
    );
  }

  return (frac: number) => {
    fill.scale.x = Math.min(Math.max(frac, 1e-4), 1) * 2 * HW;
  };
}

// ---------------------------------------------------------------------------
// The frame
// ---------------------------------------------------------------------------

/**
 * Clear once, draw each scene into its scissored half, then the HUD over the
 * lot. Replaces the stage's own render, which draws a single scene full-frame.
 *
 * Viewports are set in CSS pixels, from `getSize`: `setViewport` multiplies by
 * the device pixel ratio itself, so handing it the drawing-buffer size instead
 * doubles everything on a retina display — the left panel fills the frame and
 * the right one falls off the edge. That is invisible in a headless shot,
 * which runs at ratio 1.
 */
function installSplitRender(
  stage: Stage,
  scenes: [THREE.Scene, THREE.Scene],
  cam: THREE.Camera,
  hud: THREE.Scene,
  hudCam: THREE.Camera,
): void {
  const size = new THREE.Vector2();

  stage.render = () => {
    const r = stage.renderer;
    r.getSize(size);
    const W = size.x;
    const H = size.y;

    r.setScissorTest(false);
    r.setViewport(0, 0, W, H);
    r.setScissor(0, 0, W, H);
    r.clear();

    const prevAutoClear = r.autoClear;
    r.autoClear = false;
    r.setScissorTest(true);

    const py = BAND * H;
    const ph = (1 - BAND) * H;
    for (let i = 0; i < 2; i++) {
      const [x0, x1] = PANEL_X[i];
      r.setViewport(x0 * W, py, (x1 - x0) * W, ph);
      r.setScissor(x0 * W, py, (x1 - x0) * W, ph);
      r.render(scenes[i], cam);
    }

    r.setScissorTest(false);
    r.setViewport(0, 0, W, H);
    r.clearDepth();
    r.render(hud, hudCam);
    r.autoClear = prevAutoClear;
  };
}
