/**
 * Computing a photograph by actually inverting: the beam room discretized
 * (src/discrete-room.ts), T as a matrix, and (Id - T)^{-1} E solved for
 * (Steve, 2026-11-04). Three pictures, `?show=`:
 *
 *   pieces  the room with its boundary cut into pieces, and at one piece (hover
 *           to choose) its circle of direction sectors: the half that leaves
 *           the surface lit, the half into it dark. The count below: pieces x
 *           outgoing sectors x 3 colours, the size of a light field.
 *   matrix  T (its green channel; the others have the same zeros) as numbers,
 *           a window of it running past, mostly zeros; beside it the whole
 *           matrix, a dot per nonzero entry, and the window's place in it.
 *   solve   E, a bright white source in the lamp and nothing else, and
 *           (Id - T)^{-1} E, solved by Gaussian elimination on the
 *           1368 x 1368 matrix Id - T, one colour at a time: the whole room
 *           lit. `source` (also `&source=`): ray, one sector of the lamp's
 *           opening (a narrow beam); patch, the opening glowing every way.
 *
 * The room's fill is the light arriving at each place, averaged over all
 * directions; the walls are drawn in the light leaving them. One exposure for
 * both panels, set by the solved room, so E's source is far past white.
 */

import * as THREE from 'three';
import { createStage, createUI, C, flat } from '@';
import { polyline, setPolyline } from '@/lines';
import { label, setText } from '@/text';
import { type Vec, v, add, sub, ROOM_HALF, ROOM_R } from '@/beamscene';
import { pieces, N, HALF, SECTORS, SOURCE_PIECE, index, buildT, sourceE, solve, castPiece, sectorOf, type RGB } from '@/discrete-room';
import { HOUSING } from '@/beamscene';

const ORTHO_H = 3;
const HALF_W = (ORTHO_H * 16) / 9;
const stage = createStage({ camera: 'ortho', position: [0, 0, 10], target: [0, 0, 0], orthoHeight: ORTHO_H, lights: false, controls: false });
const ui = createUI(stage);
const q = new URLSearchParams(location.search);
const SHOW = (q.get('show') ?? 'solve') as 'pieces' | 'matrix' | 'solve';
const T = buildT();
const P3 = (p: Vec, z = 0): [number, number, number] => [p.x, p.y, z];
const inside = (p: Vec) => {
  const dx = Math.max(Math.abs(p.x) - (ROOM_HALF.x - ROOM_R), 0);
  const dy = Math.max(Math.abs(p.y) - (ROOM_HALF.y - ROOM_R), 0);
  return Math.hypot(dx, dy) < ROOM_R;
};
const hexOf = (rgb: RGB) => new THREE.Color().setRGB(...(rgb.map((x) => Math.min(1, Math.max(0, x))) as RGB), THREE.LinearSRGBColorSpace).getHex();
const pigment = (i: number) => {
  const p = pieces[i]!;
  return p.kind === 'matte' ? hexOf(p.rgb) : p.kind === 'mirror' ? C.bone : C.ochre;
};
/** The room's pieces, each its own short line with a small gap at each end so the cuts show. */
function drawPieces(room: THREE.Group, colour: (i: number) => number, width: number): void {
  pieces.forEach((p, i) => {
    if (p.kind === 'mirror' && i % 2 === 1) return; // the back of a mirror: the same line
    const g = 0.035;
    const a = add(p.a, sub(p.b, p.a), g / Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y));
    const b = add(p.b, sub(p.a, p.b), g / Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y));
    room.add(polyline([P3(a, 0.01), P3(b, 0.01)], { color: colour(i), width }));
  });
  room.add(polyline(HOUSING.map((p) => P3(p, 0.01)), { color: C.slate, width: 4 }));
}

if (SHOW === 'pieces') {
  stage.duration = 1;
  const SCALE = 0.78;
  const room = new THREE.Group();
  room.position.set(0, 0.25, 0);
  room.scale.setScalar(SCALE);
  stage.add(room);
  drawPieces(room, pigment, 6);
  // The housing, outline only.
  // The chosen piece and its sectors.
  const fan = new THREE.Group();
  room.add(fan);
  const R = 0.9;
  const wedges = Array.from({ length: SECTORS }, () => {
    const m = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: C.bone, transparent: true, opacity: 0.5 }));
    fan.add(m);
    return m;
  });
  const rim = polyline(Array.from({ length: SECTORS * 4 + 1 }, () => [0, 0, 0] as [number, number, number]), { color: C.bone, width: 1.5 });
  fan.add(rim);
  const mark = polyline([[0, 0, 0], [0, 0, 0]], { color: C.rust, width: 9 });
  room.add(mark);
  function choose(i: number): void {
    const p = pieces[i]!;
    const mid = add(p.a, sub(p.b, p.a), 0.5);
    setPolyline(mark, [P3(p.a, 0.05), P3(p.b, 0.05)]);
    const base = Math.atan2(p.n.y, p.n.x);
    const rimPts: [number, number, number][] = [];
    wedges.forEach((w, k) => {
      const a0 = base - Math.PI / 2 + (2 * Math.PI * k) / SECTORS;
      const a1 = a0 + (2 * Math.PI) / SECTORS;
      const pos: number[] = [mid.x, mid.y, 0.02];
      for (let s = 0; s <= 4; s++) {
        const a = a0 + ((a1 - a0) * s) / 4;
        pos.push(mid.x + R * Math.cos(a), mid.y + R * Math.sin(a), 0.02);
        rimPts.push([mid.x + R * Math.cos(a), mid.y + R * Math.sin(a), 0.03]);
      }
      const idx: number[] = [];
      for (let s = 1; s <= 4; s++) idx.push(0, s, s + 1);
      w.geometry.dispose();
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      w.geometry = g;
      const out = k < HALF; // the first half of the circle, from -90 to 90 about the normal, leaves the surface
      const mat = w.material as THREE.MeshBasicMaterial;
      mat.color.setHex(out ? C.ochre : C.slateDeep);
      mat.opacity = out ? (k % 2 ? 0.55 : 0.8) : k % 2 ? 0.25 : 0.4;
    });
    rimPts.push(rimPts[0]!);
    setPolyline(rim, rimPts);
  }
  let chosen = 0;
  pieces.forEach((p, i) => {
    const m = pieces[chosen]!;
    if (p.name === 'red wall' && (m.name !== 'red wall' || Math.abs(p.a.y + p.b.y) < Math.abs(m.a.y + m.b.y))) chosen = i;
  });
  choose(chosen);
  const nPieces = pieces.length;
  stage.add(label(`${nPieces} pieces  ×  ${HALF} sectors leaving each  ×  3 colours  =  ${(nPieces * HALF * 3).toLocaleString('en-US')} numbers`, { size: 0.24, color: C.bone, anchorX: 'center', anchorY: 'top', position: [0, -2.62, 0] }));
  const canvas = stage.renderer.domElement;
  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    const wx = (((e.clientX - r.left) / r.width) * 2 - 1) * HALF_W;
    const wy = -(((e.clientY - r.top) / r.height) * 2 - 1) * ORTHO_H;
    const x = v(wx / SCALE, (wy - 0.25) / SCALE);
    let best = -1;
    let bd = 0.3;
    pieces.forEach((p, i) => {
      const ab = sub(p.b, p.a);
      const t = Math.max(0, Math.min(1, ((x.x - p.a.x) * ab.x + (x.y - p.a.y) * ab.y) / (ab.x * ab.x + ab.y * ab.y)));
      const d = Math.hypot(x.x - p.a.x - ab.x * t, x.y - p.a.y - ab.y * t);
      // A mirror's two sides: the one the pointer is on.
      const side = (x.x - p.a.x) * p.n.x + (x.y - p.a.y) * p.n.y;
      if (p.kind === 'mirror' && side < 0) return;
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    if (best >= 0 && best !== chosen) {
      chosen = best;
      choose(best);
    }
  });
}

if (SHOW === 'matrix') {
  // The window of numbers: a canvas texture, redrawn as it scrolls.
  const ROWS = 18;
  const COLS = 12;
  const W = { cx: -1.75, cy: -0.1, w: 6.4, h: 5.0 };
  const cv = document.createElement('canvas');
  cv.width = 1600;
  cv.height = 1250;
  const ctx = cv.getContext('2d')!;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(W.w, W.h), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  plate.position.set(W.cx, W.cy, 0);
  stage.add(plate);
  // Dense green channel, for reading entries.
  const dense = new Float32Array(N * N);
  for (let r = 0; r < N; r++) for (let e = 0; e < T.cols[r]!.length; e++) dense[r * N + T.cols[r]![e]!] = T.rowScale[1]![r]! * T.vals[r]![e]!;
  // The whole matrix: a dot per nonzero, downsampled.
  const S = 456;
  const f = N / S;
  const data = new Uint8Array(S * S * 4);
  for (let r = 0; r < N; r++)
    for (const c of T.cols[r]!) {
      const o = ((S - 1 - Math.floor(r / f)) * S + Math.floor(c / f)) * 4;
      data[o] = 230;
      data[o + 1] = 190;
      data[o + 2] = 110;
      data[o + 3] = 255;
    }
  for (let i = 0; i < S * S; i++) if (!data[i * 4 + 3]) data[i * 4 + 3] = 255;
  const thumbTex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  thumbTex.colorSpace = THREE.SRGBColorSpace;
  thumbTex.needsUpdate = true;
  const TH = { cx: 3.55, cy: 0.1, s: 2.9 };
  const thumb = new THREE.Mesh(new THREE.PlaneGeometry(TH.s, TH.s), new THREE.MeshBasicMaterial({ map: thumbTex }));
  thumb.position.set(TH.cx, TH.cy, 0);
  stage.add(thumb);
  stage.add(polyline([[TH.cx - TH.s / 2, TH.cy - TH.s / 2, 0.01], [TH.cx + TH.s / 2, TH.cy - TH.s / 2, 0.01], [TH.cx + TH.s / 2, TH.cy + TH.s / 2, 0.01], [TH.cx - TH.s / 2, TH.cy + TH.s / 2, 0.01], [TH.cx - TH.s / 2, TH.cy - TH.s / 2, 0.01]], { color: C.slate, width: 1.5 }));
  const nnz = T.cols.reduce((a, c) => a + c.length, 0);
  stage.add(label(`${N.toLocaleString('en-US')} × ${N.toLocaleString('en-US')}, one colour`, { size: 0.17, color: C.bone, anchorX: 'center', anchorY: 'top', position: [TH.cx, TH.cy - TH.s / 2 - 0.12, 0] }));
  stage.add(label(`${((100 * (N * N - nnz)) / (N * N)).toFixed(1)}% zeros`, { size: 0.17, color: C.ash, anchorX: 'center', anchorY: 'top', position: [TH.cx, TH.cy - TH.s / 2 - 0.42, 0] }));
  const box = polyline(Array.from({ length: 5 }, () => [0, 0, 0] as [number, number, number]), { color: C.rust, width: 2.5 });
  stage.add(box);
  // The path the window takes: down the matrix, and across to where that band of rows has the most nonzeros (eased, so it glides).
  stage.duration = 40;
  const BAND = ROWS;
  const bestCol: number[] = [];
  for (let r = 0; r < N; r += BAND) {
    const count = new Float64Array(N);
    for (let rr = r; rr < Math.min(N, r + BAND); rr++) for (const c of T.cols[rr]!) count[c]! += 1;
    let best = 0;
    let bestN = -1;
    let run = 0;
    for (let c = 0; c < N; c++) {
      run += count[c]! - (c >= COLS ? count[c - COLS]! : 0);
      if (c >= COLS - 1 && run > bestN) {
        bestN = run;
        best = c - COLS + 1;
      }
    }
    bestCol.push(best);
  }
  const colAt = (r: number) => {
    const t = r / BAND;
    const i = Math.min(bestCol.length - 2, Math.floor(t));
    const f = t - i;
    const e = f * f * (3 - 2 * f);
    return bestCol[i]! + (bestCol[i + 1]! - bestCol[i]!) * e;
  };
  const fmt = (x: number) => (x === 0 ? '0' : x.toFixed(4).replace(/^0/, ''));
  let lastKey = '';
  stage.frame((t) => {
    const u = t / stage.duration;
    const r0 = u * (N - ROWS);
    const c0 = Math.max(0, Math.min(N - COLS, colAt(r0)));
    const ri = Math.floor(r0);
    const ci = Math.floor(c0);
    const key = `${ri},${ci},${(r0 - ri).toFixed(2)}`;
    if (key !== lastKey) {
      lastKey = key;
      ctx.clearRect(0, 0, cv.width, cv.height);
      const ch = cv.height / ROWS;
      const cw = cv.width / COLS;
      ctx.font = `${Math.round(ch * 0.46)}px Menlo, ui-monospace, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let r = 0; r <= ROWS; r++)
        for (let c = 0; c < COLS; c++) {
          const rr = ri + r;
          if (rr >= N) continue;
          const val = dense[rr * N + ci + c]!;
          const y = (r - (r0 - ri) + 0.5) * ch;
          // Fade at the top and bottom edges, so the numbers run past rather than stopping.
          const edge = Math.min(1, y / (ch * 2), (cv.height - y) / (ch * 2));
          ctx.globalAlpha = Math.max(0, edge);
          ctx.fillStyle = val === 0 ? '#5b636b' : '#e8b860';
          ctx.fillText(fmt(val), (c + 0.5) * cw, y);
        }
      ctx.globalAlpha = 1;
      tex.needsUpdate = true;
    }
    // The window's place in the whole matrix.
    const x0 = TH.cx - TH.s / 2 + (c0 / N) * TH.s;
    const x1 = TH.cx - TH.s / 2 + ((c0 + COLS) / N) * TH.s;
    const y0 = TH.cy + TH.s / 2 - (r0 / N) * TH.s;
    const y1 = TH.cy + TH.s / 2 - ((r0 + ROWS) / N) * TH.s;
    const pad = 0.04;
    setPolyline(box, [[x0 - pad, y0 + pad, 0.02], [x1 + pad, y0 + pad, 0.02], [x1 + pad, y1 - pad, 0.02], [x0 - pad, y1 - pad, 0.02], [x0 - pad, y0 + pad, 0.02]]);
  });
}

if (SHOW === 'solve') {
  stage.duration = 1;
  const params = { source: (q.get('source') === 'patch' ? 'patch' : 'ray') as 'ray' | 'patch' };
  const SCALE = 0.44;
  const PANELS = [{ x: -2.72, y: -0.15 }, { x: 2.72, y: -0.15 }];
  const GW = 150;
  const GH = Math.round((GW * ROOM_HALF.y) / ROOM_HALF.x);
  const groups = PANELS.map((pn) => {
    const g = new THREE.Group();
    g.position.set(pn.x, pn.y, 0);
    g.scale.setScalar(SCALE);
    stage.add(g);
    return g;
  });
  // The panels' titles, E and (Id - T)^{-1} E, are the deck's (typeset).
  const arrowHead = new THREE.Mesh(
    (() => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([0.3, 0, 0, 0.16, 0.07, 0, 0.16, -0.07, 0], 3));
      return g;
    })(),
    flat(0x8fb5d6),
  );
  arrowHead.position.set(-0.04, PANELS[0]!.y, 0);
  stage.add(polyline([[-0.26, PANELS[0]!.y, 0], [0.12, PANELS[0]!.y, 0]], { color: 0x8fb5d6, width: 3 }), arrowHead);
  const note = label('', { size: 0.16, color: C.ash, anchorX: 'center', anchorY: 'top', position: [0, PANELS[0]!.y - ROOM_HALF.y * SCALE - 0.25, 0] });
  stage.add(note);
  let dynamic: THREE.Object3D[] = [];
  /**
   * The light arriving at each cell, averaged over all directions (RGB per
   * cell; NaN outside the room): gathered piece by piece, each piece's light
   * (in the sector toward the cell, from its middle) times the angle it fills
   * as seen from the cell, if the cell sees its middle. (Sampling directions
   * instead streaks: a far piece falls between the samples.)
   */
  function fillOf(L: Float64Array[]): Float32Array {
    const F = new Float32Array(GW * GH * 3).fill(NaN);
    const lit = pieces.map((_, p) => {
      for (let k = 0; k < HALF; k++) for (let c = 0; c < 3; c++) if (L[c]![index(p, k)]! > 0) return true;
      return false;
    });
    for (let j = 0; j < GH; j++)
      for (let i = 0; i < GW; i++) {
        const x = v(-ROOM_HALF.x + ((i + 0.5) / GW) * 2 * ROOM_HALF.x, -ROOM_HALF.y + ((j + 0.5) / GH) * 2 * ROOM_HALF.y);
        if (!inside(x)) continue;
        const s = [0, 0, 0];
        pieces.forEach((pc, p) => {
          if (!lit[p]) return;
          const mid = add(pc.a, sub(pc.b, pc.a), 0.5);
          const toMid = sub(mid, x);
          const out = v(-toMid.x, -toMid.y); // leaving the piece toward the cell
          if (out.x * pc.n.x + out.y * pc.n.y <= 0) return; // the cell is behind it
          const dist = Math.hypot(toMid.x, toMid.y);
          if (castPiece(x, v(toMid.x / dist, toMid.y / dist)) !== p) return; // something in the way
          const k = sectorOf(p, v(out.x / dist, out.y / dist));
          if (k < 0) return;
          const aa = Math.atan2(pc.a.y - x.y, pc.a.x - x.x);
          let da = Math.atan2(pc.b.y - x.y, pc.b.x - x.x) - aa;
          da = Math.abs(((da + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
          for (let c = 0; c < 3; c++) s[c]! += (L[c]![index(p, k)]! * da) / (2 * Math.PI);
        });
        for (let ch = 0; ch < 3; ch++) F[(j * GW + i) * 3 + ch] = s[ch]!;
      }
    return F;
  }
  function fillImage(F: Float32Array, expose: number): THREE.Mesh {
    const data = new Uint8Array(GW * GH * 4);
    for (let j = 0; j < GH; j++)
      for (let i = 0; i < GW; i++) {
        if (Number.isNaN(F[(j * GW + i) * 3]!)) continue;
        const s = [0, 1, 2].map((ch) => F[(j * GW + i) * 3 + ch]!);
        const o = (j * GW + i) * 4;
        const rgb = s.map((y) => 1 - Math.exp(-y / expose)) as RGB;
        const col = new THREE.Color().setRGB(...rgb, THREE.LinearSRGBColorSpace);
        data[o] = Math.round(col.r * 255);
        data[o + 1] = Math.round(col.g * 255);
        data[o + 2] = Math.round(col.b * 255);
        data[o + 3] = 255;
      }
    // The texture holds sRGB-encoded bytes: convert from the linear values above.
    for (let k = 0; k < GW * GH; k++)
      for (let ch = 0; ch < 3; ch++) {
        const lin = data[k * 4 + ch]! / 255;
        data[k * 4 + ch] = Math.round(255 * (lin <= 0.0031308 ? 12.92 * lin : 1.055 * lin ** (1 / 2.4) - 0.055));
      }
    const tex = new THREE.DataTexture(data, GW, GH, THREE.RGBAFormat);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2 * ROOM_HALF.x, 2 * ROOM_HALF.y), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    m.position.z = -0.1;
    return m;
  }
  function show(): void {
    for (const o of dynamic) o.parent?.remove(o);
    dynamic = [];
    const E = sourceE(params.source);
    const t0 = performance.now();
    const L = [0, 1, 2].map((c) => solve(T, c, E[c]!));
    const ms = performance.now() - t0;
    // Exposure: the solved room's light, the 70th percentile of its cells (the source's own beam is far brighter and saturates).
    const fills = [fillOf(E), fillOf(L)];
    const lum: number[] = [];
    for (let k = 0; k < GW * GH; k++) if (!Number.isNaN(fills[1]![k * 3]!)) lum.push(Math.max(fills[1]![k * 3]!, fills[1]![k * 3 + 1]!, fills[1]![k * 3 + 2]!));
    lum.sort((a, b) => a - b);
    const expose = lum[Math.floor(lum.length * 0.7)]! || 1;
    [E, L].forEach((F, n) => {
      const g = groups[n]!;
      const img = fillImage(fills[n]!, expose);
      g.add(img);
      dynamic.push(img);
      const lines = new THREE.Group();
      drawPieces(lines, (i) => {
        if (i === SOURCE_PIECE) return 0xffffff;
        const p = pieces[i]!;
        const s = [0, 1, 2].map((c) => {
          let t = 0;
          for (let k = 0; k < HALF; k++) t += F[c]![index(i, k)]!;
          return 1 - Math.exp(-t / HALF / (expose * 2));
        }) as RGB;
        // A mirror shows what it reflects, both sides; draw it as the brighter side.
        if (p.kind === 'mirror') return C.bone;
        return Math.max(...s) < 0.02 ? C.slateDeep : hexOf(s);
      }, 6);
      g.add(lines);
      dynamic.push(lines);
    });
    setText(note, `solved by Gaussian elimination on Id − T, ${N.toLocaleString('en-US')} × ${N.toLocaleString('en-US')}, three times (once per colour): ${Math.round(ms)} ms`);
  }
  show();
  ui.params.add(params, 'source', ['ray', 'patch']).onChange(show);
}

stage.start();
