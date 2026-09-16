/**
 * The renderer's presentation polish (plan M2-08), with PixiJS's WebGL classes faked as in
 * `renderer-fx.test.ts` and the layer effects' filters faked (Pixi cannot build a GL program in
 * Node): the scale modes, the hitbox layer, the world's stage effects bound to the layer effects
 * (off with the setting, shifted with the shake), the additive Mega Crash flash, render
 * interpolation of the camera, the sprites and the parallax — and a frame with all of it on
 * allocates nothing more than the existing guard allows.
 */
import {
  FlashKind,
  LayerId,
  PLAYFIELD_Y,
  RasterKind,
  createDrawList,
  createHitboxBatch,
  createSpriteBatch,
  pushSprite,
  type DrawList,
  type RenderFrame,
  type ScreenView,
  type StageEffectsView,
  type WorldView,
} from '@shmup/core';
import type * as Pixi from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { createAtlas, type Atlas } from '../../src/atlas/index.js';
import { createRasterTable, type LayerEffectFilter } from '../../src/effects/index.js';
import { createPixiRenderer, type PixiRenderer } from '../../src/renderer/index.js';
import { pageImages, testManifest } from '../helpers.js';
import { measureHeapGrowth } from '../../../core/test/helpers/alloc.js';

/** Containers of the present pass (the frame quad's parent), recorded by the fake renderer. */
const presented = vi.hoisted((): { screen: unknown } => ({ screen: null }));

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

/** @returns The small test atlas. */
function testAtlas(): Atlas {
  const manifest = testManifest();
  return createAtlas(manifest, pageImages(manifest), { onWarning: () => {} });
}

/** Fake layer-effect filters and what they were told. */
function fakeFilters(): {
  create: (rows: number) => LayerEffectFilter;
  shifts: number[];
} {
  const shifts: number[] = [];
  return {
    shifts,
    create: (rows) => ({
      filter: { enabled: true } as unknown as Pixi.Filter,
      table: createRasterTable(rows),
      bytes: new Uint8Array(rows * 4),
      cycleFrom: new Float32Array(24),
      cycleTo: new Float32Array(24),
      apply(_raster, _count, rowShift) {
        if (shifts.length < 16) shifts.push(rowShift);
      },
      destroy() {},
    }),
  };
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

/** The stage effects of the test world: a wave on BG_MID. */
const EFFECTS: StageEffectsView = {
  raster: [
    {
      layer: LayerId.BgMid,
      kind: RasterKind.Wave,
      top: 100,
      bottom: 150,
      amplitude: 3,
      wavelength: 20,
      period: 96,
      factorTop: 0,
      factorBottom: 0,
      bands: [],
      wrap: 0,
      from: 0,
      to: Number.POSITIVE_INFINITY,
    },
  ],
  cycles: [],
};

/**
 * A frame over a world with an enemy batch, a parallax band, hitboxes and the stage effects.
 *
 * @returns The frame, its camera, the enemy batch, the parallax offsets and the hitboxes.
 */
function frameWithWorld() {
  const camera = { x: 0, y: 0 };
  const enemies = createSpriteBatch(LayerId.AirEnemies, 4);
  pushSprite(enemies, 100, 50, 0, 0);
  const hitboxes = createHitboxBatch(2);
  hitboxes.x[0] = 60;
  hitboxes.y[0] = 40;
  hitboxes.radius[0] = 1.5;
  hitboxes.count = 1;
  const parallax = {
    count: 1,
    layer: new Uint8Array([LayerId.BgMid]),
    spriteId: new Uint16Array([0]),
    offsetX: new Float64Array(1),
    y: new Float64Array(1),
    spacing: new Uint16Array([32]),
  };
  const world: WorldView = {
    camera,
    parallax,
    terrain: null,
    batches: [enemies],
    effects: EFFECTS,
    hitboxes,
  };
  const frame: TestFrame = {
    tick: 0,
    alpha: 0,
    world,
    hud: createDrawList(4, 1),
    ui: createDrawList(4, 1),
    screen: { shakeX: 0, shakeY: 0, flash: 0, dim: 0 },
  };
  return { frame, camera, enemies, parallax, hitboxes };
}

/**
 * A renderer over the test atlas with fake layer-effect filters.
 *
 * @param extra - More options.
 * @returns The renderer and the fake filters' record.
 */
async function makeRenderer(
  extra: Partial<Parameters<typeof createPixiRenderer>[0]> = {},
): Promise<{ renderer: PixiRenderer; shifts: number[] }> {
  const filters = fakeFilters();
  const renderer = await createPixiRenderer({
    canvas,
    displayWidth: 1000,
    displayHeight: 600,
    atlas: testAtlas(),
    glyphCapacity: 32,
    createLayerEffectFilter: filters.create,
    ...extra,
  });
  renderer.setSpriteNames(['ships/a']);
  return { renderer, shifts: filters.shifts };
}

describe('render-pixi/renderer scale modes (plan M2-08)', () => {
  it('places the frame quad per scale mode and keeps the mode across resizes', async () => {
    const { renderer } = await makeRenderer();
    const { frame } = frameWithWorld();
    renderer.render(frame);
    const quad = (presented.screen as Pixi.Container).children[2] as Pixi.Sprite;
    expect(renderer.scaleMode).toBe('integer');
    expect([quad.scale.x, quad.scale.y, quad.x, quad.y]).toEqual([2, 2, 116, 84]);
    renderer.setScaleMode('stretch');
    expect(renderer.viewport.mode).toBe('stretch');
    expect(quad.scale.x).toBeCloseTo(1000 / 384, 10);
    expect(quad.scale.y).toBeCloseTo(600 / 216, 10);
    expect([quad.x, quad.y]).toEqual([0, 0]);
    renderer.setScaleMode('fit');
    expect([renderer.viewport.width, renderer.viewport.height]).toEqual([1000, 563]);
    renderer.resize(1280, 720);
    expect(renderer.viewport).toMatchObject({ mode: 'fit', width: 1280, height: 720, x: 0, y: 0 });
    renderer.setScaleMode('fit'); // unchanged: nothing to do
    expect(renderer.scaleMode).toBe('fit');
  });

  it('starts in the scale mode it was created with', async () => {
    const { renderer } = await makeRenderer({ scaleMode: 'stretch' });
    expect(renderer.viewport).toMatchObject({ mode: 'stretch', width: 1000, height: 600 });
  });
});

describe('render-pixi/renderer hitbox markers (plan M2-08)', () => {
  it('binds the hitbox view on the HITBOX layer and draws it only while shown', async () => {
    const { renderer } = await makeRenderer();
    const { frame, hitboxes } = frameWithWorld();
    renderer.render(frame);
    const layer = renderer.layers.layers[LayerId.Hitbox];
    const markers = renderer.hitboxes;
    if (markers === null) throw new Error('no hitbox binding');
    expect(layer.children).toContain(markers.container);
    expect([renderer.showHitbox, layer.visible, markers.visibleCount]).toEqual([false, false, 0]);
    renderer.setShowHitbox(true);
    frame.tick = 1;
    renderer.render(frame);
    expect([layer.visible, markers.visibleCount]).toEqual([true, 1]);
    const core = markers.container.children[1] as Pixi.Sprite;
    expect([core.x, core.y]).toEqual([59, 39 + PLAYFIELD_Y]);
    hitboxes.count = 0;
    renderer.setShowHitbox(false);
    frame.tick = 2;
    renderer.render(frame);
    expect([layer.visible, markers.visibleCount]).toEqual([false, 1]); // not synced while hidden
  });

  it('starts with the markers shown when asked', async () => {
    const { renderer } = await makeRenderer({ showHitbox: true });
    expect(renderer.layers.layers[LayerId.Hitbox].visible).toBe(true);
  });
});

describe('render-pixi/renderer layer effects (plan M2-08)', () => {
  it("binds the world's effects, filters their layer, follows the shake and the setting", async () => {
    const { renderer, shifts } = await makeRenderer();
    const { frame } = frameWithWorld();
    renderer.render(frame);
    expect(renderer.layerEffects.attachedMask).toBe(1 << LayerId.BgMid);
    expect(renderer.layers.layers[LayerId.BgMid].filters).toHaveLength(1);
    frame.screen.shakeY = -3;
    frame.tick = 1;
    renderer.render(frame);
    expect(shifts.slice(0, 2)).toEqual([0, -3]);
    renderer.effects.settings.rasterEffects = false;
    frame.tick = 2;
    renderer.render(frame);
    expect(renderer.layerEffects.attachedMask).toBe(0);
    // A frame without the world unbinds them.
    renderer.effects.settings.rasterEffects = true;
    frame.world = null;
    renderer.render(frame);
    expect(renderer.layerEffects.attachedMask).toBe(0);
    expect(renderer.layerEffects.filterOf(LayerId.BgMid)).not.toBeNull();
  });
});

describe('render-pixi/renderer Mega Crash flash (plan M2-08)', () => {
  it('draws the Mega Crash flash additively and the others as an overlay', async () => {
    const { renderer } = await makeRenderer();
    const { frame } = frameWithWorld();
    const world = renderer.layers.world.children;
    const flash = world[world.length - 2] as Pixi.Sprite;
    const flashAdd = world[world.length - 1] as Pixi.Sprite;
    expect(flashAdd.blendMode).toBe('add');
    renderer.render(frame);
    renderer.effects.flash(FlashKind.MegaCrash, 10);
    frame.tick = 1;
    renderer.render(frame);
    expect([flashAdd.visible, flash.visible]).toEqual([true, false]);
    expect(flashAdd.alpha).toBeCloseTo(0.7, 5);
    // A brighter frame flash (white overlay) wins over it.
    frame.screen.flash = 1;
    frame.tick = 2;
    renderer.render(frame);
    expect([flashAdd.visible, flash.visible, flash.alpha]).toEqual([false, true, 1]);
    frame.screen.flash = 0;
    frame.tick = 100;
    renderer.render(frame);
    renderer.effects.flash(FlashKind.Warning, 10);
    frame.tick = 101;
    renderer.render(frame);
    expect([flashAdd.visible, flash.visible, flash.tint]).toEqual([false, true, 0xf85858]);
  });
});

describe('render-pixi/renderer render interpolation (plan M2-08)', () => {
  it('draws the camera, sprites and bands between the last two ticks by alpha', async () => {
    const { renderer } = await makeRenderer();
    expect(renderer.interpolation).toBe(false);
    renderer.setInterpolation(true);
    expect(renderer.interpolation).toBe(true);
    const { frame, camera, enemies, parallax } = frameWithWorld();
    frame.tick = 10;
    renderer.render(frame);
    const enemy = renderer.bindings[0].container.children[0] as Pixi.Sprite;
    const band = renderer.parallax?.containers[0];
    const anchor = enemy.x - 100;
    // One tick later: the camera moved 2 px, the enemy 4 px, the band 2 px.
    frame.tick = 11;
    camera.x = 2;
    enemies.x[0] = 104;
    parallax.offsetX[0] = 2;
    frame.alpha = 0.5;
    renderer.render(frame);
    expect(enemy.x - anchor).toBe(Math.round(102 - 1));
    expect(band?.x).toBe(-1); // the half-way offset
    frame.alpha = 0;
    frame.tick = 11;
    renderer.render(frame);
    expect(enemy.x - anchor).toBe(100);
    // Off again: the current tick, as before.
    renderer.setInterpolation(false);
    frame.alpha = 0.5;
    renderer.render(frame);
    expect(enemy.x - anchor).toBe(104 - 2);
    expect(band?.x).toBe(-2);
  });

  it('renders a busy frame with interpolation and effects without allocating', async () => {
    const { renderer } = await makeRenderer({ interpolation: true, showHitbox: true });
    const { frame, camera, enemies, parallax } = frameWithWorld();
    renderer.render(frame);
    const bytes = measureHeapGrowth(
      (step) => {
        const tick = step >> 1;
        frame.tick = tick;
        frame.alpha = (step & 1) * 0.5;
        camera.x = tick * 0.75;
        enemies.x[0] = 100 + (tick % 50);
        parallax.offsetX[0] = (tick * 0.25) % 32;
        frame.screen.shakeY = tick % 3;
        renderer.render(frame);
      },
      10_000,
      20_000,
    ).bytes;
    // The renderer's guard for an animated world (see renderer-fx.test.ts).
    expect(bytes).toBeLessThan(1.5 * 1024 * 1024);
  });
});
