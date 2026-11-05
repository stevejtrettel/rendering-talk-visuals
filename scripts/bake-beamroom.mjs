// Trace the beam room's light once and write it to public/beamroom.bin, which
// vite copies into dist; src/beamroom.ts reads it instead of tracing on every
// page load. Run by `npm run build`. See src/beamtrace.ts.
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(ROOT, 'node_modules/.cache/bake-beamroom/beamtrace.mjs');
await build({ entryPoints: [path.join(ROOT, 'src/beamtrace.ts')], bundle: true, format: 'esm', platform: 'node', outfile: out, tsconfig: path.join(ROOT, 'tsconfig.json'), logLevel: 'warning' });
const { traceRoom, pack } = await import(pathToFileURL(out).href);
const t0 = Date.now();
const buf = pack(traceRoom());
mkdirSync(path.join(ROOT, 'public'), { recursive: true });
writeFileSync(path.join(ROOT, 'public/beamroom.bin'), Buffer.from(buf));
console.log(`beamroom.bin: traced in ${Date.now() - t0} ms, ${(buf.byteLength / 1e6).toFixed(1)} MB`);
