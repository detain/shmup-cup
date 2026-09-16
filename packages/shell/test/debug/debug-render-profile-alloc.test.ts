/**
 * Allocation guard of the debug tools' render-profile line (plan M3-02c — `REB` and `RT`): the
 * two figures are read and drawn on every frame the overlay rebuilds, so `beforeRender()` must
 * still allocate nothing while both of them change every frame — a rising rebuild count (its
 * digits grow past 100,000 during a session) and a render-target total that jumps when a filter
 * first pools a target.
 *
 * Its own file, like the other guards (`docs/dev/conventions.md`): the measurement is sensitive to
 * what other suites leave on the heap. Measured on a second tools instance after a throwaway one,
 * so the factory's hidden-class transitions are not counted.
 */
import { EMPTY_CONTENT_DB, createGame, createHeadlessPlatform } from '@shmup/core';
import type * as RenderPixi from '@shmup/render-pixi';
import { createLayerStack, type PixiRenderer } from '@shmup/render-pixi';
import { describe, expect, it, vi } from 'vitest';
import { createDebugTools, type DebugTools } from '../../src/debug/index.js';
import { measureHeapGrowth } from '../../../core/test/helpers/alloc.js';

/** What the faked meter reports (the real one would sit at 0 with no filter ever drawn). */
const meter = vi.hoisted(() => ({ bytes: 0 }));

vi.mock('@shmup/render-pixi', async (importOriginal) => {
  const real = await importOriginal<typeof RenderPixi>();
  return {
    ...real,
    /**
     * A meter whose total the guard moves, so the panel really reformats the number.
     *
     * @returns The fake meter.
     */
    createRenderTargetMeter(): RenderPixi.RenderTargetMeter {
      return {
        get bytes() {
          return meter.bytes;
        },
        get count() {
          return 1;
        },
        stop() {},
      };
    },
  };
});

/** The renderer stand-in whose two M3-02c figures rise every frame. */
const renderer = {
  atlas: null,
  layers: createLayerStack(),
  webGLVersion: 1,
  drawCalls: 7,
  structureRebuilds: 0,
  particles: null,
} as unknown as { structureRebuilds: number } & PixiRenderer;

/**
 * Tools on a fake host.
 *
 * @returns The tools.
 */
function tools(): DebugTools {
  const game = createGame(createHeadlessPlatform(), {}, EMPTY_CONTENT_DB);
  return createDebugTools({
    game,
    renderer,
    win: new EventTarget() as unknown as Window,
    now: () => 0,
    bootMs: 0,
    sceneId: () => 'title',
    visibleWorld: () => null,
  });
}

describe('shell/debug render-profile allocation (M3-02c)', () => {
  it('reads and draws REB and RT every frame without allocating', () => {
    const throwaway = tools();
    for (let i = 0; i < 2000; i++) {
      renderer.structureRebuilds = i;
      throwaway.beforeRender();
    }
    throwaway.destroy();

    const t = tools();
    renderer.structureRebuilds = 0;
    t.beforeRender();
    expect(t.overlay.stats.structureRebuilds).toBe(0);
    const growth = measureHeapGrowth(
      (i) => {
        // A whole session's worth of rebuilds (the digits grow), and a render-target total that
        // moves as filters pool their targets.
        renderer.structureRebuilds = i;
        meter.bytes = ((i % 64) + 1) * 512 * 1024;
        t.beforeRender();
      },
      20_000,
      20_000,
      3,
      8 * 1024,
    );
    expect(growth.bytes).toBeLessThan(16 * 1024);
    expect(t.overlay.stats.structureRebuilds).toBeGreaterThan(0);
    expect(t.overlay.stats.renderTargetBytes).toBeGreaterThan(0);
    t.destroy();
  }, 60_000);
});
