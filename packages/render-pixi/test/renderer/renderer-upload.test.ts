/**
 * `renderer.uploadTextureSource` (plan R1-05): the atlas residency's eager upload. It hands the
 * source to Pixi's `renderer.texture.initSource` — which binds it, uploading it when it has no GPU
 * copy — every time it is asked (Pixi, not the renderer, knows whether a copy exists), draws
 * nothing and leaves the frame state alone. PixiJS's `WebGLRenderer` is faked the way
 * `renderer-warmup.test.ts` fakes it, with a recording texture system.
 */
import { createDrawList, type RenderFrame } from '@shmup/core';
import type * as Pixi from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { createAtlas } from '../../src/atlas/index.js';
import { createPixiRenderer } from '../../src/renderer/index.js';
import { pageImages, testManifest } from '../helpers.js';

/** What the fake renderer saw. */
const record = vi.hoisted(() => ({
  /** Sources handed to `texture.initSource`, in order. */
  initialised: [] as unknown[],
  /** `render()` calls. */
  renders: 0,
}));

vi.mock('pixi.js', async (importOriginal) => {
  const real = await importOriginal<typeof Pixi>();
  /** Stands in for Pixi's `GlProgram`, whose constructor probes a WebGL context. */
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
  /** A renderer whose texture system records the sources it is asked to initialise. */
  class FakeWebGLRenderer {
    readonly context = { webGLVersion: 1 };
    readonly texture = {
      initSource: (source: unknown): void => {
        record.initialised.push(source);
      },
    };
    init(): Promise<void> {
      return Promise.resolve();
    }
    resize(): void {}
    render(options: { container: Pixi.Container; target?: unknown }): void {
      record.renders++;
      const writable = options as Record<string, unknown>;
      writable.transform ??= options.container.localTransform;
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
 * A world-less frame.
 *
 * @returns The frame.
 */
function frame(): RenderFrame {
  return {
    tick: 0,
    alpha: 0,
    world: null,
    hud: createDrawList(1, 1),
    ui: createDrawList(1, 1),
    screen: { shakeX: 0, shakeY: 0, flash: 0, dim: 0 },
  };
}

describe('render-pixi/renderer uploadTextureSource (R1-05)', () => {
  it('hands each atlas page to Pixi’s initSource, every time, and draws nothing', async () => {
    const manifest = testManifest();
    const atlas = createAtlas(manifest, pageImages(manifest), { onWarning: () => {} });
    const renderer = await createPixiRenderer({
      canvas,
      displayWidth: 1920,
      displayHeight: 1080,
      atlas,
      countDrawCalls: false,
    });
    record.initialised.length = 0;
    record.renders = 0;
    for (const page of atlas.pages) renderer.uploadTextureSource(page);
    expect(record.initialised).toEqual([...atlas.pages]);
    // Again: Pixi decides whether a copy exists (a bind when it does), so the renderer forwards.
    renderer.uploadTextureSource(atlas.pages[0]);
    expect(record.initialised).toHaveLength(atlas.pages.length + 1);
    expect(record.initialised[atlas.pages.length]).toBe(atlas.pages[0]);
    // An upload is not a frame.
    expect(record.renders).toBe(0);
    // An unloaded page goes up again the same way (the residency's zone change).
    atlas.pages[0].unload();
    renderer.uploadTextureSource(atlas.pages[0]);
    expect(record.initialised[record.initialised.length - 1]).toBe(atlas.pages[0]);
    // The next real frame still draws both passes.
    renderer.render(frame());
    expect(record.renders).toBe(2);
    renderer.destroy();
  });
});
