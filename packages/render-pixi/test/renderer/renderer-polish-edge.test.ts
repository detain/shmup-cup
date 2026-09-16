/**
 * Edge cases of the renderer's presentation polish (plan M2-08), next to
 * `renderer-polish.test.ts` (PixiJS's WebGL classes and the layer-effect filters faked the same
 * way):
 *
 * - render interpolation: the hitbox markers drawn on the interpolated ship (a regression — they
 *   were drawn at the current tick under the interpolated camera, a tick of motion ahead of the
 *   ship) and not blended from a stale history after being hidden; a re-enabled interpolation, a
 *   jump of several ticks and a tick that went back all draw the current tick first; `alpha`
 *   clamped (NaN → the previous tick); a frame without a world in between; the layer effects'
 *   camera ranges read with the interpolated camera;
 * - scale modes before the first frame, resizes to broken sizes, a display smaller than the frame;
 * - the hitbox layer and the layer effects without a hitbox view / without an atlas, a world swap
 *   rebinding both, `destroy`;
 * - the additive Mega Crash flash under reduced flashing, a non-additive flash replacing it
 *   mid-fade, an unknown flash kind (an overlay).
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
  type HitboxBatch,
  type RenderFrame,
  type ScreenView,
  type SpriteBatch,
  type StageEffectsView,
  type WorldView,
} from '@shmup/core';
import type * as Pixi from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { createAtlas, type Atlas } from '../../src/atlas/index.js';
import {
  REDUCED_FLASH_ALPHA,
  createRasterTable,
  type LayerEffectFilter,
} from '../../src/effects/index.js';
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

/** Anchor of the test atlas' `ships/a` frames (see `testManifest`). */
const SHIP_ANCHOR = { x: 8, y: 4 };

/** @returns The small test atlas. */
function testAtlas(): Atlas {
  const manifest = testManifest();
  return createAtlas(manifest, pageImages(manifest), { onWarning: () => {} });
}

/**
 * Fake layer-effect filters that count their destruction.
 *
 * @returns The factory and the filters it made.
 */
function fakeFilters(): {
  create: (rows: number) => LayerEffectFilter;
  destroyed: { count: number };
} {
  const destroyed = { count: 0 };
  return {
    destroyed,
    create: (rows) => ({
      filter: { enabled: true } as unknown as Pixi.Filter,
      table: createRasterTable(rows),
      bytes: new Uint8Array(rows * 4),
      cycleFrom: new Float32Array(24),
      cycleTo: new Float32Array(24),
      apply() {},
      destroy() {
        destroyed.count++;
      },
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

/** A wave on BG_MID from camera x 100 on. */
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
      from: 100,
      to: Number.POSITIVE_INFINITY,
    },
  ],
  cycles: [],
};

/** A test world: the ship batch, its hitbox view and the camera. */
interface TestWorld {
  /** The frame showing it. */
  readonly frame: TestFrame;
  /** The camera. */
  readonly camera: { x: number; y: number };
  /** The player ship batch (slot 0 = the ship, `ships/a`). */
  readonly ship: SpriteBatch;
  /** The ship's hurtbox. */
  readonly hitboxes: HitboxBatch;
}

/**
 * A frame over a world with one ship and its hurtbox (radius 1.5) at the same point.
 *
 * @param options - `effects` to bind; `hitboxes: false` leaves the hitbox view out.
 * @param options.effects - The stage effects (default none).
 * @param options.hitboxes - Whether the world has a hitbox view (default `true`).
 * @returns The world's parts.
 */
function shipWorld(
  options: { effects?: StageEffectsView | null; hitboxes?: boolean } = {},
): TestWorld {
  const camera = { x: 0, y: 0 };
  const ship = createSpriteBatch(LayerId.Player, 2);
  pushSprite(ship, 100, 50, 0, 0);
  const hitboxes = createHitboxBatch(2);
  hitboxes.x[0] = 100;
  hitboxes.y[0] = 50;
  hitboxes.radius[0] = 1.5;
  hitboxes.count = 1;
  const world: WorldView = {
    camera,
    parallax: null,
    terrain: null,
    batches: [ship],
    effects: options.effects ?? null,
    hitboxes: options.hitboxes === false ? null : hitboxes,
  };
  const frame: TestFrame = {
    tick: 0,
    alpha: 0,
    world,
    hud: createDrawList(4, 1),
    ui: createDrawList(4, 1),
    screen: { shakeX: 0, shakeY: 0, flash: 0, dim: 0 },
  };
  return { frame, camera, ship, hitboxes };
}

/**
 * Moves the ship and its hurtbox to a world position.
 *
 * @param w - The world.
 * @param x - World x.
 * @param y - World y.
 */
function moveShip(w: TestWorld, x: number, y: number): void {
  w.ship.x[0] = x;
  w.ship.y[0] = y;
  w.hitboxes.x[0] = x;
  w.hitboxes.y[0] = y;
}

/**
 * A renderer over the test atlas with fake layer-effect filters.
 *
 * @param extra - More options.
 * @returns The renderer and the filters' destroy count.
 */
async function makeRenderer(
  extra: Partial<Parameters<typeof createPixiRenderer>[0]> = {},
): Promise<{ renderer: PixiRenderer; destroyed: { count: number } }> {
  const filters = fakeFilters();
  const renderer = await createPixiRenderer({
    canvas,
    displayWidth: 1152,
    displayHeight: 648,
    atlas: testAtlas(),
    glyphCapacity: 32,
    createLayerEffectFilter: filters.create,
    ...extra,
  });
  renderer.setSpriteNames(['ships/a']);
  return { renderer, destroyed: filters.destroyed };
}

/**
 * Screen centre of the ship sprite (its anchor) and of its hitbox marker's core.
 *
 * @param renderer - The renderer.
 * @returns `{ ship: [x, y], marker: [x, y] }`.
 */
function centres(renderer: PixiRenderer): { ship: number[]; marker: number[] } {
  const sprite = renderer.bindings[0].container.children[0] as Pixi.Sprite;
  const markers = renderer.hitboxes;
  if (markers === null) throw new Error('no hitbox binding');
  const core = markers.container.children[1] as Pixi.Sprite;
  // Radius 1.5 → a 3-px core: its centre is one pixel in.
  return {
    ship: [sprite.x + SHIP_ANCHOR.x, sprite.y + SHIP_ANCHOR.y],
    marker: [core.x + 1, core.y + 1],
  };
}

describe('render-pixi/renderer interpolation: hitbox markers (plan M2-08)', () => {
  it('draws the markers on the interpolated ship, not a tick ahead of it', async () => {
    const { renderer } = await makeRenderer({ interpolation: true, showHitbox: true });
    const w = shipWorld();
    w.frame.tick = 10;
    renderer.render(w.frame);
    expect(centres(renderer).marker).toEqual([100, 50 + PLAYFIELD_Y]);
    // One tick later the ship flew 4 px right and 2 down while the camera scrolled 1 px.
    w.frame.tick = 11;
    w.camera.x = 1;
    moveShip(w, 104, 52);
    for (const alpha of [0, 0.25, 0.5, 0.75, 1]) {
      w.frame.alpha = alpha;
      renderer.render(w.frame);
      const { ship, marker } = centres(renderer);
      expect(marker, `alpha ${String(alpha)}`).toEqual(ship);
    }
    // Half-way: (102 − 0.5, 51) on screen.
    w.frame.alpha = 0.5;
    renderer.render(w.frame);
    expect(centres(renderer).marker).toEqual([Math.round(102 - 0.5), 51 + PLAYFIELD_Y]);
    // Without interpolation both are drawn at the current tick.
    renderer.setInterpolation(false);
    renderer.render(w.frame);
    const plain = centres(renderer);
    expect(plain.marker).toEqual(plain.ship);
    expect(plain.marker).toEqual([103, 52 + PLAYFIELD_Y]);
  });

  it('draws a marker that jumped (a respawn) or is new where it is now', async () => {
    const { renderer } = await makeRenderer({ interpolation: true, showHitbox: true });
    const w = shipWorld();
    w.frame.tick = 1;
    renderer.render(w.frame);
    w.frame.tick = 2;
    moveShip(w, 30, 100); // 70 px in a tick: a respawn
    w.hitboxes.x[1] = 200;
    w.hitboxes.y[1] = 60;
    w.hitboxes.radius[1] = 1.5;
    w.hitboxes.count = 2; // player 2 joined
    w.frame.alpha = 0.5;
    renderer.render(w.frame);
    const markers = renderer.hitboxes;
    if (markers === null) throw new Error('no hitbox binding');
    const cores = markers.container.children as Pixi.Sprite[];
    expect([cores[1].x + 1, cores[1].y + 1]).toEqual([30, 100 + PLAYFIELD_Y]);
    expect([cores[3].x + 1, cores[3].y + 1]).toEqual([200, 60 + PLAYFIELD_Y]);
    expect(markers.visibleCount).toBe(2);
  });

  it('does not blend from a stale history after the markers were hidden', async () => {
    const { renderer } = await makeRenderer({ interpolation: true, showHitbox: true });
    const w = shipWorld();
    w.frame.tick = 1;
    renderer.render(w.frame);
    renderer.setShowHitbox(false);
    // Hidden for a while: the ship crept 2 px a tick (never more than a blendable step).
    for (let tick = 2; tick <= 8; tick++) {
      w.frame.tick = tick;
      moveShip(w, 100 + 2 * (tick - 1), 50);
      renderer.render(w.frame);
    }
    renderer.setShowHitbox(true);
    w.frame.tick = 9;
    moveShip(w, 116, 50);
    w.frame.alpha = 0;
    renderer.render(w.frame);
    // Shown again: drawn at the current tick (its last record is 8 ticks old), not at x 100.
    expect(centres(renderer).marker).toEqual([116, 50 + PLAYFIELD_Y]);
    // From the next tick on it follows the ship again.
    w.frame.tick = 10;
    moveShip(w, 120, 50);
    w.frame.alpha = 0.5;
    renderer.render(w.frame);
    const { ship, marker } = centres(renderer);
    expect(marker).toEqual(ship);
    expect(marker[0]).toBe(118);
  });

  it('interpolates the markers without allocating', async () => {
    const { renderer } = await makeRenderer({ interpolation: true, showHitbox: true });
    const w = shipWorld();
    renderer.render(w.frame);
    const bytes = measureHeapGrowth(
      (step) => {
        const tick = step >> 1;
        w.frame.tick = tick;
        w.frame.alpha = (step & 1) * 0.5;
        w.camera.x = tick * 0.75;
        moveShip(w, 100 + (tick % 40) * 0.5, 50 + (tick % 9) * 0.25);
        renderer.render(w.frame);
      },
      10_000,
      20_000,
    ).bytes;
    expect(bytes).toBeLessThan(1.5 * 1024 * 1024);
  });
});

describe('render-pixi/renderer interpolation: history resets (plan M2-08)', () => {
  /**
   * Screen x of the ship sprite's anchor.
   *
   * @param renderer - The renderer.
   * @returns The x.
   */
  const shipX = (renderer: PixiRenderer): number =>
    (renderer.bindings[0].container.children[0] as Pixi.Sprite).x + SHIP_ANCHOR.x;

  it('draws the current tick first after interpolation was switched back on', async () => {
    const { renderer } = await makeRenderer({ interpolation: true });
    const w = shipWorld();
    w.frame.tick = 1;
    renderer.render(w.frame);
    w.frame.tick = 2;
    moveShip(w, 104, 50);
    renderer.render(w.frame);
    renderer.setInterpolation(false);
    for (let tick = 3; tick <= 6; tick++) {
      w.frame.tick = tick;
      moveShip(w, 100 + 4 * (tick - 1), 50);
      renderer.render(w.frame);
    }
    renderer.setInterpolation(true);
    renderer.setInterpolation(true); // unchanged: no second reset needed
    w.frame.tick = 7;
    moveShip(w, 124, 50);
    w.frame.alpha = 0.5;
    renderer.render(w.frame);
    expect(shipX(renderer)).toBe(124);
    w.frame.tick = 8;
    moveShip(w, 128, 50);
    renderer.render(w.frame);
    expect(shipX(renderer)).toBe(126);
  });

  it('draws the current tick on a jump of several ticks and on a tick that went back', async () => {
    const { renderer } = await makeRenderer({ interpolation: true });
    const w = shipWorld();
    w.frame.tick = 20;
    renderer.render(w.frame);
    w.frame.tick = 23; // three ticks at once (a slow frame)
    moveShip(w, 110, 50);
    w.camera.x = 3;
    w.frame.alpha = 0.5;
    renderer.render(w.frame);
    expect(shipX(renderer)).toBe(107);
    w.frame.tick = 5; // a new session / a restart
    moveShip(w, 60, 50);
    w.camera.x = 0;
    renderer.render(w.frame);
    expect(shipX(renderer)).toBe(60);
  });

  it('clamps alpha: above 1 draws the current tick, below 0 or NaN the previous one', async () => {
    const { renderer } = await makeRenderer({ interpolation: true });
    const w = shipWorld();
    w.frame.tick = 1;
    renderer.render(w.frame);
    w.frame.tick = 2;
    moveShip(w, 108, 50);
    const drawn: number[] = [];
    for (const alpha of [2, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      w.frame.alpha = alpha;
      renderer.render(w.frame);
      drawn.push(shipX(renderer));
    }
    expect(drawn).toEqual([108, 100, 100, 108]);
  });

  it('survives frames without a world and starts over when the world comes back', async () => {
    const { renderer } = await makeRenderer({ interpolation: true, showHitbox: true });
    const w = shipWorld();
    const world = w.frame.world;
    w.frame.tick = 1;
    renderer.render(w.frame);
    w.frame.world = null;
    w.frame.tick = 2;
    expect(() => renderer.render(w.frame)).not.toThrow();
    expect(renderer.bindings).toHaveLength(0);
    w.frame.world = world;
    w.frame.tick = 3;
    moveShip(w, 104, 50);
    w.frame.alpha = 0.5;
    renderer.render(w.frame);
    expect(shipX(renderer)).toBe(104);
    expect(centres(renderer).marker[0]).toBe(104);
  });

  it('reads the layer effects camera ranges with the interpolated camera', async () => {
    const { renderer } = await makeRenderer({ interpolation: true });
    const w = shipWorld({ effects: EFFECTS });
    w.camera.x = 99;
    w.frame.tick = 1;
    renderer.render(w.frame);
    expect(renderer.layerEffects.attachedMask).toBe(0);
    // The next tick's camera is inside the range; the frame drawn at alpha 0 is not yet.
    w.camera.x = 101;
    w.frame.tick = 2;
    w.frame.alpha = 0;
    renderer.render(w.frame);
    expect(renderer.layerEffects.attachedMask).toBe(0);
    w.frame.alpha = 0.5; // camera 100: from ≤ x
    renderer.render(w.frame);
    expect(renderer.layerEffects.attachedMask).toBe(1 << LayerId.BgMid);
    // Without interpolation the current camera decides.
    renderer.setInterpolation(false);
    w.frame.alpha = 0;
    renderer.render(w.frame);
    expect(renderer.layerEffects.attachedMask).toBe(1 << LayerId.BgMid);
  });
});

describe('render-pixi/renderer scale modes: edges (plan M2-08)', () => {
  it('switches the mode before the first frame and keeps it through broken resizes', async () => {
    const { renderer } = await makeRenderer({ displayWidth: 1920, displayHeight: 1080 });
    expect(renderer.viewport).toMatchObject({ mode: 'integer', scale: 5, x: 0, y: 0 });
    renderer.setScaleMode('fit');
    expect(renderer.viewport).toMatchObject({ mode: 'fit', width: 1920, height: 1080, scale: 5 });
    for (const [w, h] of [
      [0, 0],
      [-10, 300],
      [Number.NaN, 200],
      [640.9, 360.2],
    ]) {
      renderer.resize(w, h);
      expect(renderer.scaleMode).toBe('fit');
      const vp = renderer.viewport;
      expect(vp.mode).toBe('fit');
      for (const value of [vp.scale, vp.scaleX, vp.scaleY, vp.x, vp.y, vp.width, vp.height]) {
        expect(Number.isFinite(value)).toBe(true);
      }
      expect(vp.width).toBeGreaterThanOrEqual(1);
    }
    // 640×360 (floored): the frame at 5/3.
    expect(renderer.viewport).toMatchObject({ width: 640, height: 360, x: 0, y: 0 });
    renderer.setScaleMode('stretch');
    expect(renderer.viewport).toMatchObject({ mode: 'stretch', width: 640, height: 360 });
  });

  it('crops (integer) or shrinks (fit) the frame on a display smaller than it', async () => {
    const { renderer } = await makeRenderer({ displayWidth: 300, displayHeight: 200 });
    const { frame } = shipWorld();
    renderer.render(frame);
    const quad = (presented.screen as Pixi.Container).children[2] as Pixi.Sprite;
    expect(renderer.viewport).toMatchObject({ scale: 1, x: -42, y: -8, width: 384, height: 216 });
    expect([quad.x, quad.y, quad.scale.x]).toEqual([-42, -8, 1]);
    renderer.setScaleMode('fit');
    expect(renderer.viewport).toMatchObject({ width: 300, height: 169, x: 0, y: 15 });
    expect(quad.scale.x).toBeCloseTo(300 / 384, 10);
    expect(quad.scale.y).toBeCloseTo(169 / 216, 10);
  });
});

describe('render-pixi/renderer hitbox layer and layer effects: edges (plan M2-08)', () => {
  it('has no markers for a world without a hitbox view, and draws nothing when shown', async () => {
    const { renderer } = await makeRenderer({ showHitbox: true });
    const w = shipWorld({ hitboxes: false });
    renderer.render(w.frame);
    expect(renderer.hitboxes).toBeNull();
    expect(renderer.layers.layers[LayerId.Hitbox].children).toHaveLength(0);
    renderer.setShowHitbox(false);
    renderer.setShowHitbox(true);
    expect(() => renderer.render(w.frame)).not.toThrow();
  });

  it('binds the layer effects without an atlas, and no hitbox markers', async () => {
    const { renderer } = await makeRenderer({ atlas: null });
    const w = shipWorld({ effects: EFFECTS });
    w.camera.x = 150;
    renderer.render(w.frame);
    expect(renderer.hitboxes).toBeNull();
    expect(renderer.layerEffects.attachedMask).toBe(1 << LayerId.BgMid);
    expect(renderer.layerEffects.activeRaster).toBe(1);
  });

  it('rebinds the markers and the effects when the world changes, and destroys them', async () => {
    const { renderer, destroyed } = await makeRenderer({ showHitbox: true });
    const first = shipWorld({ effects: EFFECTS });
    first.camera.x = 200;
    renderer.render(first.frame);
    const markers = renderer.hitboxes;
    expect(renderer.layerEffects.attachedMask).toBe(1 << LayerId.BgMid);
    // A world without effects: the filter comes off; the markers are the new world's.
    const second = shipWorld();
    renderer.render(second.frame);
    expect(renderer.layerEffects.attachedMask).toBe(0);
    expect(renderer.layers.layers[LayerId.BgMid].filters ?? null).toBeNull();
    expect(renderer.hitboxes).not.toBe(markers);
    expect(markers?.container.destroyed).toBe(true);
    expect(renderer.layers.layers[LayerId.Hitbox].children).toEqual([renderer.hitboxes?.container]);
    expect(destroyed.count).toBe(0); // filters are kept across worlds
    renderer.destroy();
    expect(destroyed.count).toBe(1);
  });
});

describe('render-pixi/renderer flashes: edges (plan M2-08)', () => {
  /**
   * The two flash overlays (the last children of the world group).
   *
   * @param renderer - The renderer.
   * @returns The ordinary and the additive overlay.
   */
  const overlays = (renderer: PixiRenderer): { flash: Pixi.Sprite; add: Pixi.Sprite } => {
    const children = renderer.layers.world.children;
    return {
      flash: children[children.length - 2] as Pixi.Sprite,
      add: children[children.length - 1] as Pixi.Sprite,
    };
  };

  it('caps the additive Mega Crash flash under reduced flashing and fades it out', async () => {
    const { renderer } = await makeRenderer({ effects: { reduceFlashing: true } });
    const { frame } = shipWorld();
    const { flash, add } = overlays(renderer);
    renderer.render(frame);
    renderer.effects.flash(FlashKind.MegaCrash, 10);
    frame.tick = 1;
    renderer.render(frame);
    expect([add.visible, flash.visible]).toEqual([true, false]);
    expect(add.alpha).toBeLessThanOrEqual(REDUCED_FLASH_ALPHA + 1e-9);
    expect(add.alpha).toBeGreaterThan(0);
    frame.tick = 20;
    renderer.render(frame);
    expect([add.visible, flash.visible]).toEqual([false, false]);
  });

  it('hands over to the overlay when a non-additive flash replaces the Mega Crash mid-fade', async () => {
    const { renderer } = await makeRenderer();
    const { frame } = shipWorld();
    const { flash, add } = overlays(renderer);
    renderer.render(frame);
    renderer.effects.flash(FlashKind.MegaCrash, 30);
    frame.tick = 5;
    renderer.render(frame);
    expect(add.visible).toBe(true);
    expect(renderer.effects.flashAdditive).toBe(true);
    renderer.effects.flash(FlashKind.BossBlast, 30);
    expect(renderer.effects.flashAdditive).toBe(false);
    frame.tick = 6;
    renderer.render(frame);
    expect([add.visible, flash.visible, flash.tint]).toEqual([false, true, 0xffffff]);
    // An unknown kind is an ordinary overlay too.
    frame.tick = 200;
    renderer.render(frame);
    renderer.effects.flash(99, 10);
    expect(renderer.effects.flashAdditive).toBe(false);
    frame.tick = 201;
    renderer.render(frame);
    expect([add.visible, flash.visible]).toEqual([false, true]);
  });
});
