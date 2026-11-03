/**
 * The equilibrium as a series, in the beam room.
 *
 * (Id - T)^-1 E = E + TE + T²E + …, drawn (Steve, 2026-10-29: glow, not rays).
 * Left, one term: T^n E, the lamp's light after exactly n interactions (a
 * mirror or a wall) on its way through the room. Right, the running sum
 * E + TE + … + T^n E. Each is drawn as the room's other pictures of light are
 * (wave-room's brightness, light-field-room, equilibrium-room): the light at
 * each point, all directions together, in its colour, at one exposure, the
 * equilibrium's, shared by every panel, so the terms really do fade.
 *
 * The terms come from the same light tracing as the equilibrium
 * (src/beamroom.ts): every stretch of a photon's flight is filed under how
 * many times it has interacted since the lamp. So the sum of all the terms is
 * the computed equilibrium by construction; what the picture shows is how fast
 * it gets there. The bars and the readout measure power, the norm of the
 * slides (||T|| < 1 in total power): each term's power is the light's as it
 * sets out after n interactions, so every bar is smaller than the one before
 * (a pixel-by-pixel total of the glow would not be: it weighs light by how far
 * it flies). After BOUNCES terms the right panel takes the whole series, the
 * equilibrium itself, and the left the rest of it, every term from T^8 E on.
 *
 * Steps, not a fade: iterating is not time passing.
 */

import * as THREE from 'three';
import { createStage, createUI, C } from '@';
import { polyline } from '@/lines';
import { label, setText } from '@/text';
import { ROOM_HALF, BOUNCES, drawRoom, fluenceOf, fluenceOfBounce, powerOfBounce, exposureOf, fluenceMesh } from '@/beamroom';

const ORTHO_H = 3;
const stage = createStage({ camera: 'ortho', position: [0, 0, 10], target: [0, 0, 0], orthoHeight: ORTHO_H, lights: false, controls: false });
const ui = createUI(stage);

const exposure = exposureOf(fluenceOf('L'));
const S = 0.44;
const X = [-2.6, 2.6];
const Y0 = -0.12; // low enough to leave the deck's title a band at the top

// The empty rooms (outlines, mirrors, housing), once per panel.
const blank = new Float64Array(fluenceOf('L').length);
for (const x of X) {
  const room = new THREE.Group();
  room.scale.setScalar(S);
  room.position.set(x, Y0, 0);
  drawRoom(room, { fluence: blank, exposure, walls: false });
  stage.add(room);
}

const holder = (F: Float64Array, x: number) => {
  const m = fluenceMesh(F, exposure);
  m.position.z = -0.01;
  const g = new THREE.Group();
  g.scale.setScalar(S);
  g.position.set(x, Y0, 0);
  g.add(m);
  g.visible = false;
  stage.add(g);
  return g;
};

// The terms, and the running sums; the last running sum is the whole series.
const L = fluenceOf('L');
let LY = 0;
for (let n = 0; n <= BOUNCES; n++) LY += powerOfBounce(n);
const terms: THREE.Group[] = [];
const sums: THREE.Group[] = [];
const termY: number[] = [];
const sumY: number[] = [];
const acc = new Float64Array(L.length);
for (let n = 0; n < BOUNCES; n++) {
  const F = fluenceOfBounce(n);
  for (let i = 0; i < F.length; i++) acc[i]! += F[i]!;
  terms.push(holder(F, X[0]!));
  sums.push(holder(Float64Array.from(acc), X[1]!));
  termY.push(powerOfBounce(n));
  sumY.push((sumY[n - 1] ?? 0) + powerOfBounce(n));
}
const whole = holder(L, X[1]!);
const rest = holder(fluenceOfBounce(BOUNCES), X[0]!);

// Names over the panels, the share under the sum, the bars below.
/**
 * A one-line formula with exponents, centred at its position. The label font
 * has superscript digits only up to ³, so `T^5E` sets the 5 as its own
 * smaller, raised label, laid out once troika has measured each piece.
 */
class Formula {
  readonly group = new THREE.Group();
  private pieces: ReturnType<typeof label>[] = [];
  private text = '';
  private sups: boolean[] = [];
  constructor(private size: number, public color: number) {}
  set(text: string): void {
    if (text === this.text) return;
    this.text = text;
    for (const p of this.pieces) {
      this.group.remove(p);
      p.dispose();
    }
    const runs = text.split(/\^(\d+)/).map((t, i) => ({ t, sup: i % 2 === 1 })).filter((r) => r.t);
    const pieces = runs.map((r) =>
      label(r.t, { size: r.sup ? this.size * 0.62 : this.size, color: this.color, anchorX: 'left', anchorY: 'bottom-baseline' }),
    );
    this.pieces = pieces;
    this.sups = runs.map((r) => r.sup);
    for (const p of pieces) {
      p.visible = false;
      this.group.add(p);
    }
    this.laidOut = false;
  }
  private laidOut = true;
  /** Called every frame: once troika has measured every piece, set them in a row. */
  layout(): void {
    if (this.laidOut) return;
    const info = this.pieces.map((q) => (q as unknown as { textRenderInfo?: { blockBounds: number[] } }).textRenderInfo);
    if (info.some((x) => !x)) return;
    this.laidOut = true;
    const widths = info.map((x) => x!.blockBounds[2]! - x!.blockBounds[0]!);
    const gap = this.size * 0.03;
    const total = widths.reduce((a, w) => a + w + gap, -gap);
    let x = -total / 2;
    this.pieces.forEach((q, i) => {
      q.position.set(x, this.sups[i] ? this.size * 0.42 : 0, 0);
      q.visible = true;
      x += widths[i]! + gap;
    });
  }
}
const termName = (n: number) => (n === 0 ? 'E' : n === 1 ? 'TE' : `T^${n}E`);
const sumName = (n: number) =>
  n === 0 ? 'E' : n === 1 ? 'E + TE' : n === 2 ? 'E + TE + T^2E' : `E + TE + ⋯ + ${termName(n)}`;
const top = Y0 + ROOM_HALF.y * S + 0.25;
const leftName = new Formula(0.4, C.bone);
const rightName = new Formula(0.4, C.bone);
leftName.group.position.set(X[0]!, top, 0);
rightName.group.position.set(X[1]!, top, 0);
stage.add(leftName.group, rightName.group);
const share = label('', { size: 0.26, color: C.ash, anchorX: 'center', anchorY: 'top', position: [X[1]!, Y0 - ROOM_HALF.y * S - 0.15, 0] });
stage.add(share);

const BAR_W = 0.32;
const BAR_H = 0.75;
const BASE = -2.62;
const barX = (n: number) => X[0]! + 0.4 - ((BOUNCES - 1) * 0.45) / 2 + n * 0.45;
stage.add(polyline([[barX(0) - 0.35, BASE, 0], [barX(BOUNCES - 1) + 0.35, BASE, 0]], { color: C.slate, width: 1.5 }));
stage.add(label('the power of each term', { size: 0.2, color: C.ash, anchorX: 'left', anchorY: 'top', position: [barX(0) - 0.35, BASE - 0.08, 0] }));
const bars = termY.map((y, n) => {
  const h = (BAR_H * y) / termY[0]!;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(BAR_W, h), new THREE.MeshBasicMaterial({ color: C.ash }));
  m.position.set(barX(n), BASE + h / 2, 0);
  m.visible = false;
  stage.add(m);
  return m;
});

// --- Stepping ----------------------------------------------------------------
const LEAD = 1.0;
const PER = 1.8;
const HOLD = 3.5;
const STEPS = BOUNCES + 1; // the terms, then the whole series
stage.duration = LEAD + STEPS * PER + HOLD;
const params = { step: -1 };
ui.params.add(params, 'step', -1, STEPS - 1, 1).name('step (-1: cycle)');

let shown = -2;
stage.frame((t) => {
  leftName.layout();
  rightName.layout();
  const u = t % stage.duration;
  const k = params.step >= 0 ? params.step : Math.min(STEPS - 1, Math.max(0, Math.floor((u - LEAD) / PER)));
  if (k === shown) return;
  shown = k;
  const last = k === STEPS - 1;
  const n = Math.min(k, BOUNCES - 1);
  terms.forEach((g, i) => (g.visible = !last && i === n));
  sums.forEach((g, i) => (g.visible = !last && i === n));
  whole.visible = last;
  rest.visible = last;
  bars.forEach((b, i) => (b.visible = i <= n));
  leftName.set(last ? `${termName(BOUNCES)} + ⋯` : termName(n));
  // Amber is the deck's colour for the equilibrium: only the whole series gets it.
  rightName.color = last ? C.ochre : C.bone;
  rightName.set(last ? 'E + TE + T^2E + ⋯' : sumName(n));
  setText(share, last ? 'the equilibrium' : `${((100 * sumY[n]!) / LY).toFixed(1)}% of the equilibrium`);
});

stage.start();
