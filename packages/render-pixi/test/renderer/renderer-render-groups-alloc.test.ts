/**
 * The allocation guard of {@link PixiRenderer.groupRebuilds} (plan M3-02e): the walk over the
 * scene's render groups runs inside `render()`, on every frame of a dev build, so it must
 * allocate nothing (plan §1.3, `docs/dev/conventions.md` "zero allocation in hot paths"). Its own
 * file, as every guard has.
 *
 * It is measured as an **A/B**: the same loop through the same renderer options, once with
 * `countStructureRebuilds` and once without. A busy frame through a bound world allocates a few
 * hundred bytes of its own — the renderer's existing guards budget the same order
 * (`renderer-polish.test.ts`) — and that is in both figures, so their *difference* is what the
 * per-frame walk over the scene's dozen render groups costs. Measured: the two arms report the
 * same number to the byte.
 */
import {
  LayerId,
  createDrawList,
  createSpriteBatch,
  pushSprite,
  type DrawList,
  type RenderFrame,
  type ScreenView,
  type SpriteBatch,
  type WorldView,
} from '@shmup/core';
import type * as Pixi from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { createAtlas } from '../../src/atlas/index.js';
import { createPixiRenderer } from '../../src/renderer/index.js';
import { measureHeapGrowth } from '../../../core/test/helpers/alloc.js';
import { pageImages, testManifest } from '../helpers.js';

vi.mock('pixi.js', async (importOriginal) => {
  const real = await importOriginal<typeof Pixi>();
  /** Stands in for Pixi's `GlProgram`, whose constructor probes a WebGL context (M3-02d). */
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
   * Clears the rebuild flag of a group and of every group below it, as Pixi's render-group system
   * does once it has rebuilt each one.
   *
   * @param group - The root group of the tree.
   */
  const clearRebuilt = (group: Pixi.RenderGroup): void => {
    group.structureDidChange = false;
    for (const child of group.renderGroupChildren) clearRebuilt(child);
  };
  /** A renderer that enables and clears the render groups the way Pixi's does. */
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
      options.container.enableRenderGroup();
      clearRebuilt(options.container.renderGroup);
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

/** Frames each measured window renders. */
const ITERATIONS = 2000;

/** A mutable frame. */
interface TestFrame extends RenderFrame {
  tick: number;
  alpha: number;
  world: WorldView | null;
  readonly hud: DrawList;
  readonly ui: DrawList;
  readonly screen: { -readonly [K in keyof ScreenView]: ScreenView[K] };
}

/**
 * Measures one loop of busy frames through a fresh renderer.
 *
 * @param countStructureRebuilds - Whether the renderer counts the rebuilds.
 * @returns Bytes the measured window allocated, and the group rebuilds it counted.
 */
async function measure(
  countStructureRebuilds: boolean,
): Promise<{ bytes: number; groupRebuilds: number }> {
  const manifest = testManifest();
  const renderer = await createPixiRenderer({
    canvas,
    displayWidth: 960,
    displayHeight: 540,
    atlas: createAtlas(manifest, pageImages(manifest), { onWarning: () => {} }),
    glyphCapacity: 32,
    countStructureRebuilds,
  });
  renderer.setSpriteNames(['ships/a']);
  const enemies: SpriteBatch = createSpriteBatch(LayerId.AirEnemies, 8);
  const items: SpriteBatch = createSpriteBatch(LayerId.Items, 8);
  const frame: TestFrame = {
    tick: 0,
    alpha: 0,
    world: {
      camera: { x: 0, y: 0 },
      parallax: null,
      terrain: null,
      batches: [enemies, items],
      effects: null,
      hitboxes: null,
    },
    hud: createDrawList(8, 1),
    ui: createDrawList(8, 1),
    screen: { shakeX: 0, shakeY: 0, flash: 0, dim: 0 },
  };
  renderer.render(frame);
  const bytes = measureHeapGrowth(
    (step) => {
      // A different number of sprites on four grouped layers every frame, so the bindings really
      // do toggle `visible` and the groups the counter walks really are dirty.
      const count = (step % 6) + 1;
      enemies.count = 0;
      items.count = 0;
      frame.hud.clear();
      frame.ui.clear();
      for (let i = 0; i < count; i++) {
        pushSprite(enemies, 10 + i, 20, 0, 0);
        pushSprite(items, 30 + i, 40, 0, 0);
        frame.hud.sprite(0, 0, 10 + i, 10);
        frame.ui.sprite(0, 0, 20 + i, 20);
      }
      frame.tick = step;
      renderer.render(frame);
    },
    ITERATIONS,
    2 * ITERATIONS,
  ).bytes;
  const { groupRebuilds } = renderer;
  renderer.destroy();
  return { bytes, groupRebuilds };
}

describe('render-pixi/renderer groupRebuilds allocation guard (M3-02e)', () => {
  it('walks the scene’s render groups every frame without allocating', async () => {
    const counted = await measure(true);
    const plain = await measure(false);
    // The counter really ran, and really is off in the other arm.
    expect(counted.groupRebuilds).toBeGreaterThan(ITERATIONS);
    expect(plain.groupRebuilds).toBe(-1);
    // 16 bytes an iteration of head-room: one allocation per frame in the walk would be tens of
    // bytes an iteration, and one per group over ten times that.
    expect(counted.bytes - plain.bytes).toBeLessThan(16 * ITERATIONS);
    // And the frame itself stays inside the renderer's existing per-frame budget either way, so
    // the A/B above is a difference of two small numbers rather than of two runaway ones.
    expect(counted.bytes).toBeLessThan(1.5 * 1024 * 1024);
    expect(plain.bytes).toBeLessThan(1.5 * 1024 * 1024);
  });
});
