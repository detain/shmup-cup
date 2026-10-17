/**
 * Provenance records (`<name>.art.json`, schema `shmup-art-provenance@1`): the model table,
 * record validation, and the tree check that every override PNG can be traced (plan steps
 * R3-02 and R3-05).
 *
 * The record carries the fields `docs/dev/art-provenance.md` §5 asks of every shipped
 * AI-assisted asset — `origin`, `use`, `cleanup`, `reviewed`, `ingestedAt`, the recipe hash and,
 * **per source image** (a sprite may be cut from several), the served `model`, its `weights`,
 * its `licence` id, the prompt as sent, the generation settings, the source SHA-256 and the
 * `reference` images of an edit. The verdicts (ship / hold) are policy, not facts, and stay in
 * the model table (`models.json`), joined by licence id.
 *
 * **Dependency-free on purpose** (only `node:` built-ins): the repo's own Vitest suite
 * imports this module (`test/scripts/assets/provenance.test.ts`) — and so can R3-05's origin
 * report — without installing the tool's image codecs.
 *
 * The record format is documented in `docs/dev/real-assets.md`.
 *
 * @module
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The record schema id. */
export const PROVENANCE_SCHEMA = 'shmup-art-provenance@1';

/** The model table's schema id (`models.json`). */
export const MODELS_SCHEMA = 'shmup-ingest-models@1';

/** The tool's name as records state it. */
export const TOOL_NAME = 'shmup-ingest';

/**
 * Where an image came from (`art-provenance.md` §5). Procedural sprites have no PNG and so
 * no record; the origin report derives them from the pipeline.
 */
export const ORIGINS = Object.freeze(['ai-assisted', 'hand']);

/** How the pixels may be used (`art-provenance.md` §2's two columns). */
export const USES = Object.freeze(['pixels', 'reference']);

/**
 * How much hand work is in the sprite (`art-provenance.md` §5): `none` — ingest only (key,
 * downscale, quantise, outline); `light` — the hand-edit layer touches up edges and details;
 * `heavy` — most of the sprite repainted; `redrawn` — hand-drawn, the AI image only a reference.
 */
export const CLEANUPS = Object.freeze(['none', 'light', 'heavy', 'redrawn']);

/** The licence ids of `art-provenance.md` §2 (a new id needs a new row there first). */
export const LICENCE_IDS = Object.freeze([
  'flux-nc-2.1',
  'flux1-dev-nc-1.1.1',
  'stability-community-2024-07-05',
  'apache-2.0',
  'ltx-2.x-community-2026-08-11',
  'ltxv-open-weights-0.x',
]);

/** A model's verdict for one use: `ship`, or `hold` until an open question is answered. */
export const VERDICTS = Object.freeze(['ship', 'hold']);

/** Suffixes of the ingest tool's files (as `scripts/assets/sprite-source.mjs` ignores them). */
export const INGEST_SUFFIXES = Object.freeze(['.recipe.json', '.art.json', '.edit.png']);

/** Sprite names, as the asset pipeline defines them. */
const SPRITE_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/;

/** The default model table next to this tool. */
export const DEFAULT_MODELS_FILE = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'models.json',
);

/**
 * SHA-256 of some bytes.
 *
 * @param {Uint8Array | string} bytes - Input (a string is hashed as UTF-8).
 * @returns {string} Lower-case hex.
 */
export const sha256Hex = (bytes) => createHash('sha256').update(bytes).digest('hex');

/**
 * One model's entry in `models.json`.
 *
 * @typedef {object} ModelEntry
 * @property {string} id - The served Hugging Face repository id.
 * @property {'image' | 'video'} kind - What it makes.
 * @property {{ repo: string, revision: string | null, transformer: string | null }} weights -
 *   The weights served (a revision when known; a transformer override such as FLUX.2's FP8).
 * @property {string} licence - A {@link LICENCE_IDS} id.
 * @property {{ pixels: string, reference: string }} verdict - {@link VERDICTS} per use.
 * @property {string} conditions - What a `ship` verdict still requires, or why it is `hold`.
 */

/**
 * Reads and checks the model table.
 *
 * @param {string} [file] - Path (default: the tool's `models.json`).
 * @returns {Record<string, ModelEntry>} Entries by model group key.
 * @throws {Error} When the file is not a valid `shmup-ingest-models@1` table.
 */
export function loadModels(file = DEFAULT_MODELS_FILE) {
  const json = JSON.parse(readFileSync(file, 'utf8'));
  if (!isObject(json) || json.schema !== MODELS_SCHEMA || !isObject(json.models)) {
    throw new Error(`${file}: not a ${MODELS_SCHEMA} table`);
  }
  for (const [key, entry] of Object.entries(json.models)) {
    const ok =
      isObject(entry) &&
      typeof entry.id === 'string' &&
      isObject(entry.weights) &&
      LICENCE_IDS.includes(/** @type {string} */ (entry.licence)) &&
      isObject(entry.verdict) &&
      VERDICTS.includes(/** @type {string} */ (entry.verdict.pixels)) &&
      VERDICTS.includes(/** @type {string} */ (entry.verdict.reference));
    if (!ok)
      throw new Error(`${file}: model "${key}" needs id, weights, a known licence id and verdicts`);
  }
  return /** @type {Record<string, ModelEntry>} */ (json.models);
}

/**
 * Whether a value is a plain object.
 *
 * @param {unknown} v - Any value.
 * @returns {v is Record<string, unknown>} `true` for non-null, non-array objects.
 */
function isObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** SHA-256 hex digests. */
const HEX64 = /^[0-9a-f]{64}$/;

/** `YYYY-MM-DD`. */
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validates a provenance record.
 *
 * @param {unknown} record - The parsed `.art.json`.
 * @param {{ sprite?: string }} [expect] - The sprite its location implies.
 * @returns {string[]} Problems as `<json path>: <message>` (empty when valid).
 *
 * @example
 * validateRecord(JSON.parse(readFileSync('gyre.art.json', 'utf8')), { sprite: 'enemies/gyre' });
 */
export function validateRecord(record, expect = {}) {
  /** @type {string[]} */
  const out = [];
  /**
   * Records a problem.
   *
   * @param {string} path - JSON path.
   * @param {string} message - What is wrong.
   */
  const bad = (path, message) => out.push(`${path}: ${message}`);
  if (!isObject(record)) return ['(root): a record is a JSON object'];
  if (record.schema !== PROVENANCE_SCHEMA) bad('schema', `must be "${PROVENANCE_SCHEMA}"`);
  if (typeof record.sprite !== 'string' || !SPRITE_NAME_PATTERN.test(record.sprite)) {
    bad('sprite', 'must be a sprite name');
  } else if (expect.sprite !== undefined && record.sprite !== expect.sprite) {
    bad('sprite', `"${record.sprite}" does not match the file's location ("${expect.sprite}")`);
  }
  const origin = record.origin;
  if (!ORIGINS.includes(/** @type {string} */ (origin)))
    bad('origin', `must be one of ${ORIGINS.join(', ')}`);
  if (!USES.includes(/** @type {string} */ (record.use)))
    bad('use', `must be one of ${USES.join(', ')}`);
  if (!CLEANUPS.includes(/** @type {string} */ (record.cleanup))) {
    bad('cleanup', `must be one of ${CLEANUPS.join(', ')}`);
  }
  if (typeof record.handCleaned !== 'boolean') bad('handCleaned', 'must be a boolean');
  else if (
    CLEANUPS.includes(/** @type {string} */ (record.cleanup)) &&
    record.handCleaned !== (record.cleanup !== 'none')
  ) {
    bad('handCleaned', 'is true exactly when cleanup is not "none"');
  }
  if (record.reviewed !== null) {
    const r = record.reviewed;
    if (
      !isObject(r) ||
      typeof r.on !== 'string' ||
      !DAY.test(r.on) ||
      typeof r.by !== 'string' ||
      r.by === ''
    ) {
      bad('reviewed', 'must be null or { "on": "YYYY-MM-DD", "by": "<who>" }');
    }
  }
  if (typeof record.ingestedAt !== 'string' || !DAY.test(record.ingestedAt))
    bad('ingestedAt', 'must be YYYY-MM-DD');
  if (record.author !== undefined && record.author !== null && typeof record.author !== 'string') {
    bad('author', 'must be a string or null');
  }
  const tool = record.tool;
  const byTool = isObject(tool);
  if (
    tool !== undefined &&
    tool !== null &&
    !(byTool && tool.name === TOOL_NAME && typeof tool.version === 'string')
  ) {
    bad('tool', `must be null or { "name": "${TOOL_NAME}", "version" }`);
  }

  if (!Array.isArray(record.sources)) bad('sources', 'must be an array');
  else {
    let modelled = 0;
    record.sources.forEach((s, i) => {
      const at = `sources[${i}]`;
      if (!isObject(s)) {
        bad(at, 'must be an object');
        return;
      }
      if (typeof s.path !== 'string' || s.path === '') bad(`${at}.path`, 'must be a path');
      if (typeof s.sha256 !== 'string' || !HEX64.test(s.sha256))
        bad(`${at}.sha256`, 'must be a SHA-256 hex digest');
      if (s.format !== 'png' && s.format !== 'jpeg') bad(`${at}.format`, 'must be "png" or "jpeg"');
      if (!Number.isInteger(s.width) || !Number.isInteger(s.height))
        bad(`${at}.width`, 'width and height must be integers');
      if (s.model !== null && (typeof s.model !== 'string' || s.model === '')) {
        bad(`${at}.model`, 'must be the served model id, or null for a hand-made source');
      }
      if (typeof s.model === 'string') {
        modelled++;
        if (s.licence !== null && !LICENCE_IDS.includes(/** @type {string} */ (s.licence))) {
          bad(
            `${at}.licence`,
            `must be one of ${LICENCE_IDS.join(', ')} (or null: not in models.json yet)`,
          );
        }
      } else if (s.licence !== null && s.licence !== undefined) {
        bad(`${at}.licence`, 'a hand-made source has no model licence');
      }
      if (s.weights !== null && s.weights !== undefined && !isObject(s.weights))
        bad(`${at}.weights`, 'must be null or an object');
      if (s.seed !== null && !Number.isInteger(s.seed))
        bad(`${at}.seed`, 'must be an integer or null');
      if (s.prompt !== null && !isObject(s.prompt))
        bad(`${at}.prompt`, 'must be null or { "file", "entry", "text", "negative" }');
      if (!Array.isArray(s.reference))
        bad(`${at}.reference`, 'must be an array (the input images of an edit)');
      if (s.generator !== null && !isObject(s.generator))
        bad(`${at}.generator`, 'must be null or an object');
    });
    if (origin === 'ai-assisted' && modelled === 0)
      bad('sources', 'an ai-assisted record names the model of at least one source');
    if (origin === 'hand' && modelled > 0)
      bad('origin', 'a source names a model, so the origin is "ai-assisted"');
  }

  if (record.recipe !== null && record.recipe !== undefined) {
    const r = record.recipe;
    if (
      !isObject(r) ||
      typeof r.path !== 'string' ||
      typeof r.sha256 !== 'string' ||
      !HEX64.test(r.sha256)
    ) {
      bad('recipe', 'must be null or { "path", "sha256" }');
    }
  } else if (byTool) bad('recipe', 'a record the tool wrote names its recipe');
  if (record.edit !== null && record.edit !== undefined) {
    const e = record.edit;
    if (
      !isObject(e) ||
      typeof e.path !== 'string' ||
      typeof e.sha256 !== 'string' ||
      !HEX64.test(e.sha256)
    ) {
      bad('edit', 'must be null or { "path", "sha256", "painted", "erased" }');
    }
  }
  const o = record.output;
  if (!isObject(o)) bad('output', 'must be an object naming the PNG');
  else {
    if (typeof o.png !== 'string' || !o.png.endsWith('.png') || o.png.includes('/')) {
      bad('output.png', 'must be the PNG file name (next to the record)');
    }
    if (
      o.sha256 !== undefined &&
      o.sha256 !== null &&
      (typeof o.sha256 !== 'string' || !HEX64.test(o.sha256))
    ) {
      bad('output.sha256', 'must be a SHA-256 hex digest');
    }
    if (byTool && typeof o.sha256 !== 'string')
      bad('output.sha256', 'a record the tool wrote has the PNG hash');
    if (
      o.sidecar !== undefined &&
      o.sidecar !== null &&
      (typeof o.sidecar !== 'string' || o.sidecar.includes('/'))
    ) {
      bad('output.sidecar', 'must be the sidecar file name or null');
    }
    for (const k of ['frames', 'frameWidth', 'frameHeight']) {
      if (o[k] !== undefined && !Number.isInteger(o[k])) bad(`output.${k}`, 'must be an integer');
    }
  }
  if (record.notes !== undefined && typeof record.notes !== 'string')
    bad('notes', 'must be a string');
  return out;
}

/**
 * Lists files below a directory as sorted `/`-separated relative paths.
 *
 * @param {string} dir - Directory (missing = empty).
 * @param {string} [prefix] - Internal.
 * @returns {string[]} Relative paths.
 */
function listFiles(dir, prefix = '') {
  if (!existsSync(dir)) return [];
  /** @type {string[]} */
  const out = [];
  for (const entry of readdirSync(dir).sort()) {
    const rel = prefix === '' ? entry : `${prefix}/${entry}`;
    if (statSync(join(dir, entry)).isDirectory()) out.push(...listFiles(join(dir, entry), rel));
    else out.push(rel);
  }
  return out.sort();
}

/**
 * Whether a `LICENSES.md` in the PNG's folder or an ancestor (up to the tree's root) names
 * it — by its path relative to that `LICENSES.md`, or by its sprite name in backticks.
 *
 * @param {string} dir - The tree's root.
 * @param {ReadonlySet<string>} files - Every relative path in the tree.
 * @param {string} rel - The PNG's relative path.
 * @returns {boolean} `true` when an entry names it.
 */
function licensed(dir, files, rel) {
  const name = rel.slice(0, -'.png'.length);
  const parts = rel.split('/');
  for (let depth = parts.length - 1; depth >= 0; depth--) {
    const folder = parts.slice(0, depth).join('/');
    const licences = folder === '' ? 'LICENSES.md' : `${folder}/LICENSES.md`;
    if (!files.has(licences)) continue;
    const text = readFileSync(join(dir, licences), 'utf8');
    const local = parts.slice(depth).join('/');
    if (text.includes(local) || text.includes(`\`${name}\``)) return true;
  }
  return false;
}

/**
 * Checks a sprite tree (`assets/source/sprites/`, or the staging folder): every override
 * PNG has a valid `.art.json` whose hashes still match, or a `LICENSES.md` entry; every
 * record has its PNG; every recipe has been ingested.
 *
 * @param {string} dir - The tree's root (missing = nothing to check).
 * @param {string} [displayRoot] - Prefix for the issue paths.
 * @returns {{ pngs: number, records: number, licensed: number, issues: { path: string, message: string }[] }}
 *   Counts and problems.
 */
export function checkProvenanceTree(dir, displayRoot = dir) {
  const list = listFiles(dir);
  const files = new Set(list);
  /** @type {{ path: string, message: string }[]} */
  const issues = [];
  let pngs = 0;
  let records = 0;
  let licences = 0;
  for (const rel of list) {
    const shown = `${displayRoot}/${rel}`;
    if (rel.endsWith('.png') && !rel.endsWith('.edit.png')) {
      pngs++;
      const base = rel.slice(0, -'.png'.length);
      if (files.has(`${base}.art.json`)) continue;
      if (licensed(dir, files, rel)) {
        licences++;
        continue;
      }
      issues.push({
        path: shown,
        message: `no provenance: add ${base.split('/').pop()}.art.json (the ingest tool writes it) or a LICENSES.md entry`,
      });
    } else if (rel.endsWith('.art.json')) {
      records++;
      const base = rel.slice(0, -'.art.json'.length);
      const png = `${base}.png`;
      if (!files.has(png))
        issues.push({ path: shown, message: `a record without its PNG (${png.split('/').pop()})` });
      let record;
      try {
        record = JSON.parse(readFileSync(join(dir, rel), 'utf8'));
      } catch (error) {
        issues.push({
          path: shown,
          message: `invalid JSON: ${/** @type {Error} */ (error).message}`,
        });
        continue;
      }
      for (const problem of validateRecord(record, { sprite: base }))
        issues.push({ path: shown, message: problem });
      if (!files.has(png) || !isObject(record) || !isObject(record.output)) continue;
      const out = record.output;
      if (out.png !== png.split('/').pop())
        issues.push({ path: shown, message: `output.png must be "${png.split('/').pop()}"` });
      if (
        typeof out.sha256 === 'string' &&
        out.sha256 !== sha256Hex(readFileSync(join(dir, png)))
      ) {
        issues.push({
          path: shown,
          message: `the PNG changed since it was ingested — re-run the ingest tool (hand edits go in ${base.split('/').pop()}.edit.png)`,
        });
      }
      if (typeof out.sidecar === 'string') {
        const folder = base.includes('/') ? `${base.slice(0, base.lastIndexOf('/'))}/` : '';
        const sidecar = `${folder}${out.sidecar}`;
        if (!files.has(sidecar))
          issues.push({ path: shown, message: `its sidecar ${out.sidecar} is missing` });
        else if (
          typeof out.sidecarSha256 === 'string' &&
          out.sidecarSha256 !== sha256Hex(readFileSync(join(dir, sidecar)))
        ) {
          issues.push({
            path: shown,
            message: `the sidecar ${out.sidecar} changed since it was ingested — re-run the ingest tool`,
          });
        }
      }
    } else if (rel.endsWith('.recipe.json')) {
      const base = rel.slice(0, -'.recipe.json'.length);
      if (!files.has(`${base}.png`))
        issues.push({
          path: shown,
          message: 'a recipe that was never ingested (no PNG) — run the ingest tool',
        });
    }
  }
  return { pngs, records, licensed: licences, issues };
}
