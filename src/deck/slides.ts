/**
 * talk/slides.md → slides (notes/deck.md, "Writing a slide").
 *
 * A line of `---` separates slides; a line reading `Note:` starts the speaker
 * notes. Math is `$…$` / `$$…$$`, typeset by KaTeX. An embed is written as an
 * image whose URL scheme says what it is:
 *
 *   ![](demo:radiance-2d)     this repo's demo, live
 *   ![](lightfield:lab)       a light-field page, live
 *   ![](media/x.mp4)          a looping video
 *   ![](media/x.png)          a plain image
 *
 * Live and video embeds are rendered as empty placeholders carrying their URL;
 * main.ts creates the iframe or video when the slide is entered and removes
 * it when the slide is left.
 */

import MarkdownIt from 'markdown-it';
import katex from 'katex';

export interface Slide {
  html: string;
  notes: string;
}

export type EmbedKind = 'frame' | 'video';

/** Where an embed's URL actually points, relative to the deck's own page. */
export function resolveEmbed(src: string): { kind: EmbedKind | 'image'; url: string } {
  const scheme = /^(demo|lightfield):([^?]*)(?:\?(.*))?$/.exec(src);
  if (scheme) {
    const [, kind, name, query] = scheme;
    const extra = query ? `&${query}` : '';
    return kind === 'demo'
      ? { kind: 'frame', url: `demo.html?d=${name}&embed${extra}` }
      : { kind: 'frame', url: `lightfield/demo.html?d=${name}${extra}` };
  }
  if (/\.(mp4|mov|webm)$/i.test(src)) return { kind: 'video', url: src };
  return { kind: 'image', url: src };
}

const md = new MarkdownIt({ html: true, typographer: true });

md.renderer.rules.image = (tokens, idx) => {
  const src = String(tokens[idx].attrGet('src') ?? '');
  const { kind, url } = resolveEmbed(src);
  if (kind === 'image') return `<img class="embed" src="${md.utils.escapeHtml(url)}" alt="">`;
  // A span, so it is legal inside the <p> markdown wraps it in; main.ts
  // lifts it out of that paragraph.
  return `<span class="embed" data-kind="${kind}" data-src="${md.utils.escapeHtml(url)}"></span>`;
};

/**
 * Pull math out before Markdown sees it — `_` and `*` inside TeX would
 * otherwise become emphasis — and put the typeset HTML back afterwards.
 */
function renderWithMath(src: string): string {
  const math: string[] = [];
  const stash = (tex: string, display: boolean) => {
    math.push(katex.renderToString(tex, { displayMode: display, throwOnError: false }));
    return `MATH${math.length - 1}END`;
  };
  const text = src
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => stash(tex, true))
    .replace(/(?<![\\$])\$([^\s$](?:[^$\n]*?[^\s$\\])?)\$/g, (_, tex) => stash(tex, false));
  return md.render(text).replace(/MATH(\d+)END/g, (_, i) => math[Number(i)]);
}

export function parseSlides(source: string): Slide[] {
  return source
    .split(/^---[ \t]*$/m)
    .map((chunk) => {
      const [body, notes = ''] = chunk.split(/^Note:[ \t]*$/m);
      return { html: renderWithMath(body), notes: notes.trim() };
    })
    .filter((s) => s.html.trim() !== '');
}
