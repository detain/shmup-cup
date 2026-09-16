/**
 * Edge cases of the shell's M3-02c render-profile wiring
 * (`debug-render-profile.test.ts` has the happy path):
 *
 * - a renderer built **without** `countStructureRebuilds` reports -1, and the overlay has to show
 *   that rather than a zero;
 * - the pooled render-target total comes from the meter, never from the renderer, and one tools
 *   instance owns exactly one meter for its whole life;
 * - two tools instances at once (the dev server's hot reload, a test that boots twice) get a meter
 *   each, and destroying one stops only its own — the render-pixi side promises never to take a
 *   later meter's hook, and the shell must not undo that by sharing one;
 * - `destroy()` stops the meter even when no frame was ever rendered.
 */
import { createGame, createHeadlessPlatform, EMPTY_CONTENT_DB, type Game } from '@shmup/core';
import type * as RenderPixi from '@shmup/render-pixi';
import { createLayerStack, type PixiRenderer } from '@shmup/render-pixi';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDebugTools, type DebugTools } from '../../src/debug/index.js';

const meters = vi.hoisted(() => ({
  /** Every meter handed out, newest last. */
  all: [] as Array<{ bytes: number; stopped: number }>,
}));

vi.mock('@shmup/render-pixi', async (importOriginal) => {
  const real = await importOriginal<typeof RenderPixi>();
  return {
    ...real,
    /**
     * A meter that reports whatever the test sets on it, and records its own lifecycle.
     *
     * @returns The fake meter.
     */
    createRenderTargetMeter(): RenderPixi.RenderTargetMeter {
      const state = { bytes: 0, stopped: 0 };
      meters.all.push(state);
      return {
        get bytes() {
          return state.bytes;
        },
        get count() {
          return 1;
        },
        stop() {
          state.stopped++;
        },
      };
    },
  };
});

let win: EventTarget & Record<string, unknown>;
let game: Game;
const open: DebugTools[] = [];

/** A renderer-like object whose two M3-02c figures the test drives. */
const renderer = {
  atlas: null,
  layers: createLayerStack(),
  webGLVersion: 1,
  drawCalls: 3,
  structureRebuilds: 0,
  renderTargetBytes: 123, // never read: the total comes from the meter
  particles: null,
} as unknown as { structureRebuilds: number } & PixiRenderer;

/**
 * Creates tools on the fake host and remembers them for the teardown.
 *
 * @returns The tools.
 */
function createTools(): DebugTools {
  const tools = createDebugTools({
    game,
    renderer,
    win: win as unknown as Window,
    now: () => 0,
    bootMs: 1,
    sceneId: () => 'game',
    visibleWorld: () => null,
  });
  open.push(tools);
  return tools;
}

beforeEach(() => {
  win = new EventTarget() as EventTarget & Record<string, unknown>;
  game = createGame(createHeadlessPlatform(), { seed: 1 }, EMPTY_CONTENT_DB);
  renderer.structureRebuilds = 0;
  meters.all.length = 0;
});

afterEach(() => {
  for (const tools of open.splice(0)) tools.destroy();
});

describe('shell/debug render profile, edge cases (M3-02c)', () => {
  it('passes a renderer’s "not counted" through instead of turning it into a zero', () => {
    // A release-shaped renderer (no `countStructureRebuilds`) reports -1; the overlay draws no
    // REB figure at all for that, which is not the same as "0 rebuilds".
    renderer.structureRebuilds = -1;
    const tools = createTools();
    tools.beforeRender();
    expect(tools.overlay.stats.structureRebuilds).toBe(-1);
    // And it follows the renderer back up again if counting is switched on later.
    renderer.structureRebuilds = 3;
    tools.beforeRender();
    expect(tools.overlay.stats.structureRebuilds).toBe(3);
  });

  it('reads the render-target total from its meter alone', () => {
    const tools = createTools();
    expect(meters.all).toHaveLength(1);
    const meter = meters.all[0];
    for (let i = 0; i < 5; i++) {
      meter.bytes = i * 1024;
      tools.beforeRender();
      expect(tools.overlay.stats.renderTargetBytes).toBe(i * 1024);
    }
    // Still one meter after all those frames — the hook is installed once, not per frame.
    expect(meters.all).toHaveLength(1);
  });

  it('gives every tools instance its own meter, and stops only that one', () => {
    const first = createTools();
    const second = createTools();
    expect(meters.all).toHaveLength(2);
    meters.all[0].bytes = 4096;
    meters.all[1].bytes = 8192;
    first.beforeRender();
    second.beforeRender();
    expect(first.overlay.stats.renderTargetBytes).toBe(4096);
    expect(second.overlay.stats.renderTargetBytes).toBe(8192);

    first.destroy();
    expect(meters.all.map((m) => m.stopped)).toEqual([1, 0]);
    // The survivor keeps working after the other one went.
    meters.all[1].bytes = 16_384;
    second.beforeRender();
    expect(second.overlay.stats.renderTargetBytes).toBe(16_384);
    second.destroy();
    expect(meters.all.map((m) => m.stopped)).toEqual([1, 1]);
  });

  it('stops the meter even when no frame was ever rendered', () => {
    const tools = createTools();
    tools.destroy();
    expect(meters.all.map((m) => m.stopped)).toEqual([1]);
  });
});
