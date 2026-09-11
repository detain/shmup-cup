/**
 * Edge cases of the render contract (plan §3.4): layer / flag / op code invariants the
 * renderer relies on, sprite-batch validation and refills, and the DrawList encoding at its
 * limits — rounding, typed-array storage, field reset between reused slots, full lists,
 * string-slot validation order and exactly when `revision` moves.
 */
import { describe, expect, it } from 'vitest';
import {
  DrawOp,
  LAYER_COUNT,
  LAYER_NAMES,
  LayerId,
  SpriteFlag,
  TextAlign,
  createDrawList,
  createSpriteBatch,
  pushSprite,
} from '../../src/presentation/index.js';

/**
 * `BgFar` → `BG_FAR`, `EnemyBullets` → `ENEMY_BULLETS`.
 *
 * @param key - A LayerId key.
 * @returns The key in upper snake case.
 */
const upperSnake = (key: string): string => key.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase();

describe('core/presentation codes (edge)', () => {
  it('names every LayerId key exactly like its LAYER_NAMES entry', () => {
    const entries = Object.entries(LayerId);
    expect(entries).toHaveLength(LAYER_COUNT);
    for (const [key, code] of entries) expect(LAYER_NAMES[code]).toBe(upperSnake(key));
    expect(Object.isFrozen(LAYER_NAMES)).toBe(true);
  });

  it('keeps sprite flags in one byte (the batch and draw-list flag arrays are Uint8)', () => {
    let all = 0;
    for (const bit of Object.values(SpriteFlag)) {
      expect(all & bit).toBe(0);
      all |= bit;
    }
    expect(all).toBeLessThanOrEqual(0xff);
  });

  it('never uses 0 as a draw op (a zeroed slot is not a command) and keeps op codes distinct', () => {
    const ops = Object.values(DrawOp);
    expect(new Set(ops).size).toBe(ops.length);
    expect(ops.every((op) => op > 0 && op <= 0xff)).toBe(true);
    expect(Object.values(TextAlign)).toEqual([0, 1, 2]);
  });
});

describe('core/presentation createSpriteBatch / pushSprite (edge)', () => {
  it('accepts the first and last layer and rejects everything outside, fractions and NaN', () => {
    expect(createSpriteBatch(LayerId.BgFar, 1).layer).toBe(0);
    expect(createSpriteBatch(LayerId.Debug, 1).layer).toBe(LAYER_COUNT - 1);
    for (const layer of [-1, LAYER_COUNT, 1.5, Number.NaN]) {
      expect(() => createSpriteBatch(layer as LayerId, 1)).toThrow(RangeError);
    }
    for (const capacity of [-3, Number.NaN, Infinity, 2.5]) {
      expect(() => createSpriteBatch(LayerId.Fx, capacity)).toThrow(/positive integer/);
    }
  });

  it('refills from slot 0 after count = 0 and overwrites every field (flags default to 0)', () => {
    const batch = createSpriteBatch(LayerId.Items, 2);
    pushSprite(batch, 1, 2, 3, 4, SpriteFlag.Hidden | SpriteFlag.FlipY);
    batch.count = 0;
    expect(pushSprite(batch, 9, 8, 7, 6)).toBe(0);
    expect([batch.x[0], batch.y[0], batch.spriteId[0], batch.frame[0], batch.flags[0]]).toEqual([
      9, 8, 7, 6, 0,
    ]);
    expect(batch.count).toBe(1);
  });

  it('a rejected push leaves the arrays and count untouched', () => {
    const batch = createSpriteBatch(LayerId.Fx, 1);
    pushSprite(batch, 5, 5, 1, 1, SpriteFlag.FlipX);
    expect(pushSprite(batch, 100, 100, 9, 9, SpriteFlag.Flash)).toBe(-1);
    expect([batch.count, batch.x[0], batch.spriteId[0], batch.flags[0]]).toEqual([
      1,
      5,
      1,
      SpriteFlag.FlipX,
    ]);
  });

  it('keeps sub-pixel world positions (the renderer rounds after subtracting the camera)', () => {
    const batch = createSpriteBatch(LayerId.Player, 1);
    pushSprite(batch, 123.456, -7.25, 0, 0);
    expect([batch.x[0], batch.y[0]]).toEqual([123.456, -7.25]);
  });
});

describe('core/presentation createDrawList (edge)', () => {
  it('rejects fractional, NaN and negative capacities of either kind', () => {
    for (const bad of [1.5, Number.NaN, -1, Infinity]) {
      expect(() => createDrawList(bad)).toThrow(/capacity must be a positive integer/);
      expect(() => createDrawList(4, bad)).toThrow(/string capacity must be a positive integer/);
    }
    const tiny = createDrawList(1, 1);
    expect([tiny.capacity, tiny.stringCapacity, tiny.strings.length]).toEqual([1, 1, 1]);
  });

  it('rounds positions and sizes half up (Math.round), negatives included', () => {
    const list = createDrawList(2);
    list.rect(-1.5, 2.5, -0.5, 0.49, 0);
    expect([list.x[0], list.y[0], list.w[0], list.h[0]]).toEqual([-1, 3, 0, 0]);
    list.rect(-32768, 32767, 32767, -32768, 0);
    expect([list.x[1], list.y[1], list.w[1], list.h[1]]).toEqual([-32768, 32767, 32767, -32768]);
  });

  it('clamps alpha before storage: NaN → 0, fractions truncate, full 32-bit colours pass', () => {
    const list = createDrawList(3);
    list.rect(0, 0, 1, 1, 0xffffffff, Number.NaN);
    list.rect(0, 0, 1, 1, 0, 127.9);
    list.sprite(0, 0, 0, 0, 0, 0x000000, 1000);
    expect([list.alpha[0], list.alpha[1], list.alpha[2]]).toEqual([0, 127, 255]);
    expect(list.color[0]).toBe(0xffffffff);
    expect(list.color[2]).toBe(0);
  });

  it('stores number values at full precision and truncates fractional minDigits', () => {
    const list = createDrawList(4);
    list.number(Number.MAX_SAFE_INTEGER, 0, 0, 2.7);
    list.number(-0.5, 0, 0);
    list.number(Number.NaN, 0, 0, 20);
    list.number(1e300, 0, 0, 21);
    expect([list.value[0], list.frame[0]]).toEqual([Number.MAX_SAFE_INTEGER, 2]);
    expect(list.value[1]).toBe(-0.5);
    expect(Number.isNaN(list.value[2])).toBe(true);
    expect([list.frame[2], list.value[3], list.frame[3]]).toEqual([20, 1e300, 20]);
  });

  it('resets every op-specific field when a slot is reused by another op', () => {
    const list = createDrawList(1, 2);
    list.setString(1, 'X');
    list.sprite(12, 3, 0, 0, SpriteFlag.FlipX, 0x123456, 9);
    list.clear();
    list.number(77, 0, 0);
    expect([list.ref[0], list.frame[0], list.flags[0], list.w[0], list.h[0]]).toEqual([
      0, 0, 0, 0, 0,
    ]);
    expect([list.color[0], list.alpha[0]]).toEqual([0xffffff, 255]);
    list.clear();
    list.text(1, 0, 0);
    expect([list.op[0], list.value[0], list.ref[0], list.flags[0]]).toEqual([
      DrawOp.Text,
      0,
      1,
      TextAlign.Left,
    ]);
    list.clear();
    list.rect(0, 0, 5, 6, 0x010203, 4);
    expect([list.op[0], list.ref[0], list.value[0], list.w[0], list.h[0]]).toEqual([
      DrawOp.Rect,
      0,
      0,
      5,
      6,
    ]);
  });

  it('a dropped command changes neither count nor revision; clear() still bumps revision', () => {
    const list = createDrawList(1);
    list.rect(0, 0, 1, 1, 0);
    const revision = list.revision;
    expect(list.sprite(0, 0, 0, 0)).toBe(-1);
    expect(list.text(0, 0, 0)).toBe(-1);
    expect(list.number(5, 0, 0)).toBe(-1);
    expect([list.count, list.dropped, list.revision]).toEqual([1, 3, revision]);
    list.clear();
    const cleared = list.revision;
    expect(cleared).toBeGreaterThan(revision);
    list.clear();
    expect(list.revision).toBeGreaterThan(cleared);
  });

  it('checks a text slot before the capacity: a bad slot throws even on a full list', () => {
    const list = createDrawList(1, 2);
    list.rect(0, 0, 1, 1, 0);
    expect(() => list.text(2, 0, 0)).toThrow(RangeError);
    expect(() => list.text(0.5, 0, 0)).toThrow(RangeError);
    expect(list.dropped).toBe(0);
    expect(list.text(1, 0, 0)).toBe(-1);
    expect(list.dropped).toBe(1);
  });

  it('setString validates fractional / NaN slots and only reports real changes', () => {
    const list = createDrawList(1, 2);
    expect(() => list.setString(0.5, 'x')).toThrow(RangeError);
    expect(() => list.setString(Number.NaN, 'x')).toThrow(RangeError);
    const revision = list.revision;
    expect(list.setString(1, '')).toBe(false);
    expect(list.revision).toBe(revision);
    expect(list.setString(1, 'A\nB')).toBe(true);
    expect(list.setString(1, '')).toBe(true);
    expect(list.revision).toBe(revision + 2);
  });

  it('exposes the live string array and command arrays (the renderer reads them in place)', () => {
    const list = createDrawList(2, 2);
    const { strings, op, x } = list;
    list.setString(0, 'HI');
    list.rect(3, 4, 1, 1, 0);
    expect(list.strings).toBe(strings);
    expect(strings[0]).toBe('HI');
    expect(list.op).toBe(op);
    expect([op[0], x[0]]).toEqual([DrawOp.Rect, 3]);
  });

  it('keeps default alignment and tint for text and number commands', () => {
    const list = createDrawList(2, 1);
    list.text(0, 1, 1);
    list.number(1, 1, 1);
    expect([list.flags[0], list.color[0], list.alpha[0]]).toEqual([TextAlign.Left, 0xffffff, 255]);
    expect([list.flags[1], list.color[1], list.frame[1]]).toEqual([TextAlign.Left, 0xffffff, 0]);
  });
});
