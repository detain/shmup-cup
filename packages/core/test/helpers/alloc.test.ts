/**
 * Self-test of the allocation guard (`helpers/alloc.ts`): it must see allocations — retained
 * or already garbage — and report (close to) nothing for an empty loop.
 */
import { describe, expect, it } from 'vitest';
import { measureHeapGrowth } from './alloc.js';

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

  it('counts garbage that a collection already reclaimed', () => {
    const growth = measureHeapGrowth(() => {
      // ~1 MB per call: several scavenges must run during the loop.
      void new Array<number>(128 * 1024).fill(0);
    }, 200);
    expect(growth.collections).toBeGreaterThan(0);
    expect(growth.bytes).toBeGreaterThan(100 * 1024 * 1024);
  });
});
