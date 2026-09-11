/**
 * # atlas — texture atlases and sprite frames
 *
 * **Responsibility.** Turns the sprite atlas produced by the M1-03 asset pipeline
 * (`scripts/assets/`, `pnpm assets`) into Pixi textures: the manifest arrives inlined through
 * `virtual:shmup-assets` (format: `scripts/assets/manifest.mjs`), the pages are images the host
 * loaded from the relative `pageUrls` (decision D25 — `new Image()`, no `fetch`). Each page
 * becomes **one** `TextureSource` with nearest-neighbour sampling, and every frame a `Texture`
 * over it, so all sprites of a page batch into one draw call.
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
 * The atlas manifest (`assets/generated/atlas/main.json`, inlined as `virtual:shmup-assets`).
 * Structurally identical to the ambient type in `types/virtual-modules.d.ts`.
 */
export interface AtlasManifest {
  /** Manifest format version (1). */
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

/** A decoded atlas page as the host loaded it (normally an `HTMLImageElement`). */
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
  /** One texture source per page (nearest-neighbour). */
  readonly pages: readonly TextureSource[];
  /** Texture by frame id. */
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
 * Builds the textures of an atlas from its manifest and the loaded page images.
 *
 * @remarks
 * - Each page becomes one `ImageSource` (`scaleMode: 'nearest'`, no mipmaps) — upload
 *   happens on first use by the renderer, so this runs without a GPU.
 * - Frame ids: sprites in name order, frames in index order (a sprite's frames are
 *   consecutive), then any frame no sprite lists. When the manifest lacks
 *   {@link MISSING_SPRITE} or {@link PIXEL_SPRITE}, Pixi's 1×1 white texture stands in.
 * - Everything is allocated here; the returned typed arrays are read per frame.
 *
 * @param manifest - The atlas manifest.
 * @param images - One decoded image per manifest page, same order.
 * @param options - Warning sink.
 * @returns The atlas.
 * @throws {RangeError} When the image count differs from the page count, a page is larger
 *   than {@link MAX_ATLAS_SIZE}, an image's size differs from its page entry (a stale
 *   atlas), a frame lies outside its page, or a sprite lists a frame that does not exist or
 *   that another sprite lists too (a corrupt manifest).
 *
 * @example
 * ```ts
 * import assets from 'virtual:shmup-assets';
 * const images = await loadImages(assets.pageUrls); // host code, `new Image()`
 * const atlas = createAtlas(assets.manifest, images);
 * const table = atlas.resolveSpriteTable(game.content.sprites.names);
 * ```
 */
export function createAtlas(
  manifest: AtlasManifest,
  images: readonly AtlasPageImage[],
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
  for (let p = 0; p < manifest.pages.length; p++) {
    const page = manifest.pages[p];
    const image = images[p];
    if (page.w > MAX_ATLAS_SIZE || page.h > MAX_ATLAS_SIZE) {
      throw new RangeError(`atlas: page ${page.file} exceeds ${MAX_ATLAS_SIZE}²`);
    }
    const [w, h] = imageSize(image);
    if (w !== page.w || h !== page.h) {
      throw new RangeError(
        `atlas: page ${page.file} is ${w}×${h} but the manifest says ${page.w}×${page.h} (stale atlas?)`,
      );
    }
    pages.push(
      new ImageSource({
        resource: image,
        scaleMode: 'nearest',
        autoGenerateMipmaps: false,
        label: `atlas/${page.file}`,
      }),
    );
  }

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
