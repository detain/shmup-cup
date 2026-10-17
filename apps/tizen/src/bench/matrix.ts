/**
 * The TV render bench's **scenario matrix** and phase timing (plan R0-02 — part of the `bench`
 * module, see `./index.ts`).
 *
 * Three internal frames × six variants = 18 scenarios, one per page load, in matrix order (sizes
 * outer, so the 384×216 baseline of a session is measured first). A scenario's id is
 * `<size>-<variant>`, e.g. `640x360-mode7`.
 *
 * @module
 */
import type { CrtFilter } from '@shmup/core';

/** One internal frame size and the density its scene is drawn at. */
export interface BenchSize {
  /** Id, e.g. `'640x360'`. */
  readonly id: string;
  /** Internal frame width in pixels. */
  readonly width: number;
  /** Internal frame height in pixels. */
  readonly height: number;
  /** Density factor `s`: sprites, tiles, the font and speeds are ×s (plan R0-02, §13). */
  readonly density: number;
}

/**
 * The frames the bench measures (plan §13).
 *
 * @remarks
 * Absolute on purpose: **384×216 is v1's frame**, the baseline every other row of a session is
 * read against, and it must stay 384×216 after R2-01 flips the game's frame constants to
 * 640×360 — so these are data, not the game's `FRAME_W` / `FRAME_H`. 640×360 at s = 1.5 is the v2
 * game; 960×540 at s = 2.25 is the same field of view at 1.5× the density ("hi-bit", for the
 * record).
 */
export const BENCH_SIZES: readonly BenchSize[] = Object.freeze([
  Object.freeze({ id: '384x216', width: 384, height: 216, density: 1 }),
  Object.freeze({ id: '640x360', width: 640, height: 360, density: 1.5 }),
  Object.freeze({ id: '960x540', width: 960, height: 540, density: 2.25 }),
]);

/** One load variant on top of the busy frame. */
export interface BenchVariant {
  /** Id: `busy`, `filter`, `mode7`, `crt-light`, `crt-full`, `worst`. */
  readonly id: string;
  /** CRT / scanline setting. */
  readonly crt: CrtFilter;
  /** A filtered layer (a raster wave on the far backdrop — the M2-08 layer-effect filter). */
  readonly filter: boolean;
  /** The Mode-7 floor (M3-02) under the horizon. */
  readonly mode7: boolean;
}

/**
 * The variants (plan §13: plain busy frame, + filtered layer, + Mode-7, + CRT light / full), plus
 * `worst` — all of them at once, the frame no stage should ever exceed.
 */
export const BENCH_VARIANTS: readonly BenchVariant[] = Object.freeze([
  Object.freeze({ id: 'busy', crt: 'off', filter: false, mode7: false }),
  Object.freeze({ id: 'filter', crt: 'off', filter: true, mode7: false }),
  Object.freeze({ id: 'mode7', crt: 'off', filter: false, mode7: true }),
  Object.freeze({ id: 'crt-light', crt: 'light', filter: false, mode7: false }),
  Object.freeze({ id: 'crt-full', crt: 'full', filter: false, mode7: false }),
  Object.freeze({ id: 'worst', crt: 'full', filter: true, mode7: true }),
] as BenchVariant[]);

/** One scenario: a size and a variant. */
export interface BenchScenario {
  /** `<size>-<variant>`, e.g. `'640x360-mode7'`. */
  readonly id: string;
  /** Position in {@link BENCH_SCENARIOS}. */
  readonly index: number;
  /** The internal frame. */
  readonly size: BenchSize;
  /** The load variant. */
  readonly variant: BenchVariant;
}

/**
 * Every scenario, sizes outer and variants inner (so a session measures its 384×216 baseline
 * first).
 */
export const BENCH_SCENARIOS: readonly BenchScenario[] = Object.freeze(
  BENCH_SIZES.reduce<BenchScenario[]>((out, size) => {
    for (const variant of BENCH_VARIANTS) {
      out.push(Object.freeze({ id: `${size.id}-${variant.id}`, index: out.length, size, variant }));
    }
    return out;
  }, []),
);

/**
 * Finds a scenario by id.
 *
 * @param id - Scenario id.
 * @returns The scenario, or `null` for an unknown id.
 */
export function findBenchScenario(id: string): BenchScenario | null {
  for (let i = 0; i < BENCH_SCENARIOS.length; i++) {
    if (BENCH_SCENARIOS[i].id === id) return BENCH_SCENARIOS[i];
  }
  return null;
}

/** How long a scenario's three phases last. */
export interface BenchTiming {
  /** Rendered but not measured (programs link, batch buffers grow, the GPU clocks settle), ms. */
  readonly warmupMs: number;
  /** Measured free-running: render CPU ms, rAF deltas, ticks per frame, ms. */
  readonly measureMs: number;
  /** Measured with `gl.finish()` after every render (the synced GPU figure), ms. */
  readonly syncMs: number;
  /**
   * Fewest frames each measured phase records before it may end, whatever the clock says (0 on the
   * TV, where the phases are timed; headless, SwiftShader can stall for a second under load).
   */
  readonly minFrames: number;
}

/**
 * The TV's phase timing (plan R0-02): 10 s of warm-up and 20 s of measurement — 14 s free-running,
 * 6 s synced — so the 18-scenario matrix takes about 10 minutes with the reloads.
 */
export const TV_BENCH_TIMING: BenchTiming = Object.freeze({
  warmupMs: 10_000,
  measureMs: 14_000,
  syncMs: 6_000,
  minFrames: 0,
});

/**
 * The headless phase timing (`?scenario=…` pages driven by `pnpm bench`): long enough for the
 * counted gates (draw calls, bytes, heap), short enough for SwiftShader.
 */
export const HEADLESS_BENCH_TIMING: BenchTiming = Object.freeze({
  warmupMs: 500,
  measureMs: 1_500,
  syncMs: 500,
  minFrames: 20,
});

/**
 * Reads one query-string parameter.
 *
 * @param search - `location.search` (with or without the leading `?`).
 * @param name - Parameter name.
 * @returns The decoded value, `''` for a bare `?name`, or `null` when absent.
 *
 * @example
 * ```ts
 * searchParam('?scenario=640x360-busy&gl=2', 'gl'); // → '2'
 * ```
 */
export function searchParam(search: string, name: string): string | null {
  const query = search.charAt(0) === '?' ? search.slice(1) : search;
  if (query === '') return null;
  const pairs = query.split('&');
  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i];
    const eq = pair.indexOf('=');
    const key = eq < 0 ? pair : pair.slice(0, eq);
    if (key !== name) continue;
    try {
      return eq < 0 ? '' : decodeURIComponent(pair.slice(eq + 1).replace(/\+/g, ' '));
    } catch (_error) {
      return null;
    }
  }
  return null;
}

/**
 * The phase timing a query string asks for: `?warmup=<ms>&measure=<ms>&sync=<ms>&frames=<n>`, each
 * falling back to `base` when absent or not a whole number ≥ 0 (`measure` ≥ 1).
 *
 * @param search - `location.search`.
 * @param base - Defaults.
 * @returns The timing.
 */
export function timingFromSearch(search: string, base: BenchTiming): BenchTiming {
  /**
   * One duration.
   *
   * @param name - Parameter name.
   * @param fallback - Default.
   * @param min - Smallest accepted value.
   * @returns The duration in ms.
   */
  const read = (name: string, fallback: number, min: number): number => {
    const raw = searchParam(search, name);
    if (raw === null || !/^\d+$/.test(raw)) return fallback;
    const value = Number(raw);
    return value >= min ? value : fallback;
  };
  return {
    warmupMs: read('warmup', base.warmupMs, 0),
    measureMs: read('measure', base.measureMs, 1),
    syncMs: read('sync', base.syncMs, 0),
    minFrames: read('frames', base.minFrames, 0),
  };
}
