/**
 * The bitmap page decode (plan v20x P0-1): the shipped `createImageBitmap` path and the
 * `HTMLImageElement` fallback must land **the same pixels** — on the GPU and on screen — and the
 * residency must **close** every bitmap it detaches.
 *
 * The owner's §7.6 acceptance gates, on the web test build (headless Chromium, real WebGL via
 * SwiftShader):
 *
 * - **Upload identity**: an init script wraps `texImage2D` and, for every atlas page upload,
 *   records the source kind (`image` / `bitmap`), the page name (the element's `src`, the
 *   bitmap's `pageUrl` tag — `tagPageImageUrl`) and a hash of the texture's own bytes read back
 *   through a temporary framebuffer (bindings restored). The showcase keeps **every page**
 *   resident (`prepare(-1)` — the `@flash`, `@p2` and bullet-palette pages included), so the
 *   bitmap run and the image run must agree per page: same names, same hashes. A premultiply or
 *   any other upload-semantics difference would show exactly here — this is the gate that decides
 *   the plan, never a re-bless.
 * - **Drawn identity**: one `#game` screenshot per run at the same frozen tick — byte-equal.
 * - **Branch proof**: every recorded upload of the bitmap run is kind `bitmap` (the shipped
 *   default on this engine), and every one of the image run (whose init script hides
 *   `createImageBitmap` before the boot reads it) is kind `image`.
 * - **The close bookkeeping** (the leak class): the hook counts `createImageBitmap` results and
 *   `ImageBitmap.prototype.close` calls; a long residency session (eight zone swaps) must settle
 *   with `created − closed ≤ resident` after every swap — what is open is exactly what the atlas
 *   still holds — and must have closed at least once (an unclosed bitmap would hold its backing
 *   until the GC eats the atlas share).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { freezeSim, stepTo } from './frame-advance.js';
import { BOOT_TIMEOUT_MS } from './ticks.js';

/** One page upload as the probe recorded it. */
interface UploadRecord {
  /** Page file name (`main-3.png`). */
  name: string;
  /** Source kind: `image` (an `HTMLImageElement`) or `bitmap` (an `ImageBitmap`). */
  kind: string;
  /** FNV-1a hex of the uploaded texture's RGBA bytes (read back by the hook), `unread` if incomplete. */
  hash: string;
  /** Ms the `texImage2D` call itself took (the plan's measured cost — nothing of the probe in it). */
  uploadMs: number;
}

/** The probe's report (`window.__atlasDecode()`). */
interface DecodeReport {
  /** Every named page upload, by page name (last upload wins), sorted. */
  uploads: UploadRecord[];
  /** Successful `createImageBitmap` results. */
  created: number;
  /** `ImageBitmap.prototype.close` calls. */
  closed: number;
}

/**
 * Installs the atlas-decode probe before any app code runs: the `texImage2D` wrapper with the
 * read-back hash, the `close` and `createImageBitmap` counters, and `window.__atlasDecode`.
 *
 * @param page - The page (before `goto`).
 */
async function installDecodeProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    /** One page's record. */
    interface Rec {
      name: string;
      kind: string;
      hash: string;
      uploadMs: number;
    }
    const uploads = new Map<string, Rec>();
    const bound = new Map<unknown, unknown>();
    let unit: unknown = 0;
    let created = 0;
    let closed = 0;
    /**
     * FNV-1a over the read-back bytes, hex.
     *
     * @param bytes - The RGBA read.
     * @returns The hash text.
     */
    const fnv = (bytes: Uint8Array): string => {
      let h = 0x811c9dc5;
      for (let i = 0; i < bytes.length; i++) {
        h ^= bytes[i];
        h = Math.imul(h, 0x01000193);
      }
      return (h >>> 0).toString(16).padStart(8, '0');
    };
    /**
     * Reads a texture's bytes back through a temporary framebuffer, restoring what it touched.
     *
     * @param gl - The context that just uploaded.
     * @param texture - The texture to read.
     * @param w - Texture width.
     * @param h - Texture height.
     * @returns The hash, or `unread` when the readback cannot attach.
     */
    const readBack = (
      gl: WebGLRenderingContext,
      texture: WebGLTexture,
      w: number,
      h: number,
    ): string => {
      const holder = gl as WebGLRenderingContext & { __atlasProbeFbo?: WebGLFramebuffer | null };
      let fbo = holder.__atlasProbeFbo;
      if (fbo === undefined || fbo === null) {
        fbo = gl.createFramebuffer();
        holder.__atlasProbeFbo = fbo;
      }
      if (fbo === null) return 'unread';
      const previous: unknown = gl.getParameter(gl.FRAMEBUFFER_BINDING);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      let hash = 'unread';
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE) {
        const pixels = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        if (gl.getError() === gl.NO_ERROR) hash = fnv(pixels);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, previous as WebGLFramebuffer | null);
      return hash;
    };
    /**
     * Wraps one WebGL context prototype's texture calls.
     *
     * @param proto - The context prototype (either flavour).
     */
    const wrap = (proto: object | undefined): void => {
      if (proto === undefined) return;
      const calls = proto as Record<string, (...args: unknown[]) => unknown>;
      const originalActive = calls['activeTexture'];
      calls['activeTexture'] = function (this: WebGLRenderingContext, ...args: unknown[]) {
        unit = args[0];
        return originalActive.apply(this, args);
      };
      const originalBind = calls['bindTexture'];
      calls['bindTexture'] = function (this: WebGLRenderingContext, ...args: unknown[]) {
        if (args[0] === this.TEXTURE_2D) bound.set(unit, args[1]);
        return originalBind.apply(this, args);
      };
      const originalTexImage = calls['texImage2D'];
      calls['texImage2D'] = function (this: WebGLRenderingContext, ...args: unknown[]) {
        const uploadStart = performance.now();
        const result = originalTexImage.apply(this, args);
        const uploadMs = performance.now() - uploadStart;
        const texture = bound.get(unit);
        if (!(texture instanceof WebGLTexture)) return result;
        const source = args[args.length - 1];
        let record: Rec | null = null;
        if (source instanceof HTMLImageElement) {
          record = {
            name: source.src.split('?')[0].split('/').pop() ?? '',
            kind: 'image',
            hash: '',
            uploadMs,
          };
        } else if (source instanceof ImageBitmap) {
          const url = (source as ImageBitmap & { pageUrl?: string }).pageUrl;
          if (typeof url !== 'string') return result;
          record = {
            name: url.split('?')[0].split('/').pop() ?? '',
            kind: 'bitmap',
            hash: '',
            uploadMs,
          };
        }
        if (record === null || !/^main(-\d+)?\.png$/.test(record.name)) return result;
        const sized = source as {
          naturalWidth?: number;
          naturalHeight?: number;
          width: number;
          height: number;
        };
        const w = sized.naturalWidth ?? sized.width;
        const h = sized.naturalHeight ?? sized.height;
        record.hash = readBack(this, texture, w, h);
        uploads.set(record.name, record);
        return result;
      };
    };
    wrap(window.WebGLRenderingContext?.prototype);
    wrap(window.WebGL2RenderingContext?.prototype);
    // The captures use the bench's own idiom (`apps/tizen/src/bench/decode.ts`: a function-typed
    // property on a structural window), never a detached method — and the wrapper keeps the plain
    // one-Blob shape the loader is allowed to call (no options ever).
    const bitmaps = ImageBitmap.prototype as unknown as { close?: (this: ImageBitmap) => void };
    const closeOriginal = bitmaps.close;
    if (typeof closeOriginal === 'function') {
      bitmaps.close = function (this: ImageBitmap): void {
        closed++;
        closeOriginal.call(this);
      };
    }
    const creator = window as unknown as {
      createImageBitmap?: (blob: Blob) => Promise<ImageBitmap>;
    };
    const bitmapOriginal = creator.createImageBitmap;
    if (typeof bitmapOriginal === 'function') {
      creator.createImageBitmap = (blob: Blob) =>
        // `call(window, …)`: Chromium's createImageBitmap needs its window receiver — a bare
        // unbound call is an "Illegal invocation" (the bench's `createBitmap.call(win, …)` idiom).
        bitmapOriginal.call(window, blob).then((bitmap) => {
          created++;
          return bitmap;
        });
    }
    (window as unknown as { __atlasDecode: () => DecodeReport }).__atlasDecode = () => ({
      uploads: [...uploads.values()].sort((a, b) => a.name.localeCompare(b.name)),
      created,
      closed,
    });
  });
}

/**
 * Hides `window.createImageBitmap` before the boot's feature detection reads it (the image run of
 * the identity gate): the shell then builds its pure-`Image` fallback factory.
 *
 * @param page - The page (before `goto`).
 */
async function hideCreateImageBitmap(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'createImageBitmap', {
      value: undefined,
      configurable: true,
    });
  });
}

/**
 * The probe's report from the page.
 *
 * @param page - The page.
 * @returns The recorded uploads and counters.
 */
function decodeReport(page: Page): Promise<DecodeReport> {
  return page.evaluate(() =>
    (window as unknown as { __atlasDecode: () => DecodeReport }).__atlasDecode(),
  );
}

/**
 * What the boot itself reports: the R1-05 canvas marks (proof they keep populating on the bitmap
 * branch) and the atlas timing record — the wall numbers for plan v20x P0-1's report.
 *
 * @param page - The page (booted).
 * @returns The marks.
 */
function bootMarks(page: Page): Promise<Record<string, string | null>> {
  return page.evaluate(() => {
    const canvas = document.getElementById('game');
    const report = (window as unknown as { __atlasDecode: () => DecodeReport }).__atlasDecode();
    return {
      loadMsAttr: canvas?.getAttribute('data-shmup-atlas-load-ms') ?? null,
      pageMsAttr: canvas?.getAttribute('data-shmup-atlas-page-ms') ?? null,
      pagesAttr: canvas?.getAttribute('data-shmup-atlas-pages') ?? null,
      created: String(report.created),
      closed: String(report.closed),
    };
  });
}

/**
 * Waits `frames` animation frames in the page (what a swap or a draw lands on).
 *
 * @param page - The page.
 * @param frames - Frames to wait.
 */
function waitFrames(page: Page, frames: number): Promise<void> {
  return page.evaluate(
    (total) =>
      new Promise<void>((resolve) => {
        let seen = 0;
        const next = (): void => {
          seen++;
          if (seen >= total) resolve();
          else requestAnimationFrame(next);
        };
        requestAnimationFrame(next);
      }),
    frames,
  );
}

/**
 * Boots the sprite showcase, freezes the sim and steps it to an exact tick, then waits for the
 * draws — the showcase keeps every atlas page uploaded, and every sprite moves by game ticks.
 *
 * @param page - The page (probe / hides installed before this).
 */
async function showcaseAtTick(page: Page): Promise<void> {
  await page.goto('./?scene=showcase');
  await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running', {
    timeout: BOOT_TIMEOUT_MS,
  });
  await freezeSim(page);
  await stepTo(page, 240);
  await waitFrames(page, 3);
}

test.describe('atlas bitmap decode — pixel identity (plan v20x P0-1)', () => {
  test('the shipped default uploads ImageBitmap pages, byte-identical to the Image fallback, drawn identical', async ({
    page,
    context,
  }, testInfo) => {
    test.setTimeout(150_000);
    await installDecodeProbe(page);
    await showcaseAtTick(page);
    const bitmapRun = await decodeReport(page);
    const bitmapShot = await page.locator('#game').screenshot();

    // The branch really ran: every page on this engine decodes through the bitmap path.
    expect(bitmapRun.uploads.length).toBeGreaterThan(0);
    expect(bitmapRun.uploads.every((upload) => upload.kind === 'bitmap')).toBe(true);
    expect(bitmapRun.uploads.every((upload) => upload.hash !== 'unread')).toBe(true);
    expect(bitmapRun.created).toBe(bitmapRun.uploads.length);

    const second = await context.newPage();
    await installDecodeProbe(second);
    await hideCreateImageBitmap(second);
    await showcaseAtTick(second);
    const imageRun = await decodeReport(second);
    const imageShot = await second.locator('#game').screenshot();

    // The fallback ran instead: every upload is an element, no bitmap was ever created.
    expect(imageRun.created).toBe(0);
    expect(imageRun.uploads.every((upload) => upload.kind === 'image')).toBe(true);
    expect(imageRun.uploads.every((upload) => upload.hash !== 'unread')).toBe(true);

    // The gate: the same pages, the same GPU bytes per page — including the `@flash`, `@p2` and
    // bullet-palette pages (all pages are resident in the showcase, so all are compared).
    expect(imageRun.uploads.map((upload) => upload.name)).toEqual(
      bitmapRun.uploads.map((upload) => upload.name),
    );
    for (const upload of bitmapRun.uploads) {
      const twin = imageRun.uploads.find((other) => other.name === upload.name);
      // The contract is the bytes: `kind` and `uploadMs` are probe metadata and differ by
      // design (that is the whole point of the branch); the hash is the page as it sits on the GPU.
      expect(twin, `page ${upload.name} missing from the Image upload`).toBeDefined();
      expect(
        twin?.hash,
        `page ${upload.name} differs between the bitmap and the Image upload`,
      ).toBe(upload.hash);
    }

    // And the frame drawn from them is byte-identical.
    expect(bitmapShot.equals(imageShot)).toBe(true);

    // The R1-05 marks keep populating on the bitmap branch (gate 3 of the work order) — and the
    // honest numbers (desktop Chromium / SwiftShader, disclosed, not the gate; the −47…−56 % rows
    // remain the owner's M7 measurement): per-page `texImage2D` ms and the boot's own marks.
    const bitmapMarks = await bootMarks(page);
    const imageMarks = await bootMarks(second);
    expect(bitmapMarks.pageMsAttr).toMatch(/^manifest:|main(-\d+)?\.png:/);
    expect(imageMarks.pageMsAttr).toMatch(/^manifest:|main(-\d+)?\.png:/);
    // The plan's measurement record is the test's own artifact, not a fixed host path: it rides
    // in Playwright's per-test output directory (`test-results/…`, git-ignored, wiped for a
    // passing test, kept for a failing one) — the conventions law that a test never writes to a
    // fixed path another test reads. The file is read back and checked against the in-page
    // probe right here, so the artifact is proven inside this spec and nothing outside it
    // depends on where it landed (plan v20x F-G: a fixed `/tmp/opencode/…` target was ENOENT
    // red on every CI runner).
    const measurePath = testInfo.outputPath('v20x-opt1-measure.json');
    mkdirSync(dirname(measurePath), { recursive: true });
    const measure = {
      note: 'desktop Chromium (SwiftShader) — mechanism proof only; the M7 TV numbers are the doc’s',
      bitmap: {
        uploads: bitmapRun.uploads,
        marks: bitmapMarks,
        shotBytes: bitmapShot.length,
      },
      image: { uploads: imageRun.uploads, marks: imageMarks, shotBytes: imageShot.length },
    };
    writeFileSync(measurePath, JSON.stringify(measure, null, 2));
    const roundTrip = JSON.parse(readFileSync(measurePath, 'utf8')) as typeof measure;
    expect(roundTrip.note).toBe(measure.note);
    expect(roundTrip.bitmap.uploads).toEqual(measure.bitmap.uploads);
    expect(roundTrip.image.uploads).toEqual(measure.image.uploads);
    expect(roundTrip.bitmap.marks).toEqual(measure.bitmap.marks);
    expect(roundTrip.image.marks).toEqual(measure.image.marks);
    await second.close();
  });
});

test.describe('atlas bitmap decode — residency closes what it detaches', () => {
  test('eight zone swaps settle with created − closed ≤ resident, closing on every detach', async ({
    page,
  }) => {
    test.setTimeout(150_000);
    await installDecodeProbe(page);
    await page.goto('./?stage=zone-b');
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running', {
      timeout: BOOT_TIMEOUT_MS,
    });
    await freezeSim(page);

    const zones = ['zone-b', 'zone-c', 'zone-d', 'zone-e'];
    for (let round = 0; round < 8; round++) {
      const zone = zones[round % zones.length];
      const moved = await page.evaluate((stage) => {
        const atlas = (
          window as unknown as { __shmupDebug: { atlas: { prepare(stageId: string): number } } }
        ).__shmupDebug.atlas;
        return atlas.prepare(stage);
      }, zone);
      expect(moved, `stage ${zone} is not in the shipped content`).toBeGreaterThanOrEqual(0);
      await waitFrames(page, 8); // the prepare's loads and the detach pass land on frames
      const settled = await page.waitForFunction(
        () => {
          const report = (
            window as unknown as { __atlasDecode: () => DecodeReport }
          ).__atlasDecode();
          const resident = (
            window as unknown as {
              __shmupDebug: { atlas: { resident: readonly boolean[] } };
            }
          ).__shmupDebug.atlas.resident.filter((r) => r).length;
          return report.created - report.closed <= resident;
        },
        undefined,
        { timeout: 15_000 },
      );
      expect(settled, `round ${round}: an unclosed bitmap outlived its page`).not.toBeNull();
    }
    const final = await decodeReport(page);
    // A swap detached pages at least once, and it closed: the count moved.
    expect(final.created).toBeGreaterThan(0);
    expect(final.closed).toBeGreaterThan(0);
    const finalBalance = await page.evaluate(() => {
      const report = (window as unknown as { __atlasDecode: () => DecodeReport }).__atlasDecode();
      const resident = (
        window as unknown as {
          __shmupDebug: { atlas: { resident: readonly boolean[] } };
        }
      ).__shmupDebug.atlas.resident.filter((r) => r).length;
      return { open: report.created - report.closed, resident };
    });
    expect(finalBalance.open).toBeLessThanOrEqual(finalBalance.resident);
    // The JS heap over the whole session (coarse — the bitmap backing is not heap; the close
    // counting above is the precise guard). Read in the page, where `performance.memory` lives.
    const heapMb = await page.evaluate(() =>
      (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize !==
      undefined
        ? (performance as unknown as { memory: { usedJSHeapSize: number } }).memory.usedJSHeapSize /
          (1024 * 1024)
        : -1,
    );
    if (heapMb >= 0) expect(heapMb).toBeLessThan(256);
  });
});
