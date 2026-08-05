/**
 * A baked light field, as exported by the `light-field` repo.
 *
 * That repo solves L* = (I−K)⁻¹E on the GPU and stores it; this one draws
 * it. The boundary between them is exactly the two files loaded here, and
 * nothing else — no shared code, no build coupling. Regenerate them there
 * with `npm run bundle` after any rebake and copy them into
 * `src/assets/lightfield/`.
 *
 * What the field IS: for every texel of every surface chart, an N×N
 * octahedral tile of DIRECTIONS, each holding the radiance leaving that
 * point in that direction (plus the sample count that produced it). The
 * scene is baked so that even diffuse surfaces carry full directional
 * tiles — normally they would not, since a diffuse fiber is constant, and
 * the whole point of the unwrap demos is to SHOW that it is constant
 * rather than assert it.
 *
 * The payload is chart-cropped: directional blocks only, in chart order.
 * A chart's tile for texel (lx, ly), bin b, lives at
 *   dirOffset + (ly·w + lx)·N² + b
 * in vec4 units — rgb mean + count.
 */

export const BUNDLE_VERSION = 1;

export interface Vec3Tuple {
  0: number;
  1: number;
  2: number;
  length: 3;
  [Symbol.iterator](): Iterator<number>;
}
export type V3 = readonly [number, number, number];

export interface Material {
  kind: 'diffuse' | 'mirror' | 'dielectric' | 'glossy';
  albedo: V3;
  emission: V3;
  ior: number;
  roughness?: number;
}

export interface QuadDef {
  origin: V3;
  edgeU: V3;
  edgeV: V3;
  material: Material;
}

export interface SphereDef {
  center: V3;
  radius: number;
  material: Material;
}

export interface SceneDef {
  quads: QuadDef[];
  spheres: SphereDef[];
  environment: unknown;
}

export const CHART_QUAD = 0;
export const CHART_SPHERE = 1;

export interface Chart {
  /** Interior rect in atlas texels. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Index into the scene's quad or sphere list, per `kind`. */
  prim: number;
  kind: typeof CHART_QUAD | typeof CHART_SPHERE;
  /** Directional tile side N. */
  dbins: number;
  /** Offset in the ORIGINAL field buffer; unused here. */
  base: number;
  /** Offset in the cropped payload, in vec4 units. This is the one to use. */
  dirOffset: number;
}

export interface Bundle {
  lightfieldBundle: number;
  generator: {
    sceneName: string;
    sceneHash: string;
    batch: number;
    bakeMs: number;
    savedAt: string;
  };
  atlas: {
    size: number;
    /** Atlas texels per world unit — the scale that turns the scene into
     * "one texel is one unit", which the unwrap demos work in. */
    texelsPerUnit: number;
    padding: number;
    dirBins: number;
    diffuse4D: boolean;
  };
  scene: SceneDef;
  charts: Chart[];
  /** Chart index per quad; 0xffffffff for chartless (specular) prims. */
  quadChart: number[];
  sphereChart: number[];
  payload: { file: string; stride: number; vec4s: number };
}

export interface LoadedBundle extends Bundle {
  /** vec4 per (texel, bin): running mean rgb + sample count. */
  data: Float32Array;
}

/**
 * Fetch a bundle and its payload. `jsonUrl` and `binUrl` come from Vite
 * `?url` imports, so they are hashed asset URLs in a build and plain
 * paths in dev.
 */
export async function loadBundle(jsonUrl: string, binUrl: string): Promise<LoadedBundle> {
  const [meta, bin] = await Promise.all([
    fetch(jsonUrl).then((r) => r.json() as Promise<Bundle>),
    fetch(binUrl).then((r) => r.arrayBuffer()),
  ]);
  if (meta.lightfieldBundle !== BUNDLE_VERSION) {
    throw new Error(
      `bundle version ${meta.lightfieldBundle}, expected ${BUNDLE_VERSION} — ` +
        `re-export from the light-field repo`,
    );
  }
  const data = new Float32Array(bin);
  const expected = meta.payload.vec4s * 4;
  if (data.length !== expected) {
    throw new Error(`payload is ${data.length} floats, header implies ${expected}`);
  }
  return { ...meta, data };
}
