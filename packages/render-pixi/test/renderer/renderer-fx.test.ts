/**
 * The renderer's game feel (plan M1-14), with PixiJS's WebGL classes faked as in
 * `renderer-wiring.test.ts` (containers and sprites stay real): the draw order (particles and
 * popups on the FX layer — above the items, **below the enemy bullets**; the playfield dim and
 * the flash over every world layer), effects advanced by the frame's simulated ticks (frozen
 * while the tick stands still, cleared when it goes back), the event-driven shake / flash / dim
 * composed with `frame.screen`, and the per-frame allocation with effects running.
 */
import {
  FX_CUES,
  FlashKind,
  LayerId,
  PLAYFIELD_Y,
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
import { createAtlas, type Atlas } from '../../src/atlas/index.js';
import { parseFxContent, type FxContent } from '../../src/particles/index.js';
import { createPixiRenderer, type PixiRenderer } from '../../src/renderer/index.js';
import { pageImages, testManifest } from '../helpers.js';
import { measureHeapGrowth } from '../../../core/test/helpers/alloc.js';

vi.mock('pixi.js', async (importOriginal) => {
  const real = await importOriginal<typeof Pixi>();
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

/** @returns The small test atlas (sprite `ships/a`, a pixel font). */
function testAtlas(): Atlas {
  const manifest = testManifest();
  return createAtlas(manifest, pageImages(manifest), { onWarning: () => {} });
}

/** Fx content over the test atlas: `burst` (still, 10 ticks) bound to `ExplosionSmall`. */
function fxContent(): FxContent {
  const { content, issues } = parseFxContent({
    formatVersion: 1,
    kind: 'fx',
    presets: [
      {
        id: 'burst',
        sprite: 'ships/a',
        count: 1,
        speed: { min: 0, max: 0 },
        lifetime: { min: 10, max: 10 },
      },
    ],
    triggers: [{ event: 'fx', cue: 'ExplosionSmall', preset: 'burst' }],
  });
  expect(issues).toEqual([]);
  return content;
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
 * A frame over a world with an item batch and an enemy-bullet batch.
 *
 * @returns The frame, the world's camera and its two batches.
 */
function frameWithWorld(): {
  frame: TestFrame;
  camera: { x: number; y: number };
  items: SpriteBatch;
  bullets: SpriteBatch;
} {
  const camera = { x: 0, y: 0 };
  const items = createSpriteBatch(LayerId.Items, 2);
  const bullets = createSpriteBatch(LayerId.EnemyBullets, 2);
  pushSprite(items, 50, 50, 0, 0);
  pushSprite(bullets, 60, 50, 0, 0);
  const world: WorldView = { camera, parallax: null, terrain: null, batches: [items, bullets] };
  const frame: TestFrame = {
    tick: 0,
    alpha: 0,
    world,
    hud: createDrawList(4, 1),
    ui: createDrawList(4, 1),
    screen: { shakeX: 0, shakeY: 0, flash: 0, dim: 0 },
  };
  return { frame, camera, items, bullets };
}

/** @returns A renderer over the test atlas with the fx content set. */
async function makeRenderer(): Promise<PixiRenderer> {
  const renderer = await createPixiRenderer({
    canvas,
    displayWidth: 1920,
    displayHeight: 1080,
    atlas: testAtlas(),
    glyphCapacity: 32,
  });
  renderer.setSpriteNames(['ships/a']);
  renderer.setFxContent(fxContent());
  return renderer;
}

/**
 * Index of a display object in draw order (depth-first position under the scene).
 *
 * @param renderer - The renderer.
 * @param node - The display object.
 * @returns Its draw-order index (-1 when not in the scene).
 */
function drawIndex(renderer: PixiRenderer, node: Pixi.Container): number {
  const order: Pixi.Container[] = [];
  const walk = (root: Pixi.Container): void => {
    order.push(root);
    for (const child of root.children) walk(child);
  };
  walk(renderer.scene);
  return order.indexOf(node);
}

describe('render-pixi/renderer game feel (plan M1-14)', () => {
  it('draws particles and popups above the items and below the enemy bullets', async () => {
    const renderer = await makeRenderer();
    const { frame } = frameWithWorld();
    renderer.render(frame);
    const particles = renderer.particles;
    const popups = renderer.popups;
    if (particles === null || popups === null) throw new Error('fx parts missing');
    const fxLayer = renderer.layers.layers[LayerId.Fx];
    expect(fxLayer.children).toEqual([particles.container, popups.container]);
    const [items, bullets] = renderer.bindings;
    expect(items.layer).toBe(LayerId.Items);
    expect(bullets.layer).toBe(LayerId.EnemyBullets);
    const at = (node: Pixi.Container) => drawIndex(renderer, node);
    expect(at(items.container)).toBeLessThan(at(particles.container));
    expect(at(particles.container)).toBeLessThan(at(popups.container));
    expect(at(popups.container)).toBeLessThan(at(bullets.container));
    // The player, their shots and the hitbox marker sit below the effects too.
    for (const layer of [LayerId.Player, LayerId.PlayerShots, LayerId.Hitbox, LayerId.Items]) {
      expect(at(renderer.layers.layers[layer])).toBeLessThan(at(fxLayer));
    }
    expect(at(fxLayer)).toBeLessThan(at(renderer.layers.layers[LayerId.EnemyBullets]));
    // Then the playfield dim and the flashes (plain, additive — M2-08) over every world layer,
    // the HUD above them.
    const world = renderer.layers.world.children;
    const [dim, flash, flashAdd] = world.slice(-3) as Pixi.Sprite[];
    expect(world.indexOf(renderer.layers.layers[LayerId.EnemyBullets])).toBe(world.length - 4);
    expect(dim.tint).toBe(0x000000);
    expect(flash.tint).toBe(0xffffff);
    expect(flashAdd.blendMode).toBe('add');
    expect(at(flashAdd)).toBeLessThan(at(renderer.layers.layers[LayerId.Hud]));
  });

  it('advances the effects by simulated ticks: frozen while the tick stands still', async () => {
    const renderer = await makeRenderer();
    const particles = renderer.particles;
    if (particles === null) throw new Error('no particles');
    const { frame, camera } = frameWithWorld();
    frame.tick = 100;
    renderer.render(frame);
    camera.x = 40;
    // An event of the tick that just ran (world x 140 → screen x 100).
    particles.emitFxCue(FX_CUES.ExplosionSmall, 140, 60, 1);
    frame.tick = 101;
    renderer.render(frame);
    expect(particles.visibleCount).toBe(1);
    const sprite = (particles.container.children[1].children as Pixi.Sprite[])[0];
    expect([sprite.x, sprite.y]).toEqual([100 - 8, 60 + PLAYFIELD_Y - 4]);
    // Paused: the same tick again and again — the particle does not age.
    for (let i = 0; i < 30; i++) renderer.render(frame);
    expect(particles.liveCount).toBe(1);
    // Revealed at age 0 on tick 101, it lives ten ticks: still there on 110, gone on 111.
    frame.tick = 110;
    renderer.render(frame);
    expect(particles.liveCount).toBe(1);
    frame.tick = 111;
    renderer.render(frame);
    expect(particles.liveCount).toBe(0);
    // Popups and screen effects follow the same clock.
    renderer.popups?.show(500, 100, 60, 0xffffff);
    renderer.effects.shake(2, 20);
    frame.tick = 112;
    renderer.render(frame);
    expect(renderer.popups?.liveCount).toBe(1);
    expect(renderer.effects.shakeAmount).toBe(2);
  });

  it('clears every effect when the tick counter goes back (a new session)', async () => {
    const renderer = await makeRenderer();
    const { frame } = frameWithWorld();
    frame.tick = 50;
    renderer.render(frame);
    renderer.particles?.emitFxCue(FX_CUES.ExplosionSmall, 10, 10, 1);
    renderer.popups?.show(100, 10, 10, 0xffffff);
    renderer.effects.flash(FlashKind.MegaCrash, 12);
    frame.tick = 0;
    renderer.render(frame);
    expect(renderer.particles?.liveCount).toBe(0);
    expect(renderer.popups?.liveCount).toBe(0);
    expect(renderer.effects.flashAlpha).toBe(0);
  });

  it('adds the event shake to the frame shake and tints the flash by its kind', async () => {
    const renderer = await makeRenderer();
    const { frame } = frameWithWorld();
    renderer.render(frame);
    renderer.effects.shake(4, 8);
    frame.screen.shakeX = 1;
    frame.tick = 1;
    renderer.render(frame);
    const { effects } = renderer;
    expect(renderer.layers.world.x).toBe(1 + effects.shakeX);
    expect(renderer.layers.world.y).toBe(effects.shakeY);
    expect(Math.abs(effects.shakeX) + Math.abs(effects.shakeY)).toBeGreaterThan(0);
    // The shake switch leaves only the frame's own offset.
    effects.settings.screenShake = false;
    frame.tick = 2;
    renderer.render(frame);
    expect([renderer.layers.world.x, renderer.layers.world.y]).toEqual([1, 0]);

    const world = renderer.layers.world.children;
    const flash = world[world.length - 2] as Pixi.Sprite;
    effects.flash(FlashKind.Warning, 8);
    frame.tick = 3;
    renderer.render(frame);
    expect(flash.visible).toBe(true);
    expect(flash.tint).toBe(0xf85858);
    expect(flash.alpha).toBeCloseTo(0.35);
    // A brighter frame flash wins and is white.
    frame.screen.flash = 0.9;
    frame.tick = 4;
    renderer.render(frame);
    expect([flash.tint, flash.alpha]).toEqual([0xffffff, 0.9]);
    frame.screen.flash = 0;
    frame.tick = 40;
    renderer.render(frame);
    expect(flash.visible).toBe(false);
  });

  it('draws the event dim over the world layers (the menu dim stays under the UI list)', async () => {
    const renderer = await makeRenderer();
    const { frame } = frameWithWorld();
    renderer.render(frame);
    renderer.effects.dim(0.5, 60);
    frame.tick = 20;
    renderer.render(frame);
    const world = renderer.layers.world.children;
    const playfieldDim = world[world.length - 3] as Pixi.Sprite;
    expect(playfieldDim.visible).toBe(true);
    expect(playfieldDim.alpha).toBeCloseTo(0.5);
    const menuDim = renderer.layers.layers[LayerId.Ui].children[0] as Pixi.Sprite;
    expect(menuDim.visible).toBe(false);
  });

  it('draws frames without a world with the particles in frame pixels', async () => {
    const renderer = await makeRenderer();
    const { frame } = frameWithWorld();
    frame.world = null;
    renderer.render(frame);
    renderer.particles?.emitFxCue(FX_CUES.ExplosionSmall, 30, 40, 1);
    frame.tick = 1;
    renderer.render(frame);
    const sprite = (renderer.particles?.container.children[1].children as Pixi.Sprite[])[0];
    expect([sprite.visible, sprite.x, sprite.y]).toEqual([true, 30 - 8, 40 + PLAYFIELD_Y - 4]);
  });

  it('allocates little per frame with particles, popups, shake and flashes running', async () => {
    const renderer = await makeRenderer();
    const { frame, camera, items, bullets } = frameWithWorld();
    const particles = renderer.particles;
    const popups = renderer.popups;
    if (particles === null || popups === null) throw new Error('fx parts missing');
    const bytes = measureHeapGrowth(
      (tick) => {
        frame.tick = tick;
        // The camera scrolls on (a new position every frame, as in play); the sprites, bursts and
        // popups stay on screen, at whole pixels.
        camera.x = tick * 0.25;
        const left = Math.floor(camera.x);
        items.x[0] = left + 50;
        bullets.x[0] = left + 60;
        const burst = left + 80 + (tick % 90);
        if (tick % 3 === 0) particles.emitFxCue(FX_CUES.ExplosionSmall, burst, 70, 1);
        if (tick % 20 === 0) popups.show(100, left + 90 + (tick % 50), 80, 0xf8f8f8);
        if (tick % 40 === 0) renderer.effects.shake(2, 20);
        if (tick % 25 === 0) renderer.effects.flash(tick % 3, 12);
        renderer.render(frame);
      },
      10_000,
      20_000,
    ).bytes;
    // The renderer's own guard for an animated world is 1.5 MB (Pixi plumbing when sprites blink).
    expect(bytes).toBeLessThan(1.5 * 1024 * 1024);
  });
});
