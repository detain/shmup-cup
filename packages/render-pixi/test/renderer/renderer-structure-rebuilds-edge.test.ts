/**
 * Edge cases of the renderer's structure-rebuild counter (plan M3-02c — the overlay's `REB`
 * figure, the instrument behind the render review's **F1**;
 * `renderer-structure-rebuilds.test.ts` has the happy path):
 *
 * - it is **independent of `countDrawCalls`**: either option can be on alone, and the figure the
 *   other one feeds stays at -1;
 * - `countStructureRebuilds: false` and `undefined` behave the same (-1, never counted);
 * - the count is monotonic, never passes the number of frames rendered, starts at 0 before the
 *   first frame and survives `destroy()` (the shell reads it in `beforeRender`, and a stopped app
 *   must not make the figure jump);
 * - it is read **before** pass 1 — the flag Pixi clears while rendering is still the previous
 *   frame's otherwise, and the counter would stay at 0 for good.
 */
import { createDrawList, type RenderFrame } from '@shmup/core';
import type * as Pixi from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { createPixiRenderer } from '../../src/renderer/index.js';

vi.mock('pixi.js', async (importOriginal) => {
  const real = await importOriginal<typeof Pixi>();
  /**
   * Stands in for Pixi's `GlProgram`, whose constructor probes a WebGL context for the GPU's
   * fragment precision (M3-02d: the pass-2 blit builds a program with the renderer).
   */
  class FakeGlProgram {
    /**
     * Ignores the sources.
     *
     * @param options - The program options.
     * @returns A plain stand-in program.
     */
    static from(options: object): object {
      return { ...options, destroy: (): void => {} };
    }
  }
  const CANVAS_TARGET = { label: 'canvas render target' };
  /** A renderer that enables and clears the root render group the way Pixi's does. */
  class FakeWebGLRenderer {
    readonly context = { webGLVersion: 1 };
    init(): Promise<void> {
      return Promise.resolve();
    }
    resize(): void {}
    render(options: { container: Pixi.Container }): void {
      const writable = options as Record<string, unknown>;
      writable.target ??= CANVAS_TARGET;
      if (writable.target === CANVAS_TARGET) writable.clear ??= true;
      writable.transform ??= options.container.localTransform;
      // `AbstractRenderer.render` → the render-group system rebuilds and clears the flag.
      options.container.enableRenderGroup();
      options.container.renderGroup.structureDidChange = false;
    }
    destroy(): void {}
  }
  const FakeRenderTexture = {
    create(options: { width: number; height: number }) {
      return new real.Texture({
        source: new real.TextureSource({ width: options.width, height: options.height }),
      });
    },
  };
  return {
    ...real,
    WebGLRenderer: FakeWebGLRenderer,
    RenderTexture: FakeRenderTexture,
    GlProgram: FakeGlProgram,
  };
});

const canvas = { width: 0, height: 0 } as HTMLCanvasElement;

/**
 * A world-less frame with a given screen flash (the flash overlay's `visible` is the structure
 * change these tests drive).
 *
 * @param flash - Flash strength 0 … 1.
 * @returns The frame.
 */
function frameWithFlash(flash: number): RenderFrame {
  return {
    tick: 0,
    alpha: 0,
    world: null,
    hud: createDrawList(1, 1),
    ui: createDrawList(1, 1),
    screen: { shakeX: 0, shakeY: 0, flash, dim: 0 },
  };
}

describe('render-pixi/renderer structure-rebuild counter, edge cases (M3-02c)', () => {
  it('counts rebuilds without counting draw calls, and the other way round', async () => {
    const rebuildsOnly = await createPixiRenderer({
      canvas,
      displayWidth: 384,
      displayHeight: 216,
      countStructureRebuilds: true,
    });
    expect(rebuildsOnly.drawCalls).toBe(-1);
    rebuildsOnly.render(frameWithFlash(0));
    rebuildsOnly.render(frameWithFlash(1));
    expect(rebuildsOnly.structureRebuilds).toBeGreaterThan(0);
    // No WebGL context behind the fake renderer, so draw calls stay uncounted whatever happens.
    expect(rebuildsOnly.drawCalls).toBe(-1);
    rebuildsOnly.destroy();

    const drawsOnly = await createPixiRenderer({
      canvas,
      displayWidth: 384,
      displayHeight: 216,
      countDrawCalls: true,
    });
    drawsOnly.render(frameWithFlash(1));
    expect(drawsOnly.structureRebuilds).toBe(-1);
    drawsOnly.destroy();
  });

  it('treats an explicit false like the default: never counted, always -1', async () => {
    for (const option of [{ countStructureRebuilds: false }, {}]) {
      const renderer = await createPixiRenderer({
        canvas,
        displayWidth: 384,
        displayHeight: 216,
        ...option,
      });
      expect(renderer.structureRebuilds).toBe(-1);
      for (let i = 0; i < 8; i++) renderer.render(frameWithFlash(i % 2));
      expect(renderer.structureRebuilds).toBe(-1);
      renderer.destroy();
      // A destroyed renderer still reports the same figure rather than throwing.
      expect(renderer.structureRebuilds).toBe(-1);
    }
  });

  it('rises by at most one per frame, and keeps its total after destroy', async () => {
    const renderer = await createPixiRenderer({
      canvas,
      displayWidth: 384,
      displayHeight: 216,
      countStructureRebuilds: true,
    });
    // Before the first frame: counted, but nothing has been rendered.
    expect(renderer.structureRebuilds).toBe(0);
    const frames = 40;
    let previous = 0;
    for (let i = 0; i < frames; i++) {
      // Every other frame toggles the flash overlay's visibility, i.e. the scene's structure.
      renderer.render(frameWithFlash(i % 2));
      const now = renderer.structureRebuilds;
      expect(now).toBeGreaterThanOrEqual(previous);
      expect(now - previous).toBeLessThanOrEqual(1);
      previous = now;
    }
    expect(previous).toBeLessThanOrEqual(frames);
    // The toggling frames are the ones that rebuild: about half of them, and certainly not none —
    // which is what a counter reading the flag *after* `renderer.render()` would report, because
    // Pixi clears it while rendering.
    expect(previous).toBeGreaterThanOrEqual(frames / 2 - 1);
    renderer.destroy();
    expect(renderer.structureRebuilds).toBe(previous);
  });

  it('does not count a frame that changed nothing', async () => {
    const renderer = await createPixiRenderer({
      canvas,
      displayWidth: 384,
      displayHeight: 216,
      countStructureRebuilds: true,
    });
    // Two frames to get the render group built and the flag cleared.
    renderer.render(frameWithFlash(0));
    renderer.render(frameWithFlash(0));
    const quiet = renderer.structureRebuilds;
    for (let i = 0; i < 20; i++) renderer.render(frameWithFlash(0));
    expect(renderer.structureRebuilds).toBe(quiet);
    renderer.destroy();
  });
});
