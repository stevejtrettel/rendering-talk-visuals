/**
 * A complicated-looking 1D function on the flat 2D stage.
 *
 * This is the seed for the Riemann-sum and Monte-Carlo demos: it establishes
 * the graph look (thick ochre curve, dim slate axes, shaded region beneath)
 * and the shape of the function they will all integrate. The bars just get
 * drawn under this curve.
 */

import { createStage, createUI, C } from '@';
import { axes2d, graph2d, polyline, setPolyline } from '@/lines';

const A = -4.6;
const B = 4.6;

/**
 * Deliberately lumpy — several incommensurate frequencies so no Riemann
 * partition lines up neatly with the features, which is the whole point when
 * showing convergence. Stays positive on [A, B] so the area reads as area.
 */
function f(x: number, phase = 0): number {
  return (
    1.55 +
    0.62 * Math.sin(1.35 * x + phase) +
    0.38 * Math.sin(3.1 * x - 0.6 * phase) +
    0.22 * Math.cos(5.7 * x + 0.3) +
    0.16 * Math.sin(0.55 * x - 1.1)
  );
}

// orthoHeight is the *half-height* of the view, so the visible half-width is
// orthoHeight * 16/9. The domain runs to |x| = 4.6, so anything under ~2.7
// crops the curve — hence 2.85, which leaves a little margin at the ends.
const stage = createStage({
  camera: 'ortho',
  position: [0, 0, 10],
  target: [0, 0, 0],
  orthoHeight: 2.85,
  lights: false,
  controls: false,
});
stage.duration = 10;
// Shift the view up so the curve sits centred and the axis is off the bottom.
stage.camera.position.set(0, 1.15, 10);

const ui = createUI(stage);

stage.add(axes2d({ xRange: [A - 0.3, B + 0.3], yRange: [-0.35, 3.1], tick: 1 }));

const SAMPLES = 700;
const curve = graph2d((x) => f(x), A, B, { samples: SAMPLES, color: C.ochre, width: 5 });
stage.add(curve);

// Domain boundaries, so the interval being integrated is explicit rather than
// implied by where the curve happens to stop. Fixed height, since the curve
// itself moves as the phase animates.
for (const x of [A, B]) {
  stage.add(polyline([[x, -0.15, 0], [x, 3.2, 0]], { color: C.slateDeep, width: 2, opacity: 0.8 }));
}

const params = { animate: true, phase: 0 };
ui.params.add(params, 'animate').name('animate shape');
ui.params.add(params, 'phase', 0, Math.PI * 2, 0.01).listen().name('phase');

const pts: [number, number, number][] = new Array(SAMPLES + 1);

stage.frame((t) => {
  if (params.animate) params.phase = (t / stage.duration) * Math.PI * 2;
  const p = params.phase;
  for (let i = 0; i <= SAMPLES; i++) {
    const x = A + ((B - A) * i) / SAMPLES;
    pts[i] = [x, f(x, p), 0];
  }
  setPolyline(curve, pts);
});

stage.start();
