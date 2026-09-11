/**
 * # loader — atlas pages and content for the boot sequence
 *
 * **Responsibility.** The two load steps of the browser boot:
 *
 * - {@link loadImages} loads the atlas pages with `new Image()` from their **relative** URLs
 *   (decision D25: Tizen widgets run from `file://`, where `fetch()` fails on Chromium 69 —
 *   an `HTMLImageElement` works everywhere), in parallel, reporting progress.
 * - {@link loadGameContent} validates the inlined `virtual:shmup-content` files: the core
 *   kinds through `loadContent()` (script ids checked against the engine's registry,
 *   `KNOWN_SCRIPT_IDS`, and enemies against their behaviours, `checkEnemyBehaviors` — M1-08;
 *   weapons against theirs, `checkWeaponBehaviors` — M1-10;
 *   the engine's own sprites, `ENGINE_SPRITES`, interned into the sprite table — M1-09),
 *   every other kind through the **owner** registered for it
 *   (plan §3.5 — {@link DEFAULT_CONTENT_OWNERS}: `input-profiles` → `@shmup/input-web`,
 *   M1-05; hosts may replace an owner, e.g. to keep the parsed profiles). A file whose kind
 *   has no owner is an issue, so a new content kind cannot ship unvalidated. All problems
 *   come back as `ValidationIssue { path, message }` for the boot error screen.
 *
 * **Implements.**
 * - shmup_feat.md §22 — data-driven content validated at load, assets preloaded (no
 *   mid-game loading)
 * - shmup_tech.md §2.5 — boot on the TV from `file://` (no `fetch`), fast launch
 *
 * **Public API.** {@link loadImages}, {@link ImageFactory}, {@link LoadableImage},
 * {@link AssetLoadError}, {@link loadGameContent}, {@link ContentOwner},
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
import { INPUT_PROFILES_KIND, loadInputProfiles } from '@shmup/input-web';

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
 * each image settles.
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
  const total = urls.length;
  onProgress?.(0, total);
  let loaded = 0;
  const pending = urls.map(
    (url) =>
      new Promise<T>((resolve, reject) => {
        const image = createImage();
        image.onload = () => {
          image.onload = null;
          image.onerror = null;
          loaded++;
          onProgress?.(loaded, total);
          resolve(image);
        };
        image.onerror = () => {
          image.onload = null;
          image.onerror = null;
          reject(new AssetLoadError(url));
        };
        image.src = url;
      }),
  );
  return Promise.all(pending);
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
 * `@shmup/input-web` `loadInputProfiles` (M1-05). Later steps add `sfx`/`music` (audio-web) and
 * `fx` (render-pixi).
 */
export const DEFAULT_CONTENT_OWNERS: ContentOwners = Object.freeze({
  [INPUT_PROFILES_KIND]: (files: readonly ContentFile[]) => loadInputProfiles(files).issues,
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
