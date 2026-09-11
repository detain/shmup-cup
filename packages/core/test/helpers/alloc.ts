/**
 * Allocation guard for hot paths (plan §1.4, M1-06): measures how many bytes of JS heap a
 * function allocates over many iterations, so a test can assert that per-tick code (`stepWorld`
 * and everything it calls) does not allocate.
 *
 * Needs `--expose-gc` (the core's Vitest project passes it to its workers — see
 * `packages/core/vitest.config.ts`). The measurement:
 *
 * 1. forces two full collections, then runs `warmup` iterations (JIT tiers, inline caches and
 *    lazily created hidden classes allocate once and must not count). Collecting *before* the
 *    warm-up matters: a full GC that clears the dead hidden classes of earlier tests deoptimises
 *    every function whose optimised code embedded them, and if that happened at step 2 instead,
 *    the measured loop would run in V8's lower tiers, which box double temporaries (hundreds of
 *    bytes per `stepWorld` that the optimised steady state never allocates);
 * 2. forces two more full collections and reads `heapUsed`;
 * 3. runs `iterations` calls under a V8 `GCProfiler`, which reports every collection that
 *    happened during the loop with the heap size before and after it;
 * 4. reads `heapUsed` again **without** collecting.
 *
 * The result is `heapUsed(after) − heapUsed(before)` plus the bytes the in-loop collections
 * reclaimed — i.e. everything the loop allocated, even garbage a scavenge already freed. A loop
 * that allocates nothing reports (close to) zero; one object per iteration shows up as tens of
 * bytes per iteration.
 *
 * Steps 2–4 run up to `attempts` times (default 3) and the window with the fewest bytes is
 * returned: V8 can still drop a hot function back to a lower tier, or install freshly optimised
 * code, during one window — a single-window guard then fails now and then under the load of the
 * full suite (the stage runner guards and the terrain-scan guard did: 70–170 KB in one window, a
 * few KB in the next), whereas code that really allocates per iteration does so in every window.
 * A window measuring at most `settled` bytes (default 32 KiB, half the smallest absolute budget a
 * guard uses) ends the search: further windows could only confirm it, and the heavy World guards
 * would pay seconds for them. A guard with a budget under 64 KiB passes a smaller `settled`; pass
 * `attempts = 1` only to observe one raw window.
 *
 * Give short, cheap loops a long warm-up (`warmup` ≫ 1000, e.g. 20,000): the default warm-up of
 * 1000 calls can end before V8 has optimised `fn`, and the measured loop then pays for the tier-up.
 *
 * @module
 */
import { GCProfiler } from 'node:v8';

/** Result of {@link measureHeapGrowth}. */
export interface HeapGrowth {
  /** Bytes allocated during the measured iterations (heap growth + bytes reclaimed by GCs). */
  readonly bytes: number;
  /** Heap growth alone (after − before, without the reclaimed bytes). */
  readonly growth: number;
  /** Garbage collections that ran during the measured iterations. */
  readonly collections: number;
  /** `bytes / iterations`. */
  readonly bytesPerIteration: number;
}

/**
 * The `gc()` function exposed by `--expose-gc`.
 *
 * @returns The function.
 * @throws {Error} When the worker was started without `--expose-gc`.
 */
function requireGc(): () => void {
  const gc = globalThis.gc;
  if (typeof gc !== 'function') {
    throw new Error(
      'measureHeapGrowth needs node --expose-gc (see packages/core/vitest.config.ts)',
    );
  }
  return () => {
    gc();
  };
}

/**
 * Measures the bytes `fn` allocates over `iterations` calls, after a warm-up.
 *
 * @param fn - The code under test; receives the iteration index. Must not keep references to
 *   what it allocates *for the test's sake* — the measurement counts allocations, retained or not.
 * @param iterations - Measured calls.
 * @param warmup - Unmeasured calls first (default: `min(iterations, 1000)`).
 * @param attempts - Most measured windows of `iterations` calls each (default 3); the steadiest
 *   one — the fewest bytes — is returned.
 * @param settled - A window measuring at most this many bytes ends the search (default 32 KiB).
 * @returns The measurement.
 * @throws {Error} Without `--expose-gc`.
 *
 * @example
 * ```ts
 * const growth = measureHeapGrowth(() => stepWorld(world, input), 10_000);
 * expect(growth.bytes).toBeLessThan(256 * 1024);
 * ```
 */
export function measureHeapGrowth(
  fn: (iteration: number) => void,
  iterations: number,
  warmup: number = Math.min(iterations, 1000),
  attempts = 3,
  settled = 32 * 1024,
): HeapGrowth {
  const gc = requireGc();
  // Clear what earlier code left behind first, so the warm-up re-optimises (see the module docs).
  gc();
  gc();
  for (let i = 0; i < warmup; i++) fn(i);
  // The measured loop stays in this function, right after the warm-up loop: V8 optimises the
  // warm-up on stack (OSR) with `fn` inlined, and the measured loop runs in that same code. In a
  // separate, cold helper `fn` would run in a lower tier and box its doubles.
  let best: HeapGrowth | null = null;
  for (let attempt = 0; attempt < attempts || best === null; attempt++) {
    gc();
    gc();
    const profiler = new GCProfiler();
    const before = process.memoryUsage().heapUsed;
    profiler.start();
    for (let i = 0; i < iterations; i++) fn(i);
    const after = process.memoryUsage().heapUsed;
    const result = profiler.stop();
    let reclaimed = 0;
    const stats = result?.statistics ?? [];
    for (const entry of stats) {
      const freed =
        entry.beforeGC.heapStatistics.usedHeapSize - entry.afterGC.heapStatistics.usedHeapSize;
      if (freed > 0) reclaimed += freed;
    }
    const growth = after - before;
    const bytes = Math.max(0, growth) + reclaimed;
    if (best === null || bytes < best.bytes) {
      best = { bytes, growth, collections: stats.length, bytesPerIteration: bytes / iterations };
    }
    if (bytes <= settled) break;
  }
  return best;
}
