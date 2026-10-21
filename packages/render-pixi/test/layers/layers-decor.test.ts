/**
 * R3-06.L3 — decor layers and animated / fore parallax bands, headless over the test atlas:
 * `createParallaxBinding` accepts a band on `FOREGROUND` beside `BG_FAR` / `BG_MID` and drives its
 * sprite frame from the view's `frameIndex` (out-of-range frames fall back to the atlas's missing
 * frame; a view without the field stays on frame 0, v1-style), band rows follow the view's `y`
 * (the core runtime folds `yFactor` in — the renderer just paints it), and the renderer's
 * `bindWorld` binds `FOREGROUND` bands plus the two decor batches (`DECOR_BACK` / `DECOR_FRONT`,
 * through the generic batch path, onto their own layers) while a band on any other layer still
 * throws before anything is bound. Guide: docs/dev/rendering-and-shell.md.
 */
import {
  LayerId,
  PLAYFIELD_W,
  PLAYFIELD_Y,
  createSpriteBatch,
  pushSprite,
  type ParallaxView,
  type WorldView,
} from '@shmup/core';
import type * as Pixi from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { createAtlas, type Atlas } from '../../src/atlas/index.js';
import { createParallaxBinding } from '../../src/layers/index.js';
import { createPixiRenderer } from '../../src/renderer/index.js';
import { createSpriteTables } from '../../src/sprites/index.js';
import { pageImages, testManifest } from '../helpers.js';

/** Sprite names: 0 = ships/a (3 frames), 1 = bg/tile, 2 = unknown. */
const NAMES = ['ships/a', 'bg/tile', 'ghost'];

/** @returns The test atlas (warnings silenced). */
function atlas(): Atlas {
  const manifest = testManifest();
  return createAtlas(manifest, pageImages(manifest), { onWarning: () => {} });
}

/** A three-band view: far, mid and the R3-06 fore band (animated sprite id 0). */
function decorView(): ParallaxView & { offsetX: Float64Array; y: Float64Array } {
  return {
    count: 3,
    layer: new Uint8Array([LayerId.BgFar, LayerId.BgMid, LayerId.Foreground]),
    spriteId: new Uint16Array([1, 1, 0]),
    offsetX: new Float64Array([0, 0, 0]),
    y: new Float64Array([0, 12, 4]),
    spacing: new Uint16Array([16, 128, 32]),
    frameIndex: new Uint8Array([0, 0, 0]),
  };
}

describe('render-pixi/layers decor and fore parallax (R3-06.L3)', () => {
  it('accepts a band on FOREGROUND and reports the layers verbatim', () => {
    const a = atlas();
    const tables = createSpriteTables(a, NAMES);
    const binding = createParallaxBinding({ atlas: a, tables, view: decorView() });
    expect(binding.layers).toEqual([LayerId.BgFar, LayerId.BgMid, LayerId.Foreground]);
    expect(binding.containers.map((c) => c.children.length)).toEqual(
      [16, 128, 32].map((spacing) => Math.ceil(PLAYFIELD_W / spacing) + 1),
    );
  });

  it('draws each band on the frame its frameIndex names', () => {
    const a = atlas();
    const tables = createSpriteTables(a, NAMES);
    const view = decorView();
    const frames = view.frameIndex as Uint8Array;
    const binding = createParallaxBinding({ atlas: a, tables, view });
    const fore = binding.containers[2].children as Pixi.Sprite[];
    for (const frame of [0, 1, 2]) {
      frames[2] = frame;
      binding.sync(view);
      expect(fore.every((s) => s.texture === a.textures[tables.base[0] + frame])).toBe(true);
    }
    // An out-of-range frame falls back to the missing frame, never a throw.
    frames[2] = 3;
    binding.sync(view);
    expect(fore[0].texture).toBe(a.textures[a.missingFrame]);
  });

  it('keeps a view without frameIndex on frame 0 (v1 fixtures)', () => {
    const a = atlas();
    const tables = createSpriteTables(a, NAMES);
    const view: ParallaxView & { offsetX: Float64Array; y: Float64Array } = { ...decorView() };
    delete (view as { frameIndex?: Uint8Array }).frameIndex;
    const binding = createParallaxBinding({ atlas: a, tables, view });
    binding.sync(view);
    const fore = binding.containers[2].children as Pixi.Sprite[];
    expect(fore.every((s) => s.texture === a.textures[tables.base[0]])).toBe(true);
  });

  it('paints the view y onto the band container (yFactor folded by core)', () => {
    const a = atlas();
    const tables = createSpriteTables(a, NAMES);
    const view = decorView();
    const binding = createParallaxBinding({ atlas: a, tables, view });
    view.y[1] = 20.4;
    view.y[2] = -5.6; // a fore band may ride above the playfield top row
    binding.sync(view);
    expect(binding.containers[1].y).toBe(PLAYFIELD_Y + 20);
    expect(binding.containers[2].y).toBe(PLAYFIELD_Y - 6);
  });

  it('still rejects bands on any other layer', () => {
    const a = atlas();
    const tables = createSpriteTables(a, NAMES);
    for (const bad of [LayerId.DecorBack, LayerId.DecorFront, LayerId.Terrain, LayerId.Player]) {
      const view = { ...decorView(), layer: new Uint8Array([LayerId.BgFar, LayerId.BgMid, bad]) };
      expect(() => createParallaxBinding({ atlas: a, tables, view })).toThrow(RangeError);
    }
  });
});

// --------------------------------------------------------------------------- renderer-level

const record = vi.hoisted(() => ({ webGLVersion: 1 }));

vi.mock('pixi.js', async (importOriginal) => {
  const real = await importOriginal<typeof Pixi>();
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
    init(): Promise<void> {
      return Promise.resolve();
    }
    resize(): void {
      // Not inspected by these tests.
    }
    render(options: {
      target?: unknown;
      clear?: boolean;
      clearColor?: unknown;
      transform?: unknown;
      container?: Pixi.Container;
    }): void {
      options.target ??= CANVAS_TARGET;
      if (options.target === CANVAS_TARGET) {
        options.clearColor ??= [0, 0, 0, 1];
        options.clear ??= true;
      }
      options.transform ??= (options.container as Pixi.Container).localTransform;
    }
    destroy(): void {
      // Not inspected by these tests.
    }
  }
  const FakeRenderTexture = {
    create(options: Record<string, unknown>) {
      return new real.Texture({
        source: new real.TextureSource({
          width: options.width as number,
          height: options.height as number,
        }),
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

/** @returns A renderer over the test atlas at the native frame size. */
function makeRenderer() {
  return createPixiRenderer({ canvas, displayWidth: 640, displayHeight: 360, atlas: atlas() });
}

/**
 * A world whose view draws the three bands and three batches: both decor layers and bullets.
 *
 * @returns The world view.
 */
function decorWorld(): WorldView {
  const back = createSpriteBatch(LayerId.DecorBack, 4);
  pushSprite(back, 10, 20, 1, 0);
  const front = createSpriteBatch(LayerId.DecorFront, 4);
  pushSprite(front, 30, 40, 1, 0);
  const bullets = createSpriteBatch(LayerId.EnemyBullets, 4);
  pushSprite(bullets, 50, 60, 1, 0);
  return {
    camera: { x: 0, y: 0 },
    parallax: decorView(),
    terrain: null,
    batches: [back, front, bullets],
  };
}

describe('render-pixi/renderer binds decor layers and fore bands (R3-06.L3)', () => {
  it('binds a FOREGROUND band and both decor batches under their layers', async () => {
    const renderer = await makeRenderer();
    renderer.bindWorld(decorWorld());
    const parallax = renderer.parallax;
    if (parallax === null) throw new Error('bindWorld created no parallax binding');
    expect(parallax.layers).toEqual([LayerId.BgFar, LayerId.BgMid, LayerId.Foreground]);
    expect(renderer.layers.layers[LayerId.Foreground].children).toContain(parallax.containers[2]);
    expect(renderer.bindings.map((b) => b.layer)).toEqual([
      LayerId.DecorBack,
      LayerId.DecorFront,
      LayerId.EnemyBullets,
    ]);
    const [back, front] = renderer.bindings;
    expect(renderer.layers.layers[LayerId.DecorBack].children).toContain(back.container);
    expect(renderer.layers.layers[LayerId.DecorFront].children).toContain(front.container);
  });

  it('still rejects a band off the three band layers, destroying the old bindings first', async () => {
    const renderer = await makeRenderer();
    renderer.bindWorld(decorWorld());
    const bad: WorldView = {
      ...decorWorld(),
      parallax: {
        ...decorView(),
        layer: new Uint8Array([LayerId.BgFar, LayerId.BgMid, LayerId.Player]),
      },
    };
    expect(() => renderer.bindWorld(bad)).toThrow(RangeError);
    expect([renderer.bindings, renderer.parallax]).toEqual([[], null]);
  });
});
