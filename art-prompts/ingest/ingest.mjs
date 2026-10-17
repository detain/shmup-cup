#!/usr/bin/env node
/**
 * shmup-ingest — turns a generated image into a game-ready sprite source with provenance
 * (plan step R3-02; the rules are the art bible's §8, `docs/dev/art-bible-v2.md`; the
 * workflow, the recipe and the record formats are in `docs/dev/real-assets.md`).
 *
 *   node art-prompts/ingest/ingest.mjs [options] [<recipe.json | dir>…]
 *
 * For every `<name>.recipe.json` it writes, next to the recipe (or under `--out`):
 * `<name>.png` (the frame strip, deterministic bytes), `<name>.json` (an Aseprite-format
 * sidecar: frames, tags, the anchor pivot) and `<name>.art.json` (the provenance record).
 *
 * A standalone tool outside the pnpm workspace (like `tools/*`): `npm ci` in this folder
 * installs its two image codecs. Exit codes: 0 fine, 1 a recipe failed (or `--check` found
 * a difference, or `--strict` met a warning), 2 bad usage.
 *
 * @module
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findRecipes, ingestRecipe, recordWithoutDate } from './lib/pipeline.mjs';
import { DEFAULT_MODELS_FILE, loadModels } from './lib/provenance.mjs';

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_DIR = resolve(TOOL_DIR, '..', '..');

const USAGE = `Usage: node art-prompts/ingest/ingest.mjs [options] [<recipe.json | dir>…]

Ingests every <name>.recipe.json given (a directory = every recipe below it). With no paths:
every recipe under assets/source/sprites/ and the staging folder art-prompts/v2/ingested/.

Writes, next to each recipe (or under --out): <name>.png, <name>.json (frame sidecar) and
<name>.art.json (provenance). A <name>.edit.png next to the recipe is merged last.

Options:
  --check             re-run in memory and compare with the files on disk; write nothing;
                      exit 1 when anything differs (the record's date is not compared)
  --out <dir>         write <dir>/<name>.* instead of next to each recipe
  --root <dir>        the root that source paths (and recorded paths) are relative to
                      (default: the repository, ${relative(process.cwd(), REPO_DIR) || '.'})
  --palettes <dir>    named palettes (default: art-prompts/ingest/palettes/)
  --models <file>     the model table (default: art-prompts/ingest/models.json)
  --date <YYYY-MM-DD> the record date (default: kept when nothing else changed, else today, UTC)
  --report <file>     also write the full report as JSON
  --strict            treat warnings as failures
  -q, --quiet         print only failures, warnings and the summary
  -h, --help          this text`;

/**
 * Parsed command line.
 *
 * @typedef {object} Cli
 * @property {string[]} paths - Recipes or directories.
 * @property {boolean} check - Compare only.
 * @property {string | null} out - Output root.
 * @property {string} root - Source root.
 * @property {string} palettes - Palettes directory.
 * @property {string} models - Model table.
 * @property {string | null} date - Forced date.
 * @property {string | null} report - Report file.
 * @property {boolean} strict - Warnings fail.
 * @property {boolean} quiet - Less output.
 * @property {boolean} help - Print the usage.
 */

/**
 * Parses the arguments.
 *
 * @param {string[]} argv - `process.argv.slice(2)`.
 * @returns {Cli} The options.
 * @throws {Error} On an unknown option or a missing value.
 */
export function parseArgs(argv) {
  /** @type {Cli} */
  const o = {
    paths: [],
    check: false,
    out: null,
    root: REPO_DIR,
    palettes: join(TOOL_DIR, 'palettes'),
    models: DEFAULT_MODELS_FILE,
    date: null,
    report: null,
    strict: false,
    quiet: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    /**
     * The value after an option.
     *
     * @returns {string} It.
     */
    const value = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === '--check') o.check = true;
    else if (a === '--out') o.out = resolve(value());
    else if (a === '--root') o.root = resolve(value());
    else if (a === '--palettes') o.palettes = resolve(value());
    else if (a === '--models') o.models = resolve(value());
    else if (a === '--date') {
      o.date = value();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(o.date)) throw new Error('--date is YYYY-MM-DD');
    } else if (a === '--report') o.report = resolve(value());
    else if (a === '--strict') o.strict = true;
    else if (a === '-q' || a === '--quiet') o.quiet = true;
    else if (a === '-h' || a === '--help') o.help = true;
    else if (a.startsWith('-')) throw new Error(`unknown option ${a}`);
    else o.paths.push(a);
  }
  return o;
}

/**
 * Runs the CLI.
 *
 * @param {string[]} argv - Arguments.
 * @param {{ log: (line: string) => void, error: (line: string) => void, today?: string }} [io]
 *   Output sinks (default: the console) and today's date for tests.
 * @returns {number} The exit code.
 */
export function main(argv, io = { log: console.log, error: console.error }) {
  let cli;
  try {
    cli = parseArgs(argv);
  } catch (error) {
    io.error(`ingest: ${/** @type {Error} */ (error).message}\n\n${USAGE}`);
    return 2;
  }
  if (cli.help) {
    io.log(USAGE);
    return 0;
  }
  let models;
  try {
    models = loadModels(cli.models);
  } catch (error) {
    io.error(`ingest: ${/** @type {Error} */ (error).message}`);
    return 2;
  }
  const roots =
    cli.paths.length > 0
      ? cli.paths.map((p) => resolve(p))
      : [
          join(cli.root, 'assets', 'source', 'sprites'),
          join(cli.root, 'art-prompts', 'v2', 'ingested'),
        ];
  /** @type {string[]} */
  const recipes = [];
  for (const p of roots) {
    if (!existsSync(p)) {
      if (cli.paths.length > 0) {
        io.error(`ingest: ${p} does not exist`);
        return 2;
      }
      continue;
    }
    if (statSync(p).isDirectory()) recipes.push(...findRecipes(p));
    else recipes.push(p);
  }
  const shown = (/** @type {string} */ file) =>
    relative(process.cwd(), file).split(sep).join('/') || '.';
  if (recipes.length === 0) {
    io.log('ingest: no recipes found — nothing to do');
    return 0;
  }
  const today = io.today ?? new Date().toISOString().slice(0, 10);
  let failed = 0;
  let warned = 0;
  let stale = 0;
  /** @type {Record<string, unknown>[]} */
  const report = [];
  for (const recipeFile of recipes) {
    const result = ingestRecipe(recipeFile, {
      root: cli.root,
      outDir: cli.out,
      palettesDir: cli.palettes,
      models,
      date: cli.date,
      today,
    });
    report.push({
      recipe: shown(recipeFile),
      name: result.name,
      errors: result.errors,
      warnings: result.warnings,
      ...result.report,
    });
    if (result.errors.length > 0 || result.files === null) {
      failed++;
      io.error(`✗ ${shown(recipeFile)}`);
      for (const e of result.errors) io.error(`    error: ${e}`);
      for (const w of result.warnings) io.error(`    warning: ${w}`);
      continue;
    }
    if (result.warnings.length > 0) warned++;
    const r = result.report;
    const reduced = /** @type {{ from: number, to: number } | null} */ (r.paletteReduced);
    const summary =
      `${r.frames} × ${r.frameWidth}×${r.frameHeight}, ${r.colours} colours` +
      (reduced === null ? '' : ` (palette ${reduced.from} → ${reduced.to})`) +
      `, ÷${r.factor}` +
      (Array.isArray(r.keys) && r.keys.length > 0 ? `, key ${r.keys.join(' ')}` : '');
    const files = result.files;
    if (cli.check) {
      /** @type {string[]} */
      const differs = [];
      const pngOld = existsSync(files.png.path) ? readFileSync(files.png.path) : null;
      if (pngOld === null || Buffer.compare(pngOld, files.png.bytes) !== 0) differs.push('png');
      // Line endings as LF: a Windows checkout (core.autocrlf) is not a difference.
      const sidecarOld = existsSync(files.sidecar.path)
        ? readFileSync(files.sidecar.path, 'utf8').replace(/\r\n/g, '\n')
        : null;
      if (sidecarOld !== files.sidecar.text) differs.push('sidecar');
      let recordSame = false;
      if (existsSync(files.record.path)) {
        try {
          recordSame =
            recordWithoutDate(JSON.parse(readFileSync(files.record.path, 'utf8'))) ===
            recordWithoutDate(JSON.parse(files.record.text));
        } catch {
          recordSame = false;
        }
      }
      if (!recordSame) differs.push('record');
      if (differs.length > 0) {
        stale++;
        io.error(
          `✗ ${shown(recipeFile)}: out of date (${differs.join(', ')}) — re-run the ingest tool`,
        );
      } else if (!cli.quiet) io.log(`✓ ${shown(recipeFile)}: up to date (${summary})`);
    } else {
      for (const file of [files.png, files.sidecar, files.record]) {
        mkdirSync(dirname(file.path), { recursive: true });
        writeFileSync(file.path, 'bytes' in file ? file.bytes : file.text);
      }
      if (!cli.quiet) io.log(`✓ ${shown(recipeFile)} → ${shown(files.png.path)} (${summary})`);
    }
    for (const w of result.warnings) io.log(`    warning: ${w}`);
  }
  if (cli.report !== null) {
    mkdirSync(dirname(cli.report), { recursive: true });
    writeFileSync(cli.report, `${JSON.stringify(report, null, 2)}\n`);
  }
  const verdict =
    `${recipes.length} recipe(s): ${recipes.length - failed} ok, ${failed} failed, ${warned} with warnings` +
    (cli.check ? `, ${stale} out of date` : '');
  (failed > 0 || stale > 0 ? io.error : io.log)(`ingest: ${verdict}`);
  if (failed > 0 || stale > 0 || (cli.strict && warned > 0)) return 1;
  return 0;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
