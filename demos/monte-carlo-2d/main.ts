/**
 * Monte Carlo integration over a region a grid cannot conveniently cover.
 *
 * The floor still carries the same 6×6 plate every surface demo uses, but the
 * integral is not over the plate. It is over a strange region inside it — lobed,
 * pinched, with a hole through the middle — and the graph is drawn only above
 * that region. Points are thrown uniformly *into the region*, each carrying its
 * share of the region's area:
 *
 *     πr² = |D| / N     so     r = √(|D| / πN)
 *
 * which makes each cylinder's *volume* exactly that sample's contribution, and
 * the estimate
 *
 *     |D| · (1/N) Σ f(xᵢ)
 *
 * the total inked volume. That is the same construction the 1D demo uses, with
 * the interval replaced by something you would not want to mesh.
 *
 * ## What this demo is for, and what it deliberately does not say
 *
 * It comes after the 1D Riemann and Monte Carlo demos and before the curse of
 * dimensionality, and its job is only to show the method working somewhere a
 * grid is awkward. **It makes no claim about convergence speed.** On a smooth
 * integrand over a low-dimensional domain a grid beats Monte Carlo badly and
 * honestly — midpoint quadrature is O(h²), Monte Carlo is O(N^-1/2) — and the
 * argument for Monte Carlo is the dimension count, which the next demo makes.
 * So there is no error readout here and nothing to race against.
 *
 * ## The region
 *
 * An analytic signed field, positive inside: a few Gaussian lobes merged
 * together, one subtracted to punch the hole, plus a ripple to keep the boundary
 * from looking manufactured. Being analytic, the point-in-region test the
 * sampler needs is exact and costs a handful of exponentials.
 *
 * ## One texture does all the clipping
 *
 * The field is sampled once into a `DataTexture` holding a *normalised distance
 * estimate* — `g / |∇g|`, rescaled so 0.5 is the boundary. That one texture:
 *
 *   - clips the glass surface and its wireframe, as an `alphaMap` with
 *     `alphaTest = 0.5`. three does the discard; there is no custom shader on
 *     the surface at all.
 *   - draws the region on the floor, filled and rimmed, in a small shader that
 *     reads the same texture.
 *
 * Storing distance rather than the raw field is what makes the rim a constant
 * width in world units: `g` alone is steep in some places and flat in others, so
 * a rim cut at a fixed value of `g` would be a thread on one side of the region
 * and a band on the other. It also means no `fwidth`, so no derivatives
 * extension to forget and no silently black shader.
 *
 * ## The reference value is not sampled
 *
 * `|D|` and `∫_D f` come from a deterministic two-level grid: a coarse midpoint
 * pass over the plate, with only the cells the boundary crosses subdivided. A
 * demo about sampling must not check itself against a sampled answer — that
 * compares a method to a worse copy of itself. Same reasoning as the Simpson
 * references in `functions.ts`. ~86 ms at load, relative accuracy ~2e-5.
 */

import * as THREE from 'three';
import { createUI, C, flat, matte, mix } from '@';
import { label, setText, fixed } from '@/text';
import { FIELD_HALF, bumps2d } from '@/functions';
import {
  Z,
  HOLD,
  START_ANGLE,
  autoOrbit,
  barMaterial,
  createFieldStage,
  floorPlate,
  glassSurface,
} from '@/field2d';
import { mulberry32 } from '@/sampling';

const stage = createFieldStage();
const ui = createUI(stage);

// ---------------------------------------------------------------------------
// The region
// ---------------------------------------------------------------------------

/** Gaussian lobes that merge into the body of the region: [cx, cy, sigma, height]. */
const LOBES: [number, number, number, number][] = [
  [-0.9, -0.5, 1.1, 1.02],
  [1.15, 0.55, 0.95, 0.93],
  [0.3, -1.8, 0.75, 0.72],
  [-1.45, 1.15, 0.78, 0.78],
  // Reached by a narrow neck rather than merged — the pinch is the point.
  [1.85, -1.3, 0.58, 0.6],
];

/**
 * Subtracted, to punch a hole through the thick part.
 *
 * Sized against a real constraint: widen it much past this and the hole stops
 * being a hole. At σ = 0.70, h = 1.20 the dip reaches the boundary and the
 * region opens out into a horseshoe — still a strange shape, but no longer one
 * with a hole in it, and nothing on screen says so. This sits with margin on
 * both sides of that, at roughly a tenth of the region's area, which is big
 * enough to stay legible once the cylinders around it are standing at full N.
 */
const HOLES: [number, number, number, number][] = [[-0.55, 0.2, 0.62, 1.3]];

/**
 * Level at which the region is cut. Tuned by eye against the plate: this leaves
 * roughly a third of a unit of bare floor on every side, so the plate still
 * reads as the rectangle the region sits inside rather than as its frame.
 */
const TAU = 0.47;

/** Positive inside the region, negative outside. */
function g(x: number, y: number): number {
  let v = -TAU + 0.1 * Math.sin(3.1 * x) * Math.cos(2.7 * y) + 0.06 * Math.sin(2.2 * y - 1.1);
  for (const [cx, cy, s, h] of LOBES) {
    v += h * Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * s * s));
  }
  for (const [cx, cy, s, h] of HOLES) {
    v -= h * Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * s * s));
  }
  return v;
}

const inside = (x: number, y: number) => g(x, y) >= 0;

/**
 * The region's area and the exact integral over it, by a two-level midpoint
 * grid: cells wholly inside are taken whole, cells the boundary crosses are
 * subdivided. Deterministic quadrature, never sampling — see the header.
 */
function measureRegion(n = 256, sub = 16): { area: number; integral: number } {
  const d = (2 * FIELD_HALF) / n;
  let area = 0;
  let integral = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const x0 = -FIELD_HALF + i * d;
      const y0 = -FIELD_HALF + j * d;
      let corners = 0;
      if (inside(x0, y0)) corners++;
      if (inside(x0 + d, y0)) corners++;
      if (inside(x0, y0 + d)) corners++;
      if (inside(x0 + d, y0 + d)) corners++;

      if (corners === 4) {
        area += d * d;
        integral += bumps2d(x0 + d / 2, y0 + d / 2) * d * d;
      } else if (corners > 0) {
        const e = d / sub;
        for (let a = 0; a < sub; a++) {
          for (let b = 0; b < sub; b++) {
            const px = x0 + (a + 0.5) * e;
            const py = y0 + (b + 0.5) * e;
            if (inside(px, py)) {
              area += e * e;
              integral += bumps2d(px, py) * e * e;
            }
          }
        }
      }
    }
  }
  return { area, integral };
}

const { area: REGION_AREA, integral: REGION_INTEGRAL } = measureRegion();

// ---------------------------------------------------------------------------
// The mask
// ---------------------------------------------------------------------------

/** Texels across the plate. 1024 puts a texel at about 0.006 world units. */
const MASK_N = 1024;
/**
 * How far either side of the boundary the stored distance runs before it
 * saturates. Only needs to cover the rim; beyond it the value is clamped and
 * only its sign matters.
 */
const REACH = 0.5;

/**
 * A normalised distance estimate, 0.5 exactly on the boundary. `g / |∇g|` is
 * the standard first-order distance to a level set, and it is what makes a rim
 * cut at a fixed value come out a constant width in world units.
 */
const maskTex = (() => {
  const data = new Uint8Array(MASK_N * MASK_N * 4);
  const step = (2 * FIELD_HALF) / MASK_N;
  const h = step * 0.5;
  for (let j = 0; j < MASK_N; j++) {
    // Both the surface and the floor patch are planes laid flat with
    // `rotateX(-π/2)`, which sends the plane's +y to world −z. So texture row j
    // is world z = +HALF − (j + ½)·step, not −HALF + …. Getting this backwards
    // mirrors the mask against the samples, and since the region is close to
    // symmetric it looks *nearly* right — the rim just stops agreeing with the
    // cylinders it is supposed to contain.
    const y = FIELD_HALF - (j + 0.5) * step;
    for (let i = 0; i < MASK_N; i++) {
      const x = -FIELD_HALF + (i + 0.5) * step;
      const v = g(x, y);
      const gx = (g(x + h, y) - g(x - h, y)) / (2 * h);
      const gy = (g(x, y + h) - g(x, y - h)) / (2 * h);
      const grad = Math.max(Math.hypot(gx, gy), 1e-6);
      const dist = v / grad;
      const norm = Math.min(Math.max(0.5 + dist / (2 * REACH), 0), 1);
      const b = Math.round(norm * 255);
      const o = (j * MASK_N + i) * 4;
      data[o] = b;
      data[o + 1] = b;
      data[o + 2] = b;
      data[o + 3] = b;
    }
  }
  const tex = new THREE.DataTexture(data, MASK_N, MASK_N, THREE.RGBAFormat);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
})();

// ---------------------------------------------------------------------------
// Scenery
// ---------------------------------------------------------------------------

// The plate: still the whole rectangle, so the region is visibly a part of it.
stage.add(floorPlate());

/**
 * The region on the floor: filled, with a bright rim on the boundary.
 *
 * Its own shader rather than another alpha-tested plane, because the rim wants
 * the distance either side of the boundary and a binary mask has thrown that
 * away. Drawn just above the plate so the grid shows through the fill.
 */
const RIM_W = 0.035;
const regionPatch = new THREE.Mesh(
  new THREE.PlaneGeometry(2 * FIELD_HALF, 2 * FIELD_HALF).rotateX(-Math.PI / 2),
  new THREE.ShaderMaterial({
    uniforms: {
      uMask: { value: maskTex },
      uFill: { value: new THREE.Color(C.ochreDeep) },
      uRim: { value: new THREE.Color(C.ochre) },
      uReach: { value: REACH },
      uRimW: { value: RIM_W },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMask;
      uniform vec3 uFill;
      uniform vec3 uRim;
      uniform float uReach;
      uniform float uRimW;
      varying vec2 vUv;
      void main() {
        // Back to a signed distance in world units.
        float d = (texture2D(uMask, vUv).g - 0.5) * 2.0 * uReach;
        if (d < -uRimW) discard;
        float rim = 1.0 - smoothstep(0.0, uRimW, abs(d));
        vec3 col = mix(uFill, uRim, rim);
        // The fill is faint so the grid reads through it; the rim is not.
        gl_FragColor = vec4(col, mix(0.30, 0.95, rim));
      }
    `,
  }),
);
regionPatch.position.y = 0.004;
regionPatch.renderOrder = 2;
stage.add(regionPatch);

// The graph, clipped to the region by the same mask.
stage.add(
  glassSurface(bumps2d, {
    alphaMap: maskTex,
    maskThreshold: 0.5,
    // Denser than the default: the clip is per-fragment, so the boundary is
    // crisp whatever the mesh does, but the *height* along it is only as good
    // as the vertices, and a coarse mesh leaves the rim tube visibly floating
    // off the sheet it is supposed to edge.
    res: 260,
    wire: 44,
    // Solid enough to read as a surface rather than a haze. The cylinders
    // underneath still show through, which is the point of glass, but the
    // graph is now the thing the eye lands on first.
    opacity: 0.72,
  }),
);

// ---------------------------------------------------------------------------
// The rim around the graph's boundary
// ---------------------------------------------------------------------------

/**
 * The boundary of the region, as closed loops of points, by marching squares.
 *
 * Needed because the graph's edge is no longer the square that `surfaceRim`
 * assumes — it is wherever `g` crosses zero, which is not known in closed form.
 * There is one loop around the outside and one around the hole, and both come
 * out of the same walk with no special handling.
 *
 * Crossings are keyed by the *grid edge* they lie on rather than by their
 * coordinates. Two neighbouring cells compute the crossing on their shared edge
 * from the same two corner values but in opposite order, so the two results can
 * differ in the last bits; hashing rounded coordinates would then occasionally
 * fail to join them and leave a loop split in two. The edge index is exact.
 */
function boundaryLoops(m = 420): THREE.Vector2[][] {
  const step = (2 * FIELD_HALF) / m;
  const coord = (k: number) => -FIELD_HALF + k * step;
  const val = new Float64Array((m + 1) * (m + 1));
  for (let j = 0; j <= m; j++) {
    for (let i = 0; i <= m; i++) val[j * (m + 1) + i] = g(coord(i), coord(j));
  }
  const V = (i: number, j: number) => val[j * (m + 1) + i];

  /** Where the boundary crosses a grid edge, cached and keyed exactly. */
  const cross = new Map<number, THREE.Vector2>();
  const hKey = (i: number, j: number) => 2 * (j * (m + 1) + i);
  const vKey = (i: number, j: number) => 2 * (j * (m + 1) + i) + 1;
  const horiz = (i: number, j: number) => {
    const k = hKey(i, j);
    let p = cross.get(k);
    if (!p) {
      const a = V(i, j);
      const b = V(i + 1, j);
      const t = a / (a - b);
      p = new THREE.Vector2(-FIELD_HALF + (i + t) * step, -FIELD_HALF + j * step);
      cross.set(k, p);
    }
    return k;
  };
  const vert = (i: number, j: number) => {
    const k = vKey(i, j);
    let p = cross.get(k);
    if (!p) {
      const a = V(i, j);
      const b = V(i, j + 1);
      const t = a / (a - b);
      p = new THREE.Vector2(-FIELD_HALF + i * step, -FIELD_HALF + (j + t) * step);
      cross.set(k, p);
    }
    return k;
  };

  const segs: [number, number][] = [];
  for (let j = 0; j < m; j++) {
    for (let i = 0; i < m; i++) {
      const v00 = V(i, j);
      const v10 = V(i + 1, j);
      const v11 = V(i + 1, j + 1);
      const v01 = V(i, j + 1);
      let c = 0;
      if (v00 >= 0) c |= 1;
      if (v10 >= 0) c |= 2;
      if (v11 >= 0) c |= 4;
      if (v01 >= 0) c |= 8;
      if (c === 0 || c === 15) continue;
      const B = () => horiz(i, j);
      const T = () => horiz(i, j + 1);
      const L = () => vert(i, j);
      const R = () => vert(i + 1, j);
      switch (c) {
        case 1: case 14: segs.push([L(), B()]); break;
        case 2: case 13: segs.push([B(), R()]); break;
        case 3: case 12: segs.push([L(), R()]); break;
        case 4: case 11: segs.push([R(), T()]); break;
        case 6: case 9: segs.push([B(), T()]); break;
        case 7: case 8: segs.push([T(), L()]); break;
        // Saddles: which way the two strands pass is decided by the value at
        // the cell centre, approximated by the corner mean.
        case 5: case 10: {
          const mid = (v00 + v10 + v11 + v01) / 4;
          if ((c === 5) === (mid >= 0)) {
            segs.push([L(), B()], [R(), T()]);
          } else {
            segs.push([T(), L()], [B(), R()]);
          }
          break;
        }
      }
    }
  }

  // Walk segments into closed loops.
  const byEnd = new Map<number, number[]>();
  segs.forEach(([a, b], s) => {
    for (const e of [a, b]) {
      const l = byEnd.get(e);
      if (l) l.push(s);
      else byEnd.set(e, [s]);
    }
  });

  const used = new Uint8Array(segs.length);
  const loops: THREE.Vector2[][] = [];
  for (let s0 = 0; s0 < segs.length; s0++) {
    if (used[s0]) continue;
    const loop: THREE.Vector2[] = [];
    let s = s0;
    let end = segs[s][0];
    while (s !== -1 && !used[s]) {
      used[s] = 1;
      const [a, b] = segs[s];
      const next = a === end ? b : a;
      loop.push(cross.get(next)!);
      end = next;
      s = (byEnd.get(next) ?? []).find((q) => !used[q]) ?? -1;
    }
    // Stray fragments are marching-squares noise, not boundary.
    if (loop.length > 24) loops.push(loop);
  }
  return loops;
}

/**
 * A tube following the graph's edge, one per boundary loop.
 *
 * A transparent sheet whose edge is also transparent has no silhouette: where
 * the integrand runs low the pane dissolves into the floor and you cannot tell
 * how far it extends, nor that it has a hole in it. A solid, lit tube gives it
 * one, and being real geometry it occludes and is occluded correctly, so it
 * also says which parts of the sheet are in front of which cylinders.
 */
const RIM_RADIUS = 0.045;
/** Spacing between tube control points, in world units. */
const RIM_STEP = 0.05;
for (const loop of boundaryLoops()) {
  // Marching squares puts points about a grid cell apart — far finer than a
  // tube needs. Thin to a fixed spacing along the curve, so the outer loop and
  // the much shorter one round the hole get the same smoothness.
  let perimeter = 0;
  for (let i = 0; i < loop.length; i++) {
    perimeter += loop[i].distanceTo(loop[(i + 1) % loop.length]);
  }
  const stride = Math.max(1, Math.round((loop.length * RIM_STEP) / perimeter));
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < loop.length; i += stride) {
    const p = loop[i];
    pts.push(new THREE.Vector3(p.x, bumps2d(p.x, p.y) * Z, p.y));
  }
  if (pts.length < 4) continue;
  const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
  const tube = new THREE.Mesh(
    new THREE.TubeGeometry(curve, pts.length, RIM_RADIUS, 8, true),
    matte(mix(C.blue, C.bone, 0.55), { roughness: 0.5 }),
  );
  tube.renderOrder = 22;
  stage.add(tube);
}

// ---------------------------------------------------------------------------
// Samples
// ---------------------------------------------------------------------------

const MAX_N = 1500;
const SEED = 20260804;
/** Seconds of graph-and-domain alone before the first sample lands. */
const LEAD = 2.2;

/**
 * Uniform points in the region, by rejection from the plate: propose, keep the
 * ones inside. Regenerated from the fixed seed every frame and truncated to the
 * first n, so the first n samples are always the same ones and a frame-stepped
 * export is exact.
 *
 * The rejected proposals are not drawn. They are how the points are made, not
 * what the demo is about, and a cloud of dead points outside the region reads as
 * if they were part of the estimate.
 */
function drawSamples(n: number): Float64Array {
  const out = new Float64Array(n * 2);
  const rng = mulberry32(SEED);
  let k = 0;
  // Bounded so a mistuned region can never spin here forever.
  for (let guard = 0; k < n && guard < n * 200; guard++) {
    const x = -FIELD_HALF + rng() * 2 * FIELD_HALF;
    const y = -FIELD_HALF + rng() * 2 * FIELD_HALF;
    if (!inside(x, y)) continue;
    out[2 * k] = x;
    out[2 * k + 1] = y;
    k++;
  }
  return out;
}

const cylGeom = new THREE.CylinderGeometry(1, 1, 1, 28);
cylGeom.translate(0, 0.5, 0);

const cylinders = new THREE.InstancedMesh(cylGeom, barMaterial(), MAX_N);
cylinders.frustumCulled = false;
cylinders.count = 0;
stage.add(cylinders);

// A spike drawn only up to the surface would sit entirely inside its own solid
// cylinder and never be seen, so each one overshoots and pokes out through the
// glass like a pin: fully depth-tested, correctly occluded, and the tips show
// where samples landed even from a high angle.
const SPIKE_POKE = 0.22;
const SPIKE_R = 0.012;
const spikeMat = flat(C.bone, { transparent: true, opacity: 0.75 });
const spikes = new THREE.InstancedMesh(cylGeom, spikeMat, MAX_N);
spikes.frustumCulled = false;
spikes.count = 0;
stage.add(spikes);

// ---------------------------------------------------------------------------
// Readout
// ---------------------------------------------------------------------------

const ASPECT = 16 / 9;
// No error line, and the region's area in its place: it is the factor the
// estimate is actually built from, and the thing a rectangle would not have.
const KEYS = ['samples', 'region area', 'estimate', 'exact'];
const values = KEYS.map((key, i) => {
  const y = 0.88 - i * 0.115;
  stage.hud.add(
    label(key, { size: 0.055, color: C.slate, anchorY: 'middle', position: [-ASPECT + 0.08, y, 0] }),
  );
  const v = label('', {
    size: 0.055,
    color: C.bone,
    anchorY: 'middle',
    position: [-ASPECT + 0.52, y, 0],
  });
  stage.hud.add(v);
  return v;
});

stage.hud.add(
  label('Monte Carlo', {
    size: 0.07,
    color: C.ochre,
    position: [-ASPECT + 0.08, -0.94, 0],
  }),
);

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

const params = {
  mode: 'stream' as 'stream' | 'fixed',
  N: 400,
  spikes: true,
  autoOrbit: false,
};
ui.params.add(params, 'mode', ['stream', 'fixed']).name('mode');
ui.params.add(params, 'N', 1, MAX_N, 1).name('N (samples)');
ui.params.add(params, 'spikes').name('spikes');
ui.params.add(params, 'autoOrbit').name('auto-orbit');

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

const dummy = new THREE.Object3D();

stage.frame((t) => {
  // The raw phase, which the orbit rides so it closes its circle over the loop.
  const phase = stage.progress(t);
  if (params.autoOrbit) autoOrbit(stage, phase, START_ANGLE);
  // Auto-orbit is a returning motion: with it on the export has to run the full
  // loop or the circle is cut mid-turn. With it off the export stops the instant
  // the ramp lands on its final N, and preview still parks on the answer.
  stage.captureEnd = params.autoOrbit ? undefined : stage.duration - HOLD;

  // The ramp sits between a lead and a hold: LEAD seconds of nothing but the
  // graph and its domain, then samples accumulate, then HOLD seconds parked on
  // the finished estimate.
  const tt = stage.duration > 0 ? t % stage.duration : 0;
  const span = Math.max(stage.duration - LEAD - HOLD, 1e-6);
  const u = Math.min(Math.max((tt - LEAD) / span, 0), 1);

  let n = Math.round(params.N);
  if (params.mode === 'stream') {
    // Nothing at all to begin with. The region and the surface over it are what
    // the opening frames are for — a hundred cylinders standing in the way is
    // no way to introduce the domain they are standing on.
    n = tt < LEAD ? 0 : Math.max(1, Math.round(Math.exp(Math.log(Math.max(params.N, 1)) * u)));
  }
  n = Math.min(Math.max(n, 0), MAX_N);

  const pts = drawSamples(n);
  const radius = Math.sqrt(REGION_AREA / (Math.PI * n));
  const weight = REGION_AREA / n;

  let sum = 0;
  for (let i = 0; i < n; i++) {
    const x = pts[2 * i];
    const z = pts[2 * i + 1];
    const fv = bumps2d(x, z);
    sum += fv * weight;

    const h = fv * Z;
    dummy.position.set(x, 0, z);
    dummy.scale.set(radius, Math.max(h, 1e-5), radius);
    dummy.updateMatrix();
    cylinders.setMatrixAt(i, dummy.matrix);

    dummy.scale.set(SPIKE_R, h + SPIKE_POKE, SPIKE_R);
    dummy.updateMatrix();
    spikes.setMatrixAt(i, dummy.matrix);
  }

  cylinders.count = n;
  cylinders.instanceMatrix.needsUpdate = true;
  spikes.count = params.spikes ? n : 0;
  spikes.instanceMatrix.needsUpdate = true;
  // Fade spikes as they crowd, or they turn into a solid pale thicket.
  spikeMat.opacity = Math.max(0.12, 0.75 * Math.min(1, 150 / n));

  setText(values[0], String(n));
  setText(values[1], fixed(REGION_AREA));
  // With no samples yet there is no estimate — printing 0.000 would read as an
  // estimate of zero rather than as not having started.
  setText(values[2], n === 0 ? '-' : fixed(sum));
  setText(values[3], fixed(REGION_INTEGRAL));
});

stage.start();
