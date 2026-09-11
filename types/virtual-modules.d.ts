/**
 * Ambient declarations for the virtual modules the repo's Vite plugins generate
 * (see `vite.shared.ts`). Apps include this file from their `tsconfig.json`.
 *
 * @module
 */

/**
 * Every shipped file under `content/`, inlined into the bundle at build time by the
 * `shmupContent()` plugin — sorted by path, with `example.*.json` excluded.
 *
 * @remarks
 * Inlining is decision D25: Tizen widgets run from `file://`, where `fetch()` fails on
 * Chromium 69, so game data has to be part of the script. Hand the array to
 * `loadContent()` from `@shmup/core`.
 *
 * @example
 * ```ts
 * import contentFiles from 'virtual:shmup-content';
 * import { loadContent } from '@shmup/core';
 *
 * const { db, issues } = loadContent(contentFiles);
 * ```
 */
declare module 'virtual:shmup-content' {
  /** One content JSON document. */
  interface VirtualContentFile {
    /** Path relative to `content/`, POSIX separators (e.g. `player/kestrel.player.json`). */
    readonly path: string;
    /** The parsed JSON document; validate it with `loadContent()`. */
    readonly data: unknown;
  }
  /** The content files, sorted by path. */
  const files: readonly VirtualContentFile[];
  export default files;
}

/**
 * The texture-atlas manifest and page URLs produced by the asset pipeline
 * (`pnpm assets`, `scripts/assets/`) and served by the `shmupAssets()` plugin.
 *
 * @remarks
 * The manifest is **inlined** into the bundle (decision D25 — no `fetch()` on the TV);
 * the pages are separate PNGs next to it, loaded with `new Image()` from the relative
 * `pageUrls` (`assets/atlas/main.png`, …). Format: `scripts/assets/manifest.mjs`.
 *
 * @example
 * ```ts
 * import { manifest, pageUrls } from 'virtual:shmup-assets';
 *
 * const kestrel = manifest.sprites['ships/kestrel']; // → { frames: [...], flash: null }
 * const frame = manifest.frames[kestrel.frames[0]]; // → { p, x, y, w, h, ax, ay }
 * ```
 */
declare module 'virtual:shmup-assets' {
  /** One atlas page (a PNG). */
  export interface AtlasPage {
    /** File name next to the manifest (`main.png`, `main-1.png`, …). */
    readonly file: string;
    /** Width in pixels (power of two ≤ 2048). */
    readonly w: number;
    /** Height in pixels (power of two ≤ 2048). */
    readonly h: number;
  }
  /** Where one frame sits in the atlas. */
  export interface AtlasFrame {
    /** Page index into `pages` / `pageUrls`. */
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
  export interface AtlasSprite {
    /** Frame names (`<sprite>#<index>`), index order. */
    readonly frames: readonly string[];
    /** `<sprite>@flash` (white silhouettes, same frame count) or `null`. */
    readonly flash: string | null;
  }
  /** One glyph of a bitmap font. */
  export interface AtlasGlyph {
    /** Frame holding the glyph cell. */
    readonly frame: string;
    /** Pen advance in pixels. */
    readonly advance: number;
  }
  /** A bitmap font. */
  export interface AtlasFont {
    /** Sprite holding the glyph frames (`font/<name>`). */
    readonly sprite: string;
    /** Line spacing in pixels. */
    readonly lineHeight: number;
    /** Glyph cell width. */
    readonly cellWidth: number;
    /** Glyph cell height. */
    readonly cellHeight: number;
    /** Glyphs by decimal code point (`"65"` = `A`). */
    readonly glyphs: { readonly [codePoint: string]: AtlasGlyph };
  }
  /** The whole manifest (`assets/generated/atlas/main.json`). */
  export interface AtlasManifest {
    /** Manifest format version (1). */
    readonly formatVersion: number;
    /** Atlas pages. */
    readonly pages: readonly AtlasPage[];
    /** Every frame by name. */
    readonly frames: { readonly [frame: string]: AtlasFrame };
    /** Every sprite by name. */
    readonly sprites: { readonly [sprite: string]: AtlasSprite };
    /** Per sprite: animation tag → frame indices. */
    readonly animations: {
      readonly [sprite: string]: { readonly [tag: string]: readonly number[] };
    };
    /** Bitmap fonts by name (`pixel`). */
    readonly fonts: { readonly [font: string]: AtlasFont };
  }
  /** The atlas manifest, inlined at build time. */
  export const manifest: AtlasManifest;
  /** Relative URL of each page, same order as `manifest.pages`. */
  export const pageUrls: readonly string[];
  /** Both, as one object. */
  const assets: { readonly manifest: AtlasManifest; readonly pageUrls: readonly string[] };
  export default assets;
}
