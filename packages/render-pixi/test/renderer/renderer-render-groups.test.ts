/**
 * The scene's render groups (plan M3-02e, the render review's **F1**), with PixiJS's
 * `WebGLRenderer` faked the way `renderer-structure-rebuilds.test.ts` fakes it — and faithful to
 * the two behaviours that matter here: `AbstractRenderer.render` enables the render group of the
 * container it is given, and Pixi's render-group system clears `structureDidChange` on **every**
 * group of the tree once it has rebuilt that group's instruction set.
 *
 * What it pins: hiding or showing something inside a grouped layer marks that layer's group and
 * leaves the scene's own alone (so the whole ~6,400-object tree is not re-walked), while the
 * overlays that live on the world container still mark the scene's. And that
 * {@link PixiRenderer.groupRebuilds} counts the churn the scene's counter no longer sees, so the
 * fall in `structureRebuilds` cannot be read as work that merely moved out of sight.
 */
import { createDrawList, type RenderFrame } from '@shmup/core';
import type * as Pixi from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { createPixiRenderer } from '../../src/renderer/index.js';

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
   * Clears the rebuild flag of a group and of every group below it, as
   * `RenderGroupSystem._updateRenderGroups` does once it has rebuilt each one.
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

/**
 * A world-less frame with a given flash and dim.
 *
 * @remarks
 * The flash overlay is a child of the **world** container, which belongs to the scene's own render
 * group; the menu dim is the first child of the **UI** layer, which is a group of its own. So the
 * two knobs drive the two counters apart.
 *
 * @param flash - Screen flash 0 … 1 (the world overlay).
 * @param dim - Menu dim 0 … 1 (the UI layer).
 * @returns The frame.
 */
function frameOf(flash: number, dim: number): RenderFrame {
  return {
    tick: 0,
    alpha: 0,
    world: null,
    hud: createDrawList(1, 1),
    ui: createDrawList(1, 1),
    screen: { shakeX: 0, shakeY: 0, flash, dim },
  };
}

describe('render-pixi/renderer render groups (M3-02e)', () => {
  it('keeps a grouped layer’s churn out of the scene’s own rebuild counter', async () => {
    const renderer = await createPixiRenderer({
      canvas,
      displayWidth: 384,
      displayHeight: 216,
      countStructureRebuilds: true,
    });
    // The first frames create the groups (every one of them starts dirty).
    renderer.render(frameOf(0, 0));
    renderer.render(frameOf(0, 0));
    const scene = renderer.structureRebuilds;
    const groups = renderer.groupRebuilds;
    // A quiet frame changes no `visible` anywhere.
    renderer.render(frameOf(0, 0));
    expect(renderer.structureRebuilds).toBe(scene);
    expect(renderer.groupRebuilds).toBe(groups);
    // The menu dim appears: the UI layer's group rebuilds, the scene's does not.
    renderer.render(frameOf(0, 1));
    expect(renderer.structureRebuilds).toBe(scene);
    expect(renderer.groupRebuilds).toBe(groups + 1);
    // The screen flash appears: it is on the world container, so this one does cost a rebuild of
    // the scene's group — but the layers' groups are left alone.
    renderer.render(frameOf(1, 1));
    expect(renderer.structureRebuilds).toBe(scene + 1);
    expect(renderer.groupRebuilds).toBe(groups + 2);
    renderer.destroy();
  });

  it('rebuilds the whole scene for the same dim with renderGroups: false', async () => {
    const renderer = await createPixiRenderer({
      canvas,
      displayWidth: 384,
      displayHeight: 216,
      countStructureRebuilds: true,
      renderGroups: false,
    });
    renderer.render(frameOf(0, 0));
    renderer.render(frameOf(0, 0));
    const scene = renderer.structureRebuilds;
    renderer.render(frameOf(0, 0));
    expect(renderer.structureRebuilds).toBe(scene);
    // One render group for everything: the dim is in it, so the whole instruction set goes.
    renderer.render(frameOf(0, 1));
    expect(renderer.structureRebuilds).toBe(scene + 1);
    // And with a single group the two counters are the same figure.
    expect(renderer.groupRebuilds).toBe(renderer.structureRebuilds);
    renderer.destroy();
  });

  it('reports -1 for both counters without countStructureRebuilds', async () => {
    const plain = await createPixiRenderer({ canvas, displayWidth: 384, displayHeight: 216 });
    expect(plain.structureRebuilds).toBe(-1);
    expect(plain.groupRebuilds).toBe(-1);
    plain.render(frameOf(0, 0));
    plain.render(frameOf(1, 1));
    expect(plain.groupRebuilds).toBe(-1);
    plain.destroy();
  });
});
