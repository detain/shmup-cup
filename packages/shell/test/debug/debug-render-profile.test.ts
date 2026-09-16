/**
 * The M3-02c parts of the shell's debug tools: the two render-profile figures the overlay's last
 * line shows — the renderer's structure-rebuild count (the render review's **F1**) and the pooled
 * render-target byte total from `@shmup/render-pixi`'s `createRenderTargetMeter` (its **F2**) — are
 * refreshed in `beforeRender()`, and the meter (one per tools instance, hooked into Pixi's global
 * `TexturePool`) is stopped by `destroy()`.
 *
 * The meter itself is faked here: `packages/render-pixi/test/debug/debug-render-profile.test.ts`
 * tests the real one against a pool, and the shell only has to wire it up.
 */
import { createGame, createHeadlessPlatform, EMPTY_CONTENT_DB, type Game } from '@shmup/core';
import type * as RenderPixi from '@shmup/render-pixi';
import { createLayerStack, type PixiRenderer } from '@shmup/render-pixi';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDebugTools, type DebugTools } from '../../src/debug/index.js';

const meters = vi.hoisted(() => ({
  /** Bytes the fake meter reports. */
  bytes: 0,
  /** Meters created since the last reset. */
  created: 0,
  /** `stop()` calls. */
  stopped: 0,
}));

vi.mock('@shmup/render-pixi', async (importOriginal) => {
  const real = await importOriginal<typeof RenderPixi>();
  return {
    ...real,
    /**
     * A meter that reports whatever the test sets, and records its lifecycle.
     *
     * @returns The fake meter.
     */
    createRenderTargetMeter(): RenderPixi.RenderTargetMeter {
      meters.created++;
      return {
        get bytes() {
          return meters.bytes;
        },
        get count() {
          return 1;
        },
        stop() {
          meters.stopped++;
        },
      };
    },
  };
});

let win: EventTarget & Record<string, unknown>;
let game: Game;
let tools: DebugTools | null;

/** A renderer-like object (no atlas: the overlay exists but draws nothing). */
const renderer = {
  atlas: null,
  layers: createLayerStack(),
  webGLVersion: 1,
  drawCalls: 3,
  structureRebuilds: 0,
  particles: null,
} as unknown as { structureRebuilds: number } & PixiRenderer;

/**
 * Creates tools on the fake host.
 *
 * @returns The tools.
 */
function createTools(): DebugTools {
  return createDebugTools({
    game,
    renderer,
    win: win as unknown as Window,
    now: () => 0,
    bootMs: 1,
    sceneId: () => 'game',
    visibleWorld: () => null,
  });
}

beforeEach(() => {
  win = new EventTarget() as EventTarget & Record<string, unknown>;
  game = createGame(createHeadlessPlatform(), { seed: 1 }, EMPTY_CONTENT_DB);
  renderer.structureRebuilds = 0;
  meters.bytes = 0;
  meters.created = 0;
  meters.stopped = 0;
  tools = createTools();
});

afterEach(() => {
  tools?.destroy();
  tools = null;
});

describe('shell/debug render profile (M3-02c)', () => {
  it('mirrors the renderer’s structure-rebuild count onto the overlay', () => {
    const stats = tools!.overlay.stats;
    // Fresh stats say "not counted" until the first frame reads the renderer.
    expect(stats.structureRebuilds).toBe(-1);
    tools!.beforeRender();
    expect(stats.structureRebuilds).toBe(0);
    renderer.structureRebuilds = 42;
    tools!.beforeRender();
    expect(stats.structureRebuilds).toBe(42);
  });

  it('reads the pooled render-target total from one meter, every frame', () => {
    const stats = tools!.overlay.stats;
    expect(meters.created).toBe(1);
    expect(stats.renderTargetBytes).toBe(0);
    // What a 384×216 filter pass really costs: a 512×256 power-of-two target (review F3).
    meters.bytes = 512 * 256 * 4;
    tools!.beforeRender();
    expect(stats.renderTargetBytes).toBe(512 * 256 * 4);
    // And what the CRT filter adds at 1080p (review F2).
    meters.bytes += 2048 * 2048 * 4;
    tools!.beforeRender();
    expect(stats.renderTargetBytes).toBe(512 * 256 * 4 + 2048 * 2048 * 4);
    expect(meters.created).toBe(1);
  });

  it('stops the meter on destroy, once', () => {
    tools!.destroy();
    tools!.destroy();
    tools = null;
    expect(meters.stopped).toBe(1);
  });
});
