#!/usr/bin/env node
/**
 * Documentation image generator (`pnpm docs:images`).
 *
 * Draws the pictures the player-facing docs show — the logo banner, one plate per enemy,
 * weapon, power-up and Option / shield sprite, and one assembled portrait per boss — from the
 * same sources the game itself is drawn from: the sprite pixel maps and procedural generators
 * of `assets/source/` (through `scripts/assets/pipeline.mjs` `collectSprites`) and the boss
 * part trees in `content/enemies/*.enemies.json`. Nothing is hand-drawn, so a change to a
 * sprite or to a boss's parts reaches the docs by re-running this script.
 *
 * Output (committed, so the docs render on a clone without the asset pipeline):
 *
 * ```text
 * docs/images/logo.png                the SHMUP CUP logo over a star field (README header)
 * docs/images/enemies/<sprite>.png    one plate per enemies/<sprite>            (bestiary.md)
 * docs/images/bosses/<boss>.png       every boss assembled from its parts       (bestiary.md)
 * docs/images/items/<sprite>.png      capsules, 1UPs, point items               (arsenal.md)
 * docs/images/options/<sprite>.png    the Option orb and a stolen one           (arsenal.md)
 * docs/images/shields/<sprite>.png    the Force Field, the pods, Reduce, the Arm (arsenal.md)
 * docs/images/shots/<sprite>.png      player shots, lasers and missiles         (arsenal.md)
 * docs/images/ships/<sprite>.png      the KESTREL and the MANTA                 (arsenal.md)
 * ```
 *
 * Usage:
 *   node scripts/doc-images.mjs           write every image
 *   node scripts/doc-images.mjs --check    exit 1 when an image is missing or out of date
 *   node scripts/doc-images.mjs --quiet    print nothing on success
 *
 * Exits 1 when a source is invalid or `--check` finds a stale image, 2 on bad arguments.
 *
 * @module
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { collectSprites, REPO_ROOT } from './assets/pipeline.mjs';
import { createImage, getPixel, setPixel } from './assets/image.mjs';
import { encodePng } from './assets/png.mjs';

/** @typedef {import('./assets/image.mjs').Image} Image */
/** @typedef {import('./assets/image.mjs').Rgba} Rgba */

/** Where the images are written (repo-relative paths are printed from here). */
export const DOC_IMAGE_DIR = join(REPO_ROOT, 'docs', 'images');

/** Where the boss part trees are read from. */
const ENEMY_DIR = join(REPO_ROOT, 'content', 'enemies');

/** Plate background (the UI kit's panel colour, `core/ui` `UI_COLORS.panel`). */
const PLATE_BG = /** @type {Rgba} */ ([0x10, 0x17, 0x3a, 0xff]);

/** Plate border (the UI kit's `UI_COLORS.border`). */
const PLATE_BORDER = /** @type {Rgba} */ ([0x5a, 0x6a, 0x98, 0xff]);

/** Deep space behind the logo banner. */
const SPACE = /** @type {Rgba} */ ([0x05, 0x06, 0x12, 0xff]);

/** The UI kit's `UI_COLORS.title`. */
const TITLE_INK = /** @type {Rgba} */ ([0x38, 0xc8, 0xe8, 0xff]);

/** The UI kit's `UI_COLORS.text`. */
const TEXT_INK = /** @type {Rgba} */ ([0xe8, 0xe8, 0xf0, 0xff]);

/** Transparent margin (source pixels) around a sprite on its plate. */
const PLATE_MARGIN = 6;

/** Scale of the enemy portraits — one scale for all of them, so the plates show true sizes. */
const ENEMY_SCALE = 4;

/** Scale of the item, shot, Option and shield plates. */
const ITEM_SCALE = 5;

/** Scale of the ship plates. */
const SHIP_SCALE = 8;

/** Rows over which the banner's text wash fades in and out. */
const SHADE_FEATHER = 10;

/** Widest a boss portrait may be, in output pixels (its scale is chosen to fit). */
const BOSS_MAX_WIDTH = 560;

/**
 * Composites `source` onto `target` at `(dx, dy)` with straight-alpha source-over, clipping
 * whatever falls outside the target.
 *
 * @param {Image} target - Destination image.
 * @param {Image} source - Source image.
 * @param {number} dx - Destination column of the source's top-left pixel.
 * @param {number} dy - Destination row of the source's top-left pixel.
 */
function draw(target, source, dx, dy) {
  for (let y = 0; y < source.height; y++) {
    const ty = dy + y;
    if (ty < 0 || ty >= target.height) continue;
    for (let x = 0; x < source.width; x++) {
      const tx = dx + x;
      if (tx < 0 || tx >= target.width) continue;
      const s = ((y * source.width + x) * 4) | 0;
      const alpha = source.data[s + 3];
      if (alpha === 0) continue;
      const t = ((ty * target.width + tx) * 4) | 0;
      if (alpha === 255) {
        target.data.set(source.data.subarray(s, s + 4), t);
        continue;
      }
      const inv = 255 - alpha;
      for (let c = 0; c < 3; c++) {
        target.data[t + c] = Math.round(
          (source.data[s + c] * alpha + target.data[t + c] * inv) / 255,
        );
      }
      target.data[t + 3] = Math.max(target.data[t + 3], alpha);
    }
  }
}

/**
 * Fills a rectangle (clipped to the image).
 *
 * @param {Image} image - Target image.
 * @param {number} x - Left column.
 * @param {number} y - Top row.
 * @param {number} w - Width.
 * @param {number} h - Height.
 * @param {Rgba} rgba - The colour.
 */
function fillRect(image, x, y, w, h, rgba) {
  for (let py = Math.max(0, y); py < Math.min(image.height, y + h); py++) {
    for (let px = Math.max(0, x); px < Math.min(image.width, x + w); px++) {
      setPixel(image, px, py, rgba);
    }
  }
}

/**
 * Draws a one-pixel rectangle outline.
 *
 * @param {Image} image - Target image.
 * @param {number} x - Left column.
 * @param {number} y - Top row.
 * @param {number} w - Width.
 * @param {number} h - Height.
 * @param {Rgba} rgba - The colour.
 */
function strokeRect(image, x, y, w, h, rgba) {
  fillRect(image, x, y, w, 1, rgba);
  fillRect(image, x, y + h - 1, w, 1, rgba);
  fillRect(image, x, y, 1, h, rgba);
  fillRect(image, x + w - 1, y, 1, h, rgba);
}

/**
 * Darkens a band towards black — a readability wash under text, strongest in the middle rows
 * and fading out over {@link SHADE_FEATHER} rows at each edge so it has no visible seam.
 *
 * @param {Image} image - Target image.
 * @param {number} y - Top row of the band.
 * @param {number} h - Band height.
 * @param {number} amount - How black in the middle, 0 … 1.
 */
function shadeBand(image, y, h, amount) {
  for (let py = Math.max(0, y); py < Math.min(image.height, y + h); py++) {
    const edge = Math.min(py - y + 1, y + h - py);
    const keep = 1 - (amount * Math.min(edge, SHADE_FEATHER)) / SHADE_FEATHER;
    for (let px = 0; px < image.width; px++) {
      const i = (py * image.width + px) * 4;
      for (let c = 0; c < 3; c++) image.data[i + c] = Math.round(image.data[i + c] * keep);
    }
  }
}

/**
 * Nearest-neighbour magnification.
 *
 * @param {Image} image - Source image.
 * @param {number} factor - Integer factor ≥ 1.
 * @returns {Image} The magnified copy (`image` itself when the factor is 1).
 */
function magnify(image, factor) {
  if (factor === 1) return image;
  const out = createImage(image.width * factor, image.height * factor);
  for (let y = 0; y < out.height; y++) {
    for (let x = 0; x < out.width; x++) {
      setPixel(out, x, y, getPixel(image, Math.floor(x / factor), Math.floor(y / factor)));
    }
  }
  return out;
}

/**
 * Trims fully transparent rows and columns.
 *
 * @param {Image} image - Source image.
 * @returns {Image} The trimmed copy (the source when it has no transparent border, a 1×1
 *   transparent image when every pixel is transparent).
 */
function trim(image) {
  let top = image.height;
  let bottom = -1;
  let left = image.width;
  let right = -1;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      if (image.data[(y * image.width + x) * 4 + 3] === 0) continue;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
      if (x < left) left = x;
      if (x > right) right = x;
    }
  }
  if (bottom < 0) return createImage(1, 1);
  const out = createImage(right - left + 1, bottom - top + 1);
  draw(out, image, -left, -top);
  return out;
}

/**
 * Puts a sprite frame on a framed square plate, centred, with {@link PLATE_MARGIN} around it.
 *
 * @remarks
 * Every plate of a group uses the same `scale`, so a bestiary row shows how big an enemy really
 * is next to its neighbours; the plate itself grows with the sprite.
 *
 * @param {Image} frame - The sprite frame.
 * @param {number} scale - Magnification of the whole plate.
 * @returns {Image} The plate, square, `(max(w, h) + 2 * PLATE_MARGIN) * scale` a side.
 */
function plate(frame, scale) {
  const box = Math.max(frame.width, frame.height) + PLATE_MARGIN * 2;
  const canvas = createImage(box, box);
  fillRect(canvas, 0, 0, box, box, PLATE_BG);
  draw(canvas, frame, Math.floor((box - frame.width) / 2), Math.floor((box - frame.height) / 2));
  const out = magnify(canvas, scale);
  strokeRect(out, 0, 0, out.width, out.height, PLATE_BORDER);
  return out;
}

/**
 * Puts an image that brings its own size on a framed plate.
 *
 * @param {Image} content - The picture.
 * @param {number} scale - Magnification of the picture.
 * @param {number} pad - Border in output pixels around it.
 * @returns {Image} The plate.
 */
function loosePlate(content, scale, pad) {
  const scaled = magnify(content, scale);
  const out = createImage(scaled.width + pad * 2, scaled.height + pad * 2);
  fillRect(out, 0, 0, out.width, out.height, PLATE_BG);
  draw(out, scaled, pad, pad);
  strokeRect(out, 0, 0, out.width, out.height, PLATE_BORDER);
  return out;
}

/**
 * The sprites and fonts of `assets/source/`, by name.
 *
 * @returns {{ frames: Map<string, Image[]>, glyphs: Map<number, { image: Image, advance: number }>,
 *   lineHeight: number }} Frames by sprite name and the pixel font's glyphs by code point.
 * @throws {Error} When a sprite source is invalid (every issue is listed).
 */
function loadArt() {
  const { sprites, fonts, issues } = collectSprites();
  if (issues.length > 0) {
    throw new Error(
      `asset sources are invalid:\n${issues.map((i) => `  - ${i.path} ${i.message}`).join('\n')}`,
    );
  }
  /** @type {Map<string, Image[]>} */
  const frames = new Map();
  for (const sprite of sprites) frames.set(sprite.name, sprite.frames);
  const metrics = fonts.pixel;
  /** @type {Map<number, { image: Image, advance: number }>} */
  const glyphs = new Map();
  const fontFrames = frames.get(metrics.sprite) ?? [];
  for (const [code, glyph] of Object.entries(metrics.glyphs)) {
    const index = Number(glyph.frame.slice(glyph.frame.indexOf('#') + 1));
    glyphs.set(Number(code), { image: fontFrames[index], advance: glyph.advance });
  }
  return { frames, glyphs, lineHeight: metrics.lineHeight };
}

/**
 * Width of `text` in the pixel font.
 *
 * @param {Map<number, { image: Image, advance: number }>} glyphs - The font.
 * @param {string} text - The text.
 * @returns {number} Width in source pixels.
 */
function textWidth(glyphs, text) {
  let width = 0;
  for (const ch of text) width += glyphs.get(ch.codePointAt(0) ?? 32)?.advance ?? 6;
  return width;
}

/**
 * Draws text in the game's own pixel font, tinted (the glyphs are white).
 *
 * @param {Image} target - Target image.
 * @param {Map<number, { image: Image, advance: number }>} glyphs - The font.
 * @param {string} text - The text (unknown code points are skipped).
 * @param {number} x - Left column, or the centre when `center` is true.
 * @param {number} y - Top row.
 * @param {Rgba} rgba - Ink colour.
 * @param {boolean} [center] - Centre the text on `x` (default false).
 */
function drawText(target, glyphs, text, x, y, rgba, center = false) {
  let px = center ? x - Math.floor(textWidth(glyphs, text) / 2) : x;
  for (const ch of text) {
    const glyph = glyphs.get(ch.codePointAt(0) ?? 32);
    if (glyph === undefined) continue;
    for (let gy = 0; gy < glyph.image.height; gy++) {
      for (let gx = 0; gx < glyph.image.width; gx++) {
        if (glyph.image.data[(gy * glyph.image.width + gx) * 4 + 3] === 0) continue;
        const tx = px + gx;
        const ty = y + gy;
        if (tx < 0 || ty < 0 || tx >= target.width || ty >= target.height) continue;
        setPixel(target, tx, ty, rgba);
      }
    }
    px += glyph.advance;
  }
}

/**
 * Tiles a background sprite over a rectangle.
 *
 * @param {Image} target - Target image.
 * @param {Image} tile - The sprite frame.
 * @param {number} y - Top row of the band.
 * @param {number} height - Band height.
 * @param {number} offset - Horizontal offset of the first tile.
 */
function tileBand(target, tile, y, height, offset) {
  for (
    let x = -((offset % tile.width) + tile.width) % tile.width;
    x < target.width;
    x += tile.width
  ) {
    for (let ty = y; ty < y + height; ty += tile.height) draw(target, tile, x, ty);
  }
}

/**
 * The logo banner of the README: the game's own `ui/logo` sprite over its own parallax star
 * bands and zone A's planet rim, with the pixel font's tagline under it.
 *
 * @param {{ frames: Map<string, Image[]>, glyphs: Map<number, { image: Image, advance: number }> }} art
 *   The loaded art.
 * @returns {Image} The banner (1152×432).
 */
function buildLogoBanner(art) {
  const width = 384;
  const height = 144;
  const canvas = createImage(width, height);
  fillRect(canvas, 0, 0, width, height, SPACE);
  const far = art.frames.get('bg/stars-far')?.[0];
  const mid = art.frames.get('bg/stars-mid')?.[0];
  const near = art.frames.get('bg/stars-near')?.[0];
  if (far !== undefined) tileBand(canvas, far, 0, height, 0);
  if (mid !== undefined) tileBand(canvas, mid, 0, height, 37);
  if (near !== undefined) tileBand(canvas, near, 0, height, 91);
  const rim = art.frames.get('bg/azure-verge')?.[0];
  if (rim !== undefined) tileBand(canvas, rim, height - 48, 48, 12);
  const logo = art.frames.get('ui/logo')?.[0];
  if (logo !== undefined) {
    draw(canvas, logo, Math.floor((width - logo.width) / 2), 34);
  }
  shadeBand(canvas, 66, 42, 0.6);
  drawText(canvas, art.glyphs, 'THE IRON TIDE HAS RISEN', width / 2, 76, TITLE_INK, true);
  drawText(canvas, art.glyphs, 'NINE ZONES - TWO SHIPS - ONE CUP', width / 2, 90, TEXT_INK, true);
  const kestrel = art.frames.get('ships/kestrel')?.[1];
  const thruster = art.frames.get('ships/kestrel-thruster')?.[0];
  const orb = art.frames.get('options/orb')?.[0];
  if (kestrel !== undefined) {
    const shipX = 150;
    const shipY = 112;
    if (orb !== undefined) {
      for (let i = 0; i < 4; i++) draw(canvas, orb, shipX - 16 - i * 13, shipY + 1 + (i % 2) * 2);
    }
    if (thruster !== undefined) draw(canvas, thruster, shipX - 6, shipY + 3);
    draw(canvas, kestrel, shipX, shipY);
    const shot = art.frames.get('shots/basic')?.[0];
    if (shot !== undefined) {
      for (let i = 0; i < 3; i++) draw(canvas, shot, shipX + 24 + i * 34, shipY + 3);
    }
  }
  return magnify(canvas, 3);
}

/**
 * Reads every boss (`enemies[].boss`) of `content/enemies/`.
 *
 * @returns {{ id: string, file: string, spec: Record<string, any> }[]} Bosses in file order.
 */
function loadBosses() {
  /** @type {{ id: string, file: string, spec: Record<string, any> }[]} */
  const bosses = [];
  for (const file of readdirSync(ENEMY_DIR).sort()) {
    if (!file.endsWith('.enemies.json') || file.startsWith('example.')) continue;
    const json = JSON.parse(readFileSync(join(ENEMY_DIR, file), 'utf8'));
    for (const enemy of json.enemies ?? []) {
      if (enemy.boss !== undefined && enemy.boss !== null) {
        bosses.push({ id: enemy.id, file, spec: enemy.boss });
      }
    }
  }
  return bosses;
}

/**
 * Assembles a boss portrait from its part tree: every part's sprite drawn centred on the part's
 * offset, parents first, exactly as the boss system attaches them (translation only).
 *
 * @param {Map<string, Image[]>} frames - Sprite frames by name.
 * @param {Record<string, any>} boss - The `boss` section of an enemy definition.
 * @returns {Image | null} The portrait, trimmed to its pixels — `null` when no part has a sprite.
 */
function assembleBoss(frames, boss) {
  /** @type {Map<string, { x: number, y: number }>} */
  const anchors = new Map();
  /** @type {{ frame: Image, x: number, y: number, core: boolean }[]} */
  const placed = [];
  for (const part of boss.parts ?? []) {
    const parent = part.parent === undefined ? null : (anchors.get(part.parent) ?? null);
    const x = (parent?.x ?? 0) + (part.x ?? 0);
    const y = (parent?.y ?? 0) + (part.y ?? 0);
    anchors.set(part.name, { x, y });
    const frame = frames.get(part.sprite)?.[0];
    if (frame === undefined) continue;
    placed.push({ frame, x, y, core: part.core === true });
  }
  if (placed.length === 0) return null;
  // Cores sit inside the hull: draw them last so a picture always shows the weak point.
  placed.sort((a, b) => Number(a.core) - Number(b.core));
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const item of placed) {
    minX = Math.min(minX, item.x - Math.floor(item.frame.width / 2));
    minY = Math.min(minY, item.y - Math.floor(item.frame.height / 2));
    maxX = Math.max(maxX, item.x - Math.floor(item.frame.width / 2) + item.frame.width);
    maxY = Math.max(maxY, item.y - Math.floor(item.frame.height / 2) + item.frame.height);
  }
  const canvas = createImage(maxX - minX, maxY - minY);
  for (const item of placed) {
    draw(
      canvas,
      item.frame,
      item.x - Math.floor(item.frame.width / 2) - minX,
      item.y - Math.floor(item.frame.height / 2) - minY,
    );
  }
  return trim(canvas);
}

/**
 * Builds every documentation image.
 *
 * @returns {Map<string, Uint8Array>} PNG bytes by path below `docs/images/`.
 * @throws {Error} When a sprite source is invalid.
 */
export function buildDocImages() {
  const art = loadArt();
  /** @type {Map<string, Uint8Array>} */
  const out = new Map();
  /**
   * Encodes one image under `docs/images/`.
   *
   * @param {string} path - Path below `docs/images/` (forward slashes).
   * @param {Image} image - The picture.
   */
  const emit = (path, image) => out.set(path, encodePng(image));

  emit('logo.png', buildLogoBanner(art));

  for (const [name, frames] of art.frames) {
    if (name.includes('@')) continue;
    const base = name.slice(name.indexOf('/') + 1);
    if (name.startsWith('enemies/')) emit(`enemies/${base}.png`, plate(frames[0], ENEMY_SCALE));
    else if (name.startsWith('shots/')) emit(`shots/${base}.png`, plate(frames[0], ITEM_SCALE));
    else if (
      name.startsWith('items/') ||
      name.startsWith('options/') ||
      name.startsWith('shields/')
    ) {
      emit(`${name.slice(0, name.indexOf('/'))}/${base}.png`, plate(frames[0], ITEM_SCALE));
    } else if (name.startsWith('ships/') && !name.includes('thruster')) {
      emit(`ships/${base}.png`, plate(frames[1] ?? frames[0], SHIP_SCALE));
    }
  }

  for (const boss of loadBosses()) {
    const picture = assembleBoss(art.frames, boss.spec);
    if (picture === null) continue;
    const scale = Math.max(1, Math.min(4, Math.floor(BOSS_MAX_WIDTH / picture.width)));
    emit(`bosses/${boss.id}.png`, loosePlate(picture, scale, 8));
  }
  return out;
}

/**
 * Command-line entry point.
 *
 * @param {string[]} argv - Arguments after the script path.
 * @returns {number} Process exit code.
 */
export function main(argv) {
  let check = false;
  let quiet = false;
  for (const arg of argv) {
    if (arg === '--check') check = true;
    else if (arg === '--quiet') quiet = true;
    else {
      process.stderr.write(`unknown argument "${arg}"\n`);
      return 2;
    }
  }
  /** @type {Map<string, Uint8Array>} */
  let images;
  try {
    images = buildDocImages();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
  /** @type {string[]} */
  const stale = [];
  for (const [path, bytes] of images) {
    const file = join(DOC_IMAGE_DIR, ...path.split('/'));
    /** @type {Buffer | null} */
    let current;
    try {
      current = readFileSync(file);
    } catch {
      current = null;
    }
    if (current !== null && current.length === bytes.length && current.equals(Buffer.from(bytes))) {
      continue;
    }
    stale.push(path);
    if (check) continue;
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, bytes);
  }
  if (check && stale.length > 0) {
    process.stderr.write(
      `docs/images is out of date (${stale.length} file(s)); run \`pnpm docs:images\`:\n` +
        stale.map((path) => `  - docs/images/${path}`).join('\n') +
        '\n',
    );
    return 1;
  }
  if (!quiet) {
    process.stdout.write(
      check
        ? `docs/images is up to date (${images.size} images)\n`
        : `docs/images: ${images.size} images, ${stale.length} written\n`,
    );
  }
  return 0;
}

process.exitCode = main(process.argv.slice(2));
