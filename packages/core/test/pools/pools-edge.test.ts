/**
 * `core/pools` edge cases: degenerate schemas and capacities, the exact slot mapping a
 * flush produces (systems must be able to predict it), numeric limits of each field
 * type, and the object pool's hand-out order (shmup_plan.md M1-01).
 */
import { describe, expect, it } from 'vitest';
import {
  createPool,
  createSoaPool,
  type SoaFieldType,
  type SoaSchema,
} from '../../src/pools/index.js';

const BULLET_SCHEMA = { x: 'f64', y: 'f64', sprite: 'u16', flags: 'u8' } as const;

/**
 * Fills a pool with `n` slots whose `x` is the slot's creation order.
 *
 * @param pool - A pool created with {@link BULLET_SCHEMA}.
 * @param n - How many slots to allocate.
 */
function fill(pool: ReturnType<typeof createSoaPool<typeof BULLET_SCHEMA>>, n: number): void {
  for (let i = 0; i < n; i += 1) {
    const slot = pool.alloc();
    pool.fields.x[slot] = i;
  }
}

/**
 * The live `x` values of a pool, in slot order.
 *
 * @param pool - A pool created with {@link BULLET_SCHEMA}.
 * @returns One number per live slot.
 */
function liveX(pool: ReturnType<typeof createSoaPool<typeof BULLET_SCHEMA>>): number[] {
  const out: number[] = [];
  for (let i = 0; i < pool.count; i += 1) out.push(pool.fields.x[i]);
  return out;
}

describe('core/pools — SoA schema edge cases', () => {
  it('accepts an empty schema (a pool that only counts slots)', () => {
    const pool = createSoaPool(3, {});
    expect(Object.keys(pool.fields)).toEqual([]);
    expect(pool.alloc()).toBe(0);
    expect(pool.alloc()).toBe(1);
    pool.free(0);
    pool.flush();
    expect(pool.count).toBe(1);
  });

  it('accepts a single-field schema and a capacity of 1', () => {
    const pool = createSoaPool(1, { hp: 'i16' } as const);
    expect(pool.capacity).toBe(1);
    expect(pool.alloc()).toBe(0);
    expect(pool.alloc()).toBe(-1);
    pool.fields.hp[0] = -300;
    pool.free(0);
    pool.flush();
    expect(pool.count).toBe(0);
    expect(pool.alloc()).toBe(0);
    expect(pool.fields.hp[0]).toBe(0);
  });

  it('rejects an unknown field type at creation time', () => {
    const bogus = { x: 'f128' } as unknown as SoaSchema;
    expect(() => createSoaPool(4, bogus)).toThrow(RangeError);
    expect(() => createSoaPool(4, bogus)).toThrow(/f128/);
  });

  it('rejects capacities that are not positive integers', () => {
    for (const bad of [0, -1, 1.5, NaN, Infinity, -Infinity]) {
      expect(() => createSoaPool(bad, BULLET_SCHEMA), String(bad)).toThrow(RangeError);
    }
  });

  it('allocates field arrays in sorted name order, whatever the literal order was', () => {
    // The order decides the state hash of a pool (M1-19), so it must not depend on how
    // the schema literal happens to be written.
    const a = createSoaPool(2, { zz: 'u8', aa: 'u8', mm: 'u8' } as const);
    const b = createSoaPool(2, { mm: 'u8', zz: 'u8', aa: 'u8' } as const);
    expect(Object.keys(a.fields)).toEqual(['aa', 'mm', 'zz']);
    expect(Object.keys(b.fields)).toEqual(Object.keys(a.fields));
  });

  it('clips and wraps values exactly as each field type does', () => {
    const pool = createSoaPool(1, {
      f32: 'f32',
      i32: 'i32',
      u32: 'u32',
      i16: 'i16',
      u16: 'u16',
      i8: 'i8',
      u8: 'u8',
    } as const);
    pool.alloc();
    pool.fields.f32[0] = 0.1;
    pool.fields.i32[0] = 2147483648;
    pool.fields.u32[0] = -1;
    pool.fields.i16[0] = 32768;
    pool.fields.u16[0] = 65536;
    pool.fields.i8[0] = 128;
    pool.fields.u8[0] = 256;
    expect(pool.fields.f32[0]).toBe(Math.fround(0.1));
    expect(pool.fields.i32[0]).toBe(-2147483648);
    expect(pool.fields.u32[0]).toBe(4294967295);
    expect(pool.fields.i16[0]).toBe(-32768);
    expect(pool.fields.u16[0]).toBe(0);
    expect(pool.fields.i8[0]).toBe(-128);
    expect(pool.fields.u8[0]).toBe(0);
  });

  it('names every field type the type alias allows', () => {
    const types: SoaFieldType[] = ['f64', 'f32', 'i32', 'u32', 'i16', 'u16', 'i8', 'u8'];
    for (const type of types) {
      const pool = createSoaPool(1, { v: type });
      expect(pool.fields.v.length, type).toBe(1);
    }
  });
});

describe('core/pools — deferred removal semantics', () => {
  it('produces the documented swap-remove mapping for one freed slot', () => {
    const pool = createSoaPool(5, BULLET_SCHEMA);
    fill(pool, 5);
    pool.free(1);
    pool.flush();
    expect(liveX(pool)).toEqual([0, 4, 2, 3]);
  });

  it('produces the same mapping no matter what order the frees arrived in', () => {
    const orders = [
      [0, 2, 4],
      [4, 2, 0],
      [2, 0, 4],
      [4, 0, 2],
    ];
    const results = orders.map((order) => {
      const pool = createSoaPool(6, BULLET_SCHEMA);
      fill(pool, 6);
      for (const index of order) pool.free(index);
      pool.flush();
      return liveX(pool);
    });
    for (const result of results) expect(result).toEqual(results[0]);
    expect(results[0]).toEqual([3, 1, 5]);
  });

  it('leaves the last live slot in place when it is the one freed', () => {
    const pool = createSoaPool(4, BULLET_SCHEMA);
    fill(pool, 4);
    pool.free(3);
    pool.flush();
    expect(liveX(pool)).toEqual([0, 1, 2]);
  });

  it('keeps freed slots readable until flush, and lets a system free during iteration', () => {
    const pool = createSoaPool(6, BULLET_SCHEMA);
    fill(pool, 6);
    const visited: number[] = [];
    for (let i = 0; i < pool.count; i += 1) {
      visited.push(pool.fields.x[i]);
      if (pool.fields.x[i] % 2 === 0) pool.free(i);
    }
    // Iteration saw every slot exactly once, in order, despite the frees.
    expect(visited).toEqual([0, 1, 2, 3, 4, 5]);
    expect(pool.count).toBe(6);
    expect(pool.pendingFreeCount).toBe(3);
    pool.flush();
    expect(
      liveX(pool)
        .slice()
        .sort((a, b) => a - b),
    ).toEqual([1, 3, 5]);
  });

  it('ignores a free of a slot that a previous flush already removed', () => {
    const pool = createSoaPool(4, BULLET_SCHEMA);
    fill(pool, 4);
    pool.free(3);
    pool.flush();
    expect(pool.count).toBe(3);
    pool.free(3);
    expect(pool.pendingFreeCount).toBe(0);
    pool.flush();
    expect(pool.count).toBe(3);
  });

  it('ignores frees at and beyond the live count, and negative ones', () => {
    const pool = createSoaPool(8, BULLET_SCHEMA);
    fill(pool, 3);
    for (const index of [3, 7, 8, 100, -1, -100]) pool.free(index);
    expect(pool.pendingFreeCount).toBe(0);
    pool.flush();
    expect(pool.count).toBe(3);
  });

  it('accepts a free of every slot repeatedly without over-counting', () => {
    const pool = createSoaPool(4, BULLET_SCHEMA);
    fill(pool, 4);
    for (let round = 0; round < 3; round += 1) {
      for (let i = 0; i < 4; i += 1) pool.free(i);
    }
    expect(pool.pendingFreeCount).toBe(4);
    pool.flush();
    expect(pool.count).toBe(0);
    expect(pool.pendingFreeCount).toBe(0);
  });

  it('reuses slots after a flush without leaking old field values', () => {
    const pool = createSoaPool(3, BULLET_SCHEMA);
    fill(pool, 3);
    for (let i = 0; i < 3; i += 1) {
      pool.fields.sprite[i] = 7;
      pool.fields.flags[i] = 1;
    }
    for (let i = 0; i < 3; i += 1) pool.free(i);
    pool.flush();
    for (let i = 0; i < 3; i += 1) {
      const slot = pool.alloc();
      expect(pool.fields.x[slot]).toBe(0);
      expect(pool.fields.y[slot]).toBe(0);
      expect(pool.fields.sprite[slot]).toBe(0);
      expect(pool.fields.flags[slot]).toBe(0);
    }
  });

  it('recovers from exhaustion once a flush frees room', () => {
    const pool = createSoaPool(2, BULLET_SCHEMA);
    fill(pool, 2);
    expect(pool.alloc()).toBe(-1);
    pool.free(0);
    // Still full until the flush: allocation must not reuse a pending slot.
    expect(pool.alloc()).toBe(-1);
    pool.flush();
    expect(pool.alloc()).toBe(1);
  });

  it('clear() during a tick throws away both live and pending slots', () => {
    const pool = createSoaPool(4, BULLET_SCHEMA);
    fill(pool, 4);
    pool.free(2);
    pool.clear();
    expect(pool.count).toBe(0);
    expect(pool.pendingFreeCount).toBe(0);
    // No stale mark may swallow a later free of the same slot index.
    fill(pool, 4);
    for (let i = 0; i < 4; i += 1) pool.free(i);
    expect(pool.pendingFreeCount).toBe(4);
    pool.flush();
    expect(pool.count).toBe(0);
  });

  it('keeps count and field data in step under a full-capacity churn', () => {
    const pool = createSoaPool(16, BULLET_SCHEMA);
    let nextId = 1;
    const alive = new Set<number>();
    for (let tick = 0; tick < 500; tick += 1) {
      for (let i = 0; i < 9; i += 1) {
        const slot = pool.alloc();
        if (slot >= 0) {
          pool.fields.x[slot] = nextId;
          alive.add(nextId);
          nextId += 1;
        } else {
          expect(pool.count).toBe(pool.capacity);
        }
      }
      for (let slot = 0; slot < pool.count; slot += 1) {
        if ((pool.fields.x[slot] + tick) % 4 < 2) {
          alive.delete(pool.fields.x[slot]);
          pool.free(slot);
        }
      }
      pool.flush();
      expect(pool.count).toBe(alive.size);
      expect(pool.pendingFreeCount).toBe(0);
      const seen = new Set<number>();
      for (let slot = 0; slot < pool.count; slot += 1) seen.add(pool.fields.x[slot]);
      expect(seen.size).toBe(alive.size);
      for (const id of seen) expect(alive.has(id)).toBe(true);
    }
  });
});

describe('core/pools — object pool edge cases', () => {
  it('rejects capacities that are not positive integers', () => {
    for (const bad of [0, -1, 1.5, NaN, Infinity, -Infinity]) {
      expect(() => createPool(() => ({}), bad), String(bad)).toThrow(RangeError);
    }
  });

  it('hands objects back in last-released-first order (deterministic reuse)', () => {
    const pool = createPool(() => ({ tag: 0 }), 3);
    const a = pool.acquire() as { tag: number };
    const b = pool.acquire() as { tag: number };
    a.tag = 1;
    b.tag = 2;
    pool.release(a);
    pool.release(b);
    expect(pool.acquire()).toBe(b);
    expect(pool.acquire()).toBe(a);
  });

  it('builds exactly `capacity` objects and never builds more', () => {
    let built = 0;
    const pool = createPool(
      () => {
        built += 1;
        return {};
      },
      4,
      () => undefined,
    );
    expect(built).toBe(4);
    for (let round = 0; round < 10; round += 1) {
      const taken: object[] = [];
      for (let i = 0; i < 4; i += 1) taken.push(pool.acquire() as object);
      expect(pool.acquire()).toBeNull();
      for (const item of taken) pool.release(item);
    }
    expect(built).toBe(4);
    expect(pool.inUse).toBe(0);
  });

  it('runs reset on every acquire, including the very first', () => {
    const resets: number[] = [];
    const pool = createPool(
      () => ({ id: 0 }),
      2,
      (item) => {
        resets.push(item.id);
        item.id = 0;
      },
    );
    const first = pool.acquire() as { id: number };
    first.id = 5;
    pool.release(first);
    const again = pool.acquire() as { id: number };
    expect(again.id).toBe(0);
    expect(resets.length).toBe(2);
    expect(resets[1]).toBe(5);
  });

  it('tracks inUse exactly through an acquire/release churn', () => {
    const pool = createPool(() => ({}), 4);
    const held: object[] = [];
    for (let step = 0; step < 200; step += 1) {
      if (step % 3 === 2 && held.length > 0) {
        pool.release(held.pop() as object);
      } else {
        const item = pool.acquire();
        if (item !== null) held.push(item);
      }
      expect(pool.inUse).toBe(held.length);
      expect(pool.inUse).toBeLessThanOrEqual(pool.capacity);
    }
  });

  it('throws only when the pool is already full, not on a foreign object', () => {
    const pool = createPool(() => ({ own: true }), 2);
    const first = pool.acquire() as { own: boolean };
    const second = pool.acquire() as { own: boolean };
    expect(pool.inUse).toBe(2);
    // Documented: `release` does not verify provenance, it only guards the free-stack
    // bound — a foreign object is accepted while there is room for it.
    expect(() => pool.release({ own: false })).not.toThrow();
    pool.release(first);
    expect(pool.inUse).toBe(0);
    expect(() => pool.release(second)).toThrow(RangeError);
    expect(pool.inUse).toBe(0);
  });

  it('pools non-object values too', () => {
    const pool = createPool(() => new Float64Array(4), 2);
    const buffer = pool.acquire();
    expect(buffer).toBeInstanceOf(Float64Array);
    expect(buffer?.length).toBe(4);
  });
});
