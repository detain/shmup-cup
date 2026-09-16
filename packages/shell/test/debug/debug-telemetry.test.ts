/**
 * The M3-02f part of the shell's debug tools: a build given a log-server URL streams its render
 * profile. The frame hooks must hand the *raw* figures to the sampler (the overlay's own numbers
 * are smoothed and would hide every p95), the window must carry the context that makes a row of the
 * measurement table meaningful, and `destroy()` must stop the capture. A build without a URL — every
 * release build, and every dev build that was not pointed at a server — starts nothing at all.
 */
import { EMPTY_CONTENT_DB, createGame, createHeadlessPlatform, type Game } from '@shmup/core';
import { createLayerStack, type PixiRenderer } from '@shmup/render-pixi';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDebugTools, type DebugTools } from '../../src/debug/index.js';
import type { RenderSample } from '../../src/telemetry/index.js';

/** A window stand-in with the report timer the telemetry needs (and no document). */
class TimerWindow extends EventTarget {
  /** The interval callback, or `null`. */
  timer: (() => void) | null = null;
  /** `clearInterval` calls. */
  cleared = 0;
  /** CSS width the env line records. */
  readonly innerWidth = 1920;
  /** CSS height the env line records. */
  readonly innerHeight = 1080;
  /** Pixel ratio the env line records. */
  readonly devicePixelRatio = 1;

  /**
   * Installs the report timer.
   *
   * @param handler - What the timer runs.
   * @returns The handle.
   */
  setInterval(handler: () => void): number {
    this.timer = handler;
    return 3;
  }

  /**
   * Stops the report timer.
   *
   * @param handle - The handle.
   */
  clearInterval(handle: number): void {
    if (handle === 3) this.timer = null;
    this.cleared++;
  }
}

/** The requests the capture made; nothing leaves the process. */
const sent: string[] = [];

/** An `XMLHttpRequest` stand-in that records the body and never answers. */
class SilentXhr {
  /** Timeout the sender set. */
  timeout = 0;
  /** Success handler. */
  onload: (() => void) | null = null;
  /** Network-error handler. */
  onerror: (() => void) | null = null;
  /** Timeout handler. */
  ontimeout: (() => void) | null = null;

  /** Records the request line. */
  open(): void {}

  /** Records a header. */
  setRequestHeader(): void {}

  /**
   * Records the body.
   *
   * @param body - The serialized payload.
   */
  send(body: string): void {
    sent.push(body);
  }
}

let win: TimerWindow;
let game: Game;
let tools: DebugTools | null;
const clock = { now: 0 };

/** A renderer-like object carrying everything the window's context reads. */
const renderer = {
  atlas: null,
  layers: createLayerStack(),
  webGLVersion: 1,
  width: 384,
  height: 216,
  drawCalls: 7,
  structureRebuilds: 0,
  particles: null,
  crtFilter: 'light',
  screenPass: 'blit',
  aspect: 'normal',
  scaleMode: 'integer',
  viewport: { scale: 5, width: 1920, height: 1080 },
} as unknown as { structureRebuilds: number; drawCalls: number } & PixiRenderer;

/**
 * Creates tools on the fake host.
 *
 * @param reportUrl - The log-server URL (`''` leaves the capture off).
 * @returns The tools.
 */
function createTools(reportUrl: string): DebugTools {
  return createDebugTools(
    {
      game,
      renderer,
      win: win as unknown as Window,
      now: () => clock.now,
      bootMs: 4200,
      sceneId: () => 'game',
      visibleWorld: () => null,
    },
    { buildId: 'abc1234', reportUrl },
  );
}

/**
 * Drives one displayed frame through the tools with the given timings.
 *
 * @param frameMs - Time since the previous frame.
 * @param tickMs - Time the ticks took.
 * @param renderMs - Time the render took.
 */
function frame(frameMs: number, tickMs: number, renderMs: number): void {
  clock.now += frameMs;
  tools!.beginFrame(clock.now);
  clock.now += tickMs;
  tools!.endTicks(1);
  tools!.beforeRender();
  clock.now += renderMs;
  tools!.afterRender();
  renderer.structureRebuilds++;
}

beforeEach(() => {
  sent.length = 0;
  clock.now = 0;
  win = new TimerWindow();
  Object.defineProperty(win, 'XMLHttpRequest', { value: SilentXhr, configurable: true });
  game = createGame(createHeadlessPlatform(), { seed: 1 }, EMPTY_CONTENT_DB);
  renderer.structureRebuilds = 0;
  tools = null;
});

afterEach(() => {
  tools?.destroy();
  tools = null;
});

describe('shell/debug render telemetry (M3-02f)', () => {
  it('starts nothing without a log-server URL', () => {
    tools = createTools('');
    expect(tools.telemetry.enabled).toBe(false);
    expect(win.timer).toBeNull();
    frame(16.7, 0.2, 1.1);
    expect(tools.telemetry.sampler.frames).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it('feeds the sampler the raw per-frame figures, not the overlay’s smoothed ones', () => {
    tools = createTools('http://10.0.0.2:8787');
    expect(tools.telemetry.enabled).toBe(true);
    // First frame: no delta yet, so it carries timings but no frame time.
    frame(0, 0.2, 1);
    for (let i = 0; i < 9; i++) frame(16.7, 0.2, 1 + i);
    expect(tools.telemetry.sampler.frames).toBe(10);
    const window = tools.telemetry.report() as RenderSample;
    expect(window).not.toBeNull();
    // The smoothed overlay figure lags far behind the p95 the review needs; the window keeps it.
    expect(tools.overlay.stats.renderMs).toBeLessThan(window.renderMs[2]);
    expect(window.renderMs[2]).toBeCloseTo(9, 5);
    expect(window.renderMs[0]).toBeCloseTo(1, 5);
    expect(window.renderMs[3]).toBeCloseTo(9, 5);
    // The rAF deltas are the host clock's, so they carry the previous frame's work too.
    expect(window.frameMs[0]).toBeGreaterThanOrEqual(16.7);
    expect(window.frameMs[3]).toBeGreaterThan(window.frameMs[0]);
    expect(window.tickFrames).toEqual([0, 10, 0, 0]);
    expect(window.rebuilds).toBe(9);
  });

  it('gives the window the context that makes a row of the measurement table meaningful', () => {
    tools = createTools('http://10.0.0.2:8787');
    game.debug.godMode = true;
    game.debug.slowMo = 2;
    frame(16.7, 0.2, 1);
    const window = tools.telemetry.report() as RenderSample;
    expect(window.context).toMatchObject({
      scene: 'game',
      crtFilter: 'light',
      screenPass: 'blit',
      aspect: 'normal',
      scaleMode: 'integer',
      scale: 5,
      viewportWidth: 1920,
      viewportHeight: 1080,
      webGLVersion: 1,
      stage: null,
      zone: null,
    });
    expect(window.context.assists).toEqual(['god', 'slowMo2']);
  });

  it('POSTs the batch on the report timer, with the build id and the checklist', () => {
    tools = createTools('http://10.0.0.2:8787');
    for (let i = 0; i < 5; i++) frame(16.7, 0.2, 1);
    win.timer?.();
    expect(sent).toHaveLength(1);
    const payload = JSON.parse(sent[0]) as {
      kind: string;
      env: { buildId: string; bootMs: number; internalWidth: number };
      checklist: Array<{ id: string }>;
      samples: RenderSample[];
    };
    expect(payload.kind).toBe('render-profile');
    expect(payload.env.buildId).toBe('abc1234');
    expect(payload.env.bootMs).toBe(4200);
    expect(payload.env.internalWidth).toBe(384);
    expect(payload.checklist).toHaveLength(8);
    expect(payload.samples).toHaveLength(1);
    expect(payload.samples[0].frames).toBe(5);
  });

  it('stops the capture on destroy, once', () => {
    tools = createTools('http://10.0.0.2:8787');
    tools.destroy();
    tools.destroy();
    expect(win.timer).toBeNull();
    expect(win.cleared).toBe(1);
    tools = null;
  });
});
