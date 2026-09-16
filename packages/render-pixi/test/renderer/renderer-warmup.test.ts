/**
 * The renderer's **boot warm-up frame** (plan M3-02d, the render review's **F4** / **F5**), with
 * PixiJS's `WebGLRenderer` faked the way `renderer-structure-rebuilds.test.ts` fakes it, recording
 * which containers were drawn and what was visible inside them at the moment of the draw.
 *
 * Pixi links a GL program the first time it *draws* with it and grows its batch attribute buffer
 * by doubling as frames get busier, so the layer-effect, Mode-7 and CRT programs would otherwise
 * link mid-stage and the first really busy frame would allocate inside `renderer.render()`. The
 * warm-up draws one throwaway frame with everything in it, then puts everything back:
 *
 * - both passes run, and **neither goes to the canvas** — nothing is ever presented;
 * - every hidden sprite in the scene is visible *during* the warm-up draw and hidden again after;
 * - every layer-effect filter the bound world has is attached during it and detached after;
 * - the Mode-7 mesh is drawn during it and hidden again;
 * - the draw-call counter of the last real frame is not disturbed.
 */
import { LayerId, createDrawList, type RenderFrame, type WorldView } from '@shmup/core';
import { Container } from 'pixi.js';
import type * as Pixi from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { createPixiRenderer } from '../../src/renderer/index.js';
import { createAtlas, type Atlas } from '../../src/atlas/index.js';
import type { LayerEffectFilter, Mode7Shader } from '../../src/effects/index.js';
import { pageImages, testManifest } from '../helpers.js';

/** What each fake `render()` call saw: the container's label and the visible node labels in it. */
const record = vi.hoisted(() => ({
  passes: [] as Array<{
    label: string;
    toCanvas: boolean;
    visible: string[];
    filtered: number;
  }>,
}));

vi.mock('pixi.js', async (importOriginal) => {
  const real = await importOriginal<typeof Pixi>();
  /**
   * Stands in for Pixi's `GlProgram`, whose constructor probes a WebGL context for the GPU's
   * fragment precision.
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
  /**
   * Collects the labels of every visible node under a container, and counts the ones carrying a
   * filter at that moment.
   *
   * @param node - The container.
   * @param out - Collects the labels.
   * @param counts - `counts[0]` grows by one per filtered container.
   */
  const walk = (node: Pixi.Container, out: string[], counts: number[]): void => {
    for (const child of node.children) {
      if (!child.visible) continue;
      if (typeof child.label === 'string' && child.label !== '') out.push(child.label);
      if ((child.filters as unknown[] | null | undefined)?.length ?? 0) counts[0]++;
      walk(child, out, counts);
    }
  };
  /** A renderer that records what it was asked to draw. */
  class FakeWebGLRenderer {
    readonly context = { webGLVersion: 1 };
    init(): Promise<void> {
      return Promise.resolve();
    }
    resize(): void {}
    render(options: { container: Pixi.Container; target?: unknown }): void {
      const visible: string[] = [];
      const counts = [0];
      walk(options.container, visible, counts);
      record.passes.push({
        label: String(options.container.label ?? ''),
        // Pixi fills `target` in itself when it is the canvas, so an absent one *is* the canvas.
        toCanvas: options.target === undefined,
        visible,
        filtered: counts[0],
      });
      const writable = options as Record<string, unknown>;
      writable.target ??= CANVAS_TARGET;
      if (writable.target === CANVAS_TARGET) writable.clear ??= true;
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
 * The shared test atlas (the Mode-7 floor needs its tile rectangle to exist).
 *
 * @returns The atlas.
 */
function testAtlas(): Atlas {
  const manifest = testManifest();
  return createAtlas(manifest, pageImages(manifest), { onWarning: () => {} });
}

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

/** A world with a Mode-7 floor and a palette cycle on the far background. */
function floorWorld(): WorldView {
  return {
    camera: { x: 0, y: 0 },
    parallax: null,
    terrain: null,
    batches: [],
    effects: {
      raster: [],
      cycles: [
        {
          layer: LayerId.BgFar,
          colors: [0x101010, 0x202020],
          ticks: 8,
          from: 0,
          to: Number.POSITIVE_INFINITY,
        },
      ],
      mode7: {
        spriteId: 0,
        horizon: 100,
        bottom: 200,
        height: 24,
        scroll: 0.5,
        sway: 0,
        turn: 0,
        fog: 0,
        fogDepth: 64,
        alpha: 1,
        // Far ahead of the camera, so only the warm-up ever draws it here.
        from: 5000,
        to: 6000,
      },
    },
  };
}

/**
 * A layer-effect filter that does nothing (the real one needs a WebGL context).
 *
 * @returns The fake.
 */
function fakeLayerEffect(): LayerEffectFilter {
  return {
    filter: { enabled: true } as unknown as LayerEffectFilter['filter'],
    table: { offsets: new Int16Array(216), periods: new Uint16Array(216) },
    bytes: new Uint8Array(216 * 4),
    cycleFrom: new Float32Array(24),
    cycleTo: new Float32Array(24),
    apply: () => {},
    destroy: () => {},
  } as unknown as LayerEffectFilter;
}

describe('render-pixi/renderer boot warm-up (M3-02d)', () => {
  it('draws both passes off-screen with everything on, then puts it all back', async () => {
    const mode7Mesh = new Container({ label: 'mode7' });
    mode7Mesh.visible = false;
    const renderer = await createPixiRenderer({
      canvas,
      displayWidth: 1920,
      displayHeight: 1080,
      atlas: testAtlas(),
      countDrawCalls: false,
      createLayerEffectFilter: fakeLayerEffect,
      createMode7Shader: (): Mode7Shader => ({
        mesh: mode7Mesh as unknown as Mode7Shader['mesh'],
        apply: () => {},
        setTile: () => {},
        destroy: () => {},
      }),
    });
    renderer.setSpriteNames(['bg/tile']);
    const world = floorWorld();
    renderer.bindWorld(world);
    // Bound but not drawn: the floor is 5000 px ahead and the flash overlay is off.
    expect(renderer.mode7.view?.visible).toBe(false);
    expect(renderer.layerEffects.attachedMask).toBe(0);

    record.passes.length = 0;
    renderer.warmUp();
    // Two passes, and neither of them the canvas: nothing is presented.
    expect(record.passes).toHaveLength(2);
    expect(record.passes[0].label).toBe('scene');
    expect(record.passes[1].label).toBe('screen');
    expect(record.passes.map((pass) => pass.toCanvas)).toEqual([false, false]);
    // The scene pass drew the things a real frame hides: the Mode-7 mesh and the flash overlay.
    expect(record.passes[0].visible).toContain('mode7');
    // The world's one layer-effect filter was attached while it drew (so its program links here).
    expect(record.passes[0].filtered).toBe(1);
    // …and detached again: the next `sync()` re-attaches only what the camera needs.
    expect(renderer.layerEffects.attachedMask).toBe(0);
    // …and everything is hidden again afterwards.
    expect(renderer.mode7.view?.visible).toBe(false);
    expect(renderer.crt.setting).toBe('off');

    // The first real frame is unaffected: two passes, the second one the canvas.
    record.passes.length = 0;
    renderer.render(frame());
    expect(record.passes).toHaveLength(2);
    expect(record.passes.map((pass) => pass.toCanvas)).toEqual([false, true]);
    renderer.destroy();
  });

  it('leaves the draw-call counter of the last real frame alone', async () => {
    const renderer = await createPixiRenderer({
      canvas,
      displayWidth: 384,
      displayHeight: 216,
      countDrawCalls: true,
    });
    renderer.render(frame());
    const calls = renderer.drawCalls;
    renderer.warmUp();
    expect(renderer.drawCalls).toBe(calls);
    renderer.destroy();
  });
});
