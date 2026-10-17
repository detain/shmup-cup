/**
 * One recipe from source images to the three output files (plan R3-02, art bible §8):
 *
 * 1. crop or slice every source into frame regions;
 * 2. key each region (border-sampled key, flood fill, holes, cleanup, despill — or a black
 *    key for translucent / additive FX);
 * 3. area-downscale it straight to the frame size, pixel-snap, binary alpha;
 * 4. quantise all frames to one palette (named, explicit or median cut), the reserved
 *    palette-cycle ramps kept ≥ 3/255 away, ordered dither only where the bible allows;
 * 5. outline pass;
 * 6. lay the frames out as a strip and merge the hand-edit layer `<name>.edit.png`;
 * 7. write `<name>.png` (deterministic bytes), `<name>.json` (an Aseprite-format frame
 *    sidecar with the tags and the anchor pivot) and `<name>.art.json` (provenance).
 *
 * Nothing here reads the clock except the record's date, and only when nothing else in the
 * record changed is the old date kept — so a re-run of an unchanged recipe rewrites
 * byte-identical files.
 *
 * @module
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';
import { decodeImage, encodePng } from './codec.mjs';
import { mergeEdit, outlineFrame, stripOf } from './finish.mjs';
import { cropImage, hexOf, lumaOf, parseHex } from './image.mjs';
import { keyRegion } from './key.mjs';
import { PROVENANCE_SCHEMA, TOOL_NAME, sha256Hex } from './provenance.mjs';
import { clearReserved, histogram, mapToPalette, medianCut, pushClear } from './quantise.mjs';
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
 * @returns {Record<string, unknown>} The parsed object.
 * @throws {Error} When it is not a JSON object.
 */
function readCandidateSidecar(file) {
  const json = JSON.parse(readFileSync(file, 'utf8'));
  if (json === null || typeof json !== 'object' || Array.isArray(json))
    throw new Error(`${file}: not a JSON object`);
  return json;
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
    /** @type {Record<string, unknown> | null} */
    let candidate = null;
    /** @type {string | null} */
    let candidateFile = null;
    if (hints.sidecar !== false) {
      const sidecarFile =
        typeof hints.sidecar === 'string'
          ? join(options.root, ...hints.sidecar.split('/'))
          : `${file.slice(0, file.length - extname(file).length)}.json`;
      if (existsSync(sidecarFile)) {
        try {
          candidate = readCandidateSidecar(sidecarFile);
          candidateFile = sidecarFile;
        } catch (error) {
          errors.push(
            `${at}: candidate sidecar ${rel(options.root, sidecarFile)}: ${/** @type {Error} */ (error).message}`,
          );
          return;
        }
      } else if (typeof hints.sidecar === 'string') {
        errors.push(`${at}.provenance.sidecar: ${hints.sidecar} does not exist`);
        return;
      }
    }
    const key = hints.model ?? textOf(candidate, 'model');
    const entry = key === null || key === 'none' ? undefined : options.models[key];
    if (key !== null && key !== 'none' && entry === undefined) {
      warnings.push(
        `${at}: model "${key}" is not in models.json — add its row (art-provenance.md §2) before its art ships`,
      );
    }
    const handMade = key === null || key === 'none';
    const library = librarySource(candidate?.source);
    const promptFile = hints.prompt?.file ?? library.file;
    const promptEntry = hints.prompt?.entry ?? library.entry;
    const promptText = textOf(candidate, 'prompt');
    const negative = textOf(candidate, 'negative');
    const width = numberOf(candidate, 'width');
    const height = numberOf(candidate, 'height');
    const editFrom = Array.isArray(candidate?.editFrom) ? candidate.editFrom : [];
    sourceRecords.push({
      path: source.image,
      sha256: sha256Hex(bytes),
      format: decoded.format,
      width: decoded.image.width,
      height: decoded.image.height,
      model: handMade ? null : (textOf(candidate, 'servedModel') ?? entry?.id ?? key),
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
      reference: editFrom
        .filter((r) => typeof r === 'string')
        .map((r) => {
          const refFile = join(options.root, .../** @type {string} */ (r).split('/'));
          return { path: r, sha256: existsSync(refFile) ? sha256Hex(readFileSync(refFile)) : null };
        }),
      generator:
        candidate === null || candidateFile === null
          ? null
          : {
              sidecar: rel(options.root, candidateFile),
              sidecarSha256: sha256Hex(readFileSync(candidateFile)),
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
  /** @type {number[]} */
  let palette;
  if (fixed === null) {
    const slots = Math.max(
      1,
      recipe.palette.max -
        allowed.size -
        (recipe.outline.enabled && explicitOutline !== null ? 1 : 0),
    );
    palette = medianCut(histogram(frames), slots);
  } else palette = fixed.slice();
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
  if (colours > recipe.palette.max)
    warnings.push(`colours: ${colours} used, over the cap of ${recipe.palette.max} (bible §4.3)`);
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
    },
  };
  const sidecarText = `${JSON.stringify(sidecar, null, 2)}\n`;

  const origin = sourceRecords.some((r) => r.model !== null) ? 'ai-assisted' : 'hand';
  const changedByHand = edit !== null && (Number(edit.painted) > 0 || Number(edit.erased) > 0);
  const cleanup = recipe.provenance.cleanup ?? (changedByHand ? 'light' : 'none');
  if (cleanup === 'none' && changedByHand) {
    errors.push(
      'provenance.cleanup: "none", but the hand-edit layer changes pixels — say "light" or more',
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
      path: rel(options.root, recipeFile),
      sha256: sha256Hex(/** @type {Buffer} */ (recipeBytes)),
    },
    edit,
    output: {
      png: pngName,
      sha256: sha256Hex(pngBytes),
      sidecar: `${leaf}.json`,
      sidecarSha256: sha256Hex(sidecarText),
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
