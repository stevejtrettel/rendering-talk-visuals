// Compute (Id - T)^{-1} for the discretized beam room, all three colours, and
// write public/discrete-inverse.bin (about 2 s a colour; too slow for a page
// load). Run by `npm run build`. See src/discrete-room.ts.
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(ROOT, 'node_modules/.cache/bake-discrete/discrete-room.mjs');
await build({ entryPoints: [path.join(ROOT, 'src/discrete-room.ts')], bundle: true, format: 'esm', platform: 'node', outfile: out, tsconfig: path.join(ROOT, 'tsconfig.json'), logLevel: 'warning' });
const { buildT, inverse, packInverses } = await import(pathToFileURL(out).href);
const t0 = Date.now();
const T = buildT();
const buf = packInverses([0, 1, 2].map((c) => inverse(T, c)));
mkdirSync(path.join(ROOT, 'public'), { recursive: true });
writeFileSync(path.join(ROOT, 'public/discrete-inverse.bin'), Buffer.from(buf));
console.log(`discrete-inverse.bin: inverted in ${Date.now() - t0} ms, ${(buf.byteLength / 1e6).toFixed(1)} MB`);
