/**
 * Allocation guard for hot paths (plan §1.4, M1-06): measures how many bytes of JS heap a
 * function allocates over many iterations, so a test can assert that per-tick and per-frame code
 * (`stepWorld` and everything it calls, a renderer sync, an input poll) does not allocate. It is
 * the one allocation guard of the repo: `@shmup/shell`, `@shmup/render-pixi` and
 * `@shmup/input-web` import it by relative path (test-only code; all three depend on the core).
 *
 * The Vitest workers need `--expose-gc` and `--allow-natives-syntax`: every project with guards
 * passes `ALLOCATION_GUARD_EXEC_ARGV` (`vitest.shared.ts`). The measurement runs rounds of calls,
 * all through one loop in one function:
 *
 * 1. {@link WARMUP_ROUNDS} warm-up rounds share the `warmup` calls (indices `0 … warmup − 1`),
 *    then up to `attempts` measured windows run `iterations` calls each (indices
 *    `0 … iterations − 1`);
 * 2. before every round, the warm-up ones included: two full collections, then V8's
 *    `%FinalizeOptimization()`, which waits for the optimising compiles still running on V8's
 *    background threads and installs their code;
 * 3. a round reads `heapUsed`, runs its calls under a V8 `GCProfiler` (it reports every collection
 *    of the loop with the heap before and after it, per space), and reads `heapUsed` again
 *    **without** collecting.
 *
 * A window's bytes are its heap growth plus what the in-loop collections reclaimed — everything
 * the loop allocated, even garbage a scavenge already freed — both **without** the heap spaces of
 * compiled code ({@link JIT_SPACES}). A loop that allocates nothing reports (close to) zero; one
 * object per iteration shows up as tens of bytes per iteration. The window with the fewest bytes
 * is returned, and one of at most `settled` bytes (default 32 KiB — keep it at most half the
 * guard's budget; the 32 KiB guards pass 16 KiB) ends the search: more windows could only confirm
 * it, and the heavy World guards would pay seconds for them.
 *
 * Why it is built this way — what made guards fail in the full `pnpm test` (47 workers on 48
 * cores) and pass alone (M2-14 follow-up, measured over many full runs):
 *
 * - **Background compiles.** V8 compiles hot code on background threads and installs it on the
 *   main thread at its next check. The top-tier (TurboFan) compile of the code under test was
 *   often still running when the warm-up ended — even on an idle machine for the stage runner's
 *   `tick` (25 ms of compiling, landing after the first window), and under load, with those
 *   threads starved, for several windows — so a window ran V8's lower tiers, which box doubles
 *   (the options guard measured 462 KB instead of 15 KB), and counted the installed code itself
 *   (up to 70 KB of code and metadata per window in the weapon select guard).
 *   `%FinalizeOptimization()` before each round lands every compile started so far before the
 *   round whatever the load, and leaving the code spaces out makes one that starts and lands
 *   inside a window cost nothing the code under test did not allocate. Real allocations never live
 *   in those spaces: a JavaScript object, array, closure or boxed number is counted.
 * - **One loop.** The warm-up rounds and the windows run the same loop, so the windows run the
 *   code the warm-up made V8 compile — including the on-stack (OSR) compile of that loop with `fn`
 *   inlined, which a separate warm-up loop's OSR code never served: the old measured loop started
 *   cold. Never move a measured loop into a helper of its own either: a function that was only
 *   ever inlined does not tier up by itself, so a cold caller runs it in a lower tier.
 * - **Collections before every round.** A full collection that clears earlier tests' dead hidden
 *   classes deoptimises code that embedded them. The first ones run before the warm-up, and the
 *   warm-up's second round runs after the same collections a window gets, so none first happens
 *   between the warm-up and a window.
 * - **Several windows.** V8 can still deoptimise and re-optimise inside a window (a path the
 *   warm-up never took); a real per-call allocation shows in every window.
 * - **Long warm-ups for cheap loops.** V8 promotes a function to its top tier only after enough
 *   calls, and a window that runs indices the warm-up never ran can take new paths: give a loop of
 *   microseconds a call a warm-up of at least `max(iterations, 20_000)` calls.
 *
 * Earlier probes of render-pixi and input-web sampled `heapUsed` every 100 calls, and each sample
 * allocated a `process.memoryUsage()` result (their guards measure 10–35 KB less per window with
 * this helper); input-web's also collected garbage *after* its warm-up and measured one window.
 * They are gone.
 *
 * @module
 */
import { GCProfiler, getHeapSpaceStatistics } from 'node:v8';

/** Result of {@link measureHeapGrowth}. */
export interface HeapGrowth {
  /**
   * Bytes allocated during the steadiest measured window: heap growth plus the bytes collections
   * reclaimed meanwhile, both without V8's compiled code ({@link JIT_SPACES}).
   */
  readonly bytes: number;
  /** Heap growth alone over that window (after − before, without the reclaimed bytes). */
  readonly growth: number;
  /** Garbage collections that ran during that window. */
  readonly collections: number;
  /** `bytes / iterations`. */
  readonly bytesPerIteration: number;
  /** Measured windows that ran: at most `attempts`, fewer when one settled. */
  readonly windows: number;
}

/**
 * The heap spaces V8 keeps its compiled code and compiler metadata in (machine code, bytecode,
 * deoptimisation data). JavaScript objects never live there, so what the code under test
 * allocates is counted in every other space, and a tier-up that lands during a window — when a
 * background compile finishes depends on how busy the machine is — adds nothing to it.
 */
export const JIT_SPACES: ReadonlySet<string> = new Set([
  'code_space',
  'code_large_object_space',
  'trusted_space',
  'trusted_large_object_space',
  'shared_trusted_space',
  'shared_trusted_large_object_space',
]);

/** Rounds the warm-up calls are split into (see the module docs). */
export const WARMUP_ROUNDS = 2;

/** How to start a worker the allocation guard can run in. */
const NEEDS_FLAGS =
  'the allocation guard needs node --expose-gc --allow-natives-syntax: ' +
  'defineShmupProject(name, { execArgv: ALLOCATION_GUARD_EXEC_ARGV }) (vitest.shared.ts)';

/**
 * The `gc()` function exposed by `--expose-gc`.
 *
 * @returns The function.
 * @throws {Error} When the worker was started without `--expose-gc`.
 */
function requireGc(): () => void {
  const gc = globalThis.gc;
  if (typeof gc !== 'function') throw new Error(NEEDS_FLAGS);
  return () => {
    gc();
  };
}

/** {@link requireFinalize}'s function, once compiled. */
let finalizeOptimization: (() => void) | null = null;

/**
 * V8's `%FinalizeOptimization()`: waits for the optimising compiles running in the background and
 * installs their code.
 *
 * @returns The function.
 * @throws {Error} When the worker was started without `--allow-natives-syntax`.
 */
function requireFinalize(): () => void {
  if (finalizeOptimization === null) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-implied-eval -- V8 natives syntax only parses at run time
      finalizeOptimization = new Function('%FinalizeOptimization()') as () => void;
    } catch {
      throw new Error(NEEDS_FLAGS);
    }
  }
  return finalizeOptimization;
}

/**
 * Runs two full garbage collections — for a retention check (`heapUsed` after a loop, with the
 * loop's garbage collected, against `heapUsed` before it).
 *
 * @throws {Error} Without `--expose-gc`.
 */
export function forceGc(): void {
  const gc = requireGc();
  gc();
  gc();
}

/**
 * Bytes used in the {@link JIT_SPACES}.
 *
 * @returns Bytes.
 */
function jitUsed(): number {
  let used = 0;
  for (const space of getHeapSpaceStatistics()) {
    if (JIT_SPACES.has(space.space_name)) used += space.space_used_size;
  }
  return used;
}

/**
 * Measures the bytes `fn` allocates over `iterations` calls, after a warm-up.
 *
 * @param fn - The code under test; receives the iteration index: `0 … warmup − 1` across the
 *   warm-up, `0 … iterations − 1` in every measured window. Must not keep references to what it
 *   allocates *for the test's sake* — the measurement counts allocations, retained or not.
 * @param iterations - Calls per measured window.
 * @param warmup - Warm-up calls first, split into {@link WARMUP_ROUNDS} rounds (default:
 *   `min(iterations, 1000)`; a cheap loop needs at least `max(iterations, 20_000)`).
 * @param attempts - Most measured windows of `iterations` calls each (default 3); the steadiest
 *   one — the fewest bytes — is returned.
 * @param settled - A window measuring at most this many bytes ends the search (default 32 KiB):
 *   keep it at most half the guard's budget.
 * @returns The measurement.
 * @throws {Error} Without `--expose-gc` or `--allow-natives-syntax`.
 *
 * @example
 * ```ts
 * const growth = measureHeapGrowth(() => stepWorld(world, input), 10_000, 20_000);
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
  const finalize = requireFinalize();
  const rounds = WARMUP_ROUNDS + Math.max(1, attempts);
  let best: HeapGrowth | null = null;
  let windows = 0;
  // Every round — the warm-up ones and the measured windows alike — runs this same body, so the
  // windows run in the code the warm-up rounds made V8 compile (see the module docs).
  for (let round = 0; round < rounds; round++) {
    const measured = round >= WARMUP_ROUNDS;
    const start = measured ? 0 : Math.floor((warmup * round) / WARMUP_ROUNDS);
    const end = measured ? iterations : Math.floor((warmup * (round + 1)) / WARMUP_ROUNDS);
    gc();
    gc();
    finalize();
    const profiler = new GCProfiler();
    const jitBefore = jitUsed();
    const before = process.memoryUsage().heapUsed;
    profiler.start();
    for (let i = start; i < end; i++) fn(i);
    const after = process.memoryUsage().heapUsed;
    const stats = profiler.stop()?.statistics ?? [];
    const jitAfter = jitUsed();
    let reclaimed = 0;
    for (const entry of stats) {
      const spacesBefore = entry.beforeGC.heapSpaceStatistics;
      const spacesAfter = entry.afterGC.heapSpaceStatistics;
      let jitFreed = 0;
      for (let k = 0; k < spacesBefore.length; k++) {
        if (JIT_SPACES.has(spacesBefore[k].spaceName)) {
          jitFreed += spacesBefore[k].spaceUsedSize - spacesAfter[k].spaceUsedSize;
        }
      }
      const freed =
        entry.beforeGC.heapStatistics.usedHeapSize - entry.afterGC.heapStatistics.usedHeapSize;
      reclaimed += Math.max(0, freed - jitFreed);
    }
    const growth = after - before - (jitAfter - jitBefore);
    const bytes = Math.max(0, growth) + reclaimed;
    if (measured) {
      windows++;
      if (best === null || bytes < best.bytes) {
        best = {
          bytes,
          growth,
          collections: stats.length,
          bytesPerIteration: bytes / iterations,
          windows,
        };
      }
      if (bytes <= settled) break;
    }
  }
  if (best === null) throw new Error('measureHeapGrowth measured no window');
  return { ...best, windows };
}

/**
 * Bytes one resume of a sleeping behaviour coroutine may allocate: the generator's result object
 * (decision D29 — "every wake allocates the generator's result"), plus the boxed doubles its body
 * computes in V8's lower tiers, where generators stay. Measured at ≈ 80 bytes a wake on a boss
 * phase (M2-14: the same boss phase with a volley every 10, 20, 40 and 1,000 ticks).
 */
export const SCRIPT_WAKE_BYTES = 96;

/**
 * Counts the wakes of a boss script across a guard's calls (M2-14), so the guard can allow the
 * bytes each wake costs by decision D29 and nothing else: a boss phase that wakes often (a volley
 * every few dozen ticks) spends tens of KB per 10,000 ticks on its generator's results alone, which
 * made the heavy boss guards flaky under the full suite's load (M2-13's `boss.facet` / `boss.squid`
 * at 66 KB of 64).
 *
 * @example
 * ```ts
 * const wakes = new WakeCount();
 * const growth = measureHeapGrowth(() => { stepWorld(w, input); wakes.see(boss.wakeTick); }, 10_000);
 * expect(growth.bytes).toBeLessThan(64 * 1024 + wakes.allowance(10_000));
 * ```
 */
export class WakeCount {
  /** Wakes seen (the watched wake tick changed). */
  wakes = 0;
  /** Calls seen. */
  calls = 0;
  /** The wake tick seen last. */
  private last = -1;

  /**
   * Call once per guarded call with the script's wake tick (a change = the script woke).
   *
   * @param wakeTick - The boss's `wakeTick` after the call.
   */
  see(wakeTick: number): void {
    this.calls++;
    if (wakeTick !== this.last) {
      if (this.last >= 0) this.wakes++;
      this.last = wakeTick;
    }
  }

  /**
   * The bytes the wakes of one measured window may allocate: the wakes per call × the window's
   * calls × {@link SCRIPT_WAKE_BYTES}.
   *
   * @param iterations - Calls in one measured window.
   * @returns Bytes.
   */
  allowance(iterations: number): number {
    return this.calls === 0 ? 0 : (this.wakes / this.calls) * iterations * SCRIPT_WAKE_BYTES;
  }
}
