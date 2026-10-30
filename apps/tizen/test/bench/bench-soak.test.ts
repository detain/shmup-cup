/**
 * The `hb-` soak page body (plan v20x PAGES S2, `src/bench/soak.ts`) in Node: the residency loop
 * against a scripted host — cycles, heap sampling and the honest degradation when the engine does
 * not answer for `performance.memory`, the page ledger and the stop-on-first-failure law — plus
 * the wire gate on every record it builds.
 */
import { describe, expect, it } from 'vitest';
import {
  SOAK_MAX_TARGET_S,
  SOAK_MIN_TARGET_S,
  SOAK_PAGE_ID,
  SOAK_TARGET_S,
  measureSoak,
  soakTargetSecondsFromSearch,
  type SoakHost,
} from '../../src/bench/index.js';
import { harbWireIssues } from './fake-harb-env.js';

/** What a scripted host saw. */
interface Script {
  readonly host: SoakHost;
  readonly begins: number;
  readonly ends: number;
  readonly rests: number;
}

/**
 * A deterministic host on a stepping clock: each cycle advances the clock a second and a half.
 *
 * @param options - Heap answers, ledger shapes, injected failures.
 * @returns The scripted host and its counters.
 */
function scriptedSoak(options?: {
  readonly heap?: readonly number[] | null;
  readonly peak?: number;
  readonly floor?: number;
  readonly beginFails?: boolean;
  readonly endFails?: boolean;
  readonly restFails?: boolean;
}): Script {
  const heap = options?.heap === undefined ? [10_000_000] : options.heap;
  let t = 0;
  let cycles = 0;
  const counters = { begins: 0, ends: 0, rests: 0 };
  const host: SoakHost = {
    time: () => t,
    heapUsed: () => {
      if (heap === null || heap.length === 0) return -1;
      const index = Math.min(cycles, heap.length - 1);
      return heap[index];
    },
    beginCycle: () => {
      counters.begins += 1;
      if (options?.beginFails === true) return Promise.reject(new Error('stand-in pages missing'));
      cycles += 1;
      t += 1_500;
      return Promise.resolve(options?.peak ?? 2);
    },
    endCycle: () => {
      counters.ends += 1;
      if (options?.endFails === true) throw new Error('unload refused');
      return options?.floor ?? 0;
    },
    rest: () => {
      counters.rests += 1;
      if (options?.restFails === true) return Promise.reject(new Error('timer starved'));
      t += 1_000;
      return Promise.resolve();
    },
  };
  return { host, begins: counters.begins, ends: counters.ends, rests: counters.rests };
}

describe('hb- soak page (plan v20x PAGES S2)', () => {
  it('cycles, samples the heap and keeps the ledger — and passes the wire validator', async () => {
    const script = scriptedSoak({ heap: [10_000_000, 11_000_000, 12_500_000, 13_000_000] });
    const row = await measureSoak(script.host, {
      targetSeconds: 3,
      wallClock: () => 1_760_000_000_000,
    });
    expect(row.record).toBe('memory');
    expect(row.scenario).toBe(SOAK_PAGE_ID);
    expect(row.heapMeasured).toBe(true);
    expect(row.cycles).toBeGreaterThanOrEqual(2);
    expect(row.seconds).toBeGreaterThanOrEqual(3);
    expect(row.heapStartBytes).toBe(10_000_000);
    expect(row.heapEndBytes).toBeGreaterThan(row.heapStartBytes);
    expect(row.heapPeakBytes).toBeGreaterThanOrEqual(row.heapEndBytes);
    expect(row.heapDeltaBytes).toBe(row.heapEndBytes - row.heapStartBytes);
    expect(row.heapSamples.length).toBe(row.cycles + 1);
    expect(row.pageLedgerMax).toBe(2);
    expect(row.pageLedgerMin).toBe(0);
    expect(row.error).toBeNull();
    expect(row.rssBytes).toBeUndefined(); // the supervisor pairing never runs through this page
    expect(harbWireIssues(row)).toEqual([]);
  });

  it('degrades honestly when performance.memory is absent — never silent zeros', async () => {
    const script = scriptedSoak({ heap: null });
    const row = await measureSoak(script.host, {
      targetSeconds: 3,
      wallClock: () => 1_760_000_000_000,
    });
    expect(row.heapMeasured).toBe(false);
    expect(row.heapSamples).toEqual([]);
    expect(row.heapStartBytes).toBe(0);
    expect(row.heapDeltaBytes).toBe(0);
    expect(row.cycles).toBeGreaterThanOrEqual(2);
    expect(row.pageLedgerMax).toBe(2);
    expect(row.error).toContain('performance.memory unavailable');
    expect(harbWireIssues(row)).toEqual([]);
  });

  it('stops at the first failed cycle and says which', async () => {
    const script = scriptedSoak({ beginFails: true });
    const row = await measureSoak(script.host, {
      targetSeconds: 3,
      wallClock: () => 1_760_000_000_000,
    });
    expect(row.cycles).toBe(0);
    expect(row.error).toContain('cycle 1 failed:');
    expect(harbWireIssues(row)).toEqual([]);
  });

  it('notes a failed unload after having counted the cycle', async () => {
    const script = scriptedSoak({ endFails: true });
    const row = await measureSoak(script.host, {
      targetSeconds: 3,
      wallClock: () => 1_760_000_000_000,
    });
    expect(row.cycles).toBe(1);
    expect(row.error).toContain('unload after cycle 1 failed');
    expect(harbWireIssues(row)).toEqual([]);
  });
});

describe('hb- soak page knobs', () => {
  it('clamps the requested soak length', () => {
    expect(SOAK_TARGET_S).toBe(1800);
    expect(soakTargetSecondsFromSearch('')).toBe(SOAK_TARGET_S);
    expect(soakTargetSecondsFromSearch('?secs=60')).toBe(60);
    expect(soakTargetSecondsFromSearch('?secs=1')).toBe(SOAK_MIN_TARGET_S);
    expect(soakTargetSecondsFromSearch('?secs=99999')).toBe(SOAK_MAX_TARGET_S);
    expect(soakTargetSecondsFromSearch('?secs=nope')).toBe(SOAK_TARGET_S);
  });
});
