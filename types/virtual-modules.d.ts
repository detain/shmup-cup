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
 * Where the texture-atlas manifest is fetched from, and its digest (plan R1-05): what the apps
 * import. The asset pipeline (`pnpm assets`, `scripts/assets/`) writes the manifest and the
 * pages; the `shmupAssets()` plugin ships them in `assets/atlas/` and serves this module.
 *
 * @remarks
 * Until R1-05 the manifest was **inlined** into `app.js` (decision D25 — no `fetch()` on the TV);
 * it now ships as `assets/atlas/main.json` and the shell loads it with `XMLHttpRequest`, which
 * works from `file://` (status 0), checks `manifestDigest` and then loads the pages from
 * `atlasDir`. The inlined form is still served as `virtual:shmup-assets-inline` (the render bench,
 * and the TV fallback — W3-7). Format: `scripts/assets/manifest.mjs`.
 *
 * @example
 * ```ts
 * import assets from 'virtual:shmup-assets';
 *
 * // assets → { manifestUrl: 'assets/atlas/main.json', atlasDir: 'assets/atlas', manifestDigest }
 * await bootShell({ …, assets });
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
    /**
     * The page's group (manifest format 2, plan R1-05): `common` — page 0, `main.png` — or a zone
     * (`zone-a` …). Absent in format 1.
     */
    readonly group?: string;
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
    /** Manifest format version: 1, or 2 since R1-05 (pages carry their `group`). */
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
  /** The manifest's URL, relative to the page (`assets/atlas/main.json`). */
  export const manifestUrl: string;
  /** The folder of the atlas pages, relative to the page (`assets/atlas`). */
  export const atlasDir: string;
  /** 32-bit FNV-1a of the shipped manifest's bytes, 8 hex digits (`vite.shared.ts`). */
  export const manifestDigest: string;
  /** All three, as one object (what the apps hand to `bootShell`). */
  const assets: {
    readonly manifestUrl: string;
    readonly atlasDir: string;
    readonly manifestDigest: string;
  };
  export default assets;
}

/**
 * The texture-atlas manifest **inlined** at build time, and the page URLs — what
 * `virtual:shmup-assets` served until plan R1-05.
 *
 * @remarks
 * Read by the render bench harness (`test/bench/render-harness/main.ts`), and the TV apps'
 * fallback should `file://` XHR of the manifest ever fail on a set (W3-7: switch the app's one
 * import line to this module). The pages are separate PNGs next to the bundle, loaded with
 * `new Image()` from the relative `pageUrls` (`assets/atlas/main.png`, …).
 *
 * @example
 * ```ts
 * import { manifest, pageUrls } from 'virtual:shmup-assets-inline';
 *
 * const kestrel = manifest.sprites['ships/kestrel']; // → { frames: [...], flash: null }
 * const frame = manifest.frames[kestrel.frames[0]]; // → { p, x, y, w, h, ax, ay }
 * ```
 */
declare module 'virtual:shmup-assets-inline' {
  import type { AtlasManifest } from 'virtual:shmup-assets';
  /** The atlas manifest, inlined at build time. */
  export const manifest: AtlasManifest;
  /** Relative URL of each page, same order as `manifest.pages`. */
  export const pageUrls: readonly string[];
  /** Both, as one object. */
  const assets: { readonly manifest: AtlasManifest; readonly pageUrls: readonly string[] };
  export default assets;
}
