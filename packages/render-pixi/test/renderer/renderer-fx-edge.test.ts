/**
 * Edge cases of the renderer's game feel (plan M1-14) beyond `renderer-fx.test.ts`, with PixiJS's
 * WebGL classes faked the same way (containers and sprites stay real):
 *
 * - options: no atlas (no particles, no popups — effects still drawn), an atlas without the
 *   font (particles, no popups), `effects` settings passed through (shake off, reduced
 *   flashing), `particleCapacity`, `fxSeed` (same seed → same particles);
 * - the tick clock: the first frame never steps (a request made before it stays fresh), a jump
 *   of 1000 ticks steps at most 60, a tick that goes back clears and the clock then runs on
 *   normally, a repeated tick steps nothing;
 * - composition: the flash tint follows the brighter source (frame flash wins ties) and is kept
 *   while the flash is off, a fractional frame shake plus the event shake lands on whole
 *   pixels, the playfield dim and the menu dim are independent, popups follow the world camera;
 * - lifetime: rebinding worlds keeps the particles and popups on the FX layer; `destroy`
 *   destroys them.
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
  type WorldView,
} from '@shmup/core';
import type * as Pixi from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { createAtlas, type Atlas } from '../../src/atlas/index.js';
import { REDUCED_FLASH_ALPHA } from '../../src/effects/index.js';
import { parseFxContent, type FxContent } from '../../src/particles/index.js';
import {
  createPixiRenderer,
  type PixiRenderer,
  type PixiRendererOptions,
} from '../../src/renderer/index.js';
import { pageImages, testManifest } from '../helpers.js';

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

/** @returns The small test atlas (sprite `ships/a`, a pixel font). */
function testAtlas(): Atlas {
  const manifest = testManifest();
  return createAtlas(manifest, pageImages(manifest), { onWarning: () => {} });
}

/**
 * Fx content over the test atlas: `burst` (still, `life` ticks) and `spray` (8 moving particles)
 * bound to `ExplosionSmall` / `ExplosionLarge`.
 *
 * @param life - Lifetime of `burst`.
 * @returns The content.
 */
function fxContent(life = 10): FxContent {
  const { content, issues } = parseFxContent({
    formatVersion: 1,
    kind: 'fx',
    presets: [
      {
        id: 'burst',
        sprite: 'ships/a',
        count: 1,
        speed: { min: 0, max: 0 },
        lifetime: { min: life, max: life },
      },
      {
        id: 'spray',
        sprite: 'ships/a',
        count: 8,
        speed: { min: 0.5, max: 3 },
        lifetime: { min: 30, max: 30 },
        radius: 5,
      },
    ],
    triggers: [
      { event: 'fx', cue: 'ExplosionSmall', preset: 'burst' },
      { event: 'fx', cue: 'ExplosionLarge', preset: 'spray' },
    ],
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
 * A frame over a small world.
 *
 * @returns The frame and the world's camera.
 */
function frameWithWorld(): { frame: TestFrame; camera: { x: number; y: number } } {
  const camera = { x: 0, y: 0 };
  const bullets = createSpriteBatch(LayerId.EnemyBullets, 2);
  pushSprite(bullets, 60, 50, 0, 0);
  const world: WorldView = { camera, parallax: null, terrain: null, batches: [bullets] };
  const frame: TestFrame = {
    tick: 0,
    alpha: 0,
    world,
    hud: createDrawList(4, 1),
    ui: createDrawList(4, 1),
    screen: { shakeX: 0, shakeY: 0, flash: 0, dim: 0 },
  };
  return { frame, camera };
}

/**
 * A renderer over the test atlas with the fx content set.
 *
 * @param extra - Options to add.
 * @param life - Lifetime of the `burst` preset.
 * @returns The renderer.
 */
async function makeRenderer(
  extra: Partial<PixiRendererOptions> = {},
  life = 10,
): Promise<PixiRenderer> {
  const renderer = await createPixiRenderer({
    canvas,
    displayWidth: 1920,
    displayHeight: 1080,
    atlas: testAtlas(),
    glyphCapacity: 32,
    ...extra,
  });
  renderer.setSpriteNames(['ships/a']);
  renderer.setFxContent(fxContent(life));
  return renderer;
}

/**
 * The flash overlay (last child of the world group) and the playfield dim (the one before).
 *
 * @param renderer - The renderer.
 * @returns Both sprites.
 */
function overlays(renderer: PixiRenderer): { flash: Pixi.Sprite; dim: Pixi.Sprite } {
  const children = renderer.layers.world.children;
  return {
    flash: children[children.length - 2] as Pixi.Sprite,
    dim: children[children.length - 3] as Pixi.Sprite,
  };
}

/**
 * Positions of the visible particle sprites.
 *
 * @param renderer - The renderer.
 * @returns `[x, y]` per visible particle.
 */
function particlePositions(renderer: PixiRenderer): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const group of renderer.particles?.container.children ?? []) {
    for (const sprite of group.children as Pixi.Sprite[]) {
      if (sprite.visible) out.push([sprite.x, sprite.y]);
    }
  }
  return out;
}

describe('render-pixi/renderer game feel — options (edges)', () => {
  it('without an atlas: no particles or popups, the screen effects still drawn', async () => {
    const renderer = await createPixiRenderer({
      canvas,
      displayWidth: 1920,
      displayHeight: 1080,
    });
    expect([renderer.particles, renderer.popups]).toEqual([null, null]);
    expect(() => renderer.setFxContent(fxContent())).not.toThrow();
    const { frame } = frameWithWorld();
    frame.world = null;
    renderer.render(frame);
    renderer.effects.flash(FlashKind.Warning, 8);
    renderer.effects.dim(0.5, 30);
    frame.tick = 8;
    renderer.render(frame);
    const { flash, dim } = overlays(renderer);
    expect(flash.visible).toBe(true);
    expect(flash.tint).toBe(0xf85858);
    expect(dim.visible).toBe(true);
    expect(renderer.layers.layers[LayerId.Fx].children).toEqual([]);
    renderer.destroy();
  });

  it('with an atlas that lacks the font: particles, but no popups', async () => {
    const renderer = await makeRenderer({ font: 'nope' });
    expect(renderer.particles).not.toBeNull();
    expect(renderer.popups).toBeNull();
    expect(renderer.layers.layers[LayerId.Fx].children).toEqual([renderer.particles?.container]);
  });

  it('passes the effect settings, the particle capacity and the seed through', async () => {
    const renderer = await makeRenderer({
      effects: { screenShake: false, reduceFlashing: true },
      particleCapacity: 32,
    });
    expect(renderer.effects.settings).toEqual({
      screenShake: false,
      reduceFlashing: true,
      crt: 'off',
      rasterEffects: true,
    });
    expect(renderer.particles?.capacity).toBe(32);
    const { frame } = frameWithWorld();
    renderer.render(frame);
    renderer.effects.shake(4, 20);
    renderer.effects.flash(FlashKind.BossBlast, 24);
    frame.tick = 1;
    renderer.render(frame);
    expect([renderer.layers.world.x, renderer.layers.world.y]).toEqual([0, 0]);
    expect(overlays(renderer).flash.alpha).toBe(REDUCED_FLASH_ALPHA);

    const run = async (fxSeed: number): Promise<Array<[number, number]>> => {
      const seeded = await makeRenderer({ fxSeed });
      const f = frameWithWorld().frame;
      seeded.render(f);
      seeded.particles?.emitFxCue(FX_CUES.ExplosionLarge, 150, 80, 1);
      f.tick = 6;
      seeded.render(f);
      return particlePositions(seeded);
    };
    const a = await run(99);
    expect(a).toHaveLength(8);
    expect(await run(99)).toEqual(a);
    expect(await run(100)).not.toEqual(a);
  });
});

describe('render-pixi/renderer game feel — the tick clock (edges)', () => {
  it('never steps on the first frame: a request made before it is still fresh', async () => {
    const renderer = await makeRenderer();
    renderer.effects.shake(4, 8);
    const { frame } = frameWithWorld();
    frame.tick = 500;
    renderer.render(frame);
    expect(renderer.effects.shakeAmount).toBe(4);
    frame.tick = 501;
    renderer.render(frame); // clears the fresh mark only
    expect(renderer.effects.shakeAmount).toBe(4);
    frame.tick = 502;
    renderer.render(frame);
    expect(renderer.effects.shakeAmount).toBe(4); // ceil(4 · 7 / 8)
    frame.tick = 506;
    renderer.render(frame);
    expect(renderer.effects.shakeAmount).toBe(2); // ceil(4 · 3 / 8)
  });

  it('steps at most 60 ticks for a long jump (a hitch), everything alike', async () => {
    const renderer = await makeRenderer({}, 100);
    const { frame } = frameWithWorld();
    renderer.render(frame);
    renderer.particles?.emitFxCue(FX_CUES.ExplosionSmall, 100, 50, 1);
    renderer.effects.shake(4, 600);
    frame.tick = 1000;
    renderer.render(frame);
    // 60 ticks of a 100-tick particle: alive; 59 of 600 shake ticks counted.
    expect(renderer.particles?.liveCount).toBe(1);
    expect(renderer.effects.shakeAmount).toBe(Math.ceil((4 * (600 - 59)) / 600));
    frame.tick = 2000;
    renderer.render(frame);
    expect(renderer.particles?.liveCount).toBe(0);
  });

  it('clears on a tick that goes back, then runs on normally from there', async () => {
    const renderer = await makeRenderer();
    const { frame } = frameWithWorld();
    frame.tick = 300;
    renderer.render(frame);
    renderer.particles?.emitFxCue(FX_CUES.ExplosionSmall, 100, 50, 1);
    renderer.effects.dim(0.5, 60);
    frame.tick = 5;
    renderer.render(frame);
    expect(renderer.particles?.liveCount).toBe(0);
    expect(renderer.effects.dimAlpha).toBe(0);
    expect(overlays(renderer).dim.visible).toBe(false);
    renderer.particles?.emitFxCue(FX_CUES.ExplosionSmall, 100, 50, 1);
    frame.tick = 6;
    renderer.render(frame);
    expect(renderer.particles?.visibleCount).toBe(1);
    // The same tick again: nothing moves, nothing is cleared.
    renderer.render(frame);
    renderer.render(frame);
    expect(renderer.particles?.visibleCount).toBe(1);
    frame.tick = 16;
    renderer.render(frame); // 10 more ticks: a 10-tick life is over
    expect(renderer.particles?.liveCount).toBe(0);
  });
});

describe('render-pixi/renderer game feel — composition (edges)', () => {
  it('tints the flash by the brighter source (the frame wins ties), keeping the tint while off', async () => {
    const renderer = await makeRenderer();
    const { frame } = frameWithWorld();
    renderer.render(frame);
    const { flash } = overlays(renderer);
    renderer.effects.flash(FlashKind.Warning, 8);
    frame.tick = 1;
    renderer.render(frame);
    expect(flash.tint).toBe(0xf85858);
    // The red flash fades out; the tint is left alone while nothing shows.
    frame.tick = 20;
    renderer.render(frame);
    expect([flash.visible, flash.tint]).toEqual([false, 0xf85858]);
    // A frame flash alone is white.
    frame.screen.flash = 0.5;
    frame.tick = 21;
    renderer.render(frame);
    expect([flash.visible, flash.tint, flash.alpha]).toEqual([true, 0xffffff, 0.5]);
    // An event flash exactly as bright as the frame's: the frame (white) wins.
    frame.screen.flash = 0.35;
    renderer.effects.flash(FlashKind.Warning, 8);
    frame.tick = 22;
    renderer.render(frame);
    expect(flash.tint).toBe(0xffffff);
    expect(flash.alpha).toBeCloseTo(0.35);
    // A dimmer frame flash: the event's colour.
    frame.screen.flash = 0.1;
    frame.tick = 23;
    renderer.render(frame);
    expect(flash.tint).toBe(0xf85858);
  });

  it('adds a fractional frame shake and the event shake on whole pixels', async () => {
    const renderer = await makeRenderer();
    const { frame } = frameWithWorld();
    renderer.render(frame);
    renderer.effects.shake(4, 40);
    frame.screen.shakeX = 1.6;
    frame.screen.shakeY = -0.4;
    frame.tick = 1;
    renderer.render(frame);
    const { effects } = renderer;
    const x = renderer.layers.world.x;
    const y = renderer.layers.world.y;
    expect(x).toBe(2 + effects.shakeX);
    expect(y).toBe(0 + effects.shakeY);
    expect(Number.isInteger(x) && Number.isInteger(y)).toBe(true);
    expect(Object.is(y, -0)).toBe(false);
  });

  it('keeps the playfield dim and the menu dim independent', async () => {
    const renderer = await makeRenderer();
    const { frame } = frameWithWorld();
    renderer.render(frame);
    frame.screen.dim = 0.5;
    frame.tick = 1;
    renderer.render(frame);
    const menuDim = renderer.layers.layers[LayerId.Ui].children[0] as Pixi.Sprite;
    expect([menuDim.visible, overlays(renderer).dim.visible]).toEqual([true, false]);
    frame.screen.dim = 0;
    renderer.effects.dim(0.4, 10);
    frame.tick = 9;
    renderer.render(frame);
    expect([menuDim.visible, overlays(renderer).dim.visible]).toEqual([false, true]);
    expect(overlays(renderer).dim.alpha).toBeCloseTo(0.4);
    // After the hold and the fade-out, hidden again.
    frame.tick = 60;
    renderer.render(frame);
    expect(overlays(renderer).dim.visible).toBe(false);
  });

  it('draws popups through the world camera, like the particles', async () => {
    const renderer = await makeRenderer();
    const { frame, camera } = frameWithWorld();
    renderer.render(frame);
    camera.x = 40;
    camera.y = 10;
    renderer.popups?.show(5, 140, 60, 0xf8f8f8);
    renderer.particles?.emitFxCue(FX_CUES.ExplosionSmall, 140, 60, 1);
    frame.tick = 1;
    renderer.render(frame);
    const glyphs = (renderer.popups?.container.children as Pixi.Container[])
      .flatMap((pool) => pool.children as Pixi.Sprite[])
      .filter((sprite) => sprite.visible);
    // One 6-px digit centred on screen x 100; top = 60 − 10 + PLAYFIELD_Y − 3 (age 1: no rise).
    expect(glyphs.map((sprite) => [sprite.x, sprite.y])).toEqual([[97, 60 - 10 + PLAYFIELD_Y - 3]]);
    expect(particlePositions(renderer)).toEqual([[100 - 8, 50 + PLAYFIELD_Y - 4]]);
  });
});

describe('render-pixi/renderer game feel — lifetime (edges)', () => {
  it('keeps the particles and popups on the FX layer across world rebinds, and destroys them', async () => {
    const renderer = await makeRenderer();
    const fxLayer = renderer.layers.layers[LayerId.Fx];
    const expected = [renderer.particles?.container, renderer.popups?.container];
    const first = frameWithWorld().frame;
    const second = frameWithWorld().frame;
    renderer.render(first);
    renderer.render(second);
    renderer.bindWorld(null);
    renderer.render(first);
    expect(fxLayer.children).toEqual(expected);
    const particles = renderer.particles;
    const popups = renderer.popups;
    renderer.destroy();
    expect(particles?.container.destroyed).toBe(true);
    expect(popups?.container.destroyed).toBe(true);
  });
});
