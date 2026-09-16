/**
 * Allocation guard of the render telemetry's per-frame path (plan M3-02f). This is the guard the
 * whole step turns on: a capture that allocated on every frame would be measuring its own garbage
 * collector. The frame writes its figures into the sampler's `Float64Array` inbox — fractional
 * values, the ones V8 boxes when they are passed as call arguments — and `commitFrame()` moves
 * them into the window's preallocated series.
 *
 * Its own file, like every other guard (`docs/dev/conventions.md`): the measurement is sensitive to
 * what other suites leave on the heap. Measured on a second capture after a throwaway one, so the
 * factory's hidden-class transitions are not counted.
 */
import { describe, expect, it } from 'vitest';
import { measureHeapGrowth } from '../../../core/test/helpers/alloc.js';
import {
  RENDER_FRAME_SLOT,
  RENDER_WINDOW_MAX_FRAMES,
  createRenderTelemetry,
  type RenderSampleContext,
  type RenderTelemetry,
  type RenderTelemetryEnv,
} from '../../src/telemetry/index.js';

/** Session-level facts (read once, at creation). */
const ENV: RenderTelemetryEnv = {
  buildId: 'guard',
  device: '',
  userAgent: '',
  innerWidth: 1920,
  innerHeight: 1080,
  devicePixelRatio: 1,
  webGLVersion: 1,
  internalWidth: 384,
  internalHeight: 216,
  bootMs: 0,
  startedAt: 0,
};

/** The context a window would be closed with (never read by the measured loop). */
const CONTEXT: RenderSampleContext = {
  scene: 'game',
  stage: 'zone-a',
  zone: 'A',
  zoneName: 'AZURE VERGE',
  checkpoint: 0,
  cameraX: 0,
  cameraY: 0,
  crtFilter: 'off',
  screenPass: 'blit',
  aspect: 'normal',
  scaleMode: 'integer',
  scale: 5,
  viewportWidth: 1920,
  viewportHeight: 1080,
  webGLVersion: 1,
  bullets: 0,
  enemies: 0,
  particles: 0,
  rank: 0,
  vsyncLock: true,
  assists: [],
};

/** A window stand-in with no document, so the guard measures the sampler and nothing else. */
const win = {
  /**
   * The report timer is never started in the guard's loop.
   *
   * @returns The handle.
   */
  setInterval: (): number => 1,
  /** Stops the timer. */
  clearInterval: (): void => {},
  /** Registers a listener. */
  addEventListener: (): void => {},
  /** Removes a listener. */
  removeEventListener: (): void => {},
} as unknown as Window;

/**
 * A running capture over the fake window, with no panel and no real request.
 *
 * @returns The capture.
 */
function capture(): RenderTelemetry {
  return createRenderTelemetry({
    reportUrl: 'http://127.0.0.1:8787',
    win,
    now: () => 0,
    nowEpochMs: () => 0,
    random: () => 0.5,
    env: ENV,
    context: () => CONTEXT,
    panel: false,
    createRequest: () => ({}) as XMLHttpRequest,
  });
}

/**
 * One frame of the measured loop: the figures a real frame would hand over, all of them moving.
 *
 * @param telemetry - The capture.
 * @param i - The call index (never repeated across the guard's windows).
 */
function frame(telemetry: RenderTelemetry, i: number): void {
  const inbox = telemetry.sampler.frame;
  // Fractional, as the host clock really produces them; a rising rebuild count as in a session.
  inbox[RENDER_FRAME_SLOT.frameMs] = 16.4 + (i % 7) * 0.37;
  inbox[RENDER_FRAME_SLOT.tickMs] = 0.11 + (i % 11) * 0.013;
  inbox[RENDER_FRAME_SLOT.renderMs] = 1.07 + (i % 13) * 0.29;
  inbox[RENDER_FRAME_SLOT.drawCalls] = 4 + (i % 9);
  inbox[RENDER_FRAME_SLOT.rebuilds] = i;
  inbox[RENDER_FRAME_SLOT.renderTargetBytes] = ((i % 5) + 1) * 512 * 1024;
  inbox[RENDER_FRAME_SLOT.ticks] = i % 4;
  inbox[RENDER_FRAME_SLOT.rafBucket] = i % 8;
  telemetry.commitFrame();
}

describe('shell/telemetry per-frame allocation (M3-02f)', () => {
  it('samples a frame without allocating', () => {
    const throwaway = capture();
    for (let i = 0; i < 2000; i++) {
      if (i % RENDER_WINDOW_MAX_FRAMES === 0) throwaway.sampler.reset();
      frame(throwaway, i);
    }
    throwaway.destroy();

    const telemetry = capture();
    const growth = measureHeapGrowth(
      (i) => {
        // A window holds ~180 frames in play; resetting on the same cycle keeps the guard on the
        // path that really stores the series instead of the one that only counts overflow frames.
        if (i % 180 === 0) telemetry.sampler.reset();
        frame(telemetry, i);
      },
      20_000,
      20_000,
      3,
      8 * 1024,
    );
    expect(growth.bytes).toBeLessThan(16 * 1024);
    expect(telemetry.sampler.frames).toBeGreaterThan(0);
    telemetry.destroy();
  }, 60_000);
});
