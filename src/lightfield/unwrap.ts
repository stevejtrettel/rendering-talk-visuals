/**
 * The unwrap scene: a baked room, the net it unfolds into, the fiber over
 * a pixel, and the field of all of them.
 *
 * Shared because three demos genuinely want the same thing —
 * `light-field-unfold`, `light-field-fibers` and `light-field-forest` are
 * three windows on one construction, and copying it to vary a timeline
 * would guarantee they drift apart. Each demo builds this, then drives
 * `setPeel`, `setForest` and the loupes from its own `t`.
 *
 * ## Everything is in texel units
 *
 * The room is drawn at `texelsPerUnit` scale, so one atlas texel is one
 * world unit in the room AND in the net. Pixels therefore never change
 * size — the peel moves them, the forest subdivides inside them, and
 * neither resizes them. That invariant is the reason the animations read
 * as claims about storage rather than as effects.
 *
 * ## Two grids, drawn by one shader
 *
 * A sheet is a chart's texels; a fiber is one texel's directions. Both are
 * cell grids over a float texture, so both use `cellMaterial`, and the
 * borders are measured in PIXELS via `fwidth` rather than in cell
 * fractions — a fixed fraction moires the moment cells get small, and
 * these demos fly through every scale from a whole room to one texel.
 *
 * Grid lines are load-bearing, not decoration: a diffuse fiber's cells all
 * hold the same value, so without borders "here is a texture" shows
 * nothing appearing. With them it says the true thing — there is a grid
 * here, it has N² slots, and every slot holds one number.
 *
 * ## Colour
 *
 * The shaders emit LINEAR radiance and let the renderer's ACES + sRGB do
 * the rest (`<tonemapping_fragment>`, `<colorspace_fragment>`), so these
 * demos sit in the same visual language as the rest of the deck and
 * respond to `toneMappingExposure` like everything else.
 */

import * as THREE from 'three';
import type { Stage } from '../stage';
import { loadBundle, type Chart, type LoadedBundle, type V3 } from './bundle';
import { buildPeel, quadFrame, type PeelNode } from './peel';
import { chartNested, chartSurface, displayMask, fiberTexture, normalFrame, texelNormal } from './tiles';

import bundleJson from '../assets/lightfield/unwrap-c701e8a5.json?url';
import bundleBin from '../assets/lightfield/unwrap-c701e8a5.bin?url';

const v3 = (a: V3): THREE.Vector3 => new THREE.Vector3(a[0], a[1], a[2]);
export const smootherstep = (x: number): number => {
  const c = Math.min(1, Math.max(0, x));
  return c * c * c * (c * (6 * c - 15) + 10);
};
export const ramp = (x: number, from: number, len: number): number =>
  Math.min(1, Math.max(0, (x - from) / len));

// --- shaders -------------------------------------------------------------

const CELL_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const CELL_FRAG = /* glsl */ `
  uniform sampler2D map;
  uniform vec2 cells;
  uniform float border;   // line half-width in PIXELS
  uniform vec2 sel;       // highlighted cell, or (-1,-1)
  uniform float fade;
  varying vec2 vUv;

  void main() {
    vec4 texel = texture2D(map, vUv);
    vec3 c = texel.rgb;
    // A cool grey, deliberately not near-black: genuine darkness is
    // common here, and "no data" must not read as "no light".
    if (texel.a < 0.5) c = vec3(0.020, 0.022, 0.032);

    vec2 p = vUv * cells;
    vec2 g = min(fract(p), 1.0 - fract(p));
    vec2 w = max(fwidth(p), vec2(1e-5));
    float d = min(g.x / w.x, g.y / w.y);
    c = mix(c, c * 0.25, 1.0 - smoothstep(border, border + 1.0, d));

    if (sel.x >= 0.0 && all(equal(floor(p), sel))) {
      c = mix(c, vec3(1.6, 1.45, 0.75), (1.0 - smoothstep(2.0, 3.6, d)) * 0.92);
    }
    gl_FragColor = vec4(c * fade, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/**
 * The unfold, as two stages — and they are literally the two lines of the
 * octahedral map:
 *   ① radial projection onto the L1 ball (the ball facets)
 *   ② the fold that sends the lower four triangles into the corners
 * Stage ② is NOT an isometry: the map sends each lower triangle
 * (equilateral) to a right isoceles half-square, so it distorts them and
 * no rigid unfolding exists. This is the map opening out, not cardboard —
 * worth not overclaiming in the talk.
 *
 * `frame` rotates the fiber so its pole is the surface normal, which is
 * what puts the outward hemisphere in the middle of the square.
 */
const OCT_VERT = /* glsl */ `
  uniform float t;
  uniform mat3 frame;
  uniform vec3 centre;
  uniform float radius;
  uniform vec3 netOrigin;
  uniform vec3 netU;
  uniform vec3 netV;
  varying vec2 vUv;

  float ease(float x) { return x * x * x * (x * (6.0 * x - 15.0) + 10.0); }

  void main() {
    vUv = uv;
    vec2 f = uv * 2.0 - 1.0;
    vec3 n = vec3(f.x, f.y, 1.0 - abs(f.x) - abs(f.y));
    float k = clamp(-n.z, 0.0, 1.0);
    n.x += n.x >= 0.0 ? -k : k;
    n.y += n.y >= 0.0 ? -k : k;
    n = frame * n;

    vec3 pSphere = centre + radius * normalize(n);
    vec3 pOct = centre + radius * n;
    vec3 pFlat = netOrigin + uv.x * netU + uv.y * netV;

    vec3 p = t < 0.5
      ? mix(pSphere, pOct, ease(clamp(t * 2.0, 0.0, 1.0)))
      : mix(pOct, pFlat, ease(clamp((t - 0.5) * 2.0, 0.0, 1.0)));
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const FOREST_VERT = /* glsl */ `
  attribute vec2 iCell;
  attribute float iSeed;
  uniform vec3 chartOrigin;
  uniform vec3 chartU;
  uniform vec3 chartV;
  uniform vec2 chartCells;
  uniform vec3 lift;
  uniform float landY;
  uniform float rise;
  uniform float flySize;
  varying vec2 vUv;
  varying vec2 vCell;
  varying float vRise;

  float ease(float x) { return x * x * x * (x * (6.0 * x - 15.0) + 10.0); }

  void main() {
    vUv = uv;
    vCell = iCell;
    // Staggered by a per-tile seed so they arrive as a wave; the
    // multiplying reads, rather than a slab appearing at once.
    float r = ease(clamp((rise - 0.35 * iSeed) / 0.65, 0.0, 1.0));
    vRise = r;

    vec3 du = chartU / chartCells.x;
    vec3 dv = chartV / chartCells.y;
    vec3 centre = chartOrigin + (iCell.x + 0.5) * du + (iCell.y + 0.5) * dv
                + lift * (1.0 - r) + vec3(0.0, landY, 0.0);
    float s = mix(flySize, 1.0, r);
    vec3 p = centre + (uv.x - 0.5) * du * s + (uv.y - 0.5) * dv * s;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const FOREST_FRAG = /* glsl */ `
  uniform sampler2D nested;
  uniform sampler2D flatMap;
  uniform vec2 chartCells;
  uniform float bins;
  uniform float collapse;
  varying vec2 vUv;
  varying vec2 vCell;
  varying float vRise;

  void main() {
    if (vRise <= 0.0) discard;
    vec4 tile = texture2D(nested, (vCell + vUv) / chartCells);
    vec4 flatv = texture2D(flatMap, (vCell + 0.5) / chartCells);
    vec3 lit = mix(tile.rgb, flatv.rgb, collapse);
    vec3 c = tile.a < 0.5 ? mix(vec3(0.016, 0.018, 0.026), lit, collapse) : lit;

    // Two grids, retiring at different times. The inner (bin) borders go
    // with the collapse — after it there are no bins. The outer (pixel)
    // border stays: what is left is a texture, and it has to look like
    // pixels.
    vec2 p = vUv * bins;
    vec2 g = min(fract(p), 1.0 - fract(p));
    vec2 w = max(fwidth(p), vec2(1e-5));
    float d = min(g.x / w.x, g.y / w.y);
    c = mix(c, c * 0.3, (1.0 - smoothstep(0.6, 1.6, d)) * (1.0 - collapse));

    vec2 go = min(vUv, 1.0 - vUv);
    vec2 wo = max(fwidth(vUv), vec2(1e-5));
    float dOuter = min(go.x / wo.x, go.y / wo.y);
    c = mix(c, c * 0.32, (1.0 - smoothstep(0.6, 1.6, dOuter)) * collapse);

    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// --- geometry helpers ----------------------------------------------------

function dataTex(data: Float32Array, w: number, h: number): THREE.DataTexture {
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.FloatType);
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}

/** A grid over the octahedral square. R is even so the map's fold
 * diagonals land on vertices rather than cutting through triangles. */
function octGeometry(R: number): THREE.BufferGeometry {
  const uvs: number[] = [];
  const pos: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= R; j++) {
    for (let i = 0; i <= R; i++) {
      uvs.push(i / R, j / R);
      pos.push(0, 0, 0); // the vertex shader owns position
    }
  }
  for (let j = 0; j < R; j++) {
    for (let i = 0; i < R; i++) {
      const a = j * (R + 1) + i;
      idx.push(a, a + 1, a + R + 1, a + 1, a + R + 2, a + R + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
  return geo;
}

function cellMaterial(data: Float32Array, w: number, h: number, border = 0.75): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: dataTex(data, w, h) },
      cells: { value: new THREE.Vector2(w, h) },
      border: { value: border },
      sel: { value: new THREE.Vector2(-1, -1) },
      fade: { value: 1 },
    },
    vertexShader: CELL_VERT,
    fragmentShader: CELL_FRAG,
    side: THREE.DoubleSide,
  });
}

function octMaterial(data: Float32Array, n: number, border: number): THREE.ShaderMaterial {
  const m = cellMaterial(data, n, n, border);
  m.vertexShader = OCT_VERT;
  m.uniforms.t = { value: 0 };
  m.uniforms.frame = { value: new THREE.Matrix3() };
  m.uniforms.centre = { value: new THREE.Vector3() };
  m.uniforms.radius = { value: 1 };
  m.uniforms.netOrigin = { value: new THREE.Vector3() };
  m.uniforms.netU = { value: new THREE.Vector3(1, 0, 0) };
  m.uniforms.netV = { value: new THREE.Vector3(0, 0, 1) };
  return m;
}

// --- the loupe -----------------------------------------------------------

export interface Loupe {
  /** Load a cell's fiber. False if the chart has no directional tile. */
  setCell(chartIdx: number, lx: number, ly: number): boolean;
  /** `bloom`: 0 = ball of directions, 1 = flat tile. */
  place(x: number, z: number, bloom: number, alpha: number, atHeight?: number): void;
  visible(v: boolean): void;
  cell(): { chart: number; lx: number; ly: number } | null;
}

export interface Unwrap {
  bundle: LoadedBundle;
  charts: Chart[];
  /** Chart index of quad i. */
  qc(i: number): number;
  sphereChart: number;
  /** Texels per world unit — the scale everything is drawn at. */
  texel: number;
  /** t: 0 = the room, 1 = the net. */
  setPeel(t: number): void;
  /** rise: tiles fly in and land. collapse: each becomes one value. */
  setForest(rise: number, collapse: number): void;
  createLoupe(size: number, height: number): Loupe;
  /** Chart cell under a point of the flat plane, once peeled. */
  cellUnder(x: number, z: number): { chart: number; lx: number; ly: number } | null;
  cellCentre(chartIdx: number, lx: number, ly: number): THREE.Vector3;
  /** Cell centre of a stop given as fractions across the chart. */
  stopPos(chartIdx: number, fx: number, fy: number): THREE.Vector3;
  highlight(chartIdx: number | null, lx?: number, ly?: number): void;
  boxes: { close: THREE.Box3; room: THREE.Box3; net: THREE.Box3; floor: THREE.Box3 };
  counts: { pixels: number; cells: number; bins: number };
  pickTargets: THREE.Object3D[];
}

export async function createUnwrap(stage: Stage): Promise<Unwrap> {
  const bundle = await loadBundle(bundleJson, bundleBin);
  const charts = bundle.charts;
  const TEXEL = bundle.atlas.texelsPerUnit;
  const qc = (i: number): number => bundle.quadChart[i];
  const sphereChart = charts.findIndex((c) => c.kind === 1);

  // --- the peel tree. Parentage is by hand (the scene is fixed and
  // small); every hinge axis and angle is derived from the shared edge.
  // quads: 0 floor · 1 ceiling · 2 back · 3 left(red) · 4 right(green)
  //        5 emitter · 6..10 cube (top, +X, −X, +Z, −Z)
  const PARENT: Record<number, number | null> = {
    [qc(0)]: null,
    [qc(2)]: qc(0),
    [qc(3)]: qc(0),
    [qc(4)]: qc(0),
    [qc(1)]: qc(2),
    [qc(5)]: qc(1),
    [qc(6)]: qc(0),
    [qc(7)]: qc(6),
    [qc(8)]: qc(6),
    [qc(9)]: qc(6),
    [qc(10)]: qc(6),
  };
  // Sheets that would land on a sibling slide clear, ×t. Chosen to make
  // the net WIDE rather than deep: floor→back→ceiling already carries it
  // 40 units back, so loose sheets go out to the sides where the 16:9
  // frame has room.
  const OFFSET: Record<number, V3> = {
    [qc(5)]: [36, 0, 20],
    [qc(6)]: [-42, 0, 6],
  };
  const SPHERE_NET: V3 = [26, 0, -4];

  const peel: PeelNode[] = buildPeel(
    bundle,
    TEXEL,
    (i) => (i in PARENT ? PARENT[i] : null),
    (i) => OFFSET[i] ?? [0, 0, 0],
  );

  // --- build the room -----------------------------------------------------

  const groups: THREE.Group[] = charts.map(() => new THREE.Group());
  const sheetMeshes: THREE.Mesh[] = [];

  for (const node of peel) {
    const i = node.chart;
    const c = charts[i];
    const g = groups[i];
    const h = node.hinge;
    const pivot = v3(h.pivot);
    const parentPivot = h.parent === null ? new THREE.Vector3() : v3(peel[h.parent].hinge.pivot);
    // At t = 0 every hinge is identity, so a group's local offset from
    // its parent is just the difference of their pivots in room space.
    g.userData.base = pivot.clone().sub(parentPivot);
    g.position.copy(g.userData.base as THREE.Vector3);
    g.userData.axis = v3(h.axis).normalize();
    g.userData.angle = h.angle;
    g.userData.offset = v3(h.offset);
    if (h.parent === null) stage.scene.add(g);
    else groups[h.parent].add(g);

    if (c.kind === 1) continue; // the sphere unfolds octahedrally, below

    const f = quadFrame(bundle, c, TEXEL);
    const u = v3(f.u);
    const vv = v3(f.v);
    const geo = new THREE.PlaneGeometry(u.length(), vv.length());
    const mesh = new THREE.Mesh(geo, cellMaterial(chartSurface(bundle, c), c.w, c.h));
    mesh.setRotationFromMatrix(
      new THREE.Matrix4().makeBasis(u.clone().normalize(), vv.clone().normalize(), v3(f.normal)),
    );
    mesh.position.copy(v3(f.origin)).add(u.clone().add(vv).multiplyScalar(0.5)).sub(pivot);
    mesh.userData.chart = i;
    g.add(mesh);
    sheetMeshes.push(mesh);
  }

  // The sphere's chart IS the octahedral map, so its surface unfolds by
  // exactly the map its own fibers unfold by, one level up. Same shader.
  let sphereMesh: THREE.Mesh | null = null;
  if (sphereChart >= 0) {
    const c = charts[sphereChart];
    const s = bundle.scene.spheres[c.prim];
    const mat = octMaterial(chartSurface(bundle, c), c.w, 0.75);
    mat.uniforms.cells.value = new THREE.Vector2(c.w, c.h);
    mat.uniforms.map.value = dataTex(chartSurface(bundle, c), c.w, c.h);
    mat.uniforms.centre.value = v3(s.center).multiplyScalar(TEXEL);
    mat.uniforms.radius.value = s.radius * TEXEL;
    mat.uniforms.netOrigin.value = v3(SPHERE_NET);
    mat.uniforms.netU.value = new THREE.Vector3(c.w, 0, 0);
    mat.uniforms.netV.value = new THREE.Vector3(0, 0, c.h);
    sphereMesh = new THREE.Mesh(octGeometry(32), mat);
    sphereMesh.userData.chart = sphereChart;
    sphereMesh.frustumCulled = false;
    stage.scene.add(sphereMesh);
  }

  function setPeel(t: number): void {
    for (const node of peel) {
      const g = groups[node.chart];
      g.quaternion.setFromAxisAngle(g.userData.axis as THREE.Vector3, -(g.userData.angle as number) * t);
      g.position
        .copy(g.userData.base as THREE.Vector3)
        .addScaledVector(g.userData.offset as THREE.Vector3, t);
    }
    if (sphereMesh) (sphereMesh.material as THREE.ShaderMaterial).uniforms.t.value = t;
    stage.scene.updateMatrixWorld(true);
  }

  // --- the flat state, MEASURED --------------------------------------------
  // The net is derived, so running the peel to t = 1 and reading the world
  // matrices back is the only way to know where the sheets landed.

  interface FlatFrame {
    origin: THREE.Vector3;
    u: THREE.Vector3;
    v: THREE.Vector3;
  }
  const flat: (FlatFrame | null)[] = charts.map(() => null);
  setPeel(1);
  for (const mesh of sheetMeshes) {
    const i = mesh.userData.chart as number;
    const m = mesh.matrixWorld;
    const geo = mesh.geometry as THREE.PlaneGeometry;
    const { width: w, height: h } = geo.parameters;
    const p00 = new THREE.Vector3(-w / 2, -h / 2, 0).applyMatrix4(m);
    const p10 = new THREE.Vector3(w / 2, -h / 2, 0).applyMatrix4(m);
    const p01 = new THREE.Vector3(-w / 2, h / 2, 0).applyMatrix4(m);
    flat[i] = { origin: p00, u: p10.clone().sub(p00), v: p01.clone().sub(p00) };
  }
  if (sphereChart >= 0) {
    const c = charts[sphereChart];
    flat[sphereChart] = {
      origin: v3(SPHERE_NET),
      u: new THREE.Vector3(c.w, 0, 0),
      v: new THREE.Vector3(0, 0, c.h),
    };
  }

  function cellUnder(x: number, z: number): { chart: number; lx: number; ly: number } | null {
    const p = new THREE.Vector3(x, 0, z);
    for (let i = 0; i < flat.length; i++) {
      const f = flat[i];
      if (!f) continue;
      const d = p.clone().sub(f.origin);
      const a = d.dot(f.u) / f.u.lengthSq();
      const b = d.dot(f.v) / f.v.lengthSq();
      if (a < 0 || a >= 1 || b < 0 || b >= 1) continue;
      const c = charts[i];
      return {
        chart: i,
        lx: Math.min(c.w - 1, Math.floor(a * c.w)),
        ly: Math.min(c.h - 1, Math.floor(b * c.h)),
      };
    }
    return null;
  }

  const cellCentre = (i: number, lx: number, ly: number): THREE.Vector3 => {
    const f = flat[i]!;
    const c = charts[i];
    return f.origin
      .clone()
      .addScaledVector(f.u, (lx + 0.5) / c.w)
      .addScaledVector(f.v, (ly + 0.5) / c.h);
  };

  const stopPos = (i: number, fx: number, fy: number): THREE.Vector3 => {
    const c = charts[i];
    return cellCentre(
      i,
      Math.min(c.w - 1, Math.round(fx * (c.w - 1))),
      Math.min(c.h - 1, Math.round(fy * (c.h - 1))),
    );
  };

  // --- boxes the demos frame on -------------------------------------------

  const roomBox = new THREE.Box3();
  for (const mesh of sheetMeshes) {
    const f = quadFrame(bundle, charts[mesh.userData.chart as number], TEXEL);
    for (const p of [
      v3(f.origin),
      v3(f.origin).add(v3(f.u)),
      v3(f.origin).add(v3(f.v)),
      v3(f.origin).add(v3(f.u)).add(v3(f.v)),
    ]) {
      roomBox.expandByPoint(p);
    }
  }
  const netBox = new THREE.Box3();
  const floorBox = new THREE.Box3();
  for (let i = 0; i < flat.length; i++) {
    const f = flat[i];
    if (!f) continue;
    const pts = [
      f.origin,
      f.origin.clone().add(f.u),
      f.origin.clone().add(f.v),
      f.origin.clone().add(f.u).add(f.v),
    ];
    for (const p of pts) {
      netBox.expandByPoint(p);
      if (i === qc(0)) floorBox.expandByPoint(p);
    }
  }
  const closeBox = new THREE.Box3();
  if (sphereChart >= 0) {
    const s = bundle.scene.spheres[charts[sphereChart].prim];
    closeBox.expandByPoint(v3(s.center).multiplyScalar(TEXEL));
    closeBox.expandByScalar(s.radius * TEXEL * 1.9);
  }
  for (const q of [6, 7, 8, 9, 10]) {
    const f = quadFrame(bundle, charts[qc(q)], TEXEL);
    closeBox.expandByPoint(v3(f.origin));
    closeBox.expandByPoint(v3(f.origin).add(v3(f.u)).add(v3(f.v)));
  }

  // --- highlighting a source pixel ----------------------------------------

  let highlighted: THREE.ShaderMaterial | null = null;
  function highlight(chartIdx: number | null, lx = 0, ly = 0): void {
    if (highlighted) highlighted.uniforms.sel.value.set(-1, -1);
    highlighted = null;
    if (chartIdx === null) return;
    const mesh =
      charts[chartIdx].kind === 1 ? sphereMesh : sheetMeshes.find((m) => m.userData.chart === chartIdx);
    if (!mesh) return;
    const mat = mesh.material as THREE.ShaderMaterial;
    mat.uniforms.sel.value.set(lx, ly);
    highlighted = mat;
  }

  // --- loupes --------------------------------------------------------------

  const tileBins = Math.max(1, charts.find((c) => c.dbins > 0)?.dbins ?? 1);
  const CORNERS = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ] as const;

  function createLoupe(size: number, baseHeight: number): Loupe {
    const group = new THREE.Group();
    stage.scene.add(group);

    const mesh = new THREE.Mesh(
      octGeometry(24),
      octMaterial(new Float32Array(tileBins * tileBins * 4), tileBins, 1.1),
    );
    mesh.frustumCulled = false;
    group.add(mesh);
    const mat = mesh.material as THREE.ShaderMaterial;

    const wallPos = new Float32Array(4 * 6 * 3);
    const wallGeo = new THREE.BufferGeometry();
    wallGeo.setAttribute('position', new THREE.BufferAttribute(wallPos, 3));
    const wallMat = new THREE.MeshBasicMaterial({
      color: 0x9fb6d8,
      transparent: true,
      opacity: 0.11,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    group.add(new THREE.Mesh(wallGeo, wallMat));

    const edgePos = new Float32Array(12 * 2 * 3);
    const edgeGeo = new THREE.BufferGeometry();
    edgeGeo.setAttribute('position', new THREE.BufferAttribute(edgePos, 3));
    const edgeMat = new THREE.LineBasicMaterial({
      color: 0xffe9a8,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
    });
    group.add(new THREE.LineSegments(edgeGeo, edgeMat));

    let cell: { chart: number; lx: number; ly: number } | null = null;

    return {
      cell: () => cell,
      visible: (v) => {
        group.visible = v;
      },
      setCell(chartIdx, lx, ly) {
        const c = charts[chartIdx];
        if (c.dbins === 0) return false;
        (mat.uniforms.map.value as THREE.DataTexture).dispose();
        mat.uniforms.map.value = dataTex(fiberTexture(bundle, c, lx, ly), c.dbins, c.dbins);
        (mat.uniforms.cells.value as THREE.Vector2).set(c.dbins, c.dbins);
        const [fx, fy, fz] = normalFrame(texelNormal(bundle, c, lx, ly));
        // Column-major: the frame's axes ARE the columns, so the local
        // pole (0,0,1) maps to the surface normal.
        (mat.uniforms.frame.value as THREE.Matrix3).set(
          fx[0], fy[0], fz[0],
          fx[1], fy[1], fz[1],
          fx[2], fy[2], fz[2],
        );
        cell = { chart: chartIdx, lx, ly };
        return true;
      },
      place(x, z, bloom, alpha, atHeight) {
        const height = atHeight ?? baseHeight;
        const half = size / 2;
        mat.uniforms.fade.value = alpha;
        mat.uniforms.t.value = bloom;
        (mat.uniforms.centre.value as THREE.Vector3).set(x, height, z);
        mat.uniforms.radius.value = half * 0.95; // ball ≈ the tile it becomes
        (mat.uniforms.netOrigin.value as THREE.Vector3).set(x - half, height, z - half);
        (mat.uniforms.netU.value as THREE.Vector3).set(size, 0, 0);
        (mat.uniforms.netV.value as THREE.Vector3).set(0, 0, size);

        // While the fiber is a ball there is no tile for the frustum to
        // land on, so the tether firms up with the flattening — but never
        // to zero, since it is what ties the ball to its pixel.
        const tether = alpha * (0.35 + 0.65 * Math.max(0, bloom * 2 - 1));
        wallMat.opacity = 0.11 * tether;
        edgeMat.opacity = 0.9 * tether;

        const b = cell ? cellCentre(cell.chart, cell.lx, cell.ly) : new THREE.Vector3(x, 0, z);
        const base = CORNERS.map(([sx, sz]) => [b.x + sx * 0.5, 0.03, b.z + sz * 0.5] as const);
        const top = CORNERS.map(([sx, sz]) => [x + sx * half, height, z + sz * half] as const);

        let w = 0;
        for (let k = 0; k < 4; k++) {
          const k2 = (k + 1) % 4;
          for (const p of [base[k], top[k], top[k2], base[k], top[k2], base[k2]]) {
            wallPos[w++] = p[0];
            wallPos[w++] = p[1];
            wallPos[w++] = p[2];
          }
        }
        wallGeo.attributes.position.needsUpdate = true;
        wallGeo.computeBoundingSphere();

        let e = 0;
        const push = (p: readonly [number, number, number]): void => {
          edgePos[e++] = p[0];
          edgePos[e++] = p[1];
          edgePos[e++] = p[2];
        };
        for (let k = 0; k < 4; k++) {
          push(base[k]);
          push(top[k]);
          push(base[k]);
          push(base[(k + 1) % 4]); // the source pixel's outline
          push(top[k]);
          push(top[(k + 1) % 4]); // the tile's outline
        }
        edgeGeo.attributes.position.needsUpdate = true;
        edgeGeo.computeBoundingSphere();
      },
    };
  }

  // --- the forest ----------------------------------------------------------
  // Every pixel gets its own tile, flying in high and wide and shrinking
  // onto the pixel it belongs to. At rest a tile is exactly its pixel's
  // size, so the sheet has BECOME the nested image — N² cells per pixel in
  // the same physical space. 64× the cells, no more room.

  const forestMats: THREE.ShaderMaterial[] = [];
  const forest = new THREE.Group();
  forest.visible = false;
  stage.scene.add(forest);

  for (let i = 0; i < charts.length; i++) {
    const c = charts[i];
    const f = flat[i];
    if (!f || c.dbins === 0) continue;

    const cells: number[] = [];
    const seeds: number[] = [];
    for (let ly = 0; ly < c.h; ly++) {
      for (let lx = 0; lx < c.w; lx++) {
        cells.push(lx, ly);
        // Deterministic scatter — never Math.random, or every exported
        // frame reseeds and the video boils.
        seeds.push((((lx * 73856093) ^ (ly * 19349663) ^ (i * 83492791)) % 1000) / 1000);
      }
    }

    const quad = new THREE.InstancedBufferGeometry();
    quad.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0], 3));
    quad.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    quad.setIndex([0, 1, 2, 0, 2, 3]);
    quad.setAttribute('iCell', new THREE.InstancedBufferAttribute(new Float32Array(cells), 2));
    quad.setAttribute('iSeed', new THREE.InstancedBufferAttribute(new Float32Array(seeds), 1));
    quad.instanceCount = seeds.length;
    quad.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        nested: { value: dataTex(chartNested(bundle, c), c.w * c.dbins, c.h * c.dbins) },
        flatMap: { value: dataTex(chartSurface(bundle, c), c.w, c.h) },
        chartOrigin: { value: f.origin.clone() },
        chartU: { value: f.u.clone() },
        chartV: { value: f.v.clone() },
        chartCells: { value: new THREE.Vector2(c.w, c.h) },
        lift: { value: new THREE.Vector3(0, 7.6, 0) },
        // Landed tiles sit just above their sheet; coplanar they z-fight,
        // which reads as banding across the whole net.
        landY: { value: 0.09 },
        rise: { value: 0 },
        flySize: { value: 3.2 },
        bins: { value: c.dbins },
        collapse: { value: 0 },
      },
      vertexShader: FOREST_VERT,
      fragmentShader: FOREST_FRAG,
      side: THREE.DoubleSide,
    });
    forestMats.push(mat);
    const mesh = new THREE.Mesh(quad, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    forest.add(mesh);
  }

  function setForest(rise: number, collapse: number): void {
    forest.visible = rise > 0;
    for (const m of forestMats) {
      m.uniforms.rise.value = rise;
      m.uniforms.collapse.value = collapse;
    }
  }

  const pixels = charts.reduce((n, c) => n + (c.dbins > 0 ? c.w * c.h : 0), 0);

  setPeel(0);

  return {
    bundle,
    charts,
    qc,
    sphereChart,
    texel: TEXEL,
    setPeel,
    setForest,
    createLoupe,
    cellUnder,
    cellCentre,
    stopPos,
    highlight,
    boxes: { close: closeBox, room: roomBox, net: netBox, floor: floorBox },
    counts: {
      pixels,
      cells: pixels * bundle.atlas.dirBins * bundle.atlas.dirBins,
      bins: bundle.atlas.dirBins,
    },
    pickTargets: sphereMesh ? [...sheetMeshes, sphereMesh] : sheetMeshes,
  };
}

/** Cells of a fiber that face outward — the central diamond. */
export const outwardCells = (n: number): number =>
  displayMask(n).reduce((a: number, b: number) => a + b, 0);

export interface Shot {
  pos: THREE.Vector3;
  target: THREE.Vector3;
}

/**
 * Frame a box from a given direction. Solved against the frustum planes,
 * not estimated from the box's dimensions: for each corner, find the
 * distance at which it just fits horizontally and vertically, and take
 * the max. Dimension heuristics get this wrong for oblique views, where
 * depth trades against screen extent — and every shot here is oblique.
 */
export function frameBox(
  camera: THREE.PerspectiveCamera,
  box: THREE.Box3,
  dir: THREE.Vector3,
  margin = 1.05,
): Shot {
  const d = dir.clone().normalize();
  const forward = d.clone().negate();
  const worldUp =
    Math.abs(forward.y) > 0.99 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(forward, worldUp).normalize();
  const up = new THREE.Vector3().crossVectors(right, forward).normalize();

  const tanV = Math.tan((camera.fov * Math.PI) / 360);
  const tanH = tanV * camera.aspect;

  const corners: THREE.Vector3[] = [];
  for (let i = 0; i < 8; i++) {
    corners.push(
      new THREE.Vector3(
        i & 1 ? box.max.x : box.min.x,
        i & 2 ? box.max.y : box.min.y,
        i & 4 ? box.max.z : box.min.z,
      ),
    );
  }

  const target = box.getCenter(new THREE.Vector3());
  let dist = 1;

  // Fit, then RE-CENTRE, then fit again. An oblique view of a flat net
  // projects to a trapezoid whose screen centre is not the projection of
  // the box's centre, so aiming at the centre leaves the content sitting
  // high with dead space below. Two passes converge well.
  for (let pass = 0; pass < 3; pass++) {
    dist = 0;
    for (const c of corners) {
      const v = c.clone().sub(target);
      const depth = -v.dot(d);
      dist = Math.max(
        dist,
        Math.abs(v.dot(right)) / tanH - depth,
        Math.abs(v.dot(up)) / tanV - depth,
      );
    }
    dist *= margin;
    if (pass === 2) break;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const c of corners) {
      const v = c.clone().sub(target);
      const depth = -v.dot(d) + dist;
      const x = v.dot(right) / (depth * tanH);
      const y = v.dot(up) / (depth * tanV);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    target
      .addScaledVector(right, ((minX + maxX) / 2) * dist * tanH)
      .addScaledVector(up, ((minY + maxY) / 2) * dist * tanV);
  }
  return { pos: target.clone().addScaledVector(d, dist), target };
}

/** Point a stage's camera at a shot. */
export function applyShot(stage: Stage, s: Shot): void {
  stage.camera.position.copy(s.pos);
  stage.camera.lookAt(s.target);
  if (stage.controls) {
    stage.controls.target.copy(s.target);
    stage.controls.update();
  }
}

/** Lerp between two shots and apply. */
export function lerpShot(stage: Stage, a: Shot, b: Shot, f: number): void {
  applyShot(stage, {
    pos: a.pos.clone().lerp(b.pos, f),
    target: a.target.clone().lerp(b.target, f),
  });
}
