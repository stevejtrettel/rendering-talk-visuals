/**
 * Every pixel of a light field holds a whole spectrum.
 *
 * The room already flat, its light in the sheets — and then over every
 * texel a curve stands up: wavelength across, radiance up. Not a colour
 * per pixel, a *function* per pixel. `light-field-forest` made the same
 * move for the directional factor, 8×8 cells inside every cell; this is
 * the other factor, and the two together are what a light field costs.
 *
 * The inner S² grid is deliberately absent. Drawing the directional
 * subdivision and the spectral one at once would be honest about the size
 * of the store and unreadable as a picture, so this demo takes the coarse
 * chart — one value per texel, the hemisphere mean — and asks what that
 * one value really is.
 *
 * ## THE CURVES ARE RECONSTRUCTED, AND THE SLIDE MUST SAY SO
 *
 * The bake is not spectral. Its payload is rgb + a sample count per
 * (texel, direction), so there is no wavelength axis anywhere in the data
 * — the tracer that produced it is an RGB tracer. Every curve drawn here
 * is therefore a **metamer**: the smooth positive spectrum, in the deck's
 * own three-curve basis from `still-life.ts`, whose XYZ matches the
 * colour that was actually stored.
 *
 * That makes this the one demo in the family that is not drawing solved
 * data, and the claim it supports is about the MODEL — a light field
 * assigns a spectrum to every state — rather than about this bundle. Said
 * that way it is true and worth saying. Said as "here is what we stored"
 * it is false. If the field is ever re-baked spectrally, delete
 * `reconstruct` and read the curve straight out of the payload.
 *
 * The reconstruction is approximate on purpose, and here is how
 * approximate. Solving is exact — `solve3` hits the target XYZ dead on —
 * so all the error is in the clamp at zero, and on this bundle **557 of
 * the 1,575 texels clamp**, worst case discarding a weight worth 0.32 of
 * that pixel's luminance. Those are the saturated walls: narrow, saturated
 * colours lie outside what three broad positive curves can reach, which is
 * the same fact `metamerism` is about. Re-measure if the scene is re-baked
 * — a more saturated room would push that fraction up.
 *
 * It costs less than it sounds, because the curves are drawn as ink and
 * never as colour, so a clamped pixel is never shown a colour it does not
 * have. What clamping does move is the curve's SHAPE and its HEIGHT: a
 * clamped texel gets the nearest reachable spectrum, at the luminance that
 * spectrum happens to carry.
 *
 * ## Choices made for readability, all of them stated
 *
 * - **One gain for every curve**, not per-pixel normalisation. A bright
 *   pixel's spectrum is genuinely taller than a dark one's, and that is
 *   most of what the picture shows. The gain is set from a high quantile
 *   rather than the maximum, so the lamp runs off the top instead of
 *   flattening the room into the floor.
 * - **Spectra are ink, never tinted by their surface.** The same rule
 *   `room2d.ts` sets for the spectrum panel: the palette belongs to the
 *   room, the spectrum is ink. Tinting each curve by its own pixel would
 *   make a field of them read as scenery.
 * - All blades face the same way, so the wavelength axis means one
 *   direction everywhere in the frame.
 */

import * as THREE from 'three';
import { createStage, createUI, C } from '@';
import { applyShot, createUnwrap, frameBox, lerpShot, ramp, smootherstep } from '@/lightfield/unwrap';
import { chartSurface } from '@/lightfield/tiles';
import { BASE, project } from '@/still-life';
import { NS } from '@/room2d';

const stage = createStage({ controls: false, lights: false });
stage.duration = 13;

// For the Capture panel and the `V` key — see light-field-unfold.
createUI(stage);

const u = await createUnwrap(stage);
const camera = stage.camera as THREE.PerspectiveCamera;
u.setPeel(1); // opens on the sheets; the unfolding is demo 1

// --- reconstruction ------------------------------------------------------
// weights → XYZ, from the three basis curves. `project` integrates against
// the CIE observer, so this matrix is the same map the rest of the deck
// uses; nothing here invents a colour convention.
const A: number[][] = (() => {
  const cols = BASE.map((b) => project(b));
  return [0, 1, 2].map((c) => [0, 1, 2].map((b) => cols[b][c]));
})();

// Linear sRGB → XYZ (D65). The stored radiance is linear in the display
// primaries, which is what the sheet shaders hand to the tone mapper.
const RGB_TO_XYZ = [
  [0.4124, 0.3576, 0.1805],
  [0.2126, 0.7152, 0.0722],
  [0.0193, 0.1192, 0.9505],
];

function solve3(m0: number[][], rhs: number[]): [number, number, number] {
  const m = m0.map((row, i) => [...row, rhs[i]]);
  for (let i = 0; i < 3; i++) {
    let p = i;
    for (let k = i + 1; k < 3; k++) if (Math.abs(m[k][i]) > Math.abs(m[p][i])) p = k;
    [m[i], m[p]] = [m[p], m[i]];
    for (let k = 0; k < 3; k++) {
      if (k === i) continue;
      const f = m[k][i] / m[i][i];
      for (let j = i; j < 4; j++) m[k][j] -= f * m[i][j];
    }
  }
  return [m[0][3] / m[0][0], m[1][3] / m[1][1], m[2][3] / m[2][2]];
}

/** The basis weights of a metamer for one stored linear-RGB radiance. */
function reconstruct(r: number, g: number, b: number): [number, number, number] {
  const xyz = RGB_TO_XYZ.map((row) => row[0] * r + row[1] * g + row[2] * b);
  const w = solve3(A, xyz);
  // Clamping is where the approximation lives — see the header.
  return [Math.max(w[0], 0), Math.max(w[1], 0), Math.max(w[2], 0)];
}

// --- one blade per texel that holds data ---------------------------------
const positions: number[] = [];
const weights: number[] = [];
const seeds: number[] = [];
const peaks: number[] = [];

/** Does this chart's primitive emit? The lamp is orders brighter than any
 * wall, and 49 of the field's 1,575 texels are lamp — enough that a plain
 * high quantile lands inside it and scales every other curve to a
 * scratch. Emissive texels get their blade like everything else; they
 * just do not get a vote on the gain. */
function emissive(ci: number): boolean {
  const c = u.charts[ci];
  const mat =
    c.kind === 1 ? u.bundle.scene.spheres[c.prim].material : u.bundle.scene.quads[c.prim].material;
  return mat.emission[0] + mat.emission[1] + mat.emission[2] > 0;
}

const emitters: boolean[] = [];

for (let ci = 0; ci < u.charts.length; ci++) {
  const c = u.charts[ci];
  const isEmitter = emissive(ci);
  const surf = chartSurface(u.bundle, c);
  for (let ly = 0; ly < c.h; ly++) {
    for (let lx = 0; lx < c.w; lx++) {
      const o = (ly * c.w + lx) * 4;
      if (surf[o + 3] < 0.5) continue; // never baked: a hole in the net
      const w = reconstruct(surf[o], surf[o + 1], surf[o + 2]);
      const p = u.cellCentre(ci, lx, ly);
      positions.push(p.x, p.y, p.z);
      weights.push(w[0], w[1], w[2]);
      // Deterministic arrival order. Never Math.random(): the exporter
      // re-runs this per frame and the video would boil.
      seeds.push(((Math.sin(ci * 12.9898 + lx * 78.233 + ly * 37.719) * 43758.5453) % 1 + 1) % 1);
      let peak = 0;
      for (let k = 0; k <= NS; k++) {
        peak = Math.max(peak, w[0] * BASE[0][k] + w[1] * BASE[1][k] + w[2] * BASE[2][k]);
      }
      peaks.push(peak);
      emitters.push(isEmitter);
    }
  }
}
const COUNT = peaks.length;

// The gain: a high quantile of the NON-emissive curves. The lamp then
// runs off the top of the shot, which is true — it is orders brighter
// than any wall — instead of pressing the whole room flat.
const TALL = 5.5; // texels, the height the quantile maps to
const sorted = peaks.filter((_p, i) => !emitters[i]).sort((a, b) => a - b);
const quantile = sorted[Math.floor(0.97 * (sorted.length - 1))] || 1;
const GAIN = TALL / quantile;

// --- geometry ------------------------------------------------------------
// A ribbon from the sheet up to the curve, instanced once per texel. The
// curve itself is the ribbon's top edge, brightened in the fragment
// shader — one draw call gives both the ink and the wash under it, which
// is the same pairing `room2d`'s spectrum panel draws.
const strip = new THREE.InstancedBufferGeometry();
const aU: number[] = [];
const aSide: number[] = [];
const index: number[] = [];
for (let k = 0; k <= NS; k++) {
  aU.push(k / NS, k / NS);
  aSide.push(0, 1);
  if (k < NS) index.push(2 * k, 2 * k + 1, 2 * k + 2, 2 * k + 1, 2 * k + 3, 2 * k + 2);
}
strip.setAttribute('aU', new THREE.Float32BufferAttribute(aU, 1));
strip.setAttribute('aSide', new THREE.Float32BufferAttribute(aSide, 1));
strip.setAttribute('position', new THREE.Float32BufferAttribute(new Array(aU.length * 3).fill(0), 3));
strip.setIndex(index);
strip.setAttribute('iPos', new THREE.InstancedBufferAttribute(new Float32Array(positions), 3));
strip.setAttribute('iW', new THREE.InstancedBufferAttribute(new Float32Array(weights), 3));
strip.setAttribute('iSeed', new THREE.InstancedBufferAttribute(new Float32Array(seeds), 1));
strip.instanceCount = COUNT;
strip.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);

// The three basis curves, sampled on the shared grid and handed to the
// shader as a lookup. Keeping the curves in one place means the drawn
// spectrum and the reconstruction can never disagree about their shape.
const basisData = new Float32Array((NS + 1) * 4);
for (let k = 0; k <= NS; k++) {
  basisData[4 * k] = BASE[0][k];
  basisData[4 * k + 1] = BASE[1][k];
  basisData[4 * k + 2] = BASE[2][k];
  basisData[4 * k + 3] = 1;
}
const basisTex = new THREE.DataTexture(basisData, NS + 1, 1, THREE.RGBAFormat, THREE.FloatType);
basisTex.minFilter = THREE.LinearFilter;
basisTex.magFilter = THREE.LinearFilter;
basisTex.wrapS = THREE.ClampToEdgeWrapping;
basisTex.needsUpdate = true;

const ink = new THREE.Color(C.bone).convertSRGBToLinear();

const material = new THREE.ShaderMaterial({
  uniforms: {
    basis: { value: basisTex },
    gain: { value: GAIN },
    bladeW: { value: 0.92 }, // texels. Just under 1, so blades do not merge.
    band: { value: 0.34 }, // ink thickness under the curve, in texels
    rise: { value: 0 },
    ink: { value: ink },
  },
  vertexShader: /* glsl */ `
    attribute float aU;
    attribute float aSide;
    attribute vec3 iPos;
    attribute vec3 iW;
    attribute float iSeed;
    uniform sampler2D basis;
    uniform float gain;
    uniform float bladeW;
    uniform float rise;
    varying float vY;
    varying float vVal;

    float ease(float x) { return x * x * x * (x * (6.0 * x - 15.0) + 10.0); }

    void main() {
      // Staggered arrival, keyed off a per-instance seed so it is the same
      // every frame and the export does not boil.
      float local = ease(clamp(rise * 1.7 - iSeed * 0.7, 0.0, 1.0));
      vec3 b = texture2D(basis, vec2(aU, 0.5)).rgb;
      float val = max(dot(b, iW), 0.0) * gain * local;
      float y = aSide * val;
      vVal = val;
      vY = y;
      vec3 p = iPos + vec3((aU - 0.5) * bladeW, y, 0.0);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 ink;
    uniform float band;
    varying float vY;
    varying float vVal;

    void main() {
      // Distance below the curve, in world units, so the ink band is a
      // constant thickness rather than a fraction of each curve's height —
      // a fraction would make tall curves fat and short ones hairlines.
      float d = vVal - vY;
      float k = 1.0 - smoothstep(0.0, band, d);
      gl_FragColor = vec4(ink * mix(0.55, 1.0, k), mix(0.16, 1.0, k));
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
});

const blades = new THREE.Mesh(strip, material);
blades.frustumCulled = false;
blades.renderOrder = 2;
stage.scene.add(blades);

// --- the shot ------------------------------------------------------------
const HOLD = 1.8;
// Lower than the forest's plan view, which would foreshorten every blade
// to a line — but not by much. A vertical segment seen from elevation θ
// keeps cos θ of its length, so there is plenty of room to tilt: this sits
// near 53°, where the curves still read side-on and the sheets under them
// are not crushed to grazing.
const OVERHEAD = new THREE.Vector3(0, 0.88, 0.66);

// Both boxes are the sheet plus exactly the blade height. Padding the box
// vertically "to be safe" is what kept the close shot far away: frameBox
// fits every corner, so slack in y is spent pulling the camera back, and
// the shot that is supposed to let you read one curve ends up showing the
// whole net.
const wideBox = u.boxes.net.clone();
wideBox.min.y = 0;
wideBox.max.y = TALL;
const WIDE = frameBox(camera, wideBox, OVERHEAD, 1.06);

// In close enough that a single curve is legible — that is the whole
// claim — with a texel of margin so the field plainly continues past it.
const CLOSE = (() => {
  const box = u.boxes.floor.clone();
  box.expandByScalar(1);
  box.min.y = 0;
  box.max.y = TALL;
  return frameBox(camera, box, OVERHEAD, 1.02);
})();
applyShot(stage, WIDE);

// Ramps to a result and parks on it, so the export ends on the answer.
stage.captureEnd = stage.duration - HOLD;

stage.frame((t) => {
  const rise = smootherstep(ramp(t, 0.7, stage.duration - HOLD - 0.7));
  material.uniforms.rise.value = rise;
  lerpShot(stage, WIDE, CLOSE, rise);
});

stage.start();
