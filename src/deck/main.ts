/**
 * The talk deck (notes/deck.md). Renders talk/slides.md into the 16:9 frame
 * and pages through it. The URL hash is the 1-indexed slide number, so a
 * reload keeps its place and a screenshot can ask for any one slide.
 */

import 'katex/dist/katex.min.css';
import './deck.css';
import source from '../../talk/slides.md?raw';
import { parseSlides } from './slides';

const frame = document.getElementById('frame') as HTMLElement;
const errEl = document.getElementById('err') as HTMLPreElement;

const slides = parseSlides(source);
const sections = slides.map(({ html }) => {
  const el = document.createElement('section');
  el.className = 'slide';
  el.innerHTML = html;
  // Markdown wraps an embed in a paragraph of its own; unwrap it, so layout
  // can see the embed as a direct child of the slide.
  for (const embed of el.querySelectorAll('.embed')) {
    const p = embed.parentElement;
    if (p?.tagName === 'P' && p.childNodes.length === 1) p.replaceWith(embed);
  }
  frame.appendChild(el);
  return el;
});

let current = -1;

function show(i: number) {
  i = Math.max(0, Math.min(slides.length - 1, i));
  if (i === current) return;
  if (sections[current]) {
    sections[current].classList.remove('current');
    unmount(sections[current]);
  }
  current = i;
  sections[current].classList.add('current');
  mount(sections[current]);
  document.title = `${current + 1} / ${slides.length}`;
  history.replaceState(null, '', `#${current + 1}`);
}

// --- embeds -----------------------------------------------------------------
// An embed exists only while its slide is up: at most one live page at a time,
// and every visit starts from that page's initial state (notes/deck.md).

function mount(slide: HTMLElement) {
  for (const holder of slide.querySelectorAll<HTMLElement>('.embed[data-src]')) {
    const src = holder.dataset.src!;
    if (holder.dataset.kind === 'video') {
      const video = document.createElement('video');
      Object.assign(video, { src, autoplay: true, loop: true, muted: true, playsInline: true });
      holder.appendChild(video);
    } else {
      const iframe = document.createElement('iframe');
      iframe.src = src;
      iframe.addEventListener('load', () => {
        adopt(iframe);
        if (holder.dataset.controls) void lensControls(holder, iframe, holder.dataset.controls.split(/\s+/));
      });
      holder.appendChild(iframe);
    }
  }
}

function unmount(slide: HTMLElement) {
  for (const holder of slide.querySelectorAll<HTMLElement>('.embed[data-src]')) holder.replaceChildren();
}

/**
 * The embed is same-origin, so the deck can listen on its window directly. A
 * capture-phase listener on `window` runs before anything the page itself
 * registered, so the paging keys are taken here and the page never sees them —
 * the clicker still works after a click into the lab to orbit.
 */
function adopt(iframe: HTMLIFrameElement) {
  const win = iframe.contentWindow;
  if (!win) return;
  // A light-field page starts with its chrome hidden: this is the class its
  // own `h` key toggles, so `h` still brings the chrome back on stage.
  if (iframe.parentElement?.dataset.src?.startsWith('lightfield/')) {
    win.document.body.classList.add('talk-mode');
    // Its own background is a dark grey, which shows around a letterboxed film.
    win.document.body.style.background = '#000';
  }
  win.addEventListener('keydown', (e) => {
    if (!pagingKey(e)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);
  // A live slide is there to be driven: its keys work on arrival, without a
  // click into it first. Paging still works, from the listener above.
  win.focus();
}

/** What a light-field film page publishes for the deck (light-field docs/23). */
interface Lens {
  ready: Promise<void>;
  free(): void;
  [control: string]: unknown;
}
interface LensControl {
  min: number;
  max: number;
  get(): number;
  set(v: number): void;
}

/**
 * Sliders on the slide, drawn by the deck in the deck's style and wired to
 * the page's window.__lens. The page publishes it after its async WebGPU
 * init, so wait for it; then put the page in free camera, which is the only
 * camera the lens drives.
 */
async function lensControls(holder: HTMLElement, iframe: HTMLIFrameElement, names: string[]) {
  const win = iframe.contentWindow as (Window & { __lens?: Lens }) | null;
  while (iframe.isConnected && !win?.__lens) await new Promise((r) => setTimeout(r, 50));
  if (!iframe.isConnected || !win?.__lens) return;
  const lens = win.__lens;
  await lens.ready;
  if (!iframe.isConnected) return;
  lens.free();

  const row = document.createElement('div');
  row.className = 'controls';
  const live: { input: HTMLInputElement; control: LensControl }[] = [];
  for (const name of names) {
    const control = lens[name] as LensControl | undefined;
    if (!control) {
      console.warn(`deck: this page has no lens control "${name}"`);
      continue;
    }
    const label = document.createElement('label');
    const input = document.createElement('input');
    Object.assign(input, { type: 'range', min: control.min, max: control.max, step: (control.max - control.min) / 1000 });
    input.addEventListener('input', () => control.set(Number(input.value)));
    // Hand the keyboard back to the page, so a slider never holds focus and
    // the page's keys (and an arrow key's paging) keep working.
    input.addEventListener('change', () => win.focus());
    label.append(name, input);
    row.appendChild(label);
    live.push({ input, control });
  }
  holder.appendChild(row);

  // The page can move a value too (autofocus follows the screen centre as
  // you fly), so the sliders follow the page, except the one being dragged.
  const follow = () => {
    if (!iframe.isConnected) return;
    for (const { input, control } of live) if (!input.matches(':active')) input.value = String(control.get());
    requestAnimationFrame(follow);
  };
  follow();
}

// --- keys -------------------------------------------------------------------
// The deck owns paging, everywhere. Everything else belongs to the embed, so
// the deck's other keys only act when focus is in the deck itself.

/** Act on a paging key; false if it is not one. */
function pagingKey(e: KeyboardEvent): boolean {
  if (e.metaKey || e.ctrlKey || e.altKey) return false;
  if (e.key === 'ArrowRight' || e.key === 'PageDown') show(current + 1);
  else if (e.key === 'ArrowLeft' || e.key === 'PageUp') show(current - 1);
  else return false;
  return true;
}

const fromHash = () => show(Number(location.hash.slice(1) || 1) - 1);

window.addEventListener('hashchange', fromHash);
window.addEventListener('keydown', (e) => {
  if (pagingKey(e)) return e.preventDefault();
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  switch (e.key) {
    case 'Home':
      show(0);
      break;
    case 'End':
      show(slides.length - 1);
      break;
    case 'f':
    case 'F':
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen();
      break;
    default:
      return;
  }
  e.preventDefault();
});

if (!slides.length) {
  errEl.style.display = 'grid';
  errEl.textContent = 'talk/slides.md has no slides.';
} else {
  fromHash();
}
