/**
 * # atlas — texture atlases and sprite frames
 *
 * **Responsibility.** Turns the sprite atlas produced by the M1-03 asset pipeline
 * (`scripts/assets/`, `pnpm assets`) into Pixi textures: the manifest is the host's to load (the
 * shell fetches `assets/atlas/main.json` since plan R1-05; `virtual:shmup-assets-inline` still
 * inlines it — format: `scripts/assets/manifest.mjs`), the pages are images the host
 * loaded from the relative `pageUrls` (decision D25 — `new Image()`, no `fetch`). Each page
 * becomes **one** `TextureSource` with nearest-neighbour sampling, and every frame a `Texture`
 * over it, so all sprites of a page batch into one draw call.
 *
 * A page may start **unloaded** (`null` in the image list) and be brought in later by
 * {@link Atlas.loadPage} / freed again by {@link Atlas.unloadPage} (plan R3-04, the lazy
 * residency): until its page is loaded, every frame of it draws nothing — its texture points at
 * Pixi's empty source with a 0×0 frame, so no sampling of a missing image ever happens. The page
 * source and the frame textures keep their object identity across load/unload; only their
 * contents move.
 *
 * Frame ids are dense integers assigned **sprite by sprite** (sprites in name order, frames in
 * index order), so the frames of a sprite are consecutive: a sprite's frame `i` is
 * `table[spriteId] + i`. Names are resolved to ids once at load time
 * ({@link Atlas.resolveSpriteTable}); per-frame code only indexes typed arrays. A name that is
 * not in the atlas resolves to the magenta checker `ui/missing` and warns once.
 *
 * **Implements.**
 * - shmup_feat.md §18 — single ≤ 2048² sprite atlas where possible, batched rendering,
 *   hit flash by swapping to the `<sprite>@flash` sibling (decision D30)
 * - shmup_tech.md §2.2 — keep atlases ≤ 2048² (TV GPUs)
 * - shmup_feat.md §25 — content production list (placeholder art replaced by name)
 *
 * **Public API.** {@link createAtlas}, {@link Atlas}, {@link AtlasOptions}, {@link FrameId},
 * {@link AtlasManifest} (+ {@link AtlasPageInfo}, {@link AtlasFrameInfo},
 * {@link AtlasSpriteInfo}, {@link AtlasFontInfo}, {@link AtlasGlyphInfo}),
 * {@link AtlasPageImage}, {@link MAX_ATLAS_SIZE}, {@link MISSING_SPRITE},
 * {@link PIXEL_SPRITE}.
 *
 * @module
 */
import { defineModule } from '@shmup/core';
import { ImageSource, Rectangle, Texture, type TextureSource } from 'pixi.js';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'atlas',
  status: 'implemented',
  specRefs: ['shmup_feat.md §18', 'shmup_tech.md §2.2', 'shmup_feat.md §25'],
});

/** Largest atlas page edge the renderer accepts (safe on TV GPUs — shmup_tech.md §2.2). */
export const MAX_ATLAS_SIZE = 2048;

/** Sprite drawn for names the atlas does not contain (magenta checker). */
export const MISSING_SPRITE = 'ui/missing';

/** 1×1 white sprite scaled and tinted for solid rectangles. */
export const PIXEL_SPRITE = 'ui/pixel';

/** Numeric handle of a sprite frame inside a loaded atlas. */
export type FrameId = number;

/** One atlas page (a PNG). */
export interface AtlasPageInfo {
  /** File name next to the manifest (`main.png`, `main-1.png`, …). */
  readonly file: string;
  /** Width in pixels (power of two ≤ 2048). */
  readonly w: number;
  /** Height in pixels (power of two ≤ 2048). */
  readonly h: number;
  /**
   * The page's group (manifest format 2, plan R1-05): `common` — page 0, `main.png` — or a zone
   * (`zone-a` …), packed on pages of its own so a zone's pages can leave the GPU between zones.
   * Absent in format 1. The atlas itself never reads it.
   */
  readonly group?: string;
}

/** Where one frame sits in the atlas. */
export interface AtlasFrameInfo {
  /** Page index. */
  readonly p: number;
  /** Left column on the page. */
  readonly x: number;
  /** Top row on the page. */
  readonly y: number;
  /** Width in pixels. */
  readonly w: number;
  /** Height in pixels. */
  readonly h: number;
  /** Anchor column in frame pixels (the sprite's position maps to this pixel). */
  readonly ax: number;
  /** Anchor row in frame pixels. */
  readonly ay: number;
}

/** A sprite: its frames in index order and its hit-flash sibling. */
export interface AtlasSpriteInfo {
  /** Frame names (`<sprite>#<index>`), index order. */
  readonly frames: readonly string[];
  /** `<sprite>@flash` (white silhouettes, same frame count) or `null`. */
  readonly flash: string | null;
}

/** One glyph of a bitmap font. */
export interface AtlasGlyphInfo {
  /** Frame holding the glyph cell. */
  readonly frame: string;
  /** Pen advance in pixels. */
  readonly advance: number;
}

/** A bitmap font. */
export interface AtlasFontInfo {
  /** Sprite holding the glyph frames (`font/<name>`). */
  readonly sprite: string;
  /** Line spacing in pixels. */
  readonly lineHeight: number;
  /** Glyph cell width. */
  readonly cellWidth: number;
  /** Glyph cell height. */
  readonly cellHeight: number;
  /** Glyphs by decimal code point (`"65"` = `A`). */
  readonly glyphs: { readonly [codePoint: string]: AtlasGlyphInfo };
}

/**
 * The atlas manifest (`assets/generated/atlas/main.json` — fetched by the shell since plan R1-05,
 * inlined as `virtual:shmup-assets-inline`).
 * Structurally identical to the ambient type in `types/virtual-modules.d.ts`.
 */
export interface AtlasManifest {
  /** Manifest format version: 1, or 2 since R1-05 (pages carry their `group`). */
  readonly formatVersion: number;
  /** Atlas pages. */
  readonly pages: readonly AtlasPageInfo[];
  /** Every frame by name. */
  readonly frames: { readonly [frame: string]: AtlasFrameInfo };
  /** Every sprite by name. */
  readonly sprites: { readonly [sprite: string]: AtlasSpriteInfo };
  /** Per sprite: animation tag → frame indices. */
  readonly animations: {
    readonly [sprite: string]: { readonly [tag: string]: readonly number[] };
  };
  /** Bitmap fonts by name (`pixel`). */
  readonly fonts: { readonly [font: string]: AtlasFontInfo };
}

/**
 * A decoded atlas page as the host loaded it: the `ImageBitmap` of the shell's bitmap branch
 * (plan v20x P0-1 — the page's image is closed by {@link Atlas.unloadPage} and on replacement,
 * never by {@link Atlas.destroy}, whose images stay the host's), falling back to an
 * `HTMLImageElement` where the engine has no `createImageBitmap` (or on a page whose bitmap
 * load failed).
 */
export type AtlasPageImage = HTMLImageElement | HTMLCanvasElement | ImageBitmap;

/** Options of {@link createAtlas}. */
export interface AtlasOptions {
  /**
   * Receives load-time warnings (a sprite name the atlas lacks). Defaults to
   * `console.warn`. Each missing name is reported once.
   *
   * @param message - Human-readable warning.
   */
  readonly onWarning?: (message: string) => void;
}

/** A loaded atlas: one texture per frame plus per-frame geometry in typed arrays. */
export interface Atlas {
  /** The manifest the atlas was built from. */
  readonly manifest: AtlasManifest;
  /** Number of frame ids: manifest frames plus fallbacks when `ui/missing` / `ui/pixel` lack. */
  readonly size: number;
  /**
   * One **persistent** texture source per page (nearest-neighbour), outside Pixi's texture GC
   * (`autoGarbageCollect` off — the owner of the pages unloads them, R1-05). The entry objects
   * never change; an unloaded page holds no image (`resource` null) and no frame texture points
   * at it until {@link Atlas.loadPage} brings the image back.
   */
  readonly pages: readonly TextureSource[];
  /**
   * Texture by frame id. A frame of an unloaded page draws nothing until its page loads again
   * (see {@link Atlas.loadPage}).
   */
  readonly textures: readonly Texture[];
  /** Anchor column by frame id. */
  readonly anchorX: Int16Array;
  /** Anchor row by frame id. */
  readonly anchorY: Int16Array;
  /** Frame width by frame id. */
  readonly frameWidth: Uint16Array;
  /** Frame height by frame id. */
  readonly frameHeight: Uint16Array;
  /**
   * Frames from this id to the end of its sprite, including itself. For a sprite's first
   * frame this is the sprite's frame count, so `frame < framesLeft[base]` validates a frame
   * index without another table.
   */
  readonly framesLeft: Uint16Array;
  /** Frame drawn for unknown sprites and out-of-range frames (`ui/missing#0`). */
  readonly missingFrame: FrameId;
  /** 1×1 white frame for rectangles (`ui/pixel#0`). */
  readonly pixelFrame: FrameId;
  /**
   * Whether a page's image is currently loaded (its frames draw).
   *
   * @param page - Page index.
   * @returns `true` when the page is loaded.
   * @throws {RangeError} When the index is not a page of this atlas.
   */
  isPageLoaded(page: number): boolean;
  /**
   * Loads (or reloads) one page's image and points its frames back at it. Idempotent for the
   * image already set; replacing the image of a loaded page is legal (the context-loss recovery
   * of plan R3-04 re-fetches) and **closes the `ImageBitmap` it replaces** (plan v20x P0-1).
   * Everything it touches is the cold path — no per-frame cost.
   *
   * @param page - Page index.
   * @param image - The decoded page image; its size must match the manifest entry.
   * @throws {RangeError} When the index is not a page of this atlas, or the image's size differs
   *   from its page entry (a stale atlas).
   */
  loadPage(page: number, image: AtlasPageImage): void;
  /**
   * Frees one page: unloads its GPU copy (Pixi's `unload()`), drops the decoded image — closing
   * an `ImageBitmap`, whose backing would otherwise hold GPU memory until the GC runs it (plan
   * v20x P0-1, the residency's leak class) — and points its frames at the empty texture until
   * the next {@link Atlas.loadPage}. Idempotent. While a page is unloaded its `pages` entry must
   * not be passed to `uploadTextureSource` — load it first. A cold path.
   *
   * @param page - Page index.
   * @throws {RangeError} When the index is not a page of this atlas.
   */
  unloadPage(page: number): void;
  /**
   * Resolves a frame name to its id (do this once at load, not per frame).
   *
   * @param name - Frame name, `<sprite>#<index>`, e.g. `'ships/kestrel#0'`.
   * @returns The frame id, or -1 when the atlas has no such frame.
   */
  frameId(name: string): FrameId;
  /**
   * First frame id of a sprite.
   *
   * @param sprite - Sprite name, e.g. `'ships/kestrel'`.
   * @returns The id of its frame 0, or -1 when the atlas has no such sprite.
   */
  spriteBase(sprite: string): FrameId;
  /**
   * Resolves a sprite name table (e.g. `ContentDb.sprites.names`) to first-frame ids.
   *
   * @param names - Sprite names by sprite id.
   * @returns `table[spriteId]` = id of the sprite's frame 0; names the atlas lacks map to
   *   {@link Atlas.missingFrame} (warned once per name).
   */
  resolveSpriteTable(names: readonly string[]): Int32Array;
  /**
   * Like {@link Atlas.resolveSpriteTable}, but to each sprite's hit-flash sibling
   * (`<sprite>@flash`). Sprites without one map to their own frames.
   *
   * @param names - Sprite names by sprite id.
   * @returns First-frame ids of the flash siblings.
   */
  resolveFlashTable(names: readonly string[]): Int32Array;
  /** Destroys the frame textures and the page sources (the images are the host's). */
  destroy(): void;
}

/**
 * `Object.prototype.hasOwnProperty` as a function (manifest maps are plain objects).
 *
 * @param object - Map to test.
 * @param key - Key.
 * @returns `true` when `key` is an own property.
 */
const has = (object: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(object, key);

/**
 * Pixel size of a page image (`naturalWidth` for images, `width` for canvases/bitmaps).
 *
 * @param image - The image.
 * @returns `[width, height]`.
 */
function imageSize(image: AtlasPageImage): [number, number] {
  const natural = image as { naturalWidth?: number; naturalHeight?: number };
  if (typeof natural.naturalWidth === 'number' && natural.naturalWidth > 0) {
    return [natural.naturalWidth, natural.naturalHeight ?? 0];
  }
  return [image.width, image.height];
}

/**
 * Releases a page image the atlas drops (plan v20x P0-1): an `ImageBitmap` keeps its backing
 * alive until `close()` — the GC runs it late, and late bytes are exactly the VRAM the residency
 * frees when it detaches a page inside the atlas share. An `HTMLImageElement` or canvas has
 * nothing to close. Cold path (page attach/detach only); called by {@link applyPage} on the
 * release and the replace arm — never for an image still in use — and by the image surface
 * (`stills/index.ts`), which holds the same law for a single non-atlas bitmap (plan v20x A4).
 *
 * @param image - The image the atlas just let go of, when one was attached.
 */
export function closePageImage(image: AtlasPageImage | null | undefined): void {
  const bitmap = image as ImageBitmap | null | undefined;
  if (bitmap === null || bitmap === undefined || typeof bitmap.close !== 'function') return;
  bitmap.close();
}

/**
 * The texture source every frame of an unloaded page points at (Pixi's empty texture's source:
 * no image to sample, and with a 0×0 frame the quad has no area, so nothing draws and nothing
 * throws).
 */
const UNLOADED_SOURCE = Texture.EMPTY.source;

/**
 * Builds the textures of an atlas from its manifest and the loaded page images.
 *
 * @remarks
 * - Each page becomes one `ImageSource` (`scaleMode: 'nearest'`, no mipmaps) — upload
 *   happens on first use by the renderer (or the shell's eager upload — `uploadTextureSource`),
 *   so this runs without a GPU. Its `autoGarbageCollect` is **off** (R1-05): Pixi's texture GC
 *   never unloads a page; only `unload()` — the shell's atlas residency between zones — or
 *   {@link Atlas.destroy} frees its GPU copy.
 * - Frame ids: sprites in name order, frames in index order (a sprite's frames are
 *   consecutive), then any frame no sprite lists. When the manifest lacks
 *   {@link MISSING_SPRITE} or {@link PIXEL_SPRITE}, Pixi's 1×1 white texture stands in.
 * - An image may be `null` — that page starts unloaded (see {@link Atlas.loadPage} /
 *   {@link Atlas.unloadPage}); its frames draw nothing until it loads.
 * - Everything is allocated here; the returned typed arrays are read per frame.
 *
 * @param manifest - The atlas manifest.
 * @param images - One decoded image per manifest page, same order; `null` starts the page
 *   unloaded.
 * @param options - Warning sink.
 * @returns The atlas.
 * @throws {RangeError} When the image count differs from the page count, a page is larger
 *   than {@link MAX_ATLAS_SIZE}, an image's size differs from its page entry (a stale
 *   atlas), a frame lies outside its page, or a sprite lists a frame that does not exist or
 *   that another sprite lists too (a corrupt manifest).
 *
 * @example
 * ```ts
 * import assets from 'virtual:shmup-assets-inline';
 * const images = await loadImages(assets.pageUrls); // host code, `new Image()`
 * const atlas = createAtlas(assets.manifest, images);
 * const table = atlas.resolveSpriteTable(game.content.sprites.names);
 * ```
 */
export function createAtlas(
  manifest: AtlasManifest,
  images: readonly (AtlasPageImage | null)[],
  options: AtlasOptions = {},
): Atlas {
  const warn =
    options.onWarning ??
    ((message: string): void => {
      console.warn(message);
    });
  if (images.length !== manifest.pages.length) {
    throw new RangeError(
      `atlas: ${manifest.pages.length} page(s) in the manifest but ${images.length} image(s)`,
    );
  }
  const pages: TextureSource[] = [];
  const pageLoaded: boolean[] = [];
  for (let p = 0; p < manifest.pages.length; p++) {
    const page = manifest.pages[p];
    const image = images[p];
    if (page.w > MAX_ATLAS_SIZE || page.h > MAX_ATLAS_SIZE) {
      throw new RangeError(`atlas: page ${page.file} exceeds ${MAX_ATLAS_SIZE}²`);
    }
    if (image !== null) {
      const [w, h] = imageSize(image);
      if (w !== page.w || h !== page.h) {
        throw new RangeError(
          `atlas: page ${page.file} is ${w}×${h} but the manifest says ${page.w}×${page.h} (stale atlas?)`,
        );
      }
    }
    const source = new ImageSource({
      resource: image ?? undefined,
      scaleMode: 'nearest',
      autoGenerateMipmaps: false,
      label: `atlas/${page.file}`,
    });
    // Out of Pixi's texture GC (R1-05): `ImageSource`'s constructor forces `autoGarbageCollect`
    // on, whatever the options say, and the GC would then drop a page no frame bound for a minute
    // — behind the shell's residency, which uploads the pages eagerly so none uploads mid-play.
    // The pages leave the GPU only through `unload()` (the residency) or `destroy()`.
    source.autoGarbageCollect = false;
    pages.push(source);
    pageLoaded.push(image !== null);
  }

  /** The frame ids drawn from each page, in creation order (filled by the frame loop). */
  const pageFrames: FrameId[][] = pages.map(() => []);

  // Frame order: sprite by sprite, then orphans.
  const order: string[] = [];
  const framesLeftList: number[] = [];
  const assigned = new Set<string>();
  const spriteNames = Object.keys(manifest.sprites).sort();
  for (const sprite of spriteNames) {
    const frames = manifest.sprites[sprite].frames;
    for (let i = 0; i < frames.length; i++) {
      const name = frames[i];
      if (!has(manifest.frames, name)) {
        throw new RangeError(`atlas: sprite ${sprite} lists frame ${name}, which does not exist`);
      }
      if (assigned.has(name)) {
        throw new RangeError(`atlas: frame ${name} is listed by more than one sprite`);
      }
      assigned.add(name);
      order.push(name);
      framesLeftList.push(frames.length - i);
    }
  }
  for (const name of Object.keys(manifest.frames).sort()) {
    if (assigned.has(name)) continue;
    assigned.add(name);
    order.push(name);
    framesLeftList.push(1);
  }

  const ids = new Map<string, FrameId>();
  const textures: Texture[] = [];
  for (let id = 0; id < order.length; id++) {
    const name = order[id];
    const frame = manifest.frames[name];
    const page = manifest.pages[frame.p];
    const source = pages[frame.p];
    if (page === undefined || source === undefined) {
      throw new RangeError(`atlas: frame ${name} is on page ${frame.p}, which does not exist`);
    }
    if (frame.x < 0 || frame.y < 0 || frame.x + frame.w > page.w || frame.y + frame.h > page.h) {
      throw new RangeError(`atlas: frame ${name} lies outside page ${page.file}`);
    }
    ids.set(name, id);
    pageFrames[frame.p].push(id);
    textures.push(
      new Texture({
        source,
        frame: new Rectangle(frame.x, frame.y, frame.w, frame.h),
        label: name,
      }),
    );
  }

  /**
   * First frame id of a sprite, or -1.
   *
   * @param sprite - Sprite name.
   * @returns The id.
   */
  const spriteBase = (sprite: string): FrameId => {
    if (!has(manifest.sprites, sprite)) return -1;
    const first = manifest.sprites[sprite].frames[0];
    return first === undefined ? -1 : (ids.get(first) ?? -1);
  };

  let size = order.length;
  let missingFrame = spriteBase(MISSING_SPRITE);
  let pixelFrame = spriteBase(PIXEL_SPRITE);
  if (missingFrame < 0) {
    missingFrame = size++;
    textures.push(Texture.WHITE);
    framesLeftList.push(1);
  }
  if (pixelFrame < 0) {
    pixelFrame = size++;
    textures.push(Texture.WHITE);
    framesLeftList.push(1);
  }

  const anchorX = new Int16Array(size);
  const anchorY = new Int16Array(size);
  const frameWidth = new Uint16Array(size);
  const frameHeight = new Uint16Array(size);
  const framesLeft = new Uint16Array(size);
  for (let id = 0; id < size; id++) {
    framesLeft[id] = framesLeftList[id];
    const frame = id < order.length ? manifest.frames[order[id]] : undefined;
    if (frame === undefined) {
      frameWidth[id] = 1;
      frameHeight[id] = 1;
      continue;
    }
    anchorX[id] = frame.ax;
    anchorY[id] = frame.ay;
    frameWidth[id] = frame.w;
    frameHeight[id] = frame.h;
  }

  /**
   * Moves one page's frame textures onto the page source (with the manifest rectangles restored)
   * or onto the empty source with a 0×0 frame. A cold path — the work of {@link Atlas.loadPage}
   * and {@link Atlas.unloadPage}; per-frame code never sees it. Either arm releases the image the
   * page held before (plan v20x P0-1: a detached or replaced `ImageBitmap` is closed at once, so
   * its backing leaves the GPU with the page — the residency's leak class).
   *
   * @param page - Page index (validated by the caller).
   * @param image - The decoded page image, or `null` to free the page.
   */
  function applyPage(page: number, image: AtlasPageImage | null): void {
    const source = pages[page];
    const ids = pageFrames[page];
    if (image !== null) {
      if (pageLoaded[page]) closePageImage(source.resource as AtlasPageImage | null);
      source.resource = image;
      source.update();
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        const texture = textures[id];
        const frame = manifest.frames[order[id]];
        texture.frame.x = frame.x;
        texture.frame.y = frame.y;
        texture.frame.width = frame.w;
        texture.frame.height = frame.h;
        texture.source = source;
        texture.update();
      }
    } else {
      for (let i = 0; i < ids.length; i++) {
        const texture = textures[ids[i]];
        texture.frame.x = 0;
        texture.frame.y = 0;
        texture.frame.width = 0;
        texture.frame.height = 0;
        texture.source = UNLOADED_SOURCE;
        texture.update();
      }
      if (pageLoaded[page]) {
        source.unload();
        closePageImage(source.resource as AtlasPageImage | null);
      }
      source.resource = null;
    }
    pageLoaded[page] = image !== null;
  }

  /**
   * Validates a page index.
   *
   * @param page - Index to check.
   * @returns The index, unchanged.
   * @throws {RangeError} When the index is not a page of this atlas.
   */
  function checkedPage(page: number): number {
    if (!(page >= 0 && page < pages.length)) {
      throw new RangeError(`atlas: no page ${page} (the manifest has ${pages.length})`);
    }
    return page;
  }

  // Pages given as `null` start unloaded: move their frames onto the empty texture.
  for (let p = 0; p < pages.length; p++) {
    if (!pageLoaded[p]) applyPage(p, null);
  }

  const warned = new Set<string>();
  /**
   * Resolves sprite names to first-frame ids (the sprite itself or its flash sibling).
   *
   * @param names - Sprite names by id.
   * @param flash - Resolve to the `@flash` sibling where one exists.
   * @returns First-frame ids.
   */
  const resolve = (names: readonly string[], flash: boolean): Int32Array => {
    const table = new Int32Array(names.length);
    for (let i = 0; i < names.length; i++) {
      const name = names[i];
      let base = spriteBase(name);
      if (base < 0) {
        if (!warned.has(name)) {
          warned.add(name);
          warn(`atlas: unknown sprite "${name}" — drawing ${MISSING_SPRITE} instead`);
        }
        table[i] = missingFrame;
        continue;
      }
      if (flash) {
        const sibling = manifest.sprites[name].flash;
        const flashBase = sibling === null ? -1 : spriteBase(sibling);
        if (flashBase >= 0) base = flashBase;
      }
      table[i] = base;
    }
    return table;
  };

  return {
    manifest,
    size,
    pages,
    textures,
    anchorX,
    anchorY,
    frameWidth,
    frameHeight,
    framesLeft,
    missingFrame,
    pixelFrame,
    isPageLoaded(page) {
      return pageLoaded[checkedPage(page)];
    },
    loadPage(page, image) {
      checkedPage(page);
      if (pageLoaded[page] && pages[page].resource === image) return;
      const info = manifest.pages[page];
      const [w, h] = imageSize(image);
      if (w !== info.w || h !== info.h) {
        throw new RangeError(
          `atlas: page ${info.file} is ${w}×${h} but the manifest says ${info.w}×${info.h} (stale atlas?)`,
        );
      }
      applyPage(page, image);
    },
    unloadPage(page) {
      checkedPage(page);
      if (pageLoaded[page]) applyPage(page, null);
    },
    frameId(name) {
      return ids.get(name) ?? -1;
    },
    spriteBase,
    resolveSpriteTable(names) {
      return resolve(names, false);
    },
    resolveFlashTable(names) {
      return resolve(names, true);
    },
    destroy() {
      for (const texture of textures) {
        if (texture !== Texture.WHITE) texture.destroy(false);
      }
      for (const source of pages) source.destroy();
    },
  };
}
