#!/usr/bin/env node
/**
 * `pnpm store:assets` — the icon set and the store-listing placeholders of the v1.0 release
 * candidate (plan M2-18, shmup_feat.md §23 "store", shmup_tech.md §2.6), generated from the game's
 * own placeholder art — the atlas sprites (`collectSprites()`: the logo, the two ships, the zone
 * backdrops, the bosses) and the bitmap font — so no image is drawn by hand (plan §1.5):
 *
 * - **Icons (committed)** — {@link ICON_TARGETS}: the Tizen widget / Seller Office icon
 *   `apps/tizen/public/icon.png` (512 × 423, copied into the widget by Vite), the desktop app's
 *   icon `apps/electron/build/icon.png` (512 × 512, electron-builder's `build/` resources) and the
 *   LG webOS app's `apps/webos/public/icon.png` (80 × 80) and `largeIcon.png` (130 × 130, M3-03,
 *   the sizes `appinfo.json` names). A test
 *   (`test/scripts/store-assets.test.ts`) renders them again and compares the pixels, so a change
 *   to the art or to this script shows up as a failing test until the files are regenerated.
 * - **Store-listing placeholders (generated, ignored)** — `assets/generated/store/`: the icon,
 *   {@link SCREENSHOTS} placeholder screenshots at 1920 × 1080 (the game's 384 × 216 frame × 5,
 *   each captioned `PLACEHOLDER`) and `listing.json` ({@link STORE_LISTING}: the name, the texts,
 *   the category, the image list with its sizes). They stand in until real screenshots are taken
 *   on the monitors; check the sizes against the Seller Office's current requirements before a
 *   submission (the manual checklist, plan §8.6).
 *
 * Every image is drawn with whole-pixel copies and integer scaling only, so the output is the same
 * on every machine.
 *
 * Usage:
 *   node scripts/store-assets.mjs            write the icons and the store folder
 *   node scripts/store-assets.mjs --check    exit 1 when a committed icon is out of date
 *   node scripts/store-assets.mjs --out DIR  write the store folder to DIR
 *
 * @module
 */
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createImage, imagesEqual } from './assets/image.mjs';
import { REPO_ROOT, collectSprites } from './assets/pipeline.mjs';
import { decodePng, encodePng } from './assets/png.mjs';

/** @typedef {import('./assets/image.mjs').Image} Image */
/** @typedef {import('./assets/image.mjs').Rgba} Rgba */

/** Where `pnpm store:assets` writes the store-listing placeholders. */
export const STORE_DIR = join(REPO_ROOT, 'assets', 'generated', 'store');

/** Width of the game's internal frame (decision D19), px. */
const FRAME_W = 384;
/** Height of the game's internal frame (decision D19), px. */
const FRAME_H = 216;

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

/** The listing's texts and image list (placeholders — original names only, shmup_feat.md §26). */
export const STORE_LISTING = Object.freeze({
  name: 'Shmup Cup',
  version: '1.0.0',
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
  images: Object.freeze([
    Object.freeze({ file: 'icon-512x423.png', use: 'app icon', width: 512, height: 423 }),
    ...[1, 2, 3, 4].map((k) =>
      Object.freeze({
        file: `screenshot-${k}-1920x1080.png`,
        use: 'screenshot',
        width: 1920,
        height: 1080,
      }),
    ),
  ]),
});

/** Background colour: the deep navy of the playfield. */
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
 * @type {{ frames: Map<string, Image[]>, font: { glyphs: Record<string, { frame: string, advance: number }>, cellHeight: number } } | null}
 */
let art = null;

/**
 * The placeholder art: every sprite's frames by name and the bitmap font's metrics.
 *
 * @returns {{ frames: Map<string, Image[]>, font: { glyphs: Record<string, { frame: string, advance: number }>, cellHeight: number } }}
 *   The art.
 * @throws {Error} When the sources have issues or the font is missing.
 */
function loadArt() {
  if (art !== null) return art;
  const { sprites, fonts, issues } = collectSprites();
  if (issues.length > 0) throw new Error(`asset sources have issues: ${issues[0].message}`);
  const frames = new Map(sprites.map((sprite) => [sprite.name, sprite.frames]));
  const font = fonts.pixel;
  if (font === undefined) throw new Error('the bitmap font "pixel" is missing');
  art = { frames, font };
  return art;
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
 * @param {string} text - The text (characters the font lacks advance by 6).
 * @returns {number} Pixels.
 */
function textWidth(text) {
  const { glyphs } = loadArt().font;
  let width = 0;
  for (const char of text) width += glyphs[String(char.codePointAt(0))]?.advance ?? 6;
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
  const { glyphs } = loadArt().font;
  const frames = loadArt().frames.get('font/pixel') ?? [];
  let pen = x;
  for (const char of text) {
    const glyph = glyphs[String(char.codePointAt(0))];
    if (glyph !== undefined) {
      const index = Number(glyph.frame.slice(glyph.frame.indexOf('#') + 1));
      draw(target, frames[index], pen, y, scale, color);
    }
    pen += (glyph?.advance ?? 6) * scale;
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
 * Paints the navy playfield: two tones in horizontal bands and the far star field.
 *
 * @param {Image} image - Target.
 * @param {number} scale - Scale of the stars.
 */
function backdrop(image, scale) {
  fill(image, 0, 0, image.width, image.height, NAVY);
  const band = Math.floor(image.height / 3);
  fill(image, 0, band * 2, image.width, image.height - band * 2, NAVY_LIGHT);
  for (let y = 0; y < image.height; y += 128 * scale) tile(image, 'bg/stars-far', y, scale);
}

/**
 * Renders an icon: the playfield, the logo across the top and the two ships.
 *
 * @param {number} width - Width in pixels (≥ 200).
 * @param {number} height - Height in pixels (≥ 160).
 * @returns {Image} The icon.
 * @throws {Error} When the asset sources have issues or the logo / a ship sprite is missing.
 *
 * @example
 * ```js
 * const png = encodePng(renderIcon(512, 423)); // the Tizen widget icon's pixels
 * ```
 */
export function renderIcon(width, height) {
  const image = createImage(width, height);
  backdrop(image, 2);
  const logo = sprite('ui/logo');
  const logoScale = Math.max(1, Math.floor((width * 0.9) / logo.width));
  const logoY = Math.floor(height * 0.12);
  draw(image, logo, Math.floor((width - logo.width * logoScale) / 2), logoY, logoScale);
  const kestrel = sprite('ships/kestrel');
  const manta = sprite('ships/manta');
  const shipScale = Math.max(1, Math.floor(width / 4 / kestrel.width));
  const top = logoY + logo.height * logoScale + Math.floor(height * 0.08);
  draw(image, kestrel, Math.floor(width * 0.14), top, shipScale);
  draw(
    image,
    manta,
    Math.floor(width * 0.86) - manta.width * shipScale,
    top + Math.floor(kestrel.height * shipScale * 1.2),
    shipScale,
  );
  return image;
}

/**
 * Renders one placeholder screenshot: a 384 × 216 scene (the zone's backdrop band, its boss's
 * hull, the ship, the caption `PLACEHOLDER` and the zone's name) scaled × 5 to 1920 × 1080.
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
  tile(frame, shot.backdrop, FRAME_H - 8 - band.height, 1);
  fill(frame, 0, 0, FRAME_W, 8, NAVY_LIGHT);
  fill(frame, 0, FRAME_H - 8, FRAME_W, 8, NAVY_LIGHT);
  const boss = sprite(shot.boss);
  draw(frame, boss, FRAME_W - boss.width - 24, Math.floor((FRAME_H - boss.height) / 2), 1);
  const ship = sprite(shot.ship);
  draw(frame, ship, 64, Math.floor((FRAME_H - ship.height) / 2), 1);
  const caption = 'PLACEHOLDER';
  drawText(frame, caption, Math.floor((FRAME_W - textWidth(caption) * 2) / 2), 24, 2, CAPTION);
  drawText(frame, shot.zone, Math.floor((FRAME_W - textWidth(shot.zone)) / 2), 44, 1, WHITE);
  const out = createImage(FRAME_W * 5, FRAME_H * 5);
  draw(out, frame, 0, 0, 5);
  return out;
}

/**
 * Renders every committed icon.
 *
 * @returns {{ path: string, image: Image }[]} The icons with their repository paths.
 * @throws {Error} When the asset sources have issues (see {@link renderIcon}).
 */
export function renderIcons() {
  return ICON_TARGETS.map((target) => ({
    path: target.path,
    image: renderIcon(target.width, target.height),
  }));
}

/**
 * The committed icons that differ from a fresh rendering (or are missing).
 *
 * @param {string} [root] - Repository root (default this checkout's).
 * @returns {string[]} Their repository paths (empty when every icon is current).
 * @throws {Error} When the asset sources have issues, or a committed file is not a readable PNG.
 *
 * @remarks
 * Compares **decoded pixels**, not PNG bytes: a PNG written on another machine (another zlib)
 * may compress the same pixels differently. `--check` and `test/scripts/store-assets.test.ts` use
 * it.
 *
 * @example
 * ```js
 * staleIcons(); // → [] when the committed icons match the art
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
 * Writes the committed icons and the store-listing placeholders.
 *
 * @param {{ root?: string, storeDir?: string }} [options] - Repository root for the icons (default
 *   this checkout's) and the store folder (default {@link STORE_DIR}).
 * @returns {string[]} Every file written (absolute paths): the icons, then the store folder's
 *   `icon-512x423.png`, `screenshot-<n>-1920x1080.png` files and `listing.json`.
 * @throws {Error} When the asset sources have issues, or a file cannot be written.
 *
 * @example
 * ```js
 * writeStoreAssets({ storeDir: '/tmp/store' }); // icons into the checkout, placeholders to /tmp
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
  for (const { path, image } of renderIcons()) put(join(root, path), encodePng(image));
  put(join(storeDir, 'icon-512x423.png'), encodePng(renderIcon(512, 423)));
  SCREENSHOTS.forEach((_, k) => {
    put(join(storeDir, `screenshot-${k + 1}-1920x1080.png`), encodePng(renderScreenshot(k)));
  });
  put(join(storeDir, 'listing.json'), JSON.stringify(STORE_LISTING, null, 2) + '\n');
  return written;
}

/**
 * Command-line entry point.
 *
 * @returns {number} Process exit code: 0 on success, 1 when `--check` found a stale icon, 2 for
 *   an unknown argument list (the usage is printed).
 */
function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--check' && args.length === 1) {
    const stale = staleIcons();
    for (const path of stale) console.error(`store-assets: ${path} is out of date`);
    if (stale.length > 0) console.error('run `pnpm store:assets` to regenerate the icons');
    return stale.length === 0 ? 0 : 1;
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
