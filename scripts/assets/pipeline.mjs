/**
 * The placeholder asset pipeline (decision D24, "art as code"): sprite pixel maps,
 * procedural generators, real-art PNG overrides and bitmap fonts → packed atlas pages +
 * a JSON manifest in `assets/generated/atlas/`.
 *
 * ```
 * assets/source/sprites/**\/*.sprite.json ─┐
 * scripts/assets/procedural/*.mjs ─────────┼─► sprites ─► + PNG overrides ─► + @flash, @p2 ─┐
 * assets/source/fonts/*.font.json ─────────┘                                                │
 *                         packRects() ◄─────────────────── frames ◄─────────────────────────┘
 *                             └─► main.png (+ main-1.png …) + main.json
 * ```
 *
 * {@link buildAtlas} does the work in memory (tests use it directly);
 * {@link generateAssets} adds the disk side: an **input-hash cache** (every pipeline
 * script as loaded by this process, every source file, the zlib and pngjs versions) that
 * skips unchanged runs,
 * atomic writes (parallel builds may run it concurrently) and removal of stale pages.
 * Output is deterministic: two runs over the same inputs are byte-identical.
 *
 * **Public API.** {@link generateAssets} (disk, cached — `pnpm assets`, the Vite plugin),
 * {@link buildAtlas} (in memory), {@link collectSprites}, {@link computeInputHash},
 * {@link AssetSourceError}, {@link pageFileName}, the path constants ({@link PIPELINE_DIR},
 * {@link REPO_ROOT}, {@link DEFAULT_SOURCE_DIR}, {@link DEFAULT_OUT_DIR}, {@link ATLAS_DIR},
 * {@link ATLAS_NAME}, {@link CACHE_FILE}) and the layout constants ({@link ATLAS_PADDING},
 * {@link ATLAS_EXTRUDE}); typedef {@link GenerateResult}. Guide:
 * `docs/dev/asset-pipeline.md`.
 *
 * @module
 */
import { createHash, randomBytes } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateProceduralSprites } from './procedural/index.mjs';
import { FLASH_SUFFIX, makeFlashSprite } from './flash.mjs';
import { P2_SUFFIX, makeP2Sprite, wantsP2Variant } from './coop.mjs';
import { buildFontSprite, loadFontSources } from './font.mjs';
import { createImage, blit, getPixel, setPixel } from './image.mjs';
import { MANIFEST_FORMAT_VERSION, formatManifest, frameName } from './manifest.mjs';
import { MAX_PAGE_SIZE, packRects } from './packer.mjs';
import { encodePng } from './png.mjs';
import { applyPngOverrides, listFiles, loadSpriteSources } from './sprite-source.mjs';

/** @typedef {import('./image.mjs').Image} Image */
/** @typedef {import('./sprite-source.mjs').SpriteDef} SpriteDef */
/** @typedef {import('./sprite-source.mjs').AssetIssue} AssetIssue */
/** @typedef {import('./font.mjs').FontMetrics} FontMetrics */
/** @typedef {import('./manifest.mjs').AtlasManifest} AtlasManifest */
/** @typedef {import('./manifest.mjs').ManifestFrame} ManifestFrame */
/** @typedef {import('./manifest.mjs').ManifestSprite} ManifestSprite */

/** This directory (`scripts/assets/`): every file in it is part of the input hash. */
export const PIPELINE_DIR = dirname(fileURLToPath(import.meta.url));

/** Repository root. */
export const REPO_ROOT = join(PIPELINE_DIR, '..', '..');

/** Default sources: `assets/source/`. */
export const DEFAULT_SOURCE_DIR = join(REPO_ROOT, 'assets', 'source');

/** Default output: `assets/generated/`. */
export const DEFAULT_OUT_DIR = join(REPO_ROOT, 'assets', 'generated');

/** Sub-folder of the output directory that holds the atlas. */
export const ATLAS_DIR = 'atlas';

/** Atlas base name: pages `main.png`, `main-1.png`, …; manifest `main.json`. */
export const ATLAS_NAME = 'main';

/** Cache file (in the output directory) recording the input hash and output hashes. */
export const CACHE_FILE = '.asset-cache.json';

/** Bump to invalidate every cache when the output format changes without a code change. */
const CACHE_VERSION = 1;

/** Atlas layout: transparent pixels to the right of and below every frame's border. */
export const ATLAS_PADDING = 1;

/**
 * Atlas layout: width of the border around every frame that repeats its edge pixels, so
 * sampling at a fractional offset never picks up a neighbour (tiles, the stretched
 * `ui/pixel`). Frames can be at most `2048 - 2 * ATLAS_EXTRUDE` pixels per side.
 */
export const ATLAS_EXTRUDE = 1;

/**
 * Error thrown when source files are invalid; `issues` lists every problem and the message
 * lists them one per line (`  - <path> <message>`), ready for a terminal.
 *
 * @example
 * try {
 *   buildAtlas();
 * } catch (error) {
 *   if (error instanceof AssetSourceError) console.error(error.issues.length, error.message);
 * }
 */
export class AssetSourceError extends Error {
  /**
   * Creates the error from the collected issues.
   *
   * @param {AssetIssue[]} issues - The problems (at least one).
   */
  constructor(issues) {
    super(
      `asset sources are invalid (${issues.length} issue${issues.length === 1 ? '' : 's'}):\n` +
        issues.map((issue) => `  - ${issue.path} ${issue.message}`).join('\n'),
    );
    this.name = 'AssetSourceError';
    /**
     * Every problem found, in source order (`path` = `<file>:<json path>`).
     *
     * @type {AssetIssue[]}
     */
    this.issues = issues;
  }
}

/**
 * A path for messages: repo-relative with `/` when inside the repository, else absolute.
 *
 * @param {string} path - Absolute path.
 * @returns {string} The display form.
 */
function displayPath(path) {
  const rel = relative(REPO_ROOT, path);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return path;
  return rel.split(sep).join('/');
}

/**
 * Collects every sprite and font from the sources and generators, applies PNG overrides,
 * adds hit-flash silhouettes and resolves default anchors.
 *
 * @remarks
 * Order of work: pixel maps and procedural sprites (a name defined twice is an issue) →
 * PNG overrides by name → font sprites (`font/<name>`) → `<name>@flash` siblings for
 * `hitFlash` sprites → `<name>@p2` palette swaps of the ships and the stock icon (M2-06,
 * `coop.mjs`) → default anchors (centre of frame 0). Never throws for bad sources:
 * everything is reported in `issues`, and the caller decides ({@link buildAtlas} throws
 * {@link AssetSourceError}).
 *
 * @param {{ sourceDir?: string }} [options] - Source root (default `assets/source/`).
 * @returns {{ sprites: SpriteDef[], fonts: Record<string, FontMetrics>, issues: AssetIssue[] }}
 *   Sprites sorted by name (anchors resolved), font metrics by font name, and problems.
 */
export function collectSprites(options = {}) {
  const sourceDir = options.sourceDir ?? DEFAULT_SOURCE_DIR;
  const spritesDir = join(sourceDir, 'sprites');
  const fontsDir = join(sourceDir, 'fonts');
  const code = loadSpriteSources(spritesDir, displayPath(spritesDir));
  /** @type {AssetIssue[]} */
  const issues = [...code.issues];

  /** @type {Map<string, SpriteDef>} */
  const byName = new Map();
  /**
   * Adds a sprite, reporting a clash with an earlier definition.
   *
   * @param {SpriteDef} sprite - The sprite.
   */
  const add = (sprite) => {
    const other = byName.get(sprite.name);
    if (other !== undefined) {
      issues.push({
        path: `${sprite.origin}:name`,
        message: `sprite "${sprite.name}" is already defined by ${other.origin}`,
      });
      return;
    }
    byName.set(sprite.name, sprite);
  };
  for (const sprite of code.sprites) add(sprite);
  for (const sprite of generateProceduralSprites()) add(sprite);

  const merged = applyPngOverrides([...byName.values()], code.overrides);
  byName.clear();
  for (const sprite of merged) byName.set(sprite.name, sprite);

  const fontSources = loadFontSources(fontsDir, displayPath(fontsDir));
  issues.push(...fontSources.issues);
  /** @type {Record<string, FontMetrics>} */
  const fonts = {};
  for (const font of fontSources.fonts) {
    const { sprite, metrics } = buildFontSprite(font);
    if (byName.has(sprite.name)) {
      issues.push({
        path: `${font.origin}:name`,
        message: `font sprite "${sprite.name}" clashes with ${byName.get(sprite.name)?.origin}`,
      });
      continue;
    }
    byName.set(sprite.name, sprite);
    fonts[font.name] = metrics;
  }

  for (const sprite of [...byName.values()]) {
    if (sprite.hitFlash) {
      const flash = makeFlashSprite(sprite);
      byName.set(flash.name, flash);
    }
  }
  // Player 2's palette swap of the ships and the stock icon (plan M2-06).
  for (const sprite of [...byName.values()]) {
    if (wantsP2Variant(sprite.name)) {
      const p2 = makeP2Sprite(sprite);
      byName.set(p2.name, p2);
    }
  }

  const sprites = [...byName.values()]
    .map((sprite) =>
      sprite.anchor !== null
        ? sprite
        : {
            ...sprite,
            anchor: /** @type {[number, number]} */ ([
              Math.floor(sprite.frames[0].width / 2),
              Math.floor(sprite.frames[0].height / 2),
            ]),
          },
    )
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return { sprites, fonts, issues };
}

/**
 * Copies a frame onto a page and repeats its edge pixels into the extrusion border.
 *
 * @param {Image} page - Target page.
 * @param {Image} frame - Frame pixels.
 * @param {number} x - Frame's left column on the page.
 * @param {number} y - Frame's top row on the page.
 * @param {number} extrude - Border width.
 */
function placeFrame(page, frame, x, y, extrude) {
  blit(page, frame, x, y);
  for (let py = -extrude; py < frame.height + extrude; py++) {
    for (let px = -extrude; px < frame.width + extrude; px++) {
      if (px >= 0 && py >= 0 && px < frame.width && py < frame.height) continue;
      const sx = Math.min(Math.max(px, 0), frame.width - 1);
      const sy = Math.min(Math.max(py, 0), frame.height - 1);
      setPixel(page, x + px, y + py, getPixel(frame, sx, sy));
    }
  }
}

/**
 * File name of page `index`.
 *
 * @param {number} index - Page index.
 * @returns {string} `main.png`, `main-1.png`, …
 */
export const pageFileName = (index) =>
  index === 0 ? `${ATLAS_NAME}.png` : `${ATLAS_NAME}-${index}.png`;

/**
 * Builds the atlas in memory.
 *
 * @param {{ sourceDir?: string, maxPageSize?: number }} [options] - Source root and
 *   page-size limit (power of two, default 2048).
 * @returns {{ manifest: AtlasManifest, pages: { file: string, image: Image, png: Buffer }[],
 *   sprites: SpriteDef[] }} The manifest, the pages (pixels + PNG bytes) and the sprites.
 * @throws {AssetSourceError} When any source file is invalid, or a frame is too large for
 *   an atlas page.
 * @throws {RangeError} When `maxPageSize` is not a power of two.
 *
 * @example
 * const { manifest, pages } = buildAtlas();
 * manifest.sprites['ships/kestrel'].frames; // → ['ships/kestrel#0', 'ships/kestrel#1', …]
 */
export function buildAtlas(options = {}) {
  const collected = collectSprites(options);
  if (collected.issues.length > 0) throw new AssetSourceError(collected.issues);
  const sprites = collected.sprites;
  const maxPageSize = options.maxPageSize ?? MAX_PAGE_SIZE;

  // A frame that cannot fit a page (real art can be any size) is a source problem: report
  // it with its file instead of letting the packer throw a bare RangeError.
  const limit = maxPageSize - 2 * ATLAS_EXTRUDE;
  /** @type {AssetIssue[]} */
  const oversized = [];
  for (const sprite of sprites) {
    // Generated siblings are reported for their source sprite.
    if (sprite.name.endsWith(FLASH_SUFFIX) || sprite.name.endsWith(P2_SUFFIX)) continue;
    sprite.frames.forEach((frame, i) => {
      if (frame.width > limit || frame.height > limit) {
        oversized.push({
          path: `${sprite.origin}:frames[${i}]`,
          message:
            `sprite "${sprite.name}" frame ${i} is ${frame.width}×${frame.height}; frames can ` +
            `be at most ${limit}×${limit} (a ${maxPageSize}² atlas page minus the ` +
            `${ATLAS_EXTRUDE}-px border)`,
        });
      }
    });
  }
  if (oversized.length > 0) throw new AssetSourceError(oversized);

  const items = sprites.flatMap((sprite) =>
    sprite.frames.map((frame, i) => ({
      name: frameName(sprite.name, i),
      w: frame.width,
      h: frame.height,
    })),
  );
  const packing = packRects(items, {
    maxSize: maxPageSize,
    padding: ATLAS_PADDING,
    extrude: ATLAS_EXTRUDE,
  });
  const pageImages = packing.pages.map((page) => createImage(page.w, page.h));

  /** @type {Record<string, ManifestFrame>} */
  const frames = {};
  /** @type {Record<string, ManifestSprite>} */
  const spriteTable = {};
  /** @type {Record<string, Record<string, number[]>>} */
  const animations = {};
  const flashNames = new Set(sprites.filter((s) => s.hitFlash).map((s) => s.name));
  let item = 0;
  for (const sprite of sprites) {
    const anchor = /** @type {[number, number]} */ (sprite.anchor);
    const names = [];
    for (const frame of sprite.frames) {
      const placed = packing.placements[item++];
      placeFrame(pageImages[placed.p], frame, placed.x, placed.y, ATLAS_EXTRUDE);
      frames[placed.name] = {
        p: placed.p,
        x: placed.x,
        y: placed.y,
        w: placed.w,
        h: placed.h,
        ax: anchor[0],
        ay: anchor[1],
      };
      names.push(placed.name);
    }
    spriteTable[sprite.name] = {
      frames: names,
      flash: flashNames.has(sprite.name) ? `${sprite.name}@flash` : null,
    };
    const tags = Object.keys(sprite.animations).sort();
    if (tags.length > 0) {
      /** @type {Record<string, number[]>} */
      const table = {};
      for (const tag of tags) table[tag] = sprite.animations[tag].slice();
      animations[sprite.name] = table;
    }
  }

  /** @type {Record<string, FontMetrics>} */
  const fonts = {};
  for (const name of Object.keys(collected.fonts).sort()) fonts[name] = collected.fonts[name];

  const pages = pageImages.map((image, index) => ({
    file: pageFileName(index),
    image,
    png: encodePng(image),
  }));
  /** @type {AtlasManifest} */
  const manifest = {
    formatVersion: MANIFEST_FORMAT_VERSION,
    pages: pages.map((page) => ({ file: page.file, w: page.image.width, h: page.image.height })),
    frames,
    sprites: spriteTable,
    animations,
    fonts,
  };
  return { manifest, pages, sprites };
}

/**
 * Feeds every file below `dir` (sorted, with its path and length) into `hash`.
 *
 * @param {import('node:crypto').Hash} hash - Running hash.
 * @param {string} label - Prefix that keeps the trees apart (`pipeline`, `sprites`, …).
 * @param {string} dir - Directory (missing → nothing).
 * @param {boolean} skipDocs - Skip `*.md` and `.gitkeep` (documentation, not input).
 */
function hashTree(hash, label, dir, skipDocs) {
  for (const file of listFiles(dir)) {
    const base = file.slice(file.lastIndexOf('/') + 1);
    if (skipDocs && (base.endsWith('.md') || base === '.gitkeep')) continue;
    const bytes = readFileSync(join(dir, file));
    hash.update(`${label}/${file}\0${bytes.length}\0`);
    hash.update(bytes);
  }
}

/**
 * Hash of the code this process runs: the pipeline scripts (`scripts/assets/**`) as they
 * were **when this module was loaded**, plus the zlib (deflate output) and pngjs
 * (decoding) versions.
 *
 * @remarks
 * Snapshotted once on purpose. A long-lived importer (the `pnpm dev` server) keeps
 * running the modules it loaded even after a pipeline script is edited on disk; hashing
 * the files anew on every run would record the new code's hash next to pixels drawn by
 * the old code, and every later run would take that stale atlas for current. With the
 * snapshot, such a process keeps writing (and cache-hitting) under its own code's hash,
 * and the next fresh process sees a different hash and rebuilds. Node reads the modules
 * just before this runs, so only an edit within those milliseconds could slip through.
 */
const CODE_HASH = (() => {
  const hash = createHash('sha256');
  const pngjsVersion = /** @type {{ version: string }} */ (
    createRequire(import.meta.url)('pngjs/package.json')
  ).version;
  hash.update(`zlib ${process.versions.zlib}\0pngjs ${pngjsVersion}\0`);
  hashTree(hash, 'pipeline', PIPELINE_DIR, false);
  return hash.digest('hex');
})();

/**
 * Hashes everything that can change the pipeline's output.
 *
 * @param {string} [sourceDir] - Source root (default `assets/source/`).
 * @returns {string} Hex SHA-256 of the loaded pipeline code (see {@link CODE_HASH}: the
 *   scripts as loaded by this process, the zlib and pngjs versions) and of the sprite and
 *   font sources as they are on disk now.
 */
export function computeInputHash(sourceDir = DEFAULT_SOURCE_DIR) {
  const hash = createHash('sha256');
  hash.update(`shmup-assets cache ${CACHE_VERSION}\0code ${CODE_HASH}\0`);
  hashTree(hash, 'sprites', join(sourceDir, 'sprites'), true);
  hashTree(hash, 'fonts', join(sourceDir, 'fonts'), true);
  return hash.digest('hex');
}

/**
 * Writes a file atomically (temp file + rename), so a concurrent reader never sees a
 * half-written file and concurrent writers of identical bytes cannot corrupt it.
 *
 * @param {string} file - Target path.
 * @param {string | Uint8Array} contents - Bytes or UTF-8 text.
 */
function writeAtomic(file, contents) {
  const temp = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  writeFileSync(temp, contents);
  try {
    renameSync(temp, file);
  } catch (error) {
    rmSync(temp, { force: true });
    throw error;
  }
}

/**
 * SHA-256 of a byte string.
 *
 * @param {string | Uint8Array} bytes - Input.
 * @returns {string} Hex digest.
 */
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/**
 * Result of {@link generateAssets}.
 *
 * @typedef {object} GenerateResult
 * @property {boolean} cached - `true` when the inputs were unchanged and nothing was written.
 * @property {string} inputHash - The input hash the outputs correspond to.
 * @property {AtlasManifest} manifest - The atlas manifest.
 * @property {string} atlasDir - Absolute directory holding the pages and `main.json`.
 * @property {string[]} files - Written/verified files relative to the output directory
 *   (`atlas/main.png`, …, `atlas/main.json`).
 */

/**
 * Runs the pipeline to disk, skipping the work when nothing changed.
 *
 * @remarks
 * Skips when the cache file records the same input hash and every recorded output still
 * exists with the recorded SHA-256 (a deleted or edited output forces a rebuild). Stale
 * pages from a previous, larger atlas are removed.
 *
 * @param {{ sourceDir?: string, outDir?: string, force?: boolean,
 *   log?: (message: string) => void }} [options] - Source root, output root
 *   (default `assets/generated/`), `force` to ignore the cache, and a logger.
 * @returns {GenerateResult} What was produced.
 * @throws {AssetSourceError} When a source file is invalid (nothing is written).
 *
 * @example
 * const { cached, manifest } = generateAssets(); // `pnpm assets`
 */
export function generateAssets(options = {}) {
  const sourceDir = options.sourceDir ?? DEFAULT_SOURCE_DIR;
  const outDir = options.outDir ?? DEFAULT_OUT_DIR;
  const log = options.log ?? (() => {});
  const atlasDir = join(outDir, ATLAS_DIR);
  const cacheFile = join(outDir, CACHE_FILE);
  const inputHash = computeInputHash(sourceDir);
  const manifestRel = `${ATLAS_DIR}/${ATLAS_NAME}.json`;

  if (options.force !== true && existsSync(cacheFile)) {
    try {
      const cache = JSON.parse(readFileSync(cacheFile, 'utf8'));
      const outputs = /** @type {Record<string, string>} */ (cache.outputs ?? {});
      const intact =
        cache.version === CACHE_VERSION &&
        cache.inputHash === inputHash &&
        manifestRel in outputs &&
        Object.entries(outputs).every(([file, digest]) => {
          const path = join(outDir, file);
          return existsSync(path) && sha256(readFileSync(path)) === digest;
        });
      if (intact) {
        const manifest = JSON.parse(readFileSync(join(outDir, manifestRel), 'utf8'));
        log(`assets up to date (${displayPath(atlasDir)}/, input ${inputHash.slice(0, 12)})`);
        return { cached: true, inputHash, manifest, atlasDir, files: Object.keys(outputs) };
      }
    } catch {
      // Unreadable cache or outputs: rebuild below.
    }
  }

  const { manifest, pages } = buildAtlas({ sourceDir });
  mkdirSync(atlasDir, { recursive: true });
  /** @type {Record<string, string>} */
  const outputs = {};
  for (const page of pages) {
    writeAtomic(join(atlasDir, page.file), page.png);
    outputs[`${ATLAS_DIR}/${page.file}`] = sha256(page.png);
  }
  const json = formatManifest(manifest);
  writeAtomic(join(outDir, manifestRel), json);
  outputs[manifestRel] = sha256(json);

  const keep = new Set(pages.map((page) => page.file));
  for (const entry of readdirSync(atlasDir)) {
    if (/^main(-\d+)?\.png$/.test(entry) && !keep.has(entry)) {
      try {
        unlinkSync(join(atlasDir, entry));
      } catch {
        // Already removed by a concurrent run.
      }
    }
  }
  writeAtomic(
    cacheFile,
    JSON.stringify({ version: CACHE_VERSION, inputHash, outputs }, null, 2) + '\n',
  );
  const frameCount = Object.keys(manifest.frames).length;
  const spriteCount = Object.keys(manifest.sprites).length;
  const pageList = manifest.pages.map((page) => `${page.file} ${page.w}×${page.h}`).join(', ');
  log(
    `assets generated → ${displayPath(atlasDir)}/: ${pageList}; ${spriteCount} sprites, ` +
      `${frameCount} frames, ${Object.keys(manifest.fonts).length} font(s)`,
  );
  return { cached: false, inputHash, manifest, atlasDir, files: Object.keys(outputs) };
}
