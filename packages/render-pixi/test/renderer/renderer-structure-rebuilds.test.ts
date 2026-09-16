/**
 * The renderer's structure-rebuild counter (plan M3-02c — the overlay's `REB` figure and the
 * instrument behind the render review's **F1**), with PixiJS's `WebGLRenderer` faked the way
 * `renderer-draw-calls.test.ts` fakes it, but faithful to the one behaviour that matters here:
 * `AbstractRenderer.render` calls `container.enableRenderGroup()` and the render-group system then
 * clears `structureDidChange` after rebuilding the instruction set.
 *
 * With `countStructureRebuilds` the renderer counts the frames it handed Pixi a scene whose
 * structure had changed — in Pixi v8 every `sprite.visible = …` sets the flag on the *root* render
 * group, so such a frame costs a walk over the whole scene instead of the cheap "update what
 * moved" path. Without the option the figure is -1, exactly like `drawCalls`.
 */
import { createDrawList, type RenderFrame } from '@shmup/core';
import type * as Pixi from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { createPixiRenderer } from '../../src/renderer/index.js';

vi.mock('pixi.js', async (importOriginal) => {
  const real = await importOriginal<typeof Pixi>();
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
  return { ...real, WebGLRenderer: FakeWebGLRenderer, RenderTexture: FakeRenderTexture };
});

const canvas = { width: 0, height: 0 } as HTMLCanvasElement;

/**
 * A world-less frame with a given screen flash (the flash overlay's `visible` is the structure
 * change this test drives).
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

describe('render-pixi/renderer structure-rebuild counter (M3-02c)', () => {
  it('counts only the frames whose scene structure changed', async () => {
    const renderer = await createPixiRenderer({
      canvas,
      displayWidth: 384,
      displayHeight: 216,
      countStructureRebuilds: true,
    });
    expect(renderer.structureRebuilds).toBe(0);
    // The first frame creates the render group; from the second on the flag is meaningful.
    renderer.render(frameWithFlash(0));
    renderer.render(frameWithFlash(0));
    const quiet = renderer.structureRebuilds;
    // A quiet frame changes no `visible`, so Pixi may take its cheap update path.
    renderer.render(frameWithFlash(0));
    expect(renderer.structureRebuilds).toBe(quiet);
    // The flash overlay becomes visible: the root render group must rebuild.
    renderer.render(frameWithFlash(1));
    expect(renderer.structureRebuilds).toBe(quiet + 1);
    // Still visible, still the same structure.
    renderer.render(frameWithFlash(1));
    expect(renderer.structureRebuilds).toBe(quiet + 1);
    // And off again.
    renderer.render(frameWithFlash(0));
    expect(renderer.structureRebuilds).toBe(quiet + 2);
    renderer.destroy();
  });

  it('reports -1 without the option', async () => {
    const plain = await createPixiRenderer({ canvas, displayWidth: 384, displayHeight: 216 });
    expect(plain.structureRebuilds).toBe(-1);
    plain.render(frameWithFlash(0));
    plain.render(frameWithFlash(1));
    expect(plain.structureRebuilds).toBe(-1);
    plain.destroy();
  });
});
