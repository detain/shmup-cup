/**
 * Tests createPixiRenderer() with PixiJS's WebGL classes replaced by recording fakes
 * (headless Node has no WebGL; containers and sprites stay real). Checks the contract from
 * shmup_tech.md §2.2 — WebGL1 preferred, no antialiasing, a 384×216 nearest-neighbour render
 * texture, a two-pass frame and integer-scaled letterboxing — and the render contract of plan
 * §3.4: world batches bound once per WorldView into their layers, HUD / UI draw lists, screen
 * shake, flash and dim, sprite name tables, and the optional calibration pattern.
 */
import {
  LayerId,
  PLAYFIELD_Y,
  createDrawList,
  createSpriteBatch,
  pushSprite,
  type DrawList,
  type Mode7View,
  type RenderFrame,
  type ScreenView,
  type WorldView,
} from '@shmup/core';
import { Container } from 'pixi.js';
import type * as Pixi from 'pixi.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAtlas, type Atlas } from '../../src/atlas/index.js';
import type { CrtBlitHandle, Mode7Shader } from '../../src/effects/index.js';
import { PALETTE } from '../../src/palette/index.js';
import { createPixiRenderer } from '../../src/renderer/index.js';
import { pageImages, testManifest } from '../helpers.js';

/** The render-options fields the tests look at. */
interface RenderPass {
  container: unknown;
  target?: unknown;
  clear?: boolean;
  clearColor?: unknown;
  transform?: unknown;
}

const record = vi.hoisted(() => ({
  init: null as Record<string, unknown> | null,
  /** What each `render()` call saw on entry (a copy, taken before the fake writes into it). */
  renders: [] as Array<RenderPass>,
  /** The option objects passed to `render()`, by identity. */
  renderOptions: [] as Array<RenderPass>,
  resizes: [] as Array<[number, number]>,
  textureOptions: [] as Array<Record<string, unknown>>,
  textures: [] as unknown[],
  destroyedTextures: [] as unknown[][],
  rendererDestroyed: 0,
  webGLVersion: 1,
}));

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
    readonly context = {
      get webGLVersion() {
        return record.webGLVersion;
      },
    };
    init(options: Record<string, unknown>): Promise<void> {
      record.init = options;
      return Promise.resolve();
    }
    resize(width: number, height: number): void {
      record.resizes.push([width, height]);
    }
    render(options: RenderPass): void {
      record.renders.push({ ...options });
      record.renderOptions.push(options);
      // Pixi 8's AbstractRenderer.render writes into its options like this.
      options.target ??= CANVAS_TARGET;
      if (options.target === CANVAS_TARGET) {
        options.clearColor ??= [0, 0, 0, 1];
        options.clear ??= true;
      }
      options.transform ??= (options.container as Pixi.Container).localTransform;
    }
    destroy(): void {
      record.rendererDestroyed++;
    }
  }
  const FakeRenderTexture = {
    create(options: Record<string, unknown>) {
      record.textureOptions.push(options);
      const texture = new real.Texture({
        source: new real.TextureSource({
          width: options.width as number,
          height: options.height as number,
        }),
      });
      const destroy = texture.destroy.bind(texture);
      texture.destroy = (...args: [boolean?]) => {
        record.destroyedTextures.push(args);
        destroy(...args);
      };
      record.textures.push(texture);
      return texture;
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

/** A mutable RenderFrame for the tests. */
interface TestFrame extends RenderFrame {
  tick: number;
  alpha: number;
  world: WorldView | null;
  readonly hud: DrawList;
  readonly ui: DrawList;
  readonly screen: { -readonly [K in keyof ScreenView]: ScreenView[K] };
}

/**
 * A render frame with empty draw lists and no effects.
 *
 * @param tick - Tick.
 * @param world - World view.
 */
function frameOf(tick = 0, world: WorldView | null = null): TestFrame {
  return {
    tick,
    alpha: 0,
    world,
    hud: createDrawList(8, 2),
    ui: createDrawList(8, 2),
    screen: { shakeX: 0, shakeY: 0, flash: 0, dim: 0 },
  };
}

/**
 * A world with one player batch holding one ship (sprite id 0) at (100, 50).
 *
 * @returns The world and its batch.
 */
function oneShipWorld() {
  const batch = createSpriteBatch(LayerId.Player, 4);
  pushSprite(batch, 100, 50, 0, 0);
  const world: WorldView = {
    camera: { x: 0, y: 0 },
    parallax: null,
    terrain: null,
    batches: [batch],
  };
  return { world, batch };
}

beforeEach(() => {
  record.init = null;
  record.renders.length = 0;
  record.renderOptions.length = 0;
  record.resizes.length = 0;
  record.textureOptions.length = 0;
  record.textures.length = 0;
  record.destroyedTextures.length = 0;
  record.rendererDestroyed = 0;
  record.webGLVersion = 1;
});

describe('render-pixi/renderer createPixiRenderer (mocked WebGL)', () => {
  it('initialises Pixi for crisp pixel art: WebGL1 first, no AA, 1:1 resolution, letterbox colour', async () => {
    await createPixiRenderer({ canvas, displayWidth: 1920, displayHeight: 1080 });
    expect(record.init).toMatchObject({
      canvas,
      width: 1920,
      height: 1080,
      resolution: 1,
      autoDensity: false,
      antialias: false,
      roundPixels: true,
      preferWebGLVersion: 1,
      background: PALETTE.letterbox,
      hello: false,
    });
  });

  it('can be asked to try WebGL2 first and reports the version obtained', async () => {
    record.webGLVersion = 2;
    const renderer = await createPixiRenderer({
      canvas,
      displayWidth: 800,
      displayHeight: 600,
      preferWebGLVersion: 2,
    });
    expect(record.init?.preferWebGLVersion).toBe(2);
    expect(renderer.webGLVersion).toBe(2);
  });

  it('renders into a 384x216 nearest-neighbour render texture by default', async () => {
    const renderer = await createPixiRenderer({ canvas, displayWidth: 1920, displayHeight: 1080 });
    expect([renderer.width, renderer.height]).toEqual([384, 216]);
    expect(record.textureOptions).toEqual([
      { width: 384, height: 216, resolution: 1, antialias: false, scaleMode: 'nearest' },
    ]);
  });

  it('honours a custom internal resolution', async () => {
    const renderer = await createPixiRenderer({
      canvas,
      displayWidth: 1280,
      displayHeight: 720,
      width: 320,
      height: 180,
    });
    expect([renderer.width, renderer.height]).toEqual([320, 180]);
    expect(record.textureOptions[0]).toMatchObject({ width: 320, height: 180 });
    expect(renderer.viewport.scale).toBe(4);
  });

  it('draws each frame in two passes: scene → render texture (cleared), then one x5 quad → screen', async () => {
    const renderer = await createPixiRenderer({ canvas, displayWidth: 1920, displayHeight: 1080 });
    renderer.render(frameOf(10));
    expect(record.renders).toHaveLength(2);
    const [lowRes, present] = record.renders;
    expect(lowRes?.container).toBe(renderer.scene);
    expect(lowRes?.target).toBe(record.textures[0]);
    expect(lowRes?.clear).toBe(true);
    expect(present?.target).toBeUndefined();
    const screen = present?.container as Pixi.Container;
    // The two side panels of the M3-02 aspect modes sit behind the frame quad (hidden in `normal`).
    expect(screen.children).toHaveLength(3);
    expect(screen.children.filter((child) => child.visible)).toHaveLength(1);
    const quad = screen.children[2] as Pixi.Sprite;
    expect(quad.texture).toBe(record.textures[0]);
    expect([quad.scale.x, quad.x, quad.y]).toEqual([5, 0, 0]);
    expect(renderer.viewport).toMatchObject({ scale: 5, x: 0, y: 0, width: 1920, height: 1080 });
  });

  it('reuses its two pass-option objects every frame and restores what Pixi wrote into them', async () => {
    const renderer = await createPixiRenderer({ canvas, displayWidth: 1920, displayHeight: 1080 });
    const frame = frameOf(0);
    renderer.render(frame);
    frame.tick = 1;
    renderer.render(frame);
    renderer.render(frame);
    const [scenePass, screenPass] = record.renderOptions;
    expect(record.renderOptions).toHaveLength(6);
    expect(scenePass).not.toBe(screenPass);
    for (let i = 0; i < record.renderOptions.length; i++) {
      expect(record.renderOptions[i]).toBe(i % 2 === 0 ? scenePass : screenPass);
    }
    // Every call sees what a fresh literal would, whatever the previous call wrote into it.
    const screen = screenPass?.container;
    for (let i = 0; i < record.renders.length; i += 2) {
      expect(record.renders[i]).toStrictEqual({
        container: renderer.scene,
        target: record.textures[0],
        clear: true,
        clearColor: undefined,
        transform: undefined,
      });
      expect(record.renders[i + 1]).toStrictEqual({
        container: screen,
        target: undefined,
        clear: undefined,
        clearColor: undefined,
        transform: undefined,
      });
    }
    expect(screenPass?.target).not.toBeUndefined(); // the fake did write into it
  });

  it('paints a lifted navy background under the layer stack (never black)', async () => {
    const renderer = await createPixiRenderer({ canvas, displayWidth: 1920, displayHeight: 1080 });
    const [background, layers] = renderer.scene.children as [Pixi.Sprite, Pixi.Container];
    expect(background.tint).toBe(PALETTE.space);
    expect([background.scale.x, background.scale.y]).toEqual([384, 216]);
    expect(layers).toBe(renderer.layers.root);
  });

  it('shows the calibration pattern only when asked, animated by simulation tick', async () => {
    const plain = await createPixiRenderer({ canvas, displayWidth: 1920, displayHeight: 1080 });
    expect(plain.scene.children).toHaveLength(2);
    const renderer = await createPixiRenderer({
      canvas,
      displayWidth: 1920,
      displayHeight: 1080,
      testPattern: true,
    });
    expect(renderer.scene.children).toHaveLength(3);
    const pattern = renderer.scene.children[1];
    const marker = pattern.children[1];
    renderer.render(frameOf(0));
    const x0 = marker.x;
    renderer.render(frameOf(7));
    expect(marker.x - x0).toBe(7);
  });

  it('resize() floors and clamps the size, resizes the canvas and re-centres the frame', async () => {
    const renderer = await createPixiRenderer({ canvas, displayWidth: 1920, displayHeight: 1080 });
    renderer.resize(1280.9, 720.4);
    expect(record.resizes).toEqual([[1280, 720]]);
    expect(renderer.viewport).toMatchObject({ scale: 3, x: 64, y: 36, width: 1152, height: 648 });
    renderer.resize(0, -5);
    expect(record.resizes[1]).toEqual([1, 1]);
    expect(renderer.viewport.scale).toBe(1);
  });

  it('destroy() releases bindings, the scene, the render texture (with its source) and the renderer', async () => {
    const renderer = await createPixiRenderer({
      canvas,
      displayWidth: 1920,
      displayHeight: 1080,
      atlas: testAtlas(),
    });
    renderer.render(frameOf(0, oneShipWorld().world));
    const binding = renderer.bindings[0];
    renderer.destroy();
    expect(binding.container.destroyed).toBe(true);
    expect(renderer.scene.destroyed).toBe(true);
    expect(record.destroyedTextures).toEqual([[true]]);
    expect(record.rendererDestroyed).toBe(1);
  });

  it('destroy() also frees the Mode-7 shader, the CRT pass and the side panels (M3-02d)', async () => {
    // Regression: `destroy()` unbound the world (which only *hides* the floor's mesh) and never
    // destroyed the floor, so its `Shader` / `GlProgram` — and the pass-2 container's two panel
    // sprites — outlived the renderer. Everything M3-02d added on the every-frame path is freed.
    let mode7Destroyed = 0;
    let blitDestroyed = 0;
    const renderer = await createPixiRenderer({
      canvas,
      displayWidth: 1920,
      displayHeight: 1080,
      atlas: testAtlas(),
      createCrtBlit: () => ({
        mesh: new Container({ label: 'crt-blit' }) as unknown as CrtBlitHandle['mesh'],
        apply: () => {},
        destroy: () => {
          blitDestroyed++;
        },
      }),
      createMode7Shader: () => ({
        mesh: new Container() as unknown as Mode7Shader['mesh'],
        apply: () => {},
        setTile: () => {},
        destroy: () => {
          mode7Destroyed++;
        },
      }),
    });
    renderer.setSpriteNames(['bg/tile']);
    const { batch } = oneShipWorld();
    const floored: WorldView = {
      camera: { x: 0, y: 0 },
      parallax: null,
      terrain: null,
      batches: [batch],
      effects: {
        raster: [],
        cycles: [],
        mode7: {
          spriteId: 0,
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
          to: 500,
        },
      },
    };
    renderer.bindWorld(floored);
    expect(renderer.mode7.shader).not.toBeNull();
    const screen = renderer.crt.view.parent as Pixi.Container;
    const panels = screen.children.filter((child) => child !== renderer.crt.view);
    expect(panels).toHaveLength(2);
    renderer.destroy();
    expect(mode7Destroyed).toBe(1);
    expect(blitDestroyed).toBe(1);
    expect(renderer.mode7.shader).toBeNull();
    expect(renderer.mode7.view).toBeNull();
    for (const panel of panels) expect(panel.destroyed).toBe(true);
    expect(screen.destroyed).toBe(true);
  });

  it("destroy() frees the legacy filter too, on the `screenPass: 'filter'` path (M3-02d)", async () => {
    let filterDestroyed = 0;
    const fake = { enabled: true } as unknown as Pixi.Filter;
    const renderer = await createPixiRenderer({
      canvas,
      displayWidth: 1920,
      displayHeight: 1080,
      screenPass: 'filter',
      createCrtFilter: () => ({
        filter: fake,
        apply: () => {},
        setDisplayHeight: () => {},
        destroy: () => {
          filterDestroyed++;
        },
      }),
    });
    // Nothing is built while the setting is off, so nothing is destroyed either.
    renderer.destroy();
    expect(filterDestroyed).toBe(0);
    const second = await createPixiRenderer({
      canvas,
      displayWidth: 1920,
      displayHeight: 1080,
      screenPass: 'filter',
      createCrtFilter: () => ({
        filter: fake,
        apply: () => {},
        setDisplayHeight: () => {},
        destroy: () => {
          filterDestroyed++;
        },
      }),
    });
    second.setCrtFilter('full');
    second.destroy();
    expect(filterDestroyed).toBe(1);
  });
});

describe('render-pixi/renderer render contract (plan §3.4)', () => {
  it('binds one sprite binding per batch into its layer, once per WorldView object', async () => {
    const renderer = await createPixiRenderer({
      canvas,
      displayWidth: 1920,
      displayHeight: 1080,
      atlas: testAtlas(),
    });
    renderer.setSpriteNames(['ships/a']);
    const { world, batch } = oneShipWorld();
    const bullets = createSpriteBatch(LayerId.EnemyBullets, 2);
    const twoBatches: WorldView = { ...world, batches: [batch, bullets] };
    const frame = frameOf(0, twoBatches);
    renderer.render(frame);
    const bindings = renderer.bindings;
    expect(bindings.map((b) => b.layer)).toEqual([LayerId.Player, LayerId.EnemyBullets]);
    expect(renderer.layers.layers[LayerId.Player].children).toContain(bindings[0].container);
    expect(renderer.layers.layers[LayerId.EnemyBullets].children).toContain(bindings[1].container);
    frame.tick = 1;
    renderer.render(frame);
    expect(renderer.bindings).toBe(bindings);

    const other = oneShipWorld().world;
    renderer.render(frameOf(2, other));
    expect(renderer.bindings).not.toBe(bindings);
    expect(bindings[0].container.destroyed).toBe(true);
    renderer.render(frameOf(3, null));
    expect(renderer.bindings).toEqual([]);
  });

  it('syncs batches through the sprite table with the camera and playfield offsets', async () => {
    const atlas = testAtlas();
    const renderer = await createPixiRenderer({
      canvas,
      displayWidth: 1920,
      displayHeight: 1080,
      atlas,
    });
    const { world } = oneShipWorld();
    renderer.bindWorld(world);
    const bindings = renderer.bindings;
    const sprite = bindings[0].container.children[0] as Pixi.Sprite;
    renderer.render(frameOf(0, world));
    expect(sprite.texture).toBe(atlas.textures[atlas.missingFrame]); // no names set yet
    renderer.setSpriteNames(['ships/a']);
    renderer.render(frameOf(1, { ...world, camera: { x: 20, y: 10 } }));
    // a new WorldView object: rebound, then synced
    const rebound = renderer.bindings[0].container.children[0] as Pixi.Sprite;
    expect(rebound.texture).toBe(atlas.textures[17]);
    expect([rebound.x, rebound.y]).toEqual([100 - 20 - 8, 50 - 10 + PLAYFIELD_Y - 4]);
  });

  it('offsets the world group by the rounded shake and shows flash / dim overlays', async () => {
    const renderer = await createPixiRenderer({
      canvas,
      displayWidth: 1920,
      displayHeight: 1080,
      atlas: testAtlas(),
    });
    const frame = frameOf(0);
    const world = renderer.layers.world;
    const flash = world.children[world.children.length - 2] as Pixi.Sprite;
    const dim = renderer.layers.layers[LayerId.Ui].children[0] as Pixi.Sprite;
    renderer.render(frame);
    expect([world.x, world.y, flash.visible, dim.visible]).toEqual([0, 0, false, false]);
    frame.screen.shakeX = 2.6;
    frame.screen.shakeY = -1.4;
    frame.screen.flash = 0.5;
    frame.screen.dim = 7;
    renderer.render(frame);
    expect([world.x, world.y]).toEqual([3, -1]);
    expect([flash.visible, flash.alpha]).toEqual([true, 0.5]);
    expect([dim.visible, dim.alpha, dim.tint]).toEqual([true, 1, 0x000000]);
    frame.screen.flash = Number.NaN;
    frame.screen.dim = -1;
    renderer.render(frame);
    expect([flash.visible, dim.visible]).toEqual([false, false]);
  });

  it('draws the HUD list into the HUD layer and the UI list into the UI layer', async () => {
    const renderer = await createPixiRenderer({
      canvas,
      displayWidth: 1920,
      displayHeight: 1080,
      atlas: testAtlas(),
      glyphCapacity: 8,
    });
    const frame = frameOf(0);
    frame.hud.rect(0, 0, 384, 8, 0x123456);
    frame.ui.setString(0, 'AB');
    frame.ui.text(0, 10, 10);
    renderer.render(frame);
    const hud = renderer.layers.layers[LayerId.Hud].children[0];
    const ui = renderer.layers.layers[LayerId.Ui].children[1];
    expect(hud.children).toHaveLength(8);
    expect((hud.children as Pixi.Sprite[]).filter((s) => s.visible)).toHaveLength(1);
    expect((ui.children as Pixi.Sprite[]).filter((s) => s.visible)).toHaveLength(2);
    expect(renderer.metrics?.measure('AB', 'pixel')).toBe(12);
  });

  it('without an atlas: no bindings, no draw-list views, no metrics — but frames still render', async () => {
    const renderer = await createPixiRenderer({ canvas, displayWidth: 640, displayHeight: 360 });
    renderer.setSpriteNames(['ships/a']);
    renderer.render(frameOf(0, oneShipWorld().world));
    expect(renderer.atlas).toBeNull();
    expect(renderer.metrics).toBeNull();
    expect(renderer.bindings).toEqual([]);
    expect(renderer.layers.layers[LayerId.Hud].children).toHaveLength(0);
    expect(record.renders).toHaveLength(2);
  });

  it('rejects a batch with an unknown layer and leaves nothing half-bound', async () => {
    const renderer = await createPixiRenderer({
      canvas,
      displayWidth: 640,
      displayHeight: 360,
      atlas: testAtlas(),
    });
    const good = createSpriteBatch(LayerId.Fx, 1);
    const bad = { ...createSpriteBatch(LayerId.Fx, 1), layer: 99 as LayerId };
    expect(() =>
      renderer.bindWorld({
        camera: { x: 0, y: 0 },
        parallax: null,
        terrain: null,
        batches: [good, bad],
      }),
    ).toThrow(RangeError);
    expect(renderer.bindings).toEqual([]);
    // Only the renderer's own particles and score popups (plan M1-14) — no batch binding.
    expect(renderer.layers.layers[LayerId.Fx].children).toEqual([
      renderer.particles?.container,
      renderer.popups?.container,
    ]);
  });

  it('binds parallax bands and the terrain grid below the batches and syncs them (M1-07)', async () => {
    const atlas = testAtlas();
    const renderer = await createPixiRenderer({
      canvas,
      displayWidth: 1920,
      displayHeight: 1080,
      atlas,
    });
    renderer.setSpriteNames(['ships/a', 'bg/tile']);
    const stars = createSpriteBatch(LayerId.BgFar, 1);
    const tiles = new Uint8Array(100 * 25);
    tiles[24 * 100 + 3] = 1;
    const camera = { x: 10.5, y: 0 };
    const world: WorldView = {
      camera,
      parallax: {
        count: 1,
        layer: new Uint8Array([LayerId.BgFar]),
        spriteId: new Uint16Array([1]),
        offsetX: new Float64Array([3]),
        y: new Float64Array([0]),
        spacing: new Uint16Array([16]),
      },
      terrain: {
        tileSize: 8,
        cols: 100,
        rows: 25,
        tiles,
        tilesetSpriteId: 0,
        tileFrame: new Int16Array([-1, 2]),
      },
      batches: [stars],
    };
    renderer.render(frameOf(0, world));
    const { parallax, terrain } = renderer;
    expect(parallax).not.toBeNull();
    expect(terrain).not.toBeNull();
    if (parallax === null || terrain === null) return;
    const far = renderer.layers.layers[LayerId.BgFar].children;
    expect(far[0]).toBe(parallax.containers[0]);
    expect(far[1]).toBe(renderer.bindings[0].container); // batches on top of the band
    expect(renderer.layers.layers[LayerId.Terrain].children).toEqual([terrain.container]);
    expect([parallax.containers[0].x, terrain.container.x]).toEqual([-3, -10]);
    const tile = terrain.container.children[24 * terrain.columns + 3] as Pixi.Sprite;
    expect([tile.visible, tile.texture]).toEqual([true, atlas.textures[17 + 2]]);
    camera.x = 30;
    renderer.render(frameOf(1, world));
    expect(terrain.container.x).toBe(-30);
    renderer.bindWorld(null);
    expect([renderer.parallax, renderer.terrain]).toEqual([null, null]);
    expect(terrain.container.destroyed).toBe(true);
    expect(parallax.containers[0].destroyed).toBe(true);
  });

  it('binds the lasers on ENEMY_BULLETS above the bullet batch and syncs them (M1-09)', async () => {
    const renderer = await createPixiRenderer({
      canvas,
      displayWidth: 1920,
      displayHeight: 1080,
      atlas: testAtlas(),
    });
    renderer.setSpriteNames(['ships/a', 'bg/tile']);
    const bullets = createSpriteBatch(LayerId.EnemyBullets, 4);
    const lasers = {
      capacity: 2,
      count: 1,
      x: new Float64Array([100, 0]),
      y: new Float64Array([50, 0]),
      angle: new Float64Array([512, 0]),
      length: new Float64Array([80, 0]),
      width: new Float64Array([0, 0]),
      spriteId: new Uint16Array(2),
      flags: new Uint8Array(2),
    };
    const world: WorldView = {
      camera: { x: 20, y: 0 },
      parallax: null,
      terrain: null,
      batches: [bullets],
      lasers,
    };
    renderer.render(frameOf(0, world));
    const binding = renderer.lasers;
    expect(binding).not.toBeNull();
    if (binding === null) return;
    const layer = renderer.layers.layers[LayerId.EnemyBullets].children;
    expect(layer).toEqual([renderer.bindings[0].container, binding.container]);
    const line = binding.container.children[0] as Pixi.Sprite;
    expect([line.visible, line.x, line.y]).toEqual([true, 80, 50 + PLAYFIELD_Y]);
    expect(binding.visibleCount).toBe(1);
    renderer.bindWorld({ camera: { x: 0, y: 0 }, parallax: null, terrain: null, batches: [] });
    expect(renderer.lasers).toBeNull();
    expect(binding.container.destroyed).toBe(true);
  });

  it('binds the bending lasers on ENEMY_BULLETS after the lasers and syncs them (M2-02)', async () => {
    const renderer = await createPixiRenderer({
      canvas,
      displayWidth: 1920,
      displayHeight: 1080,
      atlas: testAtlas(),
    });
    renderer.setSpriteNames(['ships/a', 'bg/tile']);
    const bending = {
      capacity: 2,
      nodes: 4,
      active: new Uint8Array([1, 0]),
      filled: new Int32Array([2, 0]),
      head: new Int32Array([1, 0]),
      width: new Float64Array([6, 0]),
      spriteId: new Uint16Array(2),
      flags: new Uint8Array(2),
      x: new Float64Array([100, 110, 0, 0, 0, 0, 0, 0]),
      y: new Float64Array([50, 50, 0, 0, 0, 0, 0, 0]),
    };
    const lasers = {
      capacity: 1,
      count: 0,
      x: new Float64Array(1),
      y: new Float64Array(1),
      angle: new Float64Array(1),
      length: new Float64Array(1),
      width: new Float64Array(1),
      spriteId: new Uint16Array(1),
      flags: new Uint8Array(1),
    };
    const world: WorldView = {
      camera: { x: 0, y: 0 },
      parallax: null,
      terrain: null,
      batches: [],
      lasers,
      bendingLasers: bending,
    };
    renderer.render(frameOf(0, world));
    const binding = renderer.bendingLasers;
    expect(binding).not.toBeNull();
    if (binding === null || renderer.lasers === null) return;
    expect(renderer.layers.layers[LayerId.EnemyBullets].children).toEqual([
      renderer.lasers.container,
      binding.container,
    ]);
    expect(binding.visibleCount).toBe(2);
    renderer.bindWorld(null);
    expect(renderer.bendingLasers).toBeNull();
    expect(binding.container.destroyed).toBe(true);
  });

  it('swaps the sprite tables to a bullet palette’s variants and back (M2-02)', async () => {
    const base = testManifest();
    const variantFrames = { ...base.frames };
    const names: string[] = [];
    for (let i = 0; i < 3; i++) {
      variantFrames[`ships/a@protanopia#${i}`] = {
        p: 0,
        x: 16 * i,
        y: 10,
        w: 16,
        h: 9,
        ax: 8,
        ay: 4,
      };
      names.push(`ships/a@protanopia#${i}`);
    }
    const manifest = {
      ...base,
      frames: variantFrames,
      sprites: { ...base.sprites, 'ships/a@protanopia': { frames: names, flash: null } },
    };
    const atlas = createAtlas(manifest, pageImages(manifest), { onWarning: () => {} });
    const renderer = await createPixiRenderer({
      canvas,
      displayWidth: 1920,
      displayHeight: 1080,
      atlas,
    });
    expect(renderer.bulletPalette).toBe('standard');
    renderer.setBulletPalette('protanopia'); // before the names: applied when they come
    renderer.setSpriteNames(['ships/a']);
    const batch = createSpriteBatch(LayerId.EnemyBullets, 2);
    pushSprite(batch, 100, 50, 0, 1, 0);
    const world: WorldView = {
      camera: { x: 0, y: 0 },
      parallax: null,
      terrain: null,
      batches: [batch],
    };
    renderer.render(frameOf(0, world));
    const sprite = renderer.bindings[0].container.children[0] as Pixi.Sprite;
    expect(sprite.texture).toBe(atlas.textures[atlas.spriteBase('ships/a@protanopia') + 1]);
    renderer.setBulletPalette('standard');
    expect(renderer.bulletPalette).toBe('standard');
    renderer.render(frameOf(1, world));
    expect(sprite.texture).toBe(atlas.textures[atlas.spriteBase('ships/a') + 1]);
    renderer.setBulletPalette('deuteranopia'); // no variant: the plain frames
    renderer.render(frameOf(2, world));
    expect(sprite.texture).toBe(atlas.textures[atlas.spriteBase('ships/a') + 1]);
  });

  it('places the frame in the M3-02 aspect modes and lights the side panels', async () => {
    const renderer = await createPixiRenderer({ canvas, displayWidth: 1920, displayHeight: 1080 });
    expect(renderer.aspect).toBe('normal');
    expect([renderer.panels.panelLeft, renderer.panels.panelRight]).toEqual([0, 0]);
    renderer.render(frameOf(0));
    const screen = record.renders[1]?.container as Pixi.Container;
    // Both panels were added at index 0, so the right one is first; the frame quad is last.
    const [right, left, quad] = screen.children as Pixi.Sprite[];
    expect(quad.texture).toBe(record.textures[0]);
    expect([left.visible, right.visible]).toEqual([false, false]);
    // Classic 4:3: a 1440-wide window, a panel either side, the frame still whole and centred.
    renderer.setAspect('classic');
    expect(renderer.aspect).toBe('classic');
    expect([renderer.panels.panelLeft, renderer.panels.panelRight]).toEqual([240, 240]);
    expect([left.visible, right.visible]).toEqual([true, true]);
    expect([left.x, left.scale.x, left.scale.y]).toEqual([0, 240, 1080]);
    expect([right.x, right.scale.x]).toEqual([1680, 240]);
    // Dim, never bright: the panels sit behind the frame and cannot wash the picture out.
    expect(left.tint).toBe(PALETTE.space);
    expect(left.alpha).toBeLessThan(1);
    expect(renderer.viewport.scale).toBe(3);
    expect(renderer.viewport.x).toBe((1920 - renderer.viewport.width) / 2);
    // Ultra-wide on a 16:9 display: a cabinet window, no panels, the whole frame kept.
    renderer.setAspect('wide');
    expect([renderer.panels.panelLeft, renderer.panels.panelRight]).toEqual([0, 0]);
    expect([left.visible, right.visible]).toEqual([false, false]);
    expect(renderer.viewport.width / renderer.viewport.scaleX).toBe(384);
    // Back to normal, and setting the same mode twice changes nothing.
    renderer.setAspect('normal');
    renderer.setAspect('normal');
    expect(renderer.viewport).toMatchObject({ scale: 5, x: 0, y: 0 });
  });

  it('folds the M3-02 CRT into the pass-2 blit, told the picture and the display (M3-02d)', async () => {
    // The real blit needs a WebGL context to pick the program's precision, so it gets a fake.
    const applied: Array<[number, number, number, number, number, number]> = [];
    const mesh = new Container();
    const renderer = await createPixiRenderer({
      canvas,
      displayWidth: 3840,
      displayHeight: 2160,
      createCrtBlit: () => ({
        mesh: mesh as unknown as CrtBlitHandle['mesh'],
        apply: (look, pitch, x, y, w, h) => applied.push([look.scan, pitch, x, y, w, h]),
        destroy: () => {},
      }),
    });
    expect(renderer.screenPass).toBe('blit');
    renderer.render(frameOf(0));
    const screen = record.renders[1]?.container as Pixi.Container;
    // The blit is the frame quad of the second pass, placed and scaled by the CRT pass.
    expect(screen.children).toContain(mesh);
    expect([mesh.scale.x, mesh.scale.y]).toEqual([10, 10]);
    expect(renderer.crtFilter).toBe('off');
    // No filter is ever attached: `off` and `full` cost the same one draw call (review F2).
    expect(screen.filters ?? []).toEqual([]);
    expect(applied.at(-1)).toEqual([0, 10, 0, 0, 3840, 2160]);
    renderer.setCrtFilter('light');
    expect(renderer.crtFilter).toBe('light');
    expect(screen.filters ?? []).toEqual([]);
    // The scanline pitch is the frame's scale on the display.
    expect(applied.at(-1)?.slice(1)).toEqual([10, 0, 0, 3840, 2160]);
    expect(applied.at(-1)?.[0]).toBeGreaterThan(0);
    renderer.setCrtFilter('full');
    expect(applied.at(-1)?.[0]).toBeGreaterThan(applied.at(-2)?.[0] ?? 1);
    // A resize follows the picture through.
    renderer.resize(1920, 1080);
    expect(applied.at(-1)?.slice(1)).toEqual([5, 0, 0, 1920, 1080]);
    renderer.setCrtFilter('off');
    expect(renderer.crtFilter).toBe('off');
    expect(applied.at(-1)?.[0]).toBe(0);
    expect(screen.filters ?? []).toEqual([]);
  });

  it("keeps M3-02’s sprite + filter pass behind `screenPass: 'filter'` (M3-02d)", async () => {
    const applied: Array<[number, number, number, number]> = [];
    const heights: number[] = [];
    const fake = { enabled: true } as unknown as Pixi.Filter;
    const renderer = await createPixiRenderer({
      canvas,
      displayWidth: 3840,
      displayHeight: 2160,
      screenPass: 'filter',
      createCrtFilter: () => ({
        filter: fake,
        apply: (look, pitch, w, h) => applied.push([look.scan, pitch, w, h]),
        setDisplayHeight: (h) => heights.push(h),
        destroy: () => {},
      }),
    });
    expect(renderer.screenPass).toBe('filter');
    renderer.render(frameOf(0));
    const screen = record.renders[1]?.container as Pixi.Container;
    expect(screen.filters ?? []).toEqual([]);
    renderer.setCrtFilter('light');
    expect(screen.filters).toEqual([fake]);
    expect(applied.at(-1)?.slice(1)).toEqual([10, 3840, 2160]);
    expect(heights.at(-1)).toBe(2160);
    renderer.setCrtFilter('off');
    expect(screen.filters).toEqual([]);
  });

  it('binds a stage Mode-7 floor to the mid-background layer and follows the camera', async () => {
    // The real filter needs a WebGL context to pick its precision, so the floor gets a fake one.
    const tiles: number[][] = [];
    const origins: Array<[number, number]> = [];
    const renderer = await createPixiRenderer({
      canvas,
      displayWidth: 1920,
      displayHeight: 1080,
      atlas: testAtlas(),
      createMode7Shader: () => ({
        mesh: new Container() as unknown as Mode7Shader['mesh'],
        apply: (_view: Mode7View, u: number, v: number) => origins.push([u, v]),
        setTile: (...rect: number[]) => tiles.push(rect),
        destroy: () => {},
      }),
    });
    renderer.setSpriteNames(['bg/tile']);
    const { world, batch } = oneShipWorld();
    const floor = {
      spriteId: 0,
      horizon: 100,
      bottom: 200,
      height: 24,
      scroll: 0.5,
      sway: 0,
      turn: 0,
      fog: 0x102040,
      fogDepth: 128,
      alpha: 1,
      from: 50,
      to: 500,
    };
    const camera = { x: 0, y: 0 };
    const floored: WorldView = {
      camera,
      parallax: null,
      terrain: null,
      batches: [batch],
      effects: { raster: [], cycles: [], mode7: floor },
    };
    // Without a floor: nothing on the layer but the idle sprite, and no filter.
    renderer.bindWorld(world);
    expect(renderer.mode7.active).toBe(false);
    expect(renderer.mode7.shader).toBeNull();
    renderer.bindWorld(floored);
    expect(renderer.mode7.shader).not.toBeNull();
    expect(renderer.layers.layers[LayerId.BgMid].children[0]).toBe(renderer.mode7.view);
    // Outside the floor's range: hidden.
    renderer.render(frameOf(0, floored));
    expect(renderer.mode7.active).toBe(false);
    expect(renderer.mode7.view?.visible).toBe(false);
    // Inside it: drawn as a mesh — no filter on the layer at all (M3-02d, review F6).
    camera.x = 120;
    renderer.render(frameOf(1, floored));
    expect(renderer.mode7.active).toBe(true);
    expect(renderer.mode7.view?.visible).toBe(true);
    expect(renderer.layers.layers[LayerId.BgMid].filters ?? []).toEqual([]);
    // The tile came from the atlas (`bg/tile` is 16×16 on the 32×16 second page) and the plane's
    // origin from the camera.
    expect(tiles).toEqual([[0, 0, 16, 16, 32, 16]]);
    expect(origins.at(-1)).toEqual([60, 0]);
    // A world without one unbinds it again.
    renderer.bindWorld(world);
    expect(renderer.mode7.active).toBe(false);
    expect(renderer.mode7.view?.visible).toBe(false);
  });

  it('rejects a parallax band off the background layers before binding anything', async () => {
    const renderer = await createPixiRenderer({
      canvas,
      displayWidth: 640,
      displayHeight: 360,
      atlas: testAtlas(),
    });
    expect(() =>
      renderer.bindWorld({
        camera: { x: 0, y: 0 },
        parallax: {
          count: 1,
          layer: new Uint8Array([LayerId.Player]),
          spriteId: new Uint16Array([0]),
          offsetX: new Float64Array(1),
          y: new Float64Array(1),
          spacing: new Uint16Array([16]),
        },
        terrain: null,
        batches: [createSpriteBatch(LayerId.Fx, 1)],
      }),
    ).toThrow(RangeError);
    expect([renderer.bindings, renderer.parallax]).toEqual([[], null]);
  });
});
