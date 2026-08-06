/**
 * The charts of a baked light field, laid out flat and packed tight.
 *
 * `peel.ts` unfolds the room into a NET — every chart hinged to the edge
 * it physically shares, so the arrangement is a fact about the room's
 * geometry. This is the other flattening, and it makes the opposite kind
 * of claim: an atlas does not care about geometry at all. It is a set of
 * rectangles, and a packer puts them wherever they fit.
 *
 * So nothing here is derived from the scene, and nothing here should be
 * read as if it were. Two charts sitting side by side in the panel are
 * NOT adjacent in the room, and the layout would be just as correct
 * shuffled. What survives the packing is the only thing that matters to
 * storage: how many texels each chart is, and therefore how much room it
 * takes. Everything is in TEXEL UNITS, so a texel is one unit here just as
 * it is in the room — the invariant the whole demo family rests on.
 *
 * ## Why re-pack rather than use the bundle's own rects
 *
 * `chart.x/y/w/h` is where the baker put each chart in its 1024² atlas,
 * and that packing is a single row 173 texels wide and 16 tall — fine for
 * a texture, unreadable in half of a 16:9 frame. Since a packing is
 * arbitrary anyway, this one is chosen to fit the space it is drawn in:
 * shelves, tallest chart first, with the shelf width searched for the
 * bounding box closest to a target aspect. Change the target and the
 * layout changes, and no claim is harmed.
 *
 * The sphere's chart is drawn as a plain square like every other, which
 * is right: its 11×11 IS the octahedral map of its surface, so a flat
 * square is what the atlas actually holds.
 */

import * as THREE from 'three';
import { type Chart, type LoadedBundle } from './bundle';
import { chartSurface } from './tiles';
import { cellMaterial } from './unwrap';

export interface AtlasSlot {
  chart: number;
  /** Lower-left corner and size, in texels, within the panel. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AtlasPanel {
  /** Sheets in the z = 0 plane, centred on the origin, in texel units. */
  group: THREE.Group;
  slots: AtlasSlot[];
  /** Panel extent in texels, before centring. */
  size: { w: number; h: number };
  /** Highlight one cell of one chart, or pass null to clear. */
  highlight(chartIdx: number | null, lx?: number, ly?: number): void;
  /** The material a chart is drawn with, so a demo can share a glow
   * texture between this panel and the room's copy of the same chart. */
  material(chartIdx: number): THREE.ShaderMaterial | null;
  /** Centre of a cell, in the panel's own (centred) coordinates. */
  cellCentre(chartIdx: number, lx: number, ly: number): THREE.Vector3;
  dispose(): void;
}

/**
 * Shelf-pack rects of the given sizes into a bounding box as close to
 * `target` (width / height) as a shelf packing gets. Tallest first, and
 * the shelf width is searched rather than guessed — chart sizes come from
 * a bake and change without warning.
 */
function shelfPack(
  sizes: { w: number; h: number }[],
  target: number,
  gap: number,
): { slots: { x: number; y: number }[]; w: number; h: number } {
  const order = sizes.map((_, i) => i).sort((a, b) => sizes[b].h - sizes[a].h || sizes[b].w - sizes[a].w);
  const widest = Math.max(...sizes.map((s) => s.w));
  const total = sizes.reduce((a, s) => a + s.w + gap, 0);

  let best: { slots: { x: number; y: number }[]; w: number; h: number; score: number } | null = null;
  for (let limit = widest; limit <= total; limit++) {
    const slots: { x: number; y: number }[] = sizes.map(() => ({ x: 0, y: 0 }));
    let cx = 0;
    let cy = 0;
    let shelfH = 0;
    let used = 0;
    for (const i of order) {
      const s = sizes[i];
      if (cx > 0 && cx + s.w > limit) {
        cy += shelfH + gap;
        cx = 0;
        shelfH = 0;
      }
      slots[i] = { x: cx, y: cy };
      cx += s.w + gap;
      shelfH = Math.max(shelfH, s.h);
      used = Math.max(used, cx - gap);
    }
    const w = used;
    const h = cy + shelfH;
    const score = Math.abs(Math.log(w / h / target));
    if (!best || score < best.score) best = { slots, w, h, score };
  }
  // Shelves are built downward from y = 0, so flip to put the tallest
  // shelf at the top — a packing that grows downward reads as settled.
  const b = best!;
  const sizesOf = (i: number) => sizes[i];
  return {
    slots: b.slots.map((s, i) => ({ x: s.x, y: b.h - s.y - sizesOf(i).h })),
    w: b.w,
    h: b.h,
  };
}

export function createAtlasPanel(
  bundle: LoadedBundle,
  opts: { targetAspect?: number; gap?: number; border?: number } = {},
): AtlasPanel {
  const { targetAspect = 0.85, gap = 2, border = 0.75 } = opts;
  const charts = bundle.charts;

  const packed = shelfPack(
    charts.map((c) => ({ w: c.w, h: c.h })),
    targetAspect,
    gap,
  );

  const group = new THREE.Group();
  const slots: AtlasSlot[] = [];
  const meshes: (THREE.Mesh | null)[] = charts.map(() => null);
  const mats: THREE.ShaderMaterial[] = [];

  charts.forEach((c: Chart, i: number) => {
    const p = packed.slots[i];
    const slot: AtlasSlot = { chart: i, x: p.x, y: p.y, w: c.w, h: c.h };
    slots.push(slot);

    const mat = cellMaterial(chartSurface(bundle, c), c.w, c.h, border);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(c.w, c.h), mat);
    // Centre the whole panel on the origin so the ortho camera framing it
    // needs nothing but a half-extent.
    mesh.position.set(p.x + c.w / 2 - packed.w / 2, p.y + c.h / 2 - packed.h / 2, 0);
    mesh.userData.chart = i;
    group.add(mesh);
    meshes[i] = mesh;
    mats.push(mat);
  });

  function highlight(chartIdx: number | null, lx = 0, ly = 0): void {
    for (const m of mats) (m.uniforms.sel.value as THREE.Vector2).set(-1, -1);
    if (chartIdx === null) return;
    const mesh = meshes[chartIdx];
    if (!mesh) return;
    ((mesh.material as THREE.ShaderMaterial).uniforms.sel.value as THREE.Vector2).set(lx, ly);
  }

  function cellCentre(chartIdx: number, lx: number, ly: number): THREE.Vector3 {
    const c = charts[chartIdx];
    const s = slots[chartIdx];
    return new THREE.Vector3(
      s.x + lx + 0.5 - packed.w / 2,
      s.y + ly + 0.5 - packed.h / 2,
      0,
    );
  }

  return {
    group,
    slots,
    size: { w: packed.w, h: packed.h },
    highlight,
    material: (i: number) =>
      meshes[i] ? (meshes[i]!.material as THREE.ShaderMaterial) : null,
    cellCentre,
    dispose(): void {
      for (const m of meshes) {
        if (!m) continue;
        m.geometry.dispose();
        (m.material as THREE.ShaderMaterial).uniforms.map.value?.dispose?.();
        (m.material as THREE.Material).dispose();
      }
    },
  };
}
