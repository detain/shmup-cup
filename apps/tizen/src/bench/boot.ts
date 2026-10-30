/**
 * The **boot page** body (plan v20x HARBENCH, program session S2, `?page=boot`): what a cold start
 * of the atlas costs on the set — the manifest's `file://` XHR (the W3-7 firmware question,
 * answered by the bench's own fetch), every ×1 atlas page through the shipped bitmap loader route
 * (fetch → `createImageBitmap`, falling back to the `HTMLImageElement` decode exactly as
 * `@shmup/shell`'s loader does), each upload synced with `gl.finish()`, and the wall from the
 * scenario's start to the first drawn frame (the boot ≤ 10 s budget of `shmup_plan §13`, never
 * yet measured on a TV with the real files).
 *
 * **Pure body.** Like every decode-side module (`./decode.ts`) this file drives an injected
 * {@link BootHost} — the real one is the bench rig built in `./run.ts`, the tests hand a fake — so
 * the timing stages, the route choice and the honest degradation hold without a GPU. It never
 * rejects: a stage that cannot run is noted in the record's `error` (or its page's), and a missing
 * API leaves its series `null` instead of a silent zero (the S8 lesson).
 *
 * **Estimate honesty.** `bootMs` is wall time from the manifest fetch to the first synced render
 * of an empty frame — the same span the shell's boot measures from its atlas load to the ready
 * frame, minus the script evaluation before the bench entry (documented in the report; the shell
 * figure is the one to compare against).
 *
 * @module
 */
import type { HarbenchBootPage, HarbenchBootRecord } from '@shmup/shell';
import {
  decodeRepetitionsFromSearch,
  summarizeRuns,
  type BenchDecodePage,
  type DecodeHost,
} from './decode.js';

/** The page's id in `?page=` and its record's `scenario`. */
export const BOOT_PAGE_ID = 'boot';

/** The file the boot page fetches to measure the manifest route (emitted by `bench-atlas.mjs`). */
export const BOOT_MANIFEST_URL = 'assets/atlas/bench-x1.json';

/** Manifest fetches per page load on the TV. */
export const TV_BOOT_MANIFEST_REPETITIONS = 4;

/** Most page rows the record may carry (the wire caps `pages` at 32). */
export const MAX_BOOT_PAGE_ROWS = 32;

/** Longest an `error` string may be (the wire caps it at 512). */
const ERROR_MAX = 512;

/**
 * What the boot page drives: the decode host (`./decode.ts`) plus one render of the bench's empty
 * frame — the first drawn frame the boot figure ends at.
 */
export interface BootHost extends DecodeHost {
  /** Renders one frame and waits for the GPU (the boot's first drawn frame). */
  render(): void;
}

/**
 * The repetitions the query asks for (`?reps=`, capped by {@link MAX_DECODE_REPETITIONS}): the
 * manifest fetches and the per-page stage reps alike.
 *
 * @param search - `location.search`.
 * @returns The repetitions.
 */
export function bootRepetitionsFromSearch(search: string): number {
  return decodeRepetitionsFromSearch(search, TV_BOOT_MANIFEST_REPETITIONS);
}

/**
 * Joins the notes into one error string the wire accepts.
 *
 * @param notes - What went wrong, oldest first.
 * @returns The joined note, truncated, or `null` when there is none.
 */
function errorText(notes: readonly string[]): string | null {
  if (notes.length === 0) return null;
  return notes.join('; ').slice(0, ERROR_MAX);
}

/**
 * The boot scenario: the manifest's XHR, then every page through the loader's route, then one
 * synced render. The stages between them are untimed progress lines (the decode scenario's habit).
 *
 * @param host - The rig (real or fake).
 * @param pages - The ×1 pages to measure, as the decode scenario takes them.
 * @param options - Repetitions and the record's wall clock.
 * @returns The boot row — resolves even when every stage failed (the row carries the why).
 */
export async function measureBoot(
  host: BootHost,
  pages: readonly BenchDecodePage[],
  options: {
    /** Stage repetitions per page (and for the manifest). */
    readonly repetitions: number;
    /** Wall clock for `startedAt` / `endedAt`. */
    readonly wallClock: () => number;
  },
): Promise<HarbenchBootRecord> {
  const startedAt = options.wallClock();
  const bootStart = host.now();
  const notes: string[] = [];
  const repetitions = Math.max(1, options.repetitions);

  const manifestTimes: number[] = [];
  let atlasBytes = 0;
  for (let rep = 0; rep < repetitions; rep++) {
    const t0 = host.now();
    try {
      const bytes = await host.fetch(BOOT_MANIFEST_URL);
      manifestTimes.push(host.now() - t0);
      if (atlasBytes === 0) atlasBytes = bytes.byteLength;
    } catch (error) {
      notes.push(`manifest fetch failed: ${String(error)}`);
      break;
    }
  }
  const manifestFold = summarizeRuns(manifestTimes);
  const manifestMs = manifestFold === null ? [0, 0, 0, 0] : manifestFold;
  if (manifestFold === null) notes.push('manifest never fetched: manifestMs is a placeholder');

  const imageBitmap = host.decodeBitmap !== null;
  const rows: HarbenchBootPage[] = [];
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    const page = pages[pageIndex];
    if (rows.length >= MAX_BOOT_PAGE_ROWS) {
      notes.push(`pages truncated at ${MAX_BOOT_PAGE_ROWS} rows`);
      break;
    }
    const reps = await measureBootPage(host, page, repetitions, notes);
    for (let i = 0; i < reps.length && rows.length < MAX_BOOT_PAGE_ROWS; i++) rows.push(reps[i]);
  }
  if (rows.length === 0) notes.push('no page was measured');

  host.render();
  const bootMs = Math.max(0, host.now() - bootStart);
  let everyRowFailed = rows.length > 0;
  for (let i = 0; i < rows.length; i++) if (rows[i].error === null) everyRowFailed = false;
  if (everyRowFailed) notes.push('every page row failed');

  let bitmapBranch = false;
  for (let i = 0; i < rows.length; i++) if (rows[i].viaBitmap) bitmapBranch = true;

  return {
    record: 'boot',
    scenario: BOOT_PAGE_ID,
    index: 0,
    startedAt,
    endedAt: options.wallClock(),
    manifestMs,
    atlasBytes,
    imageBitmap,
    bitmapBranch,
    pages: rows,
    bootMs,
    error: errorText(notes),
  };
}

/**
 * Measures one page over its repetitions, one row per repetition (the row ids carry `#<rep>`),
 * each stage in its series and every texture released before the next repetition (the decode
 * scenario's rule: caches must not flatter the second run).
 *
 * @param host - The rig.
 * @param page - The page spec.
 * @param repetitions - How many times.
 * @param notes - Where failures are recorded (shared with the scenario).
 * @returns The rows (empty when every repetition failed outright).
 */
async function measureBootPage(
  host: BootHost,
  page: BenchDecodePage,
  repetitions: number,
  notes: string[],
): Promise<HarbenchBootPage[]> {
  const fetchTimes: number[] = [];
  const bitmapTimes: number[] = [];
  const decodeTimes: number[] = [];
  const uploadTimes: number[] = [];
  const syncedTimes: number[] = [];
  const totalTimes: number[] = [];
  const viaBitmap: boolean[] = [];
  let bytes = 0;
  let failures = 0;

  for (let rep = 0; rep < repetitions; rep++) {
    host.progress?.(`boot ${page.id} ${rep + 1}/${repetitions}`);
    const repNotes: string[] = [];
    let repFetch: number | null = null;
    let fetched: ArrayBuffer | null = null;
    try {
      const t0 = host.now();
      fetched = await host.fetch(page.url);
      repFetch = host.now() - t0;
      bytes = fetched.byteLength;
      fetchTimes.push(repFetch);
    } catch (error) {
      repNotes.push(`fetch: ${String(error)}`);
    }
    let routeMs: number | null = null;
    let routeBitmap = false;
    let decoded = null as null | { image: unknown; release(): void };
    if (fetched !== null && host.decodeBitmap !== null) {
      const t1 = host.now();
      try {
        decoded = await host.decodeBitmap(fetched);
        routeMs = host.now() - t1;
        routeBitmap = true;
        bitmapTimes.push(routeMs);
      } catch (error) {
        repNotes.push(`bitmap refused: ${String(error)}`);
      }
    }
    if (decoded === null) {
      try {
        const t2 = host.now();
        decoded =
          fetched !== null ? await host.decodeImage(fetched) : await host.decodeUrl(page.url, rep);
        routeMs = host.now() - t2;
        decodeTimes.push(routeMs);
      } catch (error) {
        repNotes.push(`decode: ${String(error)}`);
      }
    }
    let uploadMs: number | null = null;
    let syncedMs: number | null = null;
    if (decoded !== null) {
      try {
        const t3 = host.now();
        const source = host.createSource(decoded.image, page);
        host.upload(source);
        uploadMs = host.now() - t3;
        uploadTimes.push(uploadMs);
        const t4 = host.now();
        host.finish();
        syncedMs = host.now() - t4;
        syncedTimes.push(syncedMs);
        source.destroy();
      } catch (error) {
        repNotes.push(`upload: ${String(error)}`);
      }
      decoded.release();
    }
    if (uploadMs !== null && syncedMs !== null && routeMs !== null) {
      const total = (repFetch ?? 0) + routeMs + uploadMs + syncedMs;
      totalTimes.push(total);
      viaBitmap.push(routeBitmap);
    } else {
      failures += 1;
    }
    for (let n = 0; n < repNotes.length; n++) notes.push(`${page.id}: ${repNotes[n]}`);
  }

  const rowFailed = fetchTimes.length === 0 && decodeTimes.length === 0 && failures > 0;
  return [
    {
      id: page.id,
      width: page.width,
      height: page.height,
      bytes,
      fetchMs: summarizeRuns(fetchTimes),
      bitmapMs: summarizeRuns(bitmapTimes),
      decodeMs: summarizeRuns(decodeTimes),
      uploadMs: summarizeRuns(uploadTimes),
      syncedMs: summarizeRuns(syncedTimes),
      totalMs: summarizeRuns(totalTimes),
      viaBitmap: viaBitmap.length > 0 ? andAll(viaBitmap) : false,
      error: rowFailed ? `${page.id}: no repetition reached the GPU` : null,
    },
  ];
}

/**
 * Whether every entry is true.
 *
 * @param flags - The flags.
 * @returns All true.
 */
function andAll(flags: readonly boolean[]): boolean {
  for (let i = 0; i < flags.length; i++) if (!flags[i]) return false;
  return true;
}
