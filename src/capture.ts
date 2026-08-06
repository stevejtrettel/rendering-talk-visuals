/**
 * Export: stills and video.
 *
 * The browser cannot write files, so pixels are POSTed to the vite dev server,
 * which drops them on disk and runs ffmpeg (see the capture plugin in
 * vite.config.ts). The result is that video export is one button and ends with
 * a finished .mp4 in out/ — nothing to unzip, nothing to assemble.
 *
 * Video export steps `t` by exactly 1/fps and waits for each frame, so a frame
 * that takes two seconds to render is fine. Playback speed and dropped frames
 * cannot affect the result.
 */

import type { Stage } from './stage';
import { textSettled } from './text';

export interface VideoOptions {
  /**
   * Seconds of footage. Defaults to `stage.captureEnd` if the demo declares
   * one, otherwise the stage's loop duration. Passing this explicitly always
   * captures a plain cyclic span, endpoint excluded.
   */
  duration?: number;
  fps?: number;
  /** 'mp4' (H.264, plays everywhere) or 'prores' (huge, pristine, alpha). */
  format?: 'mp4' | 'prores';
  /** Time to start from. Default 0. */
  startTime?: number;
  onProgress?: (done: number, total: number) => void;
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))), 'image/png'),
  );
}

/**
 * Yield to the browser between captured frames — but never wait on it.
 *
 * A bare `requestAnimationFrame` here is what made long exports stall. Chrome
 * stops delivering animation frames whenever it decides the page is not
 * visible: another window covering this one, the window unfocused, the display
 * asleep, macOS App Nap. The export loop then sits on a callback that never
 * comes, and jiggling the mouse wakes the compositor for exactly one frame, so
 * the capture advances one step per mouse move. That is the bug, and it looks
 * for all the world like a rendering problem.
 *
 * Racing rAF against a timer fixes it. When the window is visible rAF wins in
 * about 16 ms and nothing changes; when it is not, the timer keeps the loop
 * moving. Timers are themselves throttled in a background tab, so a hidden
 * export runs slowly rather than quickly — but it runs, and it finishes.
 *
 * Not waiting for a paint is safe because the renderer is created with
 * `preserveDrawingBuffer: true`: the drawing buffer holds what was last drawn
 * into it regardless of whether the compositor has shown it, and `toBlob`
 * flushes any pending GL work before reading back. The yield is here to let
 * fetches and the progress toast breathe, not because the pixels need it.
 */
function nextFrame(timeoutMs = 250): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    requestAnimationFrame(finish);
    setTimeout(finish, timeoutMs);
  });
}

/** Save a single PNG at full export resolution into out/stills/. */
export async function saveStill(stage: Stage, name: string): Promise<string> {
  return stage.atExportSize(async () => {
    await textSettled();
    stage.render();
    await nextFrame();
    const blob = await canvasBlob(stage.canvas);
    const res = await fetch(`/__shot?name=${encodeURIComponent(name)}`, {
      method: 'POST',
      body: blob,
    });
    const body = await res.json();
    if (!body.ok) throw new Error(body.error ?? 'shot failed');
    console.log(`[still] ${body.path}`);
    return body.path as string;
  });
}

/**
 * Render a frame-stepped sequence and encode it to a movie.
 *
 * Returns the path of the finished file, relative to the repo root.
 */
export async function saveVideo(
  stage: Stage,
  name: string,
  opts: VideoOptions = {},
): Promise<string> {
  const { fps = 60, format = 'mp4', startTime = 0, onProgress } = opts;

  // A demo that ramps to a result declares where its motion ends, and the last
  // frame lands on that instant exactly. A cyclic demo stops one frame short of
  // its duration instead, since frame 0 and frame `duration` are the same
  // picture and capturing both makes the loop stutter.
  const ramped = opts.duration === undefined && stage.captureEnd !== undefined;
  const duration = opts.duration ?? stage.captureEnd ?? stage.duration;
  const total = Math.round(duration * fps) + (ramped ? 1 : 0);
  const wasRunning = true;
  const savedTime = stage.t;

  // Freeze live playback: from here time is driven only by the loop below.
  stage.stop();

  try {
    return await stage.atExportSize(async () => {
      for (let i = 0; i < total; i++) {
        stage.setTime(startTime + i / fps);
        // Labels changed by that update are still laying out; wait for them,
        // then redraw, or the frame captures the previous frame's numbers.
        await textSettled();
        stage.render();
        await nextFrame();
        const blob = await canvasBlob(stage.canvas);
        const res = await fetch(`/__frame?name=${encodeURIComponent(name)}&i=${i}`, {
          method: 'POST',
          body: blob,
        });
        if (!res.ok) throw new Error(`frame ${i} failed: ${await res.text()}`);
        onProgress?.(i + 1, total);
      }

      const res = await fetch(
        `/__encode?name=${encodeURIComponent(name)}&fps=${fps}&format=${format}`,
        { method: 'POST' },
      );
      const body = await res.json();
      if (!body.ok) throw new Error(body.error ?? 'encode failed');
      console.log(`[video] ${body.path}`);
      return body.path as string;
    });
  } finally {
    stage.t = savedTime;
    if (wasRunning) stage.start();
  }
}
