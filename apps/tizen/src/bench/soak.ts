/**
 * The **soak page** body (plan v20x HARBENCH, program session S2, `?page=soak`): the long,
 * unattended residency cycle — load the stand-in zone's atlas pages, draw a frame, drop every
 * texture and close every decoded image, rest, repeat — while the JS heap is sampled each cycle.
 * It answers the question the memory budget of `docs/dev/platform-polish.md` has never had on real
 * hardware: does a TV run of hours drift upward, and how many atlas pages are resident in any
 * cycle.
 *
 * **Pure body** (the boot page's habit): everything is driven through an injected {@link SoakHost};
 * the rig in `./run.ts` supplies it, tests fake it. It never rejects, and it never reports a
 * silent zero: where `performance.memory` is absent the heap fields stay zero **and** the record
 * carries `heapMeasured: false` plus its `error` note (the S8 lesson), so the analyzer reads the
 * row as degraded, not as a flat heap.
 *
 * `rssBytes` is deliberately never written here — it belongs to the supervisor pairing (the sdb
 * carry item), and the wire leaves it optional.
 *
 * @module
 */
import type { HarbenchMemoryRecord } from '@shmup/shell';
import { searchParam } from './matrix.js';

/** The page's id in `?page=` and its record's `scenario`. */
export const SOAK_PAGE_ID = 'soak';

/** Default soak length on the TV, seconds (about half an hour of cycles plus rests). */
export const SOAK_TARGET_S = 1800;

/** Shortest soak the query may ask for, seconds. */
export const SOAK_MIN_TARGET_S = 10;

/** Longest soak the query may ask for, seconds. */
export const SOAK_MAX_TARGET_S = 7200;

/** Rest between cycles on the TV, ms (the set gets breathing room; the heap settles). */
export const SOAK_REST_MS = 1000;

/** Most heap samples the wire accepts. */
export const MAX_SOAK_SAMPLES = 65536;

/** Longest an `error` string may be (the wire caps it at 512). */
const ERROR_MAX = 512;

/**
 * Drives the residency cycles (the rig implements it over the decode host and the renderer):
 * one cycle = load to a peak resident page count, then unload to the floor.
 */
export interface SoakHost {
  /**
   * The monotonic clock.
   *
   * @returns Milliseconds.
   */
  time(): number;
  /**
   * The used JS heap.
   *
   * @returns Bytes, or -1 when the engine does not say.
   */
  heapUsed(): number;
  /**
   * Loads one cycle's pages and draws the frame.
   *
   * @returns The atlas pages resident at the cycle's peak.
   * @throws When the cycle cannot load — the soak stops with the note.
   */
  beginCycle(): Promise<number>;
  /**
   * Releases everything {@link SoakHost.beginCycle} made.
   *
   * @returns The pages still resident after the unload.
   */
  endCycle(): number;
  /**
   * Waits out the rest between cycles.
   *
   * @returns Resolves when the rest is over.
   */
  rest(): Promise<void>;
  /**
   * Shows progress (cold path): elapsed seconds and completed cycles.
   *
   * @param seconds - Elapsed.
   * @param cycles - Completed.
   */
  progress?(seconds: number, cycles: number): void;
}

/**
 * The soak length the query asks for: `?secs=<n>` clamped to {@link SOAK_MIN_TARGET_S} …
 * {@link SOAK_MAX_TARGET_S}.
 *
 * @param search - `location.search`.
 * @returns Seconds.
 */
export function soakTargetSecondsFromSearch(search: string): number {
  const raw = searchParam(search, 'secs');
  const parsed = raw === null ? NaN : Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return SOAK_TARGET_S;
  return Math.min(SOAK_MAX_TARGET_S, Math.max(SOAK_MIN_TARGET_S, Math.floor(parsed)));
}

/**
 * Runs the soak: cycles until the target elapses (at least one cycle always completes or fails),
 * sampling the heap once per cycle and keeping the resident-page ledger.
 *
 * @param host - The rig (real or fake).
 * @param options - Target length and the record's wall clock (the rest between cycles is the
 *   host's own).
 * @returns The memory row — resolves even when the very first cycle failed (the row carries the why).
 */
export async function measureSoak(
  host: SoakHost,
  options: {
    /** Seconds to soak. */
    readonly targetSeconds: number;
    /** Wall clock for `startedAt` / `endedAt`. */
    readonly wallClock: () => number;
  },
): Promise<HarbenchMemoryRecord> {
  const startedAt = options.wallClock();
  const t0 = host.time();
  const notes: string[] = [];
  const samples: number[] = [];

  const first = host.heapUsed();
  let heapMeasured = first >= 0;
  if (!heapMeasured) notes.push('performance.memory unavailable: heap fields not measured');
  let heapPeak = 0;
  if (heapMeasured) {
    samples.push(first);
    heapPeak = first;
  }

  let cycles = 0;
  let pageMin = 0;
  let pageMax = 0;
  let stopped = false;
  while (!stopped) {
    let peak: number;
    try {
      peak = await host.beginCycle();
    } catch (error) {
      notes.push(`cycle ${cycles + 1} failed: ${String(error)}`);
      break;
    }
    cycles += 1;
    if (heapMeasured) {
      const heap = host.heapUsed();
      if (heap >= 0) {
        if (samples.length < MAX_SOAK_SAMPLES) samples.push(heap);
        if (heap > heapPeak) heapPeak = heap;
      } else {
        heapMeasured = false;
        notes.push('performance.memory stopped answering at cycle ' + cycles);
      }
    }
    let floor: number;
    try {
      floor = host.endCycle();
    } catch (error) {
      notes.push(`unload after cycle ${cycles} failed: ${String(error)}`);
      break;
    }
    pageMax = Math.max(pageMax, peak);
    pageMin = cycles === 1 ? floor : Math.min(pageMin, floor);
    const elapsed = Math.max(0, (host.time() - t0) / 1000);
    host.progress?.(elapsed, cycles);
    if (elapsed >= options.targetSeconds) break;
    try {
      await host.rest();
    } catch (error) {
      notes.push(`rest failed: ${String(error)}`);
      break;
    }
    stopped = cycles >= MAX_SOAK_SAMPLES; // a sample per cycle: the wire cap bounds the cycles too
  }

  const seconds = Math.max(0, (host.time() - t0) / 1000);
  const heapStart = samples.length > 0 ? samples[0] : 0;
  const heapEnd = samples.length > 0 ? samples[samples.length - 1] : 0;
  let error = notes.join('; ');
  if (cycles === 0 && error === '') error = 'the soak completed no cycle';
  return {
    record: 'memory',
    scenario: SOAK_PAGE_ID,
    index: 0,
    startedAt,
    endedAt: options.wallClock(),
    seconds,
    cycles,
    heapMeasured,
    heapStartBytes: heapStart,
    heapPeakBytes: heapPeak,
    heapEndBytes: heapEnd,
    heapDeltaBytes: heapMeasured ? heapEnd - heapStart : 0,
    heapSamples: heapMeasured ? samples : [],
    pageLedgerMin: pageMin,
    pageLedgerMax: pageMax,
    error: error === '' ? null : error.slice(0, ERROR_MAX),
  };
}
