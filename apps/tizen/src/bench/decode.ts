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
 *    can tell whether an image upload re-decodes and whether a bitmap loader would be faster. The
 *    stage is **skipped for an SVG page** ({@link SVG_DECODE_ENCODING}, plan R-SVG WO-1): the spec
 *    rejects a bitmap source that is an SVG image and Chromium honours that rejection on every
 *    engine measured (Chromium 69 up to 156), so calling it would only record a `DOMException`.
 *
 * **Nothing is a cache hit:** each repetition decodes from a fresh blob URL (revoked after), wraps
 * the image in a new source and destroys it after the upload (Pixi deletes the GL texture), and
 * closes the bitmap. The first repetition is also reported on its own — the coldest. When the
 * fetch fails (an engine where `file://` XHR is refused), the page is decoded from its URL instead
 * (fetch and decode then share the decode figure, and the page's `error` says so).
 *
 * **The SVG arm's rows** (plan R-SVG WO-2). An armed build's `decode` array carries three E3 pages
 * after its PNG ones (the ×1 and ×2.67 density pages and the stand-in page, emitted beside their PNGs
 * by `scripts/bench-atlas.mjs`) — those are ordinary pages: the same four stages, the file names
 * ending `.svg`, the encoding tag {@link SVG_DECODE_ENCODING} and stage 4 skipped as described. Two
 * further rows measure routes the stages cannot express — {@link measureSvgDecode} over
 * {@link BenchSvgProbeSpec}s: whether `createImageBitmap` takes SVG at all (it refuses on the TV
 * engines, which is why the loader uses an `HTMLImageElement`), and the page decoded from its URL and
 * uploaded, the shape of a real atlas load with no fetched bytes to time. A PNG build ships none of
 * these, so its decode record is exactly what it was: same ids, same order, same columns.
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
 * The stand-in page load's id (plan R3-04.M4a, `?scenario=standin-zone` runs it headlessly): the load
 * after the decode scenario, drawing one `FRAME_W × FRAME_H` frame from the decoded stand-in pages.
 */
export const STANDIN_SCENARIO_ID = 'standin-zone';

/** Its position in a TV run: after the decode scenario. */
export const STANDIN_SCENARIO_INDEX = DECODE_SCENARIO_INDEX + 1;

/**
 * The **SVG arm's** stand-in page load (plan R-SVG WO-2, `?scenario=standin-zone-svg` runs it
 * headlessly): the same zone-A frame as {@link STANDIN_SCENARIO_ID} but drawn from the stand-in
 * pages' E3 files, so the arm's zone load is measured beside the PNG one — which is why its slot sits
 * right after it, before the page both arms finish with.
 */
export const STANDIN_SVG_SCENARIO_ID = 'standin-zone-svg';

/** Its position in a TV run: the slot after the PNG stand-in load. */
export const STANDIN_SVG_SCENARIO_INDEX = STANDIN_SCENARIO_INDEX + 1;

/**
 * Page loads of a whole TV run: the render matrix, the decode scenario, the two stand-in loads (the
 * arm's only measured on an armed build) and the rewind scenario (its own index lives in
 * `./rewind.js`, which closes the run).
 *
 * @remarks
 * The arm's slot is part of **both** arms' run length: a PNG build has no SVG pages to draw, so the
 * run passes over it as a planned skip (`./run.ts` `plannedSkip` — the same mechanism an output build
 * uses for a frame taller than its backbuffer). One length for both arms is what lets the ledger, the
 * state and the results page keep a single row identity (see `./ledger.ts`), and putting the reserved
 * slot *before* the rewind page keeps **Red** at the end of a run a row every arm really measured.
 */
export const BENCH_RUN_LENGTH = BENCH_SCENARIOS.length + 4;

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
   * `rgba-2048` and `png8-2048`. The **SVG arm's** build appends the E3 rows `svg-x1-e3`,
   * `svg-x2.67-e3` and `svg-standin-e3` after these (plan R-SVG WO-2), which the same four stages
   * measure and {@link pageEncodingOf} tags {@link SVG_DECODE_ENCODING}.
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
  /**
   * Opens one video clip on the R7-VID surface path (a `video` element whose load starts and which
   * settles at `loadeddata`), for {@link measureVideoDecode}. Absent on hosts that do not carry the
   * surface (older builds, test fakes).
   *
   * @param url - Relative URL of the clip.
   * @param repetition - The repetition (keeps the URLs of repetitions apart, past the media cache).
   * @returns The loaded surface (released by the scenario).
   */
  readonly openVideo?: ((url: string, repetition: number) => Promise<DecodedPage>) | null;
  /**
   * Pulls the current frame of a loaded surface with `createImageBitmap` — the per-frame pull the
   * cutscene scene pays on a rendered frame. Absent where the engine cannot pull.
   *
   * @param image - The surface element.
   * @returns The bitmap (closed by the scenario).
   */
  readonly pullBitmap?: ((image: unknown) => Promise<ImageBitmap>) | null;
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
 * The encoding tag of a page fetched as E3 SVG text (the SVG arm's atlas pages, plan R-SVG WO-1 —
 * `apps/tizen/scripts/bench-svg.mjs`, whose `SVG_MIME_TYPE` this file's {@link SVG_DECODE_MIME}
 * mirrors: the two are pinned to each other by `test/bench/decode.test.ts`).
 */
export const SVG_DECODE_ENCODING = 'svg-e3';

/** The MIME type an SVG page is a blob of — the `image/png` blob's sibling. */
export const SVG_DECODE_MIME = 'image/svg+xml';

/**
 * Whether fetched bytes are an SVG file (the arm's pages are emitted as `<svg …`, so the tag is at
 * offset 0; the emitter writes nothing before it).
 *
 * @param bytes - The file (its first bytes are enough).
 * @returns true for SVG text, false for a PNG (or anything else).
 */
export function isSvgBytes(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x3c &&
    bytes[1] === 0x73 &&
    bytes[2] === 0x76 &&
    bytes[3] === 0x67
  );
}

/**
 * A fetched page's encoding: {@link SVG_DECODE_ENCODING} for an SVG file, else {@link pngEncodingOf}
 * (the PNG IHDR read, unchanged for every page that was ever measured here).
 *
 * @param bytes - The file (its first 26 bytes are enough).
 * @returns The encoding.
 */
export function pageEncodingOf(bytes: Uint8Array): string {
  return isSvgBytes(bytes) ? SVG_DECODE_ENCODING : pngEncodingOf(bytes);
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
        run.encoding = pageEncodingOf(new Uint8Array(bytes, 0, Math.min(26, bytes.byteLength)));
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
      // 4. The alternative: createImageBitmap, then its upload. An SVG page is skipped: Chromium
      // rejects a bitmap source whose image is an SVG (the spec's own rule, measured on 69 and 156),
      // so the stage would report nothing but its own rejection. `bitmapMs` stays null, exactly as
      // on an engine without the API, and the row's `encoding` says which file it measured.
      if (bytes !== null && host.decodeBitmap !== null && run.encoding !== SVG_DECODE_ENCODING) {
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

/**
 * One clip of the decode scenario's video rows (plan v20x HARBENCH S8): a shipped MP4 measured
 * through the R7-VID cutscene surface path — the file-to-GPU story behind the render matrix's
 * `video` knob, which only ever sees the per-frame pull inside a warm frame.
 */
export interface BenchVideoSpec {
  /** Clip id (the file's name without the extension). */
  readonly id: string;
  /** What the clip is. */
  readonly what: string;
  /** Width in pixels (the encoder's frame). */
  readonly width: number;
  /** Height in pixels. */
  readonly height: number;
  /** Relative URL of the MP4. */
  readonly url: string;
}

/** The encoding tag the video rows carry (the H.264 baseline the video-encode lane ships). */
export const VIDEO_DECODE_ENCODING = 'avc1';

/**
 * The video rows' honest mapping onto the frozen {@link DecodeBenchPage} columns (the `rb-` schema
 * does not move): `fetchMs` is the surface's own load (`src` → `loadeddata`), `bitmapMs` the
 * per-frame `createImageBitmap(video)` pull, `bitmapUploadMs` that bitmap uploaded and
 * `gl.finish()`ed, `totalMs` the sum of the three per repetition. The image-path columns
 * (`decodeMs`, `uploadMs`, `uploadSyncedMs`) are `null`; `encoding` reads {@link
 * VIDEO_DECODE_ENCODING}. The analyzer lane pairs video rows on that tag.
 */
interface VideoRuns {
  /** The clip. */
  readonly spec: BenchVideoSpec;
  /** The file's bytes (one XHR of the first repetition; the surface fetches its own copy). */
  bytes: number;
  /** `src` to `loadeddata` ms. */
  readonly load: number[];
  /** `createImageBitmap(video)` ms. */
  readonly pull: number[];
  /** Pulled-bitmap upload + `gl.finish()` ms. */
  readonly upload: number[];
  /** Load + pull + synced upload ms. */
  readonly total: number[];
  /** Distinct stage failures. */
  readonly errors: string[];
}

/**
 * The row one clip's figures fold into (see {@link VideoRuns} for the column story).
 *
 * @param run - The clip's figures.
 * @param base - A scenario-level error to note, or `null`.
 * @returns The row.
 */
function videoRow(run: VideoRuns, base: string | null): DecodeBenchPage {
  const errors = base === null ? run.errors.slice() : [base, ...run.errors];
  return {
    id: `video-${run.spec.id}`,
    what: run.spec.what,
    width: run.spec.width,
    height: run.spec.height,
    encoding: VIDEO_DECODE_ENCODING,
    bytes: run.bytes,
    textureBytes: run.spec.width * run.spec.height * 4,
    repetitions: run.load.length,
    fetchMs: summarizeRuns(run.load),
    decodeMs: null,
    uploadMs: null,
    uploadSyncedMs: null,
    totalMs: summarizeRuns(run.total),
    firstTotalMs: run.total.length > 0 ? roundTo(run.total[0], 3) : 0,
    bitmapMs: summarizeRuns(run.pull),
    bitmapUploadMs: summarizeRuns(run.upload),
    error: errors.length === 0 ? null : errors.join('; '),
  };
}

/**
 * Measures the clips through the video surface (see {@link VideoRuns}): repetitions outer, clips
 * inner, the surface opened fresh every repetition (`?rep=` past the media cache, like the image
 * pages' URL trick), and every bitmap and surface released before the next repetition. A stage
 * that fails is noted in the clip's row and the repetition moves on; it never rejects. Cold path.
 *
 * @param host - The browser (or a fake) — without {@link DecodeHost.openVideo} or
 * {@link DecodeHost.pullBitmap} every row comes back noting the missing surface.
 * @param specs - The clips, in the order to measure.
 * @param options - Repetitions and the engine facts (the video facts ride the rows, not a record).
 * @returns The rows, appended after the image pages' by the caller.
 *
 * @example
 * ```ts
 * const rows = await measureVideoDecode(host, assets.videos, facts);
 * rows[0].bitmapMs; // → [min, p50, p95, max] of the per-frame pull
 * ```
 */
export async function measureVideoDecode(
  host: DecodeHost,
  specs: readonly BenchVideoSpec[],
  options: DecodeMeasureOptions,
): Promise<DecodeBenchPage[]> {
  const runs: VideoRuns[] = specs.map((spec) => ({
    spec,
    bytes: 0,
    load: [],
    pull: [],
    upload: [],
    total: [],
    errors: [],
  }));
  /**
   * Notes a stage's failure once per clip and message.
   *
   * @param run - The clip's figures.
   * @param stage - The stage.
   * @param error - What went wrong.
   */
  const fail = (run: VideoRuns, stage: string, error: unknown): void => {
    const message = `${stage}: ${error instanceof Error ? error.message : String(error)}`;
    if (run.errors.indexOf(message) < 0) run.errors.push(message);
  };
  const open = host.openVideo === undefined ? null : host.openVideo;
  const pullOf = host.pullBitmap === undefined ? null : host.pullBitmap;
  if (open === null || pullOf === null || specs.length === 0) {
    return runs.map((run) => videoRow(run, 'video surface unavailable'));
  }
  for (let rep = 0; rep < options.repetitions; rep++) {
    for (const run of runs) {
      host.progress?.(`video ${run.spec.id} ${rep + 1}/${options.repetitions}`);
      // 1. The bytes of the file (once — the surface fetches its own copy).
      if (rep === 0) {
        try {
          run.bytes = (await host.fetch(run.spec.url)).byteLength;
        } catch (error) {
          fail(run, 'bytes', error);
        }
      }
      // 2. Open the surface: `src` to `loadeddata`.
      let surface: DecodedPage | null = null;
      let loadMs = 0;
      const t0 = host.now();
      try {
        surface = await open(run.spec.url, rep);
        loadMs = host.now() - t0;
        run.load.push(loadMs);
      } catch (error) {
        fail(run, 'video', error);
      }
      if (surface === null) continue;
      try {
        // 3. Pull a frame, upload it, wait for the GPU.
        let bitmap: ImageBitmap | null = null;
        try {
          const t1 = host.now();
          bitmap = await pullOf(surface.image);
          const pullMs = host.now() - t1;
          const source = host.createSource(bitmap, run.spec);
          try {
            host.finish();
            const t2 = host.now();
            host.upload(source);
            host.finish();
            const uplMs = host.now() - t2;
            run.pull.push(pullMs);
            run.upload.push(uplMs);
            run.total.push(loadMs + pullMs + uplMs);
          } finally {
            source.destroy();
          }
        } catch (error) {
          fail(run, 'bitmap', error);
        } finally {
          if (bitmap !== null) bitmap.close();
        }
      } finally {
        surface.release();
      }
    }
  }
  return runs.map((run) => videoRow(run, null));
}

/**
 * Which consumption route an {@link BenchSvgProbeSpec} measures (plan R-SVG WO-2 §C.5). The four
 * decode stages cannot express either: one is about a route that does **not** exist on the TV
 * engines, the other about a page whose bytes were never fetched.
 */
export type BenchSvgProbe = 'bitmap-reject' | 'url-upload';

/**
 * One probe row of the SVG arm's decode scenario: an E3 page measured through a route the ordinary
 * pages do not take. `bitmap-reject` asks whether `createImageBitmap` accepts SVG bytes at all (it
 * does not on Chromium 68/69 — the row records the rejection *and* its cost, which is why the game's
 * atlas loader goes through an `HTMLImageElement`); `url-upload` decodes the page straight from its
 * URL, the shape of a real atlas page load, where the fetched-bytes route has nothing to time.
 */
export interface BenchSvgProbeSpec {
  /** Row id (`svg-bitmap-reject`, `svg-teximage-from-img`). */
  readonly id: string;
  /** The route to take. */
  readonly probe: BenchSvgProbe;
  /** What the row stands for. */
  readonly what: string;
  /** Width in pixels (the page's raster size, which the upload must match). */
  readonly width: number;
  /** Height in pixels. */
  readonly height: number;
  /** Relative URL of the E3 file. */
  readonly url: string;
}

/**
 * The probe rows' honest mapping onto the frozen {@link DecodeBenchPage} columns (the `rb-` schema
 * does not move, and neither does the shell's hashed type): both kinds take `bytes` from one XHR of
 * the first repetition. `bitmap-reject` then times the `createImageBitmap` attempt into `bitmapMs`
 * and, where the engine accepted the SVG, its upload into `bitmapUploadMs`; a rejection is the row's
 * `error`, which is the expected result on a TV. `url-upload` times the `<img src>` load into
 * `decodeMs`, the `texImage2D` CPU into `uploadMs` and that plus `gl.finish()` into
 * `uploadSyncedMs`, with `totalMs` over the two; its image-path columns stand and the bitmap ones are
 * `null`. Every row's `encoding` reads {@link SVG_DECODE_ENCODING}.
 */
interface SvgProbeRuns {
  /** The spec. */
  readonly spec: BenchSvgProbeSpec;
  /** The file's bytes (one XHR, whatever route the row then takes). */
  bytes: number;
  /** That XHR's ms (also the row's `fetchMs`). */
  readonly fetch: number[];
  /** `<img src=url>` decode ms, URL route only. */
  readonly decode: number[];
  /** `uploadTextureSource` CPU ms, URL route only. */
  readonly upload: number[];
  /** The same upload plus `gl.finish()`, URL route only. */
  readonly uploadSynced: number[];
  /** `createImageBitmap` attempt ms, bitmap route only (a rejected attempt included). */
  readonly bitmap: number[];
  /** A resolved bitmap's upload plus `gl.finish()`, bitmap route only. */
  readonly bitmapUpload: number[];
  /** Decode plus synced upload ms, URL route only. */
  readonly total: number[];
  /** Distinct stage notes (a rejection is a note, not a failure of the scenario). */
  readonly errors: string[];
}

/**
 * The row one probe's figures fold into (see {@link SvgProbeRuns} for the column story).
 *
 * @param run - The probe's figures.
 * @param base - A scenario-level note to prepend, or `null`.
 * @returns The row.
 */
function svgProbeRow(run: SvgProbeRuns, base: string | null): DecodeBenchPage {
  const errors = base === null ? run.errors.slice() : [base, ...run.errors];
  const bitmapRoute = run.spec.probe === 'bitmap-reject';
  return {
    id: run.spec.id,
    what: run.spec.what,
    width: run.spec.width,
    height: run.spec.height,
    encoding: SVG_DECODE_ENCODING,
    bytes: run.bytes,
    textureBytes: run.spec.width * run.spec.height * 4,
    repetitions: (bitmapRoute ? run.bitmap : run.decode).length,
    fetchMs: summarizeRuns(run.fetch),
    decodeMs: bitmapRoute ? null : summarizeRuns(run.decode),
    uploadMs: bitmapRoute ? null : summarizeRuns(run.upload),
    uploadSyncedMs: bitmapRoute ? null : summarizeRuns(run.uploadSynced),
    totalMs: bitmapRoute ? null : summarizeRuns(run.total),
    firstTotalMs: !bitmapRoute && run.total.length > 0 ? roundTo(run.total[0], 3) : 0,
    bitmapMs: bitmapRoute ? summarizeRuns(run.bitmap) : null,
    bitmapUploadMs: bitmapRoute ? summarizeRuns(run.bitmapUpload) : null,
    error: errors.length === 0 ? null : errors.join('; '),
  };
}

/**
 * Measures the SVG arm's probe rows (see {@link SvgProbeRuns}): repetitions outer, probes inner, the
 * page re-fetched and re-decoded every repetition so nothing is served from a cache the previous
 * repetition filled. A stage that fails is noted in the row and the repetition moves on — for the
 * rejection probe a failure *is* the measurement — so this never rejects. Cold path.
 *
 * @param host - The browser (or a fake).
 * @param specs - The probes, in the order to measure.
 * @param options - Repetitions and the engine facts (the probe facts ride the rows, not a record).
 * @returns The rows, appended after the video rows' by the caller.
 * @throws {RangeError} For a probe name neither route knows — a build whose tables drifted apart.
 *
 * @example
 * ```ts
 * const rows = await measureSvgDecode(host, assets.svgProbes, facts);
 * rows[0].error; // → 'bitmap: …' where the engine refuses SVG bitmaps (the TV's answer)
 * ```
 */
export async function measureSvgDecode(
  host: DecodeHost,
  specs: readonly BenchSvgProbeSpec[],
  options: DecodeMeasureOptions,
): Promise<DecodeBenchPage[]> {
  const runs: SvgProbeRuns[] = specs.map((spec) => {
    // The route read as text first: a stored spec is the build's, not the compiler's, so an unknown
    // one still fails loud here rather than silently measuring nothing.
    const route: string = spec.probe;
    if (route !== 'bitmap-reject' && route !== 'url-upload') {
      throw new RangeError(`bench svg probe: "${route}" is not a route (${spec.id})`);
    }
    return {
      spec,
      bytes: 0,
      fetch: [],
      decode: [],
      upload: [],
      uploadSynced: [],
      bitmap: [],
      bitmapUpload: [],
      total: [],
      errors: [],
    };
  });
  /**
   * Notes a stage once per row and message (see `measureVideoDecode`'s identical helper).
   *
   * @param run - The row's figures.
   * @param stage - The stage.
   * @param error - What went wrong.
   */
  const fail = (run: SvgProbeRuns, stage: string, error: unknown): void => {
    const message = `${stage}: ${error instanceof Error ? error.message : String(error)}`;
    if (run.errors.indexOf(message) < 0) run.errors.push(message);
  };
  const bitmapOf = host.decodeBitmap === undefined ? null : host.decodeBitmap;
  for (let rep = 0; rep < options.repetitions; rep++) {
    for (const run of runs) {
      host.progress?.(`${run.spec.id} ${rep + 1}/${options.repetitions}`);
      // 1. The file's bytes: every repetition re-fetches, so no row is measured on a warm cache.
      let bytes: ArrayBuffer | null = null;
      const tFetch = host.now();
      try {
        bytes = await host.fetch(run.spec.url);
        run.fetch.push(host.now() - tFetch);
        run.bytes = bytes.byteLength;
      } catch (error) {
        fail(run, 'fetch', error);
      }
      // 2. The route.
      if (run.spec.probe === 'bitmap-reject') {
        if (bytes === null) continue;
        if (bitmapOf === null) {
          fail(run, 'bitmap', 'createImageBitmap unavailable');
          continue;
        }
        const t0 = host.now();
        try {
          const page = await bitmapOf(bytes);
          run.bitmap.push(host.now() - t0);
          try {
            const source = host.createSource(page.image, run.spec);
            try {
              host.finish();
              const t1 = host.now();
              host.upload(source);
              host.finish();
              run.bitmapUpload.push(host.now() - t1);
            } finally {
              source.destroy();
            }
          } finally {
            page.release();
          }
        } catch (error) {
          // The expected outcome on the TV's engine: the attempt is the figure, the message the row.
          run.bitmap.push(host.now() - t0);
          fail(run, 'bitmap', error);
        }
        continue;
      }
      let page: DecodedPage | null = null;
      try {
        const t0 = host.now();
        page = await host.decodeUrl(run.spec.url, rep);
        run.decode.push(host.now() - t0);
      } catch (error) {
        fail(run, 'decode', error);
      }
      if (page === null) continue;
      try {
        const source = host.createSource(page.image, run.spec);
        try {
          host.finish();
          const t1 = host.now();
          host.upload(source);
          const uploadMs = host.now() - t1;
          host.finish();
          const syncedMs = host.now() - t1;
          run.upload.push(uploadMs);
          run.uploadSynced.push(syncedMs);
          run.total.push(run.decode[run.decode.length - 1] + syncedMs);
        } finally {
          source.destroy();
        }
      } catch (error) {
        fail(run, 'upload', error);
      } finally {
        page.release();
      }
    }
  }
  return runs.map((run) => svgProbeRow(run, null));
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
  readonly createImageBitmap?: (source: Blob | HTMLVideoElement) => Promise<ImageBitmap>;
  /**
   * A `Video` constructor (the HTML video element). Chromium exposes no such global — the
   * interface is `HTMLVideoElement` — so this is the shape the test fakes (and any host library
   * that ships one) carry; {@link createDecodeHost} falls back to {@link DecodeWindow.document}
   * for a real browser, and to no surface at all when neither is present.
   */
  readonly Video?: new () => HTMLVideoElement;
  /**
   * The part of `document` the video surface needs: `createElement('video')` — the game's own
   * creation call (`@shmup/render-pixi` `createVideoSurface`). The real window carries this;
   * a host without it and without {@link DecodeWindow.Video} gets the honest
   * `video surface unavailable` fold.
   */
  readonly document?: { createElement(tagName: 'video'): HTMLVideoElement };
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
   * The file's bytes as a blob, typed by what they are: an SVG page (the arm's atlas page) would
   * otherwise reach the image decoder as a PNG and never load.
   *
   * @param bytes - The file.
   * @returns The blob.
   */
  const blobOf = (bytes: ArrayBuffer): Blob =>
    new win.Blob([bytes], {
      type: isSvgBytes(new Uint8Array(bytes, 0, 4)) ? SVG_DECODE_MIME : 'image/png',
    });
  const createBitmap = win.createImageBitmap;
  /**
   * The bench's video-surface factory (plan v20x-S8FIX): the `Video` constructor when the host
   * carries one (the test fakes' shape — Chromium exposes no such global), else the game's own
   * creation call, `document.createElement('video')` (the route `createVideoSurface` proved on
   * the M7), else no surface at all — the honest `video surface unavailable` fold stays.
   *
   * @returns A fresh detached video element, or `null` where neither route exists.
   */
  const newVideoElement = (): HTMLVideoElement | null => {
    const VideoCtor = win.Video;
    if (VideoCtor !== undefined) return new VideoCtor();
    if (win.document !== undefined) return win.document.createElement('video');
    return null;
  };
  /**
   * Whether this host can carry a video surface, without creating one (a capability read —
   * {@link newVideoElement} instantiates).
   *
   * @returns true when a `Video` ctor or a `document` route exists.
   */
  const hasVideoSurface = (): boolean => win.Video !== undefined || win.document !== undefined;
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
    openVideo:
      typeof createBitmap !== 'function' || !hasVideoSurface()
        ? null
        : (url, repetition) =>
            timed(
              new Promise<DecodedPage>((resolve, reject) => {
                const made = newVideoElement();
                if (made === null) {
                  reject(new Error('no video surface'));
                  return;
                }
                const video = made;
                video.muted = true;
                video.preload = 'auto';
                const release = (): void => {
                  video.removeAttribute('src');
                  try {
                    video.load();
                  } catch (_error) {
                    /* an empty-src load may throw on some engines — the surface is gone either way */
                  }
                };
                video.onloadeddata = (): void => {
                  video.onloadeddata = null;
                  video.onerror = null;
                  resolve({ image: video, release });
                };
                video.onerror = (): void => {
                  video.onloadeddata = null;
                  video.onerror = null;
                  release();
                  reject(new Error('the clip did not load'));
                };
                video.src = repetition === 0 ? url : `${url}?rep=${repetition}`;
                const playing = typeof video.play === 'function' ? video.play() : null;
                if (playing !== null) playing.catch(() => {});
              }),
              'video',
            ),
    pullBitmap:
      typeof createBitmap === 'function'
        ? (image) =>
            timed(Promise.resolve(createBitmap.call(win, image as HTMLVideoElement)), 'video pull')
        : null,
    createSource: options.createSource,
    upload: options.upload,
    finish: options.finish,
    progress: options.progress,
  };
}
