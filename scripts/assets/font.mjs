/**
 * Bitmap fonts: `assets/source/fonts/*.font.json` → one atlas sprite with a frame per
 * glyph, plus the metrics the manifest's `fonts` section carries.
 *
 * **Format.**
 *
 * ```json
 * {
 *   "name": "pixel",
 *   "description": "optional note",
 *   "cellWidth": 6,
 *   "cellHeight": 8,
 *   "lineHeight": 10,
 *   "advance": 6,
 *   "glyphs": {
 *     "A": [".###..", "#...#.", "#...#.", "#####.", "#...#.", "#...#.", "#...#.", "......"],
 *     "i": {
 *       "rows": ["..#...", "......", ".##...", "..#...", "..#...", "..#...", ".###..", "......"],
 *       "advance": 6
 *     }
 *   }
 * }
 * ```
 *
 * Every glyph is a `cellWidth × cellHeight` pixel map (`#` = ink, `.` = empty) keyed by
 * the character it draws (one Unicode code point). Glyphs are white so the renderer can
 * tint them. `advance` (per font, overridable per glyph) is how far the pen moves.
 *
 * **Output.** The sprite `font/<name>` has one frame per glyph in code-point order
 * (frame names `font/<name>#<i>`, anchor `[0, 0]` = the cell's top-left); the metrics are
 * `{ sprite, lineHeight, cellWidth, cellHeight, glyphs: { "<code point>": { frame, advance } } }`.
 *
 * **Public API.** {@link loadFontSources}, {@link parseFontSource}, {@link buildFontSprite},
 * {@link FONT_SOURCE_SUFFIX}, {@link FONT_NAME_PATTERN}, {@link ASCII_PRINTABLE}; typedefs
 * {@link FontDef}, {@link FontMetrics}.
 *
 * @module
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createImage, setPixel } from './image.mjs';
import { listFiles } from './sprite-source.mjs';

/** @typedef {import('./sprite-source.mjs').AssetIssue} AssetIssue */
/** @typedef {import('./sprite-source.mjs').SpriteDef} SpriteDef */

/**
 * A validated font source.
 *
 * @typedef {object} FontDef
 * @property {string} name - Font name (manifest key; the sprite is `font/<name>`).
 * @property {number} cellWidth - Glyph cell width in pixels.
 * @property {number} cellHeight - Glyph cell height in pixels.
 * @property {number} lineHeight - Distance between baselines of consecutive lines.
 * @property {{ code: number, rows: string[], advance: number }[]} glyphs - Sorted by code.
 * @property {string} origin - Source file path.
 */

/**
 * The manifest's description of one font.
 *
 * @typedef {object} FontMetrics
 * @property {string} sprite - Atlas sprite holding the glyph frames (`font/<name>`).
 * @property {number} lineHeight - Line spacing in pixels.
 * @property {number} cellWidth - Glyph frame width.
 * @property {number} cellHeight - Glyph frame height.
 * @property {Record<string, { frame: string, advance: number }>} glyphs - By decimal code point.
 */

/** File suffix of font sources. */
export const FONT_SOURCE_SUFFIX = '.font.json';

/** Font names: lower-case kebab-case. */
export const FONT_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Keys a `*.font.json` file may contain. */
const FONT_KEYS = [
  'name',
  'description',
  'cellWidth',
  'cellHeight',
  'lineHeight',
  'advance',
  'glyphs',
];

/** Printable ASCII: code points 32 (space) … 126 (`~`). */
export const ASCII_PRINTABLE = Array.from({ length: 95 }, (_, i) => 32 + i);

/** Glyph colour: white, so a multiply tint gives any colour. */
const INK = /** @type {import('./image.mjs').Rgba} */ ([255, 255, 255, 255]);

/**
 * Whether a value is a plain JSON object.
 *
 * @param {unknown} value - Any value.
 * @returns {value is Record<string, unknown>} `true` for non-null, non-array objects.
 */
const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Validates an integer field.
 *
 * @param {unknown} value - The value.
 * @param {number} min - Smallest allowed value.
 * @returns {boolean} `true` when it is an integer ≥ `min`.
 */
const isIntAtLeast = (value, min) =>
  Number.isInteger(value) && /** @type {number} */ (value) >= min;

/**
 * Validates one `*.font.json` document.
 *
 * @param {unknown} json - The parsed document.
 * @param {string} file - Its path (issue-path prefix).
 * @returns {{ font: FontDef | null, issues: AssetIssue[] }} The font (`null` when invalid)
 *   and every problem found.
 */
export function parseFontSource(json, file) {
  /** @type {AssetIssue[]} */
  const issues = [];
  if (!isObject(json)) {
    return { font: null, issues: [{ path: `${file}:`, message: 'must be a JSON object' }] };
  }
  for (const key of Object.keys(json)) {
    if (!FONT_KEYS.includes(key)) issues.push({ path: `${file}:${key}`, message: 'unknown field' });
  }
  const { name, cellWidth, cellHeight, lineHeight, advance, glyphs } = json;
  if (typeof name !== 'string' || !FONT_NAME_PATTERN.test(name)) {
    issues.push({ path: `${file}:name`, message: 'must be a kebab-case font name' });
  }
  if (json.description !== undefined && typeof json.description !== 'string') {
    issues.push({ path: `${file}:description`, message: 'must be a string' });
  }
  for (const [key, value] of Object.entries({ cellWidth, cellHeight, lineHeight })) {
    if (!isIntAtLeast(value, 1))
      issues.push({ path: `${file}:${key}`, message: 'must be an integer ≥ 1' });
  }
  if (!isIntAtLeast(advance, 0))
    issues.push({ path: `${file}:advance`, message: 'must be an integer ≥ 0' });
  /** @type {FontDef['glyphs']} */
  const parsed = [];
  if (!isObject(glyphs) || Object.keys(glyphs).length === 0) {
    issues.push({
      path: `${file}:glyphs`,
      message: 'must be a non-empty object of character → rows',
    });
  } else {
    for (const [char, value] of Object.entries(glyphs)) {
      const at = `${file}:glyphs[${JSON.stringify(char)}]`;
      const points = Array.from(char);
      if (points.length !== 1) {
        issues.push({ path: at, message: 'glyph keys are exactly one character' });
        continue;
      }
      const entry = Array.isArray(value) ? { rows: value } : value;
      if (!isObject(entry) || !Array.isArray(entry.rows)) {
        issues.push({ path: at, message: 'must be an array of rows or { rows, advance }' });
        continue;
      }
      for (const key of Object.keys(entry)) {
        if (key !== 'rows' && key !== 'advance')
          issues.push({ path: `${at}.${key}`, message: 'unknown field' });
      }
      const rows = entry.rows;
      let ok = rows.length === cellHeight;
      if (!ok) issues.push({ path: `${at}.rows`, message: `must have ${String(cellHeight)} rows` });
      rows.forEach((row, r) => {
        if (typeof row !== 'string' || row.length !== cellWidth || !/^[#.]*$/.test(row)) {
          issues.push({
            path: `${at}.rows[${r}]`,
            message: `must be ${String(cellWidth)} characters of "#" (ink) and "." (empty)`,
          });
          ok = false;
        }
      });
      const glyphAdvance = entry.advance ?? advance;
      if (!isIntAtLeast(glyphAdvance, 0)) {
        issues.push({ path: `${at}.advance`, message: 'must be an integer ≥ 0' });
        ok = false;
      }
      if (ok) {
        parsed.push({
          code: /** @type {number} */ (points[0].codePointAt(0)),
          rows: /** @type {string[]} */ (rows.slice()),
          advance: /** @type {number} */ (glyphAdvance),
        });
      }
    }
  }
  if (issues.length > 0) return { font: null, issues };
  parsed.sort((a, b) => a.code - b.code);
  return {
    font: {
      name: /** @type {string} */ (name),
      cellWidth: /** @type {number} */ (cellWidth),
      cellHeight: /** @type {number} */ (cellHeight),
      lineHeight: /** @type {number} */ (lineHeight),
      glyphs: parsed,
      origin: file,
    },
    issues,
  };
}

/**
 * Turns a font into its atlas sprite and manifest metrics.
 *
 * @param {FontDef} font - A validated font.
 * @returns {{ sprite: SpriteDef, metrics: FontMetrics }} The glyph sprite (`font/<name>`)
 *   and the metrics pointing at its frames.
 */
export function buildFontSprite(font) {
  const spriteName = `font/${font.name}`;
  /** @type {FontMetrics['glyphs']} */
  const glyphs = {};
  const frames = font.glyphs.map((glyph, i) => {
    const image = createImage(font.cellWidth, font.cellHeight);
    glyph.rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) if (row.charAt(x) === '#') setPixel(image, x, y, INK);
    });
    glyphs[String(glyph.code)] = { frame: `${spriteName}#${i}`, advance: glyph.advance };
    return image;
  });
  return {
    sprite: {
      name: spriteName,
      anchor: [0, 0],
      hitFlash: false,
      frames,
      animations: {},
      origin: font.origin,
    },
    metrics: {
      sprite: spriteName,
      lineHeight: font.lineHeight,
      cellWidth: font.cellWidth,
      cellHeight: font.cellHeight,
      glyphs,
    },
  };
}

/**
 * Reads every `*.font.json` below a directory.
 *
 * @param {string} dir - Absolute path of the fonts directory.
 * @param {string} displayRoot - Prefix for issue paths (e.g. `assets/source/fonts`).
 * @returns {{ fonts: FontDef[], issues: AssetIssue[] }} Fonts in path order and problems
 *   (a repeated font name is an issue).
 */
export function loadFontSources(dir, displayRoot) {
  /** @type {FontDef[]} */
  const fonts = [];
  /** @type {AssetIssue[]} */
  const issues = [];
  for (const relative of listFiles(dir)) {
    if (!relative.endsWith(FONT_SOURCE_SUFFIX)) continue;
    const shown = `${displayRoot}/${relative}`;
    let json;
    try {
      json = JSON.parse(readFileSync(join(dir, relative), 'utf8'));
    } catch (error) {
      issues.push({
        path: `${shown}:`,
        message: `invalid JSON: ${/** @type {Error} */ (error).message}`,
      });
      continue;
    }
    const result = parseFontSource(json, shown);
    issues.push(...result.issues);
    if (result.font === null) continue;
    if (fonts.some((font) => font.name === result.font?.name)) {
      issues.push({
        path: `${shown}:name`,
        message: `font "${result.font.name}" is defined twice`,
      });
      continue;
    }
    fonts.push(result.font);
  }
  return { fonts, issues };
}
