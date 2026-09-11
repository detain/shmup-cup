/**
 * Tests for sprite bindings and the quad pool (headless: Pixi display objects need no GPU, the
 * atlas is built over fake page images): frame resolution incl. missing sprites and
 * out-of-range frames, camera and playfield offsets, anchor-correct flips, blink, hit flash,
 * hiding of unused slots, and the ordered quad pool.
 */
import { LayerId, PLAYFIELD_Y, SpriteFlag, createSpriteBatch, pushSprite } from '@shmup/core';
import type { Sprite } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { createAtlas, type Atlas } from '../../src/atlas/index.js';
import {
  createQuadPool,
  createSpriteLayerBinding,
  createSpriteTables,
  moduleInfo,
  resolveFrame,
} from '../../src/sprites/index.js';
import { pageImages, testManifest } from '../helpers.js';

/** Sprite name table used by the tests: id 0 = ships/a, 1 = bg/tile, 2 = unknown. */
const NAMES = ['ships/a', 'bg/tile', 'ghost'];

/** @returns A test atlas (warnings silenced). */
function atlas(): Atlas {
  const manifest = testManifest();
  return createAtlas(manifest, pageImages(manifest), { onWarning: () => {} });
}

/**
 * The visible state of a sprite.
 *
 * @param sprite - A Pixi sprite.
 */
function state(sprite: Sprite) {
  return {
    visible: sprite.visible,
    x: sprite.x,
    y: sprite.y,
    sx: sprite.scale.x,
    sy: sprite.scale.y,
  };
}

describe('render-pixi/sprites resolveFrame', () => {
  it('describes itself as implemented', () => {
    expect(moduleInfo.name).toBe('sprites');
    expect(moduleInfo.status).toBe('implemented');
  });

  it('adds the frame to the sprite base and switches to the flash table on Flash', () => {
    const a = atlas();
    const tables = createSpriteTables(a, NAMES);
    expect(resolveFrame(a, tables, 0, 0, 0)).toBe(17);
    expect(resolveFrame(a, tables, 0, 2, 0)).toBe(19);
    expect(resolveFrame(a, tables, 0, 1, SpriteFlag.Flash)).toBe(21);
    expect(resolveFrame(a, tables, 1, 0, SpriteFlag.Flash)).toBe(0);
  });

  it('draws ui/missing for unknown names, out-of-range ids and out-of-range frames', () => {
    const a = atlas();
    const tables = createSpriteTables(a, NAMES);
    expect(resolveFrame(a, tables, 2, 0, 0)).toBe(a.missingFrame);
    expect(resolveFrame(a, tables, 2, 1, 0)).toBe(a.missingFrame);
    expect(resolveFrame(a, tables, 3, 0, 0)).toBe(a.missingFrame);
    expect(resolveFrame(a, tables, -1, 0, 0)).toBe(a.missingFrame);
    expect(resolveFrame(a, tables, Number.NaN, 0, 0)).toBe(a.missingFrame);
    expect(resolveFrame(a, tables, 0, 3, 0)).toBe(a.missingFrame);
    expect(resolveFrame(a, tables, 1, 1, 0)).toBe(a.missingFrame);
  });
});

describe('render-pixi/sprites createSpriteLayerBinding', () => {
  it('preallocates hidden sprites in its own container', () => {
    const a = atlas();
    const binding = createSpriteLayerBinding({
      atlas: a,
      tables: createSpriteTables(a, NAMES),
      capacity: 4,
      layer: LayerId.Player,
    });
    expect(binding.container.children).toHaveLength(4);
    expect(binding.container.children.every((child) => !child.visible)).toBe(true);
    expect([binding.capacity, binding.layer, binding.visibleCount]).toEqual([4, LayerId.Player, 0]);
    expect(() =>
      createSpriteLayerBinding({
        atlas: a,
        tables: createSpriteTables(a, NAMES),
        capacity: 0,
        layer: 0,
      }),
    ).toThrow(RangeError);
  });

  it('syncs texture and anchor-adjusted, camera-relative, rounded positions below the HUD bar', () => {
    const a = atlas();
    const binding = createSpriteLayerBinding({
      atlas: a,
      tables: createSpriteTables(a, NAMES),
      capacity: 4,
      layer: LayerId.Player,
    });
    const batch = createSpriteBatch(LayerId.Player, 4);
    pushSprite(batch, 110.4, 60.6, 0, 1);
    binding.sync(batch, 10, 20);
    const sprite = binding.container.children[0] as Sprite;
    expect(sprite.texture).toBe(a.textures[18]);
    // anchor (8,4): x = round(110.4 − 10) − 8, y = round(60.6 − 20) + PLAYFIELD_Y − 4
    expect(state(sprite)).toEqual({ visible: true, x: 92, y: 41 + PLAYFIELD_Y - 4, sx: 1, sy: 1 });
    expect(binding.visibleCount).toBe(1);
  });

  it('mirrors around the anchor point when flipped (the anchor stays put)', () => {
    const a = atlas();
    const binding = createSpriteLayerBinding({
      atlas: a,
      tables: createSpriteTables(a, NAMES),
      capacity: 2,
      layer: LayerId.Player,
      offsetY: 0,
    });
    const batch = createSpriteBatch(LayerId.Player, 2);
    pushSprite(batch, 100, 50, 0, 0, SpriteFlag.FlipX);
    pushSprite(batch, 100, 50, 0, 0, SpriteFlag.FlipY);
    binding.sync(batch, 0, 0);
    const [flipX, flipY] = binding.container.children as Sprite[];
    // unflipped covers x 92…107; flipped with scale −1 at x = 108 covers 92…107 too
    expect(state(flipX)).toEqual({ visible: true, x: 108, y: 46, sx: -1, sy: 1 });
    expect(state(flipY)).toEqual({ visible: true, x: 92, y: 54, sx: 1, sy: -1 });
  });

  it('hides Hidden slots, draws the flash sibling on Flash, and hides slots past count', () => {
    const a = atlas();
    const binding = createSpriteLayerBinding({
      atlas: a,
      tables: createSpriteTables(a, NAMES),
      capacity: 3,
      layer: LayerId.AirEnemies,
    });
    const batch = createSpriteBatch(LayerId.AirEnemies, 3);
    pushSprite(batch, 0, 0, 0, 0, SpriteFlag.Hidden);
    pushSprite(batch, 0, 0, 0, 2, SpriteFlag.Flash);
    pushSprite(batch, 0, 0, 1, 0);
    binding.sync(batch, 0, 0);
    const sprites = binding.container.children as Sprite[];
    expect(sprites.map((s) => s.visible)).toEqual([false, true, true]);
    expect(sprites[1].texture).toBe(a.textures[22]);
    expect(binding.visibleCount).toBe(2);

    batch.count = 1;
    batch.flags[0] = 0;
    binding.sync(batch, 0, 0);
    expect(sprites.map((s) => s.visible)).toEqual([true, false, false]);
  });

  it('clamps count to its capacity and draws missing sprites as ui/missing', () => {
    const a = atlas();
    const binding = createSpriteLayerBinding({
      atlas: a,
      tables: createSpriteTables(a, NAMES),
      capacity: 1,
      layer: LayerId.Items,
    });
    const batch = createSpriteBatch(LayerId.Items, 3);
    pushSprite(batch, 5, 5, 2, 0);
    pushSprite(batch, 5, 5, 0, 0);
    binding.sync(batch, 0, 0);
    const sprite = binding.container.children[0] as Sprite;
    expect(sprite.texture).toBe(a.textures[a.missingFrame]);
    expect(binding.visibleCount).toBe(1);
  });

  it('reads the tables object on every sync (replacing its arrays retargets the binding)', () => {
    const a = atlas();
    const tables = createSpriteTables(a, NAMES);
    const binding = createSpriteLayerBinding({ atlas: a, tables, capacity: 1, layer: 0 });
    const batch = createSpriteBatch(LayerId.BgFar, 1);
    pushSprite(batch, 0, 0, 0, 0);
    const swapped = createSpriteTables(a, ['bg/tile']);
    tables.base = swapped.base;
    tables.flash = swapped.flash;
    binding.sync(batch, 0, 0);
    expect((binding.container.children[0] as Sprite).texture).toBe(a.textures[0]);
  });

  it('destroy() destroys the container and its sprites', () => {
    const a = atlas();
    const binding = createSpriteLayerBinding({
      atlas: a,
      tables: createSpriteTables(a, NAMES),
      capacity: 2,
      layer: 0,
    });
    const child = binding.container.children[0];
    binding.destroy();
    expect(binding.container.destroyed).toBe(true);
    expect(child.destroyed).toBe(true);
  });
});

describe('render-pixi/sprites createQuadPool', () => {
  it('draws in call order, positions frames by their anchor and hides what a pass did not use', () => {
    const a = atlas();
    const pool = createQuadPool({ atlas: a, capacity: 4 });
    const sprites = pool.container.children as Sprite[];
    pool.begin();
    expect(pool.rect(1.4, 2.6, 10, 3, 0x123456, 128)).toBe(true);
    expect(pool.frame(17, 20, 20, 0, 0xff0000, 255)).toBe(true);
    expect(pool.frame(17, 40, 20, SpriteFlag.FlipX, 0xffffff, 255)).toBe(true);
    pool.end();
    expect(pool.used).toBe(3);
    expect(sprites[0].texture).toBe(a.textures[a.pixelFrame]);
    expect(state(sprites[0])).toEqual({ visible: true, x: 1, y: 3, sx: 10, sy: 3 });
    expect(sprites[0].tint).toBe(0x123456);
    expect(sprites[0].alpha).toBeCloseTo(128 / 255);
    expect(state(sprites[1])).toEqual({ visible: true, x: 12, y: 16, sx: 1, sy: 1 });
    expect(sprites[1].tint).toBe(0xff0000);
    expect(state(sprites[2])).toEqual({ visible: true, x: 48, y: 16, sx: -1, sy: 1 });
    expect(sprites[3].visible).toBe(false);

    pool.begin();
    pool.frame(0, 0, 0, 0, 0xffffff, 255);
    pool.end();
    expect(sprites.map((s) => s.visible)).toEqual([true, false, false, false]);
    expect(sprites[0].scale.x).toBe(1);
  });

  it('rejects calls past its capacity and counts them; unknown frame ids draw ui/missing', () => {
    const a = atlas();
    const pool = createQuadPool({ atlas: a, capacity: 2 });
    pool.begin();
    pool.frame(9999, 0, 0, 0, 0xffffff, 255);
    pool.rect(0, 0, 0, 5, 0xffffff, 255);
    expect(pool.frame(0, 0, 0, 0, 0xffffff, 255)).toBe(false);
    expect(pool.rect(0, 0, 1, 1, 0, 255)).toBe(false);
    pool.end();
    const sprites = pool.container.children as Sprite[];
    expect(sprites[0].texture).toBe(a.textures[a.missingFrame]);
    expect(sprites[1].visible).toBe(false);
    expect(pool.dropped).toBe(2);
    expect(() => createQuadPool({ atlas: a, capacity: -1 })).toThrow(RangeError);
  });

  it('a pass abandoned without end() is still cleaned up by the next pass', () => {
    const a = atlas();
    const pool = createQuadPool({ atlas: a, capacity: 3 });
    pool.begin();
    pool.frame(0, 0, 0, 0, 0xffffff, 255);
    pool.frame(0, 0, 0, 0, 0xffffff, 255);
    pool.begin();
    pool.frame(0, 0, 0, 0, 0xffffff, 255);
    pool.end();
    expect((pool.container.children as Sprite[]).map((s) => s.visible)).toEqual([
      true,
      false,
      false,
    ]);
  });
});
