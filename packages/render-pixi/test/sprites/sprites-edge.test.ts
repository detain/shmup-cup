/**
 * Edge cases of sprite bindings and the quad pool: frame resolution with fractional / NaN /
 * negative inputs and empty tables, flash + frame validation against the flash sibling,
 * rounding of camera-relative positions, blink and count changes across syncs, custom y
 * offsets, combined flips, and the quad pool's texture / scale / tint resets between reused
 * sprites. Also checks that neither sync nor a quad pass ever creates or re-parents a Pixi
 * object and that both stay (nearly) allocation-free per frame (plan §1.3) — re-tinting a quad
 * with an unchanged colour used to allocate inside Pixi's `Color` on every pass, and a translucent
 * quad's fractional alpha could be boxed on every pass (it is now written only on change).
 */
import { LayerId, PLAYFIELD_Y, SpriteFlag, createSpriteBatch, pushSprite } from '@shmup/core';
import type { Container, Sprite } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { createAtlas, type Atlas } from '../../src/atlas/index.js';
import {
  createQuadPool,
  createSpriteLayerBinding,
  createSpriteTables,
  resolveFrame,
  type SpriteTables,
} from '../../src/sprites/index.js';
import { measureAllocation, pageImages, testManifest } from '../helpers.js';

/** Sprite name table: 0 = ships/a (3 frames + flash), 1 = bg/tile (1 frame), 2 = unknown. */
const NAMES = ['ships/a', 'bg/tile', 'ghost'];

/** @returns The test atlas (warnings silenced). */
function atlas(): Atlas {
  const manifest = testManifest();
  return createAtlas(manifest, pageImages(manifest), { onWarning: () => {} });
}

/**
 * A binding over the test atlas.
 *
 * @param capacity - Sprites.
 * @param offsetY - Y offset (default PLAYFIELD_Y).
 */
function binding(capacity: number, offsetY?: number) {
  const a = atlas();
  const tables = createSpriteTables(a, NAMES);
  const b = createSpriteLayerBinding({ atlas: a, tables, capacity, layer: LayerId.Fx, offsetY });
  return { a, tables, b, sprites: b.container.children as Sprite[] };
}

/**
 * Identity snapshot of a container's children.
 *
 * @param container - Container.
 */
const childrenOf = (container: Container): unknown[] => container.children.slice();

describe('render-pixi/sprites resolveFrame (edge)', () => {
  it('truncates fractional sprite ids and frames; NaN / -0.5 frames count as frame 0', () => {
    const a = atlas();
    const tables = createSpriteTables(a, NAMES);
    const base = a.spriteBase('ships/a');
    expect(resolveFrame(a, tables, 0.9, 1.9, 0)).toBe(base + 1);
    expect(resolveFrame(a, tables, 0, Number.NaN, 0)).toBe(base);
    expect(resolveFrame(a, tables, 0, -0.5, 0)).toBe(base);
    expect(resolveFrame(a, tables, 0, -1, 0)).toBe(a.missingFrame);
    expect(resolveFrame(a, tables, 2.5, 0, 0)).toBe(a.missingFrame);
    expect(resolveFrame(a, tables, Infinity, 0, 0)).toBe(a.missingFrame);
  });

  it('validates the frame against the flash sibling and keeps unknown sprites missing', () => {
    const a = atlas();
    const tables = createSpriteTables(a, NAMES);
    const flash = a.spriteBase('ships/a@flash');
    expect(resolveFrame(a, tables, 0, 2, SpriteFlag.Flash)).toBe(flash + 2);
    expect(resolveFrame(a, tables, 0, 3, SpriteFlag.Flash)).toBe(a.missingFrame);
    expect(resolveFrame(a, tables, 2, 0, SpriteFlag.Flash)).toBe(a.missingFrame);
    // Other flag bits never change the frame.
    const every = SpriteFlag.FlipX | SpriteFlag.FlipY | SpriteFlag.Hidden;
    expect(resolveFrame(a, tables, 0, 1, every)).toBe(a.spriteBase('ships/a') + 1);
  });

  it('draws ui/missing for every sprite id while the tables are empty', () => {
    const a = atlas();
    const empty: SpriteTables = { base: new Int32Array(0), flash: new Int32Array(0) };
    expect(resolveFrame(a, empty, 0, 0, 0)).toBe(a.missingFrame);
    expect(resolveFrame(a, empty, 0, 0, SpriteFlag.Flash)).toBe(a.missingFrame);
  });

  it('a missing sprite resolves only its frame 0 (ui/missing has a single frame)', () => {
    const a = atlas();
    const tables = createSpriteTables(a, NAMES);
    expect(resolveFrame(a, tables, 2, 0, 0)).toBe(a.missingFrame);
    expect(resolveFrame(a, tables, 2, 5, 0)).toBe(a.missingFrame);
  });
});

describe('render-pixi/sprites createSpriteLayerBinding (edge)', () => {
  it('rejects fractional and NaN capacities and labels its container by layer', () => {
    const a = atlas();
    const tables = createSpriteTables(a, NAMES);
    for (const capacity of [1.5, Number.NaN, -2]) {
      expect(() => createSpriteLayerBinding({ atlas: a, tables, capacity, layer: 0 })).toThrow(
        /positive integer/,
      );
    }
    const b = createSpriteLayerBinding({ atlas: a, tables, capacity: 1, layer: LayerId.Items });
    expect(b.container.label).toBe(`batch-${LayerId.Items}`);
  });

  it('rounds camera-relative positions (half up) before applying the anchor and the offset', () => {
    const { b, sprites } = binding(3, 0);
    const batch = createSpriteBatch(LayerId.Fx, 3);
    pushSprite(batch, 10.5, 20.5, 1, 0); // bg/tile: anchor (0, 0)
    pushSprite(batch, -0.4, -0.6, 1, 0);
    pushSprite(batch, 5, 5, 1, 0);
    b.sync(batch, 0.25, -0.25);
    expect([sprites[0].x, sprites[0].y]).toEqual([10, 21]);
    expect([sprites[1].x + 0, sprites[1].y]).toEqual([-1, 0]);
    expect([sprites[2].x, sprites[2].y]).toEqual([5, 5]);
  });

  it('adds PLAYFIELD_Y by default and any custom offset otherwise', () => {
    const batch = createSpriteBatch(LayerId.Fx, 1);
    pushSprite(batch, 0, 0, 1, 0);
    const byDefault = binding(1);
    byDefault.b.sync(batch, 0, 0);
    expect(byDefault.sprites[0].y).toBe(PLAYFIELD_Y);
    const custom = binding(1, 100);
    custom.b.sync(batch, 0, 0);
    expect(custom.sprites[0].y).toBe(100);
  });

  it('flips both axes around the anchor at once', () => {
    const { a, b, sprites } = binding(1, 0);
    const batch = createSpriteBatch(LayerId.Fx, 1);
    pushSprite(batch, 100, 50, 0, 0, SpriteFlag.FlipX | SpriteFlag.FlipY);
    b.sync(batch, 0, 0);
    const base = a.spriteBase('ships/a');
    expect([sprites[0].scale.x, sprites[0].scale.y]).toEqual([-1, -1]);
    expect([sprites[0].x, sprites[0].y]).toEqual([100 + a.anchorX[base], 50 + a.anchorY[base]]);
    // Unflipping restores the scale and the anchor offset.
    batch.flags[0] = 0;
    b.sync(batch, 0, 0);
    expect([sprites[0].scale.x, sprites[0].scale.y]).toEqual([1, 1]);
    expect([sprites[0].x, sprites[0].y]).toEqual([100 - a.anchorX[base], 50 - a.anchorY[base]]);
  });

  it('blinks: a Hidden slot keeps its sprite but hides it, and reappears with fresh state', () => {
    const { a, b, sprites } = binding(2, 0);
    const batch = createSpriteBatch(LayerId.Fx, 2);
    pushSprite(batch, 10, 10, 0, 0);
    pushSprite(batch, 20, 20, 1, 0);
    b.sync(batch, 0, 0);
    batch.flags[0] = SpriteFlag.Hidden;
    b.sync(batch, 0, 0);
    expect([sprites[0].visible, sprites[1].visible, b.visibleCount]).toEqual([false, true, 1]);
    batch.flags[0] = 0;
    batch.frame[0] = 2;
    b.sync(batch, 0, 0);
    expect(sprites[0].visible).toBe(true);
    expect(sprites[0].texture).toBe(a.textures[a.spriteBase('ships/a') + 2]);
    expect(b.visibleCount).toBe(2);
  });

  it('count 0 hides everything; growing again shows the slots with the new data', () => {
    const { b, sprites } = binding(3, 0);
    const batch = createSpriteBatch(LayerId.Fx, 3);
    for (let i = 0; i < 3; i++) pushSprite(batch, i, 0, 1, 0);
    b.sync(batch, 0, 0);
    batch.count = 0;
    b.sync(batch, 0, 0);
    expect(sprites.map((s) => s.visible)).toEqual([false, false, false]);
    expect(b.visibleCount).toBe(0);
    batch.count = 0;
    pushSprite(batch, 40, 0, 1, 0);
    pushSprite(batch, 50, 0, 1, 0);
    b.sync(batch, 0, 0);
    expect(sprites.map((s) => s.visible)).toEqual([true, true, false]);
    expect(sprites.map((s) => s.x)).toEqual([40, 50, 2]);
  });

  it('draws any SpriteBatchView, e.g. plain arrays of a struct-of-arrays pool', () => {
    const { a, b, sprites } = binding(2, 0);
    b.sync(
      {
        layer: LayerId.Fx,
        capacity: 2,
        count: 2,
        x: [3, 4],
        y: [5, 6],
        spriteId: [1, 0],
        frame: [0, 1],
        flags: [0, SpriteFlag.Flash],
      },
      0,
      0,
    );
    expect(sprites[0].texture).toBe(a.textures[a.spriteBase('bg/tile')]);
    expect(sprites[1].texture).toBe(a.textures[a.spriteBase('ships/a@flash') + 1]);
  });

  it('never creates, removes or reorders Pixi objects while syncing', () => {
    const { b } = binding(4, 0);
    const before = childrenOf(b.container);
    const batch = createSpriteBatch(LayerId.Fx, 8);
    for (let tick = 0; tick < 50; tick++) {
      batch.count = 0;
      for (let i = 0; i < tick % 9; i++) pushSprite(batch, tick + i, i, i % 3, tick % 4, tick & 15);
      b.sync(batch, tick, -tick);
    }
    expect(childrenOf(b.container)).toEqual(before);
    expect(b.container.children.every((child, i) => child === before[i])).toBe(true);
  });
});

describe('render-pixi/sprites createQuadPool (edge)', () => {
  it('rejects fractional capacities and labels its container ("quads" by default)', () => {
    const a = atlas();
    expect(() => createQuadPool({ atlas: a, capacity: 2.5 })).toThrow(RangeError);
    expect(createQuadPool({ atlas: a, capacity: 1 }).container.label).toBe('quads');
    expect(createQuadPool({ atlas: a, capacity: 1, label: 'hud' }).container.label).toBe('hud');
  });

  it('resets texture, scale and tint when a sprite switches between rect and frame', () => {
    const a = atlas();
    const pool = createQuadPool({ atlas: a, capacity: 1 });
    const [sprite] = pool.container.children as Sprite[];
    pool.begin();
    pool.rect(0, 0, 30, 4, 0x00ff00, 255);
    pool.end();
    pool.begin();
    pool.frame(a.spriteBase('bg/tile'), 7, 9, 0, 0xffffff, 255);
    pool.end();
    expect(sprite.texture).toBe(a.textures[a.spriteBase('bg/tile')]);
    expect([sprite.scale.x, sprite.scale.y, sprite.tint, sprite.x, sprite.y]).toEqual([
      1, 1, 0xffffff, 7, 9,
    ]);
    pool.begin();
    pool.rect(2, 3, 5, 6, 0x112233, 51);
    pool.end();
    expect(sprite.texture).toBe(a.textures[a.pixelFrame]);
    expect([sprite.scale.x, sprite.scale.y, sprite.tint, sprite.x, sprite.y]).toEqual([
      5, 6, 0x112233, 2, 3,
    ]);
    expect(sprite.alpha).toBeCloseTo(0.2);
  });

  it('maps out-of-range and negative frame ids to ui/missing (size itself is out of range)', () => {
    const a = atlas();
    const pool = createQuadPool({ atlas: a, capacity: 3 });
    const sprites = pool.container.children as Sprite[];
    pool.begin();
    pool.frame(-1, 0, 0, 0, 0xffffff, 255);
    pool.frame(a.size, 0, 0, 0, 0xffffff, 255);
    pool.frame(a.size - 1, 0, 0, 0, 0xffffff, 255);
    pool.end();
    expect(sprites[0].texture).toBe(a.textures[a.missingFrame]);
    expect(sprites[1].texture).toBe(a.textures[a.missingFrame]);
    expect(sprites[2].texture).toBe(a.textures[a.size - 1]);
  });

  it('takes a slot for an empty or negative rect but keeps it hidden', () => {
    const a = atlas();
    const pool = createQuadPool({ atlas: a, capacity: 3 });
    const sprites = pool.container.children as Sprite[];
    pool.begin();
    expect(pool.rect(0, 0, 0, 4, 0, 255)).toBe(true);
    expect(pool.rect(0, 0, -3, 4, 0, 255)).toBe(true);
    expect(pool.rect(0, 0, 3, 4, 0, 0)).toBe(true);
    pool.end();
    expect(pool.used).toBe(3);
    // A zero-alpha rect stays "visible" (it is drawn, fully transparent).
    expect(sprites.map((s) => s.visible)).toEqual([false, false, true]);
    expect(sprites[2].alpha).toBe(0);
  });

  it('dropped resets on begin(); shrinking passes hide exactly what the last pass drew', () => {
    const a = atlas();
    const pool = createQuadPool({ atlas: a, capacity: 4 });
    const sprites = pool.container.children as Sprite[];
    const pass = (n: number, extra = 0): void => {
      pool.begin();
      for (let i = 0; i < n + extra; i++) pool.rect(i, 0, 1, 1, 0, 255);
      pool.end();
    };
    pass(4, 2);
    expect([pool.used, pool.dropped]).toEqual([4, 2]);
    pass(2);
    expect([pool.used, pool.dropped]).toEqual([2, 0]);
    expect(sprites.map((s) => s.visible)).toEqual([true, true, false, false]);
    pass(1);
    expect(sprites.map((s) => s.visible)).toEqual([true, false, false, false]);
    pass(0);
    expect(sprites.map((s) => s.visible)).toEqual([false, false, false, false]);
    pass(3);
    expect(sprites.map((s) => s.visible)).toEqual([true, true, true, false]);
  });

  it('never creates, removes or reorders Pixi objects across passes', () => {
    const a = atlas();
    const pool = createQuadPool({ atlas: a, capacity: 8 });
    const before = childrenOf(pool.container);
    for (let frame = 0; frame < 40; frame++) {
      pool.begin();
      for (let i = 0; i < (frame * 7) % 11; i++) {
        if (i % 2 === 0) pool.rect(i, i, 2, 2, 0xff00ff, 200);
        else pool.frame(i % a.size, i, i, SpriteFlag.FlipX, 0xffffff, 255);
      }
      pool.end();
    }
    expect(pool.container.children.every((child, i) => child === before[i])).toBe(true);
    expect(pool.container.children).toHaveLength(8);
  });

  it('writes the alpha of a quad only when it changes, through rect and frame alike', () => {
    const a = atlas();
    const pool = createQuadPool({ atlas: a, capacity: 2 });
    const [sprite, other] = pool.container.children as Sprite[];
    // Count the writes that reach Pixi's alpha setter on the first sprite (the spy still sets it).
    const setter = vi.spyOn(sprite, 'alpha', 'set');
    const writes = (): number[] => setter.mock.calls.map((call) => call[0]);
    const pass = (alpha: number, asFrame = false): void => {
      pool.begin();
      if (asFrame) pool.frame(a.spriteBase('bg/tile'), 0, 0, 0, 0xffffff, alpha);
      else pool.rect(0, 0, 4, 4, 0x405070, alpha);
      pool.rect(0, 0, 4, 4, 0x405070, 90);
      pool.end();
    };
    pass(255); // a new quad is already opaque: nothing to write
    expect(writes()).toEqual([]);
    pass(90);
    pass(90);
    pass(90, true);
    expect(writes()).toHaveLength(1);
    expect(sprite.alpha).toBeCloseTo(90 / 255);
    pass(255, true);
    pass(51);
    expect(writes()).toEqual([90 / 255, 1, 51 / 255]);
    expect(sprite.alpha).toBeCloseTo(0.2);
    expect(other.alpha).toBeCloseTo(90 / 255);
  });

  it('redrawing the same HUD every frame allocates next to nothing (tints set only on change)', () => {
    const a = atlas();
    const pool = createQuadPool({ atlas: a, capacity: 40 });
    const glyph = a.spriteBase('font/pixel');
    const bytes = measureAllocation(() => {
      pool.begin();
      pool.rect(0, 0, 384, 8, 0x1d2a5c, 255);
      for (let i = 0; i < 32; i++) pool.frame(glyph + (i % 16), i * 6, 0, 0, 0xf8d030, 255);
      pool.rect(0, 208, 384, 8, 0x1d2a5c, 255);
      pool.end();
    }, 10_000);
    // Assigning the same tint to all 34 quads every pass was ~22 MB here.
    expect(bytes).toBeLessThan(1024 * 1024);
  });
});

describe('render-pixi/sprites per-frame allocation (edge)', () => {
  it('syncing a moving batch allocates next to nothing', () => {
    const { b } = binding(16, 0);
    const batch = createSpriteBatch(LayerId.Fx, 16);
    const bytes = measureAllocation((tick) => {
      batch.count = 0;
      for (let i = 0; i < 12; i++) {
        pushSprite(
          batch,
          i * 9 + (tick % 7),
          tick % 200,
          i % 2,
          tick % 3,
          i === 3 ? SpriteFlag.FlipX : 0,
        );
      }
      b.sync(batch, tick % 13, 0);
    }, 10_000);
    expect(bytes).toBeLessThan(512 * 1024);
  });
});
