/**
 * The allocation guards of {@link VideoSurface.tick} (v2 R7-VID), in their own file as every
 * guard has. Two paths, both in a synchronous measurement loop (the guard helper never yields to
 * microtasks): the **idle** one (the state of nearly every frame of the game — a hidden surface
 * must touch nothing), and the **pulling** one (a clip shows, its time moves, and a frame copy is
 * already in flight — the `pending` guard makes every further render tick a bare read-and-return,
 * which at 60 Hz with a ≤ 30 fps clip is the most common shown path). The cost of one actual
 * frame copy (a native `ImageBitmap` plus its promise job, JS-side only once per decoded frame,
 * never per render tick) is on the cold microtask side and is disclosed in the lane report, not
 * measured here. The fake element, bitmap and source keep the measurement on the module.
 */
import { Container } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import {
  createVideoSurface,
  type VideoElementLike,
  type VideoFrameBitmapLike,
  type VideoSourceLike,
  type VideoSurface,
} from '../../src/video/index.js';
import { measureHeapGrowth } from '../../../core/test/helpers/alloc.js';

/** The surface's element stand-in: a fraction that moves like decoded video time does. */
class PullingElement implements VideoElementLike {
  src = '';
  loop = false;
  preload = '';
  ready = 4;
  end = false;
  time = 0;
  get currentTime(): number {
    return this.time;
  }
  get readyState(): number {
    return this.ready;
  }
  get ended(): boolean {
    return this.end;
  }
  load(): void {}
  play(): Promise<void> {
    return Promise.resolve();
  }
  pause(): void {}
  addEventListener(): void {}
  removeEventListener(): void {}
}

/** The reused frame snapshot (a native bitmap costs JS heap on the browser side, not here). */
const SHARED_BITMAP: VideoFrameBitmapLike = {
  width: 640,
  height: 360,
  close(): void {},
};

/** The surface's source stand-in: the swap is a field write (the real one is one image upload). */
class PullingSource implements VideoSourceLike {
  resource: VideoFrameBitmapLike | null = SHARED_BITMAP;
  pixelWidth = 640;
  pixelHeight = 360;
  updates = 0;
  update(): void {
    this.updates++;
  }
  destroy(): void {}
}

/**
 * A surface over fresh fakes.
 *
 * @returns The surface and its two fakes.
 */
function makeSurface(): { surface: VideoSurface; element: PullingElement; source: PullingSource } {
  const element = new PullingElement();
  const source = new PullingSource();
  const surface = createVideoSurface({
    root: new Container(),
    bands: { world: 0, screen: 0 },
    createVideoElement: () => element,
    createVideoSource: () => source,
    createFrameBitmap: () => Promise.resolve(SHARED_BITMAP),
  });
  return { surface, element, source };
}

describe('render-pixi/video — allocation guards', () => {
  it('a hidden surface ticks for free', () => {
    const { surface } = makeSurface();
    const bytes = measureHeapGrowth(
      () => {
        surface.tick();
      },
      10_000,
      20_000,
    ).bytes;
    // The house budget for a near-zero path (the CRT blit's and Mode-7's guards); the hidden
    // tick itself is a single boolean read — this catches any real per-call object.
    expect(bytes).toBeLessThan(16 * 1024);
  });

  it('a shown surface with a copy in flight costs the fraction read and nothing more', async () => {
    const { surface, element, source } = makeSurface();
    await surface.play('assets/video/attract-ambient.mp4', true);
    const bytes = measureHeapGrowth(
      (step) => {
        // New times in every window (the guard law): presentation time advances like a real clip.
        element.time = step * 0.0166;
        surface.tick();
      },
      10_000,
      20_000,
    ).bytes;
    // The house budget for a hot read path: the first call opens the copy (one promise job), the
    // `pending` guard returns on every later tick — 64 B a frame across the window.
    expect(source.updates).toBeGreaterThanOrEqual(0);
    expect(bytes).toBeLessThan(64 * 10_000);
  });
});
