/**
 * The TV render bench's **decode scenario** (plan R1-05, subtask B4 — decision W3-6; part of the
 * `bench` module, see `./index.ts`): what an atlas page costs **from file to GPU** on the TV, so
 * R0-03's owner session records the 2048² figure plan R3-04 estimates its zone-load time from.
 *
 * It runs after the render scenarios, as the run's penultimate page load
 * ({@link DECODE_SCENARIO_ID}, {@link BENCH_RUN_LENGTH} — the {@link STANDIN_SCENARIO_ID} load of
 * plan R3-04.M4a follows it), and measures the pages the bench build ships next to its density
 * atlases (`scripts/bench-decode.mjs`, the page model of plan R3-04.M4a): the stand-in zone A's
 * own PNG-8 page (or two, `standin-zone-a-2` right after the first), and the shipped atlas's
 * `common` and zone A pages for reference. Per page and
 * repetition, each stage timed on its own:
 *
 * 1. **fetch** — the file's bytes with `XMLHttpRequest` (`@shmup/audio-web` `loadArrayBuffer`: the
 *    request the game fetches its atlas manifest with — `file://` on the TV, status 0);
 * 2. **decode** — those bytes decoded by an `HTMLImageElement`, the game's decoder: a blob URL as
 *    its `src`, `onload`, then `decode()` where the engine has it (Chromium 64+, guarded like the
 *    shell's loader);
 * 3. **upload** — the image wrapped in a texture source exactly as the game's atlas wraps a page
 *    (`createAtlas`) and uploaded through the renderer's `uploadTextureSource` (the residency's
 *    eager upload, B3a): the CPU time of the call, and the time until `gl.finish()` returns;
 * 4. the alternative path, **`createImageBitmap`** (Chromium 50+; options from 52 — so inside the
 *    engine floor) on the same bytes, then its upload — measured where the engine has it, so R3-04
 *    can tell whether an image upload re-decodes and whether a bitmap loader would be faster.
 *
 * **Nothing is a cache hit:** each repetition decodes from a fresh blob URL (revoked after), wraps
 * the image in a new source and destroys it after the upload (Pixi deletes the GL texture), and
 * closes the bitmap. The first repetition is also reported on its own — the coldest. When the
 * fetch fails (an engine where `file://` XHR is refused), the page is decoded from its URL instead
 * (fetch and decode then share the decode figure, and the page's `error` says so).
 *
 * The stages are orchestrated by {@link measureDecode} against a {@link DecodeHost}; the browser's
 * host is {@link createDecodeHost} — both tested in Node with fakes; the WebGL half runs on the TV
 * and in `pnpm bench` (`test/bench/render.perf.ts`, `?scenario=decode`).
 *
 * @module
 */
import { loadArrayBuffer } from '@shmup/audio-web';
import type { DecodeBenchPage, DecodeBenchRecord } from '@shmup/shell';
import { BENCH_SCENARIOS, searchParam } from './matrix.js';
import { roundTo, summarizeSeries } from './stats.js';

/** The decode scenario's id (`?scenario=decode` runs it headlessly). */
export const DECODE_SCENARIO_ID = 'decode';

/** Its position in a TV run: after every render scenario of the matrix. */
export const DECODE_SCENARIO_INDEX = BENCH_SCENARIOS.length;

/**
 * The stand-in page load's id (plan R3-04.M4a, `?scenario=standin-zone` runs it headlessly): the
 * run's last load, which draws one `FRAME_W × FRAME_H` frame from the decoded stand-in pages.
 */
export const STANDIN_SCENARIO_ID = 'standin-zone';

/** Its position in a TV run: after the decode scenario. */
export const STANDIN_SCENARIO_INDEX = DECODE_SCENARIO_INDEX + 1;

/** Page loads of a whole TV run: the render matrix, the decode scenario, the stand-in load. */
export const BENCH_RUN_LENGTH = BENCH_SCENARIOS.length + 2;

/** Repetitions per page on the TV (about 20 s for the pages on the M7, by estimate). */
export const TV_DECODE_REPETITIONS = 8;

/** Repetitions per page headlessly (SwiftShader — counts and shapes only). */
export const HEADLESS_DECODE_REPETITIONS = 2;

/** Most repetitions `?reps=` may ask for. */
export const MAX_DECODE_REPETITIONS = 50;

/** Longest a fetch or a decode may take before it counts as failed, ms. */
export const DECODE_STAGE_TIMEOUT_MS = 30_000;

/** One page the decode scenario measures, as the bench build ships it (`virtual:shmup-render-bench`). */
export interface BenchDecodePage {
  /**
   * `standin-zone-a` (with `standin-zone-a-2` right after it when the stand-in group packs onto
   * two pages), `common` or `zone-a`; a stored run from before plan R3-04.M4a also holds
   * `rgba-2048` and `png8-2048`.
   */
  readonly id: string;
  /** What it stands for. */
  readonly what: string;
  /** Width in pixels. */
  readonly width: number;
  /** Height in pixels. */
  readonly height: number;
  /** URL relative to the page. */
  readonly url: string;
}

/** A decoded page and how to let go of it. */
export interface DecodedPage {
  /** The decoded image (`HTMLImageElement` or `ImageBitmap`). */
  readonly image: unknown;
  /** Releases it (revokes its blob URL, closes the bitmap). */
  release(): void;
}

/** A texture source the scenario uploads (Pixi's `TextureSource`). */
export interface DecodeTexture {
  /** Destroys it — and with it the GL texture. */
  destroy(): void;
}

/** What {@link measureDecode} drives (the browser's: {@link createDecodeHost}). */
export interface DecodeHost {
  /**
   * The clock.
   *
   * @returns Milliseconds.
   */
  now(): number;
  /**
   * Fetches a file's bytes.
   *
   * @param url - Relative URL.
   * @returns The bytes.
   */
  fetch(url: string): Promise<ArrayBuffer>;
  /**
   * Decodes PNG bytes with an `HTMLImageElement`.
   *
   * @param bytes - The file.
   * @returns The decoded page.
   */
  decodeImage(bytes: ArrayBuffer): Promise<DecodedPage>;
  /**
   * Decodes a page straight from its URL with an `HTMLImageElement` (the fallback when the fetch
   * fails).
   *
   * @param url - Relative URL.
   * @param repetition - The repetition (keeps the URLs of repetitions apart, past the image cache).
   * @returns The decoded page.
   */
  decodeUrl(url: string, repetition: number): Promise<DecodedPage>;
  /**
   * Decodes PNG bytes with `createImageBitmap`, or `null` where the engine has none.
   *
   * @param bytes - The file.
   * @returns The decoded page.
   */
  readonly decodeBitmap: ((bytes: ArrayBuffer) => Promise<DecodedPage>) | null;
  /**
   * Wraps a decoded image in a texture source as the game's atlas does.
   *
   * @param image - The decoded image.
   * @param page - The page (its size must match the image's).
   * @returns The source, not uploaded yet.
   * @throws {RangeError} When the image's size differs from the page's.
   */
  createSource(image: unknown, page: BenchDecodePage): DecodeTexture;
  /**
   * Uploads a source to the GPU now (the renderer's `uploadTextureSource`).
   *
   * @param source - The source.
   */
  upload(source: DecodeTexture): void;
  /** Blocks until the GPU has finished (`gl.finish()`). */
  finish(): void;
  /**
   * Shows progress (untimed — between measurements).
   *
   * @param text - What is being measured.
   */
  progress?(text: string): void;
}

/** The scenario's settings and the engine facts its record carries. */
export interface DecodeMeasureOptions {
  /** Repetitions per page. */
  readonly repetitions: number;
  /** The WebGL version the renderer got. */
  readonly webGLVersion: number;
  /** Whether the engine has `HTMLImageElement.decode()`. */
  readonly imageDecode: boolean;
  /**
   * Wall clock for the record's `endedAt`.
   *
   * @returns Milliseconds since the epoch.
   */
  readonly wallClock: () => number;
}

/**
 * The repetitions a query string asks for: `?reps=<n>` (1 … {@link MAX_DECODE_REPETITIONS}).
 *
 * @param search - `location.search`.
 * @param fallback - Default.
 * @returns The repetitions.
 */
export function decodeRepetitionsFromSearch(search: string, fallback: number): number {
  const raw = searchParam(search, 'reps');
  if (raw === null || !/^\d+$/.test(raw)) return fallback;
  const value = Number(raw);
  return value >= 1 && value <= MAX_DECODE_REPETITIONS ? value : fallback;
}

/**
 * A PNG's encoding, read from its `IHDR`: `'rgba'` (colour type 6), `'png8'` (3), else
 * `'type <n>'`, or `'unknown'` for bytes that are not a PNG.
 *
 * @param bytes - The file (its first 26 bytes are enough).
 * @returns The encoding.
 */
export function pngEncodingOf(bytes: Uint8Array): string {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 26) return 'unknown';
  for (let i = 0; i < signature.length; i++) if (bytes[i] !== signature[i]) return 'unknown';
  const type = bytes[25];
  return type === 6 ? 'rgba' : type === 3 ? 'png8' : `type ${type}`;
}

/**
 * `[min, p50, p95, max]` of a stage's repetitions (the bench's nearest-rank rule, 3 decimals).
 *
 * @param values - One figure per measured repetition.
 * @returns The tuple, or `null` when nothing was measured.
 */
export function summarizeRuns(values: readonly number[]): number[] | null {
  if (values.length === 0) return null;
  return summarizeSeries(Float64Array.from(values), values.length);
}

/** One page's figures while the scenario runs (one entry per measured repetition). */
interface PageRuns {
  /** The page. */
  readonly page: BenchDecodePage;
  /** The fetched file's bytes. */
  bytes: number;
  /** Its encoding ({@link pngEncodingOf}). */
  encoding: string;
  /** Fetch ms. */
  readonly fetch: number[];
  /** Image decode ms. */
  readonly decode: number[];
  /** Upload CPU ms. */
  readonly upload: number[];
  /** Upload + `gl.finish()` ms. */
  readonly synced: number[];
  /** Fetch + decode + synced upload ms. */
  readonly total: number[];
  /** `createImageBitmap` ms. */
  readonly bitmap: number[];
  /** Bitmap upload + `gl.finish()` ms. */
  readonly bitmapUpload: number[];
  /** Distinct stage failures. */
  readonly errors: string[];
}

/**
 * Measures the pages (see the module docs): repetitions outer, pages inner, each stage timed on
 * its own and every decoded image, texture and bitmap released before the next.
 *
 * @remarks
 * A stage that fails (a fetch refused, a decode that errors, a size mismatch) is noted in its
 * page's `error` and the repetition goes on to the next page; it never rejects. Cold path — one
 * page load, between nothing else.
 *
 * @param host - The browser (or a fake).
 * @param pages - The pages, in the order to measure.
 * @param options - Repetitions and the engine facts.
 * @returns The record (`scenario: 'decode'`, {@link DECODE_SCENARIO_INDEX}).
 *
 * @example
 * ```ts
 * const record = await measureDecode(createDecodeHost({ win, upload, finish, createSource }),
 *   bench.decode, { repetitions: 8, webGLVersion: 1, imageDecode: true, wallClock: Date.now });
 * record.pages[0].decodeMs; // → [min, p50, p95, max]
 * ```
 */
export async function measureDecode(
  host: DecodeHost,
  pages: readonly BenchDecodePage[],
  options: DecodeMeasureOptions,
): Promise<DecodeBenchRecord> {
  const runs: PageRuns[] = pages.map((page) => ({
    page,
    bytes: 0,
    encoding: 'unknown',
    fetch: [],
    decode: [],
    upload: [],
    synced: [],
    total: [],
    bitmap: [],
    bitmapUpload: [],
    errors: [],
  }));
  /**
   * Notes a stage's failure once per page and message.
   *
   * @param run - The page's figures.
   * @param stage - The stage.
   * @param error - What went wrong.
   */
  const fail = (run: PageRuns, stage: string, error: unknown): void => {
    const message = `${stage}: ${error instanceof Error ? error.message : String(error)}`;
    if (run.errors.indexOf(message) < 0) run.errors.push(message);
  };
  for (let rep = 0; rep < options.repetitions; rep++) {
    for (const run of runs) {
      const page = run.page;
      host.progress?.(`${page.id} ${rep + 1}/${options.repetitions}`);
      // 1. Fetch.
      let bytes: ArrayBuffer | null = null;
      let fetchMs = 0;
      const t0 = host.now();
      try {
        bytes = await host.fetch(page.url);
        fetchMs = host.now() - t0;
        run.fetch.push(fetchMs);
        run.bytes = bytes.byteLength;
        run.encoding = pngEncodingOf(new Uint8Array(bytes, 0, Math.min(26, bytes.byteLength)));
      } catch (error) {
        fail(run, 'fetch', error);
      }
      // 2. Decode (from the bytes, or from the URL when the fetch failed).
      let decoded: DecodedPage | null = null;
      let decodeMs = 0;
      const t1 = host.now();
      try {
        decoded =
          bytes !== null ? await host.decodeImage(bytes) : await host.decodeUrl(page.url, rep);
        decodeMs = host.now() - t1;
        run.decode.push(decodeMs);
        if (bytes === null) fail(run, 'fetch', 'decoded from the URL instead (fetch + decode)');
      } catch (error) {
        fail(run, 'decode', error);
      }
      // 3. Upload, then wait for the GPU.
      if (decoded !== null) {
        try {
          const source = host.createSource(decoded.image, page);
          try {
            host.finish();
            const t2 = host.now();
            host.upload(source);
            const t3 = host.now();
            host.finish();
            const t4 = host.now();
            run.upload.push(t3 - t2);
            run.synced.push(t4 - t2);
            if (bytes !== null) run.total.push(fetchMs + decodeMs + (t4 - t2));
          } finally {
            source.destroy();
          }
        } catch (error) {
          fail(run, 'upload', error);
        } finally {
          decoded.release();
        }
      }
      // 4. The alternative: createImageBitmap, then its upload.
      if (bytes !== null && host.decodeBitmap !== null) {
        let bitmap: DecodedPage | null = null;
        try {
          const t5 = host.now();
          bitmap = await host.decodeBitmap(bytes);
          run.bitmap.push(host.now() - t5);
          const source = host.createSource(bitmap.image, page);
          try {
            host.finish();
            const t6 = host.now();
            host.upload(source);
            host.finish();
            run.bitmapUpload.push(host.now() - t6);
          } finally {
            source.destroy();
          }
        } catch (error) {
          fail(run, 'bitmap', error);
        } finally {
          bitmap?.release();
        }
      }
    }
  }
  const out: DecodeBenchPage[] = runs.map((run) => ({
    id: run.page.id,
    what: run.page.what,
    width: run.page.width,
    height: run.page.height,
    encoding: run.encoding,
    bytes: run.bytes,
    textureBytes: run.page.width * run.page.height * 4,
    repetitions: Math.max(run.decode.length, run.fetch.length),
    fetchMs: summarizeRuns(run.fetch),
    decodeMs: summarizeRuns(run.decode),
    uploadMs: summarizeRuns(run.upload),
    uploadSyncedMs: summarizeRuns(run.synced),
    totalMs: summarizeRuns(run.total),
    firstTotalMs: run.total.length > 0 ? roundTo(run.total[0], 3) : 0,
    bitmapMs: summarizeRuns(run.bitmap),
    bitmapUploadMs: summarizeRuns(run.bitmapUpload),
    error: run.errors.length === 0 ? null : run.errors.join('; '),
  }));
  return {
    scenario: DECODE_SCENARIO_ID,
    index: DECODE_SCENARIO_INDEX,
    webGLVersion: options.webGLVersion,
    repetitions: options.repetitions,
    imageDecode: options.imageDecode,
    imageBitmap: host.decodeBitmap !== null,
    pages: out,
    error: null,
    endedAt: options.wallClock(),
  };
}

/**
 * The record of a decode scenario that could not run at all (no renderer, no pages).
 *
 * @param error - Why.
 * @param options - The engine facts.
 * @returns A record with no pages and the error.
 */
export function failedDecodeRecord(
  error: string,
  options: DecodeMeasureOptions,
): DecodeBenchRecord {
  return {
    scenario: DECODE_SCENARIO_ID,
    index: DECODE_SCENARIO_INDEX,
    webGLVersion: options.webGLVersion,
    repetitions: options.repetitions,
    imageDecode: options.imageDecode,
    imageBitmap: false,
    pages: [],
    error,
    endedAt: options.wallClock(),
  };
}

/** The window's parts {@link createDecodeHost} uses (a fake in the tests). */
export interface DecodeWindow {
  /** `XMLHttpRequest`. */
  readonly XMLHttpRequest: new () => XMLHttpRequest;
  /** `Image`. */
  readonly Image: new () => HTMLImageElement;
  /** `Blob`. */
  readonly Blob: typeof Blob;
  /** `URL` (`createObjectURL` / `revokeObjectURL`). */
  readonly URL: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'>;
  /** `createImageBitmap`, absent on old engines. */
  readonly createImageBitmap?: (blob: Blob) => Promise<ImageBitmap>;
  /** `performance.now()`. */
  readonly performance: { now(): number };
  /** `setTimeout`. */
  setTimeout(handler: () => void, ms: number): unknown;
  /** `clearTimeout`. */
  clearTimeout(id: unknown): void;
}

/** What {@link createDecodeHost} needs besides the window. */
export interface DecodeHostOptions {
  /** The window. */
  readonly win: DecodeWindow;
  /** Wraps a decoded image in a texture source ({@link DecodeHost.createSource}). */
  readonly createSource: DecodeHost['createSource'];
  /** Uploads a source now ({@link DecodeHost.upload}). */
  readonly upload: DecodeHost['upload'];
  /** `gl.finish()`. */
  readonly finish: DecodeHost['finish'];
  /** Progress display. */
  readonly progress?: DecodeHost['progress'];
  /** Stage timeout in ms (default {@link DECODE_STAGE_TIMEOUT_MS}). */
  readonly timeoutMs?: number;
}

/**
 * The browser's {@link DecodeHost}: `XMLHttpRequest` through `@shmup/audio-web`'s
 * `loadArrayBuffer`, an `Image` on a blob URL with `onload` and a guarded `decode()`,
 * `createImageBitmap` where the window has it, and a timeout on every fetch and decode so a stuck
 * stage fails instead of hanging the run.
 *
 * @param options - The window and the renderer's side.
 * @returns The host.
 */
export function createDecodeHost(options: DecodeHostOptions): DecodeHost {
  const { win } = options;
  const timeoutMs = options.timeoutMs ?? DECODE_STAGE_TIMEOUT_MS;
  /**
   * A promise that rejects after the stage timeout.
   *
   * @param promise - The stage.
   * @param what - Its name, for the message.
   * @returns The stage's result, or a rejection after `timeoutMs`.
   */
  const timed = <T>(promise: Promise<T>, what: string): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const timer = win.setTimeout(() => {
        reject(new Error(`${what} timed out after ${timeoutMs} ms`));
      }, timeoutMs);
      promise.then(
        (value) => {
          win.clearTimeout(timer);
          resolve(value);
        },
        (error: unknown) => {
          win.clearTimeout(timer);
          reject(error instanceof Error ? error : new Error(String(error)));
        },
      );
    });
  /**
   * Loads an image from a URL: `onload`, then `decode()` where it exists (a rejected `decode()`
   * still counts — the image loaded).
   *
   * @param src - The URL.
   * @param release - Runs when the page is released.
   * @returns The decoded page.
   */
  const loadImage = (src: string, release: () => void): Promise<DecodedPage> =>
    timed(
      new Promise<DecodedPage>((resolve, reject) => {
        const image = new win.Image();
        /** The page, once ready. */
        const ready = (): void => {
          resolve({ image, release });
        };
        image.onload = (): void => {
          image.onload = null;
          image.onerror = null;
          if (typeof image.decode === 'function') image.decode().then(ready, ready);
          else ready();
        };
        image.onerror = (): void => {
          image.onload = null;
          image.onerror = null;
          release();
          reject(new Error('the image did not decode'));
        };
        image.src = src;
      }),
      'decode',
    );
  /**
   * PNG bytes as a blob.
   *
   * @param bytes - The file.
   * @returns The blob.
   */
  const blobOf = (bytes: ArrayBuffer): Blob => new win.Blob([bytes], { type: 'image/png' });
  const createBitmap = win.createImageBitmap;
  return {
    now: () => win.performance.now(),
    fetch: (url) =>
      timed(
        loadArrayBuffer(url, () => new win.XMLHttpRequest()),
        'fetch',
      ),
    decodeImage: (bytes) => {
      const url = win.URL.createObjectURL(blobOf(bytes));
      return loadImage(url, () => {
        win.URL.revokeObjectURL(url);
      });
    },
    decodeUrl: (url, repetition) =>
      loadImage(repetition === 0 ? url : `${url}?rep=${repetition}`, () => {}),
    decodeBitmap:
      typeof createBitmap === 'function'
        ? (bytes) =>
            timed(
              createBitmap.call(win, blobOf(bytes)).then((bitmap) => ({
                image: bitmap,
                release: () => {
                  bitmap.close();
                },
              })),
              'createImageBitmap',
            )
        : null,
    createSource: options.createSource,
    upload: options.upload,
    finish: options.finish,
    progress: options.progress,
  };
}
