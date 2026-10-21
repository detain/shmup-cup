/**
 * The bullet readability sheets (plan R4-02.B1, the plan §10 R4-02 acceptance): every campaign
 * zone's stand-in backdrop — the `R3-04.M1a` far layer and its first mid band
 * (`scripts/assets/standin.mjs` `standinZone`) — under a fixed stress load of **512 bullets**
 * (the enemy bullet pool's capacity, `core/bullets` `ENEMY_BULLETS`) drawn from the shipped v2
 * generators, one sheet per palette. The four sheets per zone are the standard set and the three
 * colour-blind sets (`@deuteranopia`, `@protanopia`, `@tritanopia`); the owner's legibility
 * sign-off reads these pictures (recorded by `R4-02.B4`).
 *
 * The sheets are **generated files**: they land in `assets/generated/readability/` (git-ignored)
 * and are never committed — `--out <dir>` writes them somewhere else (the test renders into a
 * temp folder). The layout is deterministic: the backdrop is the stand-in's own default seed, the
 * load scatters shapes and families in a fixed order through a name-seeded `rng.mjs` generator,
 * and the PNG encoder is byte-stable, so two runs are byte-identical.
 *
 * Frame sizes come from `scripts/frame.mjs` (the frame-literal scan's rule for `scripts/`);
 * no frame number is ever literal here.
 *
 * **Public API.** {@link BULLETS_PER_SHEET}, {@link SHEET_PALETTES}, {@link sheetPath},
 * {@link renderSheet}, {@link writeSheets}.
 *
 * @module
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FRAME_H, FRAME_W } from './frame.mjs';
import { createImage, getPixel, parseColor, setPixel } from './assets/image.mjs';
import { encodePng } from './assets/png.mjs';
import { KEY, ZONE_IDS, standinZone } from './assets/standin.mjs';
import { createAssetRng } from './assets/rng.mjs';
import { BULLET_COLORS, bulletSprites } from './assets/procedural/bullets.mjs';
import { BULLET_PALETTES, CORE_MARKS } from './assets/procedural/palettes.mjs';
import { seedOf } from './assets/procedural/common.mjs';

/** Repo root (this file lives in `scripts/`). */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Default output folder — under the git-ignored `assets/generated/`. */
const DEFAULT_OUT_DIR = join(REPO_ROOT, 'assets', 'generated', 'readability');

/**
 * How many bullets one sheet carries — the enemy bullet pool's capacity (the plan's
 * acceptance: a screen at the worst load the game can put on the bullet art).
 *
 * @type {number}
 */
export const BULLETS_PER_SHEET = 512;

/**
 * The sheet's palettes in order: the standard bullet colours with solid cores, then the three
 * colour-blind sets (each family recoloured and shape-coded — `palettes.mjs` `CORE_MARKS`).
 *
 * @type {ReadonlyArray<{ id: string, colours: Readonly<Record<string, string>>, coded: boolean }>}
 */
export const SHEET_PALETTES = Object.freeze([
  Object.freeze({ id: 'standard', colours: BULLET_COLORS, coded: false }),
  ...Object.entries(BULLET_PALETTES).map(([id, colours]) =>
    Object.freeze({ id, colours, coded: true }),
  ),
]);

/** The bullet shapes cycled by the scatter, and their families. */
const SHAPES = Object.freeze(['round', 'oval', 'needle']);
const FAMILIES = Object.freeze(['pink', 'red', 'purple']);

/**
 * The file name of one sheet (`<zone>-<palette>.png`, the zone letter as `standinZone` takes
 * it).
 *
 * @param {string} zoneId - A `ZONE_IDS` letter.
 * @param {string} paletteId - A {@link SHEET_PALETTES} id.
 * @returns {string} The base name.
 */
export function sheetPath(zoneId, paletteId) {
  return `zone-${zoneId}-${paletteId}.png`;
}

/**
 * The twelve v2 bullet sprites of one palette (three shapes × three families), by name.
 *
 * @param {{ colours: Readonly<Record<string, string>>, coded: boolean }} palette - A
 *   {@link SHEET_PALETTES} entry.
 * @returns {Map<string, import('./assets/sprite-source.mjs').SpriteDef>} `bullets/<shape>-<family>`.
 */
function bulletSet(palette) {
  const marks = palette.coded ? CORE_MARKS : undefined;
  const sprites = bulletSprites(palette.colours, '', marks, 'bullets', 3 / 2);
  return new Map(sprites.map((s) => [s.name, s]));
}

/**
 * Composites one stand-in surface over a sheet: `surface`'s palette slot `KEY` stays
 * transparent, every other pixel takes its palette colour.
 *
 * @param {import('./assets/image.mjs').Image} target - The sheet.
 * @param {{ width: number, height: number, indices: Uint8Array }} surface - The layer.
 * @param {string[]} zonePalette - The zone's palette colours.
 * @param {number} ox - Destination x of the surface's column 0.
 * @param {number} oy - Destination y of the surface's row 0.
 * @param {number} [maxWidth] - Columns to take from the left of the surface (default all):
 *   the far layer of a {@link module:scripts/assets/standin.mjs} wide zone repeats at
 *   `2 * FRAME_W` and the sheet shows one screenful.
 * @returns {void}
 */
function compositeSurface(target, surface, zonePalette, ox, oy, maxWidth) {
  const width = Math.min(maxWidth ?? surface.width, target.width - ox);
  const height = Math.min(surface.height, target.height - oy);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = surface.indices[y * surface.width + x];
      if (index === KEY) continue;
      const rgba = colorOf(zonePalette[index]);
      setPixel(target, ox + x, oy + y, rgba);
    }
  }
}

/** Colour cache (the palettes repeat; parsing each pixel would only be slower). */
const COLOUR_CACHE = new Map();

/**
 * Parses a `#rrggbb` colour with a cache (the stand-in palette is colour text — the parser is
 * the generator's own `image.mjs` `parseColor`).
 *
 * @param {string} text - The colour.
 * @returns {import('./assets/image.mjs').Rgba} The parsed colour.
 * @throws {RangeError} When the text is not a colour.
 */
function colorOf(text) {
  let rgba = COLOUR_CACHE.get(text);
  if (rgba === undefined) {
    const parsed = parseColor(text);
    if (parsed === null) throw new RangeError(`not a colour: ${text}`);
    rgba = parsed;
    COLOUR_CACHE.set(text, rgba);
  }
  return rgba;
}

/**
 * Renders one readability sheet: the zone's stand-in far layer and first band under
 * {@link BULLETS_PER_SHEET} bullets of one palette, deterministic in the sheet's name.
 *
 * @param {string} zoneId - A `ZONE_IDS` letter.
 * @param {number} paletteIndex - Index into {@link SHEET_PALETTES}.
 * @returns {import('./assets/image.mjs').Image} The FRAME_W × FRAME_H sheet.
 */
export function renderSheet(zoneId, paletteIndex) {
  const palette = SHEET_PALETTES[paletteIndex];
  const zone = standinZone(zoneId);
  const sheet = createImage(FRAME_W, FRAME_H);

  // Backdrop: the far layer (cropped to one screenful), then the first mid band sitting on
  // the bottom edge exactly as the parallax draws it in the stress scenes.
  compositeSurface(sheet, zone.far, zone.palette, 0, 0, FRAME_W);
  const band = zone.bands[0];
  compositeSurface(sheet, band, zone.palette, 0, FRAME_H - band.height);

  // The load: shapes and families in a fixed cycle, positions through the sheet's own seeded
  // generator (seedOf — the rule of every procedural surface: seeded from its name).
  const bullets = bulletSet(palette);
  const rng = createAssetRng(seedOf(`readability/zone-${zoneId}/${palette.id}`));
  for (let i = 0; i < BULLETS_PER_SHEET; i++) {
    const shape = SHAPES[i % SHAPES.length];
    const family = FAMILIES[Math.floor(i / SHAPES.length) % FAMILIES.length];
    const sprite = bullets.get(`bullets/${shape}-${family}`);
    const frame = sprite.frames[shape === 'round' ? 0 : i % 8];
    const x = rng.rangeInt(0, FRAME_W - frame.width);
    const y = rng.rangeInt(0, FRAME_H - frame.height);
    for (let fy = 0; fy < frame.height; fy++) {
      for (let fx = 0; fx < frame.width; fx++) {
        const rgba = getPixel(frame, fx, fy);
        if (rgba[3] === 0) continue;
        setPixel(sheet, x + fx, y + fy, rgba);
      }
    }
  }
  return sheet;
}

/**
 * Writes every sheet of every zone and palette into a folder and returns the file names.
 *
 * @param {{ outDir?: string }} [options] - `outDir`: the folder (default
 *   `assets/generated/readability`).
 * @returns {string[]} The file names written, sorted.
 */
export function writeSheets(options = {}) {
  const outDir = options.outDir ?? DEFAULT_OUT_DIR;
  mkdirSync(outDir, { recursive: true });
  const files = [];
  for (const zoneId of ZONE_IDS) {
    for (let p = 0; p < SHEET_PALETTES.length; p++) {
      const name = sheetPath(zoneId, SHEET_PALETTES[p].id);
      writeFileSync(join(outDir, name), encodePng(renderSheet(zoneId, p), { indexed: 'auto' }));
      files.push(name);
    }
  }
  files.sort();
  return files;
}

// The CLI: `node scripts/bullet-readability.mjs [--out <dir>]`.
const entry = process.argv[1];
if (entry !== undefined && resolve(entry) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  let outDir = DEFAULT_OUT_DIR;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out') {
      if (args[i + 1] === undefined) throw new RangeError('--out needs a folder');
      outDir = resolve(args[++i]);
    } else {
      throw new RangeError(`unknown argument ${args[i]}`);
    }
  }
  const files = writeSheets({ outDir });
  console.log(
    `bullet readability → ${outDir}/: ${files.length} sheets ` +
      `(${ZONE_IDS.length} zones × ${SHEET_PALETTES.length} palettes, ` +
      `${BULLETS_PER_SHEET} bullets each)`,
  );
}
