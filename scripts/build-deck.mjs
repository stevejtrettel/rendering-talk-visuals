/**
 * Builds the talk deck into one static folder (notes/deck.md, "The standalone
 * build"):
 *
 *   dist-deck/
 *     index.html     the deck
 *     demo.html      this repo's demo host; demos load as lazy chunks
 *     assets/        bundled JS/CSS and fonts
 *     lightfield/    light-field's dist/, copied verbatim, plus SOURCE.txt
 *     media/         talk/media/, copied verbatim
 *     README.txt     how to serve it
 *
 * light-field is copied, never built: run `npm run build` there first. Data
 * flows one way and no code crosses.
 *
 *   npm run build:deck
 *   LIGHTFIELD_DIST=/elsewhere/dist npm run build:deck
 */

import { build } from 'vite';
import { cpSync, existsSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'dist-deck');
// Same default as LIGHTFIELD_DIST in vite.config.ts, which serves it in dev.
const LIGHTFIELD_DIST = path.resolve(root, process.env.LIGHTFIELD_DIST ?? '../light-field/dist');
const MEDIA = path.join(root, 'talk/media');

if (!existsSync(path.join(LIGHTFIELD_DIST, 'demo.html'))) {
  console.error(`No light-field build at ${LIGHTFIELD_DIST}.`);
  console.error(`Run \`npm run build\` in ../light-field first, or set LIGHTFIELD_DIST.`);
  process.exit(1);
}

// --- the deck and the demo host ---------------------------------------------
// Not the repo's vite.config.ts: its inputs are the gallery's, and Vite would
// merge them with these rather than replace them.

await build({
  root,
  configFile: false,
  base: './',
  resolve: { alias: { '@': path.join(root, 'src') } },
  assetsInclude: ['**/*.hdr', '**/*.exr'],
  build: {
    outDir: OUT,
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      input: {
        deck: path.join(root, 'deck.html'),
        demo: path.join(root, 'demo.html'),
      },
    },
  },
});

// Opening the folder should open the talk.
renameSync(path.join(OUT, 'deck.html'), path.join(OUT, 'index.html'));

// --- light-field ------------------------------------------------------------

cpSync(LIGHTFIELD_DIST, path.join(OUT, 'lightfield'), { recursive: true });

// Record what was copied, so the frozen folder says what it contains.
const repo = path.dirname(LIGHTFIELD_DIST);
const git = (...args) => {
  try {
    return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
};
const commit = git('rev-parse', 'HEAD');
const dirty = git('status', '--porcelain');
const builtAt = statSync(path.join(LIGHTFIELD_DIST, 'demo.html')).mtime;
const committedAt = git('log', '-1', '--format=%ct');
writeFileSync(
  path.join(OUT, 'lightfield', 'SOURCE.txt'),
  [
    `light-field build copied from ${LIGHTFIELD_DIST}`,
    `commit:   ${commit ?? 'unknown (not a git checkout)'}${dirty ? ' (working tree dirty)' : ''}`,
    `built:    ${builtAt.toISOString()}`,
    `copied:   ${new Date().toISOString()}`,
    '',
  ].join('\n'),
);
if (committedAt && builtAt.getTime() / 1000 < Number(committedAt)) {
  console.warn(`\n  ! light-field's dist/ is older than its last commit — rebuild it if that matters.`);
}
if (dirty) console.warn(`  ! light-field's working tree is dirty; SOURCE.txt says so.`);

// --- media ------------------------------------------------------------------

if (existsSync(MEDIA)) cpSync(MEDIA, path.join(OUT, 'media'), { recursive: true });

writeFileSync(
  path.join(OUT, 'README.txt'),
  `The talk deck, as one static folder.

It must be served, not opened as a file: ES modules do not load from file://,
and WebGPU needs localhost or https. From this folder:

    python3 -m http.server 8000

then open http://localhost:8000/ in Chrome. Any static host works too
(GitHub Pages included); every path is relative.

Keys: arrows or PageUp/PageDown page (a presentation clicker works), Home/End
jump, F fullscreen. Everything else goes to the live page on the slide.
The URL hash is the slide number: index.html#12.

lightfield/SOURCE.txt records which light-field commit the live pages are.
`,
);

console.log(`\n✓ deck → ${path.relative(root, OUT)}/  (serve it: cd ${path.relative(root, OUT)} && python3 -m http.server)`);
