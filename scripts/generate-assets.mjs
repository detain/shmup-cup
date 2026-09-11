#!/usr/bin/env node
/**
 * Asset pipeline entry point (`pnpm assets`, Turborepo task `//#assets`).
 *
 * Turns the code-defined placeholder art — sprite pixel maps in
 * `assets/source/sprites/**\/*.sprite.json`, the procedural generators in
 * `scripts/assets/procedural/`, real-art PNG overrides and the bitmap fonts in
 * `assets/source/fonts/` — into packed atlas pages plus a manifest:
 * `assets/generated/atlas/main.png` (+ `main-1.png` … when one 2048² page is not enough)
 * and `assets/generated/atlas/main.json`. Unchanged inputs are detected with an
 * input-hash cache (`assets/generated/.asset-cache.json`) and skipped. See
 * `scripts/assets/pipeline.mjs` and `assets/README.md`; `shmup_feat.md` §18, decision D24.
 *
 * Usage:
 *   node scripts/generate-assets.mjs              build (skipped when up to date)
 *   node scripts/generate-assets.mjs --force      rebuild even when up to date
 *   node scripts/generate-assets.mjs --out DIR    write to DIR instead of assets/generated
 *   node scripts/generate-assets.mjs --source DIR read sources from DIR instead of assets/source
 *   node scripts/generate-assets.mjs --quiet      print nothing on success
 *
 * Exits 1 with every problem listed when a source file is invalid, 2 on bad arguments.
 * Cross-platform (plain Node, no shell).
 *
 * @module
 */
import { existsSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AssetSourceError, generateAssets } from './assets/pipeline.mjs';

/**
 * Parses the command line.
 *
 * @param {string[]} argv - Arguments after the script path.
 * @returns {{ force: boolean, quiet: boolean, outDir?: string, sourceDir?: string }} Options.
 * @throws {Error} On an unknown flag or a missing value.
 */
export function parseArgs(argv) {
  /** @type {{ force: boolean, quiet: boolean, outDir?: string, sourceDir?: string }} */
  const options = { force: false, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--force') options.force = true;
    else if (arg === '--quiet') options.quiet = true;
    else if (arg === '--out' || arg === '--source') {
      const value = argv[++i];
      if (value === undefined || value.startsWith('--'))
        throw new Error(`${arg} needs a directory`);
      if (arg === '--out') options.outDir = resolve(value);
      else options.sourceDir = resolve(value);
    } else throw new Error(`unknown argument "${arg}"`);
  }
  return options;
}

/**
 * Command-line entry point.
 *
 * @returns {number} Process exit code.
 */
function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`generate-assets: ${/** @type {Error} */ (error).message}`);
    console.error(
      'usage: node scripts/generate-assets.mjs [--force] [--quiet] [--out DIR] [--source DIR]',
    );
    return 2;
  }
  try {
    generateAssets({
      force: options.force,
      outDir: options.outDir,
      sourceDir: options.sourceDir,
      log: options.quiet ? undefined : (message) => console.log(message),
    });
    return 0;
  } catch (error) {
    if (error instanceof AssetSourceError) {
      console.error(error.message);
      return 1;
    }
    throw error;
  }
}

/**
 * Whether this file is the script Node was started with (as opposed to being imported by
 * a test). Compares real paths so symlinked checkouts work.
 *
 * @returns {boolean} `true` when run from the command line.
 */
function isCommandLineEntry() {
  const entry = process.argv[1];
  if (entry === undefined || !existsSync(entry)) return false;
  return realpathSync(resolve(entry)) === realpathSync(fileURLToPath(import.meta.url));
}

if (isCommandLineEntry()) process.exitCode = main();
