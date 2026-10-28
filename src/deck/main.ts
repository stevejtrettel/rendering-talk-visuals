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
  sections[current]?.classList.remove('current');
  current = i;
  sections[current].classList.add('current');
  document.title = `${current + 1} / ${slides.length}`;
  history.replaceState(null, '', `#${current + 1}`);
}

const fromHash = () => show(Number(location.hash.slice(1) || 1) - 1);

window.addEventListener('hashchange', fromHash);
window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  switch (e.key) {
    case 'ArrowRight':
    case 'PageDown':
      show(current + 1);
      break;
    case 'ArrowLeft':
    case 'PageUp':
      show(current - 1);
      break;
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
