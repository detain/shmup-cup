/**
 * Tests for the render contract (plan §3.4): layer order and names, sprite batches, and the
 * DrawList command encoding (every op, clamping, capacity / dropped, string slots, revision).
 */
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  DEFAULT_DRAW_LIST_CAPACITY,
  DEFAULT_DRAW_LIST_STRINGS,
  DrawOp,
  LAYER_COUNT,
  LAYER_NAMES,
  LayerId,
  SpriteFlag,
  TextAlign,
  createDrawList,
  createSpriteBatch,
  moduleInfo,
  pushSprite,
  type IAudio,
  type IRenderer,
  type RenderFrame,
  type SpriteBatchView,
  type WorldView,
} from '../../src/presentation/index.js';

describe('core/presentation', () => {
  it('imports cleanly and describes itself as implemented', () => {
    expect(moduleInfo.name).toBe('presentation');
    expect(moduleInfo.status).toBe('implemented');
  });

  it('declares the renderer and audio contracts and the full RenderFrame', () => {
    expectTypeOf<IRenderer['render']>().parameter(0).toEqualTypeOf<RenderFrame>();
    expectTypeOf<IAudio['unlock']>().returns.toEqualTypeOf<Promise<void>>();
    expectTypeOf<RenderFrame['world']>().toEqualTypeOf<WorldView | null>();
    expectTypeOf<WorldView['batches']>().toEqualTypeOf<readonly SpriteBatchView[]>();
  });
});

describe('core/presentation layers', () => {
  it('lists the 14 draw layers bottom → top in the shmup_feat.md §18 order', () => {
    expect(LAYER_COUNT).toBe(14);
    expect(LAYER_NAMES).toEqual([
      'BG_FAR',
      'BG_MID',
      'TERRAIN',
      'GROUND_ENEMIES',
      'AIR_ENEMIES',
      'PLAYER_SHOTS',
      'PLAYER',
      'HITBOX',
      'ITEMS',
      'FX',
      'ENEMY_BULLETS',
      'HUD',
      'UI',
      'DEBUG',
    ]);
    const codes = Object.values(LayerId);
    expect(codes).toEqual([...Array(LAYER_COUNT).keys()]);
  });

  it('draws enemy bullets above explosions and items (shmup_feat.md §12)', () => {
    expect(LayerId.EnemyBullets).toBeGreaterThan(LayerId.Fx);
    expect(LayerId.Fx).toBeGreaterThan(LayerId.Items);
    expect(LayerId.Hud).toBeGreaterThan(LayerId.EnemyBullets);
  });

  it('uses distinct single-bit sprite flags', () => {
    const bits = Object.values(SpriteFlag);
    expect(bits).toEqual([1, 2, 4, 8]);
  });
});

describe('core/presentation sprite batches', () => {
  it('allocates canonical typed arrays sized to the capacity', () => {
    const batch = createSpriteBatch(LayerId.AirEnemies, 3);
    expect(batch.layer).toBe(LayerId.AirEnemies);
    expect(batch.capacity).toBe(3);
    expect(batch.count).toBe(0);
    expect(batch.x).toBeInstanceOf(Float64Array);
    expect(batch.spriteId).toBeInstanceOf(Uint16Array);
    expect(batch.flags).toBeInstanceOf(Uint8Array);
    expect([batch.x.length, batch.frame.length]).toEqual([3, 3]);
  });

  it('pushSprite appends until full, then reports -1', () => {
    const batch = createSpriteBatch(LayerId.Player, 2);
    expect(pushSprite(batch, 1.5, 2.5, 7, 1, SpriteFlag.FlipX)).toBe(0);
    expect(pushSprite(batch, 3, 4, 8, 0)).toBe(1);
    expect(pushSprite(batch, 5, 6, 9, 0)).toBe(-1);
    expect(batch.count).toBe(2);
    expect([batch.x[0], batch.y[0], batch.spriteId[0], batch.frame[0], batch.flags[0]]).toEqual([
      1.5,
      2.5,
      7,
      1,
      SpriteFlag.FlipX,
    ]);
    expect(batch.flags[1]).toBe(0);
  });

  it('rejects bad capacities and layers', () => {
    expect(() => createSpriteBatch(LayerId.Fx, 0)).toThrow(RangeError);
    expect(() => createSpriteBatch(LayerId.Fx, 1.5)).toThrow(RangeError);
    expect(() => createSpriteBatch(99 as LayerId, 4)).toThrow(RangeError);
  });
});

describe('core/presentation createDrawList', () => {
  it('starts empty with the default capacities and blank string slots', () => {
    const list = createDrawList();
    expect([list.capacity, list.stringCapacity]).toEqual([
      DEFAULT_DRAW_LIST_CAPACITY,
      DEFAULT_DRAW_LIST_STRINGS,
    ]);
    expect([list.count, list.dropped]).toEqual([0, 0]);
    expect(list.strings).toHaveLength(DEFAULT_DRAW_LIST_STRINGS);
    expect(list.strings.every((text) => text === '')).toBe(true);
    expect(() => createDrawList(0)).toThrow(RangeError);
    expect(() => createDrawList(4, 0)).toThrow(RangeError);
  });

  it('encodes a rect: rounded position and size, colour, alpha (default 255, clamped)', () => {
    const list = createDrawList(4);
    expect(list.rect(1.4, 2.6, 10.2, 3.5, 0x123456)).toBe(0);
    expect(list.rect(0, 0, 1, 1, 0, 300)).toBe(1);
    expect(list.rect(0, 0, 1, 1, 0, -5)).toBe(2);
    expect([list.op[0], list.x[0], list.y[0], list.w[0], list.h[0]]).toEqual([
      DrawOp.Rect,
      1,
      3,
      10,
      4,
    ]);
    expect([list.color[0], list.alpha[0], list.alpha[1], list.alpha[2]]).toEqual([
      0x123456, 255, 255, 0,
    ]);
  });

  it('encodes a sprite: id in ref, frame, flags, tint (default white)', () => {
    const list = createDrawList(2);
    list.sprite(5, 2, 40, 50, SpriteFlag.FlipY | SpriteFlag.Flash, 0xff0000, 128);
    list.sprite(6, 0, 1, 2);
    expect([list.op[0], list.ref[0], list.frame[0], list.x[0], list.y[0]]).toEqual([
      DrawOp.Sprite,
      5,
      2,
      40,
      50,
    ]);
    expect([list.flags[0], list.color[0], list.alpha[0]]).toEqual([
      SpriteFlag.FlipY | SpriteFlag.Flash,
      0xff0000,
      128,
    ]);
    expect([list.flags[1], list.color[1], list.alpha[1]]).toEqual([0, 0xffffff, 255]);
  });

  it('encodes text by string slot and alignment, and checks the slot', () => {
    const list = createDrawList(2, 4);
    list.setString(3, 'GAME OVER');
    expect(list.text(3, 192, 100, 0xf8d030, TextAlign.Center)).toBe(0);
    expect([list.op[0], list.ref[0], list.flags[0], list.color[0]]).toEqual([
      DrawOp.Text,
      3,
      TextAlign.Center,
      0xf8d030,
    ]);
    expect(list.strings[3]).toBe('GAME OVER');
    expect(() => list.text(4, 0, 0)).toThrow(RangeError);
    expect(() => list.text(-1, 0, 0)).toThrow(RangeError);
    expect(list.count).toBe(1);
  });

  it('encodes a number: value, minimum digits (clamped to 0…20), alignment', () => {
    const list = createDrawList(3);
    list.number(12300, 20, 0, 8, 0xffffff, TextAlign.Right);
    list.number(-5, 0, 0, -3);
    list.number(1, 0, 0, 99);
    expect([list.op[0], list.value[0], list.frame[0], list.flags[0]]).toEqual([
      DrawOp.Number,
      12300,
      8,
      TextAlign.Right,
    ]);
    expect([list.value[1], list.frame[1], list.frame[2]]).toEqual([-5, 0, 20]);
  });

  it('rejects commands past its capacity and counts them in dropped until clear()', () => {
    const list = createDrawList(2);
    list.rect(0, 0, 1, 1, 0);
    list.rect(0, 0, 1, 1, 0);
    expect(list.rect(0, 0, 1, 1, 0)).toBe(-1);
    expect(list.number(1, 0, 0)).toBe(-1);
    expect([list.count, list.dropped]).toEqual([2, 2]);
    list.clear();
    expect([list.count, list.dropped]).toEqual([0, 0]);
    expect(list.rect(0, 0, 1, 1, 0)).toBe(0);
  });

  it('resets reused slots: a rect written after a number carries no stale frame, value or flags', () => {
    const list = createDrawList(1);
    list.number(99, 0, 0, 5, 0x00ff00, TextAlign.Right);
    list.clear();
    list.rect(0, 0, 1, 1, 0);
    expect([list.value[0], list.frame[0], list.flags[0], list.ref[0]]).toEqual([0, 0, 0, 0]);
  });

  it('bumps revision on commands, clear() and real string changes only', () => {
    const list = createDrawList(4, 2);
    const r0 = list.revision;
    list.rect(0, 0, 1, 1, 0);
    const r1 = list.revision;
    expect(r1).toBeGreaterThan(r0);
    expect(list.setString(0, 'A')).toBe(true);
    const r2 = list.revision;
    expect(r2).toBeGreaterThan(r1);
    expect(list.setString(0, 'A')).toBe(false);
    expect(list.revision).toBe(r2);
    list.clear();
    expect(list.revision).toBeGreaterThan(r2);
    expect(list.strings[0]).toBe('A');
    expect(() => list.setString(2, 'x')).toThrow(RangeError);
  });
});
