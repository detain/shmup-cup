/**
 * # loader — atlas pages and content for the boot sequence
 *
 * **Responsibility.** The load steps of the browser boot:
 *
 * - {@link loadAtlasManifest} fetches the atlas manifest (`assets/atlas/main.json`, plan R1-05 —
 *   it no longer rides in `app.js`) with `XMLHttpRequest` through `@shmup/audio-web`'s
 *   `loadArrayBuffer` (decision D25: `fetch()` fails on `file://` in Chromium 69; XHR works and
 *   reports status 0 there), checks its digest ({@link manifestDigest}, against the build's
 *   `virtual:shmup-assets`) and its format version ({@link ATLAS_MANIFEST_VERSIONS}), and
 *   {@link atlasPageUrls} turns its pages into relative URLs.
 * - {@link loadImages} loads the atlas pages with `new Image()` from their **relative** URLs
 *   (an `HTMLImageElement` works everywhere, `file://` included), in parallel, reporting
 *   progress; where the engine has `HTMLImageElement.decode()` (Chromium 64+) each page is also
 *   decoded before it counts as loaded, and {@link loadImagesTimed} reports every page's load and
 *   decode time (plan R1-05 — the zone-load numbers the M7 owner reads).
 * - {@link createPageImageFactory} is the shipped page decoder of plan v20x P0-1 (the owner's
 *   `tizen_optimize.md` §7.6, measured on the M7 TVs): where the engine has
 *   `window.createImageBitmap` (Chromium 50+), a page's bytes are fetched with the same
 *   `file://`-safe XHR path as the manifest and turned into an `ImageBitmap` — `texImage2D`
 *   uploads that without re-converting the decoded image (≈ 8–15× less upload time than an
 *   `HTMLImageElement`, about half the total file→GPU cost). The `Image` path above stays as the
 *   factory's fallback branch — every page whose bitmap fetch or decode fails decodes from its
 *   URL through {@link loadImageTimed} instead — and {@link loadPageImagesTimed} runs a list of
 *   URLs through such a factory in parallel.
 * - {@link loadGameContent} validates the inlined `virtual:shmup-content` files: the core
 *   kinds through `loadContent()` (script ids checked against the engine's registry,
 *   `KNOWN_SCRIPT_IDS`, and enemies against their behaviours, `checkEnemyBehaviors` — M1-08;
 *   weapons against theirs, `checkWeaponBehaviors` — M1-10;
 *   the engine's own sprites, `ENGINE_SPRITES`, interned into the sprite table — M1-09),
 *   every other kind through the **owner** registered for it
 *   (plan §3.5 — {@link DEFAULT_CONTENT_OWNERS}: `input-profiles` → `@shmup/input-web`,
 *   M1-05; `fx` → `@shmup/render-pixi`, M1-14; `sfx` / `music` → `@shmup/audio-web`, M1-15;
 *   hosts may replace an owner, e.g. to keep the parsed profiles). A file whose kind
 *   has no owner is an issue, so a new content kind cannot ship unvalidated. All problems
 *   come back as `ValidationIssue { path, message }` for the boot error screen.
 *
 * **Implements.**
 * - shmup_feat.md §22 — data-driven content validated at load, assets preloaded (no
 *   mid-game loading)
 * - shmup_tech.md §2.5 — boot on the TV from `file://` (no `fetch`), fast launch
 *
 * **Public API.** {@link loadImages}, {@link loadImagesTimed}, {@link loadImageTimed},
 * {@link ImageTiming},
 * {@link ImageFactory}, {@link LoadableImage}, {@link AssetLoadError},
 * {@link createPageImageFactory}, {@link PageImageFactory}, {@link PageImageFactoryOptions},
 * {@link LoadedPageImage}, {@link loadPageImagesTimed}, {@link tagPageImageUrl},
 * {@link loadAtlasManifest},
 * {@link LoadedAtlasManifest}, {@link parseAtlasManifest}, {@link manifestDigest},
 * {@link atlasPageUrls}, {@link AtlasManifestError}, {@link AtlasManifestFailure},
 * {@link ATLAS_MANIFEST_VERSIONS}, {@link loadGameContent}, {@link ContentOwner},
 * {@link ContentOwners}, {@link DEFAULT_CONTENT_OWNERS}, {@link LoadGameContentOptions}.
 *
 * @module
 */
import {
  ENGINE_SPRITES,
  KNOWN_SCRIPT_IDS,
  checkEnemyBehaviors,
  checkWeaponBehaviors,
  defineModule,
  loadContent,
  type ContentFile,
  type LoadContentOptions,
  type LoadContentResult,
  type ValidationIssue,
} from '@shmup/core';
import {
  MUSIC_CONTENT_KIND,
  SFX_CONTENT_KIND,
  loadArrayBuffer,
  loadMusicContent,
  loadSfxContent,
  type XhrLike,
} from '@shmup/audio-web';
import { INPUT_PROFILES_KIND, loadInputProfiles } from '@shmup/input-web';
import {
  FX_CONTENT_KIND,
  loadFxContent,
  type AtlasManifest,
  type AtlasPageImage,
} from '@shmup/render-pixi';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'loader',
  status: 'implemented',
  specRefs: ['shmup_feat.md §22', 'shmup_tech.md §2.5'],
});

/** The parts of `HTMLImageElement` the loader uses (tests pass fakes). */
export interface LoadableImage {
  /** Setting it starts the request. */
  src: string;
  /** Called when the image has decoded. */
  onload: ((this: GlobalEventHandlers, event: Event) => unknown) | null;
  /** Called when the request or the decode failed. */
  onerror: OnErrorEventHandler;
  /**
   * Decodes the image off the main thread (`HTMLImageElement.decode()`, Chromium 64+). Optional:
   * the loader awaits it after `onload` where it exists, and a rejection still counts as loaded
   * (the image did load; the GPU upload decodes it then).
   *
   * @returns Resolves once the image is decoded.
   */
  decode?(): Promise<void>;
}

/** How long one image took (see {@link loadImagesTimed}), in milliseconds of the given clock. */
export interface ImageTiming {
  /** From the request to `onload` (fetch, and whatever decoding the engine did before it). */
  readonly loadMs: number;
  /** From `onload` to the end of `decode()` (0 where the engine has no `decode()`). */
  readonly decodeMs: number;
}

/**
 * Creates an unloaded image (normally `() => new Image()`).
 *
 * @returns A fresh image element.
 */
export type ImageFactory = () => LoadableImage;

/** An atlas page (or other image) could not be loaded. */
export class AssetLoadError extends Error {
  /** The URL that failed. */
  readonly url: string;

  /**
   * @param url - The URL that failed.
   */
  constructor(url: string) {
    super(`could not load ${url}`);
    this.name = 'AssetLoadError';
    this.url = url;
  }
}

/**
 * Loads images in parallel.
 *
 * @remarks
 * Every request starts immediately; the promise resolves with the images in `urls` order
 * once all have loaded, or rejects on the first failure. `onProgress` is called with
 * `(0, total)` before any request and once per loaded image. The handlers are cleared after
 * each image settles. Where an image has `decode()`, it is awaited before the image counts as
 * loaded ({@link loadImagesTimed}).
 *
 * @param urls - Image URLs (relative to the page).
 * @param createImage - Image factory (normally `() => new Image()`).
 * @param onProgress - Optional progress callback `(loaded, total)`.
 * @returns A promise of the loaded images.
 * @throws Rejects with {@link AssetLoadError} naming the first URL that failed.
 *
 * @example
 * ```ts
 * const pages = await loadImages(assets.pageUrls, () => new Image(), (n, total) => {
 *   overlay.progress(n / total);
 * });
 * ```
 */
export function loadImages<T extends LoadableImage>(
  urls: readonly string[],
  createImage: () => T,
  onProgress?: (loaded: number, total: number) => void,
): Promise<T[]> {
  return loadImagesTimed(urls, createImage, onProgress).then((result) => result.images);
}

/**
 * Loads images in parallel and times each one (plan R1-05: the atlas pages' fetch and decode
 * times, which the shell reports for the M7's boot and zone-load numbers).
 *
 * @remarks
 * Like {@link loadImages}: every request starts at once; `onProgress` gets `(0, total)` first and
 * one call per image once it is ready. An image with `decode()` (`HTMLImageElement`, Chromium
 * 64+ — guarded, never assumed) is decoded after `onload` before it counts; a rejected decode
 * still counts (the bytes loaded — the GPU upload decodes them). Cold path: boot only. Without a
 * clock every timing is 0.
 *
 * @param urls - Image URLs (relative to the page).
 * @param createImage - Image factory (normally `() => new Image()`).
 * @param onProgress - Optional progress callback `(loaded, total)`.
 * @param now - Optional clock in milliseconds (normally `performance.now`).
 * @returns A promise of the images and their timings, both in `urls` order.
 * @throws Rejects with {@link AssetLoadError} naming the first URL that failed.
 *
 * @example
 * ```ts
 * const { images, timings } = await loadImagesTimed(urls, () => new Image(), undefined, () =>
 *   performance.now(),
 * );
 * timings[0].decodeMs; // → e.g. 12.5
 * ```
 */
export function loadImagesTimed<T extends LoadableImage>(
  urls: readonly string[],
  createImage: () => T,
  onProgress?: (loaded: number, total: number) => void,
  now?: () => number,
): Promise<{ readonly images: T[]; readonly timings: ImageTiming[] }> {
  const total = urls.length;
  onProgress?.(0, total);
  let loaded = 0;
  const timings: ImageTiming[] = urls.map(() => ({ loadMs: 0, decodeMs: 0 }));
  const pending = urls.map(
    (url, index) =>
      new Promise<T>((resolve, reject) => {
        const image = createImage();
        const startMs = now === undefined ? 0 : now();
        image.onload = () => {
          image.onload = null;
          image.onerror = null;
          const loadedMs = now === undefined ? 0 : now();
          /**
           * The image is ready: record its timing and count it.
           *
           * @param decodedMs - Clock reading when it was decoded (`loadedMs` without `decode()`).
           */
          const ready = (decodedMs: number): void => {
            timings[index] = { loadMs: loadedMs - startMs, decodeMs: decodedMs - loadedMs };
            loaded++;
            onProgress?.(loaded, total);
            resolve(image);
          };
          /** `decode()` settled (a rejection counts as decoded). */
          const decoded = (): void => {
            ready(now === undefined ? loadedMs : now());
          };
          if (typeof image.decode === 'function') image.decode().then(decoded, decoded);
          else ready(loadedMs);
        };
        image.onerror = () => {
          image.onload = null;
          image.onerror = null;
          reject(new AssetLoadError(url));
        };
        image.src = url;
      }),
  );
  return Promise.all(pending).then((images) => ({ images, timings }));
}

/**
 * Loads and times one image — the single-page call site of the lazy atlas residency (plan
 * R3-04.M3b: a page's image is fetched exactly when its stage is prepared, through this, and
 * {@link loadImagesTimed} does the work). Like it, an image with `decode()` is decoded before the
 * result settles; a rejected decode still counts.
 *
 * @param url - The image URL (relative to the page).
 * @param createImage - Image factory (normally `() => new Image()`).
 * @param now - Optional clock in milliseconds (normally `performance.now`).
 * @returns A promise of the image and its timing; resolves once the image is loaded (and decoded,
 *   where the engine has `decode()`).
 * @throws Rejects with {@link AssetLoadError} naming the URL when the request or the load fails.
 *
 * @example
 * ```ts
 * const { image, timing } = await loadImageTimed(urls[p], createImage, () => performance.now());
 * atlas.loadPage(p, image);
 * ```
 */
export async function loadImageTimed<T extends LoadableImage>(
  url: string,
  createImage: () => T,
  now?: () => number,
): Promise<{ readonly image: T; readonly timing: ImageTiming }> {
  const result = await loadImagesTimed([url], createImage, undefined, now);
  const image = result.images[0];
  const timing = result.timings[0];
  // loadImagesTimed fills both for every URL it settles; a hole would be a bug, not a miss.
  if (image === undefined || timing === undefined) throw new AssetLoadError(url);
  return { image, timing };
}

/**
 * One decoded atlas page and the timing of the load that produced it — either branch of
 * {@link createPageImageFactory} (plan v20x P0-1).
 */
export interface LoadedPageImage {
  /** The decoded page: an `ImageBitmap` from the bitmap branch, an `HTMLImageElement` from the fallback. */
  readonly image: AtlasPageImage;
  /**
   * The load's times on the factory's clock: the bitmap branch's are its fetch and its
   * `createImageBitmap` call; the fallback branch times its own `Image` load (an already-failed
   * bitmap attempt is not charged to the page).
   */
  readonly timing: ImageTiming;
}

/** Loads one atlas page image and reports it with its timing (the unit of {@link loadPageImagesTimed}). */
export type PageImageFactory = (url: string) => Promise<LoadedPageImage>;

/**
 * Injections of {@link createPageImageFactory} — the boot passes the window's own pieces, tests
 * pass fakes. Everything is optional: a factory with no `createBitmap` is the pure `Image` path.
 */
export interface PageImageFactoryOptions {
  /**
   * The engine's `createImageBitmap` (`window.createImageBitmap`, Chromium 50+) — its presence
   * is the feature detection that selects the bitmap branch. Never called with an options
   * dictionary (plan v20x P0-1): the default `premultiply-alpha-on-upload` texture alpha is
   * verified pixel-identical for both sources by `test/e2e/atlas-bitmap-identity.spec.ts`.
   */
  readonly createBitmap?: (blob: Blob) => Promise<ImageBitmap>;
  /** Element factory for the `HTMLImageElement` branch (normally `() => new Image()`). */
  readonly createElement?: ImageFactory;
  /** XHR factory for the bitmap branch's byte fetch (default `() => new XMLHttpRequest()`). */
  readonly createRequest?: () => XhrLike;
  /** Optional clock in milliseconds (normally `performance.now`). Without it every timing is 0. */
  readonly now?: () => number;
}

/**
 * Records where a decoded page image came from (cold path, plan v20x P0-1): the boot error screen
 * and `test/e2e/atlas-bitmap-identity.spec.ts` name an uploaded texture by its page URL, and an
 * `ImageBitmap` carries no `src` — the shell tags it at load instead. A plain own property.
 *
 * @param image - The decoded page image.
 * @param url - The URL it was loaded from.
 * @returns The same image, tagged (for call-site chaining).
 */
export function tagPageImageUrl<T extends object>(image: T, url: string): T {
  (image as T & { pageUrl?: string }).pageUrl = url;
  return image;
}

/**
 * Builds the shell's page-image factory (plan v20x P0-1, the owner's `tizen_optimize.md` §7.6).
 *
 * @remarks
 * With a `createBitmap` the factory decodes each page on the **bitmap branch**: bytes through
 * `loadArrayBuffer` (the same `file://`-safe XHR path as the manifest, status 0 accepted, D25),
 * one `image/png` `Blob`, one option-less `createImageBitmap` call — whose result `texImage2D`
 * uploads without the re-conversion an `HTMLImageElement` costs (8–15× on the M7 TVs). A page
 * whose fetch **or** bitmap decode fails falls back to the **`Image` branch** for that URL (the
 * TV bench's proven URL-decode case), so the factory is only ever as strict as the loader it
 * wraps. Without `createBitmap` (an engine below Chromium 50, or `atlasDecode` forced in tests)
 * the factory is exactly {@link loadImageTimed} behind this signature. The caller releases an
 * `ImageBitmap` it drops: `Atlas.unloadPage` closes it (the residency's release hook).
 *
 * @param options - The engine pieces to branch on (see {@link PageImageFactoryOptions}).
 * @returns A factory loading every URL once (no caching here — the residency owns page lifetimes).
 *
 * @example
 * ```ts
 * const createPageImage = createPageImageFactory({
 *   createBitmap: typeof win.createImageBitmap === 'function' ? (blob) => win.createImageBitmap(blob) : undefined,
 *   now: () => performance.now(),
 * });
 * const { image, timing } = await createPageImage('assets/atlas/main-3.png');
 * ```
 */
export function createPageImageFactory(options: PageImageFactoryOptions = {}): PageImageFactory {
  const { createBitmap, now, createRequest } = options;
  const createElement = options.createElement ?? ((): HTMLImageElement => new Image());
  const loadFromElement: PageImageFactory = (url) =>
    loadImageTimed(url, createElement, now).then((loaded) => ({
      image: loaded.image as AtlasPageImage,
      timing: loaded.timing,
    }));
  if (typeof createBitmap !== 'function') return loadFromElement;
  const openRequest = createRequest ?? ((): XhrLike => new XMLHttpRequest());
  return async (url: string): Promise<LoadedPageImage> => {
    const startMs = now === undefined ? 0 : now();
    try {
      const bytes = await loadArrayBuffer(url, openRequest);
      const fetchedMs = now === undefined ? 0 : now();
      const bitmap = await createBitmap(new Blob([bytes], { type: 'image/png' }));
      const decodedMs = now === undefined ? 0 : now();
      return {
        image: tagPageImageUrl(bitmap, url),
        timing: { loadMs: fetchedMs - startMs, decodeMs: decodedMs - fetchedMs },
      };
    } catch (_error) {
      // The unproven leg of the path (a `file://` XHR, a rejected bitmap) is the fallback's
      // proven one: decode from the URL exactly as before this plan (the bench's URL case).
      return loadFromElement(url);
    }
  };
}

/**
 * Loads atlas pages in parallel through a {@link PageImageFactory} and times each one — the
 * eager boot's page load (the replacement of {@link loadImagesTimed} once the boot switched to
 * the factory; plan v20x P0-1).
 *
 * @remarks
 * Every URL's load starts at once; `onProgress` gets `(0, total)` first and one call per page as
 * it settles, mirroring {@link loadImagesTimed}. The result order is `urls` order. Rejects with
 * the first failure — which only a fallback branch can still raise (an {@link AssetLoadError}
 * from the `HTMLImageElement` path).
 *
 * @param urls - Page URLs (relative to the page).
 * @param createPageImage - The factory loading each page.
 * @param onProgress - Optional progress callback `(loaded, total)`.
 * @returns A promise of the images and their timings, both in `urls` order.
 * @throws Rejects with {@link AssetLoadError} naming the first URL that failed.
 */
export async function loadPageImagesTimed(
  urls: readonly string[],
  createPageImage: PageImageFactory,
  onProgress?: (loaded: number, total: number) => void,
): Promise<{ readonly images: AtlasPageImage[]; readonly timings: ImageTiming[] }> {
  const total = urls.length;
  onProgress?.(0, total);
  let settled = 0;
  const timings: ImageTiming[] = urls.map(() => ({ loadMs: 0, decodeMs: 0 }));
  const pending = urls.map((url, index) =>
    createPageImage(url).then((loaded) => {
      timings[index] = loaded.timing;
      settled++;
      onProgress?.(settled, total);
      return loaded.image;
    }),
  );
  const images = await Promise.all(pending);
  return { images, timings };
}

/** Manifest format versions this shell reads: 1, and 2 since plan R1-05 (pages carry `group`). */
export const ATLAS_MANIFEST_VERSIONS: readonly number[] = Object.freeze([1, 2]);

/**
 * Why a fetched atlas manifest could not be used: `load` — the request failed (network error,
 * HTTP error, empty body); `parse` — not a manifest (not JSON, or pages / frames missing);
 * `digest` — a manifest of another build (its digest differs from the one the build recorded);
 * `version` — a format version this shell does not read.
 */
export type AtlasManifestFailure = 'load' | 'parse' | 'digest' | 'version';

/** The atlas manifest could not be fetched or used ({@link loadAtlasManifest}). */
export class AtlasManifestError extends Error {
  /** The manifest's URL. */
  readonly url: string;
  /** What went wrong. */
  readonly failure: AtlasManifestFailure;

  /**
   * @param url - The manifest's URL.
   * @param failure - What went wrong.
   * @param detail - A one-line description (the message is `"<url>: <detail>"`).
   */
  constructor(url: string, failure: AtlasManifestFailure, detail: string) {
    super(`${url}: ${detail}`);
    this.name = 'AtlasManifestError';
    this.url = url;
    this.failure = failure;
  }
}

/**
 * The digest of a manifest file: 32-bit FNV-1a over its bytes, 8 lower-case hex digits — the same
 * value `vite.shared.ts` `manifestDigest` records in `virtual:shmup-assets` at build time.
 *
 * @param bytes - The file's bytes.
 * @returns The digest (`"811c9dc5"` for no bytes).
 *
 * @example
 * ```ts
 * manifestDigest(new Uint8Array(0)); // → '811c9dc5'
 * ```
 */
export function manifestDigest(bytes: Uint8Array): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    hash ^= bytes[i];
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** A page file name the shell will request: the pipeline's `main.png`, `main-1.png`, … */
const PAGE_FILE_PATTERN = /^[a-z0-9-]+\.png$/;

/** The manifest's object members besides `pages` that {@link parseAtlasManifest} requires. */
const MANIFEST_TABLES: readonly string[] = Object.freeze([
  'frames',
  'sprites',
  'animations',
  'fonts',
]);

/**
 * Whether a value is a plain object (not `null`, not an array).
 *
 * @param value - Anything.
 * @returns `true` for an object record.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Whether a value is a page entry: a plain `*.png` file name and positive whole `w` / `h`.
 *
 * @param page - Anything.
 * @returns `true` for a page entry.
 */
function isPageEntry(page: unknown): boolean {
  return (
    isRecord(page) &&
    typeof page.file === 'string' &&
    PAGE_FILE_PATTERN.test(page.file) &&
    typeof page.w === 'number' &&
    typeof page.h === 'number' &&
    page.w > 0 &&
    page.h > 0 &&
    Math.floor(page.w) === page.w &&
    Math.floor(page.h) === page.h
  );
}

/**
 * Parses and shape-checks manifest text: a JSON object with a known `formatVersion`
 * ({@link ATLAS_MANIFEST_VERSIONS}), at least one page (`file` a plain `*.png` name, positive whole
 * `w` / `h`) and `frames`, `sprites`, `animations` and `fonts` objects. Frames and sprites are
 * checked against the pages later, by `@shmup/render-pixi` `createAtlas`.
 *
 * @param text - The manifest file's text.
 * @param url - Its URL (for the error).
 * @returns The manifest.
 * @throws {AtlasManifestError} `parse` when it is not a manifest, `version` for an unknown format
 *   version.
 *
 * @example
 * ```ts
 * const manifest = parseAtlasManifest(text, 'assets/atlas/main.json');
 * manifest.pages[0].file; // → 'main.png'
 * ```
 */
export function parseAtlasManifest(text: string, url: string): AtlasManifest {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new AtlasManifestError(url, 'parse', `not JSON (${(error as Error).message})`);
  }
  if (!isRecord(data)) throw new AtlasManifestError(url, 'parse', 'not a JSON object');
  const version = data.formatVersion;
  if (typeof version !== 'number' || ATLAS_MANIFEST_VERSIONS.indexOf(version) < 0) {
    throw new AtlasManifestError(
      url,
      'version',
      `format version ${String(version)}, this build reads ${ATLAS_MANIFEST_VERSIONS.join(' or ')}`,
    );
  }
  const pages = data.pages;
  if (!Array.isArray(pages) || pages.length === 0) {
    throw new AtlasManifestError(url, 'parse', 'no pages');
  }
  for (let i = 0; i < pages.length; i++) {
    if (!isPageEntry(pages[i])) {
      throw new AtlasManifestError(url, 'parse', `page ${i} is not a page entry`);
    }
  }
  for (const key of MANIFEST_TABLES) {
    if (!isRecord(data[key])) throw new AtlasManifestError(url, 'parse', `no ${key} object`);
  }
  return data as unknown as AtlasManifest;
}

/** A fetched, checked manifest ({@link loadAtlasManifest}). */
export interface LoadedAtlasManifest {
  /** The manifest. */
  readonly manifest: AtlasManifest;
  /** The digest of the bytes received ({@link manifestDigest}). */
  readonly digest: string;
  /** Bytes received. */
  readonly bytes: number;
}

/**
 * Fetches the atlas manifest with `XMLHttpRequest` and checks it (plan R1-05).
 *
 * @remarks
 * The request goes through `@shmup/audio-web` `loadArrayBuffer`: XHR, not `fetch()` (decision
 * D25 — `fetch()` fails on `file://` in Chromium 69; there XHR succeeds with status 0, which
 * counts as success), so the TVs read `assets/atlas/main.json` straight from the installed
 * package. Then, in this order: the digest of the bytes against `expectedDigest` (when given — a
 * cached manifest of another build), the JSON, the format version and the shape
 * ({@link parseAtlasManifest}). Cold path: boot only.
 *
 * @param url - The manifest's URL, relative to the page (`virtual:shmup-assets` `manifestUrl`).
 * @param expectedDigest - The digest the build recorded (`manifestDigest`), or `undefined` to
 *   skip the check.
 * @param createRequest - Request factory (default `() => new XMLHttpRequest()`; tests pass fakes).
 * @returns A promise of the manifest, its digest and its size.
 * @throws Rejects with {@link AtlasManifestError}: `load`, `digest`, `parse` or `version`.
 *
 * @example
 * ```ts
 * import assets from 'virtual:shmup-assets';
 *
 * const { manifest } = await loadAtlasManifest(assets.manifestUrl, assets.manifestDigest);
 * const images = await loadImages(atlasPageUrls(assets.atlasDir, manifest), () => new Image());
 * ```
 */
export function loadAtlasManifest(
  url: string,
  expectedDigest?: string,
  createRequest?: () => XhrLike,
): Promise<LoadedAtlasManifest> {
  return loadArrayBuffer(url, createRequest).then(
    (buffer) => {
      const bytes = new Uint8Array(buffer);
      const digest = manifestDigest(bytes);
      if (expectedDigest !== undefined && digest !== expectedDigest) {
        throw new AtlasManifestError(
          url,
          'digest',
          `digest ${digest}, the build expects ${expectedDigest} (a manifest of another build)`,
        );
      }
      const manifest = parseAtlasManifest(new TextDecoder().decode(bytes), url);
      return { manifest, digest, bytes: bytes.length };
    },
    (error: unknown) => {
      // `loadArrayBuffer`'s AudioLoadError reads "could not load <url>: <reason>"; keep the reason.
      const message = error instanceof Error ? error.message : String(error);
      const at = message.lastIndexOf(': ');
      throw new AtlasManifestError(url, 'load', at < 0 ? message : message.slice(at + 2));
    },
  );
}

/**
 * The relative URL of every page of a manifest.
 *
 * @param atlasDir - The pages' folder relative to the page (`virtual:shmup-assets` `atlasDir`);
 *   `''` for the page's own folder.
 * @param manifest - The manifest.
 * @returns One URL per page, in page order (`assets/atlas/main.png`, …).
 *
 * @example
 * ```ts
 * atlasPageUrls('assets/atlas', manifest); // → ['assets/atlas/main.png', …]
 * ```
 */
export function atlasPageUrls(atlasDir: string, manifest: AtlasManifest): string[] {
  const slash = atlasDir === '' || atlasDir.charAt(atlasDir.length - 1) === '/';
  const prefix = slash ? atlasDir : `${atlasDir}/`;
  return manifest.pages.map((page) => prefix + page.file);
}

/**
 * Validates the files of one foreign content kind.
 *
 * @param files - Every file of the kind, in path order.
 * @returns The problems found (empty when valid). The owner keeps whatever it parsed.
 */
export type ContentOwner = (files: readonly ContentFile[]) => readonly ValidationIssue[];

/** Content owners by `kind` (plan §3.5). */
export type ContentOwners = { readonly [kind: string]: ContentOwner };

/**
 * The owners of the foreign content kinds that exist today (plan §3.5): `input-profiles` →
 * `@shmup/input-web` `loadInputProfiles` (M1-05), `fx` → `@shmup/render-pixi` `loadFxContent`
 * (M1-14), `sfx` / `music` → `@shmup/audio-web` `loadSfxContent` / `loadMusicContent` (M1-15).
 */
export const DEFAULT_CONTENT_OWNERS: ContentOwners = Object.freeze({
  [INPUT_PROFILES_KIND]: (files: readonly ContentFile[]) => loadInputProfiles(files).issues,
  [FX_CONTENT_KIND]: (files: readonly ContentFile[]) => loadFxContent(files).issues,
  [SFX_CONTENT_KIND]: (files: readonly ContentFile[]) => loadSfxContent(files).issues,
  [MUSIC_CONTENT_KIND]: (files: readonly ContentFile[]) => loadMusicContent(files).issues,
});

/** Options of {@link loadGameContent}. */
export interface LoadGameContentOptions extends LoadContentOptions {
  /**
   * Validators for the non-core kinds, merged over {@link DEFAULT_CONTENT_OWNERS} (an entry
   * here replaces the default owner of its kind).
   */
  readonly owners?: ContentOwners;
}

/**
 * Validates game content: core kinds through `loadContent()`, the other kinds through their
 * owners.
 *
 * @remarks
 * `knownScripts` defaults to the core's `KNOWN_SCRIPT_IDS`, so content naming a behaviour the
 * engine does not have is an issue; `extraSprites` defaults to the core's `ENGINE_SPRITES`, so
 * the World can draw its enemy bullets, lasers and the Options (pass `extraSprites: []` to leave
 * them out — they then simulate but are not drawn). Issues are the core's (file and reference
 * order), then the behaviour checks of the enemies (`checkEnemyBehaviors`) and of the weapons
 * (`checkWeaponBehaviors`), then per foreign kind in first-seen order the owner's issues — or
 * one issue per file when no owner claims the kind
 * (`"<path>: no loader for content kind \"<kind>\""`). Owners come from `options.owners`,
 * then {@link DEFAULT_CONTENT_OWNERS}. Never throws for bad data.
 *
 * @param files - The content files (`virtual:shmup-content`).
 * @param options - Owners and `loadContent` options (`knownScripts`, `extraSprites`, …).
 * @returns The core database, all issues and the foreign files.
 * @throws {TypeError} Only for a programming error (not a file list — see `loadContent`).
 *
 * @example
 * ```ts
 * const { db, issues } = loadGameContent(contentFiles, { owners: { 'input-profiles': parseProfiles } });
 * if (issues.length > 0) showErrorScreen(issues);
 * ```
 */
export function loadGameContent(
  files: readonly ContentFile[],
  options: LoadGameContentOptions = {},
): LoadContentResult {
  const result = loadContent(files, {
    knownScripts: options.knownScripts ?? KNOWN_SCRIPT_IDS,
    migrations: options.migrations,
    extraSprites: options.extraSprites ?? ENGINE_SPRITES,
  });
  const issues: ValidationIssue[] = result.issues.slice();
  for (const issue of checkEnemyBehaviors(result.db)) issues.push(issue);
  for (const issue of checkWeaponBehaviors(result.db)) issues.push(issue);
  const owners = options.owners ?? {};
  /**
   * Own-property test (a kind named like an `Object.prototype` member is never an owner).
   *
   * @param table - Owners by kind.
   * @param kind - Content kind.
   * @returns `true` when `table` itself lists `kind`.
   */
  const hasOwn = (table: ContentOwners, kind: string): boolean =>
    Object.prototype.hasOwnProperty.call(table, kind);
  const byKind = new Map<string, ContentFile[]>();
  for (const file of result.foreign) {
    // loadContent only returns files with a valid header as foreign, so `kind` is a string.
    const kind = (file.data as { readonly kind: string }).kind;
    const list = byKind.get(kind);
    if (list === undefined) byKind.set(kind, [file]);
    else list.push(file);
  }
  byKind.forEach((kindFiles, kind) => {
    const owner = hasOwn(owners, kind)
      ? owners[kind]
      : hasOwn(DEFAULT_CONTENT_OWNERS, kind)
        ? DEFAULT_CONTENT_OWNERS[kind]
        : undefined;
    if (owner === undefined) {
      for (const file of kindFiles) {
        issues.push({ path: file.path, message: `no loader for content kind "${kind}"` });
      }
      return;
    }
    for (const issue of owner(kindFiles)) issues.push(issue);
  });
  return { db: result.db, issues, foreign: result.foreign };
}
