import { defineConfig, type PluginOption } from 'vite';
import path from 'node:path';
import { mkdirSync, writeFileSync, rmSync, existsSync, statSync, createReadStream } from 'node:fs';
import { spawn } from 'node:child_process';

const ROOT = __dirname;
const OUT = path.join(ROOT, 'out');

/** Read a request body as a Buffer. */
function readBody(req: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function json(res: any, code: number, body: unknown) {
  res.statusCode = code;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}

/** Only allow simple slugs through, since these become filesystem paths. */
function safeName(s: string | null): string {
  if (!s || !/^[\w-]{1,64}$/.test(s)) throw new Error(`bad name: ${s}`);
  return s;
}

/**
 * Dev-only capture pipeline.
 *
 * The browser cannot write to disk, so the page POSTs pixels here and this
 * middleware puts them where ffmpeg can reach them:
 *
 *   POST /__shot?name=X          -> out/stills/X-<n>.png
 *   POST /__frame?name=X&i=0007  -> out/frames/X/0007.png
 *   POST /__encode?name=X&fps=60&format=mp4
 *        -> runs ffmpeg over out/frames/X, writes out/X.mp4, clears the frames
 *
 * The point is that exporting a video costs one button press and no file
 * shuffling: no zip to unpack, no sequence to assemble by hand.
 */
function capturePipeline(): PluginOption {
  return {
    name: 'capture-pipeline',
    apply: 'serve',
    configureServer(server) {
      // A still frame.
      server.middlewares.use('/__shot', async (req, res, next) => {
        if (req.method !== 'POST') return next();
        try {
          const url = new URL(req.url ?? '', 'http://x');
          const name = safeName(url.searchParams.get('name'));
          const dir = path.join(OUT, 'stills');
          mkdirSync(dir, { recursive: true });
          // Wall-clock suffix keeps successive stills of one demo distinct.
          const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
          const file = path.join(dir, `${name}-${stamp}.png`);
          writeFileSync(file, await readBody(req));
          console.log(`[shot] out/stills/${path.basename(file)}`);
          json(res, 200, { ok: true, path: `out/stills/${path.basename(file)}` });
        } catch (e) {
          json(res, 400, { ok: false, error: String(e) });
        }
      });

      // One frame of a sequence.
      server.middlewares.use('/__frame', async (req, res, next) => {
        if (req.method !== 'POST') return next();
        try {
          const url = new URL(req.url ?? '', 'http://x');
          const name = safeName(url.searchParams.get('name'));
          const i = url.searchParams.get('i') ?? '0';
          if (!/^\d{1,6}$/.test(i)) throw new Error(`bad index: ${i}`);
          const dir = path.join(OUT, 'frames', name);
          // Frame 0 starts a fresh sequence, so stale frames from a longer
          // previous run can never leak into this encode.
          if (Number(i) === 0) rmSync(dir, { recursive: true, force: true });
          mkdirSync(dir, { recursive: true });
          writeFileSync(path.join(dir, `${i.padStart(5, '0')}.png`), await readBody(req));
          json(res, 200, { ok: true });
        } catch (e) {
          json(res, 400, { ok: false, error: String(e) });
        }
      });

      // Assemble the frames into a movie.
      server.middlewares.use('/__encode', async (req, res, next) => {
        if (req.method !== 'POST') return next();
        try {
          const url = new URL(req.url ?? '', 'http://x');
          const name = safeName(url.searchParams.get('name'));
          const fps = Number(url.searchParams.get('fps') ?? 60);
          const format = url.searchParams.get('format') === 'prores' ? 'prores' : 'mp4';
          if (!Number.isFinite(fps) || fps <= 0 || fps > 240) throw new Error(`bad fps: ${fps}`);

          const result = await encode({ name, fps, format });
          console.log(`[video] ${result.path}`);
          json(res, 200, { ok: true, ...result });
        } catch (e) {
          console.error('[video] failed:', e);
          json(res, 500, { ok: false, error: String(e) });
        }
      });
    },
  };
}

/**
 * Where the deck's light-field pages come from: light-field's own build
 * output, never its source (notes/deck.md). build-deck.mjs copies the same
 * directory, so the deck in dev embeds exactly what it will ship with.
 */
export const LIGHTFIELD_DIST = path.resolve(ROOT, process.env.LIGHTFIELD_DIST ?? '../light-field/dist');

const MIME: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.mp4': 'video/mp4',
  '.mov': 'video/quicktime', '.webm': 'video/webm',
};

/**
 * Dev-only: serve a directory outside the vite root at a URL prefix. The deck
 * gets /lightfield/* and /media/* this way, at the same paths the built
 * folder puts them.
 */
function serveDir(prefix: string, dir: string): PluginOption {
  return {
    name: `serve-dir:${prefix}`,
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(prefix, (req, res, next) => {
        let rel = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
        if (rel.endsWith('/')) rel += 'index.html';
        const file = path.join(dir, rel);
        if (!file.startsWith(dir + path.sep) || !existsSync(file) || !statSync(file).isFile()) return next();
        res.setHeader('content-type', MIME[path.extname(file)] ?? 'application/octet-stream');
        res.setHeader('content-length', statSync(file).size);
        createReadStream(file).pipe(res);
      });
    },
  };
}

/** Run ffmpeg over out/frames/<name> and leave a movie in out/. */
export function encode(opts: { name: string; fps: number; format: 'mp4' | 'prores' }) {
  const { name, fps, format } = opts;
  const frames = path.join(OUT, 'frames', name);
  mkdirSync(OUT, { recursive: true });
  const ext = format === 'prores' ? 'mov' : 'mp4';
  const outFile = path.join(OUT, `${name}.${ext}`);

  // ProRes 4444 for Keynote (large, pristine, handles alpha); H.264 yuv420p
  // otherwise, which is the format everything plays without complaint.
  const codec =
    format === 'prores'
      ? ['-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le']
      : ['-c:v', 'libx264', '-crf', '16', '-preset', 'slow', '-pix_fmt', 'yuv420p'];

  const args = [
    '-y',
    '-framerate', String(fps),
    '-i', path.join(frames, '%05d.png'),
    ...codec,
    '-r', String(fps),
    outFile,
  ];

  return new Promise<{ path: string; file: string }>((resolve, reject) => {
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.on('data', (d) => (err += d.toString()));
    child.on('error', (e) => reject(new Error(`ffmpeg not runnable: ${e.message}`)));
    child.on('exit', (code) => {
      if (code === 0) resolve({ path: `out/${name}.${ext}`, file: outFile });
      else reject(new Error(`ffmpeg exited ${code}\n${err.slice(-2000)}`));
    });
  });
}

export default defineConfig({
  base: './',
  resolve: {
    alias: { '@': path.resolve(ROOT, 'src') },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: path.resolve(ROOT, 'index.html'),
        demo: path.resolve(ROOT, 'demo.html'),
      },
    },
  },
  assetsInclude: ['**/*.hdr', '**/*.exr'],
  plugins: [
    capturePipeline(),
    serveDir('/lightfield', LIGHTFIELD_DIST),
    serveDir('/media', path.join(ROOT, 'talk/media')),
  ],
});
