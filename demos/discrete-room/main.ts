/**
 * Computing a photograph by actually inverting: the beam room discretized
 * (src/discrete-room.ts), T as a matrix, and (Id - T)^{-1} E solved for
 * (Steve, 2026-11-04). Three pictures, `?show=`:
 *
 *   pieces  the room with its boundary cut into pieces, and at one piece (hover
 *           to choose) its circle of direction sectors: the half that leaves
 *           the surface lit, the half into it dark. The count below: pieces x
 *           outgoing sectors x 3 colours, the size of a light field.
 *           `&bare`: just the room in pieces, no sectors, no count, no hover
 *           (a small picture for the idea slide).
 *   row     T one row at a time (Steve, 2026-11-04: the matrix slide "right
 *           now is totally incomprehensible"): left, the room, one piece and
 *           one direction leaving it (the row), and lines back to every piece
 *           its light comes from (the row's nonzero entries); right, the whole
 *           matrix, a faint dot per nonzero, that row marked and its entries
 *           lit. It steps through a matte wall (light from everywhere it can
 *           see: many entries), a mirror (light from one direction: an entry or
 *           two) and the ceiling.
 *   system  the linear system L = E + T L as pictures (Steve, 2026-11-04: "show
 *           the linear system E + T(L), by showing T maybe"): a column for L,
 *           =, a column for E, +, the matrix T, a column for L, each with its
 *           4,104 entries (the R block, then G, then B; brightness the value,
 *           each block in its colour), T the actual pattern of its nonzero
 *           entries, 4,104 x 4,104: three blocks on the diagonal (the colours
 *           never mix) and zeros everywhere else. L is the solution for the
 *           `ray` source, so the picture is an equation that holds. Symbol
 *           labels are the deck's. A magnifier (Steve, 2026-11-04: "hover on a
 *           small subset and it zooms in on like a 5x5 grid of numbers at that
 *           point, or a 1x10 for a vector"): over T, a box marks the spot and
 *           the panel at the right shows that 5 x 5 patch of T's entries; over
 *           a column, 10 of its entries. Nonzero entries in their block's
 *           colour, zeros grey.
 *   inverse (Steve, 2026-11-04: "draw (Id - T) as a matrix, then draw
 *           (Id - T)^{-1} as a matrix, then multiply it by E and get a vector
 *           out, all drawn in this style"): Id - T (T's pattern and the
 *           diagonal), an arrow, (Id - T)^{-1} (computed at build time,
 *           scripts/bake-discrete.mjs: dense, 10% zeros against T's 97%;
 *           brightness on a log scale), E, =, and L = (Id - T)^{-1} E. It
 *           builds with the deck's steps ({deck: 'step', shown}): 0, Id - T;
 *           1, + its inverse; 2, + E; 3, + L. Alone (not in the deck), all of
 *           it. The same magnifier, floating by the pointer.
 *   cmatrix the camera's matrix C alone, big, with a floating magnifier on its
 *           entries (Steve, 2026-11-04: "then the matrix that defines the
 *           camera, where we can zoom in on the number entries"): the
 *           magnifier centres on the nonzero entry nearest the pointer in its
 *           row. The camera is a lens camera (Steve: "a lens camera for fun,
 *           a smallish aperture"): LENS_K rays per pixel through a lens
 *           APERTURE wide, meeting at FOCUS; each row's entries are 1/LENS_K
 *           at the light each ray reads (summed where two rays read the same).
 *   camera  (laid out as a textbook product, Steve: "L is a column vector right
 *           next to it, then we do equals to our shorter column vector, the
 *           image": C short and wide, L a tall column beside it, =, the short
 *           column C L, and the image)
 *           the photograph, C L (Steve, 2026-11-04: "we start with E, then we get
 *           L, then we compute C(L), our photograph"): L across the top as a
 *           row, its 4,248 entries; under it, lined up column for column, C,
 *           one row per pixel and colour (CAM_PIX pixels x 3), each row a
 *           single nonzero, the entry of L its ray reads (16 pixels, as in
 *           pinhole-camera; a pinhole camera:
 *           the pixel's ray leaves one piece in one sector); = the column of
 *           pixel values; and those as the photograph, a strip. The camera is
 *           the Part II pinhole (pinhole-camera: at (-3.5, -1.3), aimed 22
 *           degrees, sensor 1.6 wide at depth 0.8), shown in a small room
 *           below. Builds with the deck's steps: 0, L; 1, + C; 2, + the
 *           column; 3, + the photograph. Hover a row of C: a line up to the
 *           entry of L it picks and across to the pixel it fills.
 *   matrix  T (its green channel; the others have the same zeros) as numbers,
 *           a window of it running past, mostly zeros; beside it the whole
 *           matrix, a dot per nonzero entry, and the window's place in it.
 *   solve   E, a bright white source in the lamp and nothing else, and
 *           (Id - T)^{-1} E, solved by Gaussian elimination on the
 *           1368 x 1368 matrix Id - T, one colour at a time: the whole room
 *           lit. `source` (also `&source=`): ray, one sector of the lamp's
 *           opening (a narrow beam); patch, the opening glowing every way.
 *           `&match` (Steve, 2026-11-04: "convert back to pictures", the
 *           blurry version beside the traced one): laid out exactly as
 *           equilibrium-room ?panels=invert&emitter, E signified by the white
 *           rectangle in the lamp, no note; L read off the baked inverse
 *           ((Id - T)^{-1} E, the vector on the slide before).
 *
 * The room's fill is the light arriving at each place, averaged over all
 * directions; the walls are drawn in the light leaving them. One exposure for
 * both panels, set by the solved room, so E's source is far past white.
 */

import * as THREE from 'three';
import { createStage, createUI, C, flat } from '@';
import { polyline, setPolyline } from '@/lines';
import { label, setText } from '@/text';
import { type Vec, v, add, sub, ROOM_HALF, ROOM_R, SOURCE } from '@/beamscene';
import { pieces, N, HALF, SECTORS, isSource, index, buildT, sourceE, solve, castPiece, sectorOf, inverse, unpackInverses, type RGB } from '@/discrete-room';
import { HOUSING } from '@/beamscene';

const ORTHO_H = 3;
const HALF_W = (ORTHO_H * 16) / 9;
const stage = createStage({ camera: 'ortho', position: [0, 0, 10], target: [0, 0, 0], orthoHeight: ORTHO_H, lights: false, controls: false });
const ui = createUI(stage);
const q = new URLSearchParams(location.search);
const SHOW = (q.get('show') ?? 'solve') as 'pieces' | 'row' | 'system' | 'inverse' | 'cmatrix' | 'camera' | 'matrix' | 'solve';
const BARE = q.has('bare');
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
  if (BARE) fan.visible = mark.visible = false;
  let chosen = 0;
  pieces.forEach((p, i) => {
    const m = pieces[chosen]!;
    if (p.name === 'red wall' && (m.name !== 'red wall' || Math.abs(p.a.y + p.b.y) < Math.abs(m.a.y + m.b.y))) chosen = i;
  });
  choose(chosen);
  const nPieces = pieces.length;
  if (!BARE) {
    stage.add(label(`L:  ${nPieces} pieces  ×  ${HALF} directions leaving each  ×  3 colours  =  ${(nPieces * HALF * 3).toLocaleString('en-US')} numbers`, { size: 0.22, color: C.bone, anchorX: 'center', anchorY: 'top', position: [0, -2.3, 0] }));
    stage.add(label(`T:  three ${N.toLocaleString('en-US')} × ${N.toLocaleString('en-US')} matrices, one per colour (the colours never mix)`, { size: 0.22, color: C.bone, anchorX: 'center', anchorY: 'top', position: [0, -2.65, 0] }));
  }
  const canvas = stage.renderer.domElement;
  if (!BARE) canvas.addEventListener('pointermove', (e) => {
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

if (SHOW === 'system') {
  stage.duration = 1;
  const NN = 3 * N; // the whole light field: R block, G block, B block
  const PX = 456; // drawn rows (each about 9 entries)
  const H = 4.4;
  const CY = -0.05;
  const TINT: RGB[] = [[0.85, 0.36, 0.28], [0.45, 0.72, 0.38], [0.42, 0.62, 0.86]];
  const E = sourceE('beam');
  const L = [0, 1, 2].map((c) => solve(T, c, E[c]!));
  const nz = (F: Float64Array[]) => {
    const all: number[] = [];
    for (const f of F) for (const x of f) if (x > 0) all.push(x);
    return all.sort((a, b) => a - b);
  };
  const lv = nz(L);
  const q = lv[Math.floor(lv.length * 0.7)]! || 1;
  /** A column of the 4,104 entries, drawn PX tall: each drawn row the mean of its entries (`max` for E, so its few entries show). */
  function column(F: Float64Array[], useMax: boolean): THREE.DataTexture {
    const data = new Uint8Array(PX * 4);
    for (let r = 0; r < PX; r++) {
      const i0 = Math.floor((r * NN) / PX);
      const i1 = Math.floor(((r + 1) * NN) / PX);
      let acc = 0;
      let c = 0;
      for (let i = i0; i < i1; i++) {
        c = Math.floor(i / N);
        const x = F[c]![i - c * N]!;
        acc = useMax ? Math.max(acc, x) : acc + x / (i1 - i0);
      }
      const b = 1 - Math.exp(-acc / q);
      const o = (PX - 1 - r) * 4; // entry 0 at the top
      const col = new THREE.Color().setRGB(...(TINT[c]!.map((t) => Math.min(1, t * b * 1.15)) as RGB), THREE.LinearSRGBColorSpace);
      data[o] = Math.round(255 * col.r);
      data[o + 1] = Math.round(255 * col.g);
      data[o + 2] = Math.round(255 * col.b);
      data[o + 3] = 255;
    }
    const tex = new THREE.DataTexture(data, 1, PX, THREE.RGBAFormat);
    tex.needsUpdate = true;
    return tex;
  }
  const W = 0.34;
  const frame = (x0: number, x1: number) => {
    const y0 = CY - H / 2;
    const y1 = CY + H / 2;
    stage.add(polyline([[x0, y0, 0.01], [x1, y0, 0.01], [x1, y1, 0.01], [x0, y1, 0.01], [x0, y0, 0.01]], { color: C.slate, width: 1.5 }));
  };
  const columnAt = (x: number, tex: THREE.DataTexture) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: tex }));
    m.position.set(x, CY, 0);
    stage.add(m);
    frame(x - W / 2, x + W / 2);
  };
  const X = { L1: -4.5, eq: -3.92, E: -3.34, plus: -2.76, T0: -2.2, L2: 2.62 };
  columnAt(X.L1, column(L, false));
  columnAt(X.E, column(E, false));
  // E's nonzero entries (the source, one in each colour) are 3 of 4,104: too thin to see, so each is marked.
  for (let c = 0; c < 3; c++)
    for (let i = 0; i < N; i++) {
      if (!(E[c]![i]! > 0)) continue;
      const y = CY + H / 2 - ((c * N + i + 0.5) / NN) * H;
      const mk = new THREE.Mesh(new THREE.PlaneGeometry(W, 0.07), flat(new THREE.Color().setRGB(...TINT[c]!, THREE.LinearSRGBColorSpace).getHex()));
      mk.position.set(X.E, y, 0.02);
      stage.add(mk);
    }
  columnAt(X.L2, column(L, false));
  for (const [sym, x] of [['=', X.eq], ['+', X.plus]] as const) stage.add(label(sym, { size: 0.45, color: C.bone, anchorX: 'center', anchorY: 'middle', position: [x, CY, 0] }));
  // T: a dot where any of the entries a drawn pixel covers is nonzero, in its block's colour.
  const S = PX;
  const data = new Uint8Array(S * S * 4);
  for (let i = 0; i < S * S; i++) data[i * 4 + 3] = 255;
  for (let c = 0; c < 3; c++)
    for (let r = 0; r < N; r++)
      for (const col of T.cols[r]!) {
        const R = c * N + r;
        const Cc = c * N + col;
        const o = ((S - 1 - Math.floor((R * S) / NN)) * S + Math.floor((Cc * S) / NN)) * 4;
        data[o] = Math.round(255 * TINT[c]![0]! * 0.9);
        data[o + 1] = Math.round(255 * TINT[c]![1]! * 0.9);
        data[o + 2] = Math.round(255 * TINT[c]![2]! * 0.9);
      }
  const ttex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  ttex.colorSpace = THREE.SRGBColorSpace;
  ttex.needsUpdate = true;
  const tm = new THREE.Mesh(new THREE.PlaneGeometry(H, H), new THREE.MeshBasicMaterial({ map: ttex }));
  tm.position.set(X.T0 + H / 2, CY, 0);
  stage.add(tm);
  frame(X.T0, X.T0 + H);

  // --- The magnifier ------------------------------------------------------------------
  const tAt = (R: number, Cc: number) => {
    const c = Math.floor(R / N);
    if (Math.floor(Cc / N) !== c) return { v: 0, c }; // off the diagonal blocks: the colours never mix
    const r = R - c * N;
    const col = Cc - c * N;
    const cs = T.cols[r]!;
    for (let e = 0; e < cs.length; e++) if (cs[e] === col) return { v: T.rowScale[c]![r]! * T.vals[r]![e]!, c };
    return { v: 0, c };
  };
  const vecAt = (F: Float64Array[], i: number) => {
    const c = Math.floor(i / N);
    return { v: F[c]![i - c * N]!, c };
  };
  const ZOOM = { cx: 4.15, cy: CY, size: 2.2 };
  const cv = document.createElement('canvas');
  cv.width = cv.height = 800;
  const ctx = cv.getContext('2d')!;
  const ztex = new THREE.CanvasTexture(cv);
  ztex.colorSpace = THREE.SRGBColorSpace;
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(ZOOM.size, ZOOM.size), new THREE.MeshBasicMaterial({ map: ztex, transparent: true }));
  panel.position.set(ZOOM.cx, ZOOM.cy, 0.05);
  stage.add(panel);
  const zoomFrame = polyline(Array.from({ length: 5 }, () => [0, 0, 0] as [number, number, number]), { color: C.bone, width: 1.5 });
  const box = polyline(Array.from({ length: 5 }, () => [0, 0, 0] as [number, number, number]), { color: C.bone, width: 2 });
  const lead1 = polyline([[0, 0, 0], [0, 0, 0]], { color: C.bone, width: 1, opacity: 0.6 });
  const lead2 = polyline([[0, 0, 0], [0, 0, 0]], { color: C.bone, width: 1, opacity: 0.6 });
  stage.add(zoomFrame, box, lead1, lead2);
  const zoomTitle = label('', { size: 0.15, color: C.ash, anchorX: 'center', anchorY: 'bottom', position: [ZOOM.cx, 0, 0.05] });
  zoomTitle.textAlign = 'center';
  stage.add(zoomTitle);
  const hex = (c: number) => {
    const col = new THREE.Color().setRGB(...(TINT[c]!.map((t) => Math.min(1, t * 1.25)) as RGB), THREE.LinearSRGBColorSpace);
    return `#${col.getHexString()}`;
  };
  const fmt = (x: number) => (x === 0 ? '0' : x >= 0.01 ? x.toFixed(3).replace(/^0\./, '.') : x.toFixed(4).replace(/^0\./, '.'));
  const rect = (x0: number, y0: number, x1: number, y1: number): [number, number, number][] => [[x0, y0, 0.06], [x1, y0, 0.06], [x1, y1, 0.06], [x0, y1, 0.06], [x0, y0, 0.06]];
  /** Draw the panel: rows x cols cells of `cell(i, j)`; its frame sized to fit, and leader lines from the marked box. */
  function draw(rows: number, cols: number, cell: (i: number, j: number) => { v: number; c: number }, title: string, bx: [number, number, number, number]): void {
    ctx.clearRect(0, 0, cv.width, cv.height);
    // Square cells for T; for a vector, cells three times as wide as tall, so the numbers are as big.
    const ch = cv.height / Math.max(rows, cols);
    const cw = cols === 1 ? ch * 3 : ch;
    const w = cw * cols;
    const h = ch * rows;
    const ox = (cv.width - w) / 2;
    const oy = (cv.height - h) / 2;
    ctx.fillStyle = 'rgba(16,16,16,0.92)';
    ctx.fillRect(ox, oy, w, h);
    ctx.font = `${Math.round(cols > 1 ? ch * 0.27 : ch * 0.42)}px Menlo, ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < rows; i++)
      for (let j = 0; j < cols; j++) {
        const { v, c } = cell(i, j);
        ctx.fillStyle = v === 0 ? '#5b636b' : hex(c);
        ctx.fillText(fmt(v), ox + (j + 0.5) * cw, oy + (i + 0.5) * ch);
      }
    ztex.needsUpdate = true;
    // The frame round the numbers, in world units.
    const k = ZOOM.size / cv.width;
    const fx0 = ZOOM.cx - ZOOM.size / 2 + ox * k;
    const fx1 = fx0 + w * k;
    const fy1 = ZOOM.cy + ZOOM.size / 2 - oy * k;
    const fy0 = fy1 - h * k;
    setPolyline(zoomFrame, rect(fx0, fy0, fx1, fy1));
    setPolyline(box, rect(...bx));
    setPolyline(lead1, [[bx[2], bx[3], 0.06], [fx0, fy1, 0.06]]);
    setPolyline(lead2, [[bx[2], bx[1], 0.06], [fx0, fy0, 0.06]]);
    zoomTitle.position.y = fy1 + 0.08;
    setText(zoomTitle, title);
  }
  const PAD = 0.05; // the marking box is drawn bigger than the entries it covers, so it can be seen
  const yOf = (i: number) => CY + H / 2 - (i / NN) * H;
  const xOf = (j: number) => X.T0 + (j / NN) * H;
  const block = (i: number) => 'RGB'[Math.floor(i / N)]!;
  function zoomT(R: number, Cc: number): void {
    R = Math.max(0, Math.min(NN - 5, R - 2));
    Cc = Math.max(0, Math.min(NN - 5, Cc - 2));
    draw(5, 5, (i, j) => tAt(R + i, Cc + j), `T, rows ${R + 1}–${R + 5}\ncolumns ${Cc + 1}–${Cc + 5}`, [xOf(Cc) - PAD, yOf(R + 5) - PAD, xOf(Cc + 5) + PAD, yOf(R) + PAD]);
  }
  function zoomVec(name: string, F: Float64Array[], x: number, i: number): void {
    i = Math.max(0, Math.min(NN - 10, i - 5));
    draw(10, 1, (k) => vecAt(F, i + k), `${name}, entries\n${i + 1}–${i + 10} (${block(i)})`, [x - W / 2 - PAD, yOf(i + 10) - PAD, x + W / 2 + PAD, yOf(i) + PAD]);
  }
  // Start on a nonzero patch of the green block.
  {
    const r = Math.floor(N * 0.42);
    zoomT(N + r, N + T.cols[r]![Math.floor(T.cols[r]!.length / 2)]!);
  }
  const canvas = stage.renderer.domElement;
  canvas.addEventListener('pointermove', (e) => {
    const rr = canvas.getBoundingClientRect();
    const wx = (((e.clientX - rr.left) / rr.width) * 2 - 1) * HALF_W;
    const wy = -(((e.clientY - rr.top) / rr.height) * 2 - 1) * ORTHO_H;
    if (Math.abs(wy - CY) > H / 2) return;
    const i = Math.floor(((CY + H / 2 - wy) / H) * NN);
    if (wx >= X.T0 && wx <= X.T0 + H) zoomT(i, Math.floor(((wx - X.T0) / H) * NN));
    else if (Math.abs(wx - X.L1) < W) zoomVec('L', L, X.L1, i);
    else if (Math.abs(wx - X.E) < W) zoomVec('E', E, X.E, i);
    else if (Math.abs(wx - X.L2) < W) zoomVec('L', L, X.L2, i);
  });
}

if (SHOW === 'inverse') {
  stage.duration = 1;
  const NN = 3 * N;
  const PX = 456;
  const S = 3.7; // each matrix's side
  const CY = -0.05;
  const W = 0.3; // a column's width
  const X = { M1: -4.85, M2: -0.45, E: 3.66, eq: 4.15, L: 4.66 };
  const TINT: RGB[] = [[0.85, 0.36, 0.28], [0.45, 0.72, 0.38], [0.42, 0.62, 0.86]];
  const hexOfTint = (c: number, b = 1) => new THREE.Color().setRGB(...(TINT[c]!.map((t) => Math.min(1, t * b)) as RGB), THREE.LinearSRGBColorSpace).getHex();
  // (Id - T)^{-1}: baked at build time; computed here only if the file is missing (several seconds).
  let INV: (Float32Array | Float64Array)[] | null = null;
  try {
    const res = await fetch(new URL('discrete-inverse.bin', document.baseURI));
    if (res.ok) INV = unpackInverses(await res.arrayBuffer());
  } catch {
    // fall through
  }
  INV ??= [0, 1, 2].map((c) => inverse(T, c));
  const E = sourceE('beam');
  const L = [0, 1, 2].map((c) => {
    const out = new Float64Array(N);
    for (let r = 0; r < N; r++) {
      let acc = 0;
      for (let j = 0; j < N; j++) if (E[c]![j]) acc += INV![c]![r * N + j]! * E[c]![j]!;
      out[r] = acc;
    }
    return out;
  });
  const idt = (R: number, Cc: number) => {
    const c = Math.floor(R / N);
    if (Math.floor(Cc / N) !== c) return { v: 0, c };
    const r = R - c * N;
    const col = Cc - c * N;
    let v = r === col ? 1 : 0;
    const cs = T.cols[r]!;
    for (let e = 0; e < cs.length; e++) if (cs[e] === col) v -= T.rowScale[c]![r]! * T.vals[r]![e]!;
    return { v, c };
  };
  const invAt = (R: number, Cc: number) => {
    const c = Math.floor(R / N);
    if (Math.floor(Cc / N) !== c) return { v: 0, c };
    return { v: INV![c]![(R - c * N) * N + (Cc - c * N)]!, c };
  };
  const vecAt = (F: Float64Array[], i: number) => {
    const c = Math.floor(i / N);
    return { v: F[c]![i - c * N]!, c };
  };
  const groups = [new THREE.Group(), new THREE.Group(), new THREE.Group(), new THREE.Group()];
  groups.forEach((g) => stage.add(g));
  const box = (g: THREE.Group, x0: number, x1: number, h: number) =>
    g.add(polyline([[x0, CY - h / 2, 0.01], [x1, CY - h / 2, 0.01], [x1, CY + h / 2, 0.01], [x0, CY + h / 2, 0.01], [x0, CY - h / 2, 0.01]], { color: C.slate, width: 1.5 }));
  const image = (g: THREE.Group, data: Uint8Array, w: number, h: number, x: number, sw: number, sh: number) => {
    const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), new THREE.MeshBasicMaterial({ map: tex }));
    m.position.set(x, CY, 0);
    g.add(m);
  };
  const put = (data: Uint8Array, o: number, hex: number) => {
    data[o] = (hex >> 16) & 255;
    data[o + 1] = (hex >> 8) & 255;
    data[o + 2] = hex & 255;
  };
  // Id - T: T's pattern, and the diagonal.
  {
    const data = new Uint8Array(PX * PX * 4);
    for (let i = 0; i < PX * PX; i++) data[i * 4 + 3] = 255;
    for (let c = 0; c < 3; c++)
      for (let r = 0; r < N; r++) {
        for (const col of T.cols[r]!) put(data, ((PX - 1 - Math.floor(((c * N + r) * PX) / NN)) * PX + Math.floor(((c * N + col) * PX) / NN)) * 4, hexOfTint(c, 0.8));
        const d = Math.floor(((c * N + r) * PX) / NN);
        put(data, ((PX - 1 - d) * PX + d) * 4, 0xf2ece0);
      }
    image(groups[0]!, data, PX, PX, X.M1 + S / 2, S, S);
    box(groups[0]!, X.M1, X.M1 + S, S);
  }
  // The arrow, and (Id - T)^{-1}: each drawn pixel the mean size of the entries it covers, on a log scale.
  {
    const ax0 = X.M1 + S + 0.12;
    const ax1 = X.M2 - 0.12;
    groups[1]!.add(polyline([[ax0, CY, 0], [ax1, CY, 0]], { color: C.bone, width: 3 }));
    groups[1]!.add(polyline([[ax1 - 0.13, CY + 0.1, 0], [ax1, CY, 0], [ax1 - 0.13, CY - 0.1, 0]], { color: C.bone, width: 3 }));
    const mean = new Float64Array(PX * PX);
    const cnt = new Float64Array(PX * PX);
    for (let c = 0; c < 3; c++)
      for (let r = 0; r < N; r++) {
        const pr = Math.floor(((c * N + r) * PX) / NN);
        for (let j = 0; j < N; j++) {
          const pc = Math.floor(((c * N + j) * PX) / NN);
          mean[pr * PX + pc]! += Math.abs(INV[c]![r * N + j]!);
          cnt[pr * PX + pc]! += 1;
        }
      }
    const vals: number[] = [];
    for (let k = 0; k < PX * PX; k++) if (cnt[k]) {
      mean[k] = mean[k]! / cnt[k]!;
      if (mean[k]! > 0) vals.push(mean[k]!);
    }
    vals.sort((a, b) => a - b);
    const lo = Math.log10(vals[Math.floor(vals.length * 0.05)]!);
    const hi = Math.log10(vals[Math.floor(vals.length * 0.995)]!);
    const data = new Uint8Array(PX * PX * 4);
    for (let pr = 0; pr < PX; pr++)
      for (let pc = 0; pc < PX; pc++) {
        const o = ((PX - 1 - pr) * PX + pc) * 4;
        data[o + 3] = 255;
        const v = mean[pr * PX + pc]!;
        if (!(v > 0)) continue;
        const b = Math.max(0.08, Math.min(1, (Math.log10(v) - lo) / (hi - lo)));
        put(data, o, hexOfTint(Math.floor((pr * NN) / PX / N), b));
      }
    image(groups[1]!, data, PX, PX, X.M2 + S / 2, S, S);
    box(groups[1]!, X.M2, X.M2 + S, S);
  }
  // A column of 4,104 entries (as on the system slide).
  const lv: number[] = [];
  for (const f of L) for (const x of f) if (x > 0) lv.push(x);
  lv.sort((a, b) => a - b);
  const qL = lv[Math.floor(lv.length * 0.7)]! || 1;
  function column(g: THREE.Group, F: Float64Array[], x: number): void {
    const data = new Uint8Array(PX * 4);
    for (let r = 0; r < PX; r++) {
      const i0 = Math.floor((r * NN) / PX);
      const i1 = Math.floor(((r + 1) * NN) / PX);
      let acc = 0;
      let c = 0;
      for (let i = i0; i < i1; i++) {
        c = Math.floor(i / N);
        acc += F[c]![i - c * N]! / (i1 - i0);
      }
      put(data, (PX - 1 - r) * 4, hexOfTint(c, 1.15 * (1 - Math.exp(-acc / qL))));
      data[(PX - 1 - r) * 4 + 3] = 255;
    }
    image(g, data, 1, PX, x, W, S);
    box(g, x - W / 2, x + W / 2, S);
  }
  column(groups[2]!, E.map((e) => e.map(() => 0)), X.E); // E is zero but for the source, marked below
  for (let c = 0; c < 3; c++)
    for (let i = 0; i < N; i++)
      if (E[c]![i]! > 0) {
        const mk = new THREE.Mesh(new THREE.PlaneGeometry(W, 0.07), flat(hexOfTint(c, 1.2)));
        mk.position.set(X.E, CY + S / 2 - ((c * N + i + 0.5) / NN) * S, 0.02);
        groups[2]!.add(mk);
      }
  groups[3]!.add(label('=', { size: 0.4, color: C.bone, anchorX: 'center', anchorY: 'middle', position: [X.eq, CY, 0] }));
  column(groups[3]!, L, X.L);

  // --- Building with the deck ------------------------------------------------------------
  const setShown = (n: number) => groups.forEach((g, k) => (g.visible = k <= n));
  setShown(window.parent !== window ? 0 : 3);
  window.addEventListener('message', (e) => {
    const d = e.data as { deck?: string; shown?: number } | null;
    if (d?.deck === 'step' && typeof d.shown === 'number') setShown(d.shown);
  });
  window.parent?.postMessage({ demo: 'ready' }, '*');

  // --- The magnifier, floating by the pointer ---------------------------------------------
  const cv = document.createElement('canvas');
  cv.width = cv.height = 800;
  const ctx = cv.getContext('2d')!;
  const ztex = new THREE.CanvasTexture(cv);
  ztex.colorSpace = THREE.SRGBColorSpace;
  const ZS = 2.0;
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(ZS, ZS), new THREE.MeshBasicMaterial({ map: ztex, transparent: true }));
  const mark = polyline(Array.from({ length: 5 }, () => [0, 0, 0] as [number, number, number]), { color: C.bone, width: 2 });
  const zt = label('', { size: 0.13, color: C.ash, anchorX: 'center', anchorY: 'bottom', position: [0, 0, 0.3] });
  zt.textAlign = 'center';
  stage.add(panel, mark, zt);
  panel.visible = mark.visible = zt.visible = false;
  const fmt = (x: number) => {
    if (x === 0) return '0';
    const a = Math.abs(x);
    // Small entries in scientific form, so a tiny nonzero never reads as zero.
    const t = a >= 0.995 ? a.toFixed(3) : a >= 0.01 ? a.toFixed(3).replace(/^0\./, '.') : a >= 0.001 ? a.toFixed(4).replace(/^0\./, '.') : a.toExponential(1).replace('e-', 'e−');
    return x < 0 ? `−${t}` : t;
  };
  const rect = (x0: number, y0: number, x1: number, y1: number): [number, number, number][] => [[x0, y0, 0.25], [x1, y0, 0.25], [x1, y1, 0.25], [x0, y1, 0.25], [x0, y0, 0.25]];
  function zoom(rows: number, cols: number, cell: (i: number, j: number) => { v: number; c: number }, title: string, bx: [number, number, number, number]): void {
    ctx.clearRect(0, 0, cv.width, cv.height);
    const ch = cv.height / Math.max(rows, cols);
    const cw = cols === 1 ? ch * 3 : ch;
    const w = cw * cols;
    const h = ch * rows;
    const ox = (cv.width - w) / 2;
    const oy = (cv.height - h) / 2;
    ctx.fillStyle = 'rgba(14,14,14,0.96)';
    ctx.fillRect(ox, oy, w, h);
    ctx.strokeStyle = '#d9d1c2';
    ctx.lineWidth = 3;
    ctx.strokeRect(ox + 1.5, oy + 1.5, w - 3, h - 3);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < rows; i++)
      for (let j = 0; j < cols; j++) {
        const { v, c } = cell(i, j);
        // Scientific entries are longer: smaller type, so neighbours do not touch.
        const sci = v !== 0 && Math.abs(v) < 0.001;
        ctx.font = `${Math.round(cols > 1 ? ch * (sci ? 0.19 : 0.25) : ch * 0.42)}px Menlo, ui-monospace, monospace`;
        ctx.fillStyle = v === 0 ? '#5b636b' : `#${new THREE.Color(hexOfTint(c, 1.3)).getHexString()}`;
        ctx.fillText(fmt(v), ox + (j + 0.5) * cw, oy + (i + 0.5) * ch);
      }
    ztex.needsUpdate = true;
    // Float above the marked spot (below it near the top), kept in the frame.
    const k = ZS / cv.width;
    const pw = w * k;
    const ph = h * k;
    let px = (bx[0] + bx[2]) / 2;
    px = Math.max(-HALF_W + pw / 2 + 0.1, Math.min(HALF_W - pw / 2 - 0.1, px));
    let py = bx[3] + 0.25 + ph / 2;
    if (py + ph / 2 > ORTHO_H - 0.35) py = bx[1] - 0.25 - ph / 2;
    panel.position.set(px, py, 0.2);
    zt.position.set(px, py + ph / 2 + 0.05, 0.3);
    setText(zt, title);
    setPolyline(mark, rect(...bx));
    panel.visible = mark.visible = zt.visible = true;
  }
  const PAD = 0.04;
  const yOf = (i: number) => CY + S / 2 - (i / NN) * S;
  const block = (i: number) => 'RGB'[Math.floor(i / N)]!;
  const canvas = stage.renderer.domElement;
  canvas.addEventListener('pointermove', (e) => {
    const rr = canvas.getBoundingClientRect();
    const wx = (((e.clientX - rr.left) / rr.width) * 2 - 1) * HALF_W;
    const wy = -(((e.clientY - rr.top) / rr.height) * 2 - 1) * ORTHO_H;
    const inMat = (x0: number) => wx >= x0 && wx <= x0 + S && Math.abs(wy - CY) <= S / 2;
    const i = Math.floor(((CY + S / 2 - wy) / S) * NN);
    const matrix = (x0: number, at: typeof idt, name: string) => {
      const R = Math.max(0, Math.min(NN - 5, i - 2));
      const Cc = Math.max(0, Math.min(NN - 5, Math.floor(((wx - x0) / S) * NN) - 2));
      const xOf = (j: number) => x0 + (j / NN) * S;
      zoom(5, 5, (a, b) => at(R + a, Cc + b), `${name}, rows ${R + 1}–${R + 5}, columns ${Cc + 1}–${Cc + 5}`, [xOf(Cc) - PAD, yOf(R + 5) - PAD, xOf(Cc + 5) + PAD, yOf(R) + PAD]);
    };
    const vector = (F: Float64Array[], x: number, name: string) => {
      const i0 = Math.max(0, Math.min(NN - 10, i - 5));
      zoom(10, 1, (a) => vecAt(F, i0 + a), `${name}, entries ${i0 + 1}–${i0 + 10} (${block(i0)})`, [x - W / 2 - PAD, yOf(i0 + 10) - PAD, x + W / 2 + PAD, yOf(i0) + PAD]);
    };
    if (groups[0]!.visible && inMat(X.M1)) matrix(X.M1, idt, 'Id − T');
    else if (groups[1]!.visible && inMat(X.M2)) matrix(X.M2, invAt, 'the inverse of Id − T');
    else if (groups[2]!.visible && Math.abs(wx - X.E) < W && Math.abs(wy - CY) <= S / 2) vector(E, X.E, 'E');
    else if (groups[3]!.visible && Math.abs(wx - X.L) < W && Math.abs(wy - CY) <= S / 2) vector(L, X.L, 'L');
    else panel.visible = mark.visible = zt.visible = false;
  });
}

if (SHOW === 'camera' || SHOW === 'cmatrix') {
  const CMAT = SHOW === 'cmatrix';
  stage.duration = 1;
  const NN = 3 * N;
  const CAM_PIX = 16; // pinhole-camera's
  const ROWS = 3 * CAM_PIX;
  const TINT: RGB[] = [[0.85, 0.36, 0.28], [0.45, 0.72, 0.38], [0.42, 0.62, 0.86]];
  const hexOfTint = (c: number, b = 1) => new THREE.Color().setRGB(...(TINT[c]!.map((t) => Math.min(1, t * b)) as RGB), THREE.LinearSRGBColorSpace).getHex();
  // L: (Id - T)^{-1} E for the beam, off the baked inverse.
  let INV: (Float32Array | Float64Array)[] | null = null;
  try {
    const res = await fetch(new URL('discrete-inverse.bin', document.baseURI));
    if (res.ok) INV = unpackInverses(await res.arrayBuffer());
  } catch {
    // solve instead
  }
  const E = sourceE('beam');
  const L = [0, 1, 2].map((c) => {
    if (!INV) return solve(T, c, E[c]!);
    const out = new Float64Array(N);
    for (let j = 0; j < N; j++) if (E[c]![j]) for (let r = 0; r < N; r++) out[r]! += INV[c]![r * N + j]! * E[c]![j]!;
    return out;
  });
  // The camera (pinhole-camera's): pixel j's ray leaves the pinhole into the room.
  const PIN = v(-3.5, -1.3);
  const AIM = (22 * Math.PI) / 180;
  const DEPTH = 0.8;
  const WIDTH = 1.6;
  const rayOf = (j: number) => {
    const off = -WIDTH / 2 + (WIDTH * (j + 0.5)) / CAM_PIX; // across the sensor, as pinhole-camera numbers them: pixel 0 looks left of the aim
    const a = AIM - Math.atan2(off, DEPTH);
    return v(Math.cos(a), Math.sin(a));
  };
  // A lens camera (camera-cartoon's): LENS_K rays per pixel, through points across a lens APERTURE wide at
  // the pinhole's place, all meeting where the pixel's chief ray meets the plane in focus, FOCUS ahead.
  const APERTURE = 0.3;
  const LENS_K = 6;
  const FOCUS = 4.5;
  const fwd = v(Math.cos(AIM), Math.sin(AIM));
  const across = v(-Math.sin(AIM), Math.cos(AIM));
  /** Each pixel's row of C (the same in each colour block): its nonzero entries, [column within the block, value]. */
  const camRows = Array.from({ length: CAM_PIX }, (_, j) => {
    const w = rayOf(j);
    const Q = add(PIN, w, FOCUS / (w.x * fwd.x + w.y * fwd.y));
    const m = new Map<number, number>();
    for (let k = 0; k < LENS_K; k++) {
      const a = add(PIN, across, -APERTURE / 2 + ((k + 0.5) * APERTURE) / LENS_K);
      const d0 = sub(Q, a);
      const dl = Math.hypot(d0.x, d0.y);
      const d = v(d0.x / dl, d0.y / dl);
      const p = castPiece(a, d);
      if (p < 0) continue;
      const k2 = sectorOf(p, v(-d.x, -d.y));
      if (k2 < 0) continue;
      m.set(index(p, k2), (m.get(index(p, k2)) ?? 0) + 1 / LENS_K);
    }
    return [...m.entries()].sort((x, y) => x[0] - y[0]);
  });
  const pixel = (j: number): RGB => [0, 1, 2].map((c) => camRows[j]!.reduce((acc, [col, w]) => acc + w * L[c]![col]!, 0)) as RGB;
  // Tone as the pictures are: by brightness, keeping hue, exposure from the 90th percentile of the pixels.
  const lumOf = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const ys = Array.from({ length: CAM_PIX }, (_, j) => lumOf(...pixel(j))).filter((y) => y > 0).sort((a, b) => a - b);
  const expose = ys[Math.floor(ys.length * 0.9)]! * 1.2 || 1;
  const toned = (rgb: RGB): RGB => {
    const Y = lumOf(...rgb) / expose;
    const k = Y > 0 ? (1 - Math.exp(-Y)) / Y / expose : 0;
    return rgb.map((x) => Math.min(1, x * k)) as RGB;
  };

  // --- Layout --------------------------------------------------------------------------
  const G = CMAT ? { x0: -4.9, x1: 4.9 } : { x0: -5.0, x1: 0.75 }; // C's columns
  const CM = CMAT ? { y1: 1.75, y0: -1.75 } : { y1: 0.8, y0: -0.8 }; // C's rows, top to bottom
  const LCOL = { x: 1.3, w: 0.3, y1: 2.45, y0: -2.45 }; // L, a tall column beside C
  const PCOL = { x: 2.85, w: 0.75 }; // C L, drawn as the image itself: its pixels in their colours, as tall as C
  const yOfL = (i: number) => LCOL.y1 - ((i + 0.5) / NN) * (LCOL.y1 - LCOL.y0);
  const xOfCol = (i: number) => G.x0 + ((i + 0.5) / NN) * (G.x1 - G.x0);
  const yOfRow = (r: number) => CM.y1 - ((r + 0.5) / ROWS) * (CM.y1 - CM.y0);
  const groups = [new THREE.Group(), new THREE.Group(), new THREE.Group(), new THREE.Group()];
  groups.forEach((g) => stage.add(g));
  const frame = (g: THREE.Group, x0: number, y0: number, x1: number, y1: number) =>
    g.add(polyline([[x0, y0, 0.01], [x1, y0, 0.01], [x1, y1, 0.01], [x0, y1, 0.01], [x0, y0, 0.01]], { color: C.slate, width: 1.5 }));
  const tex = (data: Uint8Array, w: number, h: number) => {
    const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
    t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  };
  const put = (data: Uint8Array, o: number, hex: number) => {
    data[o] = (hex >> 16) & 255;
    data[o + 1] = (hex >> 8) & 255;
    data[o + 2] = hex & 255;
    data[o + 3] = 255;
  };
  // L, as a column (top to bottom: the R block, G, B).
  {
    const lv: number[] = [];
    for (const f of L) for (const x of f) if (x > 0) lv.push(x);
    lv.sort((a, b) => a - b);
    const qL = lv[Math.floor(lv.length * 0.7)]! || 1;
    const PX = 456;
    const data = new Uint8Array(PX * 4);
    for (let r = 0; r < PX; r++) {
      const i0 = Math.floor((r * NN) / PX);
      const i1 = Math.floor(((r + 1) * NN) / PX);
      let acc = 0;
      let c = 0;
      for (let i = i0; i < i1; i++) {
        c = Math.floor(i / N);
        acc += L[c]![i - c * N]! / (i1 - i0);
      }
      put(data, (PX - 1 - r) * 4, hexOfTint(c, 1.15 * (1 - Math.exp(-acc / qL))));
    }
    const m = new THREE.Mesh(new THREE.PlaneGeometry(LCOL.w, LCOL.y1 - LCOL.y0), new THREE.MeshBasicMaterial({ map: tex(data, 1, PX) }));
    m.position.set(LCOL.x, (LCOL.y0 + LCOL.y1) / 2, 0);
    groups[0]!.add(m);
    frame(groups[0]!, LCOL.x - LCOL.w / 2, LCOL.y0, LCOL.x + LCOL.w / 2, LCOL.y1);
  }
  // C: a dot per row, at the column its pixel reads.
  {
    frame(groups[1]!, G.x0, CM.y0, G.x1, CM.y1);
    for (let c = 0; c < 3; c++)
      for (let j = 0; j < CAM_PIX; j++)
        for (const [col] of camRows[j]!) {
          const d = new THREE.Mesh(new THREE.CircleGeometry(CMAT ? 0.032 : 0.028, 12), flat(hexOfTint(c, 1.1)));
          d.position.set(xOfCol(c * N + col), yOfRow(c * CAM_PIX + j), 0.02);
          groups[1]!.add(d);
        }
  }
  // = C L, drawn as what it is: the image, each pixel's three numbers as its colour (Steve: "just draw CL as the
  // correctly coloured nice pixel image").
  const yOfPix = (j: number) => CM.y1 - ((j + 0.5) / CAM_PIX) * (CM.y1 - CM.y0);
  {
    groups[2]!.add(label('=', { size: 0.4, color: C.bone, anchorX: 'center', anchorY: 'middle', position: [(LCOL.x + LCOL.w / 2 + PCOL.x - PCOL.w / 2) / 2, (CM.y0 + CM.y1) / 2, 0] }));
    const data = new Uint8Array(CAM_PIX * 4);
    for (let j = 0; j < CAM_PIX; j++) put(data, (CAM_PIX - 1 - j) * 4, new THREE.Color().setRGB(...toned(pixel(j)), THREE.LinearSRGBColorSpace).getHex());
    const t = tex(data, 1, CAM_PIX);
    t.magFilter = THREE.NearestFilter;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(PCOL.w, CM.y1 - CM.y0), new THREE.MeshBasicMaterial({ map: t }));
    m.position.set(PCOL.x, (CM.y0 + CM.y1) / 2, 0);
    groups[2]!.add(m);
    frame(groups[2]!, PCOL.x - PCOL.w / 2, CM.y0, PCOL.x + PCOL.w / 2, CM.y1);
  }
  // --- Building with the deck: on arrival L and C; then = the image. Alone: C only (cmatrix). ---
  const setShown = (n: number) => groups.forEach((g, k) => (g.visible = CMAT ? k === 1 : k <= n + 1));
  setShown(window.parent !== window ? 0 : 1);
  window.addEventListener('message', (e) => {
    const d = e.data as { deck?: string; shown?: number } | null;
    if (d?.deck === 'step' && typeof d.shown === 'number') setShown(d.shown);
  });
  window.parent?.postMessage({ demo: 'ready' }, '*');

  // --- Hover a row of C --------------------------------------------------------------------
  const canvas = stage.renderer.domElement;
  const rowAt = (wy: number) => Math.max(0, Math.min(ROWS - 1, Math.floor(((CM.y1 - wy) / (CM.y1 - CM.y0)) * ROWS)));
  if (!CMAT) {
    // Up from each of its entries to the light it reads, across to the pixel it fills.
    const ups = new THREE.Group();
    const acrossLine = polyline(Array.from({ length: 5 }, () => [0, 0, 0] as [number, number, number]), { color: C.bone, width: 2.5 });
    const rowBand = polyline([[0, 0, 0], [0, 0, 0]], { color: C.rust, width: 1.5, opacity: 0.8 });
    const info = label('', { size: 0.14, color: C.bone, anchorX: 'left', anchorY: 'bottom', position: [0, 0, 0.3] });
    stage.add(ups, acrossLine, rowBand, info);
    const hide = () => (ups.visible = acrossLine.visible = rowBand.visible = info.visible = false);
    hide();
    canvas.addEventListener('pointermove', (e) => {
      const rr = canvas.getBoundingClientRect();
      const wx = (((e.clientX - rr.left) / rr.width) * 2 - 1) * HALF_W;
      const wy = -(((e.clientY - rr.top) / rr.height) * 2 - 1) * ORTHO_H;
      if (!groups[1]!.visible || wx < G.x0 || wx > G.x1 || wy < CM.y0 || wy > CM.y1) return hide();
      const r = rowAt(wy);
      const c = Math.floor(r / CAM_PIX);
      const j = r - c * CAM_PIX;
      const y = yOfRow(r);
      setPolyline(rowBand, [[G.x0, y, 0.03], [G.x1, y, 0.03]]);
      while (ups.children.length) ups.remove(ups.children[0]!);
      for (const [col] of camRows[j]!) {
        const x = xOfCol(c * N + col);
        const yl = yOfL(c * N + col);
        // The entry of C, to the entry of L it multiplies, to the pixel the products add into.
        ups.add(polyline([[x, y, 0.03], [LCOL.x - LCOL.w / 2, yl, 0.03]], { color: C.bone, width: 1.2 }));
        if (groups[2]!.visible) ups.add(polyline([[LCOL.x + LCOL.w / 2, yl, 0.03], [PCOL.x - PCOL.w / 2, yOfPix(j), 0.03]], { color: C.bone, width: 1.2, opacity: 0.7 }));
        const mk = new THREE.Mesh(new THREE.PlaneGeometry(LCOL.w + 0.08, 0.035), flat(C.bone));
        mk.position.set(LCOL.x, yl, 0.04);
        ups.add(mk);
      }
      setPolyline(acrossLine, [[PCOL.x - PCOL.w / 2, yOfPix(j) + 0.5 * ((CM.y1 - CM.y0) / CAM_PIX), 0.05], [PCOL.x + PCOL.w / 2, yOfPix(j) + 0.5 * ((CM.y1 - CM.y0) / CAM_PIX), 0.05], [PCOL.x + PCOL.w / 2, yOfPix(j) - 0.5 * ((CM.y1 - CM.y0) / CAM_PIX), 0.05], [PCOL.x - PCOL.w / 2, yOfPix(j) - 0.5 * ((CM.y1 - CM.y0) / CAM_PIX), 0.05], [PCOL.x - PCOL.w / 2, yOfPix(j) + 0.5 * ((CM.y1 - CM.y0) / CAM_PIX), 0.05]]); // the pixel, outlined
      rowBand.visible = ups.visible = info.visible = true;
      acrossLine.visible = groups[2]!.visible;
      info.position.set(G.x0 + 0.05, CM.y1 + 0.12, 0.3);
      const val = pixel(j)[c]!;
      const n = camRows[j]!.length;
      setText(info, `pixel ${j + 1} (${'RGB'[c]}): ${n} nonzero ${n === 1 ? 'entry' : 'entries'} (its ${LENS_K} rays through the lens); against L: ${val < 0.001 ? val.toExponential(1) : val.toFixed(4)}`);
    });
  } else {
    // The magnifier: 5 rows by 7 columns of C's entries, centred on the nonzero nearest the pointer in its row.
    const cv = document.createElement('canvas');
    cv.width = 1120;
    cv.height = 800;
    const ctx = cv.getContext('2d')!;
    const ztex = new THREE.CanvasTexture(cv);
    ztex.colorSpace = THREE.SRGBColorSpace;
    const ZW = 2.8;
    const ZH = 2.0;
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(ZW, ZH), new THREE.MeshBasicMaterial({ map: ztex, transparent: true }));
    const mark = polyline(Array.from({ length: 5 }, () => [0, 0, 0] as [number, number, number]), { color: C.bone, width: 2 });
    const zt = label('', { size: 0.13, color: C.ash, anchorX: 'center', anchorY: 'bottom', position: [0, 0, 0.3] });
    zt.textAlign = 'center';
    stage.add(panel, mark, zt);
    const fmt = (x: number) => (x === 0 ? '0' : x.toFixed(3).replace(/^0\./, '.'));
    const entry = (R: number, Cc: number) => {
      const c = Math.floor(R / CAM_PIX);
      if (Math.floor(Cc / N) !== c) return 0;
      const hit = camRows[R - c * CAM_PIX]!.find(([col]) => col === Cc - c * N);
      return hit ? hit[1] : 0;
    };
    function zoom(R0: number, C0: number): void {
      const rows = 5;
      const cols = 7;
      ctx.clearRect(0, 0, cv.width, cv.height);
      const cw = cv.width / cols;
      const ch = cv.height / rows;
      ctx.fillStyle = 'rgba(14,14,14,0.96)';
      ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.strokeStyle = '#d9d1c2';
      ctx.lineWidth = 3;
      ctx.strokeRect(1.5, 1.5, cv.width - 3, cv.height - 3);
      ctx.font = `${Math.round(ch * 0.3)}px Menlo, ui-monospace, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let i = 0; i < rows; i++)
        for (let k = 0; k < cols; k++) {
          const val = entry(R0 + i, C0 + k);
          const c = Math.floor((R0 + i) / CAM_PIX);
          ctx.fillStyle = val === 0 ? '#5b636b' : `#${new THREE.Color(hexOfTint(c, 1.3)).getHexString()}`;
          ctx.fillText(fmt(val), (k + 0.5) * cw, (i + 0.5) * ch);
        }
      ztex.needsUpdate = true;
      const x0 = xOfCol(C0) - 0.05;
      const x1 = xOfCol(C0 + cols - 1) + 0.05;
      const y1 = yOfRow(R0) + 0.06;
      const y0 = yOfRow(R0 + rows - 1) - 0.06;
      setPolyline(mark, [[x0, y0, 0.25], [x1, y0, 0.25], [x1, y1, 0.25], [x0, y1, 0.25], [x0, y0, 0.25]]);
      let px = (x0 + x1) / 2;
      px = Math.max(-HALF_W + ZW / 2 + 0.1, Math.min(HALF_W - ZW / 2 - 0.1, px));
      let py = y1 + 0.3 + ZH / 2;
      if (py + ZH / 2 > ORTHO_H - 0.3) py = y0 - 0.3 - ZH / 2;
      panel.position.set(px, py, 0.2);
      zt.position.set(px, py + ZH / 2 + 0.05, 0.3);
      setText(zt, `C, rows ${R0 + 1}–${R0 + rows}, columns ${C0 + 1}–${C0 + cols}`);
    }
    const show = (r: number, wantCol: number) => {
      const c = Math.floor(r / CAM_PIX);
      const j = r - c * CAM_PIX;
      // The nonzero in this row nearest the pointer (every row has some: the camera's rays all land).
      let best = wantCol;
      let bd = Infinity;
      for (const [col] of camRows[j]!) {
        const d = Math.abs(c * N + col - wantCol);
        if (d < bd) {
          bd = d;
          best = c * N + col;
        }
      }
      zoom(Math.max(0, Math.min(ROWS - 5, r - 2)), Math.max(0, Math.min(NN - 7, best - 3)));
    };
    show(CAM_PIX + Math.floor(CAM_PIX / 2), N + (camRows[Math.floor(CAM_PIX / 2)]![0]?.[0] ?? 0));
    canvas.addEventListener('pointermove', (e) => {
      const rr = canvas.getBoundingClientRect();
      const wx = (((e.clientX - rr.left) / rr.width) * 2 - 1) * HALF_W;
      const wy = -(((e.clientY - rr.top) / rr.height) * 2 - 1) * ORTHO_H;
      if (wx < G.x0 || wx > G.x1 || wy < CM.y0 || wy > CM.y1) return;
      show(rowAt(wy), Math.floor(((wx - G.x0) / (G.x1 - G.x0)) * NN));
    });
  }
}

if (SHOW === 'row') {
  const SCALE = 0.45;
  const ROOM_AT = { x: -2.75, y: -0.05 };
  const room = new THREE.Group();
  room.position.set(ROOM_AT.x, ROOM_AT.y, 0);
  room.scale.setScalar(SCALE);
  stage.add(room);
  drawPieces(room, () => C.slate, 4);
  // The matrix: a faint dot per nonzero entry.
  const S = 456;
  const f = N / S;
  const data = new Uint8Array(S * S * 4);
  for (let i = 0; i < S * S; i++) data[i * 4 + 3] = 255;
  for (let r = 0; r < N; r++)
    for (const c of T.cols[r]!) {
      const o = ((S - 1 - Math.floor(r / f)) * S + Math.floor(c / f)) * 4;
      data[o] = 92;
      data[o + 1] = 104;
      data[o + 2] = 116;
    }
  const tex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  const M = { cx: 2.75, cy: -0.05, s: 4.3 };
  const mat = new THREE.Mesh(new THREE.PlaneGeometry(M.s, M.s), new THREE.MeshBasicMaterial({ map: tex }));
  mat.position.set(M.cx, M.cy, 0);
  stage.add(mat);
  const ML = M.cx - M.s / 2;
  const MT = M.cy + M.s / 2;
  stage.add(polyline([[ML, MT, 0.01], [ML + M.s, MT, 0.01], [ML + M.s, MT - M.s, 0.01], [ML, MT - M.s, 0.01], [ML, MT, 0.01]], { color: C.slate, width: 1.5 }));
  const nnz = T.cols.reduce((a, c) => a + c.length, 0);
  stage.add(label(`T: ${N.toLocaleString('en-US')} × ${N.toLocaleString('en-US')}, ${((100 * (N * N - nnz)) / (N * N)).toFixed(1)}% zeros`, { size: 0.17, color: C.ash, anchorX: 'center', anchorY: 'top', position: [M.cx, MT - M.s - 0.12, 0] }));
  // The chosen row: a band across the matrix, and its entries as dots.
  const band = polyline([[0, 0, 0], [0, 0, 0]], { color: C.rust, width: 2 });
  stage.add(band);
  const dots = new THREE.Group();
  stage.add(dots);
  // In the room: the row's piece and direction, and the lines back to where its light comes from.
  const lines = new THREE.Group();
  room.add(lines);
  const caption = label('', { size: 0.2, color: C.bone, anchorX: 'center', anchorY: 'top', position: [ROOM_AT.x, ROOM_AT.y - ROOM_HALF.y * SCALE - 0.2, 0] });
  const caption2 = label('', { size: 0.16, color: C.ash, anchorX: 'center', anchorY: 'top', position: [ROOM_AT.x, ROOM_AT.y - ROOM_HALF.y * SCALE - 0.52, 0] });
  stage.add(caption, caption2);
  const mid = (i: number) => add(pieces[i]!.a, sub(pieces[i]!.b, pieces[i]!.a), 0.5);
  const near = (name: string, at: Vec, mirrorFront = true) => {
    let best = -1;
    let bd = Infinity;
    pieces.forEach((p, i) => {
      if (p.name !== name) return;
      if (p.kind === 'mirror' && (i % 2 === 0) !== mirrorFront) return;
      const d = Math.hypot(mid(i).x - at.x, mid(i).y - at.y);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  };
  const EXAMPLES = [
    { piece: near('white wall', v(-1.5, -2.8)), k: 5, what: 'the floor', how: 'matte: light from everything it can see' },
    { piece: near('flat mirror', v(1.3, -0.85), true), k: 3, what: 'the flat mirror', how: 'a mirror: light from one direction' },
    { piece: near('green wall', v(5.2, 0.4)), k: 7, what: 'the green wall', how: 'matte: light from everything it can see' },
  ];
  function showRow(ex: (typeof EXAMPLES)[number]): void {
    const p = ex.piece;
    const row = index(p, ex.k);
    for (const g of [lines, dots]) while (g.children.length) g.remove(g.children[0]!);
    // The matrix: the band and the entries.
    const y = MT - ((row + 0.5) / N) * M.s;
    setPolyline(band, [[ML - 0.12, y, 0.02], [ML + M.s + 0.12, y, 0.02]]);
    const cs = T.cols[row]!;
    const vs = T.vals[row]!;
    const vmax = Math.max(...vs, 1e-12);
    cs.forEach((c, e) => {
      const d = new THREE.Mesh(new THREE.CircleGeometry(0.035 + 0.035 * Math.sqrt(vs[e]! / vmax), 16), flat(C.ochre));
      d.position.set(ML + ((c + 0.5) / N) * M.s, y, 0.03);
      dots.add(d);
    });
    // The room: where each entry's light comes from, a line back to that piece.
    const m0 = mid(p);
    const from = new Set<number>();
    cs.forEach((c, e) => {
      const j = Math.floor(c / HALF);
      from.add(j);
      const op = 0.25 + 0.75 * Math.sqrt(vs[e]! / vmax);
      lines.add(polyline([P3(m0, 0.02), P3(mid(j), 0.02)], { color: C.ochre, width: 1.5, opacity: Math.min(1, op) }));
    });
    for (const j of from) lines.add(polyline([P3(pieces[j]!.a, 0.03), P3(pieces[j]!.b, 0.03)], { color: C.ochre, width: 6 }));
    // The row's own piece, and the direction leaving it (its sector, as a wedge).
    lines.add(polyline([P3(pieces[p]!.a, 0.05), P3(pieces[p]!.b, 0.05)], { color: C.rust, width: 9 }));
    const n = pieces[p]!.n;
    const base = Math.atan2(n.y, n.x) - Math.PI / 2;
    const a0 = base + (Math.PI * ex.k) / HALF;
    const a1 = a0 + Math.PI / HALF;
    const R = 1.6;
    const pos = [m0.x, m0.y, 0.04];
    for (let s2 = 0; s2 <= 6; s2++) {
      const a = a0 + ((a1 - a0) * s2) / 6;
      pos.push(m0.x + R * Math.cos(a), m0.y + R * Math.sin(a), 0.04);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(Array.from({ length: 6 }, (_, s2) => [0, s2 + 1, s2 + 2]).flat());
    lines.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: C.rust, transparent: true, opacity: 0.75 })));
    setText(caption, `one row: a piece of ${ex.what}, one direction leaving it`);
    setText(caption2, `${ex.how}: ${cs.length} of ${N.toLocaleString('en-US')} entries nonzero`);
  }
  const HOLD = 5; // seconds per example
  stage.duration = HOLD * EXAMPLES.length;
  let shown = -1;
  stage.frame((t) => {
    const k = Math.floor(t / HOLD) % EXAMPLES.length;
    if (k !== shown) {
      shown = k;
      showRow(EXAMPLES[k]!);
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
  const params = { source: (['ray', 'patch'].includes(q.get('source') ?? '') ? q.get('source') : 'beam') as 'beam' | 'ray' | 'patch' };
  const MATCH = q.has('match');
  const SCALE = MATCH ? 0.38 : 0.44;
  const PANELS = MATCH ? [{ x: -2.75, y: 0 }, { x: 2.75, y: 0 }] : [{ x: -2.72, y: -0.15 }, { x: 2.72, y: -0.15 }];
  let INV: Float32Array[] | null = null;
  if (MATCH)
    try {
      const res = await fetch(new URL('discrete-inverse.bin', document.baseURI));
      if (res.ok) INV = unpackInverses(await res.arrayBuffer());
    } catch {
      // solve instead
    }
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
  if (MATCH) {
    // The arrow of equilibrium-room's invert picture.
    const x0 = PANELS[0]!.x + ROOM_HALF.x * SCALE + 0.18;
    const x1 = PANELS[1]!.x - ROOM_HALF.x * SCALE - 0.18;
    stage.add(polyline([[x0, 0, 0], [x1, 0, 0]], { color: C.bone, width: 3 }));
    stage.add(polyline([[x1 - 0.14, 0.11, 0], [x1, 0, 0], [x1 - 0.14, -0.11, 0]], { color: C.bone, width: 3 }));
  } else stage.add(polyline([[-0.26, PANELS[0]!.y, 0], [0.12, PANELS[0]!.y, 0]], { color: 0x8fb5d6, width: 3 }), arrowHead);
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
  /** Tone mapping by brightness, keeping the hue (as the traced pictures do: beamroom.ts fluenceMesh). */
  const lumOf = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  function fillImage(F: Float32Array, expose: number): THREE.Mesh {
    const data = new Uint8Array(GW * GH * 4);
    for (let j = 0; j < GH; j++)
      for (let i = 0; i < GW; i++) {
        if (Number.isNaN(F[(j * GW + i) * 3]!)) continue;
        const s = [0, 1, 2].map((ch) => F[(j * GW + i) * 3 + ch]!);
        const o = (j * GW + i) * 4;
        const Y = lumOf(s[0]!, s[1]!, s[2]!) / expose;
        const k = Y > 0 ? (1 - Math.exp(-Y)) / Y / expose : 0;
        const rgb = s.map((y) => Math.min(1, y * k)) as RGB;
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
    const L = INV
      ? [0, 1, 2].map((c) => {
          const out = new Float64Array(N);
          for (let j = 0; j < N; j++) if (E[c]![j]) for (let r = 0; r < N; r++) out[r]! += INV![c]![r * N + j]! * E[c]![j]!;
          return out;
        })
      : [0, 1, 2].map((c) => solve(T, c, E[c]!));
    const ms = performance.now() - t0;
    // Exposure as the traced pictures set it (beamroom.ts exposureOf): the 90th percentile of the lit cells' brightness, times 1.2.
    const fills = [fillOf(E), fillOf(L)];
    const lum: number[] = [];
    for (let k = 0; k < GW * GH; k++) {
      const Y = lumOf(fills[1]![k * 3]!, fills[1]![k * 3 + 1]!, fills[1]![k * 3 + 2]!);
      if (Y > 0) lum.push(Y);
    }
    lum.sort((a, b) => a - b);
    const expose = lum[Math.floor(lum.length * 0.9)]! * 1.2 || 1;
    // The walls in the light leaving them, scaled by a bright-but-ordinary wall (the 90th percentile, as beamroom.ts L_REF).
    const wallY = pieces
      .map((pc, i) => {
        if (pc.kind !== 'matte') return 0;
        let y = 0;
        for (let k = 0; k < HALF; k++) y += lumOf(L[0]![index(i, k)]!, L[1]![index(i, k)]!, L[2]![index(i, k)]!) / HALF;
        return y;
      })
      .filter((y) => y > 0)
      .sort((a, b) => a - b);
    const wallRef = wallY[Math.floor(wallY.length * 0.9)]! || 1;
    [E, L].forEach((F, n) => {
      const g = groups[n]!;
      if (MATCH && n === 0) {
        // E signified, not drawn: the dark room and a white rectangle in the lamp (as equilibrium-room &emitter).
        const at = (a: number, nn: number) => add(add(SOURCE.center, SOURCE.axis, a), v(-SOURCE.axis.y, SOURCE.axis.x), nn);
        const quad = (a0: number, a1: number, h: number, opacity: number, z: number) => {
          const pts = [at(a0, -h), at(a1, -h), at(a1, h), at(a0, h)];
          const geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.Float32BufferAttribute(pts.flatMap((pp) => [pp.x, pp.y, z]), 3));
          geo.setIndex([0, 1, 2, 0, 2, 3]);
          return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: opacity < 1, opacity }));
        };
        const lamp = new THREE.Group();
        lamp.add(quad(-0.22, 0.16, 0.86, 0.18, 0.04), quad(-0.12, 0.12, 0.72, 1, 0.05));
        g.add(lamp);
        dynamic.push(lamp);
      } else {
        const img = fillImage(fills[n]!, expose);
        g.add(img);
        dynamic.push(img);
      }
      const lines = new THREE.Group();
      drawPieces(lines, (i) => {
        if (isSource(i)) return 0xffffff;
        const p = pieces[i]!;
        const s = [0, 1, 2].map((c) => {
          let t = 0;
          for (let k = 0; k < HALF; k++) t += F[c]![index(i, k)]!;
          return Math.min(1, t / HALF / wallRef);
        }) as RGB;
        // A mirror shows what it reflects, both sides; draw it as the brighter side.
        if (p.kind === 'mirror') return C.bone;
        return Math.max(...s) < 0.02 ? C.slateDeep : hexOf(s);
      }, 6);
      g.add(lines);
      dynamic.push(lines);
    });
    if (!MATCH) setText(note, `solved by Gaussian elimination on Id − T, ${N.toLocaleString('en-US')} × ${N.toLocaleString('en-US')}, three times (once per colour): ${Math.round(ms)} ms`);
  }
  show();
  ui.params.add(params, 'source', ['beam', 'ray', 'patch']).onChange(show);
}

stage.start();
