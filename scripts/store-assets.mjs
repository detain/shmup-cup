#!/usr/bin/env node
/**
 * `pnpm store:assets` — the icon set and the store-listing assets of the release candidate
 * (plan M2-18, R4-05.E5 / RR-3, shmup_feat.md §23 "store", shmup_tech.md §2.6).
 *
 * Since the v20x-A2 round the **icons and the key art** are derived from the art round's chosen
 * winners — the `art-prompts/v2/winners/` logo, promo and poster stills — by the numeric,
 * deterministic resampling of `scripts/assets/resample.mjs` (area downscale, contain fit on the
 * playfield navy, median-cut to ≤ 256 colours, indexed PNG-8). That is the owner's dated §1.5
 * waiver of **2026-10-27** (ruling "a2"), which covers the **store and icon surfaces only**: every
 * in-game law stands — the atlas stays the repo's own placeholder generators, and the four
 * placeholder screenshots below are still drawn from it, captioned `PLACEHOLDER`, until real
 * captures come off the monitors. {@link KEY_ART_WAIVER} carries the quote into every provenance
 * record; {@link staleRecords} ties every derived file to the SHA-256 of the source bytes it was
 * rendered from, so a moved winners file fails `--check` instead of silently shifting the art.
 *
 * - **Icons and key art (committed)** — {@link ICON_TARGETS}: the Tizen widget / Seller Office icon
 *   `apps/tizen/public/icon.png` (512 × 423, copied into the widget by Vite), the desktop app's
 *   icon `apps/electron/build/icon.png` (512 × 512, electron-builder's `build/` resources) and the
 *   LG webOS app's `apps/webos/public/icon.png` (80 × 80) and `largeIcon.png` (130 × 130, M3-03,
 *   the sizes `appinfo.json` names) — all fitted from {@link KEY_ART}'s `app-icon` source; and one
 *   provenance record per source under `assets/source/store/` (schema `shmup-store-art@1`). A test
 *   (`test/scripts/store-assets.test.ts`) renders them again and compares the pixels, so a change
 *   to the sources or to this script shows up as a failing test until the files are regenerated.
 * - **Store-listing images (generated, ignored)** — `assets/generated/store/`: one product per key
 *   art source (the capsule, the website hero, the wide banner, the eleven zone posters at half
 *   size, and the icon's store copy), the {@link SCREENSHOTS} placeholder screenshots at
 *   1920 × 1080 (the game's frame — `FRAME_W` × `FRAME_H` of `scripts/frame.mjs`, 640 × 360 since
 *   R2-01 — at {@link SCREENSHOT_SCALE}, each captioned `PLACEHOLDER`) and `listing.json`
 *   ({@link buildStoreListing}: the name, the texts, the category, the image list with its sizes).
 *   The products' sizes are derived from the decoded sources, never written down. They stand until
 *   a store asks for sizes this pipeline does not make; check them against the Seller Office's
 *   current requirements before a submission (the manual checklist, plan §8.6).
 *
 * Every resample is IEEE-754 reproducible (fixed accumulation order, `Math.round` half up), so the
 * output bytes are the same on every machine.
 *
 * Usage:
 *   node scripts/store-assets.mjs            write the icons, the records and the store folder
 *   node scripts/store-assets.mjs --check    exit 1 when a committed icon or record is stale
 *   node scripts/store-assets.mjs --out DIR  write the store folder to DIR
 *
 * @module
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createImage, imagesEqual } from './assets/image.mjs';
import { REPO_ROOT, collectSprites } from './assets/pipeline.mjs';
import { decodePng, encodePng } from './assets/png.mjs';
import { downscaleArea, fitContain, medianCutPalette, quantize } from './assets/resample.mjs';
import { FRAME_H, FRAME_W, HUD_BAR_HEIGHT, HUD_BOTTOM_Y, WORLD_SCALE } from './frame.mjs';

/** @typedef {import('./assets/image.mjs').Image} Image */
/** @typedef {import('./assets/image.mjs').Rgba} Rgba */

/** Where `pnpm store:assets` writes the store-listing images. */
export const STORE_DIR = join(REPO_ROOT, 'assets', 'generated', 'store');

/** Where the committed provenance records of the key art live (root-relative). */
export const KEY_ART_RECORD_DIR = 'assets/source/store';

/** The schema id of those records (this pipeline's own, beside the ingest tool's sprite records). */
export const STORE_ART_SCHEMA = 'shmup-store-art@1';

/**
 * Whole-number scale of a placeholder screenshot: the largest that fits the frame into the
 * stores' 1920 × 1080 (× 5 at 384 × 216, × 3 at 640 × 360 — both fill it exactly).
 */
const SCREENSHOT_SCALE = Math.min(Math.floor(1920 / FRAME_W), Math.floor(1080 / FRAME_H));

/**
 * The committed icons: repository path, size. The Tizen icon's 512 × 423 is the aspect the widget
 * and the Seller Office use; electron-builder takes a square 512 × 512.
 */
export const ICON_TARGETS = Object.freeze([
  Object.freeze({ path: 'apps/tizen/public/icon.png', width: 512, height: 423 }),
  Object.freeze({ path: 'apps/electron/build/icon.png', width: 512, height: 512 }),
  // M3-03, the LG webOS app: `appinfo.json`'s `icon` (80 x 80) and `largeIcon` (130 x 130) — the
  // sizes LG's web-app contract asks for. They are committed like the other two and copied into
  // `dist/` by Vite's `public/` handling.
  Object.freeze({ path: 'apps/webos/public/icon.png', width: 80, height: 80 }),
  Object.freeze({ path: 'apps/webos/public/largeIcon.png', width: 130, height: 130 }),
]);

/** The placeholder screenshots: the zone backdrop, the boss hull, the ship, the caption. */
export const SCREENSHOTS = Object.freeze([
  Object.freeze({
    zone: 'AZURE VERGE',
    backdrop: 'bg/azure-verge',
    boss: 'bosses/bulwark-hull',
    ship: 'ships/kestrel',
  }),
  Object.freeze({
    zone: 'BRINE NEBULA',
    backdrop: 'bg/brine-nebula',
    boss: 'bosses/maw-hull',
    ship: 'ships/manta',
  }),
  Object.freeze({
    zone: 'MAGMA DEEP',
    backdrop: 'bg/magma-peaks',
    boss: 'bosses/bastion-hull',
    ship: 'ships/kestrel',
  }),
  Object.freeze({
    zone: 'IRON CITADEL',
    backdrop: 'bg/citadel-wall',
    boss: 'bosses/sovereign-hull',
    ship: 'ships/manta',
  }),
]);

/**
 * The owner's dated §1.5 waiver this pipeline works under (the v20x round, ruling "a2"). The quote
 * rides into every provenance record: the store and icon surfaces may wear the art round's chosen
 * stills; nothing in the game's own atlas does.
 */
export const KEY_ART_WAIVER = Object.freeze({
  date: '2026-10-27',
  ruling: 'a2',
  scope: 'store and icon surfaces only — every in-game law of plan §1.5 stands untouched',
  quote:
    "the owner's a2 pick = dated §1.5 waiver for STORE/ICON surfaces ONLY " +
    '(in-game atlas laws untouched)',
});

/**
 * One chosen marketing still and the products derived from it.
 *
 * @typedef {{ slug: string, source: string, use: string, kind: 'icons' | 'promo' | 'poster' }}
 *   KeyArtSource
 */

/** The eleven zone posters, by their stage-folder slug (alphabetical). */
const POSTER_ZONES = Object.freeze([
  'abyssal-throne',
  'azure-verge',
  'brine-nebula',
  'cell-vault',
  'dune-expanse',
  'escape-corridor',
  'high-speed-dimension',
  'iron-citadel',
  'magma-deep',
  'prism-labyrinth',
  'tempest-ridge',
]);

/** The root-relative folder the round commits its winners into. */
const WINNERS_DIR = 'art-prompts/v2/winners';

/**
 * The key art of the store surfaces: every committed icon and every listing image traces to one of
 * these sources. `icons` sources also feed the four committed {@link ICON_TARGETS}; `promo` sources
 * ship at native size; `poster` sources at half.
 *
 * @type {ReadonlyArray<KeyArtSource>}
 */
export const KEY_ART = Object.freeze([
  Object.freeze({
    slug: 'app-icon',
    source: `${WINNERS_DIR}/logo/app-icon/winner.png`,
    use: 'app icon',
    kind: 'icons',
  }),
  Object.freeze({
    slug: 'capsule',
    source: `${WINNERS_DIR}/promo/store-capsule/winner.png`,
    use: 'capsule',
    kind: 'promo',
  }),
  Object.freeze({
    slug: 'capsule-no-text',
    source: `${WINNERS_DIR}/promo/store-capsule/no-text/winner.png`,
    use: 'capsule without lettering',
    kind: 'promo',
  }),
  Object.freeze({
    slug: 'website-hero',
    source: `${WINNERS_DIR}/promo/website-hero/winner.png`,
    use: 'website hero',
    kind: 'promo',
  }),
  Object.freeze({
    slug: 'wide-banner',
    source: `${WINNERS_DIR}/promo/wide-banner/winner.png`,
    use: 'wide banner',
    kind: 'promo',
  }),
  ...POSTER_ZONES.map((zone) =>
    Object.freeze({
      slug: `poster-${zone}`,
      source: `${WINNERS_DIR}/stage/${zone}/poster/winner.png`,
      use: `zone poster (${zone})`,
      kind: 'poster',
    }),
  ),
]);

/**
 * The listing's texts (placeholders where the prose still waits — original names only,
 * shmup_feat.md §26). The image list is never static: {@link buildStoreListing} derives it (and
 * every size in it) from the decoded sources.
 */
export const STORE_TEXTS = Object.freeze({
  name: 'Shmup Cup',
  version: '2.1.0',
  category: 'Games / Action',
  shortDescription: 'A remote-friendly horizontal shoot-them-up across a nine-zone map.',
  description:
    'Pilot the KESTREL or the MANTA through nine hand-built zones — five per run, sixteen ' +
    'routes, two endings. Everything plays with the TV remote alone: the ship fires on its own, ' +
    'OK equips power-ups, and every pattern can be dodged with four directions. Gamepads and ' +
    'two-player co-op are supported. PLACEHOLDER TEXT — to be written before submission.',
  keywords: ['shooter', 'shmup', 'arcade', 'retro', 'co-op'],
  ageRating: 'to be decided (fantasy violence, no blood)',
  placeholder: true,
});

/** Background colour: the deep navy of the playfield (also the icons' pad). */
const NAVY = /** @type {Rgba} */ ([0x0a, 0x10, 0x2a, 0xff]);
/** Background colour: the playfield's lighter lower band and the screenshots' frame bars. */
const NAVY_LIGHT = /** @type {Rgba} */ ([0x1d, 0x2a, 0x5c, 0xff]);
/** Ink of the screenshots' `PLACEHOLDER` caption. */
const CAPTION = /** @type {Rgba} */ ([0xf8, 0xd0, 0x30, 0xff]);
/** Ink of the screenshots' zone name. */
const WHITE = /** @type {Rgba} */ ([0xff, 0xff, 0xff, 0xff]);

/**
 * The sprites and fonts of the placeholder art, collected once per process.
 *
 * @type {{ frames: Map<string, Image[]>, font: { glyphs: Record<string, { frame: string, advance: number }>, cellWidth: number, cellHeight: number } } | null}
 */
let art = null;

/**
 * The placeholder art: every sprite's frames by name and the bitmap font's metrics.
 *
 * @returns {{ frames: Map<string, Image[]>, font: { glyphs: Record<string, { frame: string, advance: number }>, cellWidth: number, cellHeight: number } }}
 *   The art.
 * @throws {Error} When the sources have issues or the font is missing.
 */
function loadArt() {
  if (art !== null) return art;
  // The v2 art: `collectSprites()` at its default interim art scale (R4-05.E5 / RR-3 moved the
  // screenshots' scenes off `artScale: 1`). The layouts below derive their sizes from the art and
  // from `scripts/frame.mjs`, never from a literal frame number.
  const { sprites, fonts, issues } = collectSprites();
  if (issues.length > 0) throw new Error(`asset sources have issues: ${issues[0].message}`);
  const frames = new Map(sprites.map((sprite) => [sprite.name, sprite.frames]));
  const font = fonts.pixel;
  if (font === undefined) throw new Error('the bitmap font "pixel" is missing');
  art = { frames, font };
  return art;
}

/** The decoded key-art stills, one decode per source path per process. */
const decodedSources = new Map();

/**
 * Reads one key-art source: its bytes, and the sidecar `winner.json` beside it.
 *
 * @param {KeyArtSource} entry - The source.
 * @returns {{ image: Image, bytes: Buffer, sidecar: Record<string, unknown> }} Decoded still, raw
 *   bytes and sidecar.
 * @throws {Error} When a winner or its sidecar is missing or unreadable.
 */
function loadSource(entry) {
  const cached = decodedSources.get(entry.source);
  if (cached !== undefined) return cached;
  const file = join(REPO_ROOT, entry.source);
  if (!existsSync(file)) throw new Error(`key art source ${entry.source} is missing`);
  const bytes = readFileSync(file);
  const sidecarFile = join(REPO_ROOT, dirname(entry.source), 'winner.json');
  if (!existsSync(sidecarFile)) {
    throw new Error(`the sidecar of ${entry.source} is missing`);
  }
  const sidecar = JSON.parse(readFileSync(sidecarFile, 'utf8'));
  const image = decodePng(bytes);
  const source = { image, bytes, sidecar };
  decodedSources.set(entry.source, source);
  return source;
}

/**
 * The model table of the ingest tool (`art-prompts/ingest/models.json`): each model key's served
 * id and licence id — the records quote it rather than restate it.
 *
 * @type {Record<string, { id: string, licence: string | null }> | null}
 */
let modelTable = null;

/**
 * The ingest tool's model table, read once.
 *
 * @returns {Record<string, { id: string, licence: string | null }>} The models by key.
 * @throws {Error} When the table is unreadable.
 */
function loadModels() {
  if (modelTable !== null) return modelTable;
  const file = join(REPO_ROOT, 'art-prompts', 'ingest', 'models.json');
  const { models } = JSON.parse(readFileSync(file, 'utf8'));
  modelTable = models;
  return models;
}

/**
 * A sprite's frame.
 *
 * @param {string} name - Sprite name.
 * @param {number} [frame] - Frame index (default 0).
 * @returns {Image} The frame.
 * @throws {Error} When the sprite does not exist.
 */
function sprite(name, frame = 0) {
  const frames = loadArt().frames.get(name);
  if (frames === undefined) throw new Error(`sprite "${name}" is not in the atlas sources`);
  return frames[Math.min(frame, frames.length - 1)];
}

/**
 * Fills a rectangle (clipped to the image).
 *
 * @param {Image} image - Target.
 * @param {number} x - Left.
 * @param {number} y - Top.
 * @param {number} w - Width.
 * @param {number} h - Height.
 * @param {Rgba} rgba - Colour.
 */
function fill(image, x, y, w, h, rgba) {
  const x0 = Math.max(0, x);
  const y0 = Math.max(0, y);
  const x1 = Math.min(image.width, x + w);
  const y1 = Math.min(image.height, y + h);
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) image.data.set(rgba, (py * image.width + px) * 4);
  }
}

/**
 * Draws a frame scaled by a whole factor, alpha-tested (a pixel is copied when its alpha is at
 * least half), optionally tinted (channels multiplied), clipped to the image.
 *
 * @param {Image} target - Target.
 * @param {Image} source - The frame.
 * @param {number} x - Left of the drawn frame.
 * @param {number} y - Top of the drawn frame.
 * @param {number} scale - Whole scale factor ≥ 1.
 * @param {Rgba | null} [tint] - Multiplied colour (`null` = none).
 */
function draw(target, source, x, y, scale, tint = null) {
  for (let sy = 0; sy < source.height; sy++) {
    for (let sx = 0; sx < source.width; sx++) {
      const i = (sy * source.width + sx) * 4;
      if (source.data[i + 3] < 128) continue;
      /** @type {Rgba} */
      const rgba = [source.data[i], source.data[i + 1], source.data[i + 2], 0xff];
      if (tint !== null) {
        for (let c = 0; c < 3; c++) rgba[c] = Math.floor((rgba[c] * tint[c]) / 255);
      }
      fill(target, x + sx * scale, y + sy * scale, scale, scale, rgba);
    }
  }
}

/**
 * The width of a text in the bitmap font at scale 1.
 *
 * @param {string} text - The text (characters the font lacks advance by its cell width).
 * @returns {number} Pixels.
 */
function textWidth(text) {
  const { glyphs, cellWidth } = loadArt().font;
  let width = 0;
  for (const char of text) width += glyphs[String(char.codePointAt(0))]?.advance ?? cellWidth;
  return width;
}

/**
 * Draws a text in the bitmap font.
 *
 * @param {Image} target - Target.
 * @param {string} text - The text.
 * @param {number} x - Left.
 * @param {number} y - Top.
 * @param {number} scale - Whole scale factor.
 * @param {Rgba} color - Ink colour.
 */
function drawText(target, text, x, y, scale, color) {
  const { glyphs, cellWidth } = loadArt().font;
  const frames = loadArt().frames.get('font/pixel') ?? [];
  let pen = x;
  for (const char of text) {
    const glyph = glyphs[String(char.codePointAt(0))];
    if (glyph !== undefined) {
      const index = Number(glyph.frame.slice(glyph.frame.indexOf('#') + 1));
      draw(target, frames[index], pen, y, scale, color);
    }
    pen += (glyph?.advance ?? cellWidth) * scale;
  }
}

/**
 * Tiles a sprite across a band of the image, scaled.
 *
 * @param {Image} target - Target.
 * @param {string} name - Sprite name.
 * @param {number} y - Top of the band.
 * @param {number} scale - Whole scale factor.
 */
function tile(target, name, y, scale) {
  const frame = sprite(name);
  for (let x = 0; x < target.width; x += frame.width * scale) draw(target, frame, x, y, scale);
}

/**
 * Paints the navy playfield: two tones in horizontal bands and the far star field. The rows step by
 * the star field's own height at the loaded art scale (R4-05.E5: derived from the art, not the v1
 * sheet's 128), so the field tiles without overlap at either scale.
 *
 * @param {Image} image - Target.
 * @param {number} scale - Scale of the stars.
 */
function backdrop(image, scale) {
  fill(image, 0, 0, image.width, image.height, NAVY);
  const band = Math.floor(image.height / 3);
  fill(image, 0, band * 2, image.width, image.height - band * 2, NAVY_LIGHT);
  const starRow = sprite('bg/stars-far').height * scale;
  for (let y = 0; y < image.height; y += starRow) tile(image, 'bg/stars-far', y, scale);
}

/**
 * Resamples the `app-icon` still into an icon of the requested size: contain-fit on the playfield
 * navy (the 512 × 423 TV aspect pillarboxes; the square targets fill), then the median-cut to the
 * PNG-8 palette, exactly as {@link writeStoreAssets} encodes it.
 *
 * @param {number} width - Width in pixels (a positive integer the source can shrink to).
 * @param {number} height - Height in pixels (a positive integer the source can shrink to).
 * @returns {Image} The icon, opaque.
 * @throws {RangeError} When the box would enlarge the source (see
 *   {@link fitContain}).
 *
 * @example
 * ```js
 * const png = encodePng(renderIcon(512, 423), { indexed: 'auto' }); // the Tizen widget icon
 * ```
 */
export function renderIcon(width, height) {
  const { image } = loadSource(KEY_ART[0]);
  return quantizeToPalette(fitContain(image, width, height, NAVY));
}

/**
 * Median-cut quantisation of a product: the palette is cut from the image itself, so a flat pad
 * stays exact and a detailed still lands inside the PNG-8 cap.
 *
 * @param {Image} image - The resampled still (not modified).
 * @returns {Image} The same pixels on at most 256 colours.
 */
function quantizeToPalette(image) {
  return quantize(image, medianCutPalette(image));
}

/**
 * The store product one source drives, without rendering it: file name (its size derived from the
 * decoded source — nothing written down), listing use and dimensions.
 *
 * @param {KeyArtSource} entry - The source.
 * @returns {{ file: string, use: string, width: number, height: number }} The spec.
 * @throws {Error} When a source or sidecar is missing (see {@link loadSource}).
 */
function productSpec(entry) {
  const { image } = loadSource(entry);
  if (entry.kind === 'icons') {
    const tv = ICON_TARGETS[0];
    return {
      file: `icon-${tv.width}x${tv.height}.png`,
      use: entry.use,
      width: tv.width,
      height: tv.height,
    };
  }
  if (entry.kind === 'promo') {
    return {
      file: `${entry.slug}-${image.width}x${image.height}.png`,
      use: entry.use,
      width: image.width,
      height: image.height,
    };
  }
  const width = Math.floor(image.width / 2);
  const height = Math.floor(image.height / 2);
  return { file: `${entry.slug}-${width}x${height}.png`, use: entry.use, width, height };
}

/**
 * Renders one product's pixels: the icon copy through {@link renderIcon}, every promo still
 * quantised at native size, every poster area-downscaled to half first.
 *
 * @param {KeyArtSource} entry - The source.
 * @param {{ width: number, height: number }} spec - Its (already decoded) dimensions.
 * @returns {Image} The product.
 */
function renderProduct(entry, spec) {
  const { image } = loadSource(entry);
  if (entry.kind === 'icons') return renderIcon(spec.width, spec.height);
  if (entry.kind === 'promo') return quantizeToPalette(image);
  return quantizeToPalette(downscaleArea(image, spec.width, spec.height));
}

/**
 * The products derived from {@link KEY_ART} for the store folder, in table order: the icon's store
 * copy at the Tizen target's size, every promo still native, every poster at half, each quantised.
 *
 * @returns {{ file: string, use: string, image: Image }[]} The products.
 * @throws {Error} When a source or sidecar is missing (see {@link loadSource}).
 */
export function renderKeyArtProducts() {
  return KEY_ART.map((entry) => {
    const spec = productSpec(entry);
    return { file: spec.file, use: spec.use, image: renderProduct(entry, spec) };
  });
}

/**
 * Renders one placeholder screenshot: a scene the size of the game's frame (the zone's backdrop
 * band, its boss's hull, the ship, the caption `PLACEHOLDER` and the zone's name) scaled by
 * {@link SCREENSHOT_SCALE} — 640 × 360 × 3 = 1920 × 1080 (384 × 216 × 5 in v1). The screenshots
 * stay atlas-drawn placeholders: the §1.5 waiver covers the store and icon surfaces, not what the
 * game itself shows.
 *
 * @param {number} index - Index into {@link SCREENSHOTS}.
 * @returns {Image} The screenshot.
 * @throws {RangeError} For an index outside {@link SCREENSHOTS}.
 * @throws {Error} When the asset sources have issues or a sprite / the bitmap font is missing.
 */
export function renderScreenshot(index) {
  const shot = SCREENSHOTS[index];
  if (shot === undefined) throw new RangeError(`no screenshot ${index}`);
  const frame = createImage(FRAME_W, FRAME_H);
  backdrop(frame, 1);
  const band = sprite(shot.backdrop);
  tile(frame, shot.backdrop, HUD_BOTTOM_Y - band.height, 1);
  fill(frame, 0, 0, FRAME_W, HUD_BAR_HEIGHT, NAVY_LIGHT);
  fill(frame, 0, HUD_BOTTOM_Y, FRAME_W, HUD_BAR_HEIGHT, NAVY_LIGHT);
  const boss = sprite(shot.boss);
  draw(
    frame,
    boss,
    FRAME_W - boss.width - Math.round(24 * WORLD_SCALE),
    Math.floor((FRAME_H - boss.height) / 2),
    1,
  );
  const ship = sprite(shot.ship);
  draw(frame, ship, Math.round(64 * WORLD_SCALE), Math.floor((FRAME_H - ship.height) / 2), 1);
  // The caption block, re-measured on the v2 font (R4-05.E5): the `PLACEHOLDER` row sits three HUD
  // bars under the top edge, the zone name one half-cell below the caption's own rows. At v1's
  // 8-px cell that is y 24 and 44 — the old numbers; at the 12-px v2 cell, 36 and 66, and the
  // doubled caption no longer runs into the name.
  const caption = 'PLACEHOLDER';
  const cellH = loadArt().font.cellHeight;
  const captionScale = 2;
  const captionY = 3 * HUD_BAR_HEIGHT;
  drawText(
    frame,
    caption,
    Math.floor((FRAME_W - textWidth(caption) * captionScale) / 2),
    captionY,
    captionScale,
    CAPTION,
  );
  drawText(
    frame,
    shot.zone,
    Math.floor((FRAME_W - textWidth(shot.zone)) / 2),
    captionY + cellH * captionScale + Math.floor(cellH / 2),
    1,
    WHITE,
  );
  const out = createImage(FRAME_W * SCREENSHOT_SCALE, FRAME_H * SCREENSHOT_SCALE);
  draw(out, frame, 0, 0, SCREENSHOT_SCALE);
  return out;
}

/**
 * Renders every committed icon.
 *
 * @returns {{ path: string, image: Image }[]} The icons with their repository paths.
 * @throws {Error} When a key-art source or sidecar is missing (see {@link renderIcon}).
 */
export function renderIcons() {
  return ICON_TARGETS.map((target) => ({
    path: target.path,
    image: renderIcon(target.width, target.height),
  }));
}

/**
 * The store listing: {@link STORE_TEXTS} with its image list built from the same products
 * {@link renderKeyArtProducts} renders and the four placeholder screenshots — every size derived
 * from the decoded source, never written down.
 *
 * @returns {{ name: string, version: string, category: string, shortDescription: string,
 *   description: string, keywords: string[], ageRating: string, placeholder: boolean,
 *   images: { file: string, use: string, width: number, height: number }[] }} The listing.
 * @throws {Error} When a key-art source or sidecar is missing.
 */
export function buildStoreListing() {
  return {
    ...STORE_TEXTS,
    images: [
      ...KEY_ART.map((entry) => {
        const spec = productSpec(entry);
        return {
          file: spec.file,
          use: spec.use,
          width: spec.width,
          height: spec.height,
        };
      }),
      ...SCREENSHOTS.map((_, k) => ({
        file: `screenshot-${k + 1}-1920x1080.png`,
        use: 'screenshot',
        width: FRAME_W * SCREENSHOT_SCALE,
        height: FRAME_H * SCREENSHOT_SCALE,
      })),
    ],
  };
}

/**
 * The SHA-256 of bytes, hex.
 *
 * @param {Buffer} bytes - The file's bytes.
 * @returns {string} The digest.
 */
function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * The products one key-art source drives: the committed files and store images rendered from it,
 * each with the derivation text its record quotes.
 *
 * @param {KeyArtSource} entry - The source.
 * @returns {{ file: string, width: number, height: number, derivation: string }[]} Products in
 *   {@link ICON_TARGETS} order (icons first for `app-icon`), then the store copy.
 */
function recordProducts(entry) {
  const { image } = loadSource(entry);
  const size = `${image.width}×${image.height}`;
  const tail = 'median-cut to ≤ 256 colours, written as an indexed PNG-8';
  if (entry.kind === 'icons') {
    const products = ICON_TARGETS.map((target) => ({
      file: target.path,
      width: target.width,
      height: target.height,
      derivation:
        `contain-fit ${size} into ${target.width}×${target.height} (exact fractional-box area ` +
        `downscale, centred on the playfield navy), ${tail}`,
    }));
    const tv = ICON_TARGETS[0];
    products.push({
      file: `assets/generated/store/icon-${tv.width}x${tv.height}.png`,
      width: tv.width,
      height: tv.height,
      derivation: `the store copy of the Tizen icon — identical pixels: ${products[0].derivation}`,
    });
    return products;
  }
  if (entry.kind === 'promo') {
    return [
      {
        file: `assets/generated/store/${entry.slug}-${image.width}x${image.height}.png`,
        width: image.width,
        height: image.height,
        derivation: `native ${size}, ${tail}`,
      },
    ];
  }
  const width = Math.floor(image.width / 2);
  const height = Math.floor(image.height / 2);
  return [
    {
      file: `assets/generated/store/${entry.slug}-${width}x${height}.png`,
      width,
      height,
      derivation: `half size: exact fractional-box area downscale ${size} → ${width}×${height}, ${tail}`,
    },
  ];
}

/**
 * The provenance record of one key-art source, in its committed JSON text.
 *
 * @param {KeyArtSource} entry - The source.
 * @returns {{ record: Record<string, unknown>, text: string }} The object and its two-space,
 *   LF-terminated JSON.
 * @throws {Error} When a source, sidecar or model row is missing.
 */
function recordFor(entry) {
  const { bytes, sidecar } = loadSource(entry);
  const models = loadModels();
  const model = models[String(sidecar.model)];
  if (model === undefined)
    throw new Error(`model "${String(sidecar.model)}" is not in models.json`);
  const record = {
    schema: STORE_ART_SCHEMA,
    slug: entry.slug,
    origin: 'ai-assisted',
    waiver: KEY_ART_WAIVER,
    source: {
      path: entry.source,
      sidecar: `${dirname(entry.source)}/winner.json`,
      sha256: sha256(bytes),
      format: 'png',
      width: sidecar.width,
      height: sidecar.height,
      modelKey: sidecar.model,
      servedModel: sidecar.servedModel,
      weights: model.id,
      licence: model.licence,
      seed: sidecar.seed,
      steps: sidecar.steps,
      guidance: sidecar.guidance,
      generatedAt: sidecar.generatedAt,
      prompt: sidecar.prompt,
      negative: sidecar.negative,
      label: sidecar.label,
    },
    generatedBy: 'scripts/store-assets.mjs (pnpm store:assets)',
    products: recordProducts(entry),
  };
  return { record, text: `${JSON.stringify(record, null, 2)}\n` };
}

/**
 * The committed provenance records that are out of date (or missing): re-renders each record from
 * the current source bytes and sidecar and compares texts. A winners file whose bytes moved fails
 * here — the products it drives would have moved with them, and `--check` would not see a thing
 * through re-rendering alone.
 *
 * @param {string} [root] - Repository root (default this checkout's).
 * @returns {string[]} Their repository paths (empty when every record is current).
 * @throws {Error} When a key-art source or sidecar is missing.
 */
export function staleRecords(root = REPO_ROOT) {
  const stale = [];
  for (const entry of KEY_ART) {
    const file = join(root, KEY_ART_RECORD_DIR, `${entry.slug}.art.json`);
    const { text } = recordFor(entry);
    if (!existsSync(file) || readFileSync(file, 'utf8') !== text) stale.push(entry.slug);
  }
  return stale;
}

/**
 * Writes the provenance record of every key-art source into the checkout.
 *
 * @param {string} root - Repository root.
 * @returns {string[]} The files written (absolute paths).
 * @throws {Error} When a key-art source or sidecar is missing.
 */
function writeRecords(root) {
  const written = [];
  for (const entry of KEY_ART) {
    const file = join(root, KEY_ART_RECORD_DIR, `${entry.slug}.art.json`);
    const { text } = recordFor(entry);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
    written.push(file);
  }
  return written;
}

/**
 * The committed icons that differ from a fresh rendering (or are missing).
 *
 * @param {string} [root] - Repository root (default this checkout's).
 * @returns {string[]} Their repository paths (empty when every icon is current).
 * @throws {Error} When a key-art source or sidecar is missing, or a committed file is not a
 *   readable PNG.
 *
 * @remarks
 * Compares **decoded pixels**, not PNG bytes: a PNG written on another machine (another zlib)
 * may compress the same pixels differently. `--check` and `test/scripts/store-assets.test.ts` use
 * it. The key art itself is guarded by {@link staleRecords}, which pins the source bytes by
 * SHA-256 — together they make the whole store surface byte-exact under re-rendering.
 *
 * @example
 * ```js
 * staleIcons(); // → [] when the committed icons match the key art
 * ```
 */
export function staleIcons(root = REPO_ROOT) {
  const stale = [];
  for (const { path, image } of renderIcons()) {
    const file = join(root, path);
    if (!existsSync(file) || !imagesEqual(decodePng(readFileSync(file)), image)) stale.push(path);
  }
  return stale;
}

/**
 * Writes the committed icons, the committed provenance records and the store-listing images.
 *
 * @param {{ root?: string, storeDir?: string }} [options] - Repository root for the icons and the
 *   records (default this checkout's) and the store folder (default {@link STORE_DIR}).
 * @returns {string[]} Every file written (absolute paths): the icons, then the provenance records
 *   under `assets/source/store/`, then the store folder's key-art products, `screenshot-<n>-
 *   1920x1080.png` files and `listing.json`.
 * @throws {Error} When a key-art source or sidecar is missing, or a file cannot be written.
 *
 * @example
 * ```js
 * writeStoreAssets({ storeDir: '/tmp/store' }); // icons and records into the checkout, images to /tmp
 * ```
 */
export function writeStoreAssets(options = {}) {
  const root = options.root ?? REPO_ROOT;
  const storeDir = options.storeDir ?? STORE_DIR;
  /** @type {string[]} */
  const written = [];
  /**
   * Writes one file, creating its folder.
   *
   * @param {string} file - Absolute path.
   * @param {Uint8Array | string} bytes - Contents.
   */
  const put = (file, bytes) => {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, bytes);
    written.push(file);
  };
  for (const { path, image } of renderIcons())
    put(join(root, path), encodePng(image, { indexed: 'auto' }));
  written.push(...writeRecords(root));
  for (const product of renderKeyArtProducts()) {
    put(join(storeDir, product.file), encodePng(product.image, { indexed: 'auto' }));
  }
  SCREENSHOTS.forEach((_, k) => {
    put(join(storeDir, `screenshot-${k + 1}-1920x1080.png`), encodePng(renderScreenshot(k)));
  });
  put(join(storeDir, 'listing.json'), `${JSON.stringify(buildStoreListing(), null, 2)}\n`);
  return written;
}

/**
 * Command-line entry point.
 *
 * @returns {number} Process exit code: 0 on success, 1 when `--check` found a stale icon or
 *   record, 2 for an unknown argument list (the usage is printed).
 */
function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--check' && args.length === 1) {
    const stale = staleIcons();
    for (const path of stale) console.error(`store-assets: ${path} is out of date`);
    const staleArt = staleRecords();
    for (const slug of staleArt) {
      console.error(`store-assets: ${KEY_ART_RECORD_DIR}/${slug}.art.json is out of date`);
    }
    if (stale.length + staleArt.length > 0) {
      console.error('run `pnpm store:assets` to regenerate the icons and records');
    }
    return stale.length + staleArt.length === 0 ? 0 : 1;
  }
  let storeDir;
  if (args[0] === '--out' && args.length === 2) storeDir = resolve(args[1]);
  else if (args.length > 0) {
    console.error('usage: node scripts/store-assets.mjs [--check | --out DIR]');
    return 2;
  }
  for (const file of writeStoreAssets({ storeDir })) console.log(`wrote ${file}`);
  return 0;
}

/**
 * Whether this file is the script Node was started with (not imported by a test).
 *
 * @returns {boolean} `true` when run from the command line.
 */
function isCommandLineEntry() {
  const entry = process.argv[1];
  if (entry === undefined || !existsSync(entry)) return false;
  return realpathSync(resolve(entry)) === realpathSync(fileURLToPath(import.meta.url));
}

if (isCommandLineEntry()) process.exitCode = main();
