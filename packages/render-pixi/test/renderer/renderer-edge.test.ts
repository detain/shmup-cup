/**
 * Edge cases of createPixiRenderer() (PixiJS's WebGL classes faked as in
 * `renderer-wiring.test.ts`; containers and sprites stay real): the render path never creates,
 * removes or re-parents a Pixi object once a world is bound, keeps reusing its two pass-option
 * objects (regression for the per-frame option literals, review round 1) across resizes and
 * rebinds, and allocates next to nothing per frame (a static frame; an animated world + HUD,
 * where re-tinting quads used to allocate inside Pixi) while retaining nothing. Also covers
 * overlay placement after binding, recovery after a rejected world, sprite-name changes
 * reaching an unchanged HUD list, a font the atlas lacks, and shake rounding.
 */
import {
  LayerId,
  SpriteFlag,
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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAtlas, type Atlas } from '../../src/atlas/index.js';
import { createPixiRenderer, type PixiRenderer } from '../../src/renderer/index.js';
import { pageImages, testManifest } from '../helpers.js';
import { forceGc, measureHeapGrowth } from '../../../core/test/helpers/alloc.js';

const record = vi.hoisted(() => ({
  /** The option objects passed to `render()`, by identity (only while `keep` is set). */
  options: [] as unknown[],
  keep: true,
  renders: 0,
}));

vi.mock('pixi.js', async (importOriginal) => {
  const real = await importOriginal<typeof Pixi>();
  const CANVAS_TARGET = { label: 'canvas render target' };
  class FakeWebGLRenderer {
    readonly context = { webGLVersion: 1 };
    init(): Promise<void> {
      return Promise.resolve();
    }
    resize(): void {}
    render(options: { container: Pixi.Container; target?: unknown; clear?: boolean }): void {
      record.renders++;
      if (record.keep) record.options.push(options);
      // Write into the options like Pixi 8's AbstractRenderer.render does.
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
  return { ...real, WebGLRenderer: FakeWebGLRenderer, RenderTexture: FakeRenderTexture };
});

const canvas = { width: 0, height: 0 } as HTMLCanvasElement;

/** Sprite name table of these tests: 0 = ships/a, 1 = bg/tile. */
const NAMES = ['ships/a', 'bg/tile'];

/** @returns The small test atlas. */
function testAtlas(): Atlas {
  const manifest = testManifest();
  return createAtlas(manifest, pageImages(manifest), { onWarning: () => {} });
}

/** A mutable frame. */
interface TestFrame extends RenderFrame {
  tick: number;
  world: WorldView | null;
  readonly hud: DrawList;
  readonly ui: DrawList;
  readonly screen: { -readonly [K in keyof ScreenView]: ScreenView[K] };
}

/**
 * A frame with its own HUD / UI lists.
 *
 * @param world - World view.
 */
function frameOf(world: WorldView | null = null): TestFrame {
  return {
    tick: 0,
    alpha: 0,
    world,
    hud: createDrawList(32, 2),
    ui: createDrawList(8, 2),
    screen: { shakeX: 0, shakeY: 0, flash: 0, dim: 0 },
  };
}

/** A world with a player batch (4) and an enemy-bullet batch (16). */
function busyWorld(): { world: WorldView; player: SpriteBatch; bullets: SpriteBatch } {
  const player = createSpriteBatch(LayerId.Player, 4);
  const bullets = createSpriteBatch(LayerId.EnemyBullets, 16);
  const world: WorldView = {
    camera: { x: 0, y: 0 },
    parallax: null,
    terrain: null,
    batches: [player, bullets],
  };
  return { world, player, bullets };
}

/**
 * Fills the frame for a tick: varying sprite counts, flags, HUD commands and effects.
 *
 * @param frame - The frame.
 * @param player - Player batch.
 * @param bullets - Bullet batch.
 * @param tick - Tick.
 */
function animate(frame: TestFrame, player: SpriteBatch, bullets: SpriteBatch, tick: number): void {
  frame.tick = tick;
  player.count = 0;
  pushSprite(player, 100 + (tick % 7), 50, 0, tick % 3, tick % 4 === 0 ? SpriteFlag.Flash : 0);
  bullets.count = 0;
  for (let i = 0; i < tick % 17; i++) {
    pushSprite(bullets, i * 9, tick % 200, 1, 0, i % 5 === 0 ? SpriteFlag.Hidden : 0);
  }
  frame.hud.clear();
  frame.hud.rect(0, 0, 384, 8, 0x1d2a5c);
  frame.hud.number(tick * 10, 20, 0, 8);
  frame.hud.text(0, 4, 0);
  frame.screen.shakeX = (tick % 5) - 2;
  frame.screen.flash = tick % 30 === 0 ? 0.5 : 0;
}

/**
 * Every display object under a container, depth first (the container included).
 *
 * @param root - Root container.
 * @param out - Accumulator.
 */
function descendants(root: Pixi.Container, out: Pixi.Container[] = []): Pixi.Container[] {
  out.push(root);
  for (const child of root.children) descendants(child, out);
  return out;
}

/**
 * Parent of every display object, in tree order.
 *
 * @param renderer - The renderer.
 */
const structure = (renderer: PixiRenderer): Array<[Pixi.Container, Pixi.Container | null]> =>
  descendants(renderer.scene).map((node) => [node, node.parent]);

/** @returns A ready renderer over the test atlas, sprite names set. */
async function makeRenderer(options: { font?: string; testPattern?: boolean } = {}) {
  const renderer = await createPixiRenderer({
    canvas,
    displayWidth: 1920,
    displayHeight: 1080,
    atlas: testAtlas(),
    glyphCapacity: 64,
    ...options,
  });
  renderer.setSpriteNames(NAMES);
  return renderer;
}

beforeEach(() => {
  record.options.length = 0;
  record.keep = true;
  record.renders = 0;
});

describe('render-pixi/renderer per-frame work (edge)', () => {
  it('never creates, removes or re-parents a Pixi object while rendering a bound world', async () => {
    const renderer = await makeRenderer();
    const { world, player, bullets } = busyWorld();
    const frame = frameOf(world);
    frame.hud.setString(0, 'AB');
    renderer.bindWorld(world);
    const before = structure(renderer);
    for (let tick = 0; tick < 300; tick++) {
      animate(frame, player, bullets, tick);
      renderer.render(frame);
    }
    const after = structure(renderer);
    expect(after).toHaveLength(before.length);
    expect(
      after.every(([node, parent], i) => node === before[i][0] && parent === before[i][1]),
    ).toBe(true);
  });

  it('passes the same two option objects on every frame, across resizes and rebinds', async () => {
    const renderer = await makeRenderer();
    const { world } = busyWorld();
    const frame = frameOf(world);
    renderer.render(frame);
    const [scenePass, screenPass] = record.options;
    renderer.resize(1280, 720);
    renderer.render(frame);
    renderer.bindWorld(busyWorld().world);
    renderer.render(frameOf(busyWorld().world));
    renderer.render(frameOf(null));
    expect(record.options).toHaveLength(8);
    record.options.forEach((options, i) =>
      expect(options).toBe(i % 2 === 0 ? scenePass : screenPass),
    );
  });

  it('allocates next to nothing per frame when the frame did not change (review round 1)', async () => {
    const renderer = await makeRenderer();
    const { world, player, bullets } = busyWorld();
    const frame = frameOf(world);
    frame.hud.setString(0, 'AB');
    animate(frame, player, bullets, 12);
    record.keep = false;
    const bytes = measureHeapGrowth(() => renderer.render(frame), 10_000, 20_000).bytes;
    // Two option literals per frame were ~1.7 MB here; the reused objects leave ~0.1 MB of noise.
    expect(bytes).toBeLessThan(512 * 1024);
  });

  it('animating a bound world and the HUD allocates little and retains nothing', async () => {
    const renderer = await makeRenderer();
    const { world, player, bullets } = busyWorld();
    const frame = frameOf(world);
    frame.hud.setString(0, 'AB');
    record.keep = false;
    const step = (tick: number): void => {
      animate(frame, player, bullets, tick);
      renderer.render(frame);
    };
    const bytes = measureHeapGrowth(step, 10_000, 20_000).bytes;
    forceGc();
    const before = process.memoryUsage().heapUsed;
    for (let tick = 0; tick < 10_000; tick++) step(tick);
    forceGc();
    expect(process.memoryUsage().heapUsed - before).toBeLessThan(256 * 1024);
    // ~0.6 MB (Pixi's own event plumbing when sprites blink); re-tinting every HUD quad on
    // every frame through Pixi's Color path was ~4.5 MB.
    expect(bytes).toBeLessThan(1.5 * 1024 * 1024);
  }, 60_000); // 20,000 rendered frames: ~3 s on a busy CI runner
});

describe('render-pixi/renderer scene structure (edge)', () => {
  it('keeps the flash overlay above every world layer and the dim under the UI list', async () => {
    const renderer = await makeRenderer();
    renderer.bindWorld(busyWorld().world);
    const world = renderer.layers.world;
    const flash = world.children[world.children.length - 2] as Pixi.Sprite;
    expect(renderer.layers.layers.slice(0, LayerId.Hud).every((layer) => layer !== flash)).toBe(
      true,
    );
    // It covers the frame plus a margin, so shaking never uncovers an edge.
    expect([flash.x, flash.y, flash.scale.x, flash.scale.y]).toEqual([-32, -32, 448, 280]);
    const ui = renderer.layers.layers[LayerId.Ui].children;
    expect(ui).toHaveLength(2);
    expect((ui[0] as Pixi.Sprite).tint).toBe(0x000000);
    expect(ui[1].label).toBe('ui');
    expect(renderer.layers.layers[LayerId.Hud].children[0].label).toBe('hud');
  });

  it('puts the calibration pattern between the background and the layers', async () => {
    const renderer = await makeRenderer({ testPattern: true });
    const children = renderer.scene.children;
    expect(children).toHaveLength(3);
    expect(children[2]).toBe(renderer.layers.root);
  });

  it('rounds the shake offset half up (-2.5 → -2) and resets it when the shake ends', async () => {
    const renderer = await makeRenderer();
    const frame = frameOf();
    frame.screen.shakeX = -2.5;
    frame.screen.shakeY = 2.5;
    renderer.render(frame);
    expect([renderer.layers.world.x, renderer.layers.world.y]).toEqual([-2, 3]);
    frame.screen.shakeX = 0;
    frame.screen.shakeY = 0;
    renderer.render(frame);
    expect([renderer.layers.world.x, renderer.layers.world.y]).toEqual([0, 0]);
  });
});

describe('render-pixi/renderer binding and names (edge)', () => {
  it('recovers after a rejected world: the next good world binds normally', async () => {
    const renderer = await makeRenderer();
    const good = busyWorld().world;
    renderer.bindWorld(good);
    const old = renderer.bindings;
    const bad: WorldView = {
      ...good,
      batches: [{ ...createSpriteBatch(LayerId.Fx, 1), layer: -1 as LayerId }],
    };
    expect(() => renderer.render(frameOf(bad))).toThrow(/unknown layer -1/);
    expect(old.every((binding) => binding.container.destroyed)).toBe(true);
    expect(renderer.bindings).toEqual([]);
    renderer.render(frameOf(good));
    expect(renderer.bindings.map((binding) => binding.layer)).toEqual([
      LayerId.Player,
      LayerId.EnemyBullets,
    ]);
  });

  it('binds a world without batches and unbinds with bindWorld(null)', async () => {
    const renderer = await makeRenderer();
    const empty: WorldView = { camera: { x: 0, y: 0 }, parallax: null, terrain: null, batches: [] };
    renderer.render(frameOf(empty));
    expect(renderer.bindings).toEqual([]);
    renderer.bindWorld(busyWorld().world);
    const bound = renderer.bindings;
    renderer.bindWorld(null);
    expect(renderer.bindings).toEqual([]);
    expect(bound[0].container.destroyed).toBe(true);
    expect(renderer.layers.layers[LayerId.Player].children).toHaveLength(0);
  });

  it('redraws an unchanged HUD list after setSpriteNames (new names reach old commands)', async () => {
    const renderer = await makeRenderer();
    const atlas = renderer.atlas as Atlas;
    const frame = frameOf();
    frame.hud.sprite(0, 0, 10, 10);
    renderer.render(frame);
    const quad = renderer.layers.layers[LayerId.Hud].children[0].children[0] as Pixi.Sprite;
    expect(quad.texture).toBe(atlas.textures[atlas.spriteBase('ships/a')]);
    renderer.setSpriteNames(['bg/tile']);
    renderer.render(frame);
    expect(quad.texture).toBe(atlas.textures[atlas.spriteBase('bg/tile')]);
  });

  it('with a font the atlas lacks: no metrics, text skipped, rects and sprites still drawn', async () => {
    const renderer = await makeRenderer({ font: 'serif' });
    expect(renderer.metrics).toBeNull();
    const frame = frameOf();
    frame.ui.setString(0, 'AB');
    frame.ui.text(0, 0, 0);
    frame.ui.number(12, 0, 0);
    frame.ui.rect(0, 0, 4, 4, 0xff0000);
    frame.ui.sprite(1, 0, 0, 0);
    renderer.render(frame);
    const uiQuads = renderer.layers.layers[LayerId.Ui].children[1].children as Pixi.Sprite[];
    expect(uiQuads.filter((quad) => quad.visible)).toHaveLength(2);
  });
});
