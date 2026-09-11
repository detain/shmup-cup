/**
 * Shared fixtures for the render-pixi tests: a small hand-written atlas manifest (two pages,
 * a sprite with a hit-flash sibling, the fallback sprites and a tiny bitmap font) and fake page
 * images, so atlases can be built in Node without a GPU or real PNGs — plus an allocation probe
 * for the zero-allocation rule of the per-frame paths (plan §1.3).
 */
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import type { AtlasFrameInfo, AtlasManifest, AtlasPageImage } from '../src/atlas/index.js';

/**
 * A frame entry.
 *
 * @param p - Page.
 * @param x - Left.
 * @param y - Top.
 * @param w - Width.
 * @param h - Height.
 * @param ax - Anchor x.
 * @param ay - Anchor y.
 */
const frame = (
  p: number,
  x: number,
  y: number,
  w: number,
  h: number,
  ax = 0,
  ay = 0,
): AtlasFrameInfo => ({ p, x, y, w, h, ax, ay });

/** Glyphs of the test font: digits, `A`, `B`, `?`, `-`, space and `★` (U+2605). */
const GLYPH_CODES = [32, 45, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 63, 65, 66, 0x2605];

/**
 * Builds the test manifest.
 *
 * @param options - `withFallbacks: false` leaves out `ui/missing` and `ui/pixel`.
 * @returns A manifest with pages `main.png` (64×32) and `main-1.png` (32×16).
 */
export function testManifest(options: { withFallbacks?: boolean } = {}): AtlasManifest {
  const withFallbacks = options.withFallbacks ?? true;
  const frames: Record<string, AtlasFrameInfo> = {
    'ships/a#0': frame(0, 0, 0, 16, 9, 8, 4),
    'ships/a#1': frame(0, 16, 0, 16, 9, 8, 4),
    'ships/a#2': frame(0, 32, 0, 16, 9, 8, 4),
    'ships/a@flash#0': frame(0, 0, 10, 16, 9, 8, 4),
    'ships/a@flash#1': frame(0, 16, 10, 16, 9, 8, 4),
    'ships/a@flash#2': frame(0, 32, 10, 16, 9, 8, 4),
    'bg/tile#0': frame(1, 0, 0, 16, 16),
  };
  const sprites: Record<string, { frames: string[]; flash: string | null }> = {
    'ships/a': { frames: ['ships/a#0', 'ships/a#1', 'ships/a#2'], flash: 'ships/a@flash' },
    'ships/a@flash': {
      frames: ['ships/a@flash#0', 'ships/a@flash#1', 'ships/a@flash#2'],
      flash: null,
    },
    'bg/tile': { frames: ['bg/tile#0'], flash: null },
  };
  if (withFallbacks) {
    frames['ui/missing#0'] = frame(0, 48, 0, 8, 8, 4, 4);
    frames['ui/pixel#0'] = frame(0, 56, 0, 1, 1);
    sprites['ui/missing'] = { frames: ['ui/missing#0'], flash: null };
    sprites['ui/pixel'] = { frames: ['ui/pixel#0'], flash: null };
  }
  const glyphs: Record<string, { frame: string; advance: number }> = {};
  const fontFrames: string[] = [];
  GLYPH_CODES.forEach((code, index) => {
    const name = `font/pixel#${index}`;
    fontFrames.push(name);
    frames[name] = frame(0, (index % 8) * 6, 20 + Math.floor(index / 8) * 6, 6, 6);
    glyphs[String(code)] = { frame: name, advance: 6 };
  });
  sprites['font/pixel'] = { frames: fontFrames, flash: null };
  return {
    formatVersion: 1,
    pages: [
      { file: 'main.png', w: 64, h: 32 },
      { file: 'main-1.png', w: 32, h: 16 },
    ],
    frames,
    sprites,
    animations: { 'ships/a': { level: [0], up: [1], down: [2] } },
    fonts: { pixel: { sprite: 'font/pixel', lineHeight: 8, cellWidth: 6, cellHeight: 6, glyphs } },
  };
}

/**
 * A fake decoded image of the given size (what `new Image()` gives after `onload`).
 *
 * @param width - Pixel width.
 * @param height - Pixel height.
 * @returns An object Pixi's `ImageSource` accepts in Node.
 */
export function fakeImage(width: number, height: number): AtlasPageImage {
  return { width, height, naturalWidth: width, naturalHeight: height } as unknown as AtlasPageImage;
}

/**
 * Fake images matching every page of a manifest.
 *
 * @param manifest - The manifest.
 * @returns One fake image per page.
 */
export function pageImages(manifest: AtlasManifest): AtlasPageImage[] {
  return manifest.pages.map((page) => fakeImage(page.w, page.h));
}

/** `gc()` of the V8 isolate (exposed on first use through `--expose-gc`). */
let collect: (() => void) | null = null;

/**
 * Runs a full garbage collection.
 */
export function forceGc(): void {
  if (collect === null) {
    setFlagsFromString('--expose-gc');
    collect = runInNewContext('gc') as () => void;
  }
  collect();
  collect();
}

/**
 * Estimates the bytes `step` allocates over `iterations` calls, after `warmUp` calls (JIT).
 *
 * @remarks
 * Samples `heapUsed` every 100 calls and sums only the growing intervals, so a scavenge in the
 * middle loses one interval instead of hiding the whole run — the estimate can err low by at
 * most ~100 calls' worth per collection, never high. Short-lived garbage counts (that is the
 * point: per-frame code must not produce any), retained memory counts too.
 *
 * @param step - The per-frame work; receives the iteration index.
 * @param iterations - Measured calls.
 * @param warmUp - Unmeasured calls first (default 2000).
 * @returns Estimated bytes allocated.
 */
export function measureAllocation(
  step: (i: number) => void,
  iterations: number,
  warmUp = 2000,
): number {
  for (let i = 0; i < warmUp; i++) step(i);
  forceGc();
  let previous = process.memoryUsage().heapUsed;
  let total = 0;
  for (let done = 0; done < iterations;) {
    const end = Math.min(iterations, done + 100);
    for (; done < end; done++) step(warmUp + done);
    const now = process.memoryUsage().heapUsed;
    if (now > previous) total += now - previous;
    previous = now;
  }
  return total;
}
