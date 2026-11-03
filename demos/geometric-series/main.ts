/**
 * 1/(1 - x) and its Taylor polynomials on |x| < 1.
 *
 * For the light-field deck (Steve, 2026-10-29), beside 1/(1-x) = Σ xⁿ: the
 * function, and the partial sums 1 + x + … + x^N appearing one at a time.
 * Drawn only on |x| < 1 (Steve: "within |x| < 1"), where they close in on
 * it; the dashed lines at x = ±1 are the edge. The function runs off the top
 * of the frame as x → 1, and so do the partial sums, later and later.
 *
 * Steps, not a fade: each partial sum lands, and the earlier ones stay behind,
 * dimmed, like the trail in contraction-2d. One cycle, then it holds.
 */

import * as THREE from 'three';
import { createStage, createUI, BACKGROUND, C, mix, ramp } from '@';
import { polyline, type Pt } from '@/lines';
import { label, setText } from '@/text';

const stage = createStage({ camera: 'ortho', position: [0, 0, 10], target: [0, 0, 0], orthoHeight: 3, lights: false, controls: false });
const ui = createUI(stage);

// The plot box, in world units: x in [-1.25, 1.25], y in [0, Y_MAX].
const W = 3.6; // half-width of the plot in world units
const H = 2.2; // half-height
const X_LO = -1.25;
const X_HI = 1.25;
const Y_MAX = 6;
const px = (x: number) => (x - (X_LO + X_HI) / 2) * ((2 * W) / (X_HI - X_LO));
const py = (y: number) => -H + (y / Y_MAX) * 2 * H;

/** Sample f on [a, b], clipped to the box (a curve leaving the top stops there). */
function curve(f: (x: number) => number, a: number, b: number, n = 400): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const x = a + ((b - a) * i) / n;
    const y = f(x);
    if (!(y <= Y_MAX && y >= -0.3)) {
      if (pts.length) break;
      continue;
    }
    pts.push([px(x), py(y), 0]);
  }
  return pts;
}

// Axes, ticks, the boundary |x| = 1.
stage.add(polyline([[px(X_LO), py(0), 0], [px(X_HI), py(0), 0]], { color: C.slate, width: 1.5 }));
stage.add(polyline([[px(0), py(0), 0], [px(0), py(Y_MAX), 0]], { color: C.slate, width: 1.5 }));
for (const x of [-1, 1]) {
  stage.add(polyline([[px(x), py(0), 0], [px(x), py(Y_MAX), 0]], { color: C.slateDeep, width: 1.5, dashed: true, dashSize: 0.08 }));
  stage.add(label(String(x), { size: 0.24, color: C.ash, anchorX: 'center', anchorY: 'top', position: [px(x), py(0) - 0.1, 0] }));
}
stage.add(label('0', { size: 0.24, color: C.ash, anchorX: 'center', anchorY: 'top', position: [px(0), py(0) - 0.1, 0] }));

// The function, over the whole x range left of 1.
stage.add(polyline(curve((x) => 1 / (1 - x), -0.999, 0.999), { color: C.bone, width: 3.5 }));

// The partial sums S_N = 1 + x + ... + x^N, N = 0 .. N_MAX.
const N_MAX = 10;
const S = (N: number) => (x: number) => {
  let s = 0;
  let p = 1;
  for (let k = 0; k <= N; k++, p *= x) s += p;
  return s;
};
const sums = Array.from({ length: N_MAX + 1 }, (_, N) => {
  const line = polyline(curve(S(N), -1, 1), { color: ramp(N / N_MAX), width: 2.5 });
  line.position.z = 0.01;
  line.visible = false;
  stage.add(line);
  return line;
});
const nLabel = label('', { size: 0.3, color: C.ochre, anchorX: 'left', anchorY: 'top', position: [px(X_LO) + 0.1, py(Y_MAX), 0] });
stage.add(nLabel);

// --- Stepping ----------------------------------------------------------------
const LEAD = 0.8;
const PER = 1.1;
const HOLD = 3;
stage.duration = LEAD + (N_MAX + 1) * PER + HOLD;
const GHOST = 0.35;
const params = { terms: -1 };
ui.params.add(params, 'terms', -1, N_MAX, 1).name('N (-1: cycle)');

let shown = -2;
stage.frame((t) => {
  const u = t % stage.duration;
  const k = params.terms >= 0 ? params.terms : Math.min(N_MAX, Math.floor((u - LEAD) / PER));
  if (k === shown) return;
  shown = k;
  sums.forEach((line, N) => {
    line.visible = N <= k;
    const c = N === k ? ramp(N / N_MAX) : mix(BACKGROUND, ramp(N / N_MAX), GHOST);
    (line.material as THREE.Material & { color: THREE.Color }).color.setHex(c);
  });
  setText(nLabel, k < 0 ? '' : `N = ${k}`);
});

stage.start();
