#!/usr/bin/env node
/**
 * `node scripts/content/rescale.mjs --factor 1.5 --top-pad 36 [--dry-run]` — ports `content/` to a
 * new world scale by the **unit** of every number (plan_resolution.md R1-03; run for real by R2-02,
 * the ×1.5 port of v2). Every numeric schema field names a unit (`core/data/units` `NumberUnit`),
 * and each unit has a rule (§2.6 — the frame grows ×5/3, the world only ×3/2):
 *
 * - **world** values (`world-px`, `world-x`, `rel-px`, `px-per-tick`, `px-per-tick2`, `texels`)
 *   are ×k;
 * - **absolute y** (`world-y`) is ×k plus the top pad — except **above the top edge** (y < 0),
 *   where it is ×k only so that what entered from above still does; the tool lists every such
 *   value, the spawns first (an enemy that spawned above and moved in now arrives `topPad` px
 *   higher — R2-02 fixes each one by hand);
 * - **edge-anchored** values (`screen-x`, `screen-y`) snap to the nearest of the playfield axis's
 *   start, centre and end and keep their distance to it ×k (owner decision O3: a spawn 16 px past
 *   the right edge stays 24 px past the new one);
 * - **tile rows** (`tile-rows`) gain the rows the top pad inserts (`topPad / (tileSize × k)`), and
 *   every tilemap's explicit `rle` rows gain as many copies of their top row at the top (a ceiling
 *   that touches the top edge gets thicker, open sky stays open); heightfield floors stay measured
 *   from the floor (`rel-px`) and ceilings get the pad through their `world-y` base;
 * - **tile pixels** (`tile-px`): a tile size is ×k, and every tileset mask is resampled to the new
 *   size by `scripts/assets/procedural/terrain.mjs` {@link resampleMask} (straight edges exactly;
 *   the tool lists any mask it can only approximate);
 * - **times, angles, counts, scores, ratios, audio, seeds, indices** are unchanged.
 *
 * Two units are looked up: a behaviour tunable (`param`) takes its unit from core's
 * `BEHAVIOR_PARAM_UNITS[behaviour][name]` (owner decision O5; the behaviour is the `script` of the
 * enemy or boss phase, or the `behavior` of the weapon, that holds the `params`). A bullet-pattern
 * parameter (`inherit`, a reference's `$1` … `$9`) is **kept**: a parameter is a value that takes
 * its unit where the referenced action uses it, and those uses are ported in place — an expression
 * string of a scaled field becomes `(…) * k` — so passing the old value gives the scaled result
 * however the action combines it.
 *
 * **What it reads.** Every content file (`readContentFiles` of `vite.shared.ts`, plus the
 * `example.*.json` samples unless `--no-examples`), each with its kind's file schema: core's
 * `CONTENT_FILE_SCHEMAS` and the foreign kinds' `SFX_FILE_SCHEMA` / `MUSIC_FILE_SCHEMA`
 * (`@shmup/audio-web`), `INPUT_PROFILES_FILE_SCHEMA` (`@shmup/input-web`) and `FX_FILE_SCHEMA`
 * (`@shmup/render-pixi`). The packages are TypeScript, loaded through Vite's `ssrLoadModule` like
 * `scripts/audio-preview.mjs`. `content/demos/` is skipped (recordings are re-recorded, never
 * rescaled). Every file must validate first.
 *
 * **What it writes.** Only the numbers it changes: their source text is replaced in place (a
 * position-aware JSON reader keeps everything else), then the file is formatted through
 * Prettier's API with the repository's settings — a port's diff shows the changed values only.
 * Integer fields are rounded and listed (owner decision O4); other results lose binary noise (12
 * significant digits). It **refuses to write** while any value is unclassified (no unit, a
 * behaviour tunable without a unit, a rule an expression string cannot take) or any file has an
 * error, and `--dry-run` writes nothing at all. The report lists every value moved by a rule other
 * than ×k, every value above the top edge, every rounded integer, every value outside today's
 * schema bounds (frame-derived bounds widen at R2-01), every approximated mask, the padded
 * tilemaps and every tilemap the view would see past.
 *
 * **Geometry.** The content was written for a playfield of `--from-width` × `--from-height` with
 * `--tile-size` tiles (defaults: core's `PLAYFIELD_W`, `PLAYFIELD_H`, `TILE_SIZE` — today's frame;
 * after R2-01 flips core, pass the v1 numbers). The new playfield is `fromHeight × k + topPad`
 * tall and `--to-width` wide (default: the frame keeps today's aspect ratio and its HUD bars scale
 * ×k — 640 for v2's 1.5 / 36). Every tileset and tilemap must be at `--tile-size`.
 *
 * Options: `--factor K` (required), `--top-pad P` (default 0), `--dry-run`, `--root DIR` (default
 * `content/`), `--no-examples`, `--from-width W`, `--from-height H`, `--tile-size T`,
 * `--to-width W`, `--json` (the result as JSON), `--quiet` (the summary only). Exit code 0 = done
 * (or nothing to do), 1 = refused (unclassified values or errors), 2 = bad arguments.
 *
 * **Public API.** {@link parseRescaleArgs}, {@link loadRescaleModules}, {@link rescaleGeometry},
 * {@link planRescale}, {@link rescaleContent}, {@link formatRescaleReport}, {@link jsonSpans},
 * {@link replaceJsonValues}, {@link scaleExpression}, {@link spreadBands}, {@link modulesFrom},
 * {@link RescaleError}, {@link SKIPPED_DIRS}.
 *
 * @module
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lineMaskEnds, resampleMask } from '../assets/procedural/terrain.mjs';

/** Repository root (this file lives in `scripts/content/`). */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Default content root. */
const DEFAULT_ROOT = join(REPO_ROOT, 'content');

/**
 * The workspace packages' source `exports` condition (`SOURCE_CONDITION` of `vite.shared.ts`,
 * which cannot be imported here before Vite has loaded it).
 */
const SOURCE_CONDITION = '@shmup/source';

/** Content folders the tool never touches: the attract demos are recordings (re-recorded). */
export const SKIPPED_DIRS = Object.freeze(['demos']);

/** Significant digits a ported fraction keeps (drops binary noise such as `0.15000000000000002`). */
const FRACTION_DIGITS = 12;

/** Longest expression string the bullet-pattern DSL accepts (its schema's limit). */
const MAX_EXPRESSION_LENGTH = 256;

/** A refusal or a usage error of the tool. */
export class RescaleError extends Error {
  /**
   * @param {string} message - What is wrong.
   * @param {number} [exitCode] - Process exit code (2 = bad arguments).
   */
  constructor(message, exitCode = 2) {
    super(message);
    this.name = 'RescaleError';
    /** Process exit code. */
    this.exitCode = exitCode;
  }
}

/**
 * The command-line options.
 *
 * @typedef {object} RescaleOptions
 * @property {number} factor - The world scale k.
 * @property {number} topPad - Pixels inserted at the top of the playfield.
 * @property {boolean} dryRun - Report only, write nothing.
 * @property {string} root - Content root directory.
 * @property {boolean} examples - Also port the `example.*.json` samples.
 * @property {number | null} fromWidth - Old playfield width (`null` = core's).
 * @property {number | null} fromHeight - Old playfield height (`null` = core's).
 * @property {number | null} tileSize - Old tile size (`null` = core's).
 * @property {number | null} toWidth - New playfield width (`null` = derived).
 * @property {boolean} json - Print the result as JSON.
 * @property {boolean} quiet - Print the summary only.
 */

/**
 * Parses the command line.
 *
 * @param {readonly string[]} argv - Arguments after the script name.
 * @returns {RescaleOptions} The options.
 * @throws {RescaleError} On an unknown option, a missing or bad value, or no `--factor`.
 */
export function parseRescaleArgs(argv) {
  /** @type {RescaleOptions} */
  const options = {
    factor: Number.NaN,
    topPad: 0,
    dryRun: false,
    root: DEFAULT_ROOT,
    examples: true,
    fromWidth: null,
    fromHeight: null,
    tileSize: null,
    toWidth: null,
    json: false,
    quiet: false,
  };
  /**
   * Reads the number after an option.
   *
   * @param {number} i - Index of the option.
   * @param {boolean} positive - Whether it must be > 0 (else ≥ 0).
   * @returns {number} The number.
   */
  const numberAt = (i, positive) => {
    const text = argv[i + 1];
    const value = text === undefined ? Number.NaN : Number(text);
    if (text === undefined || text.trim() === '' || !Number.isFinite(value)) {
      throw new RescaleError(`${argv[i]} needs a number`);
    }
    if (positive ? value <= 0 : value < 0) {
      throw new RescaleError(`${argv[i]} must be ${positive ? '> 0' : '>= 0'}, got ${text}`);
    }
    return value;
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--factor':
        options.factor = numberAt(i++, true);
        break;
      case '--top-pad':
        options.topPad = numberAt(i++, false);
        break;
      case '--from-width':
        options.fromWidth = numberAt(i++, true);
        break;
      case '--from-height':
        options.fromHeight = numberAt(i++, true);
        break;
      case '--tile-size':
        options.tileSize = numberAt(i++, true);
        break;
      case '--to-width':
        options.toWidth = numberAt(i++, true);
        break;
      case '--root': {
        const dir = argv[++i];
        if (dir === undefined) throw new RescaleError('--root needs a directory');
        options.root = resolve(dir);
        break;
      }
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--no-examples':
        options.examples = false;
        break;
      case '--json':
        options.json = true;
        break;
      case '--quiet':
        options.quiet = true;
        break;
      default:
        throw new RescaleError(`unknown option ${arg}`);
    }
  }
  if (Number.isNaN(options.factor)) throw new RescaleError('--factor K is required');
  return options;
}

/**
 * What the tool needs from the workspace packages (loaded by {@link loadRescaleModules}, or
 * imported directly by tests).
 *
 * @typedef {object} RescaleModules
 * @property {Record<string, import('@shmup/core').Schema<unknown>>} schemas - Kind → file schema,
 *   every kind the content may hold.
 * @property {typeof import('@shmup/core').walkNumbers} walkNumbers - core/data/units.
 * @property {typeof import('@shmup/core').rescaleNumber} rescaleNumber - core/data/units.
 * @property {typeof import('@shmup/core').edgeAnchor} edgeAnchor - core/data/units.
 * @property {typeof import('@shmup/core').UNIT_RULES} unitRules - core/data/units.
 * @property {Readonly<Record<string, Readonly<Record<string, string>>>> | null} behaviorParamUnits
 *   - core's `BEHAVIOR_PARAM_UNITS` (behaviour → tunable → unit), `null` while core has none.
 * @property {{ playfieldW: number, playfieldH: number, tileSize: number, frameW: number,
 *   frameH: number }} frame - Core's frame constants (the default geometry).
 * @property {(root: string) => { path: string, data: unknown }[]} readContentFiles -
 *   `vite.shared.ts`'s reader (shipped files, no examples).
 */

/**
 * Loads core, the three content-owning packages and `vite.shared.ts` through Vite's SSR loader.
 *
 * @returns {Promise<{ modules: RescaleModules, close: () => Promise<void> }>} The modules and the
 *   function that shuts the Vite server down (call it when done).
 * @throws {Error} When Vite cannot load a module.
 */
export async function loadRescaleModules() {
  const { createServer, defaultClientConditions, defaultServerConditions } = await import('vite');
  // `configFile: false` skips vite.shared.ts, so the `@shmup/source` condition is set here.
  const server = await createServer({
    configFile: false,
    root: REPO_ROOT,
    logLevel: 'error',
    appType: 'custom',
    resolve: { conditions: [SOURCE_CONDITION, ...defaultClientConditions] },
    ssr: { resolve: { conditions: [SOURCE_CONDITION, ...defaultServerConditions] } },
    server: { middlewareMode: true, hmr: false, ws: false },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    const shared = /** @type {typeof import('../../vite.shared.js')} */ (
      await server.ssrLoadModule('/vite.shared.ts')
    );
    const core = /** @type {typeof import('../../packages/core/src/index.js')} */ (
      await server.ssrLoadModule('/packages/core/src/index.ts')
    );
    const audio = /** @type {typeof import('../../packages/audio-web/src/index.js')} */ (
      await server.ssrLoadModule('/packages/audio-web/src/index.ts')
    );
    const input = /** @type {typeof import('../../packages/input-web/src/index.js')} */ (
      await server.ssrLoadModule('/packages/input-web/src/index.ts')
    );
    // The particles module alone: the render-pixi barrel would load all of PixiJS.
    const particles =
      /** @type {typeof import('../../packages/render-pixi/src/particles/index.js')} */ (
        await server.ssrLoadModule('/packages/render-pixi/src/particles/index.ts')
      );
    return {
      modules: modulesFrom(core, { audio, input, particles }, shared.readContentFiles),
      close: () => server.close(),
    };
  } catch (error) {
    await server.close();
    throw error;
  }
}

/**
 * Builds {@link RescaleModules} from imported packages.
 *
 * @param {Record<string, unknown> & typeof import('@shmup/core')} core - `@shmup/core`.
 * @param {{ audio: { SFX_FILE_SCHEMA: unknown, MUSIC_FILE_SCHEMA: unknown },
 *   input: { INPUT_PROFILES_FILE_SCHEMA: unknown }, particles: { FX_FILE_SCHEMA: unknown } }}
 *   owners - The foreign kinds' owners.
 * @param {(root: string) => { path: string, data: unknown }[]} readContentFiles - The reader.
 * @returns {RescaleModules} The modules.
 */
export function modulesFrom(core, owners, readContentFiles) {
  const table = /** @type {Record<string, unknown>} */ (core)['BEHAVIOR_PARAM_UNITS'];
  return {
    schemas: /** @type {RescaleModules['schemas']} */ ({
      ...core.CONTENT_FILE_SCHEMAS,
      sfx: owners.audio.SFX_FILE_SCHEMA,
      music: owners.audio.MUSIC_FILE_SCHEMA,
      'input-profiles': owners.input.INPUT_PROFILES_FILE_SCHEMA,
      fx: owners.particles.FX_FILE_SCHEMA,
    }),
    walkNumbers: core.walkNumbers,
    rescaleNumber: core.rescaleNumber,
    edgeAnchor: core.edgeAnchor,
    unitRules: core.UNIT_RULES,
    behaviorParamUnits:
      table === undefined ? null : /** @type {RescaleModules['behaviorParamUnits']} */ (table),
    frame: {
      playfieldW: core.PLAYFIELD_W,
      playfieldH: core.PLAYFIELD_H,
      tileSize: core.TILE_SIZE,
      frameW: core.FRAME_W,
      frameH: core.FRAME_H,
    },
    readContentFiles,
  };
}

/**
 * The geometry of a port (core `RescaleOptions` plus what the tool derives).
 *
 * @typedef {object} RescaleGeometry
 * @property {number} factor - k.
 * @property {number} topPad - Pixels inserted at the top.
 * @property {number} fromWidth - Old playfield width.
 * @property {number} fromHeight - Old playfield height.
 * @property {number} toWidth - New playfield width.
 * @property {number} toHeight - New playfield height (`fromHeight × k + topPad`).
 * @property {number} tileSize - Old tile size.
 * @property {number} toTileSize - New tile size (`tileSize × k`).
 * @property {number} padRows - Tile rows the top pad inserts (`topPad / toTileSize`).
 */

/**
 * Works out the geometry of a port.
 *
 * @param {Pick<RescaleOptions, 'factor' | 'topPad' | 'fromWidth' | 'fromHeight' | 'tileSize' |
 *   'toWidth'>} options - The options.
 * @param {RescaleModules['frame']} frame - Core's frame constants.
 * @returns {RescaleGeometry} The geometry.
 * @throws {RescaleError} When the new tile size or the inserted rows are not whole numbers.
 * @example
 * ```js
 * rescaleGeometry({ factor: 1.5, topPad: 36, fromWidth: null, fromHeight: null, tileSize: null,
 *   toWidth: null }, frame); // v2 (from today's frame): 640 × 336, 12-px tiles, 3 rows
 * ```
 */
export function rescaleGeometry(options, frame) {
  const { factor, topPad } = options;
  if (options.tileSize !== null && options.tileSize !== frame.tileSize) {
    // Content for another tile size than core's: core's frame describes neither side of the port.
    const missing = ['fromWidth', 'fromHeight', 'toWidth'].filter(
      (key) => options[/** @type {'fromWidth' | 'fromHeight' | 'toWidth'} */ (key)] === null,
    );
    if (missing.length > 0) {
      throw new RescaleError(
        `--tile-size ${String(options.tileSize)} is not core's TILE_SIZE ` +
          `${String(frame.tileSize)}: pass --from-width, --from-height and --to-width too`,
      );
    }
  }
  const fromWidth = options.fromWidth ?? frame.playfieldW;
  const fromHeight = options.fromHeight ?? frame.playfieldH;
  const tileSize = options.tileSize ?? frame.tileSize;
  const toHeight = fromHeight * factor + topPad;
  // The frame keeps its aspect ratio; its HUD bars (frame − playfield) scale with the world.
  const toFrameHeight = toHeight + (frame.frameH - frame.playfieldH) * factor;
  const toWidth = options.toWidth ?? Math.round((toFrameHeight * frame.frameW) / frame.frameH);
  const toTileSize = tileSize * factor;
  if (!Number.isInteger(toTileSize)) {
    throw new RescaleError(
      `the new tile size ${String(tileSize)} × ${String(factor)} = ${String(toTileSize)} is not a ` +
        'whole number of pixels',
      1,
    );
  }
  const padRows = topPad / toTileSize;
  if (!Number.isInteger(padRows)) {
    throw new RescaleError(
      `--top-pad ${String(topPad)} is not a whole number of ${String(toTileSize)}-px tile rows`,
      1,
    );
  }
  return {
    factor,
    topPad,
    fromWidth,
    fromHeight,
    toWidth,
    toHeight,
    tileSize,
    toTileSize,
    padRows,
  };
}

/**
 * Where a JSON value sits in its source text ({@link jsonSpans}).
 *
 * @typedef {object} JsonSpan
 * @property {number} start - Offset of its first character.
 * @property {number} end - Offset just past its last character.
 * @property {Map<string | number, JsonSpan> | null} children - An object's members by key or an
 *   array's items by index; `null` for a scalar.
 */

/**
 * Reads a JSON text into the source spans of its values (strict JSON; `JSON.parse` agrees).
 *
 * @param {string} text - The JSON text.
 * @returns {JsonSpan} The root value's span.
 * @throws {SyntaxError} When the text is not JSON.
 */
export function jsonSpans(text) {
  let i = 0;
  /** Skips whitespace. */
  const skip = () => {
    while (
      i < text.length &&
      (text[i] === ' ' || text[i] === '\n' || text[i] === '\r' || text[i] === '\t')
    )
      i++;
  };
  /**
   * Fails at the current offset.
   *
   * @param {string} what - What was expected.
   * @returns {never} Never returns.
   */
  const fail = (what) => {
    throw new SyntaxError(`expected ${what} at offset ${String(i)}`);
  };
  /** Reads a string token. */
  const string = () => {
    if (text[i] !== '"') fail('a string');
    i++;
    while (i < text.length) {
      const ch = text[i];
      if (ch === '\\') i += 2;
      else if (ch === '"') {
        i++;
        return;
      } else i++;
    }
    fail('the end of a string');
  };
  const scalar = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?|true|false|null/y;
  /**
   * Reads one value.
   *
   * @returns {JsonSpan} Its span.
   */
  const value = () => {
    skip();
    const start = i;
    if (text[i] === '{') {
      i++;
      /** @type {Map<string | number, JsonSpan>} */
      const children = new Map();
      skip();
      if (text[i] === '}') {
        i++;
        return { start, end: i, children };
      }
      for (;;) {
        skip();
        const keyStart = i;
        string();
        const key = /** @type {string} */ (JSON.parse(text.slice(keyStart, i)));
        skip();
        if (text[i] !== ':') fail('":"');
        i++;
        children.set(key, value());
        skip();
        if (text[i] === ',') {
          i++;
          continue;
        }
        if (text[i] !== '}') fail('"," or "}"');
        i++;
        return { start, end: i, children };
      }
    }
    if (text[i] === '[') {
      i++;
      /** @type {Map<string | number, JsonSpan>} */
      const children = new Map();
      skip();
      if (text[i] === ']') {
        i++;
        return { start, end: i, children };
      }
      for (let index = 0; ; index++) {
        children.set(index, value());
        skip();
        if (text[i] === ',') {
          i++;
          continue;
        }
        if (text[i] !== ']') fail('"," or "]"');
        i++;
        return { start, end: i, children };
      }
    }
    if (text[i] === '"') {
      string();
      return { start, end: i, children: null };
    }
    scalar.lastIndex = i;
    const match = scalar.exec(text);
    if (match === null) fail('a JSON value');
    i += /** @type {RegExpExecArray} */ (match)[0].length;
    return { start, end: i, children: null };
  };
  const root = value();
  skip();
  if (i !== text.length) fail('the end of the text');
  return root;
}

/**
 * One replacement of {@link replaceJsonValues}: the value at a key path becomes a new value.
 *
 * @typedef {object} JsonReplacement
 * @property {readonly (string | number)[]} keys - Object keys and array indices from the root.
 * @property {unknown} value - The new value (written with `JSON.stringify`).
 */

/**
 * Replaces values of a JSON text in place, leaving every other character as it was.
 *
 * @param {string} text - The JSON text.
 * @param {readonly JsonReplacement[]} replacements - What to replace; no two may overlap.
 * @returns {string} The new text.
 * @throws {RangeError} When a key path does not exist or two replacements overlap.
 * @example
 * ```js
 * replaceJsonValues('{ "a": [1, 2] }', [{ keys: ['a', 1], value: 3 }]); // '{ "a": [1, 3] }'
 * ```
 */
export function replaceJsonValues(text, replacements) {
  const root = jsonSpans(text);
  const spans = replacements.map((replacement) => {
    let span = root;
    for (const key of replacement.keys) {
      const child = span.children === null ? undefined : span.children.get(key);
      if (child === undefined) {
        throw new RangeError(`no JSON value at ${replacement.keys.join('.')}`);
      }
      span = child;
    }
    return { start: span.start, end: span.end, text: JSON.stringify(replacement.value) };
  });
  spans.sort((a, b) => b.start - a.start);
  let out = text;
  let limit = Number.POSITIVE_INFINITY;
  for (const span of spans) {
    if (span.end > limit) throw new RangeError('two replacements overlap');
    out = out.slice(0, span.start) + span.text + out.slice(span.end);
    limit = span.start;
  }
  return out;
}

/**
 * Scales a bullet-pattern expression string by k (the DSL's grammar: `+ - * /`, parentheses).
 *
 * @param {string} expression - The expression (valid DSL).
 * @param {number} factor - k.
 * @returns {string} A plain number literal scaled, anything else `(expression) * k`; the input
 *   itself for k = 1.
 * @example
 * ```js
 * scaleExpression('1.25 + $rank / 32', 1.5); // '(1.25 + $rank / 32) * 1.5'
 * scaleExpression('2', 1.5); // '3'
 * ```
 */
export function scaleExpression(expression, factor) {
  if (factor === 1) return expression;
  if (/^\s*-?[0-9]+(?:\.[0-9]+)?\s*$/.test(expression)) {
    return String(cleanFraction(Number(expression) * factor));
  }
  return `(${expression.trim()}) * ${String(factor)}`;
}

/**
 * Drops binary floating-point noise from a ported value.
 *
 * @param {number} value - The value.
 * @returns {number} Whole numbers as they are, fractions rounded to {@link FRACTION_DIGITS}
 *   significant digits.
 */
function cleanFraction(value) {
  return Number.isInteger(value) ? value : Number(value.toPrecision(FRACTION_DIGITS));
}

/**
 * Plain object test.
 *
 * @param {unknown} value - Any JSON value.
 * @returns {value is Record<string, unknown>} `true` for a JSON object.
 */
const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The key under which a container holds a child.
 *
 * @param {unknown} parent - An object or array.
 * @param {unknown} child - One of its values (an object or array).
 * @returns {string | number} The key or index.
 * @throws {RangeError} When `child` is not in `parent`.
 */
function keyOf(parent, child) {
  if (Array.isArray(parent)) {
    const index = parent.indexOf(child);
    if (index >= 0) return index;
  } else if (isObject(parent)) {
    for (const key of Object.keys(parent)) if (parent[key] === child) return key;
  }
  throw new RangeError('a walked value is not in its parent');
}

/**
 * The key path of a walked number (`NumberLeaf.parents` + its key).
 *
 * @param {import('@shmup/core').NumberLeaf} leaf - The leaf.
 * @returns {(string | number)[]} Keys from the document root.
 */
function keysOf(leaf) {
  const keys = [];
  for (let i = 0; i + 1 < leaf.parents.length; i++) {
    keys.push(keyOf(leaf.parents[i], leaf.parents[i + 1]));
  }
  if (leaf.container !== null) keys.push(leaf.key);
  return keys;
}

/**
 * One content file to port.
 *
 * @typedef {object} RescaleInputFile
 * @property {string} path - Path below the content root (POSIX).
 * @property {string} text - Its JSON text.
 */

/**
 * A value the report names.
 *
 * @typedef {object} RescaleEntry
 * @property {string} file - Path below the content root.
 * @property {string} path - JSON path in the file (`events[3].y`).
 * @property {string} field - The schema field (`events[]<type=spawn>.y`).
 * @property {string | undefined} unit - Its unit (a tunable's resolved one).
 * @property {unknown} from - The value as written.
 * @property {unknown} to - The ported value.
 * @property {string} note - What happened (the rule, the anchor, why it is listed).
 */

/**
 * What {@link planRescale} found and made.
 *
 * @typedef {object} RescalePlan
 * @property {RescaleGeometry} geometry - The port's geometry.
 * @property {number} files - Files read (skipped ones included).
 * @property {string[]} skipped - Files left alone (the demos).
 * @property {number} values - Numbers (and expression strings) walked.
 * @property {number} changes - Values the port changes (an inserted row and a resampled mask
 *   count once each).
 * @property {{ path: string, text: string, changes: number }[]} changed - Every file the port
 *   changes, with its new text (not yet formatted).
 * @property {RescaleEntry[]} unclassified - Values without a rule (the tool refuses to write).
 * @property {{ file: string, message: string }[]} errors - Files that cannot be ported.
 * @property {RescaleEntry[]} moved - Values moved by a rule other than ×k.
 * @property {RescaleEntry[]} aboveTop - Values above the top edge (`world-y` < 0), spawns first.
 * @property {RescaleEntry[]} rounded - Integer fields rounded (owner decision O4).
 * @property {RescaleEntry[]} outOfBounds - Ported values outside today's schema bounds.
 * @property {RescaleEntry[]} masks - Tileset masks resampled only approximately.
 * @property {RescaleEntry[]} tilemaps - Tilemaps given rows at the top.
 * @property {RescaleEntry[]} views - Tilemaps the view would see past after the port.
 * @property {RescaleEntry[]} expressions - Expression strings rewritten.
 */

/**
 * The unit of a behaviour tunable.
 *
 * @param {import('@shmup/core').NumberLeaf} leaf - A `param` leaf.
 * @param {RescaleModules['behaviorParamUnits']} table - `BEHAVIOR_PARAM_UNITS`, or `null`.
 * @returns {{ unit: string } | { reason: string }} The unit, or why there is none.
 */
function tunableUnit(leaf, table) {
  if (table === null) return { reason: 'core exports no BEHAVIOR_PARAM_UNITS yet' };
  const owner = leaf.parents[leaf.parents.length - 2];
  const behaviour = isObject(owner)
    ? typeof owner['script'] === 'string'
      ? owner['script']
      : owner['behavior']
    : undefined;
  if (typeof behaviour !== 'string') return { reason: 'no behaviour names this tunable' };
  const units = Object.prototype.hasOwnProperty.call(table, behaviour) ? table[behaviour] : null;
  if (units === null || units === undefined) {
    return { reason: `behaviour "${behaviour}" has no unit table` };
  }
  const name = String(leaf.key);
  const unit = Object.prototype.hasOwnProperty.call(units, name) ? units[name] : undefined;
  if (unit === undefined) return { reason: `behaviour "${behaviour}" has no unit for "${name}"` };
  return { unit };
}

/**
 * Plans a port: walks every file with its schema and works out every new value, without reading
 * or writing anything on disk.
 *
 * @param {readonly RescaleInputFile[]} files - The content files (any order; reported in path
 *   order).
 * @param {RescaleGeometry} geometry - The port's geometry ({@link rescaleGeometry}).
 * @param {RescaleModules} modules - The packages.
 * @returns {RescalePlan} What the port does.
 */
export function planRescale(files, geometry, modules) {
  /** @type {RescalePlan} */
  const plan = {
    geometry,
    files: files.length,
    skipped: [],
    values: 0,
    changes: 0,
    changed: [],
    unclassified: [],
    errors: [],
    moved: [],
    aboveTop: [],
    rounded: [],
    outOfBounds: [],
    masks: [],
    tilemaps: [],
    views: [],
    expressions: [],
  };
  const ordered = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  for (const file of ordered) {
    const top = file.path.split('/')[0];
    if (SKIPPED_DIRS.indexOf(top) >= 0) {
      plan.skipped.push(file.path);
      continue;
    }
    /** @type {unknown} */
    let data;
    try {
      data = JSON.parse(file.text);
    } catch (error) {
      plan.errors.push({ file: file.path, message: `not JSON: ${String(error)}` });
      continue;
    }
    const kind = isObject(data) ? data['kind'] : undefined;
    if (kind === 'replay') {
      plan.skipped.push(file.path);
      continue;
    }
    const schema =
      typeof kind === 'string' && Object.prototype.hasOwnProperty.call(modules.schemas, kind)
        ? modules.schemas[kind]
        : undefined;
    if (schema === undefined) {
      plan.errors.push({ file: file.path, message: `no file schema for kind ${String(kind)}` });
      continue;
    }
    /** @type {import('@shmup/core').ValidationIssue[]} */
    const issues = [];
    schema.parse(data, '', issues, []);
    if (issues.length > 0) {
      for (const issue of issues) {
        plan.errors.push({ file: file.path, message: `${issue.path}: ${issue.message}` });
      }
      continue;
    }
    portFile(file, /** @type {Record<string, unknown>} */ (data), schema, geometry, modules, plan);
  }
  // Spawns first, then the rest, each in path order (a stable sort).
  plan.aboveTop.sort(
    (a, b) => Number(b.note.startsWith('spawn')) - Number(a.note.startsWith('spawn')),
  );
  return plan;
}

/**
 * Ports one validated file into the plan.
 *
 * @param {RescaleInputFile} file - The file.
 * @param {Record<string, unknown>} data - Its parsed JSON.
 * @param {import('@shmup/core').Schema<unknown>} schema - Its file schema.
 * @param {RescaleGeometry} geometry - The port's geometry.
 * @param {RescaleModules} modules - The packages.
 * @param {RescalePlan} plan - Collector.
 */
function portFile(file, data, schema, geometry, modules, plan) {
  const { factor } = geometry;
  /** @type {JsonReplacement[]} */
  const replacements = [];
  let changes = 0;
  /** @type {Map<unknown[], { keys: (string | number)[], field: string, path: string }>} */
  const masks = new Map();
  /**
   * @type {Map<unknown[], { keys: (string | number)[], field: string, path: string,
   *   effect: Record<string, unknown>, unit: import('@shmup/core').NumberUnit }>}
   */
  const bands = new Map();
  /**
   * Records an entry of the report.
   *
   * @param {RescaleEntry[]} list - Which list.
   * @param {import('@shmup/core').NumberLeaf} leaf - The value.
   * @param {string | undefined} unit - Its unit.
   * @param {unknown} to - The ported value.
   * @param {string} note - Why it is listed.
   */
  const note = (list, leaf, unit, to, note) => {
    list.push({
      file: file.path,
      path: leaf.path,
      field: leaf.field,
      unit,
      from: leaf.value,
      to,
      note,
    });
  };
  const geometryError = (/** @type {string} */ message) =>
    plan.errors.push({ file: file.path, message });
  // The tile sizes the content was written for must be the geometry's.
  if (data['kind'] === 'tileset' && data['tileSize'] !== geometry.tileSize) {
    geometryError(
      `tileSize ${String(data['tileSize'])} is not --tile-size ${String(geometry.tileSize)} ` +
        '(pass the geometry the content was written for: --from-width, --from-height, ' +
        '--tile-size, --to-width)',
    );
    return;
  }
  const tilemap = data['kind'] === 'stage' && isObject(data['tilemap']) ? data['tilemap'] : null;
  if (tilemap !== null && tilemap['tileSize'] !== geometry.tileSize) {
    geometryError(
      `tilemap.tileSize ${String(tilemap['tileSize'])} is not --tile-size ` +
        String(geometry.tileSize),
    );
    return;
  }
  const skips = modules.walkNumbers(schema, data, (leaf) => {
    plan.values++;
    let unit = leaf.unit;
    if (unit === undefined) {
      note(plan.unclassified, leaf, unit, leaf.value, 'the schema field has no unit');
      return;
    }
    if (unit === 'param') {
      const resolved = tunableUnit(leaf, modules.behaviorParamUnits);
      if ('reason' in resolved) {
        note(plan.unclassified, leaf, unit, leaf.value, resolved.reason);
        return;
      }
      unit = /** @type {import('@shmup/core').NumberUnit} */ (resolved.unit);
      if (!Object.prototype.hasOwnProperty.call(modules.unitRules, unit) || unit === 'param') {
        note(plan.unclassified, leaf, unit, leaf.value, `unknown tunable unit "${unit}"`);
        return;
      }
    }
    // A pattern parameter keeps its value: its uses are ported where they are (module docs).
    const rule = unit === 'inherit' ? 'keep' : modules.unitRules[unit];
    if (rule === 'lookup') {
      note(plan.unclassified, leaf, unit, leaf.value, `unit "${unit}" was not resolved`);
      return;
    }
    if (typeof leaf.value === 'string') {
      // An expression string: only `keep` and `scale` have a meaning for one.
      if (rule === 'keep') return;
      if (rule !== 'scale') {
        note(plan.unclassified, leaf, unit, leaf.value, `an expression cannot take rule ${rule}`);
        return;
      }
      const scaled = scaleExpression(leaf.value, factor);
      if (scaled === leaf.value) return;
      if (scaled.length > MAX_EXPRESSION_LENGTH) {
        note(plan.unclassified, leaf, unit, leaf.value, 'the scaled expression is too long');
        return;
      }
      replacements.push({ keys: keysOf(leaf), value: scaled });
      changes++;
      note(plan.expressions, leaf, unit, scaled, `×${String(factor)}`);
      return;
    }
    const value = leaf.value;
    if (leaf.integer && Array.isArray(leaf.container) && leaf.field.endsWith('raster[].bands[]')) {
      // Raster band heights must add up to the effect's rows: spread together after the walk.
      if (!bands.has(leaf.container)) {
        const keys = keysOf(leaf);
        keys.pop();
        const effect = leaf.parents[leaf.parents.length - 2];
        bands.set(leaf.container, {
          keys,
          field: leaf.field,
          path: leaf.path.replace(/\[\d+\]$/, ''),
          effect: isObject(effect) ? effect : {},
          unit,
        });
      }
      return;
    }
    if (rule === 'resample' && Array.isArray(leaf.container)) {
      // A tileset mask entry: the whole mask is resampled once it has been walked.
      if (!masks.has(leaf.container)) {
        const keys = keysOf(leaf);
        keys.pop();
        masks.set(leaf.container, {
          keys,
          field: leaf.field,
          path: leaf.path.replace(/\[\d+\]$/, ''),
        });
      }
      return;
    }
    if (rule === 'world-y' && value < 0 && geometry.topPad !== 0) {
      const holder = leaf.container;
      const type = isObject(holder) ? holder['type'] : undefined;
      const spawn = type === 'spawn' || type === 'formation';
      const enemy = isObject(holder) && typeof holder['enemy'] === 'string' ? holder['enemy'] : '';
      const ported = cleanFraction(modules.rescaleNumber(unit, value, geometry));
      note(
        plan.aboveTop,
        leaf,
        unit,
        ported,
        spawn
          ? `spawn above the top edge${enemy === '' ? '' : ` (${enemy})`}: ×k only — it now arrives ${String(geometry.topPad)} px higher than v1's ×k + pad`
          : 'above the top edge: ×k only',
      );
    }
    const exact = rule === 'keep' ? value : modules.rescaleNumber(unit, value, geometry);
    let ported = cleanFraction(exact);
    if (leaf.integer && !Number.isInteger(ported)) {
      ported = Math.round(ported);
      note(plan.rounded, leaf, unit, ported, `${String(exact)} rounded`);
    }
    if (Object.is(ported, value)) return;
    replacements.push({ keys: keysOf(leaf), value: ported });
    changes++;
    // A scalar tile size (`tile-px`) is ×k like a world length; the masks were taken out above.
    if (rule !== 'scale' && rule !== 'resample') {
      let how = String(rule);
      if (rule === 'edge-x' || rule === 'edge-y') {
        const size = rule === 'edge-x' ? geometry.fromWidth : geometry.fromHeight;
        how = `${rule}: snapped to the ${modules.edgeAnchor(value, size)}`;
      } else if (rule === 'world-y') {
        how = value < 0 ? 'world-y: above the top edge, ×k only' : 'world-y: ×k + top pad';
      } else if (rule === 'tile-rows') {
        how = `tile-rows: + ${String(geometry.padRows)} rows`;
      }
      note(plan.moved, leaf, unit, ported, how);
    }
    if (
      (leaf.min !== undefined && ported < leaf.min) ||
      (leaf.max !== undefined && ported > leaf.max)
    ) {
      note(
        plan.outOfBounds,
        leaf,
        unit,
        ported,
        `outside today's bounds ${String(leaf.min ?? '')}..${String(leaf.max ?? '')}`,
      );
    }
  });
  for (const skip of skips) {
    plan.unclassified.push({
      file: file.path,
      path: skip.path,
      field: '',
      unit: undefined,
      from: undefined,
      to: undefined,
      note: `the walk could not enter this value (${skip.reason})`,
    });
  }
  // Tileset masks.
  for (const [mask, where] of masks) {
    const old = /** @type {number[]} */ (mask);
    /** @type {number[]} */
    let next;
    try {
      next = resampleMask(old, geometry.tileSize, geometry.toTileSize);
    } catch (error) {
      plan.errors.push({ file: file.path, message: `${where.path}: ${String(error)}` });
      continue;
    }
    const same = next.length === old.length && next.every((h, x) => h === old[x]);
    const entry = {
      file: file.path,
      path: where.path,
      field: where.field,
      unit: 'tile-px',
      from: old,
      to: next,
      note: 'resampled',
    };
    if (
      lineMaskEnds(old, geometry.tileSize) === null &&
      geometry.tileSize !== geometry.toTileSize
    ) {
      plan.masks.push({ ...entry, note: 'not a straight edge: resampled nearest-neighbour' });
    }
    if (same) continue;
    replacements.push({ keys: where.keys, value: next });
    changes++;
    plan.moved.push({
      ...entry,
      note: `resample: ${String(geometry.tileSize)} → ${String(geometry.toTileSize)} px`,
    });
  }
  // Raster bands: ×k, rounded so that they still add up to the ported bottom − top.
  for (const [list, where] of bands) {
    const old = /** @type {number[]} */ (list);
    const top = portInteger('screen-y', where.effect['top'], geometry, modules);
    const bottom = portInteger('screen-y', where.effect['bottom'], geometry, modules);
    const next = spreadBands(
      old.map((height) => modules.rescaleNumber(where.unit, height, geometry)),
      bottom - top,
    );
    if (next === null) {
      plan.errors.push({
        file: file.path,
        message: `${where.path}: ${String(old.length)} bands cannot fill ${String(bottom - top)} rows`,
      });
      continue;
    }
    if (next.every((height, i) => height === old[i])) continue;
    replacements.push({ keys: where.keys, value: next });
    changes++;
    const exact = old.reduce((sum, height) => sum + height, 0) * geometry.factor;
    plan.rounded.push({
      file: file.path,
      path: where.path,
      field: where.field,
      unit: where.unit,
      from: old,
      to: next,
      note:
        exact === bottom - top
          ? `×k, rounded by largest remainder to add up to bottom − top (${String(bottom - top)})`
          : `top and bottom snap apart: the ${String(exact)} rows ×k are spread over ` +
            `bottom − top (${String(bottom - top)}) by largest remainder — check the art's bands`,
    });
  }
  // Tilemap rows: explicit RLE rows gain copies of their top row.
  if (tilemap !== null && geometry.padRows > 0) {
    const rle = Array.isArray(tilemap['rle']) ? /** @type {string[]} */ (tilemap['rle']) : null;
    const topRow = rle !== null && rle.length > 0 ? rle[0] : null;
    const filled = topRow !== null && rleHasTiles(topRow);
    const segments =
      isObject(tilemap['generator']) && Array.isArray(tilemap['generator']['segments'])
        ? tilemap['generator']['segments']
        : [];
    const ceilings = segments.filter(
      (segment) => isObject(segment) && segment['ceiling'] !== undefined,
    ).length;
    if (rle !== null && topRow !== null) {
      const next = [];
      for (let r = 0; r < geometry.padRows; r++) next.push(topRow);
      replacements.push({ keys: ['tilemap', 'rle'], value: next.concat(rle) });
      changes++;
    }
    plan.tilemaps.push({
      file: file.path,
      path: 'tilemap',
      field: 'tilemap',
      unit: 'tile-rows',
      from: tilemap['rowsTall'],
      to: Number(tilemap['rowsTall']) + geometry.padRows,
      note:
        `${String(geometry.padRows)} rows at the top` +
        (rle === null
          ? ''
          : topRow === null || !filled
            ? ', copies of an empty top RLE row'
            : `, copies of the top RLE row "${topRow.length > 40 ? topRow.slice(0, 40) + '…' : topRow}" (it has tiles)`) +
        (ceilings > 0 ? `; ${String(ceilings)} heightfield ceiling(s) move down by the pad` : ''),
    });
  }
  // Tilemaps the view would see past: the camera's lowest y plus the playfield's height.
  if (tilemap !== null && data['kind'] === 'stage') {
    const camera = Array.isArray(data['camera']) ? data['camera'] : [];
    let lowest = 0;
    for (const key of camera) {
      if (isObject(key) && typeof key['yTo'] === 'number') {
        const unit = /** @type {import('@shmup/core').NumberUnit} */ ('screen-y');
        lowest = Math.max(lowest, modules.rescaleNumber(unit, key['yTo'], geometry));
      }
    }
    const height = (Number(tilemap['rowsTall']) + geometry.padRows) * geometry.toTileSize;
    if (lowest + geometry.toHeight > height) {
      plan.views.push({
        file: file.path,
        path: 'tilemap.rowsTall',
        field: 'tilemap.rowsTall',
        unit: 'tile-rows',
        from: tilemap['rowsTall'],
        to: Number(tilemap['rowsTall']) + geometry.padRows,
        note:
          `the camera's lowest yTo (${String(lowest)}) + the playfield (${String(geometry.toHeight)}) ` +
          `sees past the map's bottom (${String(height)} px): the snapped yTo (owner decision ` +
          'O2) and the padded rows disagree — fix the pan or the rows by hand (an owner question)',
      });
    }
  }
  if (replacements.length > 0) {
    plan.changes += changes;
    plan.changed.push({
      path: file.path,
      text: replaceJsonValues(file.text, replacements),
      changes,
    });
  }
}

/**
 * Ports an integer field's value the way the walk does (×k by its rule, then rounded).
 *
 * @param {import('@shmup/core').NumberUnit} unit - Its unit.
 * @param {unknown} value - The value as written (a number).
 * @param {RescaleGeometry} geometry - The port's geometry.
 * @param {RescaleModules} modules - The packages.
 * @returns {number} The ported whole number.
 */
function portInteger(unit, value, geometry, modules) {
  return Math.round(cleanFraction(modules.rescaleNumber(unit, Number(value), geometry)));
}

/**
 * Rounds band heights to whole rows that add up to a total (largest remainder): the heights are
 * first scaled to the total when they do not already add up to it.
 *
 * @param {readonly number[]} exact - The ported (unrounded) heights.
 * @param {number} total - The rows they must fill.
 * @returns {number[] | null} Whole heights ≥ 1 adding up to `total`, or `null` when `total` is
 *   smaller than the number of bands.
 * @example
 * ```js
 * spreadBands([3, 3, 4.5, 4.5, 6, 7.5, 9, 10.5, 12, 12], 72); // [3, 3, 5, 5, 6, 7, 9, 10, 12, 12]
 * ```
 */
export function spreadBands(exact, total) {
  if (total < exact.length) return null;
  const sum = exact.reduce((a, b) => a + b, 0);
  const wanted = sum === total || sum <= 0 ? exact.slice() : exact.map((h) => (h * total) / sum);
  const out = wanted.map((h) => Math.max(1, Math.floor(cleanFraction(h))));
  let missing = total - out.reduce((a, b) => a + b, 0);
  // Largest remainders first; ties go to the earlier band.
  const order = wanted
    .map((h, i) => ({ i, rest: cleanFraction(h) - Math.floor(cleanFraction(h)) }))
    .sort((a, b) => b.rest - a.rest || a.i - b.i);
  for (let k = 0; missing > 0; k = (k + 1) % order.length, missing--) out[order[k].i]++;
  // Only the ≥ 1 floor can overshoot: take it back from the tallest bands.
  while (missing < 0) {
    let tallest = 0;
    for (let i = 1; i < out.length; i++) if (out[i] > out[tallest]) tallest = i;
    out[tallest]--;
    missing++;
  }
  return out;
}

/**
 * Whether an RLE row holds any tile (`core/data/tilemap` row syntax: `<id>` / `<count>*<id>`).
 *
 * @param {string} row - The row.
 * @returns {boolean} `true` when some token's id is not 0.
 */
function rleHasTiles(row) {
  const compact = row.replace(/\s+/g, '');
  if (compact === '') return false;
  return compact.split(',').some((token) => {
    const match = /^(?:[0-9]+\*)?([0-9]+)$/.exec(token);
    return match !== null && Number(match[1]) !== 0;
  });
}

/**
 * Lists the `example.*.json` samples below a root.
 *
 * @param {string} root - The content root.
 * @param {string} [prefix] - Path below the root (recursion).
 * @returns {string[]} Root-relative POSIX paths, sorted.
 */
function listExamples(root, prefix = '') {
  /** @type {string[]} */
  const out = [];
  const dir = prefix === '' ? root : join(root, prefix);
  for (const entry of readdirSync(dir).sort()) {
    const relative = prefix === '' ? entry : `${prefix}/${entry}`;
    if (statSync(join(dir, entry)).isDirectory()) out.push(...listExamples(root, relative));
    else if (entry.startsWith('example.') && entry.endsWith('.json')) out.push(relative);
  }
  return out;
}

/**
 * What {@link rescaleContent} did.
 *
 * @typedef {RescalePlan & { written: string[], refused: boolean, dryRun: boolean }} RescaleResult
 */

/**
 * Runs a port over a content root: plans it, formats every changed file through Prettier and —
 * unless it is a dry run or the plan has unclassified values or errors — writes them.
 *
 * @param {RescaleOptions} options - The options.
 * @param {RescaleModules} modules - The packages.
 * @returns {Promise<RescaleResult>} The plan, with the files written (none on a dry run or a
 *   refusal) — resolves once every file is formatted and written.
 * @throws {RescaleError} When the geometry is impossible.
 */
export async function rescaleContent(options, modules) {
  const geometry = rescaleGeometry(options, modules.frame);
  const paths = modules.readContentFiles(options.root).map((file) => file.path);
  if (options.examples) paths.push(...listExamples(options.root));
  const files = paths.map((path) => ({
    path,
    text: readFileSync(join(options.root, path), 'utf8'),
  }));
  const plan = planRescale(files, geometry, modules);
  const prettier = await import('prettier');
  const config = (await prettier.resolveConfig(join(REPO_ROOT, 'package.json'))) ?? {};
  for (const file of plan.changed) {
    file.text = await prettier.format(file.text, { ...config, filepath: file.path });
  }
  const refused = plan.unclassified.length > 0 || plan.errors.length > 0;
  /** @type {string[]} */
  const written = [];
  if (!options.dryRun && !refused) {
    for (const file of plan.changed) {
      writeFileSync(join(options.root, file.path), file.text);
      written.push(file.path);
    }
  }
  return { ...plan, written, refused, dryRun: options.dryRun };
}

/**
 * Writes a report list.
 *
 * @param {string[]} lines - Output.
 * @param {string} title - Section title.
 * @param {readonly RescaleEntry[]} entries - The entries.
 */
function section(lines, title, entries) {
  if (entries.length === 0) return;
  lines.push('', `${title} (${String(entries.length)}):`);
  for (const entry of entries) {
    const unit = entry.unit === undefined ? '' : ` [${entry.unit}]`;
    const values =
      entry.from === undefined && entry.to === undefined
        ? ''
        : ` ${JSON.stringify(entry.from)} → ${JSON.stringify(entry.to)}`;
    lines.push(`  ${entry.file}:${entry.path}${unit}${values} — ${entry.note}`);
  }
}

/**
 * Formats a result for the terminal.
 *
 * @param {RescaleResult} result - What {@link rescaleContent} returned.
 * @param {boolean} [quiet] - The summary only.
 * @returns {string} The report.
 */
export function formatRescaleReport(result, quiet = false) {
  const g = result.geometry;
  const lines = [
    `rescale ×${String(g.factor)}, top pad ${String(g.topPad)} px: playfield ` +
      `${String(g.fromWidth)}×${String(g.fromHeight)} → ${String(g.toWidth)}×${String(g.toHeight)}, ` +
      `tiles ${String(g.tileSize)} → ${String(g.toTileSize)} px, +${String(g.padRows)} tilemap rows`,
    `${String(result.files)} files (${String(result.skipped.length)} skipped), ` +
      `${String(result.values)} values, ${String(result.changes)} changes in ` +
      `${String(result.changed.length)} files; ${String(result.unclassified.length)} unclassified, ` +
      `${String(result.errors.length)} errors`,
  ];
  if (result.refused) lines.push('REFUSED: nothing written (unclassified values or errors).');
  else if (result.dryRun) lines.push('dry run: nothing written.');
  else lines.push(`${String(result.written.length)} files written.`);
  if (quiet) return lines.join('\n');
  if (result.errors.length > 0) {
    lines.push('', `errors (${String(result.errors.length)}):`);
    for (const error of result.errors) lines.push(`  ${error.file}: ${error.message}`);
  }
  section(lines, 'unclassified', result.unclassified);
  section(lines, 'above the top edge', result.aboveTop);
  section(lines, 'moved by a rule other than ×k', result.moved);
  section(lines, 'rounded integers', result.rounded);
  section(lines, "outside today's schema bounds", result.outOfBounds);
  section(lines, 'masks only approximated', result.masks);
  section(lines, 'tilemaps padded', result.tilemaps);
  section(lines, 'views past the map', result.views);
  section(lines, 'expressions rewritten', result.expressions);
  if (result.changed.length > 0) {
    lines.push('', `files changed (${String(result.changed.length)}):`);
    for (const file of result.changed) lines.push(`  ${file.path}: ${String(file.changes)}`);
  }
  return lines.join('\n');
}

/**
 * The command line.
 *
 * @returns {Promise<number>} The exit code.
 */
async function main() {
  /** @type {RescaleOptions} */
  let options;
  try {
    options = parseRescaleArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`rescale: ${error instanceof Error ? error.message : String(error)}\n`);
    return error instanceof RescaleError ? error.exitCode : 2;
  }
  const { modules, close } = await loadRescaleModules();
  try {
    const result = await rescaleContent(options, modules);
    if (options.json) {
      const { changed, ...rest } = result;
      const files = changed.map((file) => ({ path: file.path, changes: file.changes }));
      process.stdout.write(`${JSON.stringify({ ...rest, changed: files }, null, 2)}\n`);
    } else {
      process.stdout.write(`${formatRescaleReport(result, options.quiet)}\n`);
    }
    return result.refused ? 1 : 0;
  } catch (error) {
    process.stderr.write(`rescale: ${error instanceof Error ? error.message : String(error)}\n`);
    return error instanceof RescaleError ? error.exitCode : 1;
  } finally {
    await close();
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
