/**
 * The R3-06.L4 additive sprite set of `render-pixi/sprites`: a binding created with
 * `additive: true` gives every preallocated sprite `blendMode = 'add'` **at creation** (the
 * sync path never touches blend state — changing it per frame would make Pixi rebuild), draws
 * the batch like any other binding, and a plain binding keeps the default blend. The batch
 * view's `blend` marker (from core `createSpriteBatch(layer, n, 'additive')`) is what the
 * renderer's `bindWorld` maps to this flag.
 */
import { LayerId, createSpriteBatch, pushSprite } from '@shmup/core';
import type { Sprite } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { createAtlas, type Atlas } from '../../src/atlas/index.js';
import { createSpriteLayerBinding, createSpriteTables } from '../../src/sprites/index.js';
import { pageImages, testManifest } from '../helpers.js';

/** Sprite name table used by the tests: id 0 = ships/a, 1 = bg/tile. */
const NAMES = ['ships/a', 'bg/tile'];

/** @returns A test atlas (warnings silenced). */
function atlas(): Atlas {
  const manifest = testManifest();
  return createAtlas(manifest, pageImages(manifest), { onWarning: () => {} });
}

/**
 * A small filled batch on a layer.
 *
 * @param layer - Layer code.
 * @param blend - Blend marker for `createSpriteBatch` (R3-06.L4).
 * @returns The batch with two sprites.
 */
function batch(layer: LayerId, blend?: 'additive') {
  const b = createSpriteBatch(layer, 4, blend);
  pushSprite(b, 120, 60, 0, 0, 0);
  pushSprite(b, 240, 80, 1, 0, 0);
  return b;
}

describe('render-pixi/sprites additive binding (R3-06.L4)', () => {
  it('sets the add blend once at creation, never during sync', () => {
    const a = atlas();
    const binding = createSpriteLayerBinding({
      atlas: a,
      tables: createSpriteTables(a, NAMES),
      capacity: 4,
      layer: LayerId.AirEnemies,
      additive: true,
    });
    const sprites = binding.container.children as Sprite[];
    expect(sprites.every((s) => s.blendMode === 'add')).toBe(true);
    // Syncing draws normally and leaves the blend state alone.
    binding.sync(batch(LayerId.AirEnemies, 'additive'), 0, 0);
    expect(binding.visibleCount).toBe(2);
    expect(sprites.every((s) => s.blendMode === 'add')).toBe(true);
    const empty = createSpriteBatch(LayerId.AirEnemies, 4);
    binding.sync(empty, 0, 0); // no slots live
    expect(binding.visibleCount).toBe(0);
    expect(sprites.every((s) => s.blendMode === 'add')).toBe(true);
    binding.destroy();
  });

  it('keeps the default blend for a plain binding (absent flag)', () => {
    const a = atlas();
    const binding = createSpriteLayerBinding({
      atlas: a,
      tables: createSpriteTables(a, NAMES),
      capacity: 2,
      layer: LayerId.AirEnemies,
    });
    const sprites = binding.container.children as Sprite[];
    expect(sprites.every((s) => s.blendMode !== 'add')).toBe(true);
    binding.sync(batch(LayerId.AirEnemies), 0, 0);
    expect(binding.visibleCount).toBe(2);
  });

  it('maps the batch view blend marker to the binding flag (bindWorld contract)', () => {
    const glow = batch(LayerId.DecorBack, 'additive');
    const plain = batch(LayerId.DecorBack);
    expect(glow.blend).toBe('additive');
    expect(plain.blend).toBeUndefined();
    // The renderer's one expression: `additive: batch.blend === 'additive'`.
    const a = atlas();
    const binding = createSpriteLayerBinding({
      atlas: a,
      tables: createSpriteTables(a, NAMES),
      capacity: glow.capacity,
      layer: glow.layer,
      additive: glow.blend === 'additive',
    });
    expect((binding.container.children as Sprite[])[0].blendMode).toBe('add');
    binding.destroy();
  });
});
