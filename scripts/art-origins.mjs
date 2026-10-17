#!/usr/bin/env node
/**
 * The origin report (plan step R3-05, part 2): every sprite the atlas ships, listed by where it
 * came from — **procedural** (a seeded generator, a `*.sprite.json` pixel map, the bitmap font and
 * the `@flash` / `@p2` siblings generated from them), **hand** or **ai-assisted** (a real-art
 * override PNG, with the served model of every source image and edit reference) — and the checks
 * that make "every shipped image can be traced" a test rather than a promise.
 *
 * **What it reads.**
 *
 * - The asset pipeline's own sprite list, {@link collectSprites} (read-only): the `origin` string
 *   of each sprite names its generator (`procedural:<module>`), its source file (`*.sprite.json`,
 *   `*.font.json`), its base (`flash:<name>`, `p2:<name>`) or the override PNG laid over it
 *   (`… + <path>.png`). So "procedural" is derived from the pipeline, never declared.
 * - Each override's provenance record `<name>.art.json` (schema `shmup-art-provenance@1`), checked
 *   with the ingest tool's dependency-free `art-prompts/ingest/lib/provenance.mjs` —
 *   `checkProvenanceTree`, `validateRecord`, `loadModels`, `isUnversioned` — never restated here.
 *   A PNG with no record and no tree issue is licensed through a `LICENSES.md` entry.
 * - The model table `art-prompts/ingest/models.json`: each served model's licence id and its
 *   ship / hold verdict per use (`docs/dev/art-provenance.md` §2), joined to every source and
 *   every **nested** edit reference of a record.
 * - The staging folder `art-prompts/v2/ingested/` (until R2-01 moves it), only when it exists.
 *   Never the art round's git-ignored candidates or its winners.
 *
 * **Rules** ({@link RULES}). In the shipped tree every finding is a failure; in the staging
 * folder rules 1, 2 and 6 fail and rules 3–5 warn (art may be staged before its review or the
 * FLUX decision, but not with a broken record):
 *
 * 1. every issue of `checkProvenanceTree` — an override PNG without a record or a `LICENSES.md`
 *    entry, an invalid record, a record without its PNG, a PNG or sidecar changed since ingest, a
 *    recipe never ingested;
 * 2. every modelled source and edit reference names a model of `models.json` (by `modelKey`, else
 *    by served id), with the table's served id and licence id — a `null` licence fails;
 * 3. no image anywhere in a record's source or reference tree is on `hold` for the record's
 *    `use` — by its model's row or by any row with its recorded licence id (the FLUX gate,
 *    art-provenance §6 rule 1);
 * 4. an `ai-assisted` record has been reviewed (`reviewed` is not `null`; §6 rule 5, owner
 *    default W3-11);
 * 5. a record whose `use` is `reference` has `cleanup` `heavy` or `redrawn` — with `none` or
 *    `light` the shipped pixels are still largely the model's (owner default W3-10);
 * 6. every sprite origin is classified and the pipeline reports no source issue, and no recorded
 *    path points into the git-ignored candidates folder (an edit reference's `from`, the entry it
 *    stands for, may).
 *
 * Usage:
 *   node scripts/art-origins.mjs            print the counts by origin × kind and by served model
 *   node scripts/art-origins.mjs --list     … and one row per sprite
 *   node scripts/art-origins.mjs --json     the whole report as JSON
 *   node scripts/art-origins.mjs --check    exit 1 when anything fails (warnings never do)
 *   (--source DIR, --staging DIR, --models FILE point it at other trees; exit 2 on bad usage)
 *
 * CI runs it through `test/scripts/art-origins.test.ts` (part of `pnpm test`). Guide:
 * `docs/dev/art-provenance.md` §9.
 *
 * @module
 */
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_MODELS_FILE,
  checkProvenanceTree,
  isUnversioned,
  loadModels,
  validateRecord,
} from '../art-prompts/ingest/lib/provenance.mjs';
import { DEFAULT_SOURCE_DIR, REPO_ROOT, collectSprites } from './assets/pipeline.mjs';
import { loadSpriteSources } from './assets/sprite-source.mjs';

/** @typedef {import('../art-prompts/ingest/lib/provenance.mjs').ModelEntry} ModelEntry */

/**
 * Where a sprite came from: `procedural` (made by the repository's own code and data), `hand` or
 * `ai-assisted` (an override PNG's record, or `hand` for a `LICENSES.md` entry), `unknown` (no
 * usable provenance — always with a finding).
 *
 * @typedef {'procedural' | 'hand' | 'ai-assisted' | 'unknown'} OriginClass
 */

/**
 * How it was made: `generator` (`scripts/assets/procedural/*.mjs`), `pixel-map`
 * (`*.sprite.json`), `font` (`*.font.json`), `flash` / `p2` (a sibling generated from its base,
 * whose class it inherits), `record` (an override PNG with its `.art.json`), `licensed` (an
 * override PNG named in a `LICENSES.md`), `untraced` (an override PNG with neither),
 * `unclassified` (an origin string the report does not know).
 *
 * @typedef {'generator' | 'pixel-map' | 'font' | 'flash' | 'p2' | 'record' | 'licensed'
 *   | 'untraced' | 'unclassified'} OriginKind
 */

/**
 * One served model in a record's source tree.
 *
 * @typedef {object} ModelUse
 * @property {string} model - The served model id the record names.
 * @property {string | null} modelKey - Its `models.json` group key as recorded (`null` if none).
 * @property {string | null} licence - Its licence id as recorded.
 * @property {string} at - JSON path in the record (`sources[0]`, `sources[0].reference[1]` …).
 * @property {number} depth - 0 for a source image, 1 and more for an edit's input images.
 * @property {'ship' | 'hold' | null} verdict - The table's verdict for the record's `use`; `null`
 *   when the model is not in the table.
 */

/**
 * One sprite of the report.
 *
 * @typedef {object} SpriteOrigin
 * @property {string} name - The sprite name.
 * @property {'shipped' | 'staged'} tree - The atlas's sources, or the staging folder.
 * @property {OriginClass} origin - Where it came from.
 * @property {OriginKind} kind - How it was made.
 * @property {string} source - The generator id, the source file, the base sprite's origin, or the
 *   override PNG (display paths).
 * @property {string | null} base - The base sprite of a `flash` / `p2` sibling.
 * @property {string | null} record - The `.art.json` it was classified from (display path).
 * @property {string[]} models - Served model ids of every source and nested edit reference,
 *   sorted, each once (a sibling inherits its base's).
 * @property {string[]} licences - Their recorded licence ids, sorted, each once.
 * @property {'pixels' | 'reference' | null} use - The record's `use`.
 * @property {'none' | 'light' | 'heavy' | 'redrawn' | null} cleanup - The record's `cleanup`.
 * @property {boolean | null} reviewed - Whether the record says it was reviewed (`null`: no
 *   record).
 * @property {'ok' | 'warning' | 'failure'} status - The worst finding against it (or its base).
 */

/**
 * One problem.
 *
 * @typedef {object} OriginFinding
 * @property {'shipped' | 'staged'} tree - Which tree.
 * @property {'failure' | 'warning'} severity - Failures fail `--check`; warnings never do.
 * @property {number} rule - The {@link RULES} number.
 * @property {string | null} sprite - The sprite it is about, when it is about one.
 * @property {string} path - The file it is about (display path).
 * @property {string} message - What is wrong.
 */

/**
 * The tallies of one tree.
 *
 * @typedef {object} OriginCounts
 * @property {number} total - Sprites.
 * @property {Record<string, Record<string, number>>} byOriginKind - Sprites by origin, then kind.
 * @property {Record<string, { sprites: number, licence: string | null, pixels: string | null,
 *   reference: string | null }>} byModel - Sprites naming each served model (as a source or an
 *   edit reference, siblings included), with the table's licence id and verdicts (`null` when the
 *   model is not in the table).
 */

/**
 * The whole report.
 *
 * @typedef {object} OriginReport
 * @property {string} sourceDir - The asset sources read (display path).
 * @property {string | null} stagingDir - The staging folder looked at (display path), `null`
 *   when the caller turned it off.
 * @property {boolean} stagingPresent - Whether that folder exists.
 * @property {string} modelsFile - The model table read (display path).
 * @property {SpriteOrigin[]} sprites - Every sprite the atlas ships, sorted by name.
 * @property {SpriteOrigin[]} staged - Every staged override, sorted by name.
 * @property {OriginFinding[]} findings - Every problem, shipped tree first.
 * @property {{ shipped: OriginCounts, staged: OriginCounts }} counts - The tallies.
 * @property {number} failures - Findings that fail `--check`.
 * @property {number} warnings - Findings that only warn.
 */

/** The staging folder of ingested art until R2-01 (`docs/dev/real-assets.md`). */
export const DEFAULT_STAGING_DIR = join(REPO_ROOT, 'art-prompts', 'v2', 'ingested');

/** The report's rules, by number (`docs/dev/art-provenance.md` §9). */
export const RULES = Object.freeze({
  1: 'every override PNG is traced by a valid, current record or a LICENSES.md entry',
  2: "every source and edit reference names a model of models.json, with the table's id and licence",
  3: "no model in a record's source or reference tree is on hold for the record's use",
  4: 'an ai-assisted record has been reviewed',
  5: 'a "reference" use comes with heavy cleanup or a redraw',
  6: 'every origin is classified and no recorded path is in the candidates folder',
});

/** Rules that only warn in the staging folder (the rest fail there too). */
const STAGED_WARNING_RULES = Object.freeze([3, 4, 5]);

/** Row order of the origin × kind table. */
const ORIGIN_ORDER = Object.freeze(['procedural', 'hand', 'ai-assisted', 'unknown']);

/** Column order of the origin × kind table. */
const KIND_ORDER = Object.freeze([
  'generator',
  'pixel-map',
  'font',
  'flash',
  'p2',
  'record',
  'licensed',
  'untraced',
  'unclassified',
]);

/** Cleanups that leave a "reference" sprite's pixels largely the model's (W3-10). */
const LIGHT_CLEANUPS = Object.freeze(['none', 'light']);

/**
 * A path for messages: repo-relative with `/` when inside the repository, else absolute.
 *
 * @param {string} path - Absolute path.
 * @returns {string} The display form.
 */
function displayPath(path) {
  const rel = relative(REPO_ROOT, path);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return path;
  return rel.split(sep).join('/');
}

/**
 * Whether a value is a plain object.
 *
 * @param {unknown} v - Any value.
 * @returns {v is Record<string, any>} `true` for non-null, non-array objects.
 */
const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Sorted, each value once.
 *
 * @param {Iterable<string>} values - Values.
 * @returns {string[]} The sorted set.
 */
const uniqueSorted = (values) => [...new Set(values)].sort();

/**
 * Every modelled image of a record — its sources and, recursively, their edit references — with
 * the table's verdict for the record's `use`.
 *
 * @param {Record<string, any>} record - A valid record.
 * @param {Record<string, ModelEntry>} models - The model table.
 * @returns {(ModelUse & { entry: ModelEntry | null, keyKnown: boolean })[]} The images that name
 *   a model, sources first, each followed by its references (depth first).
 */
function modelledImages(record, models) {
  /** @type {(ModelUse & { entry: ModelEntry | null, keyKnown: boolean })[]} */
  const out = [];
  /**
   * Adds one image (when it names a model) and walks its references.
   *
   * @param {Record<string, any>} image - A source or a reference.
   * @param {string} at - Its JSON path.
   * @param {number} depth - 0 for a source.
   */
  const visit = (image, at, depth) => {
    if (typeof image.model === 'string') {
      const key = typeof image.modelKey === 'string' ? image.modelKey : null;
      const keyKnown = key !== null && Object.prototype.hasOwnProperty.call(models, key);
      const entry =
        (keyKnown ? models[/** @type {string} */ (key)] : null) ??
        Object.values(models).find((m) => m.id === image.model) ??
        null;
      const licence = typeof image.licence === 'string' ? image.licence : null;
      const use = /** @type {'pixels' | 'reference'} */ (record.use);
      // The verdicts are policy kept per licence id: the model's own row, and every row with the
      // recorded licence (so a FLUX licence on a model the table lacks still holds).
      const rows = Object.values(models).filter((m) => m === entry || m.licence === licence);
      /** @type {'ship' | 'hold' | null} */
      let verdict = null;
      if (rows.some((m) => m.verdict[use] === 'hold')) verdict = 'hold';
      else if (entry !== null) verdict = 'ship';
      out.push({ model: image.model, modelKey: key, licence, at, depth, verdict, entry, keyKnown });
    }
    if (Array.isArray(image.reference)) {
      image.reference.forEach((/** @type {Record<string, any>} */ r, k) => {
        if (isObject(r)) visit(r, `${at}.reference[${k}]`, depth + 1);
      });
    }
  };
  record.sources.forEach((/** @type {Record<string, any>} */ s, i) => {
    if (isObject(s)) visit(s, `sources[${i}]`, 0);
  });
  return out;
}

/**
 * Every path a record stores that must exist in a fresh clone (the edit references' `from` — the
 * candidate an edit was made from, mapped to its committed copy — is a name, not a dependency).
 *
 * @param {Record<string, any>} record - A valid record.
 * @returns {{ at: string, path: string }[]} JSON path and value.
 */
function recordedPaths(record) {
  /** @type {{ at: string, path: string }[]} */
  const out = [];
  /**
   * Adds a path when it is a string.
   *
   * @param {string} at - JSON path.
   * @param {unknown} value - The value.
   */
  const add = (at, value) => {
    if (typeof value === 'string') out.push({ at, path: value });
  };
  /**
   * Adds an edit's input images, recursively.
   *
   * @param {unknown} list - A `reference` array.
   * @param {string} at - Its JSON path.
   */
  const refs = (list, at) => {
    if (!Array.isArray(list)) return;
    list.forEach((r, k) => {
      if (!isObject(r)) return;
      add(`${at}[${k}].path`, r.path);
      add(`${at}[${k}].sidecar`, r.sidecar);
      refs(r.reference, `${at}[${k}].reference`);
    });
  };
  record.sources.forEach((/** @type {unknown} */ s, i) => {
    if (!isObject(s)) return;
    add(`sources[${i}].path`, s.path);
    if (isObject(s.prompt)) add(`sources[${i}].prompt.file`, s.prompt.file);
    if (isObject(s.generator)) add(`sources[${i}].generator.sidecar`, s.generator.sidecar);
    refs(s.reference, `sources[${i}].reference`);
  });
  if (isObject(record.recipe)) add('recipe.path', record.recipe.path);
  if (isObject(record.edit)) add('edit.path', record.edit.path);
  return out;
}

/**
 * Classifies the override PNGs of one tree and applies rules 1–6 to their records.
 *
 * @param {object} options - The tree.
 * @param {string} options.dir - Its root (`…/sprites`, or the staging folder).
 * @param {string[]} options.names - The override sprite names found in it.
 * @param {Record<string, ModelEntry>} options.models - The model table.
 * @param {(rule: number, sprite: string | null, path: string, message: string) => void}
 *   options.report - Records a finding against this tree (it knows the tree's severities).
 * @returns {Map<string, Omit<SpriteOrigin, 'name' | 'tree' | 'source' | 'base' | 'status'>>}
 *   The class of each override, by sprite name.
 */
function classifyOverrides({ dir, names, models, report }) {
  const shown = displayPath(dir);
  const check = checkProvenanceTree(dir, shown);
  /** @type {Set<string>} */
  const untraced = new Set();
  for (const issue of check.issues) {
    const rel = issue.path.startsWith(`${shown}/`) ? issue.path.slice(shown.length + 1) : '';
    const suffix = ['.art.json', '.recipe.json', '.png'].find((s) => rel.endsWith(s));
    const sprite = suffix === undefined ? null : rel.slice(0, -suffix.length);
    if (sprite !== null && suffix === '.png' && issue.message.startsWith('no provenance')) {
      untraced.add(sprite);
    }
    report(1, sprite, issue.path, issue.message);
  }

  /** @type {Map<string, Omit<SpriteOrigin, 'name' | 'tree' | 'source' | 'base' | 'status'>>} */
  const out = new Map();
  for (const name of names) {
    const recordFile = join(dir, `${name}.art.json`);
    const recordShown = `${shown}/${name}.art.json`;
    /** @type {Omit<SpriteOrigin, 'name' | 'tree' | 'source' | 'base' | 'status'>} */
    const row = {
      origin: 'unknown',
      kind: 'untraced',
      record: null,
      models: [],
      licences: [],
      use: null,
      cleanup: null,
      reviewed: null,
    };
    out.set(name, row);
    if (!existsSync(recordFile)) {
      // No record and no "no provenance" issue: a LICENSES.md entry names it (the tree check's
      // own rule, not restated here).
      if (!untraced.has(name)) Object.assign(row, { origin: 'hand', kind: 'licensed' });
      continue;
    }
    row.kind = 'record';
    row.record = recordShown;
    /** @type {unknown} */
    let record;
    try {
      record = JSON.parse(readFileSync(recordFile, 'utf8'));
    } catch {
      continue; // rule 1 reported it
    }
    // An invalid record is rule 1's (reported above); rules 2–6 read valid records only.
    if (!isObject(record) || validateRecord(record, { sprite: name }).length > 0) continue;

    const images = modelledImages(record, models);
    Object.assign(row, {
      origin: record.origin,
      models: uniqueSorted(images.map((m) => m.model)),
      licences: uniqueSorted(
        /** @type {string[]} */ (images.map((m) => m.licence).filter((l) => l !== null)),
      ),
      use: record.use,
      cleanup: record.cleanup,
      reviewed: record.reviewed !== null,
    });

    for (const image of images) {
      const where = `${image.at} ${image.model}`;
      const role = image.depth === 0 ? 'a source' : 'an edit reference';
      if (image.modelKey !== null && !image.keyKnown) {
        report(
          2,
          name,
          recordShown,
          `${where}: modelKey "${image.modelKey}" is not in models.json`,
        );
      } else if (image.entry === null) {
        report(
          2,
          name,
          recordShown,
          `${where}: the model is not in models.json — a model without a row in ` +
            'art-provenance.md §2 makes no shipped art (§6 rule 9)',
        );
      } else if (image.entry.id !== image.model) {
        report(
          2,
          name,
          recordShown,
          `${where}: models.json serves "${image.entry.id}" as "${image.modelKey}"`,
        );
      }
      if (image.licence === null) {
        report(
          2,
          name,
          recordShown,
          `${where}: the licence is null (re-ingest once the model is in models.json)`,
        );
      } else if (image.entry !== null && image.licence !== image.entry.licence) {
        report(
          2,
          name,
          recordShown,
          `${where}: licence "${image.licence}" differs from models.json's "${image.entry.licence}"`,
        );
      }
      if (image.verdict === 'hold') {
        const held =
          image.entry !== null && image.entry.verdict[record.use] === 'hold'
            ? image.entry
            : Object.values(models).find(
                (m) => m.licence === image.licence && m.verdict[record.use] === 'hold',
              );
        report(
          3,
          name,
          recordShown,
          `${where} (${role}, licence ${image.licence ?? held?.licence}) is on hold for use ` +
            `"${record.use}": ${held?.conditions ?? 'see art-provenance.md §2'}`,
        );
      }
    }
    if (record.origin === 'ai-assisted' && record.reviewed === null) {
      report(
        4,
        name,
        recordShown,
        'an ai-assisted record that nobody has reviewed ("reviewed": null) — record the content ' +
          'review (art-provenance.md §6 rule 5)',
      );
    }
    if (record.use === 'reference' && LIGHT_CLEANUPS.includes(record.cleanup)) {
      report(
        5,
        name,
        recordShown,
        `use "reference" with cleanup "${record.cleanup}": the pixels are still largely the ` +
          'model\'s — record use "pixels", or clean it up "heavy" / "redrawn"',
      );
    }
    for (const { at, path } of recordedPaths(record)) {
      if (isUnversioned(path)) {
        report(6, name, recordShown, `${at} "${path}" is in the git-ignored candidates folder`);
      }
    }
  }
  return out;
}

/**
 * The pipeline origin of a code-made sprite, as a class (an override is handled apart).
 *
 * @param {string} origin - The sprite's `origin` string.
 * @returns {{ kind: OriginKind, source: string, base: string | null }} The kind, the source and,
 *   for a generated sibling, its base sprite.
 */
function codeOrigin(origin) {
  if (origin.startsWith('procedural:')) {
    return { kind: 'generator', source: origin.slice('procedural:'.length), base: null };
  }
  if (origin.startsWith('flash:')) {
    return { kind: 'flash', source: origin, base: origin.slice('flash:'.length) };
  }
  if (origin.startsWith('p2:'))
    return { kind: 'p2', source: origin, base: origin.slice('p2:'.length) };
  if (origin.endsWith('.sprite.json')) return { kind: 'pixel-map', source: origin, base: null };
  if (origin.endsWith('.font.json')) return { kind: 'font', source: origin, base: null };
  return { kind: 'unclassified', source: origin, base: null };
}

/**
 * Tallies one tree's sprites.
 *
 * @param {SpriteOrigin[]} rows - The sprites.
 * @param {Record<string, ModelEntry>} models - The model table.
 * @returns {OriginCounts} The counts.
 */
function countRows(rows, models) {
  /** @type {OriginCounts} */
  const counts = { total: rows.length, byOriginKind: {}, byModel: {} };
  for (const row of rows) {
    const byKind = (counts.byOriginKind[row.origin] ??= {});
    byKind[row.kind] = (byKind[row.kind] ?? 0) + 1;
    for (const model of row.models) {
      const entry = Object.values(models).find((m) => m.id === model) ?? null;
      const slot = (counts.byModel[model] ??= {
        sprites: 0,
        licence: entry?.licence ?? null,
        pixels: entry?.verdict.pixels ?? null,
        reference: entry?.verdict.reference ?? null,
      });
      slot.sprites++;
    }
  }
  return counts;
}

/**
 * Builds the origin report.
 *
 * @param {object} [options] - Where to look (every path absolute or relative to the working
 *   directory).
 * @param {string} [options.sourceDir] - The asset sources (default `assets/source/`): the sprites
 *   the atlas ships, as {@link collectSprites} reads them.
 * @param {string | null} [options.stagingDir] - The staging folder (default
 *   `art-prompts/v2/ingested/`, skipped while it does not exist); `null` skips it.
 * @param {string} [options.modelsFile] - The model table (default the ingest tool's
 *   `models.json`).
 * @returns {OriginReport} The report.
 * @throws {Error} When the source folder does not exist, or the model table is not a valid
 *   `shmup-ingest-models@1` file.
 *
 * @example
 * const report = buildOriginReport();
 * report.counts.shipped.byOriginKind.procedural.generator; // sprites drawn by a generator
 * report.failures; // 0 while every shipped sprite can be traced
 */
export function buildOriginReport(options = {}) {
  const sourceDir = resolve(options.sourceDir ?? DEFAULT_SOURCE_DIR);
  const stagingDir =
    options.stagingDir === null ? null : resolve(options.stagingDir ?? DEFAULT_STAGING_DIR);
  const modelsFile = resolve(options.modelsFile ?? DEFAULT_MODELS_FILE);
  // A mistyped folder would otherwise pass: the generators alone still make most sprites.
  if (!existsSync(sourceDir)) throw new Error(`${displayPath(sourceDir)}: no such folder`);
  const models = loadModels(modelsFile);

  /** @type {OriginFinding[]} */
  const findings = [];
  /**
   * Makes the finding recorder of one tree.
   *
   * @param {'shipped' | 'staged'} tree - Which tree.
   * @returns {(rule: number, sprite: string | null, path: string, message: string) => void} It.
   */
  const reporter = (tree) => (rule, sprite, path, message) => {
    const warn = tree === 'staged' && STAGED_WARNING_RULES.includes(rule);
    findings.push({ tree, severity: warn ? 'warning' : 'failure', rule, sprite, path, message });
  };

  // The shipped tree: every sprite the atlas packs.
  const report = reporter('shipped');
  const collected = collectSprites({ sourceDir });
  for (const issue of collected.issues) {
    report(6, null, issue.path, `the asset pipeline cannot read a source: ${issue.message}`);
  }
  const spritesDir = join(sourceDir, 'sprites');
  const overrideNames = collected.sprites
    .filter((sprite) => sprite.origin.endsWith('.png'))
    .map((sprite) => sprite.name);
  const overrides = classifyOverrides({ dir: spritesDir, names: overrideNames, models, report });
  /** @type {Map<string, SpriteOrigin>} */
  const byName = new Map();
  const origins = new Map(collected.sprites.map((sprite) => [sprite.name, sprite.origin]));
  /**
   * Classifies one sprite (a sibling after its base).
   *
   * @param {string} name - The sprite name.
   * @param {number} depth - Sibling depth (a loop guard).
   * @returns {SpriteOrigin} Its row.
   */
  const classify = (name, depth) => {
    const known = byName.get(name);
    if (known !== undefined) return known;
    const origin = origins.get(name) ?? '';
    /** @type {SpriteOrigin} */
    let row;
    const override = overrides.get(name);
    if (override !== undefined) {
      const png = origin.includes(' + ') ? origin.slice(origin.lastIndexOf(' + ') + 3) : origin;
      row = { name, tree: 'shipped', source: png, base: null, status: 'ok', ...override };
    } else {
      const code = codeOrigin(origin);
      const base =
        code.base !== null && origins.has(code.base) && depth < 8
          ? classify(code.base, depth + 1)
          : null;
      row = {
        name,
        tree: 'shipped',
        origin: code.kind === 'unclassified' ? 'unknown' : (base?.origin ?? 'procedural'),
        kind: code.kind,
        source: code.base === null ? code.source : (base?.source ?? code.source),
        base: code.base,
        record: base?.record ?? null,
        models: base?.models ?? [],
        licences: base?.licences ?? [],
        use: base?.use ?? null,
        cleanup: base?.cleanup ?? null,
        reviewed: base?.reviewed ?? null,
        status: 'ok',
      };
      if (code.kind === 'unclassified') {
        report(6, name, origin, `cannot classify the origin "${origin}" of sprite "${name}"`);
      } else if (code.base !== null && base === null) {
        row.origin = 'unknown';
        report(6, name, origin, `the base sprite "${code.base}" of "${name}" is not in the atlas`);
      }
    }
    byName.set(name, row);
    return row;
  };
  for (const sprite of collected.sprites) classify(sprite.name, 0);

  // The staging folder: overrides waiting for R2-01's move.
  const stagingPresent = stagingDir !== null && existsSync(stagingDir);
  /** @type {SpriteOrigin[]} */
  const staged = [];
  if (stagingDir !== null && stagingPresent) {
    const reportStaged = reporter('staged');
    const sources = loadSpriteSources(stagingDir, displayPath(stagingDir));
    for (const issue of sources.issues) {
      reportStaged(
        6,
        null,
        issue.path,
        `the asset pipeline cannot read a staged file: ${issue.message}`,
      );
    }
    const names = sources.overrides.map((o) => o.name).sort();
    const classes = classifyOverrides({ dir: stagingDir, names, models, report: reportStaged });
    for (const name of names) {
      const cls =
        /** @type {Omit<SpriteOrigin, 'name' | 'tree' | 'source' | 'base' | 'status'>} */ (
          classes.get(name)
        );
      staged.push({
        name,
        tree: 'staged',
        source: `${displayPath(stagingDir)}/${name}.png`,
        base: null,
        status: 'ok',
        ...cls,
      });
    }
  }

  // Each row's status: the worst finding against it, or against its base.
  const sprites = [...byName.values()].sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  );
  for (const rows of [sprites, staged]) {
    /** @type {Map<string, SpriteOrigin>} */
    const index = new Map(rows.map((row) => [row.name, row]));
    for (const finding of findings) {
      if (finding.sprite === null || rows.length === 0 || finding.tree !== rows[0].tree) continue;
      const row = index.get(finding.sprite);
      if (row === undefined) continue;
      if (finding.severity === 'failure') row.status = 'failure';
      else if (row.status === 'ok') row.status = 'warning';
    }
    for (const row of rows) {
      let base = row.base === null ? undefined : index.get(row.base);
      for (let guard = 0; base !== undefined && guard < 8; guard++) {
        if (base.status === 'failure' || (base.status === 'warning' && row.status === 'ok')) {
          row.status = base.status;
        }
        base = base.base === null ? undefined : index.get(base.base);
      }
    }
  }

  const failures = findings.filter((f) => f.severity === 'failure').length;
  return {
    sourceDir: displayPath(sourceDir),
    stagingDir: stagingDir === null ? null : displayPath(stagingDir),
    stagingPresent,
    modelsFile: displayPath(modelsFile),
    sprites,
    staged,
    findings,
    counts: { shipped: countRows(sprites, models), staged: countRows(staged, models) },
    failures,
    warnings: findings.length - failures,
  };
}

/**
 * Lays rows out as aligned columns.
 *
 * @param {readonly (string | number)[][]} rows - Header row first.
 * @returns {string[]} One line per row, indented by two spaces.
 */
function columns(rows) {
  const widths = rows[0].map((_, c) => Math.max(...rows.map((r) => String(r[c]).length)));
  return rows.map((r) =>
    `  ${r.map((cell, c) => String(cell).padEnd(widths[c])).join('  ')}`.trimEnd(),
  );
}

/**
 * The origin × kind and served-model tables of one tree.
 *
 * @param {string} title - What the tree is.
 * @param {OriginCounts} counts - Its tallies.
 * @returns {string[]} Lines.
 */
function countLines(title, counts) {
  const origins = ORIGIN_ORDER.filter((o) => counts.byOriginKind[o] !== undefined);
  const kinds = KIND_ORDER.filter((k) =>
    origins.some((o) => counts.byOriginKind[o][k] !== undefined),
  );
  const lines = [`${title} by origin and kind:`];
  if (origins.length === 0) lines.push('  none');
  else {
    lines.push(
      ...columns([
        ['origin', ...kinds, 'total'],
        ...origins.map((o) => {
          const byKind = counts.byOriginKind[o];
          const cells = kinds.map((k) => byKind[k] ?? 0);
          return [o, ...cells, cells.reduce((a, b) => a + b, 0)];
        }),
      ]),
    );
  }
  lines.push(`${title} by served model (as a source or an edit reference):`);
  const models = Object.keys(counts.byModel).sort();
  if (models.length === 0) lines.push('  none — no sprite names a model');
  else {
    lines.push(
      ...columns([
        ['model', 'licence', 'pixels', 'reference', 'sprites'],
        ...models.map((m) => {
          const c = counts.byModel[m];
          return [
            m,
            c.licence ?? '(not in models.json)',
            c.pixels ?? '-',
            c.reference ?? '-',
            c.sprites,
          ];
        }),
      ]),
    );
  }
  return lines;
}

/**
 * Formats a report for a terminal.
 *
 * @param {OriginReport} report - The report.
 * @param {{ list?: boolean }} [options] - `list`: one row per sprite too.
 * @returns {string} The text (ends with a newline).
 *
 * @example
 * process.stdout.write(formatOriginReport(buildOriginReport(), { list: true }));
 */
export function formatOriginReport(report, options = {}) {
  const lines = [
    `Art origins: ${report.sprites.length} sprites in the atlas from ${report.sourceDir}` +
      ` (models: ${report.modelsFile})`,
    report.stagingDir === null
      ? 'Staging folder: not checked'
      : report.stagingPresent
        ? `Staging folder ${report.stagingDir}: ${report.staged.length} staged sprites`
        : `Staging folder ${report.stagingDir}: absent`,
    '',
    ...countLines('Shipped sprites', report.counts.shipped),
  ];
  if (report.stagingPresent) lines.push('', ...countLines('Staged sprites', report.counts.staged));
  if (options.list === true) {
    for (const [title, rows] of /** @type {[string, SpriteOrigin[]][]} */ ([
      ['Shipped sprites', report.sprites],
      ['Staged sprites', report.staged],
    ])) {
      if (rows.length === 0) continue;
      lines.push('', `${title}:`);
      lines.push(
        ...columns([
          ['sprite', 'origin', 'kind', 'source', 'models', 'status'],
          ...rows.map((r) => [
            r.name,
            r.origin,
            r.kind,
            r.base === null ? r.source : `${r.source} (via ${r.base})`,
            r.models.length === 0 ? '-' : r.models.join(', '),
            r.status,
          ]),
        ]),
      );
    }
  }
  lines.push('');
  for (const f of report.findings) {
    const who = f.sprite === null ? '' : ` ${f.sprite}:`;
    lines.push(
      `${f.severity === 'failure' ? 'FAIL' : 'WARN'} [${f.tree}, rule ${f.rule}]${who} ${f.path}: ${f.message}`,
    );
  }
  lines.push(
    `${report.failures} failure${report.failures === 1 ? '' : 's'}, ` +
      `${report.warnings} warning${report.warnings === 1 ? '' : 's'}`,
  );
  return `${lines.join('\n')}\n`;
}

/** The command line's usage text. */
const USAGE =
  'usage: node scripts/art-origins.mjs [--check] [--list] [--json] ' +
  '[--source DIR] [--staging DIR] [--models FILE]';

/**
 * Reads the command line.
 *
 * @param {readonly string[]} args - The arguments after the script.
 * @returns {{ check: boolean, list: boolean, json: boolean, help: boolean, sourceDir?: string,
 *   stagingDir?: string, modelsFile?: string } | null} The options, or `null` on bad usage (an
 *   unknown or repeated option, a missing value, a positional argument).
 */
export function parseArgs(args) {
  /** @type {{ check: boolean, list: boolean, json: boolean, help: boolean, sourceDir?: string, stagingDir?: string, modelsFile?: string }} */
  const out = { check: false, list: false, json: false, help: false };
  /** @type {Record<string, 'check' | 'list' | 'json' | 'help'>} */
  const flags = { '--check': 'check', '--list': 'list', '--json': 'json', '--help': 'help' };
  /** @type {Record<string, 'sourceDir' | 'stagingDir' | 'modelsFile'>} */
  const values = { '--source': 'sourceDir', '--staging': 'stagingDir', '--models': 'modelsFile' };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const eq = arg.indexOf('=');
    const name = arg.startsWith('--') && eq > 0 ? arg.slice(0, eq) : arg;
    if (Object.prototype.hasOwnProperty.call(flags, name) && eq < 0) {
      const key = flags[name];
      if (out[key]) return null;
      out[key] = true;
    } else if (Object.prototype.hasOwnProperty.call(values, name)) {
      const key = values[name];
      const value = eq > 0 ? arg.slice(eq + 1) : args[++i];
      if (value === undefined || value === '' || (eq < 0 && value.startsWith('--'))) return null;
      if (out[key] !== undefined) return null;
      out[key] = value;
    } else return null;
  }
  return out;
}

/**
 * Command-line entry point.
 *
 * @returns {number} Process exit code: 0 (with `--check`: nothing failed), 1 when `--check` found
 *   a failure or the report could not be built, 2 on bad usage (the usage is printed).
 */
function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options === null) {
    console.error(USAGE);
    return 2;
  }
  if (options.help) {
    console.log(USAGE);
    return 0;
  }
  let report;
  try {
    report = buildOriginReport({
      sourceDir: options.sourceDir,
      stagingDir: options.stagingDir,
      modelsFile: options.modelsFile,
    });
  } catch (error) {
    console.error(`art-origins: ${/** @type {Error} */ (error).message}`);
    return 1;
  }
  if (options.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else process.stdout.write(formatOriginReport(report, { list: options.list }));
  if (options.check && report.failures > 0) {
    console.error(
      `art-origins: ${report.failures} failure${report.failures === 1 ? '' : 's'} — see ` +
        'docs/dev/art-provenance.md §9',
    );
    return 1;
  }
  return 0;
}

/**
 * Whether this file is the script Node was started with (not imported by a test).
 *
 * @returns {boolean} `true` when run from the command line.
 */
function isCommandLineEntry() {
  const entry = process.argv[1];
  if (entry === undefined || !existsSync(entry)) return false;
  return realpathSync(resolve(entry)) === realpathSync(fileURLToPath(import.meta.url));
}

if (isCommandLineEntry()) process.exitCode = main();
