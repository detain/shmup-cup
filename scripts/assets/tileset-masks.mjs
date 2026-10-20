#!/usr/bin/env node
/**
 * The repo-side mask copy (plan step R3-03.V4b): the tool that moves the column-height masks the
 * ingest tool derived from real art — the sidecar `<name>.masks.json` of schema
 * `shmup-ingest-masks@1` — into the designed tileset JSON, and the guard that keeps the two from
 * drifting apart.
 *
 * **The guard (why `--check` exists).** The ingest tool is its sidecar's writer and its own
 * `--check` re-derives the sidecar from the current art and rewrites it silently when the art
 * moved — so "the tileset's masks equal its sidecar's" is a property the ingest run cannot
 * enforce. This script's `--check` fails LOUDLY whenever a tileset's masks and the matching
 * `<name>.masks.json` (when one is present) disagree: `--check <tileset> <masks.json>` compares
 * that one pair; `--check` alone scans every sidecar under `assets/source/sprites/` and
 * `art-prompts/v2/ingested/` (never the candidates folder) against the tileset each one names,
 * and exits non-zero on any disagreement or unresolvable tileset reference.
 *
 * **Frames are matched by INDEX**, like the ingest tool's own `loadTilesetMasks` — whose
 * validation shape this file reuses without importing it (that library pulls in image decoders
 * the repo's test job does not install). A sidecar entry's `tile` name is informational: when
 * the tileset carries a differently named tile at that frame index the tool WARNS and goes by
 * the index. This tool copies and guards; `pnpm content:check` stays the content's judge.
 *
 * **The refusal (decision W5-11).** The heightfield places every partial cell by anchor + mask,
 * so rewriting a `solid` tile's mask silently remaps the terrain that names no tile. A `--write`
 * that would change the mask of a solid tile exits non-zero WITHOUT WRITING ANYTHING unless
 * `--allow-remap` is given; a `hazard` mask (the generator never places hazard tiles) is free to
 * move. `--write` rewrites only the tileset file it is given — `content/` only moves when a path
 * inside `content/` is passed to it — and rewrites only the `mask` arrays whose values change
 * (a text splice, then Prettier, so unrelated bytes and order survive).
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** @typedef {{ write: (text: string) => void }} OutStream */
/** @typedef {{ stdout: OutStream, stderr: OutStream }} Io */

const SCHEMA = 'shmup-ingest-masks@1';
const SELF = 'tileset-masks';
/** The folders `--check` (no arguments) scans for sidecars, root-relative. */
const SCAN_DIRS = ['assets/source/sprites', 'art-prompts/v2/ingested'];
/** The mask of an empty decoration carries no collision — it never appears in a sidecar. */
const EMPTY_TYPE = 'empty';
/** A guard against runaway documents, not a content bound (content:check judges the real one). */
const MAX_TILE_COUNT = 64;

const USAGE = [
  `Usage: node ${SELF}.mjs --check [<tileset>.tileset.json <name>.masks.json]`,
  `       node ${SELF}.mjs --write <tileset>.tileset.json <name>.masks.json [--allow-remap]`,
  '       [--root DIR]  (root-relative paths resolve against it; default: the repository root)',
  `--check compares the tileset's masks with the sidecar's and fails loudly on any`,
  'disagreement (the ingest tool rewrites its sidecar silently — this guard does not).',
  "--write copies the sidecar's masks into the tileset JSON, refusing to change the",
  'mask of a solid tile (the heightfield places those by anchor + mask) without --allow-remap.',
  '',
].join('\n');

/**
 * The repository root, two folders above this file's own directory.
 *
 * @returns {string} An absolute path.
 */
function repoRoot() {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
}

/**
 * Resolves one command-line path: absolute paths stand, relative ones join onto the root the
 * way the ingest tool joins its root-relative paths.
 *
 * @param {string} root - The absolute root.
 * @param {string} path - A root-relative or absolute path, either slash style.
 * @returns {string} The absolute file path.
 */
function resolveIn(root, path) {
  return isAbsolute(path) ? path : join(root, ...path.split(/[\\/]+/));
}

/**
 * A path as output names it: root-relative with forward slashes when it lies under the root.
 *
 * @param {string} root - The absolute root.
 * @param {string} abs - The absolute path.
 * @returns {string} The display path.
 */
function display(root, abs) {
  const rel = relative(root, abs);
  return rel === '' || rel.startsWith('..') ? abs : rel.split(sep).join('/');
}

/**
 * The sidecar files of the scan folders, root-relative.
 *
 * @param {string} root - The absolute root.
 * @returns {string[]} Root-relative posix paths (empty when a folder does not exist).
 */
function findSidecars(root) {
  /** @type {string[]} */
  const found = [];
  /**
   * One directory, depth first; the art round's candidate drafts are never scanned.
   *
   * @param {string} absDir - The absolute directory.
   * @param {string} relDir - Its root-relative display path.
   */
  const walk = (absDir, relDir) => {
    let entries;
    try {
      entries = readdirSync(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const rel = relDir === '' ? entry.name : `${relDir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name !== 'candidates') walk(join(absDir, entry.name), rel);
      } else if (entry.isFile() && entry.name.endsWith('.masks.json')) {
        found.push(rel);
      }
    }
  };
  for (const dir of SCAN_DIRS) walk(resolveIn(root, dir), dir);
  return found;
}

/**
 * Parses and validates one sidecar JSON document (schema `shmup-ingest-masks@1`, the format the
 * ingest tool's mask-from-art mode writes).
 *
 * @param {unknown} json - The parsed document.
 * @param {string} label - What the file is called in errors.
 * @returns {{ tileSize: number, sprite: string, tileset: string,
 *   frames: { frame: number, tile: string, anchor: string, mask: number[] }[] }} The sidecar.
 * @throws {Error} When it is not a sidecar of that schema.
 */
function parseSidecar(json, label) {
  if (json === null || typeof json !== 'object' || Array.isArray(json))
    throw new Error(`${label}: not a JSON object`);
  const doc = /** @type {Record<string, unknown>} */ (json);
  if (doc.format !== SCHEMA)
    throw new Error(`${label}: "format" must be ${JSON.stringify(SCHEMA)}`);
  const tileSize = doc.tileSize;
  if (!Number.isInteger(tileSize) || /** @type {number} */ (tileSize) < 1)
    throw new Error(`${label}: "tileSize" must be a positive integer`);
  if (typeof doc.tileset !== 'string' || doc.tileset === '')
    throw new Error(`${label}: "tileset" must be the root-relative path it was derived for`);
  if (!Array.isArray(doc.frames)) throw new Error(`${label}: "frames" must be a list`);
  /** @type {{ frame: number, tile: string, anchor: string, mask: number[] }[]} */
  const frames = [];
  for (let i = 0; i < doc.frames.length; i++) {
    const at = `${label}: frames[${i}]`;
    const entry = doc.frames[i];
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry))
      throw new Error(`${at} is not an object`);
    const e = /** @type {Record<string, unknown>} */ (entry);
    if (!Number.isInteger(e.frame) || /** @type {number} */ (e.frame) < 0)
      throw new Error(`${at}: "frame" must be a non-negative integer`);
    if (typeof e.tile !== 'string' || e.tile === '')
      throw new Error(`${at}: "tile" must be a name`);
    if (e.anchor !== 'floor' && e.anchor !== 'ceiling')
      throw new Error(`${at}: "anchor" must be "floor" or "ceiling"`);
    if (
      !Array.isArray(e.mask) ||
      e.mask.length !== tileSize ||
      !e.mask.every(
        (/** @type {unknown} */ v) =>
          Number.isInteger(v) &&
          /** @type {number} */ (v) >= 0 &&
          /** @type {number} */ (v) <= tileSize,
      )
    )
      throw new Error(`${at}: "mask" must be ${tileSize} integer heights 0 to ${tileSize}`);
    frames.push({
      frame: /** @type {number} */ (e.frame),
      tile: /** @type {string} */ (e.tile),
      anchor: /** @type {string} */ (e.anchor),
      mask: /** @type {number[]} */ (e.mask),
    });
  }
  return {
    tileSize: /** @type {number} */ (tileSize),
    sprite: typeof doc.sprite === 'string' ? doc.sprite : '',
    tileset: doc.tileset,
    frames,
  };
}

/**
 * Reads and validates a sidecar file.
 *
 * @param {string} file - The absolute path.
 * @param {string} label - What it is called in errors.
 * @returns {ReturnType<typeof parseSidecar>} The sidecar.
 * @throws {Error} When it cannot be read or is not a sidecar.
 */
function readSidecarFile(file, label) {
  if (!existsSync(file)) throw new Error(`${label}: not found`);
  let json;
  try {
    json = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`${label}: ${/** @type {Error} */ (error).message}`, { cause: error });
  }
  return parseSidecar(json, label);
}

/**
 * Reads a designed tileset the way the ingest tool reads one (`loadTilesetMasks`'s shape, with
 * the collision tiles only): a JSON document of `kind: "tileset"` whose non-empty tiles each
 * carry a frame index, an anchor and one integer column height per pixel of `tileSize`. The
 * content loader stays the judge of everything else about it — a `tiles` order or a duplicate
 * name this tool tolerates, content:check does not.
 *
 * @param {string} file - The absolute path.
 * @param {string} label - What it is called in errors.
 * @returns {{ tileSize: number, id: string, tiles: { index: number, name: string, type: string,
 *   frame: number, anchor: string, mask: number[] }[] }} The tileset's collision tiles.
 * @throws {Error} When it cannot be read or does not look like a tileset.
 */
function readTilesetFile(file, label) {
  if (!existsSync(file)) throw new Error(`${label}: not found`);
  let json;
  try {
    json = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`${label}: ${/** @type {Error} */ (error).message}`, { cause: error });
  }
  const doc = /** @type {Record<string, unknown>} */ (json);
  if (doc.kind !== 'tileset')
    throw new Error(`${label}: not a tileset (kind ${JSON.stringify(doc.kind)})`);
  const tileSize = doc.tileSize;
  if (!Number.isInteger(tileSize) || /** @type {number} */ (tileSize) < 1)
    throw new Error(`${label}: "tileSize" must be a positive integer`);
  if (!Array.isArray(doc.tiles)) throw new Error(`${label}: "tiles" must be a list`);
  if (doc.tiles.length > MAX_TILE_COUNT)
    throw new Error(`${label}: more than ${MAX_TILE_COUNT} tiles is not a tileset`);
  /** @type {{ index: number, name: string, type: string, frame: number, anchor: string, mask: number[] }[]} */
  const tiles = [];
  for (let i = 0; i < doc.tiles.length; i++) {
    const at = `${label}: tiles[${i}]`;
    const tile = doc.tiles[i];
    if (tile === null || typeof tile !== 'object' || Array.isArray(tile))
      throw new Error(`${at} is not an object`);
    const t = /** @type {Record<string, unknown>} */ (tile);
    const name = typeof t.name === 'string' ? t.name : `tiles[${i}]`;
    if (t.type === EMPTY_TYPE) continue; // decoration: no collision to copy or guard
    if (t.type !== 'solid' && t.type !== 'hazard')
      throw new Error(
        `${at}: "type" must be "empty", "solid" or "hazard", not ${JSON.stringify(t.type)}`,
      );
    if (!Number.isInteger(t.frame) || /** @type {number} */ (t.frame) < 0)
      throw new Error(`${at}: "frame" must be a non-negative integer`);
    if (t.anchor !== 'floor' && t.anchor !== 'ceiling')
      throw new Error(`${at}: "anchor" must be "floor" or "ceiling"`);
    if (
      !Array.isArray(t.mask) ||
      t.mask.length !== tileSize ||
      !t.mask.every(
        (/** @type {unknown} */ v) =>
          Number.isInteger(v) &&
          /** @type {number} */ (v) >= 0 &&
          /** @type {number} */ (v) <= tileSize,
      )
    )
      throw new Error(`${at}: "mask" must be ${tileSize} integer heights 0 to ${tileSize}`);
    tiles.push({
      index: i,
      name,
      type: /** @type {string} */ (t.type),
      frame: /** @type {number} */ (t.frame),
      anchor: /** @type {string} */ (t.anchor),
      mask: /** @type {number[]} */ (t.mask),
    });
  }
  return {
    tileSize: /** @type {number} */ (tileSize),
    id: typeof doc.id === 'string' ? doc.id : '',
    tiles,
  };
}

/**
 * The sidecar's one claim per frame: the FIRST non-empty tile to claim a frame rules it, like
 * the ingest tool's loader. Two claims of the same frame that disagree are a broken sidecar —
 * never an arbitrary pick.
 *
 * @param {ReturnType<typeof readSidecarFile>} sidecar - The parsed sidecar.
 * @param {string} label - What its file is called in errors.
 * @returns {{ byFrame: Map<number, { frame: number, tile: string, anchor: string, mask: number[] }>,
 *   errors: string[] }} The winning claims and the errors found.
 */
function frameClaims(sidecar, label) {
  /** @type {Map<number, { frame: number, tile: string, anchor: string, mask: number[] }>} */
  const byFrame = new Map();
  /** @type {string[]} */
  const errors = [];
  for (const entry of sidecar.frames) {
    const prev = byFrame.get(entry.frame);
    if (prev === undefined) {
      byFrame.set(entry.frame, entry);
      continue;
    }
    if (
      prev.anchor !== entry.anchor ||
      prev.tile !== entry.tile ||
      !sameMask(prev.mask, entry.mask)
    )
      errors.push(
        `${label}: frame ${entry.frame} is claimed twice, by "${prev.tile}" and "${entry.tile}", with different masks`,
      );
  }
  return { byFrame, errors };
}

/**
 * Whether two column-height masks are equal.
 *
 * @param {number[]} a - One mask.
 * @param {number[]} b - The other.
 * @returns {boolean} `true` when every height matches.
 */
function sameMask(a, b) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * A mask as output names it.
 *
 * @param {number[]} mask - The heights.
 * @returns {string} `[a, b, …]`.
 */
function showMask(mask) {
  return `[${mask.join(', ')}]`;
}

/**
 * Compares a sidecar's claims with the tileset's current masks.
 *
 * @param {string} tilesetLabel - What the tileset is called in messages.
 * @param {ReturnType<typeof readTilesetFile>} tileset - The tileset.
 * @param {Map<number, { frame: number, tile: string, anchor: string, mask: number[] }>} byFrame -
 *   The winning claims.
 * @returns {{ errors: string[], warnings: string[], diffs: { frame: number, tile: { index: number,
 *   name: string, type: string, frame: number, anchor: string, mask: number[] }, from: number[],
 *   to: number[] }[] }} The findings: hard disagreements (an unknown frame, a flipped anchor),
 *   name warnings, and the masks that moved.
 */
function collectDiffs(tilesetLabel, tileset, byFrame) {
  /** @type {string[]} */
  const errors = [];
  /** @type {string[]} */
  const warnings = [];
  /** @type {{ frame: number, tile: { index: number, name: string, type: string, frame: number, anchor: string, mask: number[] }, from: number[], to: number[] }[]} */
  const diffs = [];
  for (const entry of byFrame.values()) {
    const tile = tileset.tiles.find((t) => t.frame === entry.frame);
    if (tile === undefined) {
      errors.push(
        `${tilesetLabel}: no non-empty tile carries frame ${entry.frame} (sidecar entry "${entry.tile}")`,
      );
      continue;
    }
    if (entry.tile !== tile.name)
      warnings.push(
        `${tilesetNameOf(tileset)}/${tile.name}: frame ${entry.frame} is claimed as "${entry.tile}" — matched by index, names differ`,
      );
    if (entry.anchor !== tile.anchor) {
      errors.push(
        `${tilesetNameOf(tileset)}/${tile.name}: the sidecar anchors frame ${entry.frame} "${entry.anchor}", the tileset "${tile.anchor}"`,
      );
      continue;
    }
    if (!sameMask(tile.mask, entry.mask))
      diffs.push({ frame: entry.frame, tile, from: tile.mask, to: entry.mask });
  }
  return { errors, warnings, diffs };
}

/**
 * The tileset's name for messages: its `id`, or the file path when it has none.
 *
 * @param {{ id: string }} tileset - The tileset.
 * @returns {string} The name.
 */
function tilesetNameOf(tileset) {
  return tileset.id === '' ? 'tileset' : tileset.id;
}

/**
 * Resolves the tileset a sidecar was derived for: the `tileset` field as root-relative first,
 * then relative to the sidecar's own folder (the shape V4a's recipes emit, plus the local copy
 * a staging folder can hold).
 *
 * @param {string} root - The absolute root.
 * @param {string} sidecarAbs - The absolute sidecar path.
 * @param {string} tilesetField - The sidecar's `tileset` field.
 * @returns {string | null} The absolute tileset path, or `null` when neither exists.
 */
function sidecarTilesetPath(root, sidecarAbs, tilesetField) {
  const parts = tilesetField.split(/[\\/]+/);
  const fromRoot = isAbsolute(tilesetField) ? tilesetField : join(root, ...parts);
  if (existsSync(fromRoot)) return fromRoot;
  const fromSidecar = resolve(dirname(sidecarAbs), ...parts);
  return existsSync(fromSidecar) ? fromSidecar : null;
}

/**
 * The other sidecars in the scan folders that name the same tileset file — the frame claims a
 * write must not silently overrule.
 *
 * @param {string} root - The absolute root.
 * @param {string} tilesetAbs - The absolute tileset path.
 * @param {string} selfAbs - The sidecar being copied (its claims stand).
 * @returns {{ display: string, abs: string }[]} The other sidecars, root-relative display.
 */
function otherSidecars(root, tilesetAbs, selfAbs) {
  /** @type {{ display: string, abs: string }[]} */
  const others = [];
  for (const rel of findSidecars(root)) {
    if (resolve(root, ...rel.split('/')) === resolve(selfAbs)) continue;
    const abs = resolveIn(root, rel);
    let doc;
    try {
      doc = JSON.parse(readFileSync(abs, 'utf8'));
    } catch {
      continue; // unreadable elsewhere — the scan reports it, a single write need not
    }
    const field = doc !== null && typeof doc === 'object' ? doc.tileset : undefined;
    if (typeof field !== 'string') continue;
    const target = sidecarTilesetPath(root, abs, field);
    if (target !== null && resolve(target) === resolve(tilesetAbs))
      others.push({ display: rel, abs });
  }
  return others;
}

/**
 * Decodes the escape sequences of a JSON string body (the text between the quotes).
 *
 * @param {string} raw - The body with `\uXXXX` and short escapes as written.
 * @returns {string} The decoded text.
 */
function decodeString(raw) {
  return raw
    .replace(/\\u([0-9a-fA-F]{4})/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\(["\\/])/g, '$1')
    .replace(/\\b/g, '\b')
    .replace(/\\f/g, '\f')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t');
}

/**
 * The `mask` array text of every tile object of the top-level `tiles` list, found in document
 * order by a JSON token walk (strings with escapes, object/array depth, the `"tiles"` key of the
 * root object). Splicing the file's own text instead of re-serialising it keeps every other
 * byte and the tile order exactly as they are.
 *
 * @param {string} text - The tileset JSON text.
 * @returns {{ name: string | null, mask: { start: number, end: number } | null }[]} One record
 *   per tile object, in order.
 */
function findTileMasks(text) {
  /** @type {{ name: string | null, mask: { start: number, end: number } | null }[]} */
  const records = [];
  /**
   * A frame of the walk: the container being read, its depth (the root object is depth 1), the
   * key whose value is coming or being read, and — for a tile object — the mask extent so far.
   *
   * @typedef {{ kind: 'obj' | 'arr', depth: number, key: string | null, tileIndex: number,
   *   maskStart: number, maskEnd: number }} Frame
   */
  /** @type {Frame[]} */
  const stack = [];
  /** The depth of the root's `tiles` array, once found. */
  let tilesDepth = 0;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === ' ' || c === '\n' || c === '\r' || c === '\t' || c === ':' || c === ',') {
      i++;
      continue;
    }
    const parent = stack.length === 0 ? null : stack[stack.length - 1];
    if (c === '{' || c === '[') {
      const frame = /** @type {Frame} */ ({
        kind: c === '{' ? 'obj' : 'arr',
        depth: stack.length + 1,
        key: null,
        tileIndex: -1,
        maskStart: -1,
        maskEnd: -1,
      });
      if (
        frame.kind === 'arr' &&
        parent !== null &&
        parent.kind === 'obj' &&
        parent.depth === 1 &&
        parent.key === 'tiles'
      )
        tilesDepth = frame.depth;
      if (
        frame.kind === 'obj' &&
        parent !== null &&
        parent.kind === 'arr' &&
        tilesDepth > 0 &&
        parent.depth === tilesDepth
      ) {
        frame.tileIndex = records.length;
        records.push({ name: null, mask: null });
      }
      if (
        parent !== null &&
        parent.kind === 'obj' &&
        parent.key === 'mask' &&
        parent.tileIndex >= 0
      )
        parent.maskStart = i; // this array IS the tile's mask
      stack.push(frame);
      i++;
      continue;
    }
    if (c === '}' || c === ']') {
      const frame = stack.pop();
      if (frame === undefined) throw new Error(`malformed JSON at offset ${i}`);
      // The frame that held this one — NOT `parent`, which is the popped frame itself.
      const holder = stack.length === 0 ? null : stack[stack.length - 1];
      if (holder !== null && holder.kind === 'obj') {
        if (frame.kind === 'arr' && holder.tileIndex >= 0 && holder.key === 'mask')
          holder.maskEnd = i + 1;
        holder.key = null; // the value completed the pair
      }
      if (frame.kind === 'obj' && frame.tileIndex >= 0) {
        records[frame.tileIndex].mask =
          frame.maskStart >= 0 && frame.maskEnd > frame.maskStart
            ? { start: frame.maskStart, end: frame.maskEnd }
            : null;
      }
      i++;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      let raw = '';
      while (j < text.length) {
        const d = text[j];
        if (d === '\\') {
          raw += text.slice(j, j + 2);
          j += 2;
          continue;
        }
        if (d === '"') break;
        raw += d;
        j++;
      }
      if (parent !== null && parent.kind === 'obj') {
        let k = j + 1;
        while (k < text.length && /\s/.test(text[k])) k++;
        if (text[k] === ':' && parent.key === null) {
          parent.key = decodeString(raw); // a key
        } else {
          if (parent.tileIndex >= 0 && parent.key === 'name')
            records[parent.tileIndex].name = decodeString(raw);
          parent.key = null; // a value completed the pair
        }
      }
      i = j + 1;
      continue;
    }
    let j = i; // a number, `true`, `false`, `null`
    while (
      j < text.length &&
      text[j] !== ',' &&
      text[j] !== '}' &&
      text[j] !== ']' &&
      !/\s/.test(text[j])
    )
      j++;
    if (parent !== null && parent.kind === 'obj') parent.key = null;
    i = j;
    continue;
  }
  return records;
}

/**
 * Copies the sidecar's masks into the tileset text: one splice per changed tile's `mask` array
 * (applied last to first so the offsets hold), then the file re-formatted with Prettier exactly
 * the way the repo formats it.
 *
 * @param {string} text - The current tileset JSON text.
 * @param {ReturnType<typeof readTilesetFile>} tileset - The parsed tileset (its order is the
 *   file's).
 * @param {{ tile: { index: number, name: string }, to: number[] }[]} changes - The moved masks.
 * @param {string} file - The absolute path (for the error text and the Prettier format).
 * @returns {Promise<string>} The new text.
 */
async function copyMasksInto(text, tileset, changes, file) {
  // The walk counts every tile object; the parsed list holds only the collision tiles, so the
  // records address tiles by their index in the FULL list, which readTilesetFile kept in `index`.
  const records = findTileMasks(text);
  /** @type {{ start: number, end: number, text: string }[]} */
  const edits = [];
  for (const change of changes) {
    const record = records[change.tile.index];
    if (record === undefined || record.mask === null)
      throw new Error(
        `${file}: cannot locate the "mask" array of tiles[${change.tile.index}] ("${change.tile.name}")`,
      );
    if (record.name !== null && record.name !== change.tile.name)
      throw new Error(
        `${file}: the tile at list position ${change.tile.index} reads "${record.name}" in the text and "${change.tile.name}" in the parsed document — refusing to splice`,
      );
    edits.push({ start: record.mask.start, end: record.mask.end, text: JSON.stringify(change.to) });
  }
  edits.sort((a, b) => b.start - a.start);
  let out = text;
  for (const edit of edits) out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  const prettier = await import('prettier');
  const config = await prettier.resolveConfig(file);
  return await prettier.format(out, { ...(config ?? {}), filepath: file });
}

/**
 * The `--write` flow: one tileset, one sidecar, the refusal rules, then the copy.
 *
 * @param {Io} io - The output streams.
 * @param {string[]} positionals - `<tileset> <masks.json>`.
 * @param {string} root - The absolute root.
 * @param {boolean} allowRemap - Whether solid tiles may be remapped.
 * @returns {Promise<number>} The exit code.
 * @throws {Error} On a malformed input file (reported as a failure).
 */
async function runWrite(io, positionals, root, allowRemap) {
  if (positionals.length !== 2) {
    io.stderr.write(`${SELF}: --write needs exactly two paths: --write <tileset> <masks.json>\n`);
    return 1;
  }
  const tilesetAbs = resolveIn(root, positionals[0]);
  const sidecarAbs = resolveIn(root, positionals[1]);
  const tilesetLabel = display(root, tilesetAbs);
  const sidecarLabel = display(root, sidecarAbs);
  const tileset = readTilesetFile(tilesetAbs, tilesetLabel);
  const sidecar = readSidecarFile(sidecarAbs, sidecarLabel);
  if (sidecar.tileSize !== tileset.tileSize) {
    io.stderr.write(
      `${SELF}: ${sidecarLabel}: tileSize ${sidecar.tileSize} does not match ${tilesetLabel}'s ${tileset.tileSize}\n`,
    );
    return 1;
  }
  const claims = frameClaims(sidecar, sidecarLabel);
  const found = collectDiffs(tilesetLabel, tileset, claims.byFrame);
  for (const warning of found.warnings) io.stderr.write(`${SELF}: warning: ${warning}\n`);
  let failed = claims.errors.length > 0 || found.errors.length > 0;
  for (const error of [...claims.errors, ...found.errors]) io.stderr.write(`${SELF}: ${error}\n`);
  // A second sidecar naming the same tileset with a different mask for the same frame makes any
  // copy arbitrary — the ambiguity must be settled by hand first.
  for (const other of otherSidecars(root, tilesetAbs, sidecarAbs)) {
    const otherSidecar = readSidecarFile(other.abs, other.display);
    if (otherSidecar.tileSize !== tileset.tileSize) {
      io.stderr.write(
        `${SELF}: ${other.display}: tileSize ${otherSidecar.tileSize} does not match ${tilesetLabel}'s ${tileset.tileSize}\n`,
      );
      failed = true;
      continue;
    }
    const otherClaims = frameClaims(otherSidecar, other.display);
    for (const error of otherClaims.errors) io.stderr.write(`${SELF}: ${error}\n`);
    failed = failed || otherClaims.errors.length > 0;
    for (const [frame, entry] of otherClaims.byFrame) {
      const mine = claims.byFrame.get(frame);
      if (mine === undefined) continue;
      if (mine.anchor !== entry.anchor || !sameMask(mine.mask, entry.mask)) {
        io.stderr.write(
          `${SELF}: frame ${frame} is claimed by both ${sidecarLabel} and ${other.display} with different masks — settle them before writing\n`,
        );
        failed = true;
      }
    }
  }
  const solid = found.diffs.filter((d) => d.tile.type === 'solid');
  if (solid.length > 0 && !allowRemap) {
    for (const diff of solid)
      io.stderr.write(
        `${SELF}: ${tilesetNameOf(tileset)}/${diff.tile.name}: frame ${diff.frame} is a solid tile the heightfield places by anchor + mask: ${showMask(diff.from)} would become ${showMask(diff.to)} — pass --allow-remap to rewrite it\n`,
      );
    io.stderr.write(
      `${SELF}: nothing written (a hazard mask is free to move; this refusal is only for solid tiles)\n`,
    );
    return 1;
  }
  if (failed) return 1;
  // collectDiffs only reports masks that really moved, so the diffs are the changes.
  const changed = found.diffs;
  if (changed.length === 0) {
    io.stdout.write(`${SELF}: ${tilesetLabel} agrees with ${sidecarLabel} — nothing to write\n`);
    return 0;
  }
  const text = readFileSync(tilesetAbs, 'utf8');
  const out = await copyMasksInto(text, tileset, changed, tilesetAbs);
  writeFileSync(tilesetAbs, out);
  io.stdout.write(
    `${SELF}: copied ${changed.length} mask(s) from ${sidecarLabel} into ${tilesetLabel}\n`,
  );
  return 0;
}

/**
 * The `--check` flow: the explicit pair, or the scan of every sidecar the scan folders hold.
 *
 * @param {Io} io - The output streams.
 * @param {string[]} positionals - Zero or two paths.
 * @param {string} root - The absolute root.
 * @returns {Promise<number>} The exit code.
 * @throws {Error} On a malformed input file (reported as a failure).
 */
async function runCheck(io, positionals, root) {
  if (positionals.length === 2) {
    const tilesetAbs = resolveIn(root, positionals[0]);
    const sidecarAbs = resolveIn(root, positionals[1]);
    const tilesetLabel = display(root, tilesetAbs);
    const sidecarLabel = display(root, sidecarAbs);
    const tileset = readTilesetFile(tilesetAbs, tilesetLabel);
    const sidecar = readSidecarFile(sidecarAbs, sidecarLabel);
    if (sidecar.tileSize !== tileset.tileSize) {
      io.stderr.write(
        `${SELF}: ${sidecarLabel}: tileSize ${sidecar.tileSize} does not match ${tilesetLabel}'s ${tileset.tileSize}\n`,
      );
      return 1;
    }
    const claims = frameClaims(sidecar, sidecarLabel);
    const found = collectDiffs(tilesetLabel, tileset, claims.byFrame);
    for (const warning of found.warnings) io.stderr.write(`${SELF}: warning: ${warning}\n`);
    let bad = claims.errors.length + found.errors.length;
    for (const error of [...claims.errors, ...found.errors]) io.stderr.write(`${SELF}: ${error}\n`);
    for (const diff of found.diffs) {
      io.stderr.write(
        `${SELF}: ${tilesetNameOf(tileset)}/${diff.tile.name}: frame ${diff.frame} mask ${showMask(diff.from)} does not match ${sidecarLabel}'s ${showMask(diff.to)}\n`,
      );
      bad++;
    }
    if (bad > 0) {
      io.stderr.write(
        `${SELF}: ${bad} disagreement(s) — copy them with --write (solid tiles need --allow-remap)\n`,
      );
      return 1;
    }
    io.stdout.write(`${SELF}: ${tilesetLabel} agrees with ${sidecarLabel}\n`);
    return 0;
  }
  if (positionals.length !== 0) {
    io.stderr.write(
      `${SELF}: --check takes no arguments or exactly two: --check [<tileset> <masks.json>]\n`,
    );
    return 1;
  }
  const rels = findSidecars(root);
  if (rels.length === 0) {
    io.stdout.write(
      `${SELF}: no ${SCHEMA} sidecars under ${SCAN_DIRS.join(' or ')} — nothing to check\n`,
    );
    return 0;
  }
  let bad = 0;
  let disagreements = 0;
  /** @type {Map<string, { tilesetLabel: string, entries: Map<number, { frame: number, tile: string, anchor: string, mask: number[] }>, label: string }[]>} */
  const byTileset = new Map();
  for (const rel of rels) {
    const abs = resolveIn(root, rel);
    const sidecar = readSidecarFile(abs, rel);
    const tilesetAbs = sidecarTilesetPath(root, abs, sidecar.tileset);
    if (tilesetAbs === null) {
      io.stderr.write(
        `${SELF}: ${rel}: names tileset "${sidecar.tileset}", which exists neither under the root nor beside the sidecar\n`,
      );
      bad++;
      continue;
    }
    const tilesetLabel = display(root, tilesetAbs);
    let tileset;
    try {
      tileset = readTilesetFile(tilesetAbs, tilesetLabel);
    } catch (error) {
      io.stderr.write(`${SELF}: ${/** @type {Error} */ (error).message}\n`);
      bad++;
      continue;
    }
    const claims = frameClaims(sidecar, rel);
    for (const error of claims.errors) {
      io.stderr.write(`${SELF}: ${error}\n`);
      bad++;
    }
    const group = byTileset.get(tilesetAbs) ?? [];
    group.push({ tilesetLabel, entries: claims.byFrame, label: rel });
    byTileset.set(tilesetAbs, group);
    if (sidecar.tileSize !== tileset.tileSize) {
      io.stderr.write(
        `${SELF}: ${rel}: tileSize ${sidecar.tileSize} does not match ${tilesetLabel}'s ${tileset.tileSize}\n`,
      );
      bad++;
    }
  }
  for (const group of byTileset.values()) {
    const [first] = group;
    let tileset;
    try {
      tileset = readTilesetFile(resolveIn(root, first.tilesetLabel), first.tilesetLabel);
    } catch {
      continue; // already reported above
    }
    for (const other of group.slice(1)) {
      for (const [frame, entry] of other.entries) {
        const mine = first.entries.get(frame);
        if (mine === undefined) continue;
        if (mine.anchor !== entry.anchor || !sameMask(mine.mask, entry.mask)) {
          io.stderr.write(
            `${SELF}: frame ${frame} of ${first.tilesetLabel} is claimed by both ${first.label} and ${other.label} with different masks\n`,
          );
          bad++;
        }
      }
    }
    for (const member of group) {
      const found = collectDiffs(member.tilesetLabel, tileset, member.entries);
      for (const warning of found.warnings) io.stderr.write(`${SELF}: warning: ${warning}\n`);
      for (const error of found.errors) {
        io.stderr.write(`${SELF}: ${error}\n`);
        bad++;
      }
      for (const diff of found.diffs) {
        io.stderr.write(
          `${SELF}: ${tilesetNameOf(tileset)}/${diff.tile.name}: frame ${diff.frame} mask ${showMask(diff.from)} does not match ${member.label}'s ${showMask(diff.to)}\n`,
        );
        disagreements++;
      }
    }
  }
  if (bad > 0 || disagreements > 0) {
    io.stderr.write(
      `${SELF}: ${bad} error(s), ${disagreements} disagreement(s) across ${rels.length} sidecar(s)\n`,
    );
    return 1;
  }
  io.stdout.write(`${SELF}: ${rels.length} sidecar(s) agree with their tilesets\n`);
  return 0;
}

/**
 * The command line.
 *
 * @param {string[]} argv - The arguments (without `node` and the script path).
 * @param {Io} io - The output streams.
 * @returns {Promise<number>} The exit code: 0 on agreement or a completed copy, 1 on any
 *   disagreement, refusal or malformed input.
 */
export async function main(argv, io) {
  /** @type {'check' | 'write' | 'help' | null} */
  let mode = null;
  let allowRemap = false;
  let root = '';
  /** @type {string[]} */
  const positionals = [];
  try {
    for (let i = 0; i < argv.length; i++) {
      const arg = argv[i];
      if (arg === '--check' || arg === '--write') {
        if (mode !== null && mode !== 'help')
          throw new Error(`pass only one of --check / --write (here: --${mode} and ${arg})`);
        mode = arg === '--check' ? 'check' : 'write';
      } else if (arg === '--allow-remap') {
        allowRemap = true;
      } else if (arg === '--root') {
        if (i + 1 >= argv.length) throw new Error('--root needs a directory');
        root = resolve(argv[i + 1]);
        i++;
      } else if (arg.startsWith('--root=')) {
        root = resolve(arg.slice('--root='.length));
      } else if (arg === '-h' || arg === '--help') {
        mode = 'help';
      } else if (arg.startsWith('-')) {
        throw new Error(`unknown option ${arg}`);
      } else {
        positionals.push(arg);
      }
    }
    if (mode === null) throw new Error('pass --check or --write');
    if (mode === 'help') {
      io.stdout.write(USAGE);
      return 0;
    }
    if (mode === 'write' && positionals.length !== 2)
      throw new Error('--write needs <tileset> and <masks.json>');
    if (positionals.length === 1)
      throw new Error('one path alone means nothing; pass <tileset> <masks.json>');
    return mode === 'write'
      ? await runWrite(io, positionals, root === '' ? repoRoot() : root, allowRemap)
      : await runCheck(io, positionals, root === '' ? repoRoot() : root);
  } catch (error) {
    io.stderr.write(`${SELF}: ${/** @type {Error} */ (error).message}\n`);
    return 1;
  }
}

if (
  process.argv[1] !== undefined &&
  resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])
) {
  main(process.argv.slice(2), { stdout: process.stdout, stderr: process.stderr }).then((code) => {
    process.exitCode = code;
  });
}
