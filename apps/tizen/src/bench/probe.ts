/**
 * The **probe page** body (plan v20x HARBENCH, program session S4, `?page=probe`): the engine
 * facts the budgets are read against — the WebGL 1 (and, where the set dares, WebGL 2) extension
 * lists, whether an ETC-compressed upload actually runs (the format question a list alone cannot
 * answer: `compressedTexImage2D` of a 4×4 block, timed), the device-memory and core-count
 * announcements, `OffscreenCanvas` presence, and whether `(prefers-reduced-motion: reduce)`
 * resolves on the firmware (the negative check `docs/old/shmup_tech.md` §2.7 asked for).
 *
 * **Pure body** like its siblings: the contexts themselves are created by the injected
 * {@link ProbeHost} (the rig borrows a 1×1 canvas per context and releases it through
 * `WEBGL_lose_context`, the `tools/input-probe/src/env.ts` habit), so the whole fold is testable
 * without a GPU. A capability the engine does not answer for is `null` in its field — never a zero
 * that reads as a measurement (the S8 lesson).
 *
 * @module
 */
import type { HarbenchProbeRecord } from '@shmup/shell';
import { summarizeRuns } from './decode.js';

/** The page's id in `?page=` and its record's `scenario`. */
export const PROBE_PAGE_ID = 'probe';

/** One 4×4 ETC block is 8 bytes; the smoke uploads exactly one block. */
export const PROBE_SMOKE_BLOCK_BYTES = 8;

/** Smoke upload repetitions. */
export const PROBE_SMOKE_REPETITIONS = 6;

/**
 * The compressed formats the smoke tries, in order: the extension name that must appear in the
 * list, and the `GLenum` internal format that belongs to it (`COMPRESSED_RGB8_ETC2` 0x9278 /
 * `COMPRESSED_RGB8_ETC1` 0x8C63). A context that lists the name is the one asked to upload.
 */
export const PROBE_ETC_FORMATS: readonly { readonly extension: string; readonly format: number }[] =
  [
    { extension: 'WEBGL_compressed_texture_etc2', format: 0x9278 },
    { extension: 'WEBGL_compressed_texture_etc', format: 0x8c63 },
  ];

/** Longest an `error` string may be (the wire caps it at 512). */
const ERROR_MAX = 512;

/** One live GL context, as the host hands it to {@link measureProbe}. */
export interface ProbeContext {
  /**
   * The supported extension names.
   *
   * @returns The list (never `null`).
   */
  supportedExtensions(): string[];
  /**
   * Uploads one 4×4 compressed block, timing the `compressedTexImage2D` + finish.
   *
   * @param extension - The extension that must carry the format (checked again before the upload).
   * @param format - The internal `GLenum` format.
   * @param block - The bytes ({@link PROBE_SMOKE_BLOCK_BYTES}).
   * @returns The upload ms, or `null` when this context cannot take the block.
   */
  compressedSmokeMs(extension: string, format: number, block: Uint8Array): number | null;
  /** Loses the context (the probe releases both of its contexts before it answers). */
  release(): void;
}

/** Drives the probe (the rig implements it over throwaway 1×1 canvases and `window`). */
export interface ProbeHost {
  /**
   * The monotonic clock (the smoke's repetitions are timed with it).
   *
   * @returns Milliseconds.
   */
  time(): number;
  /**
   * Opens one GL context of the requested kind.
   *
   * @param kind - `'webgl'` or `'webgl2'`.
   * @returns The context, or `null` when the engine refuses one.
   */
  createContext(kind: 'webgl' | 'webgl2'): ProbeContext | null;
  /**
   * Whether the engine has `OffscreenCanvas` at all.
   *
   * @returns The presence.
   */
  hasOffscreenCanvas(): boolean;
  /**
   * Whether `(prefers-reduced-motion: reduce)` resolves to true on this firmware.
   *
   * @returns The media-query answer.
   */
  reduceMotionResolves(): boolean;
  /**
   * `navigator.deviceMemory`.
   *
   * @returns GiB, or `null` when the engine does not say.
   */
  deviceMemoryGiB(): number | null;
  /**
   * `navigator.hardwareConcurrency`.
   *
   * @returns The core count, or `null` when the engine does not say.
   */
  hardwareConcurrency(): number | null;
}

/**
 * Reads the capability set once. Never throws: a refused context notes itself and the row keeps
 * its remaining fields honest (`webgl2Extensions: null` is an expected TV answer, not an error —
 * Chromium 68/69 exposes no WebGL 2 on these builds; a missing WebGL 1 context is an error).
 *
 * @param host - The rig (real or fake).
 * @param options - Smoke repetitions and the record's wall clock.
 * @returns The probe row.
 */
export function measureProbe(
  host: ProbeHost,
  options: {
    /** Smoke upload attempts. */
    readonly repetitions: number;
    /** Wall clock for `startedAt` / `endedAt`. */
    readonly wallClock: () => number;
  },
): HarbenchProbeRecord {
  const startedAt = options.wallClock();
  const notes: string[] = [];

  const context1 = host.createContext('webgl');
  const webglExtensions = context1 === null ? [] : context1.supportedExtensions();
  if (context1 === null) notes.push('webgl context unavailable');
  const context2 = host.createContext('webgl2');
  const webgl2Extensions = context2 === null ? null : context2.supportedExtensions();

  const smokeTimes: number[] = [];
  const block = new Uint8Array(PROBE_SMOKE_BLOCK_BYTES);
  let smokeContext: ProbeContext | null = null;
  let smokeFormat: { extension: string; format: number } | null = null;
  for (let i = 0; i < PROBE_ETC_FORMATS.length && smokeContext === null; i++) {
    const candidate = PROBE_ETC_FORMATS[i];
    if (context1 !== null && webglExtensions.indexOf(candidate.extension) >= 0) {
      smokeContext = context1;
      smokeFormat = candidate;
    } else if (context2 !== null && webgl2Extensions !== null) {
      if (webgl2Extensions.indexOf(candidate.extension) >= 0) {
        smokeContext = context2;
        smokeFormat = candidate;
      }
    }
  }
  if (smokeContext !== null && smokeFormat !== null) {
    for (let rep = 0; rep < options.repetitions; rep++) {
      const ms = smokeContext.compressedSmokeMs(smokeFormat.extension, smokeFormat.format, block);
      if (ms === null) {
        notes.push(`smoke upload refused (${smokeFormat.extension})`);
        break;
      }
      smokeTimes.push(ms);
    }
  }

  if (context1 !== null) context1.release();
  if (context2 !== null) context2.release();

  const fold = summarizeRuns(smokeTimes);
  return {
    record: 'probe',
    scenario: PROBE_PAGE_ID,
    index: 0,
    startedAt,
    endedAt: options.wallClock(),
    webglExtensions,
    webgl2Extensions,
    deviceMemory: host.deviceMemoryGiB(),
    hardwareConcurrency: host.hardwareConcurrency(),
    offscreenCanvas: host.hasOffscreenCanvas(),
    reduceMotionResolves: host.reduceMotionResolves(),
    smokeUploadMs: fold,
    error: notes.length === 0 ? null : notes.join('; ').slice(0, ERROR_MAX),
  };
}
