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
 *   higher — R2-02 fixes each one by hand), and every value exactly on the top edge (y = 0 moves
 *   `topPad` px down; something hanging from the top edge may need to grow by the pad instead);
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
 * **Values that port together** (the R1-03 review; core `FieldPair`, `rescaleBackdrop`):
 *
 * - a **world sum** — a block's `x` + `screenX`, and a ground enemy's spawn (its enemy has a
 *   `ground` anchor — collected from the content set's enemy files): the sum is a world x (×k),
 *   only the column snaps, `x` takes the difference (`rescaleWorldSum`); the event so fires earlier
 *   than ×k, and each stage's `events` / `remix` are re-sorted by the ported x (the separators stay,
 *   each entry keeps its text; the report gives each moved item's old → new index, and names every
 *   other item by its index as written) — the report lists an event now on the other side of a
 *   checkpoint, a camera stop, a `flag` event or a region trigger's armed window (a branch-gated
 *   event that now fires while its flag's trigger can still fire is spelled out: both branches can
 *   play), a ground enemy leaving or joining a `ground` bonus window, a moving block whose drift
 *   runs ahead;
 * - a **box** — `y` + `h` of a block or a region: by its edges (`rescaleBoxY`), so a box hanging
 *   from the top edge grows by the pad instead of moving down;
 * - the **backdrop** — a stage's parallax bands (`band-y`), raster and Mode-7 rows, placed as one
 *   layout from the bands' art heights (`rescaleBackdrop`; heights from the atlas — built in memory
 *   from `assets/source/`, or `--atlas`), the raster bands then spread over the placed rows by
 *   their rounded boundaries; the report lists free placements, seams and a band that touched two
 *   anchors (the top edge, the bottom edge, a Mode-7 row) and keeps one;
 * - the **map's right end** — `length` plus one playfield, where the view ends at the last camera
 *   position — is frame-anchored: it ports to `length′ + toWidth`, and an x at or past it keeps its
 *   distance past it ×k (`portMapEnd`): a heightfield segment that reaches the map's last column
 *   ends at the new map's end, one that starts at or past the end (the map never shows it) starts
 *   as far past the new one, a region reaching the end still reaches it, and an RLE row tiled in
 *   the last column repeats its last cell to the new map's width (`extendRleRow`); each is listed
 *   as moved. A segment that would no longer start before it ends, and an RLE row core's syntax
 *   refuses, are errors.
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
 * than ×k, every value on or above the top edge, every rounded integer, every value outside
 * today's schema bounds (frame-derived bounds widen at R2-01), every approximated mask, the
 * timeline and backdrop items above, the padded tilemaps and every tilemap the view would see past.
 *
 * **Geometry.** The content was written for a playfield of `--from-width` × `--from-height` with
 * `--tile-size` tiles (defaults: core's `PLAYFIELD_W`, `PLAYFIELD_H`, `TILE_SIZE` — today's frame;
 * after R2-01 flips core, pass the v1 numbers). The new playfield is `fromHeight × k + topPad`
 * tall and `--to-width` wide (default: the frame keeps today's aspect ratio and its HUD bars scale
 * ×k — 640 for v2's 1.5 / 36). Every tileset and tilemap must be at `--tile-size`.
 *
 * Options: `--factor K` (required), `--top-pad P` (default 0), `--dry-run`, `--root DIR` (default
 * `content/`), `--no-examples`, `--from-width W`, `--from-height H`, `--tile-size T`,
 * `--to-width W`, `--atlas FILE` (an atlas manifest for the bands' art heights), `--art-scale S`
 * (the atlas art's scale against the content's pixels: 1.5 once R2-01's interim upscale is in the
 * pipeline), `--force-art-scale` (use `--art-scale` although the atlas contradicts it), `--json`
 * (the result as JSON), `--quiet` (the summary only). The tool measures the art scale from the
 * atlas' terrain tiles against the content's tilesets and never guesses ({@link resolveArtScale}):
 * without `--art-scale` it runs only while they measure ×1, and a given `--art-scale` must be what
 * they measure unless `--force-art-scale` says the bands are drawn at another scale than the tiles.
 * Exit code 0 = done (or nothing to do), 1 = refused (unclassified values or errors), 2 = bad
 * arguments (an art scale the atlas contradicts included).
 *
 * **Public API.** {@link parseRescaleArgs}, {@link loadRescaleModules}, {@link rescaleGeometry},
 * {@link planRescale}, {@link rescaleContent}, {@link formatRescaleReport}, {@link jsonSpans},
 * {@link replaceJsonValues}, {@link permuteJsonArrays}, {@link scaleExpression},
 * {@link spreadBands}, {@link extendRleRow}, {@link modulesFrom}, {@link loadArt},
 * {@link measureArtScale}, {@link resolveArtScale}, {@link RescaleError}, {@link SKIPPED_DIRS}.
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
 * @property {string | null} atlas - An atlas manifest (`main.json`) to read the parallax bands'
 *   art heights from (`null` = build the atlas from `assets/source/` in memory).
 * @property {number | null} artScale - The atlas art's scale against the content's pixels
 *   (`null` = not given: 1, and the tool refuses when the atlas' terrain tiles say otherwise —
 *   {@link resolveArtScale}; 1.5 once R2-01's interim upscale is in the pipeline).
 * @property {boolean} [forceArtScale] - Use `artScale` even when the atlas' terrain tiles measure
 *   another scale (the parallax bands drawn at another scale than the tiles); `false` when absent.
 * @property {boolean} json - Print the result as JSON.
 * @property {boolean} quiet - Print the summary only.
 */

/**
 * Parses the command line.
 *
 * @param {readonly string[]} argv - Arguments after the script name.
 * @returns {RescaleOptions} The options.
 * @throws {RescaleError} On an unknown option, a missing or bad value, no `--factor`, or
 *   `--force-art-scale` without `--art-scale`.
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
    atlas: null,
    artScale: null,
    forceArtScale: false,
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
      case '--atlas': {
        const path = argv[++i];
        if (path === undefined) throw new RescaleError('--atlas needs a file');
        options.atlas = resolve(path);
        break;
      }
      case '--art-scale':
        options.artScale = numberAt(i++, true);
        break;
      case '--force-art-scale':
        options.forceArtScale = true;
        break;
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
  if (options.forceArtScale === true && options.artScale === null) {
    throw new RescaleError('--force-art-scale needs --art-scale S');
  }
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
 * @property {typeof import('@shmup/core').rescaleWorldSum | null} rescaleWorldSum - The world-sum
 *   pair's port (`null` while core has none: each field then ports alone).
 * @property {typeof import('@shmup/core').rescaleBoxY | null} rescaleBoxY - The box-y pair's port.
 * @property {typeof import('@shmup/core').rescaleBackdrop | null} rescaleBackdrop - The backdrop's
 *   port.
 * @property {typeof import('@shmup/core').topEdgeSide | null} topEdgeSide - The top-edge test.
 * @property {number} defaultBonusWindow - core's `DEFAULT_BONUS_WINDOW` (a `ground` entrance's
 *   window when it names no `until`).
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
  const loose = /** @type {Record<string, unknown>} */ (core);
  const table = loose['BEHAVIOR_PARAM_UNITS'];
  /**
   * A core function the tool can do without, or `null` when core has none.
   *
   * @template T
   * @param {string} name - Its export name.
   * @returns {T | null} It.
   */
  const optional = (name) =>
    /** @type {any} */ (typeof loose[name] === 'function' ? loose[name] : null);
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
    rescaleWorldSum: optional('rescaleWorldSum'),
    rescaleBoxY: optional('rescaleBoxY'),
    rescaleBackdrop: optional('rescaleBackdrop'),
    topEdgeSide: optional('topEdgeSide'),
    defaultBonusWindow: core.DEFAULT_BONUS_WINDOW,
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
 * @property {RescaleEntry[]} aboveTop - Values on or above the top edge (`world-y` ≤ 0), spawns
 *   first.
 * @property {RescaleEntry[]} rounded - Integer fields rounded (owner decision O4).
 * @property {RescaleEntry[]} outOfBounds - Ported values outside today's schema bounds.
 * @property {RescaleEntry[]} masks - Tileset masks resampled only approximately.
 * @property {RescaleEntry[]} tilemaps - Tilemaps given rows at the top.
 * @property {RescaleEntry[]} views - Tilemaps the view would see past after the port.
 * @property {RescaleEntry[]} expressions - Expression strings rewritten.
 * @property {RescaleEntry[]} timeline - Events the field pairs moved across a checkpoint, a camera
 *   stop, a `flag` event, a region trigger's armed window or a `ground` bonus window, moving blocks
 *   whose drift runs ahead, and the stage timelines re-sorted — such an entry's `from` / `to` are
 *   the old and new indices of the items that change places (every other index stays; every other
 *   entry names the indices as written).
 * @property {RescaleEntry[]} backdrop - Parallax bands and raster rows placed by a fallback, seams
 *   the pad opens between bands, and anchors a band touched but cannot keep.
 */

/**
 * The art heights the backdrop needs ({@link loadArt}).
 *
 * @typedef {object} RescaleArt
 * @property {(sprite: string) => number | undefined} height - Height of frame 0 of a sprite, in
 *   the content's pixels (`undefined` = no such sprite).
 * @property {(sprite: string) => { w: number, h: number } | undefined} [frame] - Size of frame 0
 *   of a sprite in the atlas' own pixels (`undefined` = no such sprite), for
 *   {@link measureArtScale}.
 */

/** No art at all (a plan without parallax bands needs none). */
const NO_ART = Object.freeze({ height: () => undefined, frame: () => undefined });

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
 * Whether a content path is a format sample (`example.*.json`, loaded as its own content set).
 *
 * @param {string} path - Path below the content root.
 * @returns {boolean} `true` for a sample.
 */
const isExample = (path) => (path.split('/').pop() ?? '').startsWith('example.');

/**
 * What the shipped set and the samples (two independent content sets, as `pnpm content:check`
 * loads them) tell the port: their ground enemies.
 *
 * @param {readonly RescaleInputFile[]} files - Every file.
 * @returns {{ shipped: RescaleContext, examples: RescaleContext }} One context per set.
 */
function rescaleContexts(files) {
  const shipped = { groundEnemies: new Set() };
  const examples = { groundEnemies: new Set() };
  for (const file of files) {
    /** @type {unknown} */
    let data;
    try {
      data = JSON.parse(file.text);
    } catch {
      continue;
    }
    if (!isObject(data) || data['kind'] !== 'enemies' || !Array.isArray(data['enemies'])) continue;
    const context = isExample(file.path) ? examples : shipped;
    for (const enemy of data['enemies']) {
      if (isObject(enemy) && typeof enemy['id'] === 'string' && enemy['ground'] !== undefined) {
        if (enemy['ground'] !== null) context.groundEnemies.add(enemy['id']);
      }
    }
  }
  return { shipped, examples };
}

/**
 * Plans a port: walks every file with its schema and works out every new value, without reading
 * or writing anything on disk.
 *
 * @param {readonly RescaleInputFile[]} files - The content files (any order; reported in path
 *   order).
 * @param {RescaleGeometry} geometry - The port's geometry ({@link rescaleGeometry}).
 * @param {RescaleModules} modules - The packages.
 * @param {RescaleArt} [art] - The parallax bands' art heights (a stage with bands needs them).
 * @returns {RescalePlan} What the port does.
 */
export function planRescale(files, geometry, modules, art = NO_ART) {
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
    timeline: [],
    backdrop: [],
  };
  const contexts = rescaleContexts(files);
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
    const context = isExample(file.path) ? contexts.examples : contexts.shipped;
    const json = /** @type {Record<string, unknown>} */ (data);
    portFile(file, json, schema, geometry, modules, art, context, plan);
  }
  // Spawns first, then the rest, each in path order (a stable sort).
  plan.aboveTop.sort(
    (a, b) => Number(b.note.startsWith('spawn')) - Number(a.note.startsWith('spawn')),
  );
  return plan;
}

/**
 * One numeric leaf the walk classified, waiting to be ported ({@link portFile}).
 *
 * @typedef {object} PendingLeaf
 * @property {import('@shmup/core').NumberLeaf} leaf - The leaf (its value is a number).
 * @property {import('@shmup/core').NumberUnit} unit - Its unit (a tunable's resolved one).
 * @property {import('@shmup/core').UnitRule} rule - Its unit's rule (`keep` for `inherit`).
 */

/**
 * A ported value that a group of fields worked out together ({@link portFile}): a field pair or
 * the stage's backdrop.
 *
 * @typedef {object} Override
 * @property {number} exact - The ported value (unrounded).
 * @property {string | undefined} how - Why it moved, for the "moved by a rule other than ×k"
 *   list (`undefined` = as its rule alone would have it — not listed for that).
 * @property {string | undefined} [topNote] - The note of its "on or above the top edge" entry,
 *   when the group knows better than the lone rule.
 */

/**
 * What a whole content set tells the port of one file ({@link planRescale}).
 *
 * @typedef {object} RescaleContext
 * @property {Set<string>} groundEnemies - Ids of the enemies with a `ground` anchor (a ground
 *   enemy's spawn ports as a world x — `WorldSumPair.when`).
 */

/**
 * Ports one validated file into the plan.
 *
 * @param {RescaleInputFile} file - The file.
 * @param {Record<string, unknown>} data - Its parsed JSON.
 * @param {import('@shmup/core').Schema<unknown>} schema - Its file schema.
 * @param {RescaleGeometry} geometry - The port's geometry.
 * @param {RescaleModules} modules - The packages.
 * @param {RescaleArt} art - The art heights of the parallax bands.
 * @param {RescaleContext} context - What the file's content set tells it.
 * @param {RescalePlan} plan - Collector.
 *
 * @remarks
 * Four phases: the walk classifies every number (expression strings, tileset masks and raster
 * bands are handled on their own); the groups — field pairs, the stage's backdrop and its map end
 * — work out the values of fields that port together; every number is then finished the same way
 * (rounded, listed, written back), the RLE rows with the tilemap; and a stage's timeline is
 * checked and re-sorted.
 */
function portFile(file, data, schema, geometry, modules, art, context, plan) {
  const { factor } = geometry;
  /** @type {JsonReplacement[]} */
  const replacements = [];
  /** @type {{ keys: (string | number)[], order: number[] }[]} */
  const permutations = [];
  let changes = 0;
  /** @type {Map<unknown[], { keys: (string | number)[], field: string, path: string }>} */
  const masks = new Map();
  /**
   * @type {Map<unknown[], { keys: (string | number)[], field: string, path: string,
   *   effect: Record<string, unknown>, unit: import('@shmup/core').NumberUnit }>}
   */
  const rasterBands = new Map();
  /** @type {PendingLeaf[]} */
  const pending = [];
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
  const stage = data['kind'] === 'stage';
  const tilemap = stage && isObject(data['tilemap']) ? data['tilemap'] : null;
  if (tilemap !== null && tilemap['tileSize'] !== geometry.tileSize) {
    geometryError(
      `tilemap.tileSize ${String(tilemap['tileSize'])} is not --tile-size ` +
        String(geometry.tileSize),
    );
    return;
  }

  // 1. The walk: classify every number.
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
    if (leaf.integer && Array.isArray(leaf.container) && leaf.field.endsWith('raster[].bands[]')) {
      // Raster band heights must add up to the effect's rows: spread together at the end.
      if (!rasterBands.has(leaf.container)) {
        const keys = keysOf(leaf);
        keys.pop();
        const effect = leaf.parents[leaf.parents.length - 2];
        rasterBands.set(leaf.container, {
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
    pending.push({ leaf, unit, rule });
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

  // 2. The groups: values of fields that port together.
  /** @type {Map<import('@shmup/core').NumberLeaf, Override>} */
  const overrides = new Map();
  const events = portPairs(pending, geometry, modules, context, overrides);
  const unplaced = stage
    ? portBackdrop(file, pending, geometry, modules, art, overrides, plan)
    : new Set();
  const mapEnd = stage ? portMapEnd(data, pending, geometry, modules, overrides) : null;

  // 3. Every number: rounded, listed, written back.
  /** @type {Map<unknown, Map<string | number, number>>} */
  const finals = new Map();
  /**
   * The ported value of a field of an object (as finished), or `undefined`.
   *
   * @param {unknown} holder - The object.
   * @param {string} key - The field.
   * @returns {number | undefined} Its ported value.
   */
  const final = (holder, key) => finals.get(holder)?.get(key);
  /** @type {number[]} */
  const cameraYs = [];
  for (const item of pending) {
    if (unplaced.has(item.leaf)) continue; // A band without art: unclassified.
    const { leaf, unit, rule } = item;
    const value = /** @type {number} */ (leaf.value);
    const override = overrides.get(leaf);
    if (rule === 'world-y' && geometry.topPad !== 0) {
      const side = topEdgeSideOf(modules, value);
      if (side !== 'below') {
        const holder = leaf.container;
        const type = isObject(holder) ? holder['type'] : undefined;
        const spawn = type === 'spawn' || type === 'formation';
        const enemy =
          isObject(holder) && typeof holder['enemy'] === 'string' ? holder['enemy'] : '';
        const exact = override?.exact ?? modules.rescaleNumber(unit, value, geometry);
        note(
          plan.aboveTop,
          leaf,
          unit,
          cleanFraction(exact),
          override?.topNote ??
            (side === 'on'
              ? `on the top edge: ×k + pad moves it ${String(geometry.topPad)} px down — what ` +
                'hangs from the top edge may need to grow by the pad instead'
              : spawn
                ? `spawn above the top edge${enemy === '' ? '' : ` (${enemy})`}: ×k only — it ` +
                  `now arrives ${String(geometry.topPad)} px higher than v1's ×k + pad`
                : 'above the top edge: ×k only'),
        );
      }
    }
    const exact =
      override !== undefined
        ? override.exact
        : rule === 'keep'
          ? value
          : modules.rescaleNumber(unit, value, geometry);
    let ported = cleanFraction(exact);
    if (leaf.integer && !Number.isInteger(ported)) {
      ported = Math.round(ported);
      note(plan.rounded, leaf, unit, ported, `${String(exact)} rounded`);
    }
    if (leaf.container !== null) {
      let fields = finals.get(leaf.container);
      if (fields === undefined) {
        fields = new Map();
        finals.set(leaf.container, fields);
      }
      fields.set(leaf.key, ported);
    }
    // The camera's y keys, ported by whatever their unit is, for the view check below.
    if (leaf.field === 'camera[].yTo') cameraYs.push(ported);
    if (Object.is(ported, value)) continue;
    replacements.push({ keys: keysOf(leaf), value: ported });
    changes++;
    if (override !== undefined) {
      if (override.how !== undefined) note(plan.moved, leaf, unit, ported, override.how);
    } else if (rule !== 'scale' && rule !== 'resample') {
      // A scalar tile size (`tile-px`) is ×k like a world length; the masks are apart.
      let how = String(rule);
      if (rule === 'edge-x' || rule === 'edge-y' || rule === 'band') {
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
  }

  // A heightfield segment must still start before it ends (the loader refuses `to ≤ from`). The
  // map-end rule keeps `to′ − from′ = k · (to − from)` past the end; a short segment rounded at a
  // factor below 1, or an end that a narrower `--to-width` pulls in under a segment ×k, may not.
  const generator =
    tilemap !== null && isObject(tilemap['generator']) ? tilemap['generator'] : null;
  const segments =
    generator !== null && Array.isArray(generator['segments']) ? generator['segments'] : [];
  segments.forEach((segment, i) => {
    const from = final(segment, 'from');
    const to = final(segment, 'to');
    if (from === undefined || to === undefined || from < to || !isObject(segment)) return;
    plan.errors.push({
      file: file.path,
      message:
        `tilemap.generator.segments[${String(i)}]: from ${String(segment['from'])} → ` +
        `${String(from)} and to ${String(segment['to'])} → ${String(to)} no longer start before ` +
        'they end (the loader refuses to ≤ from) — fix the segment by hand',
    });
  });

  // 4. Tileset masks.
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
  // Raster bands: ×k, rounded at their boundaries so that they still add up to the ported
  // bottom − top and keep to the art's edges.
  for (const [list, where] of rasterBands) {
    const old = /** @type {number[]} */ (list);
    const top =
      final(where.effect, 'top') ?? portInteger('screen-y', where.effect['top'], geometry, modules);
    const bottom =
      final(where.effect, 'bottom') ??
      portInteger('screen-y', where.effect['bottom'], geometry, modules);
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
          ? `×k, rounded at the band boundaries (where a ×k upscale of the art puts them) to add ` +
            `up to bottom − top (${String(bottom - top)})`
          : `top and bottom do not scale ×k together: the ${String(exact)} rows ×k are spread ` +
            `over bottom − top (${String(bottom - top)}), rounded at the band boundaries — check ` +
            "the art's bands",
    });
  }

  // 5. Tilemap rows: an explicit RLE row tiled in the map's last column reaches the new map's
  // right end, and with a top pad the rows gain copies of their (so extended) top row.
  const rawRle = tilemap !== null && Array.isArray(tilemap['rle']) ? tilemap['rle'] : null;
  const rle = rawRle === null ? null : /** @type {string[]} */ (rawRle);
  let rows = rle;
  let extendedRows = 0;
  if (rle !== null && mapEnd !== null) {
    rows = rle.map((row, r) => {
      const path = `tilemap.rle[${String(r)}]`;
      const { width, error } = rleCells(row);
      if (error !== null) {
        // Core's decoder refuses it: the tool cannot tell whether it reaches the map's end.
        plan.errors.push({
          file: file.path,
          message: `${path}: ${error} — the loader refuses the row, so it cannot be ported`,
        });
        return row;
      }
      if (width > mapEnd.cols || width > mapEnd.newCols) {
        // Longer than the old map (the loader refuses it: not the geometry the content was
        // written for), or than the new one (a narrower port).
        plan.errors.push({
          file: file.path,
          message:
            `${path}: ${String(width)} tiles, longer than the ` +
            (width > mapEnd.cols
              ? `map (${String(mapEnd.cols)} columns at --from-width ` +
                `${String(geometry.fromWidth)})`
              : `new map (${String(mapEnd.newCols)} columns)`),
        });
        return row;
      }
      const extended = extendRleRow(row, mapEnd.cols, mapEnd.newCols);
      if (extended === row) return row;
      changes++;
      extendedRows++;
      plan.moved.push({
        file: file.path,
        path,
        field: 'tilemap.rle[]',
        unit: 'world-x',
        from: row,
        to: extended,
        note:
          "map end: tiled in the map's last column, so it reaches the map's right end — its last " +
          `cell repeats from the map's ${String(mapEnd.cols)} columns to the new map's ` +
          String(mapEnd.newCols),
      });
      return extended;
    });
  }
  if (rows !== null && extendedRows > 0 && geometry.padRows === 0) {
    replacements.push({ keys: ['tilemap', 'rle'], value: rows });
  }
  if (tilemap !== null && geometry.padRows > 0) {
    const topRow = rows !== null && rows.length > 0 ? rows[0] : null;
    const filled = topRow !== null && rleHasTiles(topRow);
    const ceilings = segments.filter(
      (segment) => isObject(segment) && segment['ceiling'] !== undefined,
    ).length;
    if (rows !== null && topRow !== null) {
      const next = [];
      for (let r = 0; r < geometry.padRows; r++) next.push(topRow);
      replacements.push({ keys: ['tilemap', 'rle'], value: next.concat(rows) });
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
  if (tilemap !== null) {
    let lowest = 0;
    for (const y of cameraYs) lowest = Math.max(lowest, y);
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
          `sees past the map's bottom (${String(height)} px): the ported pan and the padded rows ` +
          'disagree — fix one of them by hand',
      });
    }
  }

  // 6. A stage's timeline: what moved against the camera, and the order the loader wants.
  if (stage) {
    checkTimeline(file, data, events, final, geometry, modules, context, plan);
    for (const name of ['events', 'remix']) {
      const list = data[name];
      if (!Array.isArray(list)) continue;
      /** @type {number[]} */
      const xs = list.map((event) =>
        isObject(event) ? (final(event, 'x') ?? Number(event['x'])) : Number.NaN,
      );
      const order = xs.map((_x, i) => i).sort((a, b) => xs[a] - xs[b] || a - b);
      // The entries that change places: old index → new index, in the old order.
      /** @type {number[]} */
      const where = [];
      for (let i = 0; i < order.length; i++) where[order[i]] = i;
      /** @type {number[]} */
      const from = [];
      /** @type {number[]} */
      const to = [];
      where.forEach((next, old) => {
        if (next === old) return;
        from.push(old);
        to.push(next);
      });
      if (from.length === 0) continue;
      permutations.push({ keys: [name], order });
      changes++;
      plan.timeline.push({
        file: file.path,
        path: name,
        field: name,
        unit: 'world-x',
        from,
        to,
        note:
          `re-sorted by the ported x (${String(from.length)} entries change places; ties keep ` +
          `their order): ${from.map((old, i) => `${String(old)} → ${String(to[i])}`).join(', ')} — ` +
          'every other listing names the indices as written',
      });
    }
  }
  if (replacements.length > 0 || permutations.length > 0) {
    plan.changes += changes;
    const text = permuteJsonArrays(replaceJsonValues(file.text, replacements), permutations);
    plan.changed.push({ path: file.path, text, changes });
  }
}

/**
 * Where an absolute y lies against the top edge: core's `topEdgeSide`, or the same test while
 * core has none.
 *
 * @param {RescaleModules} modules - The packages.
 * @param {number} y - The value as written.
 * @returns {'above' | 'on' | 'below'} Its side.
 */
function topEdgeSideOf(modules, y) {
  if (modules.topEdgeSide !== null) return modules.topEdgeSide(y);
  if (y < 0) return 'above';
  return y === 0 ? 'on' : 'below';
}

/**
 * An event a world-sum pair moved against the camera (its x is no longer ×k): checked against
 * the checkpoints and the `ground` bonus windows.
 *
 * @typedef {object} MovedEvent
 * @property {Record<string, unknown>} event - The event object.
 * @property {string} path - The JSON path of its `x`.
 * @property {number} lead - How much earlier than ×k it fires (camera pixels).
 * @property {boolean} block - Whether it is a moving block (`when: 'always'`).
 */

/**
 * Works out the field pairs of a file (core `FieldPair`): a block's — and
 * a ground enemy's — `x` + `screenX` through `rescaleWorldSum`, a box's `y` + `h` through
 * `rescaleBoxY`. Both fields are read as written.
 *
 * @param {readonly PendingLeaf[]} pending - The file's numbers.
 * @param {RescaleGeometry} geometry - The port's geometry.
 * @param {RescaleModules} modules - The packages.
 * @param {RescaleContext} context - The ground enemies.
 * @param {Map<import('@shmup/core').NumberLeaf, Override>} overrides - Receives the values.
 * @returns {MovedEvent[]} The events a world-sum pair moved.
 */
function portPairs(pending, geometry, modules, context, overrides) {
  /** @type {Map<unknown, Map<string, PendingLeaf>>} */
  const groups = new Map();
  /** @type {Map<unknown, import('@shmup/core').FieldPair[]>} */
  const pairsOf = new Map();
  for (const item of pending) {
    const pair = item.leaf.pair;
    if (pair === undefined || item.leaf.container === null) continue;
    let roles = groups.get(item.leaf.container);
    if (roles === undefined) {
      roles = new Map();
      groups.set(item.leaf.container, roles);
      pairsOf.set(item.leaf.container, []);
    }
    roles.set(pair.role, item);
    const list = pairsOf.get(item.leaf.container) ?? [];
    if (list.indexOf(pair.pair) < 0) list.push(pair.pair);
  }
  /** @type {MovedEvent[]} */
  const moved = [];
  for (const [holder, roles] of groups) {
    for (const pair of pairsOf.get(holder) ?? []) {
      if (pair.rule === 'world-sum') {
        const camera = roles.get('camera');
        const screen = roles.get('screen');
        if (camera === undefined || modules.rescaleWorldSum === null || !isObject(holder)) continue;
        const enemy = holder['enemy'];
        const holds =
          pair.when === 'always' || (typeof enemy === 'string' && context.groundEnemies.has(enemy));
        if (!holds) continue;
        const column = screen === undefined ? undefined : Number(screen.leaf.value);
        const ported = modules.rescaleWorldSum(Number(camera.leaf.value), column, pair, geometry);
        const what = pair.when === 'always' ? 'a block' : 'a ground enemy';
        overrides.set(camera.leaf, {
          exact: ported.camera,
          how:
            `world-sum (${what}): ${pair.camera} + ${pair.screen} ×k, ` +
            `appearing at column ${String(ported.screen)} — ${String(cleanFraction(ported.lead))} px of ` +
            'camera travel earlier than ×k',
        });
        if (screen !== undefined) {
          overrides.set(screen.leaf, {
            exact: ported.screen,
            how: `world-sum (${what}): column snapped to the ${modules.edgeAnchor(Number(screen.leaf.value), geometry.fromWidth)}`,
          });
        }
        if (ported.lead !== 0) {
          moved.push({
            event: holder,
            path: camera.leaf.path,
            lead: ported.lead,
            block: pair.when === 'always',
          });
        }
      } else if (pair.rule === 'box-y') {
        const top = roles.get('top');
        const height = roles.get('height');
        if (top === undefined || height === undefined || modules.rescaleBoxY === null) continue;
        const ported = modules.rescaleBoxY(
          Number(top.leaf.value),
          Number(height.leaf.value),
          geometry,
        );
        if (!ported.fromTop) continue; // As its two fields alone would port it.
        const grows =
          `hangs from the top edge: its top stays, its height grows by the pad ` +
          `(${String(height.leaf.value)} → ${String(cleanFraction(ported.height))})`;
        overrides.set(top.leaf, { exact: ported.top, how: `box-y: ${grows}`, topNote: grows });
        overrides.set(height.leaf, { exact: ported.height, how: `box-y: ${grows}` });
      }
    }
  }
  return moved;
}

/**
 * Places a stage's backdrop together (`rescaleBackdrop`): its parallax bands (`band-y`) by their
 * art heights, with the raster rows that bound that art and the Mode-7 rows.
 *
 * @param {RescaleInputFile} file - The stage file.
 * @param {readonly PendingLeaf[]} pending - Its numbers.
 * @param {RescaleGeometry} geometry - The port's geometry.
 * @param {RescaleModules} modules - The packages.
 * @param {RescaleArt} art - The bands' art heights.
 * @param {Map<import('@shmup/core').NumberLeaf, Override>} overrides - Receives the values.
 * @param {RescalePlan} plan - Collector (bands without art, the listed placements, seams).
 * @returns {Set<import('@shmup/core').NumberLeaf>} The band leaves it could not place (no art
 *   height — listed as unclassified; then no band of the stage is placed).
 */
function portBackdrop(file, pending, geometry, modules, art, overrides, plan) {
  /** @type {Set<import('@shmup/core').NumberLeaf>} */
  const unplaced = new Set();
  const bands = pending.filter((item) => item.rule === 'band');
  if (bands.length === 0 || modules.rescaleBackdrop === null) return unplaced;
  /** @type {import('@shmup/core').BackdropBand[]} */
  const inputs = [];
  for (const item of bands) {
    const holder = item.leaf.container;
    const sprite = isObject(holder) ? holder['sprite'] : undefined;
    const height = typeof sprite === 'string' ? art.height(sprite) : undefined;
    if (height === undefined) {
      plan.unclassified.push({
        file: file.path,
        path: item.leaf.path,
        field: item.leaf.field,
        unit: item.unit,
        from: item.leaf.value,
        to: undefined,
        note: `no art height for the band's sprite "${String(sprite)}" (see --atlas)`,
      });
      continue;
    }
    inputs.push({ y: Number(item.leaf.value), height });
  }
  if (inputs.length !== bands.length) {
    for (const item of bands) unplaced.add(item.leaf);
    return unplaced;
  }
  /** @type {PendingLeaf[]} */
  const rowLeaves = [];
  /** @type {import('@shmup/core').BackdropRow[]} */
  const rows = [];
  for (const item of pending) {
    const field = item.leaf.field;
    const kind =
      field === 'raster[].top' || field === 'raster[].bottom'
        ? 'follow'
        : field === 'mode7.horizon' || field === 'mode7.bottom'
          ? 'anchor'
          : null;
    if (kind === null) continue;
    rowLeaves.push(item);
    rows.push({ y: Number(item.leaf.value), kind });
  }
  const ported = modules.rescaleBackdrop(inputs, rows, geometry);
  bands.forEach((item, i) => {
    const band = ported.bands[i];
    if (band === undefined) return;
    const free = band.placement === 'nearest-top' || band.placement === 'nearest-bottom';
    overrides.set(item.leaf, { exact: band.y, how: `backdrop band: ${band.placement}` });
    if (free) {
      plan.backdrop.push({
        file: file.path,
        path: item.leaf.path,
        field: item.leaf.field,
        unit: item.unit,
        from: item.leaf.value,
        to: cleanFraction(band.y),
        note:
          `a band touching nothing, placed by the playfield edge it is nearer to ` +
          `(${band.placement === 'nearest-top' ? 'the top: ×k' : 'the bottom: ×k + the pad'})`,
      });
    }
  });
  rowLeaves.forEach((item, i) => {
    const row = ported.rows[i];
    if (row === undefined) return;
    overrides.set(item.leaf, { exact: row.y, how: `backdrop row: ${row.placement}` });
    if (row.placement === 'near-band-edge') {
      plan.backdrop.push({
        file: file.path,
        path: item.leaf.path,
        field: item.leaf.field,
        unit: item.unit,
        from: item.leaf.value,
        to: cleanFraction(row.y),
        note: 'a row within a tile of a band edge: its distance to that edge ×k',
      });
    }
  });
  for (const [upper, lower] of ported.seams) {
    const a = bands[upper];
    const b = bands[lower];
    if (a === undefined || b === undefined) continue;
    plan.backdrop.push({
      file: file.path,
      path: `${a.leaf.path} / ${b.leaf.path}`,
      field: a.leaf.field,
      unit: a.unit,
      from: undefined,
      to: undefined,
      note: 'two bands that touch no longer do: the pad opens a seam between them',
    });
  }
  for (const conflict of ported.conflicts ?? []) {
    const band = bands[conflict.band];
    const placed = ported.bands[conflict.band];
    if (band === undefined || placed === undefined) continue;
    const anchor =
      conflict.anchor === 'bottom'
        ? 'the bottom edge'
        : `the Mode-7 row ${rowLeaves[conflict.anchor]?.leaf.path ?? String(conflict.anchor)}`;
    const gap = cleanFraction(conflict.gap);
    plan.backdrop.push({
      file: file.path,
      path: band.leaf.path,
      field: band.leaf.field,
      unit: band.unit,
      from: band.leaf.value,
      to: cleanFraction(placed.y),
      note:
        `a band that touched two anchors keeps one (${placed.placement}): its ${conflict.edge} ` +
        `edge was on ${anchor} and now ${gap >= 0 ? `leaves ${String(gap)} px open` : `reaches ${String(-gap)} px past it`} — ` +
        'the art cannot span both at ×k: fix the art or the layout by hand',
    });
  }
  return unplaced;
}

/**
 * A stage's map end, as written and as ported ({@link portMapEnd}).
 *
 * @typedef {object} MapEnd
 * @property {number} end - The map's right end as written: `length + fromWidth`, where the view
 *   ends at the last camera position.
 * @property {number} newEnd - Ported: `length′ + toWidth` (`length′` as the port writes it).
 * @property {number} cols - The map's columns as written (core `stageMapWidth`:
 *   `ceil(end / tileSize)`).
 * @property {number} newCols - The new map's columns (`ceil(newEnd / toTileSize)`).
 */

/**
 * Ports the x's a stage anchors to its **map's right end** — `length` plus one playfield, where the
 * view ends at the last camera position (the map is that wide: core `stageMapWidth`). That end is
 * frame-anchored (§2.6): it ports to `length′ + toWidth`, not ×k (×k would leave
 * `toWidth − k · fromWidth` px of the last view with no terrain — 64 px in v2). An x at or past it
 * keeps its distance past it ×k: `x′ = length′ + toWidth + k · (x − length − fromWidth)`.
 *
 * - A heightfield segment's `to` that reaches the map's last column (the generator clamps a
 *   segment to the map and ramps it down to the map's edge) ports by that rule, kept in the new
 *   map's last column (off the tile grid the end lies inside the last column, and a `to` there
 *   may be short of it): a segment ending on the end ends on the new one. A `from` at or past the
 *   end ports by the same rule (`to′ − from′ = k · (to − from)`, so the segment still starts
 *   before it ends): it starts in the map's last column or past it, where the generator draws
 *   nothing (a one-column segment has height 0 at both its boundaries — core `boundaryHeights`),
 *   and the new end lies in the new map's last column, so it still draws nothing.
 * - A region (a trigger's or a bonus entrance's) whose right edge `x + w` is at or past the end:
 *   the right edge ports by the rule and `w` takes the difference (an `x` past the end too).
 *
 * At factor 1 onto the same playfield every one of these is the identity. Everything else on the
 * timeline is a camera position, which stops at `length` (×k); RLE rows are handled with the
 * tilemap ({@link extendRleRow}).
 *
 * @param {Record<string, unknown>} data - The stage's JSON.
 * @param {readonly PendingLeaf[]} pending - Its numbers.
 * @param {RescaleGeometry} geometry - The port's geometry.
 * @param {RescaleModules} modules - The packages.
 * @param {Map<import('@shmup/core').NumberLeaf, Override>} overrides - Receives the values that
 *   differ from ×k.
 * @returns {MapEnd | null} The map end (`null` without a `length`).
 */
function portMapEnd(data, pending, geometry, modules, overrides) {
  const lengthItem = pending.find(
    (item) => item.leaf.container === data && item.leaf.key === 'length',
  );
  if (lengthItem === undefined) return null;
  const { factor, fromWidth, toWidth } = geometry;
  const length = Number(lengthItem.leaf.value);
  const exactLength = cleanFraction(modules.rescaleNumber(lengthItem.unit, length, geometry));
  const newLength = lengthItem.leaf.integer ? Math.round(exactLength) : exactLength;
  const end = length + fromWidth;
  const newEnd = newLength + toWidth;
  const mapEnd = {
    end,
    newEnd,
    cols: Math.ceil(end / geometry.tileSize),
    newCols: Math.ceil(newEnd / geometry.toTileSize),
  };
  /**
   * An x anchored to the map's right end, ported.
   *
   * @param {number} x - The x as written (at or past `end`, or in the map's last column).
   * @returns {number} Its distance to the end ×k, from the new end.
   */
  const past = (x) => newEnd + factor * (x - end);
  /**
   * The ×k value of a leaf (what its unit alone would make of it).
   *
   * @param {PendingLeaf} item - The leaf.
   * @returns {number} Its value ×k.
   */
  const scaled = (item) =>
    cleanFraction(modules.rescaleNumber(item.unit, Number(item.leaf.value), geometry));
  /**
   * Sets an override unless it is what the unit alone makes of the value.
   *
   * @param {PendingLeaf} item - The leaf.
   * @param {number} exact - Its ported value.
   * @param {string} how - Why.
   */
  const set = (item, exact, how) => {
    if (cleanFraction(exact) !== scaled(item)) overrides.set(item.leaf, { exact, how });
  };
  /**
   * The pending leaf of a field of an object.
   *
   * @param {unknown} holder - The object.
   * @param {string} key - The field.
   * @returns {PendingLeaf | undefined} Its leaf.
   */
  const leafOf = (holder, key) =>
    pending.find((item) => item.leaf.container === holder && item.leaf.key === key);
  const ends =
    `the map's right end (length + ${String(fromWidth)} = ${String(end)} → ` +
    `length′ + ${String(toWidth)} = ${String(newEnd)})`;
  /**
   * How far past the map's right end an x lies, for a note.
   *
   * @param {number} x - The x as written (≥ `end`).
   * @returns {string} `"<n> px past <the end>, ×k past the new one"`.
   */
  const beyond = (x) => `${String(x - end)} px past ${ends}, ×k past the new one`;
  // Heightfield segments: a `to` in the map's last column reaches the end (the generator clamps a
  // segment to the map and ramps it down to its edge).
  const tilemap = isObject(data['tilemap']) ? data['tilemap'] : null;
  const generator =
    tilemap !== null && isObject(tilemap['generator']) ? tilemap['generator'] : null;
  const segments =
    generator !== null && Array.isArray(generator['segments']) ? generator['segments'] : [];
  for (const segment of segments) {
    const to = leafOf(segment, 'to');
    const toX = to === undefined ? Number.NaN : Number(to.leaf.value);
    if (to !== undefined && Math.ceil(toX / geometry.tileSize) >= mapEnd.cols) {
      // Off the tile grid the end lies inside the last column, and a `to` short of it in that
      // column still reaches it: such a `to` keeps its distance ×k too, but stays in the new last
      // column.
      const lastColumn = (mapEnd.newCols - 1) * geometry.toTileSize;
      const short = cleanFraction(newEnd - factor * toX);
      set(
        to,
        Math.max(past(toX), lastColumn + 1),
        toX < end
          ? `map end: ends ${String(end - toX)} px short of ${ends} but in the map's last ` +
              "column, which reaches it — kept in the new map's last column"
          : toX === end
            ? `map end: ends on ${ends} — ×k would end it ${String(short)} px short`
            : `map end: ends ${beyond(toX)}`,
      );
    }
    // A `from` at or past the end (a segment the map never shows: it starts in the map's last
    // column or past it, and a one-column segment draws nothing) keeps its distance past the end
    // ×k, as its `to` does — the segment keeps `to′ − from′ = k · (to − from)`, and it starts in the
    // new map's last column or past it (the new end lies in that column), so it still draws
    // nothing.
    const from = leafOf(segment, 'from');
    const fromX = from === undefined ? Number.NaN : Number(from.leaf.value);
    if (from !== undefined && fromX >= end) {
      set(
        from,
        past(fromX),
        (fromX === end ? `map end: starts on ${ends}` : `map end: starts ${beyond(fromX)}`) +
          ' — a segment the map never shows stays one',
      );
    }
  }
  // Regions (a trigger's, a bonus entrance's) whose right edge reaches the map's right end.
  for (const name of ['events', 'remix']) {
    const list = data[name];
    if (!Array.isArray(list)) continue;
    for (const event of list) {
      const region = isObject(event) ? event['region'] : undefined;
      if (!isObject(region)) continue;
      const xItem = leafOf(region, 'x');
      const wItem = leafOf(region, 'w');
      if (xItem === undefined || wItem === undefined) continue;
      const x = Number(xItem.leaf.value);
      const right = x + Number(wItem.leaf.value);
      if (right < end) continue;
      const newX = x >= end ? past(x) : scaled(xItem);
      if (x >= end) set(xItem, newX, `map end: ${beyond(x)}`);
      set(
        wItem,
        past(right) - newX,
        right === end
          ? `map end: its right edge is on ${ends} and stays on it`
          : `map end: its right edge is ${beyond(right)}`,
      );
    }
  }
  return mapEnd;
}

/**
 * An RLE row as core reads it ({@link rleCells}).
 *
 * @typedef {object} RleCells
 * @property {number} width - Its width in tiles.
 * @property {number} last - Its last cell's tile id (0 for an empty row).
 * @property {number} count - Its last token's run length (0 for an empty row).
 * @property {string | null} error - Why core's decoder refuses the row (its message), or `null`.
 */

/**
 * Reads an RLE row by core's rules (`core/data/tilemap` `decodeRleRow`): every whitespace
 * character is dropped — inside a token too (`2 * 1` is `2*1`) — and what is left is comma
 * separated `<id>` / `<count>*<id>` tokens, each count at least 1.
 *
 * @param {string} row - The row.
 * @returns {RleCells} Its width, last cell and last run, or the first token core refuses.
 */
function rleCells(row) {
  const cells = { width: 0, last: 0, count: 0, error: /** @type {string | null} */ (null) };
  const compact = row.replace(/\s+/g, '');
  if (compact === '') return cells;
  const tokens = compact.split(',');
  for (let t = 0; t < tokens.length; t++) {
    const match = /^(?:([0-9]+)\*)?([0-9]+)$/.exec(tokens[t] ?? '');
    if (match === null) {
      cells.error = `token ${String(t + 1)} "${String(tokens[t])}" is not <id> or <count>*<id>`;
      return cells;
    }
    const count = match[1] === undefined ? 1 : Number(match[1]);
    if (count < 1) {
      cells.error = `token ${String(t + 1)} has a zero run length`;
      return cells;
    }
    cells.width += count;
    cells.count = count;
    cells.last = Number(match[2]);
  }
  return cells;
}

/**
 * Extends an RLE row that is tiled in the map's last column to the new map's width with copies of
 * that cell — the row reaches the map's right end, which is frame-anchored ({@link portMapEnd}).
 * The row's last token is rebuilt from its parsed run and tile id with the extra cells
 * (`2*1` → `8*1`, `1` → `7*1`, `2 * 1` → `8*1`), keeping the whitespace around it; every other
 * character stays.
 *
 * @param {string} row - The row as written.
 * @param {number} cols - The map's columns as written.
 * @param {number} newCols - The new map's columns.
 * @returns {string} The extended row, or `row` itself when it is shorter than the map, ends in an
 *   empty cell or the new map is no wider.
 * @throws {Error} When core's decoder refuses the row (a token that is not `<id>` or
 *   `<count>*<id>`, a zero run): the tool cannot tell where it ends.
 * @example
 * ```js
 * extendRleRow('146*0, 2*1', 148, 154); // '146*0, 8*1'
 * extendRleRow('146*0, 2 * 1', 148, 154); // '146*0, 8*1'
 * ```
 */
export function extendRleRow(row, cols, newCols) {
  const { width, last, count, error } = rleCells(row);
  if (error !== null) throw new Error(`not an RLE row core reads: ${error}`);
  if (width !== cols || last === 0 || newCols <= cols) return row;
  // Commas are not whitespace, so the last token is everything after the row's last comma.
  const cut = row.lastIndexOf(',') + 1;
  const token = row.slice(cut);
  const lead = /^\s*/.exec(token)?.[0] ?? '';
  const trail = /\s*$/.exec(token)?.[0] ?? '';
  return row.slice(0, cut) + lead + `${String(count + newCols - cols)}*${String(last)}` + trail;
}

/**
 * One entry of a stage's timeline — an `events` or `remix` item — for {@link checkTimeline}.
 *
 * @typedef {object} TimelineEntry
 * @property {unknown} event - The event object.
 * @property {'events' | 'remix'} name - Its array.
 * @property {number} index - Its index there as written (before any re-sort).
 * @property {string} path - `events[i]` / `remix[i]`.
 */

/**
 * Where an event fires against a region trigger's armed window.
 *
 * @typedef {'before' | 'inside' | 'after'} TriggerSide
 */

/** How the report words a {@link TriggerSide}. */
const TRIGGER_SIDE_TEXT = Object.freeze({
  before: 'before the trigger arms',
  inside: 'while the trigger is armed',
  after: 'after the trigger disarmed',
});

/**
 * Checks what the field pairs moved against a stage's timeline. Everything on the timeline but a
 * world sum ports ×k, so an event a pair moved (it fires `lead` px of camera travel earlier) can
 * change places with what it followed; the tool lists an event that now fires on the other side
 * of a checkpoint, a camera stop (a `lock` or `hold` key), a `flag` event, or a region trigger's
 * arming or disarming (its `until`, by default the region's right end); a ground enemy that leaves
 * (or joins) a `ground` bonus entrance's window; and a moving block whose drift now runs ahead.
 *
 * @param {RescaleInputFile} file - The stage file.
 * @param {Record<string, unknown>} data - Its JSON.
 * @param {readonly MovedEvent[]} moved - The events the pairs moved.
 * @param {(holder: unknown, key: string) => number | undefined} final - Ported values.
 * @param {RescaleGeometry} geometry - The port's geometry.
 * @param {RescaleModules} modules - The packages.
 * @param {RescaleContext} context - The ground enemies.
 * @param {RescalePlan} plan - Collector.
 *
 * @remarks
 * The order is the runner's: events by `x`, a tie in file order (the re-sort keeps it); a remix
 * entry joins the events of a later loop before an event of a greater `x` only (`stageForLoop`
 * puts the event first on a tie). A trigger arms when the camera reaches its `x` and disarms once
 * the camera has passed its `until` — after the events of that tick fired — so an event at
 * `x <= until` can still be followed by the trigger firing. A branch-gated event that fired after
 * its flag's trigger disarmed in v1 and now fires while it is armed is the one that changes play
 * (both branches can spawn); the tool does not fix it — no port keeps both the event's column and
 * the trigger's window — but names the `until` that would restore v1's order.
 */
function checkTimeline(file, data, moved, final, geometry, modules, context, plan) {
  /**
   * An object's x as written and as ported.
   *
   * @param {unknown} holder - The object.
   * @param {string} [key] - The field (default `x`).
   * @returns {[number, number]} Old and new.
   */
  const xOf = (holder, key = 'x') => {
    const old = isObject(holder) ? Number(holder[key]) : Number.NaN;
    return [old, final(holder, key) ?? old * geometry.factor];
  };
  /**
   * Lists a timeline problem.
   *
   * @param {string} path - Where.
   * @param {unknown} from - The value as written.
   * @param {unknown} to - Ported.
   * @param {string} text - What.
   */
  const list = (path, from, to, text) =>
    plan.timeline.push({ file: file.path, path, field: '', unit: 'world-x', from, to, note: text });
  /** @type {TimelineEntry[]} */
  const timeline = [];
  for (const name of /** @type {const} */ (['events', 'remix'])) {
    const entries = data[name];
    if (Array.isArray(entries)) {
      entries.forEach((event, index) =>
        timeline.push({ event, name, index, path: `${name}[${String(index)}]` }),
      );
    }
  }
  /**
   * Whether one timeline entry fires before another.
   *
   * @param {TimelineEntry} a - One entry.
   * @param {TimelineEntry} b - Another.
   * @param {0 | 1} side - 0 as written, 1 as ported.
   * @returns {boolean} `true` when `a` fires first.
   */
  const firesBefore = (a, b, side) => {
    const ax = xOf(a.event)[side];
    const bx = xOf(b.event)[side];
    if (ax !== bx) return ax < bx;
    if (a.name === b.name) return a.index < b.index;
    return a.name === 'events';
  };
  /** @type {Map<string, string>} */
  const branchFlags = new Map();
  for (const branch of Array.isArray(data['branches']) ? data['branches'] : []) {
    if (isObject(branch) && typeof branch['id'] === 'string' && typeof branch['flag'] === 'string')
      branchFlags.set(branch['id'], branch['flag']);
  }
  /**
   * The flag an event's `branch` reads, or `undefined`.
   *
   * @param {unknown} event - The event.
   * @returns {string | undefined} The flag name.
   */
  const flagRead = (event) =>
    isObject(event) && typeof event['branch'] === 'string'
      ? branchFlags.get(event['branch'])
      : undefined;
  const checkpoints = Array.isArray(data['checkpoints']) ? data['checkpoints'] : [];
  const stops = (Array.isArray(data['camera']) ? data['camera'] : []).filter(
    (key) => isObject(key) && (key['lock'] === true || Number(key['hold'] ?? 0) > 0),
  );
  const flags = timeline.filter((entry) => isObject(entry.event) && entry.event['type'] === 'flag');
  const triggers = timeline.filter(
    (entry) => isObject(entry.event) && entry.event['type'] === 'trigger',
  );
  /**
   * A trigger's `until`, as written and as ported (by default its region's right end).
   *
   * @param {Record<string, unknown>} trigger - The trigger event.
   * @returns {[number, number]} Old and new.
   */
  const untilOf = (trigger) => {
    if (trigger['until'] !== undefined) return xOf(trigger, 'until');
    const region = trigger['region'];
    const [x, newX] = xOf(region);
    const [w, newW] = xOf(region, 'w');
    return [x + w, newX + newW];
  };
  for (const item of moved) {
    const entry = timeline.find((candidate) => candidate.event === item.event);
    const [oldX, newX] = xOf(item.event);
    const reads = flagRead(item.event);
    const branch = String(item.event['branch']);
    for (const checkpoint of checkpoints) {
      const [oldC, newC] = xOf(checkpoint);
      if (oldX >= oldC === newX >= newC) continue;
      list(
        item.path,
        oldX,
        newX,
        newX < newC
          ? `now fires before the checkpoint at ${String(oldC)} (→ ${String(newC)}) it followed`
          : `now fires at or after the checkpoint at ${String(oldC)} (→ ${String(newC)}) it ` +
              'preceded',
      );
    }
    for (const stop of stops) {
      const [oldK, newK] = xOf(stop);
      if (oldX <= oldK === newX <= newK) continue;
      const what =
        stop['lock'] === true ? 'scroll lock' : `${String(stop['hold'])}-tick camera hold`;
      list(
        item.path,
        oldX,
        newX,
        newX <= newK
          ? `now fires when the camera reaches the ${what} at ${String(oldK)} (→ ${String(newK)}), ` +
              'not once it moves on as in v1'
          : `now fires only once the camera moves on from the ${what} at ${String(oldK)} ` +
              `(→ ${String(newK)}), not on its arrival as in v1`,
      );
    }
    if (entry !== undefined) {
      for (const flag of flags) {
        const event = /** @type {Record<string, unknown>} */ (flag.event);
        const was = firesBefore(entry, flag, 0);
        const now = firesBefore(entry, flag, 1);
        if (was === now) continue;
        const name = String(event['flag']);
        const [oldF, newF] = xOf(event);
        list(
          item.path,
          oldX,
          newX,
          `now fires ${now ? 'before' : 'after'} the flag event ${flag.path} ` +
            `(${event['value'] === false ? 'clears' : 'sets'} "${name}" at ${String(oldF)} → ` +
            `${String(newF)}), which it ${was ? 'preceded' : 'followed'} in v1` +
            (reads === name
              ? ` — its branch "${branch}" now reads "${name}" ${now ? 'before' : 'after'} ` +
                'that change'
              : ''),
        );
      }
      for (const trigger of triggers) {
        const event = /** @type {Record<string, unknown>} */ (trigger.event);
        const [oldArm, newArm] = xOf(event);
        const [oldUntil, newUntil] = untilOf(event);
        /** @type {(side: 0 | 1, x: number, until: number) => TriggerSide} */
        const sideOf = (side, x, until) =>
          firesBefore(entry, trigger, side) ? 'before' : x <= until ? 'inside' : 'after';
        const was = sideOf(0, oldX, oldUntil);
        const now = sideOf(1, newX, newUntil);
        if (was === now) continue;
        const name = String(event['flag']);
        const window =
          `armed ${String(oldArm)} … ${String(oldUntil)} → ` +
          `${String(newArm)} … ${String(newUntil)}`;
        if (reads === name && was === 'after' && now === 'inside') {
          list(
            item.path,
            oldX,
            newX,
            `its branch "${branch}" reads the flag "${name}" of the trigger ${trigger.path} ` +
              `(${window}): in v1 it fired after the trigger disarmed, so the branch was decided; ` +
              'now it fires while the trigger is armed — a ship entering the region in camera ' +
              `${String(newX)} … ${String(newUntil)} sets the flag after the branch was read, and ` +
              "both branches can play. Keep v1's order by hand: give the trigger an until below " +
              `${String(newX)} (or move the event)`,
          );
          continue;
        }
        list(
          item.path,
          oldX,
          newX,
          `now fires ${TRIGGER_SIDE_TEXT[now]} (the trigger ${trigger.path} on "${name}", ` +
            `${window}); in v1 it fired ${TRIGGER_SIDE_TEXT[was]}` +
            (reads === name ? ` — its branch "${branch}" reads that flag: check it by hand` : ''),
        );
      }
    }
    if (item.block) {
      const event = item.event;
      const moving = ['vx', 'vy', 'dx', 'dy'].some((key) => Number(event[key] ?? 0) !== 0);
      if (moving) {
        list(
          item.path,
          oldX,
          newX,
          `a moving block created ${String(cleanFraction(item.lead))} px of camera travel earlier: its drift / swing runs ahead of v1`,
        );
      }
    }
  }
  // The `ground` bonus entrances count the ground enemies that appear while they are armed.
  const window = modules.defaultBonusWindow;
  for (const { event: bonus, path: bonusPath } of timeline) {
    if (!isObject(bonus) || bonus['type'] !== 'bonus' || bonus['entrance'] !== 'ground') continue;
    const [oldArm, newArm] = xOf(bonus);
    const oldEnd = bonus['until'] === undefined ? oldArm + window : Number(bonus['until']);
    const newEnd =
      bonus['until'] === undefined
        ? newArm + window * geometry.factor
        : (final(bonus, 'until') ?? oldEnd * geometry.factor);
    for (const { event, path } of timeline) {
      if (!isObject(event) || typeof event['enemy'] !== 'string') continue;
      if (!context.groundEnemies.has(event['enemy'])) continue;
      const [oldX, newX] = xOf(event);
      const before = oldX >= oldArm && oldX < oldEnd;
      const after = newX >= newArm && newX < newEnd;
      if (before !== after) {
        list(
          `${path}.x`,
          oldX,
          newX,
          `a ground enemy that ${before ? 'leaves' : 'joins'} the window of the ground bonus ` +
            `entrance ${bonusPath} (${String(newArm)} … ${String(newEnd)})`,
        );
      }
    }
  }
}

/**
 * Reorders the items of JSON arrays in place, each item keeping its own text and every separator
 * staying where it was.
 *
 * @param {string} text - The JSON text.
 * @param {readonly { keys: readonly (string | number)[], order: readonly number[] }[]} permutations
 *   - Each array (by key path) and its new order (`order[i]` = the old index of the new item i).
 * @returns {string} The new text.
 * @throws {RangeError} When a key path is not an array of that many items.
 */
export function permuteJsonArrays(text, permutations) {
  if (permutations.length === 0) return text;
  const root = jsonSpans(text);
  const edits = permutations.map((permutation) => {
    let span = root;
    for (const key of permutation.keys) {
      const child = span.children === null ? undefined : span.children.get(key);
      if (child === undefined)
        throw new RangeError(`no JSON value at ${permutation.keys.join('.')}`);
      span = child;
    }
    const items = span.children === null ? [] : [...span.children.values()];
    if (items.length !== permutation.order.length) {
      throw new RangeError(
        `${permutation.keys.join('.')} is not an array of ${String(permutation.order.length)} items`,
      );
    }
    const first = items[0];
    const last = items[items.length - 1];
    if (first === undefined || last === undefined) return null;
    let out = '';
    for (let i = 0; i < items.length; i++) {
      const source = items[permutation.order[i] ?? i];
      const item = items[i];
      if (source === undefined || item === undefined) continue;
      out += text.slice(source.start, source.end);
      const next = items[i + 1];
      if (next !== undefined) out += text.slice(item.end, next.start);
    }
    return { start: first.start, end: last.end, text: out };
  });
  let out = text;
  const ordered = edits.filter((edit) => edit !== null).sort((a, b) => b.start - a.start);
  for (const edit of ordered) out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  return out;
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
 * Rounds band heights to whole rows that add up to a total by rounding the **boundaries** between
 * the bands, not each band: the heights are first scaled to the total when they do not already
 * add up to it, every running sum is rounded half up, and the bands are the differences.
 *
 * @param {readonly number[]} exact - The ported (unrounded) heights.
 * @param {number} total - The rows they must fill.
 * @returns {number[] | null} Whole heights ≥ 1 adding up to `total`, or `null` when `total` is
 *   smaller than the number of bands.
 *
 * @remarks
 * A `lines` raster's bands cut the art they distort into rows, so they must follow the art's own
 * edges, and the art is scaled by boundary: a nearest-neighbour ×1.5 upscale (R2-01's interim art,
 * sampling source row `floor(d / 1.5)` for new row `d`) puts source boundary `s` at
 * `ceil(1.5 · s)` — which, as `1.5 · s` is whole or a half, is `1.5 · s` rounded half up. Rounding
 * each band instead (largest remainder) put two of raster-range's boundaries 1 px off that art
 * (review round 2). A band rounded to 0 rows takes one from its neighbours, so every band keeps
 * at least one row.
 * @example
 * ```js
 * spreadBands([3, 3, 4.5, 4.5, 6, 7.5, 9, 10.5, 12, 12], 72); // [3, 3, 5, 4, 6, 8, 9, 10, 12, 12]
 * ```
 */
export function spreadBands(exact, total) {
  const n = exact.length;
  if (total < n) return null;
  const sum = exact.reduce((a, b) => a + b, 0);
  /** @type {number[]} */
  const bounds = [0];
  let running = 0;
  for (let i = 0; i < n; i++) {
    running += exact[i];
    const at =
      i === n - 1
        ? total
        : sum <= 0
          ? ((i + 1) * total) / n
          : sum === total
            ? running
            : (running * total) / sum;
    bounds.push(i === n - 1 ? total : Math.floor(cleanFraction(at) + 0.5));
  }
  // Every band at least one row: push each boundary up past the one before it, then back under
  // the one after it (the total is at least the number of bands, so both fit).
  for (let i = 1; i < n; i++) bounds[i] = Math.max(bounds[i], bounds[i - 1] + 1);
  for (let i = n - 1; i >= 1; i--) bounds[i] = Math.min(bounds[i], bounds[i + 1] - 1);
  const out = [];
  for (let i = 0; i < n; i++) out.push(bounds[i + 1] - bounds[i]);
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
 * Reads the parallax bands' art heights: from an atlas manifest file (`--atlas`), or from the
 * atlas built in memory from `assets/source/` (`scripts/assets/pipeline.mjs` `buildAtlas` — what
 * the tests and `pnpm content:check` read too).
 *
 * @param {Pick<RescaleOptions, 'atlas' | 'artScale'>} options - The options.
 * @returns {Promise<RescaleArt>} The heights (frame 0 of each sprite ÷ `artScale`, 1 when not
 *   given) and the raw frame sizes — resolves once the manifest is read or built.
 * @throws {Error} When the manifest cannot be read or the atlas built.
 */
export async function loadArt(options) {
  /**
   * @type {{ sprites: Record<string, { frames: string[] }>,
   *   frames: Record<string, { w?: number, h: number }> }}
   */
  let manifest;
  if (options.atlas !== null) {
    manifest = JSON.parse(readFileSync(options.atlas, 'utf8'));
  } else {
    const { buildAtlas } = await import('../assets/pipeline.mjs');
    manifest = /** @type {typeof manifest} */ (/** @type {unknown} */ (buildAtlas().manifest));
  }
  const scale = options.artScale ?? 1;
  /**
   * Frame 0 of a sprite, as the manifest lists it.
   *
   * @param {string} sprite - The sprite name.
   * @returns {{ w?: number, h: number } | undefined} The frame, or `undefined`.
   */
  const first = (sprite) => {
    const entry = Object.prototype.hasOwnProperty.call(manifest.sprites, sprite)
      ? manifest.sprites[sprite]
      : undefined;
    return entry === undefined ? undefined : manifest.frames[entry.frames[0] ?? ''];
  };
  return {
    height: (sprite) => {
      const frame = first(sprite);
      return frame === undefined ? undefined : frame.h / scale;
    },
    frame: (sprite) => {
      const frame = first(sprite);
      return frame === undefined ? undefined : { w: frame.w ?? frame.h, h: frame.h };
    },
  };
}

/**
 * Measures the atlas art's scale against the content's pixels from the terrain tiles: frame 0 of
 * each tileset's sprite against the tileset's `tileSize` (the tiles are the one art whose size the
 * content names — after R2-01 they are drawn at the new tile size while the content still says
 * the old one).
 *
 * @param {readonly RescaleInputFile[]} files - The content files (the tilesets are read).
 * @param {RescaleArt} art - The atlas.
 * @returns {{ scale: number | null, tiles: { sprite: string, tileSize: number, w: number,
 *   h: number }[] }} The scale every measured tile agrees on (`null` when no tileset's sprite is
 *   in the atlas, or when they disagree), and every tile measured.
 * @example
 * ```js
 * measureArtScale(files, art); // { scale: 1, tiles: [...] } today; 1.5 once the tiles are 12 px
 * ```
 */
export function measureArtScale(files, art) {
  /** @type {{ sprite: string, tileSize: number, w: number, h: number }[]} */
  const tiles = [];
  for (const file of files) {
    /** @type {unknown} */
    let data;
    try {
      data = JSON.parse(file.text);
    } catch {
      continue;
    }
    if (!isObject(data) || data['kind'] !== 'tileset') continue;
    const sprite = data['sprite'];
    const tileSize = data['tileSize'];
    if (typeof sprite !== 'string' || typeof tileSize !== 'number' || !(tileSize > 0)) continue;
    const frame = art.frame === undefined ? undefined : art.frame(sprite);
    if (frame === undefined) continue;
    tiles.push({ sprite, tileSize, w: frame.w, h: frame.h });
  }
  const scales = new Set();
  for (const tile of tiles) {
    scales.add(cleanFraction(tile.w / tile.tileSize));
    scales.add(cleanFraction(tile.h / tile.tileSize));
  }
  const only = scales.size === 1 ? /** @type {number} */ ([...scales][0]) : null;
  return { scale: only, tiles };
}

/**
 * Settles the art scale of a port from `--art-scale` and what the atlas' terrain tiles measure —
 * never a guess: without `--art-scale` it is 1 while the tiles measure ×1, and a given scale must
 * be the one the tiles measure. Both ways round the port would place every parallax band from
 * heights at the wrong scale (a run after R2-01's interim ×1.5 art that forgets the flag; a run
 * passing `--art-scale 1.5` — R2-02's documented command — against an atlas still drawn at ×1),
 * so both are refused. `--force-art-scale` lets a given scale override the tiles, for an atlas
 * whose bands are drawn at another scale than its tiles (which the measurement cannot see).
 *
 * @param {number | null} given - `--art-scale` (`null` = not given).
 * @param {ReturnType<typeof measureArtScale>} measured - What the atlas' tiles say.
 * @param {boolean} [force] - `--force-art-scale`: use `given` whatever the tiles say.
 * @returns {{ scale: number, measured: number | null, note: string | null }} The scale to use,
 *   the measured one, and a note for the report when the scale is not checked against the tiles
 *   (no tile to measure, or forced past them).
 * @throws {RescaleError} When no scale is given and the tiles measure another scale than 1, when a
 *   given scale is not the one the tiles measure and `force` is not set, or when the tiles
 *   disagree among themselves and nothing forces a scale (exit code 2).
 * @example
 * ```js
 * resolveArtScale(1.5, measureArtScale(files, art)); // throws on today's ×1 atlas
 * resolveArtScale(1.5, measureArtScale(files, art), true); // 1.5, with a note
 * ```
 */
export function resolveArtScale(given, measured, force = false) {
  const sizes = (/** @type {'w' | 'h'} */ key) =>
    [...new Set(measured.tiles.map((tile) => tile[key]))].sort((a, b) => a - b).join(' / ');
  const content = [...new Set(measured.tiles.map((tile) => tile.tileSize))]
    .sort((a, b) => a - b)
    .join(' / ');
  const tiles =
    measured.scale === null
      ? `the atlas' terrain tiles (${sizes('w')} px wide, ${sizes('h')} px tall) do not agree on ` +
        `one scale against the content's tilesets (${content} px)`
      : `the atlas' terrain tiles are ${sizes('h')} px against the content's tilesets' ${content} ` +
        `px: the art is drawn at ×${String(measured.scale)} the content's pixels`;
  if (given === null) {
    if (measured.tiles.length > 0 && measured.scale === null) {
      throw new RescaleError(
        `${tiles}: pass --art-scale S with --force-art-scale, S the scale of the parallax ` +
          "bands' art against the content's pixels",
      );
    }
    if (measured.scale !== null && measured.scale !== 1) {
      const scale = String(measured.scale);
      throw new RescaleError(
        `${tiles}, so the bands' art heights need --art-scale ${scale} (or --atlas with an atlas ` +
          "drawn at the content's pixels)",
      );
    }
    return { scale: 1, measured: measured.scale, note: null };
  }
  if (measured.tiles.length === 0) {
    return {
      scale: given,
      measured: null,
      note:
        `--art-scale ${String(given)} given, but the atlas holds none of the tilesets' sprites: ` +
        'the scale is not checked',
    };
  }
  if (measured.scale === given) return { scale: given, measured: measured.scale, note: null };
  if (!force) {
    throw new RescaleError(
      `--art-scale ${String(given)} contradicts the atlas — ${tiles}. Pass the scale the tiles ` +
        'measure (leave --art-scale out while it is 1), or add --force-art-scale if the ' +
        `parallax bands really are drawn at ×${String(given)} while the tiles are not`,
    );
  }
  return {
    scale: given,
    measured: measured.scale,
    note:
      `--art-scale ${String(given)} forced: the atlas' terrain tiles measure ` +
      `${measured.scale === null ? 'no single scale' : `×${String(measured.scale)}`}, the ` +
      `bands' art heights use ×${String(given)}`,
  };
}

/**
 * What {@link rescaleContent} did.
 *
 * @typedef {RescalePlan & { written: string[], refused: boolean, dryRun: boolean,
 *   art?: ReturnType<typeof resolveArtScale> }} RescaleResult
 */

/**
 * Runs a port over a content root: plans it, formats every changed file through Prettier and —
 * unless it is a dry run or the plan has unclassified values or errors — writes them.
 *
 * @param {RescaleOptions} options - The options.
 * @param {RescaleModules} modules - The packages.
 * @returns {Promise<RescaleResult>} The plan, with the files written (none on a dry run or a
 *   refusal) — resolves once every file is formatted and written.
 * @throws {RescaleError} When the geometry is impossible, or the atlas contradicts the art scale
 *   — given or not — and `forceArtScale` is not set ({@link resolveArtScale}).
 */
export async function rescaleContent(options, modules) {
  const geometry = rescaleGeometry(options, modules.frame);
  const paths = modules.readContentFiles(options.root).map((file) => file.path);
  if (options.examples) paths.push(...listExamples(options.root));
  const files = paths.map((path) => ({
    path,
    text: readFileSync(join(options.root, path), 'utf8'),
  }));
  const art = await loadArt(options);
  const artScale = resolveArtScale(
    options.artScale,
    measureArtScale(files, art),
    options.forceArtScale === true,
  );
  const plan = planRescale(files, geometry, modules, art);
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
  return { ...plan, written, refused, dryRun: options.dryRun, art: artScale };
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
  if (result.art !== undefined && result.art.note !== null) lines.push(`note: ${result.art.note}`);
  if (result.refused) lines.push('REFUSED: nothing written (unclassified values or errors).');
  else if (result.dryRun) lines.push('dry run: nothing written.');
  else lines.push(`${String(result.written.length)} files written.`);
  if (quiet) return lines.join('\n');
  if (result.errors.length > 0) {
    lines.push('', `errors (${String(result.errors.length)}):`);
    for (const error of result.errors) lines.push(`  ${error.file}: ${error.message}`);
  }
  section(lines, 'unclassified', result.unclassified);
  section(lines, 'on or above the top edge', result.aboveTop);
  section(lines, 'moved by a rule other than ×k', result.moved);
  section(lines, 'rounded integers', result.rounded);
  section(lines, "outside today's schema bounds", result.outOfBounds);
  section(lines, 'masks only approximated', result.masks);
  section(lines, 'timeline', result.timeline);
  section(lines, 'backdrop', result.backdrop);
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
