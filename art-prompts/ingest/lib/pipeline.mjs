/**
 * One recipe from source images to the three output files (plan R3-02, art bible §8):
 *
 * 1. crop or slice every source into frame regions;
 * 2. key each region (border-sampled key, flood fill, holes, cleanup, despill — or a black
 *    key for translucent / additive FX);
 * 3. area-downscale it straight to the frame size, pixel-snap, binary alpha;
 * 4. quantise all frames to one palette (named, explicit or median cut — a fixed palette over
 *    the colour cap reduced to the cap), the reserved palette-cycle ramps kept ≥ 3/255 away,
 *    ordered dither only where the bible allows;
 * 5. outline pass;
 * 6. lay the frames out as a strip and merge the hand-edit layer `<name>.edit.png`;
 * 7. write `<name>.png` (deterministic bytes), `<name>.json` (an Aseprite-format frame
 *    sidecar with the tags and the anchor pivot) and `<name>.art.json` (provenance).
 *
 * Nothing here reads the clock except the record's date, and only when nothing else in the
 * record changed is the old date kept — so a re-run of an unchanged recipe rewrites
 * byte-identical files. The record names committed files only (an edit's inputs in the
 * git-ignored candidates folder are mapped to their copies under `art-prompts/v2/winners/`), and
 * every source and input names its model, so a fresh clone gives the same record.
 *
 * @module
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';
import { decodeImage, encodePng } from './codec.mjs';
import { mergeEdit, outlineFrame, stripOf } from './finish.mjs';
import { cropImage, hexOf, lumaOf, parseHex } from './image.mjs';
import { keyRegion } from './key.mjs';
import {
  CANDIDATES_DIR,
  PROVENANCE_SCHEMA,
  REFERENCE_DEPTH,
  SAFE_PATH_RULE,
  TOOL_NAME,
  WINNERS_DIR,
  isSafeRelativePath,
  isUnversioned,
  sha256Hex,
  textSha256,
} from './provenance.mjs';
import {
  clearReserved,
  histogram,
  mapToPalette,
  medianCut,
  pushClear,
  reducePalette,
} from './quantise.mjs';
import { parseRecipe } from './recipe.mjs';
import { colourCount, lightingWarnings, looksUpscaled, lumaStats, nearMisses } from './report.mjs';
import { downscale } from './scale.mjs';

/** @typedef {import('./image.mjs').Image} Image */
/** @typedef {import('./recipe.mjs').Recipe} Recipe */
/** @typedef {import('./provenance.mjs').ModelEntry} ModelEntry */

/** The tool version recorded in every `.art.json` and sidecar. */
export const TOOL_VERSION = '1.0.0';

/** The named-palette file schema (`<palettes>/<name>.json`). */
export const PALETTE_SCHEMA = 'shmup-palette@1';

/**
 * Options of one ingest run.
 *
 * @typedef {object} IngestOptions
 * @property {string} root - Source paths are relative to it, and recorded paths are too.
 * @property {string | null} outDir - Write `<outDir>/<name>.*`; `null` = next to the recipe.
 * @property {string} palettesDir - Where named palettes live.
 * @property {Record<string, ModelEntry>} models - The model table.
 * @property {string | null} date - Force this record date (`YYYY-MM-DD`).
 * @property {string} today - Today's date, used when the record changed.
 */

/**
 * What one recipe produced.
 *
 * @typedef {object} IngestResult
 * @property {string} recipeFile - The recipe path.
 * @property {string | null} name - Its sprite name, when it parsed.
 * @property {string[]} errors - Problems that stopped it.
 * @property {string[]} warnings - Things to look at.
 * @property {{ png: { path: string, bytes: Buffer }, sidecar: { path: string, text: string },
 *   record: { path: string, text: string } } | null} files - The outputs (`null` on error).
 * @property {Record<string, unknown>} report - Measurements for the report.
 */

/**
 * A path relative to the root, with `/` separators.
 *
 * @param {string} root - Root.
 * @param {string} file - Path.
 * @returns {string} Relative path.
 */
const rel = (root, file) => relative(root, file).split(sep).join('/');

/** Stage ramps, cached per root. @type {Map<string, Map<string, { layer: string, colors: number[] }[]>>} */
const STAGE_CACHE = new Map();

/**
 * The palette-cycle ramps of every shipped stage (`<root>/content/stages/*.stage.json`,
 * `cycles[].colors`; `example.*` skipped) — reserved project-wide (bible §4.4).
 *
 * @param {string} root - Repository (or fixture) root.
 * @returns {Map<string, { layer: string, colors: number[] }[]>} Ramps by stage id.
 */
export function loadStageRamps(root) {
  const cached = STAGE_CACHE.get(root);
  if (cached !== undefined) return cached;
  /** @type {Map<string, { layer: string, colors: number[] }[]>} */
  const out = new Map();
  const dir = join(root, 'content', 'stages');
  if (existsSync(dir)) {
    for (const file of readdirSync(dir).sort()) {
      if (!file.endsWith('.stage.json') || file.startsWith('example.')) continue;
      let json;
      try {
        json = JSON.parse(readFileSync(join(dir, file), 'utf8'));
      } catch {
        continue; // `pnpm content:check` reports broken stages; ingest only reads ramps
      }
      const cycles = Array.isArray(json?.cycles) ? json.cycles : [];
      /** @type {{ layer: string, colors: number[] }[]} */
      const ramps = [];
      for (const cycle of cycles) {
        const colors = Array.isArray(cycle?.colors)
          ? cycle.colors.map(parseHex).filter((c) => c !== null)
          : [];
        if (colors.length > 0) ramps.push({ layer: String(cycle.layer ?? ''), colors });
      }
      out.set(file.slice(0, -'.stage.json'.length), ramps);
    }
  }
  STAGE_CACHE.set(root, out);
  return out;
}

/**
 * Reads a named palette.
 *
 * @param {string} dir - Palettes directory.
 * @param {string} name - Palette name.
 * @returns {{ colors: number[], outline: number | null }} The palette.
 * @throws {Error} When the file is missing or malformed.
 */
export function loadPalette(dir, name) {
  const file = join(dir, `${name}.json`);
  if (!existsSync(file)) throw new Error(`palette "${name}" not found (${file})`);
  const json = JSON.parse(readFileSync(file, 'utf8'));
  if (json?.schema !== PALETTE_SCHEMA || !Array.isArray(json.colors) || json.colors.length === 0) {
    throw new Error(`${file}: not a ${PALETTE_SCHEMA} palette with a "colors" list`);
  }
  const colors = json.colors.map(parseHex);
  if (colors.some((c) => c === null)) throw new Error(`${file}: every colour is "#rrggbb"`);
  const outline = json.outline === undefined ? null : parseHex(json.outline);
  if (json.outline !== undefined && outline === null)
    throw new Error(`${file}: "outline" is "#rrggbb"`);
  return { colors: [...new Set(/** @type {number[]} */ (colors))], outline };
}

/**
 * The frame boxes of one source.
 *
 * @param {import('./recipe.mjs').Slicing} slicing - How to cut it.
 * @param {number} width - Image width.
 * @param {number} height - Image height.
 * @returns {[number, number, number, number][]} Boxes `[x, y, w, h]`.
 * @throws {RangeError} When a box leaves the image.
 */
function boxesOf(slicing, width, height) {
  /** @type {[number, number, number, number][]} */
  let boxes;
  if (slicing.kind === 'whole') boxes = [[0, 0, width, height]];
  else if (slicing.kind === 'boxes') boxes = slicing.boxes;
  else {
    boxes = [];
    for (let k = 0; k < slicing.count; k++) {
      const col = k % slicing.columns;
      const row = (k - col) / slicing.columns;
      boxes.push([
        slicing.x + col * (slicing.cellWidth + slicing.gapX),
        slicing.y + row * (slicing.cellHeight + slicing.gapY),
        slicing.cellWidth,
        slicing.cellHeight,
      ]);
    }
  }
  for (const [x, y, w, h] of boxes) {
    if (x + w > width || y + h > height) {
      throw new RangeError(`the box ${x},${y} ${w}×${h} leaves the ${width}×${height} image`);
    }
  }
  return boxes;
}

/**
 * Reads a candidate sidecar of `art-prompts/v2/gen-candidate.mjs` (its prompt, model, seed).
 *
 * @param {string} file - The sidecar path.
 * @returns {{ json: Record<string, unknown>, bytes: Buffer }} The parsed object and its bytes.
 * @throws {Error} When it cannot be read or is not a JSON object.
 */
function readCandidateSidecar(file) {
  const bytes = readFileSync(file);
  const json = JSON.parse(bytes.toString('utf8'));
  if (json === null || typeof json !== 'object' || Array.isArray(json))
    throw new Error('not a JSON object');
  return { json, bytes };
}

/**
 * The library file and entry of a candidate's `source` (`images/<dir>/<file>.json#<id>`).
 *
 * @param {unknown} source - The sidecar's `source`.
 * @returns {{ file: string | null, entry: string | null }} Library file (repo-relative) and id.
 */
function librarySource(source) {
  const m = typeof source === 'string' ? /^(images\/[^#]+\.json)#(.+)$/.exec(source) : null;
  return m === null ? { file: null, entry: null } : { file: `art-prompts/${m[1]}`, entry: m[2] };
}

/**
 * The record with its ingest date removed, as text (what `--check` and the date rule compare).
 *
 * @param {Record<string, unknown>} record - A record.
 * @returns {string} Canonical JSON without `ingestedAt`.
 */
export const recordWithoutDate = (record) => JSON.stringify({ ...record, ingestedAt: null });

/**
 * A string field of a candidate sidecar, or `null`.
 *
 * @param {Record<string, unknown> | null} candidate - The sidecar.
 * @param {string} key - Field.
 * @returns {string | null} The value when it is a string.
 */
const textOf = (candidate, key) =>
  candidate !== null && typeof candidate[key] === 'string'
    ? /** @type {string} */ (candidate[key])
    : null;

/**
 * The path of an image's default candidate sidecar: the same path with `.json`.
 *
 * @param {string} image - Root-relative image path.
 * @returns {string} Root-relative sidecar path.
 */
const sidecarPathOf = (image) => `${image.slice(0, image.length - extname(image).length)}.json`;

/**
 * The committed copy of a candidate (`art-prompts/v2/candidates/<slot>/<id>.<ext>`, which
 * git ignores) under `art-prompts/v2/winners/`, where round 2 commits the winners
 * (`docs/dev/art-generation-server.md`, "Round 2"): `<id>/winner.<ext>` when `<id>` is an item,
 * else `<item>/<suffix>.<ext>` for a followup or comment edit `<item>/<suffix>`.
 *
 * @param {string} root - Root.
 * @param {string} path - Root-relative path under {@link CANDIDATES_DIR}.
 * @returns {string | null} The root-relative path of the copy that exists, or `null` (none, or
 *   an archived candidate under `history/`).
 */
export function committedCopyOf(root, path) {
  if (!path.startsWith(CANDIDATES_DIR)) return null;
  const rest = path.slice(CANDIDATES_DIR.length);
  const slash = rest.indexOf('/');
  const ext = extname(rest);
  if (slash <= 0 || ext === '' || rest.slice(0, slash) === 'history') return null;
  const id = rest.slice(slash + 1, rest.length - ext.length);
  if (id === '') return null;
  const tries = [`${WINNERS_DIR}${id}/winner${ext}`];
  const cut = id.lastIndexOf('/');
  if (cut > 0) tries.push(`${WINNERS_DIR}${id.slice(0, cut)}/${id.slice(cut + 1)}${ext}`);
  return tries.find((p) => existsSync(join(root, ...p.split('/')))) ?? null;
}

/**
 * The `editFrom` list of a candidate sidecar (the input images of an edit, repository-relative
 * as `gen-candidate.mjs` writes them), each a plain path inside the root.
 *
 * @param {Record<string, unknown> | null} sidecar - The sidecar.
 * @param {string} at - Label for errors.
 * @param {string[]} errors - Error sink.
 * @returns {string[]} The paths (the bad ones reported and left out).
 */
function editFromOf(sidecar, at, errors) {
  const list = sidecar === null ? undefined : sidecar.editFrom;
  if (list === undefined) return [];
  if (!Array.isArray(list)) {
    errors.push(`${at}: the candidate sidecar's "editFrom" is not a list of paths`);
    return [];
  }
  /** @type {string[]} */
  const out = [];
  list.forEach((p, k) => {
    if (isSafeRelativePath(p)) out.push(p);
    else errors.push(`${at}: editFrom[${k}] ${JSON.stringify(p)} ${SAFE_PATH_RULE}`);
  });
  return out;
}

/**
 * An input image of an edit as named by `editFrom`, mapped to the file the record will name:
 * the path itself, or for a candidate its committed copy ({@link committedCopyOf}) — never a
 * file a fresh clone does not have.
 *
 * @param {IngestOptions} options - Run options.
 * @param {string} path - The `editFrom` entry.
 * @param {string} at - Label for errors.
 * @param {boolean} top - Whether the recipe could name it instead (a source's own inputs).
 * @param {string[]} errors - Error sink.
 * @returns {{ image: string, from: string } | null} The spec, or `null` (reported).
 */
function inputOf(options, path, at, top, errors) {
  if (!isUnversioned(path)) return { image: path, from: path };
  const copy = committedCopyOf(options.root, path);
  if (copy !== null) return { image: copy, from: path };
  errors.push(
    `${at}: the edit's input image ${path} is in the unversioned candidates folder and has no committed copy (${WINNERS_DIR}<id>/winner.png, or <id>/<followup>.png) — commit the winners first${top ? ', or name the committed copies in provenance.reference' : ''}`,
  );
  return null;
}

/**
 * The served model a sidecar names, checked against the model table: a served id other than
 * the table's means the licence row may not apply (`gen-candidate.mjs --any-model`).
 *
 * @param {Record<string, unknown> | null} sidecar - The candidate sidecar.
 * @param {string} key - The model group key.
 * @param {ModelEntry | undefined} entry - Its `models.json` row.
 * @param {string} at - Label for warnings.
 * @param {string[]} warnings - Warning sink.
 * @returns {string} The served model id.
 */
function servedModelOf(sidecar, key, entry, at, warnings) {
  if (entry === undefined) {
    warnings.push(
      `${at}: model "${key}" is not in models.json — add its row (art-provenance.md §2) before its art ships`,
    );
  }
  const served = textOf(sidecar, 'servedModel');
  if (served !== null && entry !== undefined && served !== entry.id) {
    warnings.push(
      `${at}: the sidecar says ${served} served the image, models.json has ${entry.id} for "${key}" — check that its licence row applies`,
    );
  }
  return served ?? entry?.id ?? key;
}

/**
 * Milliseconds of an ISO time, or `null`.
 *
 * @param {string | null} text - A `generatedAt`.
 * @returns {number | null} Its time, when it parses.
 */
const timeOf = (text) => {
  const t = text === null ? NaN : Date.parse(text);
  return Number.isNaN(t) ? null : t;
};

/**
 * Where a reference is resolved.
 *
 * @typedef {object} ReferenceContext
 * @property {string} at - Label for errors (`sources[0].reference[1]`).
 * @property {string | null} editedAt - The `generatedAt` of the edit the input went into.
 * @property {ReadonlySet<string>} seen - The images above it (a loop guard).
 * @property {number} depth - 1 for a source's own inputs.
 * @property {string[]} errors - Error sink.
 * @property {string[]} warnings - Warning sink.
 */

/**
 * One input image of an edit, as the record states it: its path (a committed file), the
 * `editFrom` entry it stands for, its hash, its candidate sidecar and, from that, the model
 * that made it — and, recursively, that image's own inputs. An edit of a FLUX image inherits
 * FLUX's licence question whatever model edits it (art-provenance.md §5, §8), so a missing
 * image, a missing sidecar or an unknown model is an error, never a `null`.
 *
 * @param {IngestOptions} options - Run options (root, model table).
 * @param {import('./recipe.mjs').ReferenceSpec & { from: string | null }} spec - The image.
 * @param {ReferenceContext} ctx - Where it is resolved.
 * @returns {Record<string, unknown> | null} The reference, or `null` (reported in `ctx.errors`).
 */
function referenceOf(options, spec, ctx) {
  const { at, errors, warnings } = ctx;
  const top = ctx.depth === 1;
  if (ctx.depth > REFERENCE_DEPTH) {
    errors.push(`${at}: edits nest deeper than ${REFERENCE_DEPTH} — an editFrom loop?`);
    return null;
  }
  if (ctx.seen.has(spec.image)) {
    errors.push(`${at}: ${spec.image} is an input of itself (an editFrom loop)`);
    return null;
  }
  const file = join(options.root, ...spec.image.split('/'));
  if (!existsSync(file)) {
    errors.push(
      `${at}: the edit's input image ${spec.image} does not exist — commit it${top ? ', or name its committed copy in provenance.reference' : ''}`,
    );
    return null;
  }
  const bytes = readFileSync(file);
  /** @type {Record<string, unknown> | null} */
  let sidecar = null;
  /** @type {Buffer | null} */
  let sidecarBytes = null;
  /** @type {string | null} */
  let sidecarPath = null;
  if (spec.sidecar !== false) {
    const named = typeof spec.sidecar === 'string';
    const path = named ? /** @type {string} */ (spec.sidecar) : sidecarPathOf(spec.image);
    const sidecarFile = join(options.root, ...path.split('/'));
    if (existsSync(sidecarFile)) {
      try {
        ({ json: sidecar, bytes: sidecarBytes } = readCandidateSidecar(sidecarFile));
        sidecarPath = path;
      } catch (error) {
        errors.push(`${at}: the sidecar ${path} of ${spec.image}: ${/** @type {Error} */ (error).message}`);
        return null;
      }
    } else if (named || spec.model === undefined) {
      errors.push(
        `${at}: the edit's input image ${spec.image} has no sidecar ${path}, so the model that made it is unknown — commit its sidecar${top ? ', or name the image in provenance.reference with "sidecar": false and its "model"' : ''}`,
      );
      return null;
    }
  }
  const sidecarModel = textOf(sidecar, 'model');
  if (spec.model !== undefined && sidecarModel !== null && spec.model !== sidecarModel) {
    errors.push(
      `${at}: provenance.reference names model "${spec.model}" for ${spec.image}, its sidecar ${sidecarPath} says "${sidecarModel}"`,
    );
    return null;
  }
  const key = spec.model ?? sidecarModel;
  if (key === null) {
    errors.push(
      `${at}: the sidecar ${sidecarPath} of ${spec.image} names no model — the model that made it is unknown${top ? ' (name it in provenance.reference: "model")' : ''}`,
    );
    return null;
  }
  const copyOf = textOf(sidecar, 'file');
  if (spec.from !== null && spec.from !== spec.image && copyOf !== null && copyOf !== spec.from) {
    errors.push(
      `${at}: ${spec.image} is not the image the edit was made from — its sidecar says it is ${copyOf}, the edit names ${spec.from}`,
    );
    return null;
  }
  const generatedAt = textOf(sidecar, 'generatedAt');
  const madeAt = timeOf(generatedAt);
  const editedAt = timeOf(ctx.editedAt);
  if (madeAt !== null && editedAt !== null && madeAt > editedAt) {
    errors.push(
      `${at}: ${spec.image} was generated at ${generatedAt}, after the edit (${ctx.editedAt}) — it is not the image the edit was made from`,
    );
    return null;
  }
  const handMade = key === 'none';
  const entry = handMade ? undefined : options.models[key];
  const model = handMade ? null : servedModelOf(sidecar, key, entry, at, warnings);
  const seen = new Set(ctx.seen).add(spec.image);
  /** @type {Record<string, unknown>[]} */
  const reference = [];
  editFromOf(sidecar, at, errors).forEach((path, k) => {
    const label = `${at}.reference[${k}]`;
    const input = inputOf(options, path, label, false, errors);
    if (input === null) return;
    const nested = referenceOf(options, input, {
      ...ctx,
      at: label,
      editedAt: generatedAt,
      seen,
      depth: ctx.depth + 1,
    });
    if (nested !== null) reference.push(nested);
  });
  return {
    path: spec.image,
    from: spec.from,
    sha256: sha256Hex(bytes),
    sidecar: sidecarPath,
    sidecarSha256: sidecarBytes === null ? null : textSha256(sidecarBytes),
    model,
    modelKey: handMade ? null : key,
    weights: entry?.weights ?? null,
    licence: entry?.licence ?? null,
    reference,
  };
}

/**
 * Whether a source or reference list names a model anywhere (an edit's inputs included).
 *
 * @param {readonly Record<string, unknown>[]} list - Sources or references.
 * @returns {boolean} `true` when one does.
 */
const modelled = (list) =>
  list.some(
    (r) =>
      r.model !== null ||
      (Array.isArray(r.reference) &&
        modelled(/** @type {Record<string, unknown>[]} */ (r.reference))),
  );

/**
 * A number field of a candidate sidecar, or `null`.
 *
 * @param {Record<string, unknown> | null} candidate - The sidecar.
 * @param {string} key - Field.
 * @returns {number | null} The value when it is a finite number.
 */
const numberOf = (candidate, key) =>
  candidate !== null && typeof candidate[key] === 'number' && Number.isFinite(candidate[key])
    ? /** @type {number} */ (candidate[key])
    : null;

/**
 * Ingests one recipe (nothing is written: the caller writes `files`).
 *
 * @param {string} recipeFile - Path of `<name>.recipe.json`.
 * @param {IngestOptions} options - Run options.
 * @returns {IngestResult} The outputs, or the errors.
 *
 * @example
 * const result = ingestRecipe('assets/source/sprites/enemies/gyre.recipe.json', options);
 * if (result.files) writeFileSync(result.files.png.path, result.files.png.bytes);
 */
export function ingestRecipe(recipeFile, options) {
  /** @type {IngestResult} */
  const result = { recipeFile, name: null, errors: [], warnings: [], files: null, report: {} };
  const { errors, warnings } = result;
  let recipeBytes;
  let json;
  try {
    recipeBytes = readFileSync(recipeFile);
    json = JSON.parse(recipeBytes.toString('utf8'));
  } catch (error) {
    errors.push(`cannot read the recipe: ${/** @type {Error} */ (error).message}`);
    return result;
  }
  const parsed = parseRecipe(json);
  for (const issue of parsed.issues) {
    (issue.level === 'error' ? errors : warnings).push(
      `${issue.path === '' ? '(root)' : issue.path}: ${issue.message}`,
    );
  }
  const recipe = parsed.recipe;
  if (recipe === null) return result;
  result.name = recipe.name;

  const posix = recipeFile.split(sep).join('/');
  const expected = `${recipe.name}.recipe.json`;
  if (posix !== expected && !posix.endsWith(`/${expected}`)) {
    errors.push(
      `name: "${recipe.name}" does not match the recipe's location (it must be …/${expected})`,
    );
    return result;
  }
  const base = recipeFile.slice(0, -'.recipe.json'.length);
  const outBase = options.outDir === null ? base : join(options.outDir, ...recipe.name.split('/'));
  const editFile = `${base}.edit.png`;
  const leaf = recipe.name.split('/').pop();

  // ---- reserved ramps ---------------------------------------------------------------------
  const stages = loadStageRamps(options.root);
  /** @type {Set<number>} */
  const reservedSet = new Set(recipe.reserved);
  for (const ramps of stages.values())
    for (const r of ramps) for (const c of r.colors) reservedSet.add(c);
  /** @type {Set<number>} */
  const allowed = new Set();
  for (const cycle of recipe.cycles) {
    if ('colors' in cycle) {
      for (const c of cycle.colors) allowed.add(c);
      continue;
    }
    const ramps = stages.get(cycle.stage);
    const picked =
      ramps === undefined
        ? []
        : ramps.filter((r) => cycle.layer === null || r.layer === cycle.layer);
    if (picked.length === 0) {
      errors.push(
        `cycles: stage "${cycle.stage}"${cycle.layer === null ? '' : ` layer "${cycle.layer}"`} has no palette-cycle ramp in content/stages/`,
      );
    }
    for (const r of picked) for (const c of r.colors) allowed.add(c);
  }
  for (const c of allowed) reservedSet.add(c);
  const reserved = [...reservedSet].sort((a, b) => a - b);

  // ---- sources -> frames ------------------------------------------------------------------
  /** @type {Record<string, unknown>[]} */
  const sourceRecords = [];
  /** @type {Image[]} */
  const frames = [];
  /** @type {string[]} */
  const keys = [];
  /** @type {number[]} */
  const factors = [];
  recipe.sources.forEach((source, s) => {
    const at = `sources[${s}]`;
    const file = join(options.root, ...source.image.split('/'));
    let bytes;
    let decoded;
    try {
      bytes = readFileSync(file);
      decoded = decodeImage(bytes);
    } catch (error) {
      errors.push(`${at}.image: ${source.image}: ${/** @type {Error} */ (error).message}`);
      return;
    }
    const hints = { ...recipe.provenance, ...source.provenance };
    const defaultSidecar = sidecarPathOf(source.image);
    /** @type {Record<string, unknown> | null} */
    let candidate = null;
    /** @type {Buffer | null} */
    let candidateBytes = null;
    /** @type {string | null} */
    let candidatePath = null;
    if (hints.sidecar !== false) {
      const path = typeof hints.sidecar === 'string' ? hints.sidecar : defaultSidecar;
      const sidecarFile = join(options.root, ...path.split('/'));
      if (existsSync(sidecarFile)) {
        try {
          ({ json: candidate, bytes: candidateBytes } = readCandidateSidecar(sidecarFile));
          candidatePath = path;
        } catch (error) {
          errors.push(`${at}: candidate sidecar ${path}: ${/** @type {Error} */ (error).message}`);
          return;
        }
      } else if (typeof hints.sidecar === 'string') {
        errors.push(`${at}.provenance.sidecar: ${hints.sidecar} does not exist`);
        return;
      }
    }
    // The model is a fact the provenance stands on: never guessed, never "hand" by default.
    const sidecarModel = textOf(candidate, 'model');
    if (hints.model !== undefined && sidecarModel !== null && hints.model !== sidecarModel) {
      errors.push(
        `${at}.provenance.model: "${hints.model}" contradicts the candidate sidecar ${candidatePath}, which says "${sidecarModel}" made ${source.image}`,
      );
      return;
    }
    const key = hints.model ?? sidecarModel;
    if (key === null) {
      errors.push(
        `${at}: no model is known for ${source.image} — commit its candidate sidecar (${defaultSidecar}, or name it in provenance.sidecar), give provenance.model, or say provenance.model: "none" for hand-made art`,
      );
      return;
    }
    const handMade = key === 'none';
    const entry = handMade ? undefined : options.models[key];
    const model = handMade ? null : servedModelOf(candidate, key, entry, at, warnings);
    const library = librarySource(candidate?.source);
    if (library.file !== null && !isSafeRelativePath(library.file)) {
      errors.push(`${at}: the candidate sidecar's source ${library.file} ${SAFE_PATH_RULE}`);
      return;
    }
    const promptFile = hints.prompt?.file ?? library.file;
    const promptEntry = hints.prompt?.entry ?? library.entry;
    const promptText = textOf(candidate, 'prompt');
    const negative = textOf(candidate, 'negative');
    const width = numberOf(candidate, 'width');
    const height = numberOf(candidate, 'height');
    // The edit's input images: the sidecar's editFrom mapped to committed copies, or the
    // committed images the recipe names instead (one per editFrom entry, in order).
    const failed = errors.length;
    const editFrom = editFromOf(candidate, at, errors);
    /** @type {(import('./recipe.mjs').ReferenceSpec & { from: string | null })[]} */
    const inputs = [];
    if (hints.reference !== undefined) {
      if (editFrom.length > 0 && hints.reference.length !== editFrom.length) {
        errors.push(
          `${at}.provenance.reference: names ${hints.reference.length} image(s), the edit was made from ${editFrom.length} (${editFrom.join(', ')})`,
        );
        return;
      }
      hints.reference.forEach((r, k) => inputs.push({ ...r, from: editFrom[k] ?? null }));
    } else {
      editFrom.forEach((path, k) => {
        const input = inputOf(options, path, `${at}.reference[${k}]`, true, errors);
        if (input !== null) inputs.push(input);
      });
    }
    /** @type {Record<string, unknown>[]} */
    const reference = [];
    const seen = new Set([source.image]);
    inputs.forEach((input, k) => {
      const r = referenceOf(options, input, {
        at: `${at}.reference[${k}]`,
        editedAt: textOf(candidate, 'generatedAt'),
        seen,
        depth: 1,
        errors,
        warnings,
      });
      if (r !== null) reference.push(r);
    });
    if (errors.length > failed) return;
    sourceRecords.push({
      path: source.image,
      sha256: sha256Hex(bytes),
      format: decoded.format,
      width: decoded.image.width,
      height: decoded.image.height,
      model,
      modelKey: handMade ? null : key,
      weights: entry?.weights ?? null,
      licence: entry?.licence ?? null,
      prompt:
        promptFile === null && promptEntry === null && promptText === null
          ? null
          : { file: promptFile, entry: promptEntry, text: promptText, negative },
      seed:
        hints.seed !== undefined
          ? hints.seed
          : Number.isInteger(candidate?.seed)
            ? /** @type {number} */ (candidate?.seed)
            : null,
      size:
        textOf(candidate, 'outputSize') ??
        (width !== null && height !== null ? `${width}x${height}` : null),
      steps: numberOf(candidate, 'steps'),
      guidance: numberOf(candidate, 'guidance'),
      generatedAt: textOf(candidate, 'generatedAt'),
      reference,
      generator:
        candidate === null || candidatePath === null || candidateBytes === null
          ? null
          : {
              sidecar: candidatePath,
              sidecarSha256: textSha256(candidateBytes),
              id: textOf(candidate, 'id'),
              slot: textOf(candidate, 'slot'),
              mode: textOf(candidate, 'mode'),
              instruction: textOf(candidate, 'instruction'),
            },
    });
    if (decoded.format === 'jpeg') {
      warnings.push(
        `${at}: ${source.image} is a JPEG — its artefacts blur edges; prefer the PNG output (bible §8)`,
      );
    }
    let boxes;
    try {
      boxes = boxesOf(source.slicing, decoded.image.width, decoded.image.height);
    } catch (error) {
      errors.push(`${at}: ${/** @type {Error} */ (error).message}`);
      return;
    }
    for (const box of boxes) {
      const f = frames.length;
      try {
        const keyed = keyRegion(cropImage(decoded.image, ...box), recipe.key);
        for (const w of keyed.warnings) warnings.push(`frame ${f}: ${w}`);
        if (keyed.key !== null) keys.push(hexOf(keyed.key));
        const scaled = downscale(
          keyed.image,
          recipe.frame.width,
          recipe.frame.height,
          recipe.scale,
        );
        factors.push(Math.round(Math.max(scaled.factorX, scaled.factorY) * 100) / 100);
        if (recipe.scale.fit === 'stretch') {
          const skew = scaled.factorX / scaled.factorY;
          if (skew > 1.02 || skew < 1 / 1.02) {
            warnings.push(
              `frame ${f}: the ${box[2]}×${box[3]} region stretches by ${scaled.factorX.toFixed(2)} × ${scaled.factorY.toFixed(2)} — match the frame's aspect or use "fit": "contain"`,
            );
          }
        }
        frames.push(scaled.image);
      } catch (error) {
        errors.push(`frame ${f}: ${/** @type {Error} */ (error).message}`);
        frames.push(cropImage(decoded.image, 0, 0, 1, 1)); // keeps the frame numbering
      }
    }
  });
  if (errors.length > 0) return result;
  if (recipe.frameCount !== null && frames.length !== recipe.frameCount) {
    errors.push(
      `frameCount: the sources give ${frames.length} frames, the recipe expects ${recipe.frameCount}`,
    );
  }
  for (const tag of recipe.animations) {
    if (tag.to >= frames.length)
      errors.push(
        `animations.${tag.name}: frame ${tag.to} does not exist (${frames.length} frames)`,
      );
  }
  if (errors.length > 0) return result;

  // ---- palette ----------------------------------------------------------------------------
  /** @type {number[] | null} */
  let fixed = recipe.palette.colors;
  let namedOutline = null;
  if (recipe.palette.name !== null) {
    try {
      const named = loadPalette(options.palettesDir, recipe.palette.name);
      fixed = named.colors;
      namedOutline = named.outline;
    } catch (error) {
      errors.push(`palette.name: ${/** @type {Error} */ (error).message}`);
      return result;
    }
  }
  const explicitOutline = recipe.outline.color ?? recipe.palette.outline ?? namedOutline;
  const outlineSlot = recipe.outline.enabled && explicitOutline !== null;
  /** @type {number[]} */
  let palette;
  /** @type {{ from: number, to: number } | null} */
  let reduced = null;
  if (fixed === null) {
    const slots = Math.max(1, recipe.palette.max - allowed.size - (outlineSlot ? 1 : 0));
    palette = medianCut(histogram(frames), slots);
  } else {
    // A named or explicit palette (a zone's 48–64 colours) is held to the sprite's cap too
    // (bible §4.3, §8 step 9): the subset the art needs most, the cycle ramps kept exact.
    const wanted = new Set(fixed);
    for (const c of allowed) wanted.add(c);
    if (outlineSlot) wanted.add(/** @type {number} */ (explicitOutline));
    if (wanted.size <= recipe.palette.max) palette = fixed.slice();
    else {
      const forced = [...allowed].sort((a, b) => a - b);
      let room = recipe.palette.max;
      if (outlineSlot && !allowed.has(/** @type {number} */ (explicitOutline))) {
        // The outline pass paints it whatever the mapping does: it takes a slot, and pixels
        // may map to it when the palette has it.
        if (fixed.includes(/** @type {number} */ (explicitOutline)))
          forced.push(/** @type {number} */ (explicitOutline));
        else room--;
      }
      palette = reducePalette(histogram(frames), fixed, forced, room);
      reduced = { from: wanted.size, to: palette.length + (room < recipe.palette.max ? 1 : 0) };
    }
  }
  for (const c of allowed) if (!palette.includes(c)) palette.push(c);
  const cleared = clearReserved(palette, reserved, allowed);
  for (const m of cleared.moves) warnings.push(`palette: ${m}`);
  for (const frame of frames) mapToPalette(frame, cleared.palette, recipe.dither);

  // ---- outline ----------------------------------------------------------------------------
  /** @type {number | null} */
  let outlineColour = null;
  if (recipe.outline.enabled) {
    let colour = explicitOutline;
    if (colour === null) {
      colour = cleared.palette[0];
      for (const c of cleared.palette) if (lumaOf(c) < lumaOf(colour)) colour = c;
    }
    const pushed = allowed.has(colour) ? colour : pushClear(colour, reserved);
    if (pushed !== null && pushed !== colour) {
      warnings.push(
        `outline: ${hexOf(colour)} → ${hexOf(pushed)} (too close to a reserved ramp colour)`,
      );
      colour = pushed;
    }
    if (colour === 0)
      warnings.push(
        'outline: #000000 — the outline is the darkest palette colour, never black (bible §3.4)',
      );
    else if (lumaOf(colour) > 45)
      warnings.push(
        `outline: ${hexOf(colour)} has luma ${Math.round(lumaOf(colour))}, over 45 (bible §3.4)`,
      );
    outlineColour = colour;
    for (const frame of frames) outlineFrame(frame, colour, recipe.outline.edges);
  }

  // ---- strip, hand-edit layer -------------------------------------------------------------
  const strip = stripOf(frames);
  const ingested = colourCount([strip]);
  /** @type {Record<string, unknown> | null} */
  let edit = null;
  if (existsSync(editFile)) {
    try {
      const editBytes = readFileSync(editFile);
      const layer = decodeImage(editBytes);
      if (layer.format !== 'png') throw new Error('the edit layer is a PNG');
      const merged = mergeEdit(strip, layer.image, recipe.erase);
      if (merged.partial > 0)
        warnings.push(
          `edit layer: ${merged.partial} half-transparent pixels ignored (paint with full alpha; erase with ${hexOf(recipe.erase)})`,
        );
      edit = {
        path: rel(options.root, editFile),
        sha256: sha256Hex(editBytes),
        painted: merged.painted,
        erased: merged.erased,
      };
    } catch (error) {
      errors.push(
        `edit layer ${rel(options.root, editFile)}: ${/** @type {Error} */ (error).message}`,
      );
      return result;
    }
  }

  // ---- checks and report ------------------------------------------------------------------
  const colours = colourCount([strip]);
  if (ingested > recipe.palette.max) {
    // Only possible when the recipe's cycle ramps and outline alone fill the cap.
    warnings.push(
      `colours: ${ingested} used, over the cap of ${recipe.palette.max} — the cycle ramps (${allowed.size} colours)${outlineSlot ? ' and the outline' : ''} leave no room for the art (bible §4.3)`,
    );
  } else if (colours > recipe.palette.max) {
    warnings.push(
      `colours: the hand-edit layer brings ${ingested} to ${colours}, over the cap of ${recipe.palette.max} (bible §4.3)`,
    );
  }
  const misses = nearMisses([strip], reserved, allowed);
  if (misses.pixels > 0) {
    warnings.push(
      `reserved ramps: ${misses.pixels} pixels within 3/255 of a palette-cycle colour (${misses.colours.join(', ')}) — bible §4.4`,
    );
  }
  /** @type {ReturnType<typeof lumaStats> | null} */
  let lighting = null;
  if (recipe.category === 'backdrop' && recipe.layer !== null) {
    lighting = lumaStats([strip]);
    warnings.push(...lightingWarnings(lighting, recipe.layer));
  }
  const mixels = looksUpscaled([strip]);
  if (mixels)
    warnings.push(
      'mixels: every run of equal pixels is even-length — this looks like a ×2 upscale (bible §3.1)',
    );
  result.report = {
    frames: frames.length,
    frameWidth: recipe.frame.width,
    frameHeight: recipe.frame.height,
    factor: factors.length === 0 ? null : Math.max(...factors),
    keys: [...new Set(keys)],
    colours,
    palette: cleared.palette.map(hexOf),
    paletteReduced: reduced,
    outline: outlineColour === null ? null : hexOf(outlineColour),
    lighting,
    nearMisses: misses.pixels,
    mixels,
    edit,
  };

  // ---- outputs ----------------------------------------------------------------------------
  const w = recipe.frame.width;
  const h = recipe.frame.height;
  const pngBytes = encodePng(strip);
  const pngName = `${leaf}.png`;
  const sidecar = {
    frames: frames.map((_, i) => ({
      filename: `${recipe.name} ${i}`,
      frame: { x: i * w, y: 0, w, h },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w, h },
      sourceSize: { w, h },
      duration: 100,
    })),
    meta: {
      app: TOOL_NAME,
      version: TOOL_VERSION,
      image: pngName,
      format: 'RGBA8888',
      size: { w: strip.width, h: strip.height },
      scale: '1',
      frameTags: recipe.animations.map((t) => ({
        name: t.name,
        from: t.from,
        to: t.to,
        direction: t.direction,
      })),
      slices:
        recipe.anchor === null
          ? []
          : [
              {
                name: 'anchor',
                color: '#0000ffff',
                keys: [
                  {
                    frame: 0,
                    bounds: { x: 0, y: 0, w, h },
                    pivot: { x: recipe.anchor[0], y: recipe.anchor[1] },
                  },
                ],
              },
            ],
      // The player-2 palette map rides to the asset pipeline in the sidecar (`scripts/assets/
      // sprite-source.mjs` reads `meta.shmup.p2`); a recipe without one changes no byte.
      ...(recipe.p2 === null ? {} : { shmup: { p2: recipe.p2 } }),
    },
  };
  const sidecarText = `${JSON.stringify(sidecar, null, 2)}\n`;

  // A hand-drawn source made from an AI image (a redraw) is AI-assisted: the reference counts.
  const origin = modelled(sourceRecords) ? 'ai-assisted' : 'hand';
  const changedByHand = edit !== null && (Number(edit.painted) > 0 || Number(edit.erased) > 0);
  const cleanup = recipe.provenance.cleanup ?? (changedByHand ? 'light' : 'none');
  if (cleanup === 'none' && changedByHand) {
    errors.push(
      'provenance.cleanup: "none", but the hand-edit layer changes pixels — say "light" or more',
    );
    return result;
  }
  const recipePath = rel(options.root, recipeFile);
  if (!isSafeRelativePath(recipePath)) {
    errors.push(
      `the recipe is outside the root ${options.root} (--root), so the record could not name it`,
    );
    return result;
  }
  /** @type {Record<string, unknown>} */
  const record = {
    schema: PROVENANCE_SCHEMA,
    sprite: recipe.name,
    origin,
    use: recipe.provenance.use ?? 'pixels',
    cleanup,
    handCleaned: cleanup !== 'none',
    reviewed: recipe.provenance.reviewed ?? null,
    ingestedAt: '',
    author: recipe.provenance.author ?? null,
    sources: sourceRecords,
    recipe: {
      path: recipePath,
      sha256: textSha256(/** @type {Buffer} */ (recipeBytes)),
    },
    edit,
    output: {
      png: pngName,
      sha256: sha256Hex(pngBytes),
      sidecar: `${leaf}.json`,
      sidecarSha256: textSha256(sidecarText),
      frames: frames.length,
      frameWidth: w,
      frameHeight: h,
      colors: colours,
      alpha: recipe.alpha,
    },
    tool: { name: TOOL_NAME, version: TOOL_VERSION },
    notes: recipe.provenance.notes ?? recipe.notes,
  };
  const recordFile = `${outBase}.art.json`;
  let date = options.date;
  if (date === null) {
    date = options.today;
    if (existsSync(recordFile)) {
      try {
        const old = JSON.parse(readFileSync(recordFile, 'utf8'));
        if (
          typeof old?.ingestedAt === 'string' &&
          recordWithoutDate(old) === recordWithoutDate(record)
        ) {
          date = old.ingestedAt;
        }
      } catch {
        // an unreadable old record is simply replaced
      }
    }
  }
  record.ingestedAt = date;
  result.files = {
    png: { path: `${outBase}.png`, bytes: pngBytes },
    sidecar: { path: `${outBase}.json`, text: sidecarText },
    record: { path: recordFile, text: `${JSON.stringify(record, null, 2)}\n` },
  };
  return result;
}

/**
 * Every `*.recipe.json` below a directory, sorted.
 *
 * @param {string} dir - Directory (missing = none).
 * @returns {string[]} Recipe paths.
 */
export function findRecipes(dir) {
  if (!existsSync(dir)) return [];
  /** @type {string[]} */
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  )) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findRecipes(full));
    else if (entry.name.endsWith('.recipe.json')) out.push(full);
  }
  return out;
}
