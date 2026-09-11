/**
 * `core/pools` — SoA allocation, deferred swap-removal order, exhaustion, and the
 * object pool's acquire/reset/release cycle (shmup_plan.md M1-01).
 */
import { describe, expect, it } from 'vitest';
import { createPool, createSoaPool, moduleInfo } from '../../src/pools/index.js';

/** The schema the bullet pool will use in M1-09, small enough to assert on. */
const BULLET_SCHEMA = { x: 'f64', y: 'f64', sprite: 'u16', flags: 'u8' } as const;

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

describe('core/pools — createSoaPool', () => {
  it('describes itself as implemented', () => {
    expect(moduleInfo.name).toBe('pools');
    expect(moduleInfo.status).toBe('implemented');
  });

  it('preallocates one typed array per field', () => {
    const pool = createSoaPool(4, BULLET_SCHEMA);
    expect(pool.capacity).toBe(4);
    expect(pool.count).toBe(0);
    expect(pool.fields.x).toBeInstanceOf(Float64Array);
    expect(pool.fields.y).toBeInstanceOf(Float64Array);
    expect(pool.fields.sprite).toBeInstanceOf(Uint16Array);
    expect(pool.fields.flags).toBeInstanceOf(Uint8Array);
    expect(pool.fields.x.length).toBe(4);
    expect(pool.fields.flags.length).toBe(4);
  });

  it('supports every field type', () => {
    const pool = createSoaPool(2, {
      a: 'f64',
      b: 'f32',
      c: 'i32',
      d: 'u32',
      e: 'i16',
      f: 'u16',
      g: 'i8',
      h: 'u8',
    });
    expect(pool.fields.a).toBeInstanceOf(Float64Array);
    expect(pool.fields.b).toBeInstanceOf(Float32Array);
    expect(pool.fields.c).toBeInstanceOf(Int32Array);
    expect(pool.fields.d).toBeInstanceOf(Uint32Array);
    expect(pool.fields.e).toBeInstanceOf(Int16Array);
    expect(pool.fields.f).toBeInstanceOf(Uint16Array);
    expect(pool.fields.g).toBeInstanceOf(Int8Array);
    expect(pool.fields.h).toBeInstanceOf(Uint8Array);
  });

  it('rejects a nonsensical capacity', () => {
    expect(() => createSoaPool(0, BULLET_SCHEMA)).toThrow(RangeError);
    expect(() => createSoaPool(-4, BULLET_SCHEMA)).toThrow(RangeError);
    expect(() => createSoaPool(1.5, BULLET_SCHEMA)).toThrow(RangeError);
  });

  it('hands out packed slots and reports -1 when exhausted', () => {
    const pool = createSoaPool(3, BULLET_SCHEMA);
    expect(pool.alloc()).toBe(0);
    expect(pool.alloc()).toBe(1);
    expect(pool.alloc()).toBe(2);
    expect(pool.count).toBe(3);
    expect(pool.alloc()).toBe(-1);
    expect(pool.count).toBe(3);
  });

  it('zero-fills a slot on alloc, even when it was reused', () => {
    const pool = createSoaPool(2, BULLET_SCHEMA);
    const first = pool.alloc();
    pool.fields.x[first] = 12.5;
    pool.fields.sprite[first] = 9;
    pool.fields.flags[first] = 3;
    pool.free(first);
    pool.flush();

    const second = pool.alloc();
    expect(second).toBe(0);
    expect(pool.fields.x[second]).toBe(0);
    expect(pool.fields.sprite[second]).toBe(0);
    expect(pool.fields.flags[second]).toBe(0);
  });

  it('defers removal: indices stay valid until flush', () => {
    const pool = createSoaPool(4, BULLET_SCHEMA);
    for (let i = 0; i < 4; i += 1) pool.fields.x[pool.alloc()] = i;
    pool.free(1);
    expect(pool.count).toBe(4);
    expect(pool.pendingFreeCount).toBe(1);
    expect(pool.fields.x[1]).toBe(1);
    pool.flush();
    expect(pool.count).toBe(3);
    expect(pool.pendingFreeCount).toBe(0);
    // Swap-remove: the last live slot moved into the hole.
    expect(liveX(pool)).toEqual([0, 3, 2]);
  });

  it('flushes several frees in descending index order', () => {
    const pool = createSoaPool(6, BULLET_SCHEMA);
    for (let i = 0; i < 6; i += 1) pool.fields.x[pool.alloc()] = i;
    pool.free(1);
    pool.free(4);
    pool.free(0);
    expect(pool.pendingFreeCount).toBe(3);
    pool.flush();
    expect(pool.count).toBe(3);
    expect(
      liveX(pool)
        .slice()
        .sort((a, b) => a - b),
    ).toEqual([2, 3, 5]);
  });

  it('survives freeing every live slot', () => {
    const pool = createSoaPool(5, BULLET_SCHEMA);
    for (let i = 0; i < 5; i += 1) pool.alloc();
    for (let i = 0; i < 5; i += 1) pool.free(i);
    pool.flush();
    expect(pool.count).toBe(0);
    expect(pool.alloc()).toBe(0);
  });

  it('ignores duplicate and out-of-range frees', () => {
    const pool = createSoaPool(3, BULLET_SCHEMA);
    pool.alloc();
    pool.alloc();
    pool.free(0);
    pool.free(0);
    pool.free(2);
    pool.free(-1);
    expect(pool.pendingFreeCount).toBe(1);
    pool.flush();
    expect(pool.count).toBe(1);
  });

  it('does nothing on an empty flush', () => {
    const pool = createSoaPool(2, BULLET_SCHEMA);
    pool.alloc();
    pool.flush();
    expect(pool.count).toBe(1);
  });

  it('clears back to empty, pending frees included', () => {
    const pool = createSoaPool(4, BULLET_SCHEMA);
    pool.alloc();
    pool.alloc();
    pool.free(0);
    pool.clear();
    expect(pool.count).toBe(0);
    expect(pool.pendingFreeCount).toBe(0);
    // The stale mark from the cleared free must not swallow the next one.
    expect(pool.alloc()).toBe(0);
    pool.free(0);
    expect(pool.pendingFreeCount).toBe(1);
  });

  it('keeps every field consistent through a churn of allocs and frees', () => {
    const pool = createSoaPool(8, BULLET_SCHEMA);
    let nextId = 1;
    const alive = new Set<number>();
    for (let tick = 0; tick < 200; tick += 1) {
      for (let i = 0; i < 3; i += 1) {
        const slot = pool.alloc();
        if (slot >= 0) {
          pool.fields.x[slot] = nextId;
          pool.fields.sprite[slot] = nextId % 65536;
          alive.add(nextId);
          nextId += 1;
        }
      }
      for (let slot = pool.count - 1; slot >= 0; slot -= 1) {
        if ((pool.fields.x[slot] + tick) % 3 === 0) {
          alive.delete(pool.fields.x[slot]);
          pool.free(slot);
        }
      }
      pool.flush();
      expect(pool.count).toBe(alive.size);
      for (let slot = 0; slot < pool.count; slot += 1) {
        const id = pool.fields.x[slot];
        expect(alive.has(id)).toBe(true);
        expect(pool.fields.sprite[slot]).toBe(id % 65536);
      }
    }
  });
});

describe('core/pools — createPool', () => {
  it('preallocates every object up front', () => {
    let built = 0;
    const pool = createPool(() => ({ id: (built += 1) }), 3);
    expect(built).toBe(3);
    expect(pool.capacity).toBe(3);
    expect(pool.inUse).toBe(0);
  });

  it('rejects a nonsensical capacity', () => {
    expect(() => createPool(() => ({}), 0)).toThrow(RangeError);
    expect(() => createPool(() => ({}), 2.5)).toThrow(RangeError);
  });

  it('resets objects on acquire and recycles them on release', () => {
    const pool = createPool(
      () => ({ hp: 0 }),
      2,
      (item) => {
        item.hp = 10;
      },
    );
    const first = pool.acquire();
    expect(first).not.toBeNull();
    expect(first?.hp).toBe(10);
    if (first !== null) first.hp = 3;
    pool.release(first as { hp: number });
    expect(pool.inUse).toBe(0);
    expect(pool.acquire()?.hp).toBe(10);
  });

  it('returns null when exhausted and recovers after a release', () => {
    const pool = createPool(() => ({}), 2);
    const a = pool.acquire();
    const b = pool.acquire();
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(pool.inUse).toBe(2);
    expect(pool.acquire()).toBeNull();
    pool.release(a as object);
    expect(pool.inUse).toBe(1);
    expect(pool.acquire()).not.toBeNull();
  });

  it('hands out distinct objects while they are in use', () => {
    const pool = createPool(() => ({}), 4);
    const taken = [pool.acquire(), pool.acquire(), pool.acquire(), pool.acquire()];
    expect(new Set(taken).size).toBe(4);
  });

  it('throws when more objects are released than acquired', () => {
    const pool = createPool(() => ({}), 1);
    const item = pool.acquire();
    pool.release(item as object);
    expect(() => pool.release(item as object)).toThrow(RangeError);
  });

  it('works without a reset callback', () => {
    const pool = createPool(() => ({ n: 1 }), 1);
    const item = pool.acquire();
    expect(item?.n).toBe(1);
  });
});
