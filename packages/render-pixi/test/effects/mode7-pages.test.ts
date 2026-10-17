/**
 * The **Mode-7 floor binds the atlas page its tile lives on** (plan_resolution.md R1-02).
 *
 * The floor's shader samples its tile straight out of an atlas page. Until R1-02 the renderer
 * built the shader on `atlas.pages[0]` and never changed it, while the tile's UV rectangle
 * (`uTileRect`) came from the tile's **own** page — harmless with today's one-page atlas, and a
 * floor drawn out of the wrong texture as soon as R3-04's atlas has more pages. These tests drive
 * the real shader (`createMode7Shader`, with Pixi's `GlProgram` faked because it probes a WebGL
 * context) over the shared two-page test atlas, whose `bg/tile` sits on page 1:
 *
 * - through the real renderer, a floor on page 1's tile samples page 1, with page 1's UV
 *   rectangle; a floor on a page-0 tile moves it back; the same page again changes nothing;
 * - the page is bound at bind time only: frames inside the floor's range never set a resource of
 *   the shader's bind group (Pixi rebuilds the group when one changes);
 * - `Mode7Floor.bind` hands its page to the shader, keeps the shader's page when given none, and
 *   ignores the page when there is no floor to draw.
 */
import {
  FRAME_H,
  FRAME_W,
  createDrawList,
  type Mode7View,
  type RenderFrame,
  type WorldView,
} from '@shmup/core';
import { BindGroup, Container, TextureSource } from 'pixi.js';
import type * as Pixi from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAtlas, type Atlas } from '../../src/atlas/index.js';
import { createMode7Floor, createMode7Shader, type Mode7Shader } from '../../src/effects/index.js';
import { createPixiRenderer } from '../../src/renderer/index.js';
import { pageImages, testManifest } from '../helpers.js';

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
  const CANVAS_TARGET = { label: 'canvas render target' };
  /** A renderer that draws nothing (headless Node has no WebGL). */
  class FakeWebGLRenderer {
    readonly context = { webGLVersion: 1 };
    init(): Promise<void> {
      return Promise.resolve();
    }
    resize(): void {}
    render(options: { container: Pixi.Container; target?: unknown }): void {
      // Pixi 8's AbstractRenderer.render writes into its options like this.
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

/** Sprite names of the test worlds: 0 = `bg/tile` (atlas page 1), 1 = `ships/a` (page 0). */
const NAMES = ['bg/tile', 'ships/a'];

/** @returns The shared two-page test atlas (warnings silenced). */
function testAtlas(): Atlas {
  const manifest = testManifest();
  return createAtlas(manifest, pageImages(manifest), { onWarning: () => {} });
}

/**
 * A stage floor.
 *
 * @param spriteId - The floor tile's sprite (an index into {@link NAMES}).
 * @returns The view.
 */
function floorView(spriteId: number): Mode7View {
  return {
    spriteId,
    horizon: 100,
    bottom: 200,
    height: 24,
    scroll: 0.5,
    sway: 0,
    turn: 0,
    fog: 0x102040,
    fogDepth: 128,
    alpha: 1,
    from: 0,
    to: Number.POSITIVE_INFINITY,
  };
}

/**
 * A world with no sprites and a Mode-7 floor.
 *
 * @param spriteId - The floor tile's sprite.
 * @returns The world view (its camera is writable).
 */
function floorWorld(spriteId: number): WorldView & { camera: { x: number; y: number } } {
  return {
    camera: { x: 0, y: 0 },
    parallax: null,
    terrain: null,
    batches: [],
    effects: { raster: [], cycles: [], mode7: floorView(spriteId) },
  };
}

/**
 * A render frame with empty draw lists.
 *
 * @param tick - Tick.
 * @param world - World view.
 * @returns The frame.
 */
function frameOf(tick: number, world: WorldView): RenderFrame {
  return {
    tick,
    alpha: 0,
    world,
    hud: createDrawList(1, 1),
    ui: createDrawList(1, 1),
    screen: { shakeX: 0, shakeY: 0, flash: 0, dim: 0 },
  };
}

/**
 * The resources of a real Mode-7 shader's Pixi `Shader`.
 *
 * @param mode7 - The shader handle, or `null`.
 * @returns `uTile` (the sampled page) and the tile's UV rectangle.
 */
function resourcesOf(mode7: Mode7Shader | null): { uTile: unknown; uTileRect: number[] } {
  const resources = mode7?.mesh.shader?.resources as
    { uTile: unknown; mode7Uniforms: Pixi.UniformGroup } | undefined;
  if (resources === undefined) throw new Error('no Mode-7 shader');
  const uniforms = resources.mode7Uniforms.uniforms as { uTileRect: Float32Array };
  return { uTile: resources.uTile, uTileRect: [...uniforms.uTileRect] };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('render-pixi/effects the Mode-7 floor samples its tile’s own atlas page (R1-02)', () => {
  it('binds page 1 for a tile on page 1, page 0 for one on page 0, through the renderer', async () => {
    const atlas = testAtlas();
    expect(atlas.pages).toHaveLength(2);
    const renderer = await createPixiRenderer({
      canvas,
      displayWidth: 1920,
      displayHeight: 1080,
      atlas,
    });
    renderer.setSpriteNames(NAMES);
    renderer.bindWorld(floorWorld(0));
    // The default factory built the real shader, at the frame's size.
    const shader = renderer.mode7.shader;
    expect(shader).not.toBeNull();
    expect([...(shader?.mesh.geometry.positions ?? [])]).toEqual([
      0,
      0,
      FRAME_W,
      0,
      FRAME_W,
      FRAME_H,
      0,
      FRAME_H,
    ]);
    // `bg/tile` is 16×16 at (0, 0) of the 32×16 page 1: that page is sampled, with its UV.
    let bound = resourcesOf(shader);
    expect(bound.uTile).toBe(atlas.pages[1]);
    expect(bound.uTile).not.toBe(atlas.pages[0]);
    expect(bound.uTileRect).toEqual([0, 0, 16 / 32, 16 / 16]);
    // A floor on `ships/a` (16×9 at (0, 0) of the 64×32 page 0) moves it back to page 0 — the
    // same shader, rebound.
    renderer.bindWorld(floorWorld(1));
    expect(renderer.mode7.shader).toBe(shader);
    bound = resourcesOf(shader);
    expect(bound.uTile).toBe(atlas.pages[0]);
    expect(bound.uTileRect).toEqual([0, 0, 16 / 64, 9 / 32]);
    renderer.destroy();
  });

  it('sets the page at bind time only: the same page again and every frame leave it alone', async () => {
    const atlas = testAtlas();
    const renderer = await createPixiRenderer({
      canvas,
      displayWidth: 1280,
      displayHeight: 720,
      atlas,
    });
    renderer.setSpriteNames(NAMES);
    const world = floorWorld(0);
    renderer.bindWorld(world);
    const setResource = vi.spyOn(BindGroup.prototype, 'setResource');
    /** @returns How many times an atlas page was set as a bind-group resource since the spy. */
    const pageWrites = (): number =>
      setResource.mock.calls.filter(([resource]) => atlas.pages.includes(resource as TextureSource))
        .length;
    // Frames inside the floor's range: the camera moves, the plane follows, the page stays.
    for (let tick = 0; tick < 30; tick++) {
      world.camera.x = tick * 3;
      renderer.render(frameOf(tick, world));
    }
    expect(renderer.mode7.active).toBe(true);
    expect(pageWrites()).toBe(0);
    expect(resourcesOf(renderer.mode7.shader).uTile).toBe(atlas.pages[1]);
    // Rebinding a floor on the same page writes nothing either.
    renderer.bindWorld(floorWorld(0));
    expect(pageWrites()).toBe(0);
    // A floor on the other page writes it exactly once.
    renderer.bindWorld(floorWorld(1));
    expect(pageWrites()).toBe(1);
    renderer.destroy();
  });

  it('Mode7Floor.bind hands its page to the shader, or keeps the shader’s page without one', () => {
    const page0 = new TextureSource({ width: 64, height: 32 });
    const page1 = new TextureSource({ width: 32, height: 16 });
    const floor = createMode7Floor({
      layer: new Container(),
      createShader: (w, h) => createMode7Shader(page0, w, h),
    });
    const rect = [0, 0, 16, 16, 32, 16];
    floor.bind(floorView(0), rect, page1);
    expect(resourcesOf(floor.shader).uTile).toBe(page1);
    // No page given: the shader keeps the one it has.
    floor.bind(floorView(0), rect);
    expect(resourcesOf(floor.shader).uTile).toBe(page1);
    floor.bind(floorView(0), rect, null);
    expect(resourcesOf(floor.shader).uTile).toBe(page1);
    // Nothing to draw (no floor, or no tile in the atlas): the page is not touched.
    floor.bind(null, rect, page0);
    expect(resourcesOf(floor.shader).uTile).toBe(page1);
    floor.bind(floorView(0), null, page0);
    expect(resourcesOf(floor.shader).uTile).toBe(page1);
    // Frames never touch it.
    floor.bind(floorView(0), rect, page0);
    for (let x = 0; x < 50; x++) floor.sync({ x, y: x % 7 });
    expect(floor.active).toBe(true);
    expect(resourcesOf(floor.shader).uTile).toBe(page0);
    floor.destroy();
  });
});
