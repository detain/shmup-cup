/**
 * Self-test of the allocation guard (`helpers/alloc.ts`): it must see allocations — retained
 * or already garbage, and a cache keyed on a value the calls derive from their index — and report
 * (close to) nothing for an empty loop; its rounds run the calls and indices it documents (no
 * index twice).
 */
import { getHeapSpaceStatistics } from 'node:v8';
import { describe, expect, it } from 'vitest';
import { JIT_SPACES, WARMUP_ROUNDS, measureHeapGrowth } from './alloc.js';

describe('test helper measureHeapGrowth', () => {
  it('reports (almost) nothing for a loop that does not allocate', () => {
    let sum = 0;
    const growth = measureHeapGrowth((i) => {
      sum += i;
    }, 10_000);
    expect(sum).toBeGreaterThan(0);
    expect(growth.bytes).toBeLessThan(64 * 1024);
  });

  it('sees one small object per iteration', () => {
    const keep: object[] = [];
    const growth = measureHeapGrowth(() => {
      keep.length = 0;
      keep.push({ a: 1 });
    }, 10_000);
    expect(growth.bytes).toBeGreaterThan(100_000);
    expect(growth.bytesPerIteration).toBeGreaterThan(10);
  });

  it('keeps the steadiest of several windows, but still sees steady allocation', () => {
    const keep: object[] = [];
    const growth = measureHeapGrowth(
      () => {
        keep.length = 0;
        keep.push({ a: 1 });
      },
      10_000,
      1000,
      3,
    );
    expect(growth.bytesPerIteration).toBeGreaterThan(10);
    let calls = 0;
    const quiet = measureHeapGrowth(() => void calls++, 1000, 10, 3);
    expect(quiet.bytes).toBeLessThan(64 * 1024);
    expect(calls).toBeGreaterThanOrEqual(1010);
  });

  it('measures up to three windows by default and stops at the first settled one', () => {
    const keep: object[] = [];
    let calls = 0;
    const steady = (): void => {
      calls++;
      keep.length = 0;
      keep.push({ a: 1 });
    };
    // One object per call over 10,000 calls is well over the default 32 KiB: every window runs.
    const growth = measureHeapGrowth(steady, 10_000, 10);
    expect(growth.bytes).toBeGreaterThan(32 * 1024);
    expect(growth.windows).toBe(3);
    expect(calls).toBe(10 + 3 * 10_000);
    calls = 0;
    expect(measureHeapGrowth(steady, 10_000, 10, 1).windows).toBe(1);
    expect(calls).toBe(10 + 10_000);
    // A loop that does not allocate settles in its first window …
    let quiet = 0;
    const count = (): void => void quiet++;
    const settled = measureHeapGrowth(count, 10_000, 20_000);
    expect(settled.bytes).toBeLessThanOrEqual(32 * 1024);
    expect(settled.windows).toBe(1);
    expect(quiet).toBe(20_000 + 10_000);
    // … unless nothing counts as settled.
    quiet = 0;
    expect(measureHeapGrowth(count, 10_000, 20_000, 3, -1).windows).toBe(3);
    expect(quiet).toBe(20_000 + 3 * 10_000);
  });

  it('passes every index once: the warm-up 0 … warmup − 1 in rounds, then new ones per window', () => {
    const seen: number[] = [];
    measureHeapGrowth((i) => void seen.push(i), 4, 11, 2, -1);
    // Warm-up 0 … 10, window 1 11 … 14, window 2 15 … 18: no window meets an index run before.
    expect(seen).toEqual(Array.from({ length: 11 + 2 * 4 }, (_, i) => i));
    expect(WARMUP_ROUNDS).toBeGreaterThanOrEqual(2);
    // A settled window ends the indices too.
    seen.length = 0;
    measureHeapGrowth((i) => void seen.push(i), 4, 11, 3);
    expect(seen).toEqual(Array.from({ length: 11 + 4 }, (_, i) => i));
  });

  it('sees a cache keyed on a value derived from the index (new values in every window)', () => {
    // What a renderer might do wrongly: memoise something per camera position. In play the camera
    // never comes back to a position, so every frame adds an entry; a window that replayed the
    // warm-up's indices would find every key cached and measure nothing. (Whole-pixel keys: a
    // fractional one would be boxed on every lookup, cached or not.)
    const cache = new Map<number, { x: number }>();
    const memo = (x: number): { x: number } => {
      let entry = cache.get(x);
      if (entry === undefined) {
        entry = { x };
        cache.set(x, entry);
      }
      return entry;
    };
    const scrolling = measureHeapGrowth(
      (i) => {
        if (memo(1000 + i * 3).x < 0) throw new Error('unreachable');
      },
      10_000,
      20_000,
    );
    // A Map entry and a small object per call: far over any 64 KiB budget.
    expect(scrolling.bytes).toBeGreaterThan(256 * 1024);
    expect(scrolling.windows).toBe(3); // none settles
    expect(cache.size).toBe(20_000 + 3 * 10_000); // a new key on every call
    // The same calls on 64 positions the warm-up has cached: nothing left to see.
    cache.clear();
    const cycling = measureHeapGrowth(
      (i) => {
        if (memo(1000 + (i & 63) * 3).x < 0) throw new Error('unreachable');
      },
      10_000,
      20_000,
    );
    expect(cache.size).toBe(64);
    expect(cycling.bytes).toBeLessThan(32 * 1024);
  });

  it('leaves out the spaces of compiled code, which V8 still has under these names', () => {
    const names = getHeapSpaceStatistics().map((space) => space.space_name);
    // A renamed space would be counted again: the guard would see V8 compiling, not fail open.
    expect(names).toEqual(expect.arrayContaining(['code_space', 'trusted_space']));
    expect(JIT_SPACES.has('new_space') || JIT_SPACES.has('old_space')).toBe(false);
    expect(JIT_SPACES.has('large_object_space') || JIT_SPACES.has('new_large_object_space')).toBe(
      false,
    );
  });

  it('counts garbage that a collection already reclaimed', () => {
    const growth = measureHeapGrowth(() => {
      // ~1 MB per call: several scavenges must run during the loop.
      void new Array<number>(128 * 1024).fill(0);
    }, 200);
    expect(growth.collections).toBeGreaterThan(0);
    expect(growth.bytes).toBeGreaterThan(100 * 1024 * 1024);
    // ~1 s alone; the full parallel `pnpm test` load pushed it past the default 5 s (M2-06).
  }, 30_000);
});
