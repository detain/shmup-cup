/**
 * Edge cases of the renderer's render groups and of {@link PixiRenderer.groupRebuilds} (plan
 * M3-02e, the render review's **F1** and **F9**; `renderer-render-groups.test.ts` has the happy
 * path), with PixiJS's WebGL classes faked as there — faithful to the two behaviours that matter:
 * `AbstractRenderer.render` enables the render group of the container it is given, and Pixi's
 * render-group system clears `structureDidChange` on **every** group of the tree once it has
 * rebuilt it.
 *
 * - the option is plumbed from `createPixiRenderer` to the layer stack, and only an explicit
 *   `false` turns the groups off (nothing shipped does);
 * - `groupRebuilds` counts the *whole* tree of groups, not just the scene's own: a frame that
 *   dirties several layers at once counts several, which is the point of the figure — it is what
 *   keeps the fall in `structureRebuilds` from being read as churn that merely moved out of
 *   sight;
 * - it never falls, never drops below `structureRebuilds`, keeps its total after `destroy()` and
 *   is -1 — for ever, however busy the frames — without `countStructureRebuilds`;
 * - (the allocation guard for the counter has its own file,
 *   `renderer-render-groups-alloc.test.ts`);
 * - **F9**: the five full-screen overlays of pass 1 take the atlas' own `ui/pixel`, falling back
 *   to `Texture.WHITE` when there is no atlas or the manifest has none — while the pass-2 side
 *   panels keep `Texture.WHITE` on purpose.
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
import { Texture } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { createAtlas, type Atlas } from '../../src/atlas/index.js';
import { RENDER_GROUP_LAYERS } from '../../src/layers/index.js';
import { createPixiRenderer, type PixiRenderer } from '../../src/renderer/index.js';
import { pageImages, testManifest } from '../helpers.js';

/** The pass-2 container the fake renderer last presented (the side panels live on it). */
const presented = vi.hoisted((): { screen: unknown } => ({ screen: null }));

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
      if (writable.target === CANVAS_TARGET) {
        writable.clear ??= true;
        presented.screen = options.container;
      }
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
 * The test atlas.
 *
 * @param withFallbacks - Include `ui/pixel` and `ui/missing` (default yes).
 * @returns The atlas.
 */
function testAtlas(withFallbacks = true): Atlas {
  const manifest = testManifest({ withFallbacks });
  return createAtlas(manifest, pageImages(manifest), { onWarning: () => {} });
}

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
 * A frame over a world with two sprite batches on two different grouped layers, plus HUD and UI
 * draw lists — so one frame can dirty several layer groups at once.
 *
 * @returns The frame and its two batches.
 */
function busyFrame(): { frame: TestFrame; enemies: SpriteBatch; items: SpriteBatch } {
  const enemies = createSpriteBatch(LayerId.AirEnemies, 8);
  const items = createSpriteBatch(LayerId.Items, 8);
  const world: WorldView = {
    camera: { x: 0, y: 0 },
    parallax: null,
    terrain: null,
    batches: [enemies, items],
    effects: null,
    hitboxes: null,
  };
  const frame: TestFrame = {
    tick: 0,
    alpha: 0,
    world,
    hud: createDrawList(8, 1),
    ui: createDrawList(8, 1),
    screen: { shakeX: 0, shakeY: 0, flash: 0, dim: 0 },
  };
  return { frame, enemies, items };
}

/**
 * Fills the frame's batches and lists with `count` sprites each, so the next render toggles
 * `visible` on four layers' bindings at once.
 *
 * @param parts - The frame and its batches.
 * @param count - Sprites per layer.
 */
function load(parts: ReturnType<typeof busyFrame>, count: number): void {
  const { frame, enemies, items } = parts;
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
}

/**
 * A renderer over the test atlas.
 *
 * @param extra - More options.
 * @returns The renderer.
 */
async function makeRenderer(
  extra: Partial<Parameters<typeof createPixiRenderer>[0]> = {},
): Promise<PixiRenderer> {
  const renderer = await createPixiRenderer({
    canvas,
    displayWidth: 960,
    displayHeight: 540,
    atlas: testAtlas(),
    glyphCapacity: 32,
    ...extra,
  });
  renderer.setSpriteNames(['ships/a']);
  return renderer;
}

describe('render-pixi/renderer render groups, the option (M3-02e)', () => {
  it('plumbs the switch to the layer stack, and only an explicit false turns it off', async () => {
    for (const option of [{}, { renderGroups: true }, { renderGroups: undefined }]) {
      const renderer = await createPixiRenderer({
        canvas,
        displayWidth: 384,
        displayHeight: 216,
        ...option,
      });
      expect(renderer.layers.renderGroups).toBe(true);
      for (const id of RENDER_GROUP_LAYERS) {
        expect(renderer.layers.layers[id].isRenderGroup, `layer ${id}`).toBe(true);
      }
      expect(renderer.layers.layers[LayerId.Debug].isRenderGroup).toBe(false);
      renderer.destroy();
    }
    const plain = await createPixiRenderer({
      canvas,
      displayWidth: 384,
      displayHeight: 216,
      renderGroups: false,
    });
    expect(plain.layers.renderGroups).toBe(false);
    for (const layer of plain.layers.layers) expect(layer.isRenderGroup).toBe(false);
    plain.destroy();
  });
});

describe('render-pixi/renderer groupRebuilds, edge cases (M3-02e)', () => {
  it('counts every dirty group of the frame, not one per frame', async () => {
    const renderer = await makeRenderer({ countStructureRebuilds: true });
    const parts = busyFrame();
    // Bind the world and let every group settle (each starts dirty).
    load(parts, 4);
    renderer.render(parts.frame);
    renderer.render(parts.frame);
    parts.frame.tick = 1;
    renderer.render(parts.frame);
    const quiet = renderer.groupRebuilds;
    const scene = renderer.structureRebuilds;
    // One frame that hides something on four grouped layers at once.
    parts.frame.tick = 2;
    load(parts, 1);
    renderer.render(parts.frame);
    expect(renderer.groupRebuilds - quiet).toBeGreaterThan(1);
    // …and it stayed out of the scene's own group: that is the whole of F1.
    expect(renderer.structureRebuilds).toBe(scene);
    renderer.destroy();
  });

  it('never falls, never drops below structureRebuilds, and keeps its total after destroy', async () => {
    const renderer = await makeRenderer({ countStructureRebuilds: true });
    const parts = busyFrame();
    expect([renderer.structureRebuilds, renderer.groupRebuilds]).toEqual([0, 0]);
    let groups = 0;
    let scene = 0;
    for (let i = 0; i < 24; i++) {
      parts.frame.tick = i;
      load(parts, i % 2 === 0 ? 6 : 2);
      // Every fourth frame also flashes, which is on the world container (the scene's own group).
      parts.frame.screen.flash = i % 4 === 0 ? 1 : 0;
      renderer.render(parts.frame);
      expect(renderer.groupRebuilds, `frame ${i}`).toBeGreaterThanOrEqual(groups);
      expect(renderer.structureRebuilds, `frame ${i}`).toBeGreaterThanOrEqual(scene);
      expect(renderer.structureRebuilds - scene, `frame ${i}`).toBeLessThanOrEqual(1);
      groups = renderer.groupRebuilds;
      scene = renderer.structureRebuilds;
      // The scene's group is one of the groups the second figure counts, so it can never be the
      // larger of the two.
      expect(renderer.groupRebuilds).toBeGreaterThanOrEqual(renderer.structureRebuilds);
    }
    expect(groups).toBeGreaterThan(scene);
    renderer.destroy();
    expect([renderer.structureRebuilds, renderer.groupRebuilds]).toEqual([scene, groups]);
  });

  it('stays at -1 without the option, however busy the frames and with the groups off', async () => {
    for (const option of [{}, { countStructureRebuilds: false }, { renderGroups: false }]) {
      const renderer = await makeRenderer(option);
      const parts = busyFrame();
      expect(renderer.groupRebuilds).toBe(-1);
      for (let i = 0; i < 8; i++) {
        parts.frame.tick = i;
        load(parts, i % 2 === 0 ? 6 : 1);
        parts.frame.screen.dim = i % 2;
        renderer.render(parts.frame);
      }
      expect([renderer.structureRebuilds, renderer.groupRebuilds]).toEqual([-1, -1]);
      renderer.destroy();
      expect(renderer.groupRebuilds).toBe(-1);
    }
  });
});

describe('render-pixi/renderer full-screen overlay textures (M3-02e, review F9)', () => {
  /**
   * The five full-screen overlays of pass 1, in the order the renderer builds them.
   *
   * @param renderer - The renderer.
   * @returns Backdrop, playfield dim, flash, additive flash and the menu dim.
   */
  const overlays = (renderer: PixiRenderer): Pixi.Sprite[] => {
    const world = renderer.layers.world.children;
    return [
      renderer.scene.children[0] as Pixi.Sprite,
      world[world.length - 3] as Pixi.Sprite,
      world[world.length - 2] as Pixi.Sprite,
      world[world.length - 1] as Pixi.Sprite,
      renderer.layers.layers[LayerId.Ui].children[0] as Pixi.Sprite,
    ];
  };

  it('draws all five from the atlas’ own ui/pixel, so pass 1 samples one texture', async () => {
    const atlas = testAtlas();
    const renderer = await makeRenderer({ atlas });
    const pixel = atlas.textures[atlas.pixelFrame];
    expect(pixel).not.toBe(Texture.WHITE);
    for (const sprite of overlays(renderer)) expect(sprite.texture).toBe(pixel);
    renderer.destroy();
  });

  it('keeps Texture.WHITE for the pass-2 side panels, deliberately', async () => {
    const renderer = await makeRenderer();
    const parts = busyFrame();
    load(parts, 2);
    renderer.setAspect('classic');
    renderer.render(parts.frame);
    const screen = presented.screen as Pixi.Container;
    // The panels are added in front of everything else in the screen pass (`addChildAt(…, 0)`),
    // whose only other node is the blit sampling the frame texture — so the atlas page would be a
    // binding added here, not one saved.
    const panels = [screen.children[0], screen.children[1]] as Pixi.Sprite[];
    for (const panel of panels) expect(panel.texture).toBe(Texture.WHITE);
    renderer.destroy();
  });

  it('falls back to Texture.WHITE without an atlas, and when the manifest has no ui/pixel', async () => {
    const bare = await createPixiRenderer({ canvas, displayWidth: 384, displayHeight: 216 });
    for (const sprite of overlays(bare)) expect(sprite.texture).toBe(Texture.WHITE);
    bare.destroy();

    // `createAtlas` already substitutes `Texture.WHITE` for a missing `ui/pixel`, so the renderer
    // needs no second fallback — but the overlays must still end up with a usable texture.
    const atlas = testAtlas(false);
    expect(atlas.textures[atlas.pixelFrame]).toBe(Texture.WHITE);
    const renderer = await makeRenderer({ atlas });
    for (const sprite of overlays(renderer)) expect(sprite.texture).toBe(Texture.WHITE);
    renderer.destroy();
  });
});
