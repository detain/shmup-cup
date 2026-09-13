#!/usr/bin/env node
/**
 * `pnpm content:tiled <map.tmj>` — converts a map authored in **Tiled** (JSON map format, `.tmj`)
 * into the game's stage JSON (plan M2-07, shmup_feat.md §14 "authoring in LDtk or Tiled: entity at
 * x → event at scroll x; polylines → paths"). The output is ordinary content: `loadContent`
 * validates it like a hand-written stage, so the importer only translates — it does not check the
 * game rules.
 *
 * **The map.** Orthogonal, not infinite, 8 × 8 px tiles (`TILE_SIZE`). Its custom properties
 * (all optional) fill the stage header: `id` (default: the file name), `name` (default: the id in
 * upper case), `tileset` (the **content** tileset id, default `terrain-a`), `musicStage` /
 * `musicBoss` (music cue names, default `Stage` / `Boss`), `length` (default: the map width in
 * pixels minus one screen, 384) and `speed` (the scroll speed of the camera key the importer adds
 * at x 0 when the map has none, default 1).
 *
 * **Tile layer → RLE rows.** The tile layer named `terrain` (else the first tile layer) becomes
 * `tilemap.rle`: one string per map row (`rowsTall` = the map height), runs written `<count>*<id>`,
 * trailing empty cells dropped. A Tiled gid maps to the content tile id `gid − firstgid + 1`, so
 * the Tiled tileset must list its tiles in the order of the content tileset's `tiles` (tile 0 ↔
 * id 1); gid 0 is the empty cell. Layer data may be a JSON array or `csv`; flipped / rotated tiles
 * and compressed or base64 data are errors.
 *
 * **Objects → events.** Every object of every object layer is read by its class (`class` since
 * Tiled 1.9, `type` before); its custom properties become the event's fields (Tiled property
 * types map to JSON: `int` / `float` → numbers, `bool` → booleans, `string` → strings):
 *
 * - `spawn`, `formation` — the object's position is the enemy's spawn point in the world: the
 *   event fires at `x = max(0, round(obj.x) − 400)` (so the enemy appears 16 px past the right
 *   edge, the default `screenX`), `screenX` is written only when it is not 400 (an object nearer
 *   the start than 400 px), `y = round(obj.y)`; the enemy id is the `enemy` property or the
 *   object's name. A spawn takes `path` and `branch`; a formation also `count`, `interval`,
 *   `drop` and `bonus`.
 * - `warning`, `boss`, `music`, `speed`, `flag`, `end` — an event at `x = round(obj.x)` (the camera
 *   x); `enemy` (or the object's name), `cue`, `speed`, `ramp`, `flag`, `value`, `branch`.
 * - `camera` — a camera key at `round(obj.x)`: `speed` (required), `ramp`, `yTo`, `yTicks`,
 *   `yOver`, `lock`, `hold`.
 * - `checkpoint` — a checkpoint at `round(obj.x)`.
 * - `trigger` (a rectangle) — a region trigger over the rectangle (`region` = its `x`, `y`,
 *   `width`, `height`), armed when the region enters the view (`x = max(0, left − 384)`, or the
 *   `armX` property); `flag`, `value`, `until`, `branch`.
 * - `block` (a rectangle) — a moving block appearing 16 px past the right edge (`x = max(0,
 *   left − 400)`, `screenX = left − x` when not 400), `y` = its top, `w` / `h` = its size; `tile`,
 *   `vx`, `vy`, `dx`, `dy`, `period`, `phase`, `branch`.
 * - `branch` — declares an in-stage branch: id = the object's name, `flag`, `value`.
 * - any object with a **polyline** — a movement path (`content/paths/`): id = the object's name,
 *   points relative to its first point (rounded to 1/100 px).
 *
 * Events are sorted by `x`; ties keep the order of layers and objects in the file (Tiled's
 * drawing order). Unknown classes are errors, so a typo does not silently drop an enemy.
 *
 * **Output.** `<stages>/<id>.stage.json` (`parallax: []` — add bands in the JSON) and, when the
 * map has polylines, `<paths>/<id>.paths.json`; formatted like the rest of `content/`. Options:
 * `--stages DIR` (default `content/stages`), `--paths DIR` (default `content/paths`), `--id ID`
 * (overrides the map's `id`), `--print` (writes nothing, prints the JSON).
 *
 * **Public API.** {@link convertTiledMap}, {@link encodeRleRow}, {@link readTiledProperties},
 * {@link decodeTileLayer}, {@link TiledImportError}, {@link SPAWN_LEAD}, {@link VIEW_WIDTH},
 * {@link TILED_TILE_SIZE}.
 *
 * @module
 */
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Repository root (this file lives in `scripts/content/`). */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Tile edge the game uses (`@shmup/core` `TILE_SIZE`); the map's tiles must match it. */
export const TILED_TILE_SIZE = 8;

/** The playfield width (`@shmup/core` `PLAYFIELD_W`): a stage map is its length plus this. */
export const VIEW_WIDTH = 384;

/** How far ahead of the camera a spawn appears by default (`DEFAULT_SPAWN_SCREEN_X`, 400). */
export const SPAWN_LEAD = 400;

/** Tiled's flip / rotation bits in a gid. */
const FLIP_BITS = 0xe0000000;

/** Classes that become timeline events at the object's x (the camera x). */
const MARKER_EVENTS = new Set(['warning', 'boss', 'music', 'speed', 'flag', 'end']);

/** Fields a spawn takes from the object's properties (besides the enemy). */
const SPAWN_FIELDS = ['path', 'branch'];

/** Fields a formation takes from the object's properties (besides enemy, count, interval). */
const FORMATION_FIELDS = ['path', 'drop', 'bonus', 'branch'];

/** Fields of each marker event taken from the properties. */
const MARKER_FIELDS = /** @type {Record<string, string[]>} */ ({
  warning: ['branch'],
  boss: ['branch'],
  music: ['cue', 'branch'],
  speed: ['speed', 'ramp', 'branch'],
  flag: ['flag', 'value', 'branch'],
  end: ['branch'],
});

/** Camera key fields taken from the properties. */
const CAMERA_FIELDS = ['speed', 'ramp', 'yTo', 'yTicks', 'yOver', 'lock', 'hold'];

/** Trigger fields taken from the properties. */
const TRIGGER_FIELDS = ['flag', 'value', 'until', 'branch'];

/** Block fields taken from the properties. */
const BLOCK_FIELDS = ['tile', 'vx', 'vy', 'dx', 'dy', 'period', 'phase', 'branch'];

/**
 * A problem with the map (the CLI prints it and exits 1).
 */
export class TiledImportError extends Error {
  /**
   * @param {string} message - What is wrong (with the object / layer it concerns).
   */
  constructor(message) {
    super(message);
    this.name = 'TiledImportError';
  }
}

/**
 * Tiled custom properties (`[{ name, type, value }]`) as a plain object.
 *
 * @param {unknown} properties - The `properties` array of a map, layer or object (or undefined).
 * @returns {Record<string, unknown>} Name → value (`int` / `float` / `bool` / `string` values
 *   as JSON numbers, booleans and strings).
 * @throws {TiledImportError} For a malformed entry.
 */
export function readTiledProperties(properties) {
  /** @type {Record<string, unknown>} */
  const out = {};
  if (properties === undefined) return out;
  if (!Array.isArray(properties)) throw new TiledImportError('properties must be an array');
  for (const entry of properties) {
    if (typeof entry !== 'object' || entry === null || typeof entry.name !== 'string') {
      throw new TiledImportError('a property needs a name');
    }
    out[entry.name] = entry.value;
  }
  return out;
}

/**
 * Run-length encodes one tile row the way `core/data` decodes it: tokens `<id>` or
 * `<count>*<id>`, joined by `", "`, trailing empty cells dropped.
 *
 * @param {readonly number[]} cells - Content tile ids of the row (0 = empty).
 * @returns {string} The row (`""` for an empty row).
 *
 * @example
 * ```js
 * encodeRleRow([0, 0, 0, 2, 2, 5, 0]); // → '3*0, 2*2, 5'
 * ```
 */
export function encodeRleRow(cells) {
  let last = cells.length - 1;
  while (last >= 0 && cells[last] === 0) last--;
  /** @type {string[]} */
  const tokens = [];
  let i = 0;
  while (i <= last) {
    let j = i;
    while (j <= last && cells[j] === cells[i]) j++;
    const run = j - i;
    tokens.push(run > 1 ? String(run) + '*' + String(cells[i]) : String(cells[i]));
    i = j;
  }
  return tokens.join(', ');
}

/**
 * Decodes a Tiled tile layer into rows of content tile ids.
 *
 * @param {Record<string, any>} layer - The tile layer.
 * @param {number} width - Map width in tiles.
 * @param {number} height - Map height in tiles.
 * @param {number} firstgid - `firstgid` of the map's (first) tileset.
 * @returns {number[][]} `height` rows of `width` content tile ids.
 * @throws {TiledImportError} For compressed / base64 data, a wrong length, flipped tiles or a gid
 *   below `firstgid`.
 */
export function decodeTileLayer(layer, width, height, firstgid) {
  const name = String(layer.name ?? '');
  /** @type {number[]} */
  let data;
  if (Array.isArray(layer.data) && layer.encoding === undefined) {
    data = layer.data.map(Number);
  } else if (layer.encoding === 'csv' && typeof layer.data === 'string') {
    data = layer.data
      .split(',')
      .map((/** @type {string} */ token) => token.trim())
      .filter((/** @type {string} */ token) => token !== '')
      .map(Number);
  } else {
    throw new TiledImportError(
      `tile layer "${name}": only array or csv data is supported (not ${String(layer.encoding)}` +
        `${layer.compression ? ' + ' + String(layer.compression) : ''})`,
    );
  }
  if (data.length !== width * height) {
    throw new TiledImportError(
      `tile layer "${name}": ${data.length} cells, expected ${width} × ${height}`,
    );
  }
  /** @type {number[][]} */
  const rows = [];
  for (let r = 0; r < height; r++) {
    /** @type {number[]} */
    const row = [];
    for (let c = 0; c < width; c++) {
      const gid = data[r * width + c];
      if (!Number.isInteger(gid) || gid < 0) {
        throw new TiledImportError(`tile layer "${name}": bad gid ${gid} at (${c}, ${r})`);
      }
      if (gid === 0) {
        row.push(0);
        continue;
      }
      if ((gid & FLIP_BITS) !== 0 || gid > 0x1fffffff) {
        throw new TiledImportError(
          `tile layer "${name}": flipped or rotated tile at (${c}, ${r}) — not supported`,
        );
      }
      if (gid < firstgid) {
        throw new TiledImportError(`tile layer "${name}": gid ${gid} below firstgid ${firstgid}`);
      }
      row.push(gid - firstgid + 1);
    }
    rows.push(row);
  }
  return rows;
}

/**
 * Copies the named fields present in `from` into `to` (in the given order).
 *
 * @param {Record<string, unknown>} to - Target.
 * @param {Record<string, unknown>} from - Properties.
 * @param {readonly string[]} fields - Field names.
 */
function copyFields(to, from, fields) {
  for (const field of fields) if (from[field] !== undefined) to[field] = from[field];
}

/**
 * The object's class: `class` (Tiled ≥ 1.9) or `type` (older maps).
 *
 * @param {Record<string, any>} object - A Tiled object.
 * @returns {string} The class (`""` when none).
 */
function classOf(object) {
  const cls = object.class ?? object.type ?? '';
  return typeof cls === 'string' ? cls : '';
}

/**
 * Rounds to 1/100 px (path points; Tiled writes floats).
 *
 * @param {number} value - A coordinate.
 * @returns {number} The rounded value (never `-0`).
 */
function round2(value) {
  const r = Math.round(value * 100) / 100;
  return r === 0 ? 0 : r;
}

/**
 * Converts a parsed Tiled JSON map into a stage (and its paths). Pure: no file access.
 *
 * @param {Record<string, any>} map - The parsed `.tmj`.
 * @param {{ id?: string }} [options] - `id` overrides the map's `id` property.
 * @returns {{ stage: Record<string, unknown>, paths: Record<string, unknown> | null }} The stage
 *   file's JSON, and the paths file's JSON (`null` without polylines).
 * @throws {TiledImportError} When the map breaks the rules in the module docs.
 *
 * @example
 * ```js
 * const { stage } = convertTiledMap(JSON.parse(readFileSync('level.tmj', 'utf8')), { id: 'x' });
 * ```
 */
export function convertTiledMap(map, options = {}) {
  if (typeof map !== 'object' || map === null) throw new TiledImportError('not a Tiled map');
  if (map.orientation !== undefined && map.orientation !== 'orthogonal') {
    throw new TiledImportError(`orientation "${String(map.orientation)}" (orthogonal expected)`);
  }
  if (map.infinite === true) throw new TiledImportError('infinite maps are not supported');
  if (map.tilewidth !== TILED_TILE_SIZE || map.tileheight !== TILED_TILE_SIZE) {
    throw new TiledImportError(
      `tiles are ${String(map.tilewidth)} × ${String(map.tileheight)} (${TILED_TILE_SIZE} × ` +
        `${TILED_TILE_SIZE} expected)`,
    );
  }
  const width = Number(map.width);
  const height = Number(map.height);
  if (!(Number.isInteger(width) && width > 0 && Number.isInteger(height) && height > 0)) {
    throw new TiledImportError('the map needs a positive integer width and height');
  }
  const props = readTiledProperties(map.properties);
  const id = String(options.id ?? props.id ?? 'imported');
  const name = String(props.name ?? id.replace(/-/g, ' ').toUpperCase());
  const length =
    props.length !== undefined ? Number(props.length) : width * TILED_TILE_SIZE - VIEW_WIDTH;
  if (!(Number.isInteger(length) && length > 0)) {
    throw new TiledImportError(`stage length ${length} (the map must be wider than one screen)`);
  }
  const layers = Array.isArray(map.layers) ? map.layers : [];
  const tileLayers = layers.filter((/** @type {any} */ l) => l.type === 'tilelayer');
  const terrain = tileLayers.find((/** @type {any} */ l) => l.name === 'terrain') ?? tileLayers[0];
  const firstgid =
    Array.isArray(map.tilesets) && map.tilesets.length > 0 ? map.tilesets[0].firstgid : 1;

  /** @type {Record<string, unknown>[]} */
  const camera = [];
  /** @type {{ x: number }[]} */
  const checkpoints = [];
  /** @type {Record<string, unknown>[]} */
  const branches = [];
  /** @type {Record<string, unknown>[]} */
  const paths = [];
  /** @type {{ event: Record<string, unknown>, order: number }[]} */
  const events = [];

  let order = 0;
  for (const layer of layers) {
    if (layer.type !== 'objectgroup') continue;
    for (const object of Array.isArray(layer.objects) ? layer.objects : []) {
      const where = `object ${String(object.id)} "${String(object.name ?? '')}"`;
      const p = readTiledProperties(object.properties);
      const ox = Math.round(Number(object.x));
      const oy = Math.round(Number(object.y));
      if (Array.isArray(object.polyline)) {
        if (typeof object.name !== 'string' || object.name === '') {
          throw new TiledImportError(`${where}: a polyline path needs a name (its path id)`);
        }
        const first = object.polyline[0] ?? { x: 0, y: 0 };
        paths.push({
          id: object.name,
          points: object.polyline.map((/** @type {{ x: number, y: number }} */ pt) => ({
            x: round2(pt.x - first.x),
            y: round2(pt.y - first.y),
          })),
        });
        continue;
      }
      const cls = classOf(object);
      /** @type {Record<string, unknown>} */
      let event;
      if (cls === 'spawn' || cls === 'formation') {
        const enemy = p.enemy ?? object.name;
        if (typeof enemy !== 'string' || enemy === '') {
          throw new TiledImportError(`${where}: a ${cls} needs an enemy (property or name)`);
        }
        const x = Math.max(0, ox - SPAWN_LEAD);
        event = { x, type: cls, enemy };
        if (cls === 'formation') {
          event.count = p.count;
          event.interval = p.interval;
        }
        event.y = oy;
        if (ox - x !== SPAWN_LEAD) event.screenX = ox - x;
        copyFields(event, p, cls === 'formation' ? FORMATION_FIELDS : SPAWN_FIELDS);
      } else if (MARKER_EVENTS.has(cls)) {
        event = { x: ox, type: cls };
        if (cls === 'warning' || cls === 'boss') event.enemy = p.enemy ?? object.name;
        copyFields(event, p, MARKER_FIELDS[cls]);
      } else if (cls === 'trigger') {
        const x = p.armX !== undefined ? Number(p.armX) : Math.max(0, ox - VIEW_WIDTH);
        event = {
          x,
          type: 'trigger',
          flag: p.flag,
          region: { x: ox, y: oy, w: Math.round(object.width), h: Math.round(object.height) },
        };
        copyFields(event, p, TRIGGER_FIELDS.slice(1));
      } else if (cls === 'block') {
        const x = Math.max(0, ox - SPAWN_LEAD);
        event = { x, type: 'block' };
        if (ox - x !== SPAWN_LEAD) event.screenX = ox - x;
        event.y = oy;
        event.w = Math.round(object.width);
        event.h = Math.round(object.height);
        copyFields(event, p, BLOCK_FIELDS);
      } else if (cls === 'camera') {
        /** @type {Record<string, unknown>} */
        const key = { x: ox };
        copyFields(key, p, CAMERA_FIELDS);
        camera.push(key);
        continue;
      } else if (cls === 'checkpoint') {
        checkpoints.push({ x: ox });
        continue;
      } else if (cls === 'branch') {
        /** @type {Record<string, unknown>} */
        const branch = { id: object.name, flag: p.flag };
        if (p.value !== undefined) branch.value = p.value;
        branches.push(branch);
        continue;
      } else {
        throw new TiledImportError(`${where}: unknown class "${cls}"`);
      }
      events.push({ event, order: order++ });
    }
  }
  events.sort((a, b) => Number(a.event.x) - Number(b.event.x) || a.order - b.order);
  camera.sort((a, b) => Number(a.x) - Number(b.x));
  checkpoints.sort((a, b) => a.x - b.x);
  if (camera.length === 0 || camera[0].x !== 0) {
    camera.unshift({ x: 0, speed: props.speed !== undefined ? Number(props.speed) : 1 });
  }

  /** @type {Record<string, unknown>} */
  const stage = {
    formatVersion: 1,
    kind: 'stage',
    id,
    name,
    music: { stage: String(props.musicStage ?? 'Stage'), boss: String(props.musicBoss ?? 'Boss') },
    length,
    camera,
    checkpoints,
    parallax: [],
    tilemap:
      terrain === undefined
        ? null
        : {
            tileSize: TILED_TILE_SIZE,
            tileset: String(props.tileset ?? 'terrain-a'),
            rowsTall: height,
            rle: decodeTileLayer(terrain, width, height, firstgid).map(encodeRleRow),
          },
    events: events.map((e) => e.event),
  };
  if (branches.length > 0) stage.branches = branches;
  return {
    stage,
    paths: paths.length === 0 ? null : { formatVersion: 1, kind: 'paths', paths },
  };
}

/**
 * Formats a content file as two-space JSON (run `pnpm format` afterwards for the house style).
 *
 * @param {unknown} value - The JSON value.
 * @returns {string} The text, newline-terminated.
 */
function formatJson(value) {
  return JSON.stringify(value, null, 2) + '\n';
}

/**
 * Parses the command line.
 *
 * @param {string[]} args - `process.argv.slice(2)`.
 * @returns {{ file: string, stages: string, paths: string, id: string | undefined,
 *   print: boolean }} The options.
 * @throws {TiledImportError} For an unknown option or a missing map file.
 */
function parseArgs(args) {
  let file = '';
  let stages = join(REPO_ROOT, 'content', 'stages');
  let paths = join(REPO_ROOT, 'content', 'paths');
  /** @type {string | undefined} */
  let id;
  let print = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--stages') stages = resolve(args[++i] ?? '');
    else if (arg === '--paths') paths = resolve(args[++i] ?? '');
    else if (arg === '--id') id = args[++i];
    else if (arg === '--print') print = true;
    else if (arg.startsWith('--')) throw new TiledImportError(`unknown option ${arg}`);
    else file = arg;
  }
  if (file === '') {
    throw new TiledImportError(
      'usage: tiled-import <map.tmj> [--id ID] [--stages DIR] [--paths DIR] [--print]',
    );
  }
  return { file, stages, paths, id, print };
}

/**
 * The CLI: reads the map, converts it, writes (or prints) the files.
 *
 * @param {string[]} args - Command-line arguments.
 * @returns {number} The exit code.
 */
function main(args) {
  try {
    const options = parseArgs(args);
    const map = JSON.parse(readFileSync(options.file, 'utf8'));
    const fallbackId = basename(options.file).replace(/\.(tmj|json)$/i, '');
    const id = options.id ?? readTiledProperties(map.properties).id ?? fallbackId;
    const { stage, paths } = convertTiledMap(map, { id: String(id) });
    if (options.print) {
      process.stdout.write(formatJson(stage));
      if (paths !== null) process.stdout.write(formatJson(paths));
      return 0;
    }
    mkdirSync(options.stages, { recursive: true });
    const stageFile = join(options.stages, `${String(id)}.stage.json`);
    writeFileSync(stageFile, formatJson(stage));
    console.log(`wrote ${stageFile}`);
    if (paths !== null) {
      mkdirSync(options.paths, { recursive: true });
      const pathsFile = join(options.paths, `${String(id)}.paths.json`);
      writeFileSync(pathsFile, formatJson(paths));
      console.log(`wrote ${pathsFile}`);
    }
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

/**
 * Whether this module is the script Node was started with (not an import).
 *
 * @returns {boolean} `true` when run from the command line.
 */
function isMain() {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  const self = fileURLToPath(import.meta.url);
  const target = resolve(entry);
  if (!existsSync(target)) return false;
  return realpathSync(target) === realpathSync(self);
}

if (isMain()) process.exitCode = main(process.argv.slice(2));
